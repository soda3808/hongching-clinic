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

  // ── Product CRUD ──
  const openAdd = () => { setEditItem(null); setForm({ ...EMPTY_PRODUCT }); setShowModal(true); };
  const openEdit = (item) => { setEditItem(item); setForm({ ...item }); setShowModal(true); };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!form.name) return showToast('請填寫商品名稱');
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
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {tab === 'catalog' && (
            <>
              <input placeholder="搜尋商品..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 180 }} />
              <button className="btn btn-teal" onClick={openAdd}>+ 新增商品</button>
            </>
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
                <div><label>商品名稱 *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例：靈芝孢子粉" /></div>
                <div><label>類別</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div><label>售價 ($)</label><input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>
                <div><label>成本 ($)</label><input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></div>
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
