// src/components/patients/AIDrugInsightPanel.jsx
//
// Shared by both the Doctor's Consultation Note and Nursing Report screens.
// Intentionally role-agnostic: in NACON MRS, nurses and doctors perform the
// same clinical function, so this panel is not gated by `isDoctor`.

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { suggestDrugsForNote } from '../../lib/geminiInsights';

export default function AIDrugInsightPanel({ noteText, patient }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [open, setOpen] = useState(false);

  const handleSuggest = async () => {
    if (!noteText || !noteText.trim()) {
      toast.error('Write the consultation note first');
      return;
    }
    setLoading(true);
    setOpen(true);
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
                }}
              >
                {result}
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
