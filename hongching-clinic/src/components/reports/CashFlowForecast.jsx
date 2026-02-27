import React, { useMemo, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ComposedChart } from 'recharts';
import { fmtM, fmt, getMonth, linearRegression } from '../../data';

export default function CashFlowForecast({ data }) {
  const [forecastMonths, setForecastMonths] = useState(3);

  const revenue = data.revenue || [];
  const expenses = data.expenses || [];
  const arap = data.arap || [];

  // Monthly aggregation
  const monthlyData = useMemo(() => {
    const months = {};
    revenue.forEach(r => {
      const m = getMonth(r.date);
      if (!m) return;
      if (!months[m]) months[m] = { rev: 0, exp: 0, transactions: 0 };
      months[m].rev += Number(r.amount || 0);
      months[m].transactions++;
    });
    expenses.forEach(r => {
      const m = getMonth(r.date);
      if (!m) return;
      if (!months[m]) months[m] = { rev: 0, exp: 0, transactions: 0 };
      months[m].exp += Number(r.amount || 0);
    });

    return Object.entries(months)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, d]) => ({
        month,
        label: month.substring(5),
        revenue: d.rev,
        expenses: d.exp,
        profit: d.rev - d.exp,
        margin: d.rev > 0 ? Math.round((d.rev - d.exp) / d.rev * 100) : 0,
        transactions: d.transactions,
      }));
  }, [revenue, expenses]);

  // Forecast using linear regression
  const forecastData = useMemo(() => {
    if (monthlyData.length < 3) return [];

    const last6 = monthlyData.slice(-6);
    const revPoints = last6.map((d, i) => ({ x: i, y: d.revenue }));
    const expPoints = last6.map((d, i) => ({ x: i, y: d.expenses }));
    const revReg = linearRegression(revPoints);
    const expReg = linearRegression(expPoints);

    const lastMonth = monthlyData[monthlyData.length - 1];
    const baseDate = new Date(lastMonth.month + '-01');

    return Array.from({ length: forecastMonths }, (_, i) => {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + i + 1);
      const m = d.toISOString().substring(0, 7);
      const idx = last6.length + i;
      const forecastRev = Math.max(0, revReg.slope * idx + revReg.intercept);
      const forecastExp = Math.max(0, expReg.slope * idx + expReg.intercept);
      return {
        month: m,
        label: m.substring(5) + '(預)',
        revenue: Math.round(forecastRev),
        expenses: Math.round(forecastExp),
        profit: Math.round(forecastRev - forecastExp),
        isForecast: true,
      };
    });
  }, [monthlyData, forecastMonths]);

  const chartData = useMemo(() => {
    const historical = monthlyData.slice(-9).map(d => ({ ...d, isForecast: false }));
    return [...historical, ...forecastData];
  }, [monthlyData, forecastData]);

  // Current month stats
  const thisMonth = new Date().toISOString().substring(0, 7);
  const lastMonth = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().substring(0, 7); })();
  const currentData = monthlyData.find(d => d.month === thisMonth) || { revenue: 0, expenses: 0, profit: 0, margin: 0 };
  const prevData = monthlyData.find(d => d.month === lastMonth) || { revenue: 0, expenses: 0, profit: 0 };
  const revGrowth = prevData.revenue > 0 ? Math.round((currentData.revenue - prevData.revenue) / prevData.revenue * 100) : 0;

  // Cash flow analysis
  const receivables = arap.filter(a => a.type === 'receivable' && a.status === 'pending').reduce((s, a) => s + Number(a.amount || 0), 0);
  const payables = arap.filter(a => a.type === 'payable' && a.status === 'pending').reduce((s, a) => s + Number(a.amount || 0), 0);

  // Monthly expense breakdown (fixed vs variable)
  const expenseBreakdown = useMemo(() => {
    const fixedCats = ['租金', '管理費', '保險', '牌照/註冊', '人工', 'MPF', '勞保'];
    const thisMonthExp = expenses.filter(e => getMonth(e.date) === thisMonth);
    const fixed = thisMonthExp.filter(e => fixedCats.some(c => (e.category || '').includes(c))).reduce((s, e) => s + Number(e.amount || 0), 0);
    const variable = thisMonthExp.reduce((s, e) => s + Number(e.amount || 0), 0) - fixed;
    return { fixed, variable, total: fixed + variable };
  }, [expenses, thisMonth]);

  // Average monthly metrics
  const avgRevenue = monthlyData.length > 0 ? Math.round(monthlyData.reduce((s, d) => s + d.revenue, 0) / monthlyData.length) : 0;
  const avgExpenses = monthlyData.length > 0 ? Math.round(monthlyData.reduce((s, d) => s + d.expenses, 0) / monthlyData.length) : 0;

  // Break-even point
  const breakEvenRevenue = expenseBreakdown.fixed > 0 && currentData.revenue > 0
    ? Math.round(expenseBreakdown.fixed / (1 - expenseBreakdown.variable / currentData.revenue))
    : 0;

  // Cumulative cash flow chart
  const cumData = useMemo(() => {
    let cumRev = 0, cumExp = 0;
    return monthlyData.slice(-6).map(d => {
      cumRev += d.revenue;
      cumExp += d.expenses;
      return { label: d.label, cumRevenue: cumRev, cumExpenses: cumExp, cumProfit: cumRev - cumExp };
    });
  }, [monthlyData]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>財務預測 & 現金流分析</h3>
        <div className="preset-bar" style={{ marginBottom: 0 }}>
          {[1, 3, 6].map(n => (
            <button key={n} className={`preset-chip ${forecastMonths === n ? 'active' : ''}`} onClick={() => setForecastMonths(n)}>預測{n}個月</button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="stat-card teal">
          <div className="stat-label">本月營業</div>
          <div className="stat-value teal">{fmtM(currentData.revenue)}</div>
          <div style={{ fontSize: 10, color: revGrowth >= 0 ? '#16a34a' : '#dc2626' }}>{revGrowth >= 0 ? '↑' : '↓'} {Math.abs(revGrowth)}% vs 上月</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <div className="stat-label">本月開支</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmtM(currentData.expenses)}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">純利</div>
          <div className="stat-value" style={{ color: currentData.profit >= 0 ? '#16a34a' : '#dc2626' }}>{fmtM(currentData.profit)}</div>
          <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>利潤率 {currentData.margin}%</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">應收帳款</div>
          <div className="stat-value gold">{fmtM(receivables)}</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #7C3AED' }}>
          <div className="stat-label">應付帳款</div>
          <div className="stat-value" style={{ color: '#7C3AED' }}>{fmtM(payables)}</div>
        </div>
      </div>

      {/* Revenue & Expense Forecast Chart */}
      <div className="card">
        <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>營業額 & 開支預測</h4>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 1000)}K`} />
            <Tooltip formatter={(v, n) => [fmtM(v), n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="revenue" fill="#0e7490" name="營業額" opacity={0.8} />
            <Bar dataKey="expenses" fill="#dc2626" name="開支" opacity={0.6} />
            <Line type="monotone" dataKey="profit" stroke="#16a34a" strokeWidth={2} name="純利" dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
        {forecastData.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 6, textAlign: 'center' }}>
            虛線部分為預測值（基於最近 6 個月趨勢）
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        {/* Expense Breakdown */}
        <div className="card">
          <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>開支結構（本月）</h4>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>固定成本</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{fmtM(expenseBreakdown.fixed)}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>變動成本</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#d97706' }}>{fmtM(expenseBreakdown.variable)}</div>
            </div>
          </div>
          <div style={{ height: 16, background: 'var(--gray-100)', borderRadius: 8, overflow: 'hidden', display: 'flex' }}>
            {expenseBreakdown.total > 0 && (
              <>
                <div style={{ height: '100%', width: `${expenseBreakdown.fixed / expenseBreakdown.total * 100}%`, background: '#dc2626' }} />
                <div style={{ height: '100%', width: `${expenseBreakdown.variable / expenseBreakdown.total * 100}%`, background: '#d97706' }} />
              </>
            )}
          </div>
          <div style={{ marginTop: 12, padding: 8, background: 'var(--gray-50)', borderRadius: 6, fontSize: 11 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>損益平衡點</div>
            <div>月營業額需達 <strong style={{ color: '#0e7490' }}>{fmtM(breakEvenRevenue)}</strong> 方可收支平衡</div>
            <div style={{ marginTop: 4 }}>月均營業: {fmtM(avgRevenue)} | 月均開支: {fmtM(avgExpenses)}</div>
          </div>
        </div>

        {/* Cumulative Cash Flow */}
        {cumData.length > 0 && (
          <div className="card">
            <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>累計現金流（近6月）</h4>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={cumData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 1000)}K`} />
                <Tooltip formatter={(v) => [fmtM(v)]} />
                <Area type="monotone" dataKey="cumProfit" stroke="#16a34a" fill="#16a34a" fillOpacity={0.2} name="累計純利" />
                <Area type="monotone" dataKey="cumRevenue" stroke="#0e7490" fill="#0e7490" fillOpacity={0.1} name="累計營業" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Forecast Summary Table */}
      {forecastData.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>預測明細</h4>
          <div className="table-wrap">
            <table>
              <thead><tr><th>月份</th><th style={{ textAlign: 'right' }}>預測營業</th><th style={{ textAlign: 'right' }}>預測開支</th><th style={{ textAlign: 'right' }}>預測純利</th><th>趨勢</th></tr></thead>
              <tbody>
                {forecastData.map(d => (
                  <tr key={d.month}>
                    <td style={{ fontWeight: 600 }}>{d.month}</td>
                    <td style={{ textAlign: 'right' }}>{fmtM(d.revenue)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtM(d.expenses)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: d.profit >= 0 ? '#16a34a' : '#dc2626' }}>{fmtM(d.profit)}</td>
                    <td>{d.profit >= 0 ? '📈' : '📉'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--gray-400)' }}>
            * 預測基於線性回歸，僅供參考。實際數據可能因季節性和市場變化而有差異。
          </div>
        </div>
      )}
    </div>
  );
}
