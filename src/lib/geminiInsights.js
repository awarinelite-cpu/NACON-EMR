// src/lib/geminiInsights.js
//
// AI drug-suggestion insight, powered by Gemini.
// Used from the shared Doctor/Nurse consultation-note screen — in NACON MRS
// both roles perform the same clinical function, so this is intentionally
// NOT gated by role. Any caller (doctor or nurse) gets the same suggestions.

import { findRelevantMedIndexDrugs, lookupMedIndexCondition } from './medIndex';

const GEMINI_API_KEY = process.env.REACT_APP_GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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
  if (!GEMINI_API_KEY) {
    throw new Error('AI insight is not configured (missing REACT_APP_GEMINI_API_KEY).');
  }
  if (!noteText || !noteText.trim()) {
    throw new Error('Write a consultation note first, then request AI suggestions.');
  }

  const contextLines = [
    age ? `Age: ${age}` : null,
    sex ? `Sex: ${sex}` : null,
    primaryDiagnosis ? `Primary diagnosis on file: ${primaryDiagnosis}` : null,
    allergies ? `Known allergies: ${allergies}` : 'Known allergies: none recorded',
  ].filter(Boolean).join('\n');

  // Ground the suggestion in MedIndex's vetted drug/condition database where
  // possible, so this isn't relying purely on Gemini's general knowledge.
  // Both lookups are best-effort. If MedIndex is unreachable or has no
  // match, they come back empty and the prompt falls back to Gemini's own
  // knowledge, exactly as before.
  const [medIndexDrugs, medIndexCondition] = await Promise.all([
    findRelevantMedIndexDrugs({ noteText, primaryDiagnosis }).catch(() => []),
    lookupMedIndexCondition(primaryDiagnosis).catch(() => null),
  ]);

  const medIndexDrugBlock = medIndexDrugs.length
    ? `\nMedIndex reference formulary (authoritative for this facility, use these exact doses/considerations when one of these drugs applies; only reach beyond this list if nothing here fits):\n${medIndexDrugs.map(d =>
        `- ${d.generic_name} (${d.drug_class || 'class n/a'}): dosage: ${d.dosage || 'n/a'}; indications: ${d.primary_indications || 'n/a'}; contraindications: ${d.contraindications || 'n/a'}`
      ).join('\n')}\n`
    : '';

  const medIndexConditionBlock = medIndexCondition
    ? `\nMedIndex clinical reference for "${primaryDiagnosis}":\n${[medIndexCondition.clinicalManifestation, medIndexCondition.management]
        .filter(Boolean).join('\n')}\n`
    : '';

  const prompt = `You are a clinical decision-support assistant used inside a Nigerian Army clinical training facility EMR (NACON MRS). The facility is staffed by nursing/medical students; a doctor OR a nurse may be entering this note, both performing the same clinical function.

Given the consultation note below, suggest possible drug/treatment options a clinician could consider. This is decision support only, not a final prescription, a licensed clinician always reviews before anything is prescribed.

Patient context:
${contextLines}
${medIndexConditionBlock}${medIndexDrugBlock}
Consultation note:
"""
${noteText}
"""

Respond in this format:
1. Likely working diagnosis (1 line, note any uncertainty)
2. Suggested drug options, generic name, typical adult dose/route/frequency for a Nigerian clinical setting, and brief rationale (bullet list, max 5). Where a drug appears in the MedIndex reference formulary above, use its dosage/contraindications exactly and note "(MedIndex)" after that drug's name.
3. Red flags to rule out or watch for (bullet list, max 3)
4. One-line safety note reminding the clinician to confirm against the patient's allergy history and local protocol before prescribing.

Keep it concise and scannable.`;

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Gemini request failed (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
  if (!text.trim()) throw new Error('AI returned an empty response. Try again.');

  return { text };
}
