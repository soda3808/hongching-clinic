import React, { useMemo, useState } from 'react';
import { fmtM, fmt, getMonth, getDoctors, getStoreNames } from '../../data';
import { getClinicName, getClinicNameEn } from '../../tenant';

export default function MonthlyExecutiveReport({ data }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const DOCTORS = getDoctors();
  const STORES = getStoreNames();

  const months = useMemo(() => {
    const m = new Set();
    (data.revenue || []).forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    (data.expenses || []).forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    return [...m].sort().reverse();
  }, [data]);

  const report = useMemo(() => {
    const rev = (data.revenue || []).filter(r => getMonth(r.date) === selectedMonth);
    const exp = (data.expenses || []).filter(r => getMonth(r.date) === selectedMonth);
    const bookings = (data.bookings || []).filter(b => getMonth(b.date) === selectedMonth);
    const consultations = (data.consultations || []).filter(c => getMonth(c.date) === selectedMonth);
    const patients = data.patients || [];

    // Previous month for comparison
    const prevMonth = (() => {
      const d = new Date(selectedMonth + '-01');
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().substring(0, 7);
    })();
    const prevRev = (data.revenue || []).filter(r => getMonth(r.date) === prevMonth);
    const prevExp = (data.expenses || []).filter(r => getMonth(r.date) === prevMonth);

    const totalRev = rev.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalExp = exp.reduce((s, r) => s + Number(r.amount || 0), 0);
    const prevTotalRev = prevRev.reduce((s, r) => s + Number(r.amount || 0), 0);
    const prevTotalExp = prevExp.reduce((s, r) => s + Number(r.amount || 0), 0);
    const profit = totalRev - totalExp;
    const margin = totalRev > 0 ? Math.round(profit / totalRev * 100) : 0;
    const revGrowth = prevTotalRev > 0 ? Math.round((totalRev - prevTotalRev) / prevTotalRev * 100) : 0;

    // By doctor
    const byDoctor = {};
    rev.forEach(r => { const d = r.doctor || '未指定'; if (!byDoctor[d]) byDoctor[d] = { rev: 0, count: 0 }; byDoctor[d].rev += Number(r.amount || 0); byDoctor[d].count++; });

    // By payment method
    const byPayment = {};
    rev.forEach(r => { const p = r.payment || '現金'; byPayment[p] = (byPayment[p] || 0) + Number(r.amount || 0); });

    // By store
    const byStore = {};
    rev.forEach(r => { const s = r.store || '未指定'; if (!byStore[s]) byStore[s] = { rev: 0, count: 0 }; byStore[s].rev += Number(r.amount || 0); byStore[s].count++; });

    // By service
    const byService = {};
    rev.forEach(r => { const item = r.item || '未分類'; byService[item] = (byService[item] || 0) + Number(r.amount || 0); });

    // Expense categories
    const byExpCat = {};
    exp.forEach(e => { const c = e.category || '其他'; byExpCat[c] = (byExpCat[c] || 0) + Number(e.amount || 0); });

    // Patient metrics
    const uniquePatients = new Set(rev.map(r => r.name)).size;
    const newPatients = patients.filter(p => getMonth(p.createdAt) === selectedMonth).length;
    const noShows = bookings.filter(b => b.status === 'no-show').length;
    const totalBookings = bookings.filter(b => b.status !== 'cancelled').length;
    const noShowRate = totalBookings > 0 ? Math.round(noShows / totalBookings * 100) : 0;

    return {
      totalRev, totalExp, profit, margin, revGrowth,
      prevTotalRev, prevTotalExp,
      byDoctor: Object.entries(byDoctor).sort((a, b) => b[1].rev - a[1].rev),
      byPayment: Object.entries(byPayment).sort((a, b) => b[1] - a[1]),
      byStore: Object.entries(byStore).sort((a, b) => b[1].rev - a[1].rev),
      byService: Object.entries(byService).sort((a, b) => b[1] - a[1]).slice(0, 8),
      byExpCat: Object.entries(byExpCat).sort((a, b) => b[1] - a[1]),
      transactionCount: rev.length,
      uniquePatients, newPatients, noShows, noShowRate, totalBookings,
      consultationCount: consultations.length,
    };
  }, [data, selectedMonth]);

  const printReport = () => {
    const clinic = getClinicName();
    const clinicEn = getClinicNameEn();
    const w = window.open('', '_blank');
    if (!w) return;

    const docRows = report.byDoctor.map(([d, v]) => `<tr><td>${d}</td><td style="text-align:right">${v.count}</td><td style="text-align:right">${fmtM(v.rev)}</td><td style="text-align:right">${fmtM(v.count > 0 ? v.rev / v.count : 0)}</td></tr>`).join('');
    const payRows = report.byPayment.map(([p, v]) => `<tr><td>${p}</td><td style="text-align:right">${fmtM(v)}</td><td style="text-align:right">${report.totalRev > 0 ? Math.round(v / report.totalRev * 100) : 0}%</td></tr>`).join('');
    const storeRows = report.byStore.map(([s, v]) => `<tr><td>${s}</td><td style="text-align:right">${v.count}</td><td style="text-align:right">${fmtM(v.rev)}</td></tr>`).join('');
    const svcRows = report.byService.map(([s, v]) => `<tr><td>${s}</td><td style="text-align:right">${fmtM(v)}</td></tr>`).join('');
    const expRows = report.byExpCat.map(([c, v]) => `<tr><td>${c}</td><td style="text-align:right">${fmtM(v)}</td><td style="text-align:right">${report.totalExp > 0 ? Math.round(v / report.totalExp * 100) : 0}%</td></tr>`).join('');

    w.document.write(`<!DOCTYPE html><html><head><title>月度報告 ${selectedMonth}</title>
      <style>
        body{font-family:'Microsoft YaHei',sans-serif;padding:30px;max-width:800px;margin:0 auto;font-size:12px;color:#333}
        h1{color:#0e7490;font-size:20px;border-bottom:3px solid #0e7490;padding-bottom:8px;margin-bottom:4px}
        .subtitle{font-size:11px;color:#888;margin-bottom:20px}
        h2{font-size:14px;color:#0e7490;margin:20px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
        table{width:100%;border-collapse:collapse;margin-bottom:12px}
        th{background:#0e7490;color:#fff;padding:5px 8px;text-align:left;font-size:11px}
        td{padding:4px 8px;border-bottom:1px solid #eee}
        .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
        .kpi{border:1px solid #ddd;border-radius:8px;padding:12px;text-align:center}
        .kpi-label{font-size:10px;color:#888;margin-bottom:4px}
        .kpi-value{font-size:20px;font-weight:800}
        .kpi-change{font-size:10px;margin-top:2px}
        .green{color:#16a34a}.red{color:#dc2626}.gold{color:#DAA520}.teal{color:#0e7490}
        .footer{text-align:center;font-size:9px;color:#aaa;margin-top:24px;border-top:1px dashed #ddd;padding-top:8px}
        @page{size:A4;margin:15mm}
      </style></head><body>
      <h1>${clinic} — 月度管理報告</h1>
      <div class="subtitle">${clinicEn} | 報告期間：${selectedMonth} | 列印時間：${new Date().toLocaleString('zh-HK')}</div>

      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">總營業額</div><div class="kpi-value teal">${fmtM(report.totalRev)}</div><div class="kpi-change ${report.revGrowth >= 0 ? 'green' : 'red'}">${report.revGrowth >= 0 ? '+' : ''}${report.revGrowth}% vs上月</div></div>
        <div class="kpi"><div class="kpi-label">總開支</div><div class="kpi-value red">${fmtM(report.totalExp)}</div></div>
        <div class="kpi"><div class="kpi-label">純利</div><div class="kpi-value ${report.profit >= 0 ? 'green' : 'red'}">${fmtM(report.profit)}</div><div class="kpi-change">利潤率 ${report.margin}%</div></div>
        <div class="kpi"><div class="kpi-label">病人數</div><div class="kpi-value gold">${report.uniquePatients}</div><div class="kpi-change">新病人 ${report.newPatients}</div></div>
      </div>

      <h2>醫師業績</h2>
      <table><thead><tr><th>醫師</th><th style="text-align:right">人次</th><th style="text-align:right">營業額</th><th style="text-align:right">人均消費</th></tr></thead><tbody>${docRows}</tbody></table>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <h2>付款方式分佈</h2>
          <table><thead><tr><th>付款方式</th><th style="text-align:right">金額</th><th style="text-align:right">佔比</th></tr></thead><tbody>${payRows}</tbody></table>
        </div>
        <div>
          <h2>分店業績</h2>
          <table><thead><tr><th>店舖</th><th style="text-align:right">人次</th><th style="text-align:right">營業額</th></tr></thead><tbody>${storeRows}</tbody></table>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <h2>熱門服務</h2>
          <table><thead><tr><th>服務</th><th style="text-align:right">營業額</th></tr></thead><tbody>${svcRows}</tbody></table>
        </div>
        <div>
          <h2>開支分類</h2>
          <table><thead><tr><th>類別</th><th style="text-align:right">金額</th><th style="text-align:right">佔比</th></tr></thead><tbody>${expRows}</tbody></table>
        </div>
      </div>

      <h2>營運指標</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">交易筆數</div><div class="kpi-value">${report.transactionCount}</div></div>
        <div class="kpi"><div class="kpi-label">預約總數</div><div class="kpi-value">${report.totalBookings}</div></div>
        <div class="kpi"><div class="kpi-label">No-show率</div><div class="kpi-value ${report.noShowRate > 10 ? 'red' : 'green'}">${report.noShowRate}%</div></div>
        <div class="kpi"><div class="kpi-label">診療紀錄</div><div class="kpi-value">${report.consultationCount}</div></div>
      </div>

      <div class="footer">此報告由系統自動生成，僅供管理層參考。${clinic} © ${new Date().getFullYear()}</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>月度管理報告</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ width: 'auto' }}>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="btn btn-teal btn-sm" onClick={printReport}>🖨️ 列印/PDF</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card teal">
          <div className="stat-label">總營業額</div>
          <div className="stat-value teal">{fmtM(report.totalRev)}</div>
          <div style={{ fontSize: 10, color: report.revGrowth >= 0 ? '#16a34a' : '#dc2626' }}>{report.revGrowth >= 0 ? '+' : ''}{report.revGrowth}% vs上月</div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <div className="stat-label">總開支</div>
          <div className="stat-value" style={{ color: '#dc2626' }}>{fmtM(report.totalExp)}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">純利</div>
          <div className="stat-value" style={{ color: report.profit >= 0 ? '#16a34a' : '#dc2626' }}>{fmtM(report.profit)}</div>
          <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>利潤率 {report.margin}%</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">唯一病人</div>
          <div className="stat-value gold">{report.uniquePatients}</div>
          <div style={{ fontSize: 10, color: '#16a34a' }}>新客 {report.newPatients}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Doctor Performance */}
        <div className="card">
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>醫師業績</h4>
          <table>
            <thead><tr><th>醫師</th><th style={{ textAlign: 'right' }}>人次</th><th style={{ textAlign: 'right' }}>營業額</th><th style={{ textAlign: 'right' }}>人均</th></tr></thead>
            <tbody>
              {report.byDoctor.map(([d, v]) => (
                <tr key={d}><td style={{ fontWeight: 600 }}>{d}</td><td style={{ textAlign: 'right' }}>{v.count}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtM(v.rev)}</td><td style={{ textAlign: 'right' }}>{fmtM(v.count > 0 ? v.rev / v.count : 0)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payment Methods */}
        <div className="card">
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>付款方式</h4>
          {report.byPayment.map(([p, v]) => (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 12 }}>{p}</span>
              <div style={{ width: 100, height: 14, background: 'var(--gray-100)', borderRadius: 7, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${report.totalRev > 0 ? v / report.totalRev * 100 : 0}%`, background: 'var(--teal)', borderRadius: 7 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, minWidth: 60, textAlign: 'right' }}>{fmtM(v)}</span>
            </div>
          ))}
        </div>

        {/* Top Services */}
        <div className="card">
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>熱門服務</h4>
          {report.byService.map(([s, v], i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12 }}>
              <span style={{ width: 16, textAlign: 'center', fontWeight: 700, color: i < 3 ? '#DAA520' : 'var(--gray-400)' }}>{i + 1}</span>
              <span style={{ flex: 1 }}>{s}</span>
              <span style={{ fontWeight: 600 }}>{fmtM(v)}</span>
            </div>
          ))}
        </div>

        {/* Expense Categories */}
        <div className="card">
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>開支分類</h4>
          {report.byExpCat.map(([c, v]) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 12 }}>{c}</span>
              <div style={{ width: 100, height: 14, background: 'var(--gray-100)', borderRadius: 7, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${report.totalExp > 0 ? v / report.totalExp * 100 : 0}%`, background: '#dc2626', borderRadius: 7, opacity: 0.6 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, minWidth: 60, textAlign: 'right' }}>{fmtM(v)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Store Comparison */}
      {report.byStore.length > 1 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>分店比較</h4>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(report.byStore.length, 4)}, 1fr)`, gap: 12 }}>
            {report.byStore.map(([s, v]) => (
              <div key={s} style={{ textAlign: 'center', padding: 12, background: 'var(--gray-50)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{s}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal)' }}>{fmtM(v.rev)}</div>
                <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>{v.count} 筆交易</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Operations Metrics */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 16 }}>
        <div className="stat-card"><div className="stat-label">交易筆數</div><div className="stat-value teal">{report.transactionCount}</div></div>
        <div className="stat-card"><div className="stat-label">預約總數</div><div className="stat-value gold">{report.totalBookings}</div></div>
        <div className="stat-card"><div className="stat-label">No-show率</div><div className="stat-value" style={{ color: report.noShowRate > 10 ? '#dc2626' : '#16a34a' }}>{report.noShowRate}%</div></div>
        <div className="stat-card"><div className="stat-label">診療紀錄</div><div className="stat-value" style={{ color: '#7C3AED' }}>{report.consultationCount}</div></div>
      </div>
    </div>
  );
}
