// src/components/patients/AIDrugInsightPanel.jsx
//
// Shared by both the Doctor's Consultation Note and Nursing Report screens.
// Intentionally role-agnostic: in NACON MRS, nurses and doctors perform the
// same clinical function, so this panel is not gated by `isDoctor`.

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { suggestDrugsForNote } from '../../lib/geminiInsights';
import { lookupMedIndexDrug } from '../../lib/medIndex';
import { parseAllergyList, flagAllergicRows } from '../../lib/allergyGuard';

const SECTION_META = {
  'DIAGNOSIS':          { label: 'Diagnosis',          color: 'var(--accent)',  bg: 'var(--accent-bg)'  },
  'MAIN THERAPY':       { label: 'Main Therapy',        color: 'var(--success)', bg: 'var(--success-bg)' },
  'ADJUNCT THERAPY':    { label: 'Adjunct Therapy',     color: 'var(--info, #0369a1)', bg: 'var(--card-bg2)' },
  'COMBINATION THERAPY':{ label: 'Combination Therapy', color: '#7c3aed',        bg: '#f3e8ff' },
  'RED FLAGS':          { label: 'Red Flags',           color: 'var(--danger)', bg: 'var(--danger-bg)'  },
  'SAFETY NOTE':        { label: 'Safety Note',         color: 'var(--warn, #b45309)', bg: 'var(--warn-bg)' },
};

// Splits the AI response into { header, bodyLines[] } chunks based on the
// "### HEADER" markers the prompt requires. Anything before the first
// recognized header is dropped (shouldn't happen if the model follows
// instructions, but keeps rendering safe if it doesn't).
function splitIntoSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = line.trim().match(/^#{1,3}\s*(DIAGNOSIS|MAIN THERAPY|ADJUNCT THERAPY|COMBINATION THERAPY|RED FLAGS|SAFETY NOTE)\s*$/i);
    if (m) {
      current = { header: m[1].toUpperCase(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}

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
  'every other day', 'at bedtime', 'as needed', 'stat', 'once off',
];

// Extracts drug rows from a block of lines, tagged with which clinical
// category they came from (main / adjunct / combination) so the UI and the
// confirmed prescription can preserve that distinction instead of flattening
// everything into one undifferentiated list.
function extractDrugRows(lines, category) {
  const rows = [];
  lines.forEach(line => {
    const m = line.trim().match(/^[*-]\s+\*\*([^*]+)\*\*\s*(.*)$/);
    if (!m) return;
    const name = m[1].trim().replace(/:$/, '');
    if (!name) return;

    // Dosing info is everything before the first explanatory parenthesis.
    const dosingText = m[2].split('(')[0].replace(/\.\s*$/, '').trim();

    const doseMatch = dosingText.match(/\d+(?:\.\d+)?\s?(mg|g|mcg|µg|ml|l|units?|iu)\b/i);
    const dose = doseMatch ? doseMatch[0].replace(/\s+/, ' ').trim() : '';

    // Standard course durations ("for 4 weeks") and fluid infusion spans
    // ("over 8 hours") use different prepositions/units, so both are
    // matched — otherwise every IV fluid order (dextrose saline, normal
    // saline, etc.) comes through with a blank duration column.
    const durationMatch =
      dosingText.match(/\bfor\s+(\d+(?:\s*[-–]\s*\d+)?\s*(days|day|weeks|week|months|month|hours|hour))/i) ||
      dosingText.match(/\bover\s+(\d+(?:\s*[-–]\s*\d+)?\s*(hours|hour|minutes|minute|days|day))/i);
    const duration = durationMatch ? durationMatch[1].trim() : '';

    const lowerDosing = dosingText.toLowerCase();
    const freqPhrase = FREQUENCY_PHRASES.find(p => lowerDosing.includes(p));
    const frequency = freqPhrase || '';

    rows.push({ name, dose, frequency, duration, category });
  });
  return rows;
}

// Pulls drug rows out of every Main/Adjunct/Combination section found,
// deduping by name (keeps the first occurrence's category — Main wins over
// Adjunct/Combination if the same drug is listed in more than one section).
function extractAllDrugRows(sections) {
  const order = ['MAIN THERAPY', 'ADJUNCT THERAPY', 'COMBINATION THERAPY'];
  const seen = new Set();
  const rows = [];
  for (const header of order) {
    const section = sections.find(s => s.header === header);
    if (!section) continue;
    for (const row of extractDrugRows(section.lines, header)) {
      const key = row.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

export default function AIDrugInsightPanel({ noteText, patient, onConfirmDrugs }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [rows, setRows] = useState([]);          // extracted + allergy-flagged drug rows
  const [acknowledged, setAcknowledged] = useState({}); // rowKey -> bool, for overriding a flagged conflict
  const [selected, setSelected] = useState({});  // rowKey -> bool, which drugs go into this patient's course chart

  const allergyList = parseAllergyList(patient?.allergies);
  const hasAllergyHistory = allergyList.length > 0;

  const rowKey = r => `${r.category}::${r.name.toLowerCase()}`;

  const handleSuggest = async () => {
    if (!noteText || !noteText.trim()) {
      toast.error('Write the consultation note first');
      return;
    }
    setLoading(true);
    setOpen(true);
    setConfirmed(false);
    setRows([]);
    setAcknowledged({});
    setSelected({});
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

      // Extract drug rows from Main/Adjunct/Combination sections, enrich with
      // MedIndex class where possible, then run the independent client-side
      // allergy check — never rely on the prompt instruction alone to have
      // been honored.
      const sections = splitIntoSections(text);
      const extracted = extractAllDrugRows(sections);
      const enriched = await Promise.all(
        extracted.map(async row => {
          const match = await lookupMedIndexDrug(row.name).catch(() => null);
          return match ? { ...row, medIndexVerified: true, medIndexClass: match.drug_class || '' } : row;
        })
      );
      const flagged = flagAllergicRows(enriched, patient?.allergies);
      setRows(flagged);

      // Nothing is auto-prescribed — but pre-check a sensible starting
      // point: the top-ranked Main Therapy option (first listed, not
      // allergy-conflicted), plus every Combination Therapy row if one was
      // suggested. Combination Therapy is the standard-of-care *package*
      // for the diagnosis (e.g. all components of an ACT, or all legs of
      // triple therapy) rather than a menu of interchangeable
      // alternatives, so selecting only the first line there would hand
      // back an incomplete regimen. Adjunct stays fully opt-in —
      // symptomatic add-ons genuinely depend on what this patient is
      // presenting with (fever, pain, etc.) and shouldn't be assumed.
      const topMain = flagged.find(r => r.category === 'MAIN THERAPY' && !r.allergyConflict);
      const combinationRows = flagged.filter(r => r.category === 'COMBINATION THERAPY' && !r.allergyConflict);
      const defaults = {};
      if (topMain) defaults[rowKey(topMain)] = true;
      combinationRows.forEach(r => { defaults[rowKey(r)] = true; });
      setSelected(defaults);

      if (flagged.some(r => r.allergyConflict)) {
        toast.error('AI suggested a drug that conflicts with a recorded allergy — review flagged item(s) before confirming', { duration: 6000 });
      }
    } catch (e) {
      console.error('AI drug insight', e);
      toast.error(e?.message || 'AI suggestion failed');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    const chosen = rows.filter(r => selected[rowKey(r)]);
    if (!chosen.length) {
      toast.error('Select at least one drug for "Give This" first');
      return;
    }
    const unresolved = chosen.filter(r => r.allergyConflict && !acknowledged[r.name.toLowerCase()]);
    if (unresolved.length) {
      toast.error(`Acknowledge the allergy conflict on ${unresolved.map(r => r.name).join(', ')} before confirming`);
      return;
    }
    onConfirmDrugs?.(chosen);
    setConfirmed(true);
    const verifiedCount = chosen.filter(r => r.medIndexVerified).length;
    toast.success(
      `${chosen.length} drug${chosen.length > 1 ? 's' : ''} added to prescription` +
      (verifiedCount ? ` (${verifiedCount} matched to MedIndex)` : '') +
      ' — review and save'
    );
  };

  const sections = result ? splitIntoSections(result) : [];
  const rowsByCategory = {
    'MAIN THERAPY': rows.filter(r => r.category === 'MAIN THERAPY'),
    'ADJUNCT THERAPY': rows.filter(r => r.category === 'ADJUNCT THERAPY'),
    'COMBINATION THERAPY': rows.filter(r => r.category === 'COMBINATION THERAPY'),
  };
  const chosenRows = rows.filter(r => selected[rowKey(r)]);

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

      {/* Persistent allergy banner — shown whenever the panel is open, not
          buried in the AI response, so it's visible right next to whatever
          the model suggests. */}
      {open && (
        <div style={{
          margin: '0 16px', marginTop: 12, padding: '9px 12px', borderRadius: 8,
          background: hasAllergyHistory ? 'var(--danger-bg)' : 'var(--warn-bg)',
          color: hasAllergyHistory ? 'var(--danger)' : 'var(--warn, #b45309)',
          fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className={`ti ${hasAllergyHistory ? 'ti-alert-hexagon' : 'ti-help-hexagon'}`} style={{ fontSize: 15 }} />
          {hasAllergyHistory
            ? `Documented allergies: ${allergyList.join(', ')}`
            : 'No allergy history recorded — not confirmed "none", confirm with patient before prescribing.'}
        </div>
      )}

      {open && (
        <div className="card-body">
          {loading && (
            <div style={{ color: 'var(--t3)', fontSize: 13 }}>
              Analysing note against patient context…
            </div>
          )}
          {!loading && result && (
            <>
              {sections.length > 0 ? (
                sections.map((s, i) => {
                  const meta = SECTION_META[s.header] || { label: s.header, color: 'var(--t2)', bg: 'var(--card-bg2)' };
                  const bodyText = s.lines.join('\n').trim();
                  if (!bodyText) return null; // omitted section (e.g. no adjunct/combination needed)
                  const categoryRows = rowsByCategory[s.header];
                  return (
                    <div key={i} style={{ marginBottom: 14 }}>
                      <div style={{
                        display: 'inline-block', fontSize: 10.5, fontWeight: 700,
                        padding: '2px 9px', borderRadius: 10, marginBottom: 6,
                        background: meta.bg, color: meta.color,
                      }}>
                        {meta.label}
                      </div>
                      <div style={{ whiteSpace: 'pre-line', fontSize: 13.5, lineHeight: 1.5, color: 'var(--t2)' }}>
                        {renderFormattedText(bodyText)}
                      </div>
                      {categoryRows?.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--t3)' }}>
                            Select for "Give This":
                          </div>
                          {categoryRows.map(r => {
                            const key = rowKey(r);
                            const isConflict = r.allergyConflict;
                            return (
                              <label key={key} style={{
                                display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12,
                                fontWeight: isConflict ? 700 : 500,
                                color: isConflict ? 'var(--danger)' : 'var(--t2)', cursor: 'pointer',
                              }}>
                                <input
                                  type="checkbox"
                                  style={{ marginTop: 2 }}
                                  checked={!!selected[key]}
                                  onChange={e => setSelected(s => ({ ...s, [key]: e.target.checked }))}
                                />
                                <span>
                                  {r.name}
                                  {(r.dose || r.frequency || r.duration) && (
                                    <span style={{ color: 'var(--t3)', fontWeight: 400 }}>
                                      {' — '}{[r.dose, r.frequency, r.duration && `for ${r.duration}`].filter(Boolean).join(', ')}
                                    </span>
                                  )}
                                  {isConflict && (
                                    <>
                                      {' '}
                                      <i className="ti ti-alert-triangle" /> conflicts with a recorded allergy
                                    </>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                          {categoryRows.some(r => r.allergyConflict) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                              {categoryRows.filter(r => r.allergyConflict).map(r => (
                                <label key={r.name} style={{
                                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
                                  fontWeight: 700, color: 'var(--danger)', cursor: 'pointer',
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={!!acknowledged[r.name.toLowerCase()]}
                                    onChange={e => setAcknowledged(a => ({ ...a, [r.name.toLowerCase()]: e.target.checked }))}
                                  />
                                  <i className="ti ti-alert-hexagon" /> I acknowledge the {r.name} allergy conflict and want to override
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                // Fallback if the model didn't follow the section format —
                // still show the raw text rather than nothing.
                <div style={{ whiteSpace: 'pre-line', fontSize: 13.5, lineHeight: 1.5, color: 'var(--t2)' }}>
                  {renderFormattedText(result)}
                </div>
              )}

              {/* "Give This" — the actual combined treatment plan for THIS
                  patient, built only from whatever the clinician has ticked
                  above. Distinct from the therapy lists, which show every
                  clinically valid option, not just what's prescribed. */}
              {rows.length > 0 && (
                <div style={{ marginTop: 4, marginBottom: 14 }}>
                  <div style={{
                    display: 'inline-block', fontSize: 10.5, fontWeight: 700,
                    padding: '2px 9px', borderRadius: 10, marginBottom: 8,
                    background: 'var(--card-bg2)', color: 'var(--t1)', border: '1px solid var(--border)',
                  }}>
                    <i className="ti ti-table" /> Give This
                  </div>
                  {chosenRows.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                      Nothing selected yet — tick drugs above to build "Give This".
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '5px 8px 5px 0', color: 'var(--t3)', fontWeight: 700 }}>Drug</th>
                            <th style={{ padding: '5px 8px', color: 'var(--t3)', fontWeight: 700 }}>Dose</th>
                            <th style={{ padding: '5px 8px', color: 'var(--t3)', fontWeight: 700 }}>Frequency</th>
                            <th style={{ padding: '5px 8px', color: 'var(--t3)', fontWeight: 700 }}>Duration</th>
                            <th style={{ padding: '5px 0 5px 8px', color: 'var(--t3)', fontWeight: 700 }}>Role</th>
                          </tr>
                        </thead>
                        <tbody>
                          {chosenRows.map(r => (
                            <tr key={rowKey(r)} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 8px 6px 0', fontWeight: 700, color: r.allergyConflict ? 'var(--danger)' : 'var(--t1)' }}>
                                {r.name}
                                {r.allergyConflict && <i className="ti ti-alert-triangle" style={{ marginLeft: 4 }} />}
                              </td>
                              <td style={{ padding: '6px 8px', color: 'var(--t2)' }}>{r.dose || '—'}</td>
                              <td style={{ padding: '6px 8px', color: 'var(--t2)' }}>{r.frequency || '—'}</td>
                              <td style={{ padding: '6px 8px', color: 'var(--t2)' }}>{r.duration || '—'}</td>
                              <td style={{ padding: '6px 0 6px 8px', color: 'var(--t3)' }}>
                                {SECTION_META[r.category]?.label || r.category}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warn, #b45309)' }}>
                <i className="ti ti-alert-triangle" /> AI suggestion only — not a
                prescription. Confirm against allergy history, dosage, and local
                protocol before prescribing.
              </div>
              <button
                className="btn btn-primary btn-sm mt-2"
                onClick={handleConfirm}
                disabled={confirmed || !chosenRows.length}
              >
                {confirmed ? (
                  <><i className="ti ti-circle-check" /> Added to prescription</>
                ) : (
                  <><i className="ti ti-check" /> Confirm — Give This ({chosenRows.length} drug{chosenRows.length === 1 ? '' : 's'})</>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
