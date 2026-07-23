#!/usr/bin/env node
// ─────────────────────────────────────────────
// One-time cleanup: closes out prescriptions still marked 'active' that were
// created BEFORE a patient's current (latest) admission — i.e. left over from
// an earlier stay, now mixed in with a readmitted patient's Active Medications
// list. Going forward, dischargePatient() in src/lib/emr.js already prevents
// this for new discharges; this script is only for data that predates that fix.
//
// SAFE BY DEFAULT: runs as a dry run (prints what it would change, writes
// nothing) unless you pass --apply.
//
// USAGE:
//   1. npm install --no-save firebase-admin
//   2. Download a Firebase service account key (Firebase console → Project
//      Settings → Service Accounts → Generate new private key) and save it
//      somewhere OUTSIDE the git repo, e.g. ~/nacon-emr-service-account.json
//   3. Dry run (no writes):
//        GOOGLE_APPLICATION_CREDENTIALS=~/nacon-emr-service-account.json \
//          node scripts/cleanup-stale-active-meds.js
//   4. Review the printed report, then actually apply the changes:
//        GOOGLE_APPLICATION_CREDENTIALS=~/nacon-emr-service-account.json \
//          node scripts/cleanup-stale-active-meds.js --apply
// ─────────────────────────────────────────────

const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});
const db = admin.firestore();

function tsMs(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function stripUndefined(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

async function main() {
  console.log(APPLY ? '=== APPLY MODE — writes will be made ===' : '=== DRY RUN — no writes will be made (pass --apply to write) ===');

  const patientsSnap = await db.collection('patients').get();
  const patients = patientsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => p.admittedAt); // only patients with a known current/latest admission

  console.log(`Found ${patients.length} patient(s) with an admission on record.\n`);

  let touchedPatients = 0;
  let touchedDrugs = 0;
  const writes = [];

  for (const patient of patients) {
    const admittedAtMs = tsMs(patient.admittedAt);
    if (!admittedAtMs) continue;

    const rxSnap = await db.collection('prescriptions').where('emrNumber', '==', patient.id).get();
    if (rxSnap.empty) continue;

    let patientTouched = false;

    for (const rxDoc of rxSnap.docs) {
      const rx = rxDoc.data();
      const rxCreatedMs = tsMs(rx.createdAt);
      if (!rxCreatedMs || rxCreatedMs >= admittedAtMs) continue; // belongs to the current admission — leave it

      const drugs = rx.drugs || [];
      let rxChanged = false;
      const updatedDrugs = drugs.map(d => {
        if (!d.status || d.status === 'active') {
          rxChanged = true;
          touchedDrugs++;
          console.log(
            `  [${patient.id}] ${patient.surname || ''} ${patient.firstName || ''} — ` +
            `"${d.drug}" (rx ${rxDoc.id}, prescribed ${new Date(rxCreatedMs).toISOString()}, ` +
            `admission started ${new Date(admittedAtMs).toISOString()}) → discontinued`
          );
          return stripUndefined({
            ...d,
            status: 'discontinued',
            statusUpdatedBy: 'cleanup-script',
            statusUpdatedAt: new Date().toISOString(),
            statusNote: 'Auto-closed by one-time cleanup — predates current admission',
          });
        }
        return d;
      });

      if (rxChanged) {
        patientTouched = true;
        writes.push({ ref: rxDoc.ref, drugs: updatedDrugs });
      }
    }

    if (patientTouched) touchedPatients++;
  }

  console.log(`\n${touchedDrugs} drug(s) across ${touchedPatients} patient(s) would be closed out.`);

  if (APPLY) {
    console.log('\nApplying writes...');
    for (const w of writes) {
      await w.ref.update({ drugs: w.drugs });
    }
    console.log('Done.');
  } else {
    console.log('\nDry run only — nothing was written. Re-run with --apply to actually make these changes.');
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
