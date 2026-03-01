import { useState, useMemo } from 'react';
import { getDoctors, getStoreNames, getDefaultStore } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_attendance';
const LATE_H = 9, LATE_M = 30, END_H = 18;
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const save = (r) => localStorage.setItem(LS_KEY, JSON.stringify(r));
const dateStr = (d) => d.toISOString().split('T')[0];
const timeStr = (d) => d.toTimeString().substring(0, 5);
const pad = (n) => String(n).padStart(2, '0');

function getStatus(ci, co) {
  if (!ci) return { label: '缺勤', color: '#dc2626' };
  const [h, m] = ci.split(':').map(Number);
  const late = h > LATE_H || (h === LATE_H && m > LATE_M);
  if (co) {
    const [oh, om] = co.split(':').map(Number);
    const early = oh < END_H || (oh === END_H && om === 0);
    if (late && early) return { label: '遲到/早退', color: '#dc2626' };
    if (late) return { label: '遲到', color: '#f59e0b' };
    if (early) return { label: '早退', color: '#f59e0b' };
  } else if (late) return { label: '遲到', color: '#f59e0b' };
  return { label: '正常', color: '#16a34a' };
}
function calcHrs(ci, co) {
  if (!ci || !co) return '-';
  const d = (co.split(':').reduce((a, b, i) => a + b * (i ? 1 : 60), 0)) - (ci.split(':').reduce((a, b, i) => a + b * (i ? 1 : 60), 0));
  return d > 0 ? (d / 60).toFixed(1) : '-';
}

const S = {
  page: { padding: 16, maxWidth: 960, margin: '0 auto' },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#0e7490' },
  tabs: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  tab: (a) => ({ padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: a ? '#0e7490' : '#e5e7eb', color: a ? '#fff' : '#333' }),
  card: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0002', padding: 16, marginBottom: 16 },
  clockBtn: (on) => ({ width: '100%', padding: '18px 0', borderRadius: 10, border: 'none', fontSize: 18, fontWeight: 700, cursor: 'pointer', color: '#fff', background: on ? '#dc2626' : '#0e7490', marginBottom: 6 }),
  badge: (c) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#fff', background: c }),
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 6px', borderBottom: '2px solid #e5e7eb', color: '#0e7490', fontWeight: 600 },
  td: { padding: '7px 6px', borderBottom: '1px solid #f3f4f6' },
  row: { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' },
  sel: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 },
  inp: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, flex: 1, minWidth: 100 },
  btn: { padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#0e7490', color: '#fff' },
  stat: { textAlign: 'center', flex: 1, minWidth: 100, padding: 12, borderRadius: 8, background: '#f0fdfa' },
  calG: { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, fontSize: 12, textAlign: 'center' },
  calC: (bg) => ({ padding: '6px 2px', borderRadius: 4, background: bg || '#f9fafb', minHeight: 28 }),
  modal: { position: 'fixed', inset: 0, background: '#0008', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  mBox: { background: '#fff', borderRadius: 12, padding: 20, width: 340, maxWidth: '90vw' },
};

const TH = (cols) => <thead><tr>{cols.map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>;
const AttRow = ({ r, showDate }) => {
  const s = getStatus(r.clockIn, r.clockOut);
  return (<tr>
    {showDate && <td style={S.td}>{r.date}</td>}
    <td style={S.td}>{r.staff}</td><td style={S.td}>{r.store}</td>
    <td style={S.td}>{r.clockIn || '-'}</td><td style={S.td}>{r.clockOut || '-'}</td>
    <td style={S.td}>{calcHrs(r.clockIn, r.clockOut)}</td>
    <td style={S.td}><span style={S.badge(s.color)}>{s.label}</span></td>
  </tr>);
};

export default function StaffAttendance({ data, showToast, user }) {
  const [records, setRecords] = useState(load);
  const [tab, setTab] = useState('today');
  const [fStaff, setFStaff] = useState('');
  const [fStore, setFStore] = useState('');
  const [fMonth, setFMonth] = useState(() => new Date().toISOString().substring(0, 7));
  const [showAdj, setShowAdj] = useState(false);
  const [adj, setAdj] = useState({ staff: '', store: '', date: dateStr(new Date()), clockIn: '09:00', clockOut: '18:00' });

  const STORES = getStoreNames();
  const STAFF = useMemo(() => {
    const all = [...getDoctors(), ...(data?.employees || []).map(e => e.name).filter(Boolean)];
    return [...new Set(all)];
  }, [data]);

  const today = dateStr(new Date());
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const me = user?.name || user?.username || 'Staff';
  const myToday = records.find(r => r.staff === me && r.date === today);
  const clockedIn = !!myToday?.clockIn && !myToday?.clockOut;
  const persist = (next) => { setRecords(next); save(next); };

  const handleClock = () => {
    const now = new Date(); let next = [...records];
    if (!myToday) {
      next.push({ staff: me, store: getDefaultStore(), date: today, clockIn: timeStr(now), clockOut: '' });
    } else if (clockedIn) {
      next = next.map(r => r.staff === me && r.date === today ? { ...r, clockOut: timeStr(now) } : r);
    } else { showToast?.('今天已完成打卡'); return; }
    persist(next); showToast?.(clockedIn ? '已簽退' : '已打卡');
  };

  const todayRecs = useMemo(() => {
    const present = records.filter(r => r.date === today);
    const missing = STAFF.filter(s => !present.find(r => r.staff === s));
    return [...present, ...missing.map(s => ({ staff: s, store: '-', date: today, clockIn: '', clockOut: '' }))];
  }, [records, today, STAFF]);

  const filtered = useMemo(() => records.filter(r =>
    (!fStaff || r.staff === fStaff) && (!fStore || r.store === fStore) && (!fMonth || r.date.startsWith(fMonth))
  ), [records, fStaff, fStore, fMonth]);

  const stats = useMemo(() => {
    let late = 0, early = 0, absent = 0, present = 0;
    filtered.forEach(r => {
      const s = getStatus(r.clockIn, r.clockOut);
      if (s.label === '缺勤') absent++; else { present++; if (s.label.includes('遲到')) late++; if (s.label.includes('早退')) early++; }
    });
    const total = filtered.length || 1;
    return { present, late, early, absent, rate: ((present / total) * 100).toFixed(1) };
  }, [filtered]);

  const calCells = useMemo(() => {
    if (!fMonth) return [];
    const [y, m] = fMonth.split('-').map(Number);
    const cells = Array.from({ length: new Date(y, m - 1, 1).getDay() }, () => null);
    for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
      const ds = `${fMonth}-${pad(d)}`;
      const rec = records.find(r => r.date === ds && (!fStaff || r.staff === fStaff));
      let icon = '', bg = '#f9fafb';
      if (rec) { const st = getStatus(rec.clockIn, rec.clockOut); if (st.label === '正常') { icon = '\u2705'; bg = '#dcfce7'; } else if (st.label.includes('遲到') || st.label.includes('早退')) { icon = '\u26A0\uFE0F'; bg = '#fef9c3'; } else { icon = '\u274C'; bg = '#fef2f2'; } }
      if ((data?.leaves || []).some(l => l.startDate <= ds && l.endDate >= ds && l.status === 'approved' && (!fStaff || l.userName === fStaff))) { icon = '\uD83C\uDFD6\uFE0F'; bg = '#ede9fe'; }
      cells.push({ d, icon, bg });
    }
    return cells;
  }, [fMonth, fStaff, records, data]);

  const handleAdj = () => {
    if (!adj.staff || !adj.date) return;
    let next = records.filter(r => !(r.staff === adj.staff && r.date === adj.date));
    next.push({ staff: adj.staff, store: adj.store || getDefaultStore(), date: adj.date, clockIn: adj.clockIn, clockOut: adj.clockOut });
    persist(next); setShowAdj(false); showToast?.('已更新考勤記錄');
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    const rows = filtered.map(r => { const s = getStatus(r.clockIn, r.clockOut); return `<tr><td>${r.date}</td><td>${escapeHtml(r.staff)}</td><td>${escapeHtml(r.store)}</td><td>${r.clockIn || '-'}</td><td>${r.clockOut || '-'}</td><td>${calcHrs(r.clockIn, r.clockOut)}</td><td>${escapeHtml(s.label)}</td></tr>`; }).join('');
    w.document.write(`<html><head><title>考勤報表</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px;font-size:13px}th{background:#0e7490;color:#fff}h2{color:#0e7490}</style></head><body><h2>${escapeHtml(getClinicName())} - 員工考勤報表 (${fMonth})</h2><p>出勤率: ${stats.rate}% | 遲到: ${stats.late} | 早退: ${stats.early} | 缺勤: ${stats.absent}</p><table><tr><th>日期</th><th>員工</th><th>店舖</th><th>打卡</th><th>簽退</th><th>時數</th><th>狀態</th></tr>${rows}</table><script>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  };

  return (
    <div style={S.page}>
      <div style={S.title}>{getClinicName()} - 員工考勤</div>
      {/* Clock In/Out */}
      <div style={S.card}>
        <div style={{ textAlign: 'center', marginBottom: 6, fontSize: 14, color: '#666' }}>
          {me} - {myToday?.clockIn ? (clockedIn ? `已打卡 ${myToday.clockIn}` : `${myToday.clockIn} ~ ${myToday.clockOut}`) : '未打卡'}
        </div>
        <button style={S.clockBtn(clockedIn)} onClick={handleClock}>
          {clockedIn ? '簽退 Clock Out' : myToday?.clockOut ? '今日已完成' : '打卡 Clock In'}
        </button>
      </div>
      {/* Tabs */}
      <div style={S.tabs}>
        {['today', 'monthly', 'stats'].map(t => <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>{{ today: '今日考勤', monthly: '月曆總覽', stats: '統計報表' }[t]}</button>)}
        {isAdmin && <button style={S.tab(false)} onClick={() => { setAdj({ staff: STAFF[0] || '', store: STORES[0] || '', date: today, clockIn: '09:00', clockOut: '18:00' }); setShowAdj(true); }}>手動調整</button>}
      </div>
      {/* Filters */}
      <div style={S.row}>
        <select style={S.sel} value={fStaff} onChange={e => setFStaff(e.target.value)}><option value="">全部員工</option>{STAFF.map(s => <option key={s}>{s}</option>)}</select>
        <select style={S.sel} value={fStore} onChange={e => setFStore(e.target.value)}><option value="">全部店舖</option>{STORES.map(s => <option key={s}>{s}</option>)}</select>
        <input type="month" style={S.sel} value={fMonth} onChange={e => setFMonth(e.target.value)} />
        <button style={S.btn} onClick={handlePrint}>列印報表</button>
      </div>
      {/* Today */}
      {tab === 'today' && <div style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: '#0e7490' }}>今日考勤 ({today})</div>
        <div style={{ overflowX: 'auto' }}><table style={S.tbl}>{TH(['員工', '店舖', '打卡', '簽退', '時數', '狀態'])}<tbody>{todayRecs.map((r, i) => <AttRow key={i} r={r} />)}</tbody></table></div>
      </div>}
      {/* Monthly Calendar */}
      {tab === 'monthly' && <div style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: '#0e7490' }}>月曆總覽 ({fMonth})</div>
        <div style={{ fontSize: 11, marginBottom: 8, color: '#888' }}>{'\u2705'} 正常 | {'\u26A0\uFE0F'} 遲到/早退 | {'\u274C'} 缺勤 | {'\uD83C\uDFD6\uFE0F'} 請假</div>
        <div style={S.calG}>
          {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d} style={{ fontWeight: 600, color: '#0e7490', padding: 4 }}>{d}</div>)}
          {calCells.map((c, i) => c ? <div key={i} style={S.calC(c.bg)}><div style={{ fontWeight: 600 }}>{c.d}</div><div>{c.icon}</div></div> : <div key={i} />)}
        </div>
        <div style={{ marginTop: 16, overflowX: 'auto' }}><table style={S.tbl}>{TH(['日期', '員工', '店舖', '打卡', '簽退', '時數', '狀態'])}<tbody>{[...filtered].sort((a, b) => a.date.localeCompare(b.date)).map((r, i) => <AttRow key={i} r={r} showDate />)}</tbody></table></div>
      </div>}
      {/* Statistics */}
      {tab === 'stats' && <div style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: 12, color: '#0e7490' }}>統計 ({fMonth})</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {[{ v: stats.rate + '%', l: '出勤率', c: '#0e7490' }, { v: stats.late, l: '遲到次數', c: '#f59e0b' }, { v: stats.early, l: '早退次數', c: '#f59e0b' }, { v: stats.absent, l: '缺勤天數', c: '#dc2626' }].map(x =>
            <div key={x.l} style={S.stat}><div style={{ fontSize: 22, fontWeight: 700, color: x.c }}>{x.v}</div><div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{x.l}</div></div>)}
        </div>
        <table style={S.tbl}>{TH(['員工', '出勤', '遲到', '早退', '缺勤', '出勤率'])}
          <tbody>{STAFF.map(s => {
            const sr = filtered.filter(r => r.staff === s); if (!sr.length) return null;
            let p = 0, l = 0, e = 0, a = 0;
            sr.forEach(r => { const st = getStatus(r.clockIn, r.clockOut); if (st.label === '缺勤') a++; else { p++; if (st.label.includes('遲到')) l++; if (st.label.includes('早退')) e++; } });
            return (<tr key={s}><td style={S.td}>{s}</td><td style={S.td}>{p}</td><td style={{ ...S.td, color: l ? '#f59e0b' : undefined }}>{l}</td><td style={{ ...S.td, color: e ? '#f59e0b' : undefined }}>{e}</td><td style={{ ...S.td, color: a ? '#dc2626' : undefined }}>{a}</td><td style={S.td}>{((p / sr.length) * 100).toFixed(1)}%</td></tr>);
          })}</tbody></table>
      </div>}
      {/* Manual Adjustment Modal */}
      {showAdj && <div style={S.modal} onClick={() => setShowAdj(false)}>
        <div style={S.mBox} onClick={e => e.stopPropagation()}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#0e7490', marginBottom: 12 }}>手動調整考勤</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select style={S.sel} value={adj.staff} onChange={e => setAdj({ ...adj, staff: e.target.value })}>{STAFF.map(s => <option key={s}>{s}</option>)}</select>
            <select style={S.sel} value={adj.store} onChange={e => setAdj({ ...adj, store: e.target.value })}>{STORES.map(s => <option key={s}>{s}</option>)}</select>
            <input type="date" style={S.inp} value={adj.date} onChange={e => setAdj({ ...adj, date: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ fontSize: 13 }}>打卡<input type="time" style={S.inp} value={adj.clockIn} onChange={e => setAdj({ ...adj, clockIn: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>簽退<input type="time" style={S.inp} value={adj.clockOut} onChange={e => setAdj({ ...adj, clockOut: e.target.value })} /></label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={{ ...S.btn, background: '#e5e7eb', color: '#333' }} onClick={() => setShowAdj(false)}>取消</button>
              <button style={S.btn} onClick={handleAdj}>儲存</button>
            </div>
          </div>
        </div>
      </div>}
    </div>
  );
}
