import React, { useState, useMemo, useRef } from 'react';
import { saveBooking, updateBookingStatus, openWhatsApp, saveQueue } from '../api';
import { uid, DOCTORS } from '../data';
import { useFocusTrap, nullRef } from './ConfirmModal';

const TYPES = ['初診','覆診','針灸','推拿','天灸','其他'];
const STATUS_TAGS = { pending:'tag-pending-orange', confirmed:'tag-fps', completed:'tag-paid', cancelled:'tag-other', 'no-show':'tag-overdue' };
const STATUS_LABELS = { pending:'待確認', confirmed:'已確認', completed:'已完成', cancelled:'已取消', 'no-show':'未到' };
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
  const addModalRef = useRef(null);
  useFocusTrap(showModal ? addModalRef : nullRef);

  const bookings = data.bookings || [];
  const today = new Date().toISOString().substring(0, 10);
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().substring(0, 10); })();

  const todayBookings = useMemo(() => bookings.filter(b => b.date === today), [bookings, today]);
  const stats = useMemo(() => ({
    today: todayBookings.length,
    completed: todayBookings.filter(b => b.status === 'completed').length,
    pending: todayBookings.filter(b => b.status === 'confirmed' || b.status === 'pending').length,
    noshow: todayBookings.filter(b => b.status === 'no-show').length,
  }), [todayBookings]);

  // ── No-Show Risk Tracking ──
  const noShowCounts = useMemo(() => {
    const counts = {};
    bookings.filter(b => b.status === 'no-show').forEach(b => {
      const key = b.patientPhone || b.patientName;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [bookings]);

  const getNoShowRisk = (b) => {
    const key = b.patientPhone || b.patientName;
    const count = noShowCounts[key] || 0;
    if (count >= 3) return { level: 'high', count, color: '#dc2626', label: '高風險' };
    if (count >= 1) return { level: 'warn', count, color: '#d97706', label: '注意' };
    return null;
  };

  // Smart scheduling: analyze busiest hours
  const smartHints = useMemo(() => {
    const hourCounts = {};
    const dayCounts = {};
    bookings.filter(b => b.status !== 'cancelled').forEach(b => {
      if (b.time) { const h = b.time.substring(0, 2); hourCounts[h] = (hourCounts[h] || 0) + 1; }
      if (b.date) { const d = new Date(b.date).getDay(); dayCounts[d] = (dayCounts[d] || 0) + 1; }
    });
    const busiestHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    const quietestHour = Object.entries(hourCounts).sort((a, b) => a[1] - b[1])[0];
    const busiestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
    const dayNames = ['日','一','二','三','四','五','六'];
    return {
      busiestHour: busiestHour ? `${busiestHour[0]}:00` : '-',
      quietestHour: quietestHour ? `${quietestHour[0]}:00` : '-',
      busiestDay: busiestDay ? `星期${dayNames[busiestDay[0]]}` : '-',
      avgDaily: bookings.length > 0 ? (bookings.length / 30).toFixed(1) : '0',
    };
  }, [bookings]);

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

  // ── Conflict Detection (#38) ──
  const checkConflict = (date, time, doctor, duration) => {
    const startMin = parseInt(time.split(':')[0]) * 60 + parseInt(time.split(':')[1]);
    const endMin = startMin + (duration || 30);
    return bookings.filter(b =>
      b.date === date && b.doctor === doctor &&
      b.status !== 'cancelled' && b.status !== 'no-show'
    ).filter(b => {
      const bStart = parseInt(b.time.split(':')[0]) * 60 + parseInt(b.time.split(':')[1]);
      const bEnd = bStart + (b.duration || 30);
      return startMin < bEnd && endMin > bStart;
    });
  };

  // ── Batch WhatsApp Reminders (#41) ──
  const tomorrowBookings = useMemo(() =>
    bookings.filter(b => b.date === tomorrow && (b.status === 'confirmed' || b.status === 'pending'))
  , [bookings, tomorrow]);

  const sendBatchReminders = () => {
    const withPhone = tomorrowBookings.filter(b => b.patientPhone);
    if (!withPhone.length) return showToast('明日預約暫無電話記錄');
    withPhone.forEach((b, i) => {
      setTimeout(() => {
        const text = `【康晴醫療中心】${b.patientName}你好！提醒你明日預約：\n📅 ${b.date} ${b.time}\n👨‍⚕️ ${b.doctor}\n📍 ${b.store}\n類型：${b.type}\n請準時到達，如需更改請提前聯絡。多謝！`;
        openWhatsApp(b.patientPhone, text);
      }, i * 1500);
    });
    showToast(`已逐一開啟 ${withPhone.length} 位病人的 WhatsApp 提醒`);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.patientName || !form.date || !form.time) return showToast('請填寫必要欄位');
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
    if (new Date(form.date) < todayDate) return showToast('不能預約過去的日期');
    // Conflict detection
    const conflicts = checkConflict(form.date, form.time, form.doctor, form.duration);
    if (conflicts.length > 0) {
      const confNames = conflicts.map(c => `${c.time} ${c.patientName}`).join('、');
      if (!window.confirm(`⚠️ 時間衝突！${form.doctor} 在此時段已有預約：\n${confNames}\n\n是否仍要新增？`)) return;
    }
    const record = { ...form, id: uid(), status: 'confirmed', createdAt: new Date().toISOString().substring(0, 10) };
    await saveBooking(record);
    setData({ ...data, bookings: [...bookings, record] });
    setShowModal(false);
    if (form.patientPhone) sendBookingWA(record);
    setForm({ patientName:'', patientPhone:'', date:'', time:'10:00', duration:30, doctor:DOCTORS[0], store:'宋皇臺', type:'覆診', notes:'' });
    showToast('已新增預約');
  };

  const handleUpdateStatus = async (id, status) => {
    await updateBookingStatus(id, status);
    const updated = bookings.map(b => b.id === id ? { ...b, status } : b);
    setData({ ...data, bookings: updated });
    showToast(`已更新為${STATUS_LABELS[status]}`);
  };

  // ── Appointment Card Printing (#48) ──
  const printAppointmentCard = (b) => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>預約卡 - ${b.patientName}</title>
      <style>
        @page { size: 100mm 65mm; margin: 0; }
        body { font-family: 'Microsoft YaHei', 'PingFang TC', sans-serif; margin: 0; padding: 0; }
        .card { width: 96mm; height: 61mm; border: 2px solid #0d9488; border-radius: 8px; padding: 8mm; box-sizing: border-box; position: relative; overflow: hidden; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4mm; border-bottom: 1.5px solid #0d9488; padding-bottom: 3mm; }
        .clinic-name { font-size: 14px; font-weight: 800; color: #0d9488; }
        .clinic-en { font-size: 8px; color: #888; }
        .badge { background: #0d9488; color: #fff; font-size: 9px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
        .info { margin-bottom: 2mm; }
        .row { display: flex; margin-bottom: 1.5mm; font-size: 11px; }
        .label { color: #666; min-width: 18mm; }
        .value { font-weight: 700; color: #333; }
        .highlight { font-size: 13px; font-weight: 800; color: #0d9488; background: #f0fdfa; padding: 2mm 3mm; border-radius: 4px; margin: 2mm 0; text-align: center; }
        .footer { position: absolute; bottom: 4mm; left: 8mm; right: 8mm; font-size: 8px; color: #aaa; text-align: center; border-top: 1px dashed #ddd; padding-top: 2mm; }
        @media print { body { margin: 0; } }
      </style>
    </head><body>
      <div class="card">
        <div class="header">
          <div>
            <div class="clinic-name">康晴綜合醫療中心</div>
            <div class="clinic-en">HONG CHING MEDICAL CENTRE</div>
          </div>
          <div class="badge">預約確認卡</div>
        </div>
        <div class="highlight">
          📅 ${b.date} &nbsp;&nbsp; ⏰ ${b.time}
        </div>
        <div class="info">
          <div class="row"><span class="label">病人姓名：</span><span class="value">${b.patientName}</span></div>
          <div class="row"><span class="label">主診醫師：</span><span class="value">👨‍⚕️ ${b.doctor}</span></div>
          <div class="row"><span class="label">診所地址：</span><span class="value">📍 ${b.store === '太子' ? '太子彌敦道788號利安大廈1樓B室' : '九龍宋皇臺道38號傲寓地下5號舖'}</span></div>
          <div class="row"><span class="label">治療類型：</span><span class="value">${b.type}</span></div>
          ${b.notes ? `<div class="row"><span class="label">備註：</span><span class="value">${b.notes}</span></div>` : ''}
        </div>
        <div class="footer">如需更改或取消預約，請提前致電診所。多謝！</div>
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const sendBookingWA = (b) => {
    const text = `【康晴醫療中心】${b.patientName}你好！你嘅預約已確認：\n📅 ${b.date} ${b.time}\n👨‍⚕️ ${b.doctor}\n📍 ${b.store}\n類型：${b.type}\n請準時到達，如需更改請提前聯絡。多謝！`;
    openWhatsApp(b.patientPhone, text);
    showToast('已開啟 WhatsApp');
  };

  // ── Booking-to-Queue Auto-Link (#62) ──
  const sendToQueue = async (b) => {
    const queue = data.queue || [];
    const alreadyQueued = queue.find(q => q.bookingId === b.id && q.date === today);
    if (alreadyQueued) return showToast(`${b.patientName} 已在排隊中`);
    const now = new Date();
    const registeredAt = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const queueItem = {
      id: uid(), bookingId: b.id, date: today, patientName: b.patientName, patientPhone: b.patientPhone || '',
      doctor: b.doctor, store: b.store, type: b.type, status: 'waiting', registeredAt, notes: b.notes || '',
    };
    await saveQueue(queueItem);
    setData({ ...data, queue: [...queue, queueItem] });
    await handleUpdateStatus(b.id, 'completed');
    showToast(`${b.patientName} 已加入排隊`);
  };

  // ── Print Weekly Schedule (#71) ──
  const printWeeklySchedule = () => {
    const dates = getWeekDates(calWeek);
    const dayLabels = ['一', '二', '三', '四', '五', '六', '日'];
    const w = window.open('', '_blank');
    if (!w) return;
    const timeSlots = HOURS.filter((_, i) => i % 2 === 0); // every hour
    const cells = timeSlots.map(time => {
      const nextTime = HOURS[HOURS.indexOf(time) + 2] || '21:00';
      return `<tr><td style="font-size:10px;color:#888;text-align:right;padding:4px 6px;width:50px">${time}</td>` +
        dates.map(d => {
          const items = bookings.filter(b => b.date === d && b.time >= time && b.time < nextTime && b.status !== 'cancelled');
          return `<td style="border:1px solid #eee;padding:2px;font-size:9px;vertical-align:top;min-width:100px">${
            items.map(b => `<div style="background:${DOC_COLORS[b.doctor] || '#888'};color:#fff;padding:1px 4px;border-radius:3px;margin:1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${b.time} ${b.patientName}</div>`).join('')
          }</td>`;
        }).join('') + '</tr>';
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>週排班表</title><style>
      @page{size:A4 landscape;margin:10mm}body{font-family:'Microsoft YaHei',sans-serif;padding:10px}
      h1{color:#0e7490;font-size:16px;margin:0 0 8px}table{width:100%;border-collapse:collapse}
      th{background:#0e7490;color:#fff;padding:6px;font-size:11px;text-align:center}
      .footer{text-align:center;font-size:9px;color:#aaa;margin-top:10px}
    </style></head><body>
      <h1>康晴綜合醫療中心 — 週預約排班表</h1>
      <p style="font-size:11px;color:#888">${dates[0]} ~ ${dates[6]}</p>
      <table><thead><tr><th></th>${dates.map((d, i) => `<th>星期${dayLabels[i]}<br/>${d.substring(5)}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table>
      <div style="margin-top:8px;font-size:10px;display:flex;gap:12px">${DOCTORS.map(d => `<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:3px;background:${DOC_COLORS[d] || '#888'}"></span>${d}</span>`).join('')}</div>
      <div class="footer">列印時間: ${new Date().toLocaleString('zh-HK')}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
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

      {/* Smart Scheduling Hints */}
      <div className="card" style={{ padding: '10px 16px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, alignItems: 'center', background: 'var(--teal-50)', border: '1px solid var(--teal-200)' }}>
        <span style={{ fontWeight: 700, color: 'var(--teal-700)' }}>📊 智能排程</span>
        <span>最繁忙時段：<strong>{smartHints.busiestHour}</strong></span>
        <span>建議預約：<strong>{smartHints.quietestHour}</strong></span>
        <span>最繁忙日：<strong>{smartHints.busiestDay}</strong></span>
        <span>日均預約：<strong>{smartHints.avgDaily}</strong></span>
      </div>

      {/* View Toggle + Add */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          <button className={`tab-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>📋 列表視圖</button>
          <button className={`tab-btn ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}>📅 日曆視圖</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tomorrowBookings.length > 0 && (
            <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 12 }} onClick={sendBatchReminders}>
              📱 明日提醒 ({tomorrowBookings.length})
            </button>
          )}
          <button className="btn btn-teal" onClick={() => setShowModal(true)}>+ 新增預約</button>
        </div>
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
                      <td style={{ fontWeight: 600 }}>
                        {b.patientName}
                        {(() => { const risk = getNoShowRisk(b); return risk ? <span style={{ marginLeft: 4, fontSize: 9, padding: '1px 5px', borderRadius: 8, background: risk.color + '18', color: risk.color, fontWeight: 700 }}>NS×{risk.count}</span> : null; })()}
                      </td>
                      <td>{b.patientPhone}</td>
                      <td>{b.doctor}</td>
                      <td>{b.store}</td>
                      <td>{b.type}</td>
                      <td><span className={`tag ${STATUS_TAGS[b.status] || ''}`}>{STATUS_LABELS[b.status] || b.status}</span></td>
                      <td>
                        {b.status === 'pending' && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-teal btn-sm" onClick={() => handleUpdateStatus(b.id, 'confirmed')}>確認</button>
                            <button className="btn btn-outline btn-sm" onClick={() => handleUpdateStatus(b.id, 'cancelled')}>✕</button>
                          </div>
                        )}
                        {b.status === 'confirmed' && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            {b.date === today && <button className="btn btn-teal btn-sm" onClick={() => sendToQueue(b)} title="到診掛號">🎫</button>}
                            <button className="btn btn-green btn-sm" onClick={() => handleUpdateStatus(b.id, 'completed')}>✓</button>
                            {b.patientPhone && <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 11 }} onClick={() => sendBookingWA(b)}>WA</button>}
                            <button className="btn btn-outline btn-sm" onClick={() => printAppointmentCard(b)} title="列印預約卡">🖨️</button>
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong>{weekDates[0]} ~ {weekDates[6]}</strong>
              <button className="btn btn-teal btn-sm" onClick={printWeeklySchedule}>🖨️ 列印</button>
            </div>
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
                <React.Fragment key={time}>
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
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)} role="dialog" aria-modal="true" aria-label="新增預約">
          <div className="modal" onClick={e => e.stopPropagation()} ref={addModalRef}>
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
