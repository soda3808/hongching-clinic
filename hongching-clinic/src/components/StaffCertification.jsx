import { useState, useMemo } from 'react';
import { getDoctors } from '../data';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_staff_cert';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const save = (r) => localStorage.setItem(LS_KEY, JSON.stringify(r));
const today = () => new Date().toISOString().split('T')[0];

const CERT_TYPES = ['中醫師執照','護士執照','CPR 急救證書','針灸專科資格','推拿專科資格','中藥配劑資格','衛生署註冊','持續進修學分','急救員證書','其他'];
const STATUS_OPTS = ['全部','有效','即將到期','已過期'];
const SORT_OPTS = [{ v:'expiry-asc', l:'到期日（近→遠）'},{ v:'expiry-desc', l:'到期日（遠→近）'},{ v:'staff-asc', l:'員工姓名'},{ v:'created-desc', l:'最新新增'}];

function daysUntil(exp) {
  if (!exp) return null;
  return Math.ceil((new Date(exp) - new Date(today())) / 86400000);
}
function expiryBadge(exp) {
  const d = daysUntil(exp);
  if (d === null) return { label: '未設定', bg: '#9ca3af' };
  if (d < 0) return { label: `已過期 ${Math.abs(d)} 天`, bg: '#dc2626' };
  if (d <= 30) return { label: `${d} 天後到期`, bg: '#dc2626' };
  if (d <= 90) return { label: `${d} 天後到期`, bg: '#f59e0b' };
  return { label: `${d} 天後到期`, bg: '#16a34a' };
}
function certStatus(exp) {
  const d = daysUntil(exp);
  if (d === null) return '未設定';
  if (d < 0) return '已過期';
  if (d <= 90) return '即將到期';
  return '有效';
}

const S = {
  page: { padding: 16, maxWidth: 960, margin: '0 auto' },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#0e7490' },
  sub: { fontSize: 15, fontWeight: 600, color: '#0e7490', marginBottom: 10 },
  card: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0002', padding: 16, marginBottom: 16 },
  row: { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' },
  inp: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, flex: 1, minWidth: 100 },
  sel: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 },
  btn: { padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#0e7490', color: '#fff' },
  btnD: { padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: '#dc2626', color: '#fff' },
  btnG: { padding: '7px 14px', borderRadius: 6, border: '1px solid #d1d5db', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#fff', color: '#333' },
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 6px', borderBottom: '2px solid #e5e7eb', color: '#0e7490', fontWeight: 600 },
  td: { padding: '7px 6px', borderBottom: '1px solid #f3f4f6' },
  badge: (bg) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#fff', background: bg }),
  stat: { textAlign: 'center', flex: 1, minWidth: 110, padding: 14, borderRadius: 8, background: '#f0fdfa' },
  statN: { fontSize: 24, fontWeight: 700, color: '#0e7490' },
  statL: { fontSize: 12, color: '#666', marginTop: 2 },
  modal: { position: 'fixed', inset: 0, background: '#0008', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  mBox: { background: '#fff', borderRadius: 12, padding: 20, width: 420, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' },
  label: { fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 2, display: 'block' },
  field: { marginBottom: 10 },
  bar: { height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden', marginTop: 4 },
  barF: (pct, c) => ({ height: '100%', borderRadius: 3, width: `${Math.min(pct, 100)}%`, background: c, transition: 'width .3s' }),
};

const BLANK = { staff: '', certType: CERT_TYPES[0], certNumber: '', issueDate: '', expiryDate: '', issuingBody: '', notes: '' };

export default function StaffCertification({ data, showToast, user }) {
  const [certs, setCerts] = useState(load);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewCert, setViewCert] = useState(null);
  const [form, setForm] = useState({ ...BLANK });
  const [fStaff, setFStaff] = useState('');
  const [fType, setFType] = useState('');
  const [fStatus, setFStatus] = useState('全部');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('expiry-asc');

  const staffList = useMemo(() => {
    const all = [...getDoctors(), ...(data?.employees || []).map(e => e.name).filter(Boolean)];
    return [...new Set(all)];
  }, [data]);

  const filtered = useMemo(() => {
    let list = certs.filter(c => {
      if (fStaff && c.staff !== fStaff) return false;
      if (fType && c.certType !== fType) return false;
      if (fStatus !== '全部') { const s = certStatus(c.expiryDate); if (s !== fStatus) return false; }
      if (search) { const q = search.toLowerCase(); if (!`${c.staff} ${c.certNumber} ${c.issuingBody} ${c.certType}`.toLowerCase().includes(q)) return false; }
      return true;
    });
    list.sort((a, b) => {
      if (sortBy === 'expiry-asc') return (a.expiryDate || '9999') < (b.expiryDate || '9999') ? -1 : 1;
      if (sortBy === 'expiry-desc') return (b.expiryDate || '') < (a.expiryDate || '') ? -1 : 1;
      if (sortBy === 'staff-asc') return (a.staff || '').localeCompare(b.staff || '');
      return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1;
    });
    return list;
  }, [certs, fStaff, fType, fStatus, search, sortBy]);

  const stats = useMemo(() => {
    const total = certs.length;
    let valid = 0, expiring = 0, expired = 0;
    certs.forEach(c => { const s = certStatus(c.expiryDate); if (s === '有效') valid++; else if (s === '即將到期') expiring++; else if (s === '已過期') expired++; });
    const compliance = total > 0 ? Math.round(((valid + expiring) / total) * 100) : 0;
    return { total, valid, expiring, expired, compliance };
  }, [certs]);

  const staffSummary = useMemo(() => {
    const map = {};
    certs.forEach(c => {
      if (!map[c.staff]) map[c.staff] = { total: 0, valid: 0, expiring: 0, expired: 0 };
      map[c.staff].total++;
      const s = certStatus(c.expiryDate);
      if (s === '有效') map[c.staff].valid++; else if (s === '即將到期') map[c.staff].expiring++; else if (s === '已過期') map[c.staff].expired++;
    });
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => a.name.localeCompare(b.name));
  }, [certs]);

  const persist = (next) => { setCerts(next); save(next); };
  const openAdd = () => { setEditing(null); setForm({ ...BLANK, staff: staffList[0] || '' }); setShowForm(true); };
  const openEdit = (c) => { setEditing(c.id); setForm({ staff: c.staff, certType: c.certType, certNumber: c.certNumber, issueDate: c.issueDate, expiryDate: c.expiryDate, issuingBody: c.issuingBody, notes: c.notes || '' }); setShowForm(true); };

  const handleSave = () => {
    if (!form.staff || !form.certType || !form.certNumber) { showToast?.('請填寫必填欄位（員工、類別、號碼）'); return; }
    if (editing) {
      persist(certs.map(c => c.id === editing ? { ...c, ...form, updatedAt: today(), updatedBy: user?.name || '' } : c));
      showToast?.('證照已更新');
    } else {
      persist([{ id: uid(), ...form, createdAt: today(), createdBy: user?.name || '', updatedAt: today(), updatedBy: user?.name || '' }, ...certs]);
      showToast?.('證照已新增');
    }
    setShowForm(false);
  };

  const handleDelete = (id) => { if (window.confirm('確定刪除此證照記錄？')) { persist(certs.filter(c => c.id !== id)); showToast?.('已刪除'); } };

  const checkReminders = () => {
    const soon = certs.filter(c => { const d = daysUntil(c.expiryDate); return d !== null && d >= 0 && d <= 90; });
    const exp = certs.filter(c => { const d = daysUntil(c.expiryDate); return d !== null && d < 0; });
    if (!soon.length && !exp.length) { showToast?.('所有證照狀態正常，無需續期提醒'); return; }
    let msg = '=== 證照續期提醒 ===\n\n';
    if (exp.length) { msg += `[已過期] ${exp.length} 張：\n`; exp.forEach(c => { msg += `  - ${c.staff}：${c.certType}（已過期 ${Math.abs(daysUntil(c.expiryDate))} 天）\n`; }); msg += '\n'; }
    if (soon.length) { msg += `[即將到期] ${soon.length} 張：\n`; soon.forEach(c => { msg += `  - ${c.staff}：${c.certType}（${daysUntil(c.expiryDate)} 天後到期）\n`; }); }
    window.alert(msg);
  };

  const printReport = () => {
    const clinic = getClinicName();
    const rows = filtered.map(c => { const b = expiryBadge(c.expiryDate); return `<tr><td>${c.staff}</td><td>${c.certType}</td><td>${c.certNumber}</td><td>${c.issueDate || '-'}</td><td>${c.expiryDate || '-'}</td><td>${c.issuingBody || '-'}</td><td style="color:${b.bg};font-weight:600">${b.label}</td></tr>`; }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${clinic} - 員工證照報告</title>
<style>body{font-family:sans-serif;padding:20px;font-size:13px}h2{color:#0e7490;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:12px}th{background:#0e7490;color:#fff;padding:8px 6px;text-align:left}td,th{padding:6px;border:1px solid #ddd}.sum{display:flex;gap:20px;margin:12px 0}.sb{background:#f0fdfa;padding:10px 16px;border-radius:8px;text-align:center}.sb b{font-size:20px;color:#0e7490}@media print{body{padding:0}}</style></head>
<body><h2>${clinic} - 員工專業證照報告</h2><p style="color:#666;font-size:12px">列印日期：${today()}　｜　合規審查報告</p>
<div class="sum"><div class="sb">總計<br><b>${stats.total}</b></div><div class="sb">有效<br><b>${stats.valid}</b></div><div class="sb">即將到期<br><b style="color:#f59e0b">${stats.expiring}</b></div><div class="sb">已過期<br><b style="color:#dc2626">${stats.expired}</b></div><div class="sb">合規率<br><b>${stats.compliance}%</b></div></div>
<table><thead><tr><th>員工</th><th>證照類別</th><th>證照號碼</th><th>發證日期</th><th>到期日期</th><th>發證機構</th><th>狀態</th></tr></thead><tbody>${rows}</tbody></table>
<p style="margin-top:20px;font-size:11px;color:#999">本報告由 ${clinic} 管理系統自動生成，僅供內部合規審查使用。</p>
<script>setTimeout(()=>window.print(),300)</script></body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  };

  const pctColor = (p) => p >= 80 ? '#16a34a' : '#f59e0b';

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <h2 style={S.title}>員工專業證照管理</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={S.btn} onClick={openAdd}>+ 新增證照</button>
          <button style={S.btnG} onClick={checkReminders}>續期提醒</button>
          <button style={S.btnG} onClick={printReport}>列印報告</button>
        </div>
      </div>

      {/* Dashboard */}
      <div style={{ ...S.card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={S.stat}><div style={S.statN}>{stats.total}</div><div style={S.statL}>證照總數</div></div>
        <div style={S.stat}><div style={{ ...S.statN, color: '#16a34a' }}>{stats.valid}</div><div style={S.statL}>有效</div></div>
        <div style={S.stat}><div style={{ ...S.statN, color: '#f59e0b' }}>{stats.expiring}</div><div style={S.statL}>即將到期</div></div>
        <div style={S.stat}><div style={{ ...S.statN, color: '#dc2626' }}>{stats.expired}</div><div style={S.statL}>已過期</div></div>
        <div style={S.stat}>
          <div style={S.statN}>{stats.compliance}%</div><div style={S.statL}>合規率</div>
          <div style={S.bar}><div style={S.barF(stats.compliance, pctColor(stats.compliance))} /></div>
        </div>
      </div>

      {/* Per-staff summary */}
      {staffSummary.length > 0 && (
        <div style={S.card}>
          <div style={S.sub}>員工證照概覽</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {staffSummary.map(s => {
              const pct = s.total > 0 ? Math.round(((s.valid + s.expiring) / s.total) * 100) : 0;
              return (
                <div key={s.name} style={{ flex: '1 1 140px', minWidth: 140, padding: 10, borderRadius: 8, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    共 {s.total} 張
                    {s.expired > 0 && <span style={{ color: '#dc2626', marginLeft: 6 }}>過期 {s.expired}</span>}
                    {s.expiring > 0 && <span style={{ color: '#f59e0b', marginLeft: 6 }}>即期 {s.expiring}</span>}
                  </div>
                  <div style={S.bar}><div style={S.barF(pct, pctColor(pct))} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ ...S.card, ...S.row }}>
        <input style={S.inp} placeholder="搜尋員工 / 證照號碼 / 發證機構..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={S.sel} value={fStaff} onChange={e => setFStaff(e.target.value)}>
          <option value="">全部員工</option>
          {staffList.map(s => <option key={s}>{s}</option>)}
        </select>
        <select style={S.sel} value={fType} onChange={e => setFType(e.target.value)}>
          <option value="">全部類別</option>
          {CERT_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={S.sel} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          {STATUS_OPTS.map(o => <option key={o}>{o}</option>)}
        </select>
        <select style={S.sel} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          {SORT_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ ...S.card, overflowX: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#999' }}>暫無證照記錄，請點擊「+ 新增證照」開始管理</div>
        ) : (
          <table style={S.tbl}>
            <thead><tr>
              {['員工','證照類別','證照號碼','發證日期','到期日期','發證機構','狀態','操作'].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.map(c => { const b = expiryBadge(c.expiryDate); return (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setViewCert(c)}>
                  <td style={S.td}>{c.staff}</td>
                  <td style={S.td}>{c.certType}</td>
                  <td style={S.td}>{c.certNumber}</td>
                  <td style={S.td}>{c.issueDate || '-'}</td>
                  <td style={S.td}>{c.expiryDate || '-'}</td>
                  <td style={S.td}>{c.issuingBody || '-'}</td>
                  <td style={S.td}><span style={S.badge(b.bg)}>{b.label}</span></td>
                  <td style={S.td} onClick={e => e.stopPropagation()}>
                    <button style={{ ...S.btn, padding: '4px 10px', fontSize: 12, marginRight: 4 }} onClick={() => openEdit(c)}>編輯</button>
                    <button style={S.btnD} onClick={() => handleDelete(c.id)}>刪除</button>
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
        )}
        {filtered.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>共 {filtered.length} 筆記錄</div>}
      </div>

      {/* View Detail Modal */}
      {viewCert && (
        <div style={S.modal} onClick={() => setViewCert(null)}>
          <div style={S.mBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0e7490', marginBottom: 14 }}>證照詳情</h3>
            {[['員工姓名', viewCert.staff],['證照類別', viewCert.certType],['證照號碼', viewCert.certNumber],['發證日期', viewCert.issueDate || '-'],['到期日期', viewCert.expiryDate || '-'],['發證機構', viewCert.issuingBody || '-'],['備註', viewCert.notes || '-'],['建立日期', viewCert.createdAt || '-'],['建立者', viewCert.createdBy || '-'],['最後更新', viewCert.updatedAt || '-'],['更新者', viewCert.updatedBy || '-']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', fontSize: 13, marginBottom: 6 }}>
                <span style={{ width: 90, fontWeight: 600, color: '#555', flexShrink: 0 }}>{k}</span>
                <span>{v}</span>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#555', marginRight: 8 }}>狀態</span>
              {(() => { const b = expiryBadge(viewCert.expiryDate); return <span style={S.badge(b.bg)}>{b.label}</span>; })()}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={S.btnG} onClick={() => setViewCert(null)}>關閉</button>
              <button style={S.btn} onClick={() => { openEdit(viewCert); setViewCert(null); }}>編輯</button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div style={S.modal} onClick={() => setShowForm(false)}>
          <div style={S.mBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0e7490', marginBottom: 14 }}>{editing ? '編輯證照' : '新增證照'}</h3>
            <div style={S.field}>
              <label style={S.label}>員工姓名 *</label>
              <select style={{ ...S.sel, width: '100%' }} value={form.staff} onChange={e => setForm({ ...form, staff: e.target.value })}>
                <option value="">-- 選擇員工 --</option>
                {staffList.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={S.field}>
              <label style={S.label}>證照類別 *</label>
              <select style={{ ...S.sel, width: '100%' }} value={form.certType} onChange={e => setForm({ ...form, certType: e.target.value })}>
                {CERT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={S.field}>
              <label style={S.label}>證照號碼 *</label>
              <input style={{ ...S.inp, flex: 'none', width: '100%' }} value={form.certNumber} onChange={e => setForm({ ...form, certNumber: e.target.value })} placeholder="例: TCM-2024-001" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>發證日期</label>
                <input style={{ ...S.inp, flex: 'none', width: '100%' }} type="date" value={form.issueDate} onChange={e => setForm({ ...form, issueDate: e.target.value })} />
              </div>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>到期日期</label>
                <input style={{ ...S.inp, flex: 'none', width: '100%' }} type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>發證機構</label>
              <input style={{ ...S.inp, flex: 'none', width: '100%' }} value={form.issuingBody} onChange={e => setForm({ ...form, issuingBody: e.target.value })} placeholder="例: 香港中醫藥管理委員會" />
            </div>
            <div style={S.field}>
              <label style={S.label}>備註</label>
              <input style={{ ...S.inp, flex: 'none', width: '100%' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="選填" />
            </div>
            {form.expiryDate && (
              <div style={{ padding: 8, borderRadius: 6, background: '#f0fdfa', fontSize: 12, marginBottom: 8 }}>
                到期狀態預覽：{(() => { const b = expiryBadge(form.expiryDate); return <span style={S.badge(b.bg)}>{b.label}</span>; })()}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button style={S.btnG} onClick={() => setShowForm(false)}>取消</button>
              <button style={S.btn} onClick={handleSave}>{editing ? '儲存變更' : '新增'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
