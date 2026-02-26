import { useState, useMemo, useRef } from 'react';
import { saveLeave, deleteLeave } from '../api';
import { uid } from '../data';
import { getClinicName } from '../tenant';
import { useFocusTrap, nullRef } from './ConfirmModal';
import ConfirmModal from './ConfirmModal';

const LEAVE_TYPES = ['年假', '病假', '事假'];
const DEFAULT_BALANCE = { annual: 12, sick: 14, personal: 5 };
const TYPE_TAGS = { '年假': 'tag-paid', '病假': 'tag-overdue', '事假': 'tag-pending-orange' };
const STATUS_TAGS = { pending: 'tag-pending-orange', approved: 'tag-paid', rejected: 'tag-overdue' };
const STATUS_LABELS = { pending: '待審批', approved: '已批准', rejected: '已拒絕' };

function getLeaveBalance() {
  try { return JSON.parse(localStorage.getItem('hcmc_leave_balance')) || {}; } catch { return {}; }
}
function saveLeaveBalance(b) { localStorage.setItem('hcmc_leave_balance', JSON.stringify(b)); }

export default function LeavePage({ data, setData, showToast, allData, user }) {
  const [tab, setTab] = useState('list');
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [form, setForm] = useState({ type: '年假', startDate: '', endDate: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date().toISOString().substring(0, 7));

  const modalRef = useRef(null);
  useFocusTrap(showModal ? modalRef : nullRef);

  const leaves = data.leaves || [];
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const thisMonth = new Date().toISOString().substring(0, 7);

  const myLeaves = useMemo(() => {
    if (isAdmin) return leaves;
    return leaves.filter(l => l.userId === user?.id);
  }, [leaves, isAdmin, user]);

  const calcDays = (start, end) => {
    if (!start || !end) return 0;
    return Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1);
  };

  // Balance calculation
  const balance = useMemo(() => {
    const stored = getLeaveBalance();
    const userBal = stored[user?.id] || { ...DEFAULT_BALANCE };
    const approvedLeaves = leaves.filter(l => l.userId === user?.id && l.status === 'approved');
    const used = { annual: 0, sick: 0, personal: 0 };
    approvedLeaves.forEach(l => {
      if (l.type === '年假') used.annual += l.days || 0;
      else if (l.type === '病假') used.sick += l.days || 0;
      else if (l.type === '事假') used.personal += l.days || 0;
    });
    return {
      annual: (userBal.annual || DEFAULT_BALANCE.annual) - used.annual,
      sick: (userBal.sick || DEFAULT_BALANCE.sick) - used.sick,
      personal: (userBal.personal || DEFAULT_BALANCE.personal) - used.personal,
    };
  }, [leaves, user]);

  const stats = useMemo(() => ({
    pending: myLeaves.filter(l => l.status === 'pending').length,
    approvedThisMonth: myLeaves.filter(l => l.status === 'approved' && l.startDate?.substring(0, 7) === thisMonth).length,
    total: myLeaves.length,
  }), [myLeaves, thisMonth]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.startDate || !form.endDate) return showToast('請選擇日期');
    setSaving(true);
    const record = {
      id: uid(),
      userId: user?.id,
      userName: user?.name || '',
      type: form.type,
      startDate: form.startDate,
      endDate: form.endDate,
      days: calcDays(form.startDate, form.endDate),
      reason: form.reason,
      status: 'pending',
      approvedBy: '',
      approvedAt: '',
      createdAt: new Date().toISOString(),
    };
    await saveLeave(record);
    setData({ ...data, leaves: [...leaves, record] });
    setShowModal(false);
    setSaving(false);
    setForm({ type: '年假', startDate: '', endDate: '', reason: '' });
    showToast('請假申請已提交');
  };

  const handleStatus = async (id, status) => {
    const updated = leaves.map(l => {
      if (l.id === id) return { ...l, status, approvedBy: user?.name || '', approvedAt: new Date().toISOString() };
      return l;
    });
    const record = updated.find(l => l.id === id);
    if (record) await saveLeave(record);
    setData({ ...data, leaves: updated });
    showToast(status === 'approved' ? '已批准' : '已拒絕');
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteLeave(deleteId);
    setData({ ...data, leaves: leaves.filter(l => l.id !== deleteId) });
    showToast('已刪除');
    setDeleteId(null);
  };

  // Calendar view
  const calendarDays = useMemo(() => {
    const [y, m] = calMonth.split('-').map(Number);
    const firstDay = new Date(y, m - 1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calMonth}-${String(d).padStart(2, '0')}`;
      const dayLeaves = leaves.filter(l => l.status === 'approved' && l.startDate <= dateStr && l.endDate >= dateStr);
      cells.push({ day: d, date: dateStr, leaves: dayLeaves });
    }
    return cells;
  }, [calMonth, leaves]);

  const prevMonth = () => {
    const [y, m] = calMonth.split('-').map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    setCalMonth(`${py}-${String(pm).padStart(2, '0')}`);
  };
  const nextMonth = () => {
    const [y, m] = calMonth.split('-').map(Number);
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    setCalMonth(`${ny}-${String(nm).padStart(2, '0')}`);
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">年假餘額</div><div className="stat-value teal">{balance.annual} 天</div></div>
        <div className="stat-card red"><div className="stat-label">病假餘額</div><div className="stat-value red">{balance.sick} 天</div></div>
        <div className="stat-card gold"><div className="stat-label">事假餘額</div><div className="stat-value gold">{balance.personal} 天</div></div>
        <div className="stat-card green"><div className="stat-label">待審批</div><div className="stat-value green">{stats.pending}</div></div>
      </div>

      {/* Tabs + Actions */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          <button className={`tab-btn ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>請假列表</button>
          <button className={`tab-btn ${tab === 'cal' ? 'active' : ''}`} onClick={() => setTab('cal')}>月曆</button>
          {isAdmin && <button className={`tab-btn ${tab === 'balance' ? 'active' : ''}`} onClick={() => setTab('balance')}>假期餘額</button>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => {
            if (!myLeaves.length) return showToast('沒有請假紀錄可匯出');
            const headers = ['申請人','類別','開始日期','結束日期','天數','原因','狀態','審批人'];
            const rows = [...myLeaves].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).map(l =>
              [l.userName, l.type, l.startDate, l.endDate, l.days, l.reason || '', STATUS_LABELS[l.status] || l.status, l.approvedBy || '']
            );
            const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `leave_records_${new Date().toISOString().substring(0,10)}.csv`;
            a.click();
            showToast('已匯出請假紀錄');
          }}>匯出CSV</button>
          <button className="btn btn-gold btn-sm" onClick={() => {
            const w = window.open('', '_blank');
            if (!w) return;
            // Balance for all staff
            const staffBalance = {};
            leaves.forEach(l => {
              if (l.status !== 'approved') return;
              if (!staffBalance[l.userName]) staffBalance[l.userName] = { annual: 0, sick: 0, personal: 0 };
              if (l.type === '年假') staffBalance[l.userName].annual += l.days || 0;
              else if (l.type === '病假') staffBalance[l.userName].sick += l.days || 0;
              else if (l.type === '事假') staffBalance[l.userName].personal += l.days || 0;
            });
            w.document.write(`<!DOCTYPE html><html><head><title>請假報告</title>
              <style>body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:700px;margin:0 auto;font-size:13px}
              h1{font-size:18px;text-align:center}
              .sub{text-align:center;color:#888;font-size:11px;margin-bottom:20px}
              h2{font-size:14px;border-bottom:2px solid #0e7490;padding-bottom:4px;margin-top:20px;color:#0e7490}
              table{width:100%;border-collapse:collapse;margin-bottom:16px}
              th,td{padding:6px 10px;border-bottom:1px solid #eee;text-align:left}
              th{background:#f8f8f8;font-weight:700}
              .r{text-align:right}
              @media print{body{margin:0;padding:10mm}}
              </style></head><body>
              <h1>${getClinicName()} — 請假報告</h1>
              <div class="sub">列印時間：${new Date().toLocaleString('zh-HK')}</div>
              <h2>員工已用假期統計</h2>
              <table><thead><tr><th>員工</th><th class="r">年假</th><th class="r">病假</th><th class="r">事假</th><th class="r">合計</th></tr></thead>
              <tbody>${Object.entries(staffBalance).map(([name, b]) => `<tr><td>${name}</td><td class="r">${b.annual}</td><td class="r">${b.sick}</td><td class="r">${b.personal}</td><td class="r" style="font-weight:700">${b.annual + b.sick + b.personal}</td></tr>`).join('')}</tbody></table>
              <h2>請假記錄</h2>
              <table><thead><tr><th>申請人</th><th>類別</th><th>日期</th><th class="r">天數</th><th>狀態</th></tr></thead>
              <tbody>${[...myLeaves].sort((a,b) => (b.startDate||'').localeCompare(a.startDate||'')).map(l => `<tr><td>${l.userName}</td><td>${l.type}</td><td>${l.startDate} ~ ${l.endDate}</td><td class="r">${l.days}</td><td>${STATUS_LABELS[l.status] || l.status}</td></tr>`).join('')}</tbody></table>
            </body></html>`);
            w.document.close();
            setTimeout(() => w.print(), 300);
          }}>列印報告</button>
          <button className="btn btn-teal" onClick={() => setShowModal(true)}>+ 申請請假</button>
        </div>
      </div>

      {/* List View */}
      {tab === 'list' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header"><h3>請假記錄 ({myLeaves.length})</h3></div>
          <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th>申請人</th><th>類別</th><th>日期</th><th>天數</th><th>原因</th><th>狀態</th>{isAdmin && <th>操作</th>}</tr>
              </thead>
              <tbody>
                {!myLeaves.length && <tr><td colSpan={isAdmin ? 7 : 6} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無請假記錄</td></tr>}
                {[...myLeaves].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>{l.userName}</td>
                    <td><span className={`tag ${TYPE_TAGS[l.type] || 'tag-other'}`}>{l.type}</span></td>
                    <td style={{ fontSize: 12 }}>{l.startDate} ~ {l.endDate}</td>
                    <td style={{ fontWeight: 600 }}>{l.days} 天</td>
                    <td style={{ fontSize: 12, color: 'var(--gray-500)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.reason || '-'}</td>
                    <td>
                      <span className={`tag ${STATUS_TAGS[l.status] || 'tag-other'}`}>{STATUS_LABELS[l.status] || l.status}</span>
                      {l.approvedBy && <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{l.approvedBy}</div>}
                    </td>
                    {isAdmin && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {l.status === 'pending' && (
                            <>
                              <button className="btn btn-green btn-sm" onClick={() => handleStatus(l.id, 'approved')}>批准</button>
                              <button className="btn btn-red btn-sm" onClick={() => handleStatus(l.id, 'rejected')}>拒絕</button>
                            </>
                          )}
                          <button className="btn btn-outline btn-sm" onClick={() => setDeleteId(l.id)}>刪除</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Calendar View */}
      {tab === 'cal' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button className="btn btn-outline btn-sm" onClick={prevMonth}>&lt;</button>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{calMonth}</h3>
            <button className="btn btn-outline btn-sm" onClick={nextMonth}>&gt;</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 12 }}>
            {['日', '一', '二', '三', '四', '五', '六'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontWeight: 700, padding: 6, color: 'var(--gray-500)', background: 'var(--gray-50)' }}>{d}</div>
            ))}
            {calendarDays.map((cell, i) => (
              <div key={i} style={{
                minHeight: 60, padding: 4, border: '1px solid var(--gray-100)', borderRadius: 4,
                background: cell?.leaves?.length ? 'var(--teal-50)' : '#fff',
              }}>
                {cell && (
                  <>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{cell.day}</div>
                    {cell.leaves.map(l => (
                      <div key={l.id} style={{
                        fontSize: 9, padding: '1px 4px', borderRadius: 3, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        background: l.type === '年假' ? '#dcfce7' : l.type === '病假' ? '#fef2f2' : '#fef9c3',
                        color: l.type === '年假' ? '#166534' : l.type === '病假' ? '#991b1b' : '#92400e',
                      }}>
                        {l.userName}
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Balance Tab (#88) */}
      {tab === 'balance' && isAdmin && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header"><h3>全員假期餘額</h3></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>員工</th><th style={{ textAlign: 'right' }}>年假餘額</th><th style={{ textAlign: 'right' }}>年假已用</th><th style={{ textAlign: 'right' }}>病假餘額</th><th style={{ textAlign: 'right' }}>病假已用</th><th style={{ textAlign: 'right' }}>事假餘額</th><th style={{ textAlign: 'right' }}>事假已用</th></tr>
              </thead>
              <tbody>
                {(() => {
                  const stored = getLeaveBalance();
                  const users = [...new Set(leaves.map(l => l.userName).filter(Boolean))];
                  if (!users.length) return <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無紀錄</td></tr>;
                  return users.map(name => {
                    const userLeaves = leaves.filter(l => l.userName === name && l.status === 'approved');
                    const usedA = userLeaves.filter(l => l.type === '年假').reduce((s, l) => s + (l.days || 0), 0);
                    const usedS = userLeaves.filter(l => l.type === '病假').reduce((s, l) => s + (l.days || 0), 0);
                    const usedP = userLeaves.filter(l => l.type === '事假').reduce((s, l) => s + (l.days || 0), 0);
                    const userId = leaves.find(l => l.userName === name)?.userId;
                    const bal = stored[userId] || DEFAULT_BALANCE;
                    return (
                      <tr key={name}>
                        <td style={{ fontWeight: 600 }}>{name}</td>
                        <td className="money" style={{ color: (bal.annual || DEFAULT_BALANCE.annual) - usedA <= 2 ? '#dc2626' : 'var(--green-600)' }}>{(bal.annual || DEFAULT_BALANCE.annual) - usedA}</td>
                        <td className="money" style={{ color: 'var(--gray-400)' }}>{usedA}</td>
                        <td className="money" style={{ color: (bal.sick || DEFAULT_BALANCE.sick) - usedS <= 2 ? '#dc2626' : 'var(--green-600)' }}>{(bal.sick || DEFAULT_BALANCE.sick) - usedS}</td>
                        <td className="money" style={{ color: 'var(--gray-400)' }}>{usedS}</td>
                        <td className="money" style={{ color: (bal.personal || DEFAULT_BALANCE.personal) - usedP <= 1 ? '#dc2626' : 'var(--green-600)' }}>{(bal.personal || DEFAULT_BALANCE.personal) - usedP}</td>
                        <td className="money" style={{ color: 'var(--gray-400)' }}>{usedP}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)} role="dialog" aria-modal="true" aria-label="申請請假">
          <div className="modal" onClick={e => e.stopPropagation()} ref={modalRef} style={{ maxWidth: 450 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>申請請假</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowModal(false)} aria-label="關閉">✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: 12 }}>
                <label>假期類別</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div><label>開始日期 *</label><input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
                <div><label>結束日期 *</label><input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
              </div>
              {form.startDate && form.endDate && (
                <div style={{ background: 'var(--teal-50)', padding: 8, borderRadius: 6, marginBottom: 12, fontSize: 12, color: 'var(--teal-700)' }}>
                  共 <strong>{calcDays(form.startDate, form.endDate)}</strong> 天
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                <label>原因</label>
                <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="請假原因（選填）" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-teal" disabled={saving}>{saving ? '提交中...' : '提交申請'}</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId && <ConfirmModal message="確認刪除此請假記錄？" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />}
    </>
  );
}
