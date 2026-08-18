// src/lib/exportBackup.js
// ─────────────────────────────────────────────
// Data export & backup — for records-retention requirements.
// Pulls full collections from Firestore and produces downloadable
// JSON (complete, nested, restorable) or CSV (flat, spreadsheet-friendly)
// files entirely client-side. Admin-only; callers must gate access.
// ─────────────────────────────────────────────
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { COL, logAudit } from './emr';

// Collections included in a full facility backup, with a human label.
export const BACKUP_COLLECTIONS = [
  { key: 'PATIENTS',      label: 'Patients' },
  { key: 'VISITS',        label: 'Visits / Admissions' },
  { key: 'NOTES',         label: 'Clinical Notes' },
  { key: 'VITALS',        label: 'Vitals' },
  { key: 'PRESCRIPTIONS', label: 'Prescriptions' },
  { key: 'FLUIDS',        label: 'Fluid Charts' },
  { key: 'GLUCOSE',       label: 'Glucose Charts' },
  { key: 'REFERRALS',     label: 'Referrals / Discharges' },
  { key: 'MAR',           label: 'MAR Records' },
  { key: 'CARE_PLANS',    label: 'Nursing Care Plans' },
  { key: 'LAB_REQUESTS',  label: 'Lab Requests' },
  { key: 'LAB_RESULTS',   label: 'Lab Results' },
  { key: 'SELF_REPORT',   label: 'Sick Reports' },
  { key: 'INVENTORY',     label: 'Pharmacy Inventory' },
  { key: 'DISPENSE_LOG',  label: 'Dispense Log' },
  { key: 'AUDIT',         label: 'Audit Log' },
];

// Firestore Timestamp objects don't serialize meaningfully via JSON.stringify
// (they'd become "{}"). Convert them (and Timestamps nested one level deep,
// which covers evaluationLog-style arrays) to ISO 8601 strings so the export
// is both human-readable and re-importable without a Firestore SDK.
function serializeValue(v) {
  if (v && typeof v === 'object' && typeof v.seconds === 'number' && typeof v.nanoseconds === 'number') {
    return new Date(v.seconds * 1000).toISOString();
  }
  if (Array.isArray(v)) return v.map(serializeValue);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = serializeValue(val);
    return out;
  }
  return v;
}

async function fetchCollection(colName) {
  const snap = await getDocs(collection(db, colName));
  return snap.docs.map(d => serializeValue({ id: d.id, ...d.data() }));
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toCSV(rows) {
  if (!rows.length) return '';
  // Union of all keys across rows, since Firestore docs in a collection
  // don't always share an identical shape.
  const headers = [...rows.reduce((set, r) => {
    Object.keys(r).forEach(k => set.add(k));
    return set;
  }, new Set())];
  const escape = v => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(h => escape(row[h])).join(','));
  return lines.join('\n');
}

/**
 * Export every collection listed in BACKUP_COLLECTIONS as a single JSON
 * file — the complete, restorable backup for records retention.
 */
export async function exportFullBackupJSON({ performedBy, performedByRole } = {}) {
  const data = {};
  for (const { key } of BACKUP_COLLECTIONS) {
    data[key] = await fetchCollection(COL[key]);
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    facility: 'Nigerian Army College of Nursing (NACON) — EMR',
    collections: data,
  };
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(JSON.stringify(payload, null, 2), `nacon-emr-backup-${stamp}.json`, 'application/json');
  await logAudit('EXPORT_FULL_BACKUP', 'ALL', performedBy || 'Unknown',
    { collections: BACKUP_COLLECTIONS.map(c => c.key) }, performedByRole);
}

/**
 * Export a single collection as CSV, for spreadsheet review of one record
 * type (e.g. just the audit log, or just patients).
 */
export async function exportCollectionCSV(colKey, { performedBy, performedByRole } = {}) {
  const rows  = await fetchCollection(COL[colKey]);
  const label = BACKUP_COLLECTIONS.find(c => c.key === colKey)?.label || colKey;
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(toCSV(rows), `nacon-emr-${colKey.toLowerCase()}-${stamp}.csv`, 'text/csv');
  await logAudit('EXPORT_COLLECTION_CSV', colKey, performedBy || 'Unknown', { label, count: rows.length }, performedByRole);
}

/**
 * Export one patient's complete chart (every collection filtered to that
 * emrNumber) as a single JSON file — for individual records requests or
 * transfer-of-care documentation.
 */
export async function exportPatientRecordJSON(emrNumber, { performedBy, performedByRole } = {}) {
  const data = {};
  for (const { key } of BACKUP_COLLECTIONS) {
    if (key === 'INVENTORY' || key === 'DISPENSE_LOG') continue; // facility-level, not per-patient
    const all = await fetchCollection(COL[key]);
    data[key] = key === 'PATIENTS'
      ? all.filter(d => d.emrNumber === emrNumber || d.id === emrNumber)
      : all.filter(d => d.emrNumber === emrNumber);
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    emrNumber,
    collections: data,
  };
  downloadBlob(JSON.stringify(payload, null, 2), `patient-${emrNumber}-record.json`, 'application/json');
  await logAudit('EXPORT_PATIENT_RECORD', emrNumber, performedBy || 'Unknown', {}, performedByRole);
}
