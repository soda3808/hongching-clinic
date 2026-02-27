import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { fmtM, getDoctors } from '../../data';

const COLORS = ['#0e7490', '#d97706', '#7C3AED', '#dc2626', '#16a34a', '#8B6914'];

export default function StaffKPIReport({ data }) {
  const DOCTORS = getDoctors();
  const [period, setPeriod] = useState('month'); // month | quarter | year
  const today = new Date();
  const thisMonth = today.toISOString().substring(0, 7);

  const dateRange = useMemo(() => {
    if (period === 'month') {
      return { start: thisMonth + '-01', end: thisMonth + '-31', label: thisMonth };
    }
    if (period === 'quarter') {
      const q = Math.floor(today.getMonth() / 3);
      const start = `${today.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`;
      const endMonth = q * 3 + 3;
      const end = `${today.getFullYear()}-${String(endMonth).padStart(2, '0')}-31`;
      return { start, end, label: `Q${q + 1} ${today.getFullYear()}` };
    }
    return { start: `${today.getFullYear()}-01-01`, end: `${today.getFullYear()}-12-31`, label: String(today.getFullYear()) };
  }, [period, thisMonth]);

  const kpis = useMemo(() => {
    const revenue = (data.revenue || []).filter(r => r.date >= dateRange.start && r.date <= dateRange.end);
    const bookings = (data.bookings || []).filter(b => b.date >= dateRange.start && b.date <= dateRange.end);
    const consultations = (data.consultations || []).filter(c => c.date >= dateRange.start && c.date <= dateRange.end);
    const surveys = data.surveys || [];

    return DOCTORS.map((doc, idx) => {
      const docRev = revenue.filter(r => r.doctor === doc);
      const docBookings = bookings.filter(b => b.doctor === doc);
      const docConsult = consultations.filter(c => c.doctor === doc);
      const noShows = docBookings.filter(b => b.status === 'no-show').length;
      const completed = docBookings.filter(b => b.status === 'completed').length;
      const totalBookings = docBookings.filter(b => b.status !== 'cancelled').length;
      const totalRevenue = docRev.reduce((s, r) => s + Number(r.amount || 0), 0);
      const avgRevPerVisit = completed > 0 ? totalRevenue / completed : 0;
      const noShowRate = totalBookings > 0 ? (noShows / totalBookings * 100) : 0;
      const uniquePatients = new Set(docRev.map(r => r.name)).size;
      const returnPatients = docRev.filter(r => {
        const allVisits = revenue.filter(v => v.name === r.name && v.doctor === doc);
        return allVisits.length > 1;
      });
      const returnRate = uniquePatients > 0 ? (new Set(returnPatients.map(r => r.name)).size / uniquePatients * 100) : 0;

      // Satisfaction from surveys
      const docSurveys = surveys.filter(s => s.doctor === doc);
      const avgRating = docSurveys.length > 0 ? (docSurveys.reduce((s, sv) => s + Number(sv.rating || 0), 0) / docSurveys.length) : 0;

      return {
        name: doc,
        color: COLORS[idx % COLORS.length],
        totalRevenue,
        totalBookings,
        completed,
        noShows,
        noShowRate: Math.round(noShowRate),
        avgRevPerVisit: Math.round(avgRevPerVisit),
        uniquePatients,
        returnRate: Math.round(returnRate),
        consultations: docConsult.length,
        avgRating: avgRating.toFixed(1),
        surveyCount: docSurveys.length,
      };
    }).filter(d => d.totalBookings > 0 || d.totalRevenue > 0 || d.consultations > 0);
  }, [data, dateRange, DOCTORS]);

  // Radar chart data
  const radarData = useMemo(() => {
    if (kpis.length === 0) return [];
    const maxRev = Math.max(...kpis.map(d => d.totalRevenue), 1);
    const maxPat = Math.max(...kpis.map(d => d.uniquePatients), 1);
    const maxBookings = Math.max(...kpis.map(d => d.completed), 1);

    const metrics = ['營業額', '病人數', '完成預約', '回診率', '滿意度'];
    return metrics.map(metric => {
      const entry = { metric };
      kpis.forEach(d => {
        if (metric === '營業額') entry[d.name] = Math.round(d.totalRevenue / maxRev * 100);
        if (metric === '病人數') entry[d.name] = Math.round(d.uniquePatients / maxPat * 100);
        if (metric === '完成預約') entry[d.name] = Math.round(d.completed / maxBookings * 100);
        if (metric === '回診率') entry[d.name] = d.returnRate;
        if (metric === '滿意度') entry[d.name] = Number(d.avgRating) * 20; // scale 5→100
      });
      return entry;
    });
  }, [kpis]);

  // Bar chart data
  const barData = useMemo(() => {
    return kpis.map(d => ({
      name: d.name,
      營業額: d.totalRevenue,
      病人數: d.uniquePatients,
      完成預約: d.completed,
    }));
  }, [kpis]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>醫師/員工 KPI 績效</h3>
        <div className="preset-bar" style={{ marginBottom: 0 }}>
          {[['month','本月'],['quarter','本季'],['year','全年']].map(([k, l]) => (
            <button key={k} className={`preset-chip ${period === k ? 'active' : ''}`} onClick={() => setPeriod(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 12 }}>期間: {dateRange.label}</div>

      {kpis.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>此期間暫無數據</div>
      ) : (
        <>
          {/* KPI Cards per doctor */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(kpis.length, 3)}, 1fr)`, gap: 12, marginBottom: 16 }}>
            {kpis.map(d => (
              <div key={d.name} className="card" style={{ borderTop: `4px solid ${d.color}` }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: d.color, marginBottom: 8 }}>{d.name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12 }}>
                  <div><span style={{ color: 'var(--gray-500)' }}>營業額</span><div style={{ fontWeight: 700, fontSize: 16 }}>{fmtM(d.totalRevenue)}</div></div>
                  <div><span style={{ color: 'var(--gray-500)' }}>病人數</span><div style={{ fontWeight: 700, fontSize: 16 }}>{d.uniquePatients}</div></div>
                  <div><span style={{ color: 'var(--gray-500)' }}>完成預約</span><div style={{ fontWeight: 600 }}>{d.completed}</div></div>
                  <div><span style={{ color: 'var(--gray-500)' }}>No-show</span><div style={{ fontWeight: 600, color: d.noShowRate > 10 ? '#dc2626' : '#16a34a' }}>{d.noShows} ({d.noShowRate}%)</div></div>
                  <div><span style={{ color: 'var(--gray-500)' }}>人均消費</span><div style={{ fontWeight: 600 }}>{fmtM(d.avgRevPerVisit)}</div></div>
                  <div><span style={{ color: 'var(--gray-500)' }}>回診率</span><div style={{ fontWeight: 600, color: d.returnRate > 50 ? '#16a34a' : '#d97706' }}>{d.returnRate}%</div></div>
                  <div><span style={{ color: 'var(--gray-500)' }}>滿意度</span><div style={{ fontWeight: 600 }}>{d.avgRating > 0 ? `${d.avgRating}/5` : '-'}{d.surveyCount > 0 && <span style={{ fontSize: 10, color: 'var(--gray-400)' }}> ({d.surveyCount}份)</span>}</div></div>
                  <div><span style={{ color: 'var(--gray-500)' }}>診療紀錄</span><div style={{ fontWeight: 600 }}>{d.consultations}</div></div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>業績比較</h4>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v, n) => [n === '營業額' ? fmtM(v) : v, n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="營業額" fill="#0e7490" />
                  <Bar dataKey="病人數" fill="#d97706" />
                  <Bar dataKey="完成預約" fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {kpis.length >= 2 && radarData.length > 0 && (
              <div className="card">
                <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>綜合能力雷達圖</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                    {kpis.map(d => (
                      <Radar key={d.name} name={d.name} dataKey={d.name} stroke={d.color} fill={d.color} fillOpacity={0.15} />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Ranking Table */}
          <div className="card" style={{ marginTop: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>綜合排名</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>醫師</th><th style={{ textAlign: 'right' }}>營業額</th><th style={{ textAlign: 'right' }}>病人數</th><th style={{ textAlign: 'right' }}>人均消費</th><th style={{ textAlign: 'right' }}>回診率</th><th style={{ textAlign: 'right' }}>No-show率</th><th style={{ textAlign: 'right' }}>滿意度</th></tr>
                </thead>
                <tbody>
                  {kpis.sort((a, b) => b.totalRevenue - a.totalRevenue).map((d, i) => (
                    <tr key={d.name}>
                      <td style={{ fontWeight: 700, color: i === 0 ? '#DAA520' : i === 1 ? '#A0A0A0' : i === 2 ? '#CD7F32' : 'var(--gray-600)' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </td>
                      <td style={{ fontWeight: 600 }}>{d.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtM(d.totalRevenue)}</td>
                      <td style={{ textAlign: 'right' }}>{d.uniquePatients}</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(d.avgRevPerVisit)}</td>
                      <td style={{ textAlign: 'right', color: d.returnRate > 50 ? '#16a34a' : '#d97706' }}>{d.returnRate}%</td>
                      <td style={{ textAlign: 'right', color: d.noShowRate > 10 ? '#dc2626' : '#16a34a' }}>{d.noShowRate}%</td>
                      <td style={{ textAlign: 'right' }}>{d.avgRating > 0 ? `${d.avgRating}/5` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
