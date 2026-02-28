import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getDoctors } from '../data';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_resource_schedule';

const RESOURCES = ['針灸房', '推拿房', '拔罐房', '中藥房', '理療室', '會診室'];
const SLOTS = Array.from({ length: 22 }, (_, i) => {
  const h = 9 + Math.floor(i / 2);
  const m = i % 2 ? '30' : '00';
  return `${String(h).padStart(2, '0')}:${m}`;
});
const DOC_COLORS = ['#0e7490', '#8B6914', '#7C3AED', '#dc2626', '#16a34a', '#d97706', '#0369a1', '#be185d'];

function loadSchedule() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
}
function saveSchedule(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}
function slotIndex(t) { return SLOTS.indexOf(t); }
function getDocColor(doc) {
  const docs = getDoctors();
  const idx = docs.indexOf(doc);
  return DOC_COLORS[idx >= 0 ? idx % DOC_COLORS.length : 0];
}
function getWeekDates(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d); dd.setDate(dd.getDate() + i);
    return dd.toISOString().substring(0, 10);
  });
}

export default function ResourceScheduling({ data, showToast, user }) {
  const [entries, setEntries] = useState(loadSchedule);
  const [selDate, setSelDate] = useState(new Date().toISOString().substring(0, 10));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ resource: RESOURCES[0], date: '', startTime: '09:00', endTime: '09:30', doctor: '', patient: '', purpose: '' });
  const [editId, setEditId] = useState(null);
  const [viewMode, setViewMode] = useState('day'); // day | stats
  const doctors = getDoctors();

  const dayEntries = useMemo(() => entries.filter(e => e.date === selDate), [entries, selDate]);

  const hasConflict = (resource, date, start, end, excludeId) => {
    const si = slotIndex(start), ei = slotIndex(end);
    return entries.some(e => {
      if (e.id === excludeId || e.resource !== resource || e.date !== date) return false;
      const es = slotIndex(e.startTime), ee = slotIndex(e.endTime);
      return si < ee && ei > es;
    });
  };

  const persist = (list) => { setEntries(list); saveSchedule(list); };

  const openAdd = () => {
    setForm({ resource: RESOURCES[0], date: selDate, startTime: '09:00', endTime: '09:30', doctor: doctors[0] || '', patient: '', purpose: '' });
    setEditId(null); setShowForm(true);
  };
  const openEdit = (entry) => {
    setForm({ resource: entry.resource, date: entry.date, startTime: entry.startTime, endTime: entry.endTime, doctor: entry.doctor, patient: entry.patient, purpose: entry.purpose });
    setEditId(entry.id); setShowForm(true);
  };
  const handleSubmit = () => {
    if (!form.resource || !form.date || !form.startTime || !form.endTime || !form.doctor) {
      showToast('請填寫所有必填欄位'); return;
    }
    if (slotIndex(form.endTime) <= slotIndex(form.startTime)) {
      showToast('結束時間必須晚於開始時間'); return;
    }
    if (hasConflict(form.resource, form.date, form.startTime, form.endTime, editId)) {
      showToast('該資源在此時段已被預約，存在衝突！'); return;
    }
    let updated;
    if (editId) {
      updated = entries.map(e => e.id === editId ? { ...e, ...form } : e);
      showToast('預約已更新');
    } else {
      updated = [...entries, { id: uid(), ...form, createdBy: user?.name || '' }];
      showToast('預約已新增');
    }
    persist(updated); setShowForm(false);
  };
  const handleDelete = (id) => {
    persist(entries.filter(e => e.id !== id)); showToast('預約已刪除');
  };

  // ── Statistics ──
  const weekDates = useMemo(() => getWeekDates(selDate), [selDate]);
  const stats = useMemo(() => {
    const dayStats = {};
    const weekStats = {};
    RESOURCES.forEach(r => {
      const dayItems = dayEntries.filter(e => e.resource === r);
      const daySlots = dayItems.reduce((s, e) => s + (slotIndex(e.endTime) - slotIndex(e.startTime)), 0);
      dayStats[r] = { count: dayItems.length, slots: daySlots, pct: Math.round((daySlots / SLOTS.length) * 100) };
      const weekItems = entries.filter(e => e.resource === r && weekDates.includes(e.date));
      const weekSlots = weekItems.reduce((s, e) => s + (slotIndex(e.endTime) - slotIndex(e.startTime)), 0);
      const totalWeekSlots = SLOTS.length * 7;
      weekStats[r] = { count: weekItems.length, slots: weekSlots, pct: Math.round((weekSlots / totalWeekSlots) * 100) };
    });
    return { day: dayStats, week: weekStats };
  }, [dayEntries, entries, weekDates]);

  // ── Print ──
  const handlePrint = () => {
    const clinic = getClinicName();
    const rows = RESOURCES.map(r => {
      const items = dayEntries.filter(e => e.resource === r).sort((a, b) => a.startTime.localeCompare(b.startTime));
      const cells = items.map(e => `<tr><td style="padding:4px 8px;border:1px solid #ccc">${e.startTime}-${e.endTime}</td><td style="padding:4px 8px;border:1px solid #ccc">${e.doctor}</td><td style="padding:4px 8px;border:1px solid #ccc">${e.patient || '-'}</td><td style="padding:4px 8px;border:1px solid #ccc">${e.purpose || '-'}</td></tr>`).join('');
      return `<h3 style="margin:16px 0 4px;color:${ACCENT}">${r}</h3>${items.length ? `<table style="border-collapse:collapse;width:100%"><thead><tr style="background:#f0f0f0"><th style="padding:4px 8px;border:1px solid #ccc;text-align:left">時段</th><th style="padding:4px 8px;border:1px solid #ccc;text-align:left">醫師</th><th style="padding:4px 8px;border:1px solid #ccc;text-align:left">病人</th><th style="padding:4px 8px;border:1px solid #ccc;text-align:left">用途</th></tr></thead><tbody>${cells}</tbody></table>` : '<p style="color:#999">無預約</p>'}`;
    }).join('');
    const html = `<html><head><title>${clinic} 資源排程 ${selDate}</title><style>body{font-family:sans-serif;padding:20px}h2{color:${ACCENT}}</style></head><body><h2>${clinic} — 資源排程表</h2><p>日期：${selDate}</p>${rows}<p style="margin-top:24px;color:#aaa;font-size:12px">列印時間：${new Date().toLocaleString('zh-HK')}</p></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html); w.document.close(); w.print();
  };

  // ── Styles ──
  const s = {
    page: { padding: 16, maxWidth: 1200, margin: '0 auto' },
    header: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16 },
    title: { fontSize: 20, fontWeight: 700, color: ACCENT, margin: 0 },
    btn: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
    btnSec: { background: '#fff', color: ACCENT, border: `1.5px solid ${ACCENT}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    btnDanger: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12 },
    input: { border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' },
    select: { border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 14, background: '#fff' },
    card: { background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: 16, marginBottom: 16 },
    label: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#374151' },
    grid: { display: 'grid', gridTemplateColumns: '100px repeat(' + RESOURCES.length + ', 1fr)', gap: 0, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' },
    gridHead: { background: ACCENT, color: '#fff', padding: '8px 4px', fontWeight: 600, fontSize: 13, textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.2)' },
    gridTime: { padding: '4px 8px', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #f3f4f6', borderRight: '1px solid #e5e7eb', display: 'flex', alignItems: 'center' },
    gridCell: { borderBottom: '1px solid #f3f4f6', borderRight: '1px solid #e5e7eb', minHeight: 28, position: 'relative', cursor: 'pointer' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modal: { background: '#fff', borderRadius: 12, padding: 24, width: '95%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' },
    bar: (pct, color) => ({ width: `${Math.min(pct, 100)}%`, background: color || ACCENT, height: 18, borderRadius: 4, transition: 'width 0.3s' }),
  };

  // ── Build timeline grid data ──
  const gridData = useMemo(() => {
    const map = {};
    RESOURCES.forEach(r => { map[r] = {}; });
    dayEntries.forEach(e => {
      const si = slotIndex(e.startTime), ei = slotIndex(e.endTime);
      for (let i = si; i < ei; i++) {
        map[e.resource][i] = e;
      }
    });
    return map;
  }, [dayEntries]);

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <h2 style={s.title}>資源排程管理</h2>
        <div style={{ flex: 1 }} />
        <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)} style={{ ...s.input, width: 160 }} />
        <button style={viewMode === 'day' ? s.btn : s.btnSec} onClick={() => setViewMode('day')}>時間表</button>
        <button style={viewMode === 'stats' ? s.btn : s.btnSec} onClick={() => setViewMode('stats')}>使用統計</button>
        <button style={s.btnSec} onClick={handlePrint}>列印</button>
        <button style={s.btn} onClick={openAdd}>+ 新增預約</button>
      </div>

      {/* Day Timeline View */}
      {viewMode === 'day' && (
        <div style={s.card}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ ...s.grid, minWidth: 700 }}>
              {/* Header Row */}
              <div style={{ ...s.gridHead, background: '#374151' }}>時間</div>
              {RESOURCES.map(r => <div key={r} style={s.gridHead}>{r}</div>)}
              {/* Time Rows */}
              {SLOTS.map((slot, si) => {
                const rendered = {};
                return [
                  <div key={`t-${si}`} style={s.gridTime}>{slot}</div>,
                  ...RESOURCES.map(r => {
                    const entry = gridData[r]?.[si];
                    if (entry && rendered[entry.id]) {
                      return <div key={`${r}-${si}`} style={{ ...s.gridCell, background: 'transparent', border: 'none', minHeight: 0, height: 0, overflow: 'hidden', padding: 0, margin: 0, visibility: 'hidden' }} />;
                    }
                    if (entry) {
                      rendered[entry.id] = true;
                      const span = slotIndex(entry.endTime) - slotIndex(entry.startTime);
                      const color = getDocColor(entry.doctor);
                      return (
                        <div key={`${r}-${si}`} style={{ ...s.gridCell, background: color + '18', borderLeft: `3px solid ${color}`, gridRow: `span ${span}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '2px 6px', cursor: 'pointer' }} onClick={() => openEdit(entry)} title={`${entry.doctor} | ${entry.patient || ''}\n${entry.startTime}-${entry.endTime}\n${entry.purpose || ''}`}>
                          <div style={{ fontSize: 11, fontWeight: 700, color, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.doctor}</div>
                          {span >= 2 && <div style={{ fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.patient || ''}{entry.purpose ? ` · ${entry.purpose}` : ''}</div>}
                        </div>
                      );
                    }
                    return <div key={`${r}-${si}`} style={s.gridCell} onClick={() => { setForm({ resource: r, date: selDate, startTime: slot, endTime: SLOTS[si + 1] || '20:00', doctor: doctors[0] || '', patient: '', purpose: '' }); setEditId(null); setShowForm(true); }} />;
                  })
                ];
              })}
            </div>
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
            {doctors.map(d => (
              <span key={d} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: getDocColor(d), display: 'inline-block' }} />
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats View */}
      {viewMode === 'stats' && (
        <div style={s.card}>
          <h3 style={{ margin: '0 0 12px', color: ACCENT }}>資源使用統計</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {RESOURCES.map(r => (
              <div key={r} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{r}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>今日：{stats.day[r].count} 項預約，佔用 {stats.day[r].slots}/{SLOTS.length} 時段 ({stats.day[r].pct}%)</div>
                <div style={{ background: '#f3f4f6', borderRadius: 4, height: 18, marginBottom: 8 }}>
                  <div style={s.bar(stats.day[r].pct)} />
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>本週：{stats.week[r].count} 項預約，佔用 {stats.week[r].slots}/{SLOTS.length * 7} 時段 ({stats.week[r].pct}%)</div>
                <div style={{ background: '#f3f4f6', borderRadius: 4, height: 18 }}>
                  <div style={s.bar(stats.week[r].pct, '#7c3aed')} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Entries List */}
      <div style={s.card}>
        <h3 style={{ margin: '0 0 10px', color: ACCENT }}>{selDate} 預約清單 ({dayEntries.length})</h3>
        {dayEntries.length === 0 && <p style={{ color: '#9ca3af', fontSize: 14 }}>此日期尚無資源預約</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {dayEntries.sort((a, b) => a.startTime.localeCompare(b.startTime)).map(e => {
            const color = getDocColor(e.doctor);
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', borderLeft: `4px solid ${color}` }}>
                <div style={{ minWidth: 70, fontWeight: 600, color: ACCENT, fontSize: 13 }}>{e.startTime}-{e.endTime}</div>
                <div style={{ background: color + '20', color, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{e.resource}</div>
                <div style={{ flex: 1, fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{e.doctor}</span>
                  {e.patient && <span style={{ color: '#6b7280' }}> | {e.patient}</span>}
                  {e.purpose && <span style={{ color: '#9ca3af' }}> — {e.purpose}</span>}
                </div>
                <button style={s.btnSec} onClick={() => openEdit(e)}>編輯</button>
                <button style={s.btnDanger} onClick={() => handleDelete(e.id)}>刪除</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Booking Form Modal */}
      {showForm && (
        <div style={s.overlay} onClick={() => setShowForm(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: ACCENT }}>{editId ? '編輯預約' : '新增資源預約'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={s.label}>資源 *</label>
                <select style={{ ...s.select, width: '100%' }} value={form.resource} onChange={e => setForm({ ...form, resource: e.target.value })}>
                  {RESOURCES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>日期 *</label>
                <input type="date" style={s.input} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label style={s.label}>開始時間 *</label>
                <select style={{ ...s.select, width: '100%' }} value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })}>
                  {SLOTS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>結束時間 *</label>
                <select style={{ ...s.select, width: '100%' }} value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })}>
                  {SLOTS.map(t => <option key={t}>{t}</option>)}
                  <option value="20:00">20:00</option>
                </select>
              </div>
              <div>
                <label style={s.label}>醫師 *</label>
                <select style={{ ...s.select, width: '100%' }} value={form.doctor} onChange={e => setForm({ ...form, doctor: e.target.value })}>
                  {doctors.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>病人姓名</label>
                <input style={s.input} value={form.patient} onChange={e => setForm({ ...form, patient: e.target.value })} placeholder="選填" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={s.label}>用途 / 備注</label>
                <input style={s.input} value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} placeholder="例：針灸療程、會診等" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button style={s.btnSec} onClick={() => setShowForm(false)}>取消</button>
              {editId && <button style={s.btnDanger} onClick={() => { handleDelete(editId); setShowForm(false); }}>刪除</button>}
              <button style={s.btn} onClick={handleSubmit}>{editId ? '更新' : '確認預約'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
