import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { fmtM, fmt, getMonth } from '../data';

const COLORS = { '宋皇臺': '#0e7490', '太子': '#8B6914' };

export default function StoreComparePage({ data, allData }) {
  const src = allData || data;
  const thisMonth = new Date().toISOString().substring(0, 7);
  const today = new Date().toISOString().substring(0, 10);

  const stores = ['宋皇臺', '太子'];

  const metrics = useMemo(() => {
    const result = {};
    stores.forEach(store => {
      const rev = (src.revenue || []).filter(r => r.store === store);
      const exp = (src.expenses || []).filter(r => r.store === store);
      const monthRev = rev.filter(r => getMonth(r.date) === thisMonth);
      const monthExp = exp.filter(r => getMonth(r.date) === thisMonth);
      const patients = (src.patients || []).filter(p => p.store === store);
      const bookings = (src.bookings || []).filter(b => b.store === store && b.date === today && b.status !== 'cancelled');
      const consultations = (src.consultations || []).filter(c => c.store === store && getMonth(c.date) === thisMonth);
      const queue = (src.queue || []).filter(q => q.store === store && q.date === today);
      const inventory = (src.inventory || []).filter(i => (i.store === store || !i.store) && i.active !== false);
      const lowStock = inventory.filter(i => i.stock <= (i.minStock || 10));

      result[store] = {
        totalRev: rev.reduce((s, r) => s + (r.amount || 0), 0),
        monthRev: monthRev.reduce((s, r) => s + (r.amount || 0), 0),
        totalExp: exp.reduce((s, r) => s + (r.amount || 0), 0),
        monthExp: monthExp.reduce((s, r) => s + (r.amount || 0), 0),
        patientCount: patients.length,
        todayBookings: bookings.length,
        monthConsultations: consultations.length,
        todayQueue: queue.length,
        lowStockCount: lowStock.length,
        avgTicket: monthRev.length ? monthRev.reduce((s, r) => s + (r.amount || 0), 0) / monthRev.length : 0,
      };
    });
    return result;
  }, [src, thisMonth, today]);

  // Monthly trend comparison
  const monthlyTrend = useMemo(() => {
    const months = new Set();
    (src.revenue || []).forEach(r => { const m = getMonth(r.date); if (m) months.add(m); });
    return [...months].sort().slice(-6).map(m => {
      const row = { month: m.substring(5) + '月' };
      stores.forEach(store => {
        row[store] = (src.revenue || []).filter(r => r.store === store && getMonth(r.date) === m).reduce((s, r) => s + (r.amount || 0), 0);
      });
      return row;
    });
  }, [src]);

  // Radar chart data
  const radarData = useMemo(() => {
    const maxRev = Math.max(metrics['宋皇臺'].monthRev, metrics['太子'].monthRev) || 1;
    const maxPat = Math.max(metrics['宋皇臺'].patientCount, metrics['太子'].patientCount) || 1;
    const maxCon = Math.max(metrics['宋皇臺'].monthConsultations, metrics['太子'].monthConsultations) || 1;
    const maxBook = Math.max(metrics['宋皇臺'].todayBookings, metrics['太子'].todayBookings) || 1;
    const maxTicket = Math.max(metrics['宋皇臺'].avgTicket, metrics['太子'].avgTicket) || 1;

    return [
      { metric: '本月營業額', '宋皇臺': (metrics['宋皇臺'].monthRev / maxRev * 100).toFixed(0), '太子': (metrics['太子'].monthRev / maxRev * 100).toFixed(0) },
      { metric: '病人數', '宋皇臺': (metrics['宋皇臺'].patientCount / maxPat * 100).toFixed(0), '太子': (metrics['太子'].patientCount / maxPat * 100).toFixed(0) },
      { metric: '本月診症', '宋皇臺': (metrics['宋皇臺'].monthConsultations / maxCon * 100).toFixed(0), '太子': (metrics['太子'].monthConsultations / maxCon * 100).toFixed(0) },
      { metric: '今日預約', '宋皇臺': (metrics['宋皇臺'].todayBookings / maxBook * 100).toFixed(0), '太子': (metrics['太子'].todayBookings / maxBook * 100).toFixed(0) },
      { metric: '平均單價', '宋皇臺': (metrics['宋皇臺'].avgTicket / maxTicket * 100).toFixed(0), '太子': (metrics['太子'].avgTicket / maxTicket * 100).toFixed(0) },
    ];
  }, [metrics]);

  const renderCompareCard = (label, key, format = 'money') => (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', gap: 16 }}>
        {stores.map(store => (
          <div key={store} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: COLORS[store], fontWeight: 600, marginBottom: 4 }}>{store}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: COLORS[store] }}>
              {format === 'money' ? fmtM(metrics[store][key]) : fmt(metrics[store][key])}
            </div>
          </div>
        ))}
      </div>
      {/* Winner indicator */}
      {metrics['宋皇臺'][key] !== metrics['太子'][key] && (
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: 'var(--gray-400)' }}>
          {metrics['宋皇臺'][key] > metrics['太子'][key] ? '宋皇臺' : '太子'} 領先{' '}
          {format === 'money'
            ? fmtM(Math.abs(metrics['宋皇臺'][key] - metrics['太子'][key]))
            : Math.abs(metrics['宋皇臺'][key] - metrics['太子'][key])
          }
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Summary Stats */}
      <div className="stats-grid">
        <div className="stat-card teal">
          <div className="stat-label">宋皇臺本月</div>
          <div className="stat-value teal">{fmtM(metrics['宋皇臺'].monthRev)}</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">太子本月</div>
          <div className="stat-value gold">{fmtM(metrics['太子'].monthRev)}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">兩店合計</div>
          <div className="stat-value green">{fmtM(metrics['宋皇臺'].monthRev + metrics['太子'].monthRev)}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">差距</div>
          <div className="stat-value red">{fmtM(Math.abs(metrics['宋皇臺'].monthRev - metrics['太子'].monthRev))}</div>
        </div>
      </div>

      {/* Compare Cards Grid */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        {renderCompareCard('本月營業額', 'monthRev')}
        {renderCompareCard('本月開支', 'monthExp')}
        {renderCompareCard('病人總數', 'patientCount', 'number')}
        {renderCompareCard('本月診症次數', 'monthConsultations', 'number')}
        {renderCompareCard('今日預約', 'todayBookings', 'number')}
        {renderCompareCard('平均單價', 'avgTicket')}
      </div>

      {/* Charts */}
      <div className="grid-2">
        {/* Trend Chart */}
        <div className="card">
          <div className="card-header"><h3>營業額趨勢對比</h3></div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyTrend}>
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip formatter={v => fmtM(v)} />
              <Legend />
              <Bar dataKey="宋皇臺" fill={COLORS['宋皇臺']} radius={[4,4,0,0]} />
              <Bar dataKey="太子" fill={COLORS['太子']} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radar Chart */}
        <div className="card">
          <div className="card-header"><h3>綜合表現雷達圖</h3></div>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" fontSize={11} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} />
              <Radar name="宋皇臺" dataKey="宋皇臺" stroke={COLORS['宋皇臺']} fill={COLORS['宋皇臺']} fillOpacity={0.3} />
              <Radar name="太子" dataKey="太子" stroke={COLORS['太子']} fill={COLORS['太子']} fillOpacity={0.3} />
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Comparison Table */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>詳細對比表</h3></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>指標</th><th style={{ textAlign: 'right', color: COLORS['宋皇臺'] }}>宋皇臺</th><th style={{ textAlign: 'right', color: COLORS['太子'] }}>太子</th><th style={{ textAlign: 'right' }}>差距</th></tr>
            </thead>
            <tbody>
              {[
                ['累計營業額', 'totalRev', 'money'],
                ['本月營業額', 'monthRev', 'money'],
                ['累計開支', 'totalExp', 'money'],
                ['本月開支', 'monthExp', 'money'],
                ['累計淨利', null, 'profit'],
                ['病人總數', 'patientCount', 'number'],
                ['本月診症', 'monthConsultations', 'number'],
                ['今日預約', 'todayBookings', 'number'],
                ['低庫存項目', 'lowStockCount', 'number'],
                ['平均單價', 'avgTicket', 'money'],
              ].map(([label, key, type]) => {
                const v1 = key ? metrics['宋皇臺'][key] : metrics['宋皇臺'].totalRev - metrics['宋皇臺'].totalExp;
                const v2 = key ? metrics['太子'][key] : metrics['太子'].totalRev - metrics['太子'].totalExp;
                const diff = v1 - v2;
                const f = type === 'money' || type === 'profit' ? fmtM : fmt;
                return (
                  <tr key={label}>
                    <td style={{ fontWeight: 600 }}>{label}</td>
                    <td className="money" style={{ color: COLORS['宋皇臺'] }}>{f(v1)}</td>
                    <td className="money" style={{ color: COLORS['太子'] }}>{f(v2)}</td>
                    <td className="money" style={{ color: diff > 0 ? 'var(--green-600)' : diff < 0 ? 'var(--red-500)' : 'var(--gray-400)' }}>
                      {diff > 0 ? '+' : ''}{f(diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
