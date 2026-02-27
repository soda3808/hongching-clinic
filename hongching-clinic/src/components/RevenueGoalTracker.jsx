import { useState, useMemo } from 'react';
import { fmtM, getMonth, getDoctors, getStoreNames } from '../data';

const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_revenue_goals';
const SERVICE_CATS = ['診金', '藥費', '治療費', '商品'];
const MILESTONES = [25, 50, 75, 100];

function loadGoals() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function saveGoals(g) { localStorage.setItem(LS_KEY, JSON.stringify(g)); }
function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function dayOfMonth(ym) {
  const today = new Date().toISOString().substring(0, 7);
  if (ym !== today) return daysInMonth(ym);
  return new Date().getDate();
}

const card = { background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' };
const badge = (color) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700, color: '#fff', background: color });

export default function RevenueGoalTracker({ data, showToast, user }) {
  const DOCTORS = getDoctors();
  const STORES = getStoreNames();
  const now = new Date().toISOString().substring(0, 7);

  const [goals, setGoals] = useState(loadGoals);
  const [selMonth, setSelMonth] = useState(now);
  const [editTarget, setEditTarget] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [notified, setNotified] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('hcmc_goal_notified')) || {}; } catch { return {}; }
  });

  const months = useMemo(() => {
    const m = new Set();
    (data.revenue || []).forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    m.add(now);
    return [...m].sort().reverse();
  }, [data.revenue, now]);

  const target = goals[selMonth] || 0;

  const monthRevenue = useMemo(() =>
    (data.revenue || []).filter(r => getMonth(r.date) === selMonth),
  [data.revenue, selMonth]);

  const actual = monthRevenue.reduce((s, r) => s + Number(r.amount || 0), 0);
  const pct = target > 0 ? Math.min((actual / target) * 100, 150) : 0;
  const displayPct = target > 0 ? (actual / target) * 100 : 0;
  const elapsed = dayOfMonth(selMonth);
  const totalDays = daysInMonth(selMonth);
  const remaining = totalDays - elapsed;
  const dailyPace = remaining > 0 && target > actual ? (target - actual) / remaining : 0;
  const avgDaily = elapsed > 0 ? actual / elapsed : 0;
  const projected = avgDaily * totalDays;

  // milestone alerts
  useMemo(() => {
    if (!target || !showToast) return;
    const key = selMonth;
    const already = notified[key] || [];
    const newMilestones = MILESTONES.filter(m => displayPct >= m && !already.includes(m));
    if (newMilestones.length > 0) {
      const highest = Math.max(...newMilestones);
      if (highest === 100) showToast(`恭喜！${selMonth} 營業目標已達成！`);
      else showToast(`${selMonth} 營業目標已達 ${highest}%！`);
      const updated = { ...notified, [key]: [...already, ...newMilestones] };
      setNotified(updated);
      sessionStorage.setItem('hcmc_goal_notified', JSON.stringify(updated));
    }
  }, [displayPct, target, selMonth]);

  // breakdown by service
  const byService = useMemo(() => {
    const map = {};
    SERVICE_CATS.forEach(c => { map[c] = 0; });
    map['其他'] = 0;
    monthRevenue.forEach(r => {
      const item = (r.item || '').trim();
      const matched = SERVICE_CATS.find(c => item.includes(c));
      if (matched) map[matched] += Number(r.amount || 0);
      else map['其他'] += Number(r.amount || 0);
    });
    return Object.entries(map).filter(([, v]) => v > 0);
  }, [monthRevenue]);

  // by doctor
  const byDoctor = useMemo(() => {
    const map = {};
    DOCTORS.forEach(d => { map[d] = 0; });
    monthRevenue.forEach(r => {
      const doc = r.doctor || '未指定';
      map[doc] = (map[doc] || 0) + Number(r.amount || 0);
    });
    return Object.entries(map).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [monthRevenue, DOCTORS]);

  // by store
  const byStore = useMemo(() => {
    const map = {};
    STORES.forEach(s => { map[s] = 0; });
    monthRevenue.forEach(r => {
      const st = r.store || '未指定';
      map[st] = (map[st] || 0) + Number(r.amount || 0);
    });
    return Object.entries(map).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [monthRevenue, STORES]);

  // historical
  const history = useMemo(() =>
    months.map(m => {
      const t = goals[m] || 0;
      const a = (data.revenue || []).filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount || 0), 0);
      return { month: m, target: t, actual: a, pct: t > 0 ? (a / t * 100) : 0 };
    }).filter(h => h.target > 0),
  [months, goals, data.revenue]);

  const handleSave = () => {
    const val = Number(editTarget);
    if (!val || val <= 0) return;
    const updated = { ...goals, [selMonth]: val };
    setGoals(updated);
    saveGoals(updated);
    setEditTarget('');
    showToast?.(`${selMonth} 目標已設為 ${fmtM(val)}`);
  };

  const ringSize = 160;
  const stroke = 14;
  const radius = (ringSize - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;

  const barW = (v, max) => max > 0 ? `${Math.min((v / max) * 100, 100)}%` : '0%';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: ACCENT, marginBottom: 16 }}>營業目標追蹤</h2>

      {/* month selector + goal setting */}
      <div style={card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <select value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="number" placeholder="設定目標金額" value={editTarget} onChange={e => setEditTarget(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db', width: 160, fontSize: 14 }}
            onKeyDown={e => e.key === 'Enter' && handleSave()} />
          <button onClick={handleSave} style={{ padding: '6px 16px', borderRadius: 8, background: ACCENT, color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            設定目標
          </button>
          {target > 0 && <span style={{ fontSize: 13, color: '#6b7280' }}>目前目標：{fmtM(target)}</span>}
        </div>

        {/* progress ring */}
        {target > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: ringSize, height: ringSize }}>
              <svg width={ringSize} height={ringSize}>
                <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
                <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke={displayPct >= 100 ? '#16a34a' : ACCENT}
                  strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
                  transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: displayPct >= 100 ? '#16a34a' : ACCENT }}>{displayPct.toFixed(1)}%</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>達成率</span>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 14 }}>
                <div><span style={{ color: '#6b7280' }}>實際營收</span><div style={{ fontWeight: 700, fontSize: 18, color: ACCENT }}>{fmtM(actual)}</div></div>
                <div><span style={{ color: '#6b7280' }}>目標金額</span><div style={{ fontWeight: 700, fontSize: 18 }}>{fmtM(target)}</div></div>
                <div><span style={{ color: '#6b7280' }}>剩餘差額</span><div style={{ fontWeight: 700, color: actual >= target ? '#16a34a' : '#dc2626' }}>{fmtM(Math.max(target - actual, 0))}</div></div>
                <div><span style={{ color: '#6b7280' }}>預計達成</span><div style={{ fontWeight: 700, color: projected >= target ? '#16a34a' : '#d97706' }}>{fmtM(projected)}</div></div>
              </div>
              {/* milestones */}
              <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                {MILESTONES.map(m => (
                  <span key={m} style={badge(displayPct >= m ? '#16a34a' : '#d1d5db')}>{m}%</span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>請先設定本月營業目標</div>
        )}
      </div>

      {/* daily pace */}
      {target > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#374151' }}>每日營收節奏</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div style={{ background: '#f0fdfa', borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6b7280' }}>已過天數</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT }}>{elapsed} / {totalDays}</div>
            </div>
            <div style={{ background: '#f0fdfa', borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6b7280' }}>日均營收</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT }}>{fmtM(avgDaily)}</div>
            </div>
            <div style={{ background: remaining > 0 ? '#fffbeb' : '#f0fdf4', borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6b7280' }}>達標日均需</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: dailyPace > avgDaily ? '#dc2626' : '#16a34a' }}>{fmtM(dailyPace)}</div>
            </div>
            <div style={{ background: projected >= target ? '#f0fdf4' : '#fef2f2', borderRadius: 8, padding: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6b7280' }}>預計 vs 目標</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: projected >= target ? '#16a34a' : '#dc2626' }}>{projected >= target ? '可達標' : '需加速'}</div>
            </div>
          </div>
        </div>
      )}

      {/* breakdown by service */}
      {target > 0 && byService.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#374151' }}>服務類型分佈</h3>
          {byService.map(([cat, val]) => (
            <div key={cat} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                <span>{cat}</span><span style={{ fontWeight: 700 }}>{fmtM(val)} ({target > 0 ? (val / target * 100).toFixed(1) : 0}%)</span>
              </div>
              <div style={{ height: 10, background: '#e5e7eb', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: barW(val, target), background: ACCENT, borderRadius: 5, transition: 'width 0.4s' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* doctor contribution */}
      {target > 0 && byDoctor.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#374151' }}>醫師貢獻</h3>
          {byDoctor.map(([doc, val]) => {
            const docPct = target > 0 ? (val / target * 100) : 0;
            return (
              <div key={doc} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                  <span>{doc}</span><span style={{ fontWeight: 700 }}>{fmtM(val)} ({docPct.toFixed(1)}%)</span>
                </div>
                <div style={{ height: 10, background: '#e5e7eb', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: barW(val, target), background: '#8B6914', borderRadius: 5, transition: 'width 0.4s' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* store comparison */}
      {target > 0 && byStore.length > 1 && (
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#374151' }}>分店進度</h3>
          {byStore.map(([store, val]) => {
            const storePct = target > 0 ? (val / target * 100) : 0;
            return (
              <div key={store} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                  <span>{store}</span><span style={{ fontWeight: 700 }}>{fmtM(val)} ({storePct.toFixed(1)}%)</span>
                </div>
                <div style={{ height: 10, background: '#e5e7eb', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: barW(val, target), background: '#6d28d9', borderRadius: 5, transition: 'width 0.4s' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* historical goals */}
      {history.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: 0 }}>歷史目標記錄</h3>
            <button onClick={() => setShowHistory(!showHistory)}
              style={{ fontSize: 12, background: 'none', border: `1px solid ${ACCENT}`, color: ACCENT, borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
              {showHistory ? '收起' : '展開'}
            </button>
          </div>
          {showHistory && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: 6 }}>月份</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>目標</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>實際</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>達成率</th>
                  <th style={{ textAlign: 'center', padding: 6 }}>狀態</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.month} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 6 }}>{h.month}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{fmtM(h.target)}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{fmtM(h.actual)}</td>
                    <td style={{ padding: 6, textAlign: 'right', fontWeight: 700, color: h.pct >= 100 ? '#16a34a' : h.pct >= 75 ? '#d97706' : '#dc2626' }}>
                      {h.pct.toFixed(1)}%
                    </td>
                    <td style={{ padding: 6, textAlign: 'center' }}>
                      <span style={badge(h.pct >= 100 ? '#16a34a' : h.pct >= 75 ? '#d97706' : '#dc2626')}>
                        {h.pct >= 100 ? '達標' : h.pct >= 75 ? '接近' : '未達'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
