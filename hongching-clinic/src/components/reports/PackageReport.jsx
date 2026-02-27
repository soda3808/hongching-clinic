import { useMemo, useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fmtM, getMonth, monthLabel } from '../../data';

const COLORS = ['#0e7490', '#16a34a', '#7c3aed', '#d97706', '#dc2626', '#0284c7'];

export default function PackageReport({ data }) {
  const packages = data.packages || [];
  const enrollments = data.enrollments || [];
  const revenue = data.revenue || [];
  const [tab, setTab] = useState('overview');

  const stats = useMemo(() => {
    const byPkg = {};
    packages.forEach(p => { byPkg[p.id] = { id: p.id, name: p.name, price: p.price || 0, enrollments: 0, revenue: 0, totalUsed: 0, totalSessions: 0, active: 0, expired: 0, completed: 0 }; });
    enrollments.forEach(e => {
      if (byPkg[e.packageId]) {
        byPkg[e.packageId].enrollments++;
        byPkg[e.packageId].revenue += packages.find(p => p.id === e.packageId)?.price || 0;
        byPkg[e.packageId].totalUsed += e.usedSessions || 0;
        byPkg[e.packageId].totalSessions += e.totalSessions || 0;
        if (e.status === 'active') byPkg[e.packageId].active++;
        else if (e.status === 'expired') byPkg[e.packageId].expired++;
        else if (e.status === 'completed' || (e.usedSessions >= e.totalSessions)) byPkg[e.packageId].completed++;
      }
    });
    return Object.values(byPkg).sort((a, b) => b.enrollments - a.enrollments);
  }, [packages, enrollments]);

  const totalRevenue = stats.reduce((s, p) => s + p.revenue, 0);
  const totalEnrollments = enrollments.length;
  const activeEnrollments = enrollments.filter(e => e.status === 'active');
  const avgUtil = useMemo(() => {
    const withSessions = enrollments.filter(e => e.totalSessions > 0);
    if (!withSessions.length) return 0;
    return withSessions.reduce((s, e) => s + (e.usedSessions / e.totalSessions * 100), 0) / withSessions.length;
  }, [enrollments]);

  // Expiring soon (30 days)
  const today = new Date().toISOString().substring(0, 10);
  const in30 = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().substring(0, 10); })();
  const expiringSoon = activeEnrollments.filter(e => e.expiryDate && e.expiryDate <= in30 && e.expiryDate >= today);

  // Package vs individual revenue
  const revenueComparison = useMemo(() => {
    const totalAll = revenue.reduce((s, r) => s + Number(r.amount || 0), 0);
    return [
      { name: '套餐收入', value: totalRevenue },
      { name: '非套餐收入', value: Math.max(0, totalAll - totalRevenue) },
    ];
  }, [revenue, totalRevenue]);

  // Monthly enrollment trend
  const monthlyTrend = useMemo(() => {
    const byMonth = {};
    enrollments.forEach(e => {
      const m = getMonth(e.enrolledAt || e.createdAt);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { month: m, count: 0, revenue: 0 };
      byMonth[m].count += 1;
      const pkg = packages.find(p => p.id === e.packageId);
      byMonth[m].revenue += pkg?.price || 0;
    });
    return Object.values(byMonth)
      .map(m => ({ ...m, label: monthLabel(m.month), 購買數: m.count, 收入: m.revenue }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [enrollments, packages]);

  const chartData = stats.filter(s => s.enrollments > 0).map(s => ({ name: s.name, 購買數: s.enrollments, 活躍: s.active }));

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 12 }}>🎫 醫療計劃使用/購買報表</h3>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-btn ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>總覽</button>
        <button className={`tab-btn ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>活躍套餐 ({activeEnrollments.length})</button>
        <button className={`tab-btn ${tab === 'expiring' ? 'active' : ''}`} onClick={() => setTab('expiring')}>即將到期 ({expiringSoon.length})</button>
        <button className={`tab-btn ${tab === 'trend' ? 'active' : ''}`} onClick={() => setTab('trend')}>月度趨勢</button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 10, background: 'var(--teal-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>套餐數</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{packages.length}</div>
        </div>
        <div style={{ padding: 10, background: 'var(--gold-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>總購買</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-700)' }}>{totalEnrollments}</div>
        </div>
        <div style={{ padding: 10, background: 'var(--green-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--green-600)', fontWeight: 600 }}>活躍中</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-700)' }}>{activeEnrollments.length}</div>
        </div>
        <div style={{ padding: 10, background: '#f5f3ff', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>套餐收入</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#7c3aed' }}>{fmtM(totalRevenue)}</div>
        </div>
        <div style={{ padding: 10, background: 'var(--gray-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gray-500)', fontWeight: 600 }}>平均使用率</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: avgUtil >= 70 ? 'var(--green-700)' : avgUtil >= 40 ? 'var(--gold-700)' : 'var(--red-600)' }}>{avgUtil.toFixed(0)}%</div>
        </div>
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {chartData.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>各套餐購買/活躍數</div>
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={10} />
                      <YAxis fontSize={11} allowDecimals={false} />
                      <Tooltip />
                      <Legend fontSize={10} />
                      <Bar dataKey="購買數" fill="#0e7490" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="活躍" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {revenueComparison[0].value > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>套餐 vs 非套餐收入</div>
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={revenueComparison} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                        {revenueComparison.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmtM(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Package detail table */}
          <div className="table-wrap">
            <table>
              <thead><tr><th>套餐名稱</th><th style={{ textAlign: 'right' }}>售價</th><th style={{ textAlign: 'right' }}>購買</th><th style={{ textAlign: 'right' }}>活躍</th><th style={{ textAlign: 'right' }}>完成</th><th style={{ textAlign: 'right' }}>收入</th><th style={{ textAlign: 'right' }}>使用率</th></tr></thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.name}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td className="money">{fmtM(s.price)}</td>
                    <td className="money">{s.enrollments}</td>
                    <td className="money" style={{ color: 'var(--green-700)', fontWeight: 700 }}>{s.active}</td>
                    <td className="money">{s.completed}</td>
                    <td className="money" style={{ color: 'var(--gold-700)', fontWeight: 700 }}>{fmtM(s.revenue)}</td>
                    <td className="money" style={{ fontWeight: 700 }}>{s.totalSessions > 0 ? (s.totalUsed / s.totalSessions * 100).toFixed(0) : 0}%</td>
                  </tr>
                ))}
                {stats.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無套餐記錄</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Active Enrollments Tab */}
      {tab === 'active' && (
        <div>
          {activeEnrollments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無活躍套餐</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {activeEnrollments
                .sort((a, b) => (a.usedSessions / a.totalSessions) - (b.usedSessions / b.totalSessions))
                .map(e => {
                  const pkg = packages.find(p => p.id === e.packageId);
                  const pct = e.totalSessions > 0 ? (e.usedSessions / e.totalSessions * 100) : 0;
                  const isExpiringSoon = e.expiryDate && e.expiryDate <= in30;
                  return (
                    <div key={e.id} style={{ padding: 10, border: '1px solid var(--gray-200)', borderRadius: 8, borderLeft: `4px solid ${pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{e.patientName || '病人'}</span>
                          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gray-500)' }}>{pkg?.name || '套餐'}</span>
                          {isExpiringSoon && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', background: '#fef2f2', color: '#dc2626', borderRadius: 3, fontWeight: 600 }}>即將到期</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>到期：{e.expiryDate || '-'}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 8, background: 'var(--gray-100)', borderRadius: 4 }}>
                          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#0e7490', borderRadius: 4, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: pct >= 80 ? '#16a34a' : '#0e7490', minWidth: 70, textAlign: 'right' }}>
                          {e.usedSessions}/{e.totalSessions} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Expiring Soon Tab */}
      {tab === 'expiring' && (
        <div>
          {expiringSoon.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--green-600)' }}>30天內沒有即將到期的套餐</div>
          ) : (
            <>
              <div style={{ marginBottom: 12, padding: 10, background: '#fef2f2', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
                <strong>⚠️ {expiringSoon.length} 個套餐將在30天內到期</strong> — 建議聯繫病人安排使用或續約
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>病人</th><th>套餐</th><th style={{ textAlign: 'right' }}>已用/總次</th><th style={{ textAlign: 'right' }}>使用率</th><th>到期日</th><th style={{ textAlign: 'right' }}>剩餘天數</th></tr></thead>
                  <tbody>
                    {expiringSoon
                      .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''))
                      .map(e => {
                        const pkg = packages.find(p => p.id === e.packageId);
                        const daysLeft = Math.max(0, Math.ceil((new Date(e.expiryDate) - new Date()) / 86400000));
                        const pct = e.totalSessions > 0 ? (e.usedSessions / e.totalSessions * 100) : 0;
                        return (
                          <tr key={e.id}>
                            <td style={{ fontWeight: 600 }}>{e.patientName || '-'}</td>
                            <td>{pkg?.name || '-'}</td>
                            <td className="money">{e.usedSessions}/{e.totalSessions}</td>
                            <td className="money" style={{ color: pct < 50 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>{pct.toFixed(0)}%</td>
                            <td>{e.expiryDate}</td>
                            <td className="money" style={{ color: daysLeft <= 7 ? '#dc2626' : '#d97706', fontWeight: 700 }}>{daysLeft} 天</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Monthly Trend Tab */}
      {tab === 'trend' && (
        <div>
          {monthlyTrend.length < 2 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>數據不足，需至少2個月</div>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>月度購買趨勢</div>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={10} />
                    <YAxis yAxisId="left" fontSize={11} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" fontSize={11} tickFormatter={v => fmtM(v)} />
                    <Tooltip formatter={(v, name) => name === '收入' ? fmtM(v) : v} />
                    <Legend fontSize={10} />
                    <Bar yAxisId="left" dataKey="購買數" fill="#0e7490" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="收入" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
