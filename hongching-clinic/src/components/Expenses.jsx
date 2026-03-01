import { useState, useMemo, useEffect } from 'react';
import { saveExpense, deleteRecord, recurringExpensesOps, budgetsOps } from '../api';
import { uid, fmtM, fmt, getMonth, monthLabel, EXPENSE_CATEGORIES, ALL_CATEGORIES, getStoreNames, getDefaultStore } from '../data';
import ConfirmModal from './ConfirmModal';

export default function Expenses({ data, setData, showToast, onNavigate }) {
  const STORE_NAMES = getStoreNames();
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], merchant: '', amount: '', category: '租金', store: getDefaultStore(), payment: '現金', desc: '', receipt: '' });
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStore, setFilterStore] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [recurringTemplates, setRecurringTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_recurring_expenses') || '[]'); } catch { return []; }
  });
  const [budgets, setBudgets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_budgets') || '{}'); } catch { return {}; }
  });
  const [showBudget, setShowBudget] = useState(false);

  useEffect(() => {
    recurringExpensesOps.load().then(d => { if (d) setRecurringTemplates(d); });
    budgetsOps.load().then(d => { if (d) setBudgets(prev => ({ ...prev, ...d })); });
  }, []);

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

  // ── Receipt OCR (#43) ──
  const handleOCR = async (file) => {
    if (!file) return;
    setOcrLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result;
        setForm(f => ({ ...f, receipt: base64 }));
        setFileName(file.name);
        try {
          const res = await fetch('/api/analyze?action=receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 }),
          });
          const result = await res.json();
          if (result.success && result.data) {
            const d = result.data;
            setForm(f => ({
              ...f,
              merchant: d.merchant || f.merchant,
              amount: d.amount ? String(d.amount) : f.amount,
              date: d.date || f.date,
              category: d.category || f.category,
              desc: d.description || f.desc,
            }));
            showToast('OCR 已自動填寫表單');
          } else {
            showToast('OCR 未能識別，請手動填寫');
          }
        } catch { showToast('OCR 服務暫時不可用'); }
        setOcrLoading(false);
      };
      reader.readAsDataURL(file);
    } catch { setOcrLoading(false); }
  };

  // ── Recurring Expenses (#44) ──
  const saveRecurringTemplate = () => {
    if (!form.merchant || !form.amount) return showToast('請先填寫商戶和金額');
    const tmpl = { id: uid(), merchant: form.merchant, amount: form.amount, category: form.category, store: form.store, payment: form.payment, desc: form.desc };
    const updated = [...recurringTemplates.filter(t => t.merchant !== tmpl.merchant), tmpl];
    setRecurringTemplates(updated);
    localStorage.setItem('hcmc_recurring_expenses', JSON.stringify(updated));
    recurringExpensesOps.persistAll(updated);
    showToast(`已儲存常用開支「${tmpl.merchant}」`);
  };

  const applyRecurring = async (tmpl) => {
    const today = new Date().toISOString().split('T')[0];
    const rec = { ...tmpl, id: uid(), date: today, amount: parseFloat(tmpl.amount), receipt: '' };
    setSaving(true);
    await saveExpense(rec);
    setData({ ...data, expenses: [...data.expenses, rec] });
    showToast(`已新增常用開支 ${tmpl.merchant} ${fmtM(parseFloat(tmpl.amount))}`);
    setSaving(false);
    setShowRecurring(false);
  };

  // ── Auto-Generate All Recurring (#68) ──
  const autoGenerateRecurring = async () => {
    if (!recurringTemplates.length) return showToast('暫無常用開支模板');
    const firstOfMonth = new Date(); firstOfMonth.setDate(1);
    const monthKey = firstOfMonth.toISOString().substring(0, 7);
    // Check what's already been generated this month
    const existingMerchants = new Set(data.expenses.filter(r => getMonth(r.date) === monthKey && r.isRecurring).map(r => r.merchant));
    const toGenerate = recurringTemplates.filter(t => !existingMerchants.has(t.merchant));
    if (!toGenerate.length) return showToast('本月所有常用開支已生成');
    setSaving(true);
    const dateStr = firstOfMonth.toISOString().split('T')[0];
    let added = 0;
    for (const tmpl of toGenerate) {
      const rec = { ...tmpl, id: uid(), date: dateStr, amount: parseFloat(tmpl.amount), receipt: '', isRecurring: true };
      await saveExpense(rec);
      setData(prev => ({ ...prev, expenses: [...prev.expenses, rec] }));
      added++;
    }
    showToast(`已自動生成 ${added} 筆本月常用開支`);
    setSaving(false);
    setShowRecurring(false);
  };

  const deleteRecurring = (id) => {
    const updated = recurringTemplates.filter(t => t.id !== id);
    setRecurringTemplates(updated);
    localStorage.setItem('hcmc_recurring_expenses', JSON.stringify(updated));
    recurringExpensesOps.persistAll(updated);
    showToast('已刪除常用開支');
  };

  // ── Budget Tracking (#49) ──
  const thisMonthKey = new Date().toISOString().substring(0, 7);
  const thisMonthExpenses = useMemo(() => {
    const map = {};
    data.expenses.filter(r => getMonth(r.date) === thisMonthKey).forEach(r => {
      map[r.category] = (map[r.category] || 0) + Number(r.amount);
    });
    return map;
  }, [data.expenses, thisMonthKey]);

  const [showVariance, setShowVariance] = useState(false);

  // ── Budget Variance Analysis (#113) ──
  const varianceAnalysis = useMemo(() => {
    const thisMonth = thisMonthKey;
    // Last month
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    const lastMonth = d.toISOString().substring(0, 7);
    d.setMonth(d.getMonth() - 1);
    const twoMonthsAgo = d.toISOString().substring(0, 7);

    const byMonth = (monthKey) => {
      const map = {};
      data.expenses.filter(r => getMonth(r.date) === monthKey).forEach(r => {
        map[r.category] = (map[r.category] || 0) + Number(r.amount);
      });
      return map;
    };

    const thisData = byMonth(thisMonth);
    const lastData = byMonth(lastMonth);
    const twoAgoData = byMonth(twoMonthsAgo);
    const totalThis = Object.values(thisData).reduce((s, v) => s + v, 0);
    const totalLast = Object.values(lastData).reduce((s, v) => s + v, 0);
    const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);

    const categories = [...new Set([...Object.keys(budgets), ...Object.keys(thisData), ...Object.keys(lastData)])].sort();
    const rows = categories.map(cat => {
      const budget = budgets[cat] || 0;
      const actual = thisData[cat] || 0;
      const lastActual = lastData[cat] || 0;
      const twoAgoActual = twoAgoData[cat] || 0;
      const variance = budget > 0 ? actual - budget : 0;
      const variancePct = budget > 0 ? ((actual - budget) / budget * 100) : 0;
      const momChange = lastActual > 0 ? ((actual - lastActual) / lastActual * 100) : (actual > 0 ? 100 : 0);
      return { cat, budget, actual, lastActual, twoAgoActual, variance, variancePct, momChange };
    });

    const overBudget = rows.filter(r => r.budget > 0 && r.actual > r.budget);
    const underBudget = rows.filter(r => r.budget > 0 && r.actual <= r.budget * 0.5);
    const avg3m = categories.map(cat => ({
      cat,
      avg: ((thisData[cat] || 0) + (lastData[cat] || 0) + (twoAgoData[cat] || 0)) / 3,
    })).filter(r => r.avg > 0).sort((a, b) => b.avg - a.avg);

    return { rows, totalThis, totalLast, totalBudget, overBudget, underBudget, avg3m, thisMonth, lastMonth };
  }, [data.expenses, budgets, thisMonthKey]);

  const saveBudget = (cat, amount) => {
    const updated = { ...budgets, [cat]: amount };
    setBudgets(updated);
    localStorage.setItem('hcmc_budgets', JSON.stringify(updated));
    budgetsOps.persist(updated);
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
      {/* Quick Access: Medicine Scanner + Receipt Scanner */}
      {onNavigate && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-teal" onClick={() => onNavigate('medscan')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            📦 掃描藥材採購單
            <span style={{ fontSize: 10, opacity: 0.8 }}>AI 自動入庫+記帳</span>
          </button>
          <button className="btn btn-outline" onClick={() => onNavigate('scan')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            📷 掃描一般收據
          </button>
        </div>
      )}

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
              {STORE_NAMES.map(s => <option key={s}>{s}</option>)}<option>兩店共用</option>
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
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-green" onClick={handleAdd} disabled={saving}>
            {saving ? '儲存中...' : '+ 新增開支'}
          </button>
          <button className="btn btn-outline" onClick={saveRecurringTemplate} title="儲存為常用開支">💾 儲存為常用</button>
          {recurringTemplates.length > 0 && (
            <button className="btn btn-gold" onClick={() => setShowRecurring(true)}>🔄 常用開支 ({recurringTemplates.length})</button>
          )}
          <label className="btn btn-outline" style={{ cursor: 'pointer', position: 'relative' }}>
            {ocrLoading ? '⏳ OCR 識別中...' : '📷 智能掃描'}
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleOCR(e.target.files[0]); e.target.value = ''; }} />
          </label>
          <button className="btn btn-outline" onClick={() => setShowBudget(!showBudget)}>📊 {showBudget ? '隱藏預算' : '預算管理'}</button>
          <button className="btn btn-outline" onClick={() => setShowVariance(!showVariance)}>📈 {showVariance ? '隱藏分析' : '預算偏差分析'}</button>
        </div>
      </div>

      {/* Budget Tracking */}
      {showBudget && (
        <div className="card">
          <div className="card-header"><h3>📊 月度預算追蹤 ({thisMonthKey})</h3></div>
          <div style={{ display: 'grid', gap: 8 }}>
            {ALL_CATEGORIES.slice(0, 12).map(cat => {
              const spent = thisMonthExpenses[cat] || 0;
              const budget = budgets[cat] || 0;
              const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
              const overBudget = budget > 0 && spent > budget;
              return (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ minWidth: 60, fontWeight: 600 }}>{cat}</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--gray-100)', borderRadius: 4 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: overBudget ? '#dc2626' : spent > budget * 0.8 ? '#d97706' : 'var(--teal-600)', borderRadius: 4, transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ minWidth: 80, color: overBudget ? '#dc2626' : 'var(--gray-600)', fontWeight: overBudget ? 700 : 400 }}>{fmtM(spent)}</span>
                  <span style={{ color: 'var(--gray-400)' }}>/</span>
                  <input type="number" min="0" step="100" value={budget || ''} onChange={e => saveBudget(cat, Number(e.target.value))} placeholder="預算" style={{ width: 80, padding: '3px 6px', fontSize: 11 }} />
                  {overBudget && <span style={{ color: '#dc2626', fontSize: 10, fontWeight: 700 }}>超支!</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Budget Variance Analysis (#113) */}
      {showVariance && (
        <div className="card">
          <div className="card-header"><h3>📈 預算偏差分析 ({varianceAnalysis.thisMonth})</h3></div>
          {/* Summary Cards */}
          <div className="stats-grid" style={{ marginBottom: 12 }}>
            <div className="stat-card teal"><div className="stat-label">本月預算</div><div className="stat-value teal">{fmtM(varianceAnalysis.totalBudget)}</div></div>
            <div className="stat-card red"><div className="stat-label">本月實際</div><div className="stat-value red">{fmtM(varianceAnalysis.totalThis)}</div></div>
            <div className={`stat-card ${varianceAnalysis.totalThis > varianceAnalysis.totalBudget ? 'red' : 'green'}`}>
              <div className="stat-label">偏差</div>
              <div className={`stat-value ${varianceAnalysis.totalThis > varianceAnalysis.totalBudget ? 'red' : 'green'}`}>
                {varianceAnalysis.totalBudget > 0 ? `${varianceAnalysis.totalThis > varianceAnalysis.totalBudget ? '+' : ''}${fmtM(varianceAnalysis.totalThis - varianceAnalysis.totalBudget)}` : '-'}
              </div>
            </div>
            <div className={`stat-card ${varianceAnalysis.totalThis > varianceAnalysis.totalLast ? 'red' : 'green'}`}>
              <div className="stat-label">較上月</div>
              <div className={`stat-value ${varianceAnalysis.totalThis > varianceAnalysis.totalLast ? 'red' : 'green'}`}>
                {varianceAnalysis.totalLast > 0 ? `${((varianceAnalysis.totalThis - varianceAnalysis.totalLast) / varianceAnalysis.totalLast * 100).toFixed(0)}%` : '-'}
              </div>
            </div>
          </div>

          {/* Alert Cards */}
          {(varianceAnalysis.overBudget.length > 0 || varianceAnalysis.underBudget.length > 0) && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              {varianceAnalysis.overBudget.length > 0 && (
                <div style={{ flex: 1, minWidth: 200, padding: 10, background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>超支類別 ({varianceAnalysis.overBudget.length})</div>
                  {varianceAnalysis.overBudget.map(r => (
                    <div key={r.cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>{r.cat}</span>
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>+{fmtM(r.variance)} ({r.variancePct.toFixed(0)}%)</span>
                    </div>
                  ))}
                </div>
              )}
              {varianceAnalysis.underBudget.length > 0 && (
                <div style={{ flex: 1, minWidth: 200, padding: 10, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>低使用率類別 ({varianceAnalysis.underBudget.length})</div>
                  {varianceAnalysis.underBudget.map(r => (
                    <div key={r.cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>{r.cat}</span>
                      <span style={{ color: '#16a34a' }}>使用 {r.budget > 0 ? (r.actual / r.budget * 100).toFixed(0) : 0}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Detailed Variance Table */}
          <div className="table-wrap" style={{ maxHeight: 350, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>類別</th>
                  <th style={{ textAlign: 'right' }}>預算</th>
                  <th style={{ textAlign: 'right' }}>本月實際</th>
                  <th style={{ textAlign: 'right' }}>偏差</th>
                  <th style={{ textAlign: 'right' }}>偏差%</th>
                  <th style={{ textAlign: 'right' }}>上月</th>
                  <th style={{ textAlign: 'right' }}>月增減%</th>
                  <th>進度</th>
                </tr>
              </thead>
              <tbody>
                {varianceAnalysis.rows.filter(r => r.budget > 0 || r.actual > 0).map(r => (
                  <tr key={r.cat}>
                    <td style={{ fontWeight: 600 }}>{r.cat}</td>
                    <td className="money">{r.budget > 0 ? fmtM(r.budget) : '-'}</td>
                    <td className="money" style={{ color: 'var(--red-600)' }}>{fmtM(r.actual)}</td>
                    <td className="money" style={{ color: r.variance > 0 ? '#dc2626' : r.variance < 0 ? '#16a34a' : 'var(--gray-400)', fontWeight: r.variance !== 0 ? 600 : 400 }}>
                      {r.budget > 0 ? `${r.variance > 0 ? '+' : ''}${fmtM(r.variance)}` : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 11, color: r.variancePct > 0 ? '#dc2626' : r.variancePct < 0 ? '#16a34a' : 'var(--gray-400)' }}>
                      {r.budget > 0 ? `${r.variancePct > 0 ? '+' : ''}${r.variancePct.toFixed(0)}%` : '-'}
                    </td>
                    <td className="money" style={{ color: 'var(--gray-500)' }}>{r.lastActual > 0 ? fmtM(r.lastActual) : '-'}</td>
                    <td style={{ textAlign: 'right', fontSize: 11, color: r.momChange > 10 ? '#dc2626' : r.momChange < -10 ? '#16a34a' : 'var(--gray-400)' }}>
                      {r.lastActual > 0 ? `${r.momChange > 0 ? '+' : ''}${r.momChange.toFixed(0)}%` : '-'}
                    </td>
                    <td style={{ minWidth: 80 }}>
                      {r.budget > 0 && (
                        <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 3 }}>
                          <div style={{ width: `${Math.min(r.actual / r.budget * 100, 100)}%`, height: '100%', background: r.actual > r.budget ? '#dc2626' : r.actual > r.budget * 0.8 ? '#d97706' : '#16a34a', borderRadius: 3 }} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {varianceAnalysis.rows.filter(r => r.budget > 0 || r.actual > 0).length > 0 && (
                  <tr style={{ fontWeight: 700, background: 'var(--gray-50)' }}>
                    <td>合計</td>
                    <td className="money">{fmtM(varianceAnalysis.totalBudget)}</td>
                    <td className="money" style={{ color: 'var(--red-600)' }}>{fmtM(varianceAnalysis.totalThis)}</td>
                    <td className="money" style={{ color: varianceAnalysis.totalThis > varianceAnalysis.totalBudget ? '#dc2626' : '#16a34a' }}>
                      {varianceAnalysis.totalBudget > 0 ? `${varianceAnalysis.totalThis > varianceAnalysis.totalBudget ? '+' : ''}${fmtM(varianceAnalysis.totalThis - varianceAnalysis.totalBudget)}` : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 11 }}>
                      {varianceAnalysis.totalBudget > 0 ? `${((varianceAnalysis.totalThis - varianceAnalysis.totalBudget) / varianceAnalysis.totalBudget * 100).toFixed(0)}%` : '-'}
                    </td>
                    <td className="money" style={{ color: 'var(--gray-500)' }}>{fmtM(varianceAnalysis.totalLast)}</td>
                    <td style={{ textAlign: 'right', fontSize: 11 }}>
                      {varianceAnalysis.totalLast > 0 ? `${((varianceAnalysis.totalThis - varianceAnalysis.totalLast) / varianceAnalysis.totalLast * 100).toFixed(0)}%` : '-'}
                    </td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 3-Month Average */}
          {varianceAnalysis.avg3m.length > 0 && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--gray-50)', borderRadius: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--gray-600)' }}>3個月平均開支 (建議預算參考)</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {varianceAnalysis.avg3m.slice(0, 8).map(r => (
                  <span key={r.cat} style={{ background: '#fff', padding: '4px 10px', borderRadius: 12, border: '1px solid var(--gray-200)' }}>
                    {r.cat}: <strong>{fmtM(Math.round(r.avg))}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recurring Expenses Modal */}
      {showRecurring && (
        <div className="modal-overlay" onClick={() => setShowRecurring(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>常用開支</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-teal btn-sm" onClick={autoGenerateRecurring} disabled={saving}>📋 一鍵生成本月</button>
                <button className="btn btn-outline btn-sm" onClick={() => setShowRecurring(false)}>✕</button>
              </div>
            </div>
            {recurringTemplates.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--gray-100)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.merchant}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{t.category} • {t.store} • {fmtM(parseFloat(t.amount))}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-teal btn-sm" onClick={() => applyRecurring(t)}>新增</button>
                  <button className="btn btn-red btn-sm" onClick={() => deleteRecurring(t.id)}>刪除</button>
                </div>
              </div>
            ))}
            {!recurringTemplates.length && <div style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 20 }}>暫無常用開支，先填寫表單再點「儲存為常用」</div>}
          </div>
        </div>
      )}

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

      {/* Store Allocation Summary */}
      {(() => {
        const storeColors = ['teal', 'gold', 'blue', 'red', 'purple'];
        const storeTotals = STORE_NAMES.map(name => ({
          name,
          direct: list.filter(r => r.store === name).reduce((s, r) => s + Number(r.amount), 0),
        }));
        const shared = list.filter(r => r.store === '兩店共用').reduce((s, r) => s + Number(r.amount), 0);
        const hasData = shared > 0 || storeTotals.some(s => s.direct > 0);
        if (!hasData) return null;
        const sharedSplit = STORE_NAMES.length > 0 ? shared / STORE_NAMES.length : 0;
        return (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>🏢 分店開支分攤</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STORE_NAMES.length + 1}, 1fr)`, gap: 12, fontSize: 12 }}>
              {storeTotals.map((st, i) => {
                const c = storeColors[i % storeColors.length];
                return (
                  <div key={st.name} style={{ padding: 10, background: `var(--${c}-50)`, borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: `var(--${c}-600)`, fontWeight: 600 }}>{st.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>直接：{fmtM(st.direct)}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>分攤：{fmtM(sharedSplit)}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: `var(--${c}-700)`, marginTop: 4 }}>{fmtM(st.direct + sharedSplit)}</div>
                  </div>
                );
              })}
              <div style={{ padding: 10, background: 'var(--gray-50)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--gray-500)', fontWeight: 600 }}>兩店共用</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-600)', marginTop: 4 }}>{fmtM(shared)}</div>
                <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>各分攤 {STORE_NAMES.length > 0 ? (100 / STORE_NAMES.length).toFixed(0) : 0}%</div>
              </div>
            </div>
          </div>
        );
      })()}

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
              <option value="">全部店舖</option>{STORE_NAMES.map(s => <option key={s}>{s}</option>)}<option>兩店共用</option>
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
                  <td style={{ fontWeight: 600 }}>{r.merchant || '-'}{r.isRecurring && <span style={{ fontSize: 9, color: 'var(--teal-600)', marginLeft: 4 }}>🔄</span>}</td>
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
