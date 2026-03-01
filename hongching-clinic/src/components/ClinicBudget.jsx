import React, { useState, useMemo, useEffect } from 'react';
import { getClinicName } from '../tenant';
import { fmtM, EXPENSE_CATEGORIES } from '../data';
import { clinicBudgetOps } from '../api';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_clinic_budget';
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const BUDGET_CATS = ['人工','租金','藥材','設備','水電','宣傳','保險','培訓','維修','雜項'];
const STATUS_LABELS = { draft: '草稿', pending: '待審批', approved: '已核准' };
const STATUS_COLORS = { draft: '#888', pending: '#d97706', approved: '#16a34a' };

function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function save(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); clinicBudgetOps.persistAll(arr); }

function emptyAlloc() {
  const a = {};
  BUDGET_CATS.forEach(c => { a[c] = Array(12).fill(0); });
  return a;
}

export default function ClinicBudget({ data, showToast, user }) {
  const clinicName = getClinicName();
  const curYear = new Date().getFullYear();
  const [plans, setPlans] = useState(load);
  const [selYear, setSelYear] = useState(curYear);

  useEffect(() => { clinicBudgetOps.load().then(d => { if (d) setPlans(d); }); }, []);
  const [tab, setTab] = useState('plan'); // plan | compare | yoy
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editAlloc, setEditAlloc] = useState(emptyAlloc());
  const [editStatus, setEditStatus] = useState('draft');

  /* ── Derived: current plan for selected year ── */
  const plan = useMemo(() => plans.find(p => p.year === selYear), [plans, selYear]);
  const alloc = plan ? plan.alloc : emptyAlloc();

  /* ── Actual spending from data.expenses grouped by budget category + month ── */
  const actuals = useMemo(() => {
    const map = {};
    BUDGET_CATS.forEach(c => { map[c] = Array(12).fill(0); });
    const catMap = {};
    Object.entries(EXPENSE_CATEGORIES).forEach(([, subs]) => subs.forEach(s => {
      if (s.includes('人工') || s === 'MPF' || s === '勞保') catMap[s] = '人工';
      else if (s.includes('租金') || s === '管理費') catMap[s] = '租金';
      else if (s.includes('藥材') || s.includes('耗材')) catMap[s] = '藥材';
      else if (s.includes('器材') || s.includes('傢俬') || s.includes('設備') || s.includes('電腦')) catMap[s] = '設備';
      else if (s.includes('電費') || s.includes('水費') || s.includes('電話')) catMap[s] = '水電';
      else if (s.includes('廣告') || s.includes('宣傳') || s.includes('推廣')) catMap[s] = '宣傳';
      else if (s.includes('保險') || s.includes('牌照')) catMap[s] = '保險';
      else if (s.includes('培訓')) catMap[s] = '培訓';
      else if (s.includes('裝修') || s.includes('維修')) catMap[s] = '維修';
      else catMap[s] = '雜項';
    }));
    (data.expenses || []).forEach(e => {
      if (!e.date) return;
      const y = parseInt(e.date.substring(0, 4), 10);
      const m = parseInt(e.date.substring(5, 7), 10) - 1;
      if (y !== selYear || m < 0 || m > 11) return;
      const bc = catMap[e.category] || '雜項';
      map[bc][m] += Number(e.amount || 0);
    });
    return map;
  }, [data.expenses, selYear]);

  /* ── Summary: annual budget vs actual per category ── */
  const summary = useMemo(() => {
    return BUDGET_CATS.map(cat => {
      const budgetArr = alloc[cat] || Array(12).fill(0);
      const actualArr = actuals[cat] || Array(12).fill(0);
      const budget = budgetArr.reduce((s, v) => s + v, 0);
      const actual = actualArr.reduce((s, v) => s + v, 0);
      const variance = budget - actual;
      const pct = budget > 0 ? (actual / budget) * 100 : 0;
      return { cat, budget, actual, variance, pct };
    });
  }, [alloc, actuals]);

  const grandBudget = summary.reduce((s, r) => s + r.budget, 0);
  const grandActual = summary.reduce((s, r) => s + r.actual, 0);

  /* ── Year-over-year data ── */
  const yoyData = useMemo(() => {
    const prevPlan = plans.find(p => p.year === selYear - 1);
    if (!prevPlan) return null;
    return BUDGET_CATS.map(cat => {
      const curBudget = (alloc[cat] || Array(12).fill(0)).reduce((s, v) => s + v, 0);
      const prevBudget = (prevPlan.alloc[cat] || Array(12).fill(0)).reduce((s, v) => s + v, 0);
      const diff = curBudget - prevBudget;
      const diffPct = prevBudget > 0 ? (diff / prevBudget) * 100 : 0;
      return { cat, curBudget, prevBudget, diff, diffPct };
    });
  }, [plans, alloc, selYear]);

  /* ── Alerts: categories exceeding 90% of budget ── */
  const alerts = summary.filter(r => r.budget > 0 && r.pct >= 90);

  /* ── CRUD ── */
  const startEdit = () => {
    if (plan) { setEditAlloc(JSON.parse(JSON.stringify(plan.alloc))); setEditStatus(plan.status); setEditId(plan.id); }
    else { setEditAlloc(emptyAlloc()); setEditStatus('draft'); setEditId(null); }
    setEditing(true);
  };

  const saveEdit = () => {
    const updated = [...plans];
    if (editId) {
      const idx = updated.findIndex(p => p.id === editId);
      if (idx >= 0) { updated[idx] = { ...updated[idx], alloc: editAlloc, status: editStatus, updatedBy: user?.name || '', updatedAt: new Date().toISOString() }; }
    } else {
      updated.push({ id: uid(), year: selYear, alloc: editAlloc, status: editStatus, createdBy: user?.name || '', createdAt: new Date().toISOString(), updatedBy: '', updatedAt: '' });
    }
    setPlans(updated);
    save(updated);
    setEditing(false);
    setEditId(null);
    setEditAlloc(emptyAlloc());
    showToast?.(`${selYear} 年預算已儲存`);
  };

  const cancelEdit = () => { setEditing(false); setEditId(null); setEditAlloc(emptyAlloc()); };

  const setAllocVal = (cat, mi, val) => {
    setEditAlloc(prev => {
      const next = { ...prev };
      next[cat] = [...(next[cat] || Array(12).fill(0))];
      next[cat][mi] = Math.max(0, Number(val) || 0);
      return next;
    });
  };

  const applyUniform = (cat, total) => {
    const monthly = Math.round(total / 12);
    setEditAlloc(prev => { const next = { ...prev }; next[cat] = Array(12).fill(monthly); return next; });
  };

  /* ── Status workflow ── */
  const advanceStatus = () => {
    if (!plan) return;
    const next = plan.status === 'draft' ? 'pending' : plan.status === 'pending' ? 'approved' : null;
    if (!next) return;
    const updated = plans.map(p => p.id === plan.id ? { ...p, status: next, updatedBy: user?.name || '', updatedAt: new Date().toISOString() } : p);
    setPlans(updated);
    save(updated);
    showToast?.(`預算狀態更新為「${STATUS_LABELS[next]}」`);
  };

  /* ── Print ── */
  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) return showToast?.('無法開啟列印視窗');
    const rows = summary.map(r => {
      const color = r.pct >= 100 ? '#dc2626' : r.pct >= 90 ? '#d97706' : '#333';
      return `<tr><td>${r.cat}</td><td style="text-align:right">${fmtM(r.budget)}</td><td style="text-align:right">${fmtM(r.actual)}</td><td style="text-align:right;color:${r.variance >= 0 ? '#16a34a' : '#dc2626'}">${fmtM(r.variance)}</td><td style="text-align:right;color:${color}">${r.budget > 0 ? r.pct.toFixed(1) + '%' : '-'}</td></tr>`;
    }).join('');
    const totalRow = `<tr style="font-weight:700;background:#f0fdfa"><td>合計</td><td style="text-align:right">${fmtM(grandBudget)}</td><td style="text-align:right">${fmtM(grandActual)}</td><td style="text-align:right;color:${grandBudget - grandActual >= 0 ? '#16a34a' : '#dc2626'}">${fmtM(grandBudget - grandActual)}</td><td style="text-align:right">${grandBudget > 0 ? ((grandActual / grandBudget) * 100).toFixed(1) + '%' : '-'}</td></tr>`;
    w.document.write(`<!DOCTYPE html><html><head><title>${clinicName} ${selYear}年度預算報告</title>
      <style>body{font-family:sans-serif;padding:24px;color:#333}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:8px 12px;font-size:13px}th{background:#f0fdfa;color:${ACCENT};text-align:left}.h{color:${ACCENT};margin-bottom:4px}@media print{body{padding:0}}</style>
    </head><body><h2 class="h">${clinicName}</h2><h3>${selYear} 年度預算報告</h3><p>狀態：${STATUS_LABELS[plan?.status || 'draft']}　列印日期：${new Date().toLocaleDateString('zh-HK')}</p>
    <table><thead><tr><th>類別</th><th style="text-align:right">預算</th><th style="text-align:right">實際</th><th style="text-align:right">差額</th><th style="text-align:right">使用率</th></tr></thead><tbody>${rows}${totalRow}</tbody></table>
    <script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close();
  };

  const years = useMemo(() => {
    const s = new Set(plans.map(p => p.year));
    s.add(curYear); s.add(curYear + 1);
    return [...s].sort();
  }, [plans, curYear]);

  /* ── Styles ── */
  const card = { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 12 };
  const btn = (bg = ACCENT) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 });
  const tabStyle = (active) => ({ padding: '7px 18px', background: active ? ACCENT : '#f1f5f9', color: active ? '#fff' : '#555', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontWeight: active ? 700 : 500, fontSize: 13 });
  const th = { fontSize: 12, color: '#666', padding: '6px 8px', borderBottom: `2px solid ${ACCENT}20`, textAlign: 'right', whiteSpace: 'nowrap' };
  const td = { fontSize: 13, padding: '6px 8px', borderBottom: '1px solid #eee', textAlign: 'right' };

  /* ──────────── Render ──────────── */
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ color: ACCENT, margin: 0, fontSize: 20 }}>診所年度預算</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={selYear} onChange={e => setSelYear(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }}>
            {years.map(y => <option key={y} value={y}>{y} 年</option>)}
          </select>
          {plan && <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, background: STATUS_COLORS[plan.status] + '18', color: STATUS_COLORS[plan.status], fontWeight: 700 }}>{STATUS_LABELS[plan.status]}</span>}
          <button style={btn()} onClick={startEdit}>編輯預算</button>
          {plan && plan.status !== 'approved' && <button style={btn('#16a34a')} onClick={advanceStatus}>{plan.status === 'draft' ? '提交審批' : '核准'}</button>}
          <button style={btn('#555')} onClick={printReport}>列印報告</button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ ...card, background: '#fef3c7', border: '1px solid #f59e0b' }}>
          <div style={{ fontWeight: 700, color: '#b45309', fontSize: 13, marginBottom: 4 }}>預算警告</div>
          {alerts.map(a => (
            <div key={a.cat} style={{ fontSize: 12, color: '#92400e' }}>
              {a.cat}：已使用 {a.pct.toFixed(1)}%（{fmtM(a.actual)} / {fmtM(a.budget)}）{a.pct >= 100 ? ' — 已超支！' : ' — 即將超支'}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 0 }}>
        {[['plan', '預算 vs 實際'], ['compare', '月度明細'], ['yoy', '按年比較']].map(([k, l]) => (
          <button key={k} style={tabStyle(tab === k)} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* ── TAB: Plan summary ── */}
      {tab === 'plan' && (
        <div style={card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['類別', '年度預算', '實際支出', '差額', '使用率', '進度'].map(h => <th key={h} style={{ ...th, textAlign: h === '類別' || h === '進度' ? 'left' : 'right' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {summary.map(r => {
                  const barPct = Math.min(r.pct, 120);
                  const barColor = r.pct >= 100 ? '#dc2626' : r.pct >= 90 ? '#d97706' : ACCENT;
                  return (
                    <tr key={r.cat}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{r.cat}</td>
                      <td style={td}>{fmtM(r.budget)}</td>
                      <td style={td}>{fmtM(r.actual)}</td>
                      <td style={{ ...td, color: r.variance >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{r.variance >= 0 ? '+' : ''}{fmtM(r.variance)}</td>
                      <td style={{ ...td, color: r.pct >= 100 ? '#dc2626' : r.pct >= 90 ? '#d97706' : '#333' }}>{r.budget > 0 ? r.pct.toFixed(1) + '%' : '-'}</td>
                      <td style={{ ...td, textAlign: 'left', minWidth: 120 }}>
                        <div style={{ background: '#f1f5f9', borderRadius: 4, height: 16, position: 'relative', overflow: 'hidden' }}>
                          <div style={{ width: `${barPct}%`, height: '100%', background: barColor, borderRadius: 4, transition: 'width 0.4s' }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight: 700, background: '#f0fdfa' }}>
                  <td style={{ ...td, textAlign: 'left' }}>合計</td>
                  <td style={td}>{fmtM(grandBudget)}</td>
                  <td style={td}>{fmtM(grandActual)}</td>
                  <td style={{ ...td, color: grandBudget - grandActual >= 0 ? '#16a34a' : '#dc2626' }}>{grandBudget - grandActual >= 0 ? '+' : ''}{fmtM(grandBudget - grandActual)}</td>
                  <td style={td}>{grandBudget > 0 ? ((grandActual / grandBudget) * 100).toFixed(1) + '%' : '-'}</td>
                  <td style={td} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: Monthly compare ── */}
      {tab === 'compare' && (
        <div style={card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>類別</th>
                  {MONTHS.map(m => <th key={m} style={th}>{m}</th>)}
                  <th style={th}>年度合計</th>
                </tr>
              </thead>
              <tbody>
                {BUDGET_CATS.map(cat => {
                  const bArr = alloc[cat] || Array(12).fill(0);
                  const aArr = actuals[cat] || Array(12).fill(0);
                  const bTotal = bArr.reduce((s, v) => s + v, 0);
                  const aTotal = aArr.reduce((s, v) => s + v, 0);
                  return (
                    <React.Fragment key={cat}>
                      <tr>
                        <td rowSpan={2} style={{ ...td, textAlign: 'left', fontWeight: 700, verticalAlign: 'middle', borderRight: '2px solid #eee' }}>{cat}</td>
                        {bArr.map((v, i) => <td key={i} style={{ ...td, color: ACCENT, fontSize: 11 }}>{v > 0 ? fmtM(v) : '-'}</td>)}
                        <td style={{ ...td, color: ACCENT, fontWeight: 700 }}>{fmtM(bTotal)}</td>
                      </tr>
                      <tr>
                        {aArr.map((v, i) => {
                          const over = bArr[i] > 0 && v > bArr[i];
                          return <td key={i} style={{ ...td, fontSize: 11, color: over ? '#dc2626' : '#555', background: over ? '#fef2f2' : 'transparent' }}>{v > 0 ? fmtM(v) : '-'}</td>;
                        })}
                        <td style={{ ...td, fontWeight: 700, color: aTotal > bTotal ? '#dc2626' : '#333' }}>{fmtM(aTotal)}</td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>上行 = 預算（青色），下行 = 實際支出；紅色 = 超出預算</div>
          </div>
        </div>
      )}

      {/* ── TAB: Year-over-year ── */}
      {tab === 'yoy' && (
        <div style={card}>
          {!yoyData ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>沒有 {selYear - 1} 年預算數據可供比較</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>類別</th>
                    <th style={th}>{selYear - 1} 年預算</th>
                    <th style={th}>{selYear} 年預算</th>
                    <th style={th}>變動金額</th>
                    <th style={th}>變動率</th>
                  </tr>
                </thead>
                <tbody>
                  {yoyData.map(r => (
                    <tr key={r.cat}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{r.cat}</td>
                      <td style={td}>{fmtM(r.prevBudget)}</td>
                      <td style={td}>{fmtM(r.curBudget)}</td>
                      <td style={{ ...td, color: r.diff > 0 ? '#dc2626' : r.diff < 0 ? '#16a34a' : '#333' }}>{r.diff > 0 ? '+' : ''}{fmtM(r.diff)}</td>
                      <td style={{ ...td, color: r.diffPct > 0 ? '#dc2626' : r.diffPct < 0 ? '#16a34a' : '#333' }}>{r.prevBudget > 0 ? (r.diffPct > 0 ? '+' : '') + r.diffPct.toFixed(1) + '%' : '-'}</td>
                    </tr>
                  ))}
                  {(() => {
                    const curT = yoyData.reduce((s, r) => s + r.curBudget, 0);
                    const prevT = yoyData.reduce((s, r) => s + r.prevBudget, 0);
                    const d = curT - prevT;
                    const dp = prevT > 0 ? (d / prevT) * 100 : 0;
                    return (
                      <tr style={{ fontWeight: 700, background: '#f0fdfa' }}>
                        <td style={{ ...td, textAlign: 'left' }}>合計</td>
                        <td style={td}>{fmtM(prevT)}</td>
                        <td style={td}>{fmtM(curT)}</td>
                        <td style={{ ...td, color: d > 0 ? '#dc2626' : '#16a34a' }}>{d > 0 ? '+' : ''}{fmtM(d)}</td>
                        <td style={{ ...td, color: dp > 0 ? '#dc2626' : '#16a34a' }}>{prevT > 0 ? (dp > 0 ? '+' : '') + dp.toFixed(1) + '%' : '-'}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '95%', maxWidth: 900, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ color: ACCENT, marginTop: 0 }}>{selYear} 年度預算編輯</h3>
            <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>狀態：</label>
              <select value={editStatus} onChange={e => setEditStatus(e.target.value)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: 'left' }}>類別</th>
                    {MONTHS.map(m => <th key={m} style={th}>{m}</th>)}
                    <th style={th}>年度合計</th>
                    <th style={th}>均分</th>
                  </tr>
                </thead>
                <tbody>
                  {BUDGET_CATS.map(cat => {
                    const arr = editAlloc[cat] || Array(12).fill(0);
                    const total = arr.reduce((s, v) => s + v, 0);
                    return (
                      <tr key={cat}>
                        <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{cat}</td>
                        {arr.map((v, i) => (
                          <td key={i} style={{ ...td, padding: 2 }}>
                            <input type="number" min="0" value={v || ''} onChange={e => setAllocVal(cat, i, e.target.value)} style={{ width: 58, padding: '3px 4px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, textAlign: 'right' }} />
                          </td>
                        ))}
                        <td style={{ ...td, fontWeight: 700, color: ACCENT }}>{fmtM(total)}</td>
                        <td style={{ ...td, padding: 2 }}>
                          <input type="number" min="0" placeholder="年度總額" onBlur={e => { const v = Number(e.target.value); if (v > 0) applyUniform(cat, v); }} style={{ width: 70, padding: '3px 4px', border: '1px solid #ddd', borderRadius: 4, fontSize: 12, textAlign: 'right' }} />
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: '#f0fdfa', fontWeight: 700 }}>
                    <td style={{ ...td, textAlign: 'left' }}>合計</td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const mTotal = BUDGET_CATS.reduce((s, c) => s + (editAlloc[c]?.[i] || 0), 0);
                      return <td key={i} style={{ ...td, color: ACCENT }}>{fmtM(mTotal)}</td>;
                    })}
                    <td style={{ ...td, color: ACCENT }}>{fmtM(BUDGET_CATS.reduce((s, c) => s + (editAlloc[c] || []).reduce((a, v) => a + v, 0), 0))}</td>
                    <td style={td} />
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button style={btn('#aaa')} onClick={cancelEdit}>取消</button>
              <button style={btn()} onClick={saveEdit}>儲存預算</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Info footer ── */}
      {plan && (
        <div style={{ fontSize: 11, color: '#999', marginTop: 6, textAlign: 'right' }}>
          建立者：{plan.createdBy || '-'}　最後更新：{plan.updatedAt ? new Date(plan.updatedAt).toLocaleDateString('zh-HK') : plan.createdAt ? new Date(plan.createdAt).toLocaleDateString('zh-HK') : '-'}
        </div>
      )}
    </div>
  );
}
