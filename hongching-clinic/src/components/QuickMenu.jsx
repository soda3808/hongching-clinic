import { useState } from 'react';

const LS_KEY = 'hcmc_quick_menu';
const MAX = 12;

const ALL_PAGES = [
  { id: 'dash', icon: '📊', label: 'Dashboard', section: '總覽' },
  { id: 'calendar', icon: '📅', label: '我的日曆', section: '總覽' },
  { id: 'rev', icon: '💰', label: '營業紀錄', section: '財務' },
  { id: 'exp', icon: '🧾', label: '開支紀錄', section: '財務' },
  { id: 'scan', icon: '📷', label: '收據掃描', section: '財務' },
  { id: 'arap', icon: '📑', label: '應收應付', section: '財務' },
  { id: 'patient', icon: '👥', label: '病人管理', section: '病人' },
  { id: 'feedback', icon: '⭐', label: '顧客評分', section: '病人' },
  { id: 'booking', icon: '📅', label: '預約系統', section: '病人' },
  { id: 'queue', icon: '🎫', label: '掛號排隊', section: '病人' },
  { id: 'emr', icon: '🏥', label: '電子病歷', section: '病人' },
  { id: 'formulas', icon: '💊', label: '我的處方', section: '病人' },
  { id: 'rxhistory', icon: '📜', label: '處方報表', section: '病人' },
  { id: 'vitals', icon: '❤️', label: '健康資訊', section: '病人' },
  { id: 'package', icon: '🎫', label: '套餐/會員', section: '病人' },
  { id: 'voucher', icon: '🧓', label: '長者醫療券', section: '病人' },
  { id: 'sickleave', icon: '📄', label: '假紙記錄', section: '病人' },
  { id: 'crm', icon: '💬', label: 'WhatsApp CRM', section: '客戶' },
  { id: 'msgtpl', icon: '✉️', label: '訊息範本', section: '客戶' },
  { id: 'inventory', icon: '💊', label: '藥材庫存', section: '營運' },
  { id: 'medscan', icon: '📦', label: '採購掃描', section: '營運' },
  { id: 'purchase', icon: '📦', label: '進貨管理', section: '營運' },
  { id: 'billing', icon: '💵', label: '配藥/收費', section: '營運' },
  { id: 'dispensing', icon: '📋', label: '開藥日誌', section: '營運' },
  { id: 'rxprint', icon: '🖨️', label: '處方列印', section: '營運' },
  { id: 'regqueue', icon: '🏥', label: '掛號列表', section: '營運' },
  { id: 'consultlist', icon: '🩺', label: '診症列表', section: '營運' },
  { id: 'products', icon: '🛍️', label: '商品管理', section: '營運' },
  { id: 'closing', icon: '🧮', label: '日結對賬', section: '營運' },
  { id: 'advice', icon: '📝', label: '醫囑管理', section: '營運' },
  { id: 'discount', icon: '🏷️', label: '折扣設定', section: '營運' },
  { id: 'pay', icon: '📋', label: '糧單', section: '人事' },
  { id: 'schedule', icon: '🕐', label: '醫師排班', section: '人事' },
  { id: 'leave', icon: '🏖️', label: '假期管理', section: '人事' },
  { id: 'doc', icon: '👨‍⚕️', label: '醫師業績', section: '分析' },
  { id: 'report', icon: '📈', label: '報表中心', section: '分析' },
  { id: 'ai', icon: '🤖', label: 'AI 助手', section: '分析' },
  { id: 'compare', icon: '🏢', label: '分店對比', section: '分析' },
  { id: 'survey', icon: '📋', label: '滿意度調查', section: '分析' },
  { id: 'ehealth', icon: '🏛️', label: '醫健通', section: '系統' },
  { id: 'syscheck', icon: '🔧', label: '系統檢查', section: '系統' },
  { id: 'backup', icon: '💾', label: '數據備份', section: '系統' },
];

const DEFAULTS = ['dash', 'booking', 'patient', 'emr', 'billing', 'closing'];
const load = () => { try { const d = JSON.parse(localStorage.getItem(LS_KEY)); return Array.isArray(d) ? d : DEFAULTS; } catch { return DEFAULTS; } };
const persist = (s) => localStorage.setItem(LS_KEY, JSON.stringify(s));

const S = {
  page: { padding: 16, maxWidth: 720, margin: '0 auto' },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#0e7490' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 },
  cell: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0002', padding: '16px 8px', textAlign: 'center', cursor: 'pointer', transition: 'transform .15s', border: '2px solid transparent' },
  cellHover: { borderColor: '#0e7490' },
  icon: { fontSize: 28, marginBottom: 4 },
  lbl: { fontSize: 12, fontWeight: 600, color: '#334155', lineHeight: 1.3 },
  btn: { padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#0e7490', color: '#fff' },
  btnOutline: { padding: '7px 16px', borderRadius: 6, border: '1px solid #0e7490', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#fff', color: '#0e7490' },
  section: { fontSize: 13, fontWeight: 700, color: '#64748b', margin: '14px 0 6px', borderBottom: '1px solid #e5e7eb', paddingBottom: 4 },
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#fff', borderRadius: 8, marginBottom: 4, boxShadow: '0 1px 3px #0001' },
  mini: { padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, color: '#fff', background: '#0e7490' },
};

export default function QuickMenu({ showToast, user, onNavigate }) {
  const [shortcuts, setShortcuts] = useState(load);
  const [editing, setEditing] = useState(false);

  const update = (next) => { setShortcuts(next); persist(next); };
  const addShortcut = (id) => {
    if (shortcuts.includes(id)) return showToast?.('已在捷徑列表中');
    if (shortcuts.length >= MAX) return showToast?.(`最多 ${MAX} 個捷徑`);
    update([...shortcuts, id]);
  };
  const removeShortcut = (id) => update(shortcuts.filter(s => s !== id));
  const moveUp = (i) => { if (i === 0) return; const n = [...shortcuts]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; update(n); };
  const moveDown = (i) => { if (i >= shortcuts.length - 1) return; const n = [...shortcuts]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; update(n); };
  const pageMap = Object.fromEntries(ALL_PAGES.map(p => [p.id, p]));
  const sections = [...new Set(ALL_PAGES.map(p => p.section))];

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={S.title}>快捷選單</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={editing ? S.btn : S.btnOutline} onClick={() => setEditing(!editing)}>
            {editing ? '完成' : '編輯'}
          </button>
          {editing && <button style={{ ...S.btnOutline, color: '#dc2626', borderColor: '#dc2626' }} onClick={() => { update(DEFAULTS); showToast?.('已重置為預設'); }}>重置</button>}
        </div>
      </div>

      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
        {editing ? `點擊下方頁面添加到捷徑（${shortcuts.length}/${MAX}）` : '點擊捷徑快速導航'}
      </p>

      {/* Shortcuts Grid */}
      {!editing && (
        <div style={S.grid}>
          {shortcuts.map(id => {
            const p = pageMap[id];
            if (!p) return null;
            return (
              <div key={id} style={S.cell} onClick={() => onNavigate?.(id)}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#0e7490'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
                <div style={S.icon}>{p.icon}</div>
                <div style={S.lbl}>{p.label}</div>
              </div>
            );
          })}
          {shortcuts.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#94a3b8', padding: 32 }}>暫無捷徑，點擊「編輯」添加</div>}
        </div>
      )}

      {/* Edit Mode: reorder list */}
      {editing && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 8 }}>我的捷徑</div>
          {shortcuts.map((id, i) => {
            const p = pageMap[id];
            if (!p) return null;
            return (
              <div key={id} style={S.row}>
                <span style={{ fontSize: 18 }}>{p.icon}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{p.label}</span>
                <button style={{ ...S.mini, background: '#e5e7eb', color: '#333' }} disabled={i === 0} onClick={() => moveUp(i)}>上移</button>
                <button style={{ ...S.mini, background: '#e5e7eb', color: '#333' }} disabled={i === shortcuts.length - 1} onClick={() => moveDown(i)}>下移</button>
                <button style={{ ...S.mini, background: '#fee2e2', color: '#dc2626' }} onClick={() => removeShortcut(id)}>移除</button>
              </div>
            );
          })}
          {shortcuts.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>暫無捷徑</div>}
        </div>
      )}

      {/* Available pages grouped by section */}
      {editing && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 8 }}>可用頁面</div>
          {sections.map(sec => {
            const pages = ALL_PAGES.filter(p => p.section === sec);
            return (
              <div key={sec}>
                <div style={S.section}>{sec}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {pages.map(p => {
                    const added = shortcuts.includes(p.id);
                    return (
                      <button key={p.id} onClick={() => added ? removeShortcut(p.id) : addShortcut(p.id)}
                        style={{ ...S.mini, background: added ? '#0e7490' : '#f1f5f9', color: added ? '#fff' : '#334155', border: '1px solid ' + (added ? '#0e7490' : '#cbd5e1'), padding: '5px 10px' }}>
                        {p.icon} {p.label} {added ? '✓' : '+'}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
