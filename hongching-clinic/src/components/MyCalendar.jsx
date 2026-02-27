import { useState, useMemo } from 'react';
import { getDoctors, getStoreNames, getDefaultStore } from '../data';
import { getClinicName } from '../tenant';

const ACCENT = '#0e7490';
const TYPES = ['預約', '會議', '提醒', '其他'];
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const LS_KEY = 'hcmc_calendar_events';

const card = { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08)' };
const btn = (active) => ({ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: active ? ACCENT : '#e5e7eb', color: active ? '#fff' : '#333' });
const dot = (color) => ({ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 4 });

const fmtDate = (d) => { const dt = new Date(d); return `${dt.getMonth() + 1}/${dt.getDate()}`; };
const isoDate = (d) => d.toISOString().substring(0, 10);
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function getWeekDates(base) {
  const d = new Date(base);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return Array.from({ length: 7 }, (_, i) => { const dd = new Date(d); dd.setDate(dd.getDate() + i); return isoDate(dd); });
}

function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function MyCalendar({ data, showToast, user }) {
  const DOCTORS = getDoctors();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const userDoctor = user?.name || DOCTORS[0];

  const [view, setView] = useState('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [filterDoc, setFilterDoc] = useState(isAdmin ? 'all' : userDoctor);
  const [showModal, setShowModal] = useState(false);
  const [evtForm, setEvtForm] = useState({ title: '', date: isoDate(new Date()), time: '10:00', type: '提醒', notes: '' });
  const [personalEvents, setPersonalEvents] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
  });

  const saveEvents = (evts) => { setPersonalEvents(evts); localStorage.setItem(LS_KEY, JSON.stringify(evts)); };

  const bookings = useMemo(() => (data.bookings || []).filter(b => filterDoc === 'all' || b.doctor === filterDoc), [data.bookings, filterDoc]);
  const consultations = useMemo(() => (data.consultations || []).filter(c => filterDoc === 'all' || c.doctor === filterDoc), [data.consultations, filterDoc]);

  const today = isoDate(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  const eventsForDate = (dateStr) => {
    const bk = bookings.filter(b => b.date === dateStr).map(b => ({ ...b, _type: 'booking' }));
    const cs = consultations.filter(c => c.date === dateStr).map(c => ({ ...c, _type: 'consultation' }));
    const pe = personalEvents.filter(e => e.date === dateStr).map(e => ({ ...e, _type: 'personal' }));
    return [...bk, ...cs, ...pe];
  };

  const colorFor = (type) => type === 'booking' ? '#0e7490' : type === 'consultation' ? '#2563eb' : '#d97706';
  const labelFor = (type) => type === 'booking' ? '預約' : type === 'consultation' ? '診症' : '個人';

  const viewEvents = useMemo(() => {
    if (view === 'day') return eventsForDate(isoDate(currentDate));
    if (view === 'week') {
      const week = getWeekDates(isoDate(currentDate));
      return week.flatMap(d => eventsForDate(d));
    }
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let all = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      all = all.concat(eventsForDate(ds));
    }
    return all;
  }, [view, currentDate, bookings, consultations, personalEvents, year, month]);

  const nav = (dir) => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
    setSelectedDay(null);
  };

  const headerLabel = () => {
    if (view === 'month') return `${year}年${month + 1}月`;
    if (view === 'week') { const w = getWeekDates(isoDate(currentDate)); return `${fmtDate(w[0])} - ${fmtDate(w[6])}`; }
    return `${year}年${month + 1}月${currentDate.getDate()}日`;
  };

  const handleAddEvent = () => {
    if (!evtForm.title.trim()) { showToast && showToast('請輸入標題'); return; }
    const evt = { id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5), ...evtForm };
    saveEvents([...personalEvents, evt]);
    setShowModal(false);
    setEvtForm({ title: '', date: isoDate(new Date()), time: '10:00', type: '提醒', notes: '' });
    showToast && showToast('已新增事件');
  };

  const deletePersonalEvent = (id) => { saveEvents(personalEvents.filter(e => e.id !== id)); showToast && showToast('已刪除事件'); };

  const renderEvent = (evt, i) => {
    const color = colorFor(evt._type);
    return (
      <div key={evt.id || i} style={{ ...card, borderLeft: `4px solid ${color}`, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ ...dot(color) }} />
            <strong style={{ fontSize: 14 }}>{evt.patientName || evt.title}</strong>
            <span style={{ marginLeft: 8, fontSize: 12, color: '#666', background: `${color}18`, padding: '2px 8px', borderRadius: 4 }}>{labelFor(evt._type)}</span>
          </div>
          <span style={{ fontSize: 12, color: '#888' }}>{evt.time || ''}</span>
        </div>
        {evt.doctor && <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>醫師: {evt.doctor}</div>}
        {evt.store && <div style={{ fontSize: 12, color: '#555' }}>分店: {evt.store}</div>}
        {evt.notes && <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>{evt.notes}</div>}
        {evt.status && <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>狀態: {evt.status}</div>}
        {evt._type === 'personal' && <button onClick={() => deletePersonalEvent(evt.id)} style={{ marginTop: 6, fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>刪除</button>}
      </div>
    );
  };

  const monthGrid = getMonthGrid(year, month);

  const renderMonthView = () => (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center', marginBottom: 4 }}>
        {WEEKDAY_LABELS.map(w => <div key={w} style={{ fontWeight: 600, fontSize: 13, color: '#666', padding: 6 }}>{w}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {monthGrid.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const evts = eventsForDate(ds);
          const isToday = ds === today;
          const isSel = selectedDay === ds;
          return (
            <div key={i} onClick={() => setSelectedDay(isSel ? null : ds)} style={{ minHeight: 60, padding: 4, borderRadius: 6, cursor: 'pointer', background: isSel ? '#e0f2fe' : isToday ? '#f0fdfa' : '#fafafa', border: isToday ? `2px solid ${ACCENT}` : '1px solid #eee', transition: 'background .15s' }}>
              <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isToday ? ACCENT : '#333', textAlign: 'right', paddingRight: 4 }}>{d}</div>
              {evts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2, justifyContent: 'center' }}>
                  {evts.length <= 3 ? evts.map((e, j) => <span key={j} style={dot(colorFor(e._type))} />) : <span style={{ fontSize: 11, color: ACCENT, fontWeight: 600 }}>{evts.length}件</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selectedDay && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 8px', color: '#333' }}>{selectedDay} 事件</h4>
          {eventsForDate(selectedDay).length === 0 ? <div style={{ color: '#999', fontSize: 14 }}>無事件</div> : eventsForDate(selectedDay).map(renderEvent)}
        </div>
      )}
    </div>
  );

  const renderWeekView = () => {
    const week = getWeekDates(isoDate(currentDate));
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {week.map((ds, i) => {
          const evts = eventsForDate(ds);
          const isToday = ds === today;
          return (
            <div key={ds} style={{ ...card, padding: 8, background: isToday ? '#f0fdfa' : '#fff', border: isToday ? `2px solid ${ACCENT}` : '1px solid #eee', minHeight: 120 }}>
              <div style={{ textAlign: 'center', fontWeight: 600, fontSize: 13, color: isToday ? ACCENT : '#555', marginBottom: 6 }}>
                {WEEKDAY_LABELS[i === 0 ? 0 : i]} {fmtDate(ds)}
              </div>
              {evts.length === 0 && <div style={{ fontSize: 12, color: '#ccc', textAlign: 'center' }}>-</div>}
              {evts.map((e, j) => (
                <div key={j} style={{ fontSize: 11, padding: '3px 6px', marginBottom: 3, borderRadius: 4, background: `${colorFor(e._type)}15`, borderLeft: `3px solid ${colorFor(e._type)}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.time && <span style={{ color: '#888' }}>{e.time} </span>}
                  <span>{e.patientName || e.title}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  };

  const renderDayView = () => {
    const ds = isoDate(currentDate);
    const evts = eventsForDate(ds);
    return (
      <div>
        <h4 style={{ margin: '0 0 12px', color: '#333' }}>{headerLabel()} ({WEEKDAY_LABELS[currentDate.getDay()]})</h4>
        {evts.length === 0 ? <div style={{ ...card, color: '#999', textAlign: 'center' }}>今日無事件</div> : evts.sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(renderEvent)}
      </div>
    );
  };

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: '#1e293b' }}>我的日曆</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && (
            <select value={filterDoc} onChange={e => setFilterDoc(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="all">全部醫師</option>
              {DOCTORS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          <div style={{ display: 'flex', gap: 2 }}>
            {[['day', '日'], ['week', '週'], ['month', '月']].map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} style={btn(view === v)}>{l}</button>
            ))}
          </div>
          <button onClick={() => { setCurrentDate(new Date()); setSelectedDay(null); }} style={btn(false)}>今天</button>
          <button onClick={() => setShowModal(true)} style={{ ...btn(true), background: '#d97706' }}>+ 新增事件</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={() => nav(-1)} style={{ ...btn(false), padding: '6px 12px' }}>◀</button>
        <span style={{ fontWeight: 700, fontSize: 16, color: '#334155' }}>{headerLabel()}</span>
        <button onClick={() => nav(1)} style={{ ...btn(false), padding: '6px 12px' }}>▶</button>
      </div>

      <div style={{ ...card, padding: 12, marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center', fontSize: 13 }}>
        <span><span style={dot('#0e7490')} />預約</span>
        <span><span style={dot('#2563eb')} />診症</span>
        <span><span style={dot('#d97706')} />個人</span>
        <span style={{ marginLeft: 'auto', fontWeight: 600, color: ACCENT }}>合計: {viewEvents.length} 件事件</span>
      </div>

      {view === 'month' && renderMonthView()}
      {view === 'week' && renderWeekView()}
      {view === 'day' && renderDayView()}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>新增個人事件</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>標題 *</label>
                <input value={evtForm.title} onChange={e => setEvtForm({ ...evtForm, title: e.target.value })} style={inputStyle} placeholder="事件標題" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>日期</label>
                  <input type="date" value={evtForm.date} onChange={e => setEvtForm({ ...evtForm, date: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>時間</label>
                  <input type="time" value={evtForm.time} onChange={e => setEvtForm({ ...evtForm, time: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>類型</label>
                <select value={evtForm.type} onChange={e => setEvtForm({ ...evtForm, type: e.target.value })} style={inputStyle}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>備註</label>
                <textarea value={evtForm.notes} onChange={e => setEvtForm({ ...evtForm, notes: e.target.value })} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="備註（選填）" />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setShowModal(false)} style={btn(false)}>取消</button>
                <button onClick={handleAddEvent} style={btn(true)}>確認新增</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
