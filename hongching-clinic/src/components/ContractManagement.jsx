import { useState, useMemo } from 'react';
import { fmtM } from '../data';
import { getClinicName } from '../tenant';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_contracts';
const TYPES = ['租約', '供應商合約', '設備維護合約', '保險合約', '員工合約', '其他'];
const STATUS_MAP = { active: { label: '生效中', color: '#16a34a', bg: '#f0fdf4' }, expiring: { label: '即將到期', color: '#d97706', bg: '#fffbeb' }, expired: { label: '已到期', color: '#dc2626', bg: '#fef2f2' }, terminated: { label: '已終止', color: '#6b7280', bg: '#f3f4f6' } };
const today = () => new Date().toISOString().substring(0, 10);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const save = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));
const diffDays = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);
const EMPTY = { title: '', type: TYPES[0], counterparty: '', startDate: today(), endDate: '', monthlyValue: '', totalValue: '', autoRenew: false, noticePeriod: '', keyTerms: '', attachmentNotes: '', terminated: false, renewals: [] };

const cardS = { background: '#fff', borderRadius: 10, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.08)', marginBottom: 14 };
const btnS = { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnOutS = { ...btnS, background: '#fff', color: ACCENT, border: `1.5px solid ${ACCENT}` };
const inputS = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const thS = { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' };
const tdS = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 14 };
const tabBtnS = (a) => ({ padding: '8px 18px', border: 'none', borderBottom: a ? `3px solid ${ACCENT}` : '3px solid transparent', background: 'none', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? ACCENT : '#6b7280', fontSize: 14 });

const getStatus = (c) => {
  if (c.terminated) return 'terminated';
  const d = today();
  if (c.endDate && c.endDate < d) return 'expired';
  if (c.endDate && diffDays(c.endDate) <= 30) return 'expiring';
  return 'active';
};

export default function ContractManagement({ showToast, user }) {
  const [contracts, setContracts] = useState(load);
  const [tab, setTab] = useState('list');
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');
  const [alertDays, setAlertDays] = useState(30);

  const persist = (list) => { setContracts(list); save(list); };
  const resetForm = () => { setForm({ ...EMPTY }); setEditId(null); setShowForm(false); };

  const handleSave = () => {
    if (!form.title || !form.counterparty || !form.endDate) { showToast('請填寫標題、對方及結束日期', 'error'); return; }
    let next;
    if (editId) {
      next = contracts.map(c => c.id === editId ? { ...c, ...form } : c);
    } else {
      next = [...contracts, { ...form, id: uid(), createdAt: today(), createdBy: user?.name || '' }];
    }
    persist(next); showToast(editId ? '合約已更新' : '合約已建立'); resetForm();
  };

  const handleDelete = (id) => {
    if (!window.confirm('確定刪除此合約？')) return;
    persist(contracts.filter(c => c.id !== id)); showToast('合約已刪除');
  };

  const handleTerminate = (id) => {
    if (!window.confirm('確定終止此合約？')) return;
    persist(contracts.map(c => c.id === id ? { ...c, terminated: true } : c)); showToast('合約已終止');
  };

  const handleRenew = (c) => {
    const renewal = { date: today(), by: user?.name || '系統', from: c.startDate, to: c.endDate };
    const newStart = c.endDate;
    const dur = (new Date(c.endDate) - new Date(c.startDate)) / 86400000;
    const newEnd = new Date(new Date(newStart).getTime() + dur * 86400000).toISOString().substring(0, 10);
    const updated = contracts.map(x => x.id === c.id ? { ...x, startDate: newStart, endDate: newEnd, terminated: false, renewals: [...(x.renewals || []), renewal] } : x);
    persist(updated); showToast('合約已續約');
  };

  const shown = useMemo(() => {
    let list = contracts.map(c => ({ ...c, _status: getStatus(c) }));
    if (filter !== 'all') list = list.filter(c => c._status === filter);
    return list.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  }, [contracts, filter]);

  const alertList = useMemo(() => contracts.filter(c => {
    if (c.terminated) return false;
    if (!c.endDate) return false;
    const d = diffDays(c.endDate);
    return d >= 0 && d <= alertDays;
  }).sort((a, b) => diffDays(a.endDate) - diffDays(b.endDate)), [contracts, alertDays]);

  const stats = useMemo(() => {
    const active = contracts.filter(c => getStatus(c) === 'active' || getStatus(c) === 'expiring');
    const monthlyTotal = active.reduce((s, c) => s + Number(c.monthlyValue || 0), 0);
    const annualTotal = monthlyTotal * 12;
    const totalValue = contracts.reduce((s, c) => s + Number(c.totalValue || 0), 0);
    const expiring30 = contracts.filter(c => !c.terminated && c.endDate && diffDays(c.endDate) >= 0 && diffDays(c.endDate) <= 30).length;
    return { activeCount: active.length, monthlyTotal, annualTotal, totalValue, expiring30 };
  }, [contracts]);

  const printReport = () => {
    const clinic = getClinicName();
    const rows = contracts.filter(c => !c.terminated).map(c => {
      const st = STATUS_MAP[getStatus(c)];
      return `<tr><td>${c.title}</td><td>${c.type}</td><td>${c.counterparty}</td><td>${c.startDate} ~ ${c.endDate}</td><td>${fmtM(Number(c.monthlyValue || 0))}</td><td>${fmtM(Number(c.totalValue || 0))}</td><td>${st.label}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>合約管理報告</title>
<style>body{font-family:sans-serif;padding:40px;color:#333}h1{color:${ACCENT};margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
th{background:#f9fafb}.sub{color:#888;font-size:13px;margin-bottom:20px}
.summary{margin-top:20px;padding:14px;background:#f0fdfa;border-radius:8px;font-size:14px}
.footer{margin-top:40px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px}
@media print{body{padding:20px}}</style></head><body>
<h1>${clinic} — 合約管理報告</h1><div class="sub">列印時間：${new Date().toLocaleString('zh-HK')}</div>
<div class="summary"><strong>每月合約總額：</strong>${fmtM(stats.monthlyTotal)} | <strong>年度預測：</strong>${fmtM(stats.annualTotal)} | <strong>生效合約：</strong>${stats.activeCount} 份</div>
<table><thead><tr><th>合約名稱</th><th>類型</th><th>對方</th><th>期間</th><th>月費</th><th>總值</th><th>狀態</th></tr></thead><tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#aaa">暫無合約</td></tr>'}</tbody></table>
<div class="footer"><p>${clinic} - 合約管理</p></div>
<script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ color: ACCENT, marginBottom: 4 }}>合約管理</h2>
      <p style={{ color: '#888', marginTop: 0, marginBottom: 16, fontSize: 14 }}>管理診所租約、供應商、設備維護、保險及員工合約</p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: '生效合約', val: stats.activeCount, unit: '份' },
          { label: '每月總額', val: fmtM(stats.monthlyTotal) },
          { label: '年度預測', val: fmtM(stats.annualTotal) },
          { label: '即將到期', val: stats.expiring30, unit: '份', warn: stats.expiring30 > 0 },
        ].map((s, i) => (
          <div key={i} style={{ ...cardS, textAlign: 'center', borderLeft: s.warn ? '4px solid #f59e0b' : `4px solid ${ACCENT}` }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.warn ? '#d97706' : ACCENT }}>{s.val}{s.unit && <span style={{ fontSize: 13, fontWeight: 400 }}> {s.unit}</span>}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        {[['list', '合約列表'], ['alerts', `到期提醒 (${alertList.length})`], ['finance', '財務摘要']].map(([k, l]) => (
          <button key={k} style={tabBtnS(tab === k)} onClick={() => setTab(k)}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={{ ...btnOutS, padding: '4px 14px', fontSize: 13 }} onClick={printReport}>列印報告</button>
      </div>

      {/* ========== TAB: LIST ========== */}
      {tab === 'list' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['all', '全部'], ['active', '生效中'], ['expiring', '即將到期'], ['expired', '已到期'], ['terminated', '已終止']].map(([v, l]) => (
              <button key={v} style={{ ...btnOutS, ...(filter === v ? { background: ACCENT, color: '#fff' } : {}), padding: '4px 12px', fontSize: 13 }} onClick={() => setFilter(v)}>{l}</button>
            ))}
          </div>
          <button style={btnS} onClick={() => { resetForm(); setShowForm(true); }}>+ 新增合約</button>
        </div>

        {showForm && (
          <div style={{ ...cardS, border: `2px solid ${ACCENT}`, marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 12px', color: ACCENT }}>{editId ? '編輯合約' : '新增合約'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 13 }}>合約名稱 *<input style={inputS} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>類型
                <select style={inputS} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>對方 *<input style={inputS} value={form.counterparty} onChange={e => setForm({ ...form, counterparty: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>開始日期<input type="date" style={inputS} value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>結束日期 *<input type="date" style={inputS} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>每月費用 (HKD)<input type="number" style={inputS} value={form.monthlyValue} onChange={e => setForm({ ...form, monthlyValue: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>合約總值 (HKD)<input type="number" style={inputS} value={form.totalValue} onChange={e => setForm({ ...form, totalValue: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>通知期 (天)<input type="number" style={inputS} value={form.noticePeriod} onChange={e => setForm({ ...form, noticePeriod: e.target.value })} /></label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
                <input type="checkbox" checked={form.autoRenew} onChange={e => setForm({ ...form, autoRenew: e.target.checked })} /> 自動續約
              </label>
            </div>
            <label style={{ fontSize: 13, display: 'block', marginTop: 10 }}>主要條款<textarea style={{ ...inputS, minHeight: 50 }} value={form.keyTerms} onChange={e => setForm({ ...form, keyTerms: e.target.value })} /></label>
            <label style={{ fontSize: 13, display: 'block', marginTop: 10 }}>附件備註<input style={inputS} value={form.attachmentNotes} onChange={e => setForm({ ...form, attachmentNotes: e.target.value })} /></label>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={btnS} onClick={handleSave}>{editId ? '更新' : '建立合約'}</button>
              <button style={btnOutS} onClick={resetForm}>取消</button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['合約名稱', '類型', '對方', '期間', '月費', '狀態', '操作'].map(h => <th key={h} style={thS}>{h}</th>)}
            </tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={7} style={{ ...tdS, textAlign: 'center', color: '#aaa' }}>暫無合約</td></tr>}
              {shown.map(c => {
                const st = STATUS_MAP[c._status];
                return (
                  <tr key={c.id}>
                    <td style={tdS}><strong>{c.title}</strong>{c.autoRenew && <span style={{ marginLeft: 6, fontSize: 11, color: '#0e7490', background: '#ecfeff', padding: '1px 6px', borderRadius: 8 }}>自動續約</span>}</td>
                    <td style={tdS}>{c.type}</td>
                    <td style={tdS}>{c.counterparty}</td>
                    <td style={{ ...tdS, fontSize: 13 }}>{c.startDate} ~ {c.endDate}</td>
                    <td style={tdS}>{fmtM(Number(c.monthlyValue || 0))}</td>
                    <td style={tdS}><span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span></td>
                    <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                      <button style={{ ...btnOutS, padding: '3px 10px', fontSize: 12, marginRight: 4 }} onClick={() => { setForm({ ...c }); setEditId(c.id); setShowForm(true); }}>編輯</button>
                      {c._status !== 'terminated' && <button style={{ ...btnOutS, padding: '3px 10px', fontSize: 12, marginRight: 4, color: '#d97706', borderColor: '#d97706' }} onClick={() => handleRenew(c)}>續約</button>}
                      {c._status === 'active' && <button style={{ ...btnOutS, padding: '3px 10px', fontSize: 12, marginRight: 4, color: '#6b7280', borderColor: '#6b7280' }} onClick={() => handleTerminate(c.id)}>終止</button>}
                      <button style={{ ...btnOutS, padding: '3px 10px', fontSize: 12, color: '#dc2626', borderColor: '#dc2626' }} onClick={() => handleDelete(c.id)}>刪除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}

      {/* ========== TAB: ALERTS ========== */}
      {tab === 'alerts' && <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[30, 60, 90].map(d => (
            <button key={d} style={{ ...btnOutS, ...(alertDays === d ? { background: ACCENT, color: '#fff' } : {}), padding: '4px 14px', fontSize: 13 }} onClick={() => setAlertDays(d)}>{d} 天內</button>
          ))}
        </div>
        {alertList.length === 0 && <div style={{ ...cardS, textAlign: 'center', color: '#aaa', padding: 30 }}>目前沒有即將到期的合約</div>}
        {alertList.map(c => {
          const d = diffDays(c.endDate);
          const urgent = d <= 14;
          return (
            <div key={c.id} style={{ ...cardS, borderLeft: `4px solid ${urgent ? '#dc2626' : '#f59e0b'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <strong style={{ fontSize: 15 }}>{c.title}</strong>
                <span style={{ marginLeft: 10, fontSize: 13, color: '#6b7280' }}>{c.type} | {c.counterparty}</span>
                <div style={{ fontSize: 13, color: urgent ? '#dc2626' : '#d97706', marginTop: 2, fontWeight: 600 }}>到期日：{c.endDate}（剩餘 {d} 天）{c.noticePeriod && ` | 通知期：${c.noticePeriod} 天`}</div>
                <div style={{ fontSize: 13, color: '#888' }}>月費 {fmtM(Number(c.monthlyValue || 0))} | {c.autoRenew ? '自動續約' : '需手動續約'}</div>
                {(c.renewals || []).length > 0 && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>已續約 {c.renewals.length} 次（上次：{c.renewals[c.renewals.length - 1].date}）</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...btnS, fontSize: 13, padding: '6px 14px' }} onClick={() => handleRenew(c)}>續約</button>
                <button style={{ ...btnOutS, fontSize: 13, padding: '6px 14px' }} onClick={() => handleTerminate(c.id)}>終止</button>
              </div>
            </div>
          );
        })}
      </>}

      {/* ========== TAB: FINANCE ========== */}
      {tab === 'finance' && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 18 }}>
          <div style={{ ...cardS, textAlign: 'center', borderTop: `4px solid ${ACCENT}` }}>
            <div style={{ fontSize: 13, color: '#6b7280' }}>每月合約總額</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: ACCENT }}>{fmtM(stats.monthlyTotal)}</div>
          </div>
          <div style={{ ...cardS, textAlign: 'center', borderTop: '4px solid #8b5cf6' }}>
            <div style={{ fontSize: 13, color: '#6b7280' }}>年度預測支出</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#8b5cf6' }}>{fmtM(stats.annualTotal)}</div>
          </div>
          <div style={{ ...cardS, textAlign: 'center', borderTop: '4px solid #059669' }}>
            <div style={{ fontSize: 13, color: '#6b7280' }}>合約總值</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#059669' }}>{fmtM(stats.totalValue)}</div>
          </div>
        </div>

        <h3 style={{ color: ACCENT, marginBottom: 10 }}>按類型分類</h3>
        <div style={cardS}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['合約類型', '數量', '每月小計', '年度小計'].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {TYPES.map(type => {
                const items = contracts.filter(c => c.type === type && !c.terminated);
                if (items.length === 0) return null;
                const monthly = items.reduce((s, c) => s + Number(c.monthlyValue || 0), 0);
                return (
                  <tr key={type}>
                    <td style={tdS}><strong>{type}</strong></td>
                    <td style={tdS}>{items.length} 份</td>
                    <td style={tdS}>{fmtM(monthly)}</td>
                    <td style={tdS}>{fmtM(monthly * 12)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h3 style={{ color: ACCENT, marginBottom: 10 }}>續約紀錄</h3>
        <div style={cardS}>
          {contracts.filter(c => (c.renewals || []).length > 0).length === 0 && <div style={{ textAlign: 'center', color: '#aaa', padding: 20 }}>暫無續約紀錄</div>}
          {contracts.filter(c => (c.renewals || []).length > 0).map(c => (
            <div key={c.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>
              <strong>{c.title}</strong> <span style={{ fontSize: 13, color: '#6b7280' }}>({c.counterparty})</span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                {c.renewals.map((r, i) => (
                  <span key={i} style={{ fontSize: 12, background: '#ecfeff', color: ACCENT, padding: '3px 10px', borderRadius: 12 }}>
                    第 {i + 1} 次：{r.date}（{r.from} ~ {r.to}）by {r.by}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}
