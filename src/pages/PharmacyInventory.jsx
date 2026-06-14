// src/pages/PharmacyInventory.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { listenInventory, addInventoryItem, updateInventoryItem } from '../lib/emr';
import toast from 'react-hot-toast';

const EMPTY_FORM = { name:'', category:'', quantity:'', unit:'tablets', reorderAt:'10', location:'', notes:'' };
const CATEGORIES = ['Analgesic','Antibiotic','Antimalaria','Antifungal','Antihistamine',
  'Vitamins/Supplements','Fluids/IV','Wound Care','Contraceptive','Other'];
const UNITS = ['tablets','capsules','sachets','bottles','vials','tubes','strips','mg','ml'];

const EMPTY_NHIS = {
  patientName:'', nhisId:'', address:'', age:'', sex:'',
  providerName:'', date:'', providerAddress:'', telFax:'',
  rx:'', prescriberName:'',
  pharmacist:'', pharmacy:'', pharmacistNo:'', nhisRegNo:'', pcnRegNo:'',
};

const EMPTY_NACON = {
  patientName:'', matricNo:'', address:'', age:'', sex:'',
  class:'', date:'', tel:'',
  rx:'', prescriberName:'',
  pharmacyTel:'',
};

// ── shared print styles (Times New Roman, black on white) ──────────────────
const F = {
  form:        { fontFamily:"'Times New Roman',Times,serif", color:'#000', background:'#fff' },
  title:       { fontWeight:'bold', textDecoration:'underline', fontStyle:'italic', fontSize:15 },
  subtitle:    { fontWeight:'bold', fontStyle:'italic', fontSize:12, textAlign:'center' },
  sectionHead: { fontWeight:'bold', fontSize:12 },
  label:       { fontSize:11, fontWeight:'bold' },
  line:        { display:'inline-block', borderBottom:'1px solid #000',
                 minWidth:100, verticalAlign:'bottom', fontSize:11 },
  rxBox:       { border:'2px solid #000', padding:8, minHeight:200,
                 fontSize:12, whiteSpace:'pre-wrap', marginTop:4 },
  rxSymbol:    { fontWeight:'bold', fontSize:22, fontFamily:'serif',
                 verticalAlign:'top', marginRight:4 },
};

export default function PharmacyInventory() {
  const { profile }  = useAuth();
  const [items,      setItems]    = useState([]);
  const [search,     setSearch]   = useState('');
  const [showForm,   setShowForm] = useState(false);
  const [editing,    setEditing]  = useState(null);
  const [form,       setForm]     = useState(EMPTY_FORM);
  const [saving,     setSaving]   = useState(false);
  const [filterLow,  setFilterLow]= useState(false);

  // which Rx modal is open: null | 'nhis' | 'nacon'
  const [rxModal,    setRxModal]  = useState(null);
  const [nhis,       setNhis]     = useState(EMPTY_NHIS);
  const [nacon,      setNacon]    = useState(EMPTY_NACON);
  const nhisRef  = useRef(null);
  const naconRef = useRef(null);

  useEffect(() => { const u = listenInventory(setItems); return u; }, []);

  const set  = (k,v) => setForm(f  => ({...f,  [k]:v}));
  const setN = (k,v) => setNhis(r  => ({...r,  [k]:v}));
  const setC = (k,v) => setNacon(r => ({...r,  [k]:v}));

  const openAdd  = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({...EMPTY_FORM,...item, quantity:String(item.quantity), reorderAt:String(item.reorderAt)});
    setShowForm(true);
  };
  const handleSave = async () => {
    if (!form.name.trim() || !form.quantity) { toast.error('Name and quantity are required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateInventoryItem(editing.id,
          {...form, quantity:Number(form.quantity), reorderAt:Number(form.reorderAt)},
          profile.displayName);
        toast.success('Item updated');
      } else {
        await addInventoryItem(form, profile.displayName);
        toast.success('Item added to inventory');
      }
      setShowForm(false);
    } catch(e) { toast.error('Failed to save'); }
    setSaving(false);
  };

  const doPrint = (ref, title) => {
    const el = ref.current;
    if (!el) return;
    const w = window.open('','_blank','width=820,height=700');
    w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Times New Roman',Times,serif;background:#fff;color:#000;padding:30px}
        .nacon-logo-row{display:flex;align-items:center;gap:12px;margin-bottom:6px}
        .nacon-shield{width:52px;height:52px;border:2px solid #000;display:flex;align-items:center;
          justify-content:center;font-size:9px;font-weight:bold;text-align:center;padding:2px}
        .nhis-title{text-align:center;font-size:16px;font-weight:bold;text-transform:uppercase;
          letter-spacing:1px;margin-bottom:3px}
        .nhis-subtitle{text-align:center;font-size:13px;font-weight:bold;text-transform:uppercase;
          margin-bottom:14px;border-bottom:2px solid #000;padding-bottom:8px}
        .nacon-title{font-weight:bold;text-decoration:underline;font-style:italic;font-size:15px}
        .nacon-subtitle{font-weight:bold;font-style:italic;font-size:12px;text-align:center;
          margin-bottom:10px}
        .section-head{font-weight:bold;font-size:12px;margin:10px 0 5px}
        .field-row{margin-bottom:6px;font-size:11px}
        .uline{display:inline-block;border-bottom:1px solid #000;min-width:80px;
          vertical-align:bottom}
        .rx-box{border:2px solid #000;padding:8px;min-height:200px;font-size:12px;
          white-space:pre-wrap;margin:6px 0}
        .rx-sym{font-weight:bold;font-size:22px;font-family:serif;vertical-align:top;margin-right:4px}
        .sig-line{display:inline-block;border-bottom:1px solid #000;min-width:140px;
          vertical-align:bottom}
        .nhis-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
        .divider{border-top:1px solid #000;margin:10px 0}
        @media print{body{padding:10px}}
      </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => w.print(), 400);
  };

  const displayed = items
    .filter(i => !filterLow || i.quantity <= i.reorderAt)
    .filter(i => !search || i.name?.toLowerCase().includes(search.toLowerCase())
      || i.category?.toLowerCase().includes(search.toLowerCase()));
  const lowCount = items.filter(i => i.quantity <= i.reorderAt).length;
  const stockColor = item =>
    item.quantity === 0 ? '#ef4444' : item.quantity <= item.reorderAt ? '#f59e0b' : '#22c55e';

  // ── shared input style ─────────────────────────────────────────
  const inp = { padding:'6px 8px', borderRadius:6, border:'1px solid var(--border)',
    background:'var(--input-bg,#f4f4f4)', fontSize:12, width:'100%',
    fontFamily:'inherit', color:'var(--t1)' };
  const lbl = { fontSize:10, fontWeight:700, textTransform:'uppercase',
    display:'block', marginBottom:2, color:'var(--t3)' };

  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:'100%'}}>
      <div className="topbar">
        <div className="topbar-title">Pharmacy Inventory</div>
        <input className="form-input" style={{flex:1,maxWidth:260}}
          placeholder="Search drugs…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <button className={`btn ${filterLow?'btn-primary':''}`} onClick={()=>setFilterLow(f=>!f)}>
          <i className="ti ti-alert-triangle"/>
          Low stock {lowCount>0&&<span className="badge badge-danger" style={{marginLeft:4}}>{lowCount}</span>}
        </button>
        {/* ── Rx form buttons ── */}
        <button onClick={()=>{setNhis(EMPTY_NHIS);setRxModal('nhis');}}
          style={{background:'#0ea5e9',color:'#fff',border:'none',borderRadius:8,
            padding:'6px 12px',fontWeight:700,cursor:'pointer',fontSize:12,
            display:'flex',alignItems:'center',gap:5}}>
          <i className="ti ti-file-prescription"/> NHIS Rx
        </button>
        <button onClick={()=>{setNacon(EMPTY_NACON);setRxModal('nacon');}}
          style={{background:'#7c3aed',color:'#fff',border:'none',borderRadius:8,
            padding:'6px 12px',fontWeight:700,cursor:'pointer',fontSize:12,
            display:'flex',alignItems:'center',gap:5}}>
          <i className="ti ti-file-prescription"/> NACON Rx
        </button>
        <button className="btn btn-primary" onClick={openAdd}>
          <i className="ti ti-plus"/> Add item
        </button>
      </div>

      <div className="page-content">
        <div className="stats-grid" style={{marginBottom:16}}>
          {[
            {label:'Total items', value:items.length,                                    color:'var(--accent)', icon:'ti-pill'},
            {label:'In stock',    value:items.filter(i=>i.quantity>i.reorderAt).length,  color:'var(--success)',icon:'ti-circle-check'},
            {label:'Low stock',   value:lowCount,                                        color:'var(--warn)',   icon:'ti-alert-triangle'},
            {label:'Out of stock',value:items.filter(i=>i.quantity===0).length,          color:'var(--danger)', icon:'ti-circle-x'},
          ].map(s=>(
            <div key={s.label} className="stat-card">
              <div className="stat-label"><i className={`ti ${s.icon}`} style={{color:s.color}}/>{s.label}</div>
              <div className="stat-value" style={{color:s.color}}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title"><i className="ti ti-building-store"/>Drug stock — {displayed.length} items</div>
          </div>
          {displayed.length===0&&(
            <div style={{padding:32,textAlign:'center',color:'var(--t3)',fontWeight:700}}>
              {filterLow?'No low-stock items':'No items in inventory yet'}
            </div>
          )}
          <div style={{overflowX:'auto'}}>
            <table className="data-table" style={{minWidth:600}}>
              <thead><tr>
                <th>Drug / Item</th><th>Category</th>
                <th style={{textAlign:'center'}}>Qty</th><th>Unit</th>
                <th>Location</th><th style={{textAlign:'center'}}>Status</th><th></th>
              </tr></thead>
              <tbody>
                {displayed.map(item=>(
                  <tr key={item.id}>
                    <td style={{fontWeight:700,color:'var(--t1)'}}>{item.name}</td>
                    <td style={{color:'var(--t3)',fontSize:11}}>{item.category||'—'}</td>
                    <td style={{textAlign:'center',fontWeight:800,fontSize:15,color:stockColor(item)}}>{item.quantity}</td>
                    <td style={{color:'var(--t3)',fontSize:11}}>{item.unit}</td>
                    <td style={{color:'var(--t3)',fontSize:11}}>{item.location||'—'}</td>
                    <td style={{textAlign:'center'}}>
                      {item.quantity===0
                        ?<span className="badge badge-danger">Out of stock</span>
                        :item.quantity<=item.reorderAt
                          ?<span className="badge badge-warn">Low stock</span>
                          :<span className="badge badge-ok">In stock</span>}
                    </td>
                    <td>
                      <button className="btn" style={{padding:'4px 8px',fontSize:11}} onClick={()=>openEdit(item)}>
                        <i className="ti ti-edit"/> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          ADD / EDIT DRAWER
      ═══════════════════════════════════════════════════════ */}
      {showForm&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',
          display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}}
          onClick={e=>{if(e.target===e.currentTarget)setShowForm(false);}}>
          <div style={{background:'var(--card-bg)',borderRadius:'16px 16px 0 0',
            padding:'20px 20px 32px',width:'100%',maxWidth:560,maxHeight:'85vh',overflowY:'auto'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div style={{fontWeight:800,fontSize:15}}>{editing?'Edit inventory item':'Add new item'}</div>
              <button onClick={()=>setShowForm(false)}
                style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--t3)'}}>✕</button>
            </div>
            <div className="form-grid-2" style={{gap:12}}>
              {[
                {id:'name',    label:'Drug / Item name',span:2,ph:'e.g. Paracetamol 500mg'},
                {id:'quantity',label:'Quantity',        span:1,ph:'e.g. 200',type:'number'},
                {id:'reorderAt',label:'Reorder level',  span:1,ph:'e.g. 20', type:'number'},
                {id:'location',label:'Storage location',span:2,ph:'e.g. Shelf A, Fridge'},
                {id:'notes',   label:'Notes',           span:2,ph:'e.g. Exp date, batch no.'},
              ].map(f=>(
                <div key={f.id} className={`form-group ${f.span===2?'form-span-2':''}`}>
                  <label className="form-label">{f.label}</label>
                  <input className="form-input" type={f.type||'text'} placeholder={f.ph}
                    value={form[f.id]||''} onChange={e=>set(f.id,e.target.value)}/>
                </div>
              ))}
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-select" value={form.category} onChange={e=>set('category',e.target.value)}>
                  <option value="">Select…</option>
                  {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Unit</label>
                <select className="form-select" value={form.unit} onChange={e=>set('unit',e.target.value)}>
                  {UNITS.map(u=><option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:20}}>
              <button className="btn" style={{flex:1}} onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" style={{flex:2}} onClick={handleSave} disabled={saving}>
                {saving?'Saving…':editing?'Update item':'Add to inventory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          NHIS PRESCRIPTION FORM MODAL
      ═══════════════════════════════════════════════════════ */}
      {rxModal==='nhis'&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',
          display:'flex',alignItems:'center',justifyContent:'center',
          zIndex:300,padding:12,overflowY:'auto'}}
          onClick={e=>{if(e.target===e.currentTarget)setRxModal(null);}}>
          <div style={{background:'var(--card-bg)',borderRadius:12,width:'100%',
            maxWidth:720,maxHeight:'95vh',overflowY:'auto',padding:'16px 16px 24px'}}>

            {/* Header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div style={{fontWeight:800,fontSize:15,color:'var(--t1)'}}>
                <i className="ti ti-file-prescription" style={{marginRight:6}}/>NHIS Prescription Form
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>doPrint(nhisRef,'NHIS Prescription Form')}
                  style={{background:'#0ea5e9',color:'#fff',border:'none',borderRadius:8,
                    padding:'6px 16px',fontWeight:700,cursor:'pointer',
                    display:'flex',alignItems:'center',gap:5}}>
                  <i className="ti ti-printer"/> Print Form
                </button>
                <button onClick={()=>setRxModal(null)}
                  style={{background:'none',border:'1px solid var(--border)',
                    borderRadius:8,padding:'6px 12px',cursor:'pointer',color:'var(--t2)'}}>Close</button>
              </div>
            </div>

            {/* Input fields */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 14px',marginBottom:14}}>
              {[
                {k:'patientName',  label:'Patient Name',              col:2},
                {k:'nhisId',       label:'NHIS ID No.'},
                {k:'age',          label:'Age'},
                {k:'sex',          label:'Sex', ph:'M / F'},
                {k:'address',      label:'Patient Address',           col:2},
                {k:'providerName', label:'Healthcare Provider Name',  col:2},
                {k:'providerAddress',label:'Provider Address'},
                {k:'date',         label:'Date', type:'date'},
                {k:'telFax',       label:'Tel / Fax'},
                {k:'rx',           label:'Rx — Drug, Dose, Duration (one per line)', col:2, ta:true},
                {k:'prescriberName',label:"Prescriber's Name",        col:2},
                {k:'pharmacist',   label:'Pharmacist Name'},
                {k:'pharmacy',     label:'Pharmacy Name'},
                {k:'pharmacistNo', label:'Pharmacist No.'},
                {k:'nhisRegNo',    label:'NHIS Reg. No.'},
                {k:'pcnRegNo',     label:'PCN Reg. No.'},
              ].map(f=>(
                <div key={f.k} style={{gridColumn:f.col===2?'span 2':undefined}}>
                  <label style={lbl}>{f.label}</label>
                  {f.ta
                    ?<textarea rows={3} style={{...inp,resize:'vertical'}}
                        placeholder="e.g. Paracetamol 500mg — 1 tab TDS × 5 days"
                        value={nhis[f.k]||''} onChange={e=>setN(f.k,e.target.value)}/>
                    :<input style={inp} type={f.type||'text'} placeholder={f.ph||''}
                        value={nhis[f.k]||''} onChange={e=>setN(f.k,e.target.value)}/>
                  }
                </div>
              ))}
            </div>

            {/* Preview */}
            <div style={{background:'#f8f8f8',border:'1px dashed #ccc',borderRadius:6,padding:10}}>
              <div style={{fontSize:9,color:'#999',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>
                Print Preview
              </div>
              <div ref={nhisRef}>
                <div style={{...F.form,border:'2px solid #000',padding:'16px 20px 20px',maxWidth:660,margin:'0 auto'}}>

                  {/* Title */}
                  <div style={{textAlign:'center',fontSize:15,fontWeight:'bold',
                    textTransform:'uppercase',letterSpacing:1,marginBottom:3}}>
                    National Health Insurance Scheme
                  </div>
                  <div style={{textAlign:'center',fontSize:12,fontWeight:'bold',
                    textTransform:'uppercase',marginBottom:12,
                    borderBottom:'2px solid #000',paddingBottom:7}}>
                    Prescription Form
                  </div>

                  {/* Section A */}
                  <div style={{fontSize:11,fontWeight:'bold',textTransform:'uppercase',marginBottom:5}}>
                    A. &nbsp;Patient's Identification
                  </div>
                  <div style={{display:'flex',gap:10,marginBottom:7,alignItems:'flex-end'}}>
                    <div style={{flex:2}}>
                      <span style={{fontSize:10,fontWeight:'bold',textTransform:'uppercase'}}>Name: </span>
                      <span style={{...F.line,flex:1,minWidth:160}}>{nhis.patientName}</span>
                    </div>
                    <div style={{flex:1}}>
                      <span style={{fontSize:10,fontWeight:'bold',textTransform:'uppercase'}}>NHIS ID No.: </span>
                      <span style={{...F.line,minWidth:80}}>{nhis.nhisId}</span>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:10,marginBottom:7,alignItems:'flex-end'}}>
                    <div style={{flex:2}}>
                      <span style={{fontSize:10,fontWeight:'bold',textTransform:'uppercase'}}>Address: </span>
                      <span style={{...F.line,minWidth:140}}>{nhis.address}</span>
                    </div>
                    <div style={{flex:1}}>
                      <span style={{fontSize:10,fontWeight:'bold',textTransform:'uppercase'}}>Age: </span>
                      <span style={{...F.line,minWidth:50}}>{nhis.age}</span>
                    </div>
                    <div style={{flex:1}}>
                      <span style={{fontSize:10,fontWeight:'bold',textTransform:'uppercase'}}>Sex: </span>
                      <span style={{...F.line,minWidth:40}}>{nhis.sex}</span>
                    </div>
                  </div>

                  {/* Section B */}
                  <div style={{fontSize:11,fontWeight:'bold',textTransform:'uppercase',margin:'10px 0 5px'}}>
                    B. &nbsp;Healthcare Provider's Identification
                  </div>
                  <div style={{display:'flex',gap:10,marginBottom:7,alignItems:'flex-end'}}>
                    <div style={{flex:2}}>
                      <span style={{fontSize:10,fontWeight:'bold',textTransform:'uppercase'}}>Name: </span>
                      <span style={{...F.line,minWidth:160}}>{nhis.providerName}</span>
                    </div>
                    <div style={{flex:1}}>
                      <span style={{fontSize:10,fontWeight:'bold',textTransform:'uppercase'}}>Date: </span>
                      <span style={{...F.line,minWidth:80}}>{nhis.date}</span>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:10,marginBottom:7,alignItems:'flex-end'}}>
                    <div style={{flex:2}}>
                      <span style={{fontSize:10,fontWeight:'bold',textTransform:'uppercase'}}>Address: </span>
                      <span style={{...F.line,minWidth:140}}>{nhis.providerAddress}</span>
                    </div>
                    <div style={{flex:1}}>
                      <span style={{fontSize:10,fontWeight:'bold',textTransform:'uppercase'}}>Tel / Fax: </span>
                      <span style={{...F.line,minWidth:80}}>{nhis.telFax}</span>
                    </div>
                  </div>

                  {/* Rx */}
                  <div style={{display:'flex',gap:4,alignItems:'flex-start',marginTop:10}}>
                    <span style={F.rxSymbol}>Rx</span>
                    <div style={{...F.rxBox,flex:1,minHeight:120}}>{nhis.rx}</div>
                  </div>

                  {/* Prescriber */}
                  <div style={{display:'flex',gap:16,marginTop:8,alignItems:'flex-end'}}>
                    <div style={{flex:2}}>
                      <span style={{fontSize:10,fontWeight:'bold',textTransform:'uppercase'}}>Prescriber's Name: </span>
                      <span style={{...F.line,minWidth:160}}>{nhis.prescriberName}</span>
                    </div>
                    <div style={{flex:1}}>
                      <span style={{fontSize:10,fontWeight:'bold',textTransform:'uppercase'}}>Signature: </span>
                      <span style={{...F.line,minWidth:100}}></span>
                    </div>
                  </div>

                  {/* Divider */}
                  <div style={{borderTop:'1px solid #000',margin:'12px 0'}}></div>

                  {/* Pharmacy */}
                  <div style={{fontSize:11,fontWeight:'bold',textTransform:'uppercase',marginBottom:7}}>
                    Pharmacy Provider Identification
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    {[
                      {label:'Pharmacist',   val:nhis.pharmacist},
                      {label:'Pharmacy',     val:nhis.pharmacy},
                      {label:'No.',          val:nhis.pharmacistNo},
                      {label:'NHIS Reg. No.',val:nhis.nhisRegNo},
                      {label:'PCN Reg. No.', val:nhis.pcnRegNo},
                      {label:'Signature',    val:''},
                    ].map(r=>(
                      <div key={r.label}>
                        <span style={{fontSize:10,fontWeight:'bold',textTransform:'uppercase'}}>{r.label}: </span>
                        <span style={{...F.line,minWidth:100}}>{r.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          NACON MRS CIVILIAN PRESCRIPTION FORM MODAL
      ═══════════════════════════════════════════════════════ */}
      {rxModal==='nacon'&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',
          display:'flex',alignItems:'center',justifyContent:'center',
          zIndex:300,padding:12,overflowY:'auto'}}
          onClick={e=>{if(e.target===e.currentTarget)setRxModal(null);}}>
          <div style={{background:'var(--card-bg)',borderRadius:12,width:'100%',
            maxWidth:720,maxHeight:'95vh',overflowY:'auto',padding:'16px 16px 24px'}}>

            {/* Header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
              <div style={{fontWeight:800,fontSize:15,color:'var(--t1)'}}>
                <i className="ti ti-file-prescription" style={{marginRight:6}}/>
                NACON MRS — Civilian Prescription Form
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>doPrint(naconRef,'NACON MRS Civilian Prescription Form')}
                  style={{background:'#7c3aed',color:'#fff',border:'none',borderRadius:8,
                    padding:'6px 16px',fontWeight:700,cursor:'pointer',
                    display:'flex',alignItems:'center',gap:5}}>
                  <i className="ti ti-printer"/> Print Form
                </button>
                <button onClick={()=>setRxModal(null)}
                  style={{background:'none',border:'1px solid var(--border)',
                    borderRadius:8,padding:'6px 12px',cursor:'pointer',color:'var(--t2)'}}>Close</button>
              </div>
            </div>

            {/* Input fields */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 14px',marginBottom:14}}>
              {[
                {k:'patientName',label:'Patient Name',        col:2},
                {k:'matricNo',   label:'Matric No.'},
                {k:'address',    label:'Address'},
                {k:'age',        label:'Age'},
                {k:'sex',        label:'Sex', ph:'M / F'},
                {k:'class',      label:'Class'},
                {k:'date',       label:'Date', type:'date'},
                {k:'tel',        label:'Tel'},
                {k:'rx',         label:'Rx — Drug, Dose, Duration (one per line)', col:2, ta:true},
                {k:'prescriberName',label:"Prescriber's Name", col:2},
                {k:'pharmacyTel',label:'Pharmacy Tel No.',   col:2},
              ].map(f=>(
                <div key={f.k} style={{gridColumn:f.col===2?'span 2':undefined}}>
                  <label style={lbl}>{f.label}</label>
                  {f.ta
                    ?<textarea rows={3} style={{...inp,resize:'vertical'}}
                        placeholder="e.g. Amoxicillin 500mg — 1 cap TDS × 7 days"
                        value={nacon[f.k]||''} onChange={e=>setC(f.k,e.target.value)}/>
                    :<input style={inp} type={f.type||'text'} placeholder={f.ph||''}
                        value={nacon[f.k]||''} onChange={e=>setC(f.k,e.target.value)}/>
                  }
                </div>
              ))}
            </div>

            {/* Preview */}
            <div style={{background:'#f8f8f8',border:'1px dashed #ccc',borderRadius:6,padding:10}}>
              <div style={{fontSize:9,color:'#999',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>
                Print Preview
              </div>
              <div ref={naconRef}>
                <div style={{...F.form,border:'2px solid #000',padding:'16px 20px 20px',maxWidth:620,margin:'0 auto'}}>

                  {/* Letterhead */}
                  <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:6}}>
                    {/* Shield / crest placeholder */}
                    <div style={{width:56,height:56,border:'2px solid #000',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:7,fontWeight:'bold',textAlign:'center',padding:2,
                      flexShrink:0,lineHeight:1.2}}>
                      <span>NACON<br/>CREST</span>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:'bold',textDecoration:'underline',fontStyle:'italic',fontSize:15,marginBottom:2}}>
                        Nigerian Army College Of Nursing Yaba-Lagos
                      </div>
                      <div style={{fontWeight:'bold',fontStyle:'italic',fontSize:12,textAlign:'center'}}>
                        Civilian Prescription Form
                      </div>
                    </div>
                    <div style={{fontSize:9,fontWeight:'bold',textAlign:'right',minWidth:60}}>
                      NACON MRS
                    </div>
                  </div>

                  {/* Section A */}
                  <div style={{fontSize:11,fontWeight:'bold',marginBottom:6}}>
                    <span style={{marginRight:8}}>A.</span>Patient's Identification
                  </div>

                  {/* Name / Matric */}
                  <div style={{fontSize:11,marginBottom:6}}>
                    <span style={{fontWeight:'bold'}}>NAME:—</span>
                    <span style={{...F.line,minWidth:200}}>{nacon.patientName}</span>
                    <span style={{fontWeight:'bold',marginLeft:16}}>MATRIC NO:—</span>
                    <span style={{...F.line,minWidth:100}}>{nacon.matricNo}</span>
                  </div>

                  {/* Address / Age / Sex */}
                  <div style={{fontSize:11,marginBottom:6}}>
                    <span style={{fontWeight:'bold'}}>ADDRESS: —</span>
                    <span style={{...F.line,minWidth:130}}>{nacon.address}</span>
                    <span style={{fontWeight:'bold',marginLeft:12}}>AGE: —</span>
                    <span style={{...F.line,minWidth:50}}>{nacon.age}</span>
                    <span style={{fontWeight:'bold',marginLeft:8}}>SEX:—</span>
                    <span style={{...F.line,minWidth:50}}>{nacon.sex}</span>
                  </div>

                  {/* Class / Date / Tel */}
                  <div style={{fontSize:11,marginBottom:10}}>
                    <span style={{fontWeight:'bold'}}>CLASS: —</span>
                    <span style={{...F.line,minWidth:120}}>{nacon.class}</span>
                    <span style={{fontWeight:'bold',marginLeft:12}}>DATE: —</span>
                    <span style={{...F.line,minWidth:80}}>{nacon.date}</span>
                    <span style={{fontWeight:'bold',marginLeft:8}}>TEL: —</span>
                    <span style={{...F.line,minWidth:80}}>{nacon.tel}</span>
                  </div>

                  {/* Rx box */}
                  <div style={F.rxBox}>
                    <span style={F.rxSymbol}>R<sub style={{fontSize:14}}>x</sub></span>
                    <span style={{fontSize:12,whiteSpace:'pre-wrap'}}>{nacon.rx}</span>
                  </div>

                  {/* Prescriber */}
                  <div style={{display:'flex',justifyContent:'space-between',
                    alignItems:'flex-end',marginTop:10,fontSize:11}}>
                    <div>
                      <span style={{fontWeight:'bold'}}>PRESCRIBER'S NAME </span>
                      <span style={{...F.line,minWidth:160}}>{nacon.prescriberName}</span>
                    </div>
                    <div>
                      <span style={{fontWeight:'bold'}}>SIGNATURE </span>
                      <span style={{...F.line,minWidth:120}}></span>
                    </div>
                  </div>

                  {/* Section B */}
                  <div style={{fontSize:11,fontWeight:'bold',margin:'12px 0 6px'}}>
                    <span style={{marginRight:8}}>B.</span>Pharmacy Provider Identification
                  </div>
                  <div style={{fontSize:11}}>
                    <span style={{fontWeight:'bold'}}>TEL NO:—</span>
                    <span style={{...F.line,minWidth:200}}>{nacon.pharmacyTel}</span>
                    <span style={{fontWeight:'bold',marginLeft:20}}>SIGNATURE</span>
                    <span style={{...F.line,minWidth:140}}></span>
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
