// src/pages/ReportBarcodePage.jsx
// Admin / Records: generate + print the "Report Sick" barcode.
// Students scan it with their own phone → opens /report-sick?via=barcode (complaint form).
import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';

export default function ReportBarcodePage() {
  const url = `${window.location.origin}/report-sick?via=barcode`;
  const [type, setType] = useState('code128');   // 'code128' | 'qr'
  const [qrSrc, setQrSrc] = useState('');
  const svgRef = useRef(null);

  useEffect(() => {
    if (type === 'code128' && svgRef.current) {
      try {
        JsBarcode(svgRef.current, url, {
          format: 'CODE128', width: 2, height: 110, displayValue: false, margin: 10,
        });
      } catch (e) { toast.error('Could not generate barcode'); }
    }
    if (type === 'qr') {
      QRCode.toDataURL(url, { margin: 2, width: 420, errorCorrectionLevel: 'M' })
        .then(setQrSrc).catch(() => toast.error('Could not generate code'));
    }
  }, [type, url]);

  const printPoster = () => {
    const code = type === 'code128'
      ? svgRef.current.outerHTML.replace('<svg', '<svg style="width:90%;height:auto"')
      : `<img src="${qrSrc}" style="width:70%;max-width:420px"/>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Allow pop-ups to print'); return; }
    w.document.write(`<!doctype html><html><head><title>Report Sick</title>
<style>
  body{font-family:Arial,sans-serif;text-align:center;margin:0;padding:40px 24px}
  h1{font-size:44px;margin:0 0 6px} h2{font-size:22px;font-weight:600;margin:0 0 36px;color:#444}
  .box{border:4px solid #000;border-radius:16px;padding:28px;display:inline-block;width:80%}
  p{font-size:20px;margin:24px 0 0} small{display:block;margin-top:18px;font-size:13px;color:#555;word-break:break-all}
</style></head><body>
  <h1>🏥 NACON CLINIC</h1><h2>Feeling unwell? Report sick</h2>
  <div class="box">${code}</div>
  <p><b>Scan this code with your phone</b><br/>then fill in your matric number and complaint.</p>
  <small>${url}</small>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`);
    w.document.close();
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
    catch { toast.error('Copy failed'); }
  };

  const pill = (v, label) => (
    <button key={v} onClick={() => setType(v)} className={type === v ? 'btn btn-primary' : 'btn'}
      style={{ flex: 1 }}>{label}</button>
  );

  return (
    <div className="page-content" style={{ maxWidth: 520, margin: '0 auto' }}>
      <div className="card" style={{ padding: 20, textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Report-Sick Barcode</div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16 }}>
          Print and post it. Students scan it and fill their complaint. Reports are tagged “Barcode”.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {pill('code128', 'Barcode (Code 128)')}
          {pill('qr', '2D code (any phone camera)')}
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid var(--border)' }}>
          {type === 'code128'
            ? <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} />
            : qrSrc && <img src={qrSrc} alt="Report sick code" style={{ width: '70%', maxWidth: 300 }} />}
        </div>

        <div style={{ fontSize: 11, color: 'var(--t3)', margin: '12px 0', wordBreak: 'break-all' }}>{url}</div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={printPoster}>
            <i className="ti ti-printer" /> Print poster
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={copy}>Copy link</button>
        </div>
      </div>
    </div>
  );
}
