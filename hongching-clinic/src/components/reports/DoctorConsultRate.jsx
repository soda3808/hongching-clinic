import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DOCTORS, getMonth, monthLabel } from '../../data';

export default function DoctorConsultRate({ data }) {
  const consultations = data.consultations || [];
  const thisMonth = new Date().toISOString().substring(0, 7);

  const stats = useMemo(() => {
    const byDoc = {};
    DOCTORS.forEach(d => { byDoc[d] = { total: 0, thisMonth: 0, days: new Set() }; });
    consultations.forEach(c => {
      if (byDoc[c.doctor]) {
        byDoc[c.doctor].total++;
        byDoc[c.doctor].days.add(c.date);
        if (getMonth(c.date) === thisMonth) byDoc[c.doctor].thisMonth++;
      }
    });
    return DOCTORS.map(d => ({
      name: d,
      total: byDoc[d].total,
      thisMonth: byDoc[d].thisMonth,
      dailyAvg: byDoc[d].days.size > 0 ? (byDoc[d].total / byDoc[d].days.size).toFixed(1) : '0',
    }));
  }, [consultations, thisMonth]);

  const chartData = stats.map(s => ({ name: s.name, 本月診症: s.thisMonth, 總診症: s.total }));

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>📋 醫師診症率報表</h3>
      <div style={{ width: '100%', height: 260, marginBottom: 24 }}>
        <ResponsiveContainer>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="本月診症" fill="#0e7490" radius={[4,4,0,0]} />
            <Bar dataKey="總診症" fill="#14b8a6" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>醫師</th><th style={{textAlign:'right'}}>本月診症</th><th style={{textAlign:'right'}}>日均診症</th><th style={{textAlign:'right'}}>總診症數</th></tr></thead>
          <tbody>
            {stats.map(s => (
              <tr key={s.name}><td style={{fontWeight:600}}>{s.name}</td><td className="money">{s.thisMonth}</td><td className="money">{s.dailyAvg}</td><td className="money">{s.total}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
