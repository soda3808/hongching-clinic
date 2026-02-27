import { useState, useMemo } from 'react';
import { getDoctors } from '../data';

const ACCENT = '#0e7490';
const today = () => new Date().toISOString().substring(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().substring(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const fmtDate = d => { if (!d) return '-'; const dt = new Date(d); return `${d}（${WEEKDAYS[dt.getDay()]}）`; };

const TABS = [
  { key: 'today', label: '今日覆診' },
  { key: 'overdue', label: '已逾期' },
  { key: '7d', label: '7日內' },
  { key: '14d', label: '14日內' },
  { key: '30d', label: '30日內' },
  { key: 'all', label: '全部' },
];

export default function FollowUpManager({ data, showToast, user }) {
  const DOCTORS = getDoctors();
  const [tab, setTab] = useState('today');
  const [filterDoc, setFilterDoc] = useState('all');
  const [search, setSearch] = useState('');
  const [calMonth, setCalMonth] = useState(today().substring(0, 7));
  const [view, setView] = useState('list'); // list | calendar
  const [actionItem, setActionItem] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [completed, setCompleted] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_followup_done') || '[]'); } catch { return []; }
  });

  const consultations = data.consultations || [];
  const patients = data.patients || [];
  const td = today();

  const followUps = useMemo(() => {
    return consultations
      .filter(c => c.followUpDate)
      .map(c => {
        const pt = patients.find(p => p.id === c.patientId || p.name === c.patientName);
        const diff = daysBetween(td, c.followUpDate);
        const isDone = completed.includes(c.id);
        const hasReturned = consultations.some(next => next.id !== c.id && (next.patientId === c.patientId || next.patientName === c.patientName) && next.date >= c.followUpDate);
        return { ...c, patient: pt, diff, isDone: isDone || hasReturned, phone: c.patientPhone || pt?.phone || '' };
      });
  }, [consultations, patients, td, completed]);

  const pending = useMemo(() => followUps.filter(f => !f.isDone), [followUps]);
  const overdue = useMemo(() => pending.filter(f => f.diff < 0), [pending]);
  const todayList = useMemo(() => pending.filter(f => f.diff === 0), [pending]);

  const stats = useMemo(() => {
    const total = followUps.length;
    const doneCount = followUps.filter(f => f.isDone).length;
    return {
      total: pending.length,
      overdue: overdue.length,
      today: todayList.length,
      rate: total > 0 ? Math.round(doneCount / total * 100) : 0,
    };
  }, [followUps, pending, overdue, todayList]);

  const filtered = useMemo(() => {
    let list = pending;
    if (tab === 'today') list = todayList;
    else if (tab === 'overdue') list = overdue;
    else if (tab === '7d') list = pending.filter(f => f.diff >= 0 && f.diff <= 7);
    else if (tab === '14d') list = pending.filter(f => f.diff >= 0 && f.diff <= 14);
    else if (tab === '30d') list = pending.filter(f => f.diff >= 0 && f.diff <= 30);
    else list = followUps; // 'all' includes done
    if (filterDoc !== 'all') list = list.filter(f => f.doctor === filterDoc);
    if (search) list = list.filter(f => (f.patientName || '').includes(search) || (f.phone || '').includes(search));
    return list.sort((a, b) => (a.followUpDate || '').localeCompare(b.followUpDate || ''));
  }, [tab, pending, todayList, overdue, followUps, filterDoc, search]);

  const markDone = (id) => {
    const next = [...completed, id];
    setCompleted(next);
    localStorage.setItem('hcmc_followup_done', JSON.stringify(next));
    showToast('已標記為完成');
    setActionItem(null);
  };

  const handleCancel = (id) => {
    markDone(id);
    showToast('已取消覆診提醒');
  };

  const handleWhatsApp = (f) => {
    const phone = (f.phone || '').replace(/[\s\-()]/g, '');
    const formatted = phone.length === 8 ? '852' + phone : phone;
    const msg = `${f.patientName}你好！提提你覆診日期為 ${f.followUpDate}，如需改期請聯絡我們。祝健康！`;
    window.open(`https://wa.me/${formatted}?text=${encodeURIComponent(msg)}`, '_blank');
    showToast('已開啟 WhatsApp');
  };

  const handleCall = (f) => {
    window.open(`tel:${f.phone}`, '_self');
  };

  // ── Calendar helpers ──
  const calDays = useMemo(() => {
    const [y, m] = calMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0).getDate();
    const startPad = first.getDay();
    const days = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= lastDay; d++) days.push(`${calMonth}-${String(d).padStart(2, '0')}`);
    return days;
  }, [calMonth]);

  const calCounts = useMemo(() => {
    const map = {};
    pending.forEach(f => { map[f.followUpDate] = (map[f.followUpDate] || 0) + 1; });
    return map;
  }, [pending]);

  const shiftMonth = (dir) => {
    const [y, m] = calMonth.split('-').map(Number);
    const nd = new Date(y, m - 1 + dir, 1);
    setCalMonth(nd.toISOString().substring(0, 7));
  };

  const S = {
    page: { padding: 16, maxWidth: 1000, margin: '0 auto' },
    title: { fontSize: 20, fontWeight: 700, color: ACCENT, marginBottom: 16 },
    stats: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 },
    stat: (bg) => ({ padding: '12px 10px', borderRadius: 8, background: bg, textAlign: 'center' }),
    statN: (c) => ({ fontSize: 22, fontWeight: 700, color: c }),
    statL: { fontSize: 11, color: '#666', marginTop: 2 },
    tabs: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
    tab: (a) => ({ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: a ? ACCENT : '#e5e7eb', color: a ? '#fff' : '#555', transition: '.2s' }),
    row: (urgent) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: urgent ? '#fef2f2' : '#fff', borderLeft: `4px solid ${urgent ? '#dc2626' : ACCENT}`, marginBottom: 6, boxShadow: '0 1px 3px #0001', flexWrap: 'wrap' }),
    badge: (bg, c) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: bg, color: c }),
    btn: (bg) => ({ padding: '4px 10px', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: bg, color: '#fff' }),
    modal: { position: 'fixed', inset: 0, background: '#0006', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
    modalBox: { background: '#fff', borderRadius: 12, padding: 20, width: 340, maxHeight: '80vh', overflow: 'auto' },
    calGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 },
    calCell: (isToday, count) => ({ padding: '6px 2px', textAlign: 'center', fontSize: 12, borderRadius: 6, background: isToday ? '#e0f7fa' : count > 0 ? '#f0fdfa' : '#fafafa', cursor: count > 0 ? 'pointer' : 'default', minHeight: 38 }),
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={S.title}>覆診管理</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={S.btn(view === 'list' ? ACCENT : '#94a3b8')} onClick={() => setView('list')}>列表</button>
          <button style={S.btn(view === 'calendar' ? ACCENT : '#94a3b8')} onClick={() => setView('calendar')}>月曆</button>
        </div>
      </div>

      {/* Stats */}
      <div style={S.stats}>
        <div style={S.stat('#f0fdfa')}><div style={S.statN(ACCENT)}>{stats.total}</div><div style={S.statL}>待覆診</div></div>
        <div style={S.stat('#fef2f2')}><div style={S.statN('#dc2626')}>{stats.overdue}</div><div style={S.statL}>已逾期</div></div>
        <div style={S.stat('#eff6ff')}><div style={S.statN('#2563eb')}>{stats.today}</div><div style={S.statL}>今日到期</div></div>
        <div style={S.stat('#fefce8')}><div style={S.statN('#d97706')}>{stats.rate}%</div><div style={S.statL}>完成率</div></div>
      </div>

      {view === 'list' ? (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋病人姓名/電話" style={{ flex: 1, minWidth: 160, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
            <select value={filterDoc} onChange={e => setFilterDoc(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
              <option value="all">全部醫師</option>
              {DOCTORS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Tabs */}
          <div style={S.tabs}>
            {TABS.map(t => (
              <button key={t.key} style={S.tab(tab === t.key)} onClick={() => setTab(t.key)}>
                {t.label}{t.key === 'overdue' && stats.overdue > 0 ? ` (${stats.overdue})` : t.key === 'today' && stats.today > 0 ? ` (${stats.today})` : ''}
              </button>
            ))}
          </div>

          {/* List */}
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#999', fontSize: 14 }}>暫無覆診紀錄</div>}
          {filtered.map(f => {
            const isOverdue = f.diff < 0 && !f.isDone;
            const isToday = f.diff === 0 && !f.isDone;
            return (
              <div key={f.id} style={S.row(isOverdue)}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{f.patientName}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{f.phone || '無電話'} | {f.doctor}</div>
                  {f.followUpNotes && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{f.followUpNotes}</div>}
                </div>
                <div style={{ textAlign: 'center', minWidth: 100 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{fmtDate(f.followUpDate)}</div>
                  {isOverdue && <span style={S.badge('#fee2e2', '#dc2626')}>逾期 {Math.abs(f.diff)} 天</span>}
                  {isToday && <span style={S.badge('#dbeafe', '#2563eb')}>今日</span>}
                  {f.isDone && <span style={S.badge('#dcfce7', '#16a34a')}>已完成</span>}
                  {!f.isDone && f.diff > 0 && <span style={S.badge('#f0fdfa', ACCENT)}>{f.diff} 天後</span>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {!f.isDone && <button style={S.btn('#16a34a')} onClick={() => markDone(f.id)}>完成</button>}
                  {!f.isDone && <button style={S.btn('#d97706')} onClick={() => { setActionItem(f); setRescheduleDate(f.followUpDate); }}>改期</button>}
                  {!f.isDone && <button style={S.btn('#dc2626')} onClick={() => handleCancel(f.id)}>取消</button>}
                  {f.phone && <button style={S.btn('#25D366')} onClick={() => handleWhatsApp(f)}>WhatsApp</button>}
                  {f.phone && <button style={S.btn('#2563eb')} onClick={() => handleCall(f)}>致電</button>}
                </div>
              </div>
            );
          })}
        </>
      ) : (
        /* Calendar View */
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <button style={S.btn(ACCENT)} onClick={() => shiftMonth(-1)}>← 上月</button>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{calMonth.replace('-', '年') + '月'}</div>
            <button style={S.btn(ACCENT)} onClick={() => shiftMonth(1)}>下月 →</button>
          </div>
          <div style={S.calGrid}>
            {WEEKDAYS.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#888', padding: 4 }}>{w}</div>)}
            {calDays.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const cnt = calCounts[d] || 0;
              const isTd = d === td;
              return (
                <div key={d} style={S.calCell(isTd, cnt)} onClick={() => { if (cnt > 0) { setView('list'); setTab('all'); setSearch(d); } }}>
                  <div style={{ fontWeight: isTd ? 700 : 400, color: isTd ? ACCENT : '#333' }}>{parseInt(d.split('-')[2])}</div>
                  {cnt > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: cnt > 2 ? '#dc2626' : ACCENT, marginTop: 2 }}>{cnt}人</div>}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: '#888', textAlign: 'center' }}>點擊日期可查看當日覆診名單</div>
        </div>
      )}

      {/* Reschedule Modal */}
      {actionItem && (
        <div style={S.modal} onClick={() => setActionItem(null)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: ACCENT }}>改期覆診 — {actionItem.patientName}</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>原定日期：{fmtDate(actionItem.followUpDate)}</div>
            <label style={{ fontSize: 12, fontWeight: 600 }}>新覆診日期</label>
            <input type="date" value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', marginBottom: 12, fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={S.btn('#94a3b8')} onClick={() => setActionItem(null)}>取消</button>
              <button style={S.btn(ACCENT)} onClick={() => {
                if (!rescheduleDate) return showToast('請選擇日期');
                showToast(`已將 ${actionItem.patientName} 覆診改至 ${rescheduleDate}`);
                setActionItem(null);
              }}>確認改期</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
