// functions/index.js
//
// NACON-EMR's own AI Clinical Consult / AI Drug Insight backend.
//
// Previously this feature called MedIndex's /api/drug-ai-details endpoint
// (mode: 'clinical_plan') as a shared engine. MedIndex added a Firebase-auth
// + AI-credits gate to that endpoint for its own users, and because
// NACON-EMR and MedIndex are separate Firebase projects (not a shared one,
// despite an earlier assumption in this codebase), NACON-EMR could never
// satisfy that gate — every request came back 401 "Please sign in to use AI
// Clinical Consult."
//
// AI Clinical Consult was built for NACON-EMR first and foremost, so this
// function makes it fully independent again: NACON-EMR's own Gemini API
// key, NACON-EMR's own Firebase Auth (this project's ID tokens, verified
// below), no MedIndex credits, no cross-project coupling. MedIndex can grow
// its own equivalent endpoint later if/when needed — the two are decoupled
// from here on.
//
// Grounding data (MedIndex's public drug/condition reference) is still read
// directly from MedIndex's Firestore in src/lib/medIndex.js on the client —
// that's a public, unauthenticated read — not the gated AI endpoint — so it
// is unaffected by any of this and is left as-is.

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const MODEL = 'gemini-2.5-flash-lite';

// Allow the NACON-EMR web app (any origin — the real gate is the Firebase
// ID token check below, not CORS) to call this from the browser.
function applyCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function verifyAuth(req) {
  const authHeader = req.get('authorization') || req.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) return null;
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    logger.warn('verifyIdToken failed', e?.message);
    return null;
  }
}

// Ported verbatim (logic-for-logic) from MedIndex's clinical_plan prompt in
// api/drug-ai-details.js, so NACON-EMR's clinicians keep the same quality of
// suggestion they had before — just generated independently now.
function buildClinicalPlanPrompt({ noteText, age, sex, primaryDiagnosis, allergyList, medIndexDrugs, medIndexExcluded, medIndexCondition }) {
  const contextLines = [
    age ? `Age: ${age}` : null,
    sex ? `Sex: ${sex}` : null,
    primaryDiagnosis ? `Primary diagnosis on file: ${primaryDiagnosis}` : null,
  ].filter(Boolean).join('\n');

  const hasAllergyHistory = Array.isArray(allergyList) && allergyList.length > 0;
  const allergyBlock = hasAllergyHistory
    ? `\nDOCUMENTED ALLERGIES (hard constraint — read before suggesting anything): ${allergyList.join(', ')}.
Do NOT suggest any of these drugs, or drugs in the same/cross-reactive class (e.g. cephalosporins if penicillin-allergic, other NSAIDs if aspirin-allergic). If the normal first-line/main therapy for this diagnosis is contraindicated by this allergy, do not suggest it — name the next-best alternative instead and explicitly say why the usual first-line choice was skipped.\n`
    : `\nAllergy history: none recorded for this patient. Do not assume "no allergies" — treat this as "not yet documented" and include a line reminding the clinician to confirm allergy status with the patient before prescribing.\n`;

  const medIndexDrugBlock = Array.isArray(medIndexDrugs) && medIndexDrugs.length
    ? `\nMedIndex reference formulary (authoritative for this facility, use these exact doses/considerations when one of these drugs applies; only reach beyond this list if nothing here fits):\n${medIndexDrugs.map(d =>
        `- ${d.generic_name} (${d.drug_class || 'class n/a'}): dosage: ${d.dosage || 'n/a'}; indications: ${d.primary_indications || 'n/a'}; contraindications: ${d.contraindications || 'n/a'}`
      ).join('\n')}\n`
    : '';

  const medIndexExcludedBlock = Array.isArray(medIndexExcluded) && medIndexExcluded.length
    ? `\nExcluded from consideration due to documented allergy (do not suggest these or mention them as options): ${medIndexExcluded.map(d => d.generic_name).join(', ')}.\n`
    : '';

  const medIndexConditionBlock = medIndexCondition
    ? `\nMedIndex clinical reference for "${primaryDiagnosis}":\n${[medIndexCondition.clinicalManifestation, medIndexCondition.management]
        .filter(Boolean).join('\n')}\n`
    : '';

  return `You are a senior clinical decision-support assistant used inside a clinical/nursing app in Nigeria. Whoever is using this (doctor, nurse, or nursing/medical student) relies on your output to actually learn or apply correct, guideline-consistent management — so it must be clinically competent and specific, never generic or vague, and never a template with the blanks left unfilled.

Given the consultation note below, produce a structured management plan a clinician could consider. This is decision support only, not a final prescription — a licensed clinician always reviews before anything is prescribed.

Hard rule across every section below: never output the same drug name with the same dose/route/duration more than once anywhere in the entire response. Every bullet must represent a genuinely distinct clinical option — a different drug, a different regimen, or the same drug at a meaningfully different route/severity-tier (e.g. oral vs IV). If you cannot think of another genuinely distinct option, stop the list short rather than repeating one.

Patient context:
${contextLines}
${allergyBlock}${medIndexConditionBlock}${medIndexDrugBlock}${medIndexExcludedBlock}
Consultation note:
"""
${noteText}
"""

Respond using EXACTLY these section headers, in this order, each on its own line as shown (use "### " prefix):

### DIAGNOSIS
If the note already directly names a specific condition or diagnosis (e.g. just "Malaria", "gastric ulcer", "hypertension") rather than describing symptoms/findings to be worked up, treat that named condition itself as the working diagnosis and move straight to the therapy sections below — do not ask for more clinical detail in this case. The clinician is asking for the reference-level management of a known condition, not asking you to diagnose a patient from a symptom description, so state the diagnosis as given in one line and proceed.
Otherwise, read the C/O, O/E and any history in the note carefully and commit to the single most likely working diagnosis that actually matches those specific findings — do not default to a generic or textbook-common condition unless the presenting complaint genuinely fits it. Name real differentials (2-3) only if the presentation is genuinely ambiguous between them, and say in one clause why each differential is in play given THIS patient's findings. Only if the note describes a genuine symptom presentation that is too vague or sparse to safely commit to a working diagnosis from should you say exactly what missing history/exam/investigation is needed rather than guessing — this applies to underspecified symptom descriptions, not to notes that already state the diagnosis outright.

### MAIN THERAPY
The first-line drug(s) that directly treat the diagnosis above. Be thorough and exhaustive here, not conservative: actively enumerate every genuine, clinically-appropriate option real first-line/alternative-first-line practice supports for this condition — aim for at least 6, and up to 10, distinct options whenever the condition genuinely has that many real alternatives (many common conditions do, once you count different agents within a class, different drug classes entirely, and different routes/severity tiers). Only give fewer than 6 if the condition is genuinely narrow enough that real alternatives run out — never pad with fake options just to hit a number, but equally never stop early out of caution when more genuine options exist. Deliberately vary ROUTE across the list where real practice supports it: include oral options AND, where clinically appropriate for this condition/severity, IV, IM, SC, sublingual, rectal, or topical options too — do not default to oral-only if the condition is ever managed by other routes in real practice (e.g. an IV/IM option for the severe or vomiting/NPO patient who can't take oral therapy). "Different" means a different active drug/regimen, OR the same condition managed via a genuinely different route or severity tier (e.g. oral therapy for the uncomplicated/outpatient case vs IV/IM therapy for the severe/inpatient case) — never repeat the identical drug, dose, route and duration as a separate bullet; if you find yourself about to write the same line twice, drop the duplicate and move to a real alternative instead. Draw from BOTH the MedIndex reference formulary above AND your own broader clinical knowledge — do not limit yourself to only what's listed in MedIndex; where a drug appears in the MedIndex reference formulary, use its exact dosage and note "(MedIndex)" after the name, and add further genuine options beyond that list from standard clinical practice as needed to reach real, thorough coverage. If the usual first-line drug is excluded due to allergy, suggest the substitute here instead and say why.

Each line MUST be a real, named, specific drug (the actual generic drug name, e.g. "Omeprazole", never a therapeutic class alone like "Proton Pump Inhibitor" or "an antibiotic"), followed by REAL, FILLED-IN numbers and words for dose, route, frequency, and duration — never leave the literal words "dose", "route", "frequency", or "duration" in the output; if you are not confident of an exact figure, give the standard/typical value used in practice rather than omitting it. Format each line exactly as:
"- **<Generic drug name>** <dose e.g. 20 mg> <route e.g. oral> <frequency e.g. once daily> for <duration e.g. 4 weeks> — <1-line rationale>."
Example of a CORRECT line: "- **Omeprazole** 20 mg oral once daily for 4 weeks — first-line PPI to reduce gastric acid and allow ulcer healing."
Example of an INCORRECT line (never do this): "- **Proton Pump Inhibitor** dose, route, frequency, duration — first-line therapy."
Example of an INCORRECT list (never repeat a drug like this): five bullets that are all "Artemether-Lumefantrine 4 tablets oral at 0, 8, 24, 48, 72 hours" with only the rationale sentence reworded — that is ONE option, list it ONCE, then give real alternatives (e.g. a different oral ACT partner drug, or the IV/IM regimen used for severe disease) instead of repeating it.

### ADJUNCT THERAPY
Everything that supplements or supports the Main Therapy without treating the root cause itself — this is broader than just symptom-relief drugs. Be equally thorough here: aim for at least 6, and up to 10, genuinely distinct options whenever the condition realistically calls for that many, spanning as many of these categories as genuinely apply rather than picking just one or two:
- IV/oral fluids and electrolyte replacement (e.g. Normal Saline 0.9%, Dextrose Saline, 5%/10% Dextrose Water, Ringer's Lactate, ORS) — for dehydration, poor oral intake, fluid/electrolyte correction, or as a maintenance/rehydration line alongside Main Therapy.
- Vitamins and micronutrients (e.g. Vitamin C, Vitamin B-complex, Folic Acid, Vitamin K, Zinc) — where the diagnosis or patient state genuinely calls for supplementation (e.g. zinc alongside ORS for diarrhoea, folic acid in pregnancy/haemolysis, Vitamin K in bleeding risk).
- Dietary/nutritional supplements and general supportive advice (e.g. high-protein diet, small frequent meals, oral rehydration, rest) where relevant.
- Symptomatic medications (antipyretics, analgesics, antispasmodics, antiemetics, antacids, laxatives, cough preparations, etc.) — vary route here too where real practice supports it (e.g. an IV/IM antiemetic alongside an oral antipyretic), not oral-only by default.
Only give fewer than 6 if the condition genuinely doesn't need that much support — do not force irrelevant categories in. Use the exact same per-drug line format and specificity rules as Main Therapy above (real named product/drug, real filled-in dose/route/frequency/duration, no placeholders, no repeated drugs, drawing from both MedIndex and your own broader clinical knowledge) — fluids need a real volume, route and rate/duration too (e.g. "1000 mL IV over 8 hours"), not just a name. Omit this section header entirely (write nothing under it) if genuinely nothing adjunctive is indicated.

### COMBINATION THERAPY
Actively check whether standard practice/guidelines for this diagnosis include a real combination/multi-drug package before concluding none applies — this is a mandatory check, not an optional afterthought, and it is genuinely relevant for more conditions than it might first appear: (a) conditions needing two unrelated drug classes together (e.g. suspected sepsis needing dual antibiotic coverage, H. pylori triple/quadruple therapy, TB RHZE, dysentery with suspected bacterial or amoebic cause needing paired antimicrobial coverage), AND (b) fixed combination regimens that ARE the standard single-agent choice, such as an artemisinin-based combination therapy (ACT) for malaria (e.g. artemether + lumefantrine, or artesunate + amodiaquine as an alternative ACT) — in case (b), name the regimen and briefly state why it is a combination (e.g. pairing a fast-acting artemisinin component with a longer-acting partner drug to clear parasites quickly and prevent resistance). List every real-world regimen that applies (up to 5), using the same per-drug line format for every drug in the regimen, grouped and labelled by regimen name. Only write "Not applicable" if you have genuinely checked and standard practice for this specific diagnosis, at this presentation's severity, truly has no combination-regimen component — do not default to "not applicable" out of caution when a real one exists.

### RED FLAGS
Bullet list (max 5) of specific things to rule out or watch for, tied to this diagnosis and this patient's findings, not generic warnings.

### SAFETY NOTE
1-2 lines reminding the clinician to confirm against allergy history, exact local-protocol dosing, and contraindications before prescribing. If an allergy substitution was made above, restate it here explicitly.

Keep every section scannable but do not sacrifice clinical completeness or real drug specificity for brevity. Do not add any section not listed above. Never leave a placeholder unfilled.`;
}

exports.aiClinicalConsult = onRequest(
  { secrets: [GEMINI_API_KEY], region: 'us-central1', cors: false, timeoutSeconds: 120 },
  async (req, res) => {
    applyCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // ── Auth gate: NACON-EMR's own Firebase Auth only. No MedIndex
    // involvement, no credits — any signed-in NACON-EMR user (doctor or
    // nurse) can use this, same as before the MedIndex dependency existed.
    const decoded = await verifyAuth(req);
    if (!decoded) {
      res.status(401).json({ error: 'Please sign in to use AI Clinical Consult.' });
      return;
    }

    const { noteText, age, sex, primaryDiagnosis, allergyList, medIndexDrugs, medIndexExcluded, medIndexCondition } = req.body || {};
    if (!noteText || typeof noteText !== 'string' || !noteText.trim()) {
      res.status(400).json({ error: 'noteText is required.' });
      return;
    }

    const prompt = buildClinicalPlanPrompt({ noteText, age, sex, primaryDiagnosis, allergyList, medIndexDrugs, medIndexExcluded, medIndexCondition });

    let geminiRes;
    try {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY.value(),
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 5500, temperature: 0.15 },
          }),
        }
      );
    } catch (e) {
      logger.error('Gemini fetch failed', e);
      res.status(500).json({ error: 'Unexpected server error.' });
      return;
    }

    if (!geminiRes.ok || !geminiRes.body) {
      const detail = await geminiRes.text().catch(() => '');
      logger.error('Gemini API error', geminiRes.status, detail);
      const isQuota = geminiRes.status === 429;
      res.status(502).json({
        error: isQuota
          ? 'AI quota exceeded. Try again shortly, or check the Gemini API key quota.'
          : 'Failed to reach the AI service.',
      });
      return;
    }

    // Re-emit the Gemini SSE stream as plain text, same contract the
    // frontend (geminiInsights.js) already expects.
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'no-cache');

    const decoder = new TextDecoder();
    const reader = geminiRes.body.getReader();
    let buffer = '';
    try {
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
            const evt = JSON.parse(dataStr);
            const parts = evt?.candidates?.[0]?.content?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (typeof part.text === 'string') res.write(part.text);
              }
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (e) {
      logger.error('Stream read error', e);
    } finally {
      res.end();
    }
  }
);
