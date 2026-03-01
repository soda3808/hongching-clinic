import React, { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';
import { fmtM } from '../data';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const A = '#0e7490';
const LS_KEY = 'hcmc_daily_targets';
const DAYS = ['日', '一', '二', '三', '四', '五', '六'];
const PAY_METHODS = ['現金', '信用卡', '八達通', '轉數快', '醫療券', '其他'];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 9); // 9-20

function loadTargets() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } }
function saveTargets(t) { localStorage.setItem(LS_KEY, JSON.stringify(t)); }

const card = { background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' };
const badge = (bg, color) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: bg, color });

export default function DailyRevenueTarget({ data, showToast, user }) {
  const today = new Date().toISOString().substring(0, 10);
  const todayDow = new Date().getDay();
  const thisMonth = today.substring(0, 7);
  const revenue = data?.revenue || [];

  const [targets, setTargets] = useState(loadTargets);
  const [editingTargets, setEditingTargets] = useState(false);
  const [draft, setDraft] = useState(() => {
    const t = loadTargets();
    return { weekday: t.weekday || 15000, weekend: t.weekend || 10000 };
  });

  const getTarget = (dow) => (dow === 0 || dow === 6) ? (targets.weekend || 10000) : (targets.weekday || 15000);
  const todayTarget = getTarget(todayDow);

  /* --- today's revenue --- */
  const todayRev = useMemo(() => revenue.filter(r => r.date === today), [revenue, today]);
  const todayTotal = useMemo(() => todayRev.reduce((s, r) => s + Number(r.amount || 0), 0), [todayRev]);
  const pct = todayTarget > 0 ? Math.min((todayTotal / todayTarget) * 100, 150) : 0;
  const rawPct = todayTarget > 0 ? (todayTotal / todayTarget) * 100 : 0;

  /* --- alert level --- */
  const alertLevel = rawPct >= 120 ? 'exceed' : rawPct >= 100 ? 'hit' : rawPct >= 80 ? 'near' : 'low';
  const alertColors = { low: '#94a3b8', near: '#f59e0b', hit: '#22c55e', exceed: '#8b5cf6' };
  const alertLabels = { low: '努力中', near: '即將達標 (80%+)', hit: '已達標!', exceed: '超額完成 (120%+)' };

  /* --- hourly breakdown --- */
  const hourlyData = useMemo(() => {
    const map = {};
    HOURS.forEach(h => { map[h] = 0; });
    todayRev.forEach(r => {
      const ts = r.createdAt || r.date;
      let hour = 10;
      if (ts && ts.length > 10) {
        const d = new Date(ts);
        hour = d.getHours();
      }
      if (hour >= 9 && hour <= 20) map[hour] = (map[hour] || 0) + Number(r.amount || 0);
    });
    return map;
  }, [todayRev]);
  const maxHourly = Math.max(...Object.values(hourlyData), 1);

  /* --- payment method breakdown --- */
  const payBreakdown = useMemo(() => {
    const map = {};
    PAY_METHODS.forEach(m => { map[m] = 0; });
    todayRev.forEach(r => {
      const pm = r.payment || '現金';
      const key = PAY_METHODS.includes(pm) ? pm : '其他';
      map[key] += Number(r.amount || 0);
    });
    return map;
  }, [todayRev]);

  /* --- patient stats --- */
  const patientCount = todayRev.length;
  const avgSpend = patientCount > 0 ? todayTotal / patientCount : 0;

  /* --- streak & weekly calendar --- */
  const { streak, weekDays, monthHitRate } = useMemo(() => {
    const dayMap = {};
    revenue.forEach(r => {
      if (!r.date) return;
      dayMap[r.date] = (dayMap[r.date] || 0) + Number(r.amount || 0);
    });

    // streak: consecutive days hitting target going backwards from yesterday
    let s = 0;
    const d = new Date();
    d.setDate(d.getDate() - 1);
    while (true) {
      const ds = d.toISOString().substring(0, 10);
      const dow = d.getDay();
      const tgt = getTarget(dow);
      if ((dayMap[ds] || 0) >= tgt) { s++; d.setDate(d.getDate() - 1); }
      else break;
      if (s > 365) break;
    }
    // include today if already hit
    if (todayTotal >= todayTarget) s++;

    // this week: Mon-Sun
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const week = [];
    for (let i = 0; i < 7; i++) {
      const wd = new Date(monday);
      wd.setDate(monday.getDate() + i);
      const ds = wd.toISOString().substring(0, 10);
      const dow = wd.getDay();
      const tgt = getTarget(dow);
      const rev = dayMap[ds] || 0;
      const isFuture = ds > today;
      week.push({ date: ds, dow, rev, tgt, hit: rev >= tgt, isFuture, isToday: ds === today });
    }

    // month hit rate
    const monthDays = Object.entries(dayMap).filter(([dt]) => dt.substring(0, 7) === thisMonth && dt <= today);
    const hitCount = monthDays.filter(([dt, total]) => {
      const dow = new Date(dt).getDay();
      return total >= getTarget(dow);
    }).length;
    const totalDays = monthDays.length || 1;

    return { streak: s, weekDays: week, monthHitRate: Math.round((hitCount / totalDays) * 100) };
  }, [revenue, today, targets, todayTotal, todayTarget, thisMonth]);

  /* --- save targets --- */
  const handleSaveTargets = () => {
    const t = { weekday: Number(draft.weekday) || 15000, weekend: Number(draft.weekend) || 10000 };
    setTargets(t);
    saveTargets(t);
    setEditingTargets(false);
    showToast?.('目標已儲存');
  };

  /* --- progress ring SVG --- */
  const ringSize = 160;
  const strokeW = 14;
  const radius = (ringSize - strokeW) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(pct, 100) / 100) * circumference;
  const ringColor = alertColors[alertLevel];

  /* --- print --- */
  const handlePrint = () => {
    const clinic = getClinicName();
    const rows = PAY_METHODS.map(m => `<tr><td style="padding:6px 12px;border:1px solid #ddd">${escapeHtml(m)}</td><td style="padding:6px 12px;border:1px solid #ddd;text-align:right">${fmtM(payBreakdown[m])}</td></tr>`).join('');
    const hourRows = HOURS.map(h => `<tr><td style="padding:4px 8px;border:1px solid #eee">${h}:00</td><td style="padding:4px 8px;border:1px solid #eee;text-align:right">${fmtM(hourlyData[h])}</td></tr>`).join('');
    const html = `<html><head><title>${escapeHtml(clinic)} - 每日營業目標報表</title>
      <style>body{font-family:sans-serif;padding:24px;color:#333}table{border-collapse:collapse;width:100%;margin:12px 0}h2{color:${A}}</style></head><body>
      <h2>${escapeHtml(clinic)} - 每日營業目標報表</h2>
      <p><strong>日期：</strong>${today} (星期${DAYS[todayDow]})</p>
      <p><strong>目標金額：</strong>${fmtM(todayTarget)}</p>
      <p><strong>實際營業額：</strong>${fmtM(todayTotal)} (${rawPct.toFixed(1)}%)</p>
      <p><strong>狀態：</strong>${alertLabels[alertLevel]}</p>
      <p><strong>診症人數：</strong>${patientCount} 人 | <strong>平均消費：</strong>${fmtM(avgSpend)}</p>
      <p><strong>連續達標：</strong>${streak} 日 | <strong>本月達標率：</strong>${monthHitRate}%</p>
      <h3>付款方式明細</h3><table>${rows}<tr style="font-weight:700"><td style="padding:6px 12px;border:1px solid #ddd">合計</td><td style="padding:6px 12px;border:1px solid #ddd;text-align:right">${fmtM(todayTotal)}</td></tr></table>
      <h3>每小時營業額</h3><table>${hourRows}</table>
      <p style="color:#999;font-size:12px;margin-top:24px">列印時間: ${new Date().toLocaleString('zh-HK')}</p></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: A, margin: 0 }}>每日營業目標</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setEditingTargets(!editingTargets)} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${A}`, background: '#fff', color: A, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            {editingTargets ? '取消' : '設定目標'}
          </button>
          <button onClick={handlePrint} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: A, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            列印報表
          </button>
        </div>
      </div>

      {/* --- Target editor --- */}
      {editingTargets && (
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 12 }}>設定每日目標金額</h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 13 }}>
              平日目標 (一至五)
              <input type="number" value={draft.weekday} onChange={e => setDraft(d => ({ ...d, weekday: e.target.value }))} style={{ display: 'block', marginTop: 4, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', width: 150, fontSize: 14 }} />
            </label>
            <label style={{ fontSize: 13 }}>
              週末目標 (六、日)
              <input type="number" value={draft.weekend} onChange={e => setDraft(d => ({ ...d, weekend: e.target.value }))} style={{ display: 'block', marginTop: 4, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', width: 150, fontSize: 14 }} />
            </label>
            <button onClick={handleSaveTargets} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: A, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>儲存</button>
          </div>
        </div>
      )}

      {/* --- Main progress section --- */}
      <div style={{ ...card, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Progress ring */}
        <div style={{ position: 'relative', width: ringSize, height: ringSize, flexShrink: 0 }}>
          <svg width={ringSize} height={ringSize} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeW} />
            <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke={ringColor} strokeWidth={strokeW} strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }} />
          </svg>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: ringColor }}>{rawPct.toFixed(0)}%</span>
            <span style={{ fontSize: 11, color: '#64748b' }}>達成率</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{today} 星期{DAYS[todayDow]}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>{fmtM(todayTotal)}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>目標: {fmtM(todayTarget)} | 尚差: {fmtM(Math.max(todayTarget - todayTotal, 0))}</div>
          <span style={badge(alertColors[alertLevel] + '20', alertColors[alertLevel])}>{alertLabels[alertLevel]}</span>
          <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 22, fontWeight: 800, color: A }}>{patientCount}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>今日診症</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 800, color: '#334155' }}>{fmtM(avgSpend)}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>平均消費</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>{streak}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>連續達標日</div></div>
          </div>
        </div>
      </div>

      {/* --- Weekly calendar --- */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 10 }}>本週達標情況</h3>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
          {weekDays.map(d => (
            <div key={d.date} style={{ textAlign: 'center', flex: 1, padding: '8px 0', borderRadius: 8, background: d.isToday ? A + '10' : 'transparent' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>星期{DAYS[d.dow]}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: d.isToday ? A : '#64748b', marginBottom: 6 }}>{d.date.substring(5)}</div>
              <div style={{
                width: 14, height: 14, borderRadius: '50%', margin: '0 auto',
                background: d.isFuture ? '#e5e7eb' : d.hit ? '#22c55e' : '#ef4444',
                border: d.isToday ? `2px solid ${A}` : 'none',
              }} />
              {!d.isFuture && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{fmtM(d.rev)}</div>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12, color: '#64748b' }}>
          <span>本月達標率: <strong style={{ color: monthHitRate >= 70 ? '#22c55e' : '#f59e0b' }}>{monthHitRate}%</strong></span>
          <span style={{ display: 'flex', gap: 12 }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', marginRight: 4 }}></span>達標</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', marginRight: 4 }}></span>未達標</span>
          </span>
        </div>
      </div>

      {/* --- Hourly breakdown --- */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 10 }}>每小時營業額</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
          {HOURS.map(h => {
            const val = hourlyData[h] || 0;
            const barH = maxHourly > 0 ? Math.max((val / maxHourly) * 100, val > 0 ? 4 : 0) : 0;
            const now = new Date().getHours();
            return (
              <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {val > 0 && <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2, whiteSpace: 'nowrap' }}>{fmtM(val)}</div>}
                <div style={{
                  width: '100%', maxWidth: 36, borderRadius: '4px 4px 0 0',
                  height: barH, background: h === now ? A : A + '80',
                  transition: 'height 0.5s ease',
                }} />
                <div style={{ fontSize: 10, color: h === now ? A : '#94a3b8', marginTop: 4, fontWeight: h === now ? 700 : 400 }}>{h}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- Payment method breakdown --- */}
      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 10 }}>付款方式明細</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {PAY_METHODS.map(m => {
            const val = payBreakdown[m] || 0;
            const pctPay = todayTotal > 0 ? ((val / todayTotal) * 100).toFixed(0) : 0;
            return (
              <div key={m} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{m}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{fmtM(val)}</div>
                <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: '#e5e7eb', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, background: A, width: `${pctPay}%`, transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{pctPay}%</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#334155' }}>合計: {fmtM(todayTotal)}</div>
      </div>
    </div>
  );
}
