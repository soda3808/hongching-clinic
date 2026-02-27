import { useState, useMemo } from 'react';
import { getDoctors, fmtM } from '../data';
import { getClinicName } from '../tenant';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const LS_CONTRACTS = 'hcmc_company_services';
const LS_SESSIONS = 'hcmc_corp_sessions';
const SERVICE_TYPES = ['員工健康檢查', '企業中醫保健', '到診服務', '團體治療'];
const STATUS_MAP = { active: { label: '生效中', color: '#16a34a', bg: '#f0fdf4' }, expired: { label: '已過期', color: '#dc2626', bg: '#fef2f2' }, pending: { label: '待生效', color: '#d97706', bg: '#fffbeb' } };
const today = () => new Date().toISOString().substring(0, 10);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const EMPTY = { company: '', contact: '', phone: '', email: '', serviceType: SERVICE_TYPES[0], startDate: today(), endDate: '', totalSessions: 10, price: '', notes: '' };

const cardS = { background: '#fff', borderRadius: 10, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.08)', marginBottom: 14 };
const btnS = { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnOutS = { ...btnS, background: '#fff', color: ACCENT, border: `1.5px solid ${ACCENT}` };
const inputS = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const thS = { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' };
const tdS = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 14 };
const tabBtnS = (a) => ({ padding: '8px 18px', border: 'none', borderBottom: a ? `3px solid ${ACCENT}` : '3px solid transparent', background: 'none', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? ACCENT : '#6b7280', fontSize: 14 });

export default function CompanyServices({ data, showToast, user }) {
  const [tab, setTab] = useState('list');
  const [contracts, setContracts] = useState(() => load(LS_CONTRACTS, []));
  const [sessions, setSessions] = useState(() => load(LS_SESSIONS, []));
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selContract, setSelContract] = useState(null);
  const [sessionForm, setSessionForm] = useState({ date: today(), employeeName: '', service: '', doctor: '' });
  const [filter, setFilter] = useState('all');
  const DOCTORS = getDoctors();

  const persist = (c, s) => { save(LS_CONTRACTS, c); save(LS_SESSIONS, s); };

  const getStatus = (c) => {
    const d = today();
    if (c.startDate > d) return 'pending';
    if (c.endDate && c.endDate < d) return 'expired';
    return 'active';
  };

  const usedCount = (cid) => sessions.filter(s => s.contractId === cid).length;

  // --- stats ---
  const stats = useMemo(() => {
    const active = contracts.filter(c => getStatus(c) === 'active').length;
    const revenue = contracts.reduce((s, c) => s + Number(c.price || 0), 0);
    const totalSess = contracts.reduce((s, c) => s + Number(c.totalSessions || 0), 0);
    const totalUsed = sessions.length;
    const util = totalSess > 0 ? Math.round((totalUsed / totalSess) * 100) : 0;
    const soon = contracts.filter(c => {
      if (getStatus(c) === 'expired') return false;
      if (!c.endDate) return false;
      const diff = (new Date(c.endDate) - new Date()) / 86400000;
      return diff >= 0 && diff <= 30;
    }).length;
    return { active, revenue, util, soon, totalContracts: contracts.length };
  }, [contracts, sessions]);

  // --- save contract ---
  const handleSave = () => {
    if (!form.company || !form.contact || !form.endDate || !form.price) { showToast('請填寫必填欄位', 'error'); return; }
    let next;
    if (editId) {
      next = contracts.map(c => c.id === editId ? { ...form, id: editId } : c);
    } else {
      next = [...contracts, { ...form, id: uid(), createdAt: today(), createdBy: user?.name || '' }];
    }
    setContracts(next); persist(next, sessions);
    showToast(editId ? '合約已更新' : '新合約已建立'); resetForm();
  };

  const resetForm = () => { setForm({ ...EMPTY }); setEditId(null); setShowForm(false); };

  const handleEdit = (c) => { setForm({ ...c }); setEditId(c.id); setShowForm(true); setTab('list'); };

  const handleDelete = (id) => {
    if (!window.confirm('確定刪除此合約？')) return;
    const next = contracts.filter(c => c.id !== id);
    const nextS = sessions.filter(s => s.contractId !== id);
    setContracts(next); setSessions(nextS); persist(next, nextS);
    if (selContract === id) setSelContract(null);
    showToast('合約已刪除');
  };

  // --- add session ---
  const handleAddSession = () => {
    if (!selContract) return;
    const c = contracts.find(x => x.id === selContract);
    if (!c) return;
    if (usedCount(selContract) >= Number(c.totalSessions)) { showToast('已達使用上限', 'error'); return; }
    if (!sessionForm.employeeName || !sessionForm.service) { showToast('請填寫員工姓名及服務', 'error'); return; }
    const ns = [...sessions, { id: uid(), contractId: selContract, ...sessionForm }];
    setSessions(ns); persist(contracts, ns);
    setSessionForm({ date: today(), employeeName: '', service: '', doctor: '' });
    showToast('使用紀錄已新增');
  };

  const deleteSession = (sid) => {
    const ns = sessions.filter(s => s.id !== sid);
    setSessions(ns); persist(contracts, ns);
    showToast('紀錄已刪除');
  };

  // --- invoice ---
  const printInvoice = (c) => {
    const used = sessions.filter(s => s.contractId === c.id);
    const clinic = getClinicName();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>企業服務帳單</title>
<style>body{font-family:sans-serif;padding:40px;color:#333}h1{color:${ACCENT};margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
th{background:#f9fafb}.total{font-size:18px;font-weight:700;margin-top:20px}
.footer{margin-top:40px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px}
@media print{body{padding:20px}}</style></head><body>
<h1>${clinic}</h1><p style="margin:0 0 20px;color:#888">企業服務帳單</p>
<table><tr><th>公司名稱</th><td>${c.company}</td><th>聯絡人</th><td>${c.contact}</td></tr>
<tr><th>服務類型</th><td>${c.serviceType}</td><th>合約期間</th><td>${c.startDate} ~ ${c.endDate}</td></tr>
<tr><th>總次數</th><td>${c.totalSessions}</td><th>已使用</th><td>${used.length}</td></tr></table>
<h3 style="margin-top:24px">使用明細</h3>
<table><thead><tr><th>日期</th><th>員工</th><th>服務內容</th><th>醫師</th></tr></thead><tbody>
${used.map(s => `<tr><td>${s.date}</td><td>${s.employeeName}</td><td>${s.service}</td><td>${s.doctor || '-'}</td></tr>`).join('')}
${used.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#aaa">暫無紀錄</td></tr>' : ''}
</tbody></table>
<p class="total">合約金額：${fmtM(Number(c.price || 0))}</p>
<div class="footer"><p>帳單日期：${today()}</p><p>${clinic} - 企業服務部</p></div>
<script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  // --- filtered contracts ---
  const shown = useMemo(() => {
    let list = contracts.map(c => ({ ...c, _status: getStatus(c), _used: usedCount(c.id) }));
    if (filter !== 'all') list = list.filter(c => c._status === filter);
    return list.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  }, [contracts, sessions, filter]);

  const renewalList = useMemo(() => contracts.filter(c => {
    if (getStatus(c) === 'expired') return false;
    if (!c.endDate) return false;
    const diff = (new Date(c.endDate) - new Date()) / 86400000;
    return diff >= 0 && diff <= 30;
  }), [contracts]);

  const selSessions = useMemo(() => sessions.filter(s => s.contractId === selContract).sort((a, b) => b.date.localeCompare(a.date)), [sessions, selContract]);
  const selC = contracts.find(c => c.id === selContract);

  // ====== RENDER ======
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ color: ACCENT, marginBottom: 4 }}>企業服務管理</h2>
      <p style={{ color: '#888', marginTop: 0, marginBottom: 16, fontSize: 14 }}>管理企業客戶合約、使用紀錄及帳單</p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: '生效合約', val: stats.active, unit: '份' },
          { label: '合約總收入', val: fmtM(stats.revenue), unit: '' },
          { label: '使用率', val: stats.util + '%', unit: '' },
          { label: '即將到期', val: stats.soon, unit: '份', warn: stats.soon > 0 },
        ].map((s, i) => (
          <div key={i} style={{ ...cardS, textAlign: 'center', borderLeft: s.warn ? '4px solid #f59e0b' : `4px solid ${ACCENT}` }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.warn ? '#d97706' : ACCENT }}>{s.val}{s.unit && <span style={{ fontSize: 13, fontWeight: 400 }}> {s.unit}</span>}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        {[['list', '合約列表'], ['track', '使用追蹤'], ['renew', `續約提醒 (${renewalList.length})`]].map(([k, l]) => (
          <button key={k} style={tabBtnS(tab === k)} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* ========== TAB: LIST ========== */}
      {tab === 'list' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['all', '全部'], ['active', '生效中'], ['pending', '待生效'], ['expired', '已過期']].map(([v, l]) => (
              <button key={v} style={{ ...btnOutS, ...(filter === v ? { background: ACCENT, color: '#fff' } : {}), padding: '4px 12px', fontSize: 13 }} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>
          <button style={btnS} onClick={() => { resetForm(); setShowForm(true); }}>+ 新增合約</button>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div style={{ ...cardS, border: `2px solid ${ACCENT}`, marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 12px', color: ACCENT }}>{editId ? '編輯合約' : '新增企業合約'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['company', '公司名稱 *'], ['contact', '聯絡人 *'], ['phone', '電話'], ['email', 'Email']].map(([k, l]) => (
                <label key={k} style={{ fontSize: 13 }}>{l}<input style={inputS} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} /></label>
              ))}
              <label style={{ fontSize: 13 }}>服務類型
                <select style={inputS} value={form.serviceType} onChange={e => setForm({ ...form, serviceType: e.target.value })}>
                  {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>合約開始 *<input type="date" style={inputS} value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>合約結束 *<input type="date" style={inputS} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>總次數<input type="number" style={inputS} value={form.totalSessions} onChange={e => setForm({ ...form, totalSessions: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>合約金額 (HKD) *<input type="number" style={inputS} value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></label>
            </div>
            <label style={{ fontSize: 13, display: 'block', marginTop: 10 }}>備註<textarea style={{ ...inputS, minHeight: 50 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={btnS} onClick={handleSave}>{editId ? '更新' : '建立合約'}</button>
              <button style={btnOutS} onClick={resetForm}>取消</button>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['公司名稱', '聯絡人', '服務類型', '合約期間', '次數', '狀態', '金額', '操作'].map(h => <th key={h} style={thS}>{h}</th>)}
            </tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={8} style={{ ...tdS, textAlign: 'center', color: '#aaa' }}>暫無合約</td></tr>}
              {shown.map(c => {
                const st = STATUS_MAP[c._status];
                return (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => { setSelContract(c.id); setTab('track'); }}>
                    <td style={tdS}><strong>{c.company}</strong></td>
                    <td style={tdS}>{c.contact}</td>
                    <td style={tdS}>{c.serviceType}</td>
                    <td style={{ ...tdS, fontSize: 13 }}>{c.startDate} ~ {c.endDate}</td>
                    <td style={tdS}>{c._used}/{c.totalSessions}</td>
                    <td style={tdS}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span></td>
                    <td style={tdS}>{fmtM(Number(c.price || 0))}</td>
                    <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                      <button style={{ ...btnOutS, padding: '3px 10px', fontSize: 12, marginRight: 4 }} onClick={e => { e.stopPropagation(); handleEdit(c); }}>編輯</button>
                      <button style={{ ...btnOutS, padding: '3px 10px', fontSize: 12, marginRight: 4, color: '#0284c7', borderColor: '#0284c7' }} onClick={e => { e.stopPropagation(); printInvoice(c); }}>帳單</button>
                      <button style={{ ...btnOutS, padding: '3px 10px', fontSize: 12, color: '#dc2626', borderColor: '#dc2626' }} onClick={e => { e.stopPropagation(); handleDelete(c.id); }}>刪除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}

      {/* ========== TAB: TRACK ========== */}
      {tab === 'track' && <>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <select style={{ ...inputS, width: 280 }} value={selContract || ''} onChange={e => setSelContract(e.target.value || null)}>
            <option value="">-- 選擇合約 --</option>
            {contracts.map(c => <option key={c.id} value={c.id}>{c.company} ({c.serviceType})</option>)}
          </select>
        </div>

        {selC && (
          <>
            {/* Progress */}
            <div style={{ ...cardS, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: 12, color: '#6b7280' }}>公司</div><div style={{ fontWeight: 700 }}>{selC.company}</div></div>
              <div><div style={{ fontSize: 12, color: '#6b7280' }}>服務</div><div>{selC.serviceType}</div></div>
              <div><div style={{ fontSize: 12, color: '#6b7280' }}>狀態</div><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: STATUS_MAP[getStatus(selC)].color, background: STATUS_MAP[getStatus(selC)].bg }}>{STATUS_MAP[getStatus(selC)].label}</span></div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>使用進度 {usedCount(selC.id)}/{selC.totalSessions}</div>
                <div style={{ background: '#e5e7eb', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (usedCount(selC.id) / Math.max(1, selC.totalSessions)) * 100)}%`, height: '100%', background: ACCENT, borderRadius: 6, transition: 'width .3s' }} />
                </div>
              </div>
            </div>

            {/* Add Session */}
            <div style={{ ...cardS, border: `1.5px dashed ${ACCENT}` }}>
              <h4 style={{ margin: '0 0 10px', color: ACCENT }}>新增使用紀錄</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
                <label style={{ fontSize: 13 }}>日期<input type="date" style={inputS} value={sessionForm.date} onChange={e => setSessionForm({ ...sessionForm, date: e.target.value })} /></label>
                <label style={{ fontSize: 13 }}>員工姓名 *<input style={inputS} value={sessionForm.employeeName} onChange={e => setSessionForm({ ...sessionForm, employeeName: e.target.value })} /></label>
                <label style={{ fontSize: 13 }}>服務內容 *<input style={inputS} value={sessionForm.service} onChange={e => setSessionForm({ ...sessionForm, service: e.target.value })} /></label>
                <label style={{ fontSize: 13 }}>醫師
                  <select style={inputS} value={sessionForm.doctor} onChange={e => setSessionForm({ ...sessionForm, doctor: e.target.value })}>
                    <option value="">-- 選擇 --</option>
                    {DOCTORS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
              </div>
              <button style={{ ...btnS, marginTop: 10 }} onClick={handleAddSession}>新增紀錄</button>
            </div>

            {/* Session Log */}
            <div style={cardS}>
              <h4 style={{ margin: '0 0 10px' }}>使用紀錄 ({selSessions.length})</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['日期', '員工', '服務內容', '醫師', '操作'].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
                <tbody>
                  {selSessions.length === 0 && <tr><td colSpan={5} style={{ ...tdS, textAlign: 'center', color: '#aaa' }}>暫無紀錄</td></tr>}
                  {selSessions.map(s => (
                    <tr key={s.id}>
                      <td style={tdS}>{s.date}</td>
                      <td style={tdS}>{s.employeeName}</td>
                      <td style={tdS}>{s.service}</td>
                      <td style={tdS}>{s.doctor || '-'}</td>
                      <td style={tdS}><button style={{ ...btnOutS, padding: '2px 8px', fontSize: 12, color: '#dc2626', borderColor: '#dc2626' }} onClick={() => deleteSession(s.id)}>刪除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button style={{ ...btnOutS, marginTop: 4 }} onClick={() => printInvoice(selC)}>列印帳單</button>
          </>
        )}
        {!selC && <div style={{ ...cardS, textAlign: 'center', color: '#aaa', padding: 40 }}>請選擇一個合約以查看使用追蹤</div>}
      </>}

      {/* ========== TAB: RENEW ========== */}
      {tab === 'renew' && <>
        <h3 style={{ color: '#d97706', marginBottom: 10 }}>即將到期合約（30 天內）</h3>
        {renewalList.length === 0 && <div style={{ ...cardS, textAlign: 'center', color: '#aaa', padding: 30 }}>目前沒有即將到期的合約</div>}
        {renewalList.map(c => {
          const diff = Math.ceil((new Date(c.endDate) - new Date()) / 86400000);
          return (
            <div key={c.id} style={{ ...cardS, borderLeft: '4px solid #f59e0b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong style={{ fontSize: 15 }}>{c.company}</strong>
                <span style={{ marginLeft: 10, fontSize: 13, color: '#6b7280' }}>{c.serviceType}</span>
                <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>到期日：{c.endDate}（剩餘 {diff} 天）</div>
                <div style={{ fontSize: 13, color: '#888' }}>已使用 {usedCount(c.id)}/{c.totalSessions} 次 | {fmtM(Number(c.price || 0))}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...btnS, fontSize: 13, padding: '6px 14px' }} onClick={() => { setForm({ ...c, startDate: c.endDate, endDate: '', id: undefined }); setEditId(null); setShowForm(true); setTab('list'); }}>續約</button>
                <button style={{ ...btnOutS, fontSize: 13, padding: '6px 14px' }} onClick={() => printInvoice(c)}>帳單</button>
              </div>
            </div>
          );
        })}
      </>}
    </div>
  );
}
