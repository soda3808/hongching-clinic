import { useState, useMemo } from 'react';
import { uid, fmtM, getDoctors } from '../data';
import { getClinicName } from '../tenant';

const A = '#0e7490';
const LS_PKG = 'hcmc_screening_packages';
const LS_BK = 'hcmc_screening_bookings';

const CONSTITUTIONS = ['平和質','氣虛質','陽虛質','陰虛質','痰濕質','濕熱質','血瘀質','氣鬱質','特稀質'];

const DEFAULT_PKGS = [
  { id:'sp1', name:'基本體檢', items:['血壓','脈搏','BMI','舌診','脈診'], price:580, duration:30, active:true },
  { id:'sp2', name:'長者健康檢查', items:['血壓','脈搏','BMI','舌診','脈診','血糖','關節評估'], price:980, duration:60, active:true },
  { id:'sp3', name:'體質辨識', items:['九型體質問卷','舌診','脈診','體質分析報告'], price:680, duration:45, active:true },
  { id:'sp4', name:'企業員工體檢', items:['血壓','脈搏','BMI','視力','舌診','脈診','肩頸評估'], price:480, duration:30, active:true },
  { id:'sp5', name:'產前調理評估', items:['血壓','脈搏','舌診','脈診','體質辨識','氣血評估','飲食建議'], price:880, duration:50, active:true },
];

const load = (k, fb) => { try { const d = localStorage.getItem(k); return d ? JSON.parse(d) : fb; } catch { return fb; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const today = () => new Date().toISOString().substring(0, 10);
const thisMonth = () => new Date().toISOString().substring(0, 7);

const card = { background:'#fff', borderRadius:10, padding:18, boxShadow:'0 1px 4px rgba(0,0,0,.08)', marginBottom:14 };
const btn = (bg = A, c = '#fff') => ({ background:bg, color:c, border:'none', borderRadius:6, padding:'7px 16px', cursor:'pointer', fontWeight:600, fontSize:13 });
const badge = (bg, fg) => ({ display:'inline-block', padding:'2px 10px', borderRadius:12, fontSize:12, fontWeight:600, background:bg, color:fg });
const inp = { width:'100%', padding:'7px 10px', border:'1px solid #d1d5db', borderRadius:6, fontSize:13, boxSizing:'border-box' };
const overlay = { position:'fixed', inset:0, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 };
const modal = { background:'#fff', borderRadius:12, padding:24, width:'95%', maxWidth:520, maxHeight:'85vh', overflowY:'auto' };

export default function HealthScreening({ data, showToast, user }) {
  const [tab, setTab] = useState('packages');
  const [pkgs, setPkgs] = useState(() => load(LS_PKG, DEFAULT_PKGS));
  const [bookings, setBookings] = useState(() => load(LS_BK, []));
  const [showModal, setShowModal] = useState(null); // 'pkg' | 'book' | 'result' | null
  const [editPkg, setEditPkg] = useState(null);
  const [pkgForm, setPkgForm] = useState({ name:'', items:[], price:'', duration:'', active:true });
  const [newItem, setNewItem] = useState('');
  const [bookForm, setBookForm] = useState({ patientName:'', packageId:'', date:today(), doctor: getDoctors()[0] || '', notes:'' });
  const [selBooking, setSelBooking] = useState(null);
  const [resultMap, setResultMap] = useState({});

  const doctors = getDoctors();
  const patients = data?.patients || [];

  const savePkgs = p => { setPkgs(p); save(LS_PKG, p); };
  const saveBookings = b => { setBookings(b); save(LS_BK, b); };

  // ── Stats ──
  const stats = useMemo(() => {
    const mo = thisMonth();
    const moBookings = bookings.filter(b => (b.date || '').substring(0, 7) === mo);
    const revenue = moBookings.reduce((s, b) => { const p = pkgs.find(x => x.id === b.packageId); return s + (p ? p.price : 0); }, 0);
    const byPkg = {};
    moBookings.forEach(b => { const p = pkgs.find(x => x.id === b.packageId); byPkg[p?.name || '未知'] = (byPkg[p?.name || '未知'] || 0) + 1; });
    return { total: moBookings.length, revenue, byPkg, completed: moBookings.filter(b => b.status === '已完成').length };
  }, [bookings, pkgs]);

  // ── Package CRUD ──
  const openAddPkg = () => { setEditPkg(null); setPkgForm({ name:'', items:[], price:'', duration:'', active:true }); setShowModal('pkg'); };
  const openEditPkg = p => { setEditPkg(p.id); setPkgForm({ name:p.name, items:[...p.items], price:p.price, duration:p.duration, active:p.active }); setShowModal('pkg'); };
  const savePkg = () => {
    if (!pkgForm.name.trim()) { showToast?.('請輸入套餐名稱'); return; }
    if (!pkgForm.items.length) { showToast?.('請新增檢查項目'); return; }
    if (editPkg) {
      savePkgs(pkgs.map(p => p.id === editPkg ? { ...p, ...pkgForm, price:Number(pkgForm.price), duration:Number(pkgForm.duration) } : p));
      showToast?.('套餐已更新');
    } else {
      savePkgs([...pkgs, { id:uid(), ...pkgForm, price:Number(pkgForm.price), duration:Number(pkgForm.duration) }]);
      showToast?.('套餐已新增');
    }
    setShowModal(null);
  };
  const delPkg = id => { savePkgs(pkgs.filter(p => p.id !== id)); showToast?.('已刪除'); };
  const addItem = () => { if (newItem.trim()) { setPkgForm({ ...pkgForm, items:[...pkgForm.items, newItem.trim()] }); setNewItem(''); } };
  const removeItem = i => setPkgForm({ ...pkgForm, items:pkgForm.items.filter((_, idx) => idx !== i) });

  // ── Booking ──
  const openBook = () => { setBookForm({ patientName:'', packageId:pkgs[0]?.id || '', date:today(), doctor:doctors[0] || '', notes:'' }); setShowModal('book'); };
  const saveBook = () => {
    if (!bookForm.patientName.trim()) { showToast?.('請輸入病人姓名'); return; }
    saveBookings([{ id:uid(), ...bookForm, status:'已預約', createdAt:new Date().toISOString(), results:{} }, ...bookings]);
    showToast?.('預約已建立');
    setShowModal(null);
  };
  const cancelBook = id => { saveBookings(bookings.map(b => b.id === id ? { ...b, status:'已取消' } : b)); showToast?.('已取消'); };

  // ── Results ──
  const openResults = b => { setSelBooking(b); setResultMap(b.results || {}); setShowModal('result'); };
  const saveResults = () => {
    saveBookings(bookings.map(b => b.id === selBooking.id ? { ...b, results:resultMap, status:'已完成' } : b));
    showToast?.('結果已儲存');
    setShowModal(null);
  };

  // ── Print Report ──
  const printReport = b => {
    const pkg = pkgs.find(p => p.id === b.packageId);
    const clinic = getClinicName();
    const rows = (pkg?.items || []).map(it => `<tr><td style="padding:8px;border:1px solid #ddd">${it}</td><td style="padding:8px;border:1px solid #ddd">${b.results?.[it] || '-'}</td></tr>`).join('');
    const html = `<html><head><title>健康檢查報告</title><style>body{font-family:"Microsoft JhengHei",sans-serif;padding:40px;color:#333}table{width:100%;border-collapse:collapse;margin:16px 0}th{background:${A};color:#fff;padding:10px;text-align:left}h1{color:${A}}</style></head><body>
      <h1>${clinic}</h1><h2>健康檢查報告</h2>
      <p><b>病人：</b>${b.patientName} &nbsp; <b>套餐：</b>${pkg?.name || '-'} &nbsp; <b>日期：</b>${b.date} &nbsp; <b>醫師：</b>${b.doctor}</p>
      <table><thead><tr><th>檢查項目</th><th>結果</th></tr></thead><tbody>${rows}</tbody></table>
      ${b.notes ? `<p><b>備註：</b>${b.notes}</p>` : ''}
      <p style="margin-top:32px;color:#888;font-size:12px">此報告由 ${clinic} 健康檢查系統產生</p></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  };

  // ── Tabs ──
  const tabs = [['packages','套餐管理'],['bookings','預約列表'],['stats','統計分析']];

  return (
    <div style={{ padding:16, maxWidth:1100, margin:'0 auto' }}>
      <h2 style={{ color:A, margin:'0 0 16px' }}>健康檢查套餐</h2>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, marginBottom:16 }}>
        {tabs.map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...btn(tab === k ? A : '#e5e7eb', tab === k ? '#fff' : '#374151'), borderRadius:20, padding:'6px 18px' }}>{l}</button>
        ))}
      </div>

      {/* ═══ Packages Tab ═══ */}
      {tab === 'packages' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button onClick={openAddPkg} style={btn()}>+ 新增套餐</button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
            {pkgs.filter(p => p.active).map(p => (
              <div key={p.id} style={card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <b style={{ fontSize:15, color:A }}>{p.name}</b>
                  <span style={badge('#ecfeff', A)}>{fmtM(p.price)}</span>
                </div>
                <div style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>時長：{p.duration} 分鐘</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:10 }}>
                  {p.items.map((it, i) => <span key={i} style={badge('#f0fdfa', '#0d9488')}>{it}</span>)}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => openEditPkg(p)} style={btn('#e0f2fe','#0369a1')}>編輯</button>
                  <button onClick={() => delPkg(p.id)} style={btn('#fee2e2','#dc2626')}>刪除</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Bookings Tab ═══ */}
      {tab === 'bookings' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button onClick={openBook} style={btn()}>+ 新增預約</button>
          </div>
          <div style={card}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr style={{ borderBottom:`2px solid ${A}` }}>
                {['病人','套餐','日期','醫師','狀態','操作'].map(h => <th key={h} style={{ textAlign:'left', padding:'8px 6px', color:A }}>{h}</th>)}
              </tr></thead>
              <tbody>{bookings.map(b => {
                const pkg = pkgs.find(p => p.id === b.packageId);
                const sc = b.status === '已完成' ? '#16a34a' : b.status === '已取消' ? '#dc2626' : '#f59e0b';
                return (
                  <tr key={b.id} style={{ borderBottom:'1px solid #f3f4f6' }}>
                    <td style={{ padding:'8px 6px' }}>{b.patientName}</td>
                    <td>{pkg?.name || '-'}</td>
                    <td>{b.date}</td>
                    <td>{b.doctor}</td>
                    <td><span style={badge(sc + '18', sc)}>{b.status}</span></td>
                    <td style={{ display:'flex', gap:4, padding:'8px 0' }}>
                      {b.status === '已預約' && <>
                        <button onClick={() => openResults(b)} style={btn('#ecfdf5','#059669')}>記錄結果</button>
                        <button onClick={() => cancelBook(b.id)} style={btn('#fee2e2','#dc2626')}>取消</button>
                      </>}
                      {b.status === '已完成' && <button onClick={() => printReport(b)} style={btn('#e0f2fe','#0369a1')}>列印報告</button>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
            {!bookings.length && <p style={{ textAlign:'center', color:'#9ca3af', padding:24 }}>暫無預約</p>}
          </div>
        </div>
      )}

      {/* ═══ Stats Tab ═══ */}
      {tab === 'stats' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14, marginBottom:18 }}>
            {[['本月檢查數', stats.total, '次'],['已完成', stats.completed, '次'],['本月收入', fmtM(stats.revenue), '']].map(([l,v,u]) => (
              <div key={l} style={card}>
                <div style={{ fontSize:12, color:'#6b7280' }}>{l}</div>
                <div style={{ fontSize:22, fontWeight:700, color:A }}>{v}<span style={{ fontSize:13, fontWeight:400 }}> {u}</span></div>
              </div>
            ))}
          </div>
          <div style={card}>
            <b style={{ color:A }}>套餐分佈</b>
            {Object.entries(stats.byPkg).length ? (
              <div style={{ marginTop:10 }}>
                {Object.entries(stats.byPkg).sort((a,b) => b[1] - a[1]).map(([name, cnt]) => {
                  const pct = stats.total ? Math.round(cnt / stats.total * 100) : 0;
                  return (
                    <div key={name} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                      <span style={{ width:120, fontSize:13 }}>{name}</span>
                      <div style={{ flex:1, height:18, background:'#f3f4f6', borderRadius:9, overflow:'hidden' }}>
                        <div style={{ width:`${pct}%`, height:'100%', background:A, borderRadius:9, transition:'width .3s' }} />
                      </div>
                      <span style={{ fontSize:12, color:'#6b7280', minWidth:60, textAlign:'right' }}>{cnt} 次 ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            ) : <p style={{ color:'#9ca3af', fontSize:13 }}>本月暫無數據</p>}
          </div>
          {/* Constitution distribution for 體質辨識 results */}
          <div style={card}>
            <b style={{ color:A }}>體質辨識分佈</b>
            {(() => {
              const cMap = {};
              bookings.filter(b => b.status === '已完成' && b.results?.['體質分析報告']).forEach(b => {
                const c = b.results['體質分析報告'];
                if (CONSTITUTIONS.includes(c)) cMap[c] = (cMap[c] || 0) + 1;
              });
              const entries = Object.entries(cMap);
              const total = entries.reduce((s, [,v]) => s + v, 0);
              return entries.length ? (
                <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:10 }}>
                  {entries.sort((a,b) => b[1] - a[1]).map(([c, n]) => (
                    <div key={c} style={{ ...badge('#f0fdfa', '#0d9488'), padding:'6px 12px', fontSize:13 }}>{c}：{n} ({total ? Math.round(n/total*100) : 0}%)</div>
                  ))}
                </div>
              ) : <p style={{ color:'#9ca3af', fontSize:13, marginTop:6 }}>暫無體質辨識數據</p>;
            })()}
          </div>
        </div>
      )}

      {/* ═══ Package Modal ═══ */}
      {showModal === 'pkg' && (
        <div style={overlay} onClick={() => setShowModal(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ color:A, marginTop:0 }}>{editPkg ? '編輯套餐' : '新增套餐'}</h3>
            <label style={{ fontSize:13, fontWeight:600 }}>套餐名稱</label>
            <input style={inp} value={pkgForm.name} onChange={e => setPkgForm({ ...pkgForm, name:e.target.value })} />
            <div style={{ display:'flex', gap:10, marginTop:10 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:13, fontWeight:600 }}>價格 ($)</label>
                <input type="number" style={inp} value={pkgForm.price} onChange={e => setPkgForm({ ...pkgForm, price:e.target.value })} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:13, fontWeight:600 }}>時長 (分鐘)</label>
                <input type="number" style={inp} value={pkgForm.duration} onChange={e => setPkgForm({ ...pkgForm, duration:e.target.value })} />
              </div>
            </div>
            <label style={{ fontSize:13, fontWeight:600, marginTop:10, display:'block' }}>檢查項目</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:6 }}>
              {pkgForm.items.map((it, i) => (
                <span key={i} style={{ ...badge('#ecfeff', A), cursor:'pointer' }} onClick={() => removeItem(i)}>{it} ✕</span>
              ))}
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <input style={{ ...inp, flex:1 }} placeholder="輸入項目名稱" value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} />
              <button onClick={addItem} style={btn()}>加入</button>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={() => setShowModal(null)} style={btn('#e5e7eb','#374151')}>取消</button>
              <button onClick={savePkg} style={btn()}>儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Booking Modal ═══ */}
      {showModal === 'book' && (
        <div style={overlay} onClick={() => setShowModal(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ color:A, marginTop:0 }}>新增健康檢查預約</h3>
            <label style={{ fontSize:13, fontWeight:600 }}>病人姓名</label>
            <input list="pt-list" style={inp} value={bookForm.patientName} onChange={e => setBookForm({ ...bookForm, patientName:e.target.value })} />
            <datalist id="pt-list">{patients.map(p => <option key={p.id} value={p.name} />)}</datalist>
            <label style={{ fontSize:13, fontWeight:600, marginTop:10, display:'block' }}>檢查套餐</label>
            <select style={inp} value={bookForm.packageId} onChange={e => setBookForm({ ...bookForm, packageId:e.target.value })}>
              {pkgs.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name} - {fmtM(p.price)}</option>)}
            </select>
            <div style={{ display:'flex', gap:10, marginTop:10 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:13, fontWeight:600 }}>日期</label>
                <input type="date" style={inp} value={bookForm.date} onChange={e => setBookForm({ ...bookForm, date:e.target.value })} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:13, fontWeight:600 }}>醫師</label>
                <select style={inp} value={bookForm.doctor} onChange={e => setBookForm({ ...bookForm, doctor:e.target.value })}>
                  {doctors.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <label style={{ fontSize:13, fontWeight:600, marginTop:10, display:'block' }}>備註</label>
            <textarea style={{ ...inp, minHeight:60 }} value={bookForm.notes} onChange={e => setBookForm({ ...bookForm, notes:e.target.value })} />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={() => setShowModal(null)} style={btn('#e5e7eb','#374151')}>取消</button>
              <button onClick={saveBook} style={btn()}>確認預約</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Results Modal ═══ */}
      {showModal === 'result' && selBooking && (
        <div style={overlay} onClick={() => setShowModal(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ color:A, marginTop:0 }}>記錄檢查結果 - {selBooking.patientName}</h3>
            {(() => {
              const pkg = pkgs.find(p => p.id === selBooking.packageId);
              return (pkg?.items || []).map(it => (
                <div key={it} style={{ marginBottom:10 }}>
                  <label style={{ fontSize:13, fontWeight:600 }}>{it}</label>
                  {it === '體質分析報告' ? (
                    <select style={inp} value={resultMap[it] || ''} onChange={e => setResultMap({ ...resultMap, [it]:e.target.value })}>
                      <option value="">-- 選擇體質 --</option>
                      {CONSTITUTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <input style={inp} value={resultMap[it] || ''} onChange={e => setResultMap({ ...resultMap, [it]:e.target.value })} placeholder={`輸入${it}結果`} />
                  )}
                </div>
              ));
            })()}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={() => setShowModal(null)} style={btn('#e5e7eb','#374151')}>取消</button>
              <button onClick={saveResults} style={btn()}>儲存結果</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
