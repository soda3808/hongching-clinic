// POST /api/send-telegram
// Body: { message, chatId?, parseMode? }
// Uses TELEGRAM_BOT_TOKEN env var + TELEGRAM_CHAT_ID (default group)

import { setCORS, handleOptions, requireAuth, rateLimit, errorResponse } from './_middleware.js';

export default async function handler(req, res) {
  setCORS(req, res);
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') return errorResponse(res, 405, 'Method not allowed');

  const auth = requireAuth(req);
  if (!auth.authenticated) return errorResponse(res, 401, auth.error);

  const rl = await rateLimit(`telegram:${auth.user.userId}`, 20, 60000);
  if (!rl.allowed) return errorResponse(res, 429, '發送過於頻繁');

  const { message, chatId, parseMode = 'HTML' } = req.body || {};

  if (!message) return errorResponse(res, 400, 'Missing message');

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const defaultChatId = chatId || process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !defaultChatId) {
    return res.status(200).json({
      success: false,
      error: 'Telegram not configured. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.',
      demo: true,
    });
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: defaultChatId,
          text: message,
          parse_mode: parseMode,
          disable_web_page_preview: true,
        }),
      }
    );

    const result = await response.json();

    if (result.ok) {
      return res.status(200).json({ success: true, messageId: result.result?.message_id });
    } else {
      return res.status(400).json({
        success: false,
        error: result.description || 'Telegram API error',
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: '伺服器錯誤，請稍後再試' });
  }
}
