import { useState, useMemo } from 'react';
import { uid, getDoctors } from '../data';
import { getClinicName, getClinicNameEn, getTenantStores, getTenantSettings } from '../tenant';

const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_med_certs';

const CERT_TYPES = [
  { value: 'diagnosis', label: '診斷證明書', labelEn: 'Diagnosis Certificate' },
  { value: 'referral', label: '轉介信', labelEn: 'Referral Letter' },
  { value: 'attendance', label: '到診證明', labelEn: 'Attendance Certificate' },
  { value: 'report', label: '醫療報告', labelEn: 'Medical Report' },
  { value: 'fitness', label: '適合/不適合工作證明', labelEn: 'Fitness for Work Certificate' },
];

const typeLabel = (v) => CERT_TYPES.find(t => t.value === v)?.label || v;
const typeLabelEn = (v) => CERT_TYPES.find(t => t.value === v)?.labelEn || v;

function genCertNo(date) {
  const d = (date || new Date().toISOString().substring(0, 10)).replace(/-/g, '');
  const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
  return `MC-${d}-${seq}`;
}

function getTemplate(type, patient, doctor, date) {
  const n = patient || '________';
  const d = date || '________';
  const dr = doctor || '________';
  const templates = {
    diagnosis: `茲證明 ${n} 於 ${d} 到本診所就診，經 ${dr} 醫師診斷，患有以下病症：\n\n診斷：________\n\n建議治療方案：________\n\n特此證明。`,
    referral: `敬啟者：\n\n本診所病人 ${n} 因 ________ 於 ${d} 到本診所求診。經初步診斷及治療後，現轉介至　貴院/貴診所作進一步檢查及治療。\n\n臨床摘要：________\n已進行治療：________\n\n煩請　跟進。\n\n此致`,
    attendance: `茲證明 ${n} 於 ${d} 到本診所就診。\n\n到診時間：________\n離開時間：________\n\n特此證明。`,
    report: `病人姓名：${n}\n就診日期：${d}\n主診醫師：${dr}\n\n一、主訴：________\n二、病史：________\n三、檢查所見：________\n四、診斷：________\n五、治療經過：________\n六、目前狀況：________\n七、建議：________`,
    fitness: `茲證明 ${n} 於 ${d} 到本診所就診，經 ${dr} 醫師診斷後，認為該病人：\n\n[ ] 適合恢復工作\n[ ] 不適合工作，建議休息至 ________\n[ ] 適合輕度工作，不宜 ________\n\n備註：________\n\n特此證明。`,
  };
  return templates[type] || '';
}

function loadCerts() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
function saveCerts(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }

export default function MedicalCertificate({ data, showToast, user }) {
  const DOCTORS = getDoctors();
  const clinicName = getClinicName();
  const clinicNameEn = getClinicNameEn();
  const stores = getTenantStores();
  const settings = getTenantSettings();

  const [certs, setCerts] = useState(loadCerts);
  const [view, setView] = useState('list'); // list | form
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [form, setForm] = useState({
    patientName: '', patientPhone: '', type: 'diagnosis',
    doctor: DOCTORS[0] || '', date: new Date().toISOString().substring(0, 10),
    content: getTemplate('diagnosis', '', DOCTORS[0] || '', new Date().toISOString().substring(0, 10)),
  });
  const [suggestions, setSuggestions] = useState([]);

  const patients = data?.patients || [];

  const list = useMemo(() => {
    let l = [...certs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (search) {
      const q = search.toLowerCase();
      l = l.filter(c => (c.patientName || '').toLowerCase().includes(q) || (c.certNo || '').toLowerCase().includes(q));
    }
    if (filterType !== 'all') l = l.filter(c => c.type === filterType);
    return l;
  }, [certs, search, filterType]);

  const stats = useMemo(() => {
    const thisMonth = new Date().toISOString().substring(0, 7);
    return {
      total: certs.length,
      thisMonth: certs.filter(c => (c.date || '').substring(0, 7) === thisMonth).length,
      byType: CERT_TYPES.reduce((a, t) => { a[t.value] = certs.filter(c => c.type === t.value).length; return a; }, {}),
    };
  }, [certs]);

  const handlePatientSearch = (val) => {
    setForm(f => ({ ...f, patientName: val }));
    if (val.length > 0) {
      setSuggestions(patients.filter(p => p.name.includes(val)).slice(0, 6));
    } else { setSuggestions([]); }
  };

  const selectPatient = (p) => {
    setForm(f => ({ ...f, patientName: p.name, patientPhone: p.phone || '' }));
    setSuggestions([]);
  };

  const handleTypeChange = (type) => {
    setForm(f => ({ ...f, type, content: getTemplate(type, f.patientName, f.doctor, f.date) }));
  };

  const openForm = () => {
    setForm({
      patientName: '', patientPhone: '', type: 'diagnosis',
      doctor: DOCTORS[0] || '', date: new Date().toISOString().substring(0, 10),
      content: getTemplate('diagnosis', '', DOCTORS[0] || '', new Date().toISOString().substring(0, 10)),
    });
    setView('form');
  };

  const handleSave = () => {
    if (!form.patientName) return showToast('請填寫病人姓名');
    if (!form.content.trim()) return showToast('請填寫證明內容');
    const record = {
      id: uid(), certNo: genCertNo(form.date), patientName: form.patientName,
      patientPhone: form.patientPhone, type: form.type, doctor: form.doctor,
      date: form.date, content: form.content, createdBy: user?.name || '',
      createdAt: new Date().toISOString(),
    };
    const updated = [...certs, record];
    setCerts(updated);
    saveCerts(updated);
    showToast('證明書已建立');
    setView('list');
  };

  const handleDelete = (id) => {
    const updated = certs.filter(c => c.id !== id);
    setCerts(updated);
    saveCerts(updated);
    showToast('已刪除');
  };

  const handlePrint = (item) => {
    const storeAddr = stores[0]?.address || '';
    const tel = settings.phone || '';
    const w = window.open('', '_blank');
    if (!w) return showToast('請允許彈出視窗');
    w.document.write(`<!DOCTYPE html><html><head><title>${typeLabel(item.type)} - ${item.patientName}</title><style>
      body{font-family:'Microsoft YaHei','Arial',sans-serif;padding:40px 50px;max-width:700px;margin:0 auto;color:#333}
      .header{text-align:center;border-bottom:3px double ${ACCENT};padding-bottom:16px;margin-bottom:8px}
      .header h1{font-size:18px;color:${ACCENT};margin:0}
      .header h2{font-size:13px;color:${ACCENT};margin:2px 0;font-weight:400;letter-spacing:1px}
      .header p{font-size:11px;color:#888;margin:3px 0}
      .cert-no{text-align:right;font-size:11px;color:#888;margin-bottom:4px}
      .title{text-align:center;font-size:18px;font-weight:800;margin:16px 0;color:${ACCENT};letter-spacing:3px}
      .title-en{text-align:center;font-size:12px;color:#666;margin:-10px 0 20px;letter-spacing:1px}
      .content{font-size:13px;line-height:2;white-space:pre-wrap;margin:20px 0;padding:20px;min-height:200px}
      .sig{margin-top:50px;display:flex;justify-content:space-between}
      .sig-box{text-align:center;width:200px}
      .sig-line{border-top:1px solid #333;margin-top:60px;padding-top:4px;font-size:11px}
      .footer{margin-top:40px;text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:12px}
      @media print{body{padding:20px 30px}}
    </style></head><body>
      <div class="header">
        <h1>${clinicName}</h1>
        <h2>${clinicNameEn}</h2>
        <p>${storeAddr}</p>
        <p>Tel: ${tel}</p>
      </div>
      <div class="cert-no">編號 Cert No.: ${item.certNo}</div>
      <div class="title">${typeLabel(item.type)}</div>
      <div class="title-en">${typeLabelEn(item.type).toUpperCase()}</div>
      <div class="content">${(item.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      <div class="sig">
        <div class="sig-box"><div class="sig-line">主診醫師 Attending Practitioner<br/>${item.doctor}</div></div>
        <div class="sig-box"><div class="sig-line">診所蓋章 Clinic Stamp</div></div>
      </div>
      <div class="footer">此證明書由 ${clinicName} 簽發 | ${item.certNo} | 簽發日期：${item.date}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const typeBadgeColors = {
    diagnosis: { bg: '#e0f2fe', fg: '#0369a1' },
    referral: { bg: '#fef3c7', fg: '#92400e' },
    attendance: { bg: '#d1fae5', fg: '#065f46' },
    report: { bg: '#ede9fe', fg: '#5b21b6' },
    fitness: { bg: '#fee2e2', fg: '#991b1b' },
  };

  const S = {
    badge: (type) => {
      const c = typeBadgeColors[type] || { bg: '#f3f4f6', fg: '#374151' };
      return { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg };
    },
    preview: { fontSize: 11, color: '#888', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  };

  // ── Form View ──
  if (view === 'form') return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-outline btn-sm" onClick={() => setView('list')}>← 返回</button>
        <h3 style={{ margin: 0 }}>新增醫療證明書</h3>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <label>病人姓名 *</label>
            <input value={form.patientName} onChange={e => handlePatientSearch(e.target.value)} onBlur={() => setTimeout(() => setSuggestions([]), 150)} placeholder="輸入姓名搜尋" />
            {suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 160, overflowY: 'auto' }}>
                {suggestions.map(p => (
                  <div key={p.id} onMouseDown={() => selectPatient(p)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>{p.name} — {p.phone}</div>
                ))}
              </div>
            )}
          </div>
          <div><label>電話</label><input value={form.patientPhone} onChange={e => setForm({ ...form, patientPhone: e.target.value })} /></div>
        </div>
        <div className="grid-3" style={{ marginBottom: 12 }}>
          <div>
            <label>證明書類型 *</label>
            <select value={form.type} onChange={e => handleTypeChange(e.target.value)}>
              {CERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label>醫師</label>
            <select value={form.doctor} onChange={e => setForm({ ...form, doctor: e.target.value })}>
              {DOCTORS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div><label>日期</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>證明內容 *</label>
          <textarea rows={10} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} style={{ width: '100%', fontFamily: 'inherit', lineHeight: 1.8 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-teal" onClick={handleSave}>建立證明書</button>
          <button className="btn btn-outline" onClick={() => setView('list')}>取消</button>
        </div>
      </div>
    </div>
  );

  // ── List View ──
  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">總簽發數</div><div className="stat-value teal">{stats.total}</div></div>
        <div className="stat-card gold"><div className="stat-label">本月簽發</div><div className="stat-value gold">{stats.thisMonth}</div></div>
        <div className="stat-card green"><div className="stat-label">診斷證明</div><div className="stat-value green">{stats.byType.diagnosis || 0}</div></div>
        <div className="stat-card blue"><div className="stat-label">轉介信</div><div className="stat-value blue">{stats.byType.referral || 0}</div></div>
      </div>

      {/* Type Summary */}
      {certs.length > 0 && (
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CERT_TYPES.map(t => (
              <span key={t.value} style={{ ...S.badge(t.value), cursor: 'pointer', opacity: filterType === 'all' || filterType === t.value ? 1 : 0.4 }}
                onClick={() => setFilterType(filterType === t.value ? 'all' : t.value)}>
                {t.label} ({stats.byType[t.value] || 0})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ flex: 1, minWidth: 200 }} placeholder="搜尋病人或編號..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ width: 'auto' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">全部類型</option>
          {CERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button className="btn btn-teal" onClick={openForm}>+ 新增證明書</button>
      </div>

      {/* Certificate List */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header"><h3>醫療證明書記錄 ({list.length})</h3></div>
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr><th>編號</th><th>日期</th><th>病人</th><th>類型</th><th>醫師</th><th>建立者</th><th>操作</th></tr>
            </thead>
            <tbody>
              {!list.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無證明書記錄</td></tr>}
              {list.map(c => (
                <tr key={c.id}>
                  <td style={{ fontSize: 11, fontFamily: 'monospace', color: '#888' }}>{c.certNo}</td>
                  <td style={{ fontSize: 12 }}>{c.date}</td>
                  <td style={{ fontWeight: 600 }}>{c.patientName}</td>
                  <td><span style={S.badge(c.type)}>{typeLabel(c.type)}</span></td>
                  <td>{c.doctor}</td>
                  <td style={{ fontSize: 11, color: '#888' }}>{c.createdBy || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-teal btn-sm" onClick={() => handlePrint(c)}>列印</button>
                      <button className="btn btn-red btn-sm" onClick={() => handleDelete(c.id)}>刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
