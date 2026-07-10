// src/components/patients/AIDrugInsightPanel.jsx
//
// Shared by both the Doctor's Consultation Note and Nursing Report screens.
// Intentionally role-agnostic: in NACON MRS, nurses and doctors perform the
// same clinical function, so this panel is not gated by `isDoctor`.

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { suggestDrugsForNote } from '../../lib/geminiInsights';

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

// Pulls drug names out of the AI response — specifically the bold text at
// the start of each bulleted "suggested drug" line, e.g.
// "* **Omeprazole** 20 mg orally..." -> "Omeprazole". Heading lines like
// "2. **Suggested drug options:**" don't match (they use a number, not a
// bullet), so only actual drug entries are picked up.
function extractDrugNames(text) {
  const names = [];
  const seen = new Set();
  text.split('\n').forEach(line => {
    const m = line.trim().match(/^[*-]\s+\*\*([^*]+)\*\*/);
    if (m) {
      const name = m[1].trim().replace(/:$/, '');
      const key = name.toLowerCase();
      if (name && !seen.has(key)) {
        seen.add(key);
        names.push(name);
      }
    }
  });
  return names;
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

  const handleConfirm = () => {
    const names = extractDrugNames(result);
    if (!names.length) {
      toast.error('No drug names could be found in the suggestion');
      return;
    }
    onConfirmDrugs?.(names);
    setConfirmed(true);
    toast.success(`${names.length} drug${names.length > 1 ? 's' : ''} added to prescription — review and save`);
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
