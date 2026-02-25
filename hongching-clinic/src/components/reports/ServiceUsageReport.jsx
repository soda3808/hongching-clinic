import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtM } from '../../data';

export default function ServiceUsageReport({ data }) {
  const queue = data.queue || [];

  const stats = useMemo(() => {
    const counts = {};
    queue.forEach(q => {
      if (q.services) {
        q.services.split(';').map(s => s.trim()).filter(Boolean).forEach(svc => {
          if (!counts[svc]) counts[svc] = { count: 0, revenue: 0 };
          counts[svc].count++;
          counts[svc].revenue += Number(q.serviceFee || 0) / (q.services.split(';').length || 1);
        });
      }
    });
    return Object.entries(counts).sort((a, b) => b[1].count - a[1].count).map(([svc, d]) => ({ service: svc, count: d.count, revenue: Math.round(d.revenue) }));
  }, [queue]);

  const chartData = stats.map(s => ({ name: s.service, 使用次數: s.count }));

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>🔧 服務使用頻率報表</h3>
      {stats.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無服務記錄</div>
      ) : (
        <>
          <div style={{ width: '100%', height: 280, marginBottom: 24 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="使用次數" fill="#0e7490" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>服務項目</th><th style={{textAlign:'right'}}>使用次數</th><th style={{textAlign:'right'}}>估計營業額</th></tr></thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.service}><td style={{fontWeight:600}}>{s.service}</td><td className="money">{s.count}</td><td className="money">{fmtM(s.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
