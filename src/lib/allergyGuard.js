// src/lib/allergyGuard.js
//
// Shared allergy-safety layer for AI Drug Insight.
// Used in two places:
//   1. geminiInsights.js  — BEFORE the prompt is built, to strip any
//      MedIndex-matched drug that conflicts with a recorded allergy out of
//      what Gemini is even offered, and to turn the allergy list into an
//      explicit hard-constraint instruction.
//   2. AIDrugInsightPanel.jsx — AFTER Gemini responds, to re-check every
//      drug name it actually suggested (belt-and-suspenders: never trust
//      the model alone to have honored the instruction).
//
// This is intentionally simple, deterministic string/class matching — not
// an AI call — so it can't be talked out of flagging something.

// Known cross-reactive drug classes. Keyed by a normalized allergy term a
// patient record might contain; value is a list of generic names / class
// fragments that should also be treated as allergic even if not an exact
// name match. Not exhaustive — extend as needed — but covers the common
// clinically significant cross-reactivities.
const CROSS_REACTIVITY = {
  penicillin: ['amoxicillin', 'ampicillin', 'flucloxacillin', 'cloxacillin', 'piperacillin', 'penicillin', 'augmentin', 'co-amoxiclav'],
  amoxicillin: ['penicillin', 'ampicillin', 'augmentin', 'co-amoxiclav'],
  'penicillin group': ['amoxicillin', 'ampicillin', 'flucloxacillin', 'cloxacillin', 'piperacillin', 'penicillin'],
  cephalosporin: ['cefuroxime', 'ceftriaxone', 'cefixime', 'cefpodoxime', 'cephalexin', 'cefaclor'],
  sulfa: ['sulfamethoxazole', 'co-trimoxazole', 'septrin', 'sulfadoxine', 'sulfasalazine'],
  sulphonamide: ['sulfamethoxazole', 'co-trimoxazole', 'septrin', 'sulfadoxine', 'sulfasalazine'],
  'sulfa drugs': ['sulfamethoxazole', 'co-trimoxazole', 'septrin', 'sulfadoxine', 'sulfasalazine'],
  nsaid: ['ibuprofen', 'diclofenac', 'naproxen', 'aspirin', 'indomethacin', 'ketorolac', 'mefenamic'],
  aspirin: ['nsaid', 'ibuprofen', 'diclofenac', 'naproxen', 'indomethacin'],
  'aspirin/nsaids': ['ibuprofen', 'diclofenac', 'naproxen', 'indomethacin'],
  quinine: ['quinidine', 'artemether-lumefantrine artemether component n/a'],
  macrolide: ['erythromycin', 'azithromycin', 'clarithromycin'],
  fluoroquinolone: ['ciprofloxacin', 'levofloxacin', 'ofloxacin', 'moxifloxacin'],
};

// Split a free-text allergy field ("Penicillin, Sulfa drugs; NSAIDs") into
// normalized individual terms.
export function parseAllergyList(allergiesText) {
  if (!allergiesText || typeof allergiesText !== 'string') return [];
  return Array.from(
    new Set(
      allergiesText
        .split(/[,;\n/]+/)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
        .filter(s => !['none', 'nil', 'na', 'n/a', 'nka', 'none known', 'not known', 'no known allergies', 'no known allergy', 'none recorded', 'none reported', 'no allergies', 'no allergy'].includes(s))
    )
  );
}

// Expand a raw allergy list into the full set of drug-name fragments that
// should be treated as contraindicated, including cross-reactive classes.
export function expandAllergyTerms(allergyList) {
  const expanded = new Set();
  for (const term of allergyList) {
    expanded.add(term);
    const cross = CROSS_REACTIVITY[term];
    if (cross) cross.forEach(c => expanded.add(c.toLowerCase()));
    // Also check if the term appears as a substring key (e.g. "penicillin allergy")
    for (const key of Object.keys(CROSS_REACTIVITY)) {
      if (term.includes(key) || key.includes(term)) {
        CROSS_REACTIVITY[key].forEach(c => expanded.add(c.toLowerCase()));
      }
    }
  }
  return Array.from(expanded);
}

// Does a given drug (by generic name and/or drug class string) match any
// expanded allergy term? Simple bidirectional substring match — favors
// catching false positives (over-flagging) over missing a real conflict.
export function isDrugAllergic(drugNameOrClass, expandedTerms) {
  if (!drugNameOrClass) return false;
  const hay = drugNameOrClass.toLowerCase();
  return expandedTerms.some(term => term.length >= 4 && (hay.includes(term) || term.includes(hay)));
}

// Filter a list of MedIndex drug records (each with generic_name / drug_class)
// against a patient's allergy list. Returns both the safe list to actually
// offer to Gemini and the excluded list (kept for the "excluded due to
// allergy" note so the clinician can see what was deliberately left out,
// rather than it silently vanishing).
export function filterAllergicDrugs(drugs, allergiesText) {
  const allergyList = parseAllergyList(allergiesText);
  if (!allergyList.length) return { safe: drugs, excluded: [], expandedTerms: [] };
  const expandedTerms = expandAllergyTerms(allergyList);
  const safe = [];
  const excluded = [];
  for (const d of drugs) {
    const conflict = isDrugAllergic(d.generic_name, expandedTerms) || isDrugAllergic(d.drug_class, expandedTerms);
    (conflict ? excluded : safe).push(d);
  }
  return { safe, excluded, expandedTerms };
}

// Post-response check: given the drug names the AI actually suggested,
// flag which ones conflict with the patient's allergy list. Never trust
// the prompt instruction alone — this runs regardless of what the model did.
export function flagAllergicRows(rows, allergiesText) {
  const allergyList = parseAllergyList(allergiesText);
  if (!allergyList.length) return rows.map(r => ({ ...r, allergyConflict: false }));
  const expandedTerms = expandAllergyTerms(allergyList);
  return rows.map(r => ({
    ...r,
    allergyConflict: isDrugAllergic(r.name, expandedTerms) || (r.medIndexClass ? isDrugAllergic(r.medIndexClass, expandedTerms) : false),
  }));
}
