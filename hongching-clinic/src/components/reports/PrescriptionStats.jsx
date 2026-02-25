import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function PrescriptionStats({ data }) {
  const consultations = data.consultations || [];

  const herbStats = useMemo(() => {
    const counts = {};
    consultations.forEach(c => {
      (c.prescription || []).forEach(p => {
        if (p.herb) counts[p.herb] = (counts[p.herb] || 0) + 1;
      });
    });
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([herb, count], i) => ({ rank: i + 1, herb, count, pct: total > 0 ? (count / total * 100).toFixed(1) : '0' }));
  }, [consultations]);

  const chartData = herbStats.map(h => ({ name: h.herb, 次數: h.count }));

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>💊 藥物處方統計報表</h3>
      {herbStats.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無處方記錄</div>
      ) : (
        <>
          <div style={{ width: '100%', height: 400, marginBottom: 24 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis dataKey="name" type="category" fontSize={11} width={80} />
                <Tooltip />
                <Bar dataKey="次數" fill="#16a34a" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>藥材名稱</th><th style={{textAlign:'right'}}>使用次數</th><th style={{textAlign:'right'}}>佔比</th></tr></thead>
              <tbody>
                {herbStats.map(h => (
                  <tr key={h.herb}><td style={{fontWeight:700,color:'var(--gray-400)'}}>{h.rank}</td><td style={{fontWeight:600}}>{h.herb}</td><td className="money">{h.count}</td><td className="money">{h.pct}%</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
