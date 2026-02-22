import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { fmtM, fmt, getMonth, monthLabel } from '../data';

const COLORS = ['#0e7490','#8B6914','#C0392B','#1A7A42','#7C3AED','#EA580C','#0284C7','#BE185D'];

export default function Dashboard({ data }) {
  const [store, setStore] = useState('all');

  const filtered = useMemo(() => {
    const rev = store === 'all' ? data.revenue : data.revenue.filter(r => r.store === store);
    const exp = store === 'all' ? data.expenses : data.expenses.filter(r => r.store === store || r.store === '兩店共用');
    return { rev, exp };
  }, [data, store]);

  const months = useMemo(() => {
    const m = new Set();
    data.revenue.forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    data.expenses.forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    return [...m].sort();
  }, [data]);

  const thisMonth = new Date().toISOString().substring(0, 7);
  const lastMonth = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().substring(0, 7);
  })();

  const totalRev = filtered.rev.reduce((s, r) => s + Number(r.amount), 0);
  const totalExp = filtered.exp.reduce((s, r) => s + Number(r.amount), 0);
  const net = totalRev - totalExp;
  const thisRev = filtered.rev.filter(r => getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount), 0);
  const thisExp = filtered.exp.filter(r => getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount), 0);
  const lastRev = filtered.rev.filter(r => getMonth(r.date) === lastMonth).reduce((s, r) => s + Number(r.amount), 0);
  const revGrowth = lastRev ? ((thisRev - lastRev) / lastRev * 100).toFixed(1) : 0;
  const patientCount = filtered.rev.filter(r => getMonth(r.date) === thisMonth && !r.name.includes('匯總')).length;
  const margin = totalRev ? ((net / totalRev) * 100).toFixed(1) : 0;

  // Chart data
  const barData = months.map(m => ({
    month: monthLabel(m).split(' ')[0],
    營業額: filtered.rev.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0),
    開支: filtered.exp.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0),
  }));

  const pieData = (() => {
    const cats = {};
    filtered.exp.forEach(r => { cats[r.category] = (cats[r.category] || 0) + Number(r.amount); });
    return Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  })();

  // P&L by month
  const revByMonth = {}, expByMonth = {}, catByMonth = {};
  months.forEach(m => {
    revByMonth[m] = filtered.rev.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0);
    expByMonth[m] = filtered.exp.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0);
  });
  const allCats = {};
  filtered.exp.forEach(r => { allCats[r.category] = (allCats[r.category] || 0) + Number(r.amount); });
  Object.keys(allCats).sort((a, b) => allCats[b] - allCats[a]).forEach(cat => {
    catByMonth[cat] = {};
    months.forEach(m => {
      catByMonth[cat][m] = filtered.exp.filter(r => getMonth(r.date) === m && r.category === cat).reduce((s, r) => s + Number(r.amount), 0);
    });
  });

  return (
    <>
      {/* Store Tabs */}
      <div className="tab-bar">
        {['all', '宋皇臺', '太子'].map(s => (
          <button key={s} className={`tab-btn ${store === s ? 'active' : ''}`} onClick={() => setStore(s)}>
            {s === 'all' ? '🏢 兩店合計' : s === '宋皇臺' ? '📍 宋皇臺' : '📍 太子'}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="stats-grid">
        <div className="stat-card gold">
          <div className="stat-label">總營業額</div>
          <div className="stat-value gold">{fmtM(totalRev)}</div>
          <div className="stat-sub">{months.length} 個月累計</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">總開支</div>
          <div className="stat-value red">{fmtM(totalExp)}</div>
          <div className="stat-sub">佔營業額 {totalRev ? (totalExp/totalRev*100).toFixed(0) : 0}%</div>
        </div>
        <div className="stat-card" style={{ '--c': net >= 0 ? 'var(--green-600)' : 'var(--red-500)' }}>
          <div className="stat-label">累計損益</div>
          <div className="stat-value" style={{ color: net >= 0 ? 'var(--green-700)' : 'var(--red-600)' }}>{fmtM(net)}</div>
          <div className="stat-sub">利潤率 {margin}%</div>
        </div>
        <div className="stat-card teal">
          <div className="stat-label">本月營業額</div>
          <div className="stat-value teal">{fmtM(thisRev)}</div>
          <div className="stat-sub" style={{ color: revGrowth >= 0 ? 'var(--green-600)' : 'var(--red-500)' }}>
            {revGrowth > 0 ? '↑' : '↓'} {Math.abs(revGrowth)}% vs 上月
          </div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">本月開支</div>
          <div className="stat-value red">{fmtM(thisExp)}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">本月損益</div>
          <div className="stat-value" style={{ color: thisRev - thisExp >= 0 ? 'var(--green-700)' : 'var(--red-600)' }}>
            {fmtM(thisRev - thisExp)}
          </div>
        </div>
      </div>

      {/* P&L Table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>📊 損益表 P&L Statement</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="pl-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>項目</th>
                {months.map(m => <th key={m}>{monthLabel(m)}</th>)}
                <th>合計</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ fontWeight: 700 }}>
                <td>營業額</td>
                {months.map(m => <td key={m} style={{ color: 'var(--gold-700)' }}>{fmtM(revByMonth[m])}</td>)}
                <td style={{ color: 'var(--gold-700)', fontWeight: 800 }}>{fmtM(totalRev)}</td>
              </tr>
              {Object.keys(catByMonth).map(cat => (
                <tr key={cat}>
                  <td className="row-header">{cat}</td>
                  {months.map(m => <td key={m}>{catByMonth[cat][m] ? fmtM(catByMonth[cat][m]) : '-'}</td>)}
                  <td>{fmtM(allCats[cat])}</td>
                </tr>
              ))}
              <tr className="subtotal-row">
                <td>總開支</td>
                {months.map(m => <td key={m} style={{ color: 'var(--red-600)' }}>{fmtM(expByMonth[m])}</td>)}
                <td style={{ color: 'var(--red-600)' }}>{fmtM(totalExp)}</td>
              </tr>
              <tr className="total-row">
                <td>淨利潤</td>
                {months.map(m => {
                  const n = revByMonth[m] - expByMonth[m];
                  return <td key={m} style={{ color: n >= 0 ? 'var(--green-700)' : 'var(--red-600)' }}>{fmtM(n)}</td>;
                })}
                <td style={{ color: net >= 0 ? 'var(--green-700)' : 'var(--red-600)' }}>{fmtM(net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header"><h3>📈 營業額 vs 開支趨勢</h3></div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData}>
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip formatter={v => fmtM(v)} />
              <Bar dataKey="營業額" fill="#8B6914" radius={[4,4,0,0]} />
              <Bar dataKey="開支" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-header"><h3>🍩 開支分類佔比</h3></div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => fmtM(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Line Chart */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>📉 營業額趨勢折線圖</h3></div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
            <Tooltip formatter={v => fmtM(v)} />
            <Legend />
            <Line type="monotone" dataKey="營業額" stroke="#8B6914" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="開支" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
