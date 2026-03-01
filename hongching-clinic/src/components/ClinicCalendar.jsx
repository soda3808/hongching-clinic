import React, { useState, useMemo } from 'react';
import { uid } from '../data';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_clinic_events';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const EVENT_TYPES = ['會議', '休診', '活動', '培訓', '其他'];

const TYPE_COLORS = {
  booking: '#0e7490', queue: '#2563eb', leave: '#d97706',
  holiday: '#dc2626', custom: '#7c3aed',
};
const TYPE_LABELS = {
  booking: '預約', queue: '掛號', leave: '員工假期',
  holiday: '公眾假期', custom: '自訂事件',
};

const HK_HOLIDAYS = {
  '2025-01-01': '元旦', '2025-01-29': '農曆年初一', '2025-01-30': '農曆年初二', '2025-01-31': '農曆年初三',
  '2025-02-01': '農曆年初四', '2025-04-04': '清明節', '2025-04-18': '耶穌受難節',
  '2025-04-19': '耶穌受難節翌日', '2025-04-21': '復活節星期一', '2025-05-01': '勞動節',
  '2025-05-05': '佛誕', '2025-05-31': '端午節', '2025-07-01': '香港特別行政區成立紀念日',
  '2025-10-01': '國慶日', '2025-10-07': '重陽節', '2025-10-29': '中秋節翌日',
  '2025-12-25': '聖誕節', '2025-12-26': '聖誕節翌日',
  '2026-01-01': '元旦', '2026-02-17': '農曆年初一', '2026-02-18': '農曆年初二',
  '2026-02-19': '農曆年初三', '2026-02-20': '農曆年初四', '2026-04-03': '耶穌受難節',
  '2026-04-04': '清明節', '2026-04-06': '復活節星期一', '2026-05-01': '勞動節',
  '2026-05-24': '佛誕', '2026-06-19': '端午節', '2026-07-01': '香港特別行政區成立紀念日',
  '2026-10-01': '國慶日', '2026-10-19': '重陽節', '2026-10-26': '中秋節翌日',
  '2026-12-25': '聖誕節', '2026-12-26': '聖誕節翌日',
};

const card = { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08)' };
const btnStyle = (active) => ({ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: active ? ACCENT : '#e5e7eb', color: active ? '#fff' : '#333' });
const dot = (color) => ({ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 4 });
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' };

const isoDate = (d) => d.toISOString().substring(0, 10);
const fmtDate = (s) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()}`; };

function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function getWeekDates(base) {
  const d = new Date(base);
  d.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => { const dd = new Date(d); dd.setDate(dd.getDate() + i); return isoDate(dd); });
}

const HOURS = Array.from({ length: 20 }, (_, i) => {
  const h = 9 + Math.floor(i / 2);
  return `${String(h).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
});

export default function ClinicCalendar({ data, showToast, user }) {
  const [view, setView] = useState('month');
  const [cur, setCur] = useState(new Date());
  const [selDay, setSelDay] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', date: isoDate(new Date()), time: '10:00', type: '會議', notes: '' });
  const [customEvents, setCustomEvents] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
  });

  const save = (evts) => { setCustomEvents(evts); localStorage.setItem(LS_KEY, JSON.stringify(evts)); };

  const today = isoDate(new Date());
  const year = cur.getFullYear();
  const month = cur.getMonth();

  const eventsForDate = useMemo(() => {
    const map = {};
    const add = (dateStr, evt) => { if (!map[dateStr]) map[dateStr] = []; map[dateStr].push(evt); };

    (data.bookings || []).forEach(b => add(b.date, { ...b, _type: 'booking', _label: b.patientName || '預約', _time: b.time }));
    (data.queue || []).forEach(q => add(q.date, { ...q, _type: 'queue', _label: q.patientName || '掛號', _time: q.time || '' }));
    (data.leaves || []).forEach(l => {
      const s = new Date(l.startDate || l.date);
      const e = new Date(l.endDate || l.date);
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        add(isoDate(d), { ...l, _type: 'leave', _label: `${l.staffName || l.userId || '員工'} - ${l.type || '假期'}`, _time: '' });
      }
    });
    Object.entries(HK_HOLIDAYS).forEach(([date, name]) => add(date, { _type: 'holiday', _label: name, _time: '', id: `hol_${date}` }));
    customEvents.forEach(ce => add(ce.date, { ...ce, _type: 'custom', _label: ce.title, _time: ce.time }));

    return map;
  }, [data.bookings, data.queue, data.leaves, customEvents]);

  const getEvts = (dateStr) => eventsForDate[dateStr] || [];

  const nav = (dir) => {
    const d = new Date(cur);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir * 7);
    setCur(d);
    setSelDay(null);
  };

  const headerLabel = view === 'month'
    ? `${year}年${month + 1}月`
    : (() => { const w = getWeekDates(isoDate(cur)); return `${fmtDate(w[0])} - ${fmtDate(w[6])}`; })();

  const monthTotal = useMemo(() => {
    const days = new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let d = 1; d <= days; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      count += getEvts(ds).length;
    }
    return count;
  }, [eventsForDate, year, month]);

  const handleAdd = () => {
    if (!form.title.trim()) { showToast && showToast('請輸入標題'); return; }
    const evt = { id: uid(), ...form, createdBy: user?.name || '系統', createdAt: new Date().toISOString() };
    save([...customEvents, evt]);
    setShowForm(false);
    setForm({ title: '', date: isoDate(new Date()), time: '10:00', type: '會議', notes: '' });
    showToast && showToast('已新增事件');
  };

  const handleDelete = (id) => { save(customEvents.filter(e => e.id !== id)); showToast && showToast('已刪除事件'); };

  const handlePrint = () => {
    const days = new Date(year, month + 1, 0).getDate();
    const grid = getMonthGrid(year, month);
    let rows = '';
    for (let r = 0; r < grid.length; r += 7) {
      let cells = '';
      for (let c = 0; c < 7; c++) {
        const d = grid[r + c];
        if (d === null) { cells += '<td style="border:1px solid #ddd;padding:4px;height:70px;vertical-align:top;"></td>'; continue; }
        const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const evts = getEvts(ds);
        const isHol = HK_HOLIDAYS[ds];
        const dayColor = isHol ? '#dc2626' : '#333';
        let inner = `<div style="font-weight:600;color:${dayColor};margin-bottom:2px;">${d}</div>`;
        evts.slice(0, 3).forEach(e => {
          inner += `<div style="font-size:10px;padding:1px 3px;margin-bottom:1px;border-radius:2px;background:${TYPE_COLORS[e._type]}15;color:${TYPE_COLORS[e._type]};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e._time ? escapeHtml(e._time) + ' ' : ''}${escapeHtml(e._label)}</div>`;
        });
        if (evts.length > 3) inner += `<div style="font-size:10px;color:#888;">+${evts.length - 3}...</div>`;
        cells += `<td style="border:1px solid #ddd;padding:4px;height:70px;vertical-align:top;width:14.28%;">${inner}</td>`;
      }
      rows += `<tr>${cells}</tr>`;
    }
    const html = `<html><head><title>${year}年${month + 1}月 診所日曆</title></head><body style="font-family:sans-serif;padding:20px;">
      <h2 style="text-align:center;margin-bottom:16px;">${year}年${month + 1}月 診所綜合日曆</h2>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <thead><tr>${WEEKDAYS.map(w => `<th style="border:1px solid #ddd;padding:6px;background:#f3f4f6;text-align:center;">${w}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:12px;font-size:11px;color:#666;display:flex;gap:16px;">
        ${Object.entries(TYPE_LABELS).map(([k, v]) => `<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${TYPE_COLORS[k]};margin-right:4px;"></span>${v}</span>`).join('')}
      </div>
      <script>window.onload=function(){window.print();}</script>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  const renderEvent = (evt, i) => {
    const color = TYPE_COLORS[evt._type];
    return (
      <div key={evt.id || i} style={{ ...card, borderLeft: `4px solid ${color}`, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={dot(color)} />
            <strong style={{ fontSize: 14 }}>{evt._label}</strong>
            <span style={{ marginLeft: 8, fontSize: 12, color, background: `${color}18`, padding: '2px 8px', borderRadius: 4 }}>{TYPE_LABELS[evt._type]}</span>
          </div>
          <span style={{ fontSize: 12, color: '#888' }}>{evt._time}</span>
        </div>
        {evt.doctor && <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>醫師: {evt.doctor}</div>}
        {evt.type && evt._type === 'custom' && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>分類: {evt.type}</div>}
        {evt.notes && <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>{evt.notes}</div>}
        {evt.status && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>狀態: {evt.status}</div>}
        {evt._type === 'custom' && <button onClick={() => handleDelete(evt.id)} style={{ marginTop: 6, fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>刪除</button>}
      </div>
    );
  };

  const grid = getMonthGrid(year, month);

  const renderMonth = () => (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center', marginBottom: 4 }}>
        {WEEKDAYS.map(w => <div key={w} style={{ fontWeight: 600, fontSize: 13, color: '#666', padding: 6 }}>{w}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {grid.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const evts = getEvts(ds);
          const isToday = ds === today;
          const isSel = selDay === ds;
          const isHol = !!HK_HOLIDAYS[ds];
          return (
            <div key={i} onClick={() => setSelDay(isSel ? null : ds)} style={{ minHeight: 60, padding: 4, borderRadius: 6, cursor: 'pointer', background: isSel ? '#e0f2fe' : isToday ? '#f0fdfa' : isHol ? '#fef2f2' : '#fafafa', border: isToday ? `2px solid ${ACCENT}` : '1px solid #eee', transition: 'background .15s' }}>
              <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isHol ? '#dc2626' : isToday ? ACCENT : '#333', textAlign: 'right', paddingRight: 4 }}>{d}</div>
              {evts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2, justifyContent: 'center' }}>
                  {evts.length <= 4
                    ? [...new Set(evts.map(e => e._type))].map((t, j) => <span key={j} style={dot(TYPE_COLORS[t])} />)
                    : <span style={{ fontSize: 11, color: ACCENT, fontWeight: 600 }}>{evts.length}件</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selDay && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 8px', color: '#333' }}>{selDay} ({WEEKDAYS[new Date(selDay + 'T00:00:00').getDay()]}) - 共{getEvts(selDay).length}項</h4>
          {getEvts(selDay).length === 0
            ? <div style={{ color: '#999', fontSize: 14 }}>無事件</div>
            : getEvts(selDay).sort((a, b) => (a._time || '').localeCompare(b._time || '')).map(renderEvent)}
        </div>
      )}
    </div>
  );

  const renderWeek = () => {
    const week = getWeekDates(isoDate(cur));
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7,1fr)', gap: 0, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: 6 }} />
          {week.map((ds, i) => {
            const isToday = ds === today;
            return (
              <div key={ds} style={{ textAlign: 'center', fontWeight: 600, fontSize: 13, padding: 6, background: isToday ? '#f0fdfa' : '#f9fafb', color: isToday ? ACCENT : '#555', borderBottom: '1px solid #e5e7eb', borderLeft: '1px solid #e5e7eb' }}>
                {WEEKDAYS[i]} {fmtDate(ds)}
              </div>
            );
          })}
          {HOURS.map(hour => (
            <React.Fragment key={hour}>
              <div style={{ fontSize: 11, color: '#999', padding: '4px 6px', textAlign: 'right', borderBottom: '1px solid #f0f0f0', background: '#f9fafb' }}>{hour}</div>
              {week.map(ds => {
                const evts = getEvts(ds).filter(e => e._time && e._time.startsWith(hour.substring(0, 2) + ':' + hour.substring(3)));
                return (
                  <div key={ds + hour} style={{ borderLeft: '1px solid #e5e7eb', borderBottom: '1px solid #f0f0f0', padding: 2, minHeight: 28 }}>
                    {evts.map((e, j) => (
                      <div key={j} style={{ fontSize: 10, padding: '1px 4px', borderRadius: 3, background: `${TYPE_COLORS[e._type]}20`, color: TYPE_COLORS[e._type], marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e._label}</div>
                    ))}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: '#1e293b' }}>診所綜合日曆</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {[['month', '月'], ['week', '週']].map(([v, l]) => (
            <button key={v} onClick={() => { setView(v); setSelDay(null); }} style={btnStyle(view === v)}>{l}</button>
          ))}
          <button onClick={() => { setCur(new Date()); setSelDay(null); }} style={btnStyle(false)}>今天</button>
          <button onClick={handlePrint} style={btnStyle(false)}>列印</button>
          <button onClick={() => { setForm({ ...form, date: selDay || isoDate(new Date()) }); setShowForm(true); }} style={{ ...btnStyle(true), background: '#7c3aed' }}>+ 新增事件</button>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={() => nav(-1)} style={{ ...btnStyle(false), padding: '6px 12px' }}>&#9664;</button>
        <span style={{ fontWeight: 700, fontSize: 16, color: '#334155' }}>{headerLabel}</span>
        <button onClick={() => nav(1)} style={{ ...btnStyle(false), padding: '6px 12px' }}>&#9654;</button>
      </div>

      {/* Legend */}
      <div style={{ ...card, padding: 12, marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
        {Object.entries(TYPE_LABELS).map(([k, v]) => (
          <span key={k}><span style={dot(TYPE_COLORS[k])} />{v}</span>
        ))}
        <span style={{ marginLeft: 'auto', fontWeight: 600, color: ACCENT }}>本月合計: {monthTotal} 件</span>
      </div>

      {/* Calendar views */}
      {view === 'month' && renderMonth()}
      {view === 'week' && renderWeek()}

      {/* Add event modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>新增診所事件</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>標題 *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inputStyle} placeholder="事件標題" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>日期</label>
                  <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>時間</label>
                  <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>類型</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inputStyle}>
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>備註</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="備註（選填）" />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setShowForm(false)} style={btnStyle(false)}>取消</button>
                <button onClick={handleAdd} style={btnStyle(true)}>確認新增</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
