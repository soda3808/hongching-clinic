import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtM } from '../../data';

export default function PackageReport({ data }) {
  const packages = data.packages || [];
  const enrollments = data.enrollments || [];

  const stats = useMemo(() => {
    const byPkg = {};
    packages.forEach(p => { byPkg[p.id] = { name: p.name, price: p.price || 0, enrollments: 0, revenue: 0, totalUsed: 0, totalSessions: 0 }; });
    enrollments.forEach(e => {
      if (byPkg[e.packageId]) {
        byPkg[e.packageId].enrollments++;
        byPkg[e.packageId].revenue += packages.find(p => p.id === e.packageId)?.price || 0;
        byPkg[e.packageId].totalUsed += e.usedSessions || 0;
        byPkg[e.packageId].totalSessions += e.totalSessions || 0;
      }
    });
    return Object.values(byPkg).sort((a, b) => b.enrollments - a.enrollments);
  }, [packages, enrollments]);

  const totalRevenue = stats.reduce((s, p) => s + p.revenue, 0);
  const totalEnrollments = enrollments.length;
  const activeEnrollments = enrollments.filter(e => e.status === 'active').length;
  const avgUtil = useMemo(() => {
    const withSessions = enrollments.filter(e => e.totalSessions > 0);
    if (!withSessions.length) return 0;
    return withSessions.reduce((s, e) => s + (e.usedSessions / e.totalSessions * 100), 0) / withSessions.length;
  }, [enrollments]);

  const chartData = stats.filter(s => s.enrollments > 0).map(s => ({ name: s.name, 購買數: s.enrollments }));

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>🎫 醫療計劃使用/購買報表</h3>
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card teal"><div className="stat-label">套餐數</div><div className="stat-value teal">{packages.length}</div></div>
        <div className="stat-card gold"><div className="stat-label">總購買數</div><div className="stat-value gold">{totalEnrollments}</div></div>
        <div className="stat-card green"><div className="stat-label">套餐收入</div><div className="stat-value green">{fmtM(totalRevenue)}</div></div>
        <div className="stat-card"><div className="stat-label">平均使用率</div><div className="stat-value" style={{color:'var(--teal-700)'}}>{avgUtil.toFixed(0)}%</div></div>
      </div>
      {chartData.length > 0 && (
        <div style={{ width: '100%', height: 260, marginBottom: 24 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="購買數" fill="#16a34a" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>套餐名稱</th><th style={{textAlign:'right'}}>售價</th><th style={{textAlign:'right'}}>購買數</th><th style={{textAlign:'right'}}>總收入</th><th style={{textAlign:'right'}}>使用率</th></tr></thead>
          <tbody>
            {stats.map(s => (
              <tr key={s.name}><td style={{fontWeight:600}}>{s.name}</td><td className="money">{fmtM(s.price)}</td><td className="money">{s.enrollments}</td><td className="money" style={{color:'var(--gold-700)'}}>{fmtM(s.revenue)}</td><td className="money">{s.totalSessions > 0 ? (s.totalUsed/s.totalSessions*100).toFixed(0) : 0}%</td></tr>
            ))}
            {stats.length === 0 && <tr><td colSpan={5} style={{textAlign:'center',padding:40,color:'#aaa'}}>暫無套餐記錄</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
