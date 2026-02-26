import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { fmtM, fmt, getMonth, DOCTORS } from '../data';
import { getTenantStoreNames, getClinicName } from '../tenant';

const STORE_COLORS = ['#0e7490', '#8B6914', '#6d28d9', '#b91c1c', '#15803d', '#c2410c'];

export default function StoreComparePage({ data, allData, showToast }) {
  const [drillDown, setDrillDown] = useState(null); // { store, metric }
  const src = allData || data;
  const thisMonth = new Date().toISOString().substring(0, 7);
  const today = new Date().toISOString().substring(0, 10);

  const storeNames = useMemo(() => getTenantStoreNames(), []);
  const clinicName = useMemo(() => getClinicName(), []);

  // Build a color map keyed by store name
  const COLORS = useMemo(() => {
    const map = {};
    storeNames.forEach((name, i) => {
      map[name] = STORE_COLORS[i % STORE_COLORS.length];
    });
    return map;
  }, [storeNames]);

  const stores = storeNames;

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
  }, [src, thisMonth, today, stores]);

  // Monthly trend comparison
  const monthlyTrend = useMemo(() => {
    const months = new Set();
    (src.revenue || []).forEach(r => { const m = getMonth(r.date); if (m) months.add(m); });
    return [...months].sort().slice(-6).map(m => {
      const row = { month: m.substring(5) + '\u6708' };
      stores.forEach(store => {
        row[store] = (src.revenue || []).filter(r => r.store === store && getMonth(r.date) === m).reduce((s, r) => s + (r.amount || 0), 0);
      });
      return row;
    });
  }, [src, stores]);

  // Radar chart data
  const radarData = useMemo(() => {
    const s0 = stores[0];
    const s1 = stores[1];
    if (!metrics[s0] || !metrics[s1]) return [];
    const maxRev = Math.max(metrics[s0].monthRev, metrics[s1].monthRev) || 1;
    const maxPat = Math.max(metrics[s0].patientCount, metrics[s1].patientCount) || 1;
    const maxCon = Math.max(metrics[s0].monthConsultations, metrics[s1].monthConsultations) || 1;
    const maxBook = Math.max(metrics[s0].todayBookings, metrics[s1].todayBookings) || 1;
    const maxTicket = Math.max(metrics[s0].avgTicket, metrics[s1].avgTicket) || 1;

    return [
      { metric: '\u672C\u6708\u71DF\u696D\u984D', [s0]: (metrics[s0].monthRev / maxRev * 100).toFixed(0), [s1]: (metrics[s1].monthRev / maxRev * 100).toFixed(0) },
      { metric: '\u75C5\u4EBA\u6578', [s0]: (metrics[s0].patientCount / maxPat * 100).toFixed(0), [s1]: (metrics[s1].patientCount / maxPat * 100).toFixed(0) },
      { metric: '\u672C\u6708\u8A3A\u75C7', [s0]: (metrics[s0].monthConsultations / maxCon * 100).toFixed(0), [s1]: (metrics[s1].monthConsultations / maxCon * 100).toFixed(0) },
      { metric: '\u4ECA\u65E5\u9810\u7D04', [s0]: (metrics[s0].todayBookings / maxBook * 100).toFixed(0), [s1]: (metrics[s1].todayBookings / maxBook * 100).toFixed(0) },
      { metric: '\u5E73\u5747\u55AE\u50F9', [s0]: (metrics[s0].avgTicket / maxTicket * 100).toFixed(0), [s1]: (metrics[s1].avgTicket / maxTicket * 100).toFixed(0) },
    ];
  }, [metrics, stores]);

  // Doctor breakdown by store (#84)
  const doctorByStore = useMemo(() => {
    return DOCTORS.map(doc => {
      const row = { doctor: doc };
      stores.forEach(store => {
        const rev = (src.revenue || []).filter(r => r.store === store && r.doctor === doc && getMonth(r.date) === thisMonth);
        row[store] = rev.reduce((s, r) => s + (r.amount || 0), 0);
        row[store + '_count'] = rev.length;
      });
      row.total = stores.reduce((sum, store) => sum + (row[store] || 0), 0);
      return row;
    }).filter(d => d.total > 0).sort((a, b) => b.total - a.total);
  }, [src, thisMonth, stores]);

  // CSV Export
  const exportCSV = () => {
    const s0 = stores[0];
    const s1 = stores[1];
    const rows = [
      ['\u6307\u6A19', s0, s1, '\u5DEE\u8DDD'],
      ['\u7D2F\u8A08\u71DF\u696D\u984D', metrics[s0].totalRev, metrics[s1].totalRev, metrics[s0].totalRev - metrics[s1].totalRev],
      ['\u672C\u6708\u71DF\u696D\u984D', metrics[s0].monthRev, metrics[s1].monthRev, metrics[s0].monthRev - metrics[s1].monthRev],
      ['\u7D2F\u8A08\u958B\u652F', metrics[s0].totalExp, metrics[s1].totalExp, metrics[s0].totalExp - metrics[s1].totalExp],
      ['\u672C\u6708\u958B\u652F', metrics[s0].monthExp, metrics[s1].monthExp, metrics[s0].monthExp - metrics[s1].monthExp],
      ['\u75C5\u4EBA\u7E3D\u6578', metrics[s0].patientCount, metrics[s1].patientCount, metrics[s0].patientCount - metrics[s1].patientCount],
      ['\u672C\u6708\u8A3A\u75C7', metrics[s0].monthConsultations, metrics[s1].monthConsultations, metrics[s0].monthConsultations - metrics[s1].monthConsultations],
      ['\u5E73\u5747\u55AE\u50F9', metrics[s0].avgTicket.toFixed(0), metrics[s1].avgTicket.toFixed(0), (metrics[s0].avgTicket - metrics[s1].avgTicket).toFixed(0)],
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `store_compare_${thisMonth}.csv`;
    a.click();
    showToast && showToast('\u5DF2\u532F\u51FA\u5206\u5E97\u5C0D\u6BD4\u5831\u544A');
  };

  // Print report
  const printReport = () => {
    const s0 = stores[0];
    const s1 = stores[1];
    const w = window.open('', '_blank');
    if (!w) return;
    const compareRows = [
      ['\u7D2F\u8A08\u71DF\u696D\u984D', fmtM(metrics[s0].totalRev), fmtM(metrics[s1].totalRev)],
      ['\u672C\u6708\u71DF\u696D\u984D', fmtM(metrics[s0].monthRev), fmtM(metrics[s1].monthRev)],
      ['\u7D2F\u8A08\u958B\u652F', fmtM(metrics[s0].totalExp), fmtM(metrics[s1].totalExp)],
      ['\u672C\u6708\u958B\u652F', fmtM(metrics[s0].monthExp), fmtM(metrics[s1].monthExp)],
      ['\u7D2F\u8A08\u6DE8\u5229', fmtM(metrics[s0].totalRev - metrics[s0].totalExp), fmtM(metrics[s1].totalRev - metrics[s1].totalExp)],
      ['\u75C5\u4EBA\u7E3D\u6578', metrics[s0].patientCount, metrics[s1].patientCount],
      ['\u672C\u6708\u8A3A\u75C7', metrics[s0].monthConsultations, metrics[s1].monthConsultations],
      ['\u5E73\u5747\u55AE\u50F9', fmtM(metrics[s0].avgTicket), fmtM(metrics[s1].avgTicket)],
    ];
    w.document.write(`<!DOCTYPE html><html><head><title>\u5206\u5E97\u5C0D\u6BD4\u5831\u544A ${thisMonth}</title>
      <style>
        body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:700px;margin:0 auto;font-size:13px}
        h1{font-size:18px;text-align:center}
        .sub{text-align:center;color:#888;font-size:11px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        th,td{padding:8px 10px;border-bottom:1px solid #eee;text-align:left}
        th{background:#f8f8f8;font-weight:700}
        .r{text-align:right}
        .teal{color:${COLORS[s0]}}
        .gold{color:${COLORS[s1]}}
        @media print{body{margin:0;padding:10mm}}
      </style></head><body>
      <h1>${clinicName} \u2014 \u5206\u5E97\u5C0D\u6BD4\u5831\u544A</h1>
      <div class="sub">${thisMonth} | \u5217\u5370\u6642\u9593\uFF1A${new Date().toLocaleString('zh-HK')}</div>
      <table>
        <thead><tr><th>\u6307\u6A19</th><th class="r teal">${s0}</th><th class="r gold">${s1}</th></tr></thead>
        <tbody>${compareRows.map(([l,v1,v2]) => `<tr><td>${l}</td><td class="r teal">${v1}</td><td class="r gold">${v2}</td></tr>`).join('')}</tbody>
      </table>
      ${doctorByStore.length > 0 ? `
        <h2 style="font-size:14px;border-bottom:2px solid ${COLORS[s0]};padding-bottom:4px;margin-top:24px;color:${COLORS[s0]}">\u91AB\u5E2B\u5206\u5E97\u696D\u7E3E</h2>
        <table>
          <thead><tr><th>\u91AB\u5E2B</th><th class="r teal">${s0}</th><th class="r gold">${s1}</th><th class="r">\u5408\u8A08</th></tr></thead>
          <tbody>${doctorByStore.map(d => `<tr><td>${d.doctor}</td><td class="r teal">${fmtM(d[s0])}</td><td class="r gold">${fmtM(d[s1])}</td><td class="r" style="font-weight:700">${fmtM(d.total)}</td></tr>`).join('')}</tbody>
        </table>` : ''}
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const renderCompareCard = (label, key, format = 'money') => {
    const s0 = stores[0];
    const s1 = stores[1];
    return (
    <div className="card" style={{ padding: 16, cursor: key === 'monthRev' ? 'pointer' : 'default' }} onClick={() => key === 'monthRev' && setDrillDown({ store: s0, label })}>
      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8, fontWeight: 600 }}>{label}{key === 'monthRev' && <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--teal-500)' }}>(\u9EDE\u64CA\u67E5\u770B\u660E\u7D30)</span>}</div>
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
      {metrics[s0][key] !== metrics[s1][key] && (
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: 'var(--gray-400)' }}>
          {metrics[s0][key] > metrics[s1][key] ? s0 : s1} \u9818\u5148{' '}
          {format === 'money'
            ? fmtM(Math.abs(metrics[s0][key] - metrics[s1][key]))
            : Math.abs(metrics[s0][key] - metrics[s1][key])
          }
        </div>
      )}
    </div>
    );
  };

  return (
    <>
      {/* Summary Stats */}
      <div className="stats-grid">
        {stores[0] && metrics[stores[0]] && (
        <div className="stat-card teal">
          <div className="stat-label">{stores[0]}\u672C\u6708</div>
          <div className="stat-value teal">{fmtM(metrics[stores[0]].monthRev)}</div>
        </div>
        )}
        {stores[1] && metrics[stores[1]] && (
        <div className="stat-card gold">
          <div className="stat-label">{stores[1]}\u672C\u6708</div>
          <div className="stat-value gold">{fmtM(metrics[stores[1]].monthRev)}</div>
        </div>
        )}
        <div className="stat-card green">
          <div className="stat-label">{stores.length > 1 ? '\u5169\u5E97\u5408\u8A08' : '\u5408\u8A08'}</div>
          <div className="stat-value green">{fmtM(stores.reduce((sum, s) => sum + (metrics[s]?.monthRev || 0), 0))}</div>
        </div>
        {stores.length >= 2 && metrics[stores[0]] && metrics[stores[1]] && (
        <div className="stat-card red">
          <div className="stat-label">\u5DEE\u8DDD</div>
          <div className="stat-value red">{fmtM(Math.abs(metrics[stores[0]].monthRev - metrics[stores[1]].monthRev))}</div>
        </div>
        )}
      </div>

      {/* Actions (#84) */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-600)' }}>\u5206\u5E97\u5C0D\u6BD4\u5206\u6790</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={exportCSV}>\u532F\u51FACSV</button>
          <button className="btn btn-gold btn-sm" onClick={printReport}>\u5217\u5370\u5831\u544A</button>
        </div>
      </div>

      {/* Compare Cards Grid */}
      <div className="grid-2" style={{ marginBottom: 16 }}>
        {renderCompareCard('\u672C\u6708\u71DF\u696D\u984D', 'monthRev')}
        {renderCompareCard('\u672C\u6708\u958B\u652F', 'monthExp')}
        {renderCompareCard('\u75C5\u4EBA\u7E3D\u6578', 'patientCount', 'number')}
        {renderCompareCard('\u672C\u6708\u8A3A\u75C7\u6B21\u6578', 'monthConsultations', 'number')}
        {renderCompareCard('\u4ECA\u65E5\u9810\u7D04', 'todayBookings', 'number')}
        {renderCompareCard('\u5E73\u5747\u55AE\u50F9', 'avgTicket')}
      </div>

      {/* Charts */}
      <div className="grid-2">
        {/* Trend Chart */}
        <div className="card">
          <div className="card-header"><h3>\u71DF\u696D\u984D\u8DA8\u52E2\u5C0D\u6BD4</h3></div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyTrend}>
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip formatter={v => fmtM(v)} />
              <Legend />
              {stores.map(store => (
                <Bar key={store} dataKey={store} fill={COLORS[store]} radius={[4,4,0,0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radar Chart */}
        <div className="card">
          <div className="card-header"><h3>\u7D9C\u5408\u8868\u73FE\u96F7\u9054\u5716</h3></div>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" fontSize={11} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} />
              {stores.map(store => (
                <Radar key={store} name={store} dataKey={store} stroke={COLORS[store]} fill={COLORS[store]} fillOpacity={0.3} />
              ))}
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Comparison Table */}
      {stores.length >= 2 && metrics[stores[0]] && metrics[stores[1]] && (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>\u8A73\u7D30\u5C0D\u6BD4\u8868</h3></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>\u6307\u6A19</th><th style={{ textAlign: 'right', color: COLORS[stores[0]] }}>{stores[0]}</th><th style={{ textAlign: 'right', color: COLORS[stores[1]] }}>{stores[1]}</th><th style={{ textAlign: 'right' }}>\u5DEE\u8DDD</th></tr>
            </thead>
            <tbody>
              {[
                ['\u7D2F\u8A08\u71DF\u696D\u984D', 'totalRev', 'money'],
                ['\u672C\u6708\u71DF\u696D\u984D', 'monthRev', 'money'],
                ['\u7D2F\u8A08\u958B\u652F', 'totalExp', 'money'],
                ['\u672C\u6708\u958B\u652F', 'monthExp', 'money'],
                ['\u7D2F\u8A08\u6DE8\u5229', null, 'profit'],
                ['\u75C5\u4EBA\u7E3D\u6578', 'patientCount', 'number'],
                ['\u672C\u6708\u8A3A\u75C7', 'monthConsultations', 'number'],
                ['\u4ECA\u65E5\u9810\u7D04', 'todayBookings', 'number'],
                ['\u4F4E\u5EAB\u5B58\u9805\u76EE', 'lowStockCount', 'number'],
                ['\u5E73\u5747\u55AE\u50F9', 'avgTicket', 'money'],
              ].map(([label, key, type]) => {
                const v1 = key ? metrics[stores[0]][key] : metrics[stores[0]].totalRev - metrics[stores[0]].totalExp;
                const v2 = key ? metrics[stores[1]][key] : metrics[stores[1]].totalRev - metrics[stores[1]].totalExp;
                const diff = v1 - v2;
                const f = type === 'money' || type === 'profit' ? fmtM : fmt;
                return (
                  <tr key={label}>
                    <td style={{ fontWeight: 600 }}>{label}</td>
                    <td className="money" style={{ color: COLORS[stores[0]] }}>{f(v1)}</td>
                    <td className="money" style={{ color: COLORS[stores[1]] }}>{f(v2)}</td>
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
      )}
      {/* Doctor by Store (#84) */}
      {doctorByStore.length > 0 && stores.length >= 2 && (
        <div className="card" style={{ marginTop: 16, padding: 0 }}>
          <div className="card-header"><h3>\u91AB\u5E2B\u5206\u5E97\u696D\u7E3E (\u672C\u6708)</h3></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>\u91AB\u5E2B</th><th style={{ textAlign: 'right', color: COLORS[stores[0]] }}>{stores[0]}</th><th style={{ textAlign: 'right' }}>\u7B46\u6578</th><th style={{ textAlign: 'right', color: COLORS[stores[1]] }}>{stores[1]}</th><th style={{ textAlign: 'right' }}>\u7B46\u6578</th><th style={{ textAlign: 'right' }}>\u5408\u8A08</th></tr>
              </thead>
              <tbody>
                {doctorByStore.map(d => (
                  <tr key={d.doctor}>
                    <td style={{ fontWeight: 600 }}>{d.doctor}</td>
                    <td className="money" style={{ color: COLORS[stores[0]] }}>{fmtM(d[stores[0]])}</td>
                    <td className="money" style={{ color: 'var(--gray-400)' }}>{d[stores[0] + '_count']}</td>
                    <td className="money" style={{ color: COLORS[stores[1]] }}>{fmtM(d[stores[1]])}</td>
                    <td className="money" style={{ color: 'var(--gray-400)' }}>{d[stores[1] + '_count']}</td>
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
              <h3>{drillDown.store} \u2014 {drillDown.label} \u660E\u7D30</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setDrillDown(null)}>\u2715</button>
            </div>
            <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>\u65E5\u671F</th><th>\u9805\u76EE</th><th>\u91AB\u5E2B</th><th style={{ textAlign: 'right' }}>\u91D1\u984D</th></tr></thead>
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
            <div style={{ marginTop: 12 }}><button className="btn btn-outline" onClick={() => setDrillDown(null)}>\u95DC\u9589</button></div>
          </div>
        </div>
      )}
    </>
  );
}
