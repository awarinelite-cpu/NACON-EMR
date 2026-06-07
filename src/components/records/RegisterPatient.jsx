// src/components/records/RegisterPatient.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { registerPatient, searchPatients } from '../../lib/emr';
import toast from 'react-hot-toast';

const EMPTY = {
  surname:'', firstName:'', otherNames:'',
  dob:'', sex:'', maritalStatus:'Single',
  religion:'', tribe:'', placeOfOrigin:'',
  matricNo:'', classSet:'', level:'', department:'Nursing Science',
  occupation:'Student', hmo:'',
  homeAddress:'', phone:'', email:'',
  nextOfKin:'', nextOfKinPhone:'', nextOfKinRelationship:'',
  knownAllergies:'', bloodGroup:'', genotype:'',
  xRayNumber:'',
};

export default function RegisterPatient() {
  const { profile }  = useAuth();
  const navigate     = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [generated, setGenerated] = useState(null);  // { emrNumber, folderNumber }
  const [dupCheck, setDupCheck]   = useState(null);  // possible duplicates
  const [checking, setChecking]   = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Check for duplicates before final save
  const checkDuplicates = async () => {
    if (!form.surname || !form.firstName) return;
    setChecking(true);
    const found = await searchPatients(`${form.surname} ${form.firstName}`);
    setDupCheck(found);
    setChecking(false);
  };

  const handleSave = async () => {
    if (!form.surname || !form.firstName) { toast.error('Surname and first name are required'); return; }
    if (!form.dob)      { toast.error('Date of birth is required'); return; }
    if (!form.sex)      { toast.error('Sex is required'); return; }
    if (!form.classSet) { toast.error('Class / SET is required'); return; }

    setSaving(true);
    try {
      const result = await registerPatient(form, profile?.displayName);
      setGenerated(result);
      toast.success(`Patient registered! EMR: ${result.emrNumber}`);
    } catch (err) {
      toast.error('Registration failed: ' + err.message);
    }
    setSaving(false);
  };

  // ── SUCCESS STATE ──
  if (generated) {
    return (
      <div>
        <div className="alert alert-ok" style={{ marginBottom:16 }}>
          <i className="ti ti-check-circle" style={{ fontSize:20 }} />
          <div>
            <div style={{ fontSize:14, fontWeight:700 }}>Patient registered successfully!</div>
            <div style={{ fontSize:12, marginTop:2 }}>
              {form.surname} {form.firstName} has been assigned a unique EMR number.
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom:14 }}>
          <div className="card-body">
            <div style={{ display:'flex', gap:24, alignItems:'center', flexWrap:'wrap' }}>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }}>
                  EMR Number
                </div>
                <div style={{ fontSize:28, fontWeight:700, color:'var(--accent)', fontFamily:'var(--mono)' }}>
                  {generated.emrNumber}
                </div>
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:4 }}>
                  Folder Number
                </div>
                <div style={{ fontSize:20, fontWeight:700, color:'var(--t2)', fontFamily:'var(--mono)' }}>
                  {generated.folderNumber}
                </div>
              </div>
            </div>
            <div className="alert alert-info mt-3">
              <i className="ti ti-info-circle" />
              <div style={{ fontSize:11 }}>
                Write <strong>{generated.emrNumber}</strong> on the patient's physical folder.
                This number is permanent and unique — it will never be reused.
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap' }}>
              <button className="btn btn-primary" onClick={() => navigate(`/records/patient/${generated.emrNumber}`)}>
                <i className="ti ti-folder-open" /> Open patient folder
              </button>
              <button className="btn" onClick={() => window.print()}>
                <i className="ti ti-printer" /> Print folder card
              </button>
              <button className="btn" onClick={() => { setForm(EMPTY); setGenerated(null); setDupCheck(null); }}>
                <i className="ti ti-user-plus" /> Register another patient
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth:900 }}>

      {/* EMR Banner */}
      <div className="emr-banner">
        <div style={{ width:42, height:42, borderRadius:10, background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <i className="ti ti-id-badge" style={{ fontSize:22, color:'#FFF' }} />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--info)', textTransform:'uppercase', letterSpacing:'.04em' }}>
            EMR Number
          </div>
          <div className="emr-number">Auto-generated on save</div>
          <div style={{ fontSize:11, color:'var(--t3)', fontWeight:500, marginTop:2 }}>
            Format: EMR-{new Date().getFullYear()}-XXXX · Unique · Cannot be changed after creation
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.04em' }}>Folder No.</div>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--t2)', fontFamily:'var(--mono)' }}>FN: XXXX/{String(new Date().getFullYear()).slice(2)}</div>
        </div>
      </div>

      {/* Duplicate check warning */}
      {dupCheck && dupCheck.length > 0 && (
        <div className="alert alert-warn mb-3">
          <i className="ti ti-alert-triangle" style={{ fontSize:18 }} />
          <div>
            <div style={{ fontWeight:700 }}>Possible duplicate — {dupCheck.length} patient(s) with similar name found:</div>
            {dupCheck.slice(0,3).map(p => (
              <div key={p.emrNumber} style={{ fontSize:11, marginTop:4 }}>
                <span style={{ fontFamily:'var(--mono)' }}>{p.emrNumber}</span> —
                &nbsp;{p.surname} {p.firstName} · {p.classSet}
                <button className="btn btn-sm" style={{ marginLeft:8, fontSize:10 }}
                  onClick={() => navigate(`/records/patient/${p.emrNumber}`)}>
                  View
                </button>
              </div>
            ))}
            <div style={{ fontSize:10, marginTop:6 }}>
              If this is the same person, open their existing folder instead of registering again.
            </div>
          </div>
        </div>
      )}

      {/* ── SECTION: IDENTITY ── */}
      <div className="card" style={{ marginBottom:12 }}>
        <div className="card-header">
          <div className="card-title"><i className="ti ti-user" />Identity</div>
        </div>
        <div className="card-body">
          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Surname<span className="req">*</span></label>
              <input className="form-input" placeholder="OKONKWO" value={form.surname}
                onChange={e => set('surname', e.target.value.toUpperCase())}
                onBlur={checkDuplicates} />
            </div>
            <div className="form-group">
              <label className="form-label">First name<span className="req">*</span></label>
              <input className="form-input" placeholder="Adaeze" value={form.firstName}
                onChange={e => set('firstName', e.target.value)}
                onBlur={checkDuplicates} />
            </div>
            <div className="form-group">
              <label className="form-label">Other names</label>
              <input className="form-input" placeholder="Chioma" value={form.otherNames}
                onChange={e => set('otherNames', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Date of birth<span className="req">*</span></label>
              <input className="form-input" type="date" value={form.dob}
                onChange={e => set('dob', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Sex<span className="req">*</span></label>
              <select className="form-select" value={form.sex}
                onChange={e => set('sex', e.target.value)}>
                <option value="">Select…</option>
                <option>Male</option><option>Female</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Marital status</label>
              <select className="form-select" value={form.maritalStatus}
                onChange={e => set('maritalStatus', e.target.value)}>
                {['Single','Married','Divorced','Widowed'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Religion</label>
              <input className="form-input" placeholder="e.g. Christian" value={form.religion}
                onChange={e => set('religion', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Tribe / ethnicity</label>
              <input className="form-input" placeholder="e.g. Igbo" value={form.tribe}
                onChange={e => set('tribe', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Place of origin</label>
              <input className="form-input" placeholder="e.g. Anambra State" value={form.placeOfOrigin}
                onChange={e => set('placeOfOrigin', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION: ACADEMIC (search criteria) ── */}
      <div className="card" style={{ marginBottom:12 }}>
        <div className="card-header">
          <div className="card-title"><i className="ti ti-school" />Academic Info — used for patient search</div>
          <span className="badge badge-info">Search criteria</span>
        </div>
        <div className="card-body">
          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Matric / Reg number<span className="req">*</span></label>
              <input className="form-input" placeholder="NACON/2023/0041" value={form.matricNo}
                onChange={e => set('matricNo', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Class / SET<span className="req">*</span></label>
              <input className="form-input" placeholder="e.g. SET 49" value={form.classSet}
                onChange={e => set('classSet', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Level / Year</label>
              <select className="form-select" value={form.level}
                onChange={e => set('level', e.target.value)}>
                <option value="">Select…</option>
                {['Year 1','Year 2','Year 3','Year 4','Year 5'].map(y=><option key={y}>{y}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Department</label>
              <input className="form-input" value={form.department}
                onChange={e => set('department', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Occupation / Status</label>
              <input className="form-input" value={form.occupation}
                onChange={e => set('occupation', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">HMO / NHIS ID</label>
              <input className="form-input" placeholder="e.g. NHIS · ZONAL/79/1661" value={form.hmo}
                onChange={e => set('hmo', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION: CONTACT ── */}
      <div className="card" style={{ marginBottom:12 }}>
        <div className="card-header">
          <div className="card-title"><i className="ti ti-phone" />Contact Details</div>
        </div>
        <div className="card-body">
          <div className="form-grid-3">
            <div className="form-group form-span-3">
              <label className="form-label">Home address</label>
              <input className="form-input" placeholder="14 Apapa Road, Yaba, Lagos" value={form.homeAddress}
                onChange={e => set('homeAddress', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone / Tel</label>
              <input className="form-input" type="tel" placeholder="08031234567" value={form.phone}
                onChange={e => set('phone', e.target.value)} />
            </div>
            <div className="form-group form-span-2">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="patient@email.com" value={form.email}
                onChange={e => set('email', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION: NEXT OF KIN ── */}
      <div className="card" style={{ marginBottom:12 }}>
        <div className="card-header">
          <div className="card-title"><i className="ti ti-users" />Next of Kin</div>
        </div>
        <div className="card-body">
          <div className="form-grid-3">
            <div className="form-group form-span-2">
              <label className="form-label">Name &amp; address of next of kin</label>
              <input className="form-input" placeholder="Mrs. Ngozi Okonkwo · 12 Marina Road" value={form.nextOfKin}
                onChange={e => set('nextOfKin', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Relationship</label>
              <input className="form-input" placeholder="Mother" value={form.nextOfKinRelationship}
                onChange={e => set('nextOfKinRelationship', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Next of kin phone</label>
              <input className="form-input" type="tel" placeholder="08057891234" value={form.nextOfKinPhone}
                onChange={e => set('nextOfKinPhone', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION: MEDICAL BACKGROUND ── */}
      <div className="card" style={{ marginBottom:12 }}>
        <div className="card-header">
          <div className="card-title"><i className="ti ti-heart-rate-monitor" />Medical Background</div>
        </div>
        <div className="card-body">
          <div className="form-grid-3">
            <div className="form-group">
              <label className="form-label">Blood group</label>
              <select className="form-select" value={form.bloodGroup}
                onChange={e => set('bloodGroup', e.target.value)}>
                <option value="">Unknown</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g=><option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Genotype</label>
              <select className="form-select" value={form.genotype}
                onChange={e => set('genotype', e.target.value)}>
                <option value="">Unknown</option>
                {['AA','AS','SS','AC','SC'].map(g=><option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">X-ray number</label>
              <input className="form-input" placeholder="XR-" value={form.xRayNumber}
                onChange={e => set('xRayNumber', e.target.value)} />
            </div>
            <div className="form-group form-span-3">
              <label className="form-label">Known allergies</label>
              <input className="form-input" placeholder="e.g. Penicillin, Sulfa drugs (leave blank if none)"
                value={form.knownAllergies} onChange={e => set('knownAllergies', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── ACTIONS ── */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', padding:'4px 0 20px' }}>
        <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}>
          {saving
            ? <><i className="ti ti-loader-2" style={{ animation:'spin 1s linear infinite' }} /> Registering…</>
            : <><i className="ti ti-user-check" /> Save &amp; Generate EMR Number</>
          }
        </button>
        <button className="btn btn-lg" onClick={() => setForm(EMPTY)}>
          <i className="ti ti-eraser" /> Clear form
        </button>
        <button className="btn btn-lg" onClick={() => navigate(-1)}>
          <i className="ti ti-arrow-left" /> Cancel
        </button>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
