import { useState, useMemo } from 'react';
import { uid, getDoctors } from '../data';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_referrals';
const load = () => JSON.parse(localStorage.getItem(LS_KEY) || '[]');
const save = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));
const ACCENT = '#0e7490';
const TYPES = ['內部轉介', '外部轉介', '專科轉介'];
const URGENCIES = ['一般', '緊急', '非常緊急'];
const STATUS_FLOW = ['已建立', '已發送', '對方確認', '已完成'];
const STATUS_ALL = [...STATUS_FLOW, '已取消'];
const STATUS_COLORS = { '已建立': '#6b7280', '已發送': '#2563eb', '對方確認': '#d97706', '已完成': '#16a34a', '已取消': '#ef4444' };
const URGENCY_COLORS = { '一般': '#6b7280', '緊急': '#d97706', '非常緊急': '#ef4444' };

export default function ReferralTracking({ data, showToast, user }) {
  const doctors = getDoctors();
  const clinicName = getClinicName();
  const patients = data.patients || [];
  const [refs, setRefs] = useState(load);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pSugg, setPSugg] = useState([]);
  const [form, setForm] = useState({ patientName: '', patientId: '', fromDoctor: doctors[0] || '', toDoctor: '', toClinic: '', type: TYPES[0], reason: '', urgency: URGENCIES[0], notes: '' });

  const persist = (next) => { setRefs(next); save(next); };

  const stats = useMemo(() => {
    const total = refs.length;
    const pending = refs.filter(r => r.status !== '已完成' && r.status !== '已取消').length;
    const completed = refs.filter(r => r.status === '已完成').length;
    const rate = total ? Math.round(completed / total * 100) : 0;
    return { total, pending, completed, rate };
  }, [refs]);

  const list = useMemo(() => {
    let l = [...refs].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (search) { const q = search.toLowerCase(); l = l.filter(r => (r.patientName || '').toLowerCase().includes(q) || (r.toClinic || '').toLowerCase().includes(q) || (r.reason || '').toLowerCase().includes(q)); }
    if (filterStatus !== 'all') l = l.filter(r => r.status === filterStatus);
    if (filterType !== 'all') l = l.filter(r => r.type === filterType);
    if (dateFrom) l = l.filter(r => (r.createdAt || '') >= dateFrom);
    if (dateTo) l = l.filter(r => (r.createdAt || '') <= dateTo);
    return l;
  }, [refs, search, filterStatus, filterType, dateFrom, dateTo]);

  const handlePatientSearch = (val) => {
    setForm(f => ({ ...f, patientName: val }));
    setPSugg(val.length > 0 ? patients.filter(p => p.name.includes(val)).slice(0, 6) : []);
  };

  const selectPatient = (p) => {
    setForm(f => ({ ...f, patientName: p.name, patientId: p.id, fromDoctor: p.doctor || f.fromDoctor }));
    setPSugg([]);
  };

  const handleSave = () => {
    if (!form.patientName || !form.reason) { showToast('請填寫病人及轉介原因'); return; }
    const rec = { ...form, id: uid(), status: '已建立', createdAt: new Date().toISOString().slice(0, 10), createdBy: user?.name || '' };
    persist([...refs, rec]);
    setShowModal(false);
    setForm({ patientName: '', patientId: '', fromDoctor: doctors[0] || '', toDoctor: '', toClinic: '', type: TYPES[0], reason: '', urgency: URGENCIES[0], notes: '' });
    showToast('轉介已建立');
  };

  const advanceStatus = (id) => {
    persist(refs.map(r => {
      if (r.id !== id) return r;
      const idx = STATUS_FLOW.indexOf(r.status);
      if (idx < 0 || idx >= STATUS_FLOW.length - 1) return r;
      return { ...r, status: STATUS_FLOW[idx + 1], updatedAt: new Date().toISOString().slice(0, 10) };
    }));
    showToast('狀態已更新');
  };

  const cancelRef = (id) => {
    persist(refs.map(r => r.id === id ? { ...r, status: '已取消', updatedAt: new Date().toISOString().slice(0, 10) } : r));
    showToast('轉介已取消');
  };

  const printLetter = (ref) => {
    const w = window.open('', '_blank');
    if (!w) { showToast('請允許彈出視窗'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>轉介信</title><style>
      body{font-family:'Microsoft YaHei','Arial',sans-serif;padding:40px 50px;max-width:700px;margin:0 auto;color:#333}
      .header{text-align:center;border-bottom:3px double ${ACCENT};padding-bottom:14px;margin-bottom:20px}
      .header h1{font-size:20px;color:${ACCENT};margin:0 0 4px}
      .title{text-align:center;font-size:18px;font-weight:700;margin:18px 0;color:${ACCENT};letter-spacing:2px}
      .field{display:flex;margin:8px 0;font-size:14px}
      .field .lb{width:130px;font-weight:700;color:#555;flex-shrink:0}
      .field .val{flex:1;border-bottom:1px solid #ddd;padding-bottom:3px}
      .section{margin:20px 0 8px;font-size:15px;font-weight:700;color:${ACCENT};border-bottom:1px solid ${ACCENT}44;padding-bottom:4px}
      .body{font-size:14px;line-height:1.9;margin:14px 0;padding:14px;background:#f9fafb;border-radius:8px;border-left:4px solid ${ACCENT}}
      .sig{margin-top:50px;display:flex;justify-content:space-between}
      .sig-box{text-align:center;width:200px}
      .sig-line{border-top:1px solid #333;margin-top:60px;padding-top:4px;font-size:12px}
      .footer{margin-top:30px;text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:10px}
      .urgency{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600}
      @media print{body{padding:20px 30px}}
    </style></head><body>
      <div class="header"><h1>${clinicName}</h1><p style="font-size:12px;color:#888">轉介信 Referral Letter</p></div>
      <div class="title">轉 介 信</div>
      <div class="field"><span class="lb">轉介編號：</span><span class="val">REF-${(ref.createdAt || '').replace(/-/g, '')}-${(ref.id || '').substring(0, 6).toUpperCase()}</span></div>
      <div class="field"><span class="lb">日期：</span><span class="val">${ref.createdAt}</span></div>
      <div class="field"><span class="lb">轉介類型：</span><span class="val">${ref.type}</span></div>
      <div class="field"><span class="lb">緊急程度：</span><span class="val"><span class="urgency" style="background:${(URGENCY_COLORS[ref.urgency] || '#888')}22;color:${URGENCY_COLORS[ref.urgency] || '#888'}">${ref.urgency}</span></span></div>
      <div class="section">病人資料</div>
      <div class="field"><span class="lb">病人姓名：</span><span class="val">${ref.patientName}</span></div>
      <div class="section">轉介詳情</div>
      <div class="field"><span class="lb">轉介醫師：</span><span class="val">${ref.fromDoctor}</span></div>
      <div class="field"><span class="lb">接收醫師：</span><span class="val">${ref.toDoctor || '-'}</span></div>
      <div class="field"><span class="lb">接收機構：</span><span class="val">${ref.toClinic || '-'}</span></div>
      <div class="section">轉介原因</div>
      <div class="body">${ref.reason}</div>
      ${ref.notes ? `<div class="section">備註</div><div class="body" style="border-left-color:#d1d5db;background:#fff">${ref.notes}</div>` : ''}
      <div class="sig">
        <div class="sig-box"><div class="sig-line">轉介醫師簽署<br/>${ref.fromDoctor}</div></div>
        <div class="sig-box"><div class="sig-line">診所蓋章<br/>${clinicName}</div></div>
      </div>
      <div class="footer">REF-${(ref.createdAt || '').replace(/-/g, '')}-${(ref.id || '').substring(0, 6).toUpperCase()} | ${clinicName}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #e5e7eb' };
  const btn = (bg = ACCENT) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 14 });
  const btnSm = (bg = ACCENT) => ({ ...btn(bg), padding: '4px 10px', fontSize: 13 });
  const inp = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' };
  const tag = (bg, color) => ({ display: 'inline-block', background: bg, color, padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 });

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ color: ACCENT, marginBottom: 8 }}>轉介追蹤</h2>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
        <div style={{ ...card, textAlign: 'center', marginBottom: 0 }}><div style={{ fontSize: 13, color: '#888' }}>總轉介數</div><div style={{ fontSize: 24, fontWeight: 700, color: ACCENT }}>{stats.total}</div></div>
        <div style={{ ...card, textAlign: 'center', marginBottom: 0 }}><div style={{ fontSize: 13, color: '#888' }}>待處理</div><div style={{ fontSize: 24, fontWeight: 700, color: '#d97706' }}>{stats.pending}</div></div>
        <div style={{ ...card, textAlign: 'center', marginBottom: 0 }}><div style={{ fontSize: 13, color: '#888' }}>已完成</div><div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{stats.completed}</div></div>
        <div style={{ ...card, textAlign: 'center', marginBottom: 0 }}><div style={{ fontSize: 13, color: '#888' }}>完成率</div><div style={{ fontSize: 24, fontWeight: 700, color: ACCENT }}>{stats.rate}%</div></div>
      </div>

      {/* Filter */}
      <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...inp, flex: 1, minWidth: 160 }} placeholder="搜尋病人/機構/原因..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...inp, width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">全部狀態</option>{STATUS_ALL.map(s => <option key={s}>{s}</option>)}
        </select>
        <select style={{ ...inp, width: 'auto' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">全部類型</option>{TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <input type="date" style={{ ...inp, width: 'auto' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="起始日期" />
        <input type="date" style={{ ...inp, width: 'auto' }} value={dateTo} onChange={e => setDateTo(e.target.value)} title="結束日期" />
        <button style={btn()} onClick={() => setShowModal(true)}>＋ 新增轉介</button>
      </div>

      {/* List */}
      <div style={{ ...card, padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontWeight: 700, color: ACCENT }}>轉介記錄（{list.length}）</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f0fdfa' }}>
              {['日期', '病人', '轉介醫師', '接收方', '類型', '緊急', '原因', '狀態', '操作'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #d1d5db', whiteSpace: 'nowrap' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {!list.length && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無轉介記錄</td></tr>}
              {list.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 10px', color: '#888', whiteSpace: 'nowrap' }}>{r.createdAt}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.patientName}</td>
                  <td style={{ padding: '8px 10px' }}>{r.fromDoctor}</td>
                  <td style={{ padding: '8px 10px' }}>{r.toDoctor || r.toClinic || '-'}{r.toDoctor && r.toClinic ? ` (${r.toClinic})` : ''}</td>
                  <td style={{ padding: '8px 10px' }}><span style={tag(ACCENT + '18', ACCENT)}>{r.type}</span></td>
                  <td style={{ padding: '8px 10px' }}><span style={tag((URGENCY_COLORS[r.urgency] || '#888') + '22', URGENCY_COLORS[r.urgency] || '#888')}>{r.urgency}</span></td>
                  <td style={{ padding: '8px 10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</td>
                  <td style={{ padding: '8px 10px' }}><span style={tag((STATUS_COLORS[r.status] || '#888') + '22', STATUS_COLORS[r.status] || '#888')}>{r.status}</span></td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {r.status !== '已完成' && r.status !== '已取消' && <button style={btnSm()} onClick={() => advanceStatus(r.id)}>推進</button>}
                      {r.status !== '已完成' && r.status !== '已取消' && <button style={btnSm('#ef4444')} onClick={() => cancelRef(r.id)}>取消</button>}
                      <button style={btnSm('#6b7280')} onClick={() => printLetter(r)}>列印</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Referral Modal */}
      {showModal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '95%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>新增轉介</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>病人姓名 *</label>
              <input style={inp} value={form.patientName} onChange={e => handlePatientSearch(e.target.value)} onBlur={() => setTimeout(() => setPSugg([]), 150)} placeholder="輸入姓名搜尋" />
              {pSugg.length > 0 && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,.1)', zIndex: 10, maxHeight: 160, overflowY: 'auto' }}>
                {pSugg.map(p => <div key={p.id} onMouseDown={() => selectPatient(p)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>{p.name} — {p.phone}</div>)}
              </div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>轉介醫師</label><select style={inp} value={form.fromDoctor} onChange={e => setForm({ ...form, fromDoctor: e.target.value })}>{doctors.map(d => <option key={d}>{d}</option>)}</select></div>
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>接收醫師</label><input style={inp} value={form.toDoctor} onChange={e => setForm({ ...form, toDoctor: e.target.value })} placeholder="醫師名稱" /></div>
            </div>
            <div><label style={{ fontSize: 13, fontWeight: 600 }}>接收機構/診所</label><input style={inp} value={form.toClinic} onChange={e => setForm({ ...form, toClinic: e.target.value })} placeholder="外部機構名稱（如適用）" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>轉介類型</label><select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>緊急程度</label><select style={inp} value={form.urgency} onChange={e => setForm({ ...form, urgency: e.target.value })}>{URGENCIES.map(u => <option key={u}>{u}</option>)}</select></div>
            </div>
            <div><label style={{ fontSize: 13, fontWeight: 600 }}>轉介原因 *</label><textarea style={{ ...inp, minHeight: 60 }} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="詳述轉介原因及臨床摘要" /></div>
            <div><label style={{ fontSize: 13, fontWeight: 600 }}>備註</label><textarea style={{ ...inp, minHeight: 40 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="選填" /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button style={btn('#6b7280')} onClick={() => setShowModal(false)}>取消</button>
            <button style={btn()} onClick={handleSave}>建立轉介</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
