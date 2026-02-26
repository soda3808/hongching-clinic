import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { fmtM, fmt, getMonth, monthLabel } from '../data';
import { getTenantDoctors } from '../tenant';

const COLOR_PALETTE = ['#0e7490', '#8B6914', '#7C3AED', '#dc2626', '#16a34a', '#0284c7', '#d97706', '#991b1b'];
function getDoctorColors() {
  const doctors = getTenantDoctors();
  const map = {};
  doctors.forEach((doc, i) => { map[doc] = COLOR_PALETTE[i % COLOR_PALETTE.length]; });
  return map;
}
function getDefaultTargets() {
  const doctors = getTenantDoctors();
  const map = {};
  const defaultAmounts = [200000, 150000, 120000];
  doctors.forEach((doc, i) => { map[doc] = defaultAmounts[i] || 100000; });
  return map;
}
const COMMISSION_TIERS = [
  { threshold: 1.2, rate: 0.15, label: '超額 120%+' },
  { threshold: 1.0, rate: 0.10, label: '達標 100%+' },
  { threshold: 0.8, rate: 0.05, label: '達 80%+' },
  { threshold: 0, rate: 0, label: '未達 80%' },
];

export default function DoctorAnalytics({ data, user }) {
  const isDoctor = user?.role === 'doctor';
  const allDoctors = getTenantDoctors();
  const visibleDoctors = isDoctor ? [user.name] : allDoctors;
  const COLORS = getDoctorColors();
  const DEFAULT_TARGETS = getDefaultTargets();

  // ── Performance Targets (#61) ──
  const [targets, setTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_doc_targets') || 'null') || DEFAULT_TARGETS; } catch { return DEFAULT_TARGETS; }
  });
  const [editingTargets, setEditingTargets] = useState(false);
  const [tempTargets, setTempTargets] = useState({ ...targets });

  const saveTargets = () => {
    setTargets({ ...tempTargets });
    localStorage.setItem('hcmc_doc_targets', JSON.stringify(tempTargets));
    setEditingTargets(false);
  };
  const months = useMemo(() => {
    const m = new Set();
    data.revenue.forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    return [...m].sort();
  }, [data.revenue]);

  const thisMonth = new Date().toISOString().substring(0, 7);

  // Per-doctor stats
  const docStats = useMemo(() => {
    return visibleDoctors.map(doc => {
      const recs = data.revenue.filter(r => r.doctor === doc);
      const thisRecs = recs.filter(r => getMonth(r.date) === thisMonth);
      const totalRev = recs.reduce((s, r) => s + Number(r.amount), 0);
      const thisRev = thisRecs.reduce((s, r) => s + Number(r.amount), 0);
      const patientCount = thisRecs.filter(r => !r.name.includes('匯總')).length;
      const avgPerPatient = patientCount ? thisRev / patientCount : 0;

      // Monthly breakdown
      const monthly = months.map(m => ({
        month: monthLabel(m).split(' ')[0],
        revenue: recs.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0),
        patients: recs.filter(r => getMonth(r.date) === m && !r.name.includes('匯總')).length,
      }));

      return { name: doc, totalRev, thisRev, patientCount, avgPerPatient, monthly, color: COLORS[doc] || '#666' };
    });
  }, [data.revenue, months, thisMonth]);

  // Stacked chart data
  const stackData = months.map(m => {
    const row = { month: monthLabel(m).split(' ')[0] };
    visibleDoctors.forEach(doc => {
      row[doc] = data.revenue.filter(r => r.doctor === doc && getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0);
    });
    return row;
  });

  return (
    <>
      {/* Doctor KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDoctors.length}, 1fr)`, gap: 16, marginBottom: 20 }}>
        {docStats.map(d => (
          <div key={d.name} className="card" style={{ borderTop: `4px solid ${d.color}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>{d.name}</div>
            <div className="grid-2" style={{ gap: 8 }}>
              <div>
                <div className="stat-label">累計營業額</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: d.color }}>{fmtM(d.totalRev)}</div>
              </div>
              <div>
                <div className="stat-label">本月營業額</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: d.color }}>{fmtM(d.thisRev)}</div>
              </div>
              <div>
                <div className="stat-label">本月診症人次</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{d.patientCount}</div>
              </div>
              <div>
                <div className="stat-label">平均單價</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{fmtM(d.avgPerPatient)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stacked Chart */}
      <div className="card">
        <div className="card-header"><h3>📊 各醫師每月營業額對比</h3></div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stackData}>
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
            <Tooltip formatter={v => fmtM(v)} />
            <Legend />
            {visibleDoctors.map(doc => (
              <Bar key={doc} dataKey={doc} stackId="a" fill={COLORS[doc] || '#999'} radius={doc === visibleDoctors[visibleDoctors.length-1] ? [4,4,0,0] : [0,0,0,0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Performance Targets & Commission (#61) */}
      {!isDoctor && (
        <div className="card">
          <div className="card-header">
            <h3>🎯 業績目標 & 佣金計算（本月）</h3>
            {!editingTargets ? (
              <button className="btn btn-outline btn-sm" onClick={() => { setTempTargets({ ...targets }); setEditingTargets(true); }}>設定目標</button>
            ) : (
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-teal btn-sm" onClick={saveTargets}>儲存</button>
                <button className="btn btn-outline btn-sm" onClick={() => setEditingTargets(false)}>取消</button>
              </div>
            )}
          </div>
          {editingTargets && (
            <div style={{ padding: '12px 16px', background: 'var(--gray-50)', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              {visibleDoctors.map(d => (
                <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{d}:</span>
                  <input type="number" value={tempTargets[d] || ''} onChange={e => setTempTargets({ ...tempTargets, [d]: Number(e.target.value) })} style={{ width: 100, fontSize: 12, padding: '4px 8px' }} />
                </div>
              ))}
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>醫師</th><th style={{ textAlign: 'right' }}>本月目標</th><th style={{ textAlign: 'right' }}>本月實績</th><th style={{ textAlign: 'right' }}>達成率</th><th>進度</th><th style={{ textAlign: 'right' }}>佣金比率</th><th style={{ textAlign: 'right' }}>佣金金額</th></tr>
              </thead>
              <tbody>
                {docStats.map(d => {
                  const target = targets[d.name] || 0;
                  const achievement = target > 0 ? d.thisRev / target : 0;
                  const tier = COMMISSION_TIERS.find(t => achievement >= t.threshold) || COMMISSION_TIERS[COMMISSION_TIERS.length - 1];
                  const commission = d.thisRev * tier.rate;
                  const pct = Math.min(achievement * 100, 150);
                  return (
                    <tr key={d.name}>
                      <td style={{ fontWeight: 700, color: d.color }}>{d.name}</td>
                      <td className="money">{fmtM(target)}</td>
                      <td className="money" style={{ color: d.color }}>{fmtM(d.thisRev)}</td>
                      <td className="money" style={{ fontWeight: 700, color: achievement >= 1 ? '#16a34a' : achievement >= 0.8 ? '#d97706' : '#dc2626' }}>{(achievement * 100).toFixed(1)}%</td>
                      <td style={{ minWidth: 120 }}>
                        <div style={{ background: 'var(--gray-200)', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: achievement >= 1 ? '#16a34a' : achievement >= 0.8 ? '#d97706' : '#dc2626', borderRadius: 6, transition: 'width 0.5s' }} />
                        </div>
                      </td>
                      <td className="money">{(tier.rate * 100).toFixed(0)}% <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>({tier.label})</span></td>
                      <td className="money" style={{ fontWeight: 700, color: commission > 0 ? '#16a34a' : 'var(--gray-400)' }}>{fmtM(commission)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--gray-400)' }}>
            佣金級別：≥120% → 15% | ≥100% → 10% | ≥80% → 5% | &lt;80% → 0%
          </div>
        </div>
      )}

      {/* Detail Tables */}
      {docStats.map(d => (
        <div key={d.name} className="card">
          <div className="card-header">
            <h3 style={{ color: d.color }}>📋 {d.name} — 月度明細</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>月份</th><th style={{ textAlign: 'right' }}>營業額</th><th style={{ textAlign: 'right' }}>診症人次</th><th style={{ textAlign: 'right' }}>平均單價</th></tr>
              </thead>
              <tbody>
                {d.monthly.filter(m => m.revenue > 0).map((m, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{m.month}</td>
                    <td className="money" style={{ color: d.color }}>{fmtM(m.revenue)}</td>
                    <td className="money">{m.patients}</td>
                    <td className="money">{m.patients ? fmtM(m.revenue / m.patients) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
