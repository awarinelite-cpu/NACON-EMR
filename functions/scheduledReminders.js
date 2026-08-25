// functions/scheduledReminders.js
// Runs every 5 minutes. Finds due medication / IV infusion / glucose-check
// reminders and DMs the assigned nurse on Telegram with action buttons.
// Re-notifies every RENOTIFY_MS while still pending, so a missed dose
// keeps surfacing rather than silently falling through.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { TELEGRAM_BOT_TOKEN, sendMessage } = require('./telegramLib');

const RENOTIFY_MS = 15 * 60 * 1000; // 15 minutes

function db() { return admin.firestore(); }

function dueForNotify(doc, nowMs) {
  const notifiedAt = doc.notifiedAt?.toMillis?.() || 0;
  return nowMs - notifiedAt > RENOTIFY_MS;
}

async function chatIdFor(uid, cache) {
  if (cache.has(uid)) return cache.get(uid);
  const snap = await db().collection('telegram_links').doc(uid).get();
  const chatId = snap.exists && snap.data().active !== false ? snap.data().chatId : null;
  cache.set(uid, chatId);
  return chatId;
}

async function processMeds(token, now, cache) {
  const snap = await db().collection('med_reminders')
    .where('status', '==', 'pending')
    .where('nextDueAt', '<=', now)
    .get();
  for (const d of snap.docs) {
    const m = d.data();
    if (!dueForNotify(m, now.toMillis())) continue;
    if (!m.assignedNurseUid) continue;
    const chatId = await chatIdFor(m.assignedNurseUid, cache);
    if (!chatId) continue;
    await sendMessage(token, chatId,
      `💊 <b>Medication due</b>\n${m.drug} ${m.dose || ''} — ${m.route || ''}\nPatient: ${m.patientName || m.emrNumber}`,
      { reply_markup: { inline_keyboard: [[
        { text: '✅ Given', callback_data: `med:given:${d.id}` },
        { text: '⏸ Held', callback_data: `med:held:${d.id}` },
        { text: '🚫 Refused', callback_data: `med:refused:${d.id}` },
      ]] } });
    await d.ref.update({ notifiedAt: now });
  }
}

async function processIvInfusions(token, now, cache) {
  const snap = await db().collection('iv_infusions')
    .where('status', '==', 'running')
    .where('endAt', '<=', now)
    .get();
  for (const d of snap.docs) {
    const iv = d.data();
    if (!dueForNotify(iv, now.toMillis())) continue;
    if (!iv.assignedNurseUid) continue;
    const chatId = await chatIdFor(iv.assignedNurseUid, cache);
    if (!chatId) continue;
    await sendMessage(token, chatId,
      `💧 <b>IV infusion due to complete</b>\n${iv.fluid} — ${iv.volumeMl}ml @ ${iv.rateMlPerHr}ml/hr\nPatient: ${iv.patientName || iv.emrNumber}`,
      { reply_markup: { inline_keyboard: [[
        { text: '✅ Completed', callback_data: `iv:done:${d.id}` },
        { text: '⏹ Stop early', callback_data: `iv:stop:${d.id}` },
      ]] } });
    await d.ref.update({ notifiedAt: now });
  }
}

async function processGlucoseChecks(token, now, cache) {
  const snap = await db().collection('glucose_schedule')
    .where('status', '==', 'pending')
    .where('dueAt', '<=', now)
    .get();
  for (const d of snap.docs) {
    const g = d.data();
    if (!dueForNotify(g, now.toMillis())) continue;
    if (!g.assignedNurseUid) continue;
    const chatId = await chatIdFor(g.assignedNurseUid, cache);
    if (!chatId) continue;
    const fastingNote = g.type === 'FBS' ? '\n⚠️ Confirm the patient has fasted before checking.' : '';
    await sendMessage(token, chatId,
      `🩸 <b>${g.type} check due</b>\nPatient: ${g.patientName || g.emrNumber}${fastingNote}`,
      { reply_markup: { inline_keyboard: [[
        { text: '📝 Log value', callback_data: `glucose:ask:${d.id}` },
      ]] } });
    await d.ref.update({ notifiedAt: now });
  }
}

exports.scheduledReminders = onSchedule(
  { schedule: 'every 5 minutes', secrets: [TELEGRAM_BOT_TOKEN] },
  async () => {
    const token = TELEGRAM_BOT_TOKEN.value();
    const now = admin.firestore.Timestamp.now();
    const cache = new Map();
    try {
      await Promise.all([
        processMeds(token, now, cache),
        processIvInfusions(token, now, cache),
        processGlucoseChecks(token, now, cache),
      ]);
    } catch (err) {
      logger.error('[scheduledReminders] error', err);
    }
  }
);
