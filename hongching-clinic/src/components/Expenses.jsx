import { useState, useMemo } from 'react';
import { saveExpense, deleteRecord } from '../api';
import { uid, fmtM, fmt, getMonth, monthLabel, EXPENSE_CATEGORIES, ALL_CATEGORIES } from '../data';
import ConfirmModal from './ConfirmModal';

export default function Expenses({ data, setData, showToast }) {
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], merchant: '', amount: '', category: '租金', store: '宋皇臺', payment: '現金', desc: '', receipt: '' });
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStore, setFilterStore] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const months = useMemo(() => {
    const m = new Set();
    data.expenses.forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    return [...m].sort();
  }, [data.expenses]);

  const list = useMemo(() => {
    let l = [...data.expenses];
    if (filterMonth) l = l.filter(r => getMonth(r.date) === filterMonth);
    if (filterStore) l = l.filter(r => r.store === filterStore);
    if (filterCat) l = l.filter(r => r.category === filterCat);
    l.sort((a, b) => {
      if (sortBy === 'amount') {
        return sortDir === 'desc' ? Number(b.amount) - Number(a.amount) : Number(a.amount) - Number(b.amount);
      }
      return sortDir === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
    });
    return l;
  }, [data.expenses, filterMonth, filterStore, filterCat, sortBy, sortDir]);

  const total = list.reduce((s, r) => s + Number(r.amount), 0);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const sortIcon = (col) => {
    if (sortBy !== col) return ' ↕';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  };

  // Group totals by category
  const catTotals = useMemo(() => {
    const t = {};
    list.forEach(r => { t[r.category] = (t[r.category] || 0) + Number(r.amount); });
    return Object.entries(t).sort((a, b) => b[1] - a[1]);
  }, [list]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('檔案太大，上限10MB'); return; }
    setFileName(file.name);
    setUploading(true);

    const reader = new FileReader();
    reader.onload = (ev) => {
      // Store as data URL for local use; GAS upload handled separately
      setForm(f => ({ ...f, receipt: ev.target.result }));
      setUploading(false);
      showToast('收據圖片已附加');
    };
    reader.readAsDataURL(file);
  };

  // Amount input: only positive numbers
  const handleAmountChange = (val) => {
    const cleaned = val.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const safe = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
    setForm(f => ({ ...f, amount: safe }));
  };

  const handleAdd = async () => {
    if (!form.date || !form.amount) { alert('請填日期同金額'); return; }
    setSaving(true);
    const rec = { ...form, id: uid(), amount: parseFloat(form.amount) };
    await saveExpense(rec);
    setData({ ...data, expenses: [...data.expenses, rec] });
    setForm(f => ({ ...f, merchant: '', amount: '', desc: '', receipt: '' }));
    setFileName('');
    showToast(`已新增開支 ${fmtM(rec.amount)}`);
    setSaving(false);
  };

  const handleDel = async () => {
    if (!deleteId) return;
    await deleteRecord('expenses', deleteId);
    setData({ ...data, expenses: data.expenses.filter(r => r.id !== deleteId) });
    showToast('已刪除');
    setDeleteId(null);
  };

  return (
    <>
      {/* Add Form */}
      <div className="card">
        <div className="card-header"><h3>➕ 新增開支</h3></div>
        <div className="grid-4">
          <div><label>日期</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
          <div><label>商戶</label><input placeholder="CLP中電" value={form.merchant} onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))} /></div>
          <div><label>金額 ($)</label><input type="text" inputMode="decimal" placeholder="0" value={form.amount} onChange={e => handleAmountChange(e.target.value)} /></div>
          <div><label>類別</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {Object.entries(EXPENSE_CATEGORIES).map(([group, cats]) => (
                <optgroup key={group} label={`── ${group} ──`}>
                  {cats.map(c => <option key={c}>{c}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div className="grid-4" style={{ marginTop: 10 }}>
          <div><label>店舖</label>
            <select value={form.store} onChange={e => setForm(f => ({ ...f, store: e.target.value }))}>
              <option>宋皇臺</option><option>太子</option><option>兩店共用</option>
            </select>
          </div>
          <div><label>付款方式</label>
            <select value={form.payment} onChange={e => setForm(f => ({ ...f, payment: e.target.value }))}>
              {['現金','轉帳','支票','FPS','信用卡','其他'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div><label>描述</label><input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} /></div>
          <div>
            <label>📎 收據附件</label>
            <div className={`upload-zone ${fileName ? 'has-file' : ''}`} onClick={() => document.getElementById('expFile').click()} style={{ padding: '8px 12px', fontSize: 12 }}>
              <input type="file" id="expFile" accept="image/*,application/pdf" onChange={handleFileChange} style={{ display: 'none' }} />
              {uploading ? '⏳ 處理中...' : fileName ? `✅ ${fileName}` : '📷 點擊上傳'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-green" onClick={handleAdd} disabled={saving}>
            {saving ? '儲存中...' : '+ 新增開支'}
          </button>
        </div>
      </div>

      {/* Category Summary */}
      {catTotals.length > 0 && (
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
            {catTotals.map(([cat, amt]) => (
              <div key={cat} style={{ background: 'var(--gray-50)', padding: '4px 12px', borderRadius: 20, fontWeight: 600 }}>
                {cat}: <span style={{ color: 'var(--red-600)' }}>{fmtM(amt)}</span>
                <span style={{ color: 'var(--gray-400)', marginLeft: 4 }}>({(amt/total*100).toFixed(0)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Records */}
      <div className="card">
        <div className="card-header">
          <h3>📋 開支紀錄 ({list.length} 筆 | 合計 {fmtM(total)})</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}>
              <option value="">全部月份</option>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}>
              <option value="">全部店舖</option><option>宋皇臺</option><option>太子</option><option>兩店共用</option>
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}>
              <option value="">全部類別</option>
              {ALL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>📎</th>
                <th className="sortable-th" onClick={() => toggleSort('date')}>日期{sortIcon('date')}</th>
                <th>店舖</th>
                <th>商戶</th>
                <th>類別</th>
                <th className="sortable-th" onClick={() => toggleSort('amount')} style={{ textAlign: 'right' }}>金額{sortIcon('amount')}</th>
                <th>付款</th>
                <th>描述</th>
              </tr>
            </thead>
            <tbody>
              {!list.length && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>未有紀錄</td></tr>}
              {list.map(r => (
                <tr key={r.id}>
                  <td><span onClick={() => setDeleteId(r.id)} style={{ cursor: 'pointer', color: 'var(--red-500)', fontWeight: 700 }}>✕</span></td>
                  <td>{r.receipt ? <a href={r.receipt} target="_blank" rel="noopener" title="查看收據" style={{ fontSize: 16 }}>🧾</a> : <span style={{ color: '#ddd' }}>-</span>}</td>
                  <td>{String(r.date).substring(0, 10)}</td>
                  <td>{r.store}</td>
                  <td style={{ fontWeight: 600 }}>{r.merchant || '-'}</td>
                  <td><span style={{ background: 'var(--gray-100)', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>{r.category}</span></td>
                  <td className="money" style={{ color: 'var(--red-600)' }}>{fmtM(r.amount)}</td>
                  <td>{r.payment}</td>
                  <td style={{ color: 'var(--gray-400)', fontSize: 11 }}>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {deleteId && <ConfirmModal message="確認刪除此開支紀錄？此操作無法復原。" onConfirm={handleDel} onCancel={() => setDeleteId(null)} />}
    </>
  );
}
