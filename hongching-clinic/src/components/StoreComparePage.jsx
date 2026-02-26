import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { fmtM, fmt, getMonth, DOCTORS } from '../data';

const COLORS = { '宋皇臺': '#0e7490', '太子': '#8B6914' };

export default function StoreComparePage({ data, allData, showToast }) {
  const [drillDown, setDrillDown] = useState(null); // { store, metric }
  const src = allData || data;
  const thisMonth = new Date().toISOString().substring(0, 7);
  const today = new Date().toISOString().substring(0, 10);

  const stores = ['宋皇臺', '太子'];

  const metrics = useMemo(() => {
    const result = {};
    stores.forEach(store => {
      const rev = (src.revenue || []).filter(r => r.store === store);
      const exp = (src.expenses || []).filter(r => r.store === store);
      const monthRev = rev.filter(r => getMonth(r.date) === thisMonth);
      const monthExp = exp.filter(r => getMonth(r.date) === thisMonth);
      const patients = (src.patients || []).filter(p => p.store === store);
      const bookings = (src.bookings || []).filter(b => b.store === store && b.date === today && b.status !== 'cancelled');
      const consultations = (src.consultations || []).filter(c => c.store === store && getMonth(c.date) === thisMonth);
      const queue = (src.queue || []).filter(q => q.store === store && q.date === today);
      const inventory = (src.inventory || []).filter(i => (i.store === store || !i.store) && i.active !== false);
      const lowStock = inventory.filter(i => i.stock <= (i.minStock || 10));

      result[store] = {
        totalRev: rev.reduce((s, r) => s + (r.amount || 0), 0),
        monthRev: monthRev.reduce((s, r) => s + (r.amount || 0), 0),
        totalExp: exp.reduce((s, r) => s + (r.amount || 0), 0),
        monthExp: monthExp.reduce((s, r) => s + (r.amount || 0), 0),
        patientCount: patients.length,
        todayBookings: bookings.length,
        monthConsultations: consultations.length,
        todayQueue: queue.length,
        lowStockCount: lowStock.length,
        avgTicket: monthRev.length ? monthRev.reduce((s, r) => s + (r.amount || 0), 0) / monthRev.length : 0,
      };
    });
    return result;
  }, [src, thisMonth, today]);

  // Monthly trend comparison
  const monthlyTrend = useMemo(() => {
    const months = new Set();
    (src.revenue || []).forEach(r => { const m = getMonth(r.date); if (m) months.add(m); });
    return [...months].sort().slice(-6).map(m => {
      const row = { month: m.substring(5) + '月' };
      stores.forEach(store => {
        row[store] = (src.revenue || []).filter(r => r.store === store && getMonth(r.date) === m).reduce((s, r) => s + (r.amount || 0), 0);
      });
      return row;
    });
  }, [src]);

  // Radar chart data
  const radarData = useMemo(() => {
    const maxRev = Math.max(metrics['宋皇臺'].monthRev, metrics['太子'].monthRev) || 1;
    const maxPat = Math.max(metrics['宋皇臺'].patientCount, metrics['太子'].patientCount) || 1;
    const maxCon = Math.max(metrics['宋皇臺'].monthConsultations, metrics['太子'].monthConsultations) || 1;
    const maxBook = Math.max(metrics['宋皇臺'].todayBookings, metrics['太子'].todayBookings) || 1;
    const maxTicket = Math.max(metrics['宋皇臺'].avgTicket, metrics['太子'].avgTicket) || 1;

    return [
      { metric: '本月營業額', '宋皇臺': (metrics['宋皇臺'].monthRev / maxRev * 100).toFixed(0), '太子': (metrics['太子'].monthRev / maxRev * 100).toFixed(0) },
      { metric: '病人數', '宋皇臺': (metrics['宋皇臺'].patientCount / maxPat * 100).toFixed(0), '太子': (metrics['太子'].patientCount / maxPat * 100).toFixed(0) },
      { metric: '本月診症', '宋皇臺': (metrics['宋皇臺'].monthConsultations / maxCon * 100).toFixed(0), '太子': (metrics['太子'].monthConsultations / maxCon * 100).toFixed(0) },
      { metric: '今日預約', '宋皇臺': (metrics['宋皇臺'].todayBookings / maxBook * 100).toFixed(0), '太子': (metrics['太子'].todayBookings / maxBook * 100).toFixed(0) },
      { metric: '平均單價', '宋皇臺': (metrics['宋皇臺'].avgTicket / maxTicket * 100).toFixed(0), '太子': (metrics['太子'].avgTicket / maxTicket * 100).toFixed(0) },
    ];
  }, [metrics]);

  // Doctor breakdown by store (#84)
  const doctorByStore = useMemo(() => {
    return DOCTORS.map(doc => {
      const row = { doctor: doc };
      stores.forEach(store => {
        const rev = (src.revenue || []).filter(r => r.store === store && r.doctor === doc && getMonth(r.date) === thisMonth);
        row[store] = rev.reduce((s, r) => s + (r.amount || 0), 0);
        row[store + '_count'] = rev.length;
      });
      row.total = (row['宋皇臺'] || 0) + (row['太子'] || 0);
      return row;
    }).filter(d => d.total > 0).sort((a, b) => b.total - a.total);
  }, [src, thisMonth]);

  // CSV Export
  const exportCSV = () => {
    const rows = [
      ['指標', '宋皇臺', '太子', '差距'],
      ['累計營業額', metrics['宋皇臺'].totalRev, metrics['太子'].totalRev, metrics['宋皇臺'].totalRev - metrics['太子'].totalRev],
      ['本月營業額', metrics['宋皇臺'].monthRev, metrics['太子'].monthRev, metrics['宋皇臺'].monthRev - metrics['太子'].monthRev],
      ['累計開支', metrics['宋皇臺'].totalExp, metrics['太子'].totalExp, metrics['宋皇臺'].totalExp - metrics['太子'].totalExp],
      ['本月開支', metrics['宋皇臺'].monthExp, metrics['太子'].monthExp, metrics['宋皇臺'].monthExp - metrics['太子'].monthExp],
      ['病人總數', metrics['宋皇臺'].patientCount, metrics['太子'].patientCount, metrics['宋皇臺'].patientCount - metrics['太子'].patientCount],
      ['本月診症', metrics['宋皇臺'].monthConsultations, metrics['太子'].monthConsultations, metrics['宋皇臺'].monthConsultations - metrics['太子'].monthConsultations],
      ['平均單價', metrics['宋皇臺'].avgTicket.toFixed(0), metrics['太子'].avgTicket.toFixed(0), (metrics['宋皇臺'].avgTicket - metrics['太子'].avgTicket).toFixed(0)],
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `store_compare_${thisMonth}.csv`;
    a.click();
    showToast && showToast('已匯出分店對比報告');
  };

  // Print report
  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const compareRows = [
      ['累計營業額', fmtM(metrics['宋皇臺'].totalRev), fmtM(metrics['太子'].totalRev)],
      ['本月營業額', fmtM(metrics['宋皇臺'].monthRev), fmtM(metrics['太子'].monthRev)],
      ['累計開支', fmtM(metrics['宋皇臺'].totalExp), fmtM(metrics['太子'].totalExp)],
      ['本月開支', fmtM(metrics['宋皇臺'].monthExp), fmtM(metrics['太子'].monthExp)],
      ['累計淨利', fmtM(metrics['宋皇臺'].totalRev - metrics['宋皇臺'].totalExp), fmtM(metrics['太子'].totalRev - metrics['太子'].totalExp)],
      ['病人總數', metrics['宋皇臺'].patientCount, metrics['太子'].patientCount],
      ['本月診症', metrics['宋皇臺'].monthConsultations, metrics['太子'].monthConsultations],
      ['平均單價', fmtM(metrics['宋皇臺'].avgTicket), fmtM(metrics['太子'].avgTicket)],
    ];
    w.document.write(`<!DOCTYPE html><html><head><title>分店對比報告 ${thisMonth}</title>
      <style>
        body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:700px;margin:0 auto;font-size:13px}
        h1{font-size:18px;text-align:center}
        .sub{text-align:center;color:#888;font-size:11px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        th,td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left}
        th{background:#f8f8f8;font-weight:700}
        .r{text-align:right}
        .teal{color:#0e7490}
        .gold{color:#8B6914}
        @media print{body{margin:0;padding:10mm}}
      </style></head><body>
      <h1>康晴綜合醫療中心 — 分店對比報告</h1>
      <div class="sub">${thisMonth} | 列印時間：${new Date().toLocaleString('zh-HK')}</div>
      <table>
        <thead><tr><th>指標</th><th class="r teal">宋皇臺</th><th class="r gold">太子</th></tr></thead>
        <tbody>${compareRows.map(([l,v1,v2]) => `<tr><td>${l}</td><td class="r teal">${v1}</td><td class="r gold">${v2}</td></tr>`).join('')}</tbody>
      </table>
      ${doctorByStore.length > 0 ? `
        <h2 style="font-size:14px;border-bottom:2px solid #0e7490;padding-bottom:4px;margin-top:24px;color:#0e7490">醫師分店業績</h2>
        <table>
          <thead><tr><th>醫師</th><th class="r teal">宋皇臺</th><th class="r gold">太子</th><th class="r">合計</th></tr></thead>
          <tbody>${doctorByStore.map(d => `<tr><td>${d.doctor}</td><td class="r teal">${fmtM(d['宋皇臺'])}</td><td class="r gold">${fmtM(d['太子'])}</td><td class="r" style="font-weight:700">${fmtM(d.total)}</td></tr>`).join('')}</tbody>
        </table>` : ''}
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const renderCompareCard = (label, key, format = 'money') => (
    <div className="card" style={{ padding: 16, cursor: key === 'monthRev' ? 'pointer' : 'default' }} onClick={() => key === 'monthRev' && setDrillDown({ store: '宋皇臺', label })}>
      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8, fontWeight: 600 }}>{label}{key === 'monthRev' && <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--teal-500)' }}>(點擊查看明細)</span>}</div>
      <div style={{ display: 'flex', gap: 16 }}>
        {stores.map(store => (
          <div key={store} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setDrillDown({ store, label }); }}>
            <div style={{ fontSize: 11, color: COLORS[store], fontWeight: 600, marginBottom: 4 }}>{store}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: COLORS[store] }}>
              {format === 'money' ? fmtM(metrics[store][key]) : fmt(metrics[store][key])}
            </div>
          </div>
        ))}
      </div>
      {/* Winner indicator */}
      {metrics['宋皇臺'][key] !== metrics['太子'][key] && (
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: 'var(--gray-400)' }}>
          {metrics['宋皇臺'][key] > metrics['太子'][key] ? '宋皇臺' : '太子'} 領先{' '}
          {format === 'money'
            ? fmtM(Math.abs(metrics['宋皇臺'][key] - metrics['太子'][key]))
            : Math.abs(metrics['宋皇臺'][key] - metrics['太子'][key])
          }
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Summary Stats */}
      <div className="stats-grid">
        <div className="stat-card teal">
          <div className="stat-label">宋皇臺本月</div>
          <div className="stat-value teal">{fmtM(metrics['宋皇臺'].monthRev)}</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">太子本月</div>
          <div className="stat-value gold">{fmtM(metrics['太子'].monthRev)}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">兩店合計</div>
          <div className="stat-value green">{fmtM(metrics['宋皇臺'].monthRev + metrics['太子'].monthRev)}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">差距</div>
          <div className="stat-value red">{fmtM(Math.abs(metrics['宋皇臺'].monthRev - metrics['太子'].monthRev))}</div>
        </div>
      </div>

      {/* Actions (#84) */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-600)' }}>分店對比分析</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={exportCSV}>匯出CSV</button>
          <button className="btn btn-gold btn-sm" onClick={printReport}>列印報告</button>
        </div>
      </div>

      {/* Compare Cards Grid */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        {renderCompareCard('本月營業額', 'monthRev')}
        {renderCompareCard('本月開支', 'monthExp')}
        {renderCompareCard('病人總數', 'patientCount', 'number')}
        {renderCompareCard('本月診症次數', 'monthConsultations', 'number')}
        {renderCompareCard('今日預約', 'todayBookings', 'number')}
        {renderCompareCard('平均單價', 'avgTicket')}
      </div>

      {/* Charts */}
      <div className="grid-2">
        {/* Trend Chart */}
        <div className="card">
          <div className="card-header"><h3>營業額趨勢對比</h3></div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyTrend}>
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip formatter={v => fmtM(v)} />
              <Legend />
              <Bar dataKey="宋皇臺" fill={COLORS['宋皇臺']} radius={[4,4,0,0]} />
              <Bar dataKey="太子" fill={COLORS['太子']} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radar Chart */}
        <div className="card">
          <div className="card-header"><h3>綜合表現雷達圖</h3></div>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" fontSize={11} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} />
              <Radar name="宋皇臺" dataKey="宋皇臺" stroke={COLORS['宋皇臺']} fill={COLORS['宋皇臺']} fillOpacity={0.3} />
              <Radar name="太子" dataKey="太子" stroke={COLORS['太子']} fill={COLORS['太子']} fillOpacity={0.3} />
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Comparison Table */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>詳細對比表</h3></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>指標</th><th style={{ textAlign: 'right', color: COLORS['宋皇臺'] }}>宋皇臺</th><th style={{ textAlign: 'right', color: COLORS['太子'] }}>太子</th><th style={{ textAlign: 'right' }}>差距</th></tr>
            </thead>
            <tbody>
              {[
                ['累計營業額', 'totalRev', 'money'],
                ['本月營業額', 'monthRev', 'money'],
                ['累計開支', 'totalExp', 'money'],
                ['本月開支', 'monthExp', 'money'],
                ['累計淨利', null, 'profit'],
                ['病人總數', 'patientCount', 'number'],
                ['本月診症', 'monthConsultations', 'number'],
                ['今日預約', 'todayBookings', 'number'],
                ['低庫存項目', 'lowStockCount', 'number'],
                ['平均單價', 'avgTicket', 'money'],
              ].map(([label, key, type]) => {
                const v1 = key ? metrics['宋皇臺'][key] : metrics['宋皇臺'].totalRev - metrics['宋皇臺'].totalExp;
                const v2 = key ? metrics['太子'][key] : metrics['太子'].totalRev - metrics['太子'].totalExp;
                const diff = v1 - v2;
                const f = type === 'money' || type === 'profit' ? fmtM : fmt;
                return (
                  <tr key={label}>
                    <td style={{ fontWeight: 600 }}>{label}</td>
                    <td className="money" style={{ color: COLORS['宋皇臺'] }}>{f(v1)}</td>
                    <td className="money" style={{ color: COLORS['太子'] }}>{f(v2)}</td>
                    <td className="money" style={{ color: diff > 0 ? 'var(--green-600)' : diff < 0 ? 'var(--red-500)' : 'var(--gray-400)' }}>
                      {diff > 0 ? '+' : ''}{f(diff)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {/* Doctor by Store (#84) */}
      {doctorByStore.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 0 }}>
          <div className="card-header"><h3>醫師分店業績 (本月)</h3></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>醫師</th><th style={{ textAlign: 'right', color: COLORS['宋皇臺'] }}>宋皇臺</th><th style={{ textAlign: 'right' }}>筆數</th><th style={{ textAlign: 'right', color: COLORS['太子'] }}>太子</th><th style={{ textAlign: 'right' }}>筆數</th><th style={{ textAlign: 'right' }}>合計</th></tr>
              </thead>
              <tbody>
                {doctorByStore.map(d => (
                  <tr key={d.doctor}>
                    <td style={{ fontWeight: 600 }}>{d.doctor}</td>
                    <td className="money" style={{ color: COLORS['宋皇臺'] }}>{fmtM(d['宋皇臺'])}</td>
                    <td className="money" style={{ color: 'var(--gray-400)' }}>{d['宋皇臺_count']}</td>
                    <td className="money" style={{ color: COLORS['太子'] }}>{fmtM(d['太子'])}</td>
                    <td className="money" style={{ color: 'var(--gray-400)' }}>{d['太子_count']}</td>
                    <td className="money" style={{ fontWeight: 700 }}>{fmtM(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drill-down Modal */}
      {drillDown && (
        <div className="modal-overlay" onClick={() => setDrillDown(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>{drillDown.store} — {drillDown.label} 明細</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setDrillDown(null)}>✕</button>
            </div>
            <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>日期</th><th>項目</th><th>醫師</th><th style={{ textAlign: 'right' }}>金額</th></tr></thead>
                <tbody>
                  {(src.revenue || [])
                    .filter(r => r.store === drillDown.store && getMonth(r.date) === thisMonth)
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                    .slice(0, 50)
                    .map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{r.date}</td>
                        <td style={{ fontSize: 12 }}>{r.item || r.name}</td>
                        <td>{r.doctor}</td>
                        <td className="money" style={{ color: 'var(--gold-700)' }}>{fmtM(r.amount)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12 }}><button className="btn btn-outline" onClick={() => setDrillDown(null)}>關閉</button></div>
          </div>
        </div>
      )}
    </>
  );
}
