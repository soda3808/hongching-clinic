import { useState, useMemo } from 'react';
import { uid } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';
import { S, ECTCM } from '../styles/ectcm';

const PO_KEY = 'hcmc_purchase_orders';
const SUPPLIER_KEY = 'hcmc_suppliers';

const PO_STATUS = {
  draft: { label: '草稿', color: '#6b7280', bg: '#f3f4f6' },
  ordered: { label: '已下單', color: '#3b82f6', bg: '#eff6ff' },
  partial: { label: '部分到貨', color: '#f59e0b', bg: '#fffbeb' },
  received: { label: '已到貨', color: '#10b981', bg: '#ecfdf5' },
  cancelled: { label: '已取消', color: '#ef4444', bg: '#fef2f2' },
};

function loadPOs() { try { return JSON.parse(localStorage.getItem(PO_KEY) || '[]'); } catch { return []; } }
function savePOs(arr) { localStorage.setItem(PO_KEY, JSON.stringify(arr)); }
function loadSuppliers() { try { return JSON.parse(localStorage.getItem(SUPPLIER_KEY) || '[]'); } catch { return []; } }
function saveSuppliers(arr) { localStorage.setItem(SUPPLIER_KEY, JSON.stringify(arr)); }

export default function PurchaseOrders({ data, setData, showToast, user }) {
  const [orders, setOrders] = useState(loadPOs);
  const [suppliers, setSuppliers] = useState(loadSuppliers);
  const [tab, setTab] = useState('orders'); // orders | suppliers
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ supplier: '', poDate: new Date().toISOString().substring(0, 10), expectedDate: '', items: [{ name: '', qty: '', unit: 'g', unitPrice: '', notes: '' }], notes: '' });
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', contact: '', phone: '', address: '', notes: '' });
  const [detail, setDetail] = useState(null);

  const clinicName = getClinicName();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(o => {
      if (filterStatus !== 'all' && o.status !== filterStatus) return false;
      return !q || o.supplier?.toLowerCase().includes(q) || o.poNo?.toLowerCase().includes(q) || o.items?.some(i => i.name?.toLowerCase().includes(q));
    }).sort((a, b) => (b.poDate || '').localeCompare(a.poDate || ''));
  }, [orders, search, filterStatus]);

  const handleSavePO = () => {
    const items = form.items.filter(i => i.name);
    if (!form.supplier) return showToast('請選擇供應商');
    if (!items.length) return showToast('請至少加入一項藥材');
    const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);
    const poNo = editId ? orders.find(o => o.id === editId)?.poNo : `PO-${new Date().toISOString().substring(2, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const entry = { id: editId || uid(), poNo, supplier: form.supplier, poDate: form.poDate, expectedDate: form.expectedDate, items, totalAmount: total, notes: form.notes, status: editId ? orders.find(o => o.id === editId)?.status || 'draft' : 'draft', createdBy: user?.name || '', createdAt: editId ? orders.find(o => o.id === editId)?.createdAt : new Date().toISOString() };
    const updated = editId ? orders.map(o => o.id === editId ? entry : o) : [...orders, entry];
    setOrders(updated); savePOs(updated);
    showToast(editId ? '已更新採購單' : '已建立採購單');
    setShowForm(false); setEditId(null);
    setForm({ supplier: '', poDate: new Date().toISOString().substring(0, 10), expectedDate: '', items: [{ name: '', qty: '', unit: 'g', unitPrice: '', notes: '' }], notes: '' });
  };

  const updatePOStatus = (id, status) => {
    const updated = orders.map(o => o.id === id ? { ...o, status, ...(status === 'received' ? { receivedAt: new Date().toISOString() } : {}) } : o);
    setOrders(updated); savePOs(updated);
    showToast(`已更新為「${PO_STATUS[status]?.label}」`);

    // Auto-update inventory if received
    if (status === 'received') {
      const po = orders.find(o => o.id === id);
      if (po && data.inventory) {
        const inv = [...data.inventory];
        po.items.forEach(item => {
          const existing = inv.find(i => i.name === item.name);
          if (existing) {
            existing.stock = (Number(existing.stock) || 0) + (Number(item.qty) || 0);
          }
        });
        setData(d => ({ ...d, inventory: inv }));
        showToast('庫存已自動更新');
      }
    }
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { name: '', qty: '', unit: 'g', unitPrice: '', notes: '' }] }));
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }));
  const updateItem = (i, key, val) => setForm(f => ({ ...f, items: f.items.map((item, j) => j === i ? { ...item, [key]: val } : item) }));

  const handleSaveSupplier = () => {
    if (!supplierForm.name) return showToast('請輸入供應商名稱');
    const updated = [...suppliers.filter(s => s.name !== supplierForm.name), { ...supplierForm, id: uid(), createdAt: new Date().toISOString() }];
    setSuppliers(updated); saveSuppliers(updated);
    showToast('已儲存供應商');
    setShowSupplierForm(false);
    setSupplierForm({ name: '', contact: '', phone: '', address: '', notes: '' });
  };

  const handlePrint = (po) => {
    const rows = po.items.map((i, idx) => `<tr><td>${idx + 1}</td><td>${escapeHtml(i.name)}</td><td>${i.qty} ${escapeHtml(i.unit)}</td><td>$${Number(i.unitPrice || 0).toFixed(2)}</td><td>$${((Number(i.qty) || 0) * (Number(i.unitPrice) || 0)).toFixed(2)}</td><td>${escapeHtml(i.notes || '')}</td></tr>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>採購單 ${escapeHtml(po.poNo)}</title><style>body{font:12px sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ddd;padding:5px 8px;font-size:11px}th{background:#f3f4f6}h1{font-size:16px;margin:0}@media print{body{padding:10px}}</style></head><body><h1>${escapeHtml(clinicName)} — 採購單</h1><p>單號：<strong>${escapeHtml(po.poNo)}</strong> | 供應商：<strong>${escapeHtml(po.supplier)}</strong> | 日期：${po.poDate} | 預計到貨：${po.expectedDate || '-'}</p><table><thead><tr><th>#</th><th>藥材/物品</th><th>數量</th><th>單價</th><th>小計</th><th>備註</th></tr></thead><tbody>${rows}</tbody></table><p style="text-align:right;font-weight:700">總計：$${po.totalAmount?.toFixed(2)}</p><p style="font-size:10px;color:#999;margin-top:20px">建立者：${escapeHtml(po.createdBy)} | 列印時間：${new Date().toLocaleString('zh-HK')}</p></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // Stats
  const stats = useMemo(() => {
    const counts = { draft: 0, ordered: 0, partial: 0, received: 0 };
    orders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
    const monthTotal = orders.filter(o => o.status === 'received' && o.poDate?.substring(0, 7) === new Date().toISOString().substring(0, 7)).reduce((s, o) => s + (o.totalAmount || 0), 0);
    return { ...counts, total: orders.length, monthTotal };
  }, [orders]);

  return (
    <div style={S.page}>
      <div style={S.titleBar}>藥物管理 &gt; 入貨管理</div>
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>📦 進貨管理</h2>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
          {[['orders', `採購單 (${orders.length})`], ['suppliers', `供應商 (${suppliers.length})`]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === k ? 700 : 400, background: tab === k ? '#0e7490' : 'transparent', color: tab === k ? '#fff' : '#555' }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, marginBottom: 12 }}>
        {[['total', '總採購單', '#0e7490'], ['draft', '草稿', '#6b7280'], ['ordered', '已下單', '#3b82f6'], ['received', '已到貨', '#10b981']].map(([k, label, color]) => (
          <div key={k} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{stats[k]}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
          </div>
        ))}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>${stats.monthTotal.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: '#888' }}>本月採購額</div>
        </div>
      </div>

      {tab === 'orders' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input" style={{ width: 130 }}>
              <option value="all">全部狀態</option>
              {Object.entries(PO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋供應商/單號/藥材..." className="input" style={{ flex: 1, minWidth: 150 }} />
            <button onClick={() => { setShowForm(true); setEditId(null); setForm({ supplier: '', poDate: new Date().toISOString().substring(0, 10), expectedDate: '', items: [{ name: '', qty: '', unit: 'g', unitPrice: '', notes: '' }], notes: '' }); }} className="btn btn-primary">+ 新增採購單</button>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>沒有採購單</div>}
            {filtered.map(po => {
              const st = PO_STATUS[po.status] || PO_STATUS.draft;
              return (
                <div key={po.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ color: '#0e7490' }}>{po.poNo}</strong>
                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span>
                    <span style={{ fontSize: 12, color: '#888' }}>{po.supplier}</span>
                    <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>{po.poDate}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#444', marginBottom: 4 }}>
                    {po.items.slice(0, 5).map(i => `${i.name}×${i.qty}${i.unit}`).join('、')}{po.items.length > 5 ? ` ...+${po.items.length - 5}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <strong>${po.totalAmount?.toFixed(2)}</strong>
                    <span style={{ color: '#888' }}>{po.items.length}項</span>
                    {po.expectedDate && <span style={{ color: '#888' }}>預計到貨：{po.expectedDate}</span>}
                    <div style={{ flex: 1 }} />
                    {po.status === 'draft' && <button onClick={() => updatePOStatus(po.id, 'ordered')} className="btn btn-outline" style={{ fontSize: 11 }}>確認下單</button>}
                    {po.status === 'ordered' && <button onClick={() => updatePOStatus(po.id, 'received')} className="btn btn-primary" style={{ fontSize: 11 }}>確認到貨</button>}
                    <button onClick={() => handlePrint(po)} className="btn btn-outline" style={{ fontSize: 11 }}>🖨️</button>
                    <button onClick={() => { setEditId(po.id); setForm({ supplier: po.supplier, poDate: po.poDate, expectedDate: po.expectedDate || '', items: po.items, notes: po.notes || '' }); setShowForm(true); }} className="btn btn-outline" style={{ fontSize: 11 }}>編輯</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'suppliers' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowSupplierForm(true)} className="btn btn-primary">+ 新增供應商</button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {suppliers.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>尚未新增供應商</div>}
            {suppliers.map(s => (
              <div key={s.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 700 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{s.contact && `聯絡人：${s.contact}`}{s.phone && ` | 電話：${s.phone}`}</div>
                {s.address && <div style={{ fontSize: 12, color: '#888' }}>地址：{s.address}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* PO Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '95%', maxWidth: 650, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 12px' }}>{editId ? '編輯採購單' : '新增採購單'}</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} className="input" style={{ flex: 1 }}>
                  <option value="">選擇供應商 *</option>
                  {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <input type="date" value={form.poDate} onChange={e => setForm(f => ({ ...f, poDate: e.target.value }))} className="input" style={{ width: 150 }} />
                <input type="date" value={form.expectedDate} onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))} className="input" style={{ width: 150 }} placeholder="預計到貨" />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>採購項目：</div>
              {form.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} placeholder="藥材/物品名" className="input" style={{ flex: 2 }} />
                  <input type="number" value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} placeholder="數量" className="input" style={{ width: 70 }} />
                  <select value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)} className="input" style={{ width: 60 }}>
                    {['g', 'kg', '包', '盒', '件', '瓶', '支'].map(u => <option key={u}>{u}</option>)}
                  </select>
                  <input type="number" value={item.unitPrice} onChange={e => updateItem(i, 'unitPrice', e.target.value)} placeholder="單價$" className="input" style={{ width: 80 }} />
                  <span style={{ fontSize: 12, color: '#888', minWidth: 50 }}>${((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)).toFixed(0)}</span>
                  {form.items.length > 1 && <button onClick={() => removeItem(i)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18 }}>×</button>}
                </div>
              ))}
              <button onClick={addItem} className="btn btn-outline" style={{ fontSize: 12 }}>+ 加項目</button>
              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 14 }}>
                總計：${form.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0).toFixed(2)}
              </div>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="備註（可選）" className="input" rows={2} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setEditId(null); }} className="btn btn-outline">取消</button>
              <button onClick={handleSavePO} className="btn btn-primary">儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Form Modal */}
      {showSupplierForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '95%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px' }}>新增供應商</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <input value={supplierForm.name} onChange={e => setSupplierForm(f => ({ ...f, name: e.target.value }))} placeholder="供應商名稱 *" className="input" />
              <input value={supplierForm.contact} onChange={e => setSupplierForm(f => ({ ...f, contact: e.target.value }))} placeholder="聯絡人" className="input" />
              <input value={supplierForm.phone} onChange={e => setSupplierForm(f => ({ ...f, phone: e.target.value }))} placeholder="電話" className="input" />
              <input value={supplierForm.address} onChange={e => setSupplierForm(f => ({ ...f, address: e.target.value }))} placeholder="地址" className="input" />
              <textarea value={supplierForm.notes} onChange={e => setSupplierForm(f => ({ ...f, notes: e.target.value }))} placeholder="備註" className="input" rows={2} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSupplierForm(false)} className="btn btn-outline">取消</button>
              <button onClick={handleSaveSupplier} className="btn btn-primary">儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
