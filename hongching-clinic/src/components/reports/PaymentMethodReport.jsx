import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtM } from '../../data';

const COLORS = ['#0e7490', '#16a34a', '#DAA520', '#dc2626', '#7C3AED', '#0284c7', '#f97316'];

export default function PaymentMethodReport({ data }) {
  const revenue = data.revenue || [];

  const stats = useMemo(() => {
    const byMethod = {};
    revenue.forEach(r => {
      const m = r.payment || '未知';
      if (!byMethod[m]) byMethod[m] = { count: 0, amount: 0 };
      byMethod[m].count++;
      byMethod[m].amount += Number(r.amount || 0);
    });
    const total = Object.values(byMethod).reduce((s, v) => s + v.amount, 0);
    return Object.entries(byMethod).sort((a, b) => b[1].amount - a[1].amount).map(([method, d]) => ({
      method, count: d.count, amount: d.amount, pct: total > 0 ? (d.amount / total * 100).toFixed(1) : '0',
    }));
  }, [revenue]);

  const chartData = stats.map(s => ({ name: s.method, value: s.amount }));

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>💳 付款方式統計報表</h3>
      {stats.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無收入記錄</div>
      ) : (
        <>
          <div style={{ width: '100%', height: 300, marginBottom: 24 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmtM(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>付款方式</th><th style={{textAlign:'right'}}>筆數</th><th style={{textAlign:'right'}}>金額</th><th style={{textAlign:'right'}}>佔比</th></tr></thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.method}><td style={{fontWeight:600}}>{s.method}</td><td className="money">{s.count}</td><td className="money" style={{color:'var(--gold-700)'}}>{fmtM(s.amount)}</td><td className="money">{s.pct}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
