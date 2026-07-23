// src/pages/PharmacyInventory.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { listenInventory, addInventoryItem, updateInventoryItem, bulkUploadInventory } from '../lib/emr';
import toast from 'react-hot-toast';

const EMPTY_FORM = { name:'', category:'', quantity:'', unit:'tablets', reorderAt:'10', location:'', notes:'' };
const CATEGORIES = ['Analgesic','Antibiotic','Antimalaria','Antifungal','Antihistamine',
  'Vitamins/Supplements','Fluids/IV','Wound Care','Contraceptive','Other'];
const UNITS = ['tablets','capsules','sachets','bottles','vials','tubes','strips','mg','ml'];

// Recognized CSV header aliases → canonical field name (case-insensitive, spaces/underscores ignored)
const HEADER_ALIASES = {
  name: 'name', drug: 'name', drugname: 'name', item: 'name', itemname: 'name', drugitem: 'name',
  category: 'category', type: 'category',
  quantity: 'quantity', qty: 'quantity', stock: 'quantity',
  unit: 'unit', units: 'unit',
  reorderat: 'reorderAt', reorderlevel: 'reorderAt', reorder: 'reorderAt', reorderpoint: 'reorderAt',
  location: 'location', shelf: 'location',
  notes: 'notes', note: 'notes', remarks: 'notes',
};

// Minimal CSV parser — handles quoted fields (with embedded commas/quotes/newlines) and CRLF/LF.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (!(row.length === 1 && row[0] === '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Parses raw CSV text into row objects keyed by canonical field names,
// using the header row to map columns (order-independent).
function csvToInventoryRows(text) {
  const table = parseCSV(text).filter(r => r.some(c => c.trim() !== ''));
  if (table.length === 0) return { rows: [], unmatchedHeaders: [] };
  const headerRow = table[0].map(h => h.trim().toLowerCase().replace(/[\s_-]+/g, ''));
  const fieldMap = headerRow.map(h => HEADER_ALIASES[h] || null);
  const unmatchedHeaders = table[0].filter((h, i) => !fieldMap[i]);

  const rows = table.slice(1).map(cells => {
    const obj = {};
    fieldMap.forEach((field, i) => {
      if (field && cells[i] !== undefined) obj[field] = cells[i].trim();
    });
    return obj;
  });
  return { rows, unmatchedHeaders };
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────
export default function PharmacyInventory() {
  const { profile } = useAuth();
  const canManage = ['admin', 'subadmin', 'pharmacist'].includes(profile?.role);

  // inventory
  const [items,     setItems]    = useState([]);
  const [search,    setSearch]   = useState('');
  const [showForm,  setShowForm] = useState(false);
  const [editing,   setEditing]  = useState(null);
  const [form,      setForm]     = useState(EMPTY_FORM);
  const [saving,    setSaving]   = useState(false);
  const [filterLow, setFilterLow]= useState(false);

  // CSV bulk upload
  const fileInputRef = useRef(null);
  const [csvPreview, setCsvPreview] = useState(null); // { valid:[...], invalid:[...], fileName }
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [uploadingCsv, setUploadingCsv] = useState(false);

  // subscribe inventory
  useEffect(() => { const u = listenInventory(setItems); return u; }, []);

  // field setters
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openCsvPicker = () => fileInputRef.current?.click();

  const handleCsvFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { toast.error('Please choose a .csv file'); return; }

    const text = await file.text();
    const { rows, unmatchedHeaders } = csvToInventoryRows(text);
    if (rows.length === 0) { toast.error('No data rows found in that CSV'); return; }

    const valid = [], invalid = [];
    rows.forEach(row => {
      const name = (row.name || '').trim();
      const qty  = Number(row.quantity);
      if (!name || !Number.isFinite(qty) || qty < 0) {
        invalid.push({ row, reason: !name ? 'Missing drug name' : 'Missing/invalid quantity' });
        return;
      }
      const existing = items.find(i => i.name?.toLowerCase() === name.toLowerCase());
      valid.push({
        row,
        action: existing ? 'restock' : 'new',
        currentQty: existing?.quantity ?? null,
        newTotal: (existing?.quantity ?? 0) + qty,
      });
    });

    if (unmatchedHeaders.length) {
      toast(`Ignoring unrecognized column${unmatchedHeaders.length > 1 ? 's' : ''}: ${unmatchedHeaders.join(', ')}`, { icon: '⚠️' });
    }
    setCsvPreview({ valid, invalid, fileName: file.name });
    setShowCsvModal(true);
  };

  const confirmCsvUpload = async () => {
    if (!csvPreview?.valid.length) return;
    setUploadingCsv(true);
    try {
      const result = await bulkUploadInventory(
        csvPreview.valid.map(v => v.row),
        profile.displayName || profile.email,
        profile.role
      );
      toast.success(`${result.added} added, ${result.restocked} restocked${result.skipped.length ? `, ${result.skipped.length} skipped` : ''}`);
      setShowCsvModal(false);
      setCsvPreview(null);
    } catch (e) {
      console.error('[PharmacyInventory] bulk upload failed:', e);
      toast.error('Bulk upload failed');
    }
    setUploadingCsv(false);
  };

  // inventory handlers
  const openAdd  = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); };
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
        const newQty = Number(form.quantity);
        const isRestock = newQty > (editing.quantity ?? 0); // treat any increase as a fresh batch
        await updateInventoryItem(editing.id,
          {
            ...form,
            quantity: newQty,
            reorderAt: Number(form.reorderAt),
            ...(isRestock ? { initialQuantity: newQty } : {}),
          },
          profile.displayName, profile.role);
        toast.success('Item updated');
      } else {
        await addInventoryItem(form, profile.displayName, profile.role);
        toast.success('Item added');
      }
      setShowForm(false);
    } catch(e) { toast.error('Failed to save'); }
    setSaving(false);
  };

  const isLow = item =>
    item.initialQuantity > 0
      ? (1 - item.quantity / item.initialQuantity) >= 0.6   // ≥60% used
      : item.quantity <= item.reorderAt;                     // fallback for older items

  const displayed  = items
    .filter(i => !filterLow || (i.quantity > 0 && isLow(i)))
    .filter(i => !search || i.name?.toLowerCase().includes(search.toLowerCase())
      || i.category?.toLowerCase().includes(search.toLowerCase()));
  const lowCount   = items.filter(i => i.quantity > 0 && isLow(i)).length;
  const stockColor = item => {
    if (item.quantity === 0) return '#ef4444'; // red — out of stock
    if (item.initialQuantity > 0) {
      const percentUsed = 1 - (item.quantity / item.initialQuantity);
      if (percentUsed >= 0.9) return '#ef4444'; // red   — ≥90% used (≤10% left)
      if (percentUsed >= 0.6) return '#f59e0b'; // orange — 60–89% used
      return '#22c55e';                          // green — <60% used
    }
    // Fallback for older items with no baseline batch size recorded
    return item.quantity <= item.reorderAt ? '#f59e0b' : '#22c55e';
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>

      {/* ── TOPBAR ── */}
      <div className="topbar">
        <div className="topbar-title">Pharmacy Inventory</div>
        <input className="form-input" style={{ flex:1, maxWidth:240 }}
          placeholder="Search drugs…" value={search} onChange={e => setSearch(e.target.value)} />
        <button className={`btn ${filterLow ? 'btn-primary' : ''}`} onClick={() => setFilterLow(f => !f)}>
          <i className="ti ti-alert-triangle" />
          Low stock {lowCount > 0 && <span className="badge badge-danger" style={{ marginLeft:4 }}>{lowCount}</span>}
        </button>
        {canManage && (
          <>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv"
              style={{ display:'none' }} onChange={handleCsvFile} />
            <button className="btn" onClick={openCsvPicker}>
              <i className="ti ti-upload" /> Bulk upload CSV
            </button>
            <button className="btn btn-primary" onClick={openAdd}>
              <i className="ti ti-plus" /> Add item
            </button>
          </>
        )}
      </div>

      {/* ── PAGE CONTENT ── */}
      <div className="page-content">
        <div className="stats-grid" style={{ marginBottom:16 }}>
          {[
            { label:'Total items',  value:items.length,                                    color:'var(--accent)', icon:'ti-pill' },
            { label:'In stock',     value:items.filter(i=>i.quantity>0 && !isLow(i)).length, color:'var(--success)',icon:'ti-circle-check' },
            { label:'Low stock',    value:lowCount,                                        color:'var(--warn)',   icon:'ti-alert-triangle' },
            { label:'Out of stock', value:items.filter(i=>i.quantity===0).length,          color:'var(--danger)', icon:'ti-circle-x' },
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
              <thead><tr>
                <th>Drug / Item</th><th>Category</th>
                <th style={{ textAlign:'center' }}>Qty</th><th>Unit</th>
                <th>Location</th><th style={{ textAlign:'center' }}>Status</th>{canManage && <th></th>}
              </tr></thead>
              <tbody>
                {displayed.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight:700, color:'var(--t1)' }}>{item.name}</td>
                    <td style={{ color:'var(--t3)', fontSize:11 }}>{item.category || '—'}</td>
                    <td style={{ textAlign:'center', fontWeight:800, fontSize:15, color:stockColor(item) }}>{item.quantity}</td>
                    <td style={{ color:'var(--t3)', fontSize:11 }}>{item.unit}</td>
                    <td style={{ color:'var(--t3)', fontSize:11 }}>{item.location || '—'}</td>
                    <td style={{ textAlign:'center' }}>
                      {item.quantity === 0
                        ? <span className="badge badge-danger">Out of stock</span>
                        : isLow(item)
                          ? <span className="badge badge-warn">Low stock</span>
                          : <span className="badge badge-ok">In stock</span>}
                    </td>
                    {canManage && (
                      <td>
                        <button className="btn" style={{ padding:'4px 8px', fontSize:11 }} onClick={() => openEdit(item)}>
                          <i className="ti ti-edit" /> Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          ADD / EDIT INVENTORY DRAWER
      ══════════════════════════════════════════════════════ */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:200 }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{ background:'var(--card-bg)', borderRadius:'16px 16px 0 0',
            padding:'20px 20px 32px', width:'100%', maxWidth:560, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div style={{ fontWeight:800, fontSize:15 }}>{editing ? 'Edit inventory item' : 'Add new item'}</div>
              <button onClick={() => setShowForm(false)}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--t3)' }}>✕</button>
            </div>
            <div className="form-grid-2" style={{ gap:12 }}>
              {[
                { id:'name',     label:'Drug / Item name', span:2, ph:'e.g. Paracetamol 500mg' },
                { id:'quantity', label:'Quantity',          span:1, ph:'e.g. 200', type:'number' },
                { id:'reorderAt',label:'Reorder level',     span:1, ph:'e.g. 20',  type:'number' },
                { id:'location', label:'Storage location',  span:2, ph:'e.g. Shelf A, Fridge' },
                { id:'notes',    label:'Notes',             span:2, ph:'e.g. Exp date, batch no.' },
              ].map(f => (
                <div key={f.id} className={`form-group ${f.span === 2 ? 'form-span-2' : ''}`}>
                  <label className="form-label">{f.label}</label>
                  <input className="form-input" type={f.type || 'text'} placeholder={f.ph}
                    value={form[f.id] || ''} onChange={e => set(f.id, e.target.value)} />
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

      {/* ══════════════════════════════════════════════════════
          CSV BULK UPLOAD PREVIEW MODAL
      ══════════════════════════════════════════════════════ */}
      {showCsvModal && csvPreview && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }}
          onClick={e => { if (e.target === e.currentTarget && !uploadingCsv) setShowCsvModal(false); }}>
          <div style={{ background:'var(--card-bg)', borderRadius:16,
            padding:20, width:'100%', maxWidth:640, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
              <div style={{ fontWeight:800, fontSize:15 }}>Bulk upload preview</div>
              <button onClick={() => !uploadingCsv && setShowCsvModal(false)}
                style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--t3)' }}>✕</button>
            </div>
            <div style={{ fontSize:11, color:'var(--t3)', marginBottom:12 }}>{csvPreview.fileName}</div>

            <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
              <span className="badge badge-ok">{csvPreview.valid.filter(v => v.action === 'new').length} new</span>
              <span className="badge" style={{ background:'var(--accent)', color:'#fff' }}>
                {csvPreview.valid.filter(v => v.action === 'restock').length} restock
              </span>
              {csvPreview.invalid.length > 0 &&
                <span className="badge badge-danger">{csvPreview.invalid.length} skipped</span>}
            </div>

            {csvPreview.valid.length > 0 && (
              <div style={{ overflowX:'auto', marginBottom: csvPreview.invalid.length ? 16 : 0 }}>
                <table className="data-table" style={{ minWidth:480 }}>
                  <thead><tr>
                    <th>Drug / Item</th><th style={{ textAlign:'center' }}>Action</th>
                    <th style={{ textAlign:'center' }}>Qty in file</th><th style={{ textAlign:'center' }}>New total</th>
                  </tr></thead>
                  <tbody>
                    {csvPreview.valid.map((v, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight:700 }}>{v.row.name}</td>
                        <td style={{ textAlign:'center' }}>
                          {v.action === 'new'
                            ? <span className="badge badge-ok">New item</span>
                            : <span className="badge" style={{ background:'var(--accent)', color:'#fff' }}>Restock</span>}
                        </td>
                        <td style={{ textAlign:'center' }}>{v.row.quantity}</td>
                        <td style={{ textAlign:'center', fontWeight:800 }}>
                          {v.action === 'restock' ? `${v.currentQty} → ${v.newTotal}` : v.newTotal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {csvPreview.invalid.length > 0 && (
              <div>
                <div style={{ fontWeight:700, fontSize:12, color:'var(--danger)', marginBottom:6 }}>
                  Skipped rows (fix and re-upload if needed)
                </div>
                <div style={{ overflowX:'auto' }}>
                  <table className="data-table" style={{ minWidth:400 }}>
                    <thead><tr><th>Row data</th><th>Reason</th></tr></thead>
                    <tbody>
                      {csvPreview.invalid.map((inv, i) => (
                        <tr key={i}>
                          <td style={{ fontSize:11, color:'var(--t3)' }}>{inv.row.name || '(no name)'}{inv.row.quantity ? ` · qty: ${inv.row.quantity}` : ''}</td>
                          <td style={{ fontSize:11, color:'var(--danger)' }}>{inv.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display:'flex', gap:8, marginTop:20 }}>
              <button className="btn" style={{ flex:1 }} disabled={uploadingCsv}
                onClick={() => { setShowCsvModal(false); setCsvPreview(null); }}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:2 }}
                disabled={uploadingCsv || csvPreview.valid.length === 0} onClick={confirmCsvUpload}>
                {uploadingCsv ? 'Uploading…' : `Confirm upload (${csvPreview.valid.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
