// functions/telegramBot.js
// Webhook for the NACON-EMR nursing-reminders Telegram bot.
// Handles: /link, /unlink, /status, /pending, inline-button actions on
// medication/IV/glucose reminders, and free-text glucose value capture.
const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { TELEGRAM_BOT_TOKEN, sendMessage, answerCallbackQuery, editMessageReplyMarkup } = require('./telegramLib');

const LINK_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function db() { return admin.firestore(); }

async function getLinkByChatId(chatId) {
  const snap = await db().collection('telegram_links').where('chatId', '==', chatId).limit(1).get();
  if (snap.empty) return null;
  return { uid: snap.docs[0].id, ...snap.docs[0].data() };
}

async function getUserDoc(uid) {
  const snap = await db().collection('users').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

// ── /link <code> ─────────────────────────────
async function handleLink(token, chatId, from, code) {
  if (!code) {
    await sendMessage(token, chatId, 'Usage: <code>/link 123456</code>\nGenerate a code from Settings → Telegram Bot in the NACON-EMR web app.');
    return;
  }
  const ref = db().collection('link_codes').doc(code.trim());
  const snap = await ref.get();
  if (!snap.exists) {
    await sendMessage(token, chatId, '❌ That code is invalid. Generate a new one from Settings in the web app.');
    return;
  }
  const data = snap.data();
  const ageMs = Date.now() - (data.createdAt?.toMillis?.() || 0);
  if (data.used) {
    await sendMessage(token, chatId, '❌ That code has already been used. Generate a new one.');
    return;
  }
  if (ageMs > LINK_CODE_TTL_MS) {
    await sendMessage(token, chatId, '❌ That code has expired. Generate a new one from Settings.');
    return;
  }
  await db().collection('telegram_links').doc(data.uid).set({
    chatId,
    telegramUsername: from.username || null,
    telegramFirstName: from.first_name || null,
    linkedAt: admin.firestore.FieldValue.serverTimestamp(),
    active: true,
  });
  await ref.update({ used: true });
  await sendMessage(token, chatId, `✅ Linked${data.displayName ? `, ${data.displayName}` : ''}! You'll get DMs here for medication, IV, and glucose-check reminders. Send /pending anytime to see what's due.`);
}

async function handleUnlink(token, chatId) {
  const link = await getLinkByChatId(chatId);
  if (!link) { await sendMessage(token, chatId, "You're not linked."); return; }
  await db().collection('telegram_links').doc(link.uid).delete();
  await sendMessage(token, chatId, '🔌 Unlinked. Reminders will stop until you /link again.');
}

async function handleStatus(token, chatId) {
  const link = await getLinkByChatId(chatId);
  await sendMessage(token, chatId, link ? '✅ You are linked and will receive reminders here.' : '❌ Not linked. Send /link <code> using a code from Settings in the web app.');
}

async function handlePending(token, chatId) {
  const link = await getLinkByChatId(chatId);
  if (!link) { await sendMessage(token, chatId, 'Not linked. Send /link <code> first.'); return; }
  const [meds, ivs, glucose] = await Promise.all([
    db().collection('med_reminders').where('assignedNurseUid', '==', link.uid).where('status', '==', 'pending').get(),
    db().collection('iv_infusions').where('assignedNurseUid', '==', link.uid).where('status', '==', 'running').get(),
    db().collection('glucose_schedule').where('assignedNurseUid', '==', link.uid).where('status', '==', 'pending').get(),
  ]);
  const lines = [];
  meds.forEach(d => { const m = d.data(); lines.push(`💊 ${m.drug} (${m.patientName || m.emrNumber}) — due ${m.nextDueAt?.toDate?.().toLocaleString?.() || ''}`); });
  ivs.forEach(d => { const i = d.data(); lines.push(`💧 ${i.fluid} (${i.patientName || i.emrNumber}) — ends ${i.endAt?.toDate?.().toLocaleString?.() || ''}`); });
  glucose.forEach(d => { const g = d.data(); lines.push(`🩸 ${g.type} (${g.patientName || g.emrNumber}) — due ${g.dueAt?.toDate?.().toLocaleString?.() || ''}`); });
  await sendMessage(token, chatId, lines.length ? lines.join('\n') : 'Nothing pending right now. 🎉');
}

// ── free-text reply: glucose value capture ───
async function handleTextReply(token, chatId, text) {
  const pendingRef = db().collection('pending_replies').doc(String(chatId));
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists) {
    await sendMessage(token, chatId, "I didn't understand that. Try /pending or /status.");
    return;
  }
  const pending = pendingSnap.data();
  const value = parseFloat(text.replace(',', '.'));
  if (isNaN(value)) {
    await sendMessage(token, chatId, 'Please reply with just the numeric value (e.g. 5.4).');
    return;
  }
  const link = await getLinkByChatId(chatId);
  const user = link ? await getUserDoc(link.uid) : null;
  const recordedBy = user?.displayName || user?.email || 'Nurse (Telegram)';

  const checkRef = db().collection('glucose_schedule').doc(pending.refId);
  const checkSnap = await checkRef.get();
  if (checkSnap.exists) {
    const check = checkSnap.data();
    await checkRef.update({ status: 'done', value, doneAt: admin.firestore.FieldValue.serverTimestamp(), recordedBy });
    // Mirror into the existing glucose_charts collection so it shows in the app's Glycemic tab
    await db().collection('glucose_charts').add({
      emrNumber: check.emrNumber,
      visitId: null,
      type: check.type,
      value,
      notes: 'Logged via Telegram bot',
      recordedBy,
      recordedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await pendingRef.delete();
  await sendMessage(token, chatId, `✅ Logged ${pending.checkType || ''} ${value}. Thanks!`);
}

async function handleMessage(token, msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (text.startsWith('/start')) {
    await sendMessage(token, chatId, '👋 Welcome to the NACON-EMR nursing reminders bot.\n\nSend /link <code> to connect your account (generate a code from Settings in the web app). Once linked you\'ll get DMs for medication, IV infusion, and FBS/RBS glucose-check timing.');
    return;
  }
  if (text.startsWith('/link')) { await handleLink(token, chatId, msg.from, text.split(' ')[1]); return; }
  if (text.startsWith('/unlink')) { await handleUnlink(token, chatId); return; }
  if (text.startsWith('/status')) { await handleStatus(token, chatId); return; }
  if (text.startsWith('/pending') || text.startsWith('/meds')) { await handlePending(token, chatId); return; }
  await handleTextReply(token, chatId, text);
}

// ── inline button actions ────────────────────
async function handleCallback(token, cq) {
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const [kind, action, id] = (cq.data || '').split(':');

  const link = await getLinkByChatId(chatId);
  if (!link) {
    await answerCallbackQuery(token, cq.id, 'Not linked — send /link <code> first.');
    return;
  }
  const user = await getUserDoc(link.uid);
  const staffName = user?.displayName || user?.email || 'Nurse (Telegram)';
  const staffRole = user?.role || 'nurse';

  if (kind === 'med') {
    const ref = db().collection('med_reminders').doc(id);
    const snap = await ref.get();
    if (!snap.exists) { await answerCallbackQuery(token, cq.id, 'Reminder no longer exists.'); return; }
    const m = snap.data();
    const status = action === 'given' ? 'given' : action; // 'given' | 'held' | 'refused'

    await ref.update({
      status: m.intervalHours ? 'pending' : status,
      lastActionStatus: status,
      recordedByUid: link.uid,
      recordedByName: staffName,
      recordedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Recurring meds roll forward to the next due time; one-offs stay as-is.
      ...(m.intervalHours ? {
        nextDueAt: admin.firestore.Timestamp.fromMillis(Date.now() + m.intervalHours * 3600 * 1000),
        notifiedAt: null,
      } : {}),
    });

    await db().collection('mar_records').add({
      emrNumber: m.emrNumber,
      rxId: m.rxId || null,
      drug: m.drug,
      dose: m.dose || null,
      route: m.route || null,
      scheduledFreq: m.intervalHours ? `q${m.intervalHours}h` : null,
      status,
      administeredAt: new Date().toTimeString().slice(0, 5),
      notes: 'Recorded via Telegram bot',
      administeredBy: staffName,
      administeredByRole: staffRole,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await answerCallbackQuery(token, cq.id, `${m.drug} marked ${status}`);
    await editMessageReplyMarkup(token, chatId, messageId, { inline_keyboard: [[{ text: `✔️ ${status}`, callback_data: 'noop' }]] });
    return;
  }

  if (kind === 'iv') {
    const ref = db().collection('iv_infusions').doc(id);
    const snap = await ref.get();
    if (!snap.exists) { await answerCallbackQuery(token, cq.id, 'Infusion no longer exists.'); return; }
    const status = action === 'done' ? 'completed' : 'stopped';
    await ref.update({ status, closedByUid: link.uid, closedByName: staffName, closedAt: admin.firestore.FieldValue.serverTimestamp() });
    await answerCallbackQuery(token, cq.id, `Infusion marked ${status}`);
    await editMessageReplyMarkup(token, chatId, messageId, { inline_keyboard: [[{ text: `✔️ ${status}`, callback_data: 'noop' }]] });
    return;
  }

  if (kind === 'glucose') {
    const ref = db().collection('glucose_schedule').doc(id);
    const snap = await ref.get();
    if (!snap.exists) { await answerCallbackQuery(token, cq.id, 'Check no longer exists.'); return; }
    const g = snap.data();
    await db().collection('pending_replies').doc(String(chatId)).set({
      type: 'glucose', refId: id, checkType: g.type,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await answerCallbackQuery(token, cq.id, 'Reply with the value');
    await sendMessage(token, chatId, `Reply with the ${g.type} value for ${g.patientName || g.emrNumber} (just the number, e.g. 5.4):`, {
      reply_markup: { force_reply: true },
    });
    return;
  }

  await answerCallbackQuery(token, cq.id, '');
}

exports.telegramWebhook = onRequest({ secrets: [TELEGRAM_BOT_TOKEN] }, async (req, res) => {
  const token = TELEGRAM_BOT_TOKEN.value();
  const update = req.body || {};
  try {
    if (update.message) await handleMessage(token, update.message);
    else if (update.callback_query) await handleCallback(token, update.callback_query);
  } catch (err) {
    logger.error('[telegramWebhook] error', err);
  }
  res.status(200).send('ok'); // always 200 — avoid Telegram retry storms
});
