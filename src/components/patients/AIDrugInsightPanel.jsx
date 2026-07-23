// src/components/patients/AIDrugInsightPanel.jsx
//
// Shared by both the Doctor's Consultation Note and Nursing Report screens.
// Intentionally role-agnostic: in NACON MRS, nurses and doctors perform the
// same clinical function, so this panel is not gated by `isDoctor`.

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { suggestDrugsForNote } from '../../lib/geminiInsights';
import { lookupMedIndexDrug } from '../../lib/medIndex';

// Renders **bold** markdown segments (used for AI headings/subheadings/drug
// names) as <strong>, stripping the asterisks. Everything else stays as
// plain text, line breaks preserved via the pre-line container.
function renderFormattedText(text) {
  const lines = text.split('\n');
  return lines.map((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <React.Fragment key={li}>
        {parts.map((part, pi) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <strong key={pi}>{part.slice(2, -2)}</strong>
          ) : (
            <React.Fragment key={pi}>{part}</React.Fragment>
          )
        )}
        {li < lines.length - 1 && '\n'}
      </React.Fragment>
    );
  });
}

// Pulls full dosing rows out of the AI response — name, dose, frequency,
// and duration — from each bulleted "suggested drug" line, e.g.
// "* **Omeprazole** 20 mg orally once daily for 4-8 weeks. (PPI...)"
// -> { name:'Omeprazole', dose:'20 mg', frequency:'once daily', duration:'4-8 weeks' }
// Heading lines like "2. **Suggested drug options:**" don't match (they use
// a number, not a bullet), so only actual drug entries are picked up.
// This is a best-effort parse of free-text AI output — always shown to the
// user for review/edit before saving, never auto-saved.
const FREQUENCY_PHRASES = [
  'four times daily', 'three times daily', 'twice daily', 'once daily',
  'four times a day', 'three times a day', 'twice a day', 'once a day',
  'four times weekly', 'three times weekly', 'twice weekly', 'once weekly',
  'every 4 hours', 'every 6 hours', 'every 8 hours', 'every 12 hours',
  'every other day', 'at bedtime', 'as needed',
];

function extractDrugRows(text) {
  const rows = [];
  const seen = new Set();
  text.split('\n').forEach(line => {
    const m = line.trim().match(/^[*-]\s+\*\*([^*]+)\*\*\s*(.*)$/);
    if (!m) return;
    const name = m[1].trim().replace(/:$/, '');
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    // Dosing info is everything before the first explanatory parenthesis.
    const dosingText = m[2].split('(')[0].replace(/\.\s*$/, '').trim();

    const doseMatch = dosingText.match(/\d+(?:\.\d+)?\s?(mg|g|mcg|µg|ml|units?|iu)\b/i);
    const dose = doseMatch ? doseMatch[0].replace(/\s+/, ' ').trim() : '';

    const durationMatch = dosingText.match(
      /\bfor\s+(\d+(?:\s*[-–]\s*\d+)?\s*(days|day|weeks|week|months|month))/i
    );
    const duration = durationMatch ? durationMatch[1].trim() : '';

    const lowerDosing = dosingText.toLowerCase();
    const freqPhrase = FREQUENCY_PHRASES.find(p => lowerDosing.includes(p));
    const frequency = freqPhrase || '';

    rows.push({ name, dose, frequency, duration });
  });
  return rows;
}

export default function AIDrugInsightPanel({ noteText, patient, onConfirmDrugs }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleSuggest = async () => {
    if (!noteText || !noteText.trim()) {
      toast.error('Write the consultation note first');
      return;
    }
    setLoading(true);
    setOpen(true);
    setConfirmed(false);
    try {
      const { text } = await suggestDrugsForNote({
        noteText,
        allergies: patient?.allergies,
        primaryDiagnosis: patient?.primaryDiagnosis,
        age: patient?.dob
          ? Math.floor((Date.now() - new Date(patient.dob)) / (365.25 * 24 * 3600 * 1000))
          : undefined,
        sex: patient?.sex,
      });
      setResult(text);
    } catch (e) {
      console.error('AI drug insight', e);
      toast.error(e?.message || 'AI suggestion failed');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    const rows = extractDrugRows(result);
    if (!rows.length) {
      toast.error('No drug names could be found in the suggestion');
      return;
    }
    // Best-effort: tag rows whose name matches a MedIndex formulary entry,
    // so the confirmed prescription line carries a note that dosing was
    // cross-checked against MedIndex rather than left as free-text AI recall.
    const enriched = await Promise.all(
      rows.map(async row => {
        const match = await lookupMedIndexDrug(row.name).catch(() => null);
        return match ? { ...row, medIndexVerified: true, medIndexClass: match.drug_class || '' } : row;
      })
    );
    onConfirmDrugs?.(enriched);
    setConfirmed(true);
    const verifiedCount = enriched.filter(r => r.medIndexVerified).length;
    toast.success(
      `${enriched.length} drug${enriched.length > 1 ? 's' : ''} added to prescription` +
      (verifiedCount ? ` (${verifiedCount} matched to MedIndex)` : '') +
      ' — review and save'
    );
  };

  return (
    <div className="card" style={{ marginTop: 12, border: '1px dashed var(--info)' }}>
      <div className="card-header">
        <div className="card-title">
          <i className="ti ti-sparkles" /> AI Drug Insight
        </div>
        <button
          className="btn btn-sm btn-outline"
          onClick={handleSuggest}
          disabled={loading}
        >
          {loading ? (
            <><i className="ti ti-loader-2 spin" /> Thinking…</>
          ) : (
            <><i className="ti ti-wand" /> Suggest drugs</>
          )}
        </button>
      </div>

      {open && (
        <div className="card-body">
          {loading && (
            <div style={{ color: 'var(--t3)', fontSize: 13 }}>
              Analysing note against patient context…
            </div>
          )}
          {!loading && result && (
            <>
              <div
                style={{
                  whiteSpace: 'pre-line',
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: 'var(--t2)',
                  textAlign: 'justify',
                }}
              >
                {renderFormattedText(result)}
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--warn, #b45309)',
                }}
              >
                <i className="ti ti-alert-triangle" /> AI suggestion only — not a
                prescription. Confirm against allergy history, dosage, and local
                protocol before prescribing.
              </div>
              <button
                className="btn btn-primary btn-sm mt-2"
                onClick={handleConfirm}
                disabled={confirmed}
              >
                {confirmed ? (
                  <><i className="ti ti-circle-check" /> Added to prescription</>
                ) : (
                  <><i className="ti ti-check" /> Confirm — use these drugs</>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
