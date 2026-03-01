import { useState, useMemo } from 'react';
import { uid, getDoctors, getStoreNames, getDefaultStore } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const STATUS_FLOW = ['已預約', '已到達', '診症中', '已完成'];
const STATUS_COLORS = { '已預約': '#d97706', '已到達': '#0e7490', '診症中': '#7c3aed', '已完成': '#16a34a' };
const LS_KEY = 'hcmc_registration_queue';

function today() { return new Date().toISOString().substring(0, 10); }
function nowTime() { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }

function loadOverlays() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function saveOverlays(o) { localStorage.setItem(LS_KEY, JSON.stringify(o)); }

function nextQueueNo(overlays, dateStr) {
  const used = Object.values(overlays).filter(v => v.date === dateStr && v.queueNo).map(v => parseInt(v.queueNo.replace('Q', ''), 10) || 0);
  const n = used.length ? Math.max(...used) + 1 : 1;
  return 'Q' + String(n).padStart(3, '0');
}

export default function RegistrationQueue({ data, setData, showToast, user }) {
  const DOCTORS = getDoctors();
  const STORES = getStoreNames();
  const [overlays, setOverlays] = useState(loadOverlays);
  const [filterDoc, setFilterDoc] = useState('all');
  const [filterStore, setFilterStore] = useState('all');
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [form, setForm] = useState({ patientName: '', phone: '', doctor: DOCTORS[0] || '', store: getDefaultStore(), notes: '' });

  const bookings = data.bookings || [];
  const todayStr = today();

  // Merge bookings with overlay status
  const queue = useMemo(() => {
    const todayBookings = bookings.filter(b => b.date === todayStr);
    // Walk-in entries stored in overlays with _walkin prefix
    const walkIns = Object.entries(overlays)
      .filter(([k, v]) => k.startsWith('_walkin_') && v.date === todayStr)
      .map(([k, v]) => ({ ...v, id: k, isWalkIn: true }));

    const merged = todayBookings.map(b => {
      const ov = overlays[b.id] || {};
      return {
        ...b,
        queueNo: ov.queueNo || '',
        regStatus: ov.regStatus || '已預約',
        arrivedAt: ov.arrivedAt || '',
        consultAt: ov.consultAt || '',
        completedAt: ov.completedAt || '',
      };
    });

    const all = [...merged, ...walkIns];
    let filtered = all;
    if (filterDoc !== 'all') filtered = filtered.filter(r => r.doctor === filterDoc);
    if (filterStore !== 'all') filtered = filtered.filter(r => r.store === filterStore);
    return filtered.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  }, [bookings, overlays, todayStr, filterDoc, filterStore]);

  const stats = useMemo(() => ({
    total: queue.length,
    waiting: queue.filter(r => r.regStatus === '已到達').length,
    inConsult: queue.filter(r => r.regStatus === '診症中').length,
    completed: queue.filter(r => r.regStatus === '已完成').length,
  }), [queue]);

  const updateOverlay = (id, patch) => {
    const next = { ...overlays, [id]: { ...overlays[id], ...patch, date: todayStr } };
    setOverlays(next);
    saveOverlays(next);
  };

  // Quick check-in: assign queue number + mark arrived
  const handleCheckIn = (item) => {
    const queueNo = item.queueNo || nextQueueNo(overlays, todayStr);
    updateOverlay(item.id, { queueNo, regStatus: '已到達', arrivedAt: nowTime() });
    showToast(`${item.patientName} 已到達 (${queueNo})`);
  };

  // Advance status
  const advanceStatus = (item) => {
    const idx = STATUS_FLOW.indexOf(item.regStatus);
    if (idx < 0 || idx >= STATUS_FLOW.length - 1) return;
    const next = STATUS_FLOW[idx + 1];
    const patch = { regStatus: next };
    if (next === '已到達') { patch.arrivedAt = nowTime(); patch.queueNo = item.queueNo || nextQueueNo(overlays, todayStr); }
    if (next === '診症中') patch.consultAt = nowTime();
    if (next === '已完成') patch.completedAt = nowTime();
    updateOverlay(item.id, patch);
    showToast(`${item.patientName} ${next}`);
  };

  // Walk-in registration
  const handleWalkIn = (e) => {
    e.preventDefault();
    if (!form.patientName.trim()) return showToast('請輸入病人姓名');
    const id = '_walkin_' + uid();
    const queueNo = nextQueueNo(overlays, todayStr);
    const record = {
      date: todayStr, time: nowTime(), patientName: form.patientName.trim(), phone: form.phone,
      doctor: form.doctor, store: form.store, notes: form.notes, queueNo,
      regStatus: '已到達', arrivedAt: nowTime(), consultAt: '', completedAt: '', isWalkIn: true,
    };
    updateOverlay(id, record);
    // Also add to bookings so other parts of the system see it
    const booking = {
      id, date: todayStr, time: nowTime(), patientName: form.patientName.trim(),
      phone: form.phone, doctor: form.doctor, store: form.store,
      status: 'confirmed', notes: form.notes ? `(即場) ${form.notes}` : '(即場掛號)',
      type: '即場', createdAt: new Date().toISOString(),
    };
    setData({ ...data, bookings: [...bookings, booking] });
    showToast(`即場掛號 ${queueNo} — ${form.patientName.trim()}`);
    setForm({ patientName: '', phone: '', doctor: DOCTORS[0] || '', store: getDefaultStore(), notes: '' });
    setShowWalkIn(false);
  };

  // Print queue list
  const handlePrint = () => {
    const rows = queue.map(r =>
      `<tr><td>${escapeHtml(r.queueNo || '-')}</td><td>${escapeHtml(r.patientName)}</td><td>${r.time || '-'}</td><td>${escapeHtml(r.doctor)}</td><td>${escapeHtml(r.regStatus)}</td></tr>`
    ).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>掛號列表</title>
      <style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px}th{background:#0e7490;color:#fff}h2{color:#0e7490}@media print{body{padding:10px}}</style>
    </head><body><h2>${escapeHtml(getClinicName())} — 今日掛號列表 (${todayStr})</h2>
    <table><thead><tr><th>號碼</th><th>病人</th><th>時間</th><th>醫師</th><th>狀態</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="text-align:center">暫無紀錄</td></tr>'}</tbody></table>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const s = {
    card: { background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 12 },
    header: { padding: '10px 14px', borderBottom: '1px solid #e5e7eb', fontWeight: 700, fontSize: 14, color: '#0e7490', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    stat: (bg) => ({ flex: 1, minWidth: 70, background: bg, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }),
    statVal: { fontSize: 22, fontWeight: 800 },
    statLbl: { fontSize: 11, color: '#555', marginTop: 2 },
    badge: (status) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: '#fff', background: STATUS_COLORS[status] || '#888' }),
    btn: { padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
    btnTeal: { background: '#0e7490', color: '#fff' },
    btnGreen: { background: '#16a34a', color: '#fff' },
    btnOutline: { background: '#fff', color: '#333', border: '1px solid #d1d5db' },
    row: { display: 'flex', gap: 8, alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 13 },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modal: { background: '#fff', borderRadius: 12, padding: 20, width: '90%', maxWidth: 420 },
    input: { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' },
    select: { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' },
    label: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 3, color: '#374151' },
  };

  return (
    <div>
      {/* Stats Row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={s.stat('#ecfdf5')}><div style={{ ...s.statVal, color: '#0e7490' }}>{stats.total}</div><div style={s.statLbl}>已掛號</div></div>
        <div style={s.stat('#fef9c3')}><div style={{ ...s.statVal, color: '#d97706' }}>{stats.waiting}</div><div style={s.statLbl}>等候中</div></div>
        <div style={s.stat('#ede9fe')}><div style={{ ...s.statVal, color: '#7c3aed' }}>{stats.inConsult}</div><div style={s.statLbl}>診症中</div></div>
        <div style={s.stat('#dcfce7')}><div style={{ ...s.statVal, color: '#16a34a' }}>{stats.completed}</div><div style={s.statLbl}>已完成</div></div>
      </div>

      {/* Filters + Actions */}
      <div style={{ ...s.card, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...s.select, width: 'auto', marginBottom: 0 }} value={filterDoc} onChange={e => setFilterDoc(e.target.value)}>
          <option value="all">全部醫師</option>
          {DOCTORS.map(d => <option key={d}>{d}</option>)}
        </select>
        <select style={{ ...s.select, width: 'auto', marginBottom: 0 }} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
          <option value="all">全部分店</option>
          {STORES.map(st => <option key={st}>{st}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button style={{ ...s.btn, ...s.btnOutline }} onClick={handlePrint}>列印</button>
        <button style={{ ...s.btn, ...s.btnTeal }} onClick={() => setShowWalkIn(true)}>+ 即場掛號</button>
      </div>

      {/* Queue List */}
      <div style={s.card}>
        <div style={s.header}>
          <span>今日掛號列表 ({queue.length})</span>
          <span style={{ fontSize: 11, fontWeight: 400, color: '#6b7280' }}>{todayStr}</span>
        </div>
        {queue.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>暫無掛號紀錄</div>
        )}
        {queue.map(r => (
          <div key={r.id} style={s.row}>
            <div style={{ minWidth: 48, fontWeight: 800, color: '#0e7490', fontSize: 14 }}>{r.queueNo || '-'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{r.patientName}{r.isWalkIn && <span style={{ fontSize: 10, color: '#d97706', marginLeft: 4 }}>(即場)</span>}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{r.time || '-'} | {r.doctor} | {r.store || '-'}</div>
            </div>
            <span style={s.badge(r.regStatus)}>{r.regStatus}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {r.regStatus === '已預約' && (
                <button style={{ ...s.btn, ...s.btnGreen }} onClick={() => handleCheckIn(r)}>到達</button>
              )}
              {r.regStatus !== '已完成' && r.regStatus !== '已預約' && (
                <button style={{ ...s.btn, ...s.btnTeal }} onClick={() => advanceStatus(r)}>
                  {r.regStatus === '已到達' ? '開始診症' : '完成'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Walk-in Modal */}
      {showWalkIn && (
        <div style={s.overlay} onClick={() => setShowWalkIn(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 15, color: '#0e7490' }}>即場掛號</h3>
              <button style={{ ...s.btn, ...s.btnOutline }} onClick={() => setShowWalkIn(false)}>✕</button>
            </div>
            <form onSubmit={handleWalkIn}>
              <label style={s.label}>病人姓名 *</label>
              <input style={s.input} value={form.patientName} onChange={e => setForm({ ...form, patientName: e.target.value })} placeholder="輸入姓名" autoFocus />
              <label style={s.label}>電話</label>
              <input style={s.input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="電話號碼" />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>醫師</label>
                  <select style={s.select} value={form.doctor} onChange={e => setForm({ ...form, doctor: e.target.value })}>
                    {DOCTORS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={s.label}>分店</label>
                  <select style={s.select} value={form.store} onChange={e => setForm({ ...form, store: e.target.value })}>
                    {STORES.map(st => <option key={st}>{st}</option>)}
                  </select>
                </div>
              </div>
              <label style={s.label}>備註</label>
              <input style={s.input} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="備註（可選）" />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="submit" style={{ ...s.btn, ...s.btnTeal, padding: '8px 20px', fontSize: 13 }}>確認掛號</button>
                <button type="button" style={{ ...s.btn, ...s.btnOutline, padding: '8px 20px', fontSize: 13 }} onClick={() => setShowWalkIn(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
