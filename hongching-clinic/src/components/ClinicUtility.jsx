import React, { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { fmtM } from '../data';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_utility_bills';
const TYPES = ['電費', '水費', '煤氣費', '電話/寬頻', '清潔費', '管理費', '差餉/地租'];
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const STATUS_MAP = { unpaid: '未付', paid: '已付' };
const STATUS_COLOR = { unpaid: '#d97706', paid: '#16a34a' };

function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function save(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }
function daysUntil(dateStr) { if (!dateStr) return Infinity; return Math.ceil((new Date(dateStr) - new Date()) / 86400000); }

export default function ClinicUtility({ data, showToast, user }) {
  const clinicName = getClinicName();
  const now = new Date();
  const curYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const curYear = now.getFullYear();

  const [bills, setBills] = useState(load);
  const [tab, setTab] = useState('list'); // list | chart | yearly
  const [selYear, setSelYear] = useState(curYear);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ type: TYPES[0], month: curYM, amount: '', dueDate: '', paidDate: '', status: 'unpaid', accountNumber: '', notes: '' });
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const persist = (next) => { setBills(next); save(next); };

  /* ── Form handlers ── */
  const openAdd = () => { setForm({ type: TYPES[0], month: curYM, amount: '', dueDate: '', paidDate: '', status: 'unpaid', accountNumber: '', notes: '' }); setEditId(null); setShowForm(true); };
  const openEdit = (b) => { setForm({ type: b.type, month: b.month, amount: b.amount, dueDate: b.dueDate || '', paidDate: b.paidDate || '', status: b.status, accountNumber: b.accountNumber || '', notes: b.notes || '' }); setEditId(b.id); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditId(null); };
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const saveForm = () => {
    if (!form.month || !form.amount) return showToast?.('請填寫月份及金額');
    const entry = { ...form, amount: Number(form.amount) || 0 };
    let next;
    if (editId) {
      next = bills.map(b => b.id === editId ? { ...b, ...entry, updatedAt: new Date().toISOString() } : b);
    } else {
      next = [...bills, { id: uid(), ...entry, createdBy: user?.name || '', createdAt: new Date().toISOString() }];
    }
    persist(next);
    closeForm();
    showToast?.(editId ? '帳單已更新' : '帳單已新增');
  };

  const deleteBill = (id) => { if (!window.confirm('確定刪除此帳單？')) return; persist(bills.filter(b => b.id !== id)); showToast?.('帳單已刪除'); };
  const markPaid = (id) => { persist(bills.map(b => b.id === id ? { ...b, status: 'paid', paidDate: new Date().toISOString().substring(0, 10) } : b)); showToast?.('已標記為已付'); };

  /* ── Filtered list ── */
  const filtered = useMemo(() => {
    let list = [...bills].sort((a, b) => (b.month || '').localeCompare(a.month || '') || (a.type || '').localeCompare(b.type || ''));
    if (filterType) list = list.filter(b => b.type === filterType);
    if (filterStatus) list = list.filter(b => b.status === filterStatus);
    return list;
  }, [bills, filterType, filterStatus]);

  /* ── Payment reminders: unpaid bills with due date within 7 days ── */
  const reminders = useMemo(() => bills.filter(b => b.status === 'unpaid' && b.dueDate && daysUntil(b.dueDate) <= 7 && daysUntil(b.dueDate) >= -30).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')), [bills]);

  /* ── Monthly averages per type (for budget alerts) ── */
  const avgByType = useMemo(() => {
    const map = {};
    const monthSet = {};
    bills.forEach(b => { if (!map[b.type]) { map[b.type] = 0; monthSet[b.type] = new Set(); } map[b.type] += b.amount || 0; monthSet[b.type].add(b.month); });
    const avg = {};
    TYPES.forEach(t => { const cnt = monthSet[t]?.size || 0; avg[t] = cnt > 0 ? map[t] / cnt : 0; });
    return avg;
  }, [bills]);

  /* ── Budget alerts: current month bills exceeding average by >20% ── */
  const budgetAlerts = useMemo(() => {
    const alerts = [];
    TYPES.forEach(t => {
      const cur = bills.filter(b => b.type === t && b.month === curYM).reduce((s, b) => s + (b.amount || 0), 0);
      const avg = avgByType[t];
      if (avg > 0 && cur > avg * 1.2) alerts.push({ type: t, cur, avg, pct: ((cur - avg) / avg * 100).toFixed(1) });
    });
    return alerts;
  }, [bills, avgByType, curYM]);

  /* ── Chart data: this month vs last month vs same month last year ── */
  const chartData = useMemo(() => {
    const prevMonth = now.getMonth() === 0 ? `${curYear - 1}-12` : `${curYear}-${String(now.getMonth()).padStart(2, '0')}`;
    const lastYearMonth = `${curYear - 1}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return TYPES.map(t => {
      const cur = bills.filter(b => b.type === t && b.month === curYM).reduce((s, b) => s + (b.amount || 0), 0);
      const prev = bills.filter(b => b.type === t && b.month === prevMonth).reduce((s, b) => s + (b.amount || 0), 0);
      const lastY = bills.filter(b => b.type === t && b.month === lastYearMonth).reduce((s, b) => s + (b.amount || 0), 0);
      return { type: t, cur, prev, lastY };
    });
  }, [bills, curYM, curYear, now]);

  const chartMax = useMemo(() => Math.max(1, ...chartData.flatMap(d => [d.cur, d.prev, d.lastY])), [chartData]);

  /* ── Yearly summary: 12 months x utility types ── */
  const yearlySummary = useMemo(() => {
    const grid = {};
    TYPES.forEach(t => { grid[t] = Array(12).fill(0); });
    bills.forEach(b => {
      if (!b.month) return;
      const y = parseInt(b.month.substring(0, 4), 10);
      const m = parseInt(b.month.substring(5, 7), 10) - 1;
      if (y !== selYear || m < 0 || m > 11) return;
      grid[b.type][m] += b.amount || 0;
    });
    return grid;
  }, [bills, selYear]);

  const yearlyTotals = useMemo(() => {
    const totals = {};
    TYPES.forEach(t => { totals[t] = yearlySummary[t].reduce((s, v) => s + v, 0); });
    return totals;
  }, [yearlySummary]);

  const grandTotal = Object.values(yearlyTotals).reduce((s, v) => s + v, 0);

  /* ── YoY change per type ── */
  const yoyChange = useMemo(() => {
    const prevGrid = {};
    TYPES.forEach(t => { prevGrid[t] = 0; });
    bills.forEach(b => {
      if (!b.month) return;
      const y = parseInt(b.month.substring(0, 4), 10);
      if (y !== selYear - 1) return;
      prevGrid[b.type] = (prevGrid[b.type] || 0) + (b.amount || 0);
    });
    const result = {};
    TYPES.forEach(t => {
      const cur = yearlyTotals[t];
      const prev = prevGrid[t] || 0;
      result[t] = { cur, prev, diff: cur - prev, pct: prev > 0 ? ((cur - prev) / prev * 100) : 0 };
    });
    return result;
  }, [bills, selYear, yearlyTotals]);

  /* ── Print yearly summary ── */
  const printYearly = () => {
    const w = window.open('', '_blank');
    if (!w) return showToast?.('無法開啟列印視窗');
    const hdr = MONTHS.map(m => `<th style="text-align:right;padding:6px 8px;font-size:12px;border-bottom:2px solid ${ACCENT}20">${m}</th>`).join('');
    const rows = TYPES.map(t => {
      const cells = yearlySummary[t].map(v => `<td style="text-align:right;padding:6px 8px;font-size:12px;border-bottom:1px solid #eee">${v > 0 ? fmtM(v) : '-'}</td>`).join('');
      return `<tr><td style="padding:6px 8px;font-weight:600;border-bottom:1px solid #eee">${t}</td>${cells}<td style="text-align:right;padding:6px 8px;font-weight:700;border-bottom:1px solid #eee">${fmtM(yearlyTotals[t])}</td><td style="text-align:right;padding:6px 8px;font-size:12px;border-bottom:1px solid #eee">${fmtM(yearlyTotals[t] / 12)}</td></tr>`;
    }).join('');
    const mTotals = Array.from({ length: 12 }, (_, i) => TYPES.reduce((s, t) => s + yearlySummary[t][i], 0));
    const footer = `<tr style="font-weight:700;background:#f0fdfa"><td style="padding:6px 8px">合計</td>${mTotals.map(v => `<td style="text-align:right;padding:6px 8px">${fmtM(v)}</td>`).join('')}<td style="text-align:right;padding:6px 8px;color:${ACCENT}">${fmtM(grandTotal)}</td><td style="text-align:right;padding:6px 8px">${fmtM(grandTotal / 12)}</td></tr>`;
    w.document.write(`<!DOCTYPE html><html><head><title>${clinicName} ${selYear}年度雜費總結</title>
      <style>body{font-family:sans-serif;padding:24px;color:#333}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#f0fdfa;color:${ACCENT};text-align:left;padding:6px 8px;font-size:12px;border-bottom:2px solid ${ACCENT}20}.h{color:${ACCENT};margin-bottom:4px}@media print{body{padding:0}}</style>
    </head><body><h2 class="h">${clinicName}</h2><h3>${selYear} 年度雜費總結</h3><p>列印日期：${new Date().toLocaleDateString('zh-HK')}</p>
    <table><thead><tr><th style="text-align:left">費用類型</th>${hdr}<th style="text-align:right;padding:6px 8px;font-size:12px;border-bottom:2px solid ${ACCENT}20">年度合計</th><th style="text-align:right;padding:6px 8px;font-size:12px;border-bottom:2px solid ${ACCENT}20">月均</th></tr></thead><tbody>${rows}${footer}</tbody></table>
    <script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close();
  };

  const years = useMemo(() => {
    const s = new Set(bills.map(b => parseInt((b.month || '').substring(0, 4), 10)).filter(Boolean));
    s.add(curYear); s.add(curYear - 1);
    return [...s].sort();
  }, [bills, curYear]);

  /* ── Styles ── */
  const card = { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 12 };
  const btn = (bg = ACCENT) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 });
  const tabStyle = (active) => ({ padding: '7px 18px', background: active ? ACCENT : '#f1f5f9', color: active ? '#fff' : '#555', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontWeight: active ? 700 : 500, fontSize: 13 });
  const th = { fontSize: 12, color: '#666', padding: '6px 8px', borderBottom: `2px solid ${ACCENT}20`, textAlign: 'right', whiteSpace: 'nowrap' };
  const td = { fontSize: 13, padding: '6px 8px', borderBottom: '1px solid #eee', textAlign: 'right' };
  const inputS = { width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };
  const labelS = { fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 2, display: 'block' };

  /* ──────────── Render ──────────── */
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ color: ACCENT, margin: 0, fontSize: 20 }}>診所雜費管理</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={btn()} onClick={openAdd}>新增帳單</button>
          <button style={btn('#555')} onClick={printYearly}>列印年度總結</button>
        </div>
      </div>

      {/* Payment reminders */}
      {reminders.length > 0 && (
        <div style={{ ...card, background: '#fef3c7', border: '1px solid #f59e0b' }}>
          <div style={{ fontWeight: 700, color: '#b45309', fontSize: 13, marginBottom: 4 }}>繳費提醒</div>
          {reminders.map(b => {
            const d = daysUntil(b.dueDate);
            return (
              <div key={b.id} style={{ fontSize: 12, color: d < 0 ? '#dc2626' : '#92400e', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span>{b.type}（{b.month}）— {d < 0 ? `已逾期 ${Math.abs(d)} 天` : d === 0 ? '今天到期' : `${d} 天後到期`}　到期日：{b.dueDate}　{fmtM(b.amount)}</span>
                <button style={{ ...btn('#16a34a'), padding: '3px 10px', fontSize: 11 }} onClick={() => markPaid(b.id)}>標記已付</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Budget alerts */}
      {budgetAlerts.length > 0 && (
        <div style={{ ...card, background: '#fef2f2', border: '1px solid #ef4444' }}>
          <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 13, marginBottom: 4 }}>費用警告</div>
          {budgetAlerts.map(a => (
            <div key={a.type} style={{ fontSize: 12, color: '#991b1b' }}>
              {a.type}：本月 {fmtM(a.cur)}，超出月均 {fmtM(a.avg)} 達 {a.pct}%
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 0 }}>
        {[['list', '帳單列表'], ['chart', '月度比較'], ['yearly', '年度總結']].map(([k, l]) => (
          <button key={k} style={tabStyle(tab === k)} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* ── TAB: Bill list ── */}
      {tab === 'list' && (
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #ccc', fontSize: 12 }}>
              <option value="">全部類型</option>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #ccc', fontSize: 12 }}>
              <option value="">全部狀態</option>
              <option value="unpaid">未付</option>
              <option value="paid">已付</option>
            </select>
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>暫無帳單記錄</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['類型', '月份', '金額', '到期日', '繳費日', '狀態', '帳號', '備註', '操作'].map(h => <th key={h} style={{ ...th, textAlign: h === '類型' || h === '備註' || h === '操作' ? 'left' : 'right' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filtered.map(b => (
                    <tr key={b.id}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{b.type}</td>
                      <td style={td}>{b.month}</td>
                      <td style={td}>{fmtM(b.amount)}</td>
                      <td style={{ ...td, color: b.status === 'unpaid' && b.dueDate && daysUntil(b.dueDate) <= 3 ? '#dc2626' : '#333' }}>{b.dueDate || '-'}</td>
                      <td style={td}>{b.paidDate || '-'}</td>
                      <td style={td}><span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: STATUS_COLOR[b.status] + '18', color: STATUS_COLOR[b.status] }}>{STATUS_MAP[b.status]}</span></td>
                      <td style={{ ...td, fontSize: 11 }}>{b.accountNumber || '-'}</td>
                      <td style={{ ...td, textAlign: 'left', fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.notes || '-'}</td>
                      <td style={{ ...td, textAlign: 'left', whiteSpace: 'nowrap' }}>
                        {b.status === 'unpaid' && <button style={{ ...btn('#16a34a'), padding: '2px 8px', fontSize: 11, marginRight: 4 }} onClick={() => markPaid(b.id)}>已付</button>}
                        <button style={{ ...btn('#666'), padding: '2px 8px', fontSize: 11, marginRight: 4 }} onClick={() => openEdit(b)}>編輯</button>
                        <button style={{ ...btn('#dc2626'), padding: '2px 8px', fontSize: 11 }} onClick={() => deleteBill(b.id)}>刪除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Monthly comparison chart ── */}
      {tab === 'chart' && (
        <div style={card}>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, background: ACCENT, borderRadius: 2, marginRight: 4, verticalAlign: -1 }} /> 本月（{curYM}）
            <span style={{ display: 'inline-block', width: 12, height: 12, background: '#64748b', borderRadius: 2, marginLeft: 14, marginRight: 4, verticalAlign: -1 }} /> 上月
            <span style={{ display: 'inline-block', width: 12, height: 12, background: '#cbd5e1', borderRadius: 2, marginLeft: 14, marginRight: 4, verticalAlign: -1 }} /> 去年同月
          </div>
          {chartData.map(d => (
            <div key={d.type} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{d.type}</div>
              {[{ label: '本月', val: d.cur, color: ACCENT }, { label: '上月', val: d.prev, color: '#64748b' }, { label: '去年', val: d.lastY, color: '#cbd5e1' }].map(bar => (
                <div key={bar.label} style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ width: 36, fontSize: 11, color: '#888', flexShrink: 0 }}>{bar.label}</span>
                  <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 18, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ width: `${chartMax > 0 ? (bar.val / chartMax) * 100 : 0}%`, height: '100%', background: bar.color, borderRadius: 4, transition: 'width 0.4s', minWidth: bar.val > 0 ? 2 : 0 }} />
                  </div>
                  <span style={{ width: 70, fontSize: 11, textAlign: 'right', color: '#555', flexShrink: 0 }}>{bar.val > 0 ? fmtM(bar.val) : '-'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: Yearly summary ── */}
      {tab === 'yearly' && (
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <select value={selYear} onChange={e => setSelYear(Number(e.target.value))} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }}>
              {years.map(y => <option key={y} value={y}>{y} 年</option>)}
            </select>
            <span style={{ fontSize: 13, color: '#555' }}>年度合計：<strong style={{ color: ACCENT }}>{fmtM(grandTotal)}</strong>　月均：<strong>{fmtM(grandTotal / 12)}</strong></span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>費用類型</th>
                  {MONTHS.map(m => <th key={m} style={th}>{m}</th>)}
                  <th style={th}>年度合計</th>
                  <th style={th}>月均</th>
                  <th style={th}>按年變動</th>
                </tr>
              </thead>
              <tbody>
                {TYPES.map(t => {
                  const total = yearlyTotals[t];
                  const yoy = yoyChange[t];
                  return (
                    <tr key={t}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{t}</td>
                      {yearlySummary[t].map((v, i) => <td key={i} style={{ ...td, fontSize: 11 }}>{v > 0 ? fmtM(v) : '-'}</td>)}
                      <td style={{ ...td, fontWeight: 700, color: ACCENT }}>{fmtM(total)}</td>
                      <td style={td}>{fmtM(total / 12)}</td>
                      <td style={{ ...td, color: yoy.diff > 0 ? '#dc2626' : yoy.diff < 0 ? '#16a34a' : '#333', fontSize: 11 }}>
                        {yoy.prev > 0 ? `${yoy.diff > 0 ? '+' : ''}${yoy.pct.toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight: 700, background: '#f0fdfa' }}>
                  <td style={{ ...td, textAlign: 'left' }}>合計</td>
                  {Array.from({ length: 12 }, (_, i) => TYPES.reduce((s, t) => s + yearlySummary[t][i], 0)).map((v, i) => <td key={i} style={td}>{v > 0 ? fmtM(v) : '-'}</td>)}
                  <td style={{ ...td, color: ACCENT }}>{fmtM(grandTotal)}</td>
                  <td style={td}>{fmtM(grandTotal / 12)}</td>
                  <td style={td}>-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '95%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ color: ACCENT, marginTop: 0 }}>{editId ? '編輯帳單' : '新增帳單'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelS}>費用類型</label>
                <select value={form.type} onChange={e => setF('type', e.target.value)} style={inputS}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelS}>月份</label>
                <input type="month" value={form.month} onChange={e => setF('month', e.target.value)} style={inputS} />
              </div>
              <div>
                <label style={labelS}>金額 ($)</label>
                <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setF('amount', e.target.value)} style={inputS} placeholder="0.00" />
              </div>
              <div>
                <label style={labelS}>狀態</label>
                <select value={form.status} onChange={e => setF('status', e.target.value)} style={inputS}>
                  <option value="unpaid">未付</option>
                  <option value="paid">已付</option>
                </select>
              </div>
              <div>
                <label style={labelS}>到期日</label>
                <input type="date" value={form.dueDate} onChange={e => setF('dueDate', e.target.value)} style={inputS} />
              </div>
              <div>
                <label style={labelS}>繳費日</label>
                <input type="date" value={form.paidDate} onChange={e => setF('paidDate', e.target.value)} style={inputS} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelS}>帳號</label>
                <input type="text" value={form.accountNumber} onChange={e => setF('accountNumber', e.target.value)} style={inputS} placeholder="選填" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelS}>備註</label>
                <input type="text" value={form.notes} onChange={e => setF('notes', e.target.value)} style={inputS} placeholder="選填" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btn('#aaa')} onClick={closeForm}>取消</button>
              <button style={btn()} onClick={saveForm}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
