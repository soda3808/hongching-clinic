import { useState, useMemo, useRef } from 'react';
import { saveInventory, deleteInventory } from '../api';
import { uid, fmtM, TCM_HERBS } from '../data';
import { exportCSV } from '../utils/export';
import { useFocusTrap, nullRef } from './ConfirmModal';
import ConfirmModal from './ConfirmModal';

const CATEGORIES = ['中藥', '耗材', '器材', '其他'];
const UNITS = ['g', 'kg', '件', '包', '盒'];
const STORES = ['宋皇臺', '太子', '兩店共用'];

const EMPTY_FORM = {
  name: '', category: '中藥', unit: 'g', stock: 0, minStock: 100,
  costPerUnit: 0, supplier: '', store: '宋皇臺', lastRestocked: '', active: true,
  medicineCode: '',
};

export default function InventoryPage({ data, setData, showToast }) {
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [search, setSearch] = useState('');
  const [filterStore, setFilterStore] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [deleteId, setDeleteId] = useState(null);
  const [restockItem, setRestockItem] = useState(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockCost, setRestockCost] = useState('');
  const [herbSuggestions, setHerbSuggestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [batchSelected, setBatchSelected] = useState([]);
  const [showBatchRestock, setShowBatchRestock] = useState(false);
  const [batchRestockQty, setBatchRestockQty] = useState('');
  const [showReport, setShowReport] = useState(false);

  const modalRef = useRef(null);
  const restockRef = useRef(null);
  useFocusTrap(showModal ? modalRef : nullRef);
  useFocusTrap(restockItem ? restockRef : nullRef);

  const inventory = data.inventory || [];

  // ── Stats ──
  const stats = useMemo(() => {
    const total = inventory.length;
    const lowStock = inventory.filter(r => Number(r.stock) < Number(r.minStock)).length;
    const totalValue = inventory.reduce((s, r) => s + Number(r.stock) * Number(r.costPerUnit), 0);
    const categories = new Set(inventory.map(r => r.category)).size;
    return { total, lowStock, totalValue, categories };
  }, [inventory]);

  // ── Filtered & sorted list ──
  const list = useMemo(() => {
    let l = [...inventory];
    if (search) {
      const q = search.toLowerCase();
      l = l.filter(r => r.name.toLowerCase().includes(q));
    }
    if (filterStore !== 'all') l = l.filter(r => r.store === filterStore);
    if (filterStatus === 'low') l = l.filter(r => Number(r.stock) < Number(r.minStock));
    if (filterStatus === 'normal') l = l.filter(r => Number(r.stock) >= Number(r.minStock));
    l.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, 'zh-Hant');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return l;
  }, [inventory, search, filterStore, filterStatus, sortBy, sortDir]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const sortIcon = (col) => {
    if (sortBy !== col) return ' ↕';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  };

  // ── Herb autocomplete ──
  const handleNameChange = (val) => {
    setForm(f => ({ ...f, name: val }));
    if (val.length > 0) {
      const matches = TCM_HERBS.filter(h => h.includes(val)).slice(0, 8);
      setHerbSuggestions(matches);
    } else {
      setHerbSuggestions([]);
    }
  };

  const selectHerb = (herb) => {
    setForm(f => ({ ...f, name: herb }));
    setHerbSuggestions([]);
  };

  // ── Add / Edit ──
  const openAdd = () => {
    setEditItem(null);
    setForm({ ...EMPTY_FORM });
    setHerbSuggestions([]);
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ ...item });
    setHerbSuggestions([]);
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name) return showToast('請填寫品名');
    setSaving(true);
    const record = {
      ...form,
      id: editItem ? editItem.id : uid(),
      stock: parseFloat(form.stock) || 0,
      minStock: parseFloat(form.minStock) || 100,
      costPerUnit: parseFloat(form.costPerUnit) || 0,
    };
    await saveInventory(record);
    const updated = editItem
      ? inventory.map(r => r.id === record.id ? record : r)
      : [...inventory, record];
    setData({ ...data, inventory: updated });
    setShowModal(false);
    setSaving(false);
    showToast(editItem ? '已更新存貨' : '已新增存貨');
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteInventory(deleteId);
    setData({ ...data, inventory: inventory.filter(r => r.id !== deleteId) });
    showToast('已刪除');
    setDeleteId(null);
  };

  // ── Restock ──
  const openRestock = (item) => {
    setRestockItem(item);
    setRestockQty('');
    setRestockCost('');
  };

  const handleRestock = async () => {
    if (!restockItem || !restockQty) return;
    const qty = parseFloat(restockQty) || 0;
    if (qty <= 0) return showToast('請輸入有效數量');
    const today = new Date().toISOString().split('T')[0];
    const updated = {
      ...restockItem,
      stock: Number(restockItem.stock) + qty,
      lastRestocked: today,
    };
    if (restockCost) updated.costPerUnit = parseFloat(restockCost);
    await saveInventory(updated);
    setData({ ...data, inventory: inventory.map(r => r.id === updated.id ? updated : r) });
    showToast(`已入貨 ${qty}${restockItem.unit}，現有庫存 ${updated.stock}${restockItem.unit}`);
    setRestockItem(null);
  };

  // ── Batch toggle ──
  const toggleBatch = (id) => {
    setBatchSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleBatchAll = () => {
    if (batchSelected.length === list.length) setBatchSelected([]);
    else setBatchSelected(list.map(r => r.id));
  };

  // ── Batch restock ──
  const handleBatchRestock = async () => {
    const qty = parseFloat(batchRestockQty) || 0;
    if (qty <= 0 || !batchSelected.length) return showToast('請輸入有效數量');
    const today = new Date().toISOString().split('T')[0];
    let updated = [...inventory];
    for (const id of batchSelected) {
      const idx = updated.findIndex(r => r.id === id);
      if (idx >= 0) {
        const item = { ...updated[idx], stock: Number(updated[idx].stock) + qty, lastRestocked: today };
        updated[idx] = item;
        await saveInventory(item);
      }
    }
    setData({ ...data, inventory: updated });
    showToast(`已批量入貨 ${batchSelected.length} 項，每項 +${qty}`);
    setShowBatchRestock(false);
    setBatchSelected([]);
    setBatchRestockQty('');
  };

  // ── Export CSV ──
  const handleExport = () => {
    const cols = [
      { key: 'medicineCode', label: '藥材編號' },
      { key: 'name', label: '品名' },
      { key: 'category', label: '分類' },
      { key: 'stock', label: '庫存' },
      { key: 'unit', label: '單位' },
      { key: 'minStock', label: '最低庫存' },
      { key: 'costPerUnit', label: '單位成本' },
      { key: 'value', label: '存貨價值' },
      { key: 'supplier', label: '供應商' },
      { key: 'store', label: '店舖' },
      { key: 'lastRestocked', label: '最後入貨' },
    ];
    const rows = list.map(r => ({ ...r, value: Number(r.stock) * Number(r.costPerUnit) }));
    exportCSV(rows, cols, `inventory_${new Date().toISOString().substring(0, 10)}.csv`);
    showToast('存貨清單已匯出');
  };

  // ── Category report ──
  const categoryReport = useMemo(() => {
    const map = {};
    inventory.forEach(r => {
      const cat = r.category || '其他';
      if (!map[cat]) map[cat] = { count: 0, value: 0, lowStock: 0 };
      map[cat].count++;
      map[cat].value += Number(r.stock) * Number(r.costPerUnit);
      if (Number(r.stock) < Number(r.minStock)) map[cat].lowStock++;
    });
    return Object.entries(map).sort((a, b) => b[1].value - a[1].value);
  }, [inventory]);

  // ══════════════════════════════════
  // Render
  // ══════════════════════════════════
  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">總品項</div><div className="stat-value teal">{stats.total}</div></div>
        <div className="stat-card red"><div className="stat-label">低庫存品項</div><div className="stat-value red">{stats.lowStock}</div></div>
        <div className="stat-card gold"><div className="stat-label">存貨總值</div><div className="stat-value gold">{fmtM(stats.totalValue)}</div></div>
        <div className="stat-card green"><div className="stat-label">分類數</div><div className="stat-value green">{stats.categories}</div></div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ flex: 1, minWidth: 200 }} placeholder="搜尋品名..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ width: 'auto' }} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
          <option value="all">所有店舖</option>
          <option>宋皇臺</option><option>太子</option><option>兩店共用</option>
        </select>
        <select style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">所有狀態</option>
          <option value="low">低庫存</option>
          <option value="normal">充足</option>
        </select>
        <button className="btn btn-teal" onClick={openAdd}>+ 新增存貨</button>
        <button className="btn btn-outline" onClick={handleExport}>匯出CSV</button>
        {batchSelected.length > 0 && (
          <button className="btn btn-green" onClick={() => setShowBatchRestock(true)}>批量入貨 ({batchSelected.length})</button>
        )}
        <button className="btn btn-outline" onClick={() => setShowReport(!showReport)}>{showReport ? '隱藏報表' : '庫存報表'}</button>
      </div>

      {/* Category Report */}
      {showReport && (
        <div className="card">
          <div className="card-header"><h3>庫存分類報表</h3></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>分類</th><th>品項數</th><th style={{ textAlign: 'right' }}>存貨價值</th><th>低庫存</th></tr>
              </thead>
              <tbody>
                {categoryReport.map(([cat, info]) => (
                  <tr key={cat}>
                    <td style={{ fontWeight: 600 }}>{cat}</td>
                    <td>{info.count}</td>
                    <td className="money">{fmtM(info.value)}</td>
                    <td>{info.lowStock > 0 ? <span className="tag tag-overdue">{info.lowStock} 項</span> : <span className="tag tag-paid">正常</span>}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: 'var(--gray-50)' }}>
                  <td>合計</td>
                  <td>{categoryReport.reduce((s, [, i]) => s + i.count, 0)}</td>
                  <td className="money">{fmtM(categoryReport.reduce((s, [, i]) => s + i.value, 0))}</td>
                  <td>{categoryReport.reduce((s, [, i]) => s + i.lowStock, 0)} 項低庫存</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header">
          <h3>存貨清單 ({list.length} 項)</h3>
        </div>
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }}><input type="checkbox" checked={batchSelected.length === list.length && list.length > 0} onChange={toggleBatchAll} /></th>
                <th>編號</th>
                <th className="sortable-th" onClick={() => toggleSort('name')}>品名{sortIcon('name')}</th>
                <th>分類</th>
                <th>庫存</th>
                <th>最低庫存</th>
                <th style={{ textAlign: 'right' }}>單位成本</th>
                <th style={{ textAlign: 'right' }}>存貨價值</th>
                <th>供應商</th>
                <th>店舖</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {!list.length && (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>未有存貨紀錄</td></tr>
              )}
              {list.map(r => {
                const isLow = Number(r.stock) < Number(r.minStock);
                const value = Number(r.stock) * Number(r.costPerUnit);
                return (
                  <tr key={r.id}>
                    <td><input type="checkbox" checked={batchSelected.includes(r.id)} onChange={() => toggleBatch(r.id)} /></td>
                    <td style={{ fontSize: 11, color: 'var(--gray-400)' }}>{r.medicineCode || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>
                      <span style={{ background: 'var(--gray-100)', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>
                        {r.category}
                      </span>
                    </td>
                    <td>{r.stock} {r.unit}</td>
                    <td>{r.minStock} {r.unit}</td>
                    <td className="money">{fmtM(r.costPerUnit)}</td>
                    <td className="money">{fmtM(value)}</td>
                    <td style={{ color: 'var(--gray-500)', fontSize: 12 }}>{r.supplier || '-'}</td>
                    <td>{r.store}</td>
                    <td>
                      <span className={`tag ${isLow ? 'tag-overdue' : 'tag-paid'}`}>
                        {isLow ? '低庫存' : '充足'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-green btn-sm" onClick={() => openRestock(r)}>入貨</button>
                        <button className="btn btn-outline btn-sm" onClick={() => openEdit(r)}>編輯</button>
                        <button className="btn btn-red btn-sm" onClick={() => setDeleteId(r.id)}>刪除</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════════════════════════════════ */}
      {/* Add / Edit Modal               */}
      {/* ════════════════════════════════ */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)} role="dialog" aria-modal="true" aria-label={editItem ? '編輯存貨' : '新增存貨'}>
          <div className="modal" onClick={e => e.stopPropagation()} ref={modalRef} style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>{editItem ? '編輯存貨' : '新增存貨'}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowModal(false)} aria-label="關閉">✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: 12 }}>
                <label>藥材編號</label>
                <input value={form.medicineCode || ''} onChange={e => setForm({ ...form, medicineCode: e.target.value })} placeholder="例: H001" />
              </div>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div style={{ position: 'relative' }}>
                  <label>品名 *</label>
                  <input
                    value={form.name}
                    onChange={e => handleNameChange(e.target.value)}
                    onFocus={() => { if (form.name) handleNameChange(form.name); }}
                    onBlur={() => setTimeout(() => setHerbSuggestions([]), 150)}
                    placeholder="例: 黃芪"
                  />
                  {herbSuggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 180, overflowY: 'auto' }}>
                      {herbSuggestions.map(h => (
                        <div key={h} onMouseDown={() => selectHerb(h)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--gray-100)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-50)'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                          {h}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label>分類</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div>
                  <label>單位</label>
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label>庫存數量</label>
                  <input type="number" min="0" step="any" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
                </div>
                <div>
                  <label>最低庫存</label>
                  <input type="number" min="0" step="any" value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} />
                </div>
              </div>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div>
                  <label>單位成本 ($)</label>
                  <input type="number" min="0" step="0.01" value={form.costPerUnit} onChange={e => setForm({ ...form, costPerUnit: e.target.value })} />
                </div>
                <div>
                  <label>供應商</label>
                  <input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="供應商名稱" />
                </div>
                <div>
                  <label>店舖</label>
                  <select value={form.store} onChange={e => setForm({ ...form, store: e.target.value })}>
                    {STORES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button type="submit" className="btn btn-teal" disabled={saving}>
                  {saving ? '儲存中...' : editItem ? '更新存貨' : '新增存貨'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* Quick Restock Modal             */}
      {/* ════════════════════════════════ */}
      {restockItem && (
        <div className="modal-overlay" onClick={() => setRestockItem(null)} role="dialog" aria-modal="true" aria-label="快速入貨">
          <div className="modal" onClick={e => e.stopPropagation()} ref={restockRef} style={{ maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>入貨 — {restockItem.name}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setRestockItem(null)} aria-label="關閉">✕</button>
            </div>
            <div style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <div className="grid-2">
                <div><strong>現有庫存：</strong>{restockItem.stock} {restockItem.unit}</div>
                <div><strong>最低庫存：</strong>{restockItem.minStock} {restockItem.unit}</div>
                <div><strong>現時成本：</strong>{fmtM(restockItem.costPerUnit)}/{restockItem.unit}</div>
                <div><strong>店舖：</strong>{restockItem.store}</div>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>入貨數量 ({restockItem.unit}) *</label>
              <input type="number" min="1" step="any" value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="輸入數量" autoFocus />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>新單位成本 ($)（可選）</label>
              <input type="number" min="0" step="0.01" value={restockCost} onChange={e => setRestockCost(e.target.value)} placeholder={`不填則維持 ${fmtM(restockItem.costPerUnit)}`} />
            </div>
            {restockQty && Number(restockQty) > 0 && (
              <div style={{ background: 'var(--teal-50)', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 12, color: 'var(--teal-700)' }}>
                入貨後庫存：<strong>{Number(restockItem.stock) + Number(restockQty)} {restockItem.unit}</strong>
                {restockCost && <span> | 新成本：<strong>{fmtM(parseFloat(restockCost))}/{restockItem.unit}</strong></span>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-green" onClick={handleRestock}>確認入貨</button>
              <button className="btn btn-outline" onClick={() => setRestockItem(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Restock Modal */}
      {showBatchRestock && (
        <div className="modal-overlay" onClick={() => setShowBatchRestock(false)} role="dialog" aria-modal="true" aria-label="批量入貨">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>批量入貨 ({batchSelected.length} 項)</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowBatchRestock(false)} aria-label="關閉">✕</button>
            </div>
            <div style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
              已選品項：{batchSelected.map(id => inventory.find(r => r.id === id)?.name).filter(Boolean).join('、')}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>每項增加數量 *</label>
              <input type="number" min="1" step="any" value={batchRestockQty} onChange={e => setBatchRestockQty(e.target.value)} placeholder="輸入數量" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-green" onClick={handleBatchRestock}>確認批量入貨</button>
              <button className="btn btn-outline" onClick={() => setShowBatchRestock(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <ConfirmModal
          message="確認刪除此存貨紀錄？此操作無法復原。"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </>
  );
}
