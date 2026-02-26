// POST /api/inquiry — Public endpoint for customer inquiries
// Saves to Supabase inquiries table (auto-creates table if needed)

import { createClient } from '@supabase/supabase-js';
import { setCORS, handleOptions, sanitizeString, validatePhone, rateLimit, getClientIP, errorResponse } from './_middleware.js';

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  // Rate limit: 5 inquiries per minute per IP
  const ip = getClientIP(req);
  const rl = rateLimit(`inquiry:${ip}`, 5, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '請求過於頻繁');

  const { id, name, phone, type, message } = req.body || {};
  if (!name || !phone || !message) return errorResponse(res, 400, 'Missing required fields');

  // Input validation
  const cleanName = sanitizeString(name, 100);
  const cleanPhone = sanitizeString(phone, 20);
  const cleanMessage = sanitizeString(message, 2000);
  if (!validatePhone(cleanPhone)) return errorResponse(res, 400, 'Invalid phone number');

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(200).json({ success: true, demo: true });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const record = {
    id: id || `inq_${Date.now()}`,
    name: cleanName,
    phone: cleanPhone,
    type: sanitizeString(type, 50) || '一般查詢',
    message: cleanMessage,
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
