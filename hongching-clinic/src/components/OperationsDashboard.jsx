import { useState, useMemo } from 'react';
import { fmtM, getDoctors } from '../data';

const ACCENT = '#0e7490';
const today = () => new Date().toISOString().substring(0, 10);
const nowHour = () => new Date().getHours();

export default function OperationsDashboard({ data, showToast, user }) {
  const [refreshTs, setRefreshTs] = useState(Date.now());
  const DOCTORS = getDoctors();
  const td = today();

  /* ── derived data ── */
  const queue = useMemo(() => (data.queue || []).filter(q => q.date === td), [data.queue, td]);
  const revenue = useMemo(() => (data.revenue || []).filter(r => (r.date || '').substring(0, 10) === td), [data.revenue, td]);
  const bookings = useMemo(() => (data.bookings || []).filter(b => b.date === td && b.status !== 'cancelled'), [data.bookings, td]);
  const consultations = data.consultations || [];
  const inventory = data.inventory || [];

  /* ── status cards ── */
  const totalReg = queue.length;
  const waiting = queue.filter(q => q.status === 'waiting').length;
  const inConsult = queue.filter(q => q.status === 'in-consultation').length;
  const completed = queue.filter(q => q.status === 'completed').length;
  const todayRev = revenue.reduce((s, r) => s + Number(r.amount || 0), 0);
  const todayBookings = bookings.length;

  const cards = [
    { label: '今日掛號', value: totalReg, color: ACCENT, icon: '📋' },
    { label: '正在候診', value: waiting, color: '#d97706', icon: '⏳' },
    { label: '診症中', value: inConsult, color: '#7c3aed', icon: '🩺' },
    { label: '今日完成', value: completed, color: '#16a34a', icon: '✅' },
    { label: '今日營業額', value: fmtM(todayRev), color: '#dc2626', icon: '💰' },
    { label: '今日預約', value: todayBookings, color: '#0284c7', icon: '📅' },
  ];

  /* ── doctor status ── */
  const doctorStatus = useMemo(() => {
    return DOCTORS.map(doc => {
      const docQueue = queue.filter(q => q.doctor === doc);
      const hasActive = docQueue.some(q => q.status === 'in-consultation');
      const allDone = docQueue.length > 0 && docQueue.every(q => q.status === 'completed');
      const status = hasActive ? 'in-consultation' : allDone ? 'break' : 'available';
      return { name: doc, status, count: docQueue.length, done: docQueue.filter(q => q.status === 'completed').length };
    });
  }, [queue, DOCTORS]);

  const statusLabel = { 'available': '可接診', 'in-consultation': '診症中', 'break': '休息中' };
  const statusColor = { 'available': '#16a34a', 'in-consultation': '#7c3aed', 'break': '#d97706' };

  /* ── queue timeline ── */
  const timeline = useMemo(() => {
    const hours = [];
    for (let h = 9; h <= 20; h++) {
      const hStr = String(h).padStart(2, '0');
      const inHour = queue.filter(q => (q.time || '').startsWith(hStr));
      hours.push({ hour: h, label: `${hStr}:00`, total: inHour.length, completed: inHour.filter(q => q.status === 'completed').length });
    }
    return hours;
  }, [queue]);

  const maxTimeline = Math.max(...timeline.map(t => t.total), 1);

  /* ── hourly revenue ── */
  const hourlyRev = useMemo(() => {
    const hours = [];
    for (let h = 9; h <= 20; h++) {
      const hStr = String(h).padStart(2, '0');
      const amt = revenue.filter(r => {
        const t = r.time || r.createdAt || '';
        return t.startsWith(hStr) || (t.length >= 13 && t.substring(11, 13) === hStr);
      }).reduce((s, r) => s + Number(r.amount || 0), 0);
      hours.push({ hour: h, label: `${hStr}:00`, amount: amt });
    }
    return hours;
  }, [revenue]);

  const maxHourlyRev = Math.max(...hourlyRev.map(h => h.amount), 1);

  /* ── service mix ── */
  const serviceMix = useMemo(() => {
    const mix = { '診症': 0, '中藥': 0, '治療': 0, '產品': 0 };
    revenue.forEach(r => {
      const item = (r.item || r.service || '').toLowerCase();
      if (item.includes('藥') || item.includes('herb') || item.includes('處方')) mix['中藥'] += Number(r.amount || 0);
      else if (item.includes('針') || item.includes('推拿') || item.includes('灸') || item.includes('拔罐') || item.includes('治療')) mix['治療'] += Number(r.amount || 0);
      else if (item.includes('產品') || item.includes('product')) mix['產品'] += Number(r.amount || 0);
      else mix['診症'] += Number(r.amount || 0);
    });
    const total = Object.values(mix).reduce((s, v) => s + v, 0) || 1;
    const colors = { '診症': ACCENT, '中藥': '#8B6914', '治療': '#7c3aed', '產品': '#dc2626' };
    return Object.entries(mix).map(([k, v]) => ({ name: k, value: v, pct: Math.round((v / total) * 100), color: colors[k] }));
  }, [revenue]);

  /* ── alerts ── */
  const alerts = useMemo(() => {
    const list = [];
    const lowStock = inventory.filter(i => i.active !== false && Number(i.stock) <= Number(i.minStock || 10));
    if (lowStock.length > 0) list.push({ type: 'warning', text: `${lowStock.length} 項藥材/物品庫存不足` });
    const pendingBookings = bookings.filter(b => b.status === 'pending');
    if (pendingBookings.length > 0) list.push({ type: 'info', text: `${pendingBookings.length} 個預約待確認` });
    const overdueQueue = queue.filter(q => q.status === 'waiting' && q.time);
    const longWait = overdueQueue.filter(q => {
      const [h, m] = (q.time || '0:0').split(':').map(Number);
      const mins = (nowHour() * 60 + new Date().getMinutes()) - (h * 60 + m);
      return mins > 30;
    });
    if (longWait.length > 0) list.push({ type: 'urgent', text: `${longWait.length} 位病人候診超過30分鐘` });
    if (list.length === 0) list.push({ type: 'ok', text: '目前沒有待處理提醒' });
    return list;
  }, [inventory, bookings, queue]);

  const alertColors = { urgent: '#dc2626', warning: '#d97706', info: '#0284c7', ok: '#16a34a' };
  const alertIcons = { urgent: '🚨', warning: '⚠️', info: 'ℹ️', ok: '✅' };

  /* ── refresh handler ── */
  const handleRefresh = () => { setRefreshTs(Date.now()); if (showToast) showToast('資料已更新'); };

  /* ── styles ── */
  const card = { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' };
  const grid6 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 };
  const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 };
  const heading = { fontSize: 15, fontWeight: 700, marginBottom: 10, color: '#1e293b' };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: '#1e293b' }}>即時營運面板</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            最後更新：{new Date(refreshTs).toLocaleTimeString('zh-HK')}
          </span>
          <button onClick={handleRefresh} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            重新整理
          </button>
        </div>
      </div>

      {/* status cards */}
      <div style={grid6}>
        {cards.map(c => (
          <div key={c.label} style={{ ...card, borderLeft: `4px solid ${c.color}`, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={grid2}>
        {/* doctor status */}
        <div style={card}>
          <div style={heading}>醫師狀態</div>
          {doctorStatus.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>未設定醫師</div>}
          {doctorStatus.map(d => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</span>
                <span style={{ marginLeft: 8, fontSize: 12, padding: '2px 8px', borderRadius: 10, background: statusColor[d.status] + '18', color: statusColor[d.status], fontWeight: 600 }}>
                  {statusLabel[d.status]}
                </span>
              </div>
              <span style={{ fontSize: 12, color: '#64748b' }}>已完成 {d.done}/{d.count}</span>
            </div>
          ))}
        </div>

        {/* active alerts */}
        <div style={card}>
          <div style={heading}>即時提醒</div>
          {alerts.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 16 }}>{alertIcons[a.type]}</span>
              <span style={{ fontSize: 13, color: alertColors[a.type], fontWeight: 600 }}>{a.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={grid2}>
        {/* queue timeline */}
        <div style={card}>
          <div style={heading}>掛號時段分佈</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
            {timeline.map(t => {
              const h = t.total > 0 ? Math.max((t.total / maxTimeline) * 100, 8) : 0;
              const ch = t.completed > 0 ? Math.max((t.completed / maxTimeline) * 100, 4) : 0;
              const isCurrent = t.hour === nowHour();
              return (
                <div key={t.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '100%', position: 'relative', height: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    {t.total > 0 && (
                      <div style={{ position: 'absolute', top: 100 - h, left: '10%', width: '80%', height: h, background: isCurrent ? ACCENT : '#cbd5e1', borderRadius: '3px 3px 0 0', opacity: 0.4 }} />
                    )}
                    {t.completed > 0 && (
                      <div style={{ position: 'absolute', bottom: 0, left: '10%', width: '80%', height: ch, background: '#16a34a', borderRadius: '3px 3px 0 0' }} />
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: isCurrent ? ACCENT : '#94a3b8', marginTop: 2, fontWeight: isCurrent ? 700 : 400 }}>
                    {t.hour}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#64748b' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#cbd5e1', borderRadius: 2, marginRight: 4 }} />掛號</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#16a34a', borderRadius: 2, marginRight: 4 }} />已完成</span>
          </div>
        </div>

        {/* hourly revenue */}
        <div style={card}>
          <div style={heading}>每小時營業額</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
            {hourlyRev.map(h => {
              const barH = h.amount > 0 ? Math.max((h.amount / maxHourlyRev) * 100, 6) : 0;
              const isCurrent = h.hour === nowHour();
              return (
                <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '100%', height: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {h.amount > 0 && (
                      <div title={fmtM(h.amount)} style={{ width: '70%', height: barH, background: isCurrent ? '#dc2626' : ACCENT, borderRadius: '3px 3px 0 0', cursor: 'default' }} />
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: isCurrent ? ACCENT : '#94a3b8', marginTop: 2, fontWeight: isCurrent ? 700 : 400 }}>
                    {h.hour}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#64748b', marginTop: 6 }}>
            合計：<b style={{ color: '#dc2626' }}>{fmtM(todayRev)}</b>
          </div>
        </div>
      </div>

      {/* service mix */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={heading}>服務組合（今日營收比例）</div>
        {todayRev === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 20 }}>今日尚無收入紀錄</div>
        ) : (
          <>
            {/* stacked bar */}
            <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
              {serviceMix.filter(s => s.pct > 0).map(s => (
                <div key={s.name} title={`${s.name}: ${fmtM(s.value)} (${s.pct}%)`} style={{ width: `${s.pct}%`, background: s.color, minWidth: s.pct > 0 ? 2 : 0, transition: 'width .3s' }} />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {serviceMix.map(s => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color, display: 'inline-block' }} />
                  <span style={{ color: '#334155' }}>{s.name}</span>
                  <span style={{ fontWeight: 700, color: s.color }}>{s.pct}%</span>
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>({fmtM(s.value)})</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* auto-refresh note */}
      <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 12, color: '#94a3b8' }}>
        資料隨頁面操作自動更新 · 點擊「重新整理」可手動刷新
      </div>
    </div>
  );
}
