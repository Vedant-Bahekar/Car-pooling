const { supabase } = require('./_lib/db');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const [riders, rates, attendance, payments] = await Promise.all([
    supabase.from('riders').select('*').order('created_at', { ascending: true }),
    supabase.from('rates').select('*').order('from_date', { ascending: true }),
    supabase.from('attendance').select('*').order('date', { ascending: true }),
    supabase.from('payments').select('*').order('date', { ascending: true })
  ]);

  // Find the most recent modification timestamp
  const timestamps = [
    ...(attendance.data || []).map(r => r.created_at),
    ...(payments.data || []).map(r => r.created_at)
  ].filter(Boolean);

  const lastModified = timestamps.length
    ? timestamps.sort().pop()
    : null;

  return res.status(200).json({
    riders: riders.data || [],
    rates: rates.data || [],
    attendance: attendance.data || [],
    payments: payments.data || [],
    lastModified
  });
};
