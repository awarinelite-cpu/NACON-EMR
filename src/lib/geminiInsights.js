// src/lib/geminiInsights.js
//
// AI drug-suggestion insight for the shared Doctor/Nurse consultation-note
// screen — in NACON MRS both roles perform the same clinical function, so
// this is intentionally NOT gated by role. Any caller (doctor or nurse)
// gets the same suggestions.
//
// The prompt is built in the browser (./clinicalPlanPrompt) and Gemini is
// called directly from the browser — there are no Cloud Functions any more,
// so the app runs on the free Firebase plan. Because the key ships with the
// app, it MUST be restricted to this site's domain (HTTP referrer
// restriction) and capped by quota in Google AI Studio / Cloud Console.
// MedIndex reference-drug grounding (via ./medIndex, a public read of
// MedIndex's Firestore) is unrelated to this and still used below.

import { auth } from './firebase';
import { findRelevantMedIndexDrugs, lookupMedIndexCondition } from './medIndex';
import { parseAllergyList, filterAllergicDrugs } from './allergyGuard';
import { buildClinicalPlanPrompt } from './clinicalPlanPrompt';

const GEMINI_API_KEY = process.env.REACT_APP_GEMINI_API_KEY || '';
const MODEL = 'gemini-2.5-flash-lite';

/**
 * Ask Gemini to suggest candidate drugs/treatment options based on the
 * free-text consultation note (C/O · O/E · Diagnosis · Plan) plus whatever
 * patient context we have. This is a decision-support suggestion only —
 * never auto-prescribed, always requires human review before it reaches Rx.
 *
 * @param {Object} params
 * @param {string} params.noteText        - the doctor/nurse note text (C/O, O/E, Dx, Plan)
 * @param {string} [params.allergies]     - patient.allergies
 * @param {string} [params.primaryDiagnosis] - patient.primaryDiagnosis
 * @param {number} [params.age]
 * @param {string} [params.sex]
 * @returns {Promise<{ text: string }>}
 */
export async function suggestDrugsForNote({ noteText, allergies, primaryDiagnosis, age, sex }) {
  if (!noteText || !noteText.trim()) {
    throw new Error('Write a consultation note first, then request AI suggestions.');
  }

  // ── Allergy handling ────────────────────────────────────────────
  // Parsed once, used twice: (a) to pre-filter MedIndex matches so a
  // contraindicated drug is never even offered to the model as a
  // candidate, and (b) sent as a plain list so the shared endpoint can
  // turn it into an explicit hard constraint in the prompt. A second,
  // independent check runs client-side on the response in
  // AIDrugInsightPanel.jsx — this is the first layer, not the only one.
  const allergyList = parseAllergyList(allergies);

  // Ground the suggestion in MedIndex's vetted drug/condition database where
  // possible, so this isn't relying purely on the model's general
  // knowledge. Both lookups are best-effort. If MedIndex is unreachable or
  // has no match, they come back empty and the prompt falls back to the
  // model's own knowledge, exactly as before.
  const [medIndexDrugsRaw, medIndexCondition] = await Promise.all([
    findRelevantMedIndexDrugs({ noteText, primaryDiagnosis }, 25).catch(() => []),
    lookupMedIndexCondition(primaryDiagnosis).catch(() => null),
  ]);

  // Strip out anything that conflicts with a recorded allergy before it's
  // even offered as a candidate — the model should never see it.
  const { safe: medIndexDrugs, excluded: medIndexExcluded } = filterAllergicDrugs(medIndexDrugsRaw, allergies);

  // Only signed-in NACON-EMR users can use this screen (the page itself is
  // behind login); keep the explicit check so a logged-out call fails clearly.
  if (!auth.currentUser) {
    throw new Error('Please sign in to use AI Clinical Consult.');
  }
  if (!GEMINI_API_KEY) {
    throw new Error('AI Clinical Consult is not configured: set REACT_APP_GEMINI_API_KEY and redeploy.');
  }

  const prompt = buildClinicalPlanPrompt({
    noteText, age, sex, primaryDiagnosis, allergyList,
    medIndexDrugs: medIndexDrugs.map(d => ({
      generic_name: d.generic_name,
      drug_class: d.drug_class,
      dosage: d.dosage,
      primary_indications: d.primary_indications,
      contraindications: d.contraindications,
    })),
    medIndexExcluded: medIndexExcluded.map(d => ({ generic_name: d.generic_name })),
    medIndexCondition: medIndexCondition
      ? { clinicalManifestation: medIndexCondition.clinicalManifestation, management: medIndexCondition.management }
      : null,
  });

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 5500, temperature: 0.15 },
        }),
      }
    );
  } catch (e) {
    throw new Error('Could not reach the AI service. Check your connection.');
  }

  if (!res.ok || !res.body) {
    throw new Error(res.status === 429
      ? 'AI quota exceeded. Try again shortly, or check the Gemini API key quota.'
      : `AI request failed (${res.status}).`);
  }

  // Read the Gemini SSE stream and join the text parts.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6).trim();
      if (!dataStr || dataStr === '[DONE]') continue;
      try {
        const parts = JSON.parse(dataStr)?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) parts.forEach(p => { if (typeof p.text === 'string') text += p.text; });
      } catch { /* ignore malformed SSE lines */ }
    }
  }
  text = text.trim();
  if (!text) throw new Error('AI returned an empty response. Try again.');

  return { text };
}
