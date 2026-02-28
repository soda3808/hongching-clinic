import { useState, useMemo } from 'react';
import { getStoreNames } from '../data';
import { getClinicName } from '../tenant';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const load = k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const today = () => new Date().toISOString().substring(0, 10);
const A = '#0e7490';
const ROOM_TYPES = ['診症室', '治療室', '配藥室', '候診區', '辦公室', '倉庫'];
const ROOM_STATUSES = ['可用', '佔用', '維修中'];
const SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'];

const S = {
  page: { padding: 16, fontFamily: "'Microsoft YaHei',sans-serif", maxWidth: 1100, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, color: A, margin: '0 0 12px' },
  tabs: { display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 },
  tab: a => ({ padding: '8px 18px', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? A : '#666', borderBottom: a ? `2px solid ${A}` : '2px solid transparent', marginBottom: -2, background: 'none', border: 'none', fontSize: 14 }),
  card: { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  label: { fontSize: 12, color: '#555', marginBottom: 2 },
  input: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 140 },
  select: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' },
  btn: (c = A) => ({ padding: '7px 16px', background: c, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  btnSm: (c = A) => ({ padding: '4px 10px', background: c, color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }),
  th: { padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, borderBottom: '2px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' },
  td: { padding: '6px', fontSize: 13, borderBottom: '1px solid #f0f0f0' },
  badge: c => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: '#fff', background: c }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', borderRadius: 10, padding: 20, width: '90%', maxWidth: 600, maxHeight: '85vh', overflowY: 'auto' },
  textarea: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', minHeight: 80, resize: 'vertical' },
};
const statusColor = s => s === '可用' ? '#16a34a' : s === '佔用' ? '#ea580c' : '#dc2626';

export default function ClinicMap({ showToast, user }) {
  const STORES = getStoreNames();
  const [tab, setTab] = useState('rooms');
  const [rooms, setRooms] = useState(() => load('hcmc_rooms'));
  const [bookings, setBookings] = useState(() => load('hcmc_room_bookings'));
  const [selStore, setSelStore] = useState(STORES[0] || '');
  const [editing, setEditing] = useState(null);
  const [booking, setBooking] = useState(null);
  const [search, setSearch] = useState('');

  const persist = (r, b) => { save('hcmc_rooms', r); setRooms(r); if (b !== undefined) { save('hcmc_room_bookings', b); setBookings(b); } };

  const storeRooms = useMemo(() => rooms.filter(r => r.store === selStore), [rooms, selStore]);
  const todayStr = today();
  const todayBookings = useMemo(() => bookings.filter(b => b.date === todayStr && b.store === selStore), [bookings, todayStr, selStore]);

  const filtered = useMemo(() => {
    if (!search) return storeRooms;
    const q = search.toLowerCase();
    return storeRooms.filter(r => r.name.toLowerCase().includes(q) || r.type.includes(q));
  }, [storeRooms, search]);

  const blankRoom = () => ({ id: uid(), store: selStore, name: '', type: '診症室', capacity: 1, equipment: '', status: '可用', notes: '' });
  const blankBooking = () => ({ id: uid(), store: selStore, roomId: '', date: todayStr, slot: '09:00', endSlot: '10:00', doctor: '', purpose: '', bookedBy: user?.name || '' });

  const saveRoom = () => {
    if (!editing.name) { showToast?.('請填寫房間名稱'); return; }
    const idx = rooms.findIndex(r => r.id === editing.id);
    const next = [...rooms];
    if (idx >= 0) next[idx] = editing; else next.push(editing);
    persist(next);
    setEditing(null);
    showToast?.('房間已儲存');
  };

  const deleteRoom = id => {
    if (!confirm('確定刪除此房間？')) return;
    persist(rooms.filter(r => r.id !== id), bookings.filter(b => b.roomId !== id));
    showToast?.('已刪除');
  };

  const saveBooking = () => {
    if (!booking.roomId || !booking.doctor) { showToast?.('請選擇房間及醫師'); return; }
    const conflict = bookings.find(b => b.id !== booking.id && b.roomId === booking.roomId && b.date === booking.date && b.slot === booking.slot);
    if (conflict) { showToast?.('該時段已被預約'); return; }
    const idx = bookings.findIndex(b => b.id === booking.id);
    const next = [...bookings];
    if (idx >= 0) next[idx] = booking; else next.push(booking);
    persist(rooms, next);
    setBooking(null);
    showToast?.('預約已儲存');
  };

  const deleteBooking = id => { persist(rooms, bookings.filter(b => b.id !== id)); showToast?.('已取消預約'); };

  const printSchedule = () => {
    const clinic = getClinicName();
    const rows = storeRooms.map(r => {
      const rb = todayBookings.filter(b => b.roomId === r.id);
      const slotStr = rb.length ? rb.map(b => `${b.slot} ${b.doctor} - ${b.purpose}`).join('<br/>') : '—';
      return `<tr><td style="border:1px solid #ccc;padding:6px">${r.name}</td><td style="border:1px solid #ccc;padding:6px">${r.type}</td><td style="border:1px solid #ccc;padding:6px">${r.status}</td><td style="border:1px solid #ccc;padding:6px">${slotStr}</td></tr>`;
    }).join('');
    const html = `<html><head><title>${clinic} 房間排表</title><style>body{font-family:'Microsoft YaHei',sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th{background:#f0f0f0;border:1px solid #ccc;padding:6px;text-align:left}</style></head><body><h2>${clinic} - ${selStore} 房間排表</h2><p>日期：${todayStr}</p><table><tr><th>房間</th><th>類型</th><th>狀態</th><th>今日排程</th></tr>${rows}</table><script>window.print()</script></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  const printDirectory = () => {
    const clinic = getClinicName();
    const storeBlocks = STORES.map(st => {
      const sr = rooms.filter(r => r.store === st);
      if (!sr.length) return '';
      const rows = sr.map(r => `<tr><td style="border:1px solid #ccc;padding:4px">${r.name}</td><td style="border:1px solid #ccc;padding:4px">${r.type}</td><td style="border:1px solid #ccc;padding:4px">${r.capacity}人</td><td style="border:1px solid #ccc;padding:4px">${r.equipment || '—'}</td><td style="border:1px solid #ccc;padding:4px">${r.status}</td></tr>`).join('');
      return `<h3>${st}</h3><table style="border-collapse:collapse;width:100%;margin-bottom:16px"><tr><th style="background:#f0f0f0;border:1px solid #ccc;padding:4px">房間</th><th style="background:#f0f0f0;border:1px solid #ccc;padding:4px">類型</th><th style="background:#f0f0f0;border:1px solid #ccc;padding:4px">容量</th><th style="background:#f0f0f0;border:1px solid #ccc;padding:4px">設備</th><th style="background:#f0f0f0;border:1px solid #ccc;padding:4px">狀態</th></tr>${rows}</table>`;
    }).join('');
    const html = `<html><head><title>${clinic} 診所目錄</title><style>body{font-family:'Microsoft YaHei',sans-serif;padding:20px}</style></head><body><h2>${clinic} 診所空間目錄</h2>${storeBlocks}<script>window.print()</script></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  const TABS = [['rooms', '房間管理'], ['schedule', '今日排程'], ['booking', '預約房間'], ['notes', '平面備註'], ['print', '列印']];

  return (
    <div style={S.page}>
      <h1 style={S.h1}>診所空間管理</h1>
      <div style={S.tabs}>{TABS.map(([k, l]) => <button key={k} style={S.tab(tab === k)} onClick={() => setTab(k)}>{l}</button>)}</div>

      <div style={S.row}>
        <span style={{ fontSize: 13, color: '#555' }}>分店：</span>
        <select style={S.select} value={selStore} onChange={e => setSelStore(e.target.value)}>
          {STORES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* ── Room Management ── */}
      {tab === 'rooms' && <>
        <div style={S.row}>
          <input style={{ ...S.input, width: 200 }} placeholder="搜尋房間名稱或類型..." value={search} onChange={e => setSearch(e.target.value)} />
          <button style={S.btn()} onClick={() => setEditing(blankRoom())}>+ 新增房間</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['房間名稱', '類型', '容量', '設備', '狀態', '操作'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>{filtered.length === 0 ? <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#999' }}>尚無房間資料</td></tr> :
              filtered.map(r => (
                <tr key={r.id}>
                  <td style={S.td}>{r.name}</td>
                  <td style={S.td}>{r.type}</td>
                  <td style={S.td}>{r.capacity}人</td>
                  <td style={{ ...S.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.equipment || '—'}</td>
                  <td style={S.td}><span style={S.badge(statusColor(r.status))}>{r.status}</span></td>
                  <td style={S.td}>
                    <button style={S.btnSm()} onClick={() => setEditing({ ...r })}>編輯</button>{' '}
                    <button style={S.btnSm('#dc2626')} onClick={() => deleteRoom(r.id)}>刪除</button>
                  </td>
                </tr>
              ))
            }</tbody>
          </table>
        </div>
        <div style={{ ...S.card, marginTop: 14 }}>
          <div style={{ fontSize: 13, color: '#555' }}>
            <b>統計：</b> 共 {storeRooms.length} 間房間 ｜ 可用 {storeRooms.filter(r => r.status === '可用').length} ｜ 佔用 {storeRooms.filter(r => r.status === '佔用').length} ｜ 維修中 {storeRooms.filter(r => r.status === '維修中').length}
          </div>
        </div>
      </>}

      {/* ── Schedule ── */}
      {tab === 'schedule' && <>
        <p style={{ fontSize: 13, color: '#555', margin: '0 0 10px' }}>日期：{todayStr}（今日）</p>
        {storeRooms.length === 0 ? <div style={S.card}>尚無房間，請先於「房間管理」新增</div> :
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={S.th}>時段</th>{storeRooms.map(r => <th key={r.id} style={S.th}>{r.name}</th>)}</tr></thead>
              <tbody>{SLOTS.map(slot => (
                <tr key={slot}>
                  <td style={{ ...S.td, fontWeight: 600, whiteSpace: 'nowrap' }}>{slot}</td>
                  {storeRooms.map(r => {
                    const bk = todayBookings.find(b => b.roomId === r.id && b.slot === slot);
                    return <td key={r.id} style={{ ...S.td, background: bk ? '#ecfdf5' : 'transparent', fontSize: 12 }}>
                      {bk ? <span title={bk.purpose}>{bk.doctor}<br/><span style={{ color: '#666' }}>{bk.purpose}</span></span> : ''}
                    </td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        }
      </>}

      {/* ── Booking ── */}
      {tab === 'booking' && <>
        <div style={S.row}>
          <button style={S.btn()} onClick={() => setBooking(blankBooking())}>+ 新增預約</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['日期', '時段', '房間', '醫師', '用途', '預約人', '操作'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{todayBookings.length === 0 ? <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#999' }}>今日無預約</td></tr> :
            todayBookings.map(b => {
              const rm = rooms.find(r => r.id === b.roomId);
              return (
                <tr key={b.id}>
                  <td style={S.td}>{b.date}</td>
                  <td style={S.td}>{b.slot}</td>
                  <td style={S.td}>{rm?.name || '—'}</td>
                  <td style={S.td}>{b.doctor}</td>
                  <td style={S.td}>{b.purpose}</td>
                  <td style={S.td}>{b.bookedBy}</td>
                  <td style={S.td}>
                    <button style={S.btnSm()} onClick={() => setBooking({ ...b })}>編輯</button>{' '}
                    <button style={S.btnSm('#dc2626')} onClick={() => deleteBooking(b.id)}>取消</button>
                  </td>
                </tr>
              );
            })
          }</tbody>
        </table>
      </>}

      {/* ── Floor plan notes ── */}
      {tab === 'notes' && <>
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: A }}>平面佈局備註 — {selStore}</div>
          <textarea style={S.textarea} placeholder="輸入診所平面佈局說明，例如：&#10;一樓：候診區（左）、登記櫃台（正中）、診症室1（右前）&#10;二樓：治療室A/B、配藥室、倉庫" value={(() => { const r = rooms.find(r => r.store === selStore && r._isNote); return r?.notes || ''; })()} onChange={e => {
            const idx = rooms.findIndex(r => r.store === selStore && r._isNote);
            const next = [...rooms];
            if (idx >= 0) { next[idx] = { ...next[idx], notes: e.target.value }; } else { next.push({ id: uid(), store: selStore, _isNote: true, name: '__note__', type: '', capacity: 0, equipment: '', status: '', notes: e.target.value }); }
            persist(next);
          }} />
        </div>
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: A }}>各房間設備清單</div>
          {storeRooms.filter(r => !r._isNote).length === 0 ? <div style={{ color: '#999', fontSize: 13 }}>尚無房間</div> :
            storeRooms.filter(r => !r._isNote).map(r => (
              <div key={r.id} style={{ marginBottom: 8, padding: '6px 10px', background: '#f8fafc', borderRadius: 6 }}>
                <b>{r.name}</b>（{r.type}）— 設備：{r.equipment || '無'}
              </div>
            ))
          }
        </div>
      </>}

      {/* ── Print ── */}
      {tab === 'print' && <div style={S.card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: A }}>列印功能</div>
        <div style={S.row}>
          <button style={S.btn()} onClick={printSchedule}>列印今日房間排表</button>
          <button style={S.btn('#6366f1')} onClick={printDirectory}>列印診所空間目錄</button>
        </div>
        <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>點擊後將開啟新視窗並自動列印</p>
      </div>}

      {/* ── Room Edit Modal ── */}
      {editing && <div style={S.overlay} onClick={() => setEditing(null)}>
        <div style={S.modal} onClick={e => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 12px', color: A }}>{rooms.find(r => r.id === editing.id) ? '編輯房間' : '新增房間'}</h3>
          <div style={S.row}>
            <div><div style={S.label}>房間名稱</div><input style={S.input} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
            <div><div style={S.label}>類型</div><select style={S.select} value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value })}>{ROOM_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><div style={S.label}>容量（人）</div><input style={{ ...S.input, width: 60 }} type="number" min={1} value={editing.capacity} onChange={e => setEditing({ ...editing, capacity: +e.target.value })} /></div>
            <div><div style={S.label}>狀態</div><select style={S.select} value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}>{ROOM_STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={S.label}>設備清單（逗號分隔）</div>
            <input style={{ ...S.input, width: '100%' }} placeholder="例：診療床, 血壓計, 針灸器具" value={editing.equipment} onChange={e => setEditing({ ...editing, equipment: e.target.value })} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={S.label}>備註</div>
            <textarea style={S.textarea} value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button style={S.btn('#888')} onClick={() => setEditing(null)}>取消</button>
            <button style={S.btn()} onClick={saveRoom}>儲存</button>
          </div>
        </div>
      </div>}

      {/* ── Booking Modal ── */}
      {booking && <div style={S.overlay} onClick={() => setBooking(null)}>
        <div style={S.modal} onClick={e => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 12px', color: A }}>{bookings.find(b => b.id === booking.id) ? '編輯預約' : '新增預約'}</h3>
          <div style={S.row}>
            <div><div style={S.label}>房間</div><select style={S.select} value={booking.roomId} onChange={e => setBooking({ ...booking, roomId: e.target.value })}><option value="">—選擇—</option>{storeRooms.filter(r => !r._isNote && r.status !== '維修中').map(r => <option key={r.id} value={r.id}>{r.name}（{r.type}）</option>)}</select></div>
            <div><div style={S.label}>日期</div><input style={S.input} type="date" value={booking.date} onChange={e => setBooking({ ...booking, date: e.target.value })} /></div>
            <div><div style={S.label}>時段</div><select style={S.select} value={booking.slot} onChange={e => setBooking({ ...booking, slot: e.target.value })}>{SLOTS.map(s => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div style={S.row}>
            <div><div style={S.label}>醫師/使用者</div><input style={S.input} value={booking.doctor} onChange={e => setBooking({ ...booking, doctor: e.target.value })} /></div>
            <div><div style={S.label}>用途</div><input style={{ ...S.input, width: 200 }} value={booking.purpose} onChange={e => setBooking({ ...booking, purpose: e.target.value })} placeholder="例：問診、針灸治療" /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <button style={S.btn('#888')} onClick={() => setBooking(null)}>取消</button>
            <button style={S.btn()} onClick={saveBooking}>確認預約</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
