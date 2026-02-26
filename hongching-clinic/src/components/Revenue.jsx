import { useState, useMemo } from 'react';
import { saveRevenue, deleteRecord } from '../api';
import { uid, fmtM, fmt, getMonth, monthLabel, DOCTORS } from '../data';
import ConfirmModal from './ConfirmModal';

export default function Revenue({ data, setData, showToast, user, allData }) {
  const isDoctor = user?.role === 'doctor';
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], name: '', item: '', amount: '', payment: '現金', store: isDoctor ? (user.stores[0] || '宋皇臺') : '宋皇臺', doctor: isDoctor ? user.name : '常凱晴', note: '' });
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStore, setFilterStore] = useState('');
  const [filterDoc, setFilterDoc] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [editRow, setEditRow] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [filterPay, setFilterPay] = useState('');
  const [showPL, setShowPL] = useState(false);

  const months = useMemo(() => {
    const m = new Set();
    data.revenue.forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    return [...m].sort();
  }, [data.revenue]);

  const list = useMemo(() => {
    let l = [...data.revenue];
    if (filterMonth) l = l.filter(r => getMonth(r.date) === filterMonth);
    if (filterStore) l = l.filter(r => r.store === filterStore);
    if (filterDoc) l = l.filter(r => r.doctor === filterDoc);
    if (filterPay) l = l.filter(r => r.payment === filterPay);
    l.sort((a, b) => {
      if (sortBy === 'amount') {
        return sortDir === 'desc' ? Number(b.amount) - Number(a.amount) : Number(a.amount) - Number(b.amount);
      }
      return sortDir === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
    });
    return l;
  }, [data.revenue, filterMonth, filterStore, filterDoc, filterPay, sortBy, sortDir]);

  const total = list.reduce((s, r) => s + Number(r.amount), 0);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const sortIcon = (col) => {
    if (sortBy !== col) return ' ↕';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  };

  // Safe math evaluator (no Function/eval)
  const safeMathEval = (expr) => {
    const tokens = expr.match(/(\d+\.?\d*|[+\-*/()])/g);
    if (!tokens) return null;
    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];
    const parseNum = () => {
      if (peek() === '(') { consume(); const v = parseExpr(); consume(); return v; }
      if (peek() === '-') { consume(); return -parseNum(); }
      return parseFloat(consume());
    };
    const parseTerm = () => {
      let v = parseNum();
      while (peek() === '*' || peek() === '/') { const op = consume(); const r = parseNum(); v = op === '*' ? v * r : v / r; }
      return v;
    };
    const parseExpr = () => {
      let v = parseTerm();
      while (peek() === '+' || peek() === '-') { const op = consume(); const r = parseTerm(); v = op === '+' ? v + r : v - r; }
      return v;
    };
    try { const result = parseExpr(); return pos === tokens.length && isFinite(result) ? result : null; } catch { return null; }
  };

  // Auto-calc math expression in treatment item
  const handleItemChange = (val) => {
    setForm(f => ({ ...f, item: val }));
    const expr = val.replace(/×/g, '*').replace(/÷/g, '/');
    if (/^[\d\s+\-*/().]+$/.test(expr) && /[+\-*/]/.test(expr)) {
      const result = safeMathEval(expr);
      if (result !== null && result > 0) {
        setForm(f => ({ ...f, item: val, amount: String(result) }));
      }
    }
  };

  // Amount input: only positive numbers
  const handleAmountChange = (val) => {
    const cleaned = val.replace(/[^0-9.]/g, '');
    // Prevent multiple decimal points
    const parts = cleaned.split('.');
    const safe = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
    setForm(f => ({ ...f, amount: safe }));
  };

  const handleAdd = async () => {
    if (!form.date || !form.name || !form.amount) { alert('請填日期、姓名同金額'); return; }
    setSaving(true);
    const rec = { ...form, id: uid(), amount: parseFloat(form.amount) };
    await saveRevenue(rec);
    setData({ ...data, revenue: [...data.revenue, rec] });
    setForm(f => ({ ...f, name: '', item: '', amount: '', note: '' }));
    showToast(`已新增 ${rec.name} ${fmtM(rec.amount)}`);
    setSaving(false);
  };

  // ── Inline Edit (#58) ──
  const handleEditSave = async () => {
    if (!editRow) return;
    const updated = { ...editRow, amount: parseFloat(editRow.amount) || 0 };
    await saveRevenue(updated);
    setData({ ...data, revenue: data.revenue.map(r => r.id === updated.id ? updated : r) });
    setEditRow(null);
    showToast('已更新紀錄');
  };

  // ── Batch Delete (#58) ──
  const handleBatchDel = async () => {
    if (!selected.size) return;
    if (!window.confirm(`確認刪除 ${selected.size} 筆紀錄？`)) return;
    for (const id of selected) {
      await deleteRecord('revenue', id);
    }
    setData({ ...data, revenue: data.revenue.filter(r => !selected.has(r.id)) });
    setSelected(new Set());
    showToast(`已刪除 ${selected.size} 筆紀錄`);
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === list.length) setSelected(new Set());
    else setSelected(new Set(list.map(r => r.id)));
  };

  const handleDel = async () => {
    if (!deleteId) return;
    await deleteRecord('revenue', deleteId);
    setData({ ...data, revenue: data.revenue.filter(r => r.id !== deleteId) });
    showToast('已刪除');
    setDeleteId(null);
  };

  // ── Multi-month P&L Report (#63) ──
  const plData = useMemo(() => {
    const expenses = (allData || data).expenses || [];
    const allMonths = new Set();
    data.revenue.forEach(r => { const m = getMonth(r.date); if (m) allMonths.add(m); });
    expenses.forEach(r => { const m = getMonth(r.date); if (m) allMonths.add(m); });
    const sorted = [...allMonths].sort();
    return sorted.map(m => {
      const rev = data.revenue.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0);
      const exp = expenses.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0);
      return { month: m, label: monthLabel(m), revenue: rev, expenses: exp, profit: rev - exp, margin: rev > 0 ? ((rev - exp) / rev * 100) : 0 };
    });
  }, [data.revenue, allData, data]);

  const plTotals = useMemo(() => {
    const rev = plData.reduce((s, r) => s + r.revenue, 0);
    const exp = plData.reduce((s, r) => s + r.expenses, 0);
    return { revenue: rev, expenses: exp, profit: rev - exp, margin: rev > 0 ? ((rev - exp) / rev * 100) : 0 };
  }, [plData]);

  const payTag = (p) => {
    if (p === '現金') return <span className="tag tag-cash">現金</span>;
    if (p === 'FPS') return <span className="tag tag-fps">FPS</span>;
    return <span className="tag tag-other">{p}</span>;
  };

  return (
    <>
      {/* Add Form */}
      <div className="card">
        <div className="card-header">
          <h3>➕ 新增營業紀錄</h3>
          <select value={form.store} onChange={e => setForm(f => ({ ...f, store: e.target.value }))} style={{ width: 'auto', padding: '6px 12px' }}>
            <option>宋皇臺</option><option>太子</option>
          </select>
        </div>
        <div className="grid-4">
          <div><label>日期</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
          <div><label>病人姓名</label><input placeholder="陳大文" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><label>治療項目</label><input placeholder="90*4+100" value={form.item} onChange={e => handleItemChange(e.target.value)} /></div>
          <div><label>金額 ($)</label><input type="text" inputMode="decimal" placeholder="0" value={form.amount} onChange={e => handleAmountChange(e.target.value)} /></div>
        </div>
        <div className="grid-4" style={{ marginTop: 10 }}>
          <div><label>付款方式</label>
            <select value={form.payment} onChange={e => setForm(f => ({ ...f, payment: e.target.value }))}>
              {['現金','FPS','Payme','AlipayHK','WeChat Pay','信用卡','其他'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div><label>醫師</label>
            <select value={form.doctor} onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))} disabled={isDoctor}>
              {DOCTORS.map(d => <option key={d}>{d}</option>)}<option>其他</option>
            </select>
          </div>
          <div><label>備註</label><input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button className="btn btn-green" onClick={handleAdd} disabled={saving} style={{ flex: 1 }}>
              {saving ? '儲存中...' : '+ 新增'}
            </button>
          </div>
        </div>
      </div>

      {/* Records */}
      <div className="card">
        <div className="card-header">
          <h3>📋 營業紀錄 ({list.length} 筆 | 合計 {fmtM(total)})</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}>
              <option value="">全部月份</option>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}>
              <option value="">全部店舖</option><option>宋皇臺</option><option>太子</option>
            </select>
            <select value={filterDoc} onChange={e => setFilterDoc(e.target.value)} style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}>
              <option value="">全部醫師</option>
              {DOCTORS.map(d => <option key={d}>{d}</option>)}
            </select>
            <select value={filterPay} onChange={e => setFilterPay(e.target.value)} style={{ width: 'auto', padding: '6px 10px', fontSize: 12 }}>
              <option value="">全部付款</option>
              {['現金','FPS','Payme','AlipayHK','WeChat Pay','信用卡','其他'].map(p => <option key={p}>{p}</option>)}
            </select>
            {selected.size > 0 && <button className="btn btn-red btn-sm" onClick={handleBatchDel}>刪除 ({selected.size})</button>}
          </div>
        </div>
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 30 }}><input type="checkbox" checked={selected.size === list.length && list.length > 0} onChange={toggleSelectAll} /></th>
                <th></th>
                <th className="sortable-th" onClick={() => toggleSort('date')}>日期{sortIcon('date')}</th>
                <th>店舖</th>
                <th>病人</th>
                <th>項目</th>
                <th className="sortable-th" onClick={() => toggleSort('amount')} style={{ textAlign: 'right' }}>金額{sortIcon('amount')}</th>
                <th>付款</th>
                <th>醫師</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              {!list.length && <tr><td colSpan={10} className="empty" style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>未有紀錄</td></tr>}
              {list.map(r => (
                editRow?.id === r.id ? (
                  <tr key={r.id} style={{ background: 'var(--teal-50)' }}>
                    <td></td>
                    <td></td>
                    <td><input type="date" value={editRow.date} onChange={e => setEditRow({ ...editRow, date: e.target.value })} style={{ fontSize: 11, padding: 2, width: 110 }} /></td>
                    <td>{editRow.store}</td>
                    <td><input value={editRow.name} onChange={e => setEditRow({ ...editRow, name: e.target.value })} style={{ fontSize: 11, padding: 2, width: 70 }} /></td>
                    <td><input value={editRow.item} onChange={e => setEditRow({ ...editRow, item: e.target.value })} style={{ fontSize: 11, padding: 2, width: 80 }} /></td>
                    <td><input type="number" value={editRow.amount} onChange={e => setEditRow({ ...editRow, amount: e.target.value })} style={{ fontSize: 11, padding: 2, width: 70, textAlign: 'right' }} /></td>
                    <td>
                      <select value={editRow.payment} onChange={e => setEditRow({ ...editRow, payment: e.target.value })} style={{ fontSize: 11, padding: 2 }}>
                        {['現金','FPS','Payme','AlipayHK','WeChat Pay','信用卡','其他'].map(o => <option key={o}>{o}</option>)}
                      </select>
                    </td>
                    <td>{editRow.doctor}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button className="btn btn-teal btn-sm" style={{ fontSize: 10, padding: '2px 6px' }} onClick={handleEditSave}>✓</button>
                        <button className="btn btn-outline btn-sm" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setEditRow(null)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                    <td><span onClick={() => setDeleteId(r.id)} style={{ cursor: 'pointer', color: 'var(--red-500)', fontWeight: 700 }}>✕</span></td>
                    <td>{String(r.date).substring(0, 10)}</td>
                    <td>{r.store}</td>
                    <td style={{ fontWeight: 600, cursor: 'pointer' }} onDoubleClick={() => setEditRow({ ...r })}>{r.name}</td>
                    <td onDoubleClick={() => setEditRow({ ...r })}>{r.item || '-'}</td>
                    <td className="money" style={{ color: 'var(--gold-700)', cursor: 'pointer' }} onDoubleClick={() => setEditRow({ ...r })}>{fmtM(r.amount)}</td>
                    <td>{payTag(r.payment)}</td>
                    <td>{r.doctor}</td>
                    <td style={{ color: 'var(--gray-400)', fontSize: 11 }}>{r.note}</td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* P&L Report (#63) */}
      <div className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn btn-outline" onClick={() => setShowPL(!showPL)}>{showPL ? '隱藏' : '📊'} 損益報表 (P&L)</button>
        {showPL && <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>多月份營收 vs 開支對比</span>}
      </div>
      {showPL && (
        <div className="card">
          <div className="card-header"><h3>📊 多月份損益報表</h3></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>月份</th><th style={{ textAlign: 'right' }}>營業額</th><th style={{ textAlign: 'right' }}>開支</th><th style={{ textAlign: 'right' }}>淨利</th><th style={{ textAlign: 'right' }}>利潤率</th><th>趨勢</th></tr>
              </thead>
              <tbody>
                {plData.map((r, i) => (
                  <tr key={r.month}>
                    <td style={{ fontWeight: 600 }}>{r.label}</td>
                    <td className="money" style={{ color: 'var(--teal-700)' }}>{fmtM(r.revenue)}</td>
                    <td className="money" style={{ color: '#dc2626' }}>{fmtM(r.expenses)}</td>
                    <td className="money" style={{ fontWeight: 700, color: r.profit >= 0 ? '#16a34a' : '#dc2626' }}>{fmtM(r.profit)}</td>
                    <td className="money" style={{ color: r.margin >= 0 ? '#16a34a' : '#dc2626' }}>{r.margin.toFixed(1)}%</td>
                    <td>
                      {i > 0 && (
                        <span style={{ fontSize: 12, color: r.profit > plData[i - 1].profit ? '#16a34a' : '#dc2626' }}>
                          {r.profit > plData[i - 1].profit ? '📈' : '📉'} {r.profit > plData[i - 1].profit ? '+' : ''}{fmtM(r.profit - plData[i - 1].profit)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {plData.length > 0 && (
                  <tr style={{ fontWeight: 700, background: 'var(--gray-50)' }}>
                    <td>合計</td>
                    <td className="money" style={{ color: 'var(--teal-700)' }}>{fmtM(plTotals.revenue)}</td>
                    <td className="money" style={{ color: '#dc2626' }}>{fmtM(plTotals.expenses)}</td>
                    <td className="money" style={{ color: plTotals.profit >= 0 ? '#16a34a' : '#dc2626' }}>{fmtM(plTotals.profit)}</td>
                    <td className="money" style={{ color: plTotals.margin >= 0 ? '#16a34a' : '#dc2626' }}>{plTotals.margin.toFixed(1)}%</td>
                    <td></td>
                  </tr>
                )}
                {!plData.length && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>未有數據</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deleteId && <ConfirmModal message="確認刪除此營業紀錄？此操作無法復原。" onConfirm={handleDel} onCancel={() => setDeleteId(null)} />}
    </>
  );
}
