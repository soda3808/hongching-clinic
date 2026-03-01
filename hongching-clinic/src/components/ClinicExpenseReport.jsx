import { useState, useMemo } from 'react';
import { fmtM, getMonth, monthLabel, EXPENSE_CATEGORIES, getStoreNames } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const BUDGET_KEY = 'hcmc_expense_budgets';
const CAT_COLORS = ['#0e7490','#dc2626','#f59e0b','#16a34a','#8b5cf6','#ec4899','#f97316','#64748b'];

function loadBudgets() {
  try { return JSON.parse(localStorage.getItem(BUDGET_KEY) || '{}'); } catch { return {}; }
}
function saveBudgets(b) { localStorage.setItem(BUDGET_KEY, JSON.stringify(b)); }

export default function ClinicExpenseReport({ data, showToast, user }) {
  const STORES = getStoreNames();
  const today = new Date().toISOString().substring(0, 10);
  const thisMonth = today.substring(0, 7);

  const [mode, setMode] = useState('month');          // month | quarter | year | custom
  const [selMonth, setSelMonth] = useState(thisMonth);
  const [selYear, setSelYear] = useState(today.substring(0, 4));
  const [selQ, setSelQ] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const [customFrom, setCustomFrom] = useState(thisMonth + '-01');
  const [customTo, setCustomTo] = useState(today);
  const [budgets, setBudgets] = useState(loadBudgets);
  const [editBudget, setEditBudget] = useState(false);
  const [tab, setTab] = useState('category');          // category | top | trend | budget | store

  // ── Derive date range from mode ──
  const dateRange = useMemo(() => {
    if (mode === 'month') return { from: selMonth + '-01', to: selMonth + '-31' };
    if (mode === 'year') return { from: selYear + '-01-01', to: selYear + '-12-31' };
    if (mode === 'quarter') {
      const sm = (selQ - 1) * 3 + 1;
      const em = sm + 2;
      return { from: `${selYear}-${String(sm).padStart(2, '0')}-01`, to: `${selYear}-${String(em).padStart(2, '0')}-31` };
    }
    return { from: customFrom, to: customTo };
  }, [mode, selMonth, selYear, selQ, customFrom, customTo]);

  const periodLabel = useMemo(() => {
    if (mode === 'month') return monthLabel(selMonth);
    if (mode === 'year') return `${selYear} 年`;
    if (mode === 'quarter') return `${selYear} Q${selQ}`;
    return `${customFrom} 至 ${customTo}`;
  }, [mode, selMonth, selYear, selQ, customFrom, customTo]);

  // ── Filter expenses ──
  const filtered = useMemo(() =>
    (data.expenses || []).filter(e => e.date >= dateRange.from && e.date <= dateRange.to),
    [data.expenses, dateRange]);

  const totalExpense = filtered.reduce((s, e) => s + Number(e.amount), 0);

  // ── By category (grouped) ──
  const byCatGroup = useMemo(() => {
    const groups = Object.keys(EXPENSE_CATEGORIES);
    const result = groups.map(g => {
      const cats = EXPENSE_CATEGORIES[g];
      const items = filtered.filter(e => cats.includes(e.category));
      const total = items.reduce((s, e) => s + Number(e.amount), 0);
      return { group: g, total, items };
    }).filter(g => g.total > 0);
    return result.sort((a, b) => b.total - a.total);
  }, [filtered]);

  // ── By individual category ──
  const byCat = useMemo(() => {
    const map = {};
    filtered.forEach(e => { const c = e.category || '其他'; map[c] = (map[c] || 0) + Number(e.amount); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  // ── Top 20 expenses ──
  const top20 = useMemo(() =>
    [...filtered].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 20),
    [filtered]);

  // ── Monthly trend (last 12 months) ──
  const trend = useMemo(() => {
    const map = {};
    (data.expenses || []).forEach(e => {
      const m = getMonth(e.date);
      if (!m) return;
      map[m] = (map[m] || 0) + Number(e.amount);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
      .map(([m, v]) => ({ month: m, label: monthLabel(m), amount: v }));
  }, [data.expenses]);

  const maxTrend = Math.max(...trend.map(t => t.amount), 1);

  // ── Budget vs Actual ──
  const budgetRows = useMemo(() =>
    byCat.map(([cat, actual]) => {
      const budget = Number(budgets[cat] || 0);
      const variance = budget > 0 ? actual - budget : 0;
      const pct = budget > 0 ? (actual / budget * 100).toFixed(1) : '-';
      return { cat, actual, budget, variance, pct };
    }),
    [byCat, budgets]);

  // ── Per-store breakdown ──
  const byStore = useMemo(() => {
    const map = {};
    filtered.forEach(e => {
      const s = e.store || '未指定';
      if (!map[s]) map[s] = { total: 0, cats: {} };
      map[s].total += Number(e.amount);
      const c = e.category || '其他';
      map[s].cats[c] = (map[s].cats[c] || 0) + Number(e.amount);
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [filtered]);

  // ── CSV export ──
  const handleExport = () => {
    const header = '日期,商戶/項目,類別,金額,分店,付款方式,備註\n';
    const rows = filtered.map(e =>
      `${e.date},"${e.merchant || ''}","${e.category || ''}",${e.amount},"${e.store || ''}","${e.payment || ''}","${(e.desc || '').replace(/"/g, '""')}"`
    ).join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `開支報告_${periodLabel.replace(/\s/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast && showToast('CSV 已匯出');
  };

  // ── Print ──
  const handlePrint = () => {
    const clinic = getClinicName();
    const catRows = byCat.map(([c, a]) =>
      `<tr><td>${escapeHtml(c)}</td><td class="r">${fmtM(a)}</td><td class="r">${totalExpense > 0 ? (a / totalExpense * 100).toFixed(1) : 0}%</td></tr>`
    ).join('');
    const topRows = top20.map((e, i) =>
      `<tr><td>${i + 1}</td><td>${e.date}</td><td>${escapeHtml(e.merchant || '-')}</td><td>${escapeHtml(e.category || '-')}</td><td class="r">${fmtM(Number(e.amount))}</td></tr>`
    ).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>開支分析報告</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:30px 50px;max-width:800px;margin:0 auto;color:#333;font-size:13px}
      .hd{text-align:center;border-bottom:3px double ${ACCENT};padding-bottom:10px;margin-bottom:18px}
      .hd h1{font-size:18px;color:${ACCENT};margin:0}.hd p{font-size:11px;color:#888;margin:2px 0}
      h2{font-size:15px;color:${ACCENT};margin:20px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      th{background:#f3f4f6;padding:6px 10px;text-align:left;font-weight:700;font-size:12px}
      td{padding:5px 10px;border-bottom:1px solid #eee}
      .r{text-align:right;font-family:monospace}
      .total{font-weight:800;border-top:2px solid #333}
      .ft{text-align:center;font-size:10px;color:#aaa;margin-top:30px;border-top:1px solid #eee;padding-top:8px}
    </style></head><body>
      <div class="hd"><h1>${escapeHtml(clinic)}</h1><p>開支分析報告 Expense Analysis Report</p></div>
      <div style="text-align:center;margin-bottom:18px;color:#555">報告期間：${escapeHtml(periodLabel)} ｜ 總開支：${fmtM(totalExpense)} ｜ 共 ${filtered.length} 筆</div>
      <h2>按類別分析</h2>
      <table><thead><tr><th>類別</th><th class="r">金額</th><th class="r">佔比</th></tr></thead><tbody>
        ${catRows}
        <tr class="total"><td>合計</td><td class="r">${fmtM(totalExpense)}</td><td class="r">100%</td></tr>
      </tbody></table>
      <h2>最大開支 Top 20</h2>
      <table><thead><tr><th>#</th><th>日期</th><th>商戶</th><th>類別</th><th class="r">金額</th></tr></thead><tbody>${topRows}</tbody></table>
      <div class="ft">此報表由系統自動生成 | ${escapeHtml(clinic)} | ${new Date().toLocaleString('zh-HK')}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // ── Save budget ──
  const handleBudgetSave = () => {
    saveBudgets(budgets);
    setEditBudget(false);
    showToast && showToast('預算已儲存');
  };

  // ── Styles ──
  const pill = (active) => ({
    padding: '4px 12px', borderRadius: 14, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', border: 'none',
    background: active ? ACCENT : '#f1f5f9', color: active ? '#fff' : '#475569',
  });
  const card = { padding: 12, background: '#f8fafc', borderRadius: 8, textAlign: 'center' };
  const sectionTitle = { fontWeight: 700, fontSize: 14, color: ACCENT, marginBottom: 8, marginTop: 16 };

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: ACCENT, margin: 0 }}>開支分析報告</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" style={{ background: '#f1f5f9', color: '#334155' }} onClick={handleExport}>匯出 CSV</button>
          <button className="btn btn-sm" style={{ background: ACCENT, color: '#fff' }} onClick={handlePrint}>列印報告</button>
        </div>
      </div>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {[['month','月份'],['quarter','季度'],['year','年度'],['custom','自訂']].map(([k, l]) =>
          <button key={k} style={pill(mode === k)} onClick={() => setMode(k)}>{l}</button>
        )}
        {mode === 'month' && <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd' }} />}
        {(mode === 'quarter' || mode === 'year') && (
          <select value={selYear} onChange={e => setSelYear(e.target.value)} style={{ fontSize: 12 }}>
            {Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i)).map(y => <option key={y}>{y}</option>)}
          </select>
        )}
        {mode === 'quarter' && (
          <select value={selQ} onChange={e => setSelQ(Number(e.target.value))} style={{ fontSize: 12 }}>
            {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
          </select>
        )}
        {mode === 'custom' && <>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #ddd' }} />
          <span style={{ fontSize: 12, color: '#888' }}>至</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid #ddd' }} />
        </>}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
        <div style={card}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>總開支</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{fmtM(totalExpense)}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>交易筆數</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: ACCENT }}>{filtered.length}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>平均每筆</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{filtered.length > 0 ? fmtM(totalExpense / filtered.length) : '-'}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>類別數</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#8b5cf6' }}>{byCat.length}</div>
        </div>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '2px solid #e2e8f0', paddingBottom: 6, flexWrap: 'wrap' }}>
        {[['category','按類別'],['top','最大開支'],['trend','趨勢分析'],['budget','預算對比'],['store','分店對比']].map(([k, l]) =>
          <button key={k} style={{ ...pill(tab === k), borderRadius: 6 }} onClick={() => setTab(k)}>{l}</button>
        )}
      </div>

      {/* ── Tab: Category breakdown ── */}
      {tab === 'category' && <>
        <div style={sectionTitle}>開支類別分佈</div>
        {/* Visual bars */}
        {byCatGroup.map((g, i) => (
          <div key={g.group} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
              <span>{g.group}</span>
              <span>{fmtM(g.total)} ({totalExpense > 0 ? (g.total / totalExpense * 100).toFixed(1) : 0}%)</span>
            </div>
            <div style={{ height: 14, background: '#f1f5f9', borderRadius: 7, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${totalExpense > 0 ? (g.total / totalExpense * 100) : 0}%`, background: CAT_COLORS[i % CAT_COLORS.length], borderRadius: 7, transition: 'width 0.3s' }} />
            </div>
          </div>
        ))}
        {/* Detail table */}
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>類別</th><th style={{ textAlign: 'right' }}>金額</th><th style={{ textAlign: 'right' }}>佔比</th></tr></thead>
            <tbody>
              {byCat.map(([c, a]) => (
                <tr key={c}>
                  <td style={{ fontWeight: 600 }}>{c}</td>
                  <td className="money">{fmtM(a)}</td>
                  <td className="money" style={{ color: '#94a3b8' }}>{totalExpense > 0 ? (a / totalExpense * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                <td>合計</td><td className="money">{fmtM(totalExpense)}</td><td className="money">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>}

      {/* ── Tab: Top expenses ── */}
      {tab === 'top' && <>
        <div style={sectionTitle}>最大開支 Top 20</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>日期</th><th>商戶/項目</th><th>類別</th><th>分店</th><th style={{ textAlign: 'right' }}>金額</th></tr></thead>
            <tbody>
              {top20.map((e, i) => (
                <tr key={e.id || i}>
                  <td style={{ fontWeight: 700, color: i < 3 ? '#dc2626' : '#64748b' }}>{i + 1}</td>
                  <td>{e.date}</td>
                  <td style={{ fontWeight: 600 }}>{e.merchant || '-'}</td>
                  <td>{e.category || '-'}</td>
                  <td>{e.store || '-'}</td>
                  <td className="money" style={{ fontWeight: 700 }}>{fmtM(Number(e.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {top20.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>此期間暫無開支紀錄</div>}
      </>}

      {/* ── Tab: Trend ── */}
      {tab === 'trend' && <>
        <div style={sectionTitle}>月度開支趨勢（近 12 個月）</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 180, padding: '0 4px', marginBottom: 8 }}>
          {trend.map(t => (
            <div key={t.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ fontSize: 9, color: '#64748b', whiteSpace: 'nowrap' }}>{fmtM(t.amount)}</div>
              <div style={{
                width: '100%', maxWidth: 36, minHeight: 4,
                height: `${(t.amount / maxTrend) * 140}px`,
                background: ACCENT, borderRadius: '4px 4px 0 0', transition: 'height 0.3s',
              }} />
              <div style={{ fontSize: 9, color: '#64748b', whiteSpace: 'nowrap' }}>{t.label}</div>
            </div>
          ))}
        </div>
        {trend.length >= 2 && (() => {
          const last = trend[trend.length - 1]?.amount || 0;
          const prev = trend[trend.length - 2]?.amount || 0;
          const chg = prev > 0 ? ((last - prev) / prev * 100).toFixed(1) : '-';
          return (
            <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', marginTop: 4 }}>
              最新月份 vs 上月：<span style={{ fontWeight: 700, color: chg > 0 ? '#dc2626' : '#16a34a' }}>{chg > 0 ? '+' : ''}{chg}%</span>
            </div>
          );
        })()}
        {trend.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>暫無趨勢數據</div>}
      </>}

      {/* ── Tab: Budget vs Actual ── */}
      {tab === 'budget' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={sectionTitle}>預算 vs 實際開支</div>
          <button className="btn btn-sm" style={{ background: editBudget ? '#16a34a' : '#f1f5f9', color: editBudget ? '#fff' : '#334155', fontSize: 12 }}
            onClick={editBudget ? handleBudgetSave : () => setEditBudget(true)}>
            {editBudget ? '儲存預算' : '設定預算'}
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>類別</th><th style={{ textAlign: 'right' }}>預算</th><th style={{ textAlign: 'right' }}>實際</th><th style={{ textAlign: 'right' }}>差異</th><th>達成率</th></tr></thead>
            <tbody>
              {budgetRows.map(r => (
                <tr key={r.cat}>
                  <td style={{ fontWeight: 600 }}>{r.cat}</td>
                  <td className="money">
                    {editBudget ? (
                      <input type="number" value={budgets[r.cat] || ''} onChange={e => setBudgets(b => ({ ...b, [r.cat]: e.target.value }))}
                        style={{ width: 90, fontSize: 12, textAlign: 'right', padding: '2px 6px', borderRadius: 4, border: '1px solid #ddd' }} placeholder="0" />
                    ) : fmtM(r.budget)}
                  </td>
                  <td className="money">{fmtM(r.actual)}</td>
                  <td className="money" style={{ color: r.variance > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                    {r.budget > 0 ? (r.variance > 0 ? '+' : '') + fmtM(r.variance) : '-'}
                  </td>
                  <td>
                    {r.budget > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 80, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(Number(r.pct), 100)}%`, background: Number(r.pct) > 100 ? '#dc2626' : '#16a34a', borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 11, color: Number(r.pct) > 100 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{r.pct}%</span>
                      </div>
                    ) : <span style={{ fontSize: 11, color: '#94a3b8' }}>未設定</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {budgetRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>此期間暫無開支紀錄</div>}
      </>}

      {/* ── Tab: Store comparison ── */}
      {tab === 'store' && <>
        <div style={sectionTitle}>分店開支對比</div>
        {byStore.length > 0 ? byStore.map(([store, info]) => (
          <div key={store} style={{ marginBottom: 14, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 6 }}>
              <span style={{ color: ACCENT }}>{store}</span>
              <span>{fmtM(info.total)} ({totalExpense > 0 ? (info.total / totalExpense * 100).toFixed(1) : 0}%)</span>
            </div>
            <div style={{ height: 10, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${totalExpense > 0 ? (info.total / totalExpense * 100) : 0}%`, background: ACCENT, borderRadius: 5 }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(info.cats).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, a]) => (
                <span key={c} style={{ fontSize: 11, background: '#e2e8f0', borderRadius: 10, padding: '2px 8px' }}>{c}: {fmtM(a)}</span>
              ))}
            </div>
          </div>
        )) : <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>此期間暫無分店開支數據</div>}
      </>}

      {/* Footer info */}
      <div style={{ marginTop: 16, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
        報告期間：{periodLabel} ｜ 產生時間：{new Date().toLocaleString('zh-HK')} ｜ {getClinicName()}
      </div>
    </div>
  );
}
