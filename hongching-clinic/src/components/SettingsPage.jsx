import { useState, useRef, useMemo } from 'react';
import { saveAllLocal, sendTelegram } from '../api';
import { exportJSON, importJSON } from '../utils/export';
import { DEFAULT_USERS, DEFAULT_STORES, ROLE_LABELS, ROLE_TAGS, DEFAULT_SERVICES, getServices, saveServices } from '../config';
import { getUsers, saveUsers, getStores, saveStores } from '../auth';
import { getAuditLog, clearAuditLog } from '../utils/audit';
import { useFocusTrap, nullRef } from './ConfirmModal';
import { MEMBERSHIP_TIERS } from '../data';
import { supabase } from '../supabase';
import { getClinicName, getClinicNameEn, getTenantStores, getTenantStoreNames, getTenantDoctors, getTenantServices, getTenantSettings, getTenantSlug, applyTenantTheme } from '../tenant';
import { getAuthHeader, getTenantConfig } from '../auth';
import escapeHtml from '../utils/escapeHtml';
import { S, ECTCM } from '../styles/ectcm';

export default function SettingsPage({ data, setData, showToast, user }) {
  const [tab, setTab] = useState('clinic');
  const [clinic, setClinic] = useState(() => {
    const _stores = getTenantStores();
    const _defaultAddr1 = _stores[0]?.address || '';
    const _defaultAddr2 = _stores[1]?.address || '';
    try { return { name: getClinicName(), nameEn: getClinicNameEn(), addr1: _defaultAddr1, addr2: _defaultAddr2, phone:'', whatsapp:'', email:'', ...JSON.parse(localStorage.getItem('hcmc_clinic') || '{}') }; }
    catch { return { name: getClinicName(), nameEn: getClinicNameEn(), addr1:'', addr2:'', phone:'', whatsapp:'', email:'' }; }
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

  // Service management
  const [services, setServicesState] = useState(getServices);
  const [editService, setEditService] = useState(null);
  const [newService, setNewService] = useState({ label:'', fee:'', category:'治療', active:true });

  // Tenant self-service settings
  const [tenantConfig, setTenantConfig] = useState(() => {
    const tc = getTenantConfig();
    return {
      name: tc?.name || getClinicName(),
      nameEn: tc?.nameEn || getClinicNameEn(),
      logoUrl: tc?.logoUrl || '',
      doctors: tc?.doctors || getTenantDoctors(),
      services: tc?.services || getTenantServices(),
      settings: tc?.settings || getTenantSettings(),
    };
  });
  const [tenantSaving, setTenantSaving] = useState(false);
  const [newDoctor, setNewDoctor] = useState('');
  const [themeColor, setThemeColor] = useState(() => getTenantSettings()?.primaryColor || '#0e7490');

  // Doctor schedule
  const [docSchedule, setDocSchedule] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_doc_schedule')) || {}; } catch { return {}; }
  });
  const DOW_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
  const toggleDocSchedule = (doctor, day, store) => {
    setDocSchedule(prev => {
      const key = `${doctor}_${day}`;
      const next = { ...prev };
      if (next[key] === store) delete next[key];
      else next[key] = store;
      localStorage.setItem('hcmc_doc_schedule', JSON.stringify(next));
      return next;
    });
  };

  // Telegram Bot config
  const [tgConfig, setTgConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_telegram_config')) || { botToken: '', chatId: '' }; } catch { return { botToken: '', chatId: '' }; }
  });
  const [tgSending, setTgSending] = useState(false);

  const saveTgConfig = (key, val) => {
    const updated = { ...tgConfig, [key]: val };
    setTgConfig(updated);
    localStorage.setItem('hcmc_telegram_config', JSON.stringify(updated));
  };

  const buildScheduleMessage = () => {
    const doctors = tenantConfig.doctors || [];
    const storeNames = getTenantStoreNames();
    const lines = [`<b>📅 本週醫師排班表</b>\n`];
    doctors.forEach(doc => {
      const shifts = DOW_LABELS.map((day, di) => {
        const store = docSchedule[`${doc}_${di}`] || '';
        return store ? `${day}:${store}` : `${day}:休`;
      }).join(' | ');
      lines.push(`👨‍⚕️ <b>${doc}</b>\n${shifts}\n`);
    });
    lines.push(`\n📍 更新時間：${new Date().toLocaleString('zh-HK')}`);
    return lines.join('\n');
  };

  const sendScheduleToTelegram = async () => {
    if (!tgConfig.botToken || !tgConfig.chatId) return showToast('請先設定 Telegram Bot Token 和 Chat ID');
    setTgSending(true);
    try {
      const msg = buildScheduleMessage();
      const res = await sendTelegram(msg, tgConfig.chatId);
      if (res.success) {
        showToast('排班通知已發送到 Telegram 群組！');
      } else if (res.demo) {
        // Fallback: open Telegram directly if API not deployed
        const plainMsg = buildScheduleMessage().replace(/<[^>]+>/g, '');
        window.open(`https://t.me/share/url?text=${encodeURIComponent(plainMsg)}`, '_blank');
        showToast('已開啟 Telegram 分享（API 未部署，使用直接分享）');
      } else {
        showToast('發送失敗：' + (res.error || '未知錯誤'));
      }
    } catch (err) {
      showToast('發送失敗：' + err.message);
    }
    setTgSending(false);
  };

  const sendDailyScheduleToTelegram = async () => {
    if (!tgConfig.botToken || !tgConfig.chatId) return showToast('請先設定 Telegram Bot Token 和 Chat ID');
    setTgSending(true);
    const today = new Date();
    const dow = today.getDay();
    const adjDow = dow === 0 ? 6 : dow - 1;
    const dayLabel = DOW_LABELS[adjDow];
    const doctors = tenantConfig.doctors || [];
    const lines = [`<b>📋 今日排班 — ${today.toLocaleDateString('zh-HK')} 星期${dayLabel}</b>\n`];
    doctors.forEach(doc => {
      const store = docSchedule[`${doc}_${adjDow}`] || '';
      lines.push(store ? `✅ ${doc} → ${store}` : `⬜ ${doc} → 休息`);
    });
    lines.push(`\n📍 ${new Date().toLocaleTimeString('zh-HK')}`);
    try {
      const res = await sendTelegram(lines.join('\n'), tgConfig.chatId);
      if (res.success) {
        showToast('今日排班已通知！');
      } else if (res.demo) {
        const plainMsg = lines.join('\n').replace(/<[^>]+>/g, '');
        window.open(`https://t.me/share/url?text=${encodeURIComponent(plainMsg)}`, '_blank');
        showToast('已開啟 Telegram 分享');
      } else {
        showToast('發送失敗：' + (res.error || '未知錯誤'));
      }
    } catch (err) {
      showToast('發送失敗：' + err.message);
    }
    setTgSending(false);
  };

  // Audit filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditDateFrom, setAuditDateFrom] = useState('');
  const [auditDateTo, setAuditDateTo] = useState('');
  const [auditAction, setAuditAction] = useState('');

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

  // ── Auto-backup system ──
  const createAutoBackup = () => {
    try {
      const backupData = JSON.stringify(data);
      const ts = new Date().toISOString();
      const backups = JSON.parse(localStorage.getItem('hcmc_backups') || '[]');
      backups.unshift({ ts, size: backupData.length, collections: Object.keys(data).length, records: Object.values(data).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0) });
      // Keep max 10 backups
      while (backups.length > 10) backups.pop();
      localStorage.setItem('hcmc_backups', JSON.stringify(backups));
      localStorage.setItem(`hcmc_backup_${ts.substring(0, 10)}`, backupData);
      showToast('自動備份已完成');
    } catch (err) {
      showToast('備份失敗：' + err.message);
    }
  };

  const restoreFromBackup = (ts) => {
    const key = `hcmc_backup_${ts.substring(0, 10)}`;
    const backup = localStorage.getItem(key);
    if (!backup) return showToast('備份數據已被清除');
    try {
      const restored = JSON.parse(backup);
      setData(restored);
      saveAllLocal(restored);
      showToast('已恢復備份');
    } catch { showToast('恢復失敗'); }
  };

  const backupHistory = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_backups') || '[]'); } catch { return []; }
  }, [tab]);

  const dataSize = useMemo(() => {
    try {
      const str = JSON.stringify(data);
      const bytes = new Blob([str]).size;
      return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    } catch { return '?'; }
  }, [data]);

  const lastBackup = backupHistory.length > 0 ? backupHistory[0].ts : null;
  const daysSinceBackup = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000) : 999;

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
    <div style={S.page}>
      <div style={S.titleBar}>系統 &gt; 設定</div>
      {/* Tabs */}
      <div className="tab-bar" style={{ flexWrap: 'wrap' }}>
        {isAdmin && <button className={`tab-btn ${tab==='tenant'?'active':''}`} onClick={()=>setTab('tenant')}>🌐 租戶設定</button>}
        <button className={`tab-btn ${tab==='clinic'?'active':''}`} onClick={()=>setTab('clinic')}>🏥 診所資料</button>
        <button className={`tab-btn ${tab==='services'?'active':''}`} onClick={()=>setTab('services')}>💊 服務管理</button>
        <button className={`tab-btn ${tab==='system'?'active':''}`} onClick={()=>setTab('system')}>⚙️ 系統設定</button>
        <button className={`tab-btn ${tab==='data'?'active':''}`} onClick={()=>setTab('data')}>💾 數據管理</button>
        <button className={`tab-btn ${tab==='backup'?'active':''}`} onClick={()=>setTab('backup')}>🔄 備份中心</button>
        <button className={`tab-btn ${tab==='health'?'active':''}`} onClick={()=>setTab('health')}>🩺 系統健康</button>
        <button className={`tab-btn ${tab==='promo'?'active':''}`} onClick={()=>setTab('promo')}>📱 推廣工具</button>
        {isAdmin && <button className={`tab-btn ${tab==='users'?'active':''}`} onClick={()=>setTab('users')}>👥 用戶管理</button>}
        {isAdmin && <button className={`tab-btn ${tab==='stores'?'active':''}`} onClick={()=>setTab('stores')}>🏢 分店管理</button>}
        {isAdmin && <button className={`tab-btn ${tab==='audit'?'active':''}`} onClick={()=>setTab('audit')}>📋 操作記錄</button>}
        {isAdmin && <button className={`tab-btn ${tab==='discounts'?'active':''}`} onClick={()=>setTab('discounts')}>🏷️ 折扣設定</button>}
      </div>

      {/* Tenant Self-Service Settings */}
      {tab === 'tenant' && isAdmin && (
        <>
          {/* Branding */}
          <div className="card">
            <div className="card-header"><h3>🎨 品牌設定</h3></div>
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 12 }}>更改會同步到所有設備和所有用戶。修改後需重新登入才生效。</p>
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <div><label>診所中文名</label><input value={tenantConfig.name} onChange={e => setTenantConfig({ ...tenantConfig, name: e.target.value })} /></div>
              <div><label>診所英文名</label><input value={tenantConfig.nameEn} onChange={e => setTenantConfig({ ...tenantConfig, nameEn: e.target.value })} /></div>
            </div>
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label>Logo URL</label>
                <input value={tenantConfig.logoUrl} onChange={e => setTenantConfig({ ...tenantConfig, logoUrl: e.target.value })} placeholder="https://example.com/logo.png" />
                <small style={{ color: 'var(--gray-400)', fontSize: 11 }}>輸入圖片網址（建議 512x512 PNG）</small>
              </div>
              <div>
                <label>主題色</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={themeColor} onChange={e => setThemeColor(e.target.value)} style={{ width: 48, height: 36, padding: 2, cursor: 'pointer' }} />
                  <input value={themeColor} onChange={e => setThemeColor(e.target.value)} style={{ flex: 1, fontFamily: 'monospace' }} placeholder="#0e7490" />
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {['#0e7490', '#059669', '#7c3aed', '#dc2626', '#d97706', '#2563eb', '#be185d'].map(c => (
                    <div key={c} onClick={() => setThemeColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: themeColor === c ? '3px solid var(--gray-800)' : '2px solid var(--gray-200)', transition: 'all .2s' }} />
                  ))}
                </div>
              </div>
            </div>
            {tenantConfig.logoUrl && (
              <div style={{ marginBottom: 12 }}>
                <label>Logo 預覽</label>
                <img src={tenantConfig.logoUrl} alt="Logo" style={{ height: 64, borderRadius: 8, border: '1px solid var(--gray-200)' }} onError={e => { e.target.style.display = 'none'; }} />
              </div>
            )}
          </div>

          {/* Doctors */}
          <div className="card">
            <div className="card-header"><h3>👨‍⚕️ 醫師名單</h3></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {tenantConfig.doctors.map((doc, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--teal-50)', padding: '4px 10px', borderRadius: 16, fontSize: 13 }}>
                  <span>{doc}</span>
                  <span style={{ cursor: 'pointer', color: 'var(--red-500)', fontWeight: 700, fontSize: 16, lineHeight: 1 }} onClick={() => {
                    setTenantConfig({ ...tenantConfig, doctors: tenantConfig.doctors.filter((_, j) => j !== i) });
                  }}>&times;</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newDoctor} onChange={e => setNewDoctor(e.target.value)} placeholder="輸入醫師姓名" style={{ flex: 1 }} onKeyDown={e => {
                if (e.key === 'Enter' && newDoctor.trim()) {
                  setTenantConfig({ ...tenantConfig, doctors: [...tenantConfig.doctors, newDoctor.trim()] });
                  setNewDoctor('');
                }
              }} />
              <button className="btn btn-teal btn-sm" onClick={() => {
                if (!newDoctor.trim()) return;
                setTenantConfig({ ...tenantConfig, doctors: [...tenantConfig.doctors, newDoctor.trim()] });
                setNewDoctor('');
              }}>新增</button>
            </div>
          </div>

          {/* Doctor Schedule Timetable */}
          <div className="card">
            <div className="card-header"><h3>📅 醫師排班表</h3></div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 8px', background: 'var(--gray-50)' }}>醫師</th>
                    {DOW_LABELS.map(d => (
                      <th key={d} style={{ textAlign: 'center', padding: '6px 8px', background: 'var(--gray-50)', minWidth: 60 }}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tenantConfig.doctors.map(doc => (
                    <tr key={doc}>
                      <td style={{ fontWeight: 700, padding: '6px 8px', borderBottom: '1px solid var(--gray-100)' }}>{doc}</td>
                      {DOW_LABELS.map((_, di) => {
                        const key = `${doc}_${di}`;
                        const assigned = docSchedule[key] || '';
                        const storeNames = getTenantStoreNames();
                        return (
                          <td key={di} style={{ textAlign: 'center', padding: '4px', borderBottom: '1px solid var(--gray-100)' }}>
                            <select value={assigned} onChange={e => toggleDocSchedule(doc, di, e.target.value)}
                              style={{ width: '100%', padding: '3px 2px', fontSize: 10, borderRadius: 4, border: '1px solid var(--gray-200)',
                                background: assigned ? '#ecfdf5' : '#fff', color: assigned ? '#166534' : '#999', fontWeight: assigned ? 700 : 400 }}>
                              <option value="">休息</option>
                              {storeNames.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--gray-400)', flex: 1 }}>選擇每位醫師每天的診所位置，留空為休息日</div>
              <button className="btn btn-sm" style={{ background: '#0088cc', color: '#fff', fontSize: 11 }} onClick={sendDailyScheduleToTelegram} disabled={tgSending}>
                {tgSending ? '發送中...' : '📢 通知今日排班'}
              </button>
              <button className="btn btn-sm" style={{ background: '#0088cc', color: '#fff', fontSize: 11 }} onClick={sendScheduleToTelegram} disabled={tgSending}>
                {tgSending ? '發送中...' : '📅 通知全週排班'}
              </button>
            </div>
          </div>

          {/* Telegram Bot Settings */}
          <div className="card">
            <div className="card-header"><h3>🤖 Telegram Bot 設定</h3></div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 12, lineHeight: 1.8 }}>
              <strong>設定步驟：</strong><br/>
              1. 喺 Telegram 搵 <code>@BotFather</code> → 發送 <code>/newbot</code> → 取得 Bot Token<br/>
              2. 建立醫師群組 → 將 Bot 加入群組<br/>
              3. 喺群組發任意訊息 → 搵 <code>@RawDataBot</code> 加入群組取得 Chat ID<br/>
              4. 或訪問 <code>https://api.telegram.org/bot[TOKEN]/getUpdates</code> 查看 chat id
            </div>
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label style={{ fontWeight: 600 }}>Bot Token</label>
                <input type="password" value={tgConfig.botToken} onChange={e => saveTgConfig('botToken', e.target.value)} placeholder="123456:ABC-DEF..." style={{ fontFamily: 'monospace', fontSize: 11 }} />
              </div>
              <div>
                <label style={{ fontWeight: 600 }}>Chat ID（群組）</label>
                <input value={tgConfig.chatId} onChange={e => saveTgConfig('chatId', e.target.value)} placeholder="-1001234567890" style={{ fontFamily: 'monospace', fontSize: 11 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" style={{ background: '#0088cc', color: '#fff' }} onClick={async () => {
                if (!tgConfig.botToken || !tgConfig.chatId) return showToast('請填寫 Bot Token 和 Chat ID');
                setTgSending(true);
                const res = await sendTelegram('✅ 康晴診所系統已成功連接 Telegram！', tgConfig.chatId);
                setTgSending(false);
                if (res.success) showToast('測試訊息已發送！請查看 Telegram 群組');
                else if (res.demo) {
                  showToast('API 未部署，請先部署到 Vercel 後再測試');
                } else showToast('發送失敗：' + (res.error || '請檢查 Token 和 Chat ID'));
              }} disabled={tgSending}>
                {tgSending ? '發送中...' : '🔔 發送測試訊息'}
              </button>
            </div>
          </div>

          {/* Appointment Reminder Settings */}
          <div className="card">
            <div className="card-header"><h3>📱 預約提醒設定</h3></div>
            {(() => {
              const defaults = { daysBefore: 1, templateBooking: '【{clinic}】{name}你好！提醒你{dayText}預約：\n日期: {date} {time}\n醫師: {doctor}\n地點: {store}\n請準時到達，如需更改請提前聯絡。多謝！',
                templateFollowUp: '【{clinic}】{name}你好！你的覆診日期將近，建議儘快預約覆診。如需協助請回覆此訊息。',
                templateBirthday: '【{clinic}】{name}你好！祝你生日快樂！🎂 我們為你送上生日優惠，歡迎預約！' };
              let rs;
              try { rs = { ...defaults, ...JSON.parse(localStorage.getItem('hcmc_reminder_settings') || '{}') }; } catch { rs = defaults; }
              const save = (key, val) => {
                const updated = { ...rs, [key]: val };
                localStorage.setItem('hcmc_reminder_settings', JSON.stringify(updated));
              };
              return (
                <div style={{ fontSize: 12 }}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>提前提醒天數</label>
                    <select defaultValue={rs.daysBefore} onChange={e => save('daysBefore', Number(e.target.value))} style={{ width: 120 }}>
                      <option value={1}>1天前</option>
                      <option value={2}>2天前</option>
                      <option value={3}>3天前</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>預約提醒模板</label>
                    <textarea defaultValue={rs.templateBooking} onBlur={e => save('templateBooking', e.target.value)} style={{ width: '100%', minHeight: 80, padding: 8, borderRadius: 6, border: '1px solid var(--gray-200)', fontSize: 11, boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>可用變數：{'{clinic}'} {'{name}'} {'{date}'} {'{time}'} {'{doctor}'} {'{store}'} {'{dayText}'}</div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>覆診提醒模板</label>
                    <textarea defaultValue={rs.templateFollowUp} onBlur={e => save('templateFollowUp', e.target.value)} style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 6, border: '1px solid var(--gray-200)', fontSize: 11, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>生日祝賀模板</label>
                    <textarea defaultValue={rs.templateBirthday} onBlur={e => save('templateBirthday', e.target.value)} style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 6, border: '1px solid var(--gray-200)', fontSize: 11, boxSizing: 'border-box' }} />
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Business Settings */}
          <div className="card">
            <div className="card-header"><h3>⚙️ 營業設定</h3></div>
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label>營業時間</label>
                <input value={tenantConfig.settings?.businessHours || ''} onChange={e => setTenantConfig({ ...tenantConfig, settings: { ...tenantConfig.settings, businessHours: e.target.value } })} placeholder="10:00-20:00" />
              </div>
              <div>
                <label>預設預約時段（分鐘）</label>
                <input type="number" value={tenantConfig.settings?.slotMinutes || 30} onChange={e => setTenantConfig({ ...tenantConfig, settings: { ...tenantConfig.settings, slotMinutes: Number(e.target.value) } })} />
              </div>
            </div>
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label>WhatsApp 號碼</label>
                <input value={tenantConfig.settings?.whatsapp || ''} onChange={e => setTenantConfig({ ...tenantConfig, settings: { ...tenantConfig.settings, whatsapp: e.target.value } })} placeholder="85298765432" />
              </div>
              <div>
                <label>聯絡電話</label>
                <input value={tenantConfig.settings?.phone || ''} onChange={e => setTenantConfig({ ...tenantConfig, settings: { ...tenantConfig.settings, phone: e.target.value } })} placeholder="23456789" />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>租戶: {getTenantSlug()} | 所有修改將即時同步到雲端</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => {
                // Preview theme color
                applyTenantTheme();
                showToast('已套用主題色預覽');
              }}>預覽主題</button>
              <button className="btn btn-teal" disabled={tenantSaving} onClick={async () => {
                setTenantSaving(true);
                try {
                  const payload = {
                    name: tenantConfig.name,
                    nameEn: tenantConfig.nameEn,
                    logoUrl: tenantConfig.logoUrl,
                    doctors: tenantConfig.doctors,
                    services: tenantConfig.services,
                    settings: { ...tenantConfig.settings, primaryColor: themeColor },
                  };
                  const res = await fetch('/api/tenant', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                    body: JSON.stringify(payload),
                  });
                  const result = await res.json();
                  if (result.success && result.tenant) {
                    // Update session storage with new tenant config
                    sessionStorage.setItem('hcmc_tenant', JSON.stringify(result.tenant));
                    applyTenantTheme();
                    showToast('租戶設定已儲存');
                  } else {
                    showToast('儲存失敗：' + (result.error || '未知錯誤'));
                  }
                } catch (err) {
                  // Fallback: save to localStorage if API fails
                  localStorage.setItem('hcmc_clinic', JSON.stringify({
                    name: tenantConfig.name, nameEn: tenantConfig.nameEn,
                  }));
                  showToast('已儲存到本地（雲端同步失敗）');
                }
                setTenantSaving(false);
              }}>{tenantSaving ? '儲存中...' : '💾 儲存到雲端'}</button>
            </div>
          </div>
        </>
      )}

      {/* Clinic Info */}
      {tab === 'clinic' && (
        <div className="card">
          <div className="card-header"><h3>診所資料</h3></div>
          <div className="grid-2" style={{ marginBottom:12 }}>
            <div><label>中文名稱</label><input value={clinic.name} onChange={e => setClinic({...clinic, name:e.target.value})} /></div>
            <div><label>英文名稱</label><input value={clinic.nameEn} onChange={e => setClinic({...clinic, nameEn:e.target.value})} /></div>
          </div>
          <div className="grid-2" style={{ marginBottom:12 }}>
            <div><label>{(getTenantStoreNames()[0] || '分店1') + '地址'}</label><input value={clinic.addr1} onChange={e => setClinic({...clinic, addr1:e.target.value})} /></div>
            <div><label>{(getTenantStoreNames()[1] || '分店2') + '地址'}</label><input value={clinic.addr2} onChange={e => setClinic({...clinic, addr2:e.target.value})} /></div>
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
              版本 v3.0 — {getClinicName()}管理系統<br/>
              數據統計：{counts.rev} 筆營業 / {counts.exp} 筆開支 / {counts.pt} 個病人 / {counts.bk} 筆預約
            </p>
          </div>
        </div>
      )}

      {/* Data */}
      {tab === 'data' && (
        <>
          {/* Backup Alert */}
          {daysSinceBackup >= 3 && (
            <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 13 }}>⚠️ 備份提醒</div>
                <div style={{ fontSize: 12, color: '#991b1b' }}>距上次備份已 {daysSinceBackup === 999 ? '從未備份' : `${daysSinceBackup} 天`}，建議立即備份</div>
              </div>
              <button className="btn btn-teal btn-sm" onClick={createAutoBackup}>立即備份</button>
            </div>
          )}

          {/* Data Overview */}
          <div className="stats-grid">
            <div className="stat-card teal">
              <div className="stat-label">數據大小</div>
              <div className="stat-value teal">{dataSize}</div>
            </div>
            <div className="stat-card green">
              <div className="stat-label">資料表</div>
              <div className="stat-value green">{Object.keys(data).length}</div>
            </div>
            <div className="stat-card gold">
              <div className="stat-label">總記錄數</div>
              <div className="stat-value gold">{Object.values(data).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">上次備份</div>
              <div className="stat-value" style={{ fontSize: 14, color: daysSinceBackup >= 3 ? '#dc2626' : '#16a34a' }}>
                {lastBackup ? new Date(lastBackup).toLocaleDateString('zh-HK') : '從未'}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="card">
            <div className="card-header"><h3>數據操作</h3></div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button className="btn btn-green" onClick={createAutoBackup}>💾 建立備份</button>
              <button className="btn btn-teal" onClick={handleExport}>📥 匯出 JSON</button>
              <button className="btn btn-gold" onClick={handleImport}>📤 匯入數據</button>
              <button className="btn btn-outline" onClick={() => { localStorage.removeItem('hc_data'); showToast('已清除'); }}>🗑️ 清除緩存</button>
              <button className="btn btn-red" onClick={() => setShowReset(true)}>⚠️ 重置所有</button>
            </div>
          </div>

          {/* Backup History */}
          {backupHistory.length > 0 && (
            <div className="card">
              <div className="card-header"><h3>💾 備份歷史 ({backupHistory.length})</h3></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>備份時間</th><th style={{ textAlign: 'right' }}>記錄數</th><th style={{ textAlign: 'right' }}>大小</th><th>操作</th></tr></thead>
                  <tbody>
                    {backupHistory.map((b, i) => (
                      <tr key={b.ts}>
                        <td style={{ fontWeight: i === 0 ? 700 : 400 }}>
                          {new Date(b.ts).toLocaleString('zh-HK')}
                          {i === 0 && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>最新</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>{b.records}</td>
                        <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--gray-500)' }}>{(b.size / 1024).toFixed(0)} KB</td>
                        <td>
                          <button className="btn btn-outline btn-sm" onClick={() => {
                            if (window.confirm(`確定要恢復 ${new Date(b.ts).toLocaleString('zh-HK')} 的備份嗎？現有數據將被覆蓋。`)) restoreFromBackup(b.ts);
                          }}>恢復</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Promo Tools */}
      {tab === 'promo' && (
        <>
          {(() => {
            const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
            const bookingUrl = `${appUrl}/booking`;
            return (
              <div className="card">
                <div className="card-header"><h3>📱 線上預約 QR Code</h3></div>
                <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
                  病人掃描此 QR Code 即可打開線上預約頁面。
                </p>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bookingUrl)}`}
                    alt="Booking QR Code"
                    style={{ width: 200, height: 200, borderRadius: 8, border: '2px solid var(--gray-200)' }}
                  />
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>
                    {bookingUrl}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <a
                    href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&format=png&data=${encodeURIComponent(bookingUrl)}`}
                    download="booking-qr.png"
                    className="btn btn-teal"
                  >
                    📥 下載 QR Code (PNG)
                  </a>
                </div>
              </div>
            );
          })()}
          <div className="card">
            <div className="card-header"><h3>🖨️ 宣傳單張預覽</h3></div>
            <div className="promo-flyer" id="promo-flyer">
              <div style={{ textAlign: 'center', borderBottom: '3px solid var(--teal-700)', paddingBottom: 16, marginBottom: 16 }}>
                <img src="/logo.jpg" alt={getClinicName()} style={{ height: 56, marginBottom: 8 }} />
                <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>專業中醫診療服務</div>
              </div>
              <div style={{ background: 'var(--gold-100)', padding: '10px 16px', borderRadius: 8, textAlign: 'center', fontWeight: 700, color: '#92400e', marginBottom: 16, fontSize: 14 }}>
                🎉 新客優惠：首次免診金 + 療程套餐9折
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, fontSize: 12 }}>
                {getTenantStores().map(s => (
                  <div key={s.name}>
                    <strong>{'\uD83D\uDCCD'} {s.name}店</strong>
                    <div style={{ color: 'var(--gray-500)' }}>{s.address || ''}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, marginBottom: 16 }}>
                <div>🕐 營業時間：星期一至六 10:00 - 20:00</div>
              </div>
              {(() => {
                const flyerAppUrl = import.meta.env.VITE_APP_URL || window.location.origin;
                const flyerBookingUrl = `${flyerAppUrl}/booking`;
                return (
                  <div style={{ textAlign: 'center' }}>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(flyerBookingUrl)}`}
                      alt="QR"
                      style={{ width: 120, height: 120 }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>掃碼即可線上預約</div>
                  </div>
                );
              })()}
            </div>
            <button className="btn btn-outline" onClick={() => { const w = window.open('', '_blank'); if (!w) { showToast('請允許彈出視窗'); return; } /* innerHTML from React-rendered #promo-flyer is safe (React escapes by default) */ w.document.write('<html><head><title>宣傳單張</title><style>body{font-family:sans-serif;padding:40px;max-width:500px;margin:0 auto}</style></head><body>' + document.getElementById('promo-flyer').innerHTML + '</body></html>'); w.document.close(); w.print(); }} style={{ marginTop: 12 }}>
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

      {/* Service Management */}
      {tab === 'services' && (
        <>
          <div className="card">
            <div className="card-header"><h3>新增服務</h3></div>
            <div className="grid-3" style={{ marginBottom:12 }}>
              <div><label>服務名稱 *</label><input value={newService.label} onChange={e => setNewService({...newService, label:e.target.value})} placeholder="例：針灸治療" /></div>
              <div><label>費用 *</label><input type="number" value={newService.fee} onChange={e => setNewService({...newService, fee:e.target.value})} placeholder="350" /></div>
              <div><label>類別</label>
                <select value={newService.category} onChange={e => setNewService({...newService, category:e.target.value})}>
                  <option>診症</option><option>治療</option><option>其他</option>
                </select>
              </div>
            </div>
            <button className="btn btn-teal" onClick={() => {
              if (!newService.label || !newService.fee) return showToast('請填寫服務名稱和費用');
              const svc = { id: 's' + Date.now(), label: newService.label, fee: Number(newService.fee), category: newService.category, active: true, sortOrder: services.length + 1 };
              const updated = [...services, svc]; setServicesState(updated); saveServices(updated);
              setNewService({ label:'', fee:'', category:'治療', active:true }); showToast('服務已新增');
            }}>新增服務</button>
          </div>
          <div className="card" style={{ padding:0 }}>
            <div className="card-header"><h3>服務列表 ({services.length})</h3></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>服務名稱</th><th>類別</th><th style={{textAlign:'right'}}>費用</th><th>狀態</th><th>操作</th></tr></thead>
                <tbody>
                  {services.map(s => (
                    <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                      <td style={{ fontWeight:600 }}>{s.label}</td>
                      <td><span className="tag tag-other">{s.category}</span></td>
                      <td className="money">${s.fee}</td>
                      <td><span className={`tag ${s.active?'tag-paid':'tag-overdue'}`}>{s.active?'啟用':'停用'}</span></td>
                      <td>
                        <div style={{ display:'flex', gap:4 }}>
                          <button className="btn btn-outline btn-sm" onClick={() => setEditService({...s})}>編輯</button>
                          <button className="btn btn-outline btn-sm" onClick={() => {
                            const updated = services.map(x => x.id === s.id ? {...x, active:!x.active} : x);
                            setServicesState(updated); saveServices(updated); showToast(s.active ? '已停用' : '已啟用');
                          }}>{s.active ? '停用' : '啟用'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Audit Trail */}
      {tab === 'audit' && isAdmin && (() => {
        const logs = getAuditLog();
        const ACTION_LABELS = { login:'登入', logout:'登出', create:'新增', update:'更新', delete:'刪除' };
        const filteredLogs = logs.filter(log => {
          if (auditSearch) {
            const q = auditSearch.toLowerCase();
            if (!(log.userName||'').toLowerCase().includes(q) && !(log.detail||'').toLowerCase().includes(q) && !(log.target||'').toLowerCase().includes(q) && !(log.action||'').toLowerCase().includes(q)) return false;
          }
          if (auditDateFrom && log.ts < auditDateFrom) return false;
          if (auditDateTo && log.ts > auditDateTo + 'T23:59:59') return false;
          if (auditAction && log.action !== auditAction) return false;
          return true;
        });
        return (
          <>
            <div className="card" style={{ padding:12, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <input placeholder="搜尋用戶/操作/詳情..." value={auditSearch} onChange={e => setAuditSearch(e.target.value)} style={{ flex:1, minWidth:150 }} />
              <input type="date" value={auditDateFrom} onChange={e => setAuditDateFrom(e.target.value)} style={{ width:'auto' }} />
              <span style={{ color:'var(--gray-400)' }}>至</span>
              <input type="date" value={auditDateTo} onChange={e => setAuditDateTo(e.target.value)} style={{ width:'auto' }} />
              <select value={auditAction} onChange={e => setAuditAction(e.target.value)} style={{ width:'auto' }}>
                <option value="">全部操作</option>
                <option value="login">登入</option><option value="logout">登出</option>
                <option value="create">新增</option><option value="update">更新</option><option value="delete">刪除</option>
              </select>
              <button className="btn btn-outline btn-sm" onClick={() => { clearAuditLog(); showToast('記錄已清除'); }}>清除記錄</button>
              <button className="btn btn-teal btn-sm" onClick={() => {
                if (!filteredLogs.length) return showToast('沒有記錄可匯出');
                const headers = ['時間','用戶','操作','目標','詳情'];
                const rows = filteredLogs.map(log => [
                  new Date(log.ts).toLocaleString('zh-HK'),
                  log.userName || '',
                  ACTION_LABELS[log.action] || log.action || '',
                  log.target || '',
                  (log.detail || '').replace(/,/g, '，')
                ]);
                const csv = '\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url;
                a.download = `audit_log_${new Date().toISOString().substring(0,10)}.csv`;
                a.click(); URL.revokeObjectURL(url);
                showToast(`已匯出 ${filteredLogs.length} 條記錄`);
              }}>📥 匯出 CSV</button>
              <button className="btn btn-outline btn-sm" onClick={() => {
                const w = window.open('', '_blank');
                if (!w) return;
                const trs = filteredLogs.slice(0, 500).map(log =>
                  `<tr><td style="white-space:nowrap">${new Date(log.ts).toLocaleString('zh-HK')}</td><td style="font-weight:600">${log.userName||''}</td><td>${ACTION_LABELS[log.action]||log.action||''}</td><td>${log.target||''}</td><td style="font-size:10px;color:#888">${log.detail||''}</td></tr>`
                ).join('');
                w.document.write(`<!DOCTYPE html><html><head><title>審計日誌</title><style>
                  body{font-family:'Microsoft YaHei',sans-serif;padding:30px;max-width:1000px;margin:0 auto}
                  h1{color:#0e7490;font-size:18px;border-bottom:3px solid #0e7490;padding-bottom:8px}
                  table{width:100%;border-collapse:collapse;font-size:11px}
                  th{background:#0e7490;color:#fff;padding:6px 8px;text-align:left}td{padding:4px 8px;border-bottom:1px solid #eee}
                  .footer{text-align:center;font-size:9px;color:#aaa;margin-top:20px}
                </style></head><body>
                  <h1>${getClinicName()} — 審計日誌</h1>
                  <p style="font-size:12px;color:#888">生成日期：${new Date().toISOString().substring(0,10)} | 共 ${filteredLogs.length} 條記錄</p>
                  <table><thead><tr><th>時間</th><th>用戶</th><th>操作</th><th>目標</th><th>詳情</th></tr></thead><tbody>${trs}</tbody></table>
                  <div class="footer">此報表由系統自動生成</div>
                </body></html>`);
                w.document.close();
                setTimeout(() => w.print(), 300);
              }}>🖨️ 列印</button>
            </div>
            {/* Audit Stats */}
            <div className="stats-grid" style={{ marginBottom: 12 }}>
              {(() => {
                const userCounts = {}; const actionCounts = {};
                filteredLogs.forEach(log => {
                  userCounts[log.userName] = (userCounts[log.userName] || 0) + 1;
                  actionCounts[ACTION_LABELS[log.action] || log.action] = (actionCounts[ACTION_LABELS[log.action] || log.action] || 0) + 1;
                });
                const topUser = Object.entries(userCounts).sort((a,b) => b[1]-a[1])[0];
                const topAction = Object.entries(actionCounts).sort((a,b) => b[1]-a[1])[0];
                const todayCount = filteredLogs.filter(l => l.ts && l.ts.startsWith(new Date().toISOString().substring(0,10))).length;
                return (<>
                  <div className="stat-card teal"><div className="stat-label">篩選結果</div><div className="stat-value teal">{filteredLogs.length}</div><div className="stat-sub">共 {logs.length} 條</div></div>
                  <div className="stat-card green"><div className="stat-label">今日操作</div><div className="stat-value green">{todayCount}</div></div>
                  <div className="stat-card gold"><div className="stat-label">最活躍用戶</div><div className="stat-value gold" style={{fontSize:16}}>{topUser ? topUser[0] : '-'}</div><div className="stat-sub">{topUser ? `${topUser[1]} 次` : ''}</div></div>
                  <div className="stat-card red"><div className="stat-label">最多操作</div><div className="stat-value red" style={{fontSize:16}}>{topAction ? topAction[0] : '-'}</div><div className="stat-sub">{topAction ? `${topAction[1]} 次` : ''}</div></div>
                </>);
              })()}
            </div>
            <div className="card" style={{ padding:0 }}>
              <div className="card-header"><h3>操作記錄 ({filteredLogs.length}/{logs.length})</h3></div>
              <div className="table-wrap" style={{ maxHeight:500, overflowY:'auto' }}>
                <table>
                  <thead><tr><th>時間</th><th>用戶</th><th>操作</th><th>目標</th><th>詳情</th></tr></thead>
                  <tbody>
                    {!filteredLogs.length && <tr><td colSpan={5} style={{textAlign:'center',padding:40,color:'#aaa'}}>暫無記錄</td></tr>}
                    {filteredLogs.slice(0, 200).map((log, i) => (
                      <tr key={i}>
                        <td style={{ fontSize:11, color:'var(--gray-500)', whiteSpace:'nowrap' }}>{new Date(log.ts).toLocaleString('zh-HK')}</td>
                        <td style={{ fontWeight:600 }}>{log.userName}</td>
                        <td><span className={`tag ${log.action==='delete'?'tag-overdue':log.action==='create'?'tag-paid':log.action==='login'?'tag-fps':'tag-other'}`}>{ACTION_LABELS[log.action]||log.action}</span></td>
                        <td>{log.target}</td>
                        <td style={{ fontSize:11, color:'var(--gray-500)', maxWidth:250, overflow:'hidden', textOverflow:'ellipsis' }}>{log.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}

      {/* Discount Settings */}
      {tab === 'discounts' && isAdmin && (
        <div className="card">
          <div className="card-header"><h3>會員折扣等級</h3></div>
          <p style={{ fontSize:12, color:'var(--gray-500)', marginBottom:12 }}>會員等級根據累計消費自動計算，以下為各等級折扣設定：</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>等級</th><th style={{textAlign:'right'}}>最低消費</th><th style={{textAlign:'right'}}>折扣</th><th>說明</th></tr></thead>
              <tbody>
                {(MEMBERSHIP_TIERS || [
                  { name:'普通', minSpent:0, discount:0 },
                  { name:'銅卡', minSpent:3000, discount:5 },
                  { name:'銀卡', minSpent:8000, discount:10 },
                  { name:'金卡', minSpent:20000, discount:15 },
                ]).map(t => (
                  <tr key={t.name}>
                    <td style={{ fontWeight:700 }}><span className="tag tag-paid">{t.name}</span></td>
                    <td className="money">${(t.minSpent||0).toLocaleString()}</td>
                    <td className="money" style={{ color:'var(--green-700)' }}>{t.discount}%</td>
                    <td style={{ fontSize:11, color:'var(--gray-500)' }}>累計消費滿 ${(t.minSpent||0).toLocaleString()} 自動升級</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Backup Center */}
      {tab === 'backup' && (
        <div className="card">
          <div className="card-header"><h3>備份中心</h3></div>
          <div className="stats-grid" style={{ marginBottom:16 }}>
            <div className="stat-card teal">
              <div className="stat-label">上次備份</div>
              <div className="stat-value teal" style={{ fontSize:13 }}>{localStorage.getItem('hcmc_last_backup') ? new Date(localStorage.getItem('hcmc_last_backup')).toLocaleString('zh-HK') : '從未備份'}</div>
            </div>
            <div className="stat-card gold">
              <div className="stat-label">數據量</div>
              <div className="stat-value gold" style={{ fontSize:13 }}>{((JSON.stringify(data).length / 1024).toFixed(1))} KB</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button className="btn btn-teal" onClick={() => {
              const fullBackup = { data, config: { clinic: JSON.parse(localStorage.getItem('hcmc_clinic')||'{}'), services: getServices(), users: getUsers(), stores: getStores() }, backupAt: new Date().toISOString() };
              const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type:'application/json' });
              const url = URL.createObjectURL(blob); const a = document.createElement('a');
              a.href = url; a.download = `hcmc_full_backup_${new Date().toISOString().substring(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
              localStorage.setItem('hcmc_last_backup', new Date().toISOString()); showToast('完整備份已下載');
            }}>📥 完整備份（數據+設定）</button>
            <button className="btn btn-gold" onClick={() => {
              const input = document.createElement('input'); input.type='file'; input.accept='.json';
              input.onchange = async (e) => {
                try {
                  const text = await e.target.files[0].text();
                  const backup = JSON.parse(text);
                  if (backup.data) { setData(backup.data); saveAllLocal(backup.data); }
                  if (backup.config?.clinic) localStorage.setItem('hcmc_clinic', JSON.stringify(backup.config.clinic));
                  if (backup.config?.services) saveServices(backup.config.services);
                  if (backup.config?.users) saveUsers(backup.config.users);
                  if (backup.config?.stores) saveStores(backup.config.stores);
                  showToast('備份已還原，頁面將重新載入'); setTimeout(() => window.location.reload(), 1000);
                } catch (err) { showToast('還原失敗：' + err.message); }
              };
              input.click();
            }}>📤 還原備份</button>
            <button className="btn btn-outline" onClick={handleExport}>📄 僅匯出數據 (JSON)</button>
          </div>
        </div>
      )}

      {/* System Health */}
      {tab === 'health' && (() => {
        const lsSize = (() => { try { let t=0; for(let k in localStorage) { if(localStorage.hasOwnProperty(k)) t += localStorage[k].length; } return t; } catch { return 0; } })();
        const lsPercent = Math.min((lsSize / (5 * 1024 * 1024)) * 100, 100);
        const sbConfigured = !!supabase;
        const gasConfigured = !!localStorage.getItem('hcmc_gas_url');
        const collections = ['revenue','expenses','arap','patients','bookings','payslips','consultations','packages','enrollments','conversations','inventory','queue','sickleaves','leaves','products','productSales'];
        return (
          <div className="card">
            <div className="card-header"><h3>系統健康檢查</h3></div>
            <div className="stats-grid" style={{ marginBottom:16 }}>
              <div className={`stat-card ${sbConfigured?'green':'red'}`}>
                <div className="stat-label">Supabase</div>
                <div className={`stat-value ${sbConfigured?'green':'red'}`} style={{ fontSize:14 }}>{sbConfigured?'已連接':'未設定'}</div>
              </div>
              <div className={`stat-card ${gasConfigured?'green':'gold'}`}>
                <div className="stat-label">Google Sheets</div>
                <div className={`stat-value ${gasConfigured?'green':'gold'}`} style={{ fontSize:14 }}>{gasConfigured?'已設定':'未設定'}</div>
              </div>
              <div className="stat-card teal">
                <div className="stat-label">localStorage</div>
                <div className="stat-value teal" style={{ fontSize:14 }}>{(lsSize/1024).toFixed(0)} KB</div>
                <div className="stat-sub">{lsPercent.toFixed(1)}% of 5MB</div>
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontWeight:600 }}>localStorage 使用量</label>
              <div style={{ height:12, background:'var(--gray-200)', borderRadius:6, overflow:'hidden', marginTop:4 }}>
                <div style={{ height:'100%', width:`${lsPercent}%`, background: lsPercent > 80 ? 'var(--red-500)' : lsPercent > 50 ? 'var(--gold-600)' : 'var(--green-600)', borderRadius:6, transition:'width .3s' }} />
              </div>
            </div>
            <h4 style={{ fontSize:13, fontWeight:700, color:'var(--gray-600)', marginBottom:8 }}>數據完整性</h4>
            <div className="table-wrap">
              <table>
                <thead><tr><th>資料集</th><th style={{textAlign:'right'}}>記錄數</th><th>狀態</th></tr></thead>
                <tbody>
                  {collections.map(c => {
                    const count = (data[c]||[]).length;
                    return <tr key={c}><td style={{ fontWeight:600 }}>{c}</td><td className="money">{count}</td><td><span className={`tag ${count>0?'tag-paid':'tag-other'}`}>{count>0?'有數據':'空'}</span></td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Edit Service Modal */}
      {editService && (
        <div className="modal-overlay" onClick={() => setEditService(null)} role="dialog" aria-modal="true" aria-label="編輯服務">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:400 }}>
            <h3>編輯服務</h3>
            <div style={{ marginBottom:12 }}><label>服務名稱</label><input value={editService.label} onChange={e => setEditService({...editService, label:e.target.value})} /></div>
            <div className="grid-2" style={{ marginBottom:12 }}>
              <div><label>費用</label><input type="number" value={editService.fee} onChange={e => setEditService({...editService, fee:Number(e.target.value)})} /></div>
              <div><label>類別</label>
                <select value={editService.category} onChange={e => setEditService({...editService, category:e.target.value})}>
                  <option>診症</option><option>治療</option><option>其他</option>
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-teal" onClick={() => {
                const updated = services.map(x => x.id === editService.id ? editService : x);
                setServicesState(updated); saveServices(updated); setEditService(null); showToast('服務已更新');
              }}>儲存</button>
              <button className="btn btn-outline" onClick={() => setEditService(null)}>取消</button>
            </div>
          </div>
        </div>
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
    </div>
  );
}
