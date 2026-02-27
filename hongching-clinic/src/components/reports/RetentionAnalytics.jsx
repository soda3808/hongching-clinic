import { useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fmtM, getMonth, monthLabel } from '../../data';

export default function RetentionAnalytics({ data }) {
  const patients = data.patients || [];
  const consultations = data.consultations || [];
  const revenue = data.revenue || [];
  const today = new Date().toISOString().substring(0, 10);

  // ── Churn risk scoring ──
  const patientRisk = useMemo(() => {
    return patients.map(p => {
      const visits = consultations.filter(c => c.patientId === p.id || c.patientName === p.name);
      const revRecords = revenue.filter(r => r.name === p.name);
      const lastVisit = visits.length > 0 ? visits.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]?.date : p.lastVisit;
      const daysSinceVisit = lastVisit ? Math.ceil((new Date(today) - new Date(lastVisit)) / (1000 * 60 * 60 * 24)) : 999;
      const totalSpent = revRecords.reduce((s, r) => s + Number(r.amount), 0) || Number(p.totalSpent) || 0;
      const visitCount = visits.length || Number(p.totalVisits) || 0;

      // Visit frequency (avg days between visits)
      const visitDates = visits.map(v => v.date).filter(Boolean).sort();
      let avgFrequency = 0;
      if (visitDates.length >= 2) {
        const gaps = [];
        for (let i = 1; i < visitDates.length; i++) {
          gaps.push(Math.ceil((new Date(visitDates[i]) - new Date(visitDates[i - 1])) / (1000 * 60 * 60 * 24)));
        }
        avgFrequency = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
      }

      // Risk score (0-100, higher = more at risk)
      let riskScore = 0;
      if (daysSinceVisit > 180) riskScore += 40;
      else if (daysSinceVisit > 90) riskScore += 25;
      else if (daysSinceVisit > 60) riskScore += 15;
      else if (daysSinceVisit > 30) riskScore += 5;

      if (visitCount <= 1) riskScore += 20;
      else if (visitCount <= 3) riskScore += 10;

      if (avgFrequency > 0 && daysSinceVisit > avgFrequency * 2) riskScore += 20;
      else if (avgFrequency > 0 && daysSinceVisit > avgFrequency * 1.5) riskScore += 10;

      if (totalSpent < 500) riskScore += 10;

      const riskLevel = riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low';

      return {
        ...p, lastVisit, daysSinceVisit, totalSpent, visitCount, avgFrequency,
        riskScore: Math.min(100, riskScore), riskLevel,
        ltv: totalSpent,
      };
    }).sort((a, b) => b.riskScore - a.riskScore);
  }, [patients, consultations, revenue, today]);

  // ── Segmentation ──
  const segments = useMemo(() => {
    const active = patientRisk.filter(p => p.daysSinceVisit <= 30);
    const warm = patientRisk.filter(p => p.daysSinceVisit > 30 && p.daysSinceVisit <= 90);
    const cooling = patientRisk.filter(p => p.daysSinceVisit > 90 && p.daysSinceVisit <= 180);
    const churned = patientRisk.filter(p => p.daysSinceVisit > 180);
    return [
      { name: '活躍 (30天內)', count: active.length, color: '#16a34a', avgLTV: active.length > 0 ? active.reduce((s, p) => s + p.ltv, 0) / active.length : 0 },
      { name: '溫和 (30-90天)', count: warm.length, color: '#0e7490', avgLTV: warm.length > 0 ? warm.reduce((s, p) => s + p.ltv, 0) / warm.length : 0 },
      { name: '冷卻 (90-180天)', count: cooling.length, color: '#d97706', avgLTV: cooling.length > 0 ? cooling.reduce((s, p) => s + p.ltv, 0) / cooling.length : 0 },
      { name: '流失 (180天+)', count: churned.length, color: '#dc2626', avgLTV: churned.length > 0 ? churned.reduce((s, p) => s + p.ltv, 0) / churned.length : 0 },
    ];
  }, [patientRisk]);

  // ── Cohort analysis (by first visit month) ──
  const cohortData = useMemo(() => {
    const cohorts = {};
    patientRisk.forEach(p => {
      const firstMonth = getMonth(p.firstVisit || p.createdAt);
      if (!firstMonth) return;
      if (!cohorts[firstMonth]) cohorts[firstMonth] = { month: firstMonth, total: 0, retained: 0, churned: 0 };
      cohorts[firstMonth].total += 1;
      if (p.daysSinceVisit <= 90) cohorts[firstMonth].retained += 1;
      else cohorts[firstMonth].churned += 1;
    });
    return Object.values(cohorts)
      .map(c => ({ ...c, label: monthLabel(c.month), retentionRate: c.total > 0 ? ((c.retained / c.total) * 100).toFixed(0) : 0 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [patientRisk]);

  // ── Visit frequency distribution ──
  const freqDist = useMemo(() => {
    const buckets = { '1次': 0, '2-3次': 0, '4-6次': 0, '7-12次': 0, '12次+': 0 };
    patientRisk.forEach(p => {
      if (p.visitCount <= 1) buckets['1次'] += 1;
      else if (p.visitCount <= 3) buckets['2-3次'] += 1;
      else if (p.visitCount <= 6) buckets['4-6次'] += 1;
      else if (p.visitCount <= 12) buckets['7-12次'] += 1;
      else buckets['12次+'] += 1;
    });
    return Object.entries(buckets).map(([name, count]) => ({ name, 人數: count }));
  }, [patientRisk]);

  // ── LTV distribution ──
  const ltvDist = useMemo(() => {
    const buckets = { '<$1K': 0, '$1-5K': 0, '$5-10K': 0, '$10-20K': 0, '$20K+': 0 };
    patientRisk.forEach(p => {
      if (p.ltv < 1000) buckets['<$1K'] += 1;
      else if (p.ltv < 5000) buckets['$1-5K'] += 1;
      else if (p.ltv < 10000) buckets['$5-10K'] += 1;
      else if (p.ltv < 20000) buckets['$10-20K'] += 1;
      else buckets['$20K+'] += 1;
    });
    return Object.entries(buckets).map(([name, count]) => ({ name, 人數: count }));
  }, [patientRisk]);

  const retentionRate = patients.length > 0
    ? ((patientRisk.filter(p => p.daysSinceVisit <= 90).length / patients.length) * 100).toFixed(0)
    : 0;
  const avgLTV = patients.length > 0
    ? patientRisk.reduce((s, p) => s + p.ltv, 0) / patients.length
    : 0;

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>📊 病人留存與流失分析</h3>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'var(--teal-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>總病人數</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{patients.length}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--green-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--green-600)', fontWeight: 600 }}>90天留存率</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-700)' }}>{retentionRate}%</div>
        </div>
        <div style={{ padding: 12, background: 'var(--gold-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>平均LTV</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-700)' }}>{fmtM(avgLTV)}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--red-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>高風險流失</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red-600)' }}>{patientRisk.filter(p => p.riskLevel === 'high').length}</div>
        </div>
      </div>

      {/* Segment Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {segments.map(s => (
          <div key={s.name} style={{ padding: 10, border: `2px solid ${s.color}20`, borderLeft: `4px solid ${s.color}`, borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.name}</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{s.count} <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>人</span></div>
            <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>平均LTV: {fmtM(s.avgLTV)}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>就診頻率分佈</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={freqDist}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="人數" fill="#0e7490" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>LTV 分佈</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={ltvDist}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="人數" fill="#DAA520" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Cohort Retention */}
      {cohortData.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>按首次就診月份 — 留存率</div>
          <div style={{ width: '100%', height: 250, marginBottom: 16 }}>
            <ResponsiveContainer>
              <BarChart data={cohortData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="retained" name="留存" fill="#16a34a" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="churned" name="流失" fill="#dc2626" stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* At-Risk Patient List */}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>高風險流失病人（Top 20）</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>風險</th><th>病人</th><th>電話</th><th style={{ textAlign: 'right' }}>就診次數</th><th style={{ textAlign: 'right' }}>累計消費</th><th style={{ textAlign: 'right' }}>距上次</th><th style={{ textAlign: 'right' }}>平均間隔</th></tr></thead>
          <tbody>
            {patientRisk.filter(p => p.riskLevel !== 'low').slice(0, 20).map(p => (
              <tr key={p.id} style={{ background: p.riskLevel === 'high' ? '#fef2f2' : '' }}>
                <td>
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                    background: p.riskLevel === 'high' ? '#dc262618' : '#d9770618',
                    color: p.riskLevel === 'high' ? '#dc2626' : '#d97706',
                  }}>{p.riskScore}分</span>
                </td>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td>{p.phone || '-'}</td>
                <td className="money">{p.visitCount}</td>
                <td className="money">{fmtM(p.totalSpent)}</td>
                <td className="money" style={{ color: p.daysSinceVisit > 90 ? 'var(--red-600)' : '' }}>{p.daysSinceVisit >= 999 ? '-' : `${p.daysSinceVisit} 天`}</td>
                <td className="money">{p.avgFrequency > 0 ? `${p.avgFrequency} 天` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {patients.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無病人數據</div>
      )}
    </div>
  );
}
