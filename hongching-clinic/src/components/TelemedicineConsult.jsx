import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getDoctors } from '../data';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const LS_KEY = 'hcmc_telemedicine';
const ACCENT = '#0e7490';
const TYPES = ['視像診症', '電話診症', '文字診症'];
const DURATIONS = [15, 30, 45, 60];
const STATUS_FLOW = ['已預約', '進行中', '已完成', '已取消'];
const STATUS_CLR = { '已預約': '#2563eb', '進行中': '#d97706', '已完成': '#16a34a', '已取消': '#dc2626' };
const STATUS_BG = { '已預約': '#dbeafe', '進行中': '#fef9c3', '已完成': '#dcfce7', '已取消': '#fee2e2' };
const TYPE_FEES = { '視像診症': 450, '電話診症': 350, '文字診症': 250 };
function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function save(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); }
function toToday() { return new Date().toISOString().substring(0, 10); }

export default function TelemedicineConsult({ data, showToast, user }) {
  const DOCTORS = getDoctors();
  const patients = data?.patients || [];
  const [records, setRecords] = useState(load);
  const [tab, setTab] = useState('list');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [pSearch, setPSearch] = useState('');
  const [form, setForm] = useState({ patientName: '', patientPhone: '', doctor: DOCTORS[0] || '', date: '', time: '10:00', type: TYPES[0], duration: 30, reason: '', notes: '' });
  const [postForm, setPostForm] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [keyword, setKeyword] = useState('');
  const today = toToday();

  const pResults = useMemo(() => {
    if (!pSearch.trim()) return [];
    const q = pSearch.trim().toLowerCase();
    return patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 6);
  }, [pSearch, patients]);

  const filtered = useMemo(() => {
    let list = [...records];
    if (filterType !== 'all') list = list.filter(r => r.type === filterType);
    if (filterStatus !== 'all') list = list.filter(r => r.status === filterStatus);
    if (keyword.trim()) { const q = keyword.trim().toLowerCase(); list = list.filter(r => [r.patientName, r.doctor, r.reason].some(f => (f || '').toLowerCase().includes(q))); }
    return list.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [records, filterType, filterStatus, keyword]);

  const todayList = useMemo(() => records.filter(r => r.date === today && r.status !== '已取消').sort((a, b) => a.time.localeCompare(b.time)), [records, today]);

  const stats = useMemo(() => {
    const total = records.length;
    const byType = {}; TYPES.forEach(t => { byType[t] = records.filter(r => r.type === t).length; });
    const completed = records.filter(r => r.status === '已完成').length;
    const rate = total ? Math.round(completed / total * 100) : 0;
    const durations = records.filter(r => r.status === '已完成' && r.duration).map(r => r.duration);
    const avgDur = durations.length ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length) : 0;
    const totalFees = records.filter(r => r.status === '已完成').reduce((s, r) => s + (r.fee || 0), 0);
    return { total, byType, completed, rate, avgDur, totalFees };
  }, [records]);

  const resetForm = () => { setForm({ patientName: '', patientPhone: '', doctor: DOCTORS[0] || '', date: '', time: '10:00', type: TYPES[0], duration: 30, reason: '', notes: '' }); setPSearch(''); setEditId(null); };

  const handleSave = () => {
    if (!form.patientName || !form.date || !form.time) return showToast('請填寫必要欄位');
    const fee = TYPE_FEES[form.type] || 350;
    if (editId) {
      const next = records.map(r => r.id === editId ? { ...r, ...form, fee } : r);
      setRecords(next); save(next); showToast('已更新遠程診症');
    } else {
      const rec = { id: uid(), ...form, fee, status: '已預約', createdAt: new Date().toISOString(), createdBy: user?.name || '' };
      const next = [...records, rec]; setRecords(next); save(next); showToast('已新增遠程診症預約');
    }
    setShowForm(false); resetForm();
  };

  const handleEdit = (r) => { setForm({ patientName: r.patientName, patientPhone: r.patientPhone || '', doctor: r.doctor, date: r.date, time: r.time, type: r.type, duration: r.duration, reason: r.reason || '', notes: r.notes || '' }); setEditId(r.id); setShowForm(true); };

  const handleStatus = (id, status) => {
    const next = records.map(r => r.id === id ? { ...r, status } : r);
    setRecords(next); save(next); showToast(`已更新為${status}`);
    if (status === '已完成') { const r = records.find(x => x.id === id); if (r) setPostForm({ id, diagnosis: r.diagnosis || '', prescription: r.prescription || '', followUp: r.followUp || '' }); }
  };

  const handleDelete = (id) => { const next = records.filter(r => r.id !== id); setRecords(next); save(next); showToast('已刪除'); };

  const handlePostSave = () => {
    if (!postForm) return;
    const next = records.map(r => r.id === postForm.id ? { ...r, diagnosis: postForm.diagnosis, prescription: postForm.prescription, followUp: postForm.followUp } : r);
    setRecords(next); save(next); setPostForm(null); showToast('診後記錄已儲存');
  };

  const handlePrint = (r) => {
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>遠程診症摘要</title><style>body{font-family:'PingFang TC','Microsoft YaHei',sans-serif;padding:24px;max-width:650px;margin:0 auto;font-size:13px}h1{font-size:18px;color:${ACCENT};text-align:center;margin-bottom:4px}.sub{text-align:center;color:#888;font-size:11px;margin-bottom:20px}.section{margin-bottom:16px;border:1px solid #e5e7eb;border-radius:8px;padding:14px}.section h2{font-size:13px;color:${ACCENT};margin:0 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}.row{display:flex;margin-bottom:6px;font-size:12px}.lbl{color:#6b7280;min-width:80px}.val{font-weight:600}.badge{display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;background:${STATUS_BG[r.status]};color:${STATUS_CLR[r.status]}}.footer{margin-top:24px;text-align:center;font-size:10px;color:#aaa;border-top:1px dashed #ddd;padding-top:10px}@media print{body{padding:10mm}}</style></head><body>` +
    `<h1>${getClinicName()}</h1><div class="sub">遠程診症摘要</div>` +
    `<div class="section"><h2>預約資料</h2><div class="row"><span class="lbl">病人：</span><span class="val">${r.patientName}</span></div>` +
    `<div class="row"><span class="lbl">電話：</span><span class="val">${r.patientPhone || '-'}</span></div>` +
    `<div class="row"><span class="lbl">醫師：</span><span class="val">${r.doctor}</span></div>` +
    `<div class="row"><span class="lbl">日期時間：</span><span class="val">${r.date} ${r.time}</span></div>` +
    `<div class="row"><span class="lbl">類型：</span><span class="val">${r.type}</span></div>` +
    `<div class="row"><span class="lbl">時長：</span><span class="val">${r.duration} 分鐘</span></div>` +
    `<div class="row"><span class="lbl">費用：</span><span class="val">$${r.fee || 0}</span></div>` +
    `<div class="row"><span class="lbl">狀態：</span><span class="badge">${r.status}</span></div>` +
    (r.reason ? `<div class="row"><span class="lbl">原因：</span><span class="val">${r.reason}</span></div>` : '') + '</div>' +
    (r.diagnosis || r.prescription || r.followUp ? `<div class="section"><h2>診後記錄</h2>` +
    (r.diagnosis ? `<div class="row"><span class="lbl">診斷：</span><span class="val">${r.diagnosis}</span></div>` : '') +
    (r.prescription ? `<div class="row"><span class="lbl">處方：</span><span class="val">${r.prescription}</span></div>` : '') +
    (r.followUp ? `<div class="row"><span class="lbl">覆診：</span><span class="val">${r.followUp}</span></div>` : '') + '</div>' : '') +
    `<div class="footer">列印時間：${new Date().toLocaleString('zh-HK')} | ${getClinicName()}</div></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  const s = {
    card: { background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 12 },
    hdr: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontWeight: 700, fontSize: 14, color: ACCENT },
    stat: { padding: 12, borderRadius: 8, textAlign: 'center', flex: 1, minWidth: 90 },
    inp: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' },
    btn: { padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    td: { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 12, whiteSpace: 'nowrap' },
    th: { padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 11, fontWeight: 700, textAlign: 'left', color: '#6b7280', whiteSpace: 'nowrap' },
    badge: (st) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: STATUS_CLR[st] || '#888', background: STATUS_BG[st] || '#f3f4f6' }),
    ov: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 },
    mdl: { background: '#fff', borderRadius: 12, padding: 20, width: '95%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.18)' },
  };

  return (<>
    {/* Stats */}
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      <div style={{ ...s.stat, background: '#ecfeff' }}><div style={{ fontSize: 10, color: ACCENT, fontWeight: 600 }}>總診症數</div><div style={{ fontSize: 24, fontWeight: 800, color: ACCENT }}>{stats.total}</div></div>
      <div style={{ ...s.stat, background: '#dcfce7' }}><div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>已完成</div><div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>{stats.completed}</div></div>
      <div style={{ ...s.stat, background: '#fef9c3' }}><div style={{ fontSize: 10, color: '#d97706', fontWeight: 600 }}>完成率</div><div style={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}>{stats.rate}%</div></div>
      <div style={{ ...s.stat, background: '#f3f4f6' }}><div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>平均時長</div><div style={{ fontSize: 24, fontWeight: 800, color: '#374151' }}>{stats.avgDur}<span style={{ fontSize: 11 }}>分</span></div></div>
      <div style={{ ...s.stat, background: '#ecfeff' }}><div style={{ fontSize: 10, color: ACCENT, fontWeight: 600 }}>總收入</div><div style={{ fontSize: 24, fontWeight: 800, color: ACCENT }}>${stats.totalFees.toLocaleString()}</div></div>
    </div>

    {/* Type breakdown */}
    <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
      {TYPES.map(t => (<div key={t} style={{ ...s.stat, background: '#fafafa', border: '1px solid #e5e7eb', minWidth: 100 }}><div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{t}</div><div style={{ fontSize: 20, fontWeight: 800, color: ACCENT }}>{stats.byType[t] || 0}</div><div style={{ fontSize: 10, color: '#9ca3af' }}>${TYPE_FEES[t]}/次</div></div>))}
    </div>

    {/* Tabs + Add */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[['list', '診症列表'], ['waiting', '今日候診室'], ['stats', '統計']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...s.btn, background: tab === k ? ACCENT : '#f3f4f6', color: tab === k ? '#fff' : '#374151' }}>{l}</button>
        ))}
      </div>
      <button style={{ ...s.btn, background: ACCENT, color: '#fff' }} onClick={() => { resetForm(); setShowForm(true); }}>+ 新增遠程診症</button>
    </div>

    {/* Waiting Room */}
    {tab === 'waiting' && (
      <div style={s.card}>
        <div style={s.hdr}>今日候診室 ({today})</div>
        {todayList.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 13 }}>今日暫無遠程診症</div> : (
          <div style={{ padding: 12, display: 'grid', gap: 10 }}>
            {todayList.map(r => (
              <div key={r.id} style={{ border: `1px solid ${STATUS_CLR[r.status] || '#e5e7eb'}`, borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: STATUS_BG[r.status] + '44' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.patientName} <span style={{ fontSize: 11, color: '#6b7280' }}>({r.type})</span></div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{r.time} · {r.doctor} · {r.duration}分鐘</div>
                  {r.reason && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.reason}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={s.badge(r.status)}>{r.status}</span>
                  {r.status === '已預約' && <button style={{ ...s.btn, background: '#d97706', color: '#fff', fontSize: 11, padding: '4px 10px' }} onClick={() => handleStatus(r.id, '進行中')}>開始</button>}
                  {r.status === '進行中' && <button style={{ ...s.btn, background: '#16a34a', color: '#fff', fontSize: 11, padding: '4px 10px' }} onClick={() => handleStatus(r.id, '已完成')}>完成</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    {/* List View */}
    {tab === 'list' && (<>
      <div style={{ ...s.card, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...s.inp, width: 110 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">全部類型</option>{TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={{ ...s.inp, width: 110 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">全部狀態</option>{STATUS_FLOW.map(st => <option key={st}>{st}</option>)}
        </select>
        <input style={{ ...s.inp, flex: 1, minWidth: 120 }} placeholder="搜尋病人/醫師/原因" value={keyword} onChange={e => setKeyword(e.target.value)} />
      </div>
      <div style={{ ...s.card, padding: 0 }}>
        <div style={s.hdr}>遠程診症列表 ({filtered.length})</div>
        <div style={{ overflowX: 'auto', maxHeight: 480 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead><tr>{['日期', '時間', '病人', '電話', '醫師', '類型', '時長', '費用', '狀態', '操作'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {!filtered.length && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無記錄</td></tr>}
              {filtered.map(r => (
                <tr key={r.id} style={{ background: r.status === '已取消' ? '#fef2f2' : undefined }}>
                  <td style={s.td}>{r.date}</td>
                  <td style={s.td}>{r.time}</td>
                  <td style={{ ...s.td, fontWeight: 600 }}>{r.patientName}</td>
                  <td style={{ ...s.td, color: '#6b7280' }}>{r.patientPhone || '-'}</td>
                  <td style={s.td}>{r.doctor}</td>
                  <td style={s.td}>{r.type}</td>
                  <td style={s.td}>{r.duration}分</td>
                  <td style={s.td}>${r.fee || 0}</td>
                  <td style={s.td}><span style={s.badge(r.status)}>{r.status}</span></td>
                  <td style={s.td}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {r.status === '已預約' && <button style={{ ...s.btn, background: '#d97706', color: '#fff', fontSize: 11, padding: '3px 8px' }} onClick={() => handleStatus(r.id, '進行中')}>開始</button>}
                      {r.status === '進行中' && <button style={{ ...s.btn, background: '#16a34a', color: '#fff', fontSize: 11, padding: '3px 8px' }} onClick={() => handleStatus(r.id, '已完成')}>完成</button>}
                      {r.status !== '已取消' && r.status !== '已完成' && <button style={{ ...s.btn, background: '#fee2e2', color: '#dc2626', fontSize: 11, padding: '3px 8px' }} onClick={() => handleStatus(r.id, '已取消')}>取消</button>}
                      {r.status === '已完成' && !r.diagnosis && <button style={{ ...s.btn, background: '#ede9fe', color: '#7c3aed', fontSize: 11, padding: '3px 8px' }} onClick={() => setPostForm({ id: r.id, diagnosis: '', prescription: '', followUp: '' })}>診後</button>}
                      <button style={{ ...s.btn, background: '#f3f4f6', color: '#374151', fontSize: 11, padding: '3px 8px' }} onClick={() => handleEdit(r)}>編輯</button>
                      <button style={{ ...s.btn, background: '#f3f4f6', color: '#374151', fontSize: 11, padding: '3px 8px' }} onClick={() => handlePrint(r)}>列印</button>
                      <button style={{ ...s.btn, background: '#fee2e2', color: '#dc2626', fontSize: 11, padding: '3px 8px' }} onClick={() => handleDelete(r.id)}>刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>)}

    {/* Stats Tab */}
    {tab === 'stats' && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={s.card}>
          <div style={s.hdr}>按類型分佈</div>
          <div style={{ padding: 14 }}>{TYPES.map(t => {
            const cnt = stats.byType[t] || 0; const pct = stats.total ? Math.round(cnt / stats.total * 100) : 0;
            return (<div key={t} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}><span style={{ fontWeight: 600 }}>{t}</span><span style={{ color: '#6b7280' }}>{cnt} ({pct}%)</span></div>
              <div style={{ background: '#f3f4f6', borderRadius: 6, height: 12, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: ACCENT, borderRadius: 6, transition: 'width .4s' }} /></div>
            </div>);
          })}</div>
        </div>
        <div style={s.card}>
          <div style={s.hdr}>按狀態分佈</div>
          <div style={{ padding: 14 }}>{STATUS_FLOW.map(st => {
            const cnt = records.filter(r => r.status === st).length; const pct = stats.total ? Math.round(cnt / stats.total * 100) : 0;
            return (<div key={st} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}><span style={{ fontWeight: 600, color: STATUS_CLR[st] }}>{st}</span><span style={{ color: '#6b7280' }}>{cnt} ({pct}%)</span></div>
              <div style={{ background: '#f3f4f6', borderRadius: 6, height: 12, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: STATUS_CLR[st], borderRadius: 6, transition: 'width .4s' }} /></div>
            </div>);
          })}</div>
        </div>
        <div style={{ ...s.card, gridColumn: '1 / -1' }}>
          <div style={s.hdr}>費用統計</div>
          <div style={{ padding: 14, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {TYPES.map(t => { const recs = records.filter(r => r.type === t && r.status === '已完成'); const total = recs.reduce((s, r) => s + (r.fee || 0), 0);
              return (<div key={t} style={{ textAlign: 'center' }}><div style={{ fontSize: 11, color: '#6b7280' }}>{t}</div><div style={{ fontSize: 18, fontWeight: 800, color: ACCENT }}>${total.toLocaleString()}</div><div style={{ fontSize: 10, color: '#9ca3af' }}>{recs.length} 次</div></div>);
            })}
            <div style={{ textAlign: 'center', borderLeft: '2px solid #e5e7eb', paddingLeft: 20 }}><div style={{ fontSize: 11, color: '#6b7280' }}>總計</div><div style={{ fontSize: 22, fontWeight: 800, color: ACCENT }}>${stats.totalFees.toLocaleString()}</div></div>
          </div>
        </div>
      </div>
    )}

    {/* Add/Edit Modal */}
    {showForm && (
      <div style={s.ov} onClick={() => { setShowForm(false); resetForm(); }}>
        <div style={s.mdl} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>{editId ? '編輯遠程診症' : '新增遠程診症'}</span>
            <button onClick={() => { setShowForm(false); resetForm(); }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
          </div>
          {/* Patient search */}
          <div style={{ marginBottom: 10, position: 'relative' }}>
            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, display: 'block' }}>病人 *</label>
            <input style={s.inp} placeholder="搜尋病人姓名或電話..." value={pSearch || form.patientName} onChange={e => { setPSearch(e.target.value); setForm({ ...form, patientName: e.target.value }); }} />
            {pResults.length > 0 && pSearch && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, maxHeight: 160, overflowY: 'auto', zIndex: 10 }}>
                {pResults.map((p, i) => (
                  <div key={i} onClick={() => { setForm({ ...form, patientName: p.name || '', patientPhone: p.phone || '' }); setPSearch(''); }} style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{p.name}</span><span style={{ color: '#9ca3af' }}>{p.phone || ''}</span>
                  </div>))}
              </div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>電話</label><input style={s.inp} value={form.patientPhone} onChange={e => setForm({ ...form, patientPhone: e.target.value })} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>醫師 *</label><select style={s.inp} value={form.doctor} onChange={e => setForm({ ...form, doctor: e.target.value })}>{DOCTORS.map(d => <option key={d}>{d}</option>)}</select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>日期 *</label><input type="date" style={s.inp} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>時間 *</label><input type="time" style={s.inp} value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></div>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>類型</label><select style={s.inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>時長</label><select style={s.inp} value={form.duration} onChange={e => setForm({ ...form, duration: +e.target.value })}>{DURATIONS.map(d => <option key={d} value={d}>{d} 分鐘</option>)}</select></div>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>費用</label><div style={{ ...s.inp, background: '#f9fafb', color: '#374151' }}>${TYPE_FEES[form.type] || 350}</div></div>
          </div>
          <div style={{ marginBottom: 10 }}><label style={{ fontSize: 12, fontWeight: 600 }}>診症原因</label><input style={s.inp} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="主訴或診症原因" /></div>
          <div style={{ marginBottom: 14 }}><label style={{ fontSize: 12, fontWeight: 600 }}>備註</label><textarea rows={2} style={{ ...s.inp, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="其他備註" /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...s.btn, background: ACCENT, color: '#fff', flex: 1 }} onClick={handleSave}>{editId ? '更新' : '確認預約'}</button>
            <button style={{ ...s.btn, background: '#f3f4f6', color: '#374151' }} onClick={() => { setShowForm(false); resetForm(); }}>取消</button>
          </div>
        </div>
      </div>
    )}

    {/* Post-consultation Modal */}
    {postForm && (
      <div style={s.ov} onClick={() => setPostForm(null)}>
        <div style={s.mdl} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>診後記錄</span>
            <button onClick={() => setPostForm(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
          </div>
          <div style={{ marginBottom: 10 }}><label style={{ fontSize: 12, fontWeight: 600 }}>診斷</label><textarea rows={2} style={{ ...s.inp, resize: 'vertical' }} value={postForm.diagnosis} onChange={e => setPostForm({ ...postForm, diagnosis: e.target.value })} placeholder="診斷結果" /></div>
          <div style={{ marginBottom: 10 }}><label style={{ fontSize: 12, fontWeight: 600 }}>處方</label><textarea rows={2} style={{ ...s.inp, resize: 'vertical' }} value={postForm.prescription} onChange={e => setPostForm({ ...postForm, prescription: e.target.value })} placeholder="藥方或治療建議" /></div>
          <div style={{ marginBottom: 14 }}><label style={{ fontSize: 12, fontWeight: 600 }}>覆診安排</label><input style={s.inp} value={postForm.followUp} onChange={e => setPostForm({ ...postForm, followUp: e.target.value })} placeholder="覆診日期或建議" /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...s.btn, background: ACCENT, color: '#fff', flex: 1 }} onClick={handlePostSave}>儲存記錄</button>
            <button style={{ ...s.btn, background: '#f3f4f6', color: '#374151' }} onClick={() => setPostForm(null)}>取消</button>
          </div>
        </div>
      </div>
    )}
  </>);
}
