const { verifyToken, extractToken } = require('./_lib/auth');
const { supabase } = require('./_lib/db');
const { validateAction } = require('./_lib/validate');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth ──
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });

  // ── Parse body ──
  const { action, ...params } = req.body || {};
  if (!action) return res.status(400).json({ error: 'action is required' });

  // ── Validate ──
  const check = validateAction(action, params);
  if (!check.valid) return res.status(400).json({ error: check.error });

  try {
    let result;
    switch (action) {
      case 'toggle-attendance': result = await toggleAttendance(params); break;
      case 'bulk-attendance':   result = await bulkAttendance(params);   break;
      case 'add-payment':       result = await addPayment(params);       break;
      case 'remove-payment':    result = await removePayment(params);    break;
      case 'update-rider':      result = await updateRider(params);      break;
      case 'update-rate':       result = await updateRate(params);       break;
      default: return res.status(400).json({ error: 'Unknown action' });
    }
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('Write error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── Action handlers ──

async function toggleAttendance({ riderId, date }) {
  const { data: existing } = await supabase
    .from('attendance')
    .select('id')
    .eq('rider_id', riderId)
    .eq('date', date)
    .maybeSingle();

  if (existing) {
    await supabase.from('attendance').delete().eq('id', existing.id);
    return { toggled: 'off', riderId, date };
  }

  const { data, error } = await supabase
    .from('attendance')
    .insert({ rider_id: riderId, date })
    .select()
    .single();
  if (error) throw error;
  return { toggled: 'on', record: data };
}

async function bulkAttendance({ date, riderIds, present }) {
  if (present) {
    // Mark all supplied riders present (upsert-like: skip if already exists)
    for (const riderId of riderIds) {
      const { data: existing } = await supabase
        .from('attendance')
        .select('id')
        .eq('rider_id', riderId)
        .eq('date', date)
        .maybeSingle();
      if (!existing) {
        await supabase.from('attendance').insert({ rider_id: riderId, date });
      }
    }
  } else {
    // Remove all riders for that date
    await supabase.from('attendance').delete().eq('date', date);
  }
  return { bulk: true, date, present };
}

async function addPayment({ riderId, week, date, amount }) {
  const { data, error } = await supabase
    .from('payments')
    .insert({ rider_id: riderId, week, date, amount })
    .select()
    .single();
  if (error) throw error;
  return { record: data };
}

async function removePayment({ paymentId }) {
  const { error } = await supabase
    .from('payments')
    .delete()
    .eq('id', paymentId);
  if (error) throw error;
  return { removed: paymentId };
}

async function updateRider({ riderId, name }) {
  const { data, error } = await supabase
    .from('riders')
    .update({ name: name.trim() })
    .eq('id', riderId)
    .select()
    .single();
  if (error) throw error;
  return { record: data };
}

async function updateRate({ from, rate }) {
  // Upsert: if a rate for this from_date exists, update it; otherwise insert
  const { data: existing } = await supabase
    .from('rates')
    .select('id')
    .eq('from_date', from)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('rates')
      .update({ rate })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return { record: data };
  }

  const { data, error } = await supabase
    .from('rates')
    .insert({ from_date: from, rate })
    .select()
    .single();
  if (error) throw error;
  return { record: data };
}
