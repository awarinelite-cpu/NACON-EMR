// src/components/shared/LabReportTable.jsx
import React from 'react';
import { isAbnormalFlag, flagLetter, abnormalComments } from '../../lib/labCatalogue';

/* Lab report laid out like the lab's own printed sheet:
   TEST NAME | Value | UNIT | NORMAL RANGE | TEST RESULT (H / L), abnormal rows in red,
   then the lab's comments underneath. Used in the patient timeline and the lab history. */
export default function LabReportTable({ result }) {
  const rows = Object.entries(result?.results || {});
  const ABN = '#e53935';
  const cell = (abn, extra = {}) => ({
    border: `1px solid ${abn ? ABN : 'var(--t1)'}`, padding:'3px 4px',
    color: abn ? ABN : 'var(--t1)', fontSize:13, fontWeight:500, lineHeight:1.25,
    verticalAlign:'middle', ...extra,
  });
  const head = { border:'1px solid var(--t1)', padding:'3px 4px', color:'var(--t1)',
    fontSize:12, fontWeight:800, textAlign:'center', lineHeight:1.25 };
  // system-written lines for the abnormal values first, then whatever the lab typed
  const comments = [
    ...abnormalComments(result?.results),
    ...String(result?.comments || '').split('\n').map(c => c.trim()).filter(Boolean),
  ];
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8, flexWrap:'wrap', marginBottom:10 }}>
        <div style={{ fontSize:22, fontWeight:500, color:'var(--t1)' }}>Lab Result</div>
        {result?.resultEnteredBy && (
          <div style={{ fontSize:12, color:'var(--t2)', textTransform:'uppercase' }}>LAB.{result.resultEnteredBy}</div>
        )}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize:13, color:'var(--t3)' }}>{(result?.tests || []).join(', ') || 'No result values recorded'}</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:2, border:'1px solid var(--t1)' }}>
            <thead>
              <tr>
                <th style={head}>TEST NAME</th>
                <th style={head}>Value</th>
                <th style={head}>UNIT</th>
                <th style={head}>NORMAL RANGE</th>
                <th style={head}>TEST RESULT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([test, r]) => {
                const abn = isAbnormalFlag(r.flag);
                return (
                  <tr key={test}>
                    <td style={cell(abn)}>{test}</td>
                    <td style={cell(abn)}>{r.value ?? ''}</td>
                    <td style={cell(abn)}>{r.unit || ''}</td>
                    <td style={cell(abn)}>{r.referenceRange || ''}</td>
                    <td style={cell(abn, { textAlign:'left' })}>{flagLetter(r.flag)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {comments.length > 0 && (
        <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:12 }}>
          {comments.map((c, i) => (
            <div key={i} style={{ fontSize:14, color:'var(--t1)', textTransform:'uppercase', overflowWrap:'anywhere' }}>{c}</div>
          ))}
        </div>
      )}
      <div style={{ marginTop:12, fontSize:11, color:'var(--t3)' }}>
        {result?.requestedBy && <>Requested by: <b style={{ color:'var(--t2)' }}>{result.requestedBy}</b></>}
        {result?.resultEnteredBy && <> · Entered by: <b style={{ color:'var(--t2)' }}>{result.resultEnteredBy}</b></>}
      </div>
    </div>
  );
}
