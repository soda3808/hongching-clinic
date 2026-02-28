import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getDoctors, getStoreNames } from '../data';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const LS_KEY = 'hcmc_staff_roster';
const ACCENT = '#0e7490';
const DAYS = ['一','二','三','四','五','六','日'];
const DAY_LABELS = ['星期一','星期二','星期三','星期四','星期五','星期六','星期日'];
const SHIFTS = [
  { key: 'morning', label: '早班', time: '09:00-14:00', hours: 5, bg: '#dbeafe', color: '#1e40af' },
  { key: 'afternoon', label: '午班', time: '14:00-19:00', hours: 5, bg: '#fef3c7', color: '#92400e' },
  { key: 'full', label: '全日', time: '09:00-19:00', hours: 10, bg: '#d1fae5', color: '#065f46' },
  { key: 'off', label: '休息', time: '', hours: 0, bg: '#f3f4f6', color: '#9ca3af' },
];
const SHIFT_CYCLE = ['morning','afternoon','full','off'];
const shiftOf = (k) => SHIFTS.find(s => s.key === k) || SHIFTS[3];
const STD_HRS = 44;

const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
const save = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));
const mondayOf = (d) => { const dt = new Date(d); const day = dt.getDay() || 7; dt.setDate(dt.getDate() - day + 1); return dt.toISOString().split('T')[0]; };
const fmtD = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
const addD = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
const wkRange = (m) => `${fmtD(m)} - ${fmtD(addD(m, 6))}`;

const S = {
  page: { padding: 16, maxWidth: 1060, margin: '0 auto' },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 4, color: ACCENT },
  sub: { fontSize: 13, color: '#666', marginBottom: 14 },
  bar: { display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' },
  btn: (a) => ({ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
    fontWeight: 600, fontSize: 13, background: a ? ACCENT : '#e5e7eb', color: a ? '#fff' : '#333' }),
  sm: { padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
    fontWeight: 600, fontSize: 12, background: '#e5e7eb', color: '#333' },
  card: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0002', padding: 16, marginBottom: 14 },
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'center', padding: '8px 4px', borderBottom: '2px solid #e5e7eb',
    color: ACCENT, fontWeight: 700, fontSize: 12 },
  thL: { textAlign: 'left', padding: '8px 6px', borderBottom: '2px solid #e5e7eb',
    color: ACCENT, fontWeight: 700, fontSize: 12 },
  td: { padding: '6px 4px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' },
  cell: (s) => ({ padding: '6px 4px', borderRadius: 6, background: s.bg, color: s.color,
    fontWeight: 600, fontSize: 11, cursor: 'pointer', textAlign: 'center', minHeight: 32,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    userSelect: 'none', border: `1px solid ${s.bg === '#f3f4f6' ? '#e5e7eb' : 'transparent'}` }),
  alert: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
    padding: '10px 14px', marginBottom: 12, color: '#991b1b', fontSize: 13, fontWeight: 600 },
  stat: { textAlign: 'center', flex: 1, minWidth: 90, padding: 10, borderRadius: 8, background: '#f0fdfa' },
  sN: { fontSize: 20, fontWeight: 700, color: ACCENT },
  sL: { fontSize: 11, color: '#666', marginTop: 2 },
  bdg: (c) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10,
    fontSize: 11, fontWeight: 600, color: '#fff', background: c }),
  modal: { position: 'fixed', inset: 0, background: '#0008', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  mBox: { background: '#fff', borderRadius: 12, padding: 20, width: 400,
    maxWidth: '92vw', maxHeight: '85vh', overflow: 'auto' },
  sel: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 },
};

export default function StaffRoster({ data, showToast, user }) {
  const [store, setStore] = useState(load);
  const [weekOff, setWeekOff] = useState(0);
  const [view, setView] = useState('week');
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefStaff, setPrefStaff] = useState('');

  const doctors = getDoctors();
  const emps = useMemo(() => (data?.employees || []).map(e => e.name).filter(Boolean), [data]);
  const allStaff = useMemo(() => [...new Set([...doctors, ...emps])], [doctors, emps]);
  const roles = useMemo(() => {
    const r = {};
    doctors.forEach(d => { r[d] = 'doctor'; });
    emps.forEach(e => { if (!r[e]) r[e] = 'staff'; });
    return r;
  }, [doctors, emps]);

  const monday = useMemo(() => {
    const n = new Date(); n.setDate(n.getDate() + weekOff * 7); return mondayOf(n);
  }, [weekOff]);

  const roster = store;

  const getR = (s, i) => roster?.[monday]?.[s]?.[addD(monday, i)] || 'off';
  const setR = (staff, i, val) => {
    const dk = addD(monday, i), next = { ...roster };
    if (!next[monday]) next[monday] = {};
    if (!next[monday][staff]) next[monday][staff] = {};
    next[monday][staff][dk] = val;
    setStore(next); save(next);
  };
  const cycle = (s, i) => {
    const c = SHIFT_CYCLE.indexOf(getR(s, i));
    setR(s, i, SHIFT_CYCLE[(c + 1) % 4]);
  };

  // Weekly hours per staff
  const wkHrs = useMemo(() => {
    const h = {};
    allStaff.forEach(s => {
      let t = 0;
      for (let i = 0; i < 7; i++) t += shiftOf(getR(s, i)).hours;
      h[s] = t;
    });
    return h;
  }, [roster, monday, allStaff]);

  // Minimum staffing alerts: 1 doctor + 1 staff per shift
  const alerts = useMemo(() => {
    const w = [];
    for (let i = 0; i < 7; i++) {
      const dl = `${DAY_LABELS[i]} (${fmtD(addD(monday, i))})`;
      ['morning', 'afternoon'].forEach(p => {
        const pl = p === 'morning' ? '早班' : '午班';
        let dc = 0, sc = 0;
        allStaff.forEach(s => {
          const sh = getR(s, i);
          if (sh === 'full' || sh === p) { roles[s] === 'doctor' ? dc++ : sc++; }
        });
        if (dc < 1) w.push(`${dl} ${pl}：缺少醫師（需至少1名）`);
        if (sc < 1) w.push(`${dl} ${pl}：缺少職員（需至少1名）`);
      });
    }
    return w;
  }, [roster, monday, allStaff, roles]);

  // Staff preferences (stored under _prefs key)
  const getPrefs = (s) => roster?._prefs?.[s] || {};
  const setPref = (staff, i, val) => {
    const next = { ...roster };
    if (!next._prefs) next._prefs = {};
    if (!next._prefs[staff]) next._prefs[staff] = {};
    next._prefs[staff][i] = val;
    setStore(next); save(next);
  };

  // Copy last week's roster
  const copyLast = () => {
    const pm = addD(monday, -7), prev = roster?.[pm];
    if (!prev) { showToast('上週無排班資料'); return; }
    const next = { ...roster }; next[monday] = {};
    Object.keys(prev).forEach(s => {
      next[monday][s] = {};
      Object.keys(prev[s]).forEach(od => {
        const di = Math.round((new Date(od) - new Date(pm)) / 86400000);
        next[monday][s][addD(monday, di)] = prev[s][od];
      });
    });
    setStore(next); save(next); showToast('已複製上週排班');
  };

  // Per-staff statistics
  const stats = useMemo(() => {
    const r = {};
    allStaff.forEach(s => {
      let sh = 0, hr = 0;
      for (let i = 0; i < 7; i++) {
        const x = shiftOf(getR(s, i));
        if (x.key !== 'off') { sh++; hr += x.hours; }
      }
      r[s] = { shifts: sh, hours: hr, overtime: Math.max(0, hr - STD_HRS) };
    });
    return r;
  }, [roster, monday, allStaff]);

  const totSh = useMemo(() => Object.values(stats).reduce((a, b) => a + b.shifts, 0), [stats]);
  const totOT = useMemo(() => Object.values(stats).reduce((a, b) => a + b.overtime, 0), [stats]);

  // Monthly view: collect all week-mondays in the month
  const monthWeeks = useMemo(() => {
    if (view !== 'month') return [];
    const d = new Date(monday), mo = d.getMonth(); d.setDate(1);
    let c = mondayOf(d); const ws = [];
    for (let i = 0; i < 6; i++) {
      if (new Date(c).getMonth() === mo || new Date(addD(c, 6)).getMonth() === mo) ws.push(c);
      c = addD(c, 7);
    }
    return ws;
  }, [view, monday]);

  // Print weekly roster via window.open + document.write
  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const hCols = DAYS.map((_, i) =>
      `<th style="padding:6px;border:1px solid #ccc;background:#f0f0f0;font-size:12px">${DAY_LABELS[i]}<br/><small>${fmtD(addD(monday, i))}</small></th>`
    ).join('');
    const rows = allStaff.map(s => {
      const rl = roles[s] === 'doctor' ? '醫師' : '職員';
      const cells = DAYS.map((_, i) => {
        const sh = shiftOf(getR(s, i));
        return `<td style="padding:6px;border:1px solid #ccc;text-align:center;background:${sh.bg};color:${sh.color};font-weight:600;font-size:11px">${sh.label}${sh.time ? '<br/><small>' + sh.time + '</small>' : ''}</td>`;
      }).join('');
      return `<tr><td style="padding:6px;border:1px solid #ccc;font-weight:700;white-space:nowrap">${s}<br/><small style="color:#888">${rl}</small></td>${cells}<td style="padding:6px;border:1px solid #ccc;text-align:center;font-weight:700">${wkHrs[s]}h</td></tr>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>員工排班表</title>
      <style>body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:1000px;margin:0 auto;font-size:12px}
      h1{font-size:18px;text-align:center;color:${ACCENT}}
      .sub{text-align:center;color:#888;font-size:11px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      @media print{body{margin:0;padding:8mm}}</style></head><body>
      <h1>${getClinicName()} — 員工排班表</h1>
      <div class="sub">週期：${wkRange(monday)} | 列印時間：${new Date().toLocaleString('zh-HK')}</div>
      <table><thead><tr><th style="padding:6px;border:1px solid #ccc;background:#f0f0f0;text-align:left">員工</th>${hCols}<th style="padding:6px;border:1px solid #ccc;background:#f0f0f0">週時數</th></tr></thead>
      <tbody>${rows}</tbody></table>
      ${alerts.length ? '<div style="margin-top:14px;padding:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#991b1b;font-size:12px"><b>人手不足警示：</b><ul style="margin:4px 0 0 16px">' + alerts.map(a => `<li>${a}</li>`).join('') + '</ul></div>' : ''}
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div style={S.page}>
      <div style={S.title}>員工排班表</div>
      <div style={S.sub}>管理每週值班安排、統計工時</div>

      {/* View toggle + week nav */}
      <div style={S.bar}>
        <button style={S.btn(view === 'week')} onClick={() => setView('week')}>週檢視</button>
        <button style={S.btn(view === 'month')} onClick={() => setView('month')}>月檢視</button>
        <span style={{ flex: 1 }} />
        <button style={S.sm} onClick={() => setWeekOff(w => w - 1)}>&#9664; 上週</button>
        <button style={{ ...S.sm, background: ACCENT, color: '#fff' }} onClick={() => setWeekOff(0)}>本週</button>
        <button style={S.sm} onClick={() => setWeekOff(w => w + 1)}>下週 &#9654;</button>
      </div>

      {/* Action bar */}
      <div style={{ ...S.bar, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#333' }}>{wkRange(monday)}</span>
        <span style={{ flex: 1 }} />
        <button style={S.sm} onClick={copyLast}>複製上週排班</button>
        <button style={S.sm} onClick={() => setShowPrefs(true)}>偏好設定</button>
        <button style={{ ...S.sm, background: '#d97706', color: '#fff' }} onClick={handlePrint}>列印排班表</button>
      </div>

      {/* Staffing alerts */}
      {alerts.length > 0 && (
        <div style={S.alert}>
          人手不足警示（{alerts.length}項）
          <ul style={{ margin: '4px 0 0 16px', fontSize: 12, fontWeight: 500 }}>
            {alerts.slice(0, 5).map((a, i) => <li key={i}>{a}</li>)}
            {alerts.length > 5 && <li>...還有 {alerts.length - 5} 項</li>}
          </ul>
        </div>
      )}

      {/* Shift legend */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', fontSize: 12 }}>
        {SHIFTS.map(s => (
          <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: s.bg,
              border: '1px solid #d1d5db', display: 'inline-block' }} />
            <span style={{ fontWeight: 600, color: s.color }}>{s.label}</span>
            {s.time && <span style={{ color: '#999' }}>({s.time})</span>}
          </span>
        ))}
        <span style={{ color: '#999', fontSize: 11, alignSelf: 'center' }}>點擊格子切換班次</span>
      </div>

      {/* ── Weekly Grid ── */}
      {view === 'week' && (
        <div style={S.card}><div style={{ overflowX: 'auto' }}>
          <table style={S.tbl}>
            <thead><tr>
              <th style={{ ...S.thL, minWidth: 90 }}>員工</th>
              {DAYS.map((d, i) => (
                <th key={d} style={{ ...S.th, minWidth: 80 }}>
                  {DAY_LABELS[i]}<br />
                  <span style={{ fontWeight: 400, fontSize: 11, color: '#888' }}>{fmtD(addD(monday, i))}</span>
                </th>
              ))}
              <th style={{ ...S.th, minWidth: 60 }}>週時數</th>
            </tr></thead>
            <tbody>
              {allStaff.map(staff => {
                const hrs = wkHrs[staff], ot = hrs > STD_HRS, pr = getPrefs(staff);
                return (
                  <tr key={staff}>
                    <td style={{ ...S.td, textAlign: 'left', fontWeight: 600 }}>
                      {staff}<br />
                      <span style={{ fontSize: 10, color: '#888' }}>{roles[staff] === 'doctor' ? '醫師' : '職員'}</span>
                    </td>
                    {DAYS.map((_, i) => {
                      const sh = shiftOf(getR(staff, i)), pf = pr[i];
                      return (
                        <td key={i} style={S.td}>
                          <div style={S.cell(sh)} onClick={() => cycle(staff, i)}>
                            <span>{sh.label}</span>
                            {sh.time && <span style={{ fontSize: 9, opacity: 0.8 }}>{sh.time}</span>}
                          </div>
                          {pf && <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>偏好: {shiftOf(pf).label}</div>}
                        </td>
                      );
                    })}
                    <td style={{ ...S.td, fontWeight: 700, color: ot ? '#dc2626' : '#333' }}>
                      {hrs}h
                      {ot && <div style={{ fontSize: 10, color: '#dc2626' }}>+{hrs - STD_HRS}h OT</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div></div>
      )}

      {/* ── Monthly View ── */}
      {view === 'month' && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: ACCENT }}>
            {new Date(monday).getFullYear()}年{new Date(monday).getMonth() + 1}月 月度排班總覽
          </div>
          <div style={{ overflowX: 'auto' }}>
            {monthWeeks.map(wk => (
              <div key={wk} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 4 }}>{wkRange(wk)}</div>
                <table style={{ ...S.tbl, marginBottom: 4 }}>
                  <thead><tr>
                    <th style={{ ...S.thL, minWidth: 70, fontSize: 11 }}>員工</th>
                    {DAYS.map((d, i) => (
                      <th key={d} style={{ ...S.th, fontSize: 10, padding: '4px 2px' }}>
                        {d}<br /><span style={{ fontWeight: 400, color: '#aaa' }}>{fmtD(addD(wk, i))}</span>
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {allStaff.map(staff => (
                      <tr key={staff}>
                        <td style={{ ...S.td, textAlign: 'left', fontSize: 11, fontWeight: 600, padding: '3px 4px' }}>{staff}</td>
                        {DAYS.map((_, i) => {
                          const sh = shiftOf(roster?.[wk]?.[staff]?.[addD(wk, i)] || 'off');
                          return <td key={i} style={{ ...S.td, padding: '3px 2px' }}>
                            <span style={{ ...S.bdg(sh.color), fontSize: 10 }}>{sh.label}</span>
                          </td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Statistics ── */}
      <div style={S.card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: ACCENT }}>本週統計</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={S.stat}><div style={S.sN}>{allStaff.length}</div><div style={S.sL}>總人數</div></div>
          <div style={S.stat}><div style={S.sN}>{totSh}</div><div style={S.sL}>總班次</div></div>
          <div style={S.stat}>
            <div style={{ ...S.sN, color: totOT > 0 ? '#dc2626' : ACCENT }}>{totOT}h</div>
            <div style={S.sL}>加班時數</div>
          </div>
          <div style={S.stat}>
            <div style={{ ...S.sN, color: alerts.length > 0 ? '#dc2626' : '#16a34a' }}>{alerts.length}</div>
            <div style={S.sL}>人手警示</div>
          </div>
        </div>
        <table style={S.tbl}>
          <thead><tr>
            <th style={S.thL}>員工</th><th style={S.th}>角色</th>
            <th style={S.th}>出勤日</th><th style={S.th}>總時數</th>
            <th style={S.th}>加班</th><th style={S.th}>狀態</th>
          </tr></thead>
          <tbody>
            {allStaff.map(staff => {
              const s = stats[staff], ot = s.overtime > 0;
              return (
                <tr key={staff}>
                  <td style={{ ...S.td, textAlign: 'left', fontWeight: 600 }}>{staff}</td>
                  <td style={S.td}>
                    <span style={S.bdg(roles[staff] === 'doctor' ? ACCENT : '#6b7280')}>
                      {roles[staff] === 'doctor' ? '醫師' : '職員'}
                    </span>
                  </td>
                  <td style={S.td}>{s.shifts} 天</td>
                  <td style={{ ...S.td, fontWeight: 700 }}>{s.hours}h</td>
                  <td style={{ ...S.td, color: ot ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                    {ot ? `+${s.overtime}h` : '-'}
                  </td>
                  <td style={S.td}>
                    <span style={S.bdg(ot ? '#dc2626' : s.hours === 0 ? '#9ca3af' : '#16a34a')}>
                      {ot ? '超時' : s.hours === 0 ? '無排班' : '正常'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Preferences Modal ── */}
      {showPrefs && (
        <div style={S.modal} onClick={() => setShowPrefs(false)}>
          <div style={S.mBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: ACCENT, marginBottom: 12 }}>員工偏好設定</div>
            <div style={{ marginBottom: 10 }}>
              <select style={S.sel} value={prefStaff} onChange={e => setPrefStaff(e.target.value)}>
                <option value="">選擇員工</option>
                {allStaff.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            {prefStaff && (
              <table style={S.tbl}>
                <thead><tr><th style={S.thL}>日期</th><th style={S.th}>偏好班次</th></tr></thead>
                <tbody>
                  {DAY_LABELS.map((d, i) => (
                    <tr key={i}>
                      <td style={{ ...S.td, textAlign: 'left' }}>{d}</td>
                      <td style={S.td}>
                        <select style={S.sel} value={getPrefs(prefStaff)[i] || ''}
                          onChange={e => setPref(prefStaff, i, e.target.value)}>
                          <option value="">無偏好</option>
                          {SHIFTS.map(s => (
                            <option key={s.key} value={s.key}>{s.label}{s.time ? ` (${s.time})` : ''}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ textAlign: 'right', marginTop: 14 }}>
              <button style={S.btn(true)} onClick={() => { setShowPrefs(false); showToast('偏好已儲存'); }}>完成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
