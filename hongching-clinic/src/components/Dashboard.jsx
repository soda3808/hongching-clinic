import { useState, useMemo } from 'react';
import { fmtM, getMonth } from '../data';
import { getTenantStoreNames, getClinicName } from '../tenant';
import { S, ECTCM, rowStyle } from '../styles/ectcm';

const today = () => new Date().toISOString().substring(0, 10);
const thisMonth = () => new Date().toISOString().substring(0, 7);
const fmtDay = d => { if (!d) return ''; const w = ['日','一','二','三','四','五','六']; return `星期${w[new Date(d).getDay()]}`; };

export default function Dashboard({ data, onNavigate }) {
  const [store, setStore] = useState('all');
  const stores = getTenantStoreNames();
  const todayDate = today();
  const month = thisMonth();

  // Filter by store
  const f = (arr) => store === 'all' ? (arr || []) : (arr || []).filter(r => (r.store || '') === store);

  // Today's stats
  const todayRev = f(data.revenue).filter(r => r.date === todayDate);
  const todayRevTotal = todayRev.reduce((s, r) => s + Number(r.amount || 0), 0);
  const todayConsults = f(data.consultations).filter(c => c.date === todayDate);
  const todayQueue = f(data.queue).filter(q => q.date === todayDate);
  const todayBookings = f(data.bookings).filter(b => b.date === todayDate && b.status !== 'cancelled');

  // Monthly stats
  const monthRev = f(data.revenue).filter(r => (r.date || '').substring(0, 7) === month);
  const monthRevTotal = monthRev.reduce((s, r) => s + Number(r.amount || 0), 0);
  const monthConsults = f(data.consultations).filter(c => (c.date || '').substring(0, 7) === month);
  const monthExp = f(data.expenses).filter(r => (r.date || '').substring(0, 7) === month);
  const monthExpTotal = monthExp.reduce((s, r) => s + Number(r.amount || 0), 0);

  // Revenue by store this month
  const revByStore = useMemo(() => {
    const m = {};
    (data.revenue || []).filter(r => (r.date || '').substring(0, 7) === month).forEach(r => {
      const s = r.store || '未知';
      m[s] = (m[s] || 0) + Number(r.amount || 0);
    });
    return m;
  }, [data.revenue, month]);

  // Low stock alerts
  const lowStock = useMemo(() => {
    return (data.inventory || []).filter(i => {
      const stock = Number(i.stock || i.remaining || 0);
      const safety = Number(i.safetyLevel || i.minStock || 0);
      return safety > 0 && stock <= safety;
    }).slice(0, 8);
  }, [data.inventory]);

  // Tomorrow's bookings
  const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
  const tmrDate = tmr.toISOString().substring(0, 10);
  const tmrBookings = (data.bookings || []).filter(b => b.date === tmrDate && b.status !== 'cancelled');

  const statBox = (label, value, sub, color) => (
    <div style={{ flex: 1, minWidth: 140, background: '#fff', border: `2px solid ${color || ECTCM.headerBg}`, borderRadius: 4, padding: '12px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#666', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || ECTCM.headerBg, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={S.page}>
      {/* Title Bar */}
      <div style={S.titleBar}>
        <span>📊 今日營運總覽</span>
        <span style={{ fontSize: 13, fontWeight: 400 }}>{todayDate} ({fmtDay(todayDate)})</span>
      </div>

      {/* Filter Bar */}
      <div style={{ ...S.filterBar, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>分店：</span>
        <select value={store} onChange={e => setStore(e.target.value)} style={S.filterSelect}>
          <option value="all">全部分店</option>
          {stores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>{getClinicName()}</span>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 0', flexWrap: 'wrap' }}>
        {statBox('今日收入', `$${fmtM(todayRevTotal)}`, `${todayRev.length} 筆交易`)}
        {statBox('本月收入', `$${fmtM(monthRevTotal)}`, `${monthRev.length} 筆`, '#0e7490')}
        {statBox('今日診症', todayConsults.length, `掛號 ${todayQueue.length}`)}
        {statBox('本月診症', monthConsults.length, `淨利 $${fmtM(monthRevTotal - monthExpTotal)}`, monthRevTotal - monthExpTotal >= 0 ? '#16a34a' : '#dc2626')}
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { id: 'queue', icon: '🎫', label: '掛號排隊' },
          { id: 'emr', icon: '🏥', label: '電子病歷' },
          { id: 'billing', icon: '💵', label: '配藥收費' },
          { id: 'dailycare', icon: '💝', label: '每日關懷' },
          { id: 'patient', icon: '👥', label: '病人管理' },
          { id: 'inventory', icon: '💊', label: '藥材庫存' },
        ].map(a => (
          <button key={a.id} onClick={() => onNavigate?.(a.id)} style={{ ...S.actionBtn, padding: '8px 16px', fontSize: 13 }}>
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      {/* Today's Patient Table */}
      <div style={{ fontSize: 14, fontWeight: 700, color: ECTCM.headerBg, marginBottom: 6 }}>今日診症紀錄 ({todayConsults.length})</div>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>排號</th>
            <th style={S.th}>病人</th>
            <th style={S.th}>醫師</th>
            <th style={S.th}>服務</th>
            <th style={{ ...S.th, textAlign: 'right' }}>金額</th>
            <th style={S.th}>店舖</th>
          </tr>
        </thead>
        <tbody>
          {todayConsults.length === 0 && (
            <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#999', padding: 20 }}>今日暫無診症紀錄</td></tr>
          )}
          {todayConsults.map((c, i) => {
            const rev = todayRev.find(r => r.name === c.patientName);
            return (
              <tr key={c.id || i} style={rowStyle(i)}>
                <td style={S.td}>{c.queueNo || '-'}</td>
                <td style={{ ...S.td, fontWeight: 600 }}>{c.patientName}</td>
                <td style={S.td}>{c.doctor}</td>
                <td style={S.td}>{Array.isArray(c.treatments) ? c.treatments.join('; ') : (c.treatments || c.services || '-')}</td>
                <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: '#0e7490' }}>{rev ? `$${fmtM(rev.amount)}` : '-'}</td>
                <td style={S.td}>{c.store}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Monthly Revenue by Store */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 250 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: ECTCM.headerBg, marginBottom: 6 }}>本月收入分佈</div>
          <table style={S.table}>
            <thead><tr><th style={S.th}>店舖</th><th style={{ ...S.th, textAlign: 'right' }}>收入</th></tr></thead>
            <tbody>
              {Object.entries(revByStore).map(([s, amt], i) => (
                <tr key={s} style={rowStyle(i)}>
                  <td style={S.td}>{s}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>${fmtM(amt)}</td>
                </tr>
              ))}
              <tr style={{ background: ECTCM.thBg }}>
                <td style={{ ...S.td, color: '#fff', fontWeight: 700 }}>合計</td>
                <td style={{ ...S.td, color: '#fff', fontWeight: 700, textAlign: 'right' }}>${fmtM(monthRevTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Tomorrow's Bookings */}
        <div style={{ flex: 1, minWidth: 250 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: ECTCM.headerBg, marginBottom: 6 }}>明日預約 ({tmrBookings.length})</div>
          <table style={S.table}>
            <thead><tr><th style={S.th}>時間</th><th style={S.th}>病人</th><th style={S.th}>醫師</th><th style={S.th}>店舖</th></tr></thead>
            <tbody>
              {tmrBookings.length === 0 && (
                <tr><td colSpan={4} style={{ ...S.td, textAlign: 'center', color: '#999' }}>暫無預約</td></tr>
              )}
              {tmrBookings.sort((a, b) => (a.time || '').localeCompare(b.time || '')).map((b, i) => (
                <tr key={b.id || i} style={rowStyle(i)}>
                  <td style={S.td}>{b.time || '-'}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{b.patientName}</td>
                  <td style={S.td}>{b.doctor}</td>
                  <td style={S.td}>{b.store}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Low Stock Alerts */}
      {lowStock.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>⚠️ 庫存不足提醒 ({lowStock.length})</div>
          <table style={S.table}>
            <thead><tr><th style={S.th}>藥材</th><th style={S.th}>店舖</th><th style={{ ...S.th, textAlign: 'right' }}>現存量</th><th style={{ ...S.th, textAlign: 'right' }}>安全量</th></tr></thead>
            <tbody>
              {lowStock.map((item, i) => (
                <tr key={item.id || i} style={rowStyle(i)}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{item.name}</td>
                  <td style={S.td}>{item.store}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>{item.stock || item.remaining || 0}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{item.safetyLevel || item.minStock || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={S.footer}>
        <span>數據截至 {new Date().toLocaleTimeString('zh-HK')}</span>
      </div>
    </div>
  );
}
