import React, { useState, useMemo } from 'react';
import { fmtM, getStoreNames, getDefaultStore } from '../data';
import { getClinicName } from '../tenant';

const PAYMENT_METHODS = ['現金', 'FPS', '信用卡', 'PayMe', '八達通', '長者醫療券', '其他'];

function loadLocks() { try { return JSON.parse(localStorage.getItem('hcmc_settlement_locks') || '[]'); } catch { return []; } }
function saveLocks(arr) { localStorage.setItem('hcmc_settlement_locks', JSON.stringify(arr)); }

export default function DailyClosing({ data, showToast, user }) {
  const today = new Date().toISOString().substring(0, 10);
  const STORE_NAMES = getStoreNames();
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedStore, setSelectedStore] = useState('all');
  const [actualAmounts, setActualAmounts] = useState({});
  const [notes, setNotes] = useState('');
  const [closings, setClosings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_daily_closings') || '[]'); } catch { return []; }
  });
  const [locks, setLocks] = useState(loadLocks);
  const [tab, setTab] = useState('current'); // current | history

  const dayRevenue = useMemo(() => {
    let rev = (data.revenue || []).filter(r => r.date === selectedDate);
    if (selectedStore !== 'all') rev = rev.filter(r => r.store === selectedStore);
    return rev;
  }, [data.revenue, selectedDate, selectedStore]);

  const expectedTotals = useMemo(() => {
    const totals = {};
    PAYMENT_METHODS.forEach(m => { totals[m] = 0; });
    dayRevenue.forEach(r => {
      const method = r.payment || '現金';
      totals[method] = (totals[method] || 0) + Number(r.amount || 0);
    });
    return totals;
  }, [dayRevenue]);

  const grandTotal = Object.values(expectedTotals).reduce((s, v) => s + v, 0);

  const actualTotal = useMemo(() => {
    return PAYMENT_METHODS.reduce((s, m) => s + Number(actualAmounts[m] || 0), 0);
  }, [actualAmounts]);

  const discrepancy = actualTotal - grandTotal;

  const transactionCount = dayRevenue.length;

  // Group by doctor
  const byDoctor = useMemo(() => {
    const map = {};
    dayRevenue.forEach(r => {
      const doc = r.doctor || '未指定';
      if (!map[doc]) map[doc] = { count: 0, total: 0 };
      map[doc].count++;
      map[doc].total += Number(r.amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [dayRevenue]);

  // Group by item/service
  const byItem = useMemo(() => {
    const map = {};
    dayRevenue.forEach(r => {
      const item = r.item || '未分類';
      if (!map[item]) map[item] = { count: 0, total: 0 };
      map[item].count++;
      map[item].total += Number(r.amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [dayRevenue]);

  const handleSaveClosing = () => {
    const record = {
      id: Date.now().toString(36),
      date: selectedDate,
      store: selectedStore,
      expected: { ...expectedTotals },
      actual: { ...actualAmounts },
      grandTotal,
      actualTotal,
      discrepancy,
      transactionCount,
      notes,
      closedAt: new Date().toISOString(),
      closedBy: 'current_user',
    };
    const updated = [record, ...closings];
    setClosings(updated);
    localStorage.setItem('hcmc_daily_closings', JSON.stringify(updated));
    showToast('日結已保存');
    setActualAmounts({});
    setNotes('');
  };

  const existingClosing = closings.find(c => c.date === selectedDate && (selectedStore === 'all' || c.store === selectedStore));

  // Settlement lock logic
  const currentLock = locks.find(l => l.date === selectedDate && (l.store === selectedStore || l.store === 'all'));
  const isLocked = !!currentLock;

  const handleLock = () => {
    if (!existingClosing) return showToast('請先完成日結才能鎖定');
    const lock = { id: Date.now().toString(36), date: selectedDate, store: selectedStore, lockedAt: new Date().toISOString(), lockedBy: user?.name || 'system' };
    const updated = [...locks, lock];
    setLocks(updated);
    saveLocks(updated);
    showToast(`已鎖定 ${selectedDate} 結算`);
  };

  const handleUnlock = () => {
    const updated = locks.filter(l => !(l.date === selectedDate && (l.store === selectedStore || l.store === 'all')));
    setLocks(updated);
    saveLocks(updated);
    showToast(`已解鎖 ${selectedDate} 結算`);
  };

  const printDailyReport = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const clinic = getClinicName();
    const rows = PAYMENT_METHODS.map(m => {
      const exp = expectedTotals[m] || 0;
      const act = Number(actualAmounts[m] || 0);
      const diff = act - exp;
      return `<tr><td>${m}</td><td style="text-align:right">${fmtM(exp)}</td><td style="text-align:right">${act ? fmtM(act) : '-'}</td><td style="text-align:right;color:${diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : '#666'}">${act ? fmtM(diff) : '-'}</td></tr>`;
    }).join('');
    const docRows = byDoctor.map(([doc, d]) => `<tr><td>${doc}</td><td style="text-align:right">${d.count}</td><td style="text-align:right">${fmtM(d.total)}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>日結報表 ${selectedDate}</title>
      <style>body{font-family:'Microsoft YaHei',sans-serif;padding:20px;max-width:600px;margin:0 auto}
      h1{color:#0e7490;font-size:18px;border-bottom:2px solid #0e7490;padding-bottom:8px}
      h2{font-size:14px;color:#333;margin:16px 0 8px}
      table{width:100%;border-collapse:collapse;margin-bottom:12px}
      th,td{padding:6px 8px;border-bottom:1px solid #eee;font-size:12px}
      th{background:#f8f8f8;text-align:left;font-weight:700}
      .total-row{font-weight:700;border-top:2px solid #333;font-size:13px}
      .footer{text-align:center;font-size:10px;color:#aaa;margin-top:20px;padding-top:10px;border-top:1px dashed #ddd}
      @media print{body{padding:10px}}</style></head><body>
      <h1>${clinic} — 日結報表</h1>
      <p style="font-size:12px;color:#666">日期: ${selectedDate} | 店舖: ${selectedStore === 'all' ? '全部' : selectedStore} | 交易數: ${transactionCount}</p>
      <h2>付款方式明細</h2>
      <table><thead><tr><th>付款方式</th><th style="text-align:right">應收</th><th style="text-align:right">實收</th><th style="text-align:right">差異</th></tr></thead>
      <tbody>${rows}
      <tr class="total-row"><td>合計</td><td style="text-align:right">${fmtM(grandTotal)}</td><td style="text-align:right">${actualTotal ? fmtM(actualTotal) : '-'}</td><td style="text-align:right;color:${discrepancy > 0 ? '#16a34a' : discrepancy < 0 ? '#dc2626' : '#666'}">${actualTotal ? fmtM(discrepancy) : '-'}</td></tr>
      </tbody></table>
      <h2>醫師業績</h2>
      <table><thead><tr><th>醫師</th><th style="text-align:right">人次</th><th style="text-align:right">金額</th></tr></thead>
      <tbody>${docRows}</tbody></table>
      ${notes ? `<h2>備註</h2><p style="font-size:12px">${notes}</p>` : ''}
      <div class="footer">列印時間: ${new Date().toLocaleString('zh-HK')}</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <>
      <div className="tab-bar">
        <button className={`tab-btn ${tab === 'current' ? 'active' : ''}`} onClick={() => setTab('current')}>今日日結</button>
        <button className={`tab-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>歷史紀錄</button>
      </div>

      {tab === 'current' && (
        <>
          {/* Date & Store selector */}
          <div className="card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div><label style={{ fontSize: 12, fontWeight: 600 }}>日期</label><input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ width: 'auto' }} /></div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>店舖</label>
              <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)} style={{ width: 'auto' }}>
                <option value="all">全部店舖</option>
                {STORE_NAMES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {isLocked ? (
                <button className="btn btn-outline btn-sm" onClick={handleUnlock} style={{ color: '#dc2626', borderColor: '#dc2626' }}>🔓 解鎖結算</button>
              ) : (
                <button className="btn btn-outline btn-sm" onClick={handleLock} style={{ color: '#16a34a', borderColor: '#16a34a' }}>🔒 鎖定結算</button>
              )}
              <button className="btn btn-outline btn-sm" onClick={printDailyReport}>🖨️ 列印報表</button>
            </div>
          </div>

          {isLocked && (
            <div className="card" style={{ background: '#fef2f2', border: '1px solid #ef4444', padding: 12, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🔒</span>
              <div>
                <strong style={{ color: '#dc2626' }}>此日結算已鎖定</strong>
                <span style={{ marginLeft: 8, color: '#888' }}>由 {currentLock.lockedBy} 於 {new Date(currentLock.lockedAt).toLocaleString('zh-HK')} 鎖定</span>
                <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>鎖定後不可修改營業紀錄及開支。如需修改請先解鎖。</div>
              </div>
            </div>
          )}
          {existingClosing && !isLocked && (
            <div className="card" style={{ background: '#f0fdf4', border: '1px solid #16a34a', padding: 12, fontSize: 12 }}>
              此日已完成日結 ({new Date(existingClosing.closedAt).toLocaleString('zh-HK')})
              {existingClosing.discrepancy !== 0 && <span style={{ marginLeft: 8, color: existingClosing.discrepancy < 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>差異: {fmtM(existingClosing.discrepancy)}</span>}
            </div>
          )}

          {/* Summary Stats */}
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="stat-card teal"><div className="stat-label">總營業額</div><div className="stat-value teal">{fmtM(grandTotal)}</div></div>
            <div className="stat-card green"><div className="stat-label">交易筆數</div><div className="stat-value green">{transactionCount}</div></div>
            <div className="stat-card gold"><div className="stat-label">實收金額</div><div className="stat-value gold">{actualTotal > 0 ? fmtM(actualTotal) : '-'}</div></div>
            <div className="stat-card" style={{ borderLeft: `4px solid ${discrepancy === 0 ? '#16a34a' : discrepancy > 0 ? '#0e7490' : '#dc2626'}` }}>
              <div className="stat-label">差異</div>
              <div className="stat-value" style={{ color: discrepancy === 0 ? '#16a34a' : discrepancy > 0 ? '#0e7490' : '#dc2626' }}>
                {actualTotal > 0 ? fmtM(discrepancy) : '-'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Payment Method Reconciliation */}
            <div className="card">
              <div className="card-header"><h3 style={{ margin: 0, fontSize: 14 }}>付款方式對賬</h3></div>
              <table>
                <thead><tr><th>付款方式</th><th style={{ textAlign: 'right' }}>應收</th><th style={{ width: 120 }}>實收</th><th style={{ textAlign: 'right' }}>差異</th></tr></thead>
                <tbody>
                  {PAYMENT_METHODS.map(method => {
                    const expected = expectedTotals[method] || 0;
                    const actual = Number(actualAmounts[method] || 0);
                    const diff = actual - expected;
                    const hasActual = actualAmounts[method] !== undefined && actualAmounts[method] !== '';
                    return (
                      <tr key={method} style={{ background: expected > 0 ? '' : 'var(--gray-50)' }}>
                        <td style={{ fontWeight: expected > 0 ? 600 : 400 }}>{method}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{expected > 0 ? fmtM(expected) : '-'}</td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="輸入實收"
                            value={actualAmounts[method] || ''}
                            onChange={e => setActualAmounts({ ...actualAmounts, [method]: e.target.value })}
                            style={{ width: '100%', textAlign: 'right', padding: '4px 8px', fontSize: 12 }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: !hasActual ? 'var(--gray-300)' : diff === 0 ? '#16a34a' : diff > 0 ? '#0e7490' : '#dc2626' }}>
                          {hasActual ? fmtM(diff) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--gray-300)' }}>
                    <td>合計</td>
                    <td style={{ textAlign: 'right' }}>{fmtM(grandTotal)}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px', fontSize: 12 }}>{actualTotal > 0 ? fmtM(actualTotal) : ''}</td>
                    <td style={{ textAlign: 'right', color: discrepancy === 0 ? '#16a34a' : discrepancy > 0 ? '#0e7490' : '#dc2626' }}>
                      {actualTotal > 0 ? fmtM(discrepancy) : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Doctor & Item breakdown */}
            <div>
              <div className="card">
                <div className="card-header"><h3 style={{ margin: 0, fontSize: 14 }}>醫師明細</h3></div>
                <table>
                  <thead><tr><th>醫師</th><th style={{ textAlign: 'right' }}>人次</th><th style={{ textAlign: 'right' }}>金額</th></tr></thead>
                  <tbody>
                    {byDoctor.map(([doc, d]) => (
                      <tr key={doc}>
                        <td style={{ fontWeight: 600 }}>{doc}</td>
                        <td style={{ textAlign: 'right' }}>{d.count}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(d.total)}</td>
                      </tr>
                    ))}
                    {byDoctor.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--gray-400)' }}>暫無數據</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-header"><h3 style={{ margin: 0, fontSize: 14 }}>服務項目明細</h3></div>
                <table>
                  <thead><tr><th>項目</th><th style={{ textAlign: 'right' }}>次數</th><th style={{ textAlign: 'right' }}>金額</th></tr></thead>
                  <tbody>
                    {byItem.map(([item, d]) => (
                      <tr key={item}>
                        <td>{item}</td>
                        <td style={{ textAlign: 'right' }}>{d.count}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtM(d.total)}</td>
                      </tr>
                    ))}
                    {byItem.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--gray-400)' }}>暫無數據</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Notes & Save */}
          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>日結備註</label>
              <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="記錄任何異常或備註..." style={{ marginTop: 4 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-teal" onClick={handleSaveClosing} disabled={isLocked}>確認日結</button>
              <button className="btn btn-outline" onClick={() => { setActualAmounts({}); setNotes(''); }}>清除</button>
            </div>
          </div>
        </>
      )}

      {tab === 'history' && (
        <div className="card">
          <div className="card-header"><h3 style={{ margin: 0, fontSize: 14 }}>日結歷史</h3></div>
          {closings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無日結紀錄</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>日期</th><th>店舖</th><th style={{ textAlign: 'right' }}>應收</th><th style={{ textAlign: 'right' }}>實收</th><th style={{ textAlign: 'right' }}>差異</th><th>交易數</th><th>鎖定</th><th>備註</th><th>結算時間</th></tr></thead>
                <tbody>
                  {closings.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.date}</td>
                      <td>{c.store === 'all' ? '全部' : c.store}</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(c.grandTotal)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtM(c.actualTotal)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: c.discrepancy === 0 ? '#16a34a' : c.discrepancy > 0 ? '#0e7490' : '#dc2626' }}>
                        {fmtM(c.discrepancy)}
                      </td>
                      <td style={{ textAlign: 'center' }}>{c.transactionCount}</td>
                      <td style={{ textAlign: 'center' }}>{locks.find(l => l.date === c.date && (l.store === c.store || l.store === 'all')) ? <span style={{ color: '#dc2626' }}>🔒</span> : <span style={{ color: '#ccc' }}>-</span>}</td>
                      <td style={{ fontSize: 11, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.notes || '-'}</td>
                      <td style={{ fontSize: 11, color: 'var(--gray-500)' }}>{c.closedAt ? new Date(c.closedAt).toLocaleString('zh-HK') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
