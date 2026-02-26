import { useState, useMemo, useRef } from 'react';
import { saveProduct, saveProductSale, deleteProduct, saveRevenue } from '../api';
import { uid, fmtM, getMonth } from '../data';
import { useFocusTrap, nullRef } from './ConfirmModal';
import ConfirmModal from './ConfirmModal';

const CATEGORIES = ['保健品', '養生茶', '外用品', '其他'];
const STORES = ['宋皇臺', '太子'];
const PAYMENTS = ['現金', 'FPS', 'PayMe', 'AlipayHK', '信用卡', '其他'];

const EMPTY_PRODUCT = {
  name: '', category: '保健品', price: '', cost: '', stock: 0, minStock: 5, unit: '件', store: '宋皇臺', barcode: '', active: true,
};

export default function ProductPage({ data, setData, showToast, allData, user }) {
  const [tab, setTab] = useState('catalog');
  const [showModal, setShowModal] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_PRODUCT });
  const [saleForm, setSaleForm] = useState({ productId: '', quantity: 1, patientName: '', store: '宋皇臺', payment: '現金' });
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [saving, setSaving] = useState(false);

  const modalRef = useRef(null);
  const saleRef = useRef(null);
  useFocusTrap(showModal ? modalRef : nullRef);
  useFocusTrap(showSaleModal ? saleRef : nullRef);

  const products = data.products || [];
  const productSales = data.productSales || [];
  const patients = allData?.patients || data.patients || [];
  const thisMonth = new Date().toISOString().substring(0, 7);

  const stats = useMemo(() => ({
    total: products.length,
    lowStock: products.filter(p => Number(p.stock) < Number(p.minStock)).length,
    inventoryValue: products.reduce((s, p) => s + Number(p.stock || 0) * Number(p.cost || 0), 0),
    monthSales: productSales.filter(s => getMonth(s.date) === thisMonth).reduce((sum, s) => sum + Number(s.totalAmount || 0), 0),
  }), [products, productSales, thisMonth]);

  const filteredProducts = useMemo(() => {
    let l = [...products];
    if (search) {
      const q = search.toLowerCase();
      l = l.filter(p => p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
    }
    return l.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  }, [products, search]);

  const filteredSales = useMemo(() => {
    return [...productSales].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [productSales]);

  // ── Sales Analytics (#82) ──
  const salesAnalytics = useMemo(() => {
    const monthSales = productSales.filter(s => getMonth(s.date) === thisMonth);
    // By product
    const byProduct = {};
    monthSales.forEach(s => {
      if (!byProduct[s.productName]) byProduct[s.productName] = { qty: 0, amount: 0 };
      byProduct[s.productName].qty += Number(s.quantity || 0);
      byProduct[s.productName].amount += Number(s.totalAmount || 0);
    });
    const topProducts = Object.entries(byProduct).sort((a, b) => b[1].amount - a[1].amount).slice(0, 10);
    // By payment method
    const byPayment = {};
    monthSales.forEach(s => {
      byPayment[s.payment || '其他'] = (byPayment[s.payment || '其他'] || 0) + Number(s.totalAmount || 0);
    });
    // By store
    const byStore = {};
    monthSales.forEach(s => {
      byStore[s.store || '宋皇臺'] = (byStore[s.store || '宋皇臺'] || 0) + Number(s.totalAmount || 0);
    });
    // Daily trend (last 14 days)
    const dailyMap = {};
    productSales.forEach(s => {
      if (!s.date) return;
      dailyMap[s.date] = (dailyMap[s.date] || 0) + Number(s.totalAmount || 0);
    });
    const daily = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
    // Profit margin
    const totalCost = monthSales.reduce((s, sale) => {
      const p = products.find(pr => pr.id === sale.productId);
      return s + (p ? Number(p.cost || 0) * Number(sale.quantity || 0) : 0);
    }, 0);
    const totalRevenue = monthSales.reduce((s, sale) => s + Number(sale.totalAmount || 0), 0);
    const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100).toFixed(1) : 0;
    return { topProducts, byPayment, byStore, daily, totalCost, totalRevenue, margin, monthCount: monthSales.length };
  }, [productSales, products, thisMonth]);

  // ── Product CRUD ──
  const openAdd = () => { setEditItem(null); setForm({ ...EMPTY_PRODUCT }); setShowModal(true); };
  const openEdit = (item) => { setEditItem(item); setForm({ ...item }); setShowModal(true); };

  // ── Form Validation (#85) ──
  const [formErrors, setFormErrors] = useState({});
  const validateProductForm = () => {
    const errs = {};
    if (!form.name || !form.name.trim()) errs.name = '商品名稱不能為空';
    if (form.price && (isNaN(Number(form.price)) || Number(form.price) < 0)) errs.price = '售價必須為正數';
    if (form.cost && (isNaN(Number(form.cost)) || Number(form.cost) < 0)) errs.cost = '成本必須為正數';
    if (form.price && form.cost && Number(form.cost) > Number(form.price)) errs.cost = '成本不應高於售價';
    if (form.stock && Number(form.stock) < 0) errs.stock = '庫存不能為負數';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!validateProductForm()) return;
    setSaving(true);
    const record = {
      ...form,
      id: editItem ? editItem.id : uid(),
      price: parseFloat(form.price) || 0,
      cost: parseFloat(form.cost) || 0,
      stock: parseFloat(form.stock) || 0,
      minStock: parseFloat(form.minStock) || 5,
    };
    await saveProduct(record);
    const updated = editItem
      ? products.map(p => p.id === record.id ? record : p)
      : [...products, record];
    setData({ ...data, products: updated });
    setShowModal(false);
    setSaving(false);
    showToast(editItem ? '商品已更新' : '商品已新增');
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteProduct(deleteId);
    setData({ ...data, products: products.filter(p => p.id !== deleteId) });
    showToast('已刪除');
    setDeleteId(null);
  };

  // ── Sale ──
  const openSale = () => {
    setSaleForm({ productId: products[0]?.id || '', quantity: 1, patientName: '', store: '宋皇臺', payment: '現金' });
    setShowSaleModal(true);
  };

  const handleSale = async (e) => {
    e.preventDefault();
    const product = products.find(p => p.id === saleForm.productId);
    if (!product) return showToast('請選擇商品');
    const qty = parseInt(saleForm.quantity) || 1;
    if (qty <= 0) return showToast('請輸入有效數量');
    if (Number(product.stock) < qty) return showToast(`庫存不足（現有 ${product.stock}）`);

    setSaving(true);
    const totalAmount = qty * Number(product.price || 0);

    // Create sale record
    const saleRecord = {
      id: uid(),
      productId: product.id,
      productName: product.name,
      quantity: qty,
      unitPrice: Number(product.price || 0),
      totalAmount,
      patientName: saleForm.patientName,
      store: saleForm.store,
      payment: saleForm.payment,
      date: new Date().toISOString().substring(0, 10),
      soldBy: user?.name || '',
      createdAt: new Date().toISOString(),
    };
    await saveProductSale(saleRecord);

    // Deduct stock
    const updatedProduct = { ...product, stock: Number(product.stock) - qty, lastRestocked: product.lastRestocked };
    await saveProduct(updatedProduct);

    // Create revenue record
    const revRecord = {
      id: uid(),
      date: saleRecord.date,
      name: saleForm.patientName || '散客',
      item: `商品: ${product.name} x${qty}`,
      amount: totalAmount,
      payment: saleForm.payment,
      store: saleForm.store,
      doctor: user?.name || '',
      note: '商品銷售',
    };
    await saveRevenue(revRecord);

    setData({
      ...data,
      products: products.map(p => p.id === updatedProduct.id ? updatedProduct : p),
      productSales: [...productSales, saleRecord],
      revenue: [...(data.revenue || []), revRecord],
    });

    setShowSaleModal(false);
    setSaving(false);
    showToast(`已售出 ${product.name} x${qty}，收入 ${fmtM(totalAmount)}`);
  };

  const selectedSaleProduct = products.find(p => p.id === saleForm.productId);

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">總商品數</div><div className="stat-value teal">{stats.total}</div></div>
        <div className="stat-card red"><div className="stat-label">低庫存</div><div className="stat-value red">{stats.lowStock}</div></div>
        <div className="stat-card gold"><div className="stat-label">庫存總值</div><div className="stat-value gold">{fmtM(stats.inventoryValue)}</div></div>
        <div className="stat-card green"><div className="stat-label">本月銷售</div><div className="stat-value green">{fmtM(stats.monthSales)}</div></div>
      </div>

      {/* Tabs + Actions */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          <button className={`tab-btn ${tab === 'catalog' ? 'active' : ''}`} onClick={() => setTab('catalog')}>商品目錄</button>
          <button className={`tab-btn ${tab === 'sales' ? 'active' : ''}`} onClick={() => setTab('sales')}>銷售紀錄</button>
          <button className={`tab-btn ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}>銷售分析</button>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {tab === 'catalog' && (
            <>
              <input placeholder="搜尋商品..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 180 }} />
              <button className="btn btn-teal" onClick={openAdd}>+ 新增商品</button>
            </>
          )}
          {tab === 'sales' && (
            <button className="btn btn-outline" onClick={() => {
              if (!productSales.length) return showToast('沒有銷售紀錄可匯出');
              const headers = ['日期','商品','數量','單價','總額','客人','付款方式','店舖','銷售員'];
              const rows = [...productSales].sort((a,b) => (b.date||'').localeCompare(a.date||'')).map(s =>
                [s.date, s.productName, s.quantity, s.unitPrice, s.totalAmount, s.patientName || '散客', s.payment, s.store, s.soldBy]
              );
              const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `product_sales_${new Date().toISOString().substring(0,10)}.csv`;
              a.click();
              showToast('已匯出銷售紀錄');
            }}>匯出CSV</button>
          )}
          <button className="btn btn-green" onClick={openSale}>新增銷售</button>
        </div>
      </div>

      {/* Catalog Tab */}
      {tab === 'catalog' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header"><h3>商品目錄 ({filteredProducts.length})</h3></div>
          <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th>商品名稱</th><th>類別</th><th style={{ textAlign: 'right' }}>售價</th><th style={{ textAlign: 'right' }}>成本</th><th style={{ textAlign: 'right' }}>庫存</th><th>店舖</th><th>狀態</th><th>操作</th></tr>
              </thead>
              <tbody>
                {!filteredProducts.length && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無商品</td></tr>}
                {filteredProducts.map(p => {
                  const isLow = Number(p.stock) < Number(p.minStock);
                  return (
                    <tr key={p.id} style={{ opacity: p.active === false ? 0.5 : 1 }}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td><span className="tag tag-other">{p.category}</span></td>
                      <td className="money" style={{ color: 'var(--gold-700)' }}>{fmtM(p.price)}</td>
                      <td className="money">{fmtM(p.cost)}</td>
                      <td className="money">{p.stock} {p.unit}</td>
                      <td style={{ fontSize: 11 }}>{p.store}</td>
                      <td><span className={`tag ${isLow ? 'tag-overdue' : 'tag-paid'}`}>{isLow ? '低庫存' : '充足'}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(p)}>編輯</button>
                          <button className="btn btn-red btn-sm" onClick={() => setDeleteId(p.id)}>刪除</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sales Tab */}
      {tab === 'sales' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header"><h3>銷售紀錄 ({filteredSales.length})</h3></div>
          <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th>日期</th><th>商品</th><th style={{ textAlign: 'right' }}>數量</th><th style={{ textAlign: 'right' }}>單價</th><th style={{ textAlign: 'right' }}>總額</th><th>客人</th><th>付款</th><th>店舖</th><th>銷售員</th></tr>
              </thead>
              <tbody>
                {!filteredSales.length && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無銷售紀錄</td></tr>}
                {filteredSales.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>{s.date}</td>
                    <td style={{ fontWeight: 600 }}>{s.productName}</td>
                    <td className="money">{s.quantity}</td>
                    <td className="money">{fmtM(s.unitPrice)}</td>
                    <td className="money" style={{ color: 'var(--gold-700)', fontWeight: 600 }}>{fmtM(s.totalAmount)}</td>
                    <td>{s.patientName || '散客'}</td>
                    <td><span className="tag tag-other">{s.payment}</span></td>
                    <td style={{ fontSize: 11 }}>{s.store}</td>
                    <td style={{ fontSize: 11, color: 'var(--gray-500)' }}>{s.soldBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analytics Tab (#82) */}
      {tab === 'analytics' && (
        <>
          {/* Summary row */}
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8, fontWeight: 600 }}>本月利潤率</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: Number(salesAnalytics.margin) >= 30 ? 'var(--green-600)' : '#d97706' }}>
                {salesAnalytics.margin}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
                收入 {fmtM(salesAnalytics.totalRevenue)} · 成本 {fmtM(salesAnalytics.totalCost)} · 毛利 {fmtM(salesAnalytics.totalRevenue - salesAnalytics.totalCost)}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8, fontWeight: 600 }}>付款方式分佈</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {Object.entries(salesAnalytics.byPayment).map(([method, amt]) => (
                  <div key={method} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--teal-700)' }}>{fmtM(amt)}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{method}</div>
                  </div>
                ))}
                {!Object.keys(salesAnalytics.byPayment).length && <div style={{ color: '#aaa', fontSize: 12 }}>暫無數據</div>}
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            {/* Store breakdown */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8, fontWeight: 600 }}>各店銷售額</div>
              {Object.entries(salesAnalytics.byStore).map(([store, amt]) => {
                const pct = salesAnalytics.totalRevenue > 0 ? (amt / salesAnalytics.totalRevenue * 100).toFixed(0) : 0;
                return (
                  <div key={store} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600 }}>{store}</span>
                      <span>{fmtM(amt)} ({pct}%)</span>
                    </div>
                    <div style={{ background: 'var(--gray-100)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: store === '宋皇臺' ? 'var(--teal-500)' : '#B8860B', borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
              {!Object.keys(salesAnalytics.byStore).length && <div style={{ color: '#aaa', fontSize: 12 }}>暫無數據</div>}
            </div>

            {/* Daily trend */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8, fontWeight: 600 }}>近14日銷售趨勢</div>
              {salesAnalytics.daily.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
                  {salesAnalytics.daily.map(([date, amt]) => {
                    const maxAmt = Math.max(...salesAnalytics.daily.map(d => d[1])) || 1;
                    const h = Math.max(4, (amt / maxAmt) * 100);
                    return (
                      <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }} title={`${date}: ${fmtM(amt)}`}>
                        <div style={{ fontSize: 8, color: 'var(--gray-400)', marginBottom: 2 }}>{amt > 0 ? fmtM(amt) : ''}</div>
                        <div style={{ width: '100%', height: h, background: 'var(--teal-500)', borderRadius: '3px 3px 0 0', minWidth: 8 }} />
                        <div style={{ fontSize: 8, color: 'var(--gray-400)', marginTop: 2 }}>{date.substring(8)}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: '#aaa', fontSize: 12 }}>暫無數據</div>
              )}
            </div>
          </div>

          {/* Top Products */}
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header"><h3>本月暢銷商品 TOP 10</h3></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>商品</th><th style={{ textAlign: 'right' }}>銷量</th><th style={{ textAlign: 'right' }}>銷售額</th><th style={{ textAlign: 'right' }}>佔比</th></tr>
                </thead>
                <tbody>
                  {!salesAnalytics.topProducts.length && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>本月暫無銷售</td></tr>}
                  {salesAnalytics.topProducts.map(([name, d], i) => (
                    <tr key={name}>
                      <td style={{ fontWeight: 700, color: i < 3 ? '#d97706' : 'var(--gray-500)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{name}</td>
                      <td className="money">{d.qty}</td>
                      <td className="money" style={{ color: 'var(--gold-700)', fontWeight: 600 }}>{fmtM(d.amount)}</td>
                      <td className="money">{salesAnalytics.totalRevenue > 0 ? (d.amount / salesAnalytics.totalRevenue * 100).toFixed(1) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stock value by category */}
          <div className="card" style={{ marginTop: 16, padding: 0 }}>
            <div className="card-header"><h3>庫存價值分析</h3></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>類別</th><th style={{ textAlign: 'right' }}>商品數</th><th style={{ textAlign: 'right' }}>總庫存</th><th style={{ textAlign: 'right' }}>庫存成本</th><th style={{ textAlign: 'right' }}>庫存零售值</th></tr>
                </thead>
                <tbody>
                  {CATEGORIES.map(cat => {
                    const catProducts = products.filter(p => p.category === cat);
                    const totalStock = catProducts.reduce((s, p) => s + Number(p.stock || 0), 0);
                    const costValue = catProducts.reduce((s, p) => s + Number(p.stock || 0) * Number(p.cost || 0), 0);
                    const retailValue = catProducts.reduce((s, p) => s + Number(p.stock || 0) * Number(p.price || 0), 0);
                    return (
                      <tr key={cat}>
                        <td style={{ fontWeight: 600 }}>{cat}</td>
                        <td className="money">{catProducts.length}</td>
                        <td className="money">{totalStock}</td>
                        <td className="money">{fmtM(costValue)}</td>
                        <td className="money" style={{ color: 'var(--gold-700)', fontWeight: 600 }}>{fmtM(retailValue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add/Edit Product Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)} role="dialog" aria-modal="true" aria-label={editItem ? '編輯商品' : '新增商品'}>
          <div className="modal" onClick={e => e.stopPropagation()} ref={modalRef} style={{ maxWidth: 550 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>{editItem ? '編輯商品' : '新增商品'}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowModal(false)} aria-label="關閉">✕</button>
            </div>
            <form onSubmit={handleSaveProduct}>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div><label>商品名稱 *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例：靈芝孢子粉" style={formErrors.name ? { borderColor: '#dc2626' } : {}} />{formErrors.name && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 2 }}>{formErrors.name}</div>}</div>
                <div><label>類別</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div><label>售價 ($)</label><input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} style={formErrors.price ? { borderColor: '#dc2626' } : {}} />{formErrors.price && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 2 }}>{formErrors.price}</div>}</div>
                <div><label>成本 ($)</label><input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} style={formErrors.cost ? { borderColor: '#dc2626' } : {}} />{formErrors.cost && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 2 }}>{formErrors.cost}</div>}</div>
                <div><label>單位</label><input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="件" /></div>
              </div>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div><label>庫存</label><input type="number" min="0" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></div>
                <div><label>最低庫存</label><input type="number" min="0" value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} /></div>
                <div><label>店舖</label>
                  <select value={form.store} onChange={e => setForm({ ...form, store: e.target.value })}>
                    {STORES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label>條碼</label><input value={form.barcode || ''} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="選填" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-teal" disabled={saving}>{saving ? '儲存中...' : editItem ? '更新商品' : '新增商品'}</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sale Modal */}
      {showSaleModal && (
        <div className="modal-overlay" onClick={() => setShowSaleModal(false)} role="dialog" aria-modal="true" aria-label="新增銷售">
          <div className="modal" onClick={e => e.stopPropagation()} ref={saleRef} style={{ maxWidth: 450 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>新增銷售</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowSaleModal(false)} aria-label="關閉">✕</button>
            </div>
            <form onSubmit={handleSale}>
              <div style={{ marginBottom: 12 }}>
                <label>商品 *</label>
                <select value={saleForm.productId} onChange={e => setSaleForm({ ...saleForm, productId: e.target.value })}>
                  {products.filter(p => p.active !== false).map(p => (
                    <option key={p.id} value={p.id}>{p.name} — {fmtM(p.price)} (庫存: {p.stock})</option>
                  ))}
                </select>
              </div>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div><label>數量</label><input type="number" min="1" value={saleForm.quantity} onChange={e => setSaleForm({ ...saleForm, quantity: e.target.value })} /></div>
                <div><label>付款方式</label>
                  <select value={saleForm.payment} onChange={e => setSaleForm({ ...saleForm, payment: e.target.value })}>
                    {PAYMENTS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div><label>客人姓名</label><input value={saleForm.patientName} onChange={e => setSaleForm({ ...saleForm, patientName: e.target.value })} placeholder="選填" /></div>
                <div><label>店舖</label>
                  <select value={saleForm.store} onChange={e => setSaleForm({ ...saleForm, store: e.target.value })}>
                    {STORES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              {selectedSaleProduct && (
                <div style={{ background: 'var(--teal-50)', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 12, color: 'var(--teal-700)' }}>
                  小計：<strong>{fmtM(Number(selectedSaleProduct.price || 0) * (parseInt(saleForm.quantity) || 1))}</strong>
                  <span style={{ marginLeft: 12 }}>售後庫存：<strong>{Number(selectedSaleProduct.stock) - (parseInt(saleForm.quantity) || 1)}</strong></span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-green" disabled={saving}>{saving ? '處理中...' : '確認銷售'}</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowSaleModal(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId && <ConfirmModal message="確認刪除此商品？" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />}
    </>
  );
}
