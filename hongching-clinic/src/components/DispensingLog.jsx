import { useState, useMemo, useEffect } from 'react';
import { getDoctors, getStoreNames, getDefaultStore } from '../data';
import { getClinicName } from '../tenant';
import { dispensingLogOps } from '../api';
import escapeHtml from '../utils/escapeHtml';
import { getHerbSafetyInfo } from '../utils/drugInteractions';

const STATUS_MAP = {
  pending: { label: '待配藥', color: '#f59e0b', bg: '#fffbeb' },
  dispensing: { label: '配藥中', color: '#3b82f6', bg: '#eff6ff' },
  dispensed: { label: '已配藥', color: '#8b5cf6', bg: '#f5f3ff' },
  collected: { label: '已取藥', color: '#10b981', bg: '#ecfdf5' },
  cancelled: { label: '已取消', color: '#ef4444', bg: '#fef2f2' },
};

function loadLog() { try { return JSON.parse(localStorage.getItem('hcmc_dispensing_log') || '[]'); } catch { return []; } }
function saveLog(arr) { localStorage.setItem('hcmc_dispensing_log', JSON.stringify(arr)); dispensingLogOps.persistAll(arr); }

export default function DispensingLog({ data, showToast, user }) {
  const [log, setLog] = useState(loadLog);
  useEffect(() => { dispensingLogOps.load().then(d => { if (d) setLog(d); }); }, []);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().substring(0, 10));
  const [detail, setDetail] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());

  const consultations = data.consultations || [];
  const doctors = getDoctors();
  const clinicName = getClinicName();
  const inventory = data.inventory || [];

  // Stock lookup helper
  const getStock = (herbName) => {
    const item = inventory.find(i => i.name === herbName && i.active !== false);
    if (!item) return null;
    return { stock: item.stock || 0, minStock: item.minStock || 0, unit: item.unit || 'g' };
  };

  const toggleExpand = (id) => {
    setExpandedRows(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  // Merge consultations with dispensing status
  const items = useMemo(() => {
    const logMap = {};
    log.forEach(l => { logMap[l.consultId] = l; });

    return consultations.map(c => {
      const entry = logMap[c.id] || {};
      const rxList = (c.prescription || []).filter(r => r.herb);
      return {
        ...c,
        rxCount: rxList.length,
        rxList,
        dispenseStatus: entry.status || 'pending',
        dispenseBy: entry.dispenseBy || '',
        dispenseAt: entry.dispenseAt || '',
        collectAt: entry.collectAt || '',
        dispenseNotes: entry.notes || '',
      };
    }).filter(item => {
      if (filterDate && item.date !== filterDate) return false;
      if (filterStatus !== 'all' && item.dispenseStatus !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return item.patientName?.toLowerCase().includes(q) || item.doctor?.toLowerCase().includes(q) || item.formulaName?.toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => {
      const order = { pending: 0, dispensing: 1, dispensed: 2, collected: 3, cancelled: 4 };
      return (order[a.dispenseStatus] ?? 9) - (order[b.dispenseStatus] ?? 9);
    });
  }, [consultations, log, search, filterStatus, filterDate]);

  const updateStatus = (consultId, newStatus) => {
    const now = new Date().toISOString();
    const existing = log.find(l => l.consultId === consultId);
    let updated;
    if (existing) {
      updated = log.map(l => l.consultId === consultId ? {
        ...l,
        status: newStatus,
        ...(newStatus === 'dispensed' ? { dispenseBy: user?.name || '', dispenseAt: now } : {}),
        ...(newStatus === 'collected' ? { collectAt: now } : {}),
      } : l);
    } else {
      updated = [...log, {
        consultId,
        status: newStatus,
        dispenseBy: newStatus === 'dispensed' || newStatus === 'dispensing' ? (user?.name || '') : '',
        dispenseAt: newStatus === 'dispensed' ? now : '',
        collectAt: newStatus === 'collected' ? now : '',
        notes: '',
        createdAt: now,
      }];
    }
    setLog(updated);
    saveLog(updated);
    showToast(`已更新為「${STATUS_MAP[newStatus]?.label}」`);
  };

  // Stats
  const stats = useMemo(() => {
    const dayItems = consultations.filter(c => c.date === filterDate);
    const logMap = {};
    log.forEach(l => { logMap[l.consultId] = l; });
    const counts = { pending: 0, dispensing: 0, dispensed: 0, collected: 0, cancelled: 0 };
    dayItems.forEach(c => { const s = logMap[c.id]?.status || 'pending'; counts[s] = (counts[s] || 0) + 1; });
    return { ...counts, total: dayItems.length };
  }, [consultations, log, filterDate]);

  // Print dispensing report
  const handlePrint = () => {
    const rows = items.filter(i => i.rxCount > 0).map(i =>
      `<tr><td>${escapeHtml(i.patientName)}</td><td>${escapeHtml(i.doctor)}</td><td>${escapeHtml(i.formulaName || '-')}</td><td>${i.rxList.map(r => `${escapeHtml(r.herb)} ${escapeHtml(r.dosage)}`).join('<br/>')}</td><td>${i.formulaDays || '-'}天</td><td>${STATUS_MAP[i.dispenseStatus]?.label}</td></tr>`
    ).join('');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>配藥日誌</title><style>body{font:12px sans-serif;padding:15px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:5px;text-align:left;font-size:11px}th{background:#f3f4f6}.header{text-align:center;margin-bottom:12px}h1{font-size:16px;margin:0}@media print{body{padding:10px}}</style></head><body><div class="header"><h1>${escapeHtml(clinicName)} — 配藥日誌</h1><p>${filterDate}</p></div><table><thead><tr><th>病人</th><th>醫師</th><th>處方</th><th>藥材</th><th>天數</th><th>狀態</th></tr></thead><tbody>${rows}</tbody></table><p style="font-size:10px;color:#999;margin-top:12px">列印時間：${new Date().toLocaleString('zh-HK')}</p></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>📋 開藥日誌</h2>
        <div style={{ flex: 1 }} />
        <button onClick={handlePrint} className="btn btn-outline" style={{ fontSize: 12 }}>🖨️ 列印</button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 8, marginBottom: 12 }}>
        {[['total', '總計', '#0e7490'], ['pending', '待配藥', '#f59e0b'], ['dispensing', '配藥中', '#3b82f6'], ['dispensed', '已配藥', '#8b5cf6'], ['collected', '已取藥', '#10b981']].map(([k, label, color]) => (
          <div key={k} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{stats[k]}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="input" style={{ width: 150 }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input" style={{ width: 130 }}>
          <option value="all">全部狀態</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋病人/醫師/處方..." className="input" style={{ flex: 1, minWidth: 150 }} />
      </div>

      {/* Dispensing Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>排號</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>病人</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>醫師</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>處方</th>
              <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>藥材數</th>
              <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>天數</th>
              <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>狀態</th>
              <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '2px solid #e5e7eb' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: '#999' }}>當日無配藥記錄</td></tr>}
            {items.filter(i => i.rxCount > 0).map((item, idx) => {
              const st = STATUS_MAP[item.dispenseStatus] || STATUS_MAP.pending;
              const isExpanded = expandedRows.has(item.id);
              const hasLowStock = item.rxList.some(r => { const s = getStock(r.herb); return s && s.stock < s.minStock; });
              const hasNoStock = item.rxList.some(r => { const s = getStock(r.herb); return s && s.stock <= 0; });
              return (
                <tr key={item.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid #f3f4f6', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 6px', fontWeight: 700, color: '#0e7490' }}>{idx + 1}</td>
                  <td style={{ padding: '8px 6px' }}>{item.patientName}</td>
                  <td style={{ padding: '8px 6px' }}>{item.doctor}</td>
                  <td style={{ padding: '8px 6px', maxWidth: 300 }} colSpan={isExpanded ? 1 : 1}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => toggleExpand(item.id)}>
                      <span style={{ fontSize: 10, color: '#888' }}>{isExpanded ? '▼' : '▶'}</span>
                      <span style={{ fontWeight: 600 }}>{item.formulaName || '自訂處方'}</span>
                      {hasNoStock && <span style={{ fontSize: 10, background: '#fef2f2', color: '#dc2626', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>缺貨</span>}
                      {!hasNoStock && hasLowStock && <span style={{ fontSize: 10, background: '#fffbeb', color: '#d97706', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>低庫存</span>}
                    </div>
                    {!isExpanded && <div style={{ fontSize: 11, color: '#888', marginTop: 2, marginLeft: 16 }}>{item.rxList.slice(0, 4).map(r => r.herb).join('、')}{item.rxCount > 4 ? `...+${item.rxCount - 4}` : ''}</div>}
                    {isExpanded && (
                      <div style={{ marginTop: 6, marginLeft: 16, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: '#f8fafc' }}>
                              <th style={{ padding: '4px 8px', textAlign: 'left', fontSize: 11 }}>藥材</th>
                              <th style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11 }}>劑量</th>
                              <th style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11 }}>需用量</th>
                              <th style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11 }}>庫存</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.rxList.map((r, ri) => {
                              const st2 = getStock(r.herb);
                              const doseG = parseFloat(r.dosage) || 0;
                              const needed = doseG * (item.formulaDays || 1);
                              const isLow = st2 && st2.stock < needed;
                              const isOut = st2 && st2.stock <= 0;
                              return (
                                <tr key={ri} style={{ borderBottom: '1px solid #f3f4f6', background: isOut ? '#fef2f2' : isLow ? '#fffbeb' : '' }}>
                                  <td style={{ padding: '3px 8px', fontWeight: 500 }}>{r.herb}</td>
                                  <td style={{ padding: '3px 8px', textAlign: 'center' }}>{r.dosage}</td>
                                  <td style={{ padding: '3px 8px', textAlign: 'center', color: '#555' }}>{needed > 0 ? `${needed}g` : '-'}</td>
                                  <td style={{ padding: '3px 8px', textAlign: 'center', fontWeight: 600, color: isOut ? '#dc2626' : isLow ? '#d97706' : '#10b981' }}>
                                    {st2 ? `${st2.stock}${st2.unit}` : <span style={{ color: '#999', fontWeight: 400 }}>未登記</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {item.specialNotes && <div style={{ padding: '4px 8px', fontSize: 11, background: '#fffbeb', color: '#92400e' }}>⚠️ {item.specialNotes}</div>}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{item.rxCount}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{item.formulaDays || '-'}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span>
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {item.dispenseStatus === 'pending' && <button onClick={() => updateStatus(item.id, 'dispensing')} className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px' }}>開始配藥</button>}
                      {item.dispenseStatus === 'dispensing' && <button onClick={() => updateStatus(item.id, 'dispensed')} className="btn btn-primary" style={{ fontSize: 11, padding: '2px 8px' }}>配藥完成</button>}
                      {item.dispenseStatus === 'dispensed' && <button onClick={() => updateStatus(item.id, 'collected')} className="btn btn-primary" style={{ fontSize: 11, padding: '2px 8px', background: '#10b981' }}>已取藥</button>}
                      <button onClick={() => setDetail(item)} className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px' }}>詳情</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={() => setDetail(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '95%', maxWidth: 500, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px' }}>處方詳情 — {detail.patientName}</h3>
            <div style={{ fontSize: 13, display: 'grid', gap: 6 }}>
              <div><strong>日期：</strong>{detail.date}</div>
              <div><strong>醫師：</strong>{detail.doctor}</div>
              <div><strong>處方：</strong>{detail.formulaName || '自訂'}</div>
              <div><strong>天數：</strong>{detail.formulaDays || '-'}天</div>
              <div><strong>服法：</strong>{detail.formulaInstructions || '每日一劑，水煎服'}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                <thead><tr style={{ background: '#f3f4f6' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>#</th><th style={{ padding: '4px 8px', textAlign: 'left' }}>藥材</th><th style={{ padding: '4px 8px', textAlign: 'left' }}>劑量</th></tr></thead>
                <tbody>
                  {detail.rxList.map((r, i) => <tr key={i}><td style={{ padding: '3px 8px', borderBottom: '1px solid #f3f4f6' }}>{i + 1}</td><td style={{ padding: '3px 8px', borderBottom: '1px solid #f3f4f6' }}>{r.herb}</td><td style={{ padding: '3px 8px', borderBottom: '1px solid #f3f4f6' }}>{r.dosage}</td></tr>)}
                </tbody>
              </table>
              {detail.specialNotes && <div style={{ marginTop: 6, padding: 8, background: '#fffbeb', borderRadius: 6, fontSize: 12 }}><strong>特別注意：</strong>{detail.specialNotes}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setDetail(null)} className="btn btn-outline">關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
