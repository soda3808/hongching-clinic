import { useState, useMemo } from 'react';
import { uid, fmtM, fmt } from '../data';

export default function ARAP({ data, setData, showToast }) {
  const [tab, setTab] = useState('receivable');
  const [form, setForm] = useState({ type: 'receivable', date: new Date().toISOString().split('T')[0], party: '', amount: '', desc: '', dueDate: '', status: '未收' });

  const arap = data.arap || [];

  const receivables = useMemo(() => arap.filter(r => r.type === 'receivable'), [arap]);
  const payables = useMemo(() => arap.filter(r => r.type === 'payable'), [arap]);

  const list = tab === 'receivable' ? receivables : payables;
  const totalPending = list.filter(r => r.status !== '已收' && r.status !== '已付').reduce((s, r) => s + Number(r.amount), 0);
  const totalAll = list.reduce((s, r) => s + Number(r.amount), 0);

  const handleAdd = () => {
    if (!form.party || !form.amount) { alert('請填對象同金額'); return; }
    const rec = { ...form, id: uid(), type: tab, amount: parseFloat(form.amount), status: tab === 'receivable' ? '未收' : '未付' };
    const newArap = [...arap, rec];
    setData({ ...data, arap: newArap });
    setForm(f => ({ ...f, party: '', amount: '', desc: '', dueDate: '' }));
    showToast(`已新增${tab === 'receivable' ? '應收' : '應付'}帳`);
  };

  const handleStatus = (id, newStatus) => {
    const newArap = arap.map(r => r.id === id ? { ...r, status: newStatus } : r);
    setData({ ...data, arap: newArap });
    showToast(`已更新狀態為「${newStatus}」`);
  };

  const handleDel = (id) => {
    if (!confirm('確認刪除？')) return;
    setData({ ...data, arap: arap.filter(r => r.id !== id) });
    showToast('已刪除');
  };

  const isOverdue = (dueDate, status) => {
    if (status === '已收' || status === '已付') return false;
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const statusTag = (r) => {
    if (r.status === '已收' || r.status === '已付') return <span className="tag tag-paid">{r.status}</span>;
    if (isOverdue(r.dueDate, r.status)) return <span className="tag tag-overdue">逾期</span>;
    return <span className="tag tag-pending">{r.status}</span>;
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal">
          <div className="stat-label">應收帳總額</div>
          <div className="stat-value teal">{fmtM(receivables.reduce((s, r) => s + Number(r.amount), 0))}</div>
          <div className="stat-sub">{receivables.filter(r => r.status !== '已收').length} 筆未收</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">應付帳總額</div>
          <div className="stat-value red">{fmtM(payables.reduce((s, r) => s + Number(r.amount), 0))}</div>
          <div className="stat-sub">{payables.filter(r => r.status !== '已付').length} 筆未付</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">逾期應收</div>
          <div className="stat-value gold">{fmtM(receivables.filter(r => isOverdue(r.dueDate, r.status)).reduce((s, r) => s + Number(r.amount), 0))}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">淨應收</div>
          <div className="stat-value green">{fmtM(
            receivables.filter(r => r.status !== '已收').reduce((s, r) => s + Number(r.amount), 0) -
            payables.filter(r => r.status !== '已付').reduce((s, r) => s + Number(r.amount), 0)
          )}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab-btn ${tab === 'receivable' ? 'active' : ''}`} onClick={() => setTab('receivable')}>📥 應收帳 (AR)</button>
        <button className={`tab-btn ${tab === 'payable' ? 'active' : ''}`} onClick={() => setTab('payable')}>📤 應付帳 (AP)</button>
      </div>

      {/* Add Form */}
      <div className="card">
        <div className="card-header"><h3>➕ 新增{tab === 'receivable' ? '應收' : '應付'}帳</h3></div>
        <div className="grid-4">
          <div><label>{tab === 'receivable' ? '應收對象' : '應付對象'}</label><input placeholder={tab === 'receivable' ? '病人姓名' : '供應商'} value={form.party} onChange={e => setForm(f => ({ ...f, party: e.target.value }))} /></div>
          <div><label>金額 ($)</label><input type="number" placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
          <div><label>到期日</label><input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
          <div><label>描述</label><input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} /></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-green" onClick={handleAdd}>+ 新增</button>
        </div>
      </div>

      {/* Records */}
      <div className="card">
        <div className="card-header">
          <h3>📋 {tab === 'receivable' ? '應收' : '應付'}帳列表 ({list.length} 筆 | 待處理 {fmtM(totalPending)})</h3>
        </div>
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr><th></th><th>日期</th><th>{tab === 'receivable' ? '應收對象' : '應付對象'}</th><th style={{ textAlign: 'right' }}>金額</th><th>到期日</th><th>狀態</th><th>描述</th><th>操作</th></tr>
            </thead>
            <tbody>
              {!list.length && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>未有紀錄</td></tr>}
              {list.sort((a, b) => (a.status === '已收' || a.status === '已付' ? 1 : -1)).map(r => (
                <tr key={r.id} style={{ opacity: r.status === '已收' || r.status === '已付' ? .5 : 1 }}>
                  <td><span onClick={() => handleDel(r.id)} style={{ cursor: 'pointer', color: 'var(--red-500)', fontWeight: 700 }}>✕</span></td>
                  <td>{r.date}</td>
                  <td style={{ fontWeight: 600 }}>{r.party}</td>
                  <td className="money" style={{ color: tab === 'receivable' ? 'var(--teal-700)' : 'var(--red-600)' }}>{fmtM(r.amount)}</td>
                  <td style={{ color: isOverdue(r.dueDate, r.status) ? 'var(--red-500)' : 'inherit', fontWeight: isOverdue(r.dueDate, r.status) ? 700 : 400 }}>{r.dueDate || '-'}</td>
                  <td>{statusTag(r)}</td>
                  <td style={{ color: 'var(--gray-400)', fontSize: 11 }}>{r.desc}</td>
                  <td>
                    {(r.status !== '已收' && r.status !== '已付') && (
                      <button className="btn btn-teal btn-sm" onClick={() => handleStatus(r.id, tab === 'receivable' ? '已收' : '已付')}>
                        ✓ {tab === 'receivable' ? '已收款' : '已付款'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
