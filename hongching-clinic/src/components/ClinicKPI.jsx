import { useState, useMemo, useEffect } from 'react';
import { fmtM, getMonth } from '../data';
import { getClinicName } from '../tenant';
import { kpiTargetsOps } from '../api';

const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_kpi_targets';

const DEFAULT_TARGETS = {
  monthlyRevenue: 300000,
  newPatients: 50,
  dailyVisits: 25,
  returnRate: 60,
  avgWait: 20,
  attendance: 95,
  inventoryTurnover: 4,
  satisfaction: 85,
};

const KPI_DEFS = [
  { key: 'monthlyRevenue', label: '月營業額目標', unit: '$', weight: 20, format: v => fmtM(v), higherBetter: true },
  { key: 'newPatients', label: '新病人數目標', unit: '人', weight: 15, format: v => `${Math.round(v)} 人`, higherBetter: true },
  { key: 'dailyVisits', label: '日平均看診人次', unit: '人次', weight: 15, format: v => `${v.toFixed(1)} 人次`, higherBetter: true },
  { key: 'returnRate', label: '病人回頭率', unit: '%', weight: 15, format: v => `${v.toFixed(1)}%`, higherBetter: true },
  { key: 'avgWait', label: '平均候診時間', unit: '分鐘', weight: 10, format: v => `${v.toFixed(0)} 分鐘`, higherBetter: false },
  { key: 'attendance', label: '員工出勤率', unit: '%', weight: 10, format: v => `${v.toFixed(1)}%`, higherBetter: true },
  { key: 'inventoryTurnover', label: '藥材週轉率', unit: '次', weight: 5, format: v => `${v.toFixed(1)} 次`, higherBetter: true },
  { key: 'satisfaction', label: '顧客滿意度', unit: '分', weight: 10, format: v => `${v.toFixed(1)} 分`, higherBetter: true },
];

function loadTargets() {
  try { return { ...DEFAULT_TARGETS, ...JSON.parse(localStorage.getItem(LS_KEY)) }; } catch { return { ...DEFAULT_TARGETS }; }
}
function saveTargets(t) { localStorage.setItem(LS_KEY, JSON.stringify(t)); kpiTargetsOps.persist(t); }

function trafficColor(pct) {
  if (pct >= 90) return '#16a34a';
  if (pct >= 70) return '#d97706';
  return '#dc2626';
}
function trafficBg(pct) {
  if (pct >= 90) return '#dcfce7';
  if (pct >= 70) return '#fef9c3';
  return '#fee2e2';
}
function trendArrow(pct) {
  if (pct >= 100) return { symbol: '\u25B2', color: '#16a34a' };
  if (pct >= 90) return { symbol: '\u25B3', color: '#d97706' };
  return { symbol: '\u25BC', color: '#dc2626' };
}

export default function ClinicKPI({ data, showToast, user }) {
  const [targets, setTargets] = useState(loadTargets);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const thisMonth = useMemo(() => new Date().toISOString().substring(0, 7), []);

  useEffect(() => { kpiTargetsOps.load().then(d => { if (d) setTargets(prev => ({ ...prev, ...d })); }); }, []);

  // ── Calculate actuals from data ──
  const actuals = useMemo(() => {
    const revenue = data.revenue || [];
    const patients = data.patients || [];
    const queue = data.queue || [];
    const consultations = data.consultations || [];
    const inventory = data.inventory || [];
    const leaves = data.leaves || [];
    const surveys = data.surveys || [];

    // Monthly revenue
    const monthlyRevenue = revenue.filter(r => getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount || 0), 0);

    // New patients this month
    const newPatients = patients.filter(p => getMonth(p.createdAt || p.firstVisit) === thisMonth).length;

    // Daily average visits (consultations this month / working days elapsed)
    const monthConsults = consultations.filter(c => getMonth(c.date) === thisMonth);
    const daysInMonth = (() => {
      const uniqueDays = new Set(monthConsults.map(c => c.date));
      return Math.max(uniqueDays.size, 1);
    })();
    const dailyVisits = monthConsults.length / daysInMonth;

    // Patient return rate
    const returnRate = (() => {
      const visitCounts = {};
      consultations.forEach(c => {
        const pid = c.patientId || c.patientName || '';
        if (pid) visitCounts[pid] = (visitCounts[pid] || 0) + 1;
      });
      const total = Object.keys(visitCounts).length;
      if (total === 0) return 0;
      const returning = Object.values(visitCounts).filter(v => v > 1).length;
      return (returning / total) * 100;
    })();

    // Average waiting time (from queue records)
    const avgWait = (() => {
      const completed = queue.filter(q => q.status === 'completed' && q.registeredAt && q.startedAt);
      if (!completed.length) return 0;
      const totalMins = completed.reduce((s, q) => {
        const rp = (q.registeredAt || '').split(':').map(Number);
        const sp = (q.startedAt || '').split(':').map(Number);
        if (rp.length >= 2 && sp.length >= 2) {
          return s + ((sp[0] * 60 + sp[1]) - (rp[0] * 60 + rp[1]));
        }
        return s;
      }, 0);
      return Math.max(totalMins / completed.length, 0);
    })();

    // Staff attendance rate
    const attendance = (() => {
      const monthLeaves = leaves.filter(l => getMonth(l.date || l.startDate) === thisMonth && l.status !== 'rejected');
      const staffCount = (() => {
        const names = new Set();
        consultations.forEach(c => { if (c.doctor) names.add(c.doctor); });
        revenue.forEach(r => { if (r.doctor) names.add(r.doctor); });
        return Math.max(names.size, 1);
      })();
      const workDays = 22;
      const totalSlots = staffCount * workDays;
      const leaveDays = monthLeaves.length;
      return totalSlots > 0 ? ((totalSlots - leaveDays) / totalSlots) * 100 : 100;
    })();

    // Inventory turnover (COGS / avg inventory value, simplified)
    const inventoryTurnover = (() => {
      const totalCost = revenue.filter(r => getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.herbCost || 0), 0);
      const invValue = inventory.reduce((s, i) => s + (Number(i.stock || 0) * Number(i.costPerUnit || 0)), 0);
      if (invValue <= 0) return 0;
      return (totalCost * 12) / invValue;
    })();

    // Customer satisfaction
    const satisfaction = (() => {
      const monthSurveys = surveys.filter(s => getMonth(s.date || s.createdAt) === thisMonth && s.rating);
      if (!monthSurveys.length) return 0;
      const avg = monthSurveys.reduce((s, sv) => s + Number(sv.rating || 0), 0) / monthSurveys.length;
      return (avg / 5) * 100;
    })();

    return { monthlyRevenue, newPatients, dailyVisits, returnRate, avgWait, attendance, inventoryTurnover, satisfaction };
  }, [data, thisMonth]);

  // ── Achievement percentages ──
  const kpiResults = useMemo(() => {
    return KPI_DEFS.map(def => {
      const target = targets[def.key] || 1;
      const actual = actuals[def.key] || 0;
      let pct;
      if (def.higherBetter) {
        pct = target > 0 ? (actual / target) * 100 : 0;
      } else {
        pct = target > 0 ? (target / Math.max(actual, 0.1)) * 100 : 0;
      }
      pct = Math.min(pct, 150);
      return { ...def, target, actual, pct };
    });
  }, [targets, actuals]);

  // ── Overall weighted score ──
  const overallScore = useMemo(() => {
    const totalWeight = KPI_DEFS.reduce((s, d) => s + d.weight, 0);
    const weighted = kpiResults.reduce((s, r) => s + Math.min(r.pct, 100) * (r.weight / totalWeight), 0);
    return Math.round(weighted);
  }, [kpiResults]);

  // ── Monthly history (save snapshot) ──
  const saveMonthlySnapshot = () => {
    try {
      const hist = JSON.parse(localStorage.getItem('hcmc_kpi_history') || '{}');
      hist[thisMonth] = { date: thisMonth, score: overallScore, actuals: { ...actuals }, targets: { ...targets } };
      localStorage.setItem('hcmc_kpi_history', JSON.stringify(hist));
      showToast?.(`${thisMonth} KPI快照已儲存`);
    } catch { showToast?.('儲存失敗'); }
  };

  // ── Target editing ──
  const startEdit = () => { setDraft({ ...targets }); setEditing(true); };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    const next = {};
    KPI_DEFS.forEach(d => { next[d.key] = Number(draft[d.key]) || DEFAULT_TARGETS[d.key]; });
    setTargets(next); saveTargets(next); setEditing(false);
    showToast?.('KPI目標已更新');
  };

  // ── Print report ──
  const printReport = () => {
    const clinic = getClinicName();
    const rows = kpiResults.map(r => {
      const arrow = r.pct >= 100 ? '\u25B2' : r.pct >= 90 ? '\u25B3' : '\u25BC';
      const color = trafficColor(Math.min(r.pct, 100));
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${r.label}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${r.format(r.target)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${r.format(r.actual)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:${color};font-weight:700">${Math.min(r.pct, 100).toFixed(1)}% ${arrow}</td>
      </tr>`;
    }).join('');
    const html = `<html><head><title>KPI Report</title></head><body style="font-family:sans-serif;padding:30px;max-width:800px;margin:auto">
      <h1 style="color:${ACCENT};margin-bottom:4px">${clinic}</h1>
      <h2 style="color:#555;margin-top:0">${thisMonth} KPI Report</h2>
      <div style="text-align:center;margin:20px 0;padding:16px;background:${trafficBg(overallScore)};border-radius:12px">
        <div style="font-size:48px;font-weight:900;color:${trafficColor(overallScore)}">${overallScore}</div>
        <div style="color:#555">Overall Score / 100</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="background:#f0fdfa">
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid ${ACCENT}">KPI</th>
          <th style="padding:8px 10px;text-align:right;border-bottom:2px solid ${ACCENT}">Target</th>
          <th style="padding:8px 10px;text-align:right;border-bottom:2px solid ${ACCENT}">Actual</th>
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid ${ACCENT}">Achievement</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#999;font-size:12px;margin-top:24px;text-align:center">Printed: ${new Date().toLocaleString('zh-TW')}</p>
    </body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  // ── History display ──
  const history = useMemo(() => {
    try {
      const hist = JSON.parse(localStorage.getItem('hcmc_kpi_history') || '{}');
      return Object.values(hist).sort((a, b) => a.date.localeCompare(b.date)).slice(-6);
    } catch { return []; }
  }, []);

  // ── Styles ──
  const cardS = { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,.08)', marginBottom: 16 };
  const btnS = { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
  const inputS = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: 120 };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ ...cardS, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, color: ACCENT, fontSize: 20 }}>KPI Dashboard</h2>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>{thisMonth} | {getClinicName()}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(user?.role === 'admin' || user?.role === 'owner') && (
            <button style={{ ...btnS, background: ACCENT, color: '#fff' }} onClick={editing ? saveEdit : startEdit}>
              {editing ? 'Save Targets' : 'Set Targets'}
            </button>
          )}
          {editing && <button style={{ ...btnS, background: '#e5e7eb', color: '#333' }} onClick={cancelEdit}>Cancel</button>}
          <button style={{ ...btnS, background: '#f0fdfa', color: ACCENT, border: `1px solid ${ACCENT}` }} onClick={saveMonthlySnapshot}>Save Snapshot</button>
          <button style={{ ...btnS, background: '#f0fdfa', color: ACCENT, border: `1px solid ${ACCENT}` }} onClick={printReport}>Print Report</button>
        </div>
      </div>

      {/* Overall Score */}
      <div style={{ ...cardS, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>Overall KPI Score</div>
        <div style={{ display: 'inline-block', width: 120, height: 120, borderRadius: '50%', border: `8px solid ${trafficColor(overallScore)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', background: trafficBg(overallScore) }}>
          <span style={{ fontSize: 40, fontWeight: 900, color: trafficColor(overallScore) }}>{overallScore}</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, color: trafficColor(overallScore), fontWeight: 600 }}>
          {overallScore >= 90 ? 'Excellent' : overallScore >= 70 ? 'Good' : 'Needs Improvement'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12, fontSize: 12, color: '#64748b' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#16a34a', marginRight: 4 }}></span>90%+</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#d97706', marginRight: 4 }}></span>70-90%</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#dc2626', marginRight: 4 }}></span>&lt;70%</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {kpiResults.map(r => {
          const capped = Math.min(r.pct, 100);
          const color = trafficColor(capped);
          const bg = trafficBg(capped);
          const trend = trendArrow(capped);
          return (
            <div key={r.key} style={{ ...cardS, borderLeft: `4px solid ${color}`, marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#334155' }}>{r.label}</div>
                <span style={{ color: trend.color, fontSize: 16, fontWeight: 700 }}>{trend.symbol}</span>
              </div>
              {editing ? (
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: '#64748b' }}>Target:</label>
                  <input style={inputS} type="number" value={draft[r.key] ?? ''} onChange={e => setDraft(d => ({ ...d, [r.key]: e.target.value }))} />
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b', marginBottom: 6 }}>
                  <span>Target: {r.format(r.target)}</span>
                  <span>Actual: <b style={{ color }}>{r.format(r.actual)}</b></span>
                </div>
              )}
              {/* Progress bar */}
              <div style={{ background: '#e5e7eb', borderRadius: 6, height: 10, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ width: `${Math.min(capped, 100)}%`, height: '100%', background: color, borderRadius: 6, transition: 'width .4s ease' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#94a3b8' }}>Weight: {r.weight}%</span>
                <span style={{ fontWeight: 700, color, background: bg, padding: '2px 8px', borderRadius: 10, fontSize: 12 }}>{capped.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Monthly History */}
      {history.length > 0 && (
        <div style={{ ...cardS, marginTop: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: ACCENT }}>Monthly Tracking</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f0fdfa' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `2px solid ${ACCENT}` }}>Month</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: `2px solid ${ACCENT}` }}>Score</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: `2px solid ${ACCENT}` }}>Status</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `2px solid ${ACCENT}` }}>Bar</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.date}>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e5e7eb' }}>{h.date}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', fontWeight: 700, color: trafficColor(h.score) }}>{h.score}</td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: trafficColor(h.score) }}></span>
                    </td>
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid #e5e7eb' }}>
                      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 8, width: '100%' }}>
                        <div style={{ width: `${h.score}%`, height: '100%', background: trafficColor(h.score), borderRadius: 4 }}></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Weight breakdown */}
      <div style={{ ...cardS, marginTop: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: ACCENT }}>Weight Breakdown</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {KPI_DEFS.map(d => (
            <span key={d.key} style={{ fontSize: 12, padding: '4px 10px', background: '#f0fdfa', borderRadius: 8, color: ACCENT, fontWeight: 600 }}>
              {d.label}: {d.weight}%
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
