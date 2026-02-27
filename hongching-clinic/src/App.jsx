import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { loadAllData, saveAllLocal, subscribeToChanges, unsubscribe } from './api';
import { SEED_DATA, fmtM, getMonth } from './data';
import { exportCSV, exportJSON, importJSON } from './utils/export';
import { PERMISSIONS, PAGE_PERMISSIONS, ROLE_LABELS, ROLE_TAGS } from './config';
import { login, logout, getCurrentUser, hasPermission, filterByPermission, getStores, touchActivity, requestPasswordReset, resetPassword } from './auth';
import { logAction } from './utils/audit';
import { getClinicName, getClinicLogo, applyTenantTheme } from './tenant';

// Lazy-loaded page components
const Dashboard = lazy(() => import('./components/Dashboard'));
const Revenue = lazy(() => import('./components/Revenue'));
const Expenses = lazy(() => import('./components/Expenses'));
const Payslip = lazy(() => import('./components/Payslip'));
const DoctorAnalytics = lazy(() => import('./components/DoctorAnalytics'));
const Reports = lazy(() => import('./components/Reports'));
const ARAP = lazy(() => import('./components/ARAP'));
const PatientPage = lazy(() => import('./components/PatientPage'));
const BookingPage = lazy(() => import('./components/BookingPage'));
const EMRPage = lazy(() => import('./components/EMRPage'));
const PackagePage = lazy(() => import('./components/PackagePage'));
const CRMPage = lazy(() => import('./components/CRMPage'));
const InventoryPage = lazy(() => import('./components/InventoryPage'));
const QueuePage = lazy(() => import('./components/QueuePage'));
const BillingPage = lazy(() => import('./components/BillingPage'));
const SickLeavePage = lazy(() => import('./components/SickLeavePage'));
const DoctorSchedule = lazy(() => import('./components/DoctorSchedule'));
const LeavePage = lazy(() => import('./components/LeavePage'));
const ProductPage = lazy(() => import('./components/ProductPage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const ReceiptScanner = lazy(() => import('./components/ReceiptScanner'));
const AIChatPage = lazy(() => import('./components/AIChatPage'));
const StoreComparePage = lazy(() => import('./components/StoreComparePage'));
const SurveyPage = lazy(() => import('./components/SurveyPage'));
const ElderlyVoucherPage = lazy(() => import('./components/ElderlyVoucherPage'));
const PublicBooking = lazy(() => import('./components/PublicBooking'));
const PublicCheckin = lazy(() => import('./components/PublicCheckin'));
const PublicInquiry = lazy(() => import('./components/PublicInquiry'));
const PrivacyCenter = lazy(() => import('./components/PrivacyCenter'));
const SuperAdmin = lazy(() => import('./components/SuperAdmin'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const MedicineScanner = lazy(() => import('./components/MedicineScanner'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const BillingSettings = lazy(() => import('./components/BillingSettings'));
const EHealthPage = lazy(() => import('./components/EHealthPage'));

const ALL_PAGES = [
  { id: 'dash', icon: '📊', label: 'Dashboard', section: '總覽', perm: 'viewDashboard' },
  { id: 'rev', icon: '💰', label: '營業紀錄', section: '財務', perm: 'editRevenue' },
  { id: 'exp', icon: '🧾', label: '開支紀錄', section: '財務', perm: 'editExpenses' },
  { id: 'scan', icon: '📷', label: '收據掃描', section: '財務', perm: 'viewReceiptScanner' },
  { id: 'arap', icon: '📑', label: '應收應付', section: '財務', perm: 'editARAP' },
  { id: 'patient', icon: '👥', label: '病人管理', section: '病人', perm: 'viewPatients' },
  { id: 'booking', icon: '📅', label: '預約系統', section: '病人', perm: 'viewBookings' },
  { id: 'queue', icon: '🎫', label: '掛號排隊', section: '病人', perm: 'viewQueue' },
  { id: 'emr', icon: '🏥', label: '電子病歷', section: '病人', perm: 'viewEMR' },
  { id: 'package', icon: '🎫', label: '套餐/會員', section: '病人', perm: 'viewPackages' },
  { id: 'crm', icon: '💬', label: 'WhatsApp CRM', section: '客戶', perm: 'viewEMR' },
  { id: 'inventory', icon: '💊', label: '藥材庫存', section: '營運', perm: 'editExpenses' },
  { id: 'medscan', icon: '📦', label: '採購掃描', section: '營運', perm: 'editExpenses' },
  { id: 'billing', icon: '💵', label: '配藥/收費', section: '營運', perm: 'viewBilling' },
  { id: 'products', icon: '🛍️', label: '商品管理', section: '營運', perm: 'editExpenses' },
  { id: 'voucher', icon: '🧓', label: '長者醫療券', section: '病人', perm: 'viewPatients' },
  { id: 'sickleave', icon: '📄', label: '假紙記錄', section: '病人', perm: 'viewEMR' },
  { id: 'pay', icon: '📋', label: '糧單', section: '人事', perm: 'viewPayroll' },
  { id: 'schedule', icon: '🕐', label: '醫師排班', section: '人事', perm: 'viewDoctorAnalytics' },
  { id: 'leave', icon: '🏖️', label: '假期管理', section: '人事', perm: 'viewLeave' },
  { id: 'doc', icon: '👨‍⚕️', label: '醫師業績', section: '分析', perm: 'viewDoctorAnalytics' },
  { id: 'report', icon: '📈', label: '報表中心', section: '分析', perm: 'viewReports' },
  { id: 'ai', icon: '🤖', label: 'AI 助手', section: '分析', perm: 'viewDashboard' },
  { id: 'compare', icon: '🏢', label: '分店對比', section: '分析', perm: 'viewDashboard' },
  { id: 'survey', icon: '📋', label: '滿意度調查', section: '分析', perm: 'viewDashboard' },
  { id: 'ehealth', icon: '🏛️', label: '醫健通', section: '系統', perm: 'viewEMR' },
  { id: 'billingsub', icon: '💳', label: '訂閱管理', section: '系統', perm: 'viewSettings' },
  { id: 'privacy', icon: '🔒', label: '私隱中心', section: '系統', perm: 'viewPrivacy' },
  { id: 'superadmin', icon: '🛡️', label: 'Super Admin', section: '系統', perm: 'viewSuperAdmin' },
];

// Mobile bottom tab config
const MOBILE_TABS = [
  { id: 'dash', icon: '📊', label: 'Dashboard' },
  { id: 'rev', icon: '💰', label: '營業' },
  { id: 'booking', icon: '📅', label: '預約' },
  { id: 'patient', icon: '👥', label: '病人' },
  { id: 'more', icon: '≡', label: '更多' },
];

// ── Login Page ──
function LoginPage({ onLogin, onShowLegal }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetMode, setResetMode] = useState('request'); // 'request' | 'reset'
  const [resetUsername, setResetUsername] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const session = await login(username, password);
      if (session) {
        logAction(session, 'login', 'auth', `${session.name} 登入`);
        onLogin(session);
      } else {
        setError('用戶名或密碼錯誤');
        setPassword('');
      }
    } catch {
      setError('登入失敗，請重試');
    }
    setLoading(false);
  };

  const handleResetRequest = async (e) => {
    e.preventDefault();
    if (!resetUsername.trim()) { setResetError('請輸入用戶名'); return; }
    setResetLoading(true);
    setResetError('');
    setResetMsg('');
    try {
      const data = await requestPasswordReset(resetUsername.trim());
      if (data.success) {
        setResetMsg(data.emailSent
          ? '重設連結已發送至用戶電郵。'
          : '如用戶存在，重設指示已處理。請聯絡用戶查看電郵。');
      } else {
        setResetError(data.error || '請求失敗');
      }
    } catch {
      setResetError('網絡錯誤，請稍後再試');
    }
    setResetLoading(false);
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    if (!resetTokenInput.trim()) { setResetError('請輸入重設令牌'); return; }
    if (!newPassword) { setResetError('請輸入新密碼'); return; }
    if (newPassword.length < 8) { setResetError('密碼最少需要8個字元（需包含大小寫字母及數字）'); return; }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) { setResetError('密碼需包含大小寫字母及數字'); return; }
    if (newPassword !== confirmPassword) { setResetError('兩次密碼不一致'); return; }
    setResetLoading(true);
    setResetError('');
    setResetMsg('');
    try {
      const data = await resetPassword(resetTokenInput.trim(), newPassword);
      if (data.success) {
        setResetMsg('密碼已成功重設，請返回登入。');
        setResetTokenInput('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setResetError(data.error || '重設失敗');
      }
    } catch {
      setResetError('網絡錯誤，請稍後再試');
    }
    setResetLoading(false);
  };

  const clearResetState = () => {
    setShowReset(false);
    setResetMode('request');
    setResetUsername('');
    setResetToken('');
    setResetTokenInput('');
    setNewPassword('');
    setConfirmPassword('');
    setResetMsg('');
    setResetError('');
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={showReset ? (resetMode === 'request' ? handleResetRequest : handlePasswordReset) : handleSubmit}>
        <div className="login-brand">
          <img src={getClinicLogo() || '/logo.jpg'} alt={getClinicName()} className="login-logo" />
        </div>
        <div className="login-divider" />

        {!showReset ? (
          <>
            <label htmlFor="username">用戶名</label>
            <input
              id="username"
              type="text"
              placeholder="請輸入用戶名"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); }}
              autoFocus
            />
            <label htmlFor="password" style={{ marginTop: 4 }}>密碼</label>
            <input
              id="password"
              type="password"
              placeholder="請輸入密碼"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
            />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="btn btn-teal btn-lg login-btn" disabled={loading}>{loading ? '登入中...' : '登入'}</button>
            <p style={{ fontSize: 11, color: 'var(--teal)', marginTop: 12, cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => { setShowReset(true); setResetMode('request'); setError(''); }}>
              忘記密碼?
            </p>
          </>
        ) : resetMode === 'request' ? (
          <>
            <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>忘記密碼 - 申請重設</label>
            <label htmlFor="resetUsername">用戶名</label>
            <input
              id="resetUsername"
              type="text"
              placeholder="請輸入用戶名"
              value={resetUsername}
              onChange={(e) => { setResetUsername(e.target.value); setResetError(''); }}
              autoFocus
            />
            {resetError && <div className="login-error">{resetError}</div>}
            {resetMsg && <div style={{ fontSize: 12, color: 'var(--teal)', marginTop: 8 }}>{resetMsg}</div>}
            {resetToken && (
              <div style={{ fontSize: 12, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 6, padding: '8px 10px', marginTop: 8, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {resetToken}
              </div>
            )}
            <button type="submit" className="btn btn-teal btn-lg login-btn" disabled={resetLoading} style={{ marginTop: 12 }}>
              {resetLoading ? '處理中...' : '發送重設連結'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--teal)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => { setResetMode('reset'); setResetError(''); setResetMsg(''); }}>
                已有令牌? 重設密碼
              </span>
              <span style={{ fontSize: 11, color: 'var(--gray-400)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={clearResetState}>
                返回登入
              </span>
            </div>
          </>
        ) : (
          <>
            <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>重設密碼</label>
            <label htmlFor="tokenInput">重設令牌</label>
            <input
              id="tokenInput"
              type="text"
              placeholder="請輸入重設令牌"
              value={resetTokenInput}
              onChange={(e) => { setResetTokenInput(e.target.value); setResetError(''); }}
              autoFocus
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <label htmlFor="newPassword" style={{ marginTop: 4 }}>新密碼</label>
            <input
              id="newPassword"
              type="password"
              placeholder="請輸入新密碼 (至少6位)"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setResetError(''); }}
            />
            <label htmlFor="confirmPassword" style={{ marginTop: 4 }}>確認新密碼</label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="再次輸入新密碼"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setResetError(''); }}
            />
            {resetError && <div className="login-error">{resetError}</div>}
            {resetMsg && <div style={{ fontSize: 12, color: 'var(--teal)', marginTop: 8 }}>{resetMsg}</div>}
            <button type="submit" className="btn btn-teal btn-lg login-btn" disabled={resetLoading} style={{ marginTop: 12 }}>
              {resetLoading ? '處理中...' : '重設密碼'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--teal)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => { setResetMode('request'); setResetError(''); setResetMsg(''); }}>
                申請重設令牌
              </span>
              <span style={{ fontSize: 11, color: 'var(--gray-400)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={clearResetState}>
                返回登入
              </span>
            </div>
          </>
        )}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--gray-200)', textAlign: 'center', fontSize: 11, color: 'var(--gray-400)' }}>
          <span style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--gray-500)' }}
            onClick={() => onShowLegal && onShowLegal('terms')}>
            服務條款
          </span>
          <span style={{ margin: '0 6px' }}>|</span>
          <span style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--gray-500)' }}
            onClick={() => onShowLegal && onShowLegal('privacy')}>
            私隱政策
          </span>
        </div>
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

    // Pending online bookings
    const pendingBookings = (data.bookings || []).filter(b => b.status === 'pending');
    if (pendingBookings.length) notes.push({ icon: '🔔', title: `${pendingBookings.length} 個新預約待確認`, time: '待處理', category: '預約', priority: 'high' });

    // New inquiries
    const newInquiries = (data.inquiries || []).filter(i => i.status === 'new');
    if (newInquiries.length) notes.push({ icon: '💬', title: `${newInquiries.length} 個新客人查詢待回覆`, time: '待處理', category: '查詢', priority: 'high' });

    (data.arap || []).filter(a => a.type === 'receivable' && a.status === 'pending' && a.dueDate < today)
      .forEach(a => notes.push({ icon: '🔴', title: `逾期應收：${a.party} ${fmtM(a.amount)}`, time: a.dueDate, category: '財務', priority: 'high' }));

    const tmrBookings = (data.bookings || []).filter(b => b.date === tomorrow && b.status === 'confirmed');
    if (tmrBookings.length) notes.push({ icon: '📅', title: `明日有 ${tmrBookings.length} 個預約`, time: '明天', category: '預約', priority: 'medium' });

    const thisRev = (data.revenue || []).filter(r => getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount), 0);
    const lastRev = (data.revenue || []).filter(r => getMonth(r.date) === lastMonth).reduce((s, r) => s + Number(r.amount), 0);
    if (lastRev > 0 && thisRev < lastRev) notes.push({ icon: '⚠️', title: `本月營業額 (${fmtM(thisRev)}) 低於上月 (${fmtM(lastRev)})`, time: thisMonth, category: '財務', priority: 'medium' });

    if (dayOfMonth >= 20 && dayOfMonth <= 25) notes.push({ icon: '💼', title: 'MPF 供款提醒：請於25日前完成供款', time: today, category: '行政', priority: 'medium' });

    // Follow-up reminders
    const overdueFollowUps = (data.consultations || []).filter(c => c.followUpDate && c.followUpDate < today);
    if (overdueFollowUps.length) notes.push({ icon: '📋', title: `${overdueFollowUps.length} 位病人覆診已逾期`, time: '覆診', category: '醫療', priority: 'high' });
    const todayFollowUps = (data.consultations || []).filter(c => c.followUpDate === today);
    if (todayFollowUps.length) notes.push({ icon: '🔔', title: `今日有 ${todayFollowUps.length} 位病人需要覆診`, time: '今日', category: '醫療', priority: 'high' });

    // Patient birthdays
    const todayMD = today.substring(5);
    const birthdayPatients = (data.patients || []).filter(p => p.dob && p.dob.substring(5) === todayMD);
    if (birthdayPatients.length) notes.push({ icon: '🎂', title: `${birthdayPatients.map(p => p.name).join('、')} 今日生日`, time: '生日', category: 'CRM', priority: 'low' });

    // Low-stock inventory alerts
    const lowStockItems = (data.inventory || []).filter(i => Number(i.stock) < Number(i.minStock));
    if (lowStockItems.length) {
      notes.push({ icon: '💊', title: `藥物庫存不足：${lowStockItems.length} 項低於安全庫存`, time: '庫存', category: '庫存', priority: 'high' });
      lowStockItems.slice(0, 3).forEach(i => {
        notes.push({ icon: '⚠️', title: `${i.name} — 現有 ${i.stock}${i.unit}（最低 ${i.minStock}${i.unit}）`, time: '低庫存', category: '庫存', priority: 'medium' });
      });
    }

    // Low stock products
    const lowStockProducts = (data.products || []).filter(p => p.active !== false && Number(p.stock) < Number(p.minStock));
    if (lowStockProducts.length) notes.push({ icon: '📦', title: `${lowStockProducts.length} 個商品低庫存`, time: '庫存', category: '庫存', priority: 'medium' });

    // Pending leaves
    const pendingLeaves = (data.leaves || []).filter(l => l.status === 'pending');
    if (pendingLeaves.length) notes.push({ icon: '✈️', title: `${pendingLeaves.length} 個請假申請待審批`, time: '待處理', category: '行政', priority: 'medium' });

    // Queue alerts
    const todayQueue = (data.queue || []).filter(q => q.date === today);
    const waitingCount = todayQueue.filter(q => q.status === 'waiting').length;
    if (waitingCount >= 5) notes.push({ icon: '🏥', title: `目前有 ${waitingCount} 位病人等候中`, time: '候診', category: '營運', priority: 'medium' });

    // Sort by priority (high first)
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    notes.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));

    return notes;
  }, [data]);
}

// ── Global Search ──
function SearchPanel({ data, onNavigate, onClose }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    if (!q) return { patients: [], revenue: [], expenses: [] };
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
        <input ref={inputRef} className="search-input" placeholder="搜尋病人、營業、開支..." value={q} onChange={e => setQ(e.target.value)} aria-label="全域搜尋" />
        {q && (
          <div className="search-results">
            {results.patients.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">👤 病人</div>
                {results.patients.map(p => <div key={p.id} className="search-item" onClick={() => { onNavigate('patient'); onClose(); }}>{p.name} — {p.phone}</div>)}
              </div>
            )}
            {results.revenue.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">💰 營業</div>
                {results.revenue.map(r => <div key={r.id} className="search-item" onClick={() => { onNavigate('rev'); onClose(); }}>{r.name} {fmtM(r.amount)} — {String(r.date).substring(0,10)}</div>)}
              </div>
            )}
            {results.expenses.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">🧾 開支</div>
                {results.expenses.map(r => <div key={r.id} className="search-item" onClick={() => { onNavigate('exp'); onClose(); }}>{r.merchant} {fmtM(r.amount)} — {String(r.date).substring(0,10)}</div>)}
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
    exportCSV(rows, [{ key:'date',label:'日期' },{ key:'name',label:'病人' },{ key:'item',label:'項目' },{ key:'amount',label:'金額' },{ key:'payment',label:'付款方式' },{ key:'store',label:'店舖' },{ key:'doctor',label:'醫師' }], `revenue_${thisMonth}.csv`);
    showToast('營業紀錄已匯出'); onClose();
  };
  const exportMonthlyExp = () => {
    const rows = (data.expenses || []).filter(r => getMonth(r.date) === thisMonth);
    exportCSV(rows, [{ key:'date',label:'日期' },{ key:'merchant',label:'商戶' },{ key:'amount',label:'金額' },{ key:'category',label:'類別' },{ key:'store',label:'店舖' },{ key:'desc',label:'描述' }], `expenses_${thisMonth}.csv`);
    showToast('開支紀錄已匯出'); onClose();
  };
  const exportAll = () => { exportJSON(data, `hcmc_backup_${new Date().toISOString().substring(0,10)}.json`); showToast('全部數據已匯出'); onClose(); };

  return (
    <div className="dropdown-menu">
      <div className="dropdown-item" onClick={exportMonthlyRev}>📊 本月營業紀錄 (CSV)</div>
      <div className="dropdown-item" onClick={exportMonthlyExp}>🧾 本月開支紀錄 (CSV)</div>
      <div className="dropdown-item" onClick={exportAll}>💾 所有數據 (JSON)</div>
    </div>
  );
}

// ── PWA Install Prompt ──
function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    // Check if dismissed recently
    const dismissed = localStorage.getItem('hcmc_install_dismissed');
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('hcmc_install_dismissed', String(Date.now()));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="install-banner">
      <span>📱 安裝{getClinicName().replace('綜合醫療中心','醫療')} App 到主畫面，使用更方便</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-teal btn-sm" onClick={handleInstall}>安裝</button>
        <button className="btn btn-outline btn-sm" onClick={handleDismiss}>稍後</button>
      </div>
    </div>
  );
}

// ── Mobile FAB (Quick Actions) (#65) ──
function MobileFAB({ onAction }) {
  const [open, setOpen] = useState(false);
  const actions = [
    { icon: '💰', label: '新增營業', page: 'rev' },
    { icon: '📅', label: '新增預約', page: 'booking' },
    { icon: '🎫', label: '掛號排隊', page: 'queue' },
    { icon: '👥', label: '新增病人', page: 'patient' },
    { icon: '🧾', label: '新增開支', page: 'exp' },
  ];
  return (
    <>
      {open && <div className="fab-overlay" onClick={() => setOpen(false)} />}
      <div className="fab-container">
        {open && (
          <div className="fab-menu">
            {actions.map(a => (
              <button key={a.page} className="fab-action" onClick={() => { onAction(a.page); setOpen(false); }}>
                <span>{a.icon}</span><span>{a.label}</span>
              </button>
            ))}
          </div>
        )}
        <button className={`fab-btn ${open ? 'fab-open' : ''}`} onClick={() => setOpen(!open)} aria-label="快捷操作">
          {open ? '✕' : '＋'}
        </button>
      </div>
    </>
  );
}

// ── Mobile More Menu ──
function MobileMoreMenu({ pages, page, setPage, onClose, user, onLogout }) {
  return (
    <div className="mobile-more-overlay" onClick={onClose}>
      <div className="mobile-more-panel" onClick={e => e.stopPropagation()}>
        <div className="mobile-more-header">
          <strong>全部功能</strong>
          <span onClick={onClose} style={{ cursor: 'pointer', fontSize: 18 }} role="button" aria-label="關閉">✕</span>
        </div>
        {user && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px 14px', marginBottom: 8, borderBottom: '1px solid var(--gray-200)' }}>
            <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>👤 {user.name} <span className={`tag ${ROLE_TAGS[user.role] || ''}`}>{ROLE_LABELS[user.role]}</span></span>
            <button className="btn btn-outline btn-sm" onClick={onLogout}>登出</button>
          </div>
        )}
        <div className="mobile-more-grid">
          {pages.map(p => (
            <div key={p.id} className={`mobile-more-item ${page === p.id ? 'active' : ''}`} onClick={() => { setPage(p.id); onClose(); }}>
              <span style={{ fontSize: 24 }}>{p.icon}</span>
              <span>{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main App ──
const LazyFallback = <div style={{ padding: 40, textAlign: 'center' }}>載入中...</div>;

export default function App() {
  const path = window.location.pathname;
  if (path === '/booking') return <Suspense fallback={LazyFallback}><PublicBooking /></Suspense>;
  if (path === '/checkin') return <Suspense fallback={LazyFallback}><PublicCheckin /></Suspense>;
  if (path === '/inquiry') return <Suspense fallback={LazyFallback}><PublicInquiry /></Suspense>;

  return <MainApp />;
}

function MainApp() {
  const [user, setUser] = useState(() => getCurrentUser());
  const [page, setPage] = useState('');
  const [data, setData] = useState({ revenue: [], expenses: [], arap: [], patients: [], bookings: [], payslips: [], consultations: [], packages: [], enrollments: [], conversations: [], inventory: [], queue: [], sickleaves: [], leaves: [], products: [], productSales: [], inquiries: [], communications: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [activeStore, setActiveStore] = useState('all');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [theme, setTheme] = useState(() => localStorage.getItem('hcmc_theme') || 'light');
  const [showLoginPage, setShowLoginPage] = useState(false);
  const [legalPage, setLegalPage] = useState(null); // 'terms' | 'privacy' | null
  const [readNotifs, setReadNotifs] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('hcmc_read_notifs') || '[]'); } catch { return []; }
  });

  // Auto-logout after 30 minutes of inactivity
  useEffect(() => {
    if (!user) return;
    const TIMEOUT = 30 * 60 * 1000;
    let timer = setTimeout(() => { logout(); setUser(null); }, TIMEOUT);
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => { logout(); setUser(null); }, TIMEOUT); touchActivity(); };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)); };
  }, [user]);

  // Online/offline detection
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  // Dark mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('hcmc_theme', theme);
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);

  // Supabase Realtime — auto-sync across devices
  useEffect(() => {
    if (!user) return;
    const REALTIME_TABLES = ['revenue', 'expenses', 'patients', 'bookings', 'consultations', 'inventory', 'queue', 'inquiries', 'arap', 'leaves', 'products', 'productSales', 'packages', 'enrollments', 'sickleaves', 'payslips', 'surveys'];
    const subs = REALTIME_TABLES.map(table =>
      subscribeToChanges(table, (payload) => {
        const { eventType, new: newRec, old: oldRec } = payload;
        setData(prev => {
          const arr = [...(prev[table] || [])];
          if (eventType === 'INSERT') {
            if (!arr.find(r => r.id === newRec.id)) arr.push(newRec);
          } else if (eventType === 'UPDATE') {
            const idx = arr.findIndex(r => r.id === newRec.id);
            if (idx >= 0) arr[idx] = newRec; else arr.push(newRec);
          } else if (eventType === 'DELETE' && oldRec) {
            return { ...prev, [table]: arr.filter(r => r.id !== oldRec.id) };
          }
          return { ...prev, [table]: arr };
        });
      })
    ).filter(Boolean);
    return () => subs.forEach(s => unsubscribe(s));
  }, [user]);

  // Set default page based on role
  useEffect(() => {
    if (!user) return;
    if (user.role === 'doctor') setPage('doc');
    else if (user.role === 'staff') setPage('rev');
    else setPage('dash');
  }, [user]);

  const perms = user ? (PERMISSIONS[user.role] || {}) : {};
  const visiblePages = ALL_PAGES.filter(p => perms[p.perm]);
  const stores = getStores().filter(s => s.active);

  const filteredData = useMemo(() => filterByPermission(data, activeStore), [data, activeStore, user]);
  const notifications = useNotifications(filteredData);
  const unreadCount = notifications.filter((_, i) => !readNotifs.includes(i)).length;

  const handleLogout = useCallback(() => { logAction(user, 'logout', 'auth', '用戶登出'); logout(); setUser(null); }, [user]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await loadAllData();
      if (d && (d.revenue?.length || d.expenses?.length || d.patients?.length)) {
        setData({ revenue: d.revenue||[], expenses: d.expenses||[], arap: d.arap||[], patients: d.patients||[], bookings: d.bookings||[], payslips: d.payslips||[], consultations: d.consultations||[], packages: d.packages||[], enrollments: d.enrollments||[], conversations: d.conversations||[], inventory: d.inventory||[], queue: d.queue||[], sickleaves: d.sickleaves||[], leaves: d.leaves||[], products: d.products||[], productSales: d.productSales||[], inquiries: d.inquiries||[], communications: d.communications||[] });
      } else {
        setData(SEED_DATA);
        saveAllLocal(SEED_DATA);
      }
    } catch (err) {
      console.error('Data load failed:', err);
      showToast('數據加載失敗，使用本地備用數據');
      setData(SEED_DATA);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (user) reload(); }, [user, reload]);

  const updateData = useCallback((newData) => { setData(newData); saveAllLocal(newData); }, []);

  const markAllRead = () => {
    const ids = notifications.map((_, i) => i);
    setReadNotifs(ids);
    sessionStorage.setItem('hcmc_read_notifs', JSON.stringify(ids));
  };

  if (!user) {
    // Show legal pages (Terms / Privacy) from login screen
    if (legalPage === 'terms') {
      return (
        <Suspense fallback={LazyFallback}>
          <TermsOfService onBack={() => setLegalPage(null)} />
        </Suspense>
      );
    }
    if (legalPage === 'privacy') {
      return (
        <Suspense fallback={LazyFallback}>
          <PrivacyPolicy onBack={() => setLegalPage(null)} />
        </Suspense>
      );
    }

    const path = window.location.pathname;
    const isLandingRoute = path === '/' || path === '/landing';
    if (isLandingRoute && !showLoginPage) {
      return (
        <Suspense fallback={LazyFallback}>
          <LandingPage
            onGetStarted={() => setShowLoginPage(true)}
            onLogin={() => setShowLoginPage(true)}
          />
        </Suspense>
      );
    }
    return <LoginPage onLogin={(session) => { applyTenantTheme(); setShowLoginPage(false); setUser(session); }} onShowLegal={setLegalPage} />;
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 32, height: 32 }} />
        <span>載入數據中...</span>
      </div>
    );
  }

  const currentPage = visiblePages.find(p => p.id === page) || visiblePages[0];
  let sections = {};
  visiblePages.forEach(p => {
    if (!sections[p.section]) sections[p.section] = [];
    sections[p.section].push(p);
  });

  // Mobile tabs filtered by permissions
  const mobileTabs = MOBILE_TABS.filter(t => t.id === 'more' || perms[ALL_PAGES.find(p => p.id === t.id)?.perm]);

  return (
    <>
      {/* SIDEBAR (desktop) */}
      <div className="sidebar">
        <div className="sidebar-logo">
          <img src={getClinicLogo() || '/logo.jpg'} alt={getClinicName()} className="sidebar-logo-img" />
        </div>
        <nav className="sidebar-nav">
          {Object.entries(sections).map(([section, items]) => (
            <div key={section}>
              <div className="nav-section">{section}</div>
              {items.map(p => (
                <div key={p.id} className={`nav-item ${page === p.id ? 'active' : ''}`} onClick={() => setPage(p.id)}>
                  <span style={{ fontSize: 16 }}>{p.icon}</span><span>{p.label}</span>
                </div>
              ))}
            </div>
          ))}
          {perms.viewSettings && (
            <>
              <div className="nav-section" style={{ borderTop: '1px solid rgba(255,255,255,.1)', marginTop: 8, paddingTop: 12 }}></div>
              <div className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}>
                <span style={{ fontSize: 16 }}>⚙️</span><span>設定</span>
              </div>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button className="btn-logout" style={{ flex: 1 }} onClick={handleLogout}>🔓 登出</button>
            <button className="btn-logout" style={{ width: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={toggleTheme} title={theme === 'dark' ? '淺色模式' : '深色模式'}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          </div>
          <span>v6.7.0 • {new Date().getFullYear()}</span>
        </div>
      </div>

      {/* MAIN */}
      <div className="main">
        <div className="topbar">
          <h2>{page === 'settings' ? '⚙️ 設定' : `${currentPage?.icon || ''} ${currentPage?.label || ''}`}</h2>
          <div className="topbar-actions">
            {isOffline && <span className="offline-badge">離線模式</span>}
            {/* Store Switcher (admin only) */}
            {perms.viewAllStores && (
              <select className="btn btn-outline btn-sm hide-mobile" style={{ fontWeight: 600 }} value={activeStore} onChange={e => setActiveStore(e.target.value)}>
                <option value="all">🏢 全部分店</option>
                {stores.map(s => <option key={s.id} value={s.name}>📍 {s.name}</option>)}
              </select>
            )}
            <button className="btn btn-outline btn-sm" onClick={() => setShowSearch(true)} aria-label="搜尋">🔍</button>
            <div style={{ position: 'relative' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowNotif(!showNotif)} aria-label={`通知${unreadCount > 0 ? `，${unreadCount} 條未讀` : ''}`}>
                🔔{unreadCount > 0 && <span className="notif-badge" aria-hidden="true">{unreadCount}</span>}
              </button>
              {showNotif && (
                <div className="dropdown-menu notif-panel" style={{ right: 0, width: 360, maxHeight: 480, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--gray-100)' }}>
                    <strong style={{ fontSize: 13 }}>通知 ({notifications.length})</strong>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-outline btn-sm" style={{ fontSize: 10 }} onClick={markAllRead}>全部已讀</button>
                    </div>
                  </div>
                  {notifications.length > 0 && (
                    <div style={{ padding: '4px 12px', display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--gray-100)' }}>
                      {(() => {
                        const cats = [...new Set(notifications.map(n => n.category).filter(Boolean))];
                        return cats.map(c => {
                          const count = notifications.filter(n => n.category === c).length;
                          return <span key={c} style={{ fontSize: 10, padding: '2px 6px', background: 'var(--gray-100)', borderRadius: 10, color: 'var(--gray-600)' }}>{c} {count}</span>;
                        });
                      })()}
                    </div>
                  )}
                  {notifications.map((n, i) => (
                    <div key={i} className="dropdown-item" style={{
                      opacity: readNotifs.includes(i) ? 0.5 : 1, fontSize: 12,
                      borderLeft: n.priority === 'high' ? '3px solid #dc2626' : n.priority === 'medium' ? '3px solid #d97706' : '3px solid var(--gray-200)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span>{n.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div>{n.title}</div>
                        <div style={{ fontSize: 10, color: 'var(--gray-400)', display: 'flex', gap: 6, marginTop: 2 }}>
                          {n.category && <span>{n.category}</span>}
                          <span>{n.time}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {notifications.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--gray-400)', fontSize: 12 }}>暫無通知</div>}
                </div>
              )}
            </div>
            {perms.viewReports && (
              <div className="hide-mobile" style={{ position: 'relative' }}>
                <button className="btn btn-outline btn-sm" onClick={() => setShowExport(!showExport)}>📥 匯出</button>
                {showExport && <ExportMenu data={filteredData} showToast={showToast} onClose={() => setShowExport(false)} />}
              </div>
            )}
            <button className="btn btn-outline btn-sm" onClick={toggleTheme} title={theme === 'dark' ? '淺色模式' : '深色模式'}>{theme === 'dark' ? '☀️' : '🌙'}</button>
            <button className="btn btn-outline btn-sm hide-mobile" onClick={reload}>🔄</button>
            <span className="hide-mobile" style={{ fontSize: 12, color: 'var(--gray-600)', display: 'flex', alignItems: 'center', gap: 4 }}>
              👤 {user.name} <span className={`tag ${ROLE_TAGS[user.role] || ''}`}>{ROLE_LABELS[user.role]}</span>
            </span>
            <button className="btn btn-outline btn-sm hide-mobile" onClick={handleLogout}>登出</button>
          </div>
        </div>
        <div className="content">
          <Suspense fallback={LazyFallback}>
            {page === 'dash' && <Dashboard data={filteredData} onNavigate={setPage} />}
            {page === 'rev' && <Revenue data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'exp' && <Expenses data={filteredData} setData={updateData} showToast={showToast} allData={data} onNavigate={setPage} />}
            {page === 'scan' && <ReceiptScanner data={filteredData} setData={updateData} showToast={showToast} onNavigate={setPage} allData={data} />}
            {page === 'arap' && <ARAP data={filteredData} setData={updateData} showToast={showToast} allData={data} />}
            {page === 'patient' && <PatientPage data={filteredData} setData={updateData} showToast={showToast} allData={data} onNavigate={setPage} />}
            {page === 'booking' && <BookingPage data={filteredData} setData={updateData} showToast={showToast} allData={data} />}
            {page === 'queue' && <QueuePage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} onNavigate={setPage} />}
            {page === 'emr' && <EMRPage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} onNavigate={setPage} />}
            {page === 'package' && <PackagePage data={filteredData} setData={updateData} showToast={showToast} allData={data} />}
            {page === 'crm' && <CRMPage data={filteredData} setData={updateData} showToast={showToast} />}
            {page === 'inventory' && <InventoryPage data={filteredData} setData={updateData} showToast={showToast} onNavigate={setPage} />}
            {page === 'medscan' && <MedicineScanner data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} onNavigate={setPage} />}
            {page === 'billing' && <BillingPage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'products' && <ProductPage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'voucher' && <ElderlyVoucherPage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'sickleave' && <SickLeavePage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'pay' && <Payslip data={filteredData} setData={updateData} showToast={showToast} allData={data} />}
            {page === 'schedule' && <DoctorSchedule data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'leave' && <LeavePage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'doc' && <DoctorAnalytics data={filteredData} user={user} />}
            {page === 'report' && <Reports data={filteredData} />}
            {page === 'ai' && <AIChatPage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'compare' && <StoreComparePage data={filteredData} allData={data} showToast={showToast} />}
            {page === 'survey' && <SurveyPage data={filteredData} setData={setData} showToast={showToast} user={user} />}
            {page === 'ehealth' && <EHealthPage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'privacy' && <PrivacyCenter data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'superadmin' && <SuperAdmin showToast={showToast} user={user} />}
            {page === 'settings' && <SettingsPage data={data} setData={updateData} showToast={showToast} user={user} />}
            {page === 'tos' && <TermsOfService onBack={() => setPage('dash')} />}
            {page === 'pp' && <PrivacyPolicy onBack={() => setPage('dash')} />}
            {page === 'billingsub' && <BillingSettings />}
          </Suspense>
        </div>
      </div>

      {/* Mobile FAB (#65) */}
      <MobileFAB onAction={setPage} />

      {/* Mobile Bottom Tab Bar */}
      <div className="mobile-tabbar">
        {mobileTabs.map(t => (
          <div
            key={t.id}
            className={`mobile-tab ${(t.id === 'more' ? false : page === t.id) ? 'active' : ''}`}
            onClick={() => t.id === 'more' ? setShowMoreMenu(true) : setPage(t.id)}
          >
            <span className="mobile-tab-icon">{t.icon}</span>
            <span className="mobile-tab-label">{t.label}</span>
          </div>
        ))}
      </div>

      {showMoreMenu && <MobileMoreMenu pages={[...visiblePages, ...(perms.viewSettings ? [{ id:'settings', icon:'⚙️', label:'設定' }] : [])]} page={page} setPage={setPage} onClose={() => setShowMoreMenu(false)} user={user} onLogout={handleLogout} />}
      {showSearch && <SearchPanel data={filteredData} onNavigate={setPage} onClose={() => setShowSearch(false)} />}
      {(showNotif || showExport) && <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => { setShowNotif(false); setShowExport(false); }} />}
      {toast && <div className="toast">{toast}</div>}
      <InstallPrompt />
    </>
  );
}
