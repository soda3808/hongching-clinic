import { useState, useMemo, useEffect } from 'react';
import { getClinicName } from '../tenant';
import { getDoctors } from '../data';
import { checkinsOps } from '../api';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_checkins';
const SERVICE_TYPES = ['內科', '針灸', '推拿', '覆診', '初診', '拔罐', '天灸'];

function today() { return new Date().toISOString().substring(0, 10); }
function nowTime() { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
function loadCheckins() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function saveCheckins(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); checkinsOps.persistAll(arr); }

export default function PatientCheckIn({ data, showToast, user }) {
  const patients = data?.patients || [];
  const bookings = data?.bookings || [];
  const doctors = getDoctors();
  const clinicName = getClinicName();

  const [mode, setMode] = useState('kiosk'); // kiosk | admin
  const [step, setStep] = useState('search'); // search | appointments | walkin | success
  const [method, setMethod] = useState('phone'); // phone | qr | ref
  const [query, setQuery] = useState('');
  const [matched, setMatched] = useState([]);
  const [checkins, setCheckins] = useState(loadCheckins);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [walkinForm, setWalkinForm] = useState({ name: '', phone: '', service: SERVICE_TYPES[0], doctor: doctors[0] || '' });
  const [successInfo, setSuccessInfo] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load from Supabase on mount
  useEffect(() => { checkinsOps.load().then(d => { if (d) setCheckins(d); }); }, []);

  // Auto-refresh queue every 30s
  useEffect(() => {
    const t = setInterval(() => setCheckins(loadCheckins()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { saveCheckins(checkins); }, [checkins]);

  const todayCheckins = useMemo(() => checkins.filter(c => c.date === today()), [checkins]);
  const currentQueueNo = todayCheckins.length;
  const waitingCount = todayCheckins.filter(c => c.status === 'waiting').length;
  const estWaitMin = waitingCount * 12;

  const nextQueueNo = () => {
    const n = todayCheckins.length + 1;
    return 'K' + String(n).padStart(3, '0');
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Search logic
  const handleSearch = () => {
    if (!query.trim()) return;
    const q = query.trim().toLowerCase();
    const todayStr = today();
    let todayBookings = bookings.filter(b => b.date === todayStr);
    let results = [];
    if (method === 'phone') {
      const matchedPatients = patients.filter(p => p.phone && p.phone.includes(q));
      const names = matchedPatients.map(p => p.name.toLowerCase());
      results = todayBookings.filter(b => names.includes((b.patientName || b.patient || '').toLowerCase()) || matchedPatients.some(p => p.phone === b.phone));
      if (!results.length && matchedPatients.length) {
        results = matchedPatients.map(p => ({ patientName: p.name, phone: p.phone, _patientOnly: true }));
      }
    } else if (method === 'ref') {
      results = todayBookings.filter(b => (b.id || '').toLowerCase().includes(q) || (b.refNo || '').toLowerCase().includes(q));
    } else {
      results = todayBookings.filter(b => (b.qrCode || b.id || '').toLowerCase().includes(q));
    }
    setMatched(results);
    setStep(results.length ? 'appointments' : 'walkin');
  };

  const confirmCheckin = (booking) => {
    const qNo = nextQueueNo();
    const record = { id: uid(), date: today(), time: nowTime(), queueNo: qNo, patientName: booking.patientName || booking.patient, phone: booking.phone || '', bookingId: booking.id, doctor: booking.doctor || doctors[0], service: booking.service || booking.type || '覆診', status: 'waiting', source: 'kiosk' };
    setCheckins(prev => [...prev, record]);
    setSuccessInfo(record);
    setStep('success');
    showToast?.(`${record.patientName} 已簽到 - ${qNo}`);
  };

  const submitWalkIn = () => {
    if (!walkinForm.name || !walkinForm.phone) return;
    const qNo = nextQueueNo();
    const record = { id: uid(), date: today(), time: nowTime(), queueNo: qNo, patientName: walkinForm.name, phone: walkinForm.phone, doctor: walkinForm.doctor, service: walkinForm.service, status: 'waiting', source: 'walkin' };
    setCheckins(prev => [...prev, record]);
    setSuccessInfo(record);
    setStep('success');
    showToast?.(`Walk-in ${record.patientName} 已登記 - ${qNo}`);
  };

  const resetKiosk = () => { setStep('search'); setQuery(''); setMatched([]); setSelectedBooking(null); setWalkinForm({ name: '', phone: '', service: SERVICE_TYPES[0], doctor: doctors[0] || '' }); setSuccessInfo(null); };

  // Auto-reset after success
  useEffect(() => { if (step === 'success') { const t = setTimeout(resetKiosk, 15000); return () => clearTimeout(t); } }, [step]);

  const btn = { border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700, transition: 'opacity .2s' };
  const card = { background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 4px 24px rgba(0,0,0,.08)' };

  // ── Management View ──
  if (mode === 'admin') {
    const hourBuckets = {};
    todayCheckins.forEach(c => { const h = (c.time || '00:00').split(':')[0]; hourBuckets[h] = (hourBuckets[h] || 0) + 1; });
    const peakHour = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0];
    const checkedIn = todayCheckins.length;
    const todayBookingCount = bookings.filter(b => b.date === today()).length;
    const checkinRate = todayBookingCount ? Math.round((checkedIn / todayBookingCount) * 100) : 0;

    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, color: ACCENT }}>簽到管理</h2>
          <button onClick={() => setMode('kiosk')} style={{ ...btn, padding: '8px 20px', background: ACCENT, color: '#fff', fontSize: 14 }}>切換自助模式</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: '今日簽到', val: checkedIn, color: ACCENT },
            { label: '簽到率', val: checkinRate + '%', color: '#16a34a' },
            { label: '等候中', val: waitingCount, color: '#d97706' },
            { label: '繁忙時段', val: peakHour ? `${peakHour[0]}:00 (${peakHour[1]}人)` : '-', color: '#7c3aed' },
          ].map(s => (
            <div key={s.label} style={{ ...card, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>

        <div style={{ ...card, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                {['號碼', '姓名', '電話', '醫師', '服務', '時間', '來源', '狀態'].map(h => (
                  <th key={h} style={{ padding: '8px 6px', color: '#555', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todayCheckins.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>今日尚無簽到記錄</td></tr>}
              {todayCheckins.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 6px', fontWeight: 700, color: ACCENT }}>{c.queueNo}</td>
                  <td style={{ padding: '8px 6px' }}>{c.patientName}</td>
                  <td style={{ padding: '8px 6px' }}>{c.phone}</td>
                  <td style={{ padding: '8px 6px' }}>{c.doctor}</td>
                  <td style={{ padding: '8px 6px' }}>{c.service}</td>
                  <td style={{ padding: '8px 6px' }}>{c.time}</td>
                  <td style={{ padding: '8px 6px' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: c.source === 'walkin' ? '#fef3c7' : '#e0f2fe', color: c.source === 'walkin' ? '#92400e' : ACCENT }}>{c.source === 'walkin' ? '即場' : '預約'}</span></td>
                  <td style={{ padding: '8px 6px' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: c.status === 'waiting' ? '#fef3c7' : '#dcfce7', color: c.status === 'waiting' ? '#92400e' : '#166534' }}>{c.status === 'waiting' ? '等候中' : '已完成'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Kiosk Mode ──
  const kioskWrap = { minHeight: '100vh', background: 'linear-gradient(160deg,#f0fdfa 0%,#e0f2fe 50%,#f0f9ff 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 };

  // Success screen
  if (step === 'success' && successInfo) {
    return (
      <div style={kioskWrap}>
        <div style={{ ...card, maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 40 }}>&#10003;</div>
          <h1 style={{ color: '#166534', fontSize: 28, margin: '0 0 8px' }}>簽到成功！</h1>
          <p style={{ color: '#555', fontSize: 18, margin: '0 0 20px' }}>{successInfo.patientName}，歡迎光臨{clinicName}</p>
          <div style={{ background: ACCENT, borderRadius: 16, padding: 24, color: '#fff', marginBottom: 20 }}>
            <div style={{ fontSize: 14, opacity: .8, marginBottom: 4 }}>你的號碼</div>
            <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: 4 }}>{successInfo.queueNo}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#f0fdfa', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, color: '#888' }}>目前排隊人數</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: ACCENT }}>{waitingCount}</div>
            </div>
            <div style={{ background: '#fef3c7', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, color: '#888' }}>預計等候時間</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#d97706' }}>~{estWaitMin}分鐘</div>
            </div>
          </div>
          <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>請在候診區等候叫號，謝謝！</p>
          <button onClick={resetKiosk} style={{ ...btn, padding: '14px 40px', background: ACCENT, color: '#fff', fontSize: 18, width: '100%' }}>完成（15秒後自動返回）</button>
        </div>
        {user && <button onClick={() => setMode('admin')} style={{ ...btn, marginTop: 16, padding: '8px 20px', background: 'rgba(0,0,0,.1)', color: '#555', fontSize: 12 }}>管理員入口</button>}
      </div>
    );
  }

  // Walk-in registration
  if (step === 'walkin') {
    return (
      <div style={kioskWrap}>
        <div style={{ ...card, maxWidth: 480, width: '100%' }}>
          <h2 style={{ color: ACCENT, fontSize: 24, margin: '0 0 4px', textAlign: 'center' }}>即場登記</h2>
          <p style={{ color: '#888', fontSize: 14, textAlign: 'center', margin: '0 0 20px' }}>無預約？填寫資料即可排隊</p>
          {[
            { label: '姓名', key: 'name', type: 'text', ph: '請輸入姓名' },
            { label: '電話', key: 'phone', type: 'tel', ph: '請輸入電話號碼' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 15, fontWeight: 600, display: 'block', marginBottom: 6 }}>{f.label}</label>
              <input type={f.type} value={walkinForm[f.key]} onChange={e => setWalkinForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={{ width: '100%', padding: '14px 16px', border: '2px solid #e5e7eb', borderRadius: 12, fontSize: 18, boxSizing: 'border-box' }} />
            </div>
          ))}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 15, fontWeight: 600, display: 'block', marginBottom: 6 }}>服務類型</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SERVICE_TYPES.map(s => (
                <button key={s} onClick={() => setWalkinForm(p => ({ ...p, service: s }))} style={{ ...btn, padding: '10px 18px', fontSize: 16, background: walkinForm.service === s ? ACCENT : '#f0f0f0', color: walkinForm.service === s ? '#fff' : '#333' }}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 15, fontWeight: 600, display: 'block', marginBottom: 6 }}>醫師偏好</label>
            <select value={walkinForm.doctor} onChange={e => setWalkinForm(p => ({ ...p, doctor: e.target.value }))} style={{ width: '100%', padding: '14px 16px', border: '2px solid #e5e7eb', borderRadius: 12, fontSize: 18, boxSizing: 'border-box' }}>
              <option value="">無偏好</option>
              {doctors.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <button onClick={submitWalkIn} disabled={!walkinForm.name || !walkinForm.phone} style={{ ...btn, width: '100%', padding: '16px', fontSize: 20, background: (!walkinForm.name || !walkinForm.phone) ? '#ccc' : ACCENT, color: '#fff', marginBottom: 10 }}>確認登記排隊</button>
          <button onClick={resetKiosk} style={{ ...btn, width: '100%', padding: '14px', fontSize: 16, background: '#f0f0f0', color: '#555' }}>返回首頁</button>
        </div>
      </div>
    );
  }

  // Appointments list
  if (step === 'appointments') {
    const hasAppts = matched.some(m => !m._patientOnly);
    return (
      <div style={kioskWrap}>
        <div style={{ ...card, maxWidth: 520, width: '100%' }}>
          <h2 style={{ color: ACCENT, fontSize: 24, margin: '0 0 16px', textAlign: 'center' }}>{hasAppts ? '今日預約' : '未找到今日預約'}</h2>
          {matched.filter(m => !m._patientOnly).map(b => {
            const alreadyChecked = todayCheckins.some(c => c.bookingId === b.id);
            return (
              <div key={b.id} style={{ border: '2px solid #e5e7eb', borderRadius: 14, padding: 18, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{b.patientName || b.patient}</div>
                  <div style={{ fontSize: 14, color: '#888', marginTop: 2 }}>{b.time} | {b.doctor} | {b.service || b.type || '覆診'}</div>
                </div>
                {alreadyChecked
                  ? <span style={{ fontSize: 14, color: '#16a34a', fontWeight: 600 }}>已簽到</span>
                  : <button onClick={() => confirmCheckin(b)} style={{ ...btn, padding: '12px 28px', fontSize: 18, background: ACCENT, color: '#fff' }}>簽到</button>
                }
              </div>
            );
          })}
          {matched.filter(m => m._patientOnly).length > 0 && !hasAppts && (
            <p style={{ textAlign: 'center', color: '#888', fontSize: 15, marginBottom: 12 }}>已找到病人資料，但今日沒有預約。</p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button onClick={() => { setStep('walkin'); setWalkinForm(f => ({ ...f, name: matched[0]?.patientName || matched[0]?.patient || '', phone: matched[0]?.phone || query })); }} style={{ ...btn, flex: 1, padding: '14px', fontSize: 16, background: '#fef3c7', color: '#92400e' }}>即場登記</button>
            <button onClick={resetKiosk} style={{ ...btn, flex: 1, padding: '14px', fontSize: 16, background: '#f0f0f0', color: '#555' }}>返回</button>
          </div>
        </div>
      </div>
    );
  }

  // Search / home screen
  return (
    <div style={kioskWrap}>
      <div style={{ ...card, maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ color: ACCENT, fontSize: 30, margin: '0 0 4px' }}>{clinicName}</h1>
          <p style={{ color: '#888', fontSize: 16, margin: 0 }}>自助簽到系統</p>
        </div>

        {/* Queue status bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, justifyContent: 'center' }}>
          <div style={{ background: '#f0fdfa', borderRadius: 10, padding: '10px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#888' }}>目前號碼</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: ACCENT }}>K{String(currentQueueNo).padStart(3, '0')}</div>
          </div>
          <div style={{ background: '#fef3c7', borderRadius: 10, padding: '10px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#888' }}>等候人數</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706' }}>{waitingCount}</div>
          </div>
          <div style={{ background: '#f0f0f0', borderRadius: 10, padding: '10px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#888' }}>預計等候</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#555' }}>~{estWaitMin}分</div>
          </div>
        </div>

        {/* Check-in method tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
          {[
            { key: 'phone', label: '電話號碼' },
            { key: 'qr', label: 'QR 編號' },
            { key: 'ref', label: '預約編號' },
          ].map(m => (
            <button key={m.key} onClick={() => { setMethod(m.key); setQuery(''); }} style={{ ...btn, padding: '10px 20px', fontSize: 15, background: method === m.key ? ACCENT : '#e5e7eb', color: method === m.key ? '#fff' : '#555' }}>{m.label}</button>
          ))}
        </div>

        <div style={{ position: 'relative', marginBottom: 16 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={method === 'phone' ? '請輸入電話號碼' : method === 'qr' ? '請輸入 QR 編號' : '請輸入預約編號'}
            type={method === 'phone' ? 'tel' : 'text'}
            style={{ width: '100%', padding: '18px 20px', border: '2px solid #e5e7eb', borderRadius: 14, fontSize: 22, textAlign: 'center', boxSizing: 'border-box', letterSpacing: 2 }}
            autoFocus
          />
        </div>

        <button onClick={handleSearch} disabled={!query.trim()} style={{ ...btn, width: '100%', padding: '18px', fontSize: 22, background: query.trim() ? ACCENT : '#ccc', color: '#fff', marginBottom: 12 }}>查詢 / 簽到</button>

        <button onClick={() => setStep('walkin')} style={{ ...btn, width: '100%', padding: '14px', fontSize: 17, background: '#fff', color: ACCENT, border: `2px solid ${ACCENT}` }}>無預約？即場登記</button>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center' }}>
          <button onClick={toggleFullscreen} style={{ ...btn, padding: '6px 14px', fontSize: 12, background: '#f0f0f0', color: '#888' }}>{isFullscreen ? '退出全螢幕' : '全螢幕模式'}</button>
          {user && <button onClick={() => setMode('admin')} style={{ ...btn, padding: '6px 14px', fontSize: 12, background: '#f0f0f0', color: '#888' }}>管理員入口</button>}
        </div>
      </div>
    </div>
  );
}
