import { useState, useRef, useCallback, useMemo } from 'react';
import { uid, fmtM } from '../data';
import { getTenantStoreNames } from '../tenant';
import { getAuthHeader } from '../auth';
import { saveInventory } from '../api';

// ── Image Compression (reuse from ReceiptScanner) ──
async function compressImage(file, maxWidth = 1600, quality = 0.8) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        if (img.width <= maxWidth && file.size <= 2 * 1024 * 1024) {
          resolve(e.target.result);
          return;
        }
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxWidth / img.width, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function MedicineScanner({ data, setData, showToast, allData, user, onNavigate }) {
  const storeNames = getTenantStoreNames();
  const inventory = allData?.inventory || data?.inventory || [];

  // State
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [items, setItems] = useState([]);
  const [store, setStore] = useState(storeNames[0] || '');
  const [showConfirm, setShowConfirm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  // ── Match items to existing inventory ──
  const matchedItems = useMemo(() => {
    return items.map(item => {
      // Try exact name match first
      let match = inventory.find(inv =>
        inv.name === item.name && (inv.store === store || inv.store === '兩店共用')
      );
      // Try partial match
      if (!match) {
        match = inventory.find(inv =>
          (inv.name.includes(item.name) || item.name.includes(inv.name)) &&
          (inv.store === store || inv.store === '兩店共用')
        );
      }
      // Try across all stores
      if (!match) {
        match = inventory.find(inv =>
          inv.name === item.name || inv.name.includes(item.name) || item.name.includes(inv.name)
        );
      }
      return {
        ...item,
        matchedId: match?.id || null,
        matchedName: match?.name || null,
        currentStock: match ? Number(match.stock) : 0,
        matchType: match ? (match.name === item.name ? 'exact' : 'partial') : 'new',
      };
    });
  }, [items, inventory, store]);

  // ── Stats ──
  const stats = useMemo(() => {
    const exactMatch = matchedItems.filter(i => i.matchType === 'exact').length;
    const partialMatch = matchedItems.filter(i => i.matchType === 'partial').length;
    const newItems = matchedItems.filter(i => i.matchType === 'new').length;
    const totalAmount = items.reduce((s, i) => s + (Number(i.totalPrice) || 0), 0);
    return { exactMatch, partialMatch, newItems, totalAmount, total: items.length };
  }, [matchedItems, items]);

  // ── File handling ──
  const handleFile = useCallback((f) => {
    if (!f || !f.type.startsWith('image/')) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setInvoiceData(null);
    setItems([]);
    setImportResult(null);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    dropRef.current?.classList.remove('has-file');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  // ── AI Analysis ──
  const analyzeInvoice = async () => {
    if (!file) return;
    setProcessing(true);
    setInvoiceData(null);
    setItems([]);

    try {
      const dataUrl = await compressImage(file);
      const base64 = dataUrl.split(',')[1];
      const mimeType = dataUrl.split(';')[0].split(':')[1];

      const res = await fetch('/api/analyze?action=invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ image: base64, mimeType }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json();

      if (json.success && json.data) {
        setInvoiceData({
          supplier: json.data.supplier || '',
          invoiceNo: json.data.invoiceNo || '',
          date: json.data.date || new Date().toISOString().substring(0, 10),
          totalAmount: json.data.totalAmount || 0,
          confidence: json.data.confidence || 0,
        });
        setItems((json.data.items || []).map((item, i) => ({
          _id: uid(),
          name: item.name || '',
          qty: Number(item.qty) || 0,
          unit: item.unit || 'g',
          unitPrice: Number(item.unitPrice) || 0,
          totalPrice: Number(item.totalPrice) || 0,
          checked: true,
        })));
        showToast(`已辨識 ${json.data.items?.length || 0} 項藥材`);
      } else {
        showToast('辨識失敗：' + (json.error || '請重試'));
      }
    } catch (err) {
      showToast('辨識失敗：' + err.message);
    }
    setProcessing(false);
  };

  // ── Edit items ──
  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(item => {
      if (item._id !== id) return item;
      const updated = { ...item, [field]: value };
      // Auto-calc totals
      if (field === 'qty' || field === 'unitPrice') {
        updated.totalPrice = (Number(updated.qty) || 0) * (Number(updated.unitPrice) || 0);
      }
      if (field === 'totalPrice' && updated.qty > 0) {
        updated.unitPrice = Number(updated.totalPrice) / Number(updated.qty);
      }
      return updated;
    }));
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i._id !== id));

  const addManualItem = () => {
    setItems(prev => [...prev, { _id: uid(), name: '', qty: 0, unit: 'g', unitPrice: 0, totalPrice: 0, checked: true }]);
  };

  // ── Import: create expense + update inventory ──
  const handleImport = async () => {
    const checked = matchedItems.filter(i => items.find(x => x._id === i._id)?.checked);
    if (!checked.length) return;

    setImporting(true);
    const today = invoiceData?.date || new Date().toISOString().substring(0, 10);
    let updatedInventory = [...inventory];
    let stockUpdated = 0;
    let newAdded = 0;

    try {
      for (const item of checked) {
        if (item.matchedId) {
          // Update existing inventory item stock
          const existing = updatedInventory.find(r => r.id === item.matchedId);
          if (existing) {
            const updated = {
              ...existing,
              stock: Number(existing.stock) + item.qty,
              lastRestocked: today,
              costPerUnit: item.unitPrice || existing.costPerUnit,
            };
            await saveInventory(updated);
            updatedInventory = updatedInventory.map(r => r.id === updated.id ? updated : r);
            stockUpdated++;
          }
        } else {
          // Create new inventory item
          const newItem = {
            id: uid(),
            name: item.name,
            category: '中藥',
            unit: item.unit || 'g',
            stock: item.qty,
            minStock: Math.max(10, Math.round(item.qty * 0.2)),
            costPerUnit: item.unitPrice || 0,
            supplier: invoiceData?.supplier || '',
            store: store,
            medicineCode: '',
            lastRestocked: today,
            active: true,
            expiryDate: '',
          };
          await saveInventory(newItem);
          updatedInventory.push(newItem);
          newAdded++;
        }
      }

      // Create expense record
      const totalAmount = checked.reduce((s, i) => s + (Number(i.totalPrice) || 0), 0);
      const newExpense = {
        id: uid(),
        date: today,
        merchant: invoiceData?.supplier || '藥材供應商',
        amount: totalAmount,
        category: '藥材及耗材',
        store: store,
        payment: '轉帳',
        desc: `採購單 ${invoiceData?.invoiceNo || ''} — ${checked.length} 項藥材`.trim(),
        receipt: preview || '',
      };

      const updatedExpenses = [...(allData?.expenses || data.expenses || []), newExpense];
      setData({ ...(allData || data), expenses: updatedExpenses, inventory: updatedInventory });

      setImportResult({
        stockUpdated,
        newAdded,
        totalItems: checked.length,
        totalAmount,
        expenseId: newExpense.id,
      });
      setShowConfirm(false);
      showToast(`已匯入 ${checked.length} 項藥材，更新 ${stockUpdated} 項庫存，新增 ${newAdded} 項`);
    } catch (err) {
      showToast('匯入失敗：' + err.message);
    }
    setImporting(false);
  };

  // ── Reset ──
  const resetAll = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setInvoiceData(null);
    setItems([]);
    setImportResult(null);
  };

  const confBadge = (c) => {
    if (c >= 80) return { bg: '#d1fae5', color: '#065f46' };
    if (c >= 50) return { bg: '#fef3c7', color: '#92400e' };
    return { bg: '#fee2e2', color: '#991b1b' };
  };

  const matchBadge = (type) => {
    if (type === 'exact') return { label: '完全匹配', bg: '#d1fae5', color: '#065f46' };
    if (type === 'partial') return { label: '部分匹配', bg: '#fef3c7', color: '#92400e' };
    return { label: '新品', bg: '#dbeafe', color: '#1e40af' };
  };

  return (
    <>
      {/* Info Card */}
      <div className="card">
        <div className="card-header"><h3>📦 藥材採購單掃描</h3></div>
        <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>
          影相或上傳藥材送貨單/採購單，AI 自動辨識所有藥材明細，一鍵入庫 + 記帳
        </p>
        <div style={{ display: 'flex', gap: 24, fontSize: 12, color: 'var(--gray-600)' }}>
          <span>📷 影相/上傳 → 🤖 AI 辨識 → 📋 核對修改 → ✅ 一鍵入庫+記帳</span>
        </div>
      </div>

      {/* Upload Zone */}
      {!invoiceData && !importResult && (
        <div
          ref={dropRef}
          className="upload-zone"
          style={{ minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16, cursor: 'pointer' }}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); dropRef.current?.classList.add('has-file'); }}
          onDragLeave={() => dropRef.current?.classList.remove('has-file')}
          onClick={() => fileInputRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt="採購單預覽" style={{ maxHeight: 300, maxWidth: '100%', borderRadius: 8 }} />
          ) : (
            <>
              <span style={{ fontSize: 48 }}>📦</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>拖放或點擊上傳藥材採購單/送貨單</span>
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>支援 JPEG, PNG, HEIC</span>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
          />
        </div>
      )}

      {/* Actions */}
      {file && !invoiceData && !importResult && (
        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={store} onChange={e => setStore(e.target.value)} style={{ width: 'auto' }}>
            {storeNames.map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="btn btn-teal btn-lg" onClick={analyzeInvoice} disabled={processing}>
            {processing ? '🔄 AI 辨識中...' : '🚀 開始 AI 辨識'}
          </button>
          <button className="btn btn-outline" onClick={resetAll} disabled={processing}>🗑 重選</button>
          {processing && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="spinner" style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>正在分析圖片中的藥材明細...</span>
            </div>
          )}
        </div>
      )}

      {/* Invoice Summary */}
      {invoiceData && (
        <div className="card" style={{ background: 'var(--teal-50)' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>📄 採購單資料</h3>
            <span className="tag" style={confBadge(invoiceData.confidence)}>信心 {invoiceData.confidence}%</span>
          </div>
          <div className="grid-4" style={{ marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>供應商</label>
              <input value={invoiceData.supplier} onChange={e => setInvoiceData({ ...invoiceData, supplier: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>單號</label>
              <input value={invoiceData.invoiceNo} onChange={e => setInvoiceData({ ...invoiceData, invoiceNo: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>日期</label>
              <input type="date" value={invoiceData.date} onChange={e => setInvoiceData({ ...invoiceData, date: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>入庫店舖</label>
              <select value={store} onChange={e => setStore(e.target.value)}>
                {storeNames.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Match Stats */}
          <div style={{ display: 'flex', gap: 16, fontSize: 12, padding: '8px 0', borderTop: '1px solid var(--teal-200)' }}>
            <span>共 <strong>{stats.total}</strong> 項</span>
            <span style={{ color: '#065f46' }}>✅ 匹配 <strong>{stats.exactMatch}</strong></span>
            <span style={{ color: '#92400e' }}>⚠️ 部分匹配 <strong>{stats.partialMatch}</strong></span>
            <span style={{ color: '#1e40af' }}>🆕 新品 <strong>{stats.newItems}</strong></span>
            <span>合計 <strong style={{ color: 'var(--teal-700)' }}>{fmtM(stats.totalAmount)}</strong></span>
          </div>
        </div>
      )}

      {/* Items Table */}
      {items.length > 0 && !importResult && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>藥材明細 ({items.length} 項)</span>
            <button className="btn btn-outline btn-sm" onClick={addManualItem}>+ 手動新增</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>✓</th>
                  <th>藥材名稱</th>
                  <th style={{ width: 80 }}>數量</th>
                  <th style={{ width: 64 }}>單位</th>
                  <th style={{ width: 90 }}>單價</th>
                  <th style={{ width: 90 }}>小計</th>
                  <th>庫存匹配</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {matchedItems.map((item, idx) => {
                  const mb = matchBadge(item.matchType);
                  const orig = items.find(i => i._id === item._id);
                  return (
                    <tr key={item._id} style={{ background: !orig?.checked ? 'var(--gray-50)' : undefined }}>
                      <td>
                        <input type="checkbox" checked={orig?.checked || false}
                          onChange={e => updateItem(item._id, 'checked', e.target.checked)} />
                      </td>
                      <td>
                        <input value={item.name}
                          onChange={e => updateItem(item._id, 'name', e.target.value)}
                          style={{ fontWeight: 600, fontSize: 13, border: 'none', background: 'transparent', width: '100%' }}
                          list="herb-names" />
                      </td>
                      <td>
                        <input type="number" value={item.qty} min="0" step="any"
                          onChange={e => updateItem(item._id, 'qty', Number(e.target.value))}
                          style={{ width: 70, padding: 4, fontSize: 12, textAlign: 'right' }} />
                      </td>
                      <td>
                        <select value={item.unit}
                          onChange={e => updateItem(item._id, 'unit', e.target.value)}
                          style={{ width: 58, padding: 4, fontSize: 12 }}>
                          {['g', 'kg', '包', '盒', '件', '瓶', '支'].map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="number" value={item.unitPrice} min="0" step="0.01"
                          onChange={e => updateItem(item._id, 'unitPrice', Number(e.target.value))}
                          style={{ width: 80, padding: 4, fontSize: 12, textAlign: 'right' }} />
                      </td>
                      <td style={{ fontWeight: 600, textAlign: 'right', fontSize: 13 }}>
                        {fmtM(item.totalPrice)}
                      </td>
                      <td>
                        <span className="tag" style={{ background: mb.bg, color: mb.color, fontSize: 10 }}>
                          {mb.label}
                        </span>
                        {item.matchedId && (
                          <div style={{ fontSize: 10, color: 'var(--gray-500)', marginTop: 2 }}>
                            現有 {item.currentStock}{item.unit} → {item.currentStock + item.qty}{item.unit}
                          </div>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-outline btn-sm" onClick={() => removeItem(item._id)}
                          style={{ padding: '2px 6px' }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--gray-50)', fontWeight: 700 }}>
                  <td></td>
                  <td>合計</td>
                  <td style={{ textAlign: 'right' }}>{items.reduce((s, i) => s + (Number(i.qty) || 0), 0)}</td>
                  <td></td>
                  <td></td>
                  <td style={{ textAlign: 'right', color: 'var(--teal-700)' }}>
                    {fmtM(items.reduce((s, i) => s + (Number(i.totalPrice) || 0), 0))}
                  </td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Herb name datalist for autocomplete */}
          <datalist id="herb-names">
            {inventory.map(inv => <option key={inv.id} value={inv.name} />)}
          </datalist>

          {/* Action Bar */}
          <div style={{ padding: 12, display: 'flex', gap: 8, borderTop: '1px solid var(--gray-100)', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-green btn-lg" onClick={() => setShowConfirm(true)}
              disabled={!matchedItems.filter(i => items.find(x => x._id === i._id)?.checked).length}>
              ✅ 確認入庫 + 記帳 ({matchedItems.filter(i => items.find(x => x._id === i._id)?.checked).length} 項)
            </button>
            <button className="btn btn-outline" onClick={resetAll}>🔄 重新掃描</button>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
              入庫到: <strong>{store}</strong> | 供應商: <strong>{invoiceData?.supplier || '-'}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Side-by-side preview */}
      {invoiceData && preview && (
        <div className="card">
          <div className="card-header"><h3>📷 原圖對照</h3></div>
          <img src={preview} alt="採購單原圖" style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8, border: '1px solid var(--gray-200)' }} />
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)} role="dialog" aria-modal="true">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3>確認入庫 + 記帳</h3>
            <div style={{ background: 'var(--gray-50)', padding: 16, borderRadius: 8, margin: '16px 0', fontSize: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>供應商：<strong>{invoiceData?.supplier || '-'}</strong></div>
                <div>單號：<strong>{invoiceData?.invoiceNo || '-'}</strong></div>
                <div>日期：<strong>{invoiceData?.date || '-'}</strong></div>
                <div>入庫店舖：<strong>{store}</strong></div>
              </div>
              <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid var(--gray-200)' }} />
              <div className="grid-3">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--teal-700)' }}>
                    {matchedItems.filter(i => items.find(x => x._id === i._id)?.checked).length}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>藥材項數</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#065f46' }}>{stats.exactMatch + stats.partialMatch}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>更新庫存</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#1e40af' }}>{stats.newItems}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>新增品項</div>
                </div>
              </div>
              <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid var(--gray-200)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>開支金額</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--gold-700)' }}>{fmtM(stats.totalAmount)}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>將自動記入「藥材及耗材」開支</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-green btn-lg" onClick={handleImport} disabled={importing}>
                {importing ? '處理中...' : '✅ 確認入庫 + 記帳'}
              </button>
              <button className="btn btn-outline" onClick={() => setShowConfirm(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Result */}
      {importResult && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <h3 style={{ marginBottom: 16 }}>匯入完成！</h3>
          <div className="stats-grid" style={{ maxWidth: 500, margin: '0 auto 24px' }}>
            <div className="stat-card green">
              <div className="stat-label">更新庫存</div>
              <div className="stat-value green">{importResult.stockUpdated}</div>
            </div>
            <div className="stat-card teal">
              <div className="stat-label">新增品項</div>
              <div className="stat-value teal">{importResult.newAdded}</div>
            </div>
            <div className="stat-card gold">
              <div className="stat-label">開支金額</div>
              <div className="stat-value gold" style={{ fontSize: 16 }}>{fmtM(importResult.totalAmount)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-teal" onClick={resetAll}>📷 繼續掃描</button>
            {onNavigate && <button className="btn btn-green" onClick={() => onNavigate('inventory')}>💊 查看庫存</button>}
            {onNavigate && <button className="btn btn-outline" onClick={() => onNavigate('exp')}>🧾 查看開支</button>}
          </div>
        </div>
      )}
    </>
  );
}
