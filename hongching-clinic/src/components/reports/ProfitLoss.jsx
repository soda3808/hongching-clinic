import { useMemo, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fmtM, getMonth, monthLabel, EXPENSE_CATEGORIES } from '../../data';
import { getClinicName, getClinicNameEn } from '../../tenant';

export default function ProfitLoss({ data }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [compareMode, setCompareMode] = useState(false);

  const months = useMemo(() => {
    const m = new Set();
    (data.revenue || []).forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    (data.expenses || []).forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    return [...m].sort();
  }, [data]);

  const prevMonth = useMemo(() => {
    const d = new Date(selectedMonth + '-01');
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().substring(0, 7);
  }, [selectedMonth]);

  // ── Revenue breakdown ──
  const revenueData = useMemo(() => {
    const rev = (data.revenue || []).filter(r => getMonth(r.date) === selectedMonth);
    const byService = {};
    const byDoctor = {};
    const byPayment = {};
    const byStore = {};
    rev.forEach(r => {
      const item = r.item || r.service || '其他';
      byService[item] = (byService[item] || 0) + Number(r.amount);
      if (r.doctor) byDoctor[r.doctor] = (byDoctor[r.doctor] || 0) + Number(r.amount);
      byPayment[r.payment || '未知'] = (byPayment[r.payment || '未知'] || 0) + Number(r.amount);
      if (r.store) byStore[r.store] = (byStore[r.store] || 0) + Number(r.amount);
    });
    const total = rev.reduce((s, r) => s + Number(r.amount), 0);
    return { total, count: rev.length, byService, byDoctor, byPayment, byStore };
  }, [data.revenue, selectedMonth]);

  // ── Expense breakdown ──
  const expenseData = useMemo(() => {
    const exp = (data.expenses || []).filter(r => getMonth(r.date) === selectedMonth);
    const byCategory = {};
    const byCategoryGroup = {};
    exp.forEach(r => {
      byCategory[r.category || '其他'] = (byCategory[r.category || '其他'] || 0) + Number(r.amount);
    });
    // Group into major categories
    Object.entries(EXPENSE_CATEGORIES).forEach(([group, cats]) => {
      const total = exp.filter(r => cats.includes(r.category)).reduce((s, r) => s + Number(r.amount), 0);
      if (total > 0) byCategoryGroup[group] = total;
    });
    const total = exp.reduce((s, r) => s + Number(r.amount), 0);
    return { total, count: exp.length, byCategory, byCategoryGroup };
  }, [data.expenses, selectedMonth]);

  // ── Previous month for comparison ──
  const prevData = useMemo(() => {
    const prevRev = (data.revenue || []).filter(r => getMonth(r.date) === prevMonth);
    const prevExp = (data.expenses || []).filter(r => getMonth(r.date) === prevMonth);
    return {
      revenue: prevRev.reduce((s, r) => s + Number(r.amount), 0),
      expenses: prevExp.reduce((s, r) => s + Number(r.amount), 0),
    };
  }, [data, prevMonth]);

  // ── 12-month trend ──
  const trend = useMemo(() => {
    const byMonth = {};
    (data.revenue || []).forEach(r => {
      const m = getMonth(r.date);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { month: m, revenue: 0, expenses: 0 };
      byMonth[m].revenue += Number(r.amount);
    });
    (data.expenses || []).forEach(r => {
      const m = getMonth(r.date);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { month: m, revenue: 0, expenses: 0 };
      byMonth[m].expenses += Number(r.amount);
    });
    return Object.values(byMonth)
      .map(m => ({ ...m, profit: m.revenue - m.expenses, label: monthLabel(m.month), margin: m.revenue > 0 ? ((m.revenue - m.expenses) / m.revenue * 100).toFixed(1) : 0 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [data]);

  const netProfit = revenueData.total - expenseData.total;
  const profitMargin = revenueData.total > 0 ? (netProfit / revenueData.total * 100).toFixed(1) : 0;
  const revChange = prevData.revenue > 0 ? ((revenueData.total - prevData.revenue) / prevData.revenue * 100).toFixed(1) : 0;
  const expChange = prevData.expenses > 0 ? ((expenseData.total - prevData.expenses) / prevData.expenses * 100).toFixed(1) : 0;

  // ── Print P&L ──
  const handlePrint = () => {
    const clinicName = getClinicName();
    const clinicNameEn = getClinicNameEn();
    const revRows = Object.entries(revenueData.byService).sort((a, b) => b[1] - a[1])
      .map(([item, amount]) => `<tr><td style="padding-left:24px">${item}</td><td class="money">${fmtM(amount)}</td></tr>`).join('');
    const expRows = Object.entries(expenseData.byCategory).sort((a, b) => b[1] - a[1])
      .map(([cat, amount]) => `<tr><td style="padding-left:24px">${cat}</td><td class="money">${fmtM(amount)}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>損益表 ${monthLabel(selectedMonth)}</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:30px 50px;max-width:700px;margin:0 auto;color:#333}
      .header{text-align:center;border-bottom:3px double #0e7490;padding-bottom:12px;margin-bottom:20px}
      .header h1{font-size:18px;color:#0e7490;margin:0}.header p{font-size:11px;color:#888;margin:3px 0}
      .title{text-align:center;font-size:18px;font-weight:800;color:#0e7490;margin:16px 0}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#f3f4f6;padding:8px 12px;text-align:left;font-weight:700}
      td{padding:6px 12px;border-bottom:1px solid #eee}
      .money{text-align:right;font-family:monospace}
      .total{font-weight:800;border-top:2px solid #333;font-size:14px}
      .profit{color:${netProfit >= 0 ? '#16a34a' : '#dc2626'}}
      .footer{text-align:center;font-size:10px;color:#aaa;margin-top:30px;border-top:1px solid #eee;padding-top:8px}
    </style></head><body>
      <div class="header"><h1>${clinicName}</h1><p>${clinicNameEn}</p></div>
      <div class="title">損益表 Profit & Loss Statement</div>
      <div style="text-align:center;font-size:13px;margin-bottom:20px;color:#555">報告期間：${monthLabel(selectedMonth)}</div>
      <table>
        <tr style="background:#e0f2fe"><th colspan="2" style="font-size:14px;color:#0e7490">營業收入 Revenue</th></tr>
        ${revRows}
        <tr class="total"><td>營業收入合計</td><td class="money">${fmtM(revenueData.total)}</td></tr>
        <tr><td colspan="2" style="height:12px;border:none"></td></tr>
        <tr style="background:#fef2f2"><th colspan="2" style="font-size:14px;color:#dc2626">營業開支 Expenses</th></tr>
        ${expRows}
        <tr class="total"><td>營業開支合計</td><td class="money">${fmtM(expenseData.total)}</td></tr>
        <tr><td colspan="2" style="height:12px;border:none"></td></tr>
        <tr class="total profit"><td style="font-size:16px">淨利潤 Net Profit</td><td class="money" style="font-size:16px">${fmtM(netProfit)}</td></tr>
        <tr><td>利潤率</td><td class="money">${profitMargin}%</td></tr>
      </table>
      <div class="footer">此報表由系統自動生成 | ${clinicName} | ${new Date().toLocaleString('zh-HK')}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', margin: 0 }}>📊 損益表 (P&L)</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button className="btn btn-teal btn-sm" onClick={handlePrint}>列印損益表</button>
        </div>
      </div>

      {/* P&L Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'var(--teal-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>營業收入</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{fmtM(revenueData.total)}</div>
          {prevData.revenue > 0 && <div style={{ fontSize: 10, color: revChange >= 0 ? '#16a34a' : '#dc2626' }}>{revChange >= 0 ? '+' : ''}{revChange}% vs 上月</div>}
        </div>
        <div style={{ padding: 12, background: 'var(--red-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>營業開支</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red-600)' }}>{fmtM(expenseData.total)}</div>
          {prevData.expenses > 0 && <div style={{ fontSize: 10, color: expChange <= 0 ? '#16a34a' : '#dc2626' }}>{expChange >= 0 ? '+' : ''}{expChange}% vs 上月</div>}
        </div>
        <div style={{ padding: 12, background: netProfit >= 0 ? 'var(--green-50)' : 'var(--red-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: netProfit >= 0 ? 'var(--green-600)' : 'var(--red-600)', fontWeight: 600 }}>淨利潤</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: netProfit >= 0 ? 'var(--green-700)' : 'var(--red-600)' }}>{fmtM(netProfit)}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--gold-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>利潤率</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-700)' }}>{profitMargin}%</div>
        </div>
      </div>

      {/* 12-Month Trend Chart */}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>12 個月損益趨勢</div>
      <div style={{ width: '100%', height: 280, marginBottom: 16 }}>
        <ResponsiveContainer>
          <BarChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" fontSize={10} />
            <YAxis fontSize={11} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={v => fmtM(v)} />
            <Legend />
            <Bar dataKey="revenue" name="收入" fill="#0e7490" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" name="開支" fill="#dc2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Profit Trend Line */}
      <div style={{ width: '100%', height: 200, marginBottom: 16 }}>
        <ResponsiveContainer>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" fontSize={10} />
            <YAxis fontSize={11} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={v => fmtM(v)} />
            <Line type="monotone" dataKey="profit" name="淨利潤" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#0e7490' }}>收入明細</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>項目</th><th style={{ textAlign: 'right' }}>金額</th><th style={{ textAlign: 'right' }}>佔比</th></tr></thead>
              <tbody>
                {Object.entries(revenueData.byService).sort((a, b) => b[1] - a[1]).map(([item, amount]) => (
                  <tr key={item}>
                    <td style={{ fontWeight: 600 }}>{item}</td>
                    <td className="money">{fmtM(amount)}</td>
                    <td className="money" style={{ color: 'var(--gray-400)' }}>{revenueData.total > 0 ? (amount / revenueData.total * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 800, borderTop: '2px solid var(--gray-300)' }}>
                  <td>合計</td>
                  <td className="money">{fmtM(revenueData.total)}</td>
                  <td className="money">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#dc2626' }}>開支明細</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>類別</th><th style={{ textAlign: 'right' }}>金額</th><th style={{ textAlign: 'right' }}>佔比</th></tr></thead>
              <tbody>
                {Object.entries(expenseData.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => (
                  <tr key={cat}>
                    <td style={{ fontWeight: 600 }}>{cat}</td>
                    <td className="money">{fmtM(amount)}</td>
                    <td className="money" style={{ color: 'var(--gray-400)' }}>{expenseData.total > 0 ? (amount / expenseData.total * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 800, borderTop: '2px solid var(--gray-300)' }}>
                  <td>合計</td>
                  <td className="money">{fmtM(expenseData.total)}</td>
                  <td className="money">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Revenue by Doctor */}
      {Object.keys(revenueData.byDoctor).length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>醫師貢獻</div>
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>醫師</th><th style={{ textAlign: 'right' }}>營業額</th><th style={{ textAlign: 'right' }}>佔比</th><th>佔比</th></tr></thead>
              <tbody>
                {Object.entries(revenueData.byDoctor).sort((a, b) => b[1] - a[1]).map(([doc, amount]) => {
                  const pct = revenueData.total > 0 ? (amount / revenueData.total * 100) : 0;
                  return (
                    <tr key={doc}>
                      <td style={{ fontWeight: 600 }}>{doc}</td>
                      <td className="money">{fmtM(amount)}</td>
                      <td className="money">{pct.toFixed(1)}%</td>
                      <td><div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 4, width: 120 }}><div style={{ height: '100%', width: `${pct}%`, background: '#0e7490', borderRadius: 4 }} /></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {revenueData.total === 0 && expenseData.total === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>此月份暫無財務數據</div>
      )}
    </div>
  );
}
