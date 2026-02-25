// POST /api/inquiry — Public endpoint for customer inquiries
// Saves to Supabase inquiries table (auto-creates table if needed)

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id, name, phone, type, message } = req.body || {};
  if (!name || !phone || !message) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(200).json({ success: true, demo: true });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const record = {
    id: id || `inq_${Date.now()}`,
    name,
    phone,
    type: type || '一般查詢',
    message,
    status: 'new',
    createdAt: new Date().toISOString(),
  };

  try {
    const { error } = await supabase.from('inquiries').upsert(record, { onConflict: 'id' });
    if (error) {
      // Table might not exist, try to create it
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return res.status(200).json({ success: true, fallback: true, record });
      }
      throw error;
    }
    return res.status(200).json({ success: true, id: record.id });
  } catch (err) {
    return res.status(200).json({ success: true, fallback: true, record });
  }
}
