import { useState, useRef, useCallback } from 'react';
import { uid, fmtM, EXPENSE_CATEGORIES } from '../data';

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

async function processInBatches(items, fn, batchSize = 3, onProgress) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
    if (onProgress) onProgress(results.length);
  }
  return results;
}

export default function ReceiptScanner({ data, setData, showToast, onNavigate }) {
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [previewIdx, setPreviewIdx] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  const MAX_FILES = 20;
  const addFiles = useCallback((newFiles) => {
    const items = Array.from(newFiles).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
    setFiles(prev => {
      const remaining = MAX_FILES - prev.length;
      if (remaining <= 0) { alert(`最多只能上傳 ${MAX_FILES} 張收據`); return prev; }
      const toAdd = items.slice(0, remaining);
      if (toAdd.length < items.length) alert(`已達上限，只加入了 ${toAdd.length}/${items.length} 張`);
      return [...prev, ...toAdd.map(f => ({ id: uid(), file: f, preview: URL.createObjectURL(f), status: 'pending', result: null }))];
    });
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    dropRef.current?.classList.remove('has-file');
    addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    dropRef.current?.classList.add('has-file');
  };

  const handleDragLeave = () => {
    dropRef.current?.classList.remove('has-file');
  };

  const startProcessing = async () => {
    const pending = files.filter(f => f.status === 'pending' || f.status === 'error');
    if (!pending.length) return;

    setProcessing(true);
    setProgress({ done: 0, total: pending.length });

    // Mark all as processing
    setFiles(prev => prev.map(f =>
      (f.status === 'pending' || f.status === 'error') ? { ...f, status: 'processing' } : f
    ));

    const processOne = async (item) => {
      try {
        const dataUrl = await compressImage(item.file);
        const base64 = dataUrl.split(',')[1];
        const mimeType = dataUrl.split(';')[0].split(':')[1];

        const res = await fetch('/api/analyze-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, mimeType }),
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const json = await res.json();

        if (json.success && json.data) {
          setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'done', result: json.data } : f));
          setResults(prev => [...prev, {
            id: item.id,
            filePreview: dataUrl,
            fileDataUrl: dataUrl,
            date: json.data.date || '',
            merchant: json.data.merchant || '',
            amount: json.data.amount || 0,
            category: json.data.category || '其他',
            payment: json.data.payment || '其他',
            desc: json.data.description || '',
            store: '宋皇臺',
            confidence: json.data.confidence || 0,
            checked: true,
          }]);
        } else {
          setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error' } : f));
        }
      } catch {
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error' } : f));
      }
    };

    await processInBatches(pending, processOne, 3, (done) => setProgress({ done, total: pending.length }));
    setProcessing(false);
  };

  const clearAll = () => {
    files.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setFiles([]);
    setResults([]);
  };

  const updateResult = (id, field, value) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const removeResult = (id) => {
    const file = files.find(f => f.id === id);
    if (file?.preview) URL.revokeObjectURL(file.preview);
    setResults(prev => prev.filter(r => r.id !== id));
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const checkedResults = results.filter(r => r.checked);

  const handleImport = () => {
    const expenses = data.expenses || [];
    const newExpenses = checkedResults.map(r => ({
      id: uid(),
      date: r.date,
      merchant: r.merchant,
      amount: Number(r.amount),
      category: r.category,
      store: r.store,
      payment: r.payment,
      desc: r.desc,
      receipt: r.fileDataUrl || '',
    }));
    setData({ ...data, expenses: [...expenses, ...newExpenses] });
    const total = newExpenses.reduce((s, e) => s + e.amount, 0);
    showToast(`已匯入 ${newExpenses.length} 筆開支，合計 ${fmtM(total)}`);
    setShowConfirm(false);
    setResults([]);
    setFiles([]);
    if (onNavigate) onNavigate('exp');
  };

  const stats = {
    uploaded: files.length,
    done: files.filter(f => f.status === 'done').length,
    pending: results.filter(r => r.checked).length,
  };

  const confBadge = (c) => {
    if (c >= 80) return { bg: '#d1fae5', color: '#065f46' };
    if (c >= 50) return { bg: '#fef3c7', color: '#92400e' };
    return { bg: '#fee2e2', color: '#991b1b' };
  };

  return (
    <>
      {/* Info Card */}
      <div className="card">
        <div className="card-header"><h3>📷 AI 收據掃描器</h3></div>
        <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>
          批量上傳收據圖片，AI 自動辨識並歸類，審核後一鍵匯入開支紀錄
        </p>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--gray-600)' }}>
          <span>已上傳 <strong>{stats.uploaded}</strong> 張</span>
          <span>已辨識 <strong>{stats.done}</strong> 張</span>
          <span>待匯入 <strong>{stats.pending}</strong> 張</span>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        ref={dropRef}
        className="upload-zone"
        style={{ minHeight: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <span style={{ fontSize: 36 }}>📷</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>拖放收據圖片到這裡，或點擊選擇</span>
        <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>支援 JPEG, PNG, HEIC（可多選）</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic"
          multiple
          style={{ display: 'none' }}
          onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* File Thumbnails + Controls */}
      {files.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {files.map(f => (
              <div key={f.id} style={{ position: 'relative', width: 64, height: 64 }}>
                <img src={f.preview} alt="收據縮圖" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '2px solid var(--gray-200)' }} />
                <span style={{ position: 'absolute', bottom: -2, right: -2, fontSize: 14 }}>
                  {f.status === 'pending' && '⏳'}
                  {f.status === 'processing' && <span className="spinner" style={{ width: 14, height: 14 }} />}
                  {f.status === 'done' && '✅'}
                  {f.status === 'error' && '❌'}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-teal" onClick={startProcessing} disabled={processing}>
              {processing ? `🔄 處理中 ${progress.done}/${progress.total}...` : '🚀 開始辨識'}
            </button>
            <button className="btn btn-outline" onClick={clearAll} disabled={processing}>🗑 清除全部</button>
            {processing && (
              <div style={{ flex: 1, background: 'var(--gray-200)', borderRadius: 4, height: 8 }}>
                <div style={{ width: `${progress.total ? (progress.done / progress.total * 100) : 0}%`, background: 'var(--teal-600)', height: '100%', borderRadius: 4, transition: 'width .3s' }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gray-100)', fontWeight: 700, fontSize: 13 }}>
            辨識結果審核
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>✓</th>
                  <th style={{ width: 50 }}>圖片</th>
                  <th>日期</th>
                  <th>商戶</th>
                  <th>金額</th>
                  <th>類別</th>
                  <th>付款方式</th>
                  <th>描述</th>
                  <th>店舖</th>
                  <th>信心</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => {
                  const cb = confBadge(r.confidence);
                  return (
                    <tr key={r.id}>
                      <td><input type="checkbox" checked={r.checked} onChange={e => updateResult(r.id, 'checked', e.target.checked)} /></td>
                      <td>
                        <img
                          src={r.filePreview}
                          alt={`收據 - ${r.merchant || '待辨識'}`}
                          style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                          onClick={() => setPreviewIdx(idx)}
                        />
                      </td>
                      <td><input type="date" value={r.date} onChange={e => updateResult(r.id, 'date', e.target.value)} style={{ width: 130, padding: 4, fontSize: 11 }} /></td>
                      <td><input value={r.merchant} onChange={e => updateResult(r.id, 'merchant', e.target.value)} style={{ width: 100, padding: 4, fontSize: 11 }} /></td>
                      <td><input type="number" value={r.amount} onChange={e => updateResult(r.id, 'amount', e.target.value)} style={{ width: 80, padding: 4, fontSize: 11, textAlign: 'right' }} /></td>
                      <td>
                        <select value={r.category} onChange={e => updateResult(r.id, 'category', e.target.value)} style={{ width: 120, padding: 4, fontSize: 11 }}>
                          {Object.entries(EXPENSE_CATEGORIES).map(([group, cats]) => (
                            <optgroup key={group} label={group}>
                              {cats.map(c => <option key={c}>{c}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select value={r.payment} onChange={e => updateResult(r.id, 'payment', e.target.value)} style={{ width: 80, padding: 4, fontSize: 11 }}>
                          {['現金','轉帳','支票','FPS','信用卡','其他'].map(p => <option key={p}>{p}</option>)}
                        </select>
                      </td>
                      <td><input value={r.desc} onChange={e => updateResult(r.id, 'desc', e.target.value)} style={{ width: 120, padding: 4, fontSize: 11 }} /></td>
                      <td>
                        <select value={r.store} onChange={e => updateResult(r.id, 'store', e.target.value)} style={{ width: 80, padding: 4, fontSize: 11 }}>
                          <option>宋皇臺</option><option>太子</option><option>兩店共用</option>
                        </select>
                      </td>
                      <td><span className="tag" style={{ background: cb.bg, color: cb.color }}>{r.confidence}%</span></td>
                      <td><button className="btn btn-outline btn-sm" onClick={() => removeResult(r.id)} style={{ padding: '2px 6px' }}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 12, display: 'flex', gap: 8, borderTop: '1px solid var(--gray-100)' }}>
            <button className="btn btn-green btn-lg" onClick={() => setShowConfirm(true)} disabled={!checkedResults.length}>
              ✅ 匯入已勾選項目 ({checkedResults.length} 筆)
            </button>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewIdx !== null && results[previewIdx] && (
        <div className="modal-overlay" onClick={() => setPreviewIdx(null)} role="dialog" aria-modal="true" aria-label="收據預覽">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, display: 'flex', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <img src={results[previewIdx].filePreview} alt="收據圖片" style={{ width: '100%', borderRadius: 8 }} />
            </div>
            <div style={{ flex: 1, fontSize: 13 }}>
              <h3>辨識結果</h3>
              {['date','merchant','amount','category','payment','desc','store'].map(key => (
                <div key={key} style={{ marginBottom: 8 }}>
                  <label>{key}</label>
                  <input
                    value={results[previewIdx][key]}
                    onChange={e => updateResult(results[previewIdx].id, key, e.target.value)}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {previewIdx > 0 && <button className="btn btn-outline btn-sm" onClick={() => setPreviewIdx(previewIdx - 1)}>← 上一張</button>}
                {previewIdx < results.length - 1 && <button className="btn btn-outline btn-sm" onClick={() => setPreviewIdx(previewIdx + 1)}>下一張 →</button>}
                <button className="btn btn-outline btn-sm" onClick={() => setPreviewIdx(null)}>關閉</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Confirmation */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)} role="dialog" aria-modal="true" aria-label="確認匯入">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h3>確認匯入</h3>
            <p style={{ fontSize: 14, margin: '16px 0', color: 'var(--gray-600)' }}>
              即將匯入 <strong>{checkedResults.length}</strong> 筆開支紀錄<br/>
              合計金額：<strong style={{ color: 'var(--gold-700)' }}>{fmtM(checkedResults.reduce((s, r) => s + Number(r.amount), 0))}</strong>
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-green" onClick={handleImport}>確認匯入</button>
              <button className="btn btn-outline" onClick={() => setShowConfirm(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
