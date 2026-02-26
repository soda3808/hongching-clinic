// Vercel Cron — Monthly Data Retention Cleanup
// Schedule: 0 3 1 * * (1st of each month at 3am)
// Anonymizes/deletes expired data per PDPO retention policies

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(200).json({ success: true, skipped: true, reason: 'No Supabase config' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const results = { cleaned: [], errors: [] };
  const now = new Date();

  try {
    // ── 1. Bookings older than 2 years → delete ──
    const twoYearsAgo = new Date(now); twoYearsAgo.setFullYear(now.getFullYear() - 2);
    const bookingCutoff = twoYearsAgo.toISOString().substring(0, 10);
    const { count: bookingsDeleted } = await supabase.from('bookings').delete({ count: 'exact' }).lt('date', bookingCutoff);
    if (bookingsDeleted > 0) results.cleaned.push(`bookings: ${bookingsDeleted} deleted (>2yr)`);

    // ── 2. Conversations older than 1 year → delete ──
    const oneYearAgo = new Date(now); oneYearAgo.setFullYear(now.getFullYear() - 1);
    const convCutoff = oneYearAgo.toISOString();
    const { count: convsDeleted } = await supabase.from('conversations').delete({ count: 'exact' }).lt('updatedAt', convCutoff);
    if (convsDeleted > 0) results.cleaned.push(`conversations: ${convsDeleted} deleted (>1yr)`);

    // ── 3. Queue records older than 6 months → delete ──
    const sixMonthsAgo = new Date(now); sixMonthsAgo.setMonth(now.getMonth() - 6);
    const queueCutoff = sixMonthsAgo.toISOString().substring(0, 10);
    const { count: queueDeleted } = await supabase.from('queue').delete({ count: 'exact' }).lt('date', queueCutoff);
    if (queueDeleted > 0) results.cleaned.push(`queue: ${queueDeleted} deleted (>6mo)`);

    // ── 4. Audit logs older than 3 years → delete ──
    const threeYearsAgo = new Date(now); threeYearsAgo.setFullYear(now.getFullYear() - 3);
    const auditCutoff = threeYearsAgo.toISOString();
    const { count: auditDeleted } = await supabase.from('audit_logs').delete({ count: 'exact' }).lt('created_at', auditCutoff);
    if (auditDeleted > 0) results.cleaned.push(`audit_logs: ${auditDeleted} deleted (>3yr)`);

    // ── 5. Expired password reset tokens → delete ──
    const { count: tokensDeleted } = await supabase.from('password_resets').delete({ count: 'exact' }).lt('expires_at', now.toISOString());
    if (tokensDeleted > 0) results.cleaned.push(`password_resets: ${tokensDeleted} expired tokens deleted`);

    // ── 6. Log retention run ──
    await supabase.from('audit_logs').insert({
      user_id: 'system',
      user_name: 'Data Retention Cron',
      action: 'retention_cleanup',
      entity: 'system',
      details: results,
      created_at: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, results });
  } catch (err) {
    results.errors.push(err.message);
    return res.status(200).json({ success: false, results });
  }
}
