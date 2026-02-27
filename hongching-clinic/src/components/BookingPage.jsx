import React, { useState, useMemo, useRef } from 'react';
import { saveBooking, updateBookingStatus, openWhatsApp, saveQueue, saveWaitlist, deleteWaitlist } from '../api';
import { uid, getDoctors, getStoreNames, getDefaultStore } from '../data';
import { getClinicName, getClinicNameEn, getTenantStores } from '../tenant';
import { useFocusTrap, nullRef } from './ConfirmModal';

const TYPES = ['初診','覆診','針灸','推拿','天灸','其他'];
const STATUS_TAGS = { pending:'tag-pending-orange', confirmed:'tag-fps', completed:'tag-paid', cancelled:'tag-other', 'no-show':'tag-overdue' };
const STATUS_LABELS = { pending:'待確認', confirmed:'已確認', completed:'已完成', cancelled:'已取消', 'no-show':'未到' };
const DOC_COLOR_PALETTE = ['#0e7490', '#8B6914', '#7C3AED', '#dc2626', '#16a34a', '#d97706'];
const getDocColors = () => {
  const doctors = getDoctors();
  const colors = {};
  doctors.forEach((d, i) => { colors[d] = DOC_COLOR_PALETTE[i % DOC_COLOR_PALETTE.length]; });
  return colors;
};
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
  const DOCTORS = getDoctors();
  const STORE_NAMES = getStoreNames();
  const DOC_COLORS = getDocColors();
  const [view, setView] = useState('list');
  const [showModal, setShowModal] = useState(false);
  const [filterDate, setFilterDate] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [filterStore, setFilterStore] = useState('all');
  const [filterDoc, setFilterDoc] = useState('all');
  const [calWeek, setCalWeek] = useState(new Date().toISOString().substring(0, 10));
  const [form, setForm] = useState({ patientName:'', patientPhone:'', date:'', time:'10:00', duration:30, doctor:DOCTORS[0], store:getDefaultStore(), type:'覆診', notes:'', recurring:'none', recurCount:4 });
  const [showReminderPanel, setShowReminderPanel] = useState(false);
  const [showWaitlistPanel, setShowWaitlistPanel] = useState(false);
  const [showWaitlistForm, setShowWaitlistForm] = useState(null); // {date, time, doctor} or null
  const [wlForm, setWlForm] = useState({ patientName: '', patientPhone: '', notes: '' });
  const [remindersSent, setRemindersSent] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_reminders_sent') || '{}'); } catch { return {}; }
  });
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

  // ── Waitlist Management ──
  const waitlist = data.waitlist || [];
  const activeWaitlist = useMemo(() => waitlist.filter(w => w.status === 'waiting'), [waitlist]);

  const getWaitlistCount = (date, time, doctor) => {
    return activeWaitlist.filter(w => w.date === date && w.time === time && w.doctor === doctor).length;
  };

  const totalWaitlistCount = activeWaitlist.length;

  const handleAddToWaitlist = async (e) => {
    e.preventDefault();
    if (!wlForm.patientName || !showWaitlistForm) return showToast('請填寫病人姓名');
    const record = {
      id: uid(),
      patientName: wlForm.patientName,
      patientPhone: wlForm.patientPhone,
      date: showWaitlistForm.date,
      time: showWaitlistForm.time,
      doctor: showWaitlistForm.doctor,
      store: showWaitlistForm.store || getDefaultStore(),
      notes: wlForm.notes,
      status: 'waiting',
      createdAt: new Date().toISOString(),
    };
    await saveWaitlist(record);
    setData({ ...data, waitlist: [...waitlist, record] });
    setShowWaitlistForm(null);
    setWlForm({ patientName: '', patientPhone: '', notes: '' });
    showToast(`${record.patientName} 已加入候補名單`);
  };

  const handleRemoveWaitlist = async (id) => {
    await deleteWaitlist(id);
    setData({ ...data, waitlist: waitlist.filter(w => w.id !== id) });
    showToast('已從候補名單移除');
  };

  const handlePromoteWaitlist = async (wl) => {
    // Promote waitlist entry to a confirmed booking
    const record = {
      id: uid(),
      patientName: wl.patientName,
      patientPhone: wl.patientPhone,
      date: wl.date,
      time: wl.time,
      doctor: wl.doctor,
      store: wl.store,
      type: '覆診',
      duration: 30,
      notes: wl.notes ? `(候補) ${wl.notes}` : '(候補轉正)',
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    await saveBooking(record);
    // Update waitlist entry status
    const updatedWl = { ...wl, status: 'promoted' };
    await saveWaitlist(updatedWl);
    setData({
      ...data,
      bookings: [...bookings, record],
      waitlist: waitlist.map(w => w.id === wl.id ? updatedWl : w),
    });
    showToast(`${wl.patientName} 已轉為正式預約`);
    // Send WhatsApp notification if phone available
    if (wl.patientPhone) {
      const text = `【${getClinicName()}】${wl.patientName}你好！你嘅候補預約已確認：\n` +
        `日期: ${wl.date} ${wl.time}\n醫師: ${wl.doctor}\n地點: ${wl.store}\n請準時到達！`;
      openWhatsApp(wl.patientPhone, text);
    }
  };

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

  // ── Upcoming bookings (next 3 days) for reminder panel ──
  const upcomingBookings = useMemo(() => {
    const d1 = tomorrow;
    const d2 = (() => { const d = new Date(); d.setDate(d.getDate() + 2); return d.toISOString().substring(0, 10); })();
    const d3 = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().substring(0, 10); })();
    return bookings.filter(b => [d1, d2, d3].includes(b.date) && (b.status === 'confirmed' || b.status === 'pending'));
  }, [bookings, tomorrow]);

  const isReminderSent = (bookingId) => !!remindersSent[bookingId];

  const markReminderSent = (ids) => {
    const updated = { ...remindersSent };
    ids.forEach(id => { updated[id] = new Date().toISOString(); });
    setRemindersSent(updated);
    localStorage.setItem('hcmc_reminders_sent', JSON.stringify(updated));
  };

  const buildReminderText = (b, dayText) => {
    const clinic = getClinicName();
    return `【${clinic}】${b.patientName}你好！提醒你${dayText}預約：\n` +
      `日期: ${b.date} ${b.time}\n` +
      `醫師: ${b.doctor}\n` +
      `地點: ${b.store}\n` +
      `類型: ${b.type}\n` +
      `請準時到達，如需更改請提前聯絡。多謝！`;
  };

  // Batch reminders: queue one at a time, user clicks through each
  const batchQueueRef = useRef([]);
  const [batchIdx, setBatchIdx] = useState(-1);

  const sendBatchReminders = () => {
    const withPhone = tomorrowBookings.filter(b => b.patientPhone);
    if (!withPhone.length) return showToast('明日預約暫無電話記錄');
    const unsent = withPhone.filter(b => !isReminderSent(b.id));
    if (!unsent.length) return showToast('明日預約已全部發送提醒');
    // Send the first one immediately, queue the rest
    const first = unsent[0];
    openWhatsApp(first.patientPhone, buildReminderText(first, '明日'));
    markReminderSent([first.id]);
    if (unsent.length > 1) {
      batchQueueRef.current = unsent.slice(1);
      setBatchIdx(0);
      showToast(`已開啟第 1/${unsent.length} 位。點擊「下一位」繼續發送。`);
    } else {
      showToast('已開啟 WhatsApp 提醒');
    }
  };

  const sendNextBatchReminder = () => {
    const queue = batchQueueRef.current;
    if (!queue.length) return;
    const b = queue.shift();
    openWhatsApp(b.patientPhone, buildReminderText(b, '明日'));
    markReminderSent([b.id]);
    setBatchIdx(i => i + 1);
    if (queue.length === 0) {
      setBatchIdx(-1);
      showToast('全部提醒已發送完畢！');
    } else {
      showToast(`已發送，餘下 ${queue.length} 位`);
    }
  };

  const sendSingleReminder = (b) => {
    if (!b.patientPhone) return showToast('此預約沒有電話號碼');
    const daysUntil = Math.ceil((new Date(b.date) - new Date()) / 86400000);
    const dayText = daysUntil === 1 ? '明日' : daysUntil === 2 ? '後日' : `${b.date}`;
    openWhatsApp(b.patientPhone, buildReminderText(b, dayText));
    markReminderSent([b.id]);
    showToast('已開啟 WhatsApp 提醒');
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

    // Generate dates for recurring bookings
    const dates = [form.date];
    if (form.recurring !== 'none') {
      const count = Math.min(form.recurCount || 4, 26);
      const dayInterval = form.recurring === 'weekly' ? 7 : form.recurring === 'biweekly' ? 14 : 30;
      for (let i = 1; i < count; i++) {
        const d = new Date(form.date);
        d.setDate(d.getDate() + dayInterval * i);
        dates.push(d.toISOString().substring(0, 10));
      }
    }

    const seriesId = form.recurring !== 'none' ? uid() : null;
    const newBookings = [];
    for (const date of dates) {
      const record = {
        patientName: form.patientName, patientPhone: form.patientPhone,
        date, time: form.time, duration: form.duration,
        doctor: form.doctor, store: form.store, type: form.type, notes: form.notes,
        id: uid(), status: 'confirmed',
        createdAt: new Date().toISOString().substring(0, 10),
        ...(seriesId ? { seriesId, recurring: form.recurring } : {}),
      };
      await saveBooking(record);
      newBookings.push(record);
    }

    setData({ ...data, bookings: [...bookings, ...newBookings] });
    setShowModal(false);
    if (form.patientPhone) sendBookingWA(newBookings[0]);
    setForm({ patientName:'', patientPhone:'', date:'', time:'10:00', duration:30, doctor:DOCTORS[0], store:getDefaultStore(), type:'覆診', notes:'', recurring:'none', recurCount:4 });
    showToast(dates.length > 1 ? `已新增 ${dates.length} 個定期預約` : '已新增預約');
  };

  const handleUpdateStatus = async (id, status) => {
    await updateBookingStatus(id, status);
    const updated = bookings.map(b => b.id === id ? { ...b, status } : b);
    setData({ ...data, bookings: updated });
    showToast(`已更新為${STATUS_LABELS[status]}`);
    // If cancelled, check waitlist and notify
    if (status === 'cancelled') {
      const cancelled = bookings.find(b => b.id === id);
      if (cancelled) {
        const waiting = activeWaitlist.filter(w => w.date === cancelled.date && w.doctor === cancelled.doctor);
        if (waiting.length > 0) {
          showToast(`有 ${waiting.length} 位候補中，可前往候補名單處理`);
        }
      }
    }
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
            <div class="clinic-name">${getClinicName()}</div>
            <div class="clinic-en">${getClinicNameEn().toUpperCase()}</div>
          </div>
          <div class="badge">預約確認卡</div>
        </div>
        <div class="highlight">
          📅 ${b.date} &nbsp;&nbsp; ⏰ ${b.time}
        </div>
        <div class="info">
          <div class="row"><span class="label">病人姓名：</span><span class="value">${b.patientName}</span></div>
          <div class="row"><span class="label">主診醫師：</span><span class="value">👨‍⚕️ ${b.doctor}</span></div>
          <div class="row"><span class="label">診所地址：</span><span class="value">📍 ${(getTenantStores().find(s => s.name === b.store) || {}).address || b.store}</span></div>
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
    const text = `【${getClinicName()}】${b.patientName}你好！你嘅預約已確認：\n` +
      `日期: ${b.date} ${b.time}\n` +
      `醫師: ${b.doctor}\n` +
      `地點: ${b.store}\n` +
      `類型: ${b.type}\n` +
      `請準時到達，如需更改請提前聯絡。多謝！`;
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
      <h1>${getClinicName()} — 週預約排班表</h1>
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
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="stat-card teal"><div className="stat-label">今日預約</div><div className="stat-value teal">{stats.today}</div></div>
        <div className="stat-card green"><div className="stat-label">已完成</div><div className="stat-value green">{stats.completed}</div></div>
        <div className="stat-card gold"><div className="stat-label">待到</div><div className="stat-value gold">{stats.pending}</div></div>
        <div className="stat-card red"><div className="stat-label">未到 No-show</div><div className="stat-value red">{stats.noshow}</div></div>
        <div className="stat-card" style={{ borderLeft: '4px solid #d97706' }}><div className="stat-label">候補中</div><div className="stat-value" style={{ color: '#d97706' }}>{totalWaitlistCount}</div></div>
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
          <button className={`tab-btn ${view === 'waitlist' ? 'active' : ''}`} onClick={() => setView('waitlist')} style={{ position: 'relative' }}>
            ⏳ 候補名單{totalWaitlistCount > 0 && <span style={{ marginLeft: 4, background: '#dc2626', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{totalWaitlistCount}</span>}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {upcomingBookings.length > 0 && (
            <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 12 }} onClick={() => setShowReminderPanel(!showReminderPanel)}>
              📱 提醒中心 ({upcomingBookings.filter(b => !isReminderSent(b.id) && b.patientPhone).length})
            </button>
          )}
          {tomorrowBookings.length > 0 && batchIdx < 0 && (
            <button className="btn btn-sm btn-outline" style={{ fontSize: 12 }} onClick={sendBatchReminders}>
              批量提醒明日 ({tomorrowBookings.filter(b => !isReminderSent(b.id) && b.patientPhone).length})
            </button>
          )}
          {batchIdx >= 0 && batchQueueRef.current.length > 0 && (
            <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 12, animation: 'pulse 1.5s infinite' }} onClick={sendNextBatchReminder}>
              下一位 ({batchQueueRef.current.length} 位餘下)
            </button>
          )}
          <button className="btn btn-teal" onClick={() => setShowModal(true)}>+ 新增預約</button>
        </div>
      </div>

      {/* Reminder Panel */}
      {showReminderPanel && upcomingBookings.length > 0 && (
        <div className="card" style={{ border: '1px solid #25D366', background: '#f0fdf4' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 14, color: '#16a34a' }}>📱 預約提醒中心</h3>
            <button className="btn btn-outline btn-sm" onClick={() => setShowReminderPanel(false)}>✕</button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th>日期</th><th>時間</th><th>病人</th><th>電話</th><th>醫師</th><th>店舖</th><th>提醒狀態</th><th>操作</th></tr>
              </thead>
              <tbody>
                {upcomingBookings.map(b => {
                  const sent = isReminderSent(b.id);
                  const daysUntil = Math.ceil((new Date(b.date) - new Date()) / 86400000);
                  return (
                    <tr key={b.id} style={sent ? { opacity: 0.5 } : {}}>
                      <td>{b.date}</td>
                      <td>{b.time}</td>
                      <td style={{ fontWeight: 600 }}>{b.patientName}</td>
                      <td>{b.patientPhone || <span style={{ color: '#dc2626', fontSize: 11 }}>無電話</span>}</td>
                      <td>{b.doctor}</td>
                      <td>{b.store}</td>
                      <td>
                        {sent ? (
                          <span style={{ color: '#16a34a', fontSize: 11, fontWeight: 600 }}>✓ 已提醒</span>
                        ) : daysUntil <= 1 ? (
                          <span style={{ color: '#dc2626', fontSize: 11, fontWeight: 600 }}>待提醒</span>
                        ) : (
                          <span style={{ color: '#d97706', fontSize: 11 }}>{daysUntil}天後</span>
                        )}
                      </td>
                      <td>
                        {!sent && b.patientPhone && (
                          <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 11 }} onClick={() => sendSingleReminder(b)}>發送</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--gray-500)' }}>
            共 {upcomingBookings.length} 個預約 | 已提醒 {upcomingBookings.filter(b => isReminderSent(b.id)).length} | 待提醒 {upcomingBookings.filter(b => !isReminderSent(b.id) && b.patientPhone).length} | 無電話 {upcomingBookings.filter(b => !b.patientPhone).length}
          </div>
        </div>
      )}

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
              <option value="all">所有店舖</option>{STORE_NAMES.map(s => <option key={s}>{s}</option>)}
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
                        {b.seriesId && <span style={{ marginLeft: 4, fontSize: 8, padding: '1px 5px', borderRadius: 8, background: '#0e749018', color: '#0e7490', fontWeight: 700 }}>🔄</span>}
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
                    const wlCount = DOCTORS.reduce((sum, doc) => sum + getWaitlistCount(d, time, doc), 0);
                    return (
                      <div key={d} style={{ borderBottom: '1px solid var(--gray-100)', borderLeft: '1px solid var(--gray-100)', padding: 2, minHeight: 28, cursor: 'pointer', background: d === today ? 'var(--teal-50)' : '' }}
                        onClick={() => { setForm({...form, date: d, time}); setShowModal(true); }}>
                        {cell.map(b => (
                          <div key={b.id} style={{ background: DOC_COLORS[b.doctor] || '#666', color: '#fff', fontSize: 9, padding: '2px 4px', borderRadius: 3, marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {b.patientName} ({b.type})
                          </div>
                        ))}
                        {wlCount > 0 && <div style={{ fontSize: 8, color: '#d97706', fontWeight: 700, textAlign: 'right' }}>⏳{wlCount}候補</div>}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Waitlist View */}
      {view === 'waitlist' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, color: 'var(--teal-700)' }}>⏳ 候補名單</h3>
            <button className="btn btn-teal btn-sm" onClick={() => setShowWaitlistForm({ date: tomorrow, time: '10:00', doctor: DOCTORS[0], store: getDefaultStore() })}>+ 新增候補</button>
          </div>
          {activeWaitlist.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無候補預約</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>日期</th><th>時間</th><th>病人</th><th>電話</th><th>醫師</th><th>店舖</th><th>備註</th><th>加入時間</th><th>操作</th></tr></thead>
                <tbody>
                  {activeWaitlist.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map(w => {
                    // Check if slot now has availability
                    const conflicts = checkConflict(w.date, w.time, w.doctor, 30);
                    const hasSlot = conflicts.length === 0;
                    return (
                      <tr key={w.id} style={hasSlot ? { background: '#f0fdf4' } : {}}>
                        <td>{w.date}</td>
                        <td>{w.time}</td>
                        <td style={{ fontWeight: 600 }}>{w.patientName}</td>
                        <td>{w.patientPhone || '-'}</td>
                        <td>{w.doctor}</td>
                        <td>{w.store}</td>
                        <td style={{ fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.notes || '-'}</td>
                        <td style={{ fontSize: 11, color: 'var(--gray-500)' }}>{w.createdAt ? new Date(w.createdAt).toLocaleDateString('zh-HK') : '-'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {hasSlot && <button className="btn btn-teal btn-sm" onClick={() => handlePromoteWaitlist(w)} title="轉為正式預約">✓ 確認</button>}
                            {w.patientPhone && (
                              <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 11 }} onClick={() => {
                                const text = hasSlot
                                  ? `【${getClinicName()}】${w.patientName}你好！你嘅候補時段已有空位：\n${w.date} ${w.time} ${w.doctor}\n請盡快回覆確認！`
                                  : `【${getClinicName()}】${w.patientName}你好！你目前在候補名單中 (${w.date} ${w.time})，我哋會有空位時通知你。`;
                                openWhatsApp(w.patientPhone, text);
                              }}>WA</button>
                            )}
                            <button className="btn btn-outline btn-sm" style={{ color: '#dc2626' }} onClick={() => handleRemoveWaitlist(w.id)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Summary */}
          {activeWaitlist.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--gray-500)', display: 'flex', gap: 16 }}>
              <span>共 {activeWaitlist.length} 位候補</span>
              <span style={{ color: '#16a34a', fontWeight: 600 }}>
                {activeWaitlist.filter(w => checkConflict(w.date, w.time, w.doctor, 30).length === 0).length} 位有空位可確認
              </span>
            </div>
          )}
        </div>
      )}

      {/* Waitlist Add Form Modal */}
      {showWaitlistForm && (
        <div className="modal-overlay" onClick={() => setShowWaitlistForm(null)} role="dialog" aria-modal="true" aria-label="新增候補">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>新增候補預約</h3>
            <form onSubmit={handleAddToWaitlist}>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div><label>病人姓名 *</label><input value={wlForm.patientName} onChange={e => setWlForm({ ...wlForm, patientName: e.target.value })} placeholder="病人姓名" autoFocus /></div>
                <div><label>電話</label><input value={wlForm.patientPhone} onChange={e => setWlForm({ ...wlForm, patientPhone: e.target.value })} placeholder="電話（用作通知）" /></div>
              </div>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div><label>希望日期</label><input type="date" value={showWaitlistForm.date} onChange={e => setShowWaitlistForm({ ...showWaitlistForm, date: e.target.value })} /></div>
                <div><label>希望時間</label><select value={showWaitlistForm.time} onChange={e => setShowWaitlistForm({ ...showWaitlistForm, time: e.target.value })}>{HOURS.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><label>醫師</label><select value={showWaitlistForm.doctor} onChange={e => setShowWaitlistForm({ ...showWaitlistForm, doctor: e.target.value })}>{DOCTORS.map(d => <option key={d}>{d}</option>)}</select></div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>店舖</label>
                <select value={showWaitlistForm.store} onChange={e => setShowWaitlistForm({ ...showWaitlistForm, store: e.target.value })}>{STORE_NAMES.map(s => <option key={s}>{s}</option>)}</select>
              </div>
              <div style={{ marginBottom: 12 }}><label>備註</label><input value={wlForm.notes} onChange={e => setWlForm({ ...wlForm, notes: e.target.value })} placeholder="特別要求或備註" /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-teal">加入候補</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowWaitlistForm(null)}>取消</button>
              </div>
            </form>
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
                <div><label>店舖</label><select value={form.store} onChange={e => setForm({...form, store: e.target.value})}>{STORE_NAMES.map(s => <option key={s}>{s}</option>)}</select></div>
                <div><label>治療類型</label><select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
              </div>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div>
                  <label>定期預約</label>
                  <select value={form.recurring} onChange={e => setForm({...form, recurring: e.target.value})}>
                    <option value="none">單次</option>
                    <option value="weekly">每週</option>
                    <option value="biweekly">隔週</option>
                    <option value="monthly">每月</option>
                  </select>
                </div>
                {form.recurring !== 'none' && (
                  <div>
                    <label>重複次數</label>
                    <select value={form.recurCount} onChange={e => setForm({...form, recurCount: +e.target.value})}>
                      {[2,3,4,5,6,8,10,12].map(n => <option key={n} value={n}>{n} 次</option>)}
                    </select>
                  </div>
                )}
              </div>
              {form.recurring !== 'none' && form.date && (
                <div style={{ marginBottom: 12, padding: '6px 10px', background: 'var(--teal-50)', borderRadius: 6, fontSize: 11, color: 'var(--teal-700)' }}>
                  將會建立 {form.recurCount} 個{form.recurring === 'weekly' ? '每週' : form.recurring === 'biweekly' ? '隔週' : '每月'}預約，從 {form.date} 開始
                </div>
              )}
              <div style={{ marginBottom: 12 }}><label>備註</label><input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="備註" /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-teal">確認預約</button>
                <button type="button" className="btn btn-sm" style={{ background: '#d97706', color: '#fff' }} onClick={() => {
                  setShowModal(false);
                  setShowWaitlistForm({ date: form.date, time: form.time, doctor: form.doctor, store: form.store });
                  setWlForm({ patientName: form.patientName, patientPhone: form.patientPhone, notes: form.notes });
                }}>⏳ 加入候補</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
