// src/lib/geminiInsights.js
//
// AI drug-suggestion insight for the shared Doctor/Nurse consultation-note
// screen — in NACON MRS both roles perform the same clinical function, so
// this is intentionally NOT gated by role. Any caller (doctor or nurse)
// gets the same suggestions.
//
// The prompt + model call live server-side on NACON-EMR's OWN Cloud
// Function (functions/index.js, exports.aiClinicalConsult). This used to
// call MedIndex's /api/drug-ai-details endpoint (mode: 'clinical_plan') as
// a shared engine, but MedIndex added a sign-in + AI-credits gate there for
// its own users, and NACON-EMR and MedIndex are separate Firebase projects
// — so NACON-EMR could never satisfy that gate. AI Clinical Consult was
// built for NACON-EMR first, so it's decoupled here: NACON-EMR's own
// backend, NACON-EMR's own Firebase Auth token, no MedIndex dependency.
// MedIndex reference-drug grounding (via ./medIndex, a public read of
// MedIndex's Firestore) is unrelated to this and still used below.

import { auth } from './firebase';
import { findRelevantMedIndexDrugs, lookupMedIndexCondition } from './medIndex';
import { parseAllergyList, filterAllergicDrugs } from './allergyGuard';

// Cloud Function URL — replace <region>-<project-id> with your deployed
// function's actual URL once `firebase deploy --only functions` finishes
// (it's printed in the deploy output), or set REACT_APP_AI_CONSULT_URL in
// .env to override without editing code.
const CLINICAL_PLAN_URL =
  process.env.REACT_APP_AI_CONSULT_URL ||
  'https://us-central1-<your-project-id>.cloudfunctions.net/aiClinicalConsult';

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

  // Authenticate with NACON-EMR's own Firebase ID token — this is what the
  // Cloud Function verifies (admin.auth().verifyIdToken) before running.
  // No sign-in means no token means the function returns 401, same message
  // as before, but now because THIS app's user isn't signed in, not because
  // of an unrelated MedIndex account.
  if (!auth.currentUser) {
    throw new Error('Please sign in to use AI Clinical Consult.');
  }
  const idToken = await auth.currentUser.getIdToken();

  const res = await fetch(CLINICAL_PLAN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
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
