import { useState, useMemo, useRef, useEffect } from 'react';
import { saveInventory, deleteInventory, loadSupplierList, persistSupplierList, removeSupplier, loadStockMovements, persistStockMovement, clearStockMovementsRemote } from '../api';
import { uid, fmtM, TCM_HERBS } from '../data';
import { exportCSV } from '../utils/export';
import { parseInventoryXLS, getImportSummary } from '../utils/inventoryImport';
import { useFocusTrap, nullRef } from './ConfirmModal';
import ConfirmModal from './ConfirmModal';
import { getTenantStoreNames, getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';
import { S, ECTCM, rowStyle, statusTag } from '../styles/ectcm';

const CATEGORIES = ['中藥', '耗材', '器材', '其他'];
const UNITS = ['g', 'kg', '件', '包', '盒'];
const STORES = [...getTenantStoreNames(), '兩店共用'];

const EMPTY_FORM = {
  name: '', category: '中藥', unit: 'g', stock: 0, minStock: 100,
  costPerUnit: 0, supplier: '', store: getTenantStoreNames()[0] || '', lastRestocked: '', active: true,
  medicineCode: '', expiryDate: '',
};

export default function InventoryPage({ data, setData, showToast, onNavigate }) {
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
  const [showImport, setShowImport] = useState(false);
  const [importRecords, setImportRecords] = useState([]);
  const [importSelected, setImportSelected] = useState([]);
  const [importSummary, setImportSummary] = useState(null);
  const [importing, setImporting] = useState(false);
  const [showPO, setShowPO] = useState(false);
  const [transferItem, setTransferItem] = useState(null);
  const [transferQty, setTransferQty] = useState('');
  // ── Supplier Directory (#110) ──
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [supplierList, setSupplierList] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_suppliers') || '[]'); } catch { return []; }
  });
  const [supplierModal, setSupplierModal] = useState(false);
  const [editSupplierItem, setEditSupplierItem] = useState(null);
  const [supplierForm, setSupplierForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', paymentTerms: '', leadTimeDays: '', notes: '' });
  // ── Stock Movement History (#111) ──
  const [showMovements, setShowMovements] = useState(false);
  const [movements, setMovements] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_stock_movements') || '[]'); } catch { return []; }
  });
  const [movementFilter, setMovementFilter] = useState('all');
  const fileInputRef = useRef(null);

  const modalRef = useRef(null);
  const restockRef = useRef(null);
  useFocusTrap(showModal ? modalRef : nullRef);
  useFocusTrap(restockItem ? restockRef : nullRef);

  const inventory = data.inventory || [];

  // Load from Supabase on mount (overrides localStorage if available)
  useEffect(() => {
    loadSupplierList().then(s => { if (s) setSupplierList(s); });
    loadStockMovements().then(m => { if (m) setMovements(m); });
  }, []);

  // ── Movement Logger (#111) ──
  const logMovement = (type, itemName, qty, unit, details = '') => {
    const entry = { id: uid(), date: new Date().toISOString(), type, itemName, qty, unit, details };
    const updated = [entry, ...movements].slice(0, 500); // keep last 500
    setMovements(updated);
    localStorage.setItem('hcmc_stock_movements', JSON.stringify(updated));
    persistStockMovement(entry);
  };

  // ── Stats ──
  const stats = useMemo(() => {
    const total = inventory.length;
    const lowStock = inventory.filter(r => Number(r.stock) < Number(r.minStock)).length;
    const totalValue = inventory.reduce((s, r) => s + Number(r.stock) * Number(r.costPerUnit), 0);
    const categories = new Set(inventory.map(r => r.category)).size;
    // Expiry tracking (#91)
    const today = new Date().toISOString().substring(0, 10);
    const in7 = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().substring(0, 10); })();
    const in30 = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().substring(0, 10); })();
    const in90 = (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().substring(0, 10); })();
    const expired = inventory.filter(r => r.expiryDate && r.expiryDate <= today);
    const expiring7 = inventory.filter(r => r.expiryDate && r.expiryDate > today && r.expiryDate <= in7);
    const expiring30 = inventory.filter(r => r.expiryDate && r.expiryDate > today && r.expiryDate <= in30);
    const expiring90 = inventory.filter(r => r.expiryDate && r.expiryDate > today && r.expiryDate <= in90);
    const expiredValue = expired.reduce((s, r) => s + Number(r.stock) * Number(r.costPerUnit), 0);
    return { total, lowStock, totalValue, categories, expired, expiring7, expiring30, expiring90, expiredValue };
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
    if (filterStatus === 'expired') {
      const today = new Date().toISOString().substring(0, 10);
      l = l.filter(r => r.expiryDate && r.expiryDate <= today);
    }
    if (filterStatus === 'expiring') {
      const today = new Date().toISOString().substring(0, 10);
      const in30 = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().substring(0, 10); })();
      l = l.filter(r => r.expiryDate && r.expiryDate > today && r.expiryDate <= in30);
    }
    l.sort((a, b) => {
      // Always pin low stock / out-of-stock items to top
      const aLow = Number(a.stock) < Number(a.minStock) ? 1 : 0;
      const bLow = Number(b.stock) < Number(b.minStock) ? 1 : 0;
      if (aLow !== bLow) return bLow - aLow; // low stock first
      // Then expired items
      const today = new Date().toISOString().substring(0, 10);
      const aExp = a.expiryDate && a.expiryDate <= today ? 1 : 0;
      const bExp = b.expiryDate && b.expiryDate <= today ? 1 : 0;
      if (aExp !== bExp) return bExp - aExp; // expired first
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
    if (editItem) {
      const oldStock = Number(editItem.stock);
      const newStock = record.stock;
      if (oldStock !== newStock) logMovement('調整', record.name, newStock - oldStock, record.unit, `${oldStock} → ${newStock}`);
    } else {
      logMovement('新增', record.name, record.stock, record.unit, '新品項入庫');
    }
    showToast(editItem ? '已更新存貨' : '已新增存貨');
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteId) return;
    const item = inventory.find(r => r.id === deleteId);
    await deleteInventory(deleteId);
    setData({ ...data, inventory: inventory.filter(r => r.id !== deleteId) });
    if (item) logMovement('刪除', item.name, -Number(item.stock), item.unit, '品項刪除');
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
    logMovement('入貨', restockItem.name, qty, restockItem.unit, `${restockItem.stock} → ${updated.stock}${restockCost ? ` | 成本更新 ${fmtM(parseFloat(restockCost))}` : ''}`);
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
    batchSelected.forEach(id => {
      const item = inventory.find(r => r.id === id);
      if (item) logMovement('批量入貨', item.name, qty, item.unit, `批量 +${qty}`);
    });
    showToast(`已批量入貨 ${batchSelected.length} 項，每項 +${qty}`);
    setShowBatchRestock(false);
    setBatchSelected([]);
    setBatchRestockQty('');
  };

  // ── Bulk Import ──
  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const records = parseInventoryXLS(ev.target.result);
        if (!records.length) return showToast('未能解析任何藥材記錄');
        // Filter out already existing items
        const existingNames = new Set(inventory.map(i => i.name));
        const newRecords = records.map(r => ({ ...r, isNew: !existingNames.has(r.name), isDuplicate: existingNames.has(r.name) }));
        setImportRecords(newRecords);
        setImportSelected(newRecords.filter(r => r.isNew).map(r => r.id));
        setImportSummary(getImportSummary(records));
        setShowImport(true);
      } catch (err) {
        showToast('解析失敗：' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const fakeEvent = { target: { files: [file], value: '' } };
    handleFileImport(fakeEvent);
  };

  const handleBulkImport = async () => {
    if (!importSelected.length) return showToast('請選擇要匯入的項目');
    setImporting(true);
    const toImport = importRecords.filter(r => importSelected.includes(r.id));
    let added = 0;
    for (const record of toImport) {
      const item = {
        id: uid(), name: record.name, category: record.category || '中藥',
        unit: record.unit || 'g', stock: record.stock || 0, minStock: record.minStock || 100,
        costPerUnit: record.price || 0, supplier: record.supplier || '',
        store: record.store || getTenantStoreNames()[0] || '', medicineCode: record.code || '',
        lastRestocked: '', active: true,
      };
      await saveInventory(item);
      setData(prev => ({ ...prev, inventory: [...(prev.inventory || []), item] }));
      logMovement('匯入', item.name, item.stock, item.unit, '批量匯入');
      added++;
    }
    showToast(`已匯入 ${added} 項藥材`);
    setShowImport(false);
    setImportRecords([]);
    setImporting(false);
  };

  const toggleImportItem = (id) => {
    setImportSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // ── Purchase Order ──
  const lowStockItems = useMemo(() => inventory.filter(r => Number(r.stock) < Number(r.minStock)), [inventory]);

  const printPurchaseOrder = () => {
    const w = window.open('', '_blank');
    if (!w) return showToast('請允許彈出視窗');
    const today = new Date().toISOString().substring(0, 10);
    const rows = lowStockItems.map(r => {
      const orderQty = Math.max(Number(r.minStock) * 2 - Number(r.stock), Number(r.minStock));
      return `<tr><td>${escapeHtml(r.medicineCode || '-')}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.category)}</td><td>${r.stock} ${escapeHtml(r.unit)}</td><td>${r.minStock} ${escapeHtml(r.unit)}</td><td style="font-weight:700;color:#0e7490">${orderQty} ${escapeHtml(r.unit)}</td><td>${escapeHtml(r.supplier || '-')}</td></tr>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>採購單</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:30px;max-width:900px;margin:0 auto}
      h1{color:#0e7490;font-size:20px;border-bottom:3px solid #0e7490;padding-bottom:8px}
      .info{font-size:13px;color:#666;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#0e7490;color:#fff;padding:8px;text-align:left}
      td{padding:6px 8px;border-bottom:1px solid #ddd}
      tr:nth-child(even){background:#f9fafb}
      .footer{margin-top:30px;font-size:11px;color:#999;text-align:center}
      @media print{body{padding:10px}}
    </style></head><body>
      <h1>${escapeHtml(getClinicName())} — 藥材採購單</h1>
      <div class="info">日期：${today} | 低庫存品項：${lowStockItems.length} 項</div>
      <table><thead><tr><th>編號</th><th>品名</th><th>分類</th><th>現有庫存</th><th>最低庫存</th><th>建議採購量</th><th>供應商</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="footer">此採購單由系統自動生成 | 請核實後再向供應商下單</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
    showToast('正在列印採購單');
  };

  // ── Stock Transfer Between Stores (#60) ──
  const handleTransfer = async () => {
    if (!transferItem || !transferQty) return;
    const qty = parseFloat(transferQty) || 0;
    if (qty <= 0) return showToast('請輸入有效數量');
    if (qty > Number(transferItem.stock)) return showToast('轉移數量不能超過現有庫存');
    const fromStore = transferItem.store;
    const storeNames = getTenantStoreNames();
    const toStore = storeNames.find(s => s !== fromStore) || storeNames[0];
    // Deduct from source
    const updatedSource = { ...transferItem, stock: Number(transferItem.stock) - qty };
    await saveInventory(updatedSource);
    // Find or create target item
    const existing = inventory.find(r => r.name === transferItem.name && r.store === toStore);
    let updatedInv;
    if (existing) {
      const updatedTarget = { ...existing, stock: Number(existing.stock) + qty };
      await saveInventory(updatedTarget);
      updatedInv = inventory.map(r => r.id === updatedSource.id ? updatedSource : r.id === updatedTarget.id ? updatedTarget : r);
    } else {
      const newItem = { ...transferItem, id: uid(), store: toStore, stock: qty, lastRestocked: new Date().toISOString().split('T')[0] };
      await saveInventory(newItem);
      updatedInv = inventory.map(r => r.id === updatedSource.id ? updatedSource : r).concat(newItem);
    }
    setData({ ...data, inventory: updatedInv });
    logMovement('轉倉', transferItem.name, qty, transferItem.unit, `${fromStore} → ${toStore}`);
    showToast(`已將 ${qty}${transferItem.unit} ${transferItem.name} 從${fromStore}轉至${toStore}`);
    setTransferItem(null);
    setTransferQty('');
  };

  // ── Supplier Directory (#110) ──
  const saveSupplierListLocal = (list) => {
    setSupplierList(list);
    localStorage.setItem('hcmc_suppliers', JSON.stringify(list));
    persistSupplierList(list);
  };

  const openAddSupplier = () => {
    setEditSupplierItem(null);
    setSupplierForm({ name: '', contactPerson: '', phone: '', email: '', address: '', paymentTerms: '', leadTimeDays: '', notes: '' });
    setSupplierModal(true);
  };

  const openEditSupplier = (s) => {
    setEditSupplierItem(s);
    setSupplierForm({ ...s });
    setSupplierModal(true);
  };

  const handleSaveSupplier = () => {
    if (!supplierForm.name) return showToast('請填寫供應商名稱');
    if (editSupplierItem) {
      saveSupplierListLocal(supplierList.map(s => s.id === editSupplierItem.id ? { ...supplierForm, id: editSupplierItem.id } : s));
      showToast('已更新供應商');
    } else {
      saveSupplierList([...supplierList, { ...supplierForm, id: uid(), createdAt: new Date().toISOString().substring(0, 10) }]);
      showToast('已新增供應商');
    }
    setSupplierModal(false);
  };

  const deleteSupplierById = (id) => {
    saveSupplierListLocal(supplierList.filter(s => s.id !== id));
    removeSupplier(id);
    showToast('已刪除供應商');
  };

  const supplierStats = useMemo(() => {
    const map = {};
    supplierList.forEach(s => { map[s.name] = { items: 0, value: 0 }; });
    inventory.forEach(r => {
      if (r.supplier && map[r.supplier]) {
        map[r.supplier].items++;
        map[r.supplier].value += Number(r.stock) * Number(r.costPerUnit);
      }
    });
    return map;
  }, [supplierList, inventory]);

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
      { key: 'expiryDate', label: '到期日' },
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
    <div style={S.page}>
      {/* eCTCM breadcrumb */}
      <div style={{ ...S.titleBar, background: '#b8d4d4', color: '#333', fontSize: 12, padding: '4px 12px' }}>藥物管理 &gt; 中藥管理</div>

      {/* Low Stock Quick Alert */}
      {stats.lowStock > 0 && filterStatus !== 'low' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>🔴</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#991b1b' }}>
              {stats.lowStock} 項藥材低於安全庫存
            </div>
            <div style={{ fontSize: 11, color: '#dc2626' }}>
              {inventory.filter(r => Number(r.stock) < Number(r.minStock)).slice(0, 5).map(r => `${r.name}(${r.stock}${r.unit})`).join('、')}
              {stats.lowStock > 5 ? '...' : ''}
            </div>
          </div>
          <button style={{ ...S.btnDanger, fontSize: 12 }} onClick={() => setFilterStatus('low')}>查看</button>
          <button style={{ ...S.actionBtnOrange, fontSize: 12 }} onClick={() => setShowPO(true)}>生成補貨單</button>
        </div>
      )}

      {/* Expiry Alerts (#91) */}
      {(stats.expired.length > 0 || stats.expiring7.length > 0 || stats.expiring30.length > 0) && (
        <div style={{ ...S.card, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#666' }}>到期提醒</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {stats.expired.length > 0 && (
              <div style={{ padding: '6px 12px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', cursor: 'pointer' }} onClick={() => setFilterStatus('expired')}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626' }}>{stats.expired.length}</div>
                <div style={{ fontSize: 10, color: '#991b1b' }}>已過期</div>
                <div style={{ fontSize: 9, color: '#b91c1c' }}>損失 {fmtM(stats.expiredValue)}</div>
              </div>
            )}
            {stats.expiring7.length > 0 && (
              <div style={{ padding: '6px 12px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', cursor: 'pointer' }} onClick={() => setFilterStatus('expiring')}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#d97706' }}>{stats.expiring7.length}</div>
                <div style={{ fontSize: 10, color: '#92400e' }}>7日內到期</div>
              </div>
            )}
            {stats.expiring30.length > 0 && (
              <div style={{ padding: '6px 12px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0369a1' }}>{stats.expiring30.length}</div>
                <div style={{ fontSize: 10, color: '#0c4a6e' }}>30日內到期</div>
              </div>
            )}
            {stats.expiring90.length > 0 && (
              <div style={{ padding: '6px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#666' }}>{stats.expiring90.length}</div>
                <div style={{ fontSize: 10, color: '#999' }}>90日內到期</div>
              </div>
            )}
          </div>
          {stats.expired.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#dc2626' }}>
              已過期：{stats.expired.slice(0, 5).map(r => r.name).join('、')}{stats.expired.length > 5 ? ` 等${stats.expired.length}項` : ''}
            </div>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div style={S.filterBar}>
        <span style={S.filterLabel}>搜尋:</span>
        <input style={{ ...S.filterInput, flex: 1, minWidth: 160 }} placeholder="搜尋品名..." value={search} onChange={e => setSearch(e.target.value)} />
        <span style={S.filterLabel}>店舖:</span>
        <select style={S.filterSelect} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
          <option value="all">所有店舖</option>
          {STORES.map(s => <option key={s}>{s}</option>)}
        </select>
        <button style={{ ...S.actionBtn, background: '#2e7d32', fontSize: 12, padding: '4px 12px' }} onClick={() => {}}>搜索</button>
        <button style={{ ...S.actionBtn, background: '#1565c0', fontSize: 12, padding: '4px 12px' }} onClick={() => { setSearch(''); setFilterStore('all'); setFilterStatus('all'); }}>刷新</button>
        <button style={{ ...S.actionBtn, background: '#2e7d32', fontSize: 12, padding: '4px 12px' }} onClick={handleExport}>導出Excel</button>
        <button style={{ ...S.actionBtn, background: '#00838f', fontSize: 12, padding: '4px 12px' }} onClick={() => {}}>進階查詢</button>
        <button style={{ ...S.actionBtn, background: '#455a64', fontSize: 12, padding: '4px 12px' }} onClick={() => {}}>藥物分析</button>
        <button style={{ ...S.actionBtn, background: '#388e3c', fontSize: 12, padding: '4px 12px' }} onClick={openAdd}>更多操作... ▼</button>
        <input ref={fileInputRef} type="file" accept=".xls,.xlsx,.html,.htm,.csv" style={{ display: 'none' }} onChange={handleFileImport} />
      </div>

      {/* Category Report */}
      {showReport && (
        <div style={S.card}>
          <div style={S.cardHeader}><h3 style={{ margin: 0, fontSize: 'inherit' }}>庫存分類報表</h3></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr><th style={S.th}>分類</th><th style={S.th}>品項數</th><th style={{ ...S.th, textAlign: 'right' }}>存貨價值</th><th style={S.th}>低庫存</th></tr>
              </thead>
              <tbody>
                {categoryReport.map(([cat, info], idx) => (
                  <tr key={cat} style={rowStyle(idx)}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{cat}</td>
                    <td style={S.td}>{info.count}</td>
                    <td style={{ ...S.td, ...S.money }}>{fmtM(info.value)}</td>
                    <td style={S.td}>{info.lowStock > 0 ? <span style={statusTag(info.lowStock + ' 項', 'red')}>{info.lowStock} 項</span> : <span style={statusTag('正常', 'green')}>正常</span>}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: '#f9fafb' }}>
                  <td style={S.td}>合計</td>
                  <td style={S.td}>{categoryReport.reduce((s, [, i]) => s + i.count, 0)}</td>
                  <td style={{ ...S.td, ...S.money }}>{fmtM(categoryReport.reduce((s, [, i]) => s + i.value, 0))}</td>
                  <td style={S.td}>{categoryReport.reduce((s, [, i]) => s + i.lowStock, 0)} 項低庫存</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <div style={{ background: ECTCM.cardBg }}>
        <div style={{ ...S.titleBar, fontSize: 12, padding: '4px 12px' }}>存貨清單 ({list.length} 項)</div>
        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 32 }}><input type="checkbox" checked={batchSelected.length === list.length && list.length > 0} onChange={toggleBatchAll} /></th>
                <th style={S.th}>編號</th>
                <th style={{ ...S.th, cursor: 'pointer' }} onClick={() => toggleSort('name')}>品名{sortIcon('name')}</th>
                <th style={S.th}>分類</th>
                <th style={S.th}>庫存</th>
                <th style={S.th}>最低庫存</th>
                <th style={{ ...S.th, textAlign: 'right' }}>單位成本</th>
                <th style={{ ...S.th, textAlign: 'right' }}>存貨價值</th>
                <th style={S.th}>到期日</th>
                <th style={S.th}>供應商</th>
                <th style={S.th}>店舖</th>
                <th style={S.th}>狀態</th>
                <th style={S.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {!list.length && (
                <tr><td colSpan={13} style={{ ...S.td, textAlign: 'center', padding: 40, color: '#aaa' }}>未有存貨紀錄</td></tr>
              )}
              {list.map((r, idx) => {
                const isLow = Number(r.stock) < Number(r.minStock);
                const value = Number(r.stock) * Number(r.costPerUnit);
                return (
                  <tr key={r.id} style={rowStyle(idx)}>
                    <td style={S.td}><input type="checkbox" checked={batchSelected.includes(r.id)} onChange={() => toggleBatch(r.id)} /></td>
                    <td style={{ ...S.td, fontSize: 11, color: ECTCM.textMuted }}>{r.medicineCode || '-'}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{r.name}</td>
                    <td style={S.td}>
                      <span style={{ background: '#f0f0f0', padding: '1px 6px', borderRadius: 2, fontSize: 10, fontWeight: 600 }}>
                        {r.category}
                      </span>
                    </td>
                    <td style={S.td}>{r.stock} {r.unit}</td>
                    <td style={S.td}>{r.minStock} {r.unit}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{fmtM(r.costPerUnit)}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{fmtM(value)}</td>
                    <td style={{ ...S.td, fontSize: 11 }}>{(() => {
                      if (!r.expiryDate) return <span style={{ color: ECTCM.textMuted }}>-</span>;
                      const today = new Date().toISOString().substring(0, 10);
                      const in30 = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().substring(0, 10); })();
                      if (r.expiryDate <= today) return <span style={{ color: '#cc0000', fontWeight: 700 }}>已過期 {r.expiryDate}</span>;
                      if (r.expiryDate <= in30) return <span style={{ color: '#cc6600', fontWeight: 600 }}>{r.expiryDate}</span>;
                      return r.expiryDate;
                    })()}</td>
                    <td style={{ ...S.td, color: ECTCM.textLight, fontSize: 12 }}>{r.supplier || '-'}</td>
                    <td style={S.td}>{r.store}</td>
                    <td style={S.td}>
                      <span style={statusTag(isLow ? '低庫存' : '充足', isLow ? 'red' : 'green')}>
                        {isLow ? '低庫存' : '充足'}
                      </span>
                    </td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ ...S.link, color: ECTCM.btnSuccess }} onClick={() => openRestock(r)}>入貨</span>
                        {r.store !== '兩店共用' && <span style={{ ...S.link, color: ECTCM.btnWarning }} onClick={() => { setTransferItem(r); setTransferQty(''); }}>轉倉</span>}
                        <span style={S.link} onClick={() => openEdit(r)}>編輯</span>
                        <span style={{ ...S.link, color: ECTCM.btnDanger }} onClick={() => setDeleteId(r.id)}>刪除</span>
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
        <div style={S.modalOverlay} onClick={() => setShowModal(false)} role="dialog" aria-modal="true" aria-label={editItem ? '編輯存貨' : '新增存貨'}>
          <div style={{ ...S.modal, maxWidth: 600 }} onClick={e => e.stopPropagation()} ref={modalRef}>
            <div style={S.modalHeader}>
              <span>{editItem ? '編輯存貨' : '新增存貨'}</span>
              <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }} onClick={() => setShowModal(false)} aria-label="關閉">✕</button>
            </div>
            <div style={S.modalBody}>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: 12 }}>
                <label>藥材編號</label>
                <input value={form.medicineCode || ''} onChange={e => setForm({ ...form, medicineCode: e.target.value })} placeholder="例: H001" />
              </div>
              <div style={{ ...S.grid2, marginBottom: 12 }}>
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
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 180, overflowY: 'auto' }}>
                      {herbSuggestions.map(h => (
                        <div key={h} onMouseDown={() => selectHerb(h)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0fdfa'}
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
              <div style={{ ...S.grid3, marginBottom: 12 }}>
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
              <div style={{ ...S.grid2, marginBottom: 12 }}>
                <div>
                  <label>單位成本 ($)</label>
                  <input type="number" min="0" step="0.01" value={form.costPerUnit} onChange={e => setForm({ ...form, costPerUnit: e.target.value })} />
                </div>
                <div>
                  <label>到期日</label>
                  <input type="date" value={form.expiryDate || ''} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
                </div>
              </div>
              <div style={{ ...S.grid3, marginBottom: 12 }}>
                <div>
                  <label>供應商</label>
                  <input list="supplier-list" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="選擇或輸入供應商" />
                  <datalist id="supplier-list">
                    {supplierList.map(s => <option key={s.id} value={s.name} />)}
                  </datalist>
                </div>
                <div>
                  <label>店舖</label>
                  <select value={form.store} onChange={e => setForm({ ...form, store: e.target.value })}>
                    {STORES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label>最後入貨</label>
                  <input type="date" value={form.lastRestocked || ''} onChange={e => setForm({ ...form, lastRestocked: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button type="submit" style={S.actionBtn} disabled={saving}>
                  {saving ? '儲存中...' : editItem ? '更新存貨' : '新增存貨'}
                </button>
                <button type="button" style={{ ...S.actionBtn, background: '#fff', color: '#333', border: '1px solid #ddd' }} onClick={() => setShowModal(false)}>取消</button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* Quick Restock Modal             */}
      {/* ════════════════════════════════ */}
      {restockItem && (
        <div style={S.modalOverlay} onClick={() => setRestockItem(null)} role="dialog" aria-modal="true" aria-label="快速入貨">
          <div style={{ ...S.modal, maxWidth: 400 }} onClick={e => e.stopPropagation()} ref={restockRef}>
            <div style={S.modalHeader}>
              <span>入貨 — {restockItem.name}</span>
              <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }} onClick={() => setRestockItem(null)} aria-label="關閉">✕</button>
            </div>
            <div style={S.modalBody}>
            <div style={{ background: '#f9fafb', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <div style={S.grid2}>
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
              <div style={{ background: '#f0fdfa', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#0f766e' }}>
                入貨後庫存：<strong>{Number(restockItem.stock) + Number(restockQty)} {restockItem.unit}</strong>
                {restockCost && <span> | 新成本：<strong>{fmtM(parseFloat(restockCost))}/{restockItem.unit}</strong></span>}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={S.actionBtnGreen} onClick={handleRestock}>確認入貨</button>
              <button style={{ ...S.actionBtn, background: '#fff', color: '#333', border: '1px solid #ddd' }} onClick={() => setRestockItem(null)}>取消</button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Restock Modal */}
      {showBatchRestock && (
        <div style={S.modalOverlay} onClick={() => setShowBatchRestock(false)} role="dialog" aria-modal="true" aria-label="批量入貨">
          <div style={{ ...S.modal, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <span>批量入貨 ({batchSelected.length} 項)</span>
              <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }} onClick={() => setShowBatchRestock(false)} aria-label="關閉">✕</button>
            </div>
            <div style={S.modalBody}>
            <div style={{ background: '#f9fafb', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
              已選品項：{batchSelected.map(id => inventory.find(r => r.id === id)?.name).filter(Boolean).join('、')}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>每項增加數量 *</label>
              <input type="number" min="1" step="any" value={batchRestockQty} onChange={e => setBatchRestockQty(e.target.value)} placeholder="輸入數量" autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={S.actionBtnGreen} onClick={handleBatchRestock}>確認批量入貨</button>
              <button style={{ ...S.actionBtn, background: '#fff', color: '#333', border: '1px solid #ddd' }} onClick={() => setShowBatchRestock(false)}>取消</button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* Bulk Import Modal              */}
      {/* ════════════════════════════════ */}
      {showImport && (
        <div style={S.modalOverlay} onClick={() => setShowImport(false)} role="dialog" aria-modal="true" aria-label="批量匯入">
          <div style={{ ...S.modal, maxWidth: 900, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <span>批量匯入藥材</span>
              <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }} onClick={() => setShowImport(false)} aria-label="關閉">✕</button>
            </div>
            <div style={S.modalBody}>
            {importSummary && (
              <div style={{ ...S.grid4, marginBottom: 16 }}>
                <div style={S.statCard}><div style={S.statLabel}>解析品項</div><div style={S.statValue}>{importSummary.total}</div></div>
                <div style={S.statCard}><div style={S.statLabel}>有庫存</div><div style={{ ...S.statValue, color: ECTCM.btnSuccess }}>{importSummary.withStock}</div></div>
                <div style={S.statCard}><div style={S.statLabel}>總庫存量</div><div style={{ ...S.statValue, color: ECTCM.btnWarning }}>{importSummary.totalStock}g</div></div>
                <div style={S.statCard}><div style={S.statLabel}>已選匯入</div><div style={{ ...S.statValue, color: ECTCM.btnDanger }}>{importSelected.length}</div></div>
              </div>
            )}
            {importSummary && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 12 }}>
                {Object.entries(importSummary.byType).map(([type, count]) => (
                  <span key={type} style={{ background: '#f3f4f6', padding: '4px 10px', borderRadius: 12 }}>{type}: {count}</span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={{ ...S.actionBtn, background: '#fff', color: '#333', border: '1px solid #ddd' }} onClick={() => setImportSelected(importRecords.filter(r => r.isNew).map(r => r.id))}>只選新品</button>
              <button style={{ ...S.actionBtn, background: '#fff', color: '#333', border: '1px solid #ddd' }} onClick={() => setImportSelected(importRecords.map(r => r.id))}>全選</button>
              <button style={{ ...S.actionBtn, background: '#fff', color: '#333', border: '1px solid #ddd' }} onClick={() => setImportSelected([])}>全不選</button>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
              <table style={S.table}>
                <thead><tr><th style={{ ...S.th, width: 32 }}></th><th style={S.th}>品名</th><th style={S.th}>編號</th><th style={S.th}>分類</th><th style={S.th}>庫存</th><th style={S.th}>店舖</th><th style={S.th}>狀態</th></tr></thead>
                <tbody>
                  {importRecords.map((r, idx) => (
                    <tr key={r.id} style={{ ...rowStyle(idx), opacity: importSelected.includes(r.id) ? 1 : 0.4 }}>
                      <td style={S.td}><input type="checkbox" checked={importSelected.includes(r.id)} onChange={() => toggleImportItem(r.id)} /></td>
                      <td style={{ ...S.td, fontWeight: 600 }}>{r.name}</td>
                      <td style={{ ...S.td, fontSize: 11 }}>{r.code}</td>
                      <td style={S.td}><span style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 10, fontSize: 10 }}>{r.category}</span></td>
                      <td style={S.td}>{r.stock} {r.unit}</td>
                      <td style={S.td}>{r.store}</td>
                      <td style={S.td}>{r.isDuplicate ? <span style={statusTag('已存在', 'orange')}>已存在</span> : <span style={statusTag('新品', 'green')}>新品</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button style={S.actionBtn} onClick={handleBulkImport} disabled={importing || !importSelected.length}>
                {importing ? '匯入中...' : `確認匯入 (${importSelected.length} 項)`}
              </button>
              <button style={{ ...S.actionBtn, background: '#fff', color: '#333', border: '1px solid #ddd' }} onClick={() => setShowImport(false)}>取消</button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* Purchase Order Modal            */}
      {/* ════════════════════════════════ */}
      {showPO && (
        <div style={S.modalOverlay} onClick={() => setShowPO(false)} role="dialog" aria-modal="true" aria-label="採購單">
          <div style={{ ...S.modal, maxWidth: 800, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <span>低庫存採購單 ({lowStockItems.length} 項)</span>
              <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }} onClick={() => setShowPO(false)} aria-label="關閉">✕</button>
            </div>
            <div style={S.modalBody}>
            <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
              <table style={S.table}>
                <thead><tr><th style={S.th}>品名</th><th style={S.th}>分類</th><th style={S.th}>現有庫存</th><th style={S.th}>最低庫存</th><th style={S.th}>建議採購量</th><th style={S.th}>供應商</th></tr></thead>
                <tbody>
                  {lowStockItems.map(r => {
                    const orderQty = Math.max(Number(r.minStock) * 2 - Number(r.stock), Number(r.minStock));
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td>{r.category}</td>
                        <td style={{ color: '#dc2626', fontWeight: 600 }}>{r.stock} {r.unit}</td>
                        <td>{r.minStock} {r.unit}</td>
                        <td style={{ color: '#0e7490', fontWeight: 700 }}>{orderQty} {r.unit}</td>
                        <td>{r.supplier || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button style={S.actionBtn} onClick={printPurchaseOrder}>列印採購單</button>
              <button style={{ ...S.actionBtn, background: '#fff', color: '#333', border: '1px solid #ddd' }} onClick={() => setShowPO(false)}>關閉</button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock Transfer Modal (#60) */}
      {transferItem && (
        <div style={S.modalOverlay} onClick={() => setTransferItem(null)} role="dialog" aria-modal="true" aria-label="庫存轉倉">
          <div style={{ ...S.modal, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <span>轉倉 — {transferItem.name}</span>
              <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }} onClick={() => setTransferItem(null)} aria-label="關閉">✕</button>
            </div>
            <div style={S.modalBody}>
            <div style={{ background: '#f9fafb', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <div style={S.grid2}>
                <div><strong>來源店舖：</strong>{transferItem.store}</div>
                <div><strong>目標店舖：</strong>{getTenantStoreNames().find(s => s !== transferItem.store) || getTenantStoreNames()[0]}</div>
                <div><strong>現有庫存：</strong>{transferItem.stock} {transferItem.unit}</div>
                <div><strong>分類：</strong>{transferItem.category}</div>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>轉移數量 ({transferItem.unit}) *</label>
              <input type="number" min="1" max={transferItem.stock} step="any" value={transferQty} onChange={e => setTransferQty(e.target.value)} placeholder="輸入數量" autoFocus />
            </div>
            {transferQty && Number(transferQty) > 0 && (
              <div style={{ background: '#fffbeb', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 12 }}>
                <div>📦 {transferItem.store}：{transferItem.stock} → <strong>{Number(transferItem.stock) - Number(transferQty)} {transferItem.unit}</strong></div>
                <div>📦 {getTenantStoreNames().find(s => s !== transferItem.store) || getTenantStoreNames()[0]}：+<strong>{transferQty} {transferItem.unit}</strong></div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={S.actionBtnOrange} onClick={handleTransfer}>確認轉倉</button>
              <button style={{ ...S.actionBtn, background: '#fff', color: '#333', border: '1px solid #ddd' }} onClick={() => setTransferItem(null)}>取消</button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* Stock Movement History (#111)   */}
      {/* ════════════════════════════════ */}
      {showMovements && (
        <div style={S.card}>
          <div style={{ ...S.cardHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 'inherit', color: 'inherit' }}>庫存變動紀錄</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select style={{ width: 'auto', fontSize: 12 }} value={movementFilter} onChange={e => setMovementFilter(e.target.value)}>
                <option value="all">全部類型</option>
                <option value="入貨">入貨</option>
                <option value="批量入貨">批量入貨</option>
                <option value="轉倉">轉倉</option>
                <option value="調整">調整</option>
                <option value="新增">新增</option>
                <option value="刪除">刪除</option>
                <option value="匯入">匯入</option>
              </select>
              {movements.length > 0 && (
                <button style={{ ...S.actionBtn, background: '#fff', color: '#333', border: '1px solid #ddd' }} onClick={() => {
                  const cols = [
                    { key: 'date', label: '日期' }, { key: 'type', label: '類型' },
                    { key: 'itemName', label: '品名' }, { key: 'qty', label: '數量' },
                    { key: 'unit', label: '單位' }, { key: 'details', label: '詳情' },
                  ];
                  exportCSV(movements, cols, `stock_movements_${new Date().toISOString().substring(0, 10)}.csv`);
                  showToast('變動紀錄已匯出');
                }}>匯出CSV</button>
              )}
              {movements.length > 0 && (
                <button style={S.btnDanger} onClick={() => { setMovements([]); localStorage.removeItem('hcmc_stock_movements'); clearStockMovementsRemote(); showToast('已清除紀錄'); }}>清除</button>
              )}
            </div>
          </div>
          {!movements.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>未有變動紀錄</div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
              <table style={S.table}>
                <thead><tr><th style={S.th}>時間</th><th style={S.th}>類型</th><th style={S.th}>品名</th><th style={S.th}>數量變動</th><th style={S.th}>詳情</th></tr></thead>
                <tbody>
                  {movements
                    .filter(m => movementFilter === 'all' || m.type === movementFilter)
                    .slice(0, 100)
                    .map(m => (
                    <tr key={m.id}>
                      <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(m.date).toLocaleString('zh-HK', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                          background: m.type === '入貨' || m.type === '批量入貨' ? '#dcfce7' : m.type === '轉倉' ? '#fef3c7' : m.type === '刪除' ? '#fef2f2' : m.type === '匯入' ? '#dbeafe' : '#f3f4f6',
                          color: m.type === '入貨' || m.type === '批量入貨' ? '#166534' : m.type === '轉倉' ? '#92400e' : m.type === '刪除' ? '#991b1b' : m.type === '匯入' ? '#1e40af' : '#374151',
                        }}>{m.type}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{m.itemName}</td>
                      <td style={{ color: Number(m.qty) > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                        {Number(m.qty) > 0 ? '+' : ''}{m.qty} {m.unit}
                      </td>
                      <td style={{ fontSize: 11, color: '#6b7280' }}>{m.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {movements.length > 0 && (
            <div style={{ padding: '8px 16px', fontSize: 11, color: '#6b7280', borderTop: '1px solid #f3f4f6' }}>
              共 {movements.filter(m => movementFilter === 'all' || m.type === movementFilter).length} 條紀錄 | 顯示最近 100 條
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* Supplier Directory (#110)       */}
      {/* ════════════════════════════════ */}
      {showSuppliers && (
        <div style={S.card}>
          <div style={{ ...S.cardHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 'inherit', color: 'inherit' }}>供應商目錄</h3>
            <button style={S.actionBtn} onClick={openAddSupplier}>+ 新增供應商</button>
          </div>
          {!supplierList.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>未有供應商紀錄，請新增</div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr><th style={S.th}>供應商名稱</th><th style={S.th}>聯絡人</th><th style={S.th}>電話</th><th style={S.th}>電郵</th><th style={S.th}>付款條件</th><th style={S.th}>交貨天數</th><th style={S.th}>關聯品項</th><th style={{ ...S.th, textAlign: 'right' }}>關聯貨值</th><th style={S.th}>操作</th></tr>
                </thead>
                <tbody>
                  {supplierList.map(s => {
                    const st = supplierStats[s.name] || { items: 0, value: 0 };
                    return (
                      <tr key={s.id} style={rowStyle(supplierList.indexOf(s))}>
                        <td style={{ ...S.td, fontWeight: 600 }}>{s.name}</td>
                        <td style={S.td}>{s.contactPerson || '-'}</td>
                        <td style={S.td}>{s.phone ? <a href={`tel:${s.phone}`} style={{ color: ECTCM.headerBg }}>{s.phone}</a> : '-'}</td>
                        <td style={{ ...S.td, fontSize: 11 }}>{s.email || '-'}</td>
                        <td style={{ ...S.td, fontSize: 11 }}>{s.paymentTerms || '-'}</td>
                        <td style={S.td}>{s.leadTimeDays ? `${s.leadTimeDays} 天` : '-'}</td>
                        <td style={S.td}><span style={statusTag(st.items + ' 項', 'green')}>{st.items} 項</span></td>
                        <td style={{ ...S.td, ...S.money }}>{fmtM(st.value)}</td>
                        <td style={S.td}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {s.phone && <button style={S.actionBtnGreen} onClick={() => window.open(`https://wa.me/852${s.phone.replace(/\D/g,'')}?text=${encodeURIComponent(`${s.name} 你好，我係${getClinicName()}，想查詢藥材供應事宜。`)}`, '_blank')}>WhatsApp</button>}
                            <button style={{ ...S.actionBtn, background: '#fff', color: '#333', border: '1px solid #ddd' }} onClick={() => openEditSupplier(s)}>編輯</button>
                            <button style={S.btnDanger} onClick={() => deleteSupplierById(s.id)}>刪除</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {supplierList.length > 0 && (
            <div style={{ padding: '8px 16px', fontSize: 11, color: '#6b7280', borderTop: '1px solid #f3f4f6' }}>
              共 {supplierList.length} 間供應商 | 關聯 {Object.values(supplierStats).reduce((s, v) => s + v.items, 0)} 項存貨 | 總貨值 {fmtM(Object.values(supplierStats).reduce((s, v) => s + v.value, 0))}
            </div>
          )}
        </div>
      )}

      {/* Supplier Add/Edit Modal */}
      {supplierModal && (
        <div style={S.modalOverlay} onClick={() => setSupplierModal(false)} role="dialog" aria-modal="true" aria-label={editSupplierItem ? '編輯供應商' : '新增供應商'}>
          <div style={{ ...S.modal, maxWidth: 550 }} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <span>{editSupplierItem ? '編輯供應商' : '新增供應商'}</span>
              <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }} onClick={() => setSupplierModal(false)} aria-label="關閉">✕</button>
            </div>
            <div style={S.modalBody}>
            <div style={{ marginBottom: 12 }}>
              <label>供應商名稱 *</label>
              <input value={supplierForm.name} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} placeholder="例: 同仁堂" autoFocus />
            </div>
            <div style={{ ...S.grid2, marginBottom: 12 }}>
              <div>
                <label>聯絡人</label>
                <input value={supplierForm.contactPerson} onChange={e => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })} placeholder="聯絡人姓名" />
              </div>
              <div>
                <label>電話</label>
                <input value={supplierForm.phone} onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })} placeholder="例: 98765432" />
              </div>
            </div>
            <div style={{ ...S.grid2, marginBottom: 12 }}>
              <div>
                <label>電郵</label>
                <input type="email" value={supplierForm.email} onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })} placeholder="supplier@example.com" />
              </div>
              <div>
                <label>地址</label>
                <input value={supplierForm.address} onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })} placeholder="供應商地址" />
              </div>
            </div>
            <div style={{ ...S.grid2, marginBottom: 12 }}>
              <div>
                <label>付款條件</label>
                <input value={supplierForm.paymentTerms} onChange={e => setSupplierForm({ ...supplierForm, paymentTerms: e.target.value })} placeholder="例: 月結30天" />
              </div>
              <div>
                <label>交貨天數</label>
                <input type="number" min="0" value={supplierForm.leadTimeDays} onChange={e => setSupplierForm({ ...supplierForm, leadTimeDays: e.target.value })} placeholder="例: 7" />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>備註</label>
              <textarea rows={2} value={supplierForm.notes} onChange={e => setSupplierForm({ ...supplierForm, notes: e.target.value })} placeholder="其他備註" style={{ width: '100%', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={S.actionBtn} onClick={handleSaveSupplier}>{editSupplierItem ? '更新供應商' : '新增供應商'}</button>
              <button style={{ ...S.actionBtn, background: '#fff', color: '#333', border: '1px solid #ddd' }} onClick={() => setSupplierModal(false)}>取消</button>
            </div>
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
    </div>
  );
}
