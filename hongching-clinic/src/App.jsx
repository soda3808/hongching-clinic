import { useState, useEffect, useCallback } from 'react';
import { loadAllData, saveAllLocal } from './api';
import { SEED_DATA } from './data';
import Dashboard from './components/Dashboard';
import Revenue from './components/Revenue';
import Expenses from './components/Expenses';
import Payslip from './components/Payslip';
import DoctorAnalytics from './components/DoctorAnalytics';
import Reports from './components/Reports';
import ARAP from './components/ARAP';

const APP_PASSWORD = 'hcmc2026';
const AUTH_KEY = 'hcmc_authenticated';

const PAGES = [
  { id: 'dash', icon: '📊', label: 'Dashboard', section: '總覽' },
  { id: 'rev', icon: '💰', label: '營業紀錄', section: '財務' },
  { id: 'exp', icon: '🧾', label: '開支紀錄', section: '財務' },
  { id: 'arap', icon: '📑', label: '應收應付', section: '財務' },
  { id: 'pay', icon: '📋', label: '糧單', section: '人事' },
  { id: 'doc', icon: '👨‍⚕️', label: '醫師業績', section: '分析' },
  { id: 'report', icon: '📈', label: '報表中心', section: '分析' },
];

function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === APP_PASSWORD) {
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

export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === 'true');
  const [page, setPage] = useState('dash');
  const [data, setData] = useState({ revenue: [], expenses: [], arap: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

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
      if (d && (d.revenue?.length || d.expenses?.length)) {
        setData(d);
      } else {
        // First time — load seed data
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

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

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
        </nav>
        <div className="sidebar-footer">
          <button className="btn-logout" onClick={handleLogout}>登出</button>
          <span>v2.0 • {new Date().getFullYear()}</span>
        </div>
      </div>

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <h2>{currentPage?.icon} {currentPage?.label}</h2>
          <div className="topbar-actions">
            <button className="btn btn-outline btn-sm" onClick={reload}>🔄 重新載入</button>
            <button className="btn btn-outline btn-sm" onClick={handleLogout}>登出</button>
          </div>
        </div>
        <div className="content">
          {page === 'dash' && <Dashboard data={data} />}
          {page === 'rev' && <Revenue data={data} setData={updateData} showToast={showToast} />}
          {page === 'exp' && <Expenses data={data} setData={updateData} showToast={showToast} />}
          {page === 'arap' && <ARAP data={data} setData={updateData} showToast={showToast} />}
          {page === 'pay' && <Payslip data={data} showToast={showToast} />}
          {page === 'doc' && <DoctorAnalytics data={data} />}
          {page === 'report' && <Reports data={data} />}
        </div>
      </div>

      {/* TOAST */}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
