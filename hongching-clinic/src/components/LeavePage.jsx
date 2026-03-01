import { useState, useMemo, useRef, useEffect } from 'react';
import { saveLeave, deleteLeave, leaveBalanceOps } from '../api';
import { uid } from '../data';
import { getClinicName } from '../tenant';
import { useFocusTrap, nullRef } from './ConfirmModal';
import ConfirmModal from './ConfirmModal';
import escapeHtml from '../utils/escapeHtml';

const LEAVE_TYPES = ['年假', '病假', '事假', '補假', '產假', '婚假'];
const DEFAULT_BALANCE = { annual: 12, sick: 14, personal: 5 };
const TYPE_TAGS = { '年假': 'tag-paid', '病假': 'tag-overdue', '事假': 'tag-pending-orange', '補假': 'tag-other', '產假': 'tag-paid', '婚假': 'tag-paid' };
const TYPE_COLORS = { '年假': { bg: '#dcfce7', color: '#166534' }, '病假': { bg: '#fef2f2', color: '#991b1b' }, '事假': { bg: '#fef9c3', color: '#92400e' }, '補假': { bg: '#ede9fe', color: '#5b21b6' }, '產假': { bg: '#fce7f3', color: '#9d174d' }, '婚假': { bg: '#fdf2f8', color: '#be185d' } };
const STATUS_TAGS = { pending: 'tag-pending-orange', approved: 'tag-paid', rejected: 'tag-overdue' };
const STATUS_LABELS = { pending: '待審批', approved: '已批准', rejected: '已拒絕' };
const HK_HOLIDAYS_2025 = ['2025-01-01','2025-01-29','2025-01-30','2025-01-31','2025-02-01','2025-04-04','2025-04-18','2025-04-19','2025-04-21','2025-05-01','2025-05-05','2025-05-31','2025-07-01','2025-10-01','2025-10-07','2025-10-29','2025-12-25','2025-12-26'];
const HK_HOLIDAYS_2026 = ['2026-01-01','2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-04-04','2026-04-03','2026-04-06','2026-05-01','2026-05-24','2026-06-19','2026-07-01','2026-10-01','2026-10-26','2026-10-19','2026-12-25','2026-12-26'];
const HK_HOLIDAYS = new Set([...HK_HOLIDAYS_2025, ...HK_HOLIDAYS_2026]);
const MONTH_LABELS = ['', '一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

function getLeaveBalance() {
  try { return JSON.parse(localStorage.getItem('hcmc_leave_balance')) || {}; } catch { return {}; }
}
function saveLeaveBalance(b) { localStorage.setItem('hcmc_leave_balance', JSON.stringify(b)); leaveBalanceOps.persist(b); }

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
  const [leaveBalVer, setLeaveBalVer] = useState(0);

  useEffect(() => {
    leaveBalanceOps.load().then(d => {
      if (d) {
        localStorage.setItem('hcmc_leave_balance', JSON.stringify(d));
        setLeaveBalVer(v => v + 1);
      }
    });
  }, []);

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
  }, [leaves, user, leaveBalVer]);

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
          <button className={`tab-btn ${tab === 'timeline' ? 'active' : ''}`} onClick={() => setTab('timeline')}>團隊時間線</button>
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
              <h1>${escapeHtml(getClinicName())} — 請假報告</h1>
              <div class="sub">列印時間：${new Date().toLocaleString('zh-HK')}</div>
              <h2>員工已用假期統計</h2>
              <table><thead><tr><th>員工</th><th class="r">年假</th><th class="r">病假</th><th class="r">事假</th><th class="r">合計</th></tr></thead>
              <tbody>${Object.entries(staffBalance).map(([name, b]) => `<tr><td>${escapeHtml(name)}</td><td class="r">${b.annual}</td><td class="r">${b.sick}</td><td class="r">${b.personal}</td><td class="r" style="font-weight:700">${b.annual + b.sick + b.personal}</td></tr>`).join('')}</tbody></table>
              <h2>請假記錄</h2>
              <table><thead><tr><th>申請人</th><th>類別</th><th>日期</th><th class="r">天數</th><th>狀態</th></tr></thead>
              <tbody>${[...myLeaves].sort((a,b) => (b.startDate||'').localeCompare(a.startDate||'')).map(l => `<tr><td>${escapeHtml(l.userName)}</td><td>${escapeHtml(l.type)}</td><td>${escapeHtml(l.startDate)} ~ ${escapeHtml(l.endDate)}</td><td class="r">${l.days}</td><td>${escapeHtml(STATUS_LABELS[l.status] || l.status)}</td></tr>`).join('')}</tbody></table>
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
      {tab === 'cal' && (() => {
        const today = new Date().toISOString().substring(0, 10);
        const [cy, cm] = calMonth.split('-').map(Number);
        return (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button className="btn btn-outline btn-sm" onClick={prevMonth}>&lt;</button>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{cy}年 {MONTH_LABELS[cm]}</h3>
            <button className="btn btn-outline btn-sm" onClick={nextMonth}>&gt;</button>
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 10, flexWrap: 'wrap' }}>
            {Object.entries(TYPE_COLORS).map(([type, c]) => (
              <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: c.bg, border: `1px solid ${c.color}` }} />
                <span style={{ color: c.color, fontWeight: 600 }}>{type}</span>
              </span>
            ))}
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#fee2e2', border: '1px solid #f87171' }} />
              <span style={{ color: '#dc2626', fontWeight: 600 }}>公眾假期</span>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 12 }}>
            {['日', '一', '二', '三', '四', '五', '六'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontWeight: 700, padding: 6, color: d === '日' || d === '六' ? '#dc2626' : 'var(--gray-500)', background: 'var(--gray-50)' }}>{d}</div>
            ))}
            {calendarDays.map((cell, i) => {
              const isToday = cell?.date === today;
              const isHoliday = cell && HK_HOLIDAYS.has(cell.date);
              const isWeekend = cell && (new Date(cell.date).getDay() === 0 || new Date(cell.date).getDay() === 6);
              return (
              <div key={i} style={{
                minHeight: 68, padding: 4, border: isToday ? '2px solid #0e7490' : '1px solid var(--gray-100)', borderRadius: 4,
                background: isHoliday ? '#fee2e2' : cell?.leaves?.length ? '#f0fdfa' : isWeekend ? '#fafafa' : '#fff',
              }}>
                {cell && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2, color: isToday ? '#0e7490' : isHoliday || isWeekend ? '#dc2626' : '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{cell.day}</span>
                      {isToday && <span style={{ fontSize: 8, padding: '1px 4px', background: '#0e7490', color: '#fff', borderRadius: 3 }}>今日</span>}
                    </div>
                    {isHoliday && <div style={{ fontSize: 8, color: '#dc2626', fontWeight: 600 }}>公眾假期</div>}
                    {cell.leaves.map(l => {
                      const tc = TYPE_COLORS[l.type] || TYPE_COLORS['事假'];
                      return (
                      <div key={l.id} style={{
                        fontSize: 9, padding: '1px 4px', borderRadius: 3, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        background: tc.bg, color: tc.color,
                      }}>
                        {l.userName} ({l.type})
                      </div>
                    );})}
                  </>
                )}
              </div>
            );})}
          </div>
        </div>
        );
      })()}

      {/* Team Timeline (Gantt) View */}
      {tab === 'timeline' && (() => {
        const [ty, tm] = calMonth.split('-').map(Number);
        const daysInMonth = new Date(ty, tm, 0).getDate();
        const today = new Date().toISOString().substring(0, 10);
        const todayNum = today.startsWith(calMonth) ? parseInt(today.substring(8)) : -1;
        const staff = [...new Set(leaves.map(l => l.userName).filter(Boolean))].sort();
        const monthLeaves = leaves.filter(l => l.status === 'approved' && l.startDate?.substring(0, 7) <= calMonth && l.endDate?.substring(0, 7) >= calMonth);
        return (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button className="btn btn-outline btn-sm" onClick={prevMonth}>&lt;</button>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{ty}年 {MONTH_LABELS[tm]} — 團隊假期概覽</h3>
            <button className="btn btn-outline btn-sm" onClick={nextMonth}>&gt;</button>
          </div>
          {!staff.length ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無已批准假期紀錄</div>
          ) : (
            <div style={{ minWidth: Math.max(600, daysInMonth * 28 + 100) }}>
              {/* Header row — days */}
              <div style={{ display: 'flex', borderBottom: '2px solid var(--gray-200)', paddingBottom: 4, marginBottom: 4 }}>
                <div style={{ width: 90, minWidth: 90, fontWeight: 700, fontSize: 11, color: 'var(--gray-500)' }}>員工</div>
                {Array.from({ length: daysInMonth }, (_, d) => {
                  const dayNum = d + 1;
                  const dateStr = `${calMonth}-${String(dayNum).padStart(2, '0')}`;
                  const dow = new Date(ty, tm - 1, dayNum).getDay();
                  const isWe = dow === 0 || dow === 6;
                  const isH = HK_HOLIDAYS.has(dateStr);
                  return (
                    <div key={d} style={{
                      flex: 1, textAlign: 'center', fontSize: 10, fontWeight: dayNum === todayNum ? 800 : 600,
                      color: dayNum === todayNum ? '#0e7490' : isH ? '#dc2626' : isWe ? '#f87171' : '#666',
                      background: dayNum === todayNum ? '#ecfeff' : 'transparent', borderRadius: 3, padding: '2px 0',
                    }}>
                      {dayNum}
                    </div>
                  );
                })}
              </div>
              {/* Staff rows */}
              {staff.map(name => {
                const sl = monthLeaves.filter(l => l.userName === name);
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--gray-100)', minHeight: 28 }}>
                    <div style={{ width: 90, minWidth: 90, fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    {Array.from({ length: daysInMonth }, (_, d) => {
                      const dayNum = d + 1;
                      const dateStr = `${calMonth}-${String(dayNum).padStart(2, '0')}`;
                      const leave = sl.find(l => l.startDate <= dateStr && l.endDate >= dateStr);
                      const tc = leave ? (TYPE_COLORS[leave.type] || TYPE_COLORS['事假']) : null;
                      return (
                        <div key={d} style={{
                          flex: 1, height: 22, margin: '0 1px', borderRadius: 3,
                          background: leave ? tc.bg : dayNum === todayNum ? '#ecfeff' : 'transparent',
                          border: leave ? `1px solid ${tc.color}40` : 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }} title={leave ? `${leave.type}: ${leave.startDate}~${leave.endDate}` : ''}>
                          {leave && <span style={{ fontSize: 8, color: tc.color, fontWeight: 700 }}>{leave.type.charAt(0)}</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {/* Summary row */}
              <div style={{ display: 'flex', alignItems: 'center', borderTop: '2px solid var(--gray-200)', minHeight: 28, marginTop: 4, paddingTop: 4 }}>
                <div style={{ width: 90, minWidth: 90, fontSize: 11, fontWeight: 700, color: 'var(--teal-700)' }}>放假人數</div>
                {Array.from({ length: daysInMonth }, (_, d) => {
                  const dateStr = `${calMonth}-${String(d + 1).padStart(2, '0')}`;
                  const count = monthLeaves.filter(l => l.startDate <= dateStr && l.endDate >= dateStr).length;
                  return (
                    <div key={d} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 700, color: count >= 2 ? '#dc2626' : count === 1 ? '#d97706' : '#ccc' }}>
                      {count || ''}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        );
      })()}

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
