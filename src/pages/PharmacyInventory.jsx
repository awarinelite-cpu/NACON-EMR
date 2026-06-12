// src/pages/PharmacyInventory.jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { listenInventory, addInventoryItem, updateInventoryItem } from '../lib/emr';
import toast from 'react-hot-toast';

const EMPTY_FORM = { name:'', category:'', quantity:'', unit:'tablets', reorderAt:'10', location:'', notes:'' };
const CATEGORIES = ['Analgesic','Antibiotic','Antimalaria','Antifungal','Antihistamine',
  'Vitamins/Supplements','Fluids/IV','Wound Care','Contraceptive','Other'];
const UNITS = ['tablets','capsules','sachets','bottles','vials','tubes','strips','mg','ml'];

export default function PharmacyInventory() {
  const { profile }   = useAuth();
  const [items,       setItems]     = useState([]);
  const [search,      setSearch]    = useState('');
  const [showForm,    setShowForm]  = useState(false);
  const [editing,     setEditing]   = useState(null);   // item being edited
  const [form,        setForm]      = useState(EMPTY_FORM);
  const [saving,      setSaving]    = useState(false);
  const [filterLow,   setFilterLow] = useState(false);

  useEffect(() => {
    const unsub = listenInventory(setItems);
    return unsub;
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
    </div>
  );
}
