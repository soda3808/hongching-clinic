import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_compliance_items';
const ACCENT = '#0e7490';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

const CATEGORIES = [
  { key: 'CMCHK', label: '中醫藥管理委員會' },
  { key: 'DH', label: '衛生署' },
  { key: 'PDPO', label: '私隱條例' },
  { key: 'FIRE', label: '消防條例' },
  { key: 'LABOUR', label: '勞工法例' },
  { key: 'BR', label: '商業登記' },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c.label]));
const STATUSES = ['合規', '部分合規', '不合規', '待檢查'];
const STATUS_COLOR = { '合規': '#059669', '部分合規': '#d97706', '不合規': '#dc2626', '待檢查': '#6366f1' };

const SEED = [
  { id: uid(), name: '中醫執業資格', category: 'CMCHK', status: '合規', expiryDate: '2026-12-31', renewalDate: '2026-10-01', responsiblePerson: '診所主管', documentRef: 'CMCHK-REG-001', notes: '', lastChecked: '2026-01-15' },
  { id: uid(), name: '持續進修學分', category: 'CMCHK', status: '部分合規', expiryDate: '2026-06-30', renewalDate: '2026-04-01', responsiblePerson: '各中醫師', documentRef: 'CMCHK-CME-001', notes: '部分醫師學分未達標', lastChecked: '2026-01-15' },
  { id: uid(), name: '診所登記', category: 'DH', status: '合規', expiryDate: '2027-03-31', renewalDate: '2027-01-01', responsiblePerson: '行政主任', documentRef: 'DH-CL-001', notes: '', lastChecked: '2026-02-01' },
  { id: uid(), name: '藥物儲存規定', category: 'DH', status: '合規', expiryDate: '', renewalDate: '', responsiblePerson: '藥房主管', documentRef: 'DH-DS-001', notes: '持續合規', lastChecked: '2026-02-01' },
  { id: uid(), name: '感染控制', category: 'DH', status: '待檢查', expiryDate: '', renewalDate: '', responsiblePerson: '護理主管', documentRef: 'DH-IC-001', notes: '待年度檢查', lastChecked: '2025-12-01' },
  { id: uid(), name: '個人資料保護', category: 'PDPO', status: '合規', expiryDate: '', renewalDate: '', responsiblePerson: '私隱專員', documentRef: 'PDPO-DP-001', notes: '', lastChecked: '2026-01-20' },
  { id: uid(), name: '同意書管理', category: 'PDPO', status: '部分合規', expiryDate: '', renewalDate: '', responsiblePerson: '行政主任', documentRef: 'PDPO-CF-001', notes: '部分同意書需更新', lastChecked: '2026-01-20' },
  { id: uid(), name: '消防證書', category: 'FIRE', status: '合規', expiryDate: '2026-08-15', renewalDate: '2026-06-15', responsiblePerson: '物業管理', documentRef: 'FS-CERT-001', notes: '', lastChecked: '2026-02-10' },
  { id: uid(), name: '走火演習', category: 'FIRE', status: '待檢查', expiryDate: '2026-05-01', renewalDate: '2026-04-01', responsiblePerson: '安全主任', documentRef: 'FS-DRILL-001', notes: '每半年一次', lastChecked: '2025-11-01' },
  { id: uid(), name: '僱傭合約', category: 'LABOUR', status: '合規', expiryDate: '', renewalDate: '', responsiblePerson: 'HR 主管', documentRef: 'LAB-EC-001', notes: '', lastChecked: '2026-01-05' },
  { id: uid(), name: '強積金', category: 'LABOUR', status: '合規', expiryDate: '', renewalDate: '', responsiblePerson: 'HR 主管', documentRef: 'LAB-MPF-001', notes: '', lastChecked: '2026-01-05' },
  { id: uid(), name: '僱員補償', category: 'LABOUR', status: '合規', expiryDate: '2026-09-30', renewalDate: '2026-08-01', responsiblePerson: 'HR 主管', documentRef: 'LAB-EC-002', notes: '', lastChecked: '2026-02-01' },
  { id: uid(), name: '商業登記證', category: 'BR', status: '合規', expiryDate: '2027-04-01', renewalDate: '2027-02-01', responsiblePerson: '行政主任', documentRef: 'BR-CERT-001', notes: '', lastChecked: '2026-02-01' },
  { id: uid(), name: '公司註冊', category: 'BR', status: '合規', expiryDate: '', renewalDate: '', responsiblePerson: '行政主任', documentRef: 'BR-CR-001', notes: '', lastChecked: '2026-02-01' },
];

const load = () => { try { const d = JSON.parse(localStorage.getItem(LS_KEY)); return Array.isArray(d) && d.length ? d : SEED; } catch { return SEED; } };
const save = items => { try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch {} };
const today = () => new Date().toISOString().slice(0, 10);
const daysUntil = d => { if (!d) return Infinity; return Math.ceil((new Date(d) - new Date(today())) / 86400000); };

const sCard = { background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 12 };
const sBtn = { padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const sPrimary = { ...sBtn, background: ACCENT, color: '#fff' };
const sOutline = { ...sBtn, background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}` };
const sInput = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const sTh = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#475569', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' };
const sTd = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
const sBadge = (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#fff', background: color });

export default function ClinicCompliance({ data, showToast, user }) {
  const [items, setItems] = useState(load);
  const [tab, setTab] = useState('dashboard');
  const [catFilter, setCatFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const persist = next => { setItems(next); save(next); };

  /* ── Dashboard metrics ── */
  const score = useMemo(() => {
    if (!items.length) return 0;
    const w = { '合規': 1, '部分合規': 0.5, '不合規': 0, '待檢查': 0 };
    return Math.round(items.reduce((s, i) => s + (w[i.status] || 0), 0) / items.length * 100);
  }, [items]);

  const countByStatus = useMemo(() => {
    const m = {};
    STATUSES.forEach(s => { m[s] = items.filter(i => i.status === s).length; });
    return m;
  }, [items]);

  const expiringSoon = useMemo(() => items.filter(i => { const d = daysUntil(i.expiryDate); return d >= 0 && d <= 90; }).sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate)), [items]);

  const actionItems = useMemo(() => items.filter(i => i.status === '不合規' || i.status === '待檢查'), [items]);

  const filtered = useMemo(() => items.filter(i => (catFilter === 'ALL' || i.category === catFilter) && (statusFilter === 'ALL' || i.status === statusFilter)), [items, catFilter, statusFilter]);

  /* ── CRUD ── */
  const openAdd = () => { setForm({ id: '', name: '', category: 'CMCHK', status: '待檢查', expiryDate: '', renewalDate: '', responsiblePerson: '', documentRef: '', notes: '', lastChecked: today() }); setEditing('NEW'); };
  const openEdit = item => { setForm({ ...item }); setEditing(item.id); };
  const saveItem = () => {
    if (!form.name) { showToast?.('請輸入項目名稱'); return; }
    let next;
    if (editing === 'NEW') { next = [{ ...form, id: uid() }, ...items]; } else { next = items.map(i => i.id === editing ? { ...form } : i); }
    persist(next); setEditing(null); showToast?.('已儲存');
  };
  const deleteItem = id => { if (!window.confirm('確定刪除此合規項目？')) return; persist(items.filter(i => i.id !== id)); showToast?.('已刪除'); };

  /* ── Print ── */
  const printReport = () => {
    const clinic = getClinicName();
    const rows = items.map(i => `<tr><td>${i.name}</td><td>${CAT_MAP[i.category] || i.category}</td><td>${i.status}</td><td>${i.expiryDate || '-'}</td><td>${i.responsiblePerson || '-'}</td><td>${i.notes || '-'}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>合規報告</title>
<style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px;text-align:left}th{background:#f0fdfa;font-weight:700}.hdr{color:${ACCENT}}.score{font-size:28px;font-weight:700;color:${ACCENT}}.footer{margin-top:24px;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:8px}@media print{body{padding:0}}</style></head>
<body><h2 class="hdr">${clinic} - 法規合規報告</h2><p>列印日期：${new Date().toLocaleDateString('zh-HK')}</p>
<p>整體合規評分：<span class="score">${score}%</span></p>
<table><thead><tr><th>項目</th><th>類別</th><th>狀態</th><th>到期日</th><th>負責人</th><th>備註</th></tr></thead><tbody>${rows}</tbody></table>
<div class="footer"><p>${clinic} - 法規合規管理</p></div>
<script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  };

  /* ── Suggested action text ── */
  const suggestAction = item => {
    if (item.status === '不合規') return '需立即跟進，聯絡負責人處理';
    if (item.status === '待檢查') return '安排檢查/審核日期';
    const d = daysUntil(item.expiryDate);
    if (d <= 30) return '即將到期，請盡快安排續期';
    if (d <= 60) return '將於兩個月內到期，開始準備續期';
    if (d <= 90) return '三個月內到期，列入續期計劃';
    return '';
  };

  /* ── Tabs ── */
  const TABS = [
    { key: 'dashboard', label: '合規總覽' },
    { key: 'items', label: '合規項目' },
    { key: 'alerts', label: '到期提醒' },
    { key: 'actions', label: '待辦事項' },
    { key: 'calendar', label: '合規日曆' },
  ];

  /* ── Form modal ── */
  const renderForm = () => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 480, maxHeight: '85vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 16px', color: ACCENT }}>{editing === 'NEW' ? '新增合規項目' : '編輯合規項目'}</h3>
        {[
          ['name', '項目名稱', 'text'],
          ['documentRef', '文件編號', 'text'],
          ['responsiblePerson', '負責人', 'text'],
          ['expiryDate', '到期日', 'date'],
          ['renewalDate', '續期日', 'date'],
          ['lastChecked', '最後檢查日期', 'date'],
        ].map(([k, l, t]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{l}</label>
            <input style={sInput} type={t} value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} />
          </div>
        ))}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>類別</label>
          <select style={sInput} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>狀態</label>
          <select style={sInput} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>備註</label>
          <textarea style={{ ...sInput, minHeight: 50 }} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={sOutline} onClick={() => setEditing(null)}>取消</button>
          <button style={sPrimary} onClick={saveItem}>儲存</button>
        </div>
      </div>
    </div>
  );

  /* ── Dashboard tab ── */
  const renderDashboard = () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ ...sCard, textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: score >= 80 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626' }}>{score}%</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>整體合規評分</div>
        </div>
        {STATUSES.map(s => (
          <div key={s} style={{ ...sCard, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: STATUS_COLOR[s] }}>{countByStatus[s]}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{s}</div>
          </div>
        ))}
      </div>
      {/* Category breakdown */}
      <div style={sCard}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: ACCENT }}>各類別合規狀態</h3>
        {CATEGORIES.map(cat => {
          const catItems = items.filter(i => i.category === cat.key);
          const ok = catItems.filter(i => i.status === '合規').length;
          const pct = catItems.length ? Math.round(ok / catItems.length * 100) : 0;
          return (
            <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ width: 140, fontSize: 13, fontWeight: 600 }}>{cat.label}</span>
              <div style={{ flex: 1, height: 14, background: '#e2e8f0', borderRadius: 7, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626', borderRadius: 7, transition: 'width .3s' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, width: 40, textAlign: 'right' }}>{pct}%</span>
              <span style={{ fontSize: 11, color: '#94a3b8', width: 50 }}>{ok}/{catItems.length}</span>
            </div>
          );
        })}
      </div>
      {/* Upcoming expirations */}
      {expiringSoon.length > 0 && (
        <div style={sCard}>
          <h3 style={{ margin: '0 0 10px', fontSize: 15, color: '#dc2626' }}>即將到期項目</h3>
          {expiringSoon.slice(0, 5).map(i => {
            const d = daysUntil(i.expiryDate);
            return (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 13 }}>{i.name} <span style={{ color: '#94a3b8', fontSize: 11 }}>({CAT_MAP[i.category]})</span></span>
                <span style={{ ...sBadge(d <= 30 ? '#dc2626' : d <= 60 ? '#d97706' : '#0891b2'), fontSize: 11 }}>{d} 天後到期</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  /* ── Items tab ── */
  const renderItems = () => (
    <div style={sCard}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <select style={{ ...sInput, width: 'auto', minWidth: 130 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="ALL">全部類別</option>
          {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select style={{ ...sInput, width: 'auto', minWidth: 100 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="ALL">全部狀態</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button style={sPrimary} onClick={openAdd}>+ 新增項目</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['項目', '類別', '狀態', '到期日', '負責人', '文件編號', '最後檢查', '操作'].map(h => <th key={h} style={sTh}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} style={{ ...sTd, textAlign: 'center', color: '#94a3b8' }}>沒有合規項目</td></tr>}
            {filtered.map(i => (
              <tr key={i.id}>
                <td style={sTd}>{i.name}</td>
                <td style={sTd}>{CAT_MAP[i.category] || i.category}</td>
                <td style={sTd}><span style={sBadge(STATUS_COLOR[i.status] || '#6b7280')}>{i.status}</span></td>
                <td style={sTd}>{i.expiryDate || '-'}</td>
                <td style={sTd}>{i.responsiblePerson || '-'}</td>
                <td style={sTd}>{i.documentRef || '-'}</td>
                <td style={sTd}>{i.lastChecked || '-'}</td>
                <td style={{ ...sTd, whiteSpace: 'nowrap' }}>
                  <button style={{ ...sBtn, color: ACCENT, background: 'none', padding: '2px 6px' }} onClick={() => openEdit(i)}>編輯</button>
                  <button style={{ ...sBtn, color: '#dc2626', background: 'none', padding: '2px 6px' }} onClick={() => deleteItem(i.id)}>刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  /* ── Alerts tab (30/60/90 day bands) ── */
  const renderAlerts = () => {
    const bands = [
      { label: '30 天內到期', max: 30, color: '#dc2626' },
      { label: '31–60 天內到期', min: 31, max: 60, color: '#d97706' },
      { label: '61–90 天內到期', min: 61, max: 90, color: '#0891b2' },
    ];
    return bands.map(b => {
      const list = items.filter(i => { const d = daysUntil(i.expiryDate); return d >= (b.min || 0) && d <= b.max; });
      return (
        <div key={b.label} style={{ ...sCard, borderLeft: `4px solid ${b.color}` }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: b.color }}>{b.label} ({list.length})</h4>
          {list.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>沒有項目</p>}
          {list.map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
              <span>{i.name} <span style={{ color: '#94a3b8', fontSize: 11 }}>({CAT_MAP[i.category]})</span></span>
              <span style={{ color: b.color, fontWeight: 600 }}>{i.expiryDate} ({daysUntil(i.expiryDate)} 天)</span>
            </div>
          ))}
        </div>
      );
    });
  };

  /* ── Actions tab ── */
  const renderActions = () => (
    <div style={sCard}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15, color: ACCENT }}>待跟進事項 ({actionItems.length})</h3>
      {actionItems.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13 }}>目前沒有需要跟進的合規事項</p>}
      {actionItems.map(i => (
        <div key={i.id} style={{ padding: 12, marginBottom: 8, background: '#fefce8', borderRadius: 8, borderLeft: `4px solid ${STATUS_COLOR[i.status]}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <strong style={{ fontSize: 14 }}>{i.name}</strong>
            <span style={sBadge(STATUS_COLOR[i.status])}>{i.status}</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>類別：{CAT_MAP[i.category]} | 負責人：{i.responsiblePerson || '-'}</div>
          <div style={{ fontSize: 13, color: '#92400e' }}>建議行動：{suggestAction(i)}</div>
          {i.notes && <div style={{ fontSize: 12, color: '#78716c', marginTop: 4 }}>備註：{i.notes}</div>}
        </div>
      ))}
    </div>
  );

  /* ── Calendar tab ── */
  const renderCalendar = () => {
    const dated = items.filter(i => i.expiryDate || i.renewalDate).flatMap(i => {
      const out = [];
      if (i.expiryDate) out.push({ ...i, dateVal: i.expiryDate, type: '到期' });
      if (i.renewalDate) out.push({ ...i, dateVal: i.renewalDate, type: '續期' });
      return out;
    }).sort((a, b) => a.dateVal.localeCompare(b.dateVal));
    const grouped = {};
    dated.forEach(d => { const m = d.dateVal.slice(0, 7); (grouped[m] = grouped[m] || []).push(d); });
    return Object.entries(grouped).map(([month, list]) => (
      <div key={month} style={{ ...sCard, borderLeft: `4px solid ${ACCENT}` }}>
        <h4 style={{ margin: '0 0 8px', color: ACCENT }}>{month}</h4>
        {list.map((d, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
            <span style={{ width: 90, color: '#64748b' }}>{d.dateVal}</span>
            <span style={sBadge(d.type === '到期' ? '#dc2626' : '#059669')}>{d.type}</span>
            <span style={{ flex: 1 }}>{d.name}</span>
            <span style={{ color: '#94a3b8', fontSize: 11 }}>{CAT_MAP[d.category]}</span>
          </div>
        ))}
      </div>
    ));
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ color: ACCENT, margin: 0 }}>法規合規管理</h2>
        <button style={sOutline} onClick={printReport}>列印合規報告</button>
      </div>
      <p style={{ color: '#888', marginTop: 0, marginBottom: 16, fontSize: 14 }}>追蹤及管理診所各項法規合規要求</p>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: tab === t.key ? ACCENT : '#64748b', borderBottom: tab === t.key ? `2px solid ${ACCENT}` : '2px solid transparent', marginBottom: -2 }}>{t.label}</button>
        ))}
      </div>
      {tab === 'dashboard' && renderDashboard()}
      {tab === 'items' && renderItems()}
      {tab === 'alerts' && renderAlerts()}
      {tab === 'actions' && renderActions()}
      {tab === 'calendar' && renderCalendar()}
      {editing !== null && renderForm()}
    </div>
  );
}
