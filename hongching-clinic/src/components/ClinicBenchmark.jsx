import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { fmtM } from '../data';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_benchmark_targets';

/* ── Hong Kong TCM Clinic Industry Benchmarks ── */
const BENCHMARKS = {
  revenue: [
    { id: 'monthlyRev',   cat: '營業指標', label: '月營業額',       unit: '$', bench: 300000, good: 400000, great: 550000 },
    { id: 'dailyAvgRev',  cat: '營業指標', label: '每日平均收入',   unit: '$', bench: 12000,  good: 16000,  great: 22000 },
    { id: 'avgSpend',     cat: '營業指標', label: '每位病人平均消費', unit: '$', bench: 380,    good: 500,    great: 650 },
  ],
  efficiency: [
    { id: 'waitTime',     cat: '效率指標', label: '平均候診時間',   unit: '分鐘', bench: 25,  good: 18,  great: 12,  lower: true },
    { id: 'dailyCases',   cat: '效率指標', label: '每位醫師日診量', unit: '人',   bench: 18,  good: 24,  great: 30 },
    { id: 'dispenseTime', cat: '效率指標', label: '藥房出藥時間',   unit: '分鐘', bench: 15,  good: 10,  great: 6,   lower: true },
  ],
  patient: [
    { id: 'newPatients',  cat: '病人指標', label: '月新病人數',   unit: '人', bench: 40,  good: 60,  great: 90 },
    { id: 'returnRate',   cat: '病人指標', label: '複診率',       unit: '%', bench: 55,  good: 65,  great: 78 },
    { id: 'satisfaction',  cat: '病人指標', label: '滿意度評分',   unit: '/5', bench: 3.8, good: 4.2, great: 4.6 },
    { id: 'churnRate',    cat: '病人指標', label: '流失率',       unit: '%', bench: 25,  good: 18,  great: 10,  lower: true },
  ],
  financial: [
    { id: 'grossMargin',  cat: '財務指標', label: '毛利率',     unit: '%', bench: 50,  good: 60,  great: 72 },
    { id: 'laborRatio',   cat: '財務指標', label: '人工成本比', unit: '%', bench: 35,  good: 28,  great: 22,  lower: true },
    { id: 'herbRatio',    cat: '財務指標', label: '藥材成本比', unit: '%', bench: 25,  good: 20,  great: 15,  lower: true },
  ],
};
const ALL_METRICS = Object.values(BENCHMARKS).flat();

function grade(val, m) {
  if (val == null) return { letter: '-', color: '#999' };
  const { bench, good, great, lower } = m;
  if (lower) {
    if (val <= great) return { letter: 'A', color: '#15803d' };
    if (val <= good)  return { letter: 'B', color: '#65a30d' };
    if (val <= bench) return { letter: 'C', color: '#ca8a04' };
    if (val <= bench * 1.3) return { letter: 'D', color: '#ea580c' };
    return { letter: 'F', color: '#dc2626' };
  }
  if (val >= great) return { letter: 'A', color: '#15803d' };
  if (val >= good)  return { letter: 'B', color: '#65a30d' };
  if (val >= bench) return { letter: 'C', color: '#ca8a04' };
  if (val >= bench * 0.7) return { letter: 'D', color: '#ea580c' };
  return { letter: 'F', color: '#dc2626' };
}

function pct(val, m) {
  if (val == null) return 0;
  const { bench, great, lower } = m;
  if (lower) {
    if (val <= 0) return 100;
    const ratio = 1 - (val - great) / (bench * 1.5 - great);
    return Math.max(0, Math.min(100, ratio * 100));
  }
  return Math.max(0, Math.min(100, (val / great) * 100));
}

function trafficLight(g) {
  const map = { A: '#15803d', B: '#65a30d', C: '#ca8a04', D: '#ea580c', F: '#dc2626' };
  return map[g] || '#999';
}

function getMonth(d) { return d ? String(d).substring(0, 7) : ''; }

export default function ClinicBenchmark({ data, showToast, user }) {
  const [tab, setTab] = useState('overview');
  const clinicName = useMemo(() => getClinicName(), []);
  const revenue = data?.revenue || [];
  const expenses = data?.expenses || [];
  const patients = data?.patients || [];
  const consultations = data?.consultations || [];
  const queue = data?.queue || [];

  const now = new Date();
  const thisMonth = now.toISOString().substring(0, 7);
  const last3 = useMemo(() => {
    const ms = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      ms.push(d.toISOString().substring(0, 7));
    }
    return ms;
  }, []);

  /* ── Compute actual KPI values ── */
  const actuals = useMemo(() => {
    const mRev = revenue.filter(r => getMonth(r.date) === thisMonth);
    const monthlyRev = mRev.reduce((s, r) => s + Number(r.amount || 0), 0);
    const mExp = expenses.filter(r => getMonth(r.date) === thisMonth);
    const monthlyExp = mExp.reduce((s, r) => s + Number(r.amount || 0), 0);
    const mConsult = consultations.filter(c => getMonth(c.date) === thisMonth);
    const dayOfMonth = now.getDate() || 1;
    const dailyAvgRev = dayOfMonth > 0 ? monthlyRev / dayOfMonth : 0;
    const patientVisits = mConsult.length || mRev.length;
    const avgSpend = patientVisits > 0 ? monthlyRev / patientVisits : 0;
    const newP = patients.filter(p => getMonth(p.createdAt || p.firstVisit) === thisMonth).length;
    const totalP = patients.length;
    const returningP = mConsult.filter(c => {
      const p = patients.find(pt => pt.id === c.patientId);
      return p && getMonth(p.createdAt || p.firstVisit) !== thisMonth;
    }).length;
    const returnRate = patientVisits > 0 ? (returningP / patientVisits) * 100 : 0;
    const laborExp = mExp.filter(e => ['人工', 'MPF', '勞保'].includes(e.category)).reduce((s, r) => s + Number(r.amount || 0), 0);
    const herbExp = mExp.filter(e => ['藥材/耗材'].includes(e.category)).reduce((s, r) => s + Number(r.amount || 0), 0);
    const grossMargin = monthlyRev > 0 ? ((monthlyRev - monthlyExp) / monthlyRev) * 100 : 0;
    const laborRatio = monthlyRev > 0 ? (laborExp / monthlyRev) * 100 : 0;
    const herbRatio = monthlyRev > 0 ? (herbExp / monthlyRev) * 100 : 0;
    const waitTimes = queue.filter(q => q.calledAt && q.arrivedAt).map(q => (new Date(q.calledAt) - new Date(q.arrivedAt)) / 60000);
    const avgWait = waitTimes.length ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : null;
    const doctorSet = new Set(mConsult.map(c => c.doctor).filter(Boolean));
    const numDoctors = doctorSet.size || 1;
    const dailyCases = dayOfMonth > 0 ? (mConsult.length / dayOfMonth) / numDoctors : 0;
    const dispenseTimes = queue.filter(q => q.dispensedAt && q.calledAt).map(q => (new Date(q.dispensedAt) - new Date(q.calledAt)) / 60000);
    const avgDispense = dispenseTimes.length ? dispenseTimes.reduce((a, b) => a + b, 0) / dispenseTimes.length : null;
    const activeP = patients.filter(p => {
      const lastVisit = consultations.filter(c => c.patientId === p.id).sort((a, b) => b.date?.localeCompare(a.date))[0];
      return lastVisit && getMonth(lastVisit.date) >= last3[2];
    }).length;
    const churnRate = totalP > 0 ? ((totalP - activeP) / totalP) * 100 : 0;

    return {
      monthlyRev, dailyAvgRev, avgSpend, waitTime: avgWait, dailyCases,
      dispenseTime: avgDispense, newPatients: newP, returnRate,
      satisfaction: null, churnRate, grossMargin, laborRatio, herbRatio,
    };
  }, [revenue, expenses, patients, consultations, queue, thisMonth, last3]);

  /* ── Last 3 months averages (for trend) ── */
  const prev3Avg = useMemo(() => {
    const revByM = {};
    last3.forEach(m => { revByM[m] = revenue.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount || 0), 0); });
    const avgMRev = last3.reduce((s, m) => s + (revByM[m] || 0), 0) / 3;
    return { monthlyRev: avgMRev };
  }, [revenue, last3]);

  /* ── Overall Health Score ── */
  const healthScore = useMemo(() => {
    let total = 0, count = 0;
    ALL_METRICS.forEach(m => {
      const val = actuals[m.id];
      if (val == null) return;
      const p = pct(val, m);
      total += p;
      count++;
    });
    return count > 0 ? Math.round(total / count) : 0;
  }, [actuals]);

  const healthColor = healthScore >= 80 ? '#15803d' : healthScore >= 60 ? '#ca8a04' : healthScore >= 40 ? '#ea580c' : '#dc2626';

  /* ── Gauge Component (CSS) ── */
  const Gauge = ({ value, max, label, color }) => {
    const deg = Math.min((value / max) * 180, 180);
    return (
      <div style={{ textAlign: 'center', margin: '0 8px' }}>
        <div style={{ width: 90, height: 50, position: 'relative', overflow: 'hidden', margin: '0 auto' }}>
          <div style={{ width: 90, height: 90, borderRadius: '50%', border: '8px solid #e5e7eb', borderBottomColor: 'transparent', borderRightColor: 'transparent', transform: 'rotate(225deg)', position: 'absolute', top: 0, left: 0, boxSizing: 'border-box' }} />
          <div style={{ width: 90, height: 90, borderRadius: '50%', border: `8px solid ${color}`, borderBottomColor: 'transparent', borderRightColor: 'transparent', transform: `rotate(${225 + deg}deg)`, position: 'absolute', top: 0, left: 0, boxSizing: 'border-box', transition: 'transform 0.6s ease' }} />
          <div style={{ position: 'absolute', bottom: 0, width: '100%', textAlign: 'center', fontWeight: 800, fontSize: 16, color }}>{value}</div>
        </div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{label}</div>
      </div>
    );
  };

  /* ── Print Report ── */
  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) return showToast?.('無法開啟列印視窗');
    const rows = ALL_METRICS.map(m => {
      const val = actuals[m.id];
      const g = grade(val, m);
      const display = val != null ? (m.unit === '$' ? fmtM(val) : `${Math.round(val * 10) / 10}${m.unit}`) : 'N/A';
      const benchDisplay = m.unit === '$' ? fmtM(m.bench) : `${m.bench}${m.unit}`;
      return `<tr><td>${m.cat}</td><td>${m.label}</td><td style="text-align:right">${display}</td><td style="text-align:right">${benchDisplay}</td><td style="text-align:center;color:${g.color};font-weight:700">${g.letter}</td></tr>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>${clinicName} 基準報告</title>
      <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:8px 12px;font-size:13px}th{background:#f0fdfa;color:${ACCENT};text-align:left}.header{color:${ACCENT};margin-bottom:4px}@media print{body{padding:0}}</style>
      </head><body><h2 class="header">${clinicName} - 診所基準分析報告</h2>
      <p style="color:#666;font-size:13px">報告月份: ${thisMonth} | 整體評分: ${healthScore}/100</p>
      <table><thead><tr><th>類別</th><th>指標</th><th style="text-align:right">實際值</th><th style="text-align:right">行業基準</th><th style="text-align:center">等級</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="margin-top:24px;font-size:11px;color:#999">列印時間: ${new Date().toLocaleString('zh-HK')}</p>
      </body></html>`);
    w.document.close();
    w.print();
  };

  const cats = ['revenue', 'efficiency', 'patient', 'financial'];
  const catLabels = { revenue: '營業指標', efficiency: '效率指標', patient: '病人指標', financial: '財務指標' };

  const s = {
    wrap: { fontFamily: 'system-ui, sans-serif' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    title: { fontSize: 18, fontWeight: 800, color: ACCENT, margin: 0 },
    tabs: { display: 'flex', gap: 4 },
    tab: (a) => ({ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: a ? ACCENT : '#f1f5f9', color: a ? '#fff' : '#475569' }),
    btn: { padding: '6px 14px', borderRadius: 6, border: `1px solid ${ACCENT}`, background: '#fff', color: ACCENT, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    card: { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)', marginBottom: 14 },
    scoreCircle: { width: 120, height: 120, borderRadius: '50%', border: `6px solid ${healthColor}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 },
    metricRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' },
    progressBg: { flex: 1, height: 8, background: '#e5e7eb', borderRadius: 4, margin: '0 10px', overflow: 'hidden' },
    gradeBox: (c) => ({ width: 28, height: 28, borderRadius: 6, background: c, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }),
    light: (c) => ({ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block', marginRight: 6, flexShrink: 0 }),
  };

  const renderMetric = (m) => {
    const val = actuals[m.id];
    const g = grade(val, m);
    const p = pct(val, m);
    const display = val != null ? (m.unit === '$' ? fmtM(val) : `${Math.round(val * 10) / 10}${m.unit}`) : 'N/A';
    const benchDisplay = m.unit === '$' ? fmtM(m.bench) : `${m.bench}${m.unit}`;
    const trend = m.id === 'monthlyRev' && prev3Avg.monthlyRev > 0
      ? ((actuals.monthlyRev - prev3Avg.monthlyRev) / prev3Avg.monthlyRev * 100)
      : null;
    return (
      <div key={m.id} style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={s.light(trafficLight(g.letter))} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{m.label}</span>
          </div>
          <div style={s.gradeBox(g.color)}>{g.letter}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: g.color }}>{display}</span>
          {trend != null && (
            <span style={{ fontSize: 12, color: trend >= 0 ? '#15803d' : '#dc2626', fontWeight: 600 }}>
              {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
            </span>
          )}
        </div>
        <div style={s.progressBg}>
          <div style={{ width: `${p}%`, height: '100%', background: g.color, borderRadius: 4, transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
          <span>行業基準: {benchDisplay}</span>
          <span>{m.lower ? '越低越好' : '越高越好'}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.title}>診所基準分析</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={s.tabs}>
            <button style={s.tab(tab === 'overview')} onClick={() => setTab('overview')}>總覽</button>
            {cats.map(c => (
              <button key={c} style={s.tab(tab === c)} onClick={() => setTab(c)}>{catLabels[c]}</button>
            ))}
          </div>
          <button style={s.btn} onClick={printReport}>列印報告</button>
        </div>
      </div>

      {tab === 'overview' && (
        <>
          {/* Health Score */}
          <div style={{ ...s.card, textAlign: 'center' }}>
            <div style={s.scoreCircle}>
              <span style={{ fontSize: 32, fontWeight: 900, color: healthColor }}>{healthScore}</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>/ 100</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
              {clinicName} 整體健康評分
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              根據{ALL_METRICS.length}項指標與香港中醫診所行業基準比較
            </div>
          </div>
          {/* Gauges */}
          <div style={{ ...s.card, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 12 }}>
            {[
              { val: healthScore, max: 100, label: '整體', color: healthColor },
              { val: Math.round(pct(actuals.monthlyRev, ALL_METRICS.find(m => m.id === 'monthlyRev'))), max: 100, label: '營業', color: ACCENT },
              { val: Math.round(pct(actuals.returnRate, ALL_METRICS.find(m => m.id === 'returnRate'))), max: 100, label: '病人', color: '#8B6914' },
              { val: Math.round(pct(actuals.grossMargin, ALL_METRICS.find(m => m.id === 'grossMargin'))), max: 100, label: '財務', color: '#6d28d9' },
            ].map(g => <Gauge key={g.label} {...g} />)}
          </div>
          {/* All metrics summary table */}
          <div style={s.card}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: ACCENT, marginBottom: 10 }}>指標一覽</h3>
            {ALL_METRICS.map(m => {
              const val = actuals[m.id];
              const g = grade(val, m);
              const display = val != null ? (m.unit === '$' ? fmtM(val) : `${Math.round(val * 10) / 10}${m.unit}`) : 'N/A';
              return (
                <div key={m.id} style={s.metricRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 140 }}>
                    <span style={s.light(trafficLight(g.letter))} />
                    <span style={{ fontSize: 13, color: '#334155' }}>{m.label}</span>
                  </div>
                  <div style={s.progressBg}>
                    <div style={{ width: `${pct(val, m)}%`, height: '100%', background: g.color, borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: g.color, minWidth: 70, textAlign: 'right' }}>{display}</span>
                  <div style={{ ...s.gradeBox(g.color), marginLeft: 8 }}>{g.letter}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {cats.includes(tab) && (
        <div style={s.grid}>
          {BENCHMARKS[tab].map(m => renderMetric(m))}
        </div>
      )}
    </div>
  );
}
