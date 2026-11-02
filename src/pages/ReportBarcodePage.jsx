// src/pages/ReportBarcodePage.jsx
// Admin / Records: print the "Report Sick" code (2D barcode — any phone camera scans it).
// Students scan → opens /report-sick?via=barcode (complaint form only, no login).
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { backfillMatricIndex } from '../lib/emr';

export default function ReportBarcodePage() {
  const url = `${window.location.origin}/report-sick?via=barcode`;
  const isLocal = /^(localhost|127\.|192\.168\.|10\.)/.test(window.location.hostname);
  const [qrSrc, setQrSrc] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 2, width: 640, errorCorrectionLevel: 'M' })
      .then(setQrSrc).catch(() => toast.error('Could not generate code'));
  }, [url]);

  const printPoster = () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Allow pop-ups to print'); return; }
    w.document.write(`<!doctype html><html><head><title>Report Sick</title>
<style>
  body{font-family:Arial,sans-serif;text-align:center;margin:0;padding:40px 24px}
  h1{font-size:44px;margin:0 0 6px} h2{font-size:22px;font-weight:600;margin:0 0 36px;color:#444}
  .box{border:4px solid #000;border-radius:16px;padding:28px;display:inline-block;width:70%}
  img{width:100%}
  p{font-size:20px;margin:24px 0 0} small{display:block;margin-top:18px;font-size:13px;color:#555;word-break:break-all}
</style></head><body>
  <h1>🏥 NACON CLINIC</h1><h2>Feeling unwell? Report sick</h2>
  <div class="box"><img src="${qrSrc}"/></div>
  <p><b>Open your phone camera and point it at this code</b><br/>then enter your matric number. New students register first, then can report sick.</p>
  <small>${url}</small>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`);
    w.document.close();
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
    catch { toast.error('Copy failed'); }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const n = await backfillMatricIndex();
      toast.success(`Student lookup synced (${n} students)`);
    } catch (e) { toast.error('Sync failed: ' + (e.message || e)); }
    setSyncing(false);
  };

  return (
    <div className="page-content" style={{ maxWidth: 520, margin: '0 auto' }}>
      <div className="card" style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Report-Sick Barcode</div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16 }}>
          Print and post it. Students scan it with their phone camera. Unregistered students register themselves first, then can report sick.
          Reports are tagged “Barcode”.
        </div>

        {isLocal && (
          <div style={{ background:'#fef3c7', color:'#92400e', borderRadius:8, padding:'8px 10px',
            fontSize:12, fontWeight:700, marginBottom:12 }}>
            ⚠ You’re on a local address. Open this page on the live site before printing.
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid var(--border)' }}>
          {qrSrc && <img src={qrSrc} alt="Report sick code" style={{ width: '70%', maxWidth: 300 }} />}
        </div>

        <div style={{ fontSize: 11, color: 'var(--t3)', margin: '12px 0', wordBreak: 'break-all' }}>{url}</div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={printPoster}>
            <i className="ti ti-printer" /> Print poster
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={copy}>Copy link</button>
        </div>

        <div style={{ borderTop:'1px solid var(--border)', marginTop:16, paddingTop:14 }}>
          <div style={{ fontSize:12, color:'var(--t3)', marginBottom:8 }}>
            Run once after deploying, so existing students can be found by matric number.
            New and edited patients sync automatically.
          </div>
          <button className="btn" onClick={sync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync student lookup'}
          </button>
        </div>
      </div>
    </div>
  );
}
