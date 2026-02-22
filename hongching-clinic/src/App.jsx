import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { loadAllData, saveAllLocal } from './api';
import { SEED_DATA, fmtM, getMonth } from './data';
import { exportCSV, exportJSON, importJSON } from './utils/export';
import Dashboard from './components/Dashboard';
import Revenue from './components/Revenue';
import Expenses from './components/Expenses';
import Payslip from './components/Payslip';
import DoctorAnalytics from './components/DoctorAnalytics';
import Reports from './components/Reports';
import ARAP from './components/ARAP';
import PatientPage from './components/PatientPage';
import BookingPage from './components/BookingPage';
import SettingsPage from './components/SettingsPage';
import ReceiptScanner from './components/ReceiptScanner';

const APP_PASSWORD = 'hcmc2026';
const AUTH_KEY = 'hcmc_authenticated';

const PAGES = [
  { id: 'dash', icon: '📊', label: 'Dashboard', section: '總覽' },
  { id: 'rev', icon: '💰', label: '營業紀錄', section: '財務' },
  { id: 'exp', icon: '🧾', label: '開支紀錄', section: '財務' },
  { id: 'scan', icon: '📷', label: '收據掃描', section: '財務' },
  { id: 'arap', icon: '📑', label: '應收應付', section: '財務' },
  { id: 'patient', icon: '👥', label: '病人管理', section: '病人' },
  { id: 'booking', icon: '📅', label: '預約系統', section: '病人' },
  { id: 'pay', icon: '📋', label: '糧單', section: '人事' },
  { id: 'doc', icon: '👨‍⚕️', label: '醫師業績', section: '分析' },
  { id: 'report', icon: '📈', label: '報表中心', section: '分析' },
];

// ── Login Page ──
function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const storedPw = localStorage.getItem('hcmc_password') || APP_PASSWORD;
    if (password === storedPw) {
      sessionStorage.setItem(AUTH_KEY, 'true');
      onLogin();
    } else {
      setError('密碼錯誤，請重新輸入');
      setPassword('');
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <h1>康晴綜合醫療中心</h1>
          <small>HONG CHING MEDICAL CENTRE</small>
        </div>
        <div className="login-divider" />
        <label htmlFor="password">密碼</label>
        <input
          id="password"
          type="password"
          placeholder="請輸入密碼"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          autoFocus
        />
        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="btn btn-teal btn-lg login-btn">登入</button>
      </form>
    </div>
  );
}

// ── Notification System ──
function useNotifications(data) {
  return useMemo(() => {
    const notes = [];
    const today = new Date().toISOString().substring(0, 10);
    const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().substring(0, 10); })();
    const thisMonth = new Date().toISOString().substring(0, 7);
    const lastMonth = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().substring(0, 7); })();
    const dayOfMonth = new Date().getDate();

    // Overdue AR
    (data.arap || []).filter(a => a.type === 'receivable' && a.status === 'pending' && a.dueDate < today)
      .forEach(a => notes.push({ type: 'red', icon: '🔴', title: `逾期應收：${a.party} ${fmtM(a.amount)}`, time: a.dueDate }));

    // Tomorrow bookings
    const tmrBookings = (data.bookings || []).filter(b => b.date === tomorrow && b.status === 'confirmed');
    if (tmrBookings.length) notes.push({ type: 'blue', icon: '📅', title: `明日有 ${tmrBookings.length} 個預約`, time: '明天' });

    // Monthly revenue comparison
    const thisRev = (data.revenue || []).filter(r => getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount), 0);
    const lastRev = (data.revenue || []).filter(r => getMonth(r.date) === lastMonth).reduce((s, r) => s + Number(r.amount), 0);
    if (lastRev > 0 && thisRev < lastRev) notes.push({ type: 'yellow', icon: '⚠️', title: `本月營業額 (${fmtM(thisRev)}) 低於上月 (${fmtM(lastRev)})`, time: thisMonth });

    // MPF reminder
    if (dayOfMonth >= 20 && dayOfMonth <= 25) notes.push({ type: 'blue', icon: '💼', title: 'MPF 供款提醒：請於25日前完成供款', time: today });

    return notes;
  }, [data]);
}

// ── Global Search ──
function SearchPanel({ data, onNavigate, onClose }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    if (!q || q.length < 1) return { patients: [], revenue: [], expenses: [] };
    const ql = q.toLowerCase();
    return {
      patients: (data.patients || []).filter(p => p.name.toLowerCase().includes(ql) || p.phone.includes(ql)).slice(0, 5),
      revenue: (data.revenue || []).filter(r => r.name.toLowerCase().includes(ql)).slice(0, 5),
      expenses: (data.expenses || []).filter(r => r.merchant.toLowerCase().includes(ql)).slice(0, 5),
    };
  }, [q, data]);

  const hasResults = results.patients.length + results.revenue.length + results.expenses.length > 0;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-panel" onClick={e => e.stopPropagation()}>
        <input ref={inputRef} className="search-input" placeholder="搜尋病人、營業、開支..." value={q} onChange={e => setQ(e.target.value)} />
        {q && (
          <div className="search-results">
            {results.patients.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">👤 病人</div>
                {results.patients.map(p => (
                  <div key={p.id} className="search-item" onClick={() => { onNavigate('patient'); onClose(); }}>
                    {p.name} — {p.phone}
                  </div>
                ))}
              </div>
            )}
            {results.revenue.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">💰 營業</div>
                {results.revenue.map(r => (
                  <div key={r.id} className="search-item" onClick={() => { onNavigate('rev'); onClose(); }}>
                    {r.name} {fmtM(r.amount)} — {r.date}
                  </div>
                ))}
              </div>
            )}
            {results.expenses.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">🧾 開支</div>
                {results.expenses.map(r => (
                  <div key={r.id} className="search-item" onClick={() => { onNavigate('exp'); onClose(); }}>
                    {r.merchant} {fmtM(r.amount)} — {r.date}
                  </div>
                ))}
              </div>
            )}
            {!hasResults && <div style={{ padding: 16, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>找不到結果</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Export Menu ──
function ExportMenu({ data, showToast, onClose }) {
  const thisMonth = new Date().toISOString().substring(0, 7);

  const exportMonthlyRev = () => {
    const rows = (data.revenue || []).filter(r => getMonth(r.date) === thisMonth);
    exportCSV(rows, [
      { key: 'date', label: '日期' }, { key: 'name', label: '病人' }, { key: 'item', label: '項目' },
      { key: 'amount', label: '金額' }, { key: 'payment', label: '付款方式' }, { key: 'store', label: '店舖' },
      { key: 'doctor', label: '醫師' },
    ], `revenue_${thisMonth}.csv`);
    showToast('營業紀錄已匯出');
    onClose();
  };

  const exportMonthlyExp = () => {
    const rows = (data.expenses || []).filter(r => getMonth(r.date) === thisMonth);
    exportCSV(rows, [
      { key: 'date', label: '日期' }, { key: 'merchant', label: '商戶' }, { key: 'amount', label: '金額' },
      { key: 'category', label: '類別' }, { key: 'store', label: '店舖' }, { key: 'desc', label: '描述' },
    ], `expenses_${thisMonth}.csv`);
    showToast('開支紀錄已匯出');
    onClose();
  };

  const exportAll = () => {
    exportJSON(data, `hcmc_backup_${new Date().toISOString().substring(0, 10)}.json`);
    showToast('全部數據已匯出');
    onClose();
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async (e) => {
      try {
        const imported = await importJSON(e.target.files[0]);
        showToast('數據已匯入（請重新載入）');
        onClose();
      } catch (err) { showToast('匯入失敗：' + err.message); }
    };
    input.click();
  };

  return (
    <div className="dropdown-menu">
      <div className="dropdown-item" onClick={exportMonthlyRev}>📊 本月營業紀錄 (CSV)</div>
      <div className="dropdown-item" onClick={exportMonthlyExp}>🧾 本月開支紀錄 (CSV)</div>
      <div className="dropdown-item" onClick={exportAll}>💾 所有數據 (JSON)</div>
      <div className="dropdown-item" onClick={handleImport}>📤 匯入數據 (JSON)</div>
    </div>
  );
}

// ── Main App ──
export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === 'true');
  const [page, setPage] = useState('dash');
  const [data, setData] = useState({ revenue: [], expenses: [], arap: [], patients: [], bookings: [], payslips: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [readNotifs, setReadNotifs] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('hcmc_read_notifs') || '[]'); } catch { return []; }
  });

  const notifications = useNotifications(data);
  const unreadCount = notifications.filter((_, i) => !readNotifs.includes(i)).length;

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(AUTH_KEY);
    setAuthed(false);
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await loadAllData();
      if (d && (d.revenue?.length || d.expenses?.length || d.patients?.length)) {
        setData({
          revenue: d.revenue || [],
          expenses: d.expenses || [],
          arap: d.arap || [],
          patients: d.patients || [],
          bookings: d.bookings || [],
          payslips: d.payslips || [],
        });
      } else {
        setData(SEED_DATA);
        saveAllLocal(SEED_DATA);
      }
    } catch (err) {
      console.error(err);
      setData(SEED_DATA);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (authed) reload(); }, [authed, reload]);

  const updateData = useCallback((newData) => {
    setData(newData);
    saveAllLocal(newData);
  }, []);

  const markAllRead = () => {
    const ids = notifications.map((_, i) => i);
    setReadNotifs(ids);
    sessionStorage.setItem('hcmc_read_notifs', JSON.stringify(ids));
  };

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 32, height: 32 }} />
        <span>載入數據中...</span>
      </div>
    );
  }

  const currentPage = PAGES.find(p => p.id === page);
  let sections = {};
  PAGES.forEach(p => {
    if (!sections[p.section]) sections[p.section] = [];
    sections[p.section].push(p);
  });

  return (
    <>
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="sidebar-logo">
          <h1>康晴醫療中心</h1>
          <small>HONG CHING MEDICAL</small>
        </div>
        <nav className="sidebar-nav">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section}>
              <div className="nav-section">{section}</div>
              {items.map(p => (
                <div
                  key={p.id}
                  className={`nav-item ${page === p.id ? 'active' : ''}`}
                  onClick={() => setPage(p.id)}
                >
                  <span style={{ fontSize: 16 }}>{p.icon}</span>
                  <span>{p.label}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="nav-section" style={{ borderTop: '1px solid rgba(255,255,255,.1)', marginTop: 8, paddingTop: 12 }}></div>
          <div className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}>
            <span style={{ fontSize: 16 }}>⚙️</span><span>設定</span>
          </div>
        </nav>
        <div className="sidebar-footer">
          <button className="btn-logout" onClick={handleLogout}>🔓 登出</button>
          <span>v2.5 • {new Date().getFullYear()}</span>
        </div>
      </div>

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <h2>{page === 'settings' ? '⚙️ 設定' : `${currentPage?.icon} ${currentPage?.label}`}</h2>
          <div className="topbar-actions">
            <button className="btn btn-outline btn-sm" onClick={() => setShowSearch(true)}>🔍 搜尋</button>
            <div style={{ position: 'relative' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowNotif(!showNotif)}>
                🔔{unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
              </button>
              {showNotif && (
                <div className="dropdown-menu notif-panel" style={{ right: 0, width: 320 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--gray-100)' }}>
                    <strong style={{ fontSize: 13 }}>通知</strong>
                    <button className="btn btn-outline btn-sm" style={{ fontSize: 10 }} onClick={markAllRead}>全部已讀</button>
                  </div>
                  {notifications.map((n, i) => (
                    <div key={i} className="dropdown-item" style={{ opacity: readNotifs.includes(i) ? 0.5 : 1, fontSize: 12 }}>
                      <span>{n.icon} {n.title}</span>
                    </div>
                  ))}
                  {notifications.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--gray-400)', fontSize: 12 }}>暫無通知</div>}
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowExport(!showExport)}>📥 匯出</button>
              {showExport && <ExportMenu data={data} showToast={showToast} onClose={() => setShowExport(false)} />}
            </div>
            <button className="btn btn-outline btn-sm" onClick={reload}>🔄 重新載入</button>
            <button className="btn btn-outline btn-sm" onClick={handleLogout}>登出</button>
          </div>
        </div>
        <div className="content">
          {page === 'dash' && <Dashboard data={data} onNavigate={setPage} />}
          {page === 'rev' && <Revenue data={data} setData={updateData} showToast={showToast} />}
          {page === 'exp' && <Expenses data={data} setData={updateData} showToast={showToast} />}
          {page === 'scan' && <ReceiptScanner data={data} setData={updateData} showToast={showToast} onNavigate={setPage} />}
          {page === 'arap' && <ARAP data={data} setData={updateData} showToast={showToast} />}
          {page === 'patient' && <PatientPage data={data} setData={updateData} showToast={showToast} />}
          {page === 'booking' && <BookingPage data={data} setData={updateData} showToast={showToast} />}
          {page === 'pay' && <Payslip data={data} setData={updateData} showToast={showToast} />}
          {page === 'doc' && <DoctorAnalytics data={data} />}
          {page === 'report' && <Reports data={data} />}
          {page === 'settings' && <SettingsPage data={data} setData={updateData} showToast={showToast} />}
        </div>
      </div>

      {/* Search Overlay */}
      {showSearch && <SearchPanel data={data} onNavigate={setPage} onClose={() => setShowSearch(false)} />}

      {/* Click-away for dropdowns */}
      {(showNotif || showExport) && <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => { setShowNotif(false); setShowExport(false); }} />}

      {/* TOAST */}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
