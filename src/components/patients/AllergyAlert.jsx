// src/components/patients/AllergyAlert.jsx
// Blocking modal shown when a prescribed drug matches a known patient allergy
import React from 'react';

// Common drug cross-reactivity groups used for fuzzy matching
const CROSS_REACT = [
  ['penicillin','amoxicillin','ampicillin','augmentin','co-amoxiclav','flucloxacillin','oxacillin','piperacillin','cloxacillin'],
  ['sulpha','sulfonamide','cotrimoxazole','trimethoprim','sulfamethoxazole','bactrim','septrin'],
  ['aspirin','nsaid','ibuprofen','diclofenac','naproxen','indomethacin','piroxicam','celecoxib','meloxicam','mefenamic'],
  ['codeine','morphine','opioid','tramadol','pethidine','fentanyl','nalbuphine'],
  ['cephalosporin','ceftriaxone','cefuroxime','cefalexin','cefixime','ceftazidime'],
  ['tetracycline','doxycycline','minocycline'],
  ['quinolone','ciprofloxacin','ofloxacin','levofloxacin','norfloxacin'],
  ['erythromycin','azithromycin','clarithromycin','macrolide'],
  ['metronidazole','flagyl','tinidazole'],
];

// Returns list of allergy matches: [{ allergy, drug, crossReact }]
export function checkAllergyConflicts(allergyString, drugs) {
  if (!allergyString?.trim()) return [];
  const allergyRaw = allergyString.toLowerCase();
  const allergyTerms = allergyRaw.split(/[,;\/\s]+/).filter(Boolean);
  const conflicts = [];

  drugs.forEach(({ drug }) => {
    if (!drug?.trim()) return;
    const drugLow = drug.toLowerCase();

    allergyTerms.forEach(allergyTerm => {
      // Direct name match
      if (drugLow.includes(allergyTerm) || allergyTerm.includes(drugLow.split(' ')[0])) {
        if (!conflicts.find(c => c.drug === drug && c.allergy === allergyTerm)) {
          conflicts.push({ allergy: allergyTerm, drug, crossReact: false });
        }
        return;
      }
      // Cross-reactivity group check
      const group = CROSS_REACT.find(g => g.some(t => allergyTerm.includes(t) || t.includes(allergyTerm)));
      if (group) {
        const drugMatchesGroup = group.some(t => drugLow.includes(t) || t.includes(drugLow.split(' ')[0]));
        if (drugMatchesGroup && !conflicts.find(c => c.drug === drug)) {
          conflicts.push({ allergy: allergyTerm, drug, crossReact: true });
        }
      }
    });
  });

  return conflicts;
}

// Same checks as checkAllergyConflicts() above, but for the official NHIS/NACON
// Rx form, whose medication field (`rx`) is one free-text blob rather than a
// structured drug list (it's auto-filled from prescription history for printing).
export function checkAllergyConflictsInText(allergyString, text) {
  if (!allergyString?.trim() || !text?.trim()) return [];
  const allergyTerms = allergyString.toLowerCase().split(/[,;\/\s]+/).filter(Boolean);
  const textLow = text.toLowerCase();
  const conflicts = [];

  allergyTerms.forEach(allergyTerm => {
    if (textLow.includes(allergyTerm)) {
      if (!conflicts.find(c => c.allergy === allergyTerm)) {
        conflicts.push({ allergy: allergyTerm, drug: allergyTerm, crossReact: false });
      }
      return;
    }
    const group = CROSS_REACT.find(g => g.some(t => allergyTerm.includes(t) || t.includes(allergyTerm)));
    if (group) {
      const hit = group.find(t => textLow.includes(t));
      if (hit && !conflicts.find(c => c.allergy === allergyTerm)) {
        conflicts.push({ allergy: allergyTerm, drug: hit, crossReact: true });
      }
    }
  });

  return conflicts;
}

export default function AllergyAlert({ conflicts, allergyString, onOverride, onCancel }) {
  if (!conflicts?.length) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--card-bg)',
        borderRadius: 16,
        maxWidth: 480,
        width: '100%',
        border: '2px solid #ef4444',
        overflow: 'hidden',
        animation: 'slideUp .2s ease',
      }}>
        {/* Header */}
        <div style={{
          background: '#fef2f2',
          borderBottom: '1px solid #fca5a5',
          padding: '16px 20px',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: '#ef4444',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 22, color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#991b1b' }}>
              ⚠ Allergy Alert
            </div>
            <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 2, fontWeight: 600 }}>
              This prescription contains drug(s) that conflict with the patient's known allergies.
            </div>
          </div>
        </div>

        {/* Conflicts list */}
        <div style={{ padding: '14px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: 8 }}>
            Conflicts detected
          </div>
          {conflicts.map((c, i) => (
            <div key={i} style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 8,
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <i className="ti ti-pill-off" style={{ fontSize: 16, color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#991b1b' }}>{c.drug}</div>
                <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>
                  {c.crossReact
                    ? <>Cross-reactive with patient's allergy to <strong>{c.allergy.toUpperCase()}</strong></>
                    : <>Patient is allergic to <strong>{c.allergy.toUpperCase()}</strong></>
                  }
                  {c.crossReact && (
                    <span style={{
                      marginLeft: 6, background: '#fde68a', color: '#92400e',
                      fontSize: 9, fontWeight: 700, padding: '1px 6px',
                      borderRadius: 4,
                    }}>CROSS-REACTIVE</span>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div style={{
            background: 'var(--card-bg2)', borderRadius: 8, padding: '10px 12px',
            fontSize: 11, color: 'var(--t2)', marginTop: 4, lineHeight: 1.5,
          }}>
            <strong>Recorded allergies:</strong> {allergyString}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{
          padding: '12px 20px 18px',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--card-bg2)', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, color: 'var(--t1)',
            }}>
            <i className="ti ti-arrow-left" style={{ marginRight: 4 }} />
            Edit prescription
          </button>
          <button
            onClick={onOverride}
            style={{
              padding: '9px 16px', borderRadius: 8, border: 'none',
              background: '#ef4444', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, color: '#fff',
            }}>
            <i className="ti ti-alert-triangle" style={{ marginRight: 4 }} />
            Override & save anyway
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  );
}
