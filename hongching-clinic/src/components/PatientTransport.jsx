import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getDoctors } from '../data';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const BK_KEY = 'hcmc_transport_bookings';
const DR_KEY = 'hcmc_transport_drivers';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const STATUS_LIST = ['已預約','已派車','接載中','已到達','已完成'];
const STATUS_COLOR = { '已預約':'#d97706','已派車':'#2563eb','接載中':'#7c3aed','已到達':'#16a34a','已完成':'#6b7280' };
function load(k, fb) { try { return JSON.parse(localStorage.getItem(k)) || fb; } catch { return fb; } }
function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
const toDay = () => new Date().toISOString().substring(0, 10);

export default function PatientTransport({ data, showToast, user }) {
  const DOCTORS = getDoctors();
  const patients = data?.patients || [];
  const [bookings, setBookings] = useState(() => load(BK_KEY, []));
  const [drivers, setDrivers] = useState(() => load(DR_KEY, [
    { id:'d1', name:'陳司機', phone:'91234567', vehicle:'七人車 AB1234', active:true },
    { id:'d2', name:'李司機', phone:'98765432', vehicle:'輪椅車 CD5678', active:true },
  ]));
  const [tab, setTab] = useState('schedule');
  const [showForm, setShowForm] = useState(false);
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [filterDate, setFilterDate] = useState(toDay());
  const [filterStatus, setFilterStatus] = useState('all');
  const [pSearch, setPSearch] = useState('');
  const emptyForm = { patientId:'', patientName:'', phone:'', pickupAddress:'', pickupTime:'09:00',
    appointmentTime:'10:00', returnTrip:false, wheelchair:false, driverId:'', notes:'' };
  const [form, setForm] = useState(emptyForm);
  const emptyDriver = { name:'', phone:'', vehicle:'', active:true };
  const [dForm, setDForm] = useState(emptyDriver);

  const pResults = useMemo(() => {
    if (!pSearch.trim()) return [];
    const q = pSearch.toLowerCase();
    return patients.filter(p => (p.name||'').toLowerCase().includes(q) || (p.phone||'').includes(q)).slice(0, 6);
  }, [pSearch, patients]);

  const dayBookings = useMemo(() => {
    let r = bookings.filter(b => b.date === filterDate);
    if (filterStatus !== 'all') r = r.filter(b => b.status === filterStatus);
    return r.sort((a, b) => (a.pickupTime||'').localeCompare(b.pickupTime||''));
  }, [bookings, filterDate, filterStatus]);

  const stats = useMemo(() => {
    const day = bookings.filter(b => b.date === filterDate);
    const areas = {}; day.forEach(b => { const a = (b.pickupAddress||'').split(/[,，]/)[0].trim()||'未知'; areas[a]=(areas[a]||0)+1; });
    const topArea = Object.entries(areas).sort((a,b)=>b[1]-a[1])[0];
    return { total:day.length, completed:day.filter(b=>b.status==='已完成').length, wheelchair:day.filter(b=>b.wheelchair).length,
      returnT:day.filter(b=>b.returnTrip).length, topArea:topArea?`${topArea[0]}(${topArea[1]})`:'-' };
  }, [bookings, filterDate]);

  const routeGroups = useMemo(() => {
    const groups = {};
    dayBookings.filter(b => b.status !== '已完成').forEach(b => {
      const area = (b.pickupAddress||'').split(/[,，]/)[0].trim()||'其他';
      (groups[area] = groups[area]||[]).push(b);
    });
    return Object.entries(groups).sort((a,b) => b[1].length - a[1].length);
  }, [dayBookings]);

  const persist = (next) => { setBookings(next); save(BK_KEY, next); };
  const persistDrivers = (next) => { setDrivers(next); save(DR_KEY, next); };

  const handleSave = () => {
    if (!form.patientName) return showToast('請填寫病人姓名');
    if (!form.pickupAddress) return showToast('請填寫接送地址');
    const entry = { id: uid(), ...form, date: filterDate, status:'已預約', createdAt: toDay(), createdBy: user?.name||'' };
    persist([...bookings, entry]);
    setShowForm(false); setPSearch(''); setForm(emptyForm);
    showToast('已新增接送預約');
  };

  const updateStatus = (id, status) => {
    const next = bookings.map(b => b.id === id ? { ...b, status } : b);
    persist(next); showToast(`狀態更新為「${status}」`);
  };

  const assignDriver = (id, driverId) => {
    const next = bookings.map(b => b.id === id ? { ...b, driverId, status: driverId ? '已派車' : b.status } : b);
    persist(next); if (driverId) showToast('已派車');
  };

  const handleDelete = (id) => { persist(bookings.filter(b => b.id !== id)); showToast('已刪除'); };

  const handleSaveDriver = () => {
    if (!dForm.name) return showToast('請填寫司機姓名');
    persistDrivers([...drivers, { id: uid(), ...dForm }]);
    setShowDriverForm(false); setDForm(emptyDriver); showToast('已新增司機');
  };
  const toggleDriver = (id) => persistDrivers(drivers.map(d => d.id === id ? { ...d, active: !d.active } : d));
  const removeDriver = (id) => { persistDrivers(drivers.filter(d => d.id !== id)); showToast('已刪除司機'); };
  const driverName = (id) => drivers.find(d => d.id === id)?.name || '-';

  const handleWhatsAppDriver = (driverId) => {
    const dr = drivers.find(d => d.id === driverId);
    if (!dr?.phone) return showToast('司機無電話號碼');
    const trips = dayBookings.filter(b => b.driverId === driverId && b.status !== '已完成');
    if (!trips.length) return showToast('該司機今日無行程');
    let phone = dr.phone.replace(/[\s\-()]/g,''); if (phone.length===8) phone='852'+phone;
    const lines = trips.map((t,i) => `${i+1}. ${t.pickupTime} ${t.patientName} | ${t.pickupAddress}${t.wheelchair?' [輪椅]':''}${t.returnTrip?' [回程]':''}`);
    const msg = `${getClinicName()} 接送安排 (${filterDate})\n司機：${dr.name}\n車輛：${dr.vehicle}\n\n${lines.join('\n')}\n\n共${trips.length}程，請確認。`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handlePrint = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const rows = dayBookings.map(b =>
      `<tr><td>${b.pickupTime}</td><td>${escapeHtml(b.patientName)}</td><td>${escapeHtml(b.pickupAddress)}</td><td>${b.appointmentTime}</td><td>${escapeHtml(driverName(b.driverId))}</td><td>${b.wheelchair?'是':'-'}</td><td>${b.returnTrip?'是':'-'}</td><td style="color:${STATUS_COLOR[b.status]};font-weight:700">${escapeHtml(b.status)}</td><td>${escapeHtml(b.notes||'-')}</td></tr>`
    ).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>接送日程</title><style>body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:1000px;margin:0 auto;font-size:12px}h1{font-size:18px;text-align:center;color:${ACCENT}}.sub{text-align:center;color:#888;font-size:11px;margin-bottom:16px}table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}th{background:#f8f8f8;font-weight:700;font-size:11px}@media print{body{margin:0;padding:8mm}}</style></head><body>
    <h1>${escapeHtml(getClinicName())} — 病人接送日程表</h1>
    <div class="sub">日期：${filterDate} | 共 ${dayBookings.length} 程 | 列印時間：${new Date().toLocaleString('zh-HK')}</div>
    <table><thead><tr><th>接送時間</th><th>病人</th><th>地址</th><th>診症時間</th><th>司機</th><th>輪椅</th><th>回程</th><th>狀態</th><th>備註</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  const s = {
    card: { background:'#fff', borderRadius:10, border:'1px solid #e5e7eb', marginBottom:12 },
    hdr: { padding:'10px 14px', borderBottom:'1px solid #f3f4f6', fontWeight:700, fontSize:14, color:ACCENT },
    stat: { padding:12, borderRadius:8, textAlign:'center', flex:1, minWidth:80 },
    inp: { padding:'6px 10px', border:'1px solid #d1d5db', borderRadius:6, fontSize:13, width:'100%', boxSizing:'border-box' },
    btn: { padding:'6px 14px', borderRadius:6, border:'none', fontSize:13, fontWeight:600, cursor:'pointer' },
    sel: { padding:'6px 10px', border:'1px solid #d1d5db', borderRadius:6, fontSize:12, background:'#fff' },
    td: { padding:'8px 10px', borderBottom:'1px solid #f3f4f6', fontSize:12, whiteSpace:'nowrap' },
    th: { padding:'8px 10px', borderBottom:'2px solid #e5e7eb', fontSize:11, fontWeight:700, textAlign:'left', color:'#6b7280', whiteSpace:'nowrap' },
    tag: (c) => ({ display:'inline-block', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600, color:'#fff', background:c }),
    tabBtn: (a) => ({ padding:'6px 16px', borderRadius:6, border:'none', fontSize:13, fontWeight:600, cursor:'pointer',
      background: a ? ACCENT : '#f3f4f6', color: a ? '#fff' : '#374151' }),
  };

  return (<>
    {/* Stats */}
    <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
      {[
        { label:'今日總程', val:stats.total, color:ACCENT, bg:'#ecfeff' },
        { label:'已完成', val:stats.completed, color:'#16a34a', bg:'#f0fdf4' },
        { label:'需輪椅', val:stats.wheelchair, color:'#7c3aed', bg:'#f5f3ff' },
        { label:'含回程', val:stats.returnT, color:'#d97706', bg:'#fffbeb' },
      ].map(c => (
        <div key={c.label} style={{ ...s.stat, background:c.bg }}>
          <div style={{ fontSize:10, color:c.color, fontWeight:600 }}>{c.label}</div>
          <div style={{ fontSize:24, fontWeight:800, color:c.color }}>{c.val}</div>
        </div>
      ))}
      <div style={{ ...s.stat, background:'#f0f9ff' }}>
        <div style={{ fontSize:10, color:'#0369a1', fontWeight:600 }}>熱門地區</div>
        <div style={{ fontSize:14, fontWeight:700, color:'#0369a1', marginTop:4 }}>{stats.topArea}</div>
      </div>
    </div>

    {/* Tabs + Toolbar */}
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12, alignItems:'center' }}>
      <button style={s.tabBtn(tab==='schedule')} onClick={() => setTab('schedule')}>日程表</button>
      <button style={s.tabBtn(tab==='routes')} onClick={() => setTab('routes')}>路線建議</button>
      <button style={s.tabBtn(tab==='drivers')} onClick={() => setTab('drivers')}>司機管理</button>
      <div style={{ flex:1 }} />
      <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={s.sel} />
      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={s.sel}>
        <option value="all">全部狀態</option>{STATUS_LIST.map(v => <option key={v}>{v}</option>)}
      </select>
      <button style={{ ...s.btn, background:ACCENT, color:'#fff' }} onClick={() => setShowForm(true)}>+ 新增接送</button>
      <button style={{ ...s.btn, background:'#f3f4f6', color:'#374151' }} onClick={handlePrint}>列印</button>
    </div>

    {/* Add booking form */}
    {showForm && (
      <div style={{ ...s.card, padding:16 }}>
        <div style={{ fontWeight:700, fontSize:14, color:ACCENT, marginBottom:12 }}>新增接送預約</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ gridColumn:'1/3', position:'relative' }}>
            <input placeholder="搜尋病人姓名/電話…" value={pSearch} onChange={e => { setPSearch(e.target.value); setForm(f => ({...f, patientName:e.target.value})); }} style={s.inp} />
            {pResults.length > 0 && <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #d1d5db', borderRadius:6, zIndex:10, maxHeight:160, overflowY:'auto' }}>
              {pResults.map(p => <div key={p.id} onClick={() => { setForm(f => ({...f, patientId:p.id, patientName:p.name, phone:p.phone||''})); setPSearch(p.name); }} style={{ padding:'6px 10px', cursor:'pointer', fontSize:12, borderBottom:'1px solid #f3f4f6' }}>{p.name} {p.phone && <span style={{ color:'#888' }}>{p.phone}</span>}</div>)}
            </div>}
          </div>
          <input placeholder="電話" value={form.phone} onChange={e => setForm(f => ({...f, phone:e.target.value}))} style={s.inp} />
          <input placeholder="接送地址" value={form.pickupAddress} onChange={e => setForm(f => ({...f, pickupAddress:e.target.value}))} style={s.inp} />
          <div><label style={{ fontSize:11, color:'#6b7280' }}>接送時間</label><input type="time" value={form.pickupTime} onChange={e => setForm(f => ({...f, pickupTime:e.target.value}))} style={s.inp} /></div>
          <div><label style={{ fontSize:11, color:'#6b7280' }}>診症時間</label><input type="time" value={form.appointmentTime} onChange={e => setForm(f => ({...f, appointmentTime:e.target.value}))} style={s.inp} /></div>
          <select value={form.driverId} onChange={e => setForm(f => ({...f, driverId:e.target.value}))} style={s.inp}>
            <option value="">選擇司機</option>
            {drivers.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name} ({d.vehicle})</option>)}
          </select>
          <input placeholder="備註" value={form.notes} onChange={e => setForm(f => ({...f, notes:e.target.value}))} style={s.inp} />
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
            <input type="checkbox" checked={form.returnTrip} onChange={e => setForm(f => ({...f, returnTrip:e.target.checked}))} /> 需要回程
          </label>
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
            <input type="checkbox" checked={form.wheelchair} onChange={e => setForm(f => ({...f, wheelchair:e.target.checked}))} /> 需要輪椅
          </label>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          <button style={{ ...s.btn, background:ACCENT, color:'#fff' }} onClick={handleSave}>儲存</button>
          <button style={{ ...s.btn, background:'#f3f4f6', color:'#374151' }} onClick={() => { setShowForm(false); setPSearch(''); setForm(emptyForm); }}>取消</button>
        </div>
      </div>
    )}

    {/* Tab: Daily Schedule */}
    {tab === 'schedule' && (
      <div style={s.card}>
        <div style={s.hdr}>接送日程 — {filterDate} （共 {dayBookings.length} 程）</div>
        {dayBookings.length === 0 ? <div style={{ padding:24, textAlign:'center', color:'#9ca3af', fontSize:13 }}>當日暫無接送預約</div> : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>
                {['接送時間','病人','地址','診症時間','司機','輪椅','回程','狀態','操作'].map(h => <th key={h} style={s.th}>{h}</th>)}
              </tr></thead>
              <tbody>{dayBookings.map(b => (
                <tr key={b.id} style={{ background: b.status === '接載中' ? '#f5f3ff' : 'transparent' }}>
                  <td style={{ ...s.td, fontWeight:700, color:ACCENT }}>{b.pickupTime}</td>
                  <td style={s.td}>{b.patientName}{b.phone && <div style={{ fontSize:10, color:'#888' }}>{b.phone}</div>}</td>
                  <td style={{ ...s.td, maxWidth:140, whiteSpace:'normal', fontSize:11 }}>{b.pickupAddress}</td>
                  <td style={s.td}>{b.appointmentTime}</td>
                  <td style={s.td}>
                    <select value={b.driverId||''} onChange={e => assignDriver(b.id, e.target.value)} style={{ ...s.sel, fontSize:11, padding:'3px 6px' }}>
                      <option value="">未派</option>
                      {drivers.filter(d => d.active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </td>
                  <td style={s.td}>{b.wheelchair ? <span style={{ color:'#7c3aed', fontWeight:700 }}>需要</span> : '-'}</td>
                  <td style={s.td}>{b.returnTrip ? <span style={{ color:'#d97706', fontWeight:700 }}>是</span> : '-'}</td>
                  <td style={s.td}><span style={s.tag(STATUS_COLOR[b.status])}>{b.status}</span></td>
                  <td style={s.td}>
                    <div style={{ display:'flex', gap:4 }}>
                      {b.status !== '已完成' && STATUS_LIST.filter(st => st !== b.status).slice(0, 2).map(st =>
                        <button key={st} onClick={() => updateStatus(b.id, st)} style={{ ...s.btn, fontSize:10, padding:'2px 8px', background:'#f3f4f6', color:'#374151' }}>{st}</button>
                      )}
                      <button onClick={() => handleDelete(b.id)} style={{ ...s.btn, fontSize:10, padding:'2px 8px', background:'#fef2f2', color:'#dc2626' }}>刪</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    )}

    {/* Tab: Route Suggestions */}
    {tab === 'routes' && (
      <div style={s.card}>
        <div style={s.hdr}>路線優化建議 — {filterDate}</div>
        {routeGroups.length === 0 ? <div style={{ padding:24, textAlign:'center', color:'#9ca3af', fontSize:13 }}>當日暫無待安排行程</div> : (
          <div style={{ padding:12 }}>
            <div style={{ fontSize:12, color:'#6b7280', marginBottom:10 }}>系統按地址分組，建議同區域接送安排同一司機以減少行車時間。</div>
            {routeGroups.map(([area, trips]) => (
              <div key={area} style={{ marginBottom:14, padding:10, background:'#f8fafc', borderRadius:8, border:'1px solid #e2e8f0' }}>
                <div style={{ fontWeight:700, fontSize:13, color:ACCENT, marginBottom:6 }}>{area} ({trips.length}程)</div>
                {trips.sort((a,b) => a.pickupTime.localeCompare(b.pickupTime)).map(t => (
                  <div key={t.id} style={{ display:'flex', gap:10, alignItems:'center', fontSize:12, padding:'4px 0', borderBottom:'1px solid #e5e7eb' }}>
                    <span style={{ fontWeight:700, color:ACCENT, minWidth:50 }}>{t.pickupTime}</span>
                    <span>{t.patientName}</span>
                    <span style={{ color:'#888', fontSize:11 }}>{t.pickupAddress}</span>
                    {t.wheelchair && <span style={s.tag('#7c3aed')}>輪椅</span>}
                    <span style={{ marginLeft:'auto', fontSize:11, color:'#888' }}>司機：{driverName(t.driverId)}</span>
                  </div>
                ))}
                {trips.length >= 2 && <div style={{ marginTop:6, fontSize:11, color:'#16a34a', fontWeight:600 }}>建議：可合併接送，節省約{(trips.length - 1) * 10}分鐘</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    {/* Tab: Driver Management */}
    {tab === 'drivers' && (
      <div style={s.card}>
        <div style={{ ...s.hdr, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>司機管理</span>
          <button style={{ ...s.btn, background:ACCENT, color:'#fff', fontSize:12 }} onClick={() => setShowDriverForm(true)}>+ 新增司機</button>
        </div>
        {showDriverForm && (
          <div style={{ padding:12, borderBottom:'1px solid #f3f4f6' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              <input placeholder="司機姓名" value={dForm.name} onChange={e => setDForm(f => ({...f, name:e.target.value}))} style={s.inp} />
              <input placeholder="電話" value={dForm.phone} onChange={e => setDForm(f => ({...f, phone:e.target.value}))} style={s.inp} />
              <input placeholder="車輛資料" value={dForm.vehicle} onChange={e => setDForm(f => ({...f, vehicle:e.target.value}))} style={s.inp} />
            </div>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button style={{ ...s.btn, background:ACCENT, color:'#fff' }} onClick={handleSaveDriver}>儲存</button>
              <button style={{ ...s.btn, background:'#f3f4f6', color:'#374151' }} onClick={() => { setShowDriverForm(false); setDForm(emptyDriver); }}>取消</button>
            </div>
          </div>
        )}
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              {['姓名','電話','車輛','狀態','今日行程','操作'].map(h => <th key={h} style={s.th}>{h}</th>)}
            </tr></thead>
            <tbody>{drivers.map(d => {
              const dTrips = bookings.filter(b => b.driverId === d.id && b.date === filterDate);
              return (
                <tr key={d.id}>
                  <td style={{ ...s.td, fontWeight:700 }}>{d.name}</td>
                  <td style={s.td}>{d.phone}</td>
                  <td style={s.td}>{d.vehicle}</td>
                  <td style={s.td}><span style={s.tag(d.active ? '#16a34a' : '#9ca3af')}>{d.active ? '在職' : '停用'}</span></td>
                  <td style={s.td}>{dTrips.length} 程</td>
                  <td style={s.td}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={() => toggleDriver(d.id)} style={{ ...s.btn, fontSize:10, padding:'2px 8px', background:'#f3f4f6', color:'#374151' }}>{d.active?'停用':'啟用'}</button>
                      {dTrips.length > 0 && <button onClick={() => handleWhatsAppDriver(d.id)} style={{ ...s.btn, fontSize:10, padding:'2px 8px', background:'#25d366', color:'#fff' }}>WhatsApp</button>}
                      <button onClick={() => removeDriver(d.id)} style={{ ...s.btn, fontSize:10, padding:'2px 8px', background:'#fef2f2', color:'#dc2626' }}>刪除</button>
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>
    )}
  </>);
}
