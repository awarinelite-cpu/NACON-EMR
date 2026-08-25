// functions/telegramLib.js
// Thin wrapper around the Telegram Bot HTTP API. No SDK dependency —
// Node 20 on Cloud Functions has global fetch.
const { defineSecret } = require('firebase-functions/params');

const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');

function apiUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function tgCall(token, method, payload) {
  const res = await fetch(apiUrl(token, method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!json.ok) {
    console.error(`[telegram] ${method} failed:`, json.description);
  }
  return json;
}

function sendMessage(token, chatId, text, extra = {}) {
  return tgCall(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra,
  });
}

function answerCallbackQuery(token, callbackQueryId, text) {
  return tgCall(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

function editMessageReplyMarkup(token, chatId, messageId, replyMarkup) {
  return tgCall(token, 'editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup || { inline_keyboard: [] },
  });
}

module.exports = {
  TELEGRAM_BOT_TOKEN,
  sendMessage,
  answerCallbackQuery,
  editMessageReplyMarkup,
};
