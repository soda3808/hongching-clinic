import { useState, useMemo } from 'react';
import { saveRevenue, deleteRecord } from '../api';
import { uid, fmtM, fmt, getMonth, monthLabel, DOCTORS } from '../data';
import ConfirmModal from './ConfirmModal';

export default function Revenue({ data, setData, showToast, user }) {
  const isDoctor = user?.role === 'doctor';
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], name: '', item: '', amount: '', payment: '現金', store: isDoctor ? (user.stores[0] || '宋皇臺') : '宋皇臺', doctor: isDoctor ? user.name : '常凱晴', note: '' });
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStore, setFilterStore] = useState('');
  const [filterDoc, setFilterDoc] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

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
    l.sort((a, b) => {
      if (sortBy === 'amount') {
        return sortDir === 'desc' ? Number(b.amount) - Number(a.amount) : Number(a.amount) - Number(b.amount);
      }
      return sortDir === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
    });
    return l;
  }, [data.revenue, filterMonth, filterStore, filterDoc, sortBy, sortDir]);

  const total = list.reduce((s, r) => s + Number(r.amount), 0);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const sortIcon = (col) => {
    if (sortBy !== col) return ' ↕';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  };

  // Auto-calc math expression in treatment item
  const handleItemChange = (val) => {
    setForm(f => ({ ...f, item: val }));
    // Replace × with * and ÷ with / for evaluation
    const expr = val.replace(/×/g, '*').replace(/÷/g, '/');
    // Check if it looks like a math expression (contains operators and numbers)
    if (/^[\d\s+\-*/().]+$/.test(expr) && /[+\-*/]/.test(expr)) {
      try {
        const result = Function('"use strict"; return (' + expr + ')')();
        if (typeof result === 'number' && isFinite(result) && result > 0) {
          setForm(f => ({ ...f, item: val, amount: String(result) }));
        }
      } catch {}
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

  const handleDel = async () => {
    if (!deleteId) return;
    await deleteRecord('revenue', deleteId);
    setData({ ...data, revenue: data.revenue.filter(r => r.id !== deleteId) });
    showToast('已刪除');
    setDeleteId(null);
  };

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
          </div>
        </div>
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
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
              {!list.length && <tr><td colSpan={9} className="empty" style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>未有紀錄</td></tr>}
              {list.map(r => (
                <tr key={r.id}>
                  <td><span onClick={() => setDeleteId(r.id)} style={{ cursor: 'pointer', color: 'var(--red-500)', fontWeight: 700 }}>✕</span></td>
                  <td>{String(r.date).substring(0, 10)}</td>
                  <td>{r.store}</td>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td>{r.item || '-'}</td>
                  <td className="money" style={{ color: 'var(--gold-700)' }}>{fmtM(r.amount)}</td>
                  <td>{payTag(r.payment)}</td>
                  <td>{r.doctor}</td>
                  <td style={{ color: 'var(--gray-400)', fontSize: 11 }}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {deleteId && <ConfirmModal message="確認刪除此營業紀錄？此操作無法復原。" onConfirm={handleDel} onCancel={() => setDeleteId(null)} />}
    </>
  );
}
