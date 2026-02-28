import React, { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getDoctors } from '../data';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

const ACC = '#0e7490';
const ROOMS = [
  { id: 'r1', name: '診療室1', type: '診療', capacity: 2, equipment: '診療床、脈枕、血壓計' },
  { id: 'r2', name: '診療室2', type: '診療', capacity: 2, equipment: '診療床、脈枕、針灸用品' },
  { id: 'r3', name: '針灸房', type: '針灸', capacity: 3, equipment: '針灸床x3、TDP燈、電針機' },
  { id: 'r4', name: '推拿房', type: '推拿', capacity: 2, equipment: '推拿床x2、毛巾、精油' },
  { id: 'r5', name: '拔罐房', type: '拔罐', capacity: 2, equipment: '拔罐床、火罐套裝、刮痧板' },
];
const ROOM_COLORS = { '診療': '#0e7490', '針灸': '#7C3AED', '推拿': '#d97706', '拔罐': '#dc2626' };
const TREATMENTS = ['內服中藥', '針灸', '推拿', '拔罐', '刮痧', '艾灸', '天灸', '其他'];
const SLOTS = [];
for (let h = 9; h < 19; h++) { SLOTS.push(`${String(h).padStart(2, '0')}:00`); SLOTS.push(`${String(h).padStart(2, '0')}:30`); }
SLOTS.push('19:00');
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function loadBookings() { try { return JSON.parse(localStorage.getItem('hcmc_room_booking') || '[]'); } catch { return []; } }
function saveBookings(arr) { localStorage.setItem('hcmc_room_booking', JSON.stringify(arr)); }

function getWeekDates(base) {
  const d = new Date(base); const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, i) => { const dd = new Date(d); dd.setDate(dd.getDate() + i); return dd.toISOString().substring(0, 10); });
}

export default function ClinicRoomBooking({ data, showToast, user }) {
  const DOCTORS = getDoctors();
  const today = new Date().toISOString().substring(0, 10);
  const [bookings, setBookings] = useState(loadBookings);
  const [tab, setTab] = useState('day'); // day | week | dashboard
  const [selDate, setSelDate] = useState(today);
  const [modal, setModal] = useState(null); // null | {roomId, time, date} or booking obj for edit
  const [form, setForm] = useState({ doctor: DOCTORS[0] || '', patient: '', treatment: TREATMENTS[0], notes: '' });

  const persist = (next) => { setBookings(next); saveBookings(next); };

  // Conflict detection
  const hasConflict = (roomId, date, time, excludeId) =>
    bookings.some(b => b.roomId === roomId && b.date === date && b.time === time && b.id !== excludeId);

  const openAdd = (roomId, time, date) => {
    setForm({ doctor: DOCTORS[0] || '', patient: '', treatment: TREATMENTS[0], notes: '' });
    setModal({ mode: 'add', roomId, time, date });
  };

  const handleSave = () => {
    if (!form.doctor || !form.patient) { showToast && showToast('請填寫醫師及病人姓名'); return; }
    const { roomId, time, date } = modal;
    if (hasConflict(roomId, date, time, modal.editId)) { showToast && showToast('時段衝突：該房間已被預約'); return; }
    if (modal.mode === 'edit') {
      const next = bookings.map(b => b.id === modal.editId ? { ...b, ...form, roomId, date, time } : b);
      persist(next);
    } else {
      const nb = { id: uid(), roomId, date, time, ...form, createdBy: user?.name || '', createdAt: new Date().toISOString() };
      persist([...bookings, nb]);
    }
    setModal(null); showToast && showToast('已儲存');
  };

  const handleDelete = (id) => { persist(bookings.filter(b => b.id !== id)); showToast && showToast('已刪除'); setModal(null); };

  const openEdit = (bk) => {
    setForm({ doctor: bk.doctor, patient: bk.patient, treatment: bk.treatment, notes: bk.notes || '' });
    setModal({ mode: 'edit', roomId: bk.roomId, time: bk.time, date: bk.date, editId: bk.id });
  };

  // Day view
  const dayBookings = useMemo(() => bookings.filter(b => b.date === selDate), [bookings, selDate]);

  // Week view
  const weekDates = useMemo(() => getWeekDates(selDate), [selDate]);
  const weekBookings = useMemo(() => bookings.filter(b => weekDates.includes(b.date)), [bookings, weekDates]);

  // Dashboard
  const stats = useMemo(() => {
    const totalSlots = ROOMS.length * SLOTS.length;
    const last30 = [];
    for (let i = 0; i < 30; i++) { const d = new Date(); d.setDate(d.getDate() - i); last30.push(d.toISOString().substring(0, 10)); }
    const recent = bookings.filter(b => last30.includes(b.date));
    const daysWithData = [...new Set(recent.map(b => b.date))].length || 1;
    const overallRate = recent.length / (totalSlots * daysWithData) * 100;

    const roomUsage = {};
    ROOMS.forEach(r => { roomUsage[r.id] = { name: r.name, count: 0 }; });
    recent.forEach(b => { if (roomUsage[b.roomId]) roomUsage[b.roomId].count++; });

    const hourCount = {};
    SLOTS.forEach(s => { hourCount[s] = 0; });
    recent.forEach(b => { if (hourCount[b.time] !== undefined) hourCount[b.time]++; });
    const peakSlot = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0];

    const topRoom = Object.values(roomUsage).sort((a, b) => b.count - a.count)[0];

    const doctorUsage = {};
    recent.forEach(b => { doctorUsage[b.doctor] = (doctorUsage[b.doctor] || 0) + 1; });

    return { overallRate, roomUsage, hourCount, peakSlot, topRoom, recent, daysWithData, doctorUsage };
  }, [bookings]);

  // Print daily schedule
  const printSchedule = () => {
    const w = window.open('', '_blank', 'width=900,height=700');
    const rows = ROOMS.map(room => {
      const cells = SLOTS.map(slot => {
        const bk = dayBookings.find(b => b.roomId === room.id && b.time === slot);
        if (bk) return `<td style="border:1px solid #ccc;padding:4px 6px;font-size:12px;background:${ROOM_COLORS[room.type] || ACC}22">${bk.doctor}<br/>${bk.patient}<br/><small>${bk.treatment}</small></td>`;
        return '<td style="border:1px solid #eee;padding:4px 6px;color:#ccc;font-size:11px">-</td>';
      }).join('');
      return `<tr><td style="border:1px solid #ccc;padding:6px;font-weight:700;white-space:nowrap;background:#f9fafb">${room.name}</td>${cells}</tr>`;
    }).join('');
    const headers = SLOTS.map(s => `<th style="border:1px solid #ccc;padding:4px;font-size:11px;background:#f0fdfa;white-space:nowrap">${s}</th>`).join('');
    const html = `<html><head><title>房間排表 ${selDate}</title><style>body{font-family:sans-serif;padding:20px}table{border-collapse:collapse;width:100%}@media print{button{display:none}}</style></head><body><h2 style="color:${ACC}">${getClinicName()} — 房間排表</h2><p>日期：${selDate}（星期${WEEKDAYS[new Date(selDate).getDay()]}）</p><table><thead><tr><th style="border:1px solid #ccc;padding:6px;background:#f0fdfa">房間</th>${headers}</tr></thead><tbody>${rows}</tbody></table><br/><button onclick="window.print()">列印</button></body></html>`;
    w.document.write(html);
    w.document.close();
  };

  // Styles
  const card = { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.1)' };
  const btn = { padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 };
  const primaryBtn = { ...btn, background: ACC, color: '#fff' };
  const ghostBtn = { ...btn, background: 'transparent', color: ACC, border: `1px solid ${ACC}` };
  const dangerBtn = { ...btn, background: '#ef4444', color: '#fff' };
  const input = { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: '100%', boxSizing: 'border-box' };
  const label = { fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block', color: '#374151' };
  const tabStyle = (active) => ({ ...btn, background: active ? ACC : '#f3f4f6', color: active ? '#fff' : '#374151', marginRight: 4 });

  const getRoom = (id) => ROOMS.find(r => r.id === id);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: ACC }}>房間預約管理</h2>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button style={tabStyle(tab === 'day')} onClick={() => setTab('day')}>日檢視</button>
          <button style={tabStyle(tab === 'week')} onClick={() => setTab('week')}>週檢視</button>
          <button style={tabStyle(tab === 'dashboard')} onClick={() => setTab('dashboard')}>使用統計</button>
        </div>
      </div>

      {/* Date selector */}
      <div style={{ ...card, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={label}>日期：</span>
        <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)} style={{ ...input, width: 160 }} />
        <button style={ghostBtn} onClick={() => setSelDate(today)}>今天</button>
        <button style={ghostBtn} onClick={() => { const d = new Date(selDate); d.setDate(d.getDate() - 1); setSelDate(d.toISOString().substring(0, 10)); }}>◀ 前一天</button>
        <button style={ghostBtn} onClick={() => { const d = new Date(selDate); d.setDate(d.getDate() + 1); setSelDate(d.toISOString().substring(0, 10)); }}>後一天 ▶</button>
        {tab === 'day' && <button style={primaryBtn} onClick={printSchedule}>列印排表</button>}
      </div>

      {/* Room legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {ROOMS.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: ROOM_COLORS[r.type] || ACC, display: 'inline-block' }} />
            <span style={{ fontWeight: 600 }}>{r.name}</span>
            <span style={{ color: '#6b7280' }}>({r.type} · {r.capacity}人)</span>
          </div>
        ))}
      </div>

      {/* ═══ DAY VIEW ═══ */}
      {tab === 'day' && (
        <div style={{ ...card, overflowX: 'auto' }}>
          <h3 style={{ margin: '0 0 12px', color: '#374151' }}>{selDate}（星期{WEEKDAYS[new Date(selDate + 'T00:00').getDay()]}）</h3>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #e5e7eb', padding: '6px 8px', background: '#f0fdfa', position: 'sticky', left: 0, zIndex: 1, minWidth: 80 }}>房間</th>
                {SLOTS.map(s => <th key={s} style={{ border: '1px solid #e5e7eb', padding: '4px 6px', background: '#f0fdfa', fontSize: 12, whiteSpace: 'nowrap' }}>{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROOMS.map(room => (
                <tr key={room.id}>
                  <td style={{ border: '1px solid #e5e7eb', padding: '6px 8px', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', background: '#f9fafb', position: 'sticky', left: 0, zIndex: 1 }}>
                    {room.name}
                    <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400 }}>{room.type}</div>
                  </td>
                  {SLOTS.map(slot => {
                    const bk = dayBookings.find(b => b.roomId === room.id && b.time === slot);
                    const color = ROOM_COLORS[room.type] || ACC;
                    if (bk) return (
                      <td key={slot} style={{ border: '1px solid #e5e7eb', padding: '3px 5px', background: color + '18', cursor: 'pointer', minWidth: 70 }} onClick={() => openEdit(bk)}>
                        <div style={{ fontSize: 11, fontWeight: 700, color }}>{bk.doctor}</div>
                        <div style={{ fontSize: 10, color: '#374151' }}>{bk.patient}</div>
                        <div style={{ fontSize: 9, color: '#6b7280' }}>{bk.treatment}</div>
                      </td>
                    );
                    return (
                      <td key={slot} style={{ border: '1px solid #e5e7eb', padding: '3px 5px', cursor: 'pointer', minWidth: 70, textAlign: 'center' }} onClick={() => openAdd(room.id, slot, selDate)}>
                        <span style={{ color: '#d1d5db', fontSize: 16 }}>+</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>點擊空格新增預約 · 點擊預約可編輯或刪除</div>
        </div>
      )}

      {/* ═══ WEEK VIEW ═══ */}
      {tab === 'week' && (
        <div style={{ ...card, overflowX: 'auto' }}>
          <h3 style={{ margin: '0 0 12px', color: '#374151' }}>週檢視：{weekDates[0]} ~ {weekDates[6]}</h3>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
            <button style={ghostBtn} onClick={() => { const d = new Date(selDate); d.setDate(d.getDate() - 7); setSelDate(d.toISOString().substring(0, 10)); }}>◀ 上週</button>
            <button style={ghostBtn} onClick={() => setSelDate(today)}>本週</button>
            <button style={ghostBtn} onClick={() => { const d = new Date(selDate); d.setDate(d.getDate() + 7); setSelDate(d.toISOString().substring(0, 10)); }}>下週 ▶</button>
          </div>
          {ROOMS.map(room => (
            <div key={room.id} style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 6px', color: ROOM_COLORS[room.type] || ACC, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: ROOM_COLORS[room.type] || ACC, display: 'inline-block' }} />
                {room.name}
              </h4>
              <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 4 }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', background: '#f0fdfa', fontSize: 12, width: 60 }}>時間</th>
                    {weekDates.map((d, i) => (
                      <th key={d} style={{ border: '1px solid #e5e7eb', padding: '4px 6px', background: d === today ? '#f0fdfa' : '#f9fafb', fontSize: 12 }}>
                        {d.substring(5)} ({WEEKDAYS[(i + 1) % 7]})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SLOTS.filter((_, i) => i % 2 === 0).map(slot => (
                    <tr key={slot}>
                      <td style={{ border: '1px solid #e5e7eb', padding: '3px 5px', fontSize: 11, fontWeight: 600, textAlign: 'center', background: '#f9fafb' }}>{slot}</td>
                      {weekDates.map(d => {
                        const bk = weekBookings.find(b => b.roomId === room.id && b.date === d && b.time === slot);
                        const color = ROOM_COLORS[room.type] || ACC;
                        if (bk) return (
                          <td key={d} style={{ border: '1px solid #e5e7eb', padding: '2px 4px', background: color + '18', cursor: 'pointer', fontSize: 10 }} onClick={() => openEdit(bk)}>
                            <div style={{ fontWeight: 700, color }}>{bk.doctor}</div>
                            <div>{bk.patient}</div>
                          </td>
                        );
                        return (
                          <td key={d} style={{ border: '1px solid #e5e7eb', padding: '2px 4px', textAlign: 'center', cursor: 'pointer' }} onClick={() => openAdd(room.id, slot, d)}>
                            <span style={{ color: '#e5e7eb', fontSize: 14 }}>+</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ═══ DASHBOARD ═══ */}
      {tab === 'dashboard' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 16 }}>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>整體使用率 (30天)</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: ACC }}>{stats.overallRate.toFixed(1)}%</div>
            </div>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>最繁忙時段</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#d97706' }}>{stats.peakSlot ? stats.peakSlot[0] : '-'}</div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>{stats.peakSlot ? `${stats.peakSlot[1]} 次預約` : ''}</div>
            </div>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>最常用房間</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#7C3AED' }}>{stats.topRoom ? stats.topRoom.name : '-'}</div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>{stats.topRoom ? `${stats.topRoom.count} 次使用` : ''}</div>
            </div>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>30天總預約</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{stats.recent.length}</div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>{stats.daysWithData} 天有預約</div>
            </div>
          </div>

          {/* Room usage breakdown */}
          <div style={{ ...card, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', color: '#374151' }}>各房間使用率</h3>
            {Object.values(stats.roomUsage).map(r => {
              const rate = stats.daysWithData > 0 ? (r.count / (SLOTS.length * stats.daysWithData) * 100) : 0;
              return (
                <div key={r.name} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <span style={{ color: '#6b7280' }}>{r.count} 次 · {rate.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(rate, 100)}%`, background: ACC, borderRadius: 4, transition: 'width .3s' }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hourly heatmap */}
          <div style={{ ...card, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', color: '#374151' }}>時段分佈</h3>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {Object.entries(stats.hourCount).map(([slot, count]) => {
                const max = Math.max(...Object.values(stats.hourCount), 1);
                const intensity = count / max;
                return (
                  <div key={slot} style={{ textAlign: 'center', flex: '1 0 40px', minWidth: 40 }}>
                    <div style={{ height: 36, background: `rgba(14,116,144,${0.1 + intensity * 0.8})`, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: intensity > 0.5 ? '#fff' : '#374151', fontSize: 11, fontWeight: 600 }}>
                      {count}
                    </div>
                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{slot}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Doctor usage */}
          <div style={{ ...card }}>
            <h3 style={{ margin: '0 0 12px', color: '#374151' }}>醫師使用次數</h3>
            {Object.entries(stats.doctorUsage).sort((a, b) => b[1] - a[1]).map(([doc, count]) => (
              <div key={doc} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{doc}</span>
                <span style={{ color: ACC, fontWeight: 700 }}>{count} 次</span>
              </div>
            ))}
            {Object.keys(stats.doctorUsage).length === 0 && <div style={{ color: '#9ca3af', fontSize: 13 }}>暫無數據</div>}
          </div>
        </div>
      )}

      {/* ═══ ROOM INFO ═══ */}
      {tab === 'day' && (
        <div style={{ ...card, marginTop: 16 }}>
          <h3 style={{ margin: '0 0 10px', color: '#374151' }}>房間資料</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
            {ROOMS.map(r => (
              <div key={r.id} style={{ border: `1px solid ${ROOM_COLORS[r.type] || ACC}40`, borderRadius: 8, padding: 10, background: (ROOM_COLORS[r.type] || ACC) + '08' }}>
                <div style={{ fontWeight: 700, color: ROOM_COLORS[r.type] || ACC, marginBottom: 4 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>類型：{r.type}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>容量：{r.capacity} 人</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>設備：{r.equipment}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ MODAL ═══ */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 420, boxShadow: '0 8px 30px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: ACC }}>{modal.mode === 'edit' ? '編輯預約' : '新增預約'}</h3>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>房間</label>
              <div style={{ padding: '8px 10px', background: '#f3f4f6', borderRadius: 6, fontSize: 14, fontWeight: 600 }}>{getRoom(modal.roomId)?.name}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={label}>日期</label><input type="date" value={modal.date} onChange={e => setModal({ ...modal, date: e.target.value })} style={input} /></div>
              <div>
                <label style={label}>時間</label>
                <select value={modal.time} onChange={e => setModal({ ...modal, time: e.target.value })} style={input}>
                  {SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>醫師</label>
              <select value={form.doctor} onChange={e => setForm({ ...form, doctor: e.target.value })} style={input}>
                {DOCTORS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>病人姓名</label>
              <input value={form.patient} onChange={e => setForm({ ...form, patient: e.target.value })} style={input} placeholder="請輸入病人姓名" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>治療項目</label>
              <select value={form.treatment} onChange={e => setForm({ ...form, treatment: e.target.value })} style={input}>
                {TREATMENTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>備註</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={input} placeholder="選填" />
            </div>
            {hasConflict(modal.roomId, modal.date, modal.time, modal.editId) && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '8px 12px', marginBottom: 12, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
                衝突警告：此房間在該時段已有預約
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {modal.mode === 'edit' && <button style={dangerBtn} onClick={() => handleDelete(modal.editId)}>刪除</button>}
              <button style={ghostBtn} onClick={() => setModal(null)}>取消</button>
              <button style={primaryBtn} onClick={handleSave}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
