import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { fmtM, getMonth, monthLabel, uid } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';
import { dailyClosingsOps, recurringExpensesOps, monthCloseOps, saveExpense } from '../api';

const ACCENT = '#0e7490';

// Revenue classification (mirrored from IncomeStatement)
const REV_MAP = {
  '診金': '診金收入', '覆診': '診金收入', '初診': '診金收入', '診症': '診金收入',
  '中藥': '藥費收入', '藥費': '藥費收入', '內服中藥': '藥費收入', '藥材': '藥費收入',
  '針灸': '治療收入', '拔罐': '治療收入', '推拿': '治療收入', '刮痧': '治療收入',
  '艾灸': '治療收入', '天灸': '治療收入', '針灸+推拿': '治療收入',
  '商品': '商品銷售', '產品': '商品銷售', '保健品': '商品銷售',
  '長者醫療券': '長者醫療券', '醫療券': '長者醫療券',
};
const REV_ORDER = ['診金收入', '藥費收入', '治療收入', '商品銷售', '長者醫療券', '其他收入'];

const EXP_MAP = {
  '藥材/耗材': '藥材成本', '藥材': '藥材成本',
  '租金': '租金', '管理費': '租金',
  '人工': '薪酬', 'MPF': '薪酬', '勞保': '薪酬',
  '電費': '水電費', '水費': '水電費', '電話/網絡': '水電費',
  '日常雜費': '行政費用', '文具/印刷': '行政費用', '保險': '行政費用', '牌照/註冊': '行政費用', '培訓': '行政費用',
  '廣告/宣傳': '市場推廣', '推廣活動': '市場推廣',
};
const EXP_ORDER = ['藥材成本', '租金', '薪酬', '水電費', '行政費用', '市場推廣', '其他開支'];

function classifyRev(item) { return REV_MAP[item] || '其他收入'; }
function classifyExp(cat) { return EXP_MAP[cat] || '其他開支'; }

function getBusinessDays(year, month) {
  // Returns count of weekdays (Mon-Sat, excluding Sun) in a given month
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0) count++; // Exclude Sunday only
  }
  return count;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getPrevMonth(monthKey) {
  const d = new Date(monthKey + '-01');
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().substring(0, 7);
}

export default function MonthEndClosing({ data, setData, showToast, user, onNavigate }) {
  // Default to previous month
  const now = new Date();
  const prevDefault = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultMonth = prevDefault.toISOString().substring(0, 7);

  const [selMonth, setSelMonth] = useState(defaultMonth);
  const [closings, setClosings] = useState([]);
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [lockedMonths, setLockedMonths] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_month_locks') || '{}'); } catch { return {}; }
  });
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    dailyClosingsOps.load().then(d => { if (d) setClosings(d); });
    recurringExpensesOps.load().then(d => { if (d) setRecurringTemplates(d); });
    monthCloseOps.load().then(d => { if (d) setLockedMonths(prev => ({ ...prev, ...d })); });
  }, []);

  // Also load from localStorage as fallback
  useEffect(() => {
    try {
      const local = JSON.parse(localStorage.getItem('hcmc_daily_closings') || '[]');
      if (local.length && !closings.length) setClosings(local);
    } catch {}
    try {
      const local = JSON.parse(localStorage.getItem('hcmc_recurring_expenses') || '[]');
      if (local.length && !recurringTemplates.length) setRecurringTemplates(local);
    } catch {}
  }, []);

  const isLocked = !!lockedMonths[selMonth];

  // Parse selected month
  const [selYear, selMo] = selMonth.split('-').map(Number);
  const prevMonthKey = getPrevMonth(selMonth);

  // Available months for picker
  const availableMonths = useMemo(() => {
    const m = new Set();
    (data.revenue || []).forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    (data.expenses || []).forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    // Always include current month and previous month
    m.add(defaultMonth);
    m.add(now.toISOString().substring(0, 7));
    return [...m].sort().reverse();
  }, [data.revenue, data.expenses]);

  // ─── Step 1: Revenue Check ───
  const monthRevenue = useMemo(() => {
    return (data.revenue || []).filter(r => getMonth(r.date) === selMonth);
  }, [data.revenue, selMonth]);

  const revenueTotal = monthRevenue.reduce((s, r) => s + Number(r.amount || 0), 0);
  const revenueCount = monthRevenue.length;
  const step1Pass = revenueCount > 0;

  // ─── Step 2: Daily Closing Check ───
  const businessDays = getBusinessDays(selYear, selMo);
  const daysInMonth = getDaysInMonth(selYear, selMo);

  const closedDays = useMemo(() => {
    const closedDates = new Set();
    closings.forEach(c => {
      if (getMonth(c.date) === selMonth) closedDates.add(c.date);
    });
    return closedDates.size;
  }, [closings, selMonth]);

  const step2Pass = closedDays >= businessDays;

  // ─── Step 3: Recurring Expenses ───
  const monthExpenses = useMemo(() => {
    return (data.expenses || []).filter(r => getMonth(r.date) === selMonth);
  }, [data.expenses, selMonth]);

  const recurringInMonth = monthExpenses.filter(r => r.isRecurring);
  const hasTemplates = recurringTemplates.length > 0;
  const allRecurringGenerated = useMemo(() => {
    if (!hasTemplates) return true;
    const merchantsInMonth = new Set(recurringInMonth.map(r => r.merchant));
    return recurringTemplates.every(t => merchantsInMonth.has(t.merchant));
  }, [recurringTemplates, recurringInMonth, hasTemplates]);

  const step3Pass = !hasTemplates || allRecurringGenerated;

  const handleAutoGenerateRecurring = async () => {
    if (!recurringTemplates.length) return showToast('暫無常用開支模板');
    const existingMerchants = new Set(monthExpenses.filter(r => r.isRecurring).map(r => r.merchant));
    const toGenerate = recurringTemplates.filter(t => !existingMerchants.has(t.merchant));
    if (!toGenerate.length) return showToast('本月所有常用開支已生成');
    setGenerating(true);
    const dateStr = selMonth + '-01';
    let added = 0;
    const newExpenses = [];
    for (const tmpl of toGenerate) {
      const rec = { ...tmpl, id: uid(), date: dateStr, amount: parseFloat(tmpl.amount), receipt: '', isRecurring: true };
      await saveExpense(rec);
      newExpenses.push(rec);
      added++;
    }
    if (setData) {
      setData(prev => ({ ...prev, expenses: [...prev.expenses, ...newExpenses] }));
    }
    showToast(`已自動生成 ${added} 筆 ${monthLabel(selMonth)} 常用開支`);
    setGenerating(false);
  };

  // ─── Step 4: Expense Review ───
  const expenseTotal = monthExpenses.reduce((s, r) => s + Number(r.amount || 0), 0);
  const expenseCount = monthExpenses.length;

  const prevMonthExpenses = useMemo(() => {
    return (data.expenses || []).filter(r => getMonth(r.date) === prevMonthKey);
  }, [data.expenses, prevMonthKey]);
  const prevExpenseTotal = prevMonthExpenses.reduce((s, r) => s + Number(r.amount || 0), 0);

  const expenseTooLow = prevExpenseTotal > 0 && expenseTotal < prevExpenseTotal * 0.5;
  const step4Pass = expenseCount > 0 && !expenseTooLow;

  // ─── Step 5: P&L Summary ───
  const revBreakdown = useMemo(() => {
    const map = {};
    REV_ORDER.forEach(k => { map[k] = 0; });
    monthRevenue.forEach(r => {
      const cat = classifyRev(r.item || r.service || '');
      map[cat] = (map[cat] || 0) + Number(r.amount);
    });
    return map;
  }, [monthRevenue]);

  const expBreakdown = useMemo(() => {
    const map = {};
    EXP_ORDER.forEach(k => { map[k] = 0; });
    monthExpenses.forEach(r => {
      const cat = classifyExp(r.category || '');
      map[cat] = (map[cat] || 0) + Number(r.amount);
    });
    return map;
  }, [monthExpenses]);

  const grossProfit = revenueTotal - (expBreakdown['藥材成本'] || 0);
  const netProfit = revenueTotal - expenseTotal;
  const grossMargin = revenueTotal > 0 ? (grossProfit / revenueTotal * 100).toFixed(1) : '0.0';
  const netMargin = revenueTotal > 0 ? (netProfit / revenueTotal * 100).toFixed(1) : '0.0';

  // Previous month P&L for comparison
  const prevMonthRevenue = useMemo(() => {
    return (data.revenue || []).filter(r => getMonth(r.date) === prevMonthKey);
  }, [data.revenue, prevMonthKey]);
  const prevRevTotal = prevMonthRevenue.reduce((s, r) => s + Number(r.amount || 0), 0);
  const prevNetProfit = prevRevTotal - prevExpenseTotal;

  const step5Pass = revenueTotal > 0 || expenseTotal > 0;

  // ─── Step 6: Lock Period ───
  const step6Pass = isLocked;

  // ─── Overall Progress ───
  const steps = [step1Pass, step2Pass, step3Pass, step4Pass, step5Pass, step6Pass];
  const completedSteps = steps.filter(Boolean).length;
  const progressPct = Math.round((completedSteps / steps.length) * 100);

  // ─── Lock/Unlock ───
  const handleLockMonth = () => {
    const updated = { ...lockedMonths, [selMonth]: { lockedAt: new Date().toISOString(), lockedBy: user?.name || 'system' } };
    setLockedMonths(updated);
    localStorage.setItem('hcmc_month_locks', JSON.stringify(updated));
    monthCloseOps.persist(updated);
    showToast(`已鎖定 ${monthLabel(selMonth)} 月結`);
  };

  const handleUnlockMonth = () => {
    const updated = { ...lockedMonths };
    delete updated[selMonth];
    setLockedMonths(updated);
    localStorage.setItem('hcmc_month_locks', JSON.stringify(updated));
    monthCloseOps.persist(updated);
    showToast(`已解鎖 ${monthLabel(selMonth)} 月結`);
  };

  // ─── Percentage change helper ───
  const pctChange = (cur, prev) => {
    if (!prev) return null;
    return ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
  };

  // ─── Print Month-End Report ───
  const handlePrint = () => {
    const clinic = getClinicName();
    const period = monthLabel(selMonth);
    const revRows = REV_ORDER.map(k => {
      const v = revBreakdown[k] || 0;
      if (v === 0) return '';
      return `<tr><td style="padding-left:24px">${escapeHtml(k)}</td><td class="m">${fmtM(v)}</td></tr>`;
    }).filter(Boolean).join('');
    const expRows = EXP_ORDER.map(k => {
      const v = expBreakdown[k] || 0;
      if (v === 0) return '';
      return `<tr><td style="padding-left:24px">${escapeHtml(k)}</td><td class="m">${fmtM(v)}</td></tr>`;
    }).filter(Boolean).join('');

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>月結報表 ${escapeHtml(period)}</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:30px 50px;max-width:700px;margin:0 auto;color:#333}
      .hd{text-align:center;border-bottom:3px double ${ACCENT};padding-bottom:12px;margin-bottom:20px}
      .hd h1{font-size:18px;color:${ACCENT};margin:0}
      .hd p{font-size:11px;color:#888;margin:3px 0}
      .ti{text-align:center;font-size:18px;font-weight:800;color:${ACCENT};margin:16px 0}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#f3f4f6;padding:8px 12px;text-align:left;font-weight:700}
      td{padding:6px 12px;border-bottom:1px solid #eee}
      .m{text-align:right;font-family:monospace}
      .tot{font-weight:800;border-top:2px solid #333;font-size:14px}
      .pf{color:${netProfit >= 0 ? '#16a34a' : '#dc2626'}}
      .section{background:#f0f9ff;padding:10px 14px;font-weight:700;font-size:13px;color:${ACCENT};margin:16px 0 8px;border-left:4px solid ${ACCENT}}
      .summary-row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid #f0f0f0}
      .summary-row strong{font-weight:700}
      .ft{text-align:center;font-size:10px;color:#aaa;margin-top:30px;border-top:1px solid #eee;padding-top:8px}
    </style></head><body>
      <div class="hd"><h1>${escapeHtml(clinic)}</h1><p>月結報表 Month-End Closing Report</p></div>
      <div class="ti">月結報表 — ${escapeHtml(period)}</div>

      <div class="section">月結檢查清單</div>
      <table>
        <tr><td>營業紀錄</td><td class="m">${revenueCount} 筆 / ${fmtM(revenueTotal)}</td><td style="text-align:center">${step1Pass ? '✅' : '❌'}</td></tr>
        <tr><td>日結對賬</td><td class="m">${closedDays} / ${businessDays} 天</td><td style="text-align:center">${step2Pass ? '✅' : '⚠️'}</td></tr>
        <tr><td>常用開支</td><td class="m">${recurringInMonth.length} / ${recurringTemplates.length} 筆</td><td style="text-align:center">${step3Pass ? '✅' : '⚠️'}</td></tr>
        <tr><td>開支紀錄</td><td class="m">${expenseCount} 筆 / ${fmtM(expenseTotal)}</td><td style="text-align:center">${step4Pass ? '✅' : '⚠️'}</td></tr>
        <tr><td>損益確認</td><td class="m">${fmtM(netProfit)}</td><td style="text-align:center">${step5Pass ? '✅' : '❌'}</td></tr>
        <tr><td>期間鎖定</td><td class="m">${isLocked ? '已鎖定' : '未鎖定'}</td><td style="text-align:center">${step6Pass ? '🔒' : '🔓'}</td></tr>
      </table>

      <div class="section">損益表 Income Statement</div>
      <table>
        <tr style="background:#e0f2fe"><th colspan="2" style="font-size:14px;color:${ACCENT}">營業收入</th></tr>
        ${revRows}
        <tr class="tot"><td>營業收入合計</td><td class="m">${fmtM(revenueTotal)}</td></tr>
        <tr><td colspan="2" style="height:8px;border:none"></td></tr>
        <tr style="background:#fef2f2"><th colspan="2" style="font-size:14px;color:#dc2626">營業開支</th></tr>
        ${expRows}
        <tr class="tot"><td>營業開支合計</td><td class="m">${fmtM(expenseTotal)}</td></tr>
        <tr><td colspan="2" style="height:8px;border:none"></td></tr>
        <tr class="tot"><td>毛利 Gross Profit</td><td class="m">${fmtM(grossProfit)}</td></tr>
        <tr><td style="padding-left:24px">毛利率</td><td class="m">${grossMargin}%</td></tr>
        <tr class="tot pf"><td style="font-size:16px">淨利潤 Net Profit</td><td class="m" style="font-size:16px">${fmtM(netProfit)}</td></tr>
        <tr><td style="padding-left:24px">淨利率</td><td class="m">${netMargin}%</td></tr>
      </table>

      ${prevRevTotal > 0 ? `
      <div class="section">上月對比</div>
      <table>
        <tr><td>上月收入</td><td class="m">${fmtM(prevRevTotal)}</td></tr>
        <tr><td>上月開支</td><td class="m">${fmtM(prevExpenseTotal)}</td></tr>
        <tr><td>上月淨利</td><td class="m">${fmtM(prevNetProfit)}</td></tr>
        <tr class="tot"><td>收入變動</td><td class="m" style="color:${revenueTotal >= prevRevTotal ? '#16a34a' : '#dc2626'}">${pctChange(revenueTotal, prevRevTotal) || '-'}%</td></tr>
        <tr><td>淨利變動</td><td class="m" style="color:${netProfit >= prevNetProfit ? '#16a34a' : '#dc2626'}">${pctChange(netProfit, prevNetProfit) || '-'}%</td></tr>
      </table>` : ''}

      <div class="ft">此報表由系統自動生成 | ${escapeHtml(clinic)} | ${new Date().toLocaleString('zh-HK')}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // ─── Step component ───
  const StepCard = ({ number, title, pass, warning, children }) => (
    <div style={{
      background: '#fff',
      border: `1px solid ${pass ? '#bbf7d0' : warning ? '#fed7aa' : '#e5e7eb'}`,
      borderRadius: 10,
      padding: 16,
      marginBottom: 12,
      borderLeft: `4px solid ${pass ? '#16a34a' : warning ? '#f59e0b' : '#d1d5db'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: pass ? '#16a34a' : warning ? '#f59e0b' : '#e5e7eb',
          color: pass || warning ? '#fff' : '#9ca3af',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800,
        }}>
          {pass ? '\u2713' : number}
        </div>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#333' }}>{title}</div>
        <div style={{ marginLeft: 'auto' }}>
          {pass ? (
            <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>已完成</span>
          ) : warning ? (
            <span style={{ background: '#fffbeb', color: '#d97706', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>需注意</span>
          ) : (
            <span style={{ background: '#f9fafb', color: '#9ca3af', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>待處理</span>
          )}
        </div>
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: ACCENT, margin: 0 }}>
              月結作業
            </h3>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>一鍵完成月底結算流程</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selMonth}
              onChange={e => setSelMonth(e.target.value)}
              style={{ width: 'auto', fontSize: 13, fontWeight: 600, padding: '6px 12px' }}
            >
              {availableMonths.map(m => (
                <option key={m} value={m}>{monthLabel(m)}{lockedMonths[m] ? ' \uD83D\uDD12' : ''}</option>
              ))}
            </select>
            <button className="btn btn-teal btn-sm" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              列印月結報表
            </button>
          </div>
        </div>

        {/* Locked banner */}
        {isLocked && (
          <div style={{
            marginTop: 12, padding: 10, background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>&#128274;</span>
            <div>
              <strong style={{ color: '#dc2626' }}>{monthLabel(selMonth)} 月結已鎖定</strong>
              <span style={{ marginLeft: 8, color: '#888' }}>
                由 {lockedMonths[selMonth]?.lockedBy || '-'} 於 {lockedMonths[selMonth]?.lockedAt ? new Date(lockedMonths[selMonth].lockedAt).toLocaleString('zh-HK') : '-'} 鎖定
              </span>
            </div>
          </div>
        )}

        {/* Overall Progress Bar */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>完成進度</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: progressPct === 100 ? '#16a34a' : ACCENT }}>
              {completedSteps}/{steps.length} ({progressPct}%)
            </span>
          </div>
          <div style={{ width: '100%', height: 10, background: '#e5e7eb', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{
              width: `${progressPct}%`,
              height: '100%',
              background: progressPct === 100 ? '#16a34a' : progressPct >= 50 ? ACCENT : '#f59e0b',
              borderRadius: 5,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {onNavigate && (
          <>
            <button className="btn btn-outline btn-sm" onClick={() => onNavigate('rev')} style={{ fontSize: 12 }}>
              &#128176; 營業紀錄
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => onNavigate('exp')} style={{ fontSize: 12 }}>
              &#129534; 開支紀錄
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => onNavigate('closing')} style={{ fontSize: 12 }}>
              &#129518; 日結對賬
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => onNavigate('pnl')} style={{ fontSize: 12 }}>
              &#128202; 損益表
            </button>
          </>
        )}
      </div>

      {/* ═══ Step 1: Revenue Check ═══ */}
      <StepCard number={1} title="營業收入確認" pass={step1Pass} warning={false}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
          <div>
            <span style={{ color: '#888' }}>收入筆數：</span>
            <strong style={{ color: step1Pass ? '#16a34a' : '#dc2626' }}>{revenueCount} 筆</strong>
          </div>
          <div>
            <span style={{ color: '#888' }}>收入總額：</span>
            <strong style={{ color: ACCENT }}>{fmtM(revenueTotal)}</strong>
          </div>
          {prevRevTotal > 0 && (
            <div>
              <span style={{ color: '#888' }}>較上月：</span>
              <strong style={{ color: revenueTotal >= prevRevTotal ? '#16a34a' : '#dc2626' }}>
                {pctChange(revenueTotal, prevRevTotal)}%
                {revenueTotal >= prevRevTotal ? ' \u25B2' : ' \u25BC'}
              </strong>
            </div>
          )}
        </div>
        {!step1Pass && (
          <div style={{ marginTop: 8, padding: 8, background: '#fef2f2', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>
            &#9888; 本月尚無營業紀錄，請先錄入收入數據。
          </div>
        )}
      </StepCard>

      {/* ═══ Step 2: Daily Closing Check ═══ */}
      <StepCard number={2} title="日結對賬確認" pass={step2Pass} warning={closedDays > 0 && !step2Pass}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
          <div>
            <span style={{ color: '#888' }}>已日結天數：</span>
            <strong style={{ color: step2Pass ? '#16a34a' : '#f59e0b' }}>{closedDays} / {businessDays} 天</strong>
          </div>
          <div>
            <span style={{ color: '#888' }}>營業天數：</span>
            <strong>{businessDays} 天</strong>
            <span style={{ fontSize: 11, color: '#aaa', marginLeft: 4 }}>(排除周日)</span>
          </div>
        </div>
        {/* Progress mini bar */}
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${businessDays > 0 ? Math.min((closedDays / businessDays) * 100, 100) : 0}%`,
              height: '100%',
              background: step2Pass ? '#16a34a' : '#f59e0b',
              borderRadius: 3,
              transition: 'width 0.3s',
            }} />
          </div>
          <span style={{ fontSize: 11, color: '#888', minWidth: 36 }}>
            {businessDays > 0 ? Math.round((closedDays / businessDays) * 100) : 0}%
          </span>
        </div>
        {!step2Pass && closedDays < businessDays && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#d97706' }}>
            &#9888; 尚有 {businessDays - closedDays} 個營業日未完成日結。
            {onNavigate && (
              <span onClick={() => onNavigate('closing')} style={{ color: ACCENT, cursor: 'pointer', marginLeft: 6, textDecoration: 'underline' }}>
                前往日結
              </span>
            )}
          </div>
        )}
      </StepCard>

      {/* ═══ Step 3: Recurring Expenses ═══ */}
      <StepCard number={3} title="常用開支生成" pass={step3Pass} warning={hasTemplates && !allRecurringGenerated}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, alignItems: 'center' }}>
          <div>
            <span style={{ color: '#888' }}>常用模板：</span>
            <strong>{recurringTemplates.length} 個</strong>
          </div>
          <div>
            <span style={{ color: '#888' }}>已生成：</span>
            <strong style={{ color: allRecurringGenerated ? '#16a34a' : '#f59e0b' }}>{recurringInMonth.length} 筆</strong>
          </div>
          <div>
            <span style={{ color: '#888' }}>本月總開支：</span>
            <strong>{expenseCount} 筆</strong>
          </div>
        </div>
        {hasTemplates && !allRecurringGenerated && (
          <div style={{ marginTop: 10 }}>
            <button
              className="btn btn-teal btn-sm"
              onClick={handleAutoGenerateRecurring}
              disabled={generating || isLocked}
              style={{ fontSize: 12 }}
            >
              {generating ? '生成中...' : `一鍵生成 ${monthLabel(selMonth)} 常用開支`}
            </button>
            {isLocked && <span style={{ fontSize: 11, color: '#dc2626', marginLeft: 8 }}>月結已鎖定，無法生成</span>}
          </div>
        )}
        {!hasTemplates && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#888' }}>
            暫無常用開支模板。可在開支頁面建立常用開支。
          </div>
        )}
      </StepCard>

      {/* ═══ Step 4: Expense Review ═══ */}
      <StepCard number={4} title="開支審核" pass={step4Pass} warning={expenseTooLow}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
          <div>
            <span style={{ color: '#888' }}>開支筆數：</span>
            <strong>{expenseCount} 筆</strong>
          </div>
          <div>
            <span style={{ color: '#888' }}>開支總額：</span>
            <strong style={{ color: '#dc2626' }}>{fmtM(expenseTotal)}</strong>
          </div>
          {prevExpenseTotal > 0 && (
            <div>
              <span style={{ color: '#888' }}>較上月：</span>
              <strong style={{ color: expenseTotal >= prevExpenseTotal ? '#dc2626' : '#16a34a' }}>
                {pctChange(expenseTotal, prevExpenseTotal)}%
              </strong>
            </div>
          )}
        </div>
        {expenseTooLow && (
          <div style={{ marginTop: 8, padding: 8, background: '#fffbeb', borderRadius: 6, fontSize: 12, color: '#d97706' }}>
            &#9888; 本月開支 ({fmtM(expenseTotal)}) 明顯低於上月 ({fmtM(prevExpenseTotal)})，請確認是否有遺漏的開支未入帳。
          </div>
        )}
        {expenseCount === 0 && (
          <div style={{ marginTop: 8, padding: 8, background: '#fef2f2', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>
            &#9888; 本月尚無開支紀錄。
          </div>
        )}
      </StepCard>

      {/* ═══ Step 5: P&L Summary ═══ */}
      <StepCard number={5} title="損益確認" pass={step5Pass} warning={false}>
        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { label: '營業收入', value: revenueTotal, color: ACCENT, bg: '#ecfdf5' },
            { label: '營業開支', value: expenseTotal, color: '#dc2626', bg: '#fef2f2' },
            { label: '毛利', value: grossProfit, color: grossProfit >= 0 ? '#16a34a' : '#dc2626', bg: grossProfit >= 0 ? '#f0fdf4' : '#fef2f2' },
            { label: '淨利潤', value: netProfit, color: netProfit >= 0 ? '#16a34a' : '#dc2626', bg: netProfit >= 0 ? '#f0fdf4' : '#fef2f2' },
            { label: '淨利率', value: null, color: '#b45309', bg: '#fffbeb' },
          ].map(item => (
            <div key={item.label} style={{ padding: 10, background: item.bg, borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: item.color }}>{item.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: item.color, marginTop: 2 }}>
                {item.value !== null ? fmtM(item.value) : `${netMargin}%`}
              </div>
            </div>
          ))}
        </div>

        {/* Comparison with previous month */}
        {prevRevTotal > 0 && (
          <div style={{ padding: 10, background: '#f9fafb', borderRadius: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#555' }}>上月對比 ({monthLabel(prevMonthKey)})</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <span style={{ color: '#888' }}>收入變動：</span>
                <strong style={{ color: revenueTotal >= prevRevTotal ? '#16a34a' : '#dc2626' }}>
                  {pctChange(revenueTotal, prevRevTotal)}%
                </strong>
              </div>
              <div>
                <span style={{ color: '#888' }}>開支變動：</span>
                <strong style={{ color: expenseTotal <= prevExpenseTotal ? '#16a34a' : '#dc2626' }}>
                  {pctChange(expenseTotal, prevExpenseTotal)}%
                </strong>
              </div>
              <div>
                <span style={{ color: '#888' }}>淨利變動：</span>
                <strong style={{ color: netProfit >= prevNetProfit ? '#16a34a' : '#dc2626' }}>
                  {pctChange(netProfit, prevNetProfit) || '-'}%
                </strong>
              </div>
            </div>
          </div>
        )}

        {!step5Pass && (
          <div style={{ textAlign: 'center', padding: 20, color: '#999', fontSize: 13 }}>
            本月暫無財務數據
          </div>
        )}
      </StepCard>

      {/* ═══ Step 6: Lock Period ═══ */}
      <StepCard number={6} title="鎖定結算期間" pass={step6Pass} warning={false}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
          鎖定後，{monthLabel(selMonth)} 的營業紀錄及開支將無法修改。如需修改請先解鎖。
        </div>
        {isLocked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: '6px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#16a34a' }}>
              &#128274; 已鎖定 — {lockedMonths[selMonth]?.lockedBy || '-'} 於 {lockedMonths[selMonth]?.lockedAt ? new Date(lockedMonths[selMonth].lockedAt).toLocaleString('zh-HK') : '-'}
            </div>
            <button className="btn btn-outline btn-sm" onClick={handleUnlockMonth} style={{ color: '#dc2626', borderColor: '#dc2626', fontSize: 12 }}>
              解鎖
            </button>
          </div>
        ) : (
          <button
            className="btn btn-teal"
            onClick={handleLockMonth}
            style={{ fontSize: 13 }}
          >
            &#128274; 鎖定 {monthLabel(selMonth)} 月結
          </button>
        )}
      </StepCard>

      {/* Completion banner */}
      {progressPct === 100 && (
        <div style={{
          padding: 16, background: '#f0fdf4', border: '2px solid #16a34a',
          borderRadius: 10, textAlign: 'center', marginTop: 8,
        }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>&#9989;</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>
            {monthLabel(selMonth)} 月結已全部完成
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            淨利潤 {fmtM(netProfit)} | 淨利率 {netMargin}%
          </div>
        </div>
      )}
    </div>
  );
}
