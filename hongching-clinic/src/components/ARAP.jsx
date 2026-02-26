import { useState, useMemo } from 'react';
import { saveARAP, deleteRecord } from '../api';
import { uid, fmtM, fmt } from '../data';
import ConfirmModal from './ConfirmModal';

export default function ARAP({ data, setData, showToast }) {
  const [tab, setTab] = useState('receivable');
  const [form, setForm] = useState({ type: 'receivable', date: new Date().toISOString().split('T')[0], party: '', amount: '', desc: '', dueDate: '', status: '未收' });
  const [deleteId, setDeleteId] = useState(null);
  const [showAging, setShowAging] = useState(false);

  const arap = data.arap || [];

  const receivables = useMemo(() => arap.filter(r => r.type === 'receivable'), [arap]);
  const payables = useMemo(() => arap.filter(r => r.type === 'payable'), [arap]);

  const list = tab === 'receivable' ? receivables : payables;
  const totalPending = list.filter(r => r.status !== '已收' && r.status !== '已付').reduce((s, r) => s + Number(r.amount), 0);
  const totalAll = list.reduce((s, r) => s + Number(r.amount), 0);

  // Amount input: only positive numbers
  const handleAmountChange = (val) => {
    const cleaned = val.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const safe = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleaned;
    setForm(f => ({ ...f, amount: safe }));
  };

  const handleAdd = async () => {
    if (!form.party || !form.amount) { alert('請填對象同金額'); return; }
    const rec = { ...form, id: uid(), type: tab, amount: parseFloat(form.amount), status: tab === 'receivable' ? '未收' : '未付' };
    await saveARAP(rec);
    setData({ ...data, arap: [...arap, rec] });
    setForm(f => ({ ...f, party: '', amount: '', desc: '', dueDate: '' }));
    showToast(`已新增${tab === 'receivable' ? '應收' : '應付'}帳`);
  };

  const handleStatus = async (id, newStatus) => {
    const updated = arap.find(r => r.id === id);
    if (updated) await saveARAP({ ...updated, status: newStatus });
    const newArap = arap.map(r => r.id === id ? { ...r, status: newStatus } : r);
    setData({ ...data, arap: newArap });
    showToast(`已更新狀態為「${newStatus}」`);
  };

  const handleDel = async () => {
    if (!deleteId) return;
    await deleteRecord('arap', deleteId);
    setData({ ...data, arap: arap.filter(r => r.id !== deleteId) });
    showToast('已刪除');
    setDeleteId(null);
  };

  const isOverdue = (dueDate, status) => {
    if (status === '已收' || status === '已付') return false;
    if (!dueDate) return false;
    const due = new Date(dueDate); due.setHours(23, 59, 59, 999);
    return due < new Date();
  };

  // ── Aging Analysis (#69) ──
  const agingData = useMemo(() => {
    const today = new Date();
    const buckets = { current: [], d30: [], d60: [], d90: [], d90plus: [] };
    const pending = list.filter(r => r.status !== '已收' && r.status !== '已付');
    pending.forEach(r => {
      if (!r.dueDate) { buckets.current.push(r); return; }
      const due = new Date(r.dueDate);
      const days = Math.floor((today - due) / 86400000);
      if (days <= 0) buckets.current.push(r);
      else if (days <= 30) buckets.d30.push(r);
      else if (days <= 60) buckets.d60.push(r);
      else if (days <= 90) buckets.d90.push(r);
      else buckets.d90plus.push(r);
    });
    const sum = (arr) => arr.reduce((s, r) => s + Number(r.amount), 0);
    return [
      { label: '未到期', key: 'current', items: buckets.current, total: sum(buckets.current), color: '#16a34a' },
      { label: '1-30天', key: 'd30', items: buckets.d30, total: sum(buckets.d30), color: '#d97706' },
      { label: '31-60天', key: 'd60', items: buckets.d60, total: sum(buckets.d60), color: '#ea580c' },
      { label: '61-90天', key: 'd90', items: buckets.d90, total: sum(buckets.d90), color: '#dc2626' },
      { label: '90天+', key: 'd90plus', items: buckets.d90plus, total: sum(buckets.d90plus), color: '#991b1b' },
    ];
  }, [list]);

  const printAgingReport = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const typeLabel = tab === 'receivable' ? '應收' : '應付';
    const rows = agingData.map(b => `<tr><td style="font-weight:600;color:${b.color}">${b.label}</td><td style="text-align:right">${b.items.length}</td><td style="text-align:right;font-weight:700">${fmtM(b.total)}</td></tr>`).join('');
    const detailRows = agingData.filter(b => b.items.length).map(b =>
      `<tr style="background:#f3f4f6"><td colspan="4" style="font-weight:700;color:${b.color}">${b.label} (${b.items.length}筆)</td></tr>` +
      b.items.map(r => `<tr><td>${r.party}</td><td style="text-align:right">${fmtM(r.amount)}</td><td>${r.dueDate || '-'}</td><td>${r.desc || '-'}</td></tr>`).join('')
    ).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>${typeLabel}帳齡分析</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:30px;max-width:800px;margin:0 auto}
      h1{color:#0e7490;font-size:18px;border-bottom:3px solid #0e7490;padding-bottom:8px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0}
      th{background:#0e7490;color:#fff;padding:6px 8px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #eee}
      .footer{text-align:center;font-size:9px;color:#aaa;margin-top:20px}
    </style></head><body>
      <h1>康晴綜合醫療中心 — ${typeLabel}帳齡分析</h1>
      <p style="font-size:12px;color:#888">生成日期：${new Date().toISOString().substring(0, 10)}</p>
      <h3>摘要</h3><table><thead><tr><th>帳齡</th><th style="text-align:right">筆數</th><th style="text-align:right">金額</th></tr></thead><tbody>${rows}</tbody></table>
      <h3>明細</h3><table><thead><tr><th>對象</th><th style="text-align:right">金額</th><th>到期日</th><th>描述</th></tr></thead><tbody>${detailRows}</tbody></table>
      <div class="footer">此報表由系統自動生成</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
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
          <div><label>金額 ($)</label><input type="text" inputMode="decimal" placeholder="0" value={form.amount} onChange={e => handleAmountChange(e.target.value)} /></div>
          <div><label>到期日</label><input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
          <div><label>描述</label><input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} /></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-green" onClick={handleAdd}>+ 新增</button>
        </div>
      </div>

      {/* Aging Analysis (#69) */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-outline" onClick={() => setShowAging(!showAging)}>{showAging ? '隱藏' : '📊'} 帳齡分析</button>
        {showAging && <button className="btn btn-teal btn-sm" onClick={printAgingReport}>🖨️ 列印報告</button>}
      </div>
      {showAging && (
        <div className="card">
          <div className="card-header"><h3>📊 {tab === 'receivable' ? '應收' : '應付'}帳齡分析</h3></div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {agingData.map(b => (
              <div key={b.key} style={{ flex: 1, minWidth: 120, padding: 12, borderRadius: 8, border: `2px solid ${b.color}20`, background: `${b.color}08`, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: b.color, fontWeight: 600 }}>{b.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: b.color }}>{fmtM(b.total)}</div>
                <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{b.items.length} 筆</div>
              </div>
            ))}
          </div>
          {agingData.filter(b => b.items.length > 0 && b.key !== 'current').map(b => (
            <div key={b.key} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: b.color, marginBottom: 4 }}>{b.label} 逾期</div>
              {b.items.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', fontSize: 12, borderBottom: '1px solid var(--gray-100)' }}>
                  <span style={{ fontWeight: 600 }}>{r.party}</span>
                  <span>{r.desc || ''}</span>
                  <span style={{ color: b.color, fontWeight: 700 }}>{fmtM(r.amount)}</span>
                  <span style={{ color: 'var(--gray-400)' }}>{r.dueDate}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

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
                  <td><span onClick={() => setDeleteId(r.id)} style={{ cursor: 'pointer', color: 'var(--red-500)', fontWeight: 700 }}>✕</span></td>
                  <td>{String(r.date).substring(0, 10)}</td>
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

      {deleteId && <ConfirmModal message={`確認刪除此${tab === 'receivable' ? '應收' : '應付'}帳紀錄？此操作無法復原。`} onConfirm={handleDel} onCancel={() => setDeleteId(null)} />}
    </>
  );
}
