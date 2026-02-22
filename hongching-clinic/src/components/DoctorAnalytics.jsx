import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { fmtM, fmt, getMonth, monthLabel, DOCTORS } from '../data';

const COLORS = { '常凱晴': '#0e7490', '許植輝': '#8B6914', '曾其方': '#7C3AED' };

export default function DoctorAnalytics({ data, user }) {
  const isDoctor = user?.role === 'doctor';
  const visibleDoctors = isDoctor ? [user.name] : DOCTORS;
  const months = useMemo(() => {
    const m = new Set();
    data.revenue.forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    return [...m].sort();
  }, [data.revenue]);

  const thisMonth = new Date().toISOString().substring(0, 7);

  // Per-doctor stats
  const docStats = useMemo(() => {
    return visibleDoctors.map(doc => {
      const recs = data.revenue.filter(r => r.doctor === doc);
      const thisRecs = recs.filter(r => getMonth(r.date) === thisMonth);
      const totalRev = recs.reduce((s, r) => s + Number(r.amount), 0);
      const thisRev = thisRecs.reduce((s, r) => s + Number(r.amount), 0);
      const patientCount = thisRecs.filter(r => !r.name.includes('匯總')).length;
      const avgPerPatient = patientCount ? thisRev / patientCount : 0;

      // Monthly breakdown
      const monthly = months.map(m => ({
        month: monthLabel(m).split(' ')[0],
        revenue: recs.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0),
        patients: recs.filter(r => getMonth(r.date) === m && !r.name.includes('匯總')).length,
      }));

      return { name: doc, totalRev, thisRev, patientCount, avgPerPatient, monthly, color: COLORS[doc] || '#666' };
    });
  }, [data.revenue, months, thisMonth]);

  // Stacked chart data
  const stackData = months.map(m => {
    const row = { month: monthLabel(m).split(' ')[0] };
    visibleDoctors.forEach(doc => {
      row[doc] = data.revenue.filter(r => r.doctor === doc && getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0);
    });
    return row;
  });

  return (
    <>
      {/* Doctor KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDoctors.length}, 1fr)`, gap: 16, marginBottom: 20 }}>
        {docStats.map(d => (
          <div key={d.name} className="card" style={{ borderTop: `4px solid ${d.color}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{d.name}</div>
            <div className="grid-2" style={{ gap: 8 }}>
              <div>
                <div className="stat-label">累計營業額</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: d.color }}>{fmtM(d.totalRev)}</div>
              </div>
              <div>
                <div className="stat-label">本月營業額</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: d.color }}>{fmtM(d.thisRev)}</div>
              </div>
              <div>
                <div className="stat-label">本月診症人次</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{d.patientCount}</div>
              </div>
              <div>
                <div className="stat-label">平均單價</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtM(d.avgPerPatient)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stacked Chart */}
      <div className="card">
        <div className="card-header"><h3>📊 各醫師每月營業額對比</h3></div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stackData}>
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
            <Tooltip formatter={v => fmtM(v)} />
            <Legend />
            {visibleDoctors.map(doc => (
              <Bar key={doc} dataKey={doc} stackId="a" fill={COLORS[doc] || '#999'} radius={doc === visibleDoctors[visibleDoctors.length-1] ? [4,4,0,0] : [0,0,0,0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail Tables */}
      {docStats.map(d => (
        <div key={d.name} className="card">
          <div className="card-header">
            <h3 style={{ color: d.color }}>📋 {d.name} — 月度明細</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>月份</th><th style={{ textAlign: 'right' }}>營業額</th><th style={{ textAlign: 'right' }}>診症人次</th><th style={{ textAlign: 'right' }}>平均單價</th></tr>
              </thead>
              <tbody>
                {d.monthly.filter(m => m.revenue > 0).map((m, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{m.month}</td>
                    <td className="money" style={{ color: d.color }}>{fmtM(m.revenue)}</td>
                    <td className="money">{m.patients}</td>
                    <td className="money">{m.patients ? fmtM(m.revenue / m.patients) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
