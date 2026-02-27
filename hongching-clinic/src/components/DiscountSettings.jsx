import { useState, useMemo } from 'react';
import { getStoreNames } from '../data';

const LS_RULES = 'hcmc_discount_rules';
const LS_HISTORY = 'hcmc_discount_history';
const ACCENT = '#0e7490';
const TYPES = ['百分比折扣', '固定金額折扣', '滿額折扣', '會員折扣'];
const TARGETS = ['全部顧客', '長者(65+)', '會員', '員工', 'VIP顧客', '自訂'];
const SERVICES = ['全部', '診金', '藥費', '治療費', '商品'];
const PRESETS = [
  { name: '長者9折', type: '百分比折扣', value: 10, target: '長者(65+)', service: '全部' },
  { name: '員工8折', type: '百分比折扣', value: 20, target: '員工', service: '全部' },
  { name: '首次診症95折', type: '百分比折扣', value: 5, target: '全部顧客', service: '診金' },
];

function loadJSON(key, fallback = []) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

const btn = (bg = ACCENT) => ({ padding: '6px 16px', background: bg, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 });
const input = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' };
const label = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 2, display: 'block' };
const card = { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)' };

function calcPreview(type, value) {
  const orig = 350;
  if (type === '百分比折扣') { const final = Math.round(orig * (100 - value) / 100); return `原價 $${orig} → 折後 $${final} (${100 - value}折)`; }
  if (type === '固定金額折扣') { return `原價 $${orig} → 折後 $${orig - value} (減$${value})`; }
  if (type === '滿額折扣') { return `滿 $${value} 可享折扣`; }
  return `原價 $${orig} → 會員折扣`;
}

const EMPTY = { name: '', type: '百分比折扣', value: '', target: '全部顧客', service: '全部', store: '全部', startDate: '', endDate: '', active: true, priority: 0 };

export default function DiscountSettings({ data, showToast, user }) {
  const stores = getStoreNames();
  const [tab, setTab] = useState('rules');
  const [rules, setRules] = useState(() => loadJSON(LS_RULES));
  const [history] = useState(() => loadJSON(LS_HISTORY));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);

  const saveRules = (r) => { setRules(r); saveJSON(LS_RULES, r); };

  const handleSave = () => {
    if (!form.name) { showToast('請輸入規則名稱', 'error'); return; }
    if (!form.value && form.type !== '會員折扣') { showToast('請輸入折扣值', 'error'); return; }
    if (editId) {
      saveRules(rules.map(r => r.id === editId ? { ...form, id: editId } : r));
      showToast('規則已更新');
    } else {
      const maxP = rules.length ? Math.max(...rules.map(r => r.priority || 0)) + 1 : 1;
      saveRules([...rules, { ...form, id: uid(), priority: maxP }]);
      showToast('規則已新增');
    }
    setShowForm(false); setEditId(null); setForm({ ...EMPTY });
  };

  const handleEdit = (r) => { setForm({ ...r }); setEditId(r.id); setShowForm(true); };
  const handleDelete = (id) => { saveRules(rules.filter(r => r.id !== id)); showToast('規則已刪除'); };
  const toggleActive = (id) => saveRules(rules.map(r => r.id === id ? { ...r, active: !r.active } : r));
  const movePriority = (id, dir) => {
    const sorted = [...rules].sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const idx = sorted.findIndex(r => r.id === id);
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === sorted.length - 1)) return;
    const swap = sorted[idx + dir];
    const updated = rules.map(r => {
      if (r.id === id) return { ...r, priority: swap.priority };
      if (r.id === swap.id) return { ...r, priority: sorted[idx].priority };
      return r;
    });
    saveRules(updated);
  };

  const addPreset = (p) => {
    const maxP = rules.length ? Math.max(...rules.map(r => r.priority || 0)) + 1 : 1;
    saveRules([...rules, { ...EMPTY, ...p, id: uid(), active: true, priority: maxP, store: '全部' }]);
    showToast(`已新增「${p.name}」`);
  };

  const sortedRules = useMemo(() => [...rules].sort((a, b) => (a.priority || 0) - (b.priority || 0)), [rules]);

  const stats = useMemo(() => {
    const now = new Date(); const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthHist = history.filter(h => (h.date || '').startsWith(ym));
    const totalDiscount = monthHist.reduce((s, h) => s + Number(h.discountAmount || 0), 0);
    const avgPct = monthHist.length ? (monthHist.reduce((s, h) => s + (Number(h.discountAmount || 0) / Math.max(Number(h.originalPrice || 1), 1)) * 100, 0) / monthHist.length).toFixed(1) : 0;
    const ruleCount = {}; monthHist.forEach(h => { ruleCount[h.ruleName] = (ruleCount[h.ruleName] || 0) + 1; });
    const topRule = Object.entries(ruleCount).sort((a, b) => b[1] - a[1])[0];
    return { count: monthHist.length, totalDiscount, avgPct, topRule: topRule ? topRule[0] : '-' };
  }, [history]);

  const tabBtn = (t) => ({
    padding: '8px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', border: 'none',
    borderBottom: tab === t ? `3px solid ${ACCENT}` : '3px solid transparent',
    color: tab === t ? ACCENT : '#6b7280', background: 'transparent',
  });

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: '本月折扣次數', value: stats.count },
          { label: '折扣總額', value: `$${stats.totalDiscount.toLocaleString()}` },
          { label: '平均折扣 %', value: `${stats.avgPct}%` },
          { label: '最常用規則', value: stats.topRule },
        ].map((s, i) => (
          <div key={i} style={{ ...card, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: ACCENT, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        <button style={tabBtn('rules')} onClick={() => setTab('rules')}>折扣規則</button>
        <button style={tabBtn('history')} onClick={() => setTab('history')}>折扣歷史</button>
      </div>

      {/* Rules Tab */}
      {tab === 'rules' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={btn()} onClick={() => { setForm({ ...EMPTY }); setEditId(null); setShowForm(true); }}>+ 新增規則</button>
            <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>快速範本：</span>
            {PRESETS.map((p, i) => (
              <button key={i} style={{ ...btn('#f0f9ff'), color: ACCENT, border: `1px solid ${ACCENT}` }} onClick={() => addPreset(p)}>{p.name}</button>
            ))}
          </div>

          {showForm && (
            <div style={{ ...card, marginBottom: 16, border: `1px solid ${ACCENT}33` }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: ACCENT }}>{editId ? '編輯規則' : '新增規則'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div><span style={label}>規則名稱</span><input style={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div><span style={label}>折扣類型</span><select style={input} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><span style={label}>折扣值 {form.type === '百分比折扣' ? '(%)' : '($)'}</span><input style={input} type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></div>
                <div><span style={label}>適用對象</span><select style={input} value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}>{TARGETS.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><span style={label}>適用服務</span><select style={input} value={form.service} onChange={e => setForm({ ...form, service: e.target.value })}>{SERVICES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><span style={label}>適用店舖</span><select style={input} value={form.store} onChange={e => setForm({ ...form, store: e.target.value })}><option>全部</option>{stores.map(s => <option key={s}>{s}</option>)}</select></div>
                <div><span style={label}>開始日期</span><input style={input} type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
                <div><span style={label}>結束日期</span><input style={input} type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
                <div style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
                  <span style={label}>啟用</span>
                  <button style={{ ...btn(form.active ? '#16a34a' : '#9ca3af'), padding: '7px 18px' }} onClick={() => setForm({ ...form, active: !form.active })}>{form.active ? '啟用中' : '停用'}</button>
                </div>
              </div>
              {form.type && form.value && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, fontSize: 13, color: '#15803d' }}>
                  折扣預覽：{calcPreview(form.type, Number(form.value))}
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button style={btn()} onClick={handleSave}>儲存</button>
                <button style={btn('#6b7280')} onClick={() => { setShowForm(false); setEditId(null); }}>取消</button>
              </div>
            </div>
          )}

          {/* Rules Table */}
          <div style={{ ...card, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  {['優先', '規則名稱', '類型', '折扣值', '對象', '服務', '店舖', '有效期', '狀態', '操作'].map(h => (
                    <th key={h} style={{ padding: '8px 6px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRules.length === 0 && <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>尚未新增折扣規則</td></tr>}
                {sortedRules.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: r.active ? 1 : 0.5 }}>
                    <td style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>
                      <button style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14 }} onClick={() => movePriority(r.id, -1)}>▲</button>
                      <button style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14 }} onClick={() => movePriority(r.id, 1)}>▼</button>
                    </td>
                    <td style={{ padding: '6px', fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: '6px' }}>{r.type}</td>
                    <td style={{ padding: '6px' }}>{r.type === '百分比折扣' ? `${r.value}%` : `$${r.value}`}</td>
                    <td style={{ padding: '6px' }}>{r.target}</td>
                    <td style={{ padding: '6px' }}>{r.service}</td>
                    <td style={{ padding: '6px' }}>{r.store}</td>
                    <td style={{ padding: '6px', fontSize: 11 }}>{r.startDate || '-'} ~ {r.endDate || '-'}</td>
                    <td style={{ padding: '6px' }}>
                      <span onClick={() => toggleActive(r.id)} style={{ cursor: 'pointer', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: r.active ? '#dcfce7' : '#f3f4f6', color: r.active ? '#16a34a' : '#9ca3af' }}>
                        {r.active ? '啟用' : '停用'}
                      </span>
                    </td>
                    <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                      <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: ACCENT, fontWeight: 600, fontSize: 12 }} onClick={() => handleEdit(r)}>編輯</button>
                      <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 600, fontSize: 12, marginLeft: 4 }} onClick={() => handleDelete(r.id)}>刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div style={{ ...card, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                {['日期', '顧客名', '適用規則', '原價', '折後價', '折扣金額', '操作人'].map(h => (
                  <th key={h} style={{ padding: '8px 6px', borderBottom: '1px solid #e5e7eb', color: '#6b7280', fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>尚無折扣記錄</td></tr>}
              {history.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((h, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '6px' }}>{h.date}</td>
                  <td style={{ padding: '6px' }}>{h.customerName}</td>
                  <td style={{ padding: '6px' }}>{h.ruleName}</td>
                  <td style={{ padding: '6px' }}>${h.originalPrice}</td>
                  <td style={{ padding: '6px', color: '#16a34a', fontWeight: 600 }}>${h.finalPrice}</td>
                  <td style={{ padding: '6px', color: '#dc2626' }}>-${h.discountAmount}</td>
                  <td style={{ padding: '6px' }}>{h.operator}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
