// src/pages/BulkImportPatients.jsx
// Admin-only: register many patients at once from a CSV file, instead of
// filling the 4-step form one patient at a time. Reuses the exact same
// registerPatient() call the single-add form uses (same EMR sequence,
// same audit log entry, same search-token generation) so imported
// patients are indistinguishable from ones added by hand — this is a
// different front door onto the same registration path, not a separate
// write path.

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import { registerPatient } from '../lib/emr';

// Column order mirrors the 4 steps of RegisterPatient.jsx exactly, so the
// template lines up with what someone filling the form by hand would see.
const COLUMNS = [
  { key: 'surname',          label: 'surname',            required: true },
  { key: 'firstName',        label: 'firstName',          required: true },
  { key: 'otherNames',       label: 'otherNames' },
  { key: 'dob',              label: 'dob',                 required: true, hint: 'YYYY-MM-DD' },
  { key: 'sex',               label: 'sex',                required: true, hint: 'Male | Female' },
  { key: 'maritalStatus',    label: 'maritalStatus',       hint: 'Single | Married | Divorced | Widowed' },
  { key: 'religion',         label: 'religion',            hint: 'Christianity | Islam | Traditional | Other' },
  { key: 'tribe',            label: 'tribe' },
  { key: 'placeOfOrigin',    label: 'placeOfOrigin' },
  { key: 'bloodGroup',       label: 'bloodGroup',          hint: 'A+ | A- | B+ | B- | AB+ | AB- | O+ | O- | Unknown' },
  { key: 'allergies',        label: 'allergies',           hint: 'leave blank if none known' },
  { key: 'patientIdentity',  label: 'patientIdentity',     hint: 'Soldier | Civilian (defaults to Civilian)' },
  { key: 'matricNo',         label: 'matricNo',            required: true },
  { key: 'classSet',         label: 'classSet',            required: true },
  { key: 'level',            label: 'level' },
  { key: 'department',       label: 'department',          hint: 'defaults to Nursing Science' },
  { key: 'occupation',       label: 'occupation',          hint: 'Student | Staff | Civilian | Military (defaults to Student)' },
  { key: 'hmo',               label: 'hmo' },
  { key: 'homeAddress',      label: 'homeAddress' },
  { key: 'tel',               label: 'tel' },
  { key: 'email',            label: 'email' },
  { key: 'nextOfKin',        label: 'nextOfKin' },
  { key: 'nextOfKinRel',     label: 'nextOfKinRel' },
  { key: 'nextOfKinTel',     label: 'nextOfKinTel' },
  { key: 'nextOfKinAddress', label: 'nextOfKinAddress' },
  { key: 'pastMedHistory',   label: 'pastMedHistory' },
  { key: 'familyHistory',    label: 'familyHistory' },
  { key: 'currentMeds',      label: 'currentMeds' },
  { key: 'surgicalHistory',  label: 'surgicalHistory' },
];

const REQUIRED_KEYS = COLUMNS.filter(c => c.required).map(c => c.key);
const VALID_SEX = ['Male', 'Female'];
const VALID_IDENTITY = ['Soldier', 'Civilian'];

function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function validateRow(row, rowNum) {
  const errors = [];
  for (const key of REQUIRED_KEYS) {
    if (!row[key] || !String(row[key]).trim()) {
      errors.push(`missing ${key}`);
    }
  }
  if (row.dob && !/^\d{4}-\d{2}-\d{2}$/.test(row.dob.trim())) {
    errors.push('dob must be YYYY-MM-DD');
  }
  if (row.sex && !VALID_SEX.includes(row.sex.trim())) {
    errors.push(`sex must be ${VALID_SEX.join(' or ')}`);
  }
  if (row.patientIdentity && !VALID_IDENTITY.includes(row.patientIdentity.trim())) {
    errors.push(`patientIdentity must be ${VALID_IDENTITY.join(' or ')}`);
  }
  return { rowNum, row, errors };
}

export default function BulkImportPatients() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState([]); // { rowNum, row, errors }
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null); // { succeeded:[], failed:[] }

  const validCount = parsedRows.filter(r => r.errors.length === 0).length;
  const invalidCount = parsedRows.length - validCount;

  const handleDownloadTemplate = () => {
    const header = COLUMNS.map(c => c.label).join(',');
    const example = [
      'OKONKWO', 'Adaeze', 'Chioma', '2001-04-12', 'Female', 'Single', 'Christianity', 'Igbo', 'Anambra',
      'O+', 'Penicillin', 'Civilian', 'NACON/2023/0041', 'SET 49', 'Year 2', 'Nursing Science', 'Student',
      'NHIS · ZONAL/79/1661', '14 Apapa Road, Yaba, Lagos', '08031234567', 'adaeze@gmail.com',
      'Mrs. Ngozi Okonkwo', 'Mother', '08057891234', '22 Broad Street, Lagos',
      '', '', '', '',
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(',');
    downloadCsv('nacon-emr-patient-import-template.csv', `${header}\n${example}\n`);
  };

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    setImportResults(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
      complete: (results) => {
        const unknownCols = (results.meta.fields || []).filter(
          f => !COLUMNS.some(c => c.label === f)
        );
        if (unknownCols.length) {
          toast.error(`Unrecognized column(s): ${unknownCols.join(', ')} — check against the template`, { duration: 6000 });
        }
        const rows = results.data.map((row, i) => validateRow(row, i + 2)); // +2: header is row 1
        setParsedRows(rows);
        if (!rows.length) toast.error('No data rows found in that file');
      },
      error: (err) => {
        console.error('CSV parse error', err);
        toast.error('Could not read that CSV file');
      },
    });
  };

  const handleImport = async () => {
    const toImport = parsedRows.filter(r => r.errors.length === 0);
    if (!toImport.length) {
      toast.error('No valid rows to import');
      return;
    }
    setImporting(true);
    const succeeded = [];
    const failed = [];
    // Sequential, not Promise.all — registerPatient() runs a Firestore
    // transaction to claim the next EMR number, and firing 50+ of those
    // at once needlessly hammers the counter document with contention.
    // One at a time is slower but safe and gives an honest progress count.
    for (const { rowNum, row } of toImport) {
      try {
        const patientData = {
          ...row,
          department: row.department?.trim() || 'Nursing Science',
          occupation: row.occupation?.trim() || 'Student',
          patientIdentity: row.patientIdentity?.trim() || 'Civilian',
        };
        const result = await registerPatient(patientData, profile?.displayName, profile?.role);
        succeeded.push({ rowNum, name: `${row.surname} ${row.firstName}`, ...result });
      } catch (err) {
        console.error(`Row ${rowNum} import failed`, err);
        failed.push({ rowNum, name: `${row.surname || ''} ${row.firstName || ''}`.trim(), reason: err?.message || 'Unknown error' });
      }
    }
    setImporting(false);
    setImportResults({ succeeded, failed });
    if (succeeded.length) toast.success(`${succeeded.length} patient${succeeded.length === 1 ? '' : 's'} imported`);
    if (failed.length) toast.error(`${failed.length} row${failed.length === 1 ? '' : 's'} failed — see details below`);
  };

  const handleDownloadResults = () => {
    if (!importResults) return;
    const header = 'row,name,emrNumber,folderNumber,status,reason';
    const lines = [
      ...importResults.succeeded.map(r => `${r.rowNum},"${r.name}",${r.emrNumber},${r.folderNumber},imported,`),
      ...importResults.failed.map(r => `${r.rowNum},"${r.name}",,,failed,"${(r.reason || '').replace(/"/g, '""')}"`),
    ];
    downloadCsv('nacon-emr-bulk-import-results.csv', `${header}\n${lines.join('\n')}\n`);
  };

  const reset = () => {
    setFileName('');
    setParsedRows([]);
    setImportResults(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div className="topbar">
        <div className="topbar-title">Bulk Import Patients (CSV)</div>
        <button className="btn" onClick={() => navigate('/admin/patients')}>
          <i className="ti ti-arrow-left" /> Back
        </button>
      </div>

      <div className="page-content">
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-header">
            <div className="card-title"><i className="ti ti-file-spreadsheet" /> 1. Get the template</div>
          </div>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: 'var(--t3)', maxWidth: 480 }}>
              Download the CSV template, fill one row per patient, keep the header row exactly as is.
              Columns marked <span style={{ color: 'var(--danger)', fontWeight: 700 }}>*</span> below are required — every other column can be left blank.
            </div>
            <button className="btn btn-primary" onClick={handleDownloadTemplate}>
              <i className="ti ti-download" /> Download CSV template
            </button>
          </div>
          <div style={{ padding: '0 16px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {COLUMNS.map(c => (
              <span key={c.key} title={c.hint || ''} style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: c.required ? 'var(--danger-bg)' : 'var(--card-bg2)',
                color: c.required ? 'var(--danger)' : 'var(--t3)',
                border: `1px solid ${c.required ? 'var(--danger)' : 'var(--border)'}`,
              }}>
                {c.label}{c.required && ' *'}
              </span>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-header">
            <div className="card-title"><i className="ti ti-upload" /> 2. Upload your filled-in CSV</div>
          </div>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={e => handleFile(e.target.files?.[0])}
              style={{ fontSize: 12 }}
            />
            {fileName && (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)' }}>
                <i className="ti ti-file-check" /> {fileName}
              </span>
            )}
            {parsedRows.length > 0 && (
              <button className="btn btn-sm" onClick={reset}>
                <i className="ti ti-x" /> Clear
              </button>
            )}
          </div>
        </div>

        {parsedRows.length > 0 && !importResults && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header">
              <div className="card-title">
                <i className="ti ti-list-check" /> 3. Review ({parsedRows.length} row{parsedRows.length === 1 ? '' : 's'})
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span className="badge badge-ok">{validCount} ready</span>
                {invalidCount > 0 && <span className="badge badge-danger">{invalidCount} need fixing</span>}
              </div>
            </div>
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {parsedRows.map(({ rowNum, row, errors }) => (
                <div key={rowNum} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 16px',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
                    background: errors.length ? 'var(--danger-bg)' : 'var(--success-bg)',
                    color: errors.length ? 'var(--danger)' : 'var(--success)',
                  }}>
                    {errors.length ? <i className="ti ti-x" /> : <i className="ti ti-check" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>
                      Row {rowNum}: {row.surname || '(no surname)'} {row.firstName || ''} {row.otherNames || ''}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                      {row.matricNo || '—'} · {row.classSet || '—'} · {row.sex || '—'} · {row.dob || '—'}
                    </div>
                    {errors.length > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700, marginTop: 2 }}>
                        {errors.join(' · ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importing || validCount === 0}
              >
                {importing
                  ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Importing…</>
                  : <><i className="ti ti-device-floppy" /> Import {validCount} valid patient{validCount === 1 ? '' : 's'}</>}
              </button>
            </div>
          </div>
        )}

        {importResults && (
          <div className="card">
            <div className="card-header">
              <div className="card-title"><i className="ti ti-circle-check" /> Import complete</div>
              <button className="btn btn-sm" onClick={handleDownloadResults}>
                <i className="ti ti-download" /> Download results (EMR numbers)
              </button>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>{importResults.succeeded.length}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700 }}>Imported</div>
                </div>
                {importResults.failed.length > 0 && (
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--danger)' }}>{importResults.failed.length}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700 }}>Failed</div>
                  </div>
                )}
              </div>
              {importResults.failed.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {importResults.failed.map(f => (
                    <div key={f.rowNum} style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 4 }}>
                      Row {f.rowNum} ({f.name || 'unnamed'}): {f.reason}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => navigate('/admin/patients')}>
                  <i className="ti ti-users" /> View all patients
                </button>
                <button className="btn" onClick={reset}>
                  <i className="ti ti-refresh" /> Import another file
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
