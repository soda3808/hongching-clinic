import { useState, useMemo } from 'react';
import { getDoctors, getStoreNames, getDefaultStore } from '../data';
import { getClinicName } from '../tenant';

const STATUS_FLOW = ['候診中', '診症中', '診症完畢', '服務完成', '已消除'];
const STATUS_COLORS = { '候診中': '#d97706', '診症中': '#2563eb', '診症完畢': '#7c3aed', '服務完成': '#16a34a', '已消除': '#dc2626' };
const STATUS_BG = { '候診中': '#fef9c3', '診症中': '#dbeafe', '診症完畢': '#ede9fe', '服務完成': '#dcfce7', '已消除': '#fee2e2' };
const LS_KEY = 'hcmc_consultation_status';

function today() { return new Date().toISOString().substring(0, 10); }
function nowTime() { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
function loadOverlays() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
function saveOverlays(o) { localStorage.setItem(LS_KEY, JSON.stringify(o)); }

function waitMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const then = new Date(); then.setHours(h, m, 0, 0);
  if (then > now) return 0;
  return Math.floor((now - then) / 60000);
}

function fmtWait(mins) {
  if (mins == null) return '-';
  if (mins < 60) return `${mins}分鐘`;
  return `${Math.floor(mins / 60)}時${mins % 60}分`;
}

export default function ConsultationList({ data, setData, showToast, user }) {
  const DOCTORS = getDoctors();
  const STORES = getStoreNames();
  const [overlays, setOverlays] = useState(loadOverlays);
  const [filterStore, setFilterStore] = useState('all');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [keyword, setKeyword] = useState('');
  const [detailItem, setDetailItem] = useState(null);
  const [, setTick] = useState(0);

  // Refresh timer display every 30s
  useState(() => { const t = setInterval(() => setTick(v => v + 1), 30000); return () => clearInterval(t); });

  const consultations = data.consultations || [];
  const bookings = data.bookings || [];

  const updateOverlay = (id, patch) => {
    const next = { ...overlays, [id]: { ...(overlays[id] || {}), ...patch, updatedAt: nowTime() } };
    setOverlays(next);
    saveOverlays(next);
  };

  const list = useMemo(() => {
    let items = consultations.map(c => {
      const ov = overlays[c.id] || {};
      return { ...c, currentStatus: ov.status || c.status || '候診中', lastUpdate: ov.updatedAt || '', arrivedTime: ov.arrivedTime || c.time || '' };
    });
    if (startDate) items = items.filter(c => c.date >= startDate);
    if (endDate) items = items.filter(c => c.date <= endDate);
    if (filterStore !== 'all') items = items.filter(c => c.store === filterStore);
    if (keyword.trim()) {
      const q = keyword.trim().toLowerCase();
      items = items.filter(c => [c.patientName, c.phone, c.doctor, c.formulaName, c.id].some(f => (f || '').toLowerCase().includes(q)));
    }
    return items.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  }, [consultations, overlays, startDate, endDate, filterStore, keyword]);

  const stats = useMemo(() => {
    const ct = {}; STATUS_FLOW.forEach(x => { ct[x] = 0; }); list.forEach(c => { ct[c.currentStatus] = (ct[c.currentStatus] || 0) + 1; }); return ct;
  }, [list]);

  const advanceStatus = (item) => {
    const idx = STATUS_FLOW.indexOf(item.currentStatus);
    if (idx < 0 || idx >= STATUS_FLOW.length - 2) return; // Cannot advance past 服務完成, skip 已消除
    const next = STATUS_FLOW[idx + 1];
    updateOverlay(item.id, { status: next, arrivedTime: item.arrivedTime || nowTime() });
    showToast(`${item.patientName} - ${next}`);
  };

  // Cancel
  const cancelItem = (item) => {
    updateOverlay(item.id, { status: '已消除' });
    showToast(`${item.patientName} 已消除`);
  };

  // Cross-reference booking
  const findBooking = (c) => bookings.find(b => b.patientName === c.patientName && b.date === c.date);

  const fmtRow = (c) => [c.id?.slice(-5) || '-', c.patientName, c.phone || '-', c.doctor, c.time || '-', c.currentStatus, c.store || '-'];

  const handlePrint = () => {
    const rows = list.filter(c => c.date === today()).map(c => '<tr>' + fmtRow(c).map(v => `<td>${v}</td>`).join('') + '</tr>').join('');
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>診症列表</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px}th{background:#0e7490;color:#fff}h2{color:#0e7490}@media print{body{padding:10px}}</style></head><body><h2>${getClinicName()} — 今日診症列表 (${today()})</h2><p style="font-size:12px;color:#666">列印時間：${new Date().toLocaleString('zh-HK')}</p><table><thead><tr><th>排號</th><th>姓名</th><th>電話</th><th>醫師</th><th>時間</th><th>狀態</th><th>診所</th></tr></thead><tbody>${rows || '<tr><td colspan="7" style="text-align:center">暫無紀錄</td></tr>'}</tbody></table></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  const handleExport = () => {
    const header = '排號\t顧客姓名\t手機\t醫師\t日期\t時間\t狀態\t診所';
    const text = [header, ...list.map(c => `${c.id?.slice(-5) || '-'}\t${c.patientName}\t${c.phone || '-'}\t${c.doctor}\t${c.date}\t${c.time || '-'}\t${c.currentStatus}\t${c.store || '-'}`)].join('\n');
    navigator.clipboard.writeText(text).then(() => showToast('已複製到剪貼簿')).catch(() => showToast('複製失敗'));
  };

  const bdr = '1px solid #e5e7eb';
  const s = {
    card: { background: '#fff', borderRadius: 8, border: bdr, marginBottom: 12 },
    header: { padding: '10px 14px', borderBottom: bdr, fontWeight: 700, fontSize: 14, color: '#0e7490', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    stat: (bg) => ({ flex: 1, minWidth: 80, background: bg, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }),
    badge: (st) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: STATUS_COLORS[st] || '#888', background: STATUS_BG[st] || '#f3f4f6', border: `1px solid ${STATUS_COLORS[st] || '#ccc'}` }),
    btn: { padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
    btnT: { background: '#0e7490', color: '#fff' }, btnO: { background: '#fff', color: '#333', border: '1px solid #d1d5db' },
    btnR: { background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' },
    inp: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' },
    ov: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    mdl: { background: '#fff', borderRadius: 12, padding: 20, width: '92%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' },
    lbl: { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 2 },
    th: { padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#0e7490', borderBottom: '2px solid #e5e7eb', textAlign: 'left', whiteSpace: 'nowrap', background: '#f8fffe' },
    td: { padding: '7px 10px', fontSize: 12, borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' },
  };

  return (
    <div>
      {/* Stats Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {STATUS_FLOW.map(st => (
          <div key={st} style={s.stat(STATUS_BG[st])}>
            <div style={{ fontSize: 22, fontWeight: 800, color: STATUS_COLORS[st] }}>{stats[st] || 0}</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{st}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...s.card, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 12, color: '#6b7280' }}>所屬診所</label>
        <select style={{ ...s.inp, width: 'auto' }} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
          <option value="all">全部診所</option>
          {STORES.map(st => <option key={st}>{st}</option>)}
        </select>
        <label style={{ fontSize: 12, color: '#6b7280', marginLeft: 4 }}>日期範圍</label>
        <input type="date" style={{ ...s.inp, width: 'auto' }} value={startDate} onChange={e => setStartDate(e.target.value)} />
        <span style={{ color: '#aaa' }}>~</span>
        <input type="date" style={{ ...s.inp, width: 'auto' }} value={endDate} onChange={e => setEndDate(e.target.value)} />
        <input style={{ ...s.inp, flex: 1, minWidth: 120 }} placeholder="關鍵字搜尋（姓名/電話/醫師）" value={keyword} onChange={e => setKeyword(e.target.value)} />
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={{ ...s.btn, ...s.btnO }} onClick={handlePrint}>列印</button>
          <button style={{ ...s.btn, ...s.btnO }} onClick={handleExport}>複製</button>
        </div>
      </div>

      {/* Table */}
      <div style={s.card}>
        <div style={s.header}>
          <span>診症列表 ({list.length})</span>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
            <thead><tr>
              {['排號','顧客編號','顧客姓名','性別','年齡','手機','掛號日期','掛號時間','到診時間','診治醫師','現時狀態','最後更新','診所','服務項目'].map(h => <th key={h} style={s.th}>{h}</th>)}
              <th style={{ ...s.th, textAlign: 'center' }}>操作</th>
            </tr></thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={15} style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 13 }}>暫無診症紀錄</td></tr>
              )}
              {list.map(c => {
                const booking = findBooking(c);
                const waitMins = c.currentStatus === '候診中' ? waitMinutes(c.arrivedTime || c.time) : null;
                const waitColor = waitMins != null ? (waitMins > 60 ? '#dc2626' : waitMins > 30 ? '#d97706' : '#0e7490') : '#888';
                return (
                  <tr key={c.id} style={{ background: c.currentStatus === '已消除' ? '#fef2f2' : undefined }}>
                    <td style={{ ...s.td, fontWeight: 800, color: '#0e7490' }}>{c.id?.slice(-5).toUpperCase() || '-'}</td>
                    <td style={s.td}>{c.patientId || booking?.patientId || '-'}</td>
                    <td style={{ ...s.td, fontWeight: 600 }}>{c.patientName}</td>
                    <td style={s.td}>{c.gender || booking?.gender || '-'}</td>
                    <td style={s.td}>{c.age || booking?.age || '-'}</td>
                    <td style={{ ...s.td, color: '#6b7280' }}>{c.phone || '-'}</td>
                    <td style={s.td}>{c.date}</td>
                    <td style={s.td}>{c.time || '-'}</td>
                    <td style={s.td}>
                      {c.arrivedTime || '-'}
                      {c.currentStatus === '候診中' && waitMins != null && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: waitColor }}>{fmtWait(waitMins)}</div>
                      )}
                    </td>
                    <td style={s.td}>{c.doctor}</td>
                    <td style={s.td}>{(() => {
                      const active = c.currentStatus !== '服務完成' && c.currentStatus !== '已消除';
                      return <span style={{ ...s.badge(c.currentStatus), cursor: active ? 'pointer' : 'default' }}
                        onClick={() => active && advanceStatus(c)} title={active ? '點擊推進狀態' : ''}
                        role={active ? 'button' : undefined} tabIndex={active ? 0 : undefined}
                        onKeyDown={e => { if (e.key === 'Enter' && active) advanceStatus(c); }}>{c.currentStatus}</span>;
                    })()}</td>
                    <td style={{ ...s.td, fontSize: 11, color: '#6b7280' }}>{c.lastUpdate || '-'}</td>
                    <td style={s.td}>{c.store || '-'}</td>
                    <td style={{ ...s.td, fontSize: 11 }}>{c.formulaName || c.treatments || '-'}</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button style={{ ...s.btn, ...s.btnT }} onClick={() => setDetailItem(c)}>病歷</button>
                        {c.currentStatus !== '服務完成' && c.currentStatus !== '已消除' && (
                          <button style={{ ...s.btn, ...s.btnR }} onClick={() => cancelItem(c)}>消除</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {detailItem && (
        <div style={s.ov} onClick={() => setDetailItem(null)}>
          <div style={s.mdl} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 15, color: '#0e7490' }}>病歷詳情</h3>
              <button style={{ ...s.btn, ...s.btnO }} onClick={() => setDetailItem(null)}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginBottom: 14 }}>
              <div><span style={s.lbl}>顧客姓名：</span>{detailItem.patientName}</div>
              <div><span style={s.lbl}>手機：</span>{detailItem.phone || '-'}</div>
              <div><span style={s.lbl}>醫師：</span>{detailItem.doctor}</div>
              <div><span style={s.lbl}>診所：</span>{detailItem.store || '-'}</div>
              <div><span style={s.lbl}>日期：</span>{detailItem.date}</div>
              <div><span style={s.lbl}>時間：</span>{detailItem.time || '-'}</div>
              <div><span style={s.lbl}>狀態：</span><span style={s.badge(detailItem.currentStatus)}>{detailItem.currentStatus}</span></div>
            </div>
            {/* Prescription */}
            {detailItem.formulaName && (
              <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: '#0e7490', marginBottom: 6 }}>處方：{detailItem.formulaName}</div>
                {Array.isArray(detailItem.prescription) && detailItem.prescription.length > 0 && (
                  <div style={{ fontSize: 12 }}>
                    {detailItem.prescription.map((rx, i) => (
                      <span key={i} style={{ display: 'inline-block', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 6px', margin: '2px 4px 2px 0', fontSize: 11 }}>
                        {rx.herb} {rx.dosage && `${rx.dosage}g`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Special Notes */}
            {detailItem.specialNotes && (
              <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: 12, fontSize: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 4 }}>特別備註</div>
                {detailItem.specialNotes}
              </div>
            )}
            {/* Cross-reference booking info */}
            {(() => {
              const bk = findBooking(detailItem);
              if (!bk) return null;
              return (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#475569', marginBottom: 4 }}>預約資料</div>
                  <div>預約類型：{bk.type || '-'} | 狀態：{bk.status || '-'}</div>
                  {bk.notes && <div style={{ color: '#64748b', marginTop: 4 }}>備註：{bk.notes}</div>}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
