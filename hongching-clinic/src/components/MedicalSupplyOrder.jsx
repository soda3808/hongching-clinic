import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_supply_order';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

const CATALOG = [
  { name: '針灸針 (0.25×40mm)', unit: '盒', defaultPrice: 45, minStock: 10, category: '針灸' },
  { name: '針灸針 (0.30×50mm)', unit: '盒', defaultPrice: 48, minStock: 10, category: '針灸' },
  { name: '針灸針 (0.35×75mm)', unit: '盒', defaultPrice: 52, minStock: 5, category: '針灸' },
  { name: '拔罐杯 (玻璃)', unit: '個', defaultPrice: 35, minStock: 20, category: '拔罐' },
  { name: '拔罐杯 (矽膠)', unit: '個', defaultPrice: 28, minStock: 15, category: '拔罐' },
  { name: '棉球 (無菌)', unit: '包', defaultPrice: 12, minStock: 30, category: '敷料' },
  { name: '酒精 (75%)', unit: '瓶', defaultPrice: 18, minStock: 20, category: '消毒' },
  { name: '碘伏消毒液', unit: '瓶', defaultPrice: 22, minStock: 10, category: '消毒' },
  { name: '乳膠手套 (M)', unit: '盒', defaultPrice: 38, minStock: 20, category: '防護' },
  { name: '乳膠手套 (L)', unit: '盒', defaultPrice: 38, minStock: 15, category: '防護' },
  { name: '醫用口罩', unit: '盒', defaultPrice: 30, minStock: 20, category: '防護' },
  { name: 'N95口罩', unit: '盒', defaultPrice: 85, minStock: 5, category: '防護' },
  { name: '紗布 (無菌)', unit: '包', defaultPrice: 15, minStock: 20, category: '敷料' },
  { name: '膠布', unit: '卷', defaultPrice: 8, minStock: 30, category: '敷料' },
  { name: '艾條', unit: '盒', defaultPrice: 60, minStock: 10, category: '艾灸' },
  { name: '刮痧板', unit: '個', defaultPrice: 25, minStock: 10, category: '刮痧' },
  { name: '刮痧油', unit: '瓶', defaultPrice: 35, minStock: 10, category: '刮痧' },
  { name: '一次性床紙', unit: '卷', defaultPrice: 20, minStock: 15, category: '其他' },
  { name: '消毒濕紙巾', unit: '包', defaultPrice: 16, minStock: 20, category: '消毒' },
  { name: '利器收集箱', unit: '個', defaultPrice: 45, minStock: 3, category: '其他' },
];

const SUPPLIERS = ['康健醫療器材', '信和醫療用品', '永安衛生材料', '百康供應商', '其他'];

const STATUS_MAP = {
  draft: { label: '草稿', color: '#6b7280', bg: '#f3f4f6' },
  ordered: { label: '已下單', color: '#3b82f6', bg: '#eff6ff' },
  shipping: { label: '運送中', color: '#f59e0b', bg: '#fffbeb' },
  received: { label: '已到貨', color: '#10b981', bg: '#ecfdf5' },
  cancelled: { label: '已取消', color: '#ef4444', bg: '#fef2f2' },
};

const ACC = '#0e7490';

function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
function save(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); }
function loadState() { const d = load(); return { orders: d.orders || [], stock: d.stock || {}, budget: d.budget || 8000 }; }

export default function MedicalSupplyOrder({ data, showToast, user }) {
  const [state, setState] = useState(loadState);
  const [tab, setTab] = useState('orders');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({ supplier: SUPPLIERS[0], items: [{ name: '', qty: 1, unitPrice: 0 }], notes: '' });
  const [budgetInput, setBudgetInput] = useState(state.budget);
  const clinicName = getClinicName();

  const persist = (next) => { setState(next); save(next); };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return state.orders.filter(o => {
      if (filterStatus !== 'all' && o.status !== filterStatus) return false;
      return !q || o.supplier?.toLowerCase().includes(q) || o.orderNo?.toLowerCase().includes(q) || o.items?.some(i => i.name?.toLowerCase().includes(q));
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [state.orders, search, filterStatus]);

  const monthlySpend = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return state.orders.filter(o => o.status !== 'cancelled' && (o.createdAt || '').startsWith(ym)).reduce((s, o) => s + (o.total || 0), 0);
  }, [state.orders]);

  const reorderSuggestions = useMemo(() => {
    const usage = {};
    const twoMonthsAgo = new Date(); twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    state.orders.filter(o => o.status === 'received' && new Date(o.createdAt) >= twoMonthsAgo).forEach(o => {
      o.items.forEach(i => { usage[i.name] = (usage[i.name] || 0) + Number(i.qty); });
    });
    return CATALOG.filter(c => {
      const currentStock = state.stock[c.name] || 0;
      return currentStock < c.minStock;
    }).map(c => ({ ...c, currentStock: state.stock[c.name] || 0, recentUsage: usage[c.name] || 0, suggestedQty: Math.max(c.minStock * 2 - (state.stock[c.name] || 0), c.minStock) }));
  }, [state.stock, state.orders]);

  const resetForm = () => setForm({ supplier: SUPPLIERS[0], items: [{ name: '', qty: 1, unitPrice: 0 }], notes: '' });
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { name: '', qty: 1, unitPrice: 0 }] }));
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const updateItem = (idx, field, val) => setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [field]: val } : it) }));

  const selectCatalogItem = (idx, name) => {
    const cat = CATALOG.find(c => c.name === name);
    if (cat) updateItem(idx, 'name', name); updateItem(idx, 'unitPrice', cat?.defaultPrice || 0);
  };

  const handleSave = () => {
    const items = form.items.filter(i => i.name);
    if (!form.supplier) return showToast('請選擇供應商');
    if (!items.length) return showToast('請至少加入一項物資');
    const total = items.reduce((s, i) => s + Number(i.qty) * Number(i.unitPrice), 0);
    const orderNo = editId ? state.orders.find(o => o.id === editId)?.orderNo : `SO-${new Date().toISOString().substring(2, 10).replace(/-/g, '')}-${uid().substring(0, 4).toUpperCase()}`;
    const entry = {
      id: editId || uid(), orderNo, supplier: form.supplier, items, total,
      notes: form.notes, status: editId ? (state.orders.find(o => o.id === editId)?.status || 'draft') : 'draft',
      createdBy: user?.name || '', createdAt: editId ? state.orders.find(o => o.id === editId)?.createdAt : new Date().toISOString(),
    };
    const orders = editId ? state.orders.map(o => o.id === editId ? entry : o) : [...state.orders, entry];
    persist({ ...state, orders });
    showToast(editId ? '已更新訂單' : '已建立訂單');
    setShowForm(false); setEditId(null); resetForm();
  };

  const updateStatus = (id, status) => {
    const orders = state.orders.map(o => o.id === id ? { ...o, status, ...(status === 'received' ? { receivedAt: new Date().toISOString() } : {}) } : o);
    let stock = { ...state.stock };
    if (status === 'received') {
      const order = state.orders.find(o => o.id === id);
      order?.items.forEach(i => { stock[i.name] = (stock[i.name] || 0) + Number(i.qty); });
    }
    persist({ ...state, orders, stock });
    showToast(`已更新為「${STATUS_MAP[status]?.label}」`);
  };

  const deleteOrder = (id) => {
    const orders = state.orders.filter(o => o.id !== id);
    persist({ ...state, orders });
    showToast('已刪除訂單');
  };

  const editOrder = (o) => {
    setEditId(o.id);
    setForm({ supplier: o.supplier, items: o.items.map(i => ({ ...i })), notes: o.notes || '' });
    setShowForm(true);
  };

  const createFromSuggestions = () => {
    if (!reorderSuggestions.length) return showToast('暫無補貨建議');
    setForm({ supplier: SUPPLIERS[0], items: reorderSuggestions.map(s => ({ name: s.name, qty: s.suggestedQty, unitPrice: s.defaultPrice })), notes: '自動補貨建議' });
    setEditId(null); setShowForm(true);
  };

  const saveBudget = () => { persist({ ...state, budget: Number(budgetInput) || 8000 }); showToast('預算已更新'); };

  const updateStock = (name, val) => { const stock = { ...state.stock, [name]: Math.max(0, Number(val) || 0) }; persist({ ...state, stock }); };

  const printOrder = (order) => {
    const w = window.open('', '_blank', 'width=800,height=600');
    const rows = order.items.map(i => `<tr><td style="border:1px solid #ccc;padding:6px">${escapeHtml(i.name)}</td><td style="border:1px solid #ccc;padding:6px;text-align:center">${i.qty}</td><td style="border:1px solid #ccc;padding:6px;text-align:right">$${Number(i.unitPrice).toFixed(2)}</td><td style="border:1px solid #ccc;padding:6px;text-align:right">$${(Number(i.qty) * Number(i.unitPrice)).toFixed(2)}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>採購單</title><style>body{font-family:Arial,sans-serif;padding:30px}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:${ACC};color:#fff;padding:8px;text-align:left}h1{color:${ACC}}.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${ACC};padding-bottom:12px;margin-bottom:20px}.meta{margin-bottom:16px;line-height:1.8}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:12px;color:${ACC}}.footer{margin-top:40px;display:flex;justify-content:space-between}.sig{border-top:1px solid #333;width:200px;text-align:center;padding-top:6px}@media print{body{padding:10px}}</style></head><body><div class="header"><div><h1>${escapeHtml(clinicName)}</h1><div>醫療物資採購單</div></div><div style="text-align:right"><div>單號：${escapeHtml(order.orderNo)}</div><div>日期：${(order.createdAt || '').substring(0, 10)}</div></div></div><div class="meta"><div>供應商：${escapeHtml(order.supplier)}</div><div>狀態：${escapeHtml(STATUS_MAP[order.status]?.label)}</div>${order.notes ? `<div>備註：${escapeHtml(order.notes)}</div>` : ''}</div><table><thead><tr><th>品名</th><th style="text-align:center">數量</th><th style="text-align:right">單價</th><th style="text-align:right">小計</th></tr></thead><tbody>${rows}</tbody></table><div class="total">總計：$${order.total.toFixed(2)}</div><div class="footer"><div class="sig">採購人簽名</div><div class="sig">主管批核</div><div class="sig">供應商確認</div></div><script>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  };

  const totalSpend = useMemo(() => state.orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.total || 0), 0), [state.orders]);

  const btn = { padding: '8px 16px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 };
  const primaryBtn = { ...btn, background: ACC, color: '#fff' };
  const ghostBtn = { ...btn, background: 'transparent', color: ACC, border: `1px solid ${ACC}` };
  const dangerBtn = { ...btn, background: '#ef4444', color: '#fff' };
  const card = { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.1)' };
  const input = { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: '100%', boxSizing: 'border-box' };
  const label = { fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block', color: '#374151' };
  const badge = (s) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: STATUS_MAP[s]?.color, background: STATUS_MAP[s]?.bg });

  const tabs = [{ key: 'orders', label: '訂單管理' }, { key: 'stock', label: '庫存 / 補貨' }, { key: 'budget', label: '預算追蹤' }];

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: ACC }}>醫療物資採購</h2>
        <span style={{ fontSize: 13, color: '#6b7280' }}>本月支出：<b style={{ color: monthlySpend > state.budget ? '#ef4444' : ACC }}>${monthlySpend.toFixed(0)}</b> / ${state.budget}</span>
      </div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: `2px solid #e5e7eb` }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: 'transparent', color: tab === t.key ? ACC : '#6b7280', borderBottom: tab === t.key ? `3px solid ${ACC}` : '3px solid transparent', marginBottom: -2 }}>{t.label}</button>
        ))}
      </div>

      {/* ── Orders Tab ── */}
      {tab === 'orders' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="搜尋訂單號 / 供應商 / 品名..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...input, maxWidth: 280 }} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...input, maxWidth: 130 }}>
              <option value="all">全部狀態</option>
              {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            <button onClick={() => { resetForm(); setEditId(null); setShowForm(true); }} style={primaryBtn}>+ 新增訂單</button>
          </div>

          {showForm && (
            <div style={{ ...card, marginBottom: 16, border: `1px solid ${ACC}33` }}>
              <h3 style={{ margin: '0 0 12px', color: ACC }}>{editId ? '編輯訂單' : '新增採購訂單'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><label style={label}>供應商</label><select value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} style={input}>{SUPPLIERS.map(s => <option key={s}>{s}</option>)}</select></div>
                <div><label style={label}>備註</label><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={input} placeholder="選填" /></div>
              </div>
              <label style={label}>訂購項目</label>
              {form.items.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <select value={it.name} onChange={e => selectCatalogItem(idx, e.target.value)} style={{ ...input, flex: 3 }}>
                    <option value="">-- 選擇物資 --</option>
                    {CATALOG.map(c => <option key={c.name} value={c.name}>{c.name} ({c.unit})</option>)}
                  </select>
                  <input type="number" min="1" value={it.qty} onChange={e => updateItem(idx, 'qty', e.target.value)} style={{ ...input, flex: 1 }} placeholder="數量" />
                  <input type="number" min="0" step="0.01" value={it.unitPrice} onChange={e => updateItem(idx, 'unitPrice', e.target.value)} style={{ ...input, flex: 1 }} placeholder="單價" />
                  <span style={{ minWidth: 60, textAlign: 'right', fontWeight: 600, fontSize: 13 }}>${(Number(it.qty) * Number(it.unitPrice)).toFixed(2)}</span>
                  {form.items.length > 1 && <button onClick={() => removeItem(idx)} style={{ ...dangerBtn, padding: '4px 8px', fontSize: 12 }}>X</button>}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <button onClick={addItem} style={ghostBtn}>+ 新增項目</button>
                <div style={{ flex: 1 }} />
                <span style={{ fontWeight: 700, color: ACC }}>合計：${form.items.reduce((s, i) => s + Number(i.qty) * Number(i.unitPrice), 0).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => { setShowForm(false); setEditId(null); resetForm(); }} style={ghostBtn}>取消</button>
                <button onClick={handleSave} style={primaryBtn}>{editId ? '更新訂單' : '建立訂單'}</button>
              </div>
            </div>
          )}

          {!filtered.length && <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>暫無訂單記錄</div>}
          {filtered.map(o => (
            <div key={o.id} style={{ ...card, marginBottom: 10, borderLeft: `4px solid ${STATUS_MAP[o.status]?.color || '#ccc'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, marginRight: 8 }}>{o.orderNo}</span>
                  <span style={badge(o.status)}>{STATUS_MAP[o.status]?.label}</span>
                </div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{o.supplier} | {(o.createdAt || '').substring(0, 10)}</div>
              </div>
              <div style={{ fontSize: 13, color: '#4b5563', margin: '6px 0' }}>
                {o.items.map(i => `${i.name} x${i.qty}`).join('、')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                <span style={{ fontWeight: 700, color: ACC }}>合計：${o.total.toFixed(2)}</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {o.status === 'draft' && <button onClick={() => updateStatus(o.id, 'ordered')} style={{ ...btn, background: '#3b82f6', color: '#fff', padding: '4px 10px', fontSize: 12 }}>下單</button>}
                  {o.status === 'ordered' && <button onClick={() => updateStatus(o.id, 'shipping')} style={{ ...btn, background: '#f59e0b', color: '#fff', padding: '4px 10px', fontSize: 12 }}>運送中</button>}
                  {(o.status === 'ordered' || o.status === 'shipping') && <button onClick={() => updateStatus(o.id, 'received')} style={{ ...btn, background: '#10b981', color: '#fff', padding: '4px 10px', fontSize: 12 }}>到貨</button>}
                  {o.status === 'draft' && <button onClick={() => editOrder(o)} style={{ ...ghostBtn, padding: '4px 10px', fontSize: 12 }}>編輯</button>}
                  {(o.status === 'draft' || o.status === 'ordered') && <button onClick={() => updateStatus(o.id, 'cancelled')} style={{ ...btn, background: '#fee2e2', color: '#ef4444', padding: '4px 10px', fontSize: 12 }}>取消</button>}
                  <button onClick={() => printOrder(o)} style={{ ...ghostBtn, padding: '4px 10px', fontSize: 12 }}>列印</button>
                  {o.status === 'cancelled' && <button onClick={() => deleteOrder(o.id)} style={{ ...dangerBtn, padding: '4px 10px', fontSize: 12 }}>刪除</button>}
                </div>
              </div>
            </div>
          ))}
          {filtered.length > 0 && (
            <div style={{ ...card, marginTop: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span>共 {filtered.length} 筆訂單</span>
              <span style={{ fontWeight: 700, color: ACC }}>累計總額：${totalSpend.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Stock & Reorder Tab ── */}
      {tab === 'stock' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: ACC }}>庫存水平 & 補貨建議</h3>
            {reorderSuggestions.length > 0 && <button onClick={createFromSuggestions} style={primaryBtn}>一鍵補貨 ({reorderSuggestions.length})</button>}
          </div>
          {reorderSuggestions.length > 0 && (
            <div style={{ ...card, marginBottom: 14, border: '1px solid #fbbf24', background: '#fffbeb' }}>
              <div style={{ fontWeight: 700, color: '#b45309', marginBottom: 8 }}>低庫存警告</div>
              {reorderSuggestions.map(s => (
                <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #fde68a', fontSize: 13 }}>
                  <span>{s.name}</span>
                  <span>現有 <b style={{ color: '#ef4444' }}>{s.currentStock}</b> / 最低 {s.minStock} | 建議補 <b style={{ color: ACC }}>{s.suggestedQty}</b></span>
                </div>
              ))}
            </div>
          )}
          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '2px solid #e5e7eb' }}>品名</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '2px solid #e5e7eb' }}>類別</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '2px solid #e5e7eb' }}>單位</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '2px solid #e5e7eb' }}>最低庫存</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '2px solid #e5e7eb', minWidth: 80 }}>現有庫存</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px', borderBottom: '2px solid #e5e7eb' }}>狀態</th>
                </tr>
              </thead>
              <tbody>
                {CATALOG.map(c => {
                  const cur = state.stock[c.name] || 0;
                  const low = cur < c.minStock;
                  return (
                    <tr key={c.name} style={{ background: low ? '#fef2f2' : 'transparent' }}>
                      <td style={{ padding: '6px', borderBottom: '1px solid #f3f4f6' }}>{c.name}</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>{c.category}</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>{c.unit}</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>{c.minStock}</td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                        <input type="number" min="0" value={cur} onChange={e => updateStock(c.name, e.target.value)} style={{ width: 60, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 4, textAlign: 'center', fontSize: 13 }} />
                      </td>
                      <td style={{ padding: '6px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                        {low ? <span style={{ color: '#ef4444', fontWeight: 700 }}>不足</span> : <span style={{ color: '#10b981', fontWeight: 600 }}>正常</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Budget Tab ── */}
      {tab === 'budget' && (
        <div>
          <h3 style={{ margin: '0 0 12px', color: ACC }}>每月預算追蹤</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>本月預算</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: ACC }}>${state.budget.toLocaleString()}</div>
            </div>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>本月支出</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: monthlySpend > state.budget ? '#ef4444' : '#10b981' }}>${monthlySpend.toFixed(0)}</div>
            </div>
            <div style={{ ...card, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>剩餘額度</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: (state.budget - monthlySpend) < 0 ? '#ef4444' : ACC }}>${(state.budget - monthlySpend).toFixed(0)}</div>
            </div>
          </div>
          <div style={card}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span>預算使用率</span>
                <span style={{ fontWeight: 600 }}>{state.budget > 0 ? Math.min(100, (monthlySpend / state.budget * 100)).toFixed(1) : 0}%</span>
              </div>
              <div style={{ height: 18, background: '#e5e7eb', borderRadius: 9, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, state.budget > 0 ? monthlySpend / state.budget * 100 : 0)}%`, background: monthlySpend > state.budget ? '#ef4444' : monthlySpend > state.budget * 0.8 ? '#f59e0b' : ACC, borderRadius: 9, transition: 'width .3s' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
              <label style={{ ...label, margin: 0, whiteSpace: 'nowrap' }}>設定月預算：</label>
              <input type="number" min="0" step="500" value={budgetInput} onChange={e => setBudgetInput(e.target.value)} style={{ ...input, maxWidth: 140 }} />
              <button onClick={saveBudget} style={primaryBtn}>儲存</button>
            </div>
          </div>
          <h3 style={{ color: ACC, marginTop: 20, marginBottom: 10 }}>訂單歷史統計</h3>
          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid #e5e7eb' }}>狀態</th>
                  <th style={{ textAlign: 'center', padding: 8, borderBottom: '2px solid #e5e7eb' }}>訂單數</th>
                  <th style={{ textAlign: 'right', padding: 8, borderBottom: '2px solid #e5e7eb' }}>總金額</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(STATUS_MAP).map(([k, v]) => {
                  const matching = state.orders.filter(o => o.status === k);
                  return (
                    <tr key={k}>
                      <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}><span style={badge(k)}>{v.label}</span></td>
                      <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>{matching.length}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 600 }}>${matching.reduce((s, o) => s + (o.total || 0), 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
