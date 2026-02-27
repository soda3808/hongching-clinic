import { useState, useMemo } from 'react';
import { fmtM, getMonth, monthLabel } from '../data';
import { getClinicName } from '../tenant';

const ACCENT = '#0e7490';
const PAY_METHODS = ['現金', '信用卡', '醫療券', '轉賬', '其他'];
const PAY_COLORS = ['#16a34a', '#0e7490', '#8b5cf6', '#f59e0b', '#94a3b8'];

export default function CashFlowReport({ data, showToast, user }) {
  const today = new Date().toISOString().substring(0, 10);
  const thisMonth = today.substring(0, 7);
  const [selMonth, setSelMonth] = useState(thisMonth);

  // ── Previous month key ──
  const prevMonth = useMemo(() => {
    const [y, m] = selMonth.split('-').map(Number);
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return `${py}-${String(pm).padStart(2, '0')}`;
  }, [selMonth]);

  // ── Filter revenue & expenses for selected month ──
  const monthRev = useMemo(() =>
    (data.revenue || []).filter(r => getMonth(r.date) === selMonth), [data.revenue, selMonth]);
  const monthExp = useMemo(() =>
    (data.expenses || []).filter(e => getMonth(e.date) === selMonth), [data.expenses, selMonth]);
  const prevRev = useMemo(() =>
    (data.revenue || []).filter(r => getMonth(r.date) === prevMonth), [data.revenue, prevMonth]);
  const prevExp = useMemo(() =>
    (data.expenses || []).filter(e => getMonth(e.date) === prevMonth), [data.expenses, prevMonth]);

  // ── Cash flow summary ──
  const totalRevenue = monthRev.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalExpense = monthExp.reduce((s, e) => s + Number(e.amount || 0), 0);

  const operatingCategories = ['固定成本', '人事成本', '營運成本', '行政雜費', '市場推廣', '其他'];
  const investCategories = ['裝修工程', '傢俬/設備', '按金/訂金', '醫療器材', '電腦/軟件'];
  const financeCategories = ['貸款還款', '股東提款', '資本注入'];

  const classifyExpense = (e) => {
    const cat = e.category || '';
    if (investCategories.includes(cat)) return 'invest';
    if (financeCategories.includes(cat)) return 'finance';
    return 'operating';
  };

  const operatingExp = monthExp.filter(e => classifyExpense(e) === 'operating').reduce((s, e) => s + Number(e.amount || 0), 0);
  const investExp = monthExp.filter(e => classifyExpense(e) === 'invest').reduce((s, e) => s + Number(e.amount || 0), 0);
  const financeExp = monthExp.filter(e => classifyExpense(e) === 'finance').reduce((s, e) => s + Number(e.amount || 0), 0);

  const operatingCF = totalRevenue - operatingExp;
  const investCF = -investExp;
  const financeCF = -financeExp;
  const netCF = operatingCF + investCF + financeCF;

  // ── Previous month totals for comparison ──
  const prevTotalRev = prevRev.reduce((s, r) => s + Number(r.amount || 0), 0);
  const prevTotalExp = prevExp.reduce((s, e) => s + Number(e.amount || 0), 0);
  const prevNetCF = prevTotalRev - prevTotalExp;

  // ── Daily cash flow for selected month ──
  const dailyCF = useMemo(() => {
    const map = {};
    monthRev.forEach(r => {
      const d = r.date; if (!d) return;
      if (!map[d]) map[d] = { date: d, inflow: 0, outflow: 0 };
      map[d].inflow += Number(r.amount || 0);
    });
    monthExp.forEach(e => {
      const d = e.date; if (!d) return;
      if (!map[d]) map[d] = { date: d, inflow: 0, outflow: 0 };
      map[d].outflow += Number(e.amount || 0);
    });
    const arr = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    arr.forEach(d => { d.net = d.inflow - d.outflow; running += d.net; d.balance = running; });
    return arr;
  }, [monthRev, monthExp]);

  const maxDaily = Math.max(...dailyCF.map(d => Math.max(d.inflow, d.outflow)), 1);

  // ── Payment method breakdown ──
  const byPayment = useMemo(() => {
    const map = {};
    monthRev.forEach(r => {
      let pm = r.payment || '其他';
      if (!PAY_METHODS.includes(pm)) pm = '其他';
      if (!map[pm]) map[pm] = { count: 0, amount: 0 };
      map[pm].count++;
      map[pm].amount += Number(r.amount || 0);
    });
    return PAY_METHODS.map((m, i) => ({
      method: m, count: map[m]?.count || 0, amount: map[m]?.amount || 0, color: PAY_COLORS[i],
    })).filter(p => p.count > 0);
  }, [monthRev]);

  const totalPayAmt = byPayment.reduce((s, p) => s + p.amount, 0);

  // ── 3-month forecast based on last 6 months average ──
  const forecast = useMemo(() => {
    const months = [];
    const [sy, sm] = selMonth.split('-').map(Number);
    for (let i = 5; i >= 0; i--) {
      let mm = sm - i, yy = sy;
      while (mm < 1) { mm += 12; yy--; }
      months.push(`${yy}-${String(mm).padStart(2, '0')}`);
    }
    const revByM = {}, expByM = {};
    (data.revenue || []).forEach(r => { const k = getMonth(r.date); revByM[k] = (revByM[k] || 0) + Number(r.amount || 0); });
    (data.expenses || []).forEach(e => { const k = getMonth(e.date); expByM[k] = (expByM[k] || 0) + Number(e.amount || 0); });
    const histRevs = months.map(m => revByM[m] || 0);
    const histExps = months.map(m => expByM[m] || 0);
    const validCount = histRevs.filter(v => v > 0).length || 1;
    const avgRev = histRevs.reduce((s, v) => s + v, 0) / validCount;
    const avgExp = histExps.reduce((s, v) => s + v, 0) / validCount;
    const result = [];
    for (let i = 1; i <= 3; i++) {
      let mm = sm + i, yy = sy;
      while (mm > 12) { mm -= 12; yy++; }
      const key = `${yy}-${String(mm).padStart(2, '0')}`;
      result.push({ month: key, label: monthLabel(key), estRev: Math.round(avgRev), estExp: Math.round(avgExp), estNet: Math.round(avgRev - avgExp) });
    }
    return result;
  }, [data.revenue, data.expenses, selMonth]);

  // ── Print formal cash flow statement ──
  const handlePrint = () => {
    const clinic = getClinicName();
    const dailyRows = dailyCF.map(d =>
      `<tr><td>${d.date.slice(5)}</td><td class="r g">${fmtM(d.inflow)}</td><td class="r rd">${fmtM(d.outflow)}</td><td class="r" style="color:${d.net >= 0 ? '#16a34a' : '#dc2626'}">${d.net >= 0 ? '+' : ''}${fmtM(d.net)}</td><td class="r">${fmtM(d.balance)}</td></tr>`
    ).join('');
    const payRows = byPayment.map(p =>
      `<tr><td>${p.method}</td><td class="r">${p.count}</td><td class="r">${fmtM(p.amount)}</td><td class="r">${totalPayAmt > 0 ? (p.amount / totalPayAmt * 100).toFixed(1) : 0}%</td></tr>`
    ).join('');
    const fcRows = forecast.map(f =>
      `<tr><td>${f.label}</td><td class="r g">${fmtM(f.estRev)}</td><td class="r rd">${fmtM(f.estExp)}</td><td class="r" style="color:${f.estNet >= 0 ? '#16a34a' : '#dc2626'}">${fmtM(f.estNet)}</td></tr>`
    ).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>現金流量報告</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:30px 50px;max-width:820px;margin:0 auto;color:#333;font-size:13px}
      .hd{text-align:center;border-bottom:3px double ${ACCENT};padding-bottom:10px;margin-bottom:18px}
      .hd h1{font-size:18px;color:${ACCENT};margin:0}.hd p{font-size:11px;color:#888;margin:2px 0}
      h2{font-size:15px;color:${ACCENT};margin:20px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      th{background:#f3f4f6;padding:6px 10px;text-align:left;font-weight:700;font-size:12px}
      td{padding:5px 10px;border-bottom:1px solid #eee}
      .r{text-align:right;font-family:monospace}.g{color:#16a34a}.rd{color:#dc2626}
      .total{font-weight:800;border-top:2px solid #333}
      .summary-box{display:flex;justify-content:space-between;margin-bottom:16px}
      .summary-item{flex:1;text-align:center;padding:10px;border:1px solid #e5e7eb;border-radius:6px;margin:0 4px}
      .summary-item .label{font-size:11px;color:#666}.summary-item .value{font-size:18px;font-weight:800}
      .ft{text-align:center;font-size:10px;color:#aaa;margin-top:30px;border-top:1px solid #eee;padding-top:8px}
    </style></head><body>
      <div class="hd"><h1>${clinic}</h1><p>現金流量報告 Cash Flow Statement</p><p>報告期間：${monthLabel(selMonth)}</p></div>
      <h2>現金流量摘要</h2>
      <div class="summary-box">
        <div class="summary-item"><div class="label">營業活動現金流</div><div class="value" style="color:${operatingCF >= 0 ? '#16a34a' : '#dc2626'}">${fmtM(operatingCF)}</div></div>
        <div class="summary-item"><div class="label">投資活動現金流</div><div class="value" style="color:${investCF >= 0 ? '#16a34a' : '#dc2626'}">${fmtM(investCF)}</div></div>
        <div class="summary-item"><div class="label">融資活動現金流</div><div class="value" style="color:${financeCF >= 0 ? '#16a34a' : '#dc2626'}">${fmtM(financeCF)}</div></div>
        <div class="summary-item"><div class="label">淨現金流</div><div class="value" style="color:${netCF >= 0 ? '#16a34a' : '#dc2626'}">${fmtM(netCF)}</div></div>
      </div>
      <h2>每日現金流</h2>
      <table><thead><tr><th>日期</th><th class="r">流入</th><th class="r">流出</th><th class="r">淨額</th><th class="r">累計</th></tr></thead><tbody>${dailyRows}
        <tr class="total"><td>合計</td><td class="r g">${fmtM(totalRevenue)}</td><td class="r rd">${fmtM(totalExpense)}</td><td class="r">${fmtM(netCF)}</td><td></td></tr>
      </tbody></table>
      <h2>付款方式分佈</h2>
      <table><thead><tr><th>付款方式</th><th class="r">筆數</th><th class="r">金額</th><th class="r">佔比</th></tr></thead><tbody>${payRows}</tbody></table>
      <h2>未來 3 個月現金流預測</h2>
      <table><thead><tr><th>月份</th><th class="r">預計收入</th><th class="r">預計支出</th><th class="r">預計淨額</th></tr></thead><tbody>${fcRows}</tbody></table>
      <div class="ft">此報表由系統自動生成 | ${clinic} | ${new Date().toLocaleString('zh-HK')}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // ── Helpers for percentage change ──
  const pctChg = (cur, prev) => prev !== 0 ? ((cur - prev) / Math.abs(prev) * 100).toFixed(1) : cur > 0 ? '100.0' : '0.0';
  const chgColor = (cur, prev, invert) => {
    const diff = cur - prev;
    if (diff === 0) return '#64748b';
    return (invert ? diff < 0 : diff > 0) ? '#16a34a' : '#dc2626';
  };

  // ── Styles ──
  const card = { padding: 12, background: '#f8fafc', borderRadius: 8, textAlign: 'center' };
  const sectionTitle = { fontWeight: 700, fontSize: 14, color: ACCENT, marginBottom: 8, marginTop: 16 };
  const [tab, setTab] = useState('summary');
  const pill = (active) => ({
    padding: '4px 12px', borderRadius: 14, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', border: 'none',
    background: active ? ACCENT : '#f1f5f9', color: active ? '#fff' : '#475569',
  });

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: ACCENT, margin: 0 }}>現金流量報告</h3>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)}
            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd' }} />
          <button className="btn btn-sm" style={{ background: ACCENT, color: '#fff' }} onClick={handlePrint}>列印報告</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
        {[
          { label: '營業活動現金流', value: operatingCF, color: operatingCF >= 0 ? '#16a34a' : '#dc2626' },
          { label: '投資活動現金流', value: investCF, color: investCF >= 0 ? '#16a34a' : '#dc2626' },
          { label: '融資活動現金流', value: financeCF, color: financeCF >= 0 ? '#16a34a' : '#dc2626' },
          { label: '淨現金流', value: netCF, color: netCF >= 0 ? '#16a34a' : '#dc2626' },
        ].map((c, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{fmtM(c.value)}</div>
          </div>
        ))}
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '2px solid #e2e8f0', paddingBottom: 6, flexWrap: 'wrap' }}>
        {[['summary','現金流摘要'],['daily','每日明細'],['payment','付款方式'],['position','現金走勢'],['forecast','預測'],['compare','月比較']].map(([k, l]) =>
          <button key={k} style={{ ...pill(tab === k), borderRadius: 6 }} onClick={() => setTab(k)}>{l}</button>
        )}
      </div>

      {/* ── Tab: Summary ── */}
      {tab === 'summary' && <>
        <div style={sectionTitle}>現金流量分類摘要</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>項目</th><th style={{ textAlign: 'right' }}>金額</th><th style={{ textAlign: 'right' }}>佔收入 %</th></tr></thead>
            <tbody>
              <tr><td style={{ fontWeight: 700, color: '#16a34a' }}>營業收入</td><td className="money" style={{ color: '#16a34a' }}>{fmtM(totalRevenue)}</td><td className="money">100%</td></tr>
              <tr><td>減：營運支出</td><td className="money" style={{ color: '#dc2626' }}>({fmtM(operatingExp)})</td><td className="money">{totalRevenue > 0 ? (operatingExp / totalRevenue * 100).toFixed(1) : '0'}%</td></tr>
              <tr style={{ fontWeight: 700, borderTop: '1px solid #cbd5e1' }}><td>營業活動現金流</td><td className="money" style={{ color: operatingCF >= 0 ? '#16a34a' : '#dc2626' }}>{fmtM(operatingCF)}</td><td className="money">{totalRevenue > 0 ? (operatingCF / totalRevenue * 100).toFixed(1) : '0'}%</td></tr>
              <tr><td>減：投資活動支出</td><td className="money" style={{ color: '#dc2626' }}>({fmtM(investExp)})</td><td className="money">{totalRevenue > 0 ? (investExp / totalRevenue * 100).toFixed(1) : '0'}%</td></tr>
              <tr><td>減：融資活動支出</td><td className="money" style={{ color: '#dc2626' }}>({fmtM(financeExp)})</td><td className="money">{totalRevenue > 0 ? (financeExp / totalRevenue * 100).toFixed(1) : '0'}%</td></tr>
              <tr style={{ fontWeight: 800, borderTop: '2px solid #333' }}>
                <td>淨現金流</td>
                <td className="money" style={{ color: netCF >= 0 ? '#16a34a' : '#dc2626', fontSize: 15 }}>{fmtM(netCF)}</td>
                <td className="money">{totalRevenue > 0 ? (netCF / totalRevenue * 100).toFixed(1) : '0'}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>}

      {/* ── Tab: Daily ── */}
      {tab === 'daily' && <>
        <div style={sectionTitle}>每日現金流明細</div>
        {dailyCF.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>日期</th><th style={{ textAlign: 'right' }}>流入</th><th style={{ textAlign: 'right' }}>流出</th><th style={{ textAlign: 'right' }}>淨額</th><th style={{ textAlign: 'right' }}>累計餘額</th></tr></thead>
              <tbody>
                {dailyCF.map(d => (
                  <tr key={d.date}>
                    <td style={{ fontWeight: 600 }}>{d.date.slice(5)}</td>
                    <td className="money" style={{ color: '#16a34a' }}>{fmtM(d.inflow)}</td>
                    <td className="money" style={{ color: '#dc2626' }}>{fmtM(d.outflow)}</td>
                    <td className="money" style={{ color: d.net >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{d.net >= 0 ? '+' : ''}{fmtM(d.net)}</td>
                    <td className="money" style={{ fontWeight: 700 }}>{fmtM(d.balance)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                  <td>合計</td>
                  <td className="money" style={{ color: '#16a34a' }}>{fmtM(totalRevenue)}</td>
                  <td className="money" style={{ color: '#dc2626' }}>{fmtM(totalExpense)}</td>
                  <td className="money" style={{ color: netCF >= 0 ? '#16a34a' : '#dc2626' }}>{fmtM(netCF)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>此月暫無現金流紀錄</div>}
      </>}

      {/* ── Tab: Payment method ── */}
      {tab === 'payment' && <>
        <div style={sectionTitle}>付款方式分佈</div>
        {byPayment.length > 0 ? <>
          {byPayment.map(p => (
            <div key={p.method} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                <span>{p.method} ({p.count} 筆)</span>
                <span>{fmtM(p.amount)} ({totalPayAmt > 0 ? (p.amount / totalPayAmt * 100).toFixed(1) : 0}%)</span>
              </div>
              <div style={{ height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalPayAmt > 0 ? (p.amount / totalPayAmt * 100) : 0}%`, background: p.color, borderRadius: 6, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>付款方式</th><th style={{ textAlign: 'right' }}>筆數</th><th style={{ textAlign: 'right' }}>金額</th><th style={{ textAlign: 'right' }}>佔比</th></tr></thead>
              <tbody>
                {byPayment.map(p => (
                  <tr key={p.method}>
                    <td style={{ fontWeight: 600 }}>{p.method}</td>
                    <td className="money">{p.count}</td>
                    <td className="money">{fmtM(p.amount)}</td>
                    <td className="money">{totalPayAmt > 0 ? (p.amount / totalPayAmt * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                  <td>合計</td><td className="money">{byPayment.reduce((s, p) => s + p.count, 0)}</td><td className="money">{fmtM(totalPayAmt)}</td><td className="money">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </> : <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>此月暫無收入紀錄</div>}
      </>}

      {/* ── Tab: Cash position (running balance chart) ── */}
      {tab === 'position' && <>
        <div style={sectionTitle}>現金走勢圖</div>
        {dailyCF.length > 0 ? <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 200, padding: '0 4px', marginBottom: 8, borderBottom: '1px solid #e2e8f0' }}>
            {dailyCF.map(d => {
              const maxBal = Math.max(...dailyCF.map(x => Math.abs(x.balance)), 1);
              const h = Math.abs(d.balance) / maxBal * 160;
              const isNeg = d.balance < 0;
              return (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                  <div style={{ fontSize: 8, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden' }}>{fmtM(d.balance)}</div>
                  <div style={{
                    width: '100%', maxWidth: 28, minHeight: 3,
                    height: `${h}px`,
                    background: isNeg ? '#dc2626' : ACCENT,
                    borderRadius: '3px 3px 0 0', transition: 'height 0.3s',
                  }} />
                  <div style={{ fontSize: 8, color: '#94a3b8', whiteSpace: 'nowrap' }}>{d.date.slice(8)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#475569', padding: '0 4px' }}>
            <span>起始：{fmtM(0)}</span>
            <span>最高：{fmtM(Math.max(...dailyCF.map(d => d.balance)))}</span>
            <span>最低：{fmtM(Math.min(...dailyCF.map(d => d.balance)))}</span>
            <span>期末：{fmtM(dailyCF[dailyCF.length - 1]?.balance || 0)}</span>
          </div>
        </> : <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>此月暫無現金流數據</div>}
      </>}

      {/* ── Tab: Forecast ── */}
      {tab === 'forecast' && <>
        <div style={sectionTitle}>未來 3 個月現金流預測</div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>根據近 6 個月平均值推算</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, marginBottom: 12 }}>
          {forecast.map(f => {
            const maxVal = Math.max(...forecast.map(x => Math.max(x.estRev, x.estExp)), 1);
            return (
              <div key={f.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 9, color: '#64748b' }}>{fmtM(f.estNet)}</div>
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                  <div style={{ width: '35%', maxWidth: 24, height: `${(f.estRev / maxVal) * 120}px`, minHeight: 3, background: '#16a34a', borderRadius: '3px 3px 0 0' }} />
                  <div style={{ width: '35%', maxWidth: 24, height: `${(f.estExp / maxVal) * 120}px`, minHeight: 3, background: '#dc2626', borderRadius: '3px 3px 0 0' }} />
                </div>
                <div style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>{f.label}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', fontSize: 11, marginBottom: 12 }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#16a34a', borderRadius: 2, marginRight: 4 }} />預計收入</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#dc2626', borderRadius: 2, marginRight: 4 }} />預計支出</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>月份</th><th style={{ textAlign: 'right' }}>預計收入</th><th style={{ textAlign: 'right' }}>預計支出</th><th style={{ textAlign: 'right' }}>預計淨現金流</th></tr></thead>
            <tbody>
              {forecast.map(f => (
                <tr key={f.month}>
                  <td style={{ fontWeight: 600 }}>{f.label}</td>
                  <td className="money" style={{ color: '#16a34a' }}>{fmtM(f.estRev)}</td>
                  <td className="money" style={{ color: '#dc2626' }}>{fmtM(f.estExp)}</td>
                  <td className="money" style={{ color: f.estNet >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{fmtM(f.estNet)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                <td>3 個月合計</td>
                <td className="money" style={{ color: '#16a34a' }}>{fmtM(forecast.reduce((s, f) => s + f.estRev, 0))}</td>
                <td className="money" style={{ color: '#dc2626' }}>{fmtM(forecast.reduce((s, f) => s + f.estExp, 0))}</td>
                <td className="money" style={{ color: forecast.reduce((s, f) => s + f.estNet, 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmtM(forecast.reduce((s, f) => s + f.estNet, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>}

      {/* ── Tab: Monthly comparison ── */}
      {tab === 'compare' && <>
        <div style={sectionTitle}>{monthLabel(selMonth)} vs {monthLabel(prevMonth)} 比較</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>項目</th><th style={{ textAlign: 'right' }}>{monthLabel(prevMonth)}</th><th style={{ textAlign: 'right' }}>{monthLabel(selMonth)}</th><th style={{ textAlign: 'right' }}>變化</th></tr></thead>
            <tbody>
              {[
                { label: '總收入', cur: totalRevenue, prev: prevTotalRev, invert: false },
                { label: '總支出', cur: totalExpense, prev: prevTotalExp, invert: true },
                { label: '淨現金流', cur: netCF, prev: prevNetCF, invert: false },
                { label: '交易筆數', cur: monthRev.length, prev: prevRev.length, invert: false, isMoney: false },
              ].map(row => (
                <tr key={row.label}>
                  <td style={{ fontWeight: 600 }}>{row.label}</td>
                  <td className="money">{row.isMoney === false ? row.prev : fmtM(row.prev)}</td>
                  <td className="money" style={{ fontWeight: 700 }}>{row.isMoney === false ? row.cur : fmtM(row.cur)}</td>
                  <td className="money" style={{ color: chgColor(row.cur, row.prev, row.invert), fontWeight: 600 }}>
                    {row.prev !== 0 ? `${row.cur >= row.prev ? '+' : ''}${pctChg(row.cur, row.prev)}%` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Visual comparison bars */}
        <div style={{ marginTop: 12 }}>
          {[
            { label: '收入', cur: totalRevenue, prev: prevTotalRev, color: '#16a34a' },
            { label: '支出', cur: totalExpense, prev: prevTotalExp, color: '#dc2626' },
            { label: '淨現金流', cur: Math.max(netCF, 0), prev: Math.max(prevNetCF, 0), color: ACCENT },
          ].map(b => {
            const maxVal = Math.max(b.cur, b.prev, 1);
            return (
              <div key={b.label} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{b.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 10, color: '#94a3b8', width: 50 }}>{monthLabel(prevMonth).split(' ')[0]}</span>
                  <div style={{ flex: 1, height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(b.prev / maxVal) * 100}%`, background: b.color, opacity: 0.4, borderRadius: 6 }} />
                  </div>
                  <span style={{ fontSize: 10, width: 70, textAlign: 'right' }}>{fmtM(b.label === '淨現金流' ? (b.prev > 0 ? b.prev : prevNetCF) : b.prev)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#475569', width: 50, fontWeight: 600 }}>{monthLabel(selMonth).split(' ')[0]}</span>
                  <div style={{ flex: 1, height: 12, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(b.cur / maxVal) * 100}%`, background: b.color, borderRadius: 6 }} />
                  </div>
                  <span style={{ fontSize: 10, width: 70, textAlign: 'right', fontWeight: 600 }}>{fmtM(b.label === '淨現金流' ? netCF : b.cur)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </>}

      {/* Footer */}
      <div style={{ marginTop: 16, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
        報告期間：{monthLabel(selMonth)} | 產生時間：{new Date().toLocaleString('zh-HK')} | {getClinicName()}
      </div>
    </div>
  );
}
