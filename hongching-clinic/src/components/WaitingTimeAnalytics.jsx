import { useState, useMemo } from 'react';
import { getDoctors } from '../data';

const ACCENT = '#0e7490';
const HOURS = ['08','09','10','11','12','13','14','15','16','17','18','19','20'];
const DAYS = ['一','二','三','四','五','六','日'];

function parseT(t) { if (!t) return null; const p = t.split(':'); return p.length >= 2 ? { h: +p[0], m: +p[1] } : null; }
function diff(a, b) { const x = parseT(a), y = parseT(b); if (!x || !y) return null; const d = (y.h*60+y.m)-(x.h*60+x.m); return d > 0 && d < 480 ? d : null; }
function avg(a) { return a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0; }

const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,.06)' };
const kpiBox = bg => ({ padding: 12, background: bg, borderRadius: 8, textAlign: 'center', flex: 1, minWidth: 100 });
const bw = { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12 };
const empty = <div style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>暫無資料</div>;

export default function WaitingTimeAnalytics({ data, showToast, user }) {
  const queue = data.queue || [], surveys = data.surveys || [];
  const doctors = getDoctors();
  const today = new Date().toISOString().substring(0, 10);
  const [tab, setTab] = useState('today');

  // 1. Today's queue
  const todayQueue = useMemo(() => queue.filter(q => q.date === today).sort((a, b) => (a.registeredAt || '').localeCompare(b.registeredAt || '')), [queue, today]);
  const currentWaiting = useMemo(() => todayQueue.filter(q => q.status === 'waiting').map(q => {
    const r = parseT(q.registeredAt); if (!r) return { ...q, estWait: null };
    const now = new Date(); return { ...q, estWait: Math.max(0, (now.getHours()*60+now.getMinutes()) - (r.h*60+r.m)) };
  }), [todayQueue]);

  // 2. Wait stats
  const waitStats = useMemo(() => {
    const w = queue.filter(q => q.status === 'completed' && q.registeredAt && q.arrivedAt).map(q => diff(q.registeredAt, q.arrivedAt)).filter(Boolean);
    if (!w.length) return { avg: 0, median: 0, max: 0, min: 0, total: 0, under30: 0 };
    const s = [...w].sort((a, b) => a - b);
    return { avg: avg(w), median: s[Math.floor(s.length/2)], max: Math.max(...w), min: Math.min(...w), total: w.length, under30: Math.round(w.filter(t => t <= 30).length / w.length * 100) };
  }, [queue]);

  // 3. By doctor
  const byDoctor = useMemo(() => {
    const m = {};
    queue.filter(q => q.doctor && q.status === 'completed').forEach(q => {
      if (!m[q.doctor]) m[q.doctor] = { name: q.doctor, waits: [], consults: [] };
      const w = diff(q.registeredAt, q.arrivedAt); if (w) m[q.doctor].waits.push(w);
      const c = diff(q.arrivedAt, q.dispensingAt || q.billingAt || q.completedAt); if (c) m[q.doctor].consults.push(c);
    });
    return Object.values(m).map(d => ({ name: d.name, avgWait: avg(d.waits), avgConsult: avg(d.consults), count: d.waits.length })).sort((a, b) => a.avgWait - b.avgWait);
  }, [queue]);
  const maxDW = Math.max(1, ...byDoctor.map(d => d.avgWait));

  // 4. Heatmap
  const heatmap = useMemo(() => {
    const grid = {}; DAYS.forEach((_, di) => HOURS.forEach(h => { grid[`${di}-${h}`] = []; }));
    queue.filter(q => q.date && q.registeredAt && q.arrivedAt && q.status === 'completed').forEach(q => {
      const d = new Date(q.date).getDay(), di = d === 0 ? 6 : d - 1, h = q.registeredAt.substring(0, 2);
      const w = diff(q.registeredAt, q.arrivedAt);
      if (w && grid[`${di}-${h}`]) grid[`${di}-${h}`].push(w);
    });
    let mx = 1; const cells = {};
    DAYS.forEach((_, di) => HOURS.forEach(h => { const v = grid[`${di}-${h}`].length ? avg(grid[`${di}-${h}`]) : 0; cells[`${di}-${h}`] = v; if (v > mx) mx = v; }));
    return { cells, mx };
  }, [queue]);
  const hc = v => { if (!v) return '#f8fafb'; const r = v / heatmap.mx; return r < 0.33 ? '#d1fae5' : r < 0.66 ? '#fde68a' : '#fca5a5'; };

  // 5. Weekly trend
  const trend = useMemo(() => {
    const bw = {};
    queue.filter(q => q.status === 'completed' && q.date && q.registeredAt && q.arrivedAt).forEach(q => {
      const d = new Date(q.date), ws = new Date(d); ws.setDate(d.getDate() - d.getDay());
      const k = ws.toISOString().substring(0, 10); if (!bw[k]) bw[k] = [];
      const w = diff(q.registeredAt, q.arrivedAt); if (w) bw[k].push(w);
    });
    return Object.entries(bw).sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([k, a]) => ({ wk: k.substring(5), avg: avg(a), n: a.length }));
  }, [queue]);
  const maxT = Math.max(1, ...trend.map(w => w.avg));

  // 6. Service time
  const svcTime = useMemo(() => {
    const m = {};
    queue.filter(q => q.doctor && q.status === 'completed' && q.arrivedAt).forEach(q => {
      if (!m[q.doctor]) m[q.doctor] = [];
      const c = diff(q.arrivedAt, q.dispensingAt || q.billingAt || q.completedAt); if (c) m[q.doctor].push(c);
    });
    return Object.entries(m).map(([n, a]) => ({ name: n, avg: avg(a), n: a.length })).sort((a, b) => a.avg - b.avg);
  }, [queue]);
  const maxS = Math.max(1, ...svcTime.map(d => d.avg));

  // 7. Satisfaction correlation
  const sat = useMemo(() => {
    const bk = { '0-15': { l: '0-15分鐘', r: [] }, '16-30': { l: '16-30分鐘', r: [] }, '31-60': { l: '31-60分鐘', r: [] }, '60+': { l: '60分鐘以上', r: [] } };
    surveys.forEach(s => {
      if (!s.date || !s.ratings?.q1) return;
      const qi = queue.find(q => q.date === s.date && q.doctor === s.doctor && q.status === 'completed');
      if (!qi) return; const w = diff(qi.registeredAt, qi.arrivedAt); if (!w) return;
      const k = w <= 15 ? '0-15' : w <= 30 ? '16-30' : w <= 60 ? '31-60' : '60+';
      bk[k].r.push(s.ratings.q1);
    });
    return Object.values(bk).map(b => ({ label: b.l, avg: b.r.length ? (b.r.reduce((s, v) => s + v, 0) / b.r.length).toFixed(1) : null, n: b.r.length }));
  }, [queue, surveys]);

  // 8. Recommendations
  const tips = useMemo(() => {
    const t = [];
    if (waitStats.avg > 45) t.push('平均等候時間超過45分鐘，建議增加診症時段或增聘醫師。');
    if (waitStats.avg > 30) t.push('建議引入分時段預約制度，減少集中候診情況。');
    const pk = HOURS.filter(h => { const c = DAYS.map((_, di) => heatmap.cells[`${di}-${h}`] || 0); return avg(c) > waitStats.avg * 0.8; });
    if (pk.length) t.push(`高峰時段為 ${pk.map(h => h+':00').join('、')}，建議加開此時段診療名額。`);
    const slow = byDoctor.filter(d => d.avgWait > waitStats.avg * 1.3);
    if (slow.length) t.push(`${slow.map(d => d.name).join('、')} 的候診時間偏長，可檢視其排程是否合理。`);
    if (waitStats.under30 < 60) t.push('30分鐘內完成率偏低，建議優化登記及分診流程。');
    if (!t.length) t.push('目前候診時間控制良好，請持續監察。');
    return t;
  }, [waitStats, heatmap, byDoctor]);

  const tabs = [{ k: 'today', l: '即時候診' }, { k: 'doctor', l: '醫師分析' }, { k: 'heatmap', l: '時段熱力圖' }, { k: 'trend', l: '趨勢' }, { k: 'service', l: '診症時間' }, { k: 'satisfaction', l: '滿意度' }];

  return (
    <div>
      <h3 style={{ fontSize: 17, fontWeight: 800, color: ACCENT, marginBottom: 12 }}>候診時間分析</h3>
      {/* KPI */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={kpiBox('#ecfeff')}><div style={{ fontSize: 10, color: ACCENT, fontWeight: 600 }}>平均等候</div><div style={{ fontSize: 22, fontWeight: 800, color: ACCENT }}>{waitStats.avg}<span style={{ fontSize: 11 }}> 分鐘</span></div></div>
        <div style={kpiBox('#f0fdf4')}><div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>中位數</div><div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>{waitStats.median}<span style={{ fontSize: 11 }}> 分鐘</span></div></div>
        <div style={kpiBox('#fefce8')}><div style={{ fontSize: 10, color: '#a16207', fontWeight: 600 }}>30分鐘內</div><div style={{ fontSize: 22, fontWeight: 800, color: '#a16207' }}>{waitStats.under30}%</div></div>
        <div style={kpiBox('#fef2f2')}><div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>最長等候</div><div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{waitStats.max}<span style={{ fontSize: 11 }}> 分鐘</span></div></div>
      </div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {tabs.map(t => <button key={t.k} onClick={() => setTab(t.k)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: tab === t.k ? ACCENT : '#f1f5f9', color: tab === t.k ? '#fff' : '#475569' }}>{t.l}</button>)}
      </div>

      {/* Today */}
      {tab === 'today' && <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: ACCENT }}>即時候診狀態 ({today})</div>
        {!currentWaiting.length && <div style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>目前無人候診</div>}
        {currentWaiting.map((q, i) => (
          <div key={q.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{q.patientName || q.name || '未知'}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>掛號 {q.registeredAt} · {q.doctor}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: q.estWait > 30 ? '#dc2626' : q.estWait > 15 ? '#d97706' : '#16a34a' }}>{q.estWait ?? '-'} 分鐘</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>已等候</div>
            </div>
          </div>))}
        <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>今日掛號 {todayQueue.length} 人 · 等候中 {currentWaiting.length} 人 · 已完成 {todayQueue.filter(q => q.status === 'completed').length} 人</div>
      </div>}

      {/* Doctor wait */}
      {tab === 'doctor' && <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: ACCENT }}>各醫師平均候診時間</div>
        {!byDoctor.length && empty}
        {byDoctor.map(d => <div key={d.name} style={bw}>
          <div style={{ width: 70, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
          <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 18 }}>
            <div style={{ width: `${Math.min(d.avgWait / maxDW * 100, 100)}%`, height: '100%', borderRadius: 4, background: d.avgWait > 45 ? '#dc2626' : d.avgWait > 30 ? '#d97706' : ACCENT }} />
          </div>
          <div style={{ width: 60, textAlign: 'right', fontWeight: 700, color: d.avgWait > 45 ? '#dc2626' : '#334155' }}>{d.avgWait} 分</div>
        </div>)}
      </div>}

      {/* Heatmap */}
      {tab === 'heatmap' && <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: ACCENT }}>候診時間熱力圖（平均分鐘）</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
            <thead><tr><th style={{ padding: 4 }} />{HOURS.map(h => <th key={h} style={{ padding: '4px 6px', fontWeight: 600 }}>{h}:00</th>)}</tr></thead>
            <tbody>{DAYS.map((day, di) => <tr key={di}>
              <td style={{ padding: 4, fontWeight: 600 }}>星期{day}</td>
              {HOURS.map(h => { const v = heatmap.cells[`${di}-${h}`] || 0; return <td key={h} style={{ padding: 4, textAlign: 'center', background: hc(v), borderRadius: 3, fontWeight: v ? 600 : 400, color: v > heatmap.mx * 0.66 ? '#991b1b' : '#334155' }}>{v || '-'}</td>; })}
            </tr>)}</tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 10, color: '#64748b' }}>
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#d1fae5', borderRadius: 2, verticalAlign: 'middle' }} /> 短</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#fde68a', borderRadius: 2, verticalAlign: 'middle' }} /> 中</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#fca5a5', borderRadius: 2, verticalAlign: 'middle' }} /> 長</span>
        </div>
      </div>}

      {/* Trend */}
      {tab === 'trend' && <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: ACCENT }}>每週平均候診時間趨勢</div>
        {!trend.length && empty}
        {trend.map(w => <div key={w.wk} style={bw}>
          <div style={{ width: 50, fontSize: 11, color: '#64748b' }}>{w.wk}</div>
          <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 16 }}>
            <div style={{ width: `${Math.min(w.avg / maxT * 100, 100)}%`, height: '100%', borderRadius: 4, background: ACCENT, transition: 'width .3s' }} />
          </div>
          <div style={{ width: 70, textAlign: 'right', fontSize: 11 }}><strong>{w.avg}</strong> 分 ({w.n}人)</div>
        </div>)}
      </div>}

      {/* Service time */}
      {tab === 'service' && <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: ACCENT }}>各醫師平均診症時間</div>
        {!svcTime.length && empty}
        {svcTime.map(d => <div key={d.name} style={bw}>
          <div style={{ width: 70, fontWeight: 600 }}>{d.name}</div>
          <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 18 }}>
            <div style={{ width: `${Math.min(d.avg / maxS * 100, 100)}%`, height: '100%', borderRadius: 4, background: '#8b5cf6' }} />
          </div>
          <div style={{ width: 80, textAlign: 'right', fontSize: 11 }}><strong>{d.avg}</strong> 分 ({d.n}診)</div>
        </div>)}
      </div>}

      {/* Satisfaction */}
      {tab === 'satisfaction' && <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: ACCENT }}>候診時間 vs 滿意度</div>
        {sat.every(b => !b.n) && <div style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>暫無滿意度調查資料</div>}
        {sat.filter(b => b.n > 0).map(b => <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 80, fontSize: 12, fontWeight: 600 }}>{b.label}</div>
          <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 20, position: 'relative' }}>
            <div style={{ width: `${(b.avg / 5) * 100}%`, height: '100%', borderRadius: 4, background: b.avg >= 4 ? '#16a34a' : b.avg >= 3 ? '#d97706' : '#dc2626' }} />
            <span style={{ position: 'absolute', right: 6, top: 2, fontSize: 11, fontWeight: 700 }}>{b.avg}/5</span>
          </div>
          <div style={{ width: 50, fontSize: 10, color: '#94a3b8' }}>{b.n} 份</div>
        </div>)}
      </div>}

      {/* Recommendations */}
      <div style={{ ...card, background: '#fffbeb', border: '1px solid #fde68a' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#92400e' }}>改善建議</div>
        {tips.map((tip, i) => <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, fontSize: 12, color: '#78350f' }}>
          <span style={{ fontWeight: 700 }}>{i + 1}.</span><span>{tip}</span>
        </div>)}
      </div>
    </div>
  );
}
