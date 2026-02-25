import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { fmtM, fmt, getMonth, monthLabel, linearRegression } from '../data';

const COLORS = ['#0e7490','#8B6914','#C0392B','#1A7A42','#7C3AED','#EA580C','#0284C7','#BE185D'];

export default function Dashboard({ data, onNavigate }) {
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

  // Recent activity
  const recentActivity = useMemo(() => {
    const items = [];
    (data.revenue || []).forEach(r => items.push({ type: '💰', label: `營業 ${r.name} ${fmtM(r.amount)}`, date: r.date }));
    (data.expenses || []).forEach(r => items.push({ type: '🧾', label: `開支 ${r.merchant} ${fmtM(r.amount)}`, date: r.date }));
    (data.bookings || []).forEach(r => items.push({ type: '📅', label: `預約 ${r.patientName} (${r.doctor})`, date: r.createdAt || r.date }));
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }, [data]);

  return (
    <>
      {/* Quick Actions */}
      {onNavigate && (
        <div className="quick-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { icon: '➕', label: '新增營業', page: 'rev' },
            { icon: '🧾', label: '新增開支', page: 'exp' },
            { icon: '📅', label: '新增預約', page: 'booking' },
            { icon: '📋', label: '生成糧單', page: 'pay' },
          ].map(a => (
            <button key={a.page} className="btn btn-outline" style={{ padding: '14px 12px', fontSize: 13, justifyContent: 'center' }} onClick={() => onNavigate(a.page)}>
              <span style={{ fontSize: 18 }}>{a.icon}</span> {a.label}
            </button>
          ))}
        </div>
      )}

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

      {/* Financial Forecast */}
      {months.length >= 2 && (() => {
        const points = months.map((m, i) => [i, filtered.rev.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0)]);
        const { slope, intercept } = linearRegression(points);
        const forecastData = months.slice(-4).map((m, i) => ({
          month: monthLabel(m).split(' ')[0],
          實際: filtered.rev.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0),
        }));
        // Add 2 forecast months
        for (let f = 1; f <= 2; f++) {
          const idx = months.length - 1 + f;
          const val = Math.max(0, Math.round(slope * idx + intercept));
          const d = new Date(); d.setMonth(d.getMonth() + f);
          forecastData.push({ month: monthLabel(d.toISOString().substring(0, 7)).split(' ')[0] + '(預)', 預測: val });
        }
        const nextMonthForecast = Math.max(0, Math.round(slope * months.length + intercept));
        const trend = slope > 0 ? '上升' : slope < 0 ? '下降' : '持平';

        return (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>🔮 營業額預測</h3></div>
            <div style={{ padding: '12px 16px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
              <div><strong>下月預測：</strong><span style={{ color: 'var(--teal-700)', fontWeight: 700 }}>{fmtM(nextMonthForecast)}</span></div>
              <div><strong>趨勢：</strong><span style={{ color: slope > 0 ? 'var(--green-600)' : 'var(--red-500)', fontWeight: 600 }}>{trend} ({slope > 0 ? '+' : ''}{fmtM(slope)}/月)</span></div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={v => fmtM(v)} />
                <Legend />
                <Bar dataKey="實際" fill="#8B6914" radius={[4,4,0,0]} />
                <Bar dataKey="預測" fill="#0e7490" radius={[4,4,0,0]} opacity={0.6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* Store Comparison Mini */}
      {(() => {
        const tkwRev = filtered.rev.filter(r => r.store === '宋皇臺' && getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount), 0);
        const peRev = filtered.rev.filter(r => r.store === '太子' && getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount), 0);
        const total = tkwRev + peRev || 1;
        return (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>🏢 分店本月對比</h3></div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#0e7490', fontWeight: 600 }}>宋皇臺</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#0e7490' }}>{fmtM(tkwRev)}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{(tkwRev/total*100).toFixed(0)}%</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#8B6914', fontWeight: 600 }}>太子</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#8B6914' }}>{fmtM(peRev)}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{(peRev/total*100).toFixed(0)}%</div>
                </div>
              </div>
              <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', display: 'flex', background: 'var(--gray-100)' }}>
                <div style={{ width: `${tkwRev/total*100}%`, background: '#0e7490', transition: 'width 0.5s' }} />
                <div style={{ width: `${peRev/total*100}%`, background: '#8B6914', transition: 'width 0.5s' }} />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Recent Activity */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>🕐 近期活動</h3></div>
        <div style={{ fontSize: 13 }}>
          {recentActivity.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < recentActivity.length - 1 ? '1px solid var(--gray-100)' : 'none', alignItems: 'center' }}>
              <span style={{ fontSize: 16 }}>{a.type}</span>
              <span style={{ flex: 1 }}>{a.label}</span>
              <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>{a.date}</span>
            </div>
          ))}
          {recentActivity.length === 0 && <div style={{ color: 'var(--gray-400)', textAlign: 'center', padding: 16 }}>暫無活動紀錄</div>}
        </div>
      </div>
    </>
  );
}
