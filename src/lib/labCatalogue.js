// src/lib/labCatalogue.js
// ─────────────────────────────────────────────
// Laboratory test catalogue.
//
// Every orderable test (see LAB_TESTS in emr.js) is broken into the rows the lab
// person fills in: name, unit, normal range (male / female / both) and kind of
// value. From this the Enter-Results screen pre-fills unit + range, and sets the
// H / L flag by itself when a value is typed.
//
// The numbers below are common adult SI reference ranges and are only DEFAULTS.
// The lab / admin can change any unit or range in the app ("Test ranges" button);
// those changes are saved in Firestore (settings/labCatalogue) and win over these.
//
// Row kinds:
//   num    – a number. Range { m:[lo,hi], f:[lo,hi] } or { all:[lo,hi] }; flag H / L.
//   select – pick from `options`; options listed in `abn` are flagged abnormal.
//   text   – free text (culture, microscopy…). No range, no flag.
// ─────────────────────────────────────────────

const NEG_POS = ['Negative', 'Positive'];
const URINE_DIP = ['Negative', 'Trace', '+', '++', '+++', '++++'];
const URINE_ABN = ['Trace', '+', '++', '+++', '++++'];
const REACT = ['Non-reactive', 'Reactive'];

const num = (name, unit, range) => ({ name, unit, kind: 'num', ...range });
const sel = (name, options, abn = [], unit = '') => ({ name, unit, kind: 'select', options, abn });
const txt = (name) => ({ name, unit: '', kind: 'text' });

export const LAB_CATALOGUE = {
  'Full Blood Count (FBC)': [
    num('HGB',   'g/L',      { m:[130,175], f:[115,160] }),
    num('WBC',   'x10^9/L',  { all:[4,11] }),
    num('PLT',   'x10^9/L',  { all:[150,400] }),
    num('RETIC', '%',        { all:[0.2,2] }),
    num('NEU',   '%',        { all:[40,75] }),
    num('LYMPH', '%',        { all:[20,45] }),
    num('EOS',   '%',        { all:[1,6] }),
    num('MON',   '%',        { all:[2,10] }),
    num('BASO',  '%',        { all:[0,1] }),
    num('HCT',   'L/L',      { m:[0.40,0.54], f:[0.36,0.48] }),
    num('MCV',   'fl',       { all:[80,100] }),
    num('MCH',   'pg/cell',  { all:[27,33] }),
    num('MCHC',  'g/dl',     { all:[32,36] }),
    num('RBC',   'x10^12/L', { m:[4.5,6.0], f:[4.0,5.5] }),
  ],
  'Haemoglobin (Hb)': [
    num('Hb', 'g/dL', { m:[13,17], f:[12,15] }),
  ],
  'Blood Group & Genotype': [
    sel('Blood Group', ['A Positive','A Negative','B Positive','B Negative','AB Positive','AB Negative','O Positive','O Negative']),
    sel('Genotype', ['AA','AS','AC','SS','SC','CC'], ['SS','SC','CC']),
  ],
  'Malaria Parasite (MP)': [
    sel('Malaria Parasite', ['Negative','Positive (+)','Positive (++)','Positive (+++)'], ['Positive (+)','Positive (++)','Positive (+++)']),
  ],
  'ESR': [
    num('ESR', 'mm/hr', { m:[0,15], f:[0,20] }),
  ],
  'Clotting Time / Bleeding Time': [
    num('Clotting Time',  'min', { all:[4,10] }),
    num('Bleeding Time',  'min', { all:[1,5] }),
  ],

  'Random Blood Sugar (RBS)': [
    num('Random Blood Sugar', 'mmol/L', { all:[3.5,7.8] }),
  ],
  'Fasting Blood Sugar (FBS)': [
    num('Fasting Blood Sugar', 'mmol/L', { all:[3.9,5.6] }),
  ],
  'Urea & Electrolytes (U&E)': [
    num('Sodium',      'mmol/L', { all:[135,145] }),
    num('Potassium',   'mmol/L', { all:[3.5,5.0] }),
    num('Chloride',    'mmol/L', { all:[98,106] }),
    num('Bicarbonate', 'mmol/L', { all:[22,29] }),
    num('Urea',        'mmol/L', { all:[2.5,7.1] }),
    num('Creatinine',  'umol/L', { m:[60,110], f:[45,90] }),
  ],
  'Liver Function Test (LFT)': [
    num('Total Bilirubin',  'umol/L', { all:[5,21] }),
    num('Direct Bilirubin', 'umol/L', { all:[0,5] }),
    num('AST',              'U/L',    { all:[0,40] }),
    num('ALT',              'U/L',    { all:[0,40] }),
    num('ALP',              'U/L',    { all:[44,147] }),
    num('Total Protein',    'g/L',    { all:[60,80] }),
    num('Albumin',          'g/L',    { all:[35,50] }),
  ],
  'Lipid Profile': [
    num('Total Cholesterol', 'mmol/L', { all:[0,5.2] }),
    num('Triglycerides',     'mmol/L', { all:[0,1.7] }),
    num('HDL Cholesterol',   'mmol/L', { m:[1.0,2.5], f:[1.2,2.7] }),
    num('LDL Cholesterol',   'mmol/L', { all:[0,3.4] }),
  ],
  'Serum Creatinine': [
    num('Creatinine', 'umol/L', { m:[60,110], f:[45,90] }),
  ],
  'Uric Acid': [
    num('Uric Acid', 'umol/L', { m:[200,430], f:[140,360] }),
  ],

  'Urinalysis (U/A)': [
    txt('Appearance'),
    num('pH', '', { all:[4.6,8.0] }),
    num('Specific Gravity', '', { all:[1.005,1.030] }),
    sel('Protein',          URINE_DIP, URINE_ABN),
    sel('Glucose',          URINE_DIP, URINE_ABN),
    sel('Ketones',          URINE_DIP, URINE_ABN),
    sel('Blood',            URINE_DIP, URINE_ABN),
    sel('Leucocytes',       URINE_DIP, URINE_ABN),
    sel('Nitrite',          NEG_POS, ['Positive']),
  ],
  'Urine M/C/S':      [ txt('Microscopy'), txt('Culture'), txt('Sensitivity') ],
  'Stool M/C/S':      [ txt('Microscopy'), txt('Culture'), txt('Sensitivity') ],
  'Sputum M/C/S':     [ txt('Microscopy'), txt('Culture'), txt('Sensitivity') ],
  'Wound Swab M/C/S': [ txt('Microscopy'), txt('Culture'), txt('Sensitivity') ],
  'Blood Culture':    [ txt('Culture'), txt('Sensitivity') ],

  'HIV Screening':                    [ sel('HIV Screening', REACT, ['Reactive']) ],
  'Hepatitis B Surface Ag (HBsAg)':   [ sel('HBsAg', REACT, ['Reactive']) ],
  'Hepatitis C Antibody':             [ sel('HCV Antibody', REACT, ['Reactive']) ],
  'VDRL / Syphilis':                  [ sel('VDRL', REACT, ['Reactive']) ],
  'Widal Test': [
    sel('S. Typhi O', ['Negative','1:20','1:40','1:80','1:160','1:320'], ['1:160','1:320']),
    sel('S. Typhi H', ['Negative','1:20','1:40','1:80','1:160','1:320'], ['1:160','1:320']),
  ],
  'Rheumatoid Factor (RF)': [ sel('Rheumatoid Factor', NEG_POS, ['Positive']) ],
  'CRP': [ num('CRP', 'mg/L', { all:[0,5] }) ],

  'Pregnancy Test (urine/serum)': [ sel('Pregnancy Test', NEG_POS) ],
  'Thyroid Function Test (TFT)': [
    num('TSH', 'mIU/L',  { all:[0.4,4.0] }),
    num('FT4', 'pmol/L', { all:[10,23] }),
    num('FT3', 'pmol/L', { all:[3.5,6.5] }),
  ],
  'PSA': [ num('PSA', 'ng/mL', { all:[0,4] }) ],
};

// ── helpers ───────────────────────────────────

const isSet = (v) => v !== undefined && v !== null && String(v).trim() !== '';

/** 'Male'/'male'/'M' → 'm', 'Female'… → 'f', anything else → '' */
export function sexKey(sex) {
  const s = String(sex || '').trim().toLowerCase();
  if (s.startsWith('f')) return 'f';
  if (s.startsWith('m')) return 'm';
  return '';
}

/** Firestore key for an analyte's saved override */
export const overrideId = (testName, analyteName) => `${testName}|${analyteName}`;

/**
 * Rows for one ordered test, with the lab's saved overrides applied.
 * A test that is not in the catalogue becomes a single free-text row so the lab
 * can still answer it.
 */
export function analytesFor(testName, overrides = {}) {
  const base = LAB_CATALOGUE[testName];
  if (!base) return [{ name: testName, unit: '', kind: 'text', test: testName, custom: true }];
  return base.map(a => {
    const o = overrides[overrideId(testName, a.name)] || {};
    const merged = { ...a, test: testName };
    if (a.kind === 'num') {
      if (o.unit !== undefined) merged.unit = o.unit;
      if (o.all || o.m || o.f) { delete merged.all; delete merged.m; delete merged.f; }
      if (o.all) merged.all = o.all;
      if (o.m)   merged.m = o.m;
      if (o.f)   merged.f = o.f;
    }
    return merged;
  });
}

/** [lo, hi] for this patient's sex, or null */
export function rangeFor(analyte, sex) {
  if (!analyte || analyte.kind !== 'num') return null;
  const k = sexKey(sex);
  return (k && analyte[k]) || analyte.all || analyte.m || analyte.f || null;
}

const fmt = (n) => String(Number(n));

/** '130 - 179' (empty string when there is no range) */
export function rangeText(analyte, sex) {
  const r = rangeFor(analyte, sex);
  return r ? `${fmt(r[0])} - ${fmt(r[1])}` : '';
}

/** Parse "130-179", "130 – 179", ".38 - .48" → [130,179] (null if not a range) */
export function parseRange(text) {
  const m = String(text || '').replace(/[–—]/g, '-').match(/^\s*(-?\d*\.?\d+)\s*-\s*(-?\d*\.?\d+)\s*$/);
  if (!m) return null;
  const lo = parseFloat(m[1]), hi = parseFloat(m[2]);
  return Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi ? [lo, hi] : null;
}

/** Pull a number out of what the lab typed ("12.5", "<5", "4,5") */
export function toNumber(value) {
  const n = parseFloat(String(value ?? '').replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * The flag a value should get: 'high' | 'low' | 'abnormal' | 'normal' | ''.
 * `rangeStr` is the range text currently shown on screen (the lab may have edited
 * it for this one result), so the flag always agrees with what is displayed.
 */
export function autoFlag(analyte, value, rangeStr) {
  if (!isSet(value)) return '';
  if (analyte.kind === 'select') return (analyte.abn || []).includes(value) ? 'abnormal' : 'normal';
  if (analyte.kind !== 'num') return '';
  const n = toNumber(value);
  const r = parseRange(rangeStr);
  if (n === null || !r) return '';
  return n < r[0] ? 'low' : n > r[1] ? 'high' : 'normal';
}

/** True for any flag that should turn a result row red */
export const isAbnormalFlag = (f) => f === 'high' || f === 'low' || f === 'abnormal';

/** Letter(s) shown in the TEST RESULT column */
export const flagLetter = (f) => f === 'high' ? 'H' : f === 'low' ? 'L' : f === 'abnormal' ? 'ABN' : '';
