import { useState, useMemo, useCallback } from 'react';
import { fmtM } from '../data';

const ACCENT = '#0e7490';

/* ── Category definitions ── */
const CATEGORIES = [
  { key: 'all',       label: '全部',   icon: '🔔', color: ACCENT },
  { key: 'booking',   label: '預約',   icon: '📅', color: '#0e7490' },
  { key: 'inventory', label: '庫存',   icon: '📦', color: '#d97706' },
  { key: 'finance',   label: '財務',   icon: '💰', color: '#dc2626' },
  { key: 'patient',   label: '醫療',   icon: '🧑‍⚕️', color: '#7c3aed' },
  { key: 'hr',        label: '行政',   icon: '👥', color: '#16a34a' },
  { key: 'system',    label: '營運',   icon: '⚙️', color: '#6b7280' },
];

const CATEGORY_LOOKUP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

/* ── Priority configuration ── */
const PRIORITY_MAP = {
  high:   { label: '高',  color: '#fff', bg: '#dc2626', border: '#dc2626', dot: '#dc2626', ring: '#fef2f2' },
  medium: { label: '中',  color: '#fff', bg: '#d97706', border: '#d97706', dot: '#d97706', ring: '#fffbeb' },
  low:    { label: '低',  color: '#fff', bg: '#9ca3af', border: '#9ca3af', dot: '#9ca3af', ring: '#f9fafb' },
};

/* ── Navigation & action button labels per category ── */
const NAV_MAP = {
  booking:   'booking',
  inventory: 'inventory',
  finance:   'arap',
  patient:   'patients',
  hr:        'leave',
  system:    null,
};

const ACTION_LABELS = {
  booking:   '查看預約',
  inventory: '查看庫存',
  finance:   '查看帳務',
  patient:   '查看病人',
  hr:        '查看人事',
  system:    null,
};

/* ── Default notification settings ── */
const DEFAULT_SETTINGS = {
  booking: true, inventory: true, finance: true, patient: true, system: true, hr: true,
  lowStockThreshold: 100, overdueDays: 7, pendingBookingHours: 24, inactivePatientDays: 90,
};

/* ── Storage helpers ── */
function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function loadSessionJSON(key, fallback) {
  try { return JSON.parse(sessionStorage.getItem(key)) || fallback; } catch { return fallback; }
}

/* ══════════════════════════════════════════════════════════════════
   NotificationCenter
   ══════════════════════════════════════════════════════════════════ */
export default function NotificationCenter({ data, showToast, user, onNavigate }) {
  /* ── State ── */
  const [activeCategory, setActiveCategory] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(() => loadJSON('hcmc_notif_settings', DEFAULT_SETTINGS));
  const [readIds, setReadIds] = useState(() => loadJSON('hcmc_notif_read', []));
  const [dismissedIds, setDismissedIds] = useState(() => loadSessionJSON('hcmc_notif_dismissed', []));

  /* ── Persistence helpers ── */
  const saveSettings = useCallback((s) => {
    setSettings(s);
    localStorage.setItem('hcmc_notif_settings', JSON.stringify(s));
  }, []);

  const saveRead = useCallback((ids) => {
    setReadIds(ids);
    localStorage.setItem('hcmc_notif_read', JSON.stringify(ids));
  }, []);

  const saveDismissed = useCallback((ids) => {
    setDismissedIds(ids);
    sessionStorage.setItem('hcmc_notif_dismissed', JSON.stringify(ids));
  }, []);

  const today = new Date().toISOString().substring(0, 10);
  const now = Date.now();

  /* ════════════════════════════════════════════════════
     Auto-generate notifications from data
     ════════════════════════════════════════════════════ */
  const notifications = useMemo(() => {
    const n = [];
    let seq = 0;
    const mk = (cat, priority, title, desc, navPage) => {
      seq++;
      n.push({
        id: `${cat}_${seq}`,
        category: cat,
        priority,
        title,
        desc,
        navPage,
        ts: now - seq * 60000,
      });
    };

    /* Booking notifications */
    if (settings.booking) {
      const bookings = data.bookings || [];
      const pending = bookings.filter(b => b.status === 'pending' && b.date >= today);
      if (pending.length > 0)
        mk('booking', 'medium', `${pending.length} 個待確認預約`, `今日起有 ${pending.length} 個預約尚未確認`, 'booking');
      const todayBk = bookings.filter(b => b.date === today);
      if (todayBk.length > 0)
        mk('booking', 'low', `今日共 ${todayBk.length} 個預約`, todayBk.map(b => `${b.time} ${b.patientName} (${b.doctor})`).slice(0, 3).join('、'), 'booking');
      const noShow = bookings.filter(b => b.status === 'no-show' && b.date >= today.substring(0, 7));
      if (noShow.length > 0)
        mk('booking', 'medium', `本月 ${noShow.length} 位未到`, '建議跟進未到病人', 'booking');
      const cancelled = bookings.filter(b => b.status === 'cancelled' && b.date === today);
      if (cancelled.length > 0)
        mk('booking', 'low', `今日 ${cancelled.length} 個預約已取消`, cancelled.map(b => b.patientName).join('、'), 'booking');
      const tomorrow = new Date(now + 86400000).toISOString().substring(0, 10);
      const tomorrowBk = bookings.filter(b => b.date === tomorrow && b.status !== 'cancelled');
      if (tomorrowBk.length > 0)
        mk('booking', 'low', `明日有 ${tomorrowBk.length} 個預約`, '請提前確認及提醒病人', 'booking');
    }

    /* Inventory notifications */
    if (settings.inventory) {
      const inv = data.inventory || [];
      const threshold = settings.lowStockThreshold || 100;
      const lowStock = inv.filter(i => i.active !== false && Number(i.stock) < threshold && Number(i.stock) > 0);
      const outOfStock = inv.filter(i => i.active !== false && Number(i.stock) <= 0);
      if (outOfStock.length > 0)
        mk('inventory', 'high', `${outOfStock.length} 項已斷貨`, outOfStock.slice(0, 3).map(i => i.name).join('、'), 'inventory');
      if (lowStock.length > 0)
        mk('inventory', 'medium', `${lowStock.length} 項庫存偏低`, lowStock.slice(0, 3).map(i => `${i.name} (剩 ${i.stock}${i.unit || 'g'})`).join('、'), 'inventory');
      const expiring = inv.filter(i => i.expiryDate && i.expiryDate <= new Date(now + 30 * 86400000).toISOString().substring(0, 10) && i.expiryDate >= today);
      if (expiring.length > 0)
        mk('inventory', 'high', `${expiring.length} 項即將過期`, expiring.slice(0, 3).map(i => `${i.name} (${i.expiryDate})`).join('、'), 'inventory');
    }

    /* Finance notifications */
    if (settings.finance) {
      const arap = data.arap || [];
      const overdueDays = settings.overdueDays || 7;
      const cutoff = new Date(now - overdueDays * 86400000).toISOString().substring(0, 10);
      const overdueAR = arap.filter(r => r.type === 'receivable' && r.status !== '已收' && r.dueDate && r.dueDate < cutoff);
      const overdueAP = arap.filter(r => r.type === 'payable' && r.status !== '已付' && r.dueDate && r.dueDate < cutoff);
      if (overdueAR.length > 0)
        mk('finance', 'high', `${overdueAR.length} 筆應收帳已逾期`, `逾期總額 ${fmtM(overdueAR.reduce((s, r) => s + Number(r.amount), 0))}`, 'arap');
      if (overdueAP.length > 0)
        mk('finance', 'high', `${overdueAP.length} 筆應付帳已逾期`, `逾期總額 ${fmtM(overdueAP.reduce((s, r) => s + Number(r.amount), 0))}`, 'arap');
      const pendingAR = arap.filter(r => r.type === 'receivable' && r.status === '未收');
      if (pendingAR.length > 0)
        mk('finance', 'medium', `${pendingAR.length} 筆應收帳待收`, `待收總額 ${fmtM(pendingAR.reduce((s, r) => s + Number(r.amount), 0))}`, 'arap');
      const billing = data.billing || [];
      const todayRev = billing.filter(b => b.date === today);
      if (todayRev.length > 0)
        mk('finance', 'low', `今日收入 ${fmtM(todayRev.reduce((s, b) => s + Number(b.total || 0), 0))}`, `共 ${todayRev.length} 筆帳單`, 'billing');
    }

    /* Patient / medical notifications */
    if (settings.patient) {
      const pts = data.patients || [];
      const inactiveDays = settings.inactivePatientDays || 90;
      const inactiveCutoff = new Date(now - inactiveDays * 86400000).toISOString().substring(0, 10);
      const inactive = pts.filter(p => p.lastVisit && p.lastVisit < inactiveCutoff);
      if (inactive.length > 0)
        mk('patient', 'medium', `${inactive.length} 位病人超過${inactiveDays}天未覆診`, inactive.slice(0, 3).map(p => p.name).join('、'), 'patients');
      const newToday = pts.filter(p => p.createdAt && p.createdAt.substring(0, 10) === today);
      if (newToday.length > 0)
        mk('patient', 'low', `今日新增 ${newToday.length} 位病人`, newToday.map(p => p.name).join('、'), 'patients');
      const birthday = pts.filter(p => p.dob && p.dob.substring(5) === today.substring(5));
      if (birthday.length > 0)
        mk('patient', 'low', `${birthday.length} 位病人今日生日`, birthday.map(p => p.name).join('、'), 'patients');
    }

    /* System / operations notifications */
    if (settings.system) {
      const inv = data.inventory || [];
      const pts = data.patients || [];
      mk('system', 'low', '系統運行正常', `庫存 ${inv.length} 項 · 病人 ${pts.length} 位 · 使用者：${user?.name || '未知'}`, null);
    }

    /* HR / admin notifications */
    if (settings.hr) {
      const leaves = data.leaves || [];
      const staff = data.staff || [];
      const todayLeaves = leaves.filter(l => l.status === 'approved' && l.startDate <= today && l.endDate >= today);
      if (todayLeaves.length > 0)
        mk('hr', 'medium', `今日 ${todayLeaves.length} 人請假`, todayLeaves.map(l => l.staffName || l.staff).join('、'), 'leave');
      const pendingLeaves = leaves.filter(l => l.status === 'pending');
      if (pendingLeaves.length > 0)
        mk('hr', 'high', `${pendingLeaves.length} 個假期待審批`, '請儘快處理待審批假期', 'leave');
      if (staff.length > 0)
        mk('hr', 'low', `員工總數 ${staff.length} 人`, staff.map(s => s.name).slice(0, 4).join('、'), 'leave');
    }

    return n;
  }, [data, settings, today, now, user]);

  /* ── Derived: non-dismissed notifications ── */
  const activeNotifications = useMemo(
    () => notifications.filter(n => !dismissedIds.includes(n.id)),
    [notifications, dismissedIds],
  );

  /* ── Filtered & sorted list ── */
  const filtered = useMemo(() => {
    let list = activeNotifications;
    if (activeCategory !== 'all') list = list.filter(n => n.category === activeCategory);
    if (priorityFilter !== 'all') list = list.filter(n => n.priority === priorityFilter);
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter(n => n.title.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q));
    }
    const order = { high: 0, medium: 1, low: 2 };
    return [...list].sort((a, b) => order[a.priority] - order[b.priority] || b.ts - a.ts);
  }, [activeNotifications, activeCategory, priorityFilter, searchQ]);

  /* ── Counts ── */
  const unreadCount = useMemo(
    () => activeNotifications.filter(n => !readIds.includes(n.id)).length,
    [activeNotifications, readIds],
  );

  const priorityCounts = useMemo(() => ({
    high:   activeNotifications.filter(n => n.priority === 'high').length,
    medium: activeNotifications.filter(n => n.priority === 'medium').length,
    low:    activeNotifications.filter(n => n.priority === 'low').length,
  }), [activeNotifications]);

  const catCounts = useMemo(() => {
    const m = {};
    CATEGORIES.forEach(c => {
      if (c.key === 'all') { m.all = activeNotifications.length; return; }
      m[c.key] = activeNotifications.filter(n => n.category === c.key).length;
    });
    return m;
  }, [activeNotifications]);

  /* ── Actions ── */
  const toggleRead = useCallback((id) => {
    const next = readIds.includes(id) ? readIds.filter(r => r !== id) : [...readIds, id];
    saveRead(next);
  }, [readIds, saveRead]);

  const dismissNotification = useCallback((id) => {
    const next = [...new Set([...dismissedIds, id])];
    saveDismissed(next);
    showToast?.('已忽略此通知');
  }, [dismissedIds, saveDismissed, showToast]);

  const restoreAll = useCallback(() => {
    saveDismissed([]);
    showToast?.('已還原所有已忽略通知');
  }, [saveDismissed, showToast]);

  const markAllRead = useCallback(() => {
    const allIds = filtered.map(n => n.id);
    saveRead([...new Set([...readIds, ...allIds])]);
    showToast?.('已全部標為已讀');
  }, [filtered, readIds, saveRead, showToast]);

  const markAllUnread = useCallback(() => {
    const filteredIds = new Set(filtered.map(n => n.id));
    saveRead(readIds.filter(id => !filteredIds.has(id)));
    showToast?.('已全部標為未讀');
  }, [filtered, readIds, saveRead, showToast]);

  const handleNavigate = useCallback(
    (page) => { if (page && onNavigate) onNavigate(page); },
    [onNavigate],
  );

  /* ═══════════════════════════════════════════
     Inline styles (matching project conventions)
     ═══════════════════════════════════════════ */
  const card = {
    background: '#fff', borderRadius: 10, padding: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,.08)',
  };

  /* ═══════════════════════════════════════════
     Render
     ═══════════════════════════════════════════ */
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          通知中心
          {unreadCount > 0 && (
            <span style={{
              display: 'inline-block', padding: '2px 10px', borderRadius: 99,
              fontSize: 12, fontWeight: 700, background: ACCENT, color: '#fff',
            }}>
              {unreadCount} 未讀
            </span>
          )}
        </h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={markAllRead}>全部已讀</button>
          <button className="btn btn-outline btn-sm" onClick={markAllUnread}>全部未讀</button>
          {dismissedIds.length > 0 && (
            <button className="btn btn-outline btn-sm" onClick={restoreAll}>
              還原已忽略 ({dismissedIds.length})
            </button>
          )}
          <button className="btn btn-teal btn-sm" onClick={() => setShowSettings(!showSettings)}>
            {showSettings ? '關閉設定' : '通知設定'}
          </button>
        </div>
      </div>

      {/* ── Priority Summary Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {/* High priority */}
        <div
          onClick={() => setPriorityFilter(priorityFilter === 'high' ? 'all' : 'high')}
          style={{
            ...card,
            padding: '12px 16px',
            cursor: 'pointer',
            borderLeft: '4px solid #dc2626',
            opacity: priorityFilter !== 'all' && priorityFilter !== 'high' ? 0.5 : 1,
            transition: 'all .15s',
            display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: '50%', background: '#fef2f2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#dc2626',
          }}>
            {priorityCounts.high}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>高優先</div>
            <div style={{ fontSize: 11, color: '#999' }}>需立即處理</div>
          </div>
        </div>

        {/* Medium priority */}
        <div
          onClick={() => setPriorityFilter(priorityFilter === 'medium' ? 'all' : 'medium')}
          style={{
            ...card,
            padding: '12px 16px',
            cursor: 'pointer',
            borderLeft: '4px solid #d97706',
            opacity: priorityFilter !== 'all' && priorityFilter !== 'medium' ? 0.5 : 1,
            transition: 'all .15s',
            display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: '50%', background: '#fffbeb',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#d97706',
          }}>
            {priorityCounts.medium}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#d97706' }}>中優先</div>
            <div style={{ fontSize: 11, color: '#999' }}>需要關注</div>
          </div>
        </div>

        {/* Low priority */}
        <div
          onClick={() => setPriorityFilter(priorityFilter === 'low' ? 'all' : 'low')}
          style={{
            ...card,
            padding: '12px 16px',
            cursor: 'pointer',
            borderLeft: '4px solid #9ca3af',
            opacity: priorityFilter !== 'all' && priorityFilter !== 'low' ? 0.5 : 1,
            transition: 'all .15s',
            display: 'flex', alignItems: 'center', gap: 12,
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: '50%', background: '#f9fafb',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#9ca3af',
          }}>
            {priorityCounts.low}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af' }}>低優先</div>
            <div style={{ fontSize: 11, color: '#999' }}>一般資訊</div>
          </div>
        </div>
      </div>

      {/* ── Settings Panel ── */}
      {showSettings && (
        <div style={{ ...card, marginBottom: 16, border: `1px solid ${ACCENT}33` }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: ACCENT }}>通知偏好設定</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
            {CATEGORIES.filter(c => c.key !== 'all').map(c => (
              <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={!!settings[c.key]}
                  onChange={() => saveSettings({ ...settings, [c.key]: !settings[c.key] })}
                />
                <span>{c.icon} {c.label}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {[
              { key: 'lowStockThreshold',    label: '低庫存閾值',     unit: '(預設單位)' },
              { key: 'overdueDays',           label: '逾期天數閾值',   unit: '天' },
              { key: 'pendingBookingHours',   label: '待確認預約提醒', unit: '小時' },
              { key: 'inactivePatientDays',   label: '未覆診提醒',     unit: '天' },
            ].map(f => (
              <div key={f.key} style={{ fontSize: 13 }}>
                <label style={{ fontWeight: 500 }}>{f.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <input
                    type="number"
                    value={settings[f.key] || ''}
                    onChange={e => saveSettings({ ...settings, [f.key]: Number(e.target.value) || 0 })}
                    style={{ width: 80, padding: '4px 6px', borderRadius: 4, border: '1px solid #d1d5db' }}
                  />
                  <span style={{ color: '#888', fontSize: 11 }}>{f.unit}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
            <button
              className="btn btn-outline btn-sm"
              style={{ fontSize: 11 }}
              onClick={() => { saveSettings(DEFAULT_SETTINGS); showToast?.('已重設為預設值'); }}
            >
              重設預設值
            </button>
            <button
              className="btn btn-teal btn-sm"
              style={{ fontSize: 11 }}
              onClick={() => { setShowSettings(false); showToast?.('設定已儲存'); }}
            >
              完成
            </button>
          </div>
        </div>
      )}

      {/* ── Category Filter Bar ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => {
          const isActive = activeCategory === c.key;
          const count = catCounts[c.key] || 0;
          return (
            <button
              key={c.key}
              className={isActive ? 'btn btn-teal btn-sm' : 'btn btn-outline btn-sm'}
              onClick={() => setActiveCategory(c.key)}
              style={isActive ? {} : { borderColor: c.color, color: c.color }}
            >
              {c.icon} {c.label} ({count})
            </button>
          );
        })}
      </div>

      {/* ── Search & Priority Quick-Filter ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="搜尋通知..."
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          style={{
            flex: 1, minWidth: 160, padding: '6px 10px',
            borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13,
          }}
        />
        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
        >
          <option value="all">所有優先級</option>
          <option value="high">高優先</option>
          <option value="medium">中優先</option>
          <option value="low">低優先</option>
        </select>
      </div>

      {/* ── Notification List or Empty State ── */}
      {filtered.length === 0 ? (
        <div style={{
          ...card, textAlign: 'center', padding: '48px 24px',
          color: '#aaa', border: '2px dashed #e5e7eb',
          boxShadow: 'none', background: '#fafafa',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>
            {activeCategory !== 'all' ? (CATEGORY_LOOKUP[activeCategory]?.icon || '') : ''}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#888', marginBottom: 6 }}>
            {searchQ.trim()
              ? '找不到符合的通知'
              : activeCategory !== 'all'
                ? `${CATEGORY_LOOKUP[activeCategory]?.label || ''} 類別暫無通知`
                : '目前沒有任何通知'}
          </div>
          <div style={{ fontSize: 13, color: '#bbb', lineHeight: 1.6 }}>
            {searchQ.trim()
              ? '請嘗試不同的搜尋關鍵字'
              : '所有事項已處理完畢，系統運作正常。'}
          </div>
          {dismissedIds.length > 0 && (
            <button
              className="btn btn-outline btn-sm"
              style={{ marginTop: 16, fontSize: 12 }}
              onClick={restoreAll}
            >
              還原 {dismissedIds.length} 條已忽略通知
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(n => {
            const isRead = readIds.includes(n.id);
            const cat = CATEGORY_LOOKUP[n.category] || CATEGORIES[0];
            const pri = PRIORITY_MAP[n.priority] || PRIORITY_MAP.low;
            const actionLabel = ACTION_LABELS[n.category] || null;

            return (
              <div
                key={n.id}
                style={{
                  ...card,
                  opacity: isRead ? 0.6 : 1,
                  borderLeft: `4px solid ${cat.color}`,
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  cursor: 'pointer', transition: 'all .15s',
                }}
                onClick={() => toggleRead(n.id)}
              >
                {/* Category icon */}
                <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{cat.icon}</div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Top row: priority badge + category + unread dot */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    {/* Priority badge */}
                    <span style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 99,
                      fontSize: 11, fontWeight: 700, background: pri.bg, color: pri.color,
                      letterSpacing: 0.5,
                    }}>
                      {pri.label}優先
                    </span>
                    {/* Category label */}
                    <span style={{ fontSize: 11, color: '#999' }}>{cat.label}</span>
                    {/* Unread indicator */}
                    {!isRead && (
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: ACCENT, display: 'inline-block',
                        boxShadow: `0 0 0 3px ${ACCENT}22`,
                      }} />
                    )}
                  </div>

                  {/* Title */}
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, color: '#1f2937' }}>
                    {n.title}
                  </div>

                  {/* Description */}
                  <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>
                    {n.desc}
                  </div>

                  {/* Action buttons row */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {n.navPage && actionLabel && (
                      <button
                        className="btn btn-teal btn-sm"
                        style={{ fontSize: 11, padding: '3px 10px' }}
                        onClick={e => { e.stopPropagation(); handleNavigate(n.navPage); }}
                      >
                        {actionLabel}
                      </button>
                    )}
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: 11, padding: '3px 10px' }}
                      onClick={e => { e.stopPropagation(); toggleRead(n.id); }}
                    >
                      {isRead ? '標為未讀' : '標為已讀'}
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: 11, padding: '3px 10px', color: '#ef4444', borderColor: '#fca5a5' }}
                      onClick={e => { e.stopPropagation(); dismissNotification(n.id); }}
                    >
                      忽略
                    </button>
                  </div>
                </div>

                {/* Timestamp */}
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <span style={{ fontSize: 10, color: '#bbb', whiteSpace: 'nowrap' }}>
                    {new Date(n.ts).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Summary Footer ── */}
      <div style={{
        ...card, marginTop: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 12, color: '#888', flexWrap: 'wrap', gap: 8,
      }}>
        <span>
          共 {activeNotifications.length} 條通知 · {unreadCount} 條未讀
          {dismissedIds.length > 0 && ` · ${dismissedIds.length} 條已忽略`}
        </span>
        <span>上次更新：{new Date().toLocaleString('zh-HK')}</span>
      </div>
    </div>
  );
}
