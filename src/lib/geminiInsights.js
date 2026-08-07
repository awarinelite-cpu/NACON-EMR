// src/lib/geminiInsights.js
//
// AI drug-suggestion insight, powered by Gemini.
// Used from the shared Doctor/Nurse consultation-note screen — in NACON MRS
// both roles perform the same clinical function, so this is intentionally
// NOT gated by role. Any caller (doctor or nurse) gets the same suggestions.

import { findRelevantMedIndexDrugs, lookupMedIndexCondition } from './medIndex';
import { parseAllergyList, expandAllergyTerms, filterAllergicDrugs } from './allergyGuard';

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
  ].filter(Boolean).join('\n');

  // ── Allergy handling ────────────────────────────────────────────
  // Parsed once, used twice: (a) to pre-filter MedIndex matches so a
  // contraindicated drug is never even offered to Gemini as a candidate,
  // and (b) to turn the allergy list into an explicit hard constraint in
  // the prompt itself, rather than a passive context line the model can
  // deprioritize. A second, independent check runs client-side on the
  // response in AIDrugInsightPanel.jsx — this prompt-level filtering is
  // the first layer, not the only one.
  const allergyList = parseAllergyList(allergies);
  const hasAllergyHistory = allergyList.length > 0;
  const expandedAllergyTerms = hasAllergyHistory ? expandAllergyTerms(allergyList) : [];

  const allergyBlock = hasAllergyHistory
    ? `\nDOCUMENTED ALLERGIES (hard constraint — read before suggesting anything): ${allergyList.join(', ')}.
Do NOT suggest any of these drugs, or drugs in the same/cross-reactive class (e.g. cephalosporins if penicillin-allergic, other NSAIDs if aspirin-allergic). If the normal first-line/main therapy for this diagnosis is contraindicated by this allergy, do not suggest it — name the next-best alternative instead and explicitly say why the usual first-line choice was skipped.\n`
    : `\nAllergy history: none recorded for this patient. Do not assume "no allergies" — treat this as "not yet documented" and include a line reminding the clinician to confirm allergy status with the patient before prescribing.\n`;

  // Ground the suggestion in MedIndex's vetted drug/condition database where
  // possible, so this isn't relying purely on Gemini's general knowledge.
  // Both lookups are best-effort. If MedIndex is unreachable or has no
  // match, they come back empty and the prompt falls back to Gemini's own
  // knowledge, exactly as before.
  const [medIndexDrugsRaw, medIndexCondition] = await Promise.all([
    findRelevantMedIndexDrugs({ noteText, primaryDiagnosis }, 25).catch(() => []),
    lookupMedIndexCondition(primaryDiagnosis).catch(() => null),
  ]);

  // Strip out anything that conflicts with a recorded allergy before it's
  // even offered as a candidate — the model should never see it.
  const { safe: medIndexDrugs, excluded: medIndexExcluded } = filterAllergicDrugs(medIndexDrugsRaw, allergies);

  const medIndexDrugBlock = medIndexDrugs.length
    ? `\nMedIndex reference formulary (authoritative for this facility, use these exact doses/considerations when one of these drugs applies; only reach beyond this list if nothing here fits):\n${medIndexDrugs.map(d =>
        `- ${d.generic_name} (${d.drug_class || 'class n/a'}): dosage: ${d.dosage || 'n/a'}; indications: ${d.primary_indications || 'n/a'}; contraindications: ${d.contraindications || 'n/a'}`
      ).join('\n')}\n`
    : '';

  const medIndexExcludedBlock = medIndexExcluded.length
    ? `\nExcluded from consideration due to documented allergy (do not suggest these or mention them as options): ${medIndexExcluded.map(d => d.generic_name).join(', ')}.\n`
    : '';

  const medIndexConditionBlock = medIndexCondition
    ? `\nMedIndex clinical reference for "${primaryDiagnosis}":\n${[medIndexCondition.clinicalManifestation, medIndexCondition.management]
        .filter(Boolean).join('\n')}\n`
    : '';

  const prompt = `You are a senior clinical decision-support assistant used inside a Nigerian Army clinical training facility EMR (NACON MRS). The facility is staffed by nursing/medical students; a doctor OR a nurse may be entering this note, both performing the same clinical function. Students rely on your output to actually learn correct, guideline-consistent management — so it must be clinically competent and specific, never generic or vague, and never a template with the blanks left unfilled.

Given the consultation note below, produce a structured management plan a clinician could consider. This is decision support only, not a final prescription — a licensed clinician always reviews before anything is prescribed.

Patient context:
${contextLines}
${allergyBlock}${medIndexConditionBlock}${medIndexDrugBlock}${medIndexExcludedBlock}
Consultation note:
"""
${noteText}
"""

Respond using EXACTLY these section headers, in this order, each on its own line as shown (use "### " prefix):

### DIAGNOSIS
Read the C/O, O/E and any history in the note carefully and commit to the single most likely working diagnosis that actually matches those specific findings — do not default to a generic or textbook-common condition unless the presenting complaint genuinely fits it. Name real differentials (2-3) only if the presentation is genuinely ambiguous between them, and say in one clause why each differential is in play given THIS patient's findings. If the note is too sparse to diagnose safely, say exactly what missing history/exam/investigation is needed rather than guessing.

### MAIN THERAPY
The first-line drug(s) that directly treat the diagnosis above. List as many DIFFERENT genuine, clinically-appropriate drug options as real first-line/alternative-first-line practice actually supports for this condition, up to a maximum of 10 — do not pad the list with drugs that aren't real options just to hit a number, and do not stop at one drug if several standard first-line alternatives exist (e.g. list the 2-3 standard PPI options, not just "a PPI"). Where a drug appears in the MedIndex reference formulary above, use its exact dosage and note "(MedIndex)" after the name; otherwise use standard adult dosing (adjust for the patient's age/sex/weight context if given) from your own clinical knowledge. If the usual first-line drug is excluded due to allergy, suggest the substitute here instead and say why.

Each line MUST be a real, named, specific drug (the actual generic drug name, e.g. "Omeprazole", never a therapeutic class alone like "Proton Pump Inhibitor" or "an antibiotic"), followed by REAL, FILLED-IN numbers and words for dose, route, frequency, and duration — never leave the literal words "dose", "route", "frequency", or "duration" in the output; if you are not confident of an exact figure, give the standard/typical value used in practice rather than omitting it. Format each line exactly as:
"- **<Generic drug name>** <dose e.g. 20 mg> <route e.g. oral> <frequency e.g. once daily> for <duration e.g. 4 weeks> — <1-line rationale>."
Example of a CORRECT line: "- **Omeprazole** 20 mg oral once daily for 4 weeks — first-line PPI to reduce gastric acid and allow ulcer healing."
Example of an INCORRECT line (never do this): "- **Proton Pump Inhibitor** dose, route, frequency, duration — first-line therapy."

### ADJUNCT THERAPY
Supportive/symptomatic treatment that does not treat the root cause but aids recovery (e.g. antipyretics, analgesics, antiemetics, antacids, IV fluids, rest/nutrition advice). List as many genuinely appropriate distinct options as real practice supports, up to a maximum of 5, using the exact same per-drug line format and specificity rules as Main Therapy above (real drug name, real filled-in dose/route/frequency/duration, no placeholders). Omit this section header entirely (write nothing under it) if genuinely nothing adjunctive is indicated.

### COMBINATION THERAPY
Only include this section if the diagnosis is one where combined/multi-drug regimens are standard practice (e.g. malaria with a concurrent condition, H. pylori triple/quadruple therapy, TB regimens, suspected sepsis needing dual coverage). List each real-world combination regimen that applies (up to 5), using the same per-drug line format for each drug in the regimen, grouped and labelled by regimen name, and explain briefly why they're given together (e.g. synergy, resistance prevention, treating two concurrent problems). If not clinically indicated for this note, omit this entire section — do not force a combination that isn't warranted.

### RED FLAGS
Bullet list (max 5) of specific things to rule out or watch for, tied to this diagnosis and this patient's findings, not generic warnings.

### SAFETY NOTE
1-2 lines reminding the clinician to confirm against allergy history, exact local-protocol dosing, and contraindications before prescribing. If an allergy substitution was made above, restate it here explicitly.

Keep every section scannable but do not sacrifice clinical completeness or real drug specificity for brevity. Do not add any section not listed above. Never leave a placeholder unfilled.`;

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 3000 },
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
