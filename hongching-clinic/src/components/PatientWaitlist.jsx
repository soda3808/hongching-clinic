import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getDoctors } from '../data';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_waitlist';
const ACCENT = '#0e7490';
const SERVICES = ['診金','針灸','推拿','天灸','拔罐','刮痧','艾灸','覆診','其他'];
const STATUS_LIST = ['等待中','已通知','已預約','已取消'];
const STATUS_COLOR = { '等待中':'#d97706', '已通知':'#2563eb', '已預約':'#16a34a', '已取消':'#9ca3af' };
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function save(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); }
const toDay = () => new Date().toISOString().substring(0, 10);
const daysBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));

export default function PatientWaitlist({ data, showToast, user }) {
  const DOCTORS = getDoctors();
  const patients = data?.patients || [];
  const [list, setList] = useState(load);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterService, setFilterService] = useState('all');
  const [filterDoctor, setFilterDoctor] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [pSearch, setPSearch] = useState('');
  const emptyForm = { patientId:'', patientName:'', phone:'', preferredDoctor: DOCTORS[0]||'',
    preferredDate:'', preferredTime:'10:00', service: SERVICES[0], priority:'normal', notes:'' };
  const [form, setForm] = useState(emptyForm);

  const pResults = useMemo(() => {
    if (!pSearch.trim()) return [];
    const q = pSearch.toLowerCase();
    return patients.filter(p => (p.name||'').toLowerCase().includes(q) || (p.phone||'').includes(q)).slice(0, 6);
  }, [pSearch, patients]);

  const filtered = useMemo(() => {
    let r = [...list];
    if (filterService !== 'all') r = r.filter(w => w.service === filterService);
    if (filterDoctor !== 'all') r = r.filter(w => w.preferredDoctor === filterDoctor);
    if (filterStatus !== 'all') r = r.filter(w => w.status === filterStatus);
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter(w => (w.patientName||'').toLowerCase().includes(q)); }
    return r.sort((a, b) => {
      if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
      if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
      return (a.createdAt||'').localeCompare(b.createdAt||'');
    });
  }, [list, filterService, filterDoctor, filterStatus, search]);

  const stats = useMemo(() => {
    const waiting = list.filter(w => w.status === '等待中').length;
    const booked = list.filter(w => w.status === '已預約').length;
    const cancelled = list.filter(w => w.status === '已取消').length;
    const waitDays = list.filter(w => w.status === '等待中').map(w => daysBetween(w.createdAt, toDay()));
    const avgWait = waitDays.length ? (waitDays.reduce((s, v) => s + v, 0) / waitDays.length).toFixed(1) : 0;
    const closed = booked + cancelled;
    const conversion = closed ? ((booked / closed) * 100).toFixed(1) : (list.length ? '0.0' : '-');
    const autoNotify = list.filter(w => w.autoNotify && w.status === '等待中').length;
    return { waiting, booked, avgWait, conversion, autoNotify };
  }, [list]);

  const selectPatient = (p) => {
    setForm(f => ({ ...f, patientId: p.id, patientName: p.name, phone: p.phone||'' }));
    setPSearch(p.name);
  };

  const handleSave = () => {
    if (!form.patientName) return showToast('請選擇病人');
    if (!form.preferredDate) return showToast('請選擇日期');
    const entry = { id: uid(), ...form, status:'等待中', autoNotify:false, createdAt: toDay(), createdBy: user?.name||'' };
    const next = [...list, entry]; setList(next); save(next);
    setShowForm(false); setPSearch(''); setForm(emptyForm);
    showToast('已加入候補名單');
  };

  const updateStatus = (id, status) => {
    const next = list.map(w => w.id === id ? { ...w, status, updatedAt: toDay() } : w);
    setList(next); save(next); showToast(`狀態已更新為「${status}」`);
  };

  const toggleAutoNotify = (id) => {
    const next = list.map(w => w.id === id ? { ...w, autoNotify: !w.autoNotify } : w);
    setList(next); save(next);
    showToast(next.find(w => w.id === id)?.autoNotify ? '已標記自動通知' : '已取消自動通知');
  };

  const handleDelete = (id) => { const next = list.filter(w => w.id !== id); setList(next); save(next); showToast('已刪除'); };

  const handleWhatsApp = (w) => {
    let phone = (w.phone||'').replace(/[\s\-()]/g, '');
    if (phone.length === 8) phone = '852' + phone;
    const msg = `${w.patientName}您好，您在${getClinicName()}候補的${w.service}（${w.preferredDoctor}）現有空檔，日期：${w.preferredDate} ${w.preferredTime}，請回覆確認預約。`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    updateStatus(w.id, '已通知');
  };

  const handleBatchNotify = () => {
    const toNotify = list.filter(w => w.autoNotify && w.status === '等待中' && w.phone);
    if (!toNotify.length) return showToast('沒有需要通知的候補病人');
    toNotify.forEach(w => handleWhatsApp(w));
    showToast(`已發送 ${toNotify.length} 個 WhatsApp 通知`);
  };

  const handlePrint = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const rows = filtered.map(e => `<tr><td>${escapeHtml(e.patientName)}</td><td>${escapeHtml(e.service)}</td><td>${escapeHtml(e.preferredDoctor)}</td><td>${e.preferredDate} ${e.preferredTime}</td><td style="color:${STATUS_COLOR[e.status]};font-weight:700">${escapeHtml(e.status)}</td><td>${e.priority==='urgent'?'緊急':'普通'}</td><td>${escapeHtml(e.notes||'-')}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>候補名單</title><style>body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:900px;margin:0 auto;font-size:12px}h1{font-size:18px;text-align:center;color:${ACCENT}}.sub{text-align:center;color:#888;font-size:11px;margin-bottom:16px}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}.b{border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center}.b .n{font-size:20px;font-weight:800}.b .l{font-size:10px;color:#888}table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}th{background:#f8f8f8;font-weight:700;font-size:11px}@media print{body{margin:0;padding:8mm}}</style></head><body>
    <h1>${escapeHtml(getClinicName())} — 候補名單</h1>
    <div class="sub">列印時間：${new Date().toLocaleString('zh-HK')} | 共 ${filtered.length} 筆</div>
    <div class="g"><div class="b"><div class="n" style="color:${ACCENT}">${stats.waiting}</div><div class="l">等待中</div></div><div class="b"><div class="n" style="color:#16a34a">${stats.booked}</div><div class="l">已預約</div></div><div class="b"><div class="n" style="color:#d97706">${stats.avgWait}天</div><div class="l">平均等待</div></div><div class="b"><div class="n" style="color:#2563eb">${stats.conversion}%</div><div class="l">轉換率</div></div></div>
    <table><thead><tr><th>病人</th><th>服務</th><th>醫師</th><th>期望日期/時間</th><th>狀態</th><th>優先</th><th>備註</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
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
  };

  return (<>
    {/* Stats Dashboard */}
    <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
      <div style={{ ...s.stat, background:'#ecfeff' }}>
        <div style={{ fontSize:10, color:ACCENT, fontWeight:600 }}>等待中</div>
        <div style={{ fontSize:24, fontWeight:800, color:ACCENT }}>{stats.waiting}</div>
      </div>
      <div style={{ ...s.stat, background:'#f0fdf4' }}>
        <div style={{ fontSize:10, color:'#16a34a', fontWeight:600 }}>已預約（轉換）</div>
        <div style={{ fontSize:24, fontWeight:800, color:'#16a34a' }}>{stats.booked}</div>
      </div>
      <div style={{ ...s.stat, background:'#fffbeb' }}>
        <div style={{ fontSize:10, color:'#d97706', fontWeight:600 }}>平均等待天數</div>
        <div style={{ fontSize:24, fontWeight:800, color:'#d97706' }}>{stats.avgWait}<span style={{ fontSize:11 }}>天</span></div>
      </div>
      <div style={{ ...s.stat, background:'#eff6ff' }}>
        <div style={{ fontSize:10, color:'#2563eb', fontWeight:600 }}>轉換率</div>
        <div style={{ fontSize:24, fontWeight:800, color:'#2563eb' }}>{stats.conversion}<span style={{ fontSize:11 }}>%</span></div>
      </div>
    </div>

    {/* Toolbar */}
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12, alignItems:'center' }}>
      <button style={{ ...s.btn, background:ACCENT, color:'#fff' }} onClick={() => setShowForm(true)}>+ 加入候補</button>
      <button style={{ ...s.btn, background:'#f3f4f6', color:'#374151' }} onClick={handlePrint}>列印</button>
      {stats.autoNotify > 0 && <button style={{ ...s.btn, background:'#25d366', color:'#fff' }} onClick={handleBatchNotify}>批量通知 ({stats.autoNotify})</button>}
      <div style={{ flex:1 }} />
      <input placeholder="搜尋病人…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...s.sel, width:140 }} />
      <select value={filterService} onChange={e => setFilterService(e.target.value)} style={s.sel}>
        <option value="all">全部服務</option>{SERVICES.map(v => <option key={v}>{v}</option>)}
      </select>
      <select value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)} style={s.sel}>
        <option value="all">全部醫師</option>{DOCTORS.map(v => <option key={v}>{v}</option>)}
      </select>
      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={s.sel}>
        <option value="all">全部狀態</option>{STATUS_LIST.map(v => <option key={v}>{v}</option>)}
      </select>
    </div>

    {/* Add Form Modal */}
    {showForm && <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.35)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setShowForm(false)}>
      <div style={{ background:'#fff', borderRadius:12, padding:20, width:420, maxWidth:'95vw', maxHeight:'90vh', overflow:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight:700, fontSize:16, color:ACCENT, marginBottom:14 }}>加入候補名單</div>
        <div style={{ marginBottom:10 }}>
          <label style={{ fontSize:12, fontWeight:600, display:'block', marginBottom:4 }}>病人</label>
          <input placeholder="輸入姓名搜尋…" value={pSearch} onChange={e => { setPSearch(e.target.value); setForm(f => ({ ...f, patientName:e.target.value, patientId:'' })); }} style={s.inp} />
          {pResults.length > 0 && <div style={{ border:'1px solid #e5e7eb', borderRadius:6, maxHeight:150, overflow:'auto', marginTop:4 }}>
            {pResults.map(p => <div key={p.id} onClick={() => selectPatient(p)} style={{ padding:'6px 10px', cursor:'pointer', fontSize:12, borderBottom:'1px solid #f3f4f6' }}
              onMouseOver={e => e.currentTarget.style.background='#ecfeff'} onMouseOut={e => e.currentTarget.style.background=''}>{p.name} {p.phone && <span style={{ color:'#9ca3af' }}>({p.phone})</span>}</div>)}
          </div>}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <div><label style={{ fontSize:12, fontWeight:600, display:'block', marginBottom:4 }}>服務</label>
            <select value={form.service} onChange={e => setForm(f => ({ ...f, service:e.target.value }))} style={s.inp}>{SERVICES.map(v => <option key={v}>{v}</option>)}</select></div>
          <div><label style={{ fontSize:12, fontWeight:600, display:'block', marginBottom:4 }}>醫師</label>
            <select value={form.preferredDoctor} onChange={e => setForm(f => ({ ...f, preferredDoctor:e.target.value }))} style={s.inp}>{DOCTORS.map(v => <option key={v}>{v}</option>)}</select></div>
          <div><label style={{ fontSize:12, fontWeight:600, display:'block', marginBottom:4 }}>期望日期</label>
            <input type="date" value={form.preferredDate} onChange={e => setForm(f => ({ ...f, preferredDate:e.target.value }))} style={s.inp} /></div>
          <div><label style={{ fontSize:12, fontWeight:600, display:'block', marginBottom:4 }}>期望時間</label>
            <input type="time" value={form.preferredTime} onChange={e => setForm(f => ({ ...f, preferredTime:e.target.value }))} style={s.inp} /></div>
          <div><label style={{ fontSize:12, fontWeight:600, display:'block', marginBottom:4 }}>優先級</label>
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority:e.target.value }))} style={s.inp}><option value="normal">普通</option><option value="urgent">緊急</option></select></div>
          <div><label style={{ fontSize:12, fontWeight:600, display:'block', marginBottom:4 }}>電話</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone:e.target.value }))} style={s.inp} placeholder="WhatsApp 號碼" /></div>
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={{ fontSize:12, fontWeight:600, display:'block', marginBottom:4 }}>備註</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes:e.target.value }))} rows={2} style={{ ...s.inp, resize:'vertical' }} />
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button style={{ ...s.btn, background:'#f3f4f6', color:'#374151' }} onClick={() => setShowForm(false)}>取消</button>
          <button style={{ ...s.btn, background:ACCENT, color:'#fff' }} onClick={handleSave}>儲存</button>
        </div>
      </div>
    </div>}

    {/* Waitlist Table */}
    <div style={s.card}>
      <div style={{ ...s.hdr, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span>候補名單（{filtered.length}）</span>
        <span style={{ fontSize:11, color:'#9ca3af', fontWeight:400 }}>緊急優先排序</span>
      </div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>
            {['優先','病人','服務','醫師','期望日期','等待天數','狀態','通知','操作'].map(h => <th key={h} style={s.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {!filtered.length && <tr><td colSpan={9} style={{ textAlign:'center', padding:30, color:'#9ca3af', fontSize:13 }}>暫無候補記錄</td></tr>}
            {filtered.map(w => {
              const waitD = w.status === '等待中' ? daysBetween(w.createdAt, toDay()) : '-';
              return (<tr key={w.id} style={{ background: w.priority === 'urgent' ? '#fef2f2' : '' }}>
                <td style={s.td}>{w.priority === 'urgent' ? <span style={{ color:'#dc2626', fontWeight:700, fontSize:11 }}>!!! 緊急</span> : <span style={{ color:'#9ca3af', fontSize:11 }}>普通</span>}</td>
                <td style={{ ...s.td, fontWeight:600 }}>{w.patientName}{w.phone && <div style={{ fontSize:10, color:'#9ca3af' }}>{w.phone}</div>}</td>
                <td style={s.td}>{w.service}</td>
                <td style={s.td}>{w.preferredDoctor}</td>
                <td style={s.td}>{w.preferredDate} {w.preferredTime}</td>
                <td style={s.td}>{typeof waitD === 'number' ? <span style={{ fontWeight:700, color: waitD > 7 ? '#dc2626' : waitD > 3 ? '#d97706' : ACCENT }}>{waitD}天</span> : waitD}</td>
                <td style={s.td}><span style={s.tag(STATUS_COLOR[w.status]||'#888')}>{w.status}</span></td>
                <td style={s.td}><input type="checkbox" checked={!!w.autoNotify} onChange={() => toggleAutoNotify(w.id)} title="有空檔時自動通知" style={{ cursor:'pointer' }} /></td>
                <td style={{ ...s.td, whiteSpace:'nowrap' }}>
                  <select value={w.status} onChange={e => updateStatus(w.id, e.target.value)} style={{ ...s.sel, fontSize:11, padding:'2px 6px', marginRight:4 }}>{STATUS_LIST.map(v => <option key={v}>{v}</option>)}</select>
                  {w.phone && <button title="WhatsApp 通知" onClick={() => handleWhatsApp(w)} style={{ ...s.btn, background:'#25d366', color:'#fff', padding:'2px 8px', fontSize:11, marginRight:4 }}>WA</button>}
                  <button onClick={() => handleDelete(w.id)} style={{ ...s.btn, background:'#fee2e2', color:'#dc2626', padding:'2px 8px', fontSize:11 }}>刪</button>
                </td>
              </tr>);
            })}
          </tbody>
        </table>
      </div>
    </div>

    {/* Service & Doctor Summary */}
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
      <div style={s.card}>
        <div style={s.hdr}>按服務統計</div>
        <div style={{ padding:12 }}>
          {SERVICES.map(sv => {
            const c = list.filter(w => w.service === sv && w.status === '等待中').length;
            if (!c) return null;
            return (<div key={sv} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{sv}</span>
              <div style={{ width:80, background:'#f3f4f6', borderRadius:6, height:12, overflow:'hidden' }}>
                <div style={{ width:`${Math.min(100, c/Math.max(1,stats.waiting)*100)}%`, height:'100%', background:ACCENT, borderRadius:6 }} />
              </div>
              <span style={{ fontSize:12, fontWeight:700, color:ACCENT, width:28, textAlign:'right' }}>{c}</span>
            </div>);
          }).filter(Boolean)}
          {!list.filter(w => w.status === '等待中').length && <div style={{ textAlign:'center', color:'#aaa', fontSize:12, padding:16 }}>暫無等待中記錄</div>}
        </div>
      </div>
      <div style={s.card}>
        <div style={s.hdr}>按醫師統計</div>
        <div style={{ padding:12 }}>
          {DOCTORS.map(doc => {
            const c = list.filter(w => w.preferredDoctor === doc && w.status === '等待中').length;
            if (!c) return null;
            return (<div key={doc} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{doc}</span>
              <div style={{ width:80, background:'#f3f4f6', borderRadius:6, height:12, overflow:'hidden' }}>
                <div style={{ width:`${Math.min(100, c/Math.max(1,stats.waiting)*100)}%`, height:'100%', background:'#8B6914', borderRadius:6 }} />
              </div>
              <span style={{ fontSize:12, fontWeight:700, color:'#8B6914', width:28, textAlign:'right' }}>{c}</span>
            </div>);
          }).filter(Boolean)}
          {!list.filter(w => w.status === '等待中').length && <div style={{ textAlign:'center', color:'#aaa', fontSize:12, padding:16 }}>暫無等待中記錄</div>}
        </div>
      </div>
    </div>
  </>);
}
