import { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { fmtM, fmt, getMonth, monthLabel, linearRegression } from '../data';

const COLORS = ['#0e7490','#8B6914','#C0392B','#1A7A42','#7C3AED','#EA580C','#0284C7','#BE185D'];

export default function Dashboard({ data, onNavigate }) {
  const [store, setStore] = useState('all');
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  // AI Daily Briefing - load once per day
  const todayKey = new Date().toISOString().substring(0, 10);
  useEffect(() => {
    const cached = localStorage.getItem('hcmc_briefing');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.date === todayKey) { setBriefing(parsed.text); return; }
      } catch {}
    }
  }, [todayKey]);

  const loadBriefing = async () => {
    setBriefingLoading(true);
    const today = new Date().toISOString().substring(0, 10);
    const thisMonth = today.substring(0, 7);
    const rev = data.revenue || [];
    const exp = data.expenses || [];
    const patients = data.patients || [];
    const bookings = data.bookings || [];
    const inventory = data.inventory || [];

    const monthRev = rev.filter(r => (r.date || '').substring(0, 7) === thisMonth).reduce((s, r) => s + Number(r.amount), 0);
    const monthExp = exp.filter(r => (r.date || '').substring(0, 7) === thisMonth).reduce((s, r) => s + Number(r.amount), 0);
    const todayBookings = bookings.filter(b => b.date === today && b.status !== 'cancelled').length;
    const lowStock = inventory.filter(i => i.stock <= (i.minStock || 10)).length;
    const newPatients = patients.filter(p => (p.createdAt || '').substring(0, 7) === thisMonth).length;

    const context = { period: thisMonth, today, revenue: { monthTotal: monthRev }, expenses: { monthTotal: monthExp }, patients: { total: patients.length, newThisMonth: newPatients }, bookings: { todayCount: todayBookings }, inventory: { lowStockCount: lowStock } };

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '請生成今日診所智能簡報，包括：1)今日重點數據 2)需要關注的事項 3)一句鼓勵或建議。簡短精煉，5-8行即可。',
          context,
          history: [],
        }),
      });
      const result = await res.json();
      if (result.success) {
        setBriefing(result.reply);
        localStorage.setItem('hcmc_briefing', JSON.stringify({ date: todayKey, text: result.reply }));
      }
    } catch {}
    setBriefingLoading(false);
  };

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
      {/* AI Daily Briefing */}
      <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)', border: '1px solid var(--teal-200)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: briefing ? 8 : 0 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--teal-700)' }}>🤖 今日智能簡報</h3>
          {!briefing && (
            <button className="btn btn-teal btn-sm" onClick={loadBriefing} disabled={briefingLoading} style={{ fontSize: 11 }}>
              {briefingLoading ? '生成中...' : '生成簡報'}
            </button>
          )}
          {briefing && (
            <button className="btn btn-outline btn-sm" onClick={() => { setBriefing(null); localStorage.removeItem('hcmc_briefing'); }} style={{ fontSize: 11 }}>
              刷新
            </button>
          )}
        </div>
        {briefing && (
          <div style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--gray-700)' }}>{briefing}</div>
        )}
        {!briefing && !briefingLoading && (
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>撳「生成簡報」獲取今日 AI 分析</div>
        )}
      </div>

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

      {/* Patient Funnel & Inventory Widget */}
      <div className="grid-2" style={{ marginTop: 16 }}>
        {/* Patient Funnel */}
        <div className="card">
          <div className="card-header"><h3>👥 病人漏斗</h3></div>
          {(() => {
            const pts = data.patients || [];
            const cons = data.consultations || [];
            const bks = data.bookings || [];
            const totalPatients = pts.length;
            const newThisMonth = pts.filter(p => (p.createdAt || '').substring(0, 7) === thisMonth).length;
            const activePatients = new Set(cons.filter(c => (c.date || '').substring(0, 7) === thisMonth).map(c => c.patientId || c.patientName)).size;
            const returning = cons.filter(c => {
              const prev = cons.filter(cc => cc.patientName === c.patientName && cc.date < c.date);
              return prev.length > 0 && (c.date || '').substring(0, 7) === thisMonth;
            });
            const returnRate = activePatients > 0 ? (returning.length / activePatients * 100).toFixed(0) : 0;
            const todayBk = bks.filter(b => b.date === new Date().toISOString().substring(0, 10) && b.status !== 'cancelled').length;
            const funnelData = [
              { label: '總病人數', value: totalPatients, color: 'var(--teal-600)', width: 100 },
              { label: '本月活躍', value: activePatients, color: 'var(--green-600)', width: activePatients / Math.max(totalPatients, 1) * 100 },
              { label: '本月新增', value: newThisMonth, color: 'var(--gold-600)', width: newThisMonth / Math.max(totalPatients, 1) * 100 },
              { label: '今日預約', value: todayBk, color: 'var(--red-500)', width: todayBk / Math.max(activePatients, 1) * 100 },
            ];
            return (
              <div style={{ padding: '8px 0' }}>
                {funnelData.map((f, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600 }}>{f.label}</span>
                      <span style={{ fontWeight: 800, color: f.color }}>{f.value}</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 4 }}>
                      <div style={{ width: `${Math.max(f.width, 3)}%`, height: '100%', background: f.color, borderRadius: 4, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--green-50)', borderRadius: 6, fontSize: 12 }}>
                  覆診率：<strong style={{ color: 'var(--green-700)' }}>{returnRate}%</strong>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Inventory Alert Widget */}
        <div className="card">
          <div className="card-header"><h3>💊 庫存警示</h3></div>
          {(() => {
            const inv = data.inventory || [];
            const lowStock = inv.filter(i => Number(i.stock) < Number(i.minStock));
            const today = new Date().toISOString().substring(0, 10);
            const in30 = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().substring(0, 10); })();
            const expired = inv.filter(i => i.expiryDate && i.expiryDate <= today);
            const expiring = inv.filter(i => i.expiryDate && i.expiryDate > today && i.expiryDate <= in30);
            const totalValue = inv.reduce((s, r) => s + Number(r.stock) * Number(r.costPerUnit), 0);
            return (
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div style={{ background: 'var(--gray-50)', padding: '10px 12px', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{inv.length}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>總品項</div>
                  </div>
                  <div style={{ background: 'var(--gray-50)', padding: '10px 12px', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-700)' }}>{fmtM(totalValue)}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>存貨總值</div>
                  </div>
                </div>
                {lowStock.length > 0 && (
                  <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-100)', padding: '8px 12px', borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
                    <strong style={{ color: 'var(--red-600)' }}>⚠️ {lowStock.length} 項低庫存</strong>
                    <div style={{ marginTop: 4, color: 'var(--gray-600)' }}>{lowStock.slice(0, 5).map(i => i.name).join('、')}{lowStock.length > 5 ? '...' : ''}</div>
                  </div>
                )}
                {expired.length > 0 && (
                  <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-100)', padding: '8px 12px', borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
                    <strong style={{ color: '#dc2626' }}>🚫 {expired.length} 項已過期</strong>
                    <div style={{ marginTop: 4, color: 'var(--gray-600)' }}>{expired.slice(0, 3).map(i => `${i.name}(${i.expiryDate})`).join('、')}</div>
                  </div>
                )}
                {expiring.length > 0 && (
                  <div style={{ background: 'var(--gold-50)', border: '1px solid var(--gold-100)', padding: '8px 12px', borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
                    <strong style={{ color: '#d97706' }}>⏰ {expiring.length} 項即將過期</strong>
                    <div style={{ marginTop: 4, color: 'var(--gray-600)' }}>{expiring.slice(0, 3).map(i => `${i.name}(${i.expiryDate})`).join('、')}</div>
                  </div>
                )}
                {lowStock.length === 0 && expired.length === 0 && expiring.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--green-600)', fontSize: 13 }}>✅ 庫存狀態良好</div>
                )}
                {onNavigate && <button className="btn btn-outline btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('inventory')}>查看庫存 →</button>}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Birthday Reminders */}
      {(() => {
        const pts = data.patients || [];
        const todayMD = new Date().toISOString().substring(5, 10);
        const next7 = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(); d.setDate(d.getDate() + i);
          return { date: d.toISOString().substring(0, 10), md: d.toISOString().substring(5, 10), dayLabel: i === 0 ? '今日' : i === 1 ? '明日' : `${i}日後` };
        });
        const birthdayList = next7.flatMap(day => pts.filter(p => p.dob && p.dob.substring(5) === day.md).map(p => ({ ...p, dayLabel: day.dayLabel, birthdayDate: day.date })));
        if (!birthdayList.length) return null;
        return (
          <div className="card" style={{ marginTop: 16, border: '1px solid var(--gold-200)', background: 'var(--gold-50)' }}>
            <div className="card-header"><h3>🎂 近期生日</h3></div>
            <div style={{ fontSize: 12 }}>
              {birthdayList.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: i < birthdayList.length - 1 ? '1px solid var(--gray-100)' : 'none', alignItems: 'center' }}>
                  <span className={`tag ${p.dayLabel === '今日' ? 'tag-overdue' : 'tag-pending-orange'}`} style={{ fontSize: 10 }}>{p.dayLabel}</span>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: 'var(--gray-400)' }}>{p.phone}</span>
                  <span style={{ color: 'var(--gray-400)', marginLeft: 'auto', fontSize: 11 }}>{p.dob}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Follow-up Reminders Widget */}
      {(() => {
        const cons = data.consultations || [];
        const todayStr = new Date().toISOString().substring(0, 10);
        const in7 = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().substring(0, 10); })();
        const overdueFollowUps = cons.filter(c => c.followUpDate && c.followUpDate < todayStr);
        const todayFollowUps = cons.filter(c => c.followUpDate === todayStr);
        const upcomingFollowUps = cons.filter(c => c.followUpDate > todayStr && c.followUpDate <= in7);
        const allFollowUps = [...todayFollowUps, ...overdueFollowUps, ...upcomingFollowUps.slice(0, 5)];
        if (!allFollowUps.length) return null;
        return (
          <div className="card" style={{ marginTop: 16, border: todayFollowUps.length + overdueFollowUps.length > 0 ? '2px solid var(--gold-200)' : undefined }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>📋 覆診提醒</h3>
              <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                {overdueFollowUps.length > 0 && <span className="tag tag-overdue">{overdueFollowUps.length} 逾期</span>}
                {todayFollowUps.length > 0 && <span className="tag tag-pending-orange">{todayFollowUps.length} 今日</span>}
                {upcomingFollowUps.length > 0 && <span className="tag tag-paid">{upcomingFollowUps.length} 本週</span>}
              </div>
            </div>
            <div style={{ fontSize: 12 }}>
              {overdueFollowUps.slice(0, 5).map((c, i) => (
                <div key={'o' + i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--gray-100)', alignItems: 'center' }}>
                  <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 10, minWidth: 36 }}>逾期</span>
                  <span style={{ fontWeight: 600, minWidth: 60 }}>{c.patientName}</span>
                  <span style={{ color: 'var(--gray-500)' }}>{c.followUpDate}</span>
                  <span style={{ color: 'var(--gray-400)', flex: 1 }}>{c.doctor}</span>
                  <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>{c.followUpNotes || c.tcmDiagnosis || ''}</span>
                </div>
              ))}
              {todayFollowUps.map((c, i) => (
                <div key={'t' + i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--gray-100)', alignItems: 'center', background: 'var(--gold-50)' }}>
                  <span style={{ color: '#d97706', fontWeight: 700, fontSize: 10, minWidth: 36 }}>今日</span>
                  <span style={{ fontWeight: 600, minWidth: 60 }}>{c.patientName}</span>
                  <span style={{ color: 'var(--gray-500)' }}>{c.followUpDate}</span>
                  <span style={{ color: 'var(--gray-400)', flex: 1 }}>{c.doctor}</span>
                  <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>{c.followUpNotes || c.tcmDiagnosis || ''}</span>
                </div>
              ))}
              {upcomingFollowUps.slice(0, 5).map((c, i) => (
                <div key={'u' + i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--gray-100)', alignItems: 'center' }}>
                  <span style={{ color: 'var(--teal-600)', fontWeight: 700, fontSize: 10, minWidth: 36 }}>即將</span>
                  <span style={{ fontWeight: 600, minWidth: 60 }}>{c.patientName}</span>
                  <span style={{ color: 'var(--gray-500)' }}>{c.followUpDate}</span>
                  <span style={{ color: 'var(--gray-400)', flex: 1 }}>{c.doctor}</span>
                  <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>{c.followUpNotes || c.tcmDiagnosis || ''}</span>
                </div>
              ))}
            </div>
            {onNavigate && <button className="btn btn-outline btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('emr')}>查看病歷 →</button>}
          </div>
        );
      })()}

      {/* ARAP & Queue Alerts */}
      <div className="grid-2" style={{ marginTop: 16 }}>
        {/* Today Queue Status */}
        <div className="card">
          <div className="card-header"><h3>🎫 今日排隊</h3></div>
          {(() => {
            const queue = data.queue || [];
            const todayStr = new Date().toISOString().substring(0, 10);
            const todayQ = queue.filter(q => q.date === todayStr);
            const waiting = todayQ.filter(q => q.status === 'waiting').length;
            const inConsult = todayQ.filter(q => q.status === 'in-consultation').length;
            const dispensing = todayQ.filter(q => q.status === 'dispensing').length;
            const completed = todayQ.filter(q => q.status === 'completed').length;
            return (
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                  <div style={{ textAlign: 'center', padding: 8, background: 'var(--gold-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold-700)' }}>{waiting}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>等候中</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 8, background: 'var(--teal-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal-700)' }}>{inConsult}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>診症中</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 8, background: 'var(--gray-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-600)' }}>{dispensing}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>配藥中</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 8, background: 'var(--green-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green-700)' }}>{completed}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>已完成</div>
                  </div>
                </div>
                {todayQ.filter(q => q.status === 'waiting').slice(0, 5).map(q => (
                  <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: 'var(--teal-700)' }}>{q.queueNo}</span>
                    <span>{q.patientName}</span>
                    <span style={{ color: 'var(--gray-400)' }}>{q.doctor}</span>
                    <span style={{ color: 'var(--gray-400)' }}>{q.registeredAt}</span>
                  </div>
                ))}
                {todayQ.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: 'var(--gray-400)', fontSize: 12 }}>暫無排隊</div>}
                {onNavigate && <button className="btn btn-outline btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('queue')}>管理排隊 →</button>}
              </div>
            );
          })()}
        </div>

        {/* ARAP Alerts */}
        <div className="card">
          <div className="card-header"><h3>📑 應收應付提醒</h3></div>
          {(() => {
            const arap = data.arap || [];
            const todayStr = new Date().toISOString().substring(0, 10);
            const pendingAR = arap.filter(r => r.type === 'receivable' && r.status !== '已收');
            const pendingAP = arap.filter(r => r.type === 'payable' && r.status !== '已付');
            const overdueAR = pendingAR.filter(r => r.dueDate && r.dueDate < todayStr);
            const overdueAP = pendingAP.filter(r => r.dueDate && r.dueDate < todayStr);
            const totalAR = pendingAR.reduce((s, r) => s + Number(r.amount), 0);
            const totalAP = pendingAP.reduce((s, r) => s + Number(r.amount), 0);
            return (
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div style={{ padding: 10, background: 'var(--teal-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>待收</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal-700)' }}>{fmtM(totalAR)}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>{pendingAR.length} 筆</div>
                  </div>
                  <div style={{ padding: 10, background: 'var(--red-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>待付</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--red-600)' }}>{fmtM(totalAP)}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>{pendingAP.length} 筆</div>
                  </div>
                </div>
                {(overdueAR.length > 0 || overdueAP.length > 0) && (
                  <div style={{ padding: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
                    <strong style={{ color: '#dc2626' }}>⚠️ 逾期</strong>
                    {overdueAR.length > 0 && <div style={{ color: '#991b1b' }}>應收 {overdueAR.length} 筆 ({fmtM(overdueAR.reduce((s, r) => s + Number(r.amount), 0))})</div>}
                    {overdueAP.length > 0 && <div style={{ color: '#991b1b' }}>應付 {overdueAP.length} 筆 ({fmtM(overdueAP.reduce((s, r) => s + Number(r.amount), 0))})</div>}
                  </div>
                )}
                {pendingAR.length === 0 && pendingAP.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: 'var(--green-600)', fontSize: 13 }}>✅ 無待處理帳項</div>}
                {onNavigate && <button className="btn btn-outline btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('arap')}>查看帳項 →</button>}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Today's Schedule */}
      {(() => {
        const bks = data.bookings || [];
        const todayStr = new Date().toISOString().substring(0, 10);
        const todayBks = bks.filter(b => b.date === todayStr && b.status !== 'cancelled').sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        if (!todayBks.length) return null;
        return (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>📅 今日預約 ({todayBks.length})</h3></div>
            <div style={{ fontSize: 12, maxHeight: 250, overflowY: 'auto' }}>
              {todayBks.map(b => (
                <div key={b.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--gray-100)', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, minWidth: 42, color: 'var(--teal-700)' }}>{b.time}</span>
                  <span style={{ fontWeight: 600, minWidth: 60 }}>{b.patientName}</span>
                  <span style={{ color: 'var(--gray-400)' }}>{b.doctor}</span>
                  <span style={{ color: 'var(--gray-400)' }}>{b.store}</span>
                  <span className={`tag ${b.status === 'completed' ? 'tag-paid' : b.status === 'confirmed' ? 'tag-fps' : b.status === 'no-show' ? 'tag-overdue' : 'tag-pending-orange'}`} style={{ fontSize: 10 }}>
                    {b.status === 'completed' ? '已完成' : b.status === 'confirmed' ? '已確認' : b.status === 'no-show' ? '未到' : '待確認'}
                  </span>
                </div>
              ))}
            </div>
            {onNavigate && <button className="btn btn-outline btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('booking')}>管理預約 →</button>}
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
