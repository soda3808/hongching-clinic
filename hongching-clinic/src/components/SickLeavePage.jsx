import { useState, useMemo, useRef } from 'react';
import { saveSickLeave, deleteSickLeave } from '../api';
import { uid, fmtM, getMonth } from '../data';
import { getTenantStoreNames, getClinicName, getClinicNameEn, getTenantDoctors, getTenantStores, getTenantSettings } from '../tenant';
import { useFocusTrap, nullRef } from './ConfirmModal';
import ConfirmModal from './ConfirmModal';
import SignaturePad, { SignaturePreview } from './SignaturePad';

export default function SickLeavePage({ data, setData, showToast, allData, user }) {
  const DOCTORS = getTenantDoctors();
  const storeNames = getTenantStoreNames();
  const stores = getTenantStores();
  const clinicName = getClinicName();
  const clinicNameEn = getClinicNameEn();

  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [printItem, setPrintItem] = useState(null);
  const [form, setForm] = useState({ patientName: '', patientPhone: '', doctor: DOCTORS[0], store: storeNames[0] || '', diagnosis: '', startDate: '', endDate: '', days: 1, notes: '' });
  const [saving, setSaving] = useState(false);
  const [patientSuggestions, setPatientSuggestions] = useState([]);
  const [filterDoc, setFilterDoc] = useState('all');
  const [showSigPad, setShowSigPad] = useState(false);
  const [doctorSig, setDoctorSig] = useState(() => sessionStorage.getItem(`hcmc_sig_doctor_${user?.name || ''}`) || '');

  const modalRef = useRef(null);
  useFocusTrap(showModal ? modalRef : nullRef);

  const sickleaves = data.sickleaves || [];
  const patients = allData?.patients || data.patients || [];
  const thisMonth = new Date().toISOString().substring(0, 7);

  const stats = useMemo(() => ({
    total: sickleaves.length,
    thisMonth: sickleaves.filter(s => getMonth(s.issuedAt || s.startDate) === thisMonth).length,
    byDoctor: DOCTORS.reduce((acc, d) => { acc[d] = sickleaves.filter(s => s.doctor === d).length; return acc; }, {}),
  }), [sickleaves, thisMonth]);

  const list = useMemo(() => {
    let l = [...sickleaves].sort((a, b) => (b.issuedAt || b.startDate || '').localeCompare(a.issuedAt || a.startDate || ''));
    if (search) {
      const q = search.toLowerCase();
      l = l.filter(s => s.patientName.toLowerCase().includes(q) || (s.diagnosis || '').toLowerCase().includes(q));
    }
    if (filterDoc !== 'all') l = l.filter(s => s.doctor === filterDoc);
    return l;
  }, [sickleaves, search, filterDoc]);

  const handlePatientSearch = (val) => {
    setForm(f => ({ ...f, patientName: val }));
    if (val.length > 0) {
      setPatientSuggestions(patients.filter(p => p.name.includes(val)).slice(0, 6));
    } else {
      setPatientSuggestions([]);
    }
  };

  const selectPatient = (p) => {
    setForm(f => ({ ...f, patientName: p.name, patientPhone: p.phone, store: p.store || f.store, doctor: p.doctor || f.doctor }));
    setPatientSuggestions([]);
  };

  const calcDays = (start, end) => {
    if (!start || !end) return 1;
    const d = Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1;
    return Math.max(1, d);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.patientName || !form.startDate || !form.endDate) return showToast('請填寫必要欄位');
    setSaving(true);
    const record = {
      id: uid(),
      ...form,
      days: calcDays(form.startDate, form.endDate),
      issuedAt: new Date().toISOString().substring(0, 10),
      createdBy: user?.name || '',
      doctorSignature: doctorSig || '',
    };
    await saveSickLeave(record);
    setData({ ...data, sickleaves: [...sickleaves, record] });
    setShowModal(false);
    setSaving(false);
    setForm({ patientName: '', patientPhone: '', doctor: DOCTORS[0], store: storeNames[0] || '', diagnosis: '', startDate: '', endDate: '', days: 1, notes: '' });
    showToast('假紙已新增');
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteSickLeave(deleteId);
    setData({ ...data, sickleaves: sickleaves.filter(s => s.id !== deleteId) });
    showToast('已刪除');
    setDeleteId(null);
  };

  const handlePrint = (item) => {
    const clinic = (() => { try { return JSON.parse(localStorage.getItem('hcmc_clinic') || '{}'); } catch { return {}; } })();
    const certNo = `SL-${(item.issuedAt || '').replace(/-/g, '')}-${(item.id || '').substring(0, 6).toUpperCase()}`;
    const w = window.open('', '_blank');
    if (!w) return showToast('請允許彈出視窗');
    w.document.write(`<!DOCTYPE html><html><head><title>病假證明書 / Medical Certificate</title><style>
      body{font-family:'Microsoft YaHei','Arial',sans-serif;padding:40px 50px;max-width:700px;margin:0 auto;color:#333}
      .header{text-align:center;border-bottom:3px double #0e7490;padding-bottom:16px;margin-bottom:8px}
      .header h1{font-size:18px;color:#0e7490;margin:0}
      .header h2{font-size:13px;color:#0e7490;margin:2px 0;font-weight:400;letter-spacing:1px}
      .header p{font-size:11px;color:#888;margin:3px 0}
      .cert-no{text-align:right;font-size:11px;color:#888;margin-bottom:4px}
      .title{text-align:center;font-size:18px;font-weight:800;margin:16px 0;color:#0e7490;letter-spacing:3px}
      .title-en{text-align:center;font-size:12px;color:#666;margin:-10px 0 20px;letter-spacing:1px}
      .field{display:flex;margin:10px 0;font-size:13px}
      .field .label{width:160px;font-weight:700;color:#555}
      .field .label-en{font-weight:400;color:#999;font-size:11px}
      .field .value{flex:1;border-bottom:1px solid #ddd;padding-bottom:4px}
      .body-text{font-size:13px;line-height:1.8;margin:20px 0;padding:16px;background:#f9fafb;border-radius:8px;border-left:4px solid #0e7490}
      .sig{margin-top:50px;display:flex;justify-content:space-between}
      .sig-box{text-align:center;width:200px}
      .sig-line{border-top:1px solid #333;margin-top:60px;padding-top:4px;font-size:11px}
      .footer{margin-top:40px;text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:12px}
      @media print{body{padding:20px 30px}}
    </style></head><body>
      <div class="header">
        <h1>${clinic.name || clinicName}</h1>
        <h2>${clinic.nameEn || clinicNameEn}</h2>
        <p>${(() => { const s = stores.find(st => st.name === item.store); return s?.address ? s.address : (clinic.addr1 || ''); })()}</p>
        <p>Tel: ${clinic.tel || getTenantSettings().phone || ''}</p>
      </div>
      <div class="cert-no">證明書編號 Cert No.: ${certNo}</div>
      <div class="title">病 假 證 明 書</div>
      <div class="title-en">MEDICAL CERTIFICATE FOR SICK LEAVE</div>
      <div class="body-text">
        茲證明 <strong>${item.patientName}</strong> 於 <strong>${item.issuedAt}</strong> 到本醫療中心就診，經診斷後建議病假休息，日期由 <strong>${item.startDate}</strong> 至 <strong>${item.endDate}</strong>，共 <strong>${item.days}</strong> 天。
      </div>
      <div class="body-text" style="font-size:12px;color:#666;background:#fff;border-left-color:#ccc">
        This is to certify that <strong>${item.patientName}</strong> attended this medical centre on <strong>${item.issuedAt}</strong> and is granted sick leave from <strong>${item.startDate}</strong> to <strong>${item.endDate}</strong>, a total of <strong>${item.days}</strong> day(s).
      </div>
      <div class="field"><span class="label">診斷 Diagnosis：</span><span class="value">${item.diagnosis || '-'}</span></div>
      ${item.notes ? `<div class="field"><span class="label">備註 Remarks：</span><span class="value">${item.notes}</span></div>` : ''}
      <div class="field"><span class="label">簽發日期 Date：</span><span class="value">${item.issuedAt}</span></div>
      <div class="sig">
        <div class="sig-box">${item.doctorSignature ? `<img src="${item.doctorSignature}" style="height:50px;object-fit:contain;display:block;margin:0 auto 4px" />` : '<div style="margin-top:60px"></div>'}<div class="sig-line">主診醫師 Attending Practitioner<br/>${item.doctor}</div></div>
        <div class="sig-box"><div style="margin-top:60px"></div><div class="sig-line">診所蓋章 Clinic Stamp</div></div>
      </div>
      <div class="footer">此證明書僅供病假證明用途 This certificate is issued for sick leave purposes only.${item.doctorSignature ? ' | 已電子簽署 Digitally Signed' : ''}<br/>${certNo} | ${clinic.name || clinicName}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">總簽發數</div><div className="stat-value teal">{stats.total}</div></div>
        <div className="stat-card gold"><div className="stat-label">本月簽發</div><div className="stat-value gold">{stats.thisMonth}</div></div>
        {DOCTORS.slice(0, 2).map(d => (
          <div key={d} className="stat-card green"><div className="stat-label">{d}</div><div className="stat-value green">{stats.byDoctor[d] || 0}</div></div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ flex: 1, minWidth: 200 }} placeholder="搜尋病人或診斷..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ width: 'auto' }} value={filterDoc} onChange={e => setFilterDoc(e.target.value)}>
          <option value="all">全部醫師</option>{DOCTORS.map(d => <option key={d}>{d}</option>)}
        </select>
        <button className="btn btn-teal" onClick={() => setShowModal(true)}>+ 新增假紙</button>
      </div>

      {/* List */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header"><h3>假紙記錄 ({list.length})</h3></div>
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr><th>簽發日期</th><th>病人</th><th>診斷</th><th>病假日期</th><th>天數</th><th>醫師</th><th>店舖</th><th>操作</th></tr>
            </thead>
            <tbody>
              {!list.length && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無假紙記錄</td></tr>}
              {list.map(s => (
                <tr key={s.id}>
                  <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>{s.issuedAt}</td>
                  <td style={{ fontWeight: 600 }}>{s.patientName}</td>
                  <td>{s.diagnosis || '-'}</td>
                  <td style={{ fontSize: 12 }}>{s.startDate} ~ {s.endDate}</td>
                  <td><span className="tag tag-pending-orange">{s.days} 天</span></td>
                  <td>{s.doctor}</td>
                  <td style={{ fontSize: 11 }}>{s.store}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {s.doctorSignature && <span style={{ fontSize: 9, color: 'var(--green-600)', fontWeight: 600 }}>已簽</span>}
                      <button className="btn btn-teal btn-sm" onClick={() => handlePrint(s)}>列印</button>
                      <button className="btn btn-red btn-sm" onClick={() => setDeleteId(s.id)}>刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)} role="dialog" aria-modal="true" aria-label="新增假紙">
          <div className="modal" onClick={e => e.stopPropagation()} ref={modalRef} style={{ maxWidth: 550 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>新增假紙</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowModal(false)} aria-label="關閉">✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div style={{ position: 'relative' }}>
                  <label>病人姓名 *</label>
                  <input value={form.patientName} onChange={e => handlePatientSearch(e.target.value)} onBlur={() => setTimeout(() => setPatientSuggestions([]), 150)} placeholder="輸入姓名搜尋" />
                  {patientSuggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 160, overflowY: 'auto' }}>
                      {patientSuggestions.map(p => (
                        <div key={p.id} onMouseDown={() => selectPatient(p)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--gray-100)' }}>{p.name} — {p.phone}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div><label>電話</label><input value={form.patientPhone} onChange={e => setForm({ ...form, patientPhone: e.target.value })} /></div>
              </div>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div><label>醫師</label>
                  <select value={form.doctor} onChange={e => setForm({ ...form, doctor: e.target.value })}>
                    {DOCTORS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div><label>店舖</label>
                  <select value={form.store} onChange={e => setForm({ ...form, store: e.target.value })}>
                    {storeNames.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>診斷</label>
                <input value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} placeholder="例：感冒、腰痛" />
              </div>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div><label>病假開始 *</label><input type="date" value={form.startDate} onChange={e => { setForm(f => ({ ...f, startDate: e.target.value, days: calcDays(e.target.value, f.endDate) })); }} /></div>
                <div><label>病假結束 *</label><input type="date" value={form.endDate} onChange={e => { setForm(f => ({ ...f, endDate: e.target.value, days: calcDays(f.startDate, e.target.value) })); }} /></div>
                <div><label>天數</label><input type="number" value={form.days} readOnly style={{ background: 'var(--gray-100)' }} /></div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>備註</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="選填" />
              </div>
              {/* Doctor Signature */}
              <div style={{ marginBottom: 16 }}>
                <label>醫師簽名</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  {doctorSig ? (
                    <>
                      <SignaturePreview src={doctorSig} label={form.doctor} height={45} />
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowSigPad(true)}>重新簽名</button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowSigPad(true)} style={{ padding: '8px 16px' }}>簽名 Sign</button>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-teal" disabled={saving}>{saving ? '儲存中...' : '新增假紙'}</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId && <ConfirmModal message="確認刪除此假紙記錄？" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />}

      {/* Signature Pad */}
      {showSigPad && (
        <SignaturePad
          title="醫師簽名"
          label={`${form.doctor || user?.name || '醫師'} — 簽發病假證明書`}
          cacheKey={`doctor_${user?.name || ''}`}
          onConfirm={(sig) => { setDoctorSig(sig); setShowSigPad(false); showToast('簽名已記錄'); }}
          onCancel={() => setShowSigPad(false)}
        />
      )}
    </>
  );
}
