// src/components/lab/LabRangesEditor.jsx
// Pop-up where the lab changes the unit / normal range of any test.
// Saved changes become the new defaults for every future result entry.
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  LAB_CATALOGUE, analytesFor, overrideId, rangeText, parseRange,
} from '../../lib/labCatalogue';

const inputStyle = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '7px 8px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--main-bg)', color: 'var(--t1)',
  fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600,
};
const tiny = { fontSize: 9, fontWeight: 800, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: 2 };

const norm = (o) => JSON.stringify({
  unit: o.unit || '', all: o.all || null, m: o.m || null, f: o.f || null,
});

export default function LabRangesEditor({ overrides, onClose, onSave }) {
  // draft[id] = { unit, male, female }  (text, as typed)
  const [draft, setDraft] = useState(() => {
    const d = {};
    Object.keys(LAB_CATALOGUE).forEach(test => {
      analytesFor(test, overrides).forEach(a => {
        if (a.kind !== 'num') return;
        d[overrideId(test, a.name)] = {
          unit: a.unit || '', male: rangeText(a, 'male'), female: rangeText(a, 'female'),
        };
      });
    });
    return d;
  });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');

  const tests = useMemo(
    () => Object.keys(LAB_CATALOGUE).filter(t =>
      LAB_CATALOGUE[t].some(a => a.kind === 'num') &&
      (!filter || t.toLowerCase().includes(filter.toLowerCase()))),
    [filter],
  );

  const setField = (id, field, val) =>
    setDraft(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

  const save = async (resetAll = false) => {
    const next = {};
    if (!resetAll) {
      for (const test of Object.keys(LAB_CATALOGUE)) {
        for (const a of LAB_CATALOGUE[test]) {
          if (a.kind !== 'num') continue;
          const id = overrideId(test, a.name);
          const d = draft[id];
          const m = d.male.trim()   ? parseRange(d.male)   : null;
          const f = d.female.trim() ? parseRange(d.female) : null;
          if ((d.male.trim() && !m) || (d.female.trim() && !f)) {
            toast.error(`${a.name} (${test}): write the range like  130 - 179`);
            return;
          }
          const o = { unit: d.unit.trim() };
          if (m && f && m[0] === f[0] && m[1] === f[1]) o.all = m;
          else { if (m) o.m = m; if (f) o.f = f; }
          // only keep what differs from the built-in default
          if (norm(o) !== norm({ unit: a.unit, all: a.all, m: a.m, f: a.f })) next[id] = o;
        }
      }
    }
    setSaving(true);
    try {
      await onSave(next);
      toast.success(resetAll ? 'Ranges reset to defaults' : 'Ranges saved');
      onClose();
    } catch (e) {
      toast.error('Could not save: ' + e.message);
    }
    setSaving(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--main-bg)', width: '100%', maxWidth: 640, maxHeight: '92%',
        borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t1)' }}>Test units &amp; normal ranges</div>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>
              Used to pre-fill results and to set H / L automatically. Write ranges like <b>130 - 179</b>. Leave Female empty if it is the same as Male.
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: '6px 10px' }}><i className="ti ti-x" /></button>
        </div>

        <div style={{ padding: '10px 16px 0' }}>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find a test…" style={inputStyle} />
        </div>

        <div style={{ overflowY: 'auto', padding: '10px 16px 16px', flex: 1 }}>
          {tests.map(test => (
            <details key={test} style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card-bg)' }}>
              <summary style={{ padding: '10px 12px', fontSize: 13, fontWeight: 800, color: 'var(--t1)', cursor: 'pointer' }}>{test}</summary>
              <div style={{ padding: '0 12px 12px' }}>
                {LAB_CATALOGUE[test].filter(a => a.kind === 'num').map(a => {
                  const id = overrideId(test, a.name);
                  const d = draft[id];
                  return (
                    <div key={id} style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--t2)', marginBottom: 4 }}>{a.name}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,.8fr) minmax(0,1fr) minmax(0,1fr)', gap: 6 }}>
                        <div><div style={tiny}>Unit</div><input style={inputStyle} value={d.unit} onChange={e => setField(id, 'unit', e.target.value)} /></div>
                        <div><div style={tiny}>Male</div><input style={inputStyle} value={d.male} onChange={e => setField(id, 'male', e.target.value)} placeholder="lo - hi" /></div>
                        <div><div style={tiny}>Female</div><input style={inputStyle} value={d.female} onChange={e => setField(id, 'female', e.target.value)} placeholder="lo - hi" /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
          {tests.length === 0 && <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--t3)', padding: 20 }}>No matching test</div>}
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <button className="btn" disabled={saving} onClick={() => {
            if (window.confirm('Reset every unit and range back to the built-in defaults?')) save(true);
          }}>Reset all</button>
          <button disabled={saving} onClick={() => save(false)} style={{
            flex: 1, padding: '10px', background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font)', opacity: saving ? .6 : 1,
          }}>{saving ? 'Saving…' : 'Save ranges'}</button>
        </div>
      </div>
    </div>
  );
}
