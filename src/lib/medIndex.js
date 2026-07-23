// src/lib/medIndex.js
//
// Read-only bridge into MedIndex's drug reference and condition clinical
// info, so AI Drug Insight in NACON MRS is grounded in the same vetted
// data nurses already use in MedIndex, instead of relying purely on
// Gemini's general knowledge. Falls back gracefully (returns nothing) if
// MedIndex is unreachable or a drug/condition isn't found there — the
// caller then just proceeds with Gemini's own knowledge as before.
//
// This is a second, independent Firebase app instance pointed at
// MedIndex's project. `drugs` and `condition_clinical_info` are public
// read in MedIndex's firestore.rules, and this config is the same one
// already shipped in MedIndex's own client bundle, so it isn't a secret.

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

const MEDINDEX_CONFIG = {
  apiKey: 'AIzaSyAB8yCfmdvOTWRpj50Hhc7AWuabWLDvy6k',
  authDomain: 'nacon-post-utme-past-question.firebaseapp.com',
  projectId: 'nacon-post-utme-past-question',
  storageBucket: 'nacon-post-utme-past-question.firebasestorage.app',
  messagingSenderId: '1090299637128',
  appId: '1:1090299637128:web:a055d0cc654fdf569fde3d',
};
const MEDINDEX_APP_NAME = 'medindex-readonly';

function medIndexDb() {
  const existing = getApps().find(a => a.name === MEDINDEX_APP_NAME);
  const app = existing || initializeApp(MEDINDEX_CONFIG, MEDINDEX_APP_NAME);
  return getFirestore(app);
}

// Matches MedIndex's own slugifyConditionLabel() (useCustomConditions.js)
// so a diagnosis string on the NACON patient record has a shot at hitting
// the same doc ID MedIndex would have generated for that condition.
function slugifyConditionLabel(label) {
  return label.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_');
}

// ── Drug reference cache ─────────────────────────────────────────
// One shared in-memory cache (not per-call) since the formulary is large
// (2000+ possible) and doesn't need to be live — a 10 min TTL is plenty
// fresh for decision support and keeps this cheap.
let drugsCache = null;
let drugsFetchedAt = 0;
const DRUGS_TTL_MS = 10 * 60 * 1000;

async function getAllMedIndexDrugs() {
  if (drugsCache && Date.now() - drugsFetchedAt < DRUGS_TTL_MS) return drugsCache;
  try {
    const snap = await getDocs(collection(medIndexDb(), 'drugs'));
    drugsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    drugsFetchedAt = Date.now();
  } catch (e) {
    console.warn('[medIndex] drug list fetch failed, continuing without grounding:', e?.message);
    drugsCache = drugsCache || [];
  }
  return drugsCache;
}

function scoreDrug(drug, keywords) {
  const haystack = [drug.generic_name, drug.drug_class, drug.drug_subclass, drug.primary_indications, drug.overview]
    .filter(Boolean).join(' ').toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (kw.length < 4) continue;
    if (haystack.includes(kw)) score++;
  }
  return score;
}

// Best-effort keyword match against the note + diagnosis, so the Gemini
// prompt only carries the handful of plausibly-relevant drugs instead of
// the whole formulary (keeps the prompt small and the match meaningful).
export async function findRelevantMedIndexDrugs({ noteText, primaryDiagnosis }, limit = 15) {
  const drugs = await getAllMedIndexDrugs();
  if (!drugs.length) return [];
  const text = `${noteText || ''} ${primaryDiagnosis || ''}`.toLowerCase();
  const keywords = Array.from(new Set(text.split(/[^a-z0-9]+/).filter(Boolean)));
  return drugs
    .map(d => ({ d, score: scoreDrug(d, keywords) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.d);
}

// Exact/near lookup by generic name — used to enrich a drug the AI already
// suggested with MedIndex's full vetted record (dosage, contraindications,
// nursing considerations) instead of leaving it as free-text AI recall.
export async function lookupMedIndexDrug(name) {
  if (!name) return null;
  const drugs = await getAllMedIndexDrugs();
  const target = name.trim().toLowerCase();
  if (!target) return null;
  return (
    drugs.find(d => (d.generic_name || '').trim().toLowerCase() === target) ||
    drugs.find(d => {
      const gn = (d.generic_name || '').trim().toLowerCase();
      return gn && (gn.includes(target) || target.includes(gn));
    }) ||
    null
  );
}

// ── Condition clinical info lookup ───────────────────────────────
export async function lookupMedIndexCondition(label) {
  if (!label) return null;
  const id = slugifyConditionLabel(label);
  try {
    const snap = await getDoc(doc(medIndexDb(), 'condition_clinical_info', id));
    return snap.exists() ? { id, ...snap.data() } : null;
  } catch (e) {
    console.warn('[medIndex] condition lookup failed:', e?.message);
    return null;
  }
}
