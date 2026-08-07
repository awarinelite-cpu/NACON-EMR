// src/lib/geminiInsights.js
//
// AI drug-suggestion insight for the shared Doctor/Nurse consultation-note
// screen — in NACON MRS both roles perform the same clinical function, so
// this is intentionally NOT gated by role. Any caller (doctor or nurse)
// gets the same suggestions.
//
// The actual prompt + model call live server-side on MedIndex's
// /api/drug-ai-details endpoint (mode: 'clinical_plan') — MedIndex's CORS
// is already open ('*') for its Capacitor native builds, so this is a
// plain cross-origin fetch. This file's job is just to gather NACON-EMR's
// side of the grounding (MedIndex formulary matches via the cross-app
// Firestore read below, allergy parsing/filtering) and hand it over — the
// prompt itself is written once, in MedIndex's repo, so both apps' AI
// Drug Insight stays identical without two copies to keep in sync.

import { findRelevantMedIndexDrugs, lookupMedIndexCondition } from './medIndex';
import { parseAllergyList, filterAllergicDrugs } from './allergyGuard';

const MEDINDEX_API_BASE = 'https://med-index-six.vercel.app';
const CLINICAL_PLAN_URL = `${MEDINDEX_API_BASE}/api/drug-ai-details`;

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

  // The prompt itself is built server-side on MedIndex's endpoint (mode:
  // 'clinical_plan') — this is a plain fetch, not a streamed connection,
  // since NACON-EMR's panel just needs the finished text, same as the old
  // direct-Gemini call did.
  const res = await fetch(CLINICAL_PLAN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'clinical_plan',
      noteText,
      age,
      sex,
      primaryDiagnosis,
      allergyList,
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
    }),
  });

  if (!res.ok || !res.body) {
    let detail = '';
    try { detail = (await res.json())?.error || ''; } catch {}
    throw new Error(detail || `AI request failed (${res.status}).`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  text = text.trim();
  if (!text) throw new Error('AI returned an empty response. Try again.');
  if (text.startsWith('[') && /error/i.test(text.slice(0, 40))) {
    throw new Error(text.replace(/^\[|\]$/g, ''));
  }

  return { text };
}
