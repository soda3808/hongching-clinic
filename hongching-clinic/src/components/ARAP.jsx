import { useState, useMemo } from 'react';
import { saveARAP, deleteRecord } from '../api';
import { uid, fmtM, fmt, getMonth } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';
import ConfirmModal from './ConfirmModal';

export default function ARAP({ data, setData, showToast }) {
  const [tab, setTab] = useState('receivable');
  const [form, setForm] = useState({ type: 'receivable', date: new Date().toISOString().split('T')[0], party: '', amount: '', desc: '', dueDate: '', status: '未收' });
  const [deleteId, setDeleteId] = useState(null);
  const [showAging, setShowAging] = useState(false);
  const [agingFilter, setAgingFilter] = useState(null);
  const [reminderTarget, setReminderTarget] = useState(null);

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
    const rows = agingData.map(b => `<tr><td style="font-weight:600;color:${b.color}">${escapeHtml(b.label)}</td><td style="text-align:right">${b.items.length}</td><td style="text-align:right;font-weight:700">${fmtM(b.total)}</td></tr>`).join('');
    const detailRows = agingData.filter(b => b.items.length).map(b =>
      `<tr style="background:#f3f4f6"><td colspan="4" style="font-weight:700;color:${b.color}">${escapeHtml(b.label)} (${b.items.length}筆)</td></tr>` +
      b.items.map(r => `<tr><td>${escapeHtml(r.party)}</td><td style="text-align:right">${fmtM(r.amount)}</td><td>${r.dueDate || '-'}</td><td>${escapeHtml(r.desc || '-')}</td></tr>`).join('')
    ).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>${typeLabel}帳齡分析</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:30px;max-width:800px;margin:0 auto}
      h1{color:#0e7490;font-size:18px;border-bottom:3px solid #0e7490;padding-bottom:8px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0}
      th{background:#0e7490;color:#fff;padding:6px 8px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #eee}
      .footer{text-align:center;font-size:9px;color:#aaa;margin-top:20px}
    </style></head><body>
      <h1>${escapeHtml(getClinicName())} — ${typeLabel}帳齡分析</h1>
      <p style="font-size:12px;color:#888">生成日期：${new Date().toISOString().substring(0, 10)}</p>
      <h3>摘要</h3><table><thead><tr><th>帳齡</th><th style="text-align:right">筆數</th><th style="text-align:right">金額</th></tr></thead><tbody>${rows}</tbody></table>
      <h3>明細</h3><table><thead><tr><th>對象</th><th style="text-align:right">金額</th><th>到期日</th><th>描述</th></tr></thead><tbody>${detailRows}</tbody></table>
      <div class="footer">此報表由系統自動生成</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // ── CSV Export ──
  const exportCSV = () => {
    const typeLabel = tab === 'receivable' ? '應收' : '應付';
    const rows = [['日期', '對象', '金額', '到期日', '狀態', '描述', '帳齡']];
    const today = new Date();
    list.forEach(r => {
      let aging = '-';
      if (r.dueDate && r.status !== '已收' && r.status !== '已付') {
        const days = Math.floor((today - new Date(r.dueDate)) / 86400000);
        aging = days <= 0 ? '未到期' : `逾期${days}天`;
      }
      rows.push([r.date, r.party, r.amount, r.dueDate || '', r.status, r.desc || '', aging]);
    });
    const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${typeLabel}帳_${new Date().toISOString().substring(0, 10)}.csv`;
    a.click();
    showToast('已匯出 CSV');
  };

  // ── Monthly Trend ──
  const monthlyTrend = useMemo(() => {
    const months = {};
    list.forEach(r => {
      const m = (r.date || '').substring(0, 7);
      if (!m) return;
      if (!months[m]) months[m] = { total: 0, paid: 0, pending: 0, count: 0 };
      months[m].total += Number(r.amount);
      months[m].count++;
      if (r.status === '已收' || r.status === '已付') months[m].paid += Number(r.amount);
      else months[m].pending += Number(r.amount);
    });
    return Object.entries(months).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  }, [list]);

  // ── WhatsApp Reminder ──
  const sendReminder = (r) => {
    const typeLabel = tab === 'receivable' ? '應收' : '應付';
    const days = r.dueDate ? Math.floor((new Date() - new Date(r.dueDate)) / 86400000) : 0;
    const msg = `${getClinicName()} 付款提醒\n\n${r.party} 您好，\n\n您有一筆${typeLabel}款項尚未處理：\n金額：$${Number(r.amount).toLocaleString()}\n到期日：${r.dueDate || '未設定'}\n${days > 0 ? `已逾期 ${days} 天` : ''}\n描述：${r.desc || '-'}\n\n請儘快處理，謝謝！`;
    setReminderTarget({ ...r, message: msg });
  };

  const printReminderLetter = (r) => {
    const w = window.open('', '_blank');
    if (!w) return;
    const days = r.dueDate ? Math.floor((new Date() - new Date(r.dueDate)) / 86400000) : 0;
    w.document.write(`<!DOCTYPE html><html><head><title>付款提醒</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:40px;max-width:600px;margin:0 auto}
      h1{color:#0e7490;font-size:20px;border-bottom:3px solid #0e7490;padding-bottom:10px}
      .info{margin:20px 0;line-height:2}
      .amount{font-size:24px;color:#dc2626;font-weight:800}
      .footer{margin-top:40px;padding-top:16px;border-top:1px solid #ddd;font-size:11px;color:#888;text-align:center}
    </style></head><body>
      <h1>${escapeHtml(getClinicName())} — 付款提醒通知</h1>
      <p>日期：${new Date().toISOString().substring(0, 10)}</p>
      <div class="info">
        <p><strong>${escapeHtml(r.party)}</strong> 閣下：</p>
        <p>根據本中心紀錄，閣下有以下款項尚未處理：</p>
        <p>金額：<span class="amount">$${Number(r.amount).toLocaleString()}</span></p>
        <p>到期日：${r.dueDate || '未設定'}</p>
        ${days > 0 ? `<p style="color:#dc2626;font-weight:700">已逾期 ${days} 天</p>` : ''}
        <p>描述：${escapeHtml(r.desc || '-')}</p>
        <p style="margin-top:24px">敬請儘快安排付款，如已付款請忽略此通知。</p>
        <p>如有任何疑問，請聯絡本中心。</p>
      </div>
      <div class="footer">${escapeHtml(getClinicName())}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // ── Filtered list with aging bucket ──
  const displayList = useMemo(() => {
    if (!agingFilter) return list;
    const bucket = agingData.find(b => b.key === agingFilter);
    if (!bucket) return list;
    const ids = new Set(bucket.items.map(r => r.id));
    return list.filter(r => ids.has(r.id));
  }, [list, agingFilter, agingData]);

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

      {/* Action bar */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={() => setShowAging(!showAging)}>{showAging ? '隱藏' : '📊'} 帳齡分析</button>
        {showAging && <button className="btn btn-teal btn-sm" onClick={printAgingReport}>🖨️ 列印報告</button>}
        <button className="btn btn-outline btn-sm" onClick={exportCSV}>📥 CSV 匯出</button>
        {agingFilter && <button className="btn btn-outline btn-sm" onClick={() => setAgingFilter(null)}>✕ 清除篩選</button>}
      </div>
      {showAging && (
        <div className="card">
          <div className="card-header"><h3>📊 {tab === 'receivable' ? '應收' : '應付'}帳齡分析</h3></div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {agingData.map(b => (
              <div key={b.key} onClick={() => setAgingFilter(agingFilter === b.key ? null : b.key)} style={{ flex: 1, minWidth: 120, padding: 12, borderRadius: 8, border: `2px solid ${agingFilter === b.key ? b.color : b.color + '20'}`, background: agingFilter === b.key ? b.color + '15' : b.color + '08', textAlign: 'center', cursor: 'pointer', transition: 'all .2s' }}>
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

      {/* Monthly Trend */}
      {monthlyTrend.length > 1 && (
        <div className="card">
          <div className="card-header"><h3>📈 {tab === 'receivable' ? '應收' : '應付'}月度趨勢</h3></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, padding: '0 8px' }}>
            {(() => { const maxVal = Math.max(...monthlyTrend.map(([, d]) => d.total), 1); return monthlyTrend.map(([m, d]) => (
              <div key={m} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--teal-700)' }}>{fmtM(d.total)}</div>
                  <div style={{ position: 'relative', width: '100%', maxWidth: 40, margin: '0 auto' }}>
                    <div style={{ height: Math.max((d.paid / maxVal) * 80, 2), background: '#16a34a', borderRadius: '4px 4px 0 0' }} title={`已收/付: ${fmtM(d.paid)}`} />
                    <div style={{ height: Math.max((d.pending / maxVal) * 80, 2), background: '#d97706', borderRadius: '0 0 4px 4px' }} title={`待處理: ${fmtM(d.pending)}`} />
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--gray-400)' }}>{m.substring(5)}</div>
                </div>
              </div>
            )); })()}
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: 10, color: 'var(--gray-400)' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#16a34a', marginRight: 4 }} />已收/付</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#d97706', marginRight: 4 }} />待處理</span>
          </div>
        </div>
      )}

      {/* Records */}
      <div className="card">
        <div className="card-header">
          <h3>📋 {tab === 'receivable' ? '應收' : '應付'}帳列表 ({displayList.length}{agingFilter ? ` / ${list.length}` : ''} 筆 | 待處理 {fmtM(totalPending)})</h3>
        </div>
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr><th></th><th>日期</th><th>{tab === 'receivable' ? '應收對象' : '應付對象'}</th><th style={{ textAlign: 'right' }}>金額</th><th>到期日</th><th>狀態</th><th>描述</th><th>操作</th></tr>
            </thead>
            <tbody>
              {!displayList.length && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>未有紀錄</td></tr>}
              {[...displayList].sort((a, b) => (a.status === '已收' || a.status === '已付' ? 1 : -1)).map(r => (
                <tr key={r.id} style={{ opacity: r.status === '已收' || r.status === '已付' ? .5 : 1 }}>
                  <td><span onClick={() => setDeleteId(r.id)} style={{ cursor: 'pointer', color: 'var(--red-500)', fontWeight: 700 }}>✕</span></td>
                  <td>{String(r.date).substring(0, 10)}</td>
                  <td style={{ fontWeight: 600 }}>{r.party}</td>
                  <td className="money" style={{ color: tab === 'receivable' ? 'var(--teal-700)' : 'var(--red-600)' }}>{fmtM(r.amount)}</td>
                  <td style={{ color: isOverdue(r.dueDate, r.status) ? 'var(--red-500)' : 'inherit', fontWeight: isOverdue(r.dueDate, r.status) ? 700 : 400 }}>{r.dueDate || '-'}</td>
                  <td>{statusTag(r)}</td>
                  <td style={{ color: 'var(--gray-400)', fontSize: 11 }}>{r.desc}</td>
                  <td style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(r.status !== '已收' && r.status !== '已付') && (
                      <>
                        <button className="btn btn-teal btn-sm" onClick={() => handleStatus(r.id, tab === 'receivable' ? '已收' : '已付')}>
                          ✓ {tab === 'receivable' ? '已收' : '已付'}
                        </button>
                        {tab === 'receivable' && isOverdue(r.dueDate, r.status) && (
                          <>
                            <button className="btn btn-outline btn-sm" onClick={() => sendReminder(r)} title="WhatsApp 提醒">📱</button>
                            <button className="btn btn-outline btn-sm" onClick={() => printReminderLetter(r)} title="列印提醒信">📄</button>
                          </>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* WhatsApp Reminder Modal */}
      {reminderTarget && (
        <div className="modal-overlay" onClick={() => setReminderTarget(null)} role="dialog" aria-modal="true" aria-label="付款提醒">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3>📱 付款提醒</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setReminderTarget(null)}>✕</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>對象: <strong>{reminderTarget.party}</strong></label>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>金額: {fmtM(reminderTarget.amount)} | 到期日: {reminderTarget.dueDate || '-'}</div>
            </div>
            <textarea
              value={reminderTarget.message}
              onChange={e => setReminderTarget({ ...reminderTarget, message: e.target.value })}
              rows={8}
              style={{ width: '100%', fontSize: 13, lineHeight: 1.6 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-green" onClick={() => {
                const phone = (reminderTarget.party || '').replace(/\D/g, '');
                const url = `https://wa.me/852${phone}?text=${encodeURIComponent(reminderTarget.message)}`;
                window.open(url, '_blank');
                setReminderTarget(null);
                showToast('已開啟 WhatsApp');
              }}>📱 WhatsApp 發送</button>
              <button className="btn btn-outline" onClick={() => { printReminderLetter(reminderTarget); setReminderTarget(null); }}>🖨️ 列印提醒信</button>
              <button className="btn btn-outline" onClick={() => setReminderTarget(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {deleteId && <ConfirmModal message={`確認刪除此${tab === 'receivable' ? '應收' : '應付'}帳紀錄？此操作無法復原。`} onConfirm={handleDel} onCancel={() => setDeleteId(null)} />}
    </>
  );
}
