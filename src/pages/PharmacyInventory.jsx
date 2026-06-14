// src/pages/PharmacyInventory.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { listenInventory, addInventoryItem, updateInventoryItem } from '../lib/emr';
import toast from 'react-hot-toast';

const EMPTY_FORM = { name:'', category:'', quantity:'', unit:'tablets', reorderAt:'10', location:'', notes:'' };
const CATEGORIES = ['Analgesic','Antibiotic','Antimalaria','Antifungal','Antihistamine',
  'Vitamins/Supplements','Fluids/IV','Wound Care','Contraceptive','Other'];
const UNITS = ['tablets','capsules','sachets','bottles','vials','tubes','strips','mg','ml'];

const EMPTY_RX = {
  patientName: '', nhisId: '', address: '', age: '', sex: '',
  providerName: '', date: '', providerAddress: '', telFax: '',
  rx: '', prescriberName: '', signature: '',
  pharmacist: '', pharmacy: '', pharmacistNo: '', nhisRegNo: '',
  pcnRegNo: '', pharmacistSignature: '',
};

export default function PharmacyInventory() {
  const { profile }   = useAuth();
  const [items,       setItems]     = useState([]);
  const [search,      setSearch]    = useState('');
  const [showForm,    setShowForm]  = useState(false);
  const [editing,     setEditing]   = useState(null);
  const [form,        setForm]      = useState(EMPTY_FORM);
  const [saving,      setSaving]    = useState(false);
  const [filterLow,   setFilterLow] = useState(false);

  // NHIS Prescription Form state
  const [showRx,  setShowRx]  = useState(false);
  const [rx,      setRx]      = useState(EMPTY_RX);
  const rxPrintRef = useRef(null);

  useEffect(() => {
    const unsub = listenInventory(setItems);
    return unsub;
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setR = (k, v) => setRx(r => ({ ...r, [k]: v }));

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({ ...EMPTY_FORM, ...item, quantity: String(item.quantity), reorderAt: String(item.reorderAt) });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.quantity) { toast.error('Name and quantity are required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateInventoryItem(editing.id, {
          ...form, quantity: Number(form.quantity), reorderAt: Number(form.reorderAt),
        }, profile.displayName);
        toast.success('Item updated');
      } else {
        await addInventoryItem(form, profile.displayName);
        toast.success('Item added to inventory');
      }
      setShowForm(false);
    } catch (e) { toast.error('Failed to save'); }
    setSaving(false);
  };

  const handlePrintRx = () => {
    const el = rxPrintRef.current;
    if (!el) return;
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>NHIS Prescription Form</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Times New Roman', Times, serif;
            background: #fff;
            color: #000;
            padding: 24px;
          }
          .nhis-form {
            width: 680px;
            margin: 0 auto;
            border: 2px solid #000;
            padding: 16px 20px 20px;
          }
          .nhis-title {
            text-align: center;
            font-size: 16px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 4px;
          }
          .nhis-subtitle {
            text-align: center;
            font-size: 13px;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 14px;
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
          }
          .section-label {
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 6px;
            margin-top: 12px;
          }
          .field-row {
            display: flex;
            gap: 12px;
            margin-bottom: 8px;
            align-items: flex-end;
          }
          .field-block {
            flex: 1;
          }
          .field-label {
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
            display: block;
            margin-bottom: 2px;
          }
          .field-value {
            border-bottom: 1px solid #000;
            min-height: 18px;
            font-size: 12px;
            padding: 0 2px;
            display: block;
            width: 100%;
          }
          .rx-box {
            border: 1px solid #000;
            padding: 8px;
            min-height: 80px;
            font-size: 12px;
            margin: 6px 0;
            white-space: pre-wrap;
          }
          .prescriber-row {
            display: flex;
            gap: 16px;
            margin-top: 6px;
          }
          .section-divider {
            border-top: 1px solid #000;
            margin: 12px 0;
          }
          .pharmacy-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }
          @media print {
            body { padding: 10px; }
          }
        </style>
      </head>
      <body>
        ${el.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 400);
  };

  const displayed = items
    .filter(i => !filterLow || i.quantity <= i.reorderAt)
    .filter(i => !search || i.name?.toLowerCase().includes(search.toLowerCase())
      || i.category?.toLowerCase().includes(search.toLowerCase()));

  const lowCount = items.filter(i => i.quantity <= i.reorderAt).length;

  const stockColor = (item) => {
    if (item.quantity === 0)               return '#ef4444';
    if (item.quantity <= item.reorderAt)   return '#f59e0b';
    return '#22c55e';
  };

  // ─── Inline print preview styles (mirrors the print layout) ─────────────
  const pS = {
    form: { fontFamily:"'Times New Roman',Times,serif", color:'#000', background:'#fff',
      border:'2px solid #222', padding:'16px 20px 20px', borderRadius:4, maxWidth:660, margin:'0 auto' },
    title: { textAlign:'center', fontSize:15, fontWeight:'bold', textTransform:'uppercase',
      letterSpacing:1, marginBottom:3 },
    subtitle: { textAlign:'center', fontSize:12, fontWeight:'bold', textTransform:'uppercase',
      marginBottom:12, borderBottom:'2px solid #000', paddingBottom:7 },
    sectionLabel: { fontSize:10, fontWeight:'bold', textTransform:'uppercase',
      marginBottom:5, marginTop:10 },
    fieldRow: { display:'flex', gap:10, marginBottom:7, alignItems:'flex-end' },
    fieldBlock: { flex:1 },
    fieldLabel: { fontSize:9, fontWeight:'bold', textTransform:'uppercase',
      display:'block', marginBottom:1 },
    fieldValue: { borderBottom:'1px solid #000', minHeight:17, fontSize:11,
      padding:'0 2px', display:'block', width:'100%' },
    rxBox: { border:'1px solid #000', padding:7, minHeight:72, fontSize:11,
      margin:'5px 0', whiteSpace:'pre-wrap' },
    divider: { borderTop:'1px solid #000', margin:'10px 0' },
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <div className="topbar-title">Pharmacy Inventory</div>
        <input className="form-input" style={{ flex:1, maxWidth:260 }}
          placeholder="Search drugs…" value={search} onChange={e => setSearch(e.target.value)} />
        <button className={`btn ${filterLow ? 'btn-primary' : ''}`} onClick={() => setFilterLow(f => !f)}>
          <i className="ti ti-alert-triangle" />
          Low stock {lowCount > 0 && <span className="badge badge-danger" style={{marginLeft:4}}>{lowCount}</span>}
        </button>
        <button className="btn btn-success" onClick={() => { setRx(EMPTY_RX); setShowRx(true); }}
          style={{ background:'#0ea5e9', color:'#fff', border:'none' }}>
          <i className="ti ti-file-prescription" /> NHIS Rx Form
        </button>
        <button className="btn btn-primary" onClick={openAdd}>
          <i className="ti ti-plus" /> Add item
        </button>
      </div>

      <div className="page-content">
        {/* Summary cards */}
        <div className="stats-grid" style={{ marginBottom:16 }}>
          {[
            { label:'Total items',  value: items.length,                                   color:'var(--accent)',  icon:'ti-pill' },
            { label:'In stock',     value: items.filter(i => i.quantity > i.reorderAt).length, color:'var(--success)', icon:'ti-circle-check' },
            { label:'Low stock',    value: lowCount,                                       color:'var(--warn)',    icon:'ti-alert-triangle' },
            { label:'Out of stock', value: items.filter(i => i.quantity === 0).length,     color:'var(--danger)',  icon:'ti-circle-x' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label"><i className={`ti ${s.icon}`} style={{ color:s.color }} />{s.label}</div>
              <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title"><i className="ti ti-building-store" />Drug stock — {displayed.length} items</div>
          </div>

          {displayed.length === 0 && (
            <div style={{ padding:32, textAlign:'center', color:'var(--t3)', fontWeight:700 }}>
              {filterLow ? 'No low-stock items' : 'No items in inventory yet'}
            </div>
          )}

          <div style={{ overflowX:'auto' }}>
            <table className="data-table" style={{ minWidth:600 }}>
              <thead>
                <tr>
                  <th>Drug / Item</th>
                  <th>Category</th>
                  <th style={{ textAlign:'center' }}>Qty</th>
                  <th>Unit</th>
                  <th>Location</th>
                  <th style={{ textAlign:'center' }}>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight:700, color:'var(--t1)' }}>{item.name}</td>
                    <td style={{ color:'var(--t3)', fontSize:11 }}>{item.category || '—'}</td>
                    <td style={{ textAlign:'center', fontWeight:800, fontSize:15,
                      color: stockColor(item) }}>
                      {item.quantity}
                    </td>
                    <td style={{ color:'var(--t3)', fontSize:11 }}>{item.unit}</td>
                    <td style={{ color:'var(--t3)', fontSize:11 }}>{item.location || '—'}</td>
                    <td style={{ textAlign:'center' }}>
                      {item.quantity === 0
                        ? <span className="badge badge-danger">Out of stock</span>
                        : item.quantity <= item.reorderAt
                          ? <span className="badge badge-warn">Low stock</span>
                          : <span className="badge badge-ok">In stock</span>
                      }
                    </td>
                    <td>
                      <button className="btn" style={{ padding:'4px 8px', fontSize:11 }}
                        onClick={() => openEdit(item)}>
                        <i className="ti ti-edit" /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Add / Edit drawer ── */}
      {showForm && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'flex-end', justifyContent:'center',
          zIndex:200,
        }} onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{
            background:'var(--card-bg)', borderRadius:'16px 16px 0 0',
            padding:'20px 20px 32px', width:'100%', maxWidth:560,
            maxHeight:'85vh', overflowY:'auto',
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div style={{ fontWeight:800, fontSize:15 }}>
                {editing ? 'Edit inventory item' : 'Add new item'}
              </div>
              <button onClick={() => setShowForm(false)} style={{
                background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--t3)',
              }}>✕</button>
            </div>

            <div className="form-grid-2" style={{ gap:12 }}>
              {[
                { id:'name',     label:'Drug / Item name', span:2, ph:'e.g. Paracetamol 500mg' },
                { id:'quantity', label:'Quantity',         span:1, ph:'e.g. 200', type:'number' },
                { id:'reorderAt',label:'Reorder level',    span:1, ph:'e.g. 20',  type:'number' },
                { id:'location', label:'Storage location', span:2, ph:'e.g. Shelf A, Fridge' },
                { id:'notes',    label:'Notes',            span:2, ph:'e.g. Exp date, batch no.' },
              ].map(f => (
                <div key={f.id} className={`form-group ${f.span===2?'form-span-2':''}`}>
                  <label className="form-label">{f.label}</label>
                  <input className="form-input" type={f.type||'text'} placeholder={f.ph}
                    value={form[f.id]||''} onChange={e => set(f.id, e.target.value)} />
                </div>
              ))}

              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-select" value={form.category} onChange={e => set('category', e.target.value)}>
                  <option value="">Select…</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Unit</label>
                <select className="form-select" value={form.unit} onChange={e => set('unit', e.target.value)}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display:'flex', gap:8, marginTop:20 }}>
              <button className="btn" style={{ flex:1 }} onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:2 }} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Update item' : 'Add to inventory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NHIS Prescription Form Modal ── */}
      {showRx && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.65)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:300, padding:'12px',
        }} onClick={e => { if (e.target === e.currentTarget) setShowRx(false); }}>
          <div style={{
            background:'var(--card-bg)', borderRadius:12,
            width:'100%', maxWidth:720, maxHeight:'95vh', overflowY:'auto',
            padding:'16px 16px 24px',
          }}>
            {/* Modal header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:15, color:'var(--t1)' }}>
                <i className="ti ti-file-prescription" style={{ marginRight:6 }} />
                NHIS Prescription Form
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={handlePrintRx}
                  style={{ background:'#0ea5e9', color:'#fff', border:'none',
                    borderRadius:8, padding:'6px 16px', fontWeight:700,
                    cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                  <i className="ti ti-printer" /> Print Form
                </button>
                <button onClick={() => setShowRx(false)}
                  style={{ background:'none', border:'1px solid var(--border)',
                    borderRadius:8, padding:'6px 12px', cursor:'pointer', color:'var(--t2)' }}>
                  Close
                </button>
              </div>
            </div>

            {/* ─── Editable fields above the preview ─── */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 14px', marginBottom:14 }}>
              {[
                { k:'patientName',         label:'Patient Name',          col:2 },
                { k:'nhisId',              label:'NHIS ID No.' },
                { k:'age',                 label:'Age' },
                { k:'sex',                 label:'Sex', ph:'M / F' },
                { k:'address',             label:'Patient Address',        col:2 },
                { k:'providerName',        label:'Healthcare Provider Name', col:2 },
                { k:'providerAddress',     label:'Provider Address' },
                { k:'date',               label:'Date', type:'date' },
                { k:'telFax',             label:'Tel / Fax' },
                { k:'rx',                 label:'Rx (Drug, Dose, Duration — one per line)', col:2, ta:true },
                { k:'prescriberName',      label:"Prescriber's Name",     col:2 },
                { k:'pharmacist',         label:'Pharmacist Name' },
                { k:'pharmacy',           label:'Pharmacy Name' },
                { k:'pharmacistNo',       label:'Pharmacist No.' },
                { k:'nhisRegNo',          label:'NHIS Reg. No.' },
                { k:'pcnRegNo',           label:'PCN Reg. No.' },
              ].map(f => (
                <div key={f.k} style={{ gridColumn: f.col===2 ? 'span 2' : undefined }}>
                  <label style={{ fontSize:10, fontWeight:700, textTransform:'uppercase',
                    display:'block', marginBottom:2, color:'var(--t3)' }}>{f.label}</label>
                  {f.ta
                    ? <textarea rows={3} className="form-input"
                        placeholder="e.g. Paracetamol 500mg — 1 tab TDS × 5 days"
                        style={{ resize:'vertical', fontFamily:'inherit' }}
                        value={rx[f.k]||''} onChange={e => setR(f.k, e.target.value)} />
                    : <input className="form-input" type={f.type||'text'} placeholder={f.ph||''}
                        value={rx[f.k]||''} onChange={e => setR(f.k, e.target.value)} />
                  }
                </div>
              ))}
            </div>

            {/* ─── NHIS Form Preview (this gets printed) ─── */}
            <div style={{ background:'#f8f8f8', border:'1px dashed #ccc',
              borderRadius:6, padding:10, marginBottom:4 }}>
              <div style={{ fontSize:10, color:'#888', marginBottom:6,
                textTransform:'uppercase', letterSpacing:1 }}>Print Preview</div>

              {/* Hidden printable div */}
              <div ref={rxPrintRef}>
                <div className="nhis-form" style={pS.form}>
                  <div className="nhis-title" style={pS.title}>National Health Insurance Scheme</div>
                  <div className="nhis-subtitle" style={pS.subtitle}>Prescription Form</div>

                  {/* Section A */}
                  <div className="section-label" style={pS.sectionLabel}>A. Patient's Identification</div>
                  <div className="field-row" style={pS.fieldRow}>
                    <div className="field-block" style={{ ...pS.fieldBlock, flex:2 }}>
                      <span className="field-label" style={pS.fieldLabel}>Name:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.patientName}</span>
                    </div>
                    <div className="field-block" style={pS.fieldBlock}>
                      <span className="field-label" style={pS.fieldLabel}>NHIS ID No.:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.nhisId}</span>
                    </div>
                  </div>
                  <div className="field-row" style={pS.fieldRow}>
                    <div className="field-block" style={{ ...pS.fieldBlock, flex:2 }}>
                      <span className="field-label" style={pS.fieldLabel}>Address:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.address}</span>
                    </div>
                    <div className="field-block" style={pS.fieldBlock}>
                      <span className="field-label" style={pS.fieldLabel}>Age:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.age}</span>
                    </div>
                    <div className="field-block" style={pS.fieldBlock}>
                      <span className="field-label" style={pS.fieldLabel}>Sex:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.sex}</span>
                    </div>
                  </div>

                  {/* Section B */}
                  <div className="section-label" style={{ ...pS.sectionLabel, marginTop:10 }}>
                    B. Healthcare Provider's Identification
                  </div>
                  <div className="field-row" style={pS.fieldRow}>
                    <div className="field-block" style={{ ...pS.fieldBlock, flex:2 }}>
                      <span className="field-label" style={pS.fieldLabel}>Name:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.providerName}</span>
                    </div>
                    <div className="field-block" style={pS.fieldBlock}>
                      <span className="field-label" style={pS.fieldLabel}>Date:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.date}</span>
                    </div>
                  </div>
                  <div className="field-row" style={pS.fieldRow}>
                    <div className="field-block" style={{ ...pS.fieldBlock, flex:2 }}>
                      <span className="field-label" style={pS.fieldLabel}>Address:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.providerAddress}</span>
                    </div>
                    <div className="field-block" style={pS.fieldBlock}>
                      <span className="field-label" style={pS.fieldLabel}>Tel / Fax:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.telFax}</span>
                    </div>
                  </div>

                  {/* Rx block */}
                  <div style={{ display:'flex', gap:6, alignItems:'flex-start', marginTop:10 }}>
                    <span style={{ fontWeight:'bold', fontSize:16, fontFamily:'serif',
                      lineHeight:1, marginTop:2, minWidth:20 }}>Rx</span>
                    <div style={{ flex:1 }}>
                      <div className="rx-box" style={pS.rxBox}>{rx.rx}</div>
                    </div>
                  </div>

                  {/* Prescriber row */}
                  <div className="field-row" style={{ ...pS.fieldRow, marginTop:8 }}>
                    <div className="field-block" style={pS.fieldBlock}>
                      <span className="field-label" style={pS.fieldLabel}>Prescriber's Name:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.prescriberName}</span>
                    </div>
                    <div className="field-block" style={pS.fieldBlock}>
                      <span className="field-label" style={pS.fieldLabel}>Signature:</span>
                      <span className="field-value" style={pS.fieldValue}></span>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="section-divider" style={pS.divider}></div>

                  {/* Pharmacy section */}
                  <div className="section-label" style={pS.sectionLabel}>
                    Pharmacy Provider Identification
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <div>
                      <span className="field-label" style={pS.fieldLabel}>Pharmacist:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.pharmacist}</span>
                    </div>
                    <div>
                      <span className="field-label" style={pS.fieldLabel}>Pharmacy:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.pharmacy}</span>
                    </div>
                    <div>
                      <span className="field-label" style={pS.fieldLabel}>No.:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.pharmacistNo}</span>
                    </div>
                    <div>
                      <span className="field-label" style={pS.fieldLabel}>NHIS Reg. No.:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.nhisRegNo}</span>
                    </div>
                    <div>
                      <span className="field-label" style={pS.fieldLabel}>PCN Reg. No.:</span>
                      <span className="field-value" style={pS.fieldValue}>{rx.pcnRegNo}</span>
                    </div>
                    <div>
                      <span className="field-label" style={pS.fieldLabel}>Signature:</span>
                      <span className="field-value" style={pS.fieldValue}></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
