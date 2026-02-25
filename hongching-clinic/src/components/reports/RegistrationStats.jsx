import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function RegistrationStats({ data }) {
  const queue = data.queue || [];

  const { hourData, dailyData } = useMemo(() => {
    const hours = {};
    for (let h = 9; h <= 20; h++) hours[h] = 0;
    const daily = {};
    queue.forEach(q => {
      if (q.registeredAt) {
        const hour = parseInt(q.registeredAt.split(':')[0], 10);
        if (hours[hour] !== undefined) hours[hour]++;
      }
      if (q.date) daily[q.date] = (daily[q.date] || 0) + 1;
    });
    const hourData = Object.entries(hours).map(([h, count]) => ({ name: `${h}:00`, 掛號數: count }));
    const dailyData = Object.entries(daily).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30).reverse().map(([date, count]) => ({ name: date.substring(5), 掛號數: count }));
    return { hourData, dailyData };
  }, [queue]);

  const totalRegs = queue.length;
  const avgPerDay = useMemo(() => {
    const days = new Set(queue.map(q => q.date).filter(Boolean));
    return days.size > 0 ? (totalRegs / days.size).toFixed(1) : '0';
  }, [queue, totalRegs]);

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>🎫 顧客掛號信息統計報表</h3>
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card teal"><div className="stat-label">總掛號數</div><div className="stat-value teal">{totalRegs}</div></div>
        <div className="stat-card gold"><div className="stat-label">日均掛號</div><div className="stat-value gold">{avgPerDay}</div></div>
      </div>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>按時段分佈</h4>
      <div style={{ width: '100%', height: 260, marginBottom: 24 }}>
        <ResponsiveContainer>
          <BarChart data={hourData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="掛號數" fill="#DAA520" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {dailyData.length > 0 && (
        <>
          <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>按日分佈（近30天）</h4>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={10} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="掛號數" fill="#0e7490" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
