import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function TreatmentReport({ data }) {
  const consultations = data.consultations || [];

  const stats = useMemo(() => {
    const counts = {};
    consultations.forEach(c => {
      (c.treatments || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    });
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([treatment, count]) => ({
      treatment, count, pct: total > 0 ? (count / total * 100).toFixed(1) : '0',
    }));
  }, [consultations]);

  const chartData = stats.map(s => ({ name: s.treatment, 次數: s.count }));

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>💉 顧客治療項目報表</h3>
      {stats.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無治療記錄</div>
      ) : (
        <>
          <div style={{ width: '100%', height: 280, marginBottom: 24 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="次數" fill="#7C3AED" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>治療項目</th><th style={{textAlign:'right'}}>次數</th><th style={{textAlign:'right'}}>佔比</th></tr></thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.treatment}><td style={{fontWeight:600}}>{s.treatment}</td><td className="money">{s.count}</td><td className="money">{s.pct}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
