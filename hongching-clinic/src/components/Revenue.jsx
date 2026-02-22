import { useState, useMemo } from 'react';
import { saveRevenue, deleteRecord } from '../api';
import { uid, fmtM, fmt, getMonth, monthLabel, DOCTORS } from '../data';

export default function Revenue({ data, setData, showToast }) {
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], name: '', item: '', amount: '', payment: '現金', store: '宋皇臺', doctor: '常凱晴', note: '' });
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStore, setFilterStore] = useState('');
  const [filterDoc, setFilterDoc] = useState('');
  const [saving, setSaving] = useState(false);

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
    return l.sort((a, b) => b.date.localeCompare(a.date));
  }, [data.revenue, filterMonth, filterStore, filterDoc]);

  const total = list.reduce((s, r) => s + Number(r.amount), 0);

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

  const handleDel = async (id) => {
    if (!confirm('確認刪除？')) return;
    await deleteRecord('revenue', id);
    setData({ ...data, revenue: data.revenue.filter(r => r.id !== id) });
    showToast('已刪除');
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
          <div><label>治療項目</label><input placeholder="90x4+100" value={form.item} onChange={e => setForm(f => ({ ...f, item: e.target.value }))} /></div>
          <div><label>金額 ($)</label><input type="number" placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
        </div>
        <div className="grid-4" style={{ marginTop: 10 }}>
          <div><label>付款方式</label>
            <select value={form.payment} onChange={e => setForm(f => ({ ...f, payment: e.target.value }))}>
              {['現金','FPS','Payme','AlipayHK','WeChat Pay','信用卡','其他'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div><label>醫師</label>
            <select value={form.doctor} onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))}>
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
              <tr><th></th><th>日期</th><th>店舖</th><th>病人</th><th>項目</th><th style={{ textAlign: 'right' }}>金額</th><th>付款</th><th>醫師</th><th>備註</th></tr>
            </thead>
            <tbody>
              {!list.length && <tr><td colSpan={9} className="empty" style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>未有紀錄</td></tr>}
              {list.map(r => (
                <tr key={r.id}>
                  <td><span onClick={() => handleDel(r.id)} style={{ cursor: 'pointer', color: 'var(--red-500)', fontWeight: 700 }}>✕</span></td>
                  <td>{r.date}</td>
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
    </>
  );
}
