const { createToken, constantTimeCompare } = require('./_lib/auth');
const { supabase } = require('./_lib/db');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  // ── Rate-limit check ──
  const { data: attempt } = await supabase
    .from('pin_attempts')
    .select('*')
    .eq('ip', ip)
    .single();

  if (attempt && attempt.locked_until && new Date(attempt.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(attempt.locked_until) - new Date()) / 60000);
    return res.status(429).json({
      error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`
    });
  }

  // ── Validate input ──
  const { pin } = req.body || {};
  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({ error: 'PIN required' });
  }

  // ── Compare PIN (constant-time) ──
  const correct = constantTimeCompare(pin, process.env.EDIT_PIN);

  if (!correct) {
    const current = (attempt?.attempts || 0) + 1;
    const lockout = current >= 5
      ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
      : null;

    await supabase.from('pin_attempts').upsert({
      ip,
      attempts: current,
      locked_until: lockout,
      updated_at: new Date().toISOString()
    });

    if (lockout) {
      return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    }
    return res.status(401).json({ error: 'Incorrect PIN' });
  }

  // ── Success: reset counter, return token ──
  await supabase.from('pin_attempts').upsert({
    ip,
    attempts: 0,
    locked_until: null,
    updated_at: new Date().toISOString()
  });

  const token = createToken();
  return res.status(200).json({ token });
};
