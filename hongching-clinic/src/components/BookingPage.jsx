import { useState, useMemo } from 'react';
import { saveBooking, updateBookingStatus } from '../api';
import { uid, DOCTORS } from '../data';

const TYPES = ['初診','覆診','針灸','推拿','天灸','其他'];
const STATUS_TAGS = { confirmed:'tag-fps', completed:'tag-paid', cancelled:'tag-other', 'no-show':'tag-overdue' };
const STATUS_LABELS = { confirmed:'已確認', completed:'已完成', cancelled:'已取消', 'no-show':'未到' };
const DOC_COLORS = { '常凱晴':'#0e7490', '許植輝':'#8B6914', '曾其方':'#7C3AED' };
const HOURS = Array.from({ length: 23 }, (_, i) => { const h = 9 + Math.floor(i / 2); const m = i % 2 ? '30' : '00'; return `${String(h).padStart(2,'0')}:${m}`; });

function getWeekDates(baseDate) {
  const d = new Date(baseDate);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d);
    dd.setDate(dd.getDate() + i);
    return dd.toISOString().substring(0, 10);
  });
}

const WEEKDAY_LABELS = ['一','二','三','四','五','六','日'];

export default function BookingPage({ data, setData, showToast }) {
  const [view, setView] = useState('list');
  const [showModal, setShowModal] = useState(false);
  const [filterDate, setFilterDate] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [filterStore, setFilterStore] = useState('all');
  const [filterDoc, setFilterDoc] = useState('all');
  const [calWeek, setCalWeek] = useState(new Date().toISOString().substring(0, 10));
  const [form, setForm] = useState({ patientName:'', patientPhone:'', date:'', time:'10:00', duration:30, doctor:DOCTORS[0], store:'宋皇臺', type:'覆診', notes:'' });

  const bookings = data.bookings || [];
  const today = new Date().toISOString().substring(0, 10);
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().substring(0, 10); })();

  const todayBookings = useMemo(() => bookings.filter(b => b.date === today), [bookings, today]);
  const stats = useMemo(() => ({
    today: todayBookings.length,
    completed: todayBookings.filter(b => b.status === 'completed').length,
    pending: todayBookings.filter(b => b.status === 'confirmed').length,
    noshow: todayBookings.filter(b => b.status === 'no-show').length,
  }), [todayBookings]);

  const getDateRange = () => {
    if (filterDate === 'today') return [today, today];
    if (filterDate === 'tomorrow') return [tomorrow, tomorrow];
    if (filterDate === 'week') {
      const end = new Date(); end.setDate(end.getDate() + 6);
      return [today, end.toISOString().substring(0, 10)];
    }
    if (filterDate === 'custom' && customDate) return [customDate, customDate];
    return [today, today];
  };

  const filtered = useMemo(() => {
    const [start, end] = getDateRange();
    let list = bookings.filter(b => b.date >= start && b.date <= end);
    if (filterStore !== 'all') list = list.filter(b => b.store === filterStore);
    if (filterDoc !== 'all') list = list.filter(b => b.doctor === filterDoc);
    return list.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  }, [bookings, filterDate, customDate, filterStore, filterDoc, today, tomorrow]);

  const weekDates = useMemo(() => getWeekDates(calWeek), [calWeek]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.patientName || !form.date || !form.time) return showToast('請填寫必要欄位');
    const record = { ...form, id: uid(), status: 'confirmed', createdAt: new Date().toISOString().substring(0, 10) };
    await saveBooking(record);
    setData({ ...data, bookings: [...bookings, record] });
    setShowModal(false);
    setForm({ patientName:'', patientPhone:'', date:'', time:'10:00', duration:30, doctor:DOCTORS[0], store:'宋皇臺', type:'覆診', notes:'' });
    showToast('已新增預約');
  };

  const handleUpdateStatus = async (id, status) => {
    await updateBookingStatus(id, status);
    const updated = bookings.map(b => b.id === id ? { ...b, status } : b);
    setData({ ...data, bookings: updated });
    showToast(`已更新為${STATUS_LABELS[status]}`);
  };

  const shiftWeek = (dir) => {
    const d = new Date(calWeek);
    d.setDate(d.getDate() + dir * 7);
    setCalWeek(d.toISOString().substring(0, 10));
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">今日預約</div><div className="stat-value teal">{stats.today}</div></div>
        <div className="stat-card green"><div className="stat-label">已完成</div><div className="stat-value green">{stats.completed}</div></div>
        <div className="stat-card gold"><div className="stat-label">待到</div><div className="stat-value gold">{stats.pending}</div></div>
        <div className="stat-card red"><div className="stat-label">未到 No-show</div><div className="stat-value red">{stats.noshow}</div></div>
      </div>

      {/* View Toggle + Add */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          <button className={`tab-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>📋 列表視圖</button>
          <button className={`tab-btn ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}>📅 日曆視圖</button>
        </div>
        <button className="btn btn-teal" onClick={() => setShowModal(true)}>+ 新增預約</button>
      </div>

      {/* List View */}
      {view === 'list' && (
        <>
          <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="preset-bar" style={{ marginBottom: 0 }}>
              {[['today','今日'],['tomorrow','明日'],['week','本週'],['custom','自選']].map(([k, l]) => (
                <button key={k} className={`preset-chip ${filterDate === k ? 'active' : ''}`} onClick={() => setFilterDate(k)}>{l}</button>
              ))}
            </div>
            {filterDate === 'custom' && <input type="date" style={{ width: 'auto' }} value={customDate} onChange={e => setCustomDate(e.target.value)} />}
            <select style={{ width: 'auto' }} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
              <option value="all">所有店舖</option><option>宋皇臺</option><option>太子</option>
            </select>
            <select style={{ width: 'auto' }} value={filterDoc} onChange={e => setFilterDoc(e.target.value)}>
              <option value="all">所有醫師</option>{DOCTORS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>日期</th><th>時間</th><th>病人</th><th>電話</th><th>醫師</th><th>店舖</th><th>類型</th><th>狀態</th><th>操作</th></tr></thead>
                <tbody>
                  {filtered.map(b => (
                    <tr key={b.id} style={b.status === 'cancelled' ? { opacity: 0.4 } : {}}>
                      <td>{b.date}</td>
                      <td>{b.time}</td>
                      <td style={{ fontWeight: 600 }}>{b.patientName}</td>
                      <td>{b.patientPhone}</td>
                      <td>{b.doctor}</td>
                      <td>{b.store}</td>
                      <td>{b.type}</td>
                      <td><span className={`tag ${STATUS_TAGS[b.status] || ''}`}>{STATUS_LABELS[b.status] || b.status}</span></td>
                      <td>
                        {b.status === 'confirmed' && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-green btn-sm" onClick={() => handleUpdateStatus(b.id, 'completed')}>✓</button>
                            <button className="btn btn-outline btn-sm" onClick={() => handleUpdateStatus(b.id, 'cancelled')}>✕</button>
                            <button className="btn btn-red btn-sm" onClick={() => handleUpdateStatus(b.id, 'no-show')}>NS</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24 }}>暫無預約</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Calendar View */}
      {view === 'calendar' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <button className="btn btn-outline btn-sm" onClick={() => shiftWeek(-1)}>← 上週</button>
            <strong>{weekDates[0]} ~ {weekDates[6]}</strong>
            <button className="btn btn-outline btn-sm" onClick={() => shiftWeek(1)}>下週 →</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', minWidth: 800 }}>
              <div style={{ borderBottom: '2px solid var(--gray-200)', padding: 6, fontWeight: 700, fontSize: 11 }}></div>
              {weekDates.map((d, i) => (
                <div key={d} style={{ borderBottom: '2px solid var(--gray-200)', padding: 6, fontWeight: 700, fontSize: 11, textAlign: 'center', background: d === today ? 'var(--teal-50)' : '' }}>
                  {WEEKDAY_LABELS[i]}<br/><span style={{ fontSize: 10, color: 'var(--gray-500)' }}>{d.substring(5)}</span>
                </div>
              ))}
              {HOURS.map(time => (
                <div key={time} style={{ display: 'contents' }}>
                  <div style={{ padding: '4px 6px', fontSize: 10, color: 'var(--gray-400)', borderBottom: '1px solid var(--gray-100)', textAlign: 'right' }}>{time}</div>
                  {weekDates.map(d => {
                    const cell = bookings.filter(b => b.date === d && b.time === time && b.status !== 'cancelled');
                    return (
                      <div key={d} style={{ borderBottom: '1px solid var(--gray-100)', borderLeft: '1px solid var(--gray-100)', padding: 2, minHeight: 28, cursor: 'pointer', background: d === today ? 'var(--teal-50)' : '' }}
                        onClick={() => { setForm({...form, date: d, time}); setShowModal(true); }}>
                        {cell.map(b => (
                          <div key={b.id} style={{ background: DOC_COLORS[b.doctor] || '#666', color: '#fff', fontSize: 9, padding: '2px 4px', borderRadius: 3, marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {b.patientName} ({b.type})
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>新增預約</h3>
            <form onSubmit={handleAdd}>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div><label>病人姓名 *</label><input value={form.patientName} onChange={e => setForm({...form, patientName: e.target.value})} placeholder="病人姓名" /></div>
                <div><label>電話</label><input value={form.patientPhone} onChange={e => setForm({...form, patientPhone: e.target.value})} placeholder="電話" /></div>
              </div>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div><label>日期 *</label><input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></div>
                <div><label>時間 *</label><select value={form.time} onChange={e => setForm({...form, time: e.target.value})}>{HOURS.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><label>時長</label><select value={form.duration} onChange={e => setForm({...form, duration: +e.target.value})}><option value={30}>30 分鐘</option><option value={45}>45 分鐘</option><option value={60}>60 分鐘</option></select></div>
              </div>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div><label>醫師</label><select value={form.doctor} onChange={e => setForm({...form, doctor: e.target.value})}>{DOCTORS.map(d => <option key={d}>{d}</option>)}</select></div>
                <div><label>店舖</label><select value={form.store} onChange={e => setForm({...form, store: e.target.value})}><option>宋皇臺</option><option>太子</option></select></div>
                <div><label>治療類型</label><select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
              </div>
              <div style={{ marginBottom: 12 }}><label>備註</label><input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="備註" /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-teal">確認預約</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
