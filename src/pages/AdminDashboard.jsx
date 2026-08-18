// src/pages/AdminDashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { listenPatients, getTodayStats, getAllUsers } from '../lib/emr';
import { exportFullBackupJSON, exportCollectionCSV, BACKUP_COLLECTIONS } from '../lib/exportBackup';
import toast from 'react-hot-toast';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [stats,   setStats]   = useState({});
  const [users,   setUsers]   = useState([]);
  const [patients,setPatients]= useState([]);
  const [exporting, setExporting] = useState(false); // full backup in progress
  const [exportingCol, setExportingCol] = useState(null); // single-collection CSV in progress ('' key)
  const [csvCol, setCsvCol] = useState(BACKUP_COLLECTIONS[0].key);

  useEffect(() => {
    getTodayStats().then(setStats);
    getAllUsers().then(setUsers);
    const unsub = listenPatients(setPatients);
    return unsub;
  }, []);

  const roleBadge = r => ({
    doctor:'badge-ok', nurse:'badge-info', records:'badge-warn',
    admin:'badge-danger', subadmin:'badge-neutral',
  }[r]||'badge-neutral');

  const handleFullBackup = async () => {
    setExporting(true);
    try {
      await exportFullBackupJSON({ performedBy: profile?.displayName || profile?.email, performedByRole: profile?.role });
      toast.success('Backup downloaded');
    } catch (e) {
      console.error('Full backup export failed:', e);
      toast.error('Export failed: ' + (e?.message || String(e)));
    }
    setExporting(false);
  };

  const handleCsvExport = async () => {
    setExportingCol(csvCol);
    try {
      await exportCollectionCSV(csvCol, { performedBy: profile?.displayName || profile?.email, performedByRole: profile?.role });
      toast.success('CSV downloaded');
    } catch (e) {
      console.error('CSV export failed:', e);
      toast.error('Export failed: ' + (e?.message || String(e)));
    }
    setExportingCol(null);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <div className="topbar-title">Admin Dashboard</div>
        <button className="btn" onClick={()=>navigate('/admin/users')}>
          <i className="ti ti-user-cog" /> Manage users
        </button>
        <button className="btn" onClick={()=>navigate('/admin/patients/bulk-import')}>
          <i className="ti ti-file-upload" /> Bulk import patients
        </button>
        <button className="btn btn-primary" onClick={()=>navigate('/admin/users')}>
          <i className="ti ti-user-plus" /> Add staff user
        </button>
      </div>
      <div className="page-content">
        <div className="stats-grid">
          {[
            { label:'Total patients',  value:stats.totalPatients||0,  icon:'ti-users',     color:'var(--accent)'  },
            { label:'Staff accounts',  value:users.length,            icon:'ti-user-cog',  color:'var(--info)'    },
            { label:'Visits today',    value:stats.visitsToday||0,    icon:'ti-stethoscope',color:'var(--success)'},
            { label:'Referrals today', value:stats.referred||0,       icon:'ti-file-export',color:'var(--warn)'   },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label"><i className={`ti ${s.icon}`} style={{color:s.color}} />{s.label}</div>
              <div className="stat-value">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{marginBottom:12}}>
          <div className="card-header">
            <div className="card-title"><i className="ti ti-database-export" />Data Export &amp; Backup</div>
          </div>
          <div className="card-body">
            <p style={{fontSize:11,color:'var(--t3)',marginBottom:12,lineHeight:1.6}}>
              For records-retention requirements. Full backup includes every patient, visit, vitals,
              prescription, care plan, lab, and audit record as one restorable JSON file. Every export
              is itself logged to the audit trail.
            </p>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:12}}>
              <button className="btn btn-primary" onClick={handleFullBackup} disabled={exporting}>
                {exporting
                  ? <><i className="ti ti-loader-2" style={{animation:'spin 1s linear infinite'}} /> Exporting…</>
                  : <><i className="ti ti-download" /> Export full backup (JSON)</>
                }
              </button>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              <select className="form-input" style={{width:'auto',minWidth:180}}
                value={csvCol} onChange={e=>setCsvCol(e.target.value)}>
                {BACKUP_COLLECTIONS.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <button className="btn" onClick={handleCsvExport} disabled={!!exportingCol}>
                {exportingCol
                  ? <><i className="ti ti-loader-2" style={{animation:'spin 1s linear infinite'}} /> Exporting…</>
                  : <><i className="ti ti-file-spreadsheet" /> Export as CSV</>
                }
              </button>
            </div>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div className="card">
            <div className="card-header">
              <div className="card-title"><i className="ti ti-user-cog" />Staff accounts</div>
              <span className="card-action" onClick={()=>navigate('/admin/users')}>Manage →</span>
            </div>
            {users.map(u => (
              <div key={u.uid} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',borderBottom:'1px solid var(--border)'}}>
                <div style={{width:30,height:30,borderRadius:'50%',background:'var(--accent-bg)',
                  color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:11,fontWeight:700,flexShrink:0}}>
                  {(u.displayName||'U').slice(0,2).toUpperCase()}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--t1)'}}>{u.displayName}</div>
                  <div style={{fontSize:10,color:'var(--t3)'}}>{u.email}</div>
                </div>
                <span className={`badge ${roleBadge(u.role)}`}>{u.role}</span>
                <span className={`badge ${u.active?'badge-ok':'badge-neutral'}`}>
                  {u.active?'Active':'Inactive'}
                </span>
              </div>
            ))}
            {users.length===0&&<div style={{padding:16,textAlign:'center',color:'var(--t3)',fontWeight:700}}>No staff users yet</div>}
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title"><i className="ti ti-activity" />Recent activity</div>
            </div>
            {patients.slice(0,6).map(p => (
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',borderBottom:'1px solid var(--border)'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:'var(--accent)',flexShrink:0}} />
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--t1)'}}>Patient registered</div>
                  <div style={{fontSize:10,color:'var(--t3)'}}>{p.surname} {p.firstName} — {p.emrNumber}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
