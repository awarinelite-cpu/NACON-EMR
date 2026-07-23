// src/components/shared/NoteTextRenderer.jsx
//
// Renders saved note text (doctor/nursing reports, etc). Plain-language notes
// render as before, but any block of pasted tabular data — e.g. lab results
// copied from a spreadsheet (tab-separated) or a printed report ("Test | Result
// | Unit | Range") — is detected and rendered as a proper HTML <table> instead
// of losing its column alignment under white-space handling.
import React from 'react';

function splitRow(line, delimiterName) {
  let cells;
  if (delimiterName === 'tab') cells = line.split('\t');
  else if (delimiterName === 'pipe') cells = line.split('|');
  else cells = line.split(/\s{2,}/); // 2+ spaces = column gap

  return cells
    .map(c => c.trim())
    .filter((c, i, arr) => {
      // drop empty edge cells created by leading/trailing pipes, e.g. "| a | b |"
      if (c !== '') return true;
      return !(i === 0 || i === arr.length - 1);
    });
}

// A chunk (run of consecutive non-blank lines) is tabular if EVERY line in it
// contains the same delimiter, and the resulting column counts are consistent.
function detectDelimiter(chunkLines) {
  const candidates = ['tab', 'pipe', 'space'];

  for (const name of candidates) {
    const test =
      name === 'tab' ? (l) => l.includes('\t') :
      name === 'pipe' ? (l) => l.includes('|') :
      (l) => /\s{2,}/.test(l);

    if (!chunkLines.every(test)) continue;

    const colCounts = chunkLines.map(l => splitRow(l, name).length);
    const maxCols = Math.max(...colCounts);
    const minCols = Math.min(...colCounts);

    // Needs at least 2 columns, and column counts shouldn't vary wildly
    if (maxCols >= 2 && maxCols - minCols <= 1) {
      return { name, colCount: maxCols };
    }
  }
  return null;
}

// Breaks the full note text into alternating text / table blocks.
function parseBlocks(text) {
  const rawLines = text.split('\n');
  const blocks = [];
  let i = 0;

  while (i < rawLines.length) {
    // collect a run of consecutive non-blank lines
    let j = i;
    while (j < rawLines.length && rawLines[j].trim() !== '') j++;
    const chunk = rawLines.slice(i, j);

    if (chunk.length >= 2) {
      const delim = detectDelimiter(chunk);
      if (delim) {
        const rows = chunk.map(l => {
          const cells = splitRow(l, delim.name);
          while (cells.length < delim.colCount) cells.push('');
          return cells.slice(0, delim.colCount);
        });
        blocks.push({ type: 'table', rows });
      } else {
        blocks.push({ type: 'text', content: chunk.join('\n') });
      }
    } else if (chunk.length === 1) {
      blocks.push({ type: 'text', content: chunk[0] });
    }

    // skip the blank line(s) that separated this chunk from the next
    let k = j;
    while (k < rawLines.length && rawLines[k].trim() === '') k++;
    i = k;
  }

  return blocks;
}

export default function NoteTextRenderer({ text }) {
  if (!text) return null;

  const blocks = parseBlocks(String(text));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {blocks.map((b, idx) => {
        if (b.type === 'table') {
          const [header, ...body] = b.rows;
          return (
            <div key={idx} className="mar-table-scroll">
              <table className="data-table" style={{ minWidth: 260 }}>
                <thead>
                  <tr>
                    {header.map((h, ci) => (
                      <th key={ci}>{h || `Col ${ci + 1}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <div key={idx} style={{ whiteSpace: 'pre-line' }}>
            {b.content}
          </div>
        );
      })}
    </div>
  );
}
