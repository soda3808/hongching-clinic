import { useState, useRef } from 'react';
import { saveAllLocal } from '../api';
import { exportJSON, importJSON } from '../utils/export';
import { DEFAULT_USERS, DEFAULT_STORES, ROLE_LABELS, ROLE_TAGS } from '../config';
import { getUsers, saveUsers, getStores, saveStores } from '../auth';
import { useFocusTrap, nullRef } from './ConfirmModal';

export default function SettingsPage({ data, setData, showToast, user }) {
  const [tab, setTab] = useState('clinic');
  const [clinic, setClinic] = useState(() => {
    try { return { name:'康晴綜合醫療中心', nameEn:'Hong Ching International Medical Centre', addr1:'馬頭涌道97號美誠大廈地下', addr2:'長沙灣道28號長康大廈地下', phone:'', whatsapp:'', email:'', ...JSON.parse(localStorage.getItem('hcmc_clinic') || '{}') }; }
    catch { return { name:'康晴綜合醫療中心', nameEn:'Hong Ching International Medical Centre', addr1:'', addr2:'', phone:'', whatsapp:'', email:'' }; }
  });
  const [gasUrl, setGasUrl] = useState(() => localStorage.getItem('hcmc_gas_url') || '');
  const [showReset, setShowReset] = useState(false);

  // User management
  const [users, setUsersState] = useState(getUsers);
  const [editUser, setEditUser] = useState(null);
  const [newUser, setNewUser] = useState({ username:'', password:'', name:'', role:'staff', stores:[], email:'', active:true });

  // Store management
  const [stores, setStoresState] = useState(getStores);
  const [editStore, setEditStore] = useState(null);
  const [newStore, setNewStore] = useState({ name:'', address:'', phone:'', active:true });

  const isAdmin = user?.role === 'admin';
  const editUserRef = useRef(null);
  const editStoreRef = useRef(null);
  const resetRef = useRef(null);
  useFocusTrap(editUser ? editUserRef : nullRef);
  useFocusTrap(editStore ? editStoreRef : nullRef);
  useFocusTrap(showReset ? resetRef : nullRef);

  // ── Clinic ──
  const saveClinic = () => { localStorage.setItem('hcmc_clinic', JSON.stringify(clinic)); showToast('診所資料已儲存'); };
  const saveGas = () => { localStorage.setItem('hcmc_gas_url', gasUrl); showToast('API URL 已儲存'); };

  // ── Data ──
  const handleExport = () => { exportJSON(data, `hcmc_backup_${new Date().toISOString().substring(0,10)}.json`); showToast('數據已匯出'); };
  const handleImport = () => {
    const input = document.createElement('input'); input.type='file'; input.accept='.json';
    input.onchange = async (e) => {
      try {
        const imported = await importJSON(e.target.files[0]);
        const merged = { revenue: imported.revenue||data.revenue||[], expenses: imported.expenses||data.expenses||[], arap: imported.arap||data.arap||[], patients: imported.patients||data.patients||[], bookings: imported.bookings||data.bookings||[], payslips: imported.payslips||data.payslips||[] };
        setData(merged); showToast('數據已匯入');
      } catch (err) { showToast('匯入失敗：' + err.message); }
    };
    input.click();
  };
  const handleReset = () => { localStorage.removeItem('hc_data'); localStorage.removeItem('hcmc_clinic'); localStorage.removeItem('hc_users'); localStorage.removeItem('hc_stores'); window.location.reload(); };

  // ── Users ──
  const handleSaveUser = async (u) => {
    // Hash password if provided as plaintext (not already a bcrypt hash)
    let userToSave = { ...u };
    if (userToSave.password && !userToSave.password.startsWith('$2')) {
      try {
        const { default: bcrypt } = await import('bcryptjs');
        userToSave.passwordHash = bcrypt.hashSync(userToSave.password, 10);
      } catch {
        userToSave.passwordHash = userToSave.password;
      }
    } else if (userToSave.password && userToSave.password.startsWith('$2')) {
      userToSave.passwordHash = userToSave.password;
    }
    delete userToSave.password;
    let updated;
    if (users.find(x => x.id === userToSave.id)) {
      updated = users.map(x => x.id === userToSave.id ? userToSave : x);
    } else {
      updated = [...users, { ...userToSave, id: 'u' + Date.now() }];
    }
    setUsersState(updated); saveUsers(updated); setEditUser(null);
    setNewUser({ username:'', password:'', name:'', role:'staff', stores:[], email:'', active:true });
    showToast('用戶已儲存');
  };
  const toggleUserStore = (u, store) => {
    const s = u.stores.includes(store) ? u.stores.filter(x => x !== store) : [...u.stores, store];
    return { ...u, stores: s };
  };

  // ── Stores ──
  const handleSaveStore = (s) => {
    let updated;
    if (stores.find(x => x.id === s.id)) {
      updated = stores.map(x => x.id === s.id ? s : x);
    } else {
      updated = [...stores, { ...s, id: 's' + Date.now() }];
    }
    setStoresState(updated); saveStores(updated); setEditStore(null);
    setNewStore({ name:'', address:'', phone:'', active:true });
    showToast('分店已儲存');
  };

  const counts = { rev:(data.revenue||[]).length, exp:(data.expenses||[]).length, pt:(data.patients||[]).length, bk:(data.bookings||[]).length };
  const activeStores = stores.filter(s => s.active);

  return (
    <>
      {/* Tabs */}
      <div className="tab-bar" style={{ flexWrap: 'wrap' }}>
        <button className={`tab-btn ${tab==='clinic'?'active':''}`} onClick={()=>setTab('clinic')}>🏥 診所資料</button>
        <button className={`tab-btn ${tab==='system'?'active':''}`} onClick={()=>setTab('system')}>⚙️ 系統設定</button>
        <button className={`tab-btn ${tab==='data'?'active':''}`} onClick={()=>setTab('data')}>💾 數據管理</button>
        <button className={`tab-btn ${tab==='promo'?'active':''}`} onClick={()=>setTab('promo')}>📱 推廣工具</button>
        {isAdmin && <button className={`tab-btn ${tab==='users'?'active':''}`} onClick={()=>setTab('users')}>👥 用戶管理</button>}
        {isAdmin && <button className={`tab-btn ${tab==='stores'?'active':''}`} onClick={()=>setTab('stores')}>🏢 分店管理</button>}
      </div>

      {/* Clinic Info */}
      {tab === 'clinic' && (
        <div className="card">
          <div className="card-header"><h3>診所資料</h3></div>
          <div className="grid-2" style={{ marginBottom:12 }}>
            <div><label>中文名稱</label><input value={clinic.name} onChange={e => setClinic({...clinic, name:e.target.value})} /></div>
            <div><label>英文名稱</label><input value={clinic.nameEn} onChange={e => setClinic({...clinic, nameEn:e.target.value})} /></div>
          </div>
          <div className="grid-2" style={{ marginBottom:12 }}>
            <div><label>宋皇臺地址</label><input value={clinic.addr1} onChange={e => setClinic({...clinic, addr1:e.target.value})} /></div>
            <div><label>太子地址</label><input value={clinic.addr2} onChange={e => setClinic({...clinic, addr2:e.target.value})} /></div>
          </div>
          <div className="grid-3" style={{ marginBottom:12 }}>
            <div><label>電話</label><input value={clinic.phone} onChange={e => setClinic({...clinic, phone:e.target.value})} /></div>
            <div><label>WhatsApp</label><input value={clinic.whatsapp} onChange={e => setClinic({...clinic, whatsapp:e.target.value})} /></div>
            <div><label>Email</label><input value={clinic.email} onChange={e => setClinic({...clinic, email:e.target.value})} /></div>
          </div>
          <button className="btn btn-teal" onClick={saveClinic}>儲存</button>
        </div>
      )}

      {/* System */}
      {tab === 'system' && (
        <div className="card">
          <div className="card-header"><h3>系統設定</h3></div>
          <div style={{ marginBottom:16 }}>
            <label>Google Sheets API URL</label>
            <div style={{ display:'flex', gap:8 }}>
              <input value={gasUrl} onChange={e => setGasUrl(e.target.value)} placeholder="https://script.google.com/macros/s/..." style={{ flex:1 }} />
              <button className="btn btn-teal btn-sm" onClick={saveGas}>儲存</button>
            </div>
            <small style={{ color:'var(--gray-400)', fontSize:11 }}>數據同步：{gasUrl ? '已設定 API' : '僅本地儲存'}</small>
          </div>
          <div className="card" style={{ background:'var(--gray-50)' }}>
            <p style={{ fontSize:13, color:'var(--gray-600)' }}>
              版本 v3.0 — 康晴診所管理系統<br/>
              數據統計：{counts.rev} 筆營業 / {counts.exp} 筆開支 / {counts.pt} 個病人 / {counts.bk} 筆預約
            </p>
          </div>
        </div>
      )}

      {/* Data */}
      {tab === 'data' && (
        <div className="card">
          <div className="card-header"><h3>數據管理</h3></div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button className="btn btn-teal" onClick={handleExport}>📥 匯出所有數據</button>
            <button className="btn btn-gold" onClick={handleImport}>📤 匯入數據</button>
            <button className="btn btn-outline" onClick={() => { localStorage.removeItem('hc_data'); showToast('已清除'); }}>🗑️ 清除緩存</button>
            <button className="btn btn-red" onClick={() => setShowReset(true)}>⚠️ 重置所有數據</button>
          </div>
        </div>
      )}

      {/* Promo Tools */}
      {tab === 'promo' && (
        <>
          <div className="card">
            <div className="card-header"><h3>📱 線上預約 QR Code</h3></div>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
              病人掃描此 QR Code 即可打開線上預約頁面。
            </p>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('https://hongching-clinic.vercel.app/booking')}`}
                alt="Booking QR Code"
                style={{ width: 200, height: 200, borderRadius: 8, border: '2px solid var(--gray-200)' }}
              />
              <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>
                https://hongching-clinic.vercel.app/booking
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&format=png&data=${encodeURIComponent('https://hongching-clinic.vercel.app/booking')}`}
                download="hcmc-booking-qr.png"
                className="btn btn-teal"
              >
                📥 下載 QR Code (PNG)
              </a>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h3>🖨️ 宣傳單張預覽</h3></div>
            <div className="promo-flyer" id="promo-flyer">
              <div style={{ textAlign: 'center', borderBottom: '3px solid var(--teal-700)', paddingBottom: 16, marginBottom: 16 }}>
                <h2 style={{ color: 'var(--teal-700)', fontSize: 22, marginBottom: 4 }}>康晴綜合醫療中心</h2>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', letterSpacing: 2 }}>HONG CHING MEDICAL CENTRE</div>
                <div style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 8 }}>專業中醫診療服務</div>
              </div>
              <div style={{ background: 'var(--gold-100)', padding: '10px 16px', borderRadius: 8, textAlign: 'center', fontWeight: 700, color: '#92400e', marginBottom: 16, fontSize: 14 }}>
                🎉 新客優惠：首次免診金 + 療程套餐9折
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, fontSize: 12 }}>
                <div>
                  <strong>📍 宋皇臺店</strong>
                  <div style={{ color: 'var(--gray-500)' }}>馬頭涌道97號美誠大廈地下</div>
                </div>
                <div>
                  <strong>📍 太子店</strong>
                  <div style={{ color: 'var(--gray-500)' }}>長沙灣道28號長康大廈地下</div>
                </div>
              </div>
              <div style={{ fontSize: 12, marginBottom: 16 }}>
                <div>🕐 營業時間：星期一至六 10:00 - 20:00</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent('https://hongching-clinic.vercel.app/booking')}`}
                  alt="QR"
                  style={{ width: 120, height: 120 }}
                />
                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>掃碼即可線上預約</div>
              </div>
            </div>
            <button className="btn btn-outline" onClick={() => { const w = window.open('', '_blank'); if (!w) { showToast('請允許彈出視窗'); return; } w.document.write('<html><head><title>宣傳單張</title><style>body{font-family:sans-serif;padding:40px;max-width:500px;margin:0 auto}</style></head><body>' + document.getElementById('promo-flyer').innerHTML + '</body></html>'); w.document.close(); w.print(); }} style={{ marginTop: 12 }}>
              🖨️ 列印宣傳單張
            </button>
          </div>
        </>
      )}

      {/* User Management */}
      {tab === 'users' && isAdmin && (
        <>
          <div className="card">
            <div className="card-header"><h3>新增用戶</h3></div>
            <div className="grid-3" style={{ marginBottom:12 }}>
              <div><label>用戶名</label><input value={newUser.username} onChange={e => setNewUser({...newUser, username:e.target.value})} /></div>
              <div><label>密碼</label><input value={newUser.password} onChange={e => setNewUser({...newUser, password:e.target.value})} /></div>
              <div><label>姓名</label><input value={newUser.name} onChange={e => setNewUser({...newUser, name:e.target.value})} /></div>
            </div>
            <div className="grid-2" style={{ marginBottom:12 }}>
              <div><label>角色</label>
                <select value={newUser.role} onChange={e => setNewUser({...newUser, role:e.target.value})}>
                  <option value="admin">管理員</option><option value="manager">店長</option><option value="doctor">醫師</option><option value="staff">助理</option>
                </select>
              </div>
              <div><label>負責分店</label>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', paddingTop:4 }}>
                  {activeStores.map(s => (
                    <label key={s.id} style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, cursor:'pointer' }}>
                      <input type="checkbox" checked={newUser.stores.includes(s.name)} onChange={() => setNewUser(toggleUserStore(newUser, s.name))} />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <button className="btn btn-teal" onClick={() => { if(!newUser.username||!newUser.password||!newUser.name) return showToast('請填寫必要欄位'); handleSaveUser(newUser); }}>新增用戶</button>
          </div>
          <div className="card" style={{ padding:0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>用戶名</th><th>姓名</th><th>角色</th><th>負責分店</th><th>狀態</th><th>操作</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
                      <td style={{ fontWeight:600 }}>{u.username}</td>
                      <td>{u.name}</td>
                      <td><span className={`tag ${ROLE_TAGS[u.role]||''}`}>{ROLE_LABELS[u.role]}</span></td>
                      <td>{u.stores.includes('all') ? '全部' : u.stores.join(', ')}</td>
                      <td><span className={`tag ${u.active?'tag-paid':'tag-overdue'}`}>{u.active?'啟用':'停用'}</span></td>
                      <td><button className="btn btn-outline btn-sm" onClick={() => setEditUser({...u})}>編輯</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Store Management */}
      {tab === 'stores' && isAdmin && (
        <>
          <div className="card">
            <div className="card-header"><h3>新增分店</h3></div>
            <div className="grid-3" style={{ marginBottom:12 }}>
              <div><label>分店名稱</label><input value={newStore.name} onChange={e => setNewStore({...newStore, name:e.target.value})} /></div>
              <div><label>地址</label><input value={newStore.address} onChange={e => setNewStore({...newStore, address:e.target.value})} /></div>
              <div><label>電話</label><input value={newStore.phone} onChange={e => setNewStore({...newStore, phone:e.target.value})} /></div>
            </div>
            <button className="btn btn-teal" onClick={() => { if(!newStore.name) return showToast('請填寫分店名稱'); handleSaveStore(newStore); }}>新增分店</button>
          </div>
          <div className="card" style={{ padding:0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>分店名稱</th><th>地址</th><th>電話</th><th>狀態</th><th>操作</th></tr></thead>
                <tbody>
                  {stores.map(s => (
                    <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                      <td style={{ fontWeight:600 }}>{s.name}</td>
                      <td>{s.address}</td>
                      <td>{s.phone || '-'}</td>
                      <td><span className={`tag ${s.active?'tag-paid':'tag-overdue'}`}>{s.active?'營業中':'已停用'}</span></td>
                      <td><button className="btn btn-outline btn-sm" onClick={() => setEditStore({...s})}>編輯</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)} role="dialog" aria-modal="true" aria-label="編輯用戶">
          <div className="modal" onClick={e => e.stopPropagation()} ref={editUserRef}>
            <h3>編輯用戶 — {editUser.name}</h3>
            <div className="grid-2" style={{ marginBottom:12 }}>
              <div><label>新密碼 (留空不改)</label><input value={editUser.password || ''} onChange={e => setEditUser({...editUser, password:e.target.value})} placeholder="輸入新密碼" /></div>
              <div><label>姓名</label><input value={editUser.name} onChange={e => setEditUser({...editUser, name:e.target.value})} /></div>
            </div>
            <div className="grid-2" style={{ marginBottom:12 }}>
              <div><label>角色</label>
                <select value={editUser.role} onChange={e => setEditUser({...editUser, role:e.target.value})} disabled={editUser.role==='admin' && users.filter(u=>u.role==='admin').length<=1}>
                  <option value="admin">管理員</option><option value="manager">店長</option><option value="doctor">醫師</option><option value="staff">助理</option>
                </select>
              </div>
              <div><label>狀態</label>
                <select value={editUser.active?'true':'false'} onChange={e => setEditUser({...editUser, active:e.target.value==='true'})}>
                  <option value="true">啟用</option><option value="false">停用</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom:12 }}>
              <label>負責分店</label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {editUser.role === 'admin' ? <span style={{ fontSize:12, color:'var(--gray-400)' }}>管理員可見全部分店</span> :
                  activeStores.map(s => (
                    <label key={s.id} style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, cursor:'pointer' }}>
                      <input type="checkbox" checked={editUser.stores.includes(s.name)} onChange={() => setEditUser(toggleUserStore(editUser, s.name))} />
                      {s.name}
                    </label>
                  ))
                }
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-teal" onClick={() => handleSaveUser(editUser)}>儲存</button>
              <button className="btn btn-outline" onClick={() => setEditUser(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Store Modal */}
      {editStore && (
        <div className="modal-overlay" onClick={() => setEditStore(null)} role="dialog" aria-modal="true" aria-label="編輯分店">
          <div className="modal" onClick={e => e.stopPropagation()} ref={editStoreRef}>
            <h3>編輯分店 — {editStore.name}</h3>
            <div className="grid-2" style={{ marginBottom:12 }}>
              <div><label>分店名稱</label><input value={editStore.name} onChange={e => setEditStore({...editStore, name:e.target.value})} /></div>
              <div><label>電話</label><input value={editStore.phone||''} onChange={e => setEditStore({...editStore, phone:e.target.value})} /></div>
            </div>
            <div style={{ marginBottom:12 }}><label>地址</label><input value={editStore.address} onChange={e => setEditStore({...editStore, address:e.target.value})} /></div>
            <div style={{ marginBottom:12 }}>
              <label>狀態</label>
              <select value={editStore.active?'true':'false'} onChange={e => setEditStore({...editStore, active:e.target.value==='true'})}>
                <option value="true">營業中</option><option value="false">已停用</option>
              </select>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-teal" onClick={() => handleSaveStore(editStore)}>儲存</button>
              <button className="btn btn-outline" onClick={() => setEditStore(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation */}
      {showReset && (
        <div className="modal-overlay" onClick={() => setShowReset(false)} role="dialog" aria-modal="true" aria-label="確認重置">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ textAlign:'center' }} ref={resetRef}>
            <h3 style={{ color:'var(--red-600)' }}>⚠️ 確認重置所有數據？</h3>
            <p style={{ fontSize:13, color:'var(--gray-500)', margin:'16px 0' }}>此操作無法恢復。</p>
            <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
              <button className="btn btn-red" onClick={handleReset}>確認重置</button>
              <button className="btn btn-outline" onClick={() => setShowReset(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
