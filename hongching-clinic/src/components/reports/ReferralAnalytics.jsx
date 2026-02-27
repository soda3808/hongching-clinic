import { useMemo } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getMonth, monthLabel, fmtM } from '../../data';

const COLORS = ['#0e7490', '#16a34a', '#7c3aed', '#d97706', '#dc2626', '#0284c7', '#db2777', '#65a30d'];

export default function ReferralAnalytics({ data }) {
  const patients = data.patients || [];
  const revenue = data.revenue || [];

  // ── Source distribution ──
  const sourceData = useMemo(() => {
    const sources = {};
    patients.forEach(p => {
      const src = p.referralSource || '未填';
      if (!sources[src]) sources[src] = { name: src, count: 0, revenue: 0, patients: [] };
      sources[src].count += 1;
      sources[src].patients.push(p);
      sources[src].revenue += Number(p.totalSpent || 0);
    });
    return Object.values(sources).sort((a, b) => b.count - a.count);
  }, [patients]);

  // ── Monthly referral trend ──
  const monthlyTrend = useMemo(() => {
    const byMonth = {};
    patients.forEach(p => {
      const m = getMonth(p.createdAt || p.firstVisit);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { month: m, total: 0 };
      const src = p.referralSource || '未填';
      byMonth[m][src] = (byMonth[m][src] || 0) + 1;
      byMonth[m].total += 1;
    });
    return Object.values(byMonth)
      .map(m => ({ ...m, label: monthLabel(m.month) }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [patients]);

  // ── Top referral sources (pie chart) ──
  const pieData = useMemo(() => {
    return sourceData.filter(s => s.name !== '未填').slice(0, 8).map(s => ({
      name: s.name, value: s.count,
    }));
  }, [sourceData]);

  // ── Conversion quality ──
  const conversionData = useMemo(() => {
    return sourceData.filter(s => s.count >= 2).map(s => {
      const returning = s.patients.filter(p => (p.totalVisits || 0) >= 2).length;
      const avgSpent = s.count > 0 ? s.revenue / s.count : 0;
      const avgVisits = s.count > 0 ? s.patients.reduce((sum, p) => sum + (p.totalVisits || 0), 0) / s.count : 0;
      return {
        name: s.name,
        count: s.count,
        returnRate: s.count > 0 ? Math.round((returning / s.count) * 100) : 0,
        avgSpent: Math.round(avgSpent),
        avgVisits: avgVisits.toFixed(1),
      };
    }).sort((a, b) => b.avgSpent - a.avgSpent);
  }, [sourceData]);

  const totalWithSource = patients.filter(p => p.referralSource).length;
  const fillRate = patients.length > 0 ? Math.round((totalWithSource / patients.length) * 100) : 0;

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>🔗 病人轉介分析</h3>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'var(--teal-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>總病人</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal-700)' }}>{patients.length}</div>
        </div>
        <div style={{ padding: 12, background: '#f5f3ff', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>已填轉介來源</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#7c3aed' }}>{totalWithSource}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--green-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--green-600)', fontWeight: 600 }}>填寫率</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-700)' }}>{fillRate}%</div>
        </div>
        <div style={{ padding: 12, background: 'var(--gold-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>最大來源</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold-700)' }}>{sourceData.filter(s => s.name !== '未填')[0]?.name || '-'}</div>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>來源分佈</div>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <BarChart data={sourceData.filter(s => s.name !== '未填')} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" fontSize={11} width={70} />
                <Tooltip />
                <Bar dataKey="count" name="病人數" fill="#0e7490" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        {pieData.length > 0 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>比例</div>
            <div style={{ width: '100%', height: 250 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Monthly trend */}
      {monthlyTrend.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>月度新病人來源</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend fontSize={10} />
                {sourceData.filter(s => s.name !== '未填').slice(0, 6).map((s, i) => (
                  <Bar key={s.name} dataKey={s.name} stackId="a" fill={COLORS[i % COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Conversion quality table */}
      {conversionData.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>轉介質素比較</div>
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>來源</th>
                  <th style={{ textAlign: 'right' }}>病人數</th>
                  <th style={{ textAlign: 'right' }}>回頭率</th>
                  <th style={{ textAlign: 'right' }}>平均消費</th>
                  <th style={{ textAlign: 'right' }}>平均就診</th>
                </tr>
              </thead>
              <tbody>
                {conversionData.map(s => (
                  <tr key={s.name}>
                    <td style={{ fontWeight: 700 }}>{s.name}</td>
                    <td className="money">{s.count}</td>
                    <td className="money" style={{ color: s.returnRate >= 50 ? 'var(--green-700)' : s.returnRate >= 30 ? 'var(--gold-700)' : 'var(--red-600)', fontWeight: 700 }}>
                      {s.returnRate}%
                    </td>
                    <td className="money" style={{ fontWeight: 600 }}>{fmtM(s.avgSpent)}</td>
                    <td className="money">{s.avgVisits} 次</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Source details */}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>各來源明細</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
        {sourceData.map((s, i) => (
          <div key={s.name} style={{ padding: 10, border: '1px solid var(--gray-200)', borderRadius: 8, borderLeft: `4px solid ${COLORS[i % COLORS.length]}` }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{s.name}</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
              <div>{s.count} 位病人</div>
              <div>累計 {fmtM(s.revenue)}</div>
              <div>平均 {fmtM(s.count > 0 ? Math.round(s.revenue / s.count) : 0)}/人</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
