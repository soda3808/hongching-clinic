import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getTenantStoreNames } from '../tenant';
import escapeHtml from '../utils/escapeHtml';
import { fmtM, getMonth, monthLabel } from '../data';
import { S, ECTCM, rowStyle } from '../styles/ectcm';

const ACCENT = '#0e7490';

const REV_MAP = {
  '診金': '診金收入', '覆診': '診金收入', '初診': '診金收入', '診症': '診金收入',
  '中藥': '藥費收入', '藥費': '藥費收入', '內服中藥': '藥費收入', '藥材': '藥費收入',
  '針灸': '治療收入', '拔罐': '治療收入', '推拿': '治療收入', '刮痧': '治療收入',
  '艾灸': '治療收入', '天灸': '治療收入', '針灸+推拿': '治療收入',
  '商品': '商品銷售', '產品': '商品銷售', '保健品': '商品銷售',
  '長者醫療券': '長者醫療券', '醫療券': '長者醫療券',
};
const REV_ORDER = ['診金收入', '藥費收入', '治療收入', '商品銷售', '長者醫療券', '其他收入'];

const EXP_MAP = {
  '藥材/耗材': '藥材成本', '藥材': '藥材成本',
  '租金': '租金', '管理費': '租金',
  '人工': '薪酬', 'MPF': '薪酬', '勞保': '薪酬',
  '電費': '水電費', '水費': '水電費', '電話/網絡': '水電費',
  '日常雜費': '行政費用', '文具/印刷': '行政費用', '保險': '行政費用', '牌照/註冊': '行政費用', '培訓': '行政費用',
  '廣告/宣傳': '市場推廣', '推廣活動': '市場推廣',
};
const EXP_ORDER = ['藥材成本', '租金', '薪酬', '水電費', '行政費用', '市場推廣', '其他開支'];

function classifyRev(item) { return REV_MAP[item] || '其他收入'; }
function classifyExp(cat) { return EXP_MAP[cat] || '其他開支'; }

function pctChange(cur, prev) {
  if (!prev) return null;
  return ((cur - prev) / prev * 100).toFixed(1);
}

function Arrow({ val }) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  const color = n >= 0 ? '#16a34a' : '#dc2626';
  const arrow = n >= 0 ? '\u25B2' : '\u25BC';
  return <span style={{ fontSize: 11, color, marginLeft: 4 }}>{arrow} {Math.abs(n)}%</span>;
}

export default function IncomeStatement({ data, showToast, user }) {
  const today = new Date().toISOString().substring(0, 7);
  const [mode, setMode] = useState('month'); // month | custom
  const [selMonth, setSelMonth] = useState(today);
  const [dateFrom, setDateFrom] = useState(today + '-01');
  const [dateTo, setDateTo] = useState(new Date().toISOString().substring(0, 10));
  const [showTrend, setShowTrend] = useState(false);
  const [showStoreBreakdown, setShowStoreBreakdown] = useState(false);

  const stores = getTenantStoreNames();

  const months = useMemo(() => {
    const m = new Set();
    (data.revenue || []).forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    (data.expenses || []).forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    return [...m].sort();
  }, [data]);

  // Filter helpers
  const inRange = (d) => {
    if (mode === 'month') return getMonth(d) === selMonth;
    return d >= dateFrom && d <= dateTo;
  };

  const prevMonth = useMemo(() => {
    const d = new Date(selMonth + '-01');
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().substring(0, 7);
  }, [selMonth]);

  // Current period revenue
  const revBreakdown = useMemo(() => {
    const items = (data.revenue || []).filter(r => inRange(r.date));
    const map = {};
    REV_ORDER.forEach(k => { map[k] = 0; });
    items.forEach(r => {
      const cat = classifyRev(r.item || r.service || '');
      map[cat] = (map[cat] || 0) + Number(r.amount);
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return { map, total };
  }, [data.revenue, selMonth, mode, dateFrom, dateTo]);

  // Current period expenses
  const expBreakdown = useMemo(() => {
    const items = (data.expenses || []).filter(r => inRange(r.date));
    const map = {};
    EXP_ORDER.forEach(k => { map[k] = 0; });
    items.forEach(r => {
      const cat = classifyExp(r.category || '');
      map[cat] = (map[cat] || 0) + Number(r.amount);
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return { map, total };
  }, [data.expenses, selMonth, mode, dateFrom, dateTo]);

  // Previous month data for comparison
  const prev = useMemo(() => {
    if (mode !== 'month') return null;
    const prevRev = (data.revenue || []).filter(r => getMonth(r.date) === prevMonth);
    const prevExp = (data.expenses || []).filter(r => getMonth(r.date) === prevMonth);
    return {
      rev: prevRev.reduce((s, r) => s + Number(r.amount), 0),
      exp: prevExp.reduce((s, r) => s + Number(r.amount), 0),
    };
  }, [data, prevMonth, mode]);

  const grossProfit = revBreakdown.total - (expBreakdown.map['藥材成本'] || 0);
  const netProfit = revBreakdown.total - expBreakdown.total;
  const grossMargin = revBreakdown.total > 0 ? (grossProfit / revBreakdown.total * 100).toFixed(1) : '0.0';
  const netMargin = revBreakdown.total > 0 ? (netProfit / revBreakdown.total * 100).toFixed(1) : '0.0';

  const prevNetProfit = prev ? prev.rev - prev.exp : 0;

  // Chart data — simple bar
  const barMax = Math.max(revBreakdown.total, expBreakdown.total, 1);

  // ── Multi-month trend (last 6 months) ──
  const trendData = useMemo(() => {
    if (!showTrend) return [];
    // Generate last 6 months from selMonth
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(selMonth + '-01');
      d.setMonth(d.getMonth() - i);
      const m = d.toISOString().substring(0, 7);
      const mRev = (data.revenue || []).filter(r => getMonth(r.date) === m);
      const mExp = (data.expenses || []).filter(r => getMonth(r.date) === m);
      const rev = mRev.reduce((s, r) => s + Number(r.amount), 0);
      const exp = mExp.reduce((s, r) => s + Number(r.amount), 0);
      result.push({ month: m, label: monthLabel(m), rev, exp, net: rev - exp });
    }
    return result;
  }, [showTrend, selMonth, data.revenue, data.expenses]);

  const trendMax = useMemo(() => {
    if (!trendData.length) return 1;
    return Math.max(...trendData.map(d => Math.max(d.rev, d.exp)), 1);
  }, [trendData]);

  // ── Store-by-store breakdown ──
  const storeData = useMemo(() => {
    if (!showStoreBreakdown) return [];
    return stores.map(store => {
      const sRev = (data.revenue || []).filter(r => inRange(r.date) && r.store === store);
      const sExp = (data.expenses || []).filter(r => inRange(r.date) && r.store === store);
      const rev = sRev.reduce((s, r) => s + Number(r.amount), 0);
      const exp = sExp.reduce((s, r) => s + Number(r.amount), 0);
      // Revenue breakdown
      const revMap = {};
      REV_ORDER.forEach(k => { revMap[k] = 0; });
      sRev.forEach(r => { const cat = classifyRev(r.item || r.service || ''); revMap[cat] = (revMap[cat] || 0) + Number(r.amount); });
      // Expense breakdown
      const expMap = {};
      EXP_ORDER.forEach(k => { expMap[k] = 0; });
      sExp.forEach(r => { const cat = classifyExp(r.category || ''); expMap[cat] = (expMap[cat] || 0) + Number(r.amount); });
      return { store, rev, exp, net: rev - exp, revMap, expMap };
    });
  }, [showStoreBreakdown, data.revenue, data.expenses, selMonth, mode, dateFrom, dateTo, stores]);

  // ── Print with Google Fonts ──
  const handlePrint = () => {
    const clinic = getClinicName();
    const period = mode === 'month' ? monthLabel(selMonth) : `${dateFrom} ~ ${dateTo}`;
    const revRows = REV_ORDER.map(k => {
      const v = revBreakdown.map[k] || 0;
      if (v === 0) return '';
      return `<tr><td style="padding-left:24px">${k}</td><td class="m">${fmtM(v)}</td></tr>`;
    }).join('');
    const expRows = EXP_ORDER.map(k => {
      const v = expBreakdown.map[k] || 0;
      if (v === 0) return '';
      return `<tr><td style="padding-left:24px">${k}</td><td class="m">${fmtM(v)}</td></tr>`;
    }).join('');

    // Store breakdown rows for print
    let storeSection = '';
    if (storeData.length > 0) {
      storeSection = `<div style="page-break-before:auto;margin-top:20px">
        <div class="ti" style="font-size:15px">分店損益明細</div>
        <table>${storeData.map(s => `
          <tr style="background:#f0fdfa"><th colspan="2" style="font-size:13px;color:${ACCENT}">${escapeHtml(s.store)}</th></tr>
          <tr><td style="padding-left:24px">收入</td><td class="m">${fmtM(s.rev)}</td></tr>
          <tr><td style="padding-left:24px">開支</td><td class="m" style="color:#dc2626">${fmtM(s.exp)}</td></tr>
          <tr class="tot" style="color:${s.net >= 0 ? '#16a34a' : '#dc2626'}"><td>淨利潤</td><td class="m">${fmtM(s.net)}</td></tr>
          <tr><td colspan="2" style="height:6px;border:none"></td></tr>
        `).join('')}</table>
      </div>`;
    }

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>損益表 ${escapeHtml(period)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
      body{font-family:'Noto Sans TC','PingFang HK','Microsoft YaHei',sans-serif;padding:30px 50px;max-width:700px;margin:0 auto;color:#333}
      .hd{text-align:center;border-bottom:3px double ${ACCENT};padding-bottom:12px;margin-bottom:20px}
      .hd h1{font-size:18px;color:${ACCENT};margin:0}
      .hd p{font-size:11px;color:#888;margin:3px 0}
      .ti{text-align:center;font-size:18px;font-weight:800;color:${ACCENT};margin:16px 0}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#f3f4f6;padding:8px 12px;text-align:left;font-weight:700}
      td{padding:6px 12px;border-bottom:1px solid #eee}
      .m{text-align:right;font-family:'Noto Sans TC',monospace}
      .tot{font-weight:800;border-top:2px solid #333;font-size:14px}
      .pf{color:${netProfit >= 0 ? '#16a34a' : '#dc2626'}}
      .ft{text-align:center;font-size:10px;color:#aaa;margin-top:30px;border-top:1px solid #eee;padding-top:8px}
    </style></head><body>
      <div class="hd"><h1>${escapeHtml(clinic)}</h1></div>
      <div class="ti">損益表 Income Statement</div>
      <div style="text-align:center;font-size:13px;margin-bottom:20px;color:#555">報告期間：${escapeHtml(period)}</div>
      <table>
        <tr style="background:#e0f2fe"><th colspan="2" style="font-size:14px;color:${ACCENT}">營業收入 Revenue</th></tr>
        ${revRows}
        <tr class="tot"><td>營業收入合計</td><td class="m">${fmtM(revBreakdown.total)}</td></tr>
        <tr><td colspan="2" style="height:10px;border:none"></td></tr>
        <tr style="background:#fef2f2"><th colspan="2" style="font-size:14px;color:#dc2626">營業開支 Expenses</th></tr>
        ${expRows}
        <tr class="tot"><td>營業開支合計</td><td class="m">${fmtM(expBreakdown.total)}</td></tr>
        <tr><td colspan="2" style="height:10px;border:none"></td></tr>
        <tr class="tot"><td>毛利 Gross Profit</td><td class="m">${fmtM(grossProfit)}</td></tr>
        <tr><td style="padding-left:24px">毛利率</td><td class="m">${grossMargin}%</td></tr>
        <tr class="tot pf"><td style="font-size:16px">淨利潤 Net Profit</td><td class="m" style="font-size:16px">${fmtM(netProfit)}</td></tr>
        <tr><td style="padding-left:24px">淨利率</td><td class="m">${netMargin}%</td></tr>
      </table>
      ${storeSection}
      <div class="ft">此報表由系統自動生成 | ${escapeHtml(clinic)} | ${new Date().toLocaleString('zh-HK')}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const card = { padding: 14, borderRadius: 8, textAlign: 'center' };
  const lbl = { fontSize: 10, fontWeight: 600 };
  const big = { fontSize: 20, fontWeight: 800 };

  return (
    <div style={S.page}>
      <div style={S.titleBar}>營運報表 &gt; 收費總額報表</div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '12px' }}>
      <div className="card">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: ACCENT, margin: 0 }}>損益表 P&L</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={mode} onChange={e => setMode(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
              <option value="month">按月</option>
              <option value="custom">自訂期間</option>
            </select>
            {mode === 'month' ? (
              <select value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
                {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                {!months.includes(selMonth) && <option value={selMonth}>{monthLabel(selMonth)}</option>}
              </select>
            ) : (
              <>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ fontSize: 12, width: 130 }} />
                <span style={{ fontSize: 12 }}>至</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ fontSize: 12, width: 130 }} />
              </>
            )}
            <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }} onClick={() => setShowTrend(v => !v)}>
              {showTrend ? '隱藏趨勢' : '📈 趨勢'}
            </button>
            {stores.length > 1 && (
              <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }} onClick={() => setShowStoreBreakdown(v => !v)}>
                {showStoreBreakdown ? '隱藏分店' : '🏪 分店'}
              </button>
            )}
            <button className="btn btn-teal btn-sm" onClick={handlePrint}>🖨️ 列印</button>
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
          <div style={{ ...card, background: '#ecfdf5' }}>
            <div style={{ ...lbl, color: ACCENT }}>營業收入</div>
            <div style={{ ...big, color: ACCENT }}>{fmtM(revBreakdown.total)}</div>
            {prev && <Arrow val={pctChange(revBreakdown.total, prev.rev)} />}
          </div>
          <div style={{ ...card, background: '#fef2f2' }}>
            <div style={{ ...lbl, color: '#dc2626' }}>營業開支</div>
            <div style={{ ...big, color: '#dc2626' }}>{fmtM(expBreakdown.total)}</div>
            {prev && <Arrow val={pctChange(expBreakdown.total, prev.exp)} />}
          </div>
          <div style={{ ...card, background: netProfit >= 0 ? '#f0fdf4' : '#fef2f2' }}>
            <div style={{ ...lbl, color: netProfit >= 0 ? '#16a34a' : '#dc2626' }}>淨利潤</div>
            <div style={{ ...big, color: netProfit >= 0 ? '#16a34a' : '#dc2626' }}>{fmtM(netProfit)}</div>
            {prev && <Arrow val={pctChange(netProfit, prevNetProfit)} />}
          </div>
          <div style={{ ...card, background: '#fffbeb' }}>
            <div style={{ ...lbl, color: '#b45309' }}>淨利率</div>
            <div style={{ ...big, color: '#b45309' }}>{netMargin}%</div>
            <div style={{ fontSize: 10, color: '#888' }}>毛利率 {grossMargin}%</div>
          </div>
        </div>

        {/* Bar chart — revenue vs expense */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: ACCENT }}>收入 vs 開支</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: '收入', value: revBreakdown.total, color: ACCENT },
              { label: '開支', value: expBreakdown.total, color: '#dc2626' },
              { label: '利潤', value: Math.abs(netProfit), color: netProfit >= 0 ? '#16a34a' : '#dc2626' },
            ].map(b => (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 60, fontSize: 12, textAlign: 'right', color: b.color, fontWeight: 600 }}>{b.label}</span>
                <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 4, height: 24, position: 'relative' }}>
                  <div style={{ width: `${(b.value / barMax) * 100}%`, background: b.color, height: '100%', borderRadius: 4, transition: 'width .3s' }} />
                  <span style={{ position: 'absolute', right: 8, top: 3, fontSize: 12, fontWeight: 700 }}>{fmtM(b.label === '利潤' ? netProfit : b.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue & Expense tables side-by-side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Revenue */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: ACCENT }}>收入明細</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th style={S.th}>項目</th><th style={{ ...S.th, textAlign: 'right' }}>金額</th><th style={{ ...S.th, textAlign: 'right' }}>佔比</th></tr></thead>
                <tbody>
                  {REV_ORDER.map(k => {
                    const v = revBreakdown.map[k] || 0;
                    if (v === 0) return null;
                    return (
                      <tr key={k}>
                        <td style={{ fontWeight: 600 }}>{k}</td>
                        <td className="money">{fmtM(v)}</td>
                        <td className="money" style={{ color: '#888' }}>{(v / revBreakdown.total * 100).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  <tr style={{ fontWeight: 800, borderTop: `2px solid ${ACCENT}` }}>
                    <td>合計</td>
                    <td className="money">{fmtM(revBreakdown.total)}</td>
                    <td className="money">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          {/* Expenses */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#dc2626' }}>開支明細</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th style={S.th}>類別</th><th style={{ ...S.th, textAlign: 'right' }}>金額</th><th style={{ ...S.th, textAlign: 'right' }}>佔比</th></tr></thead>
                <tbody>
                  {EXP_ORDER.map(k => {
                    const v = expBreakdown.map[k] || 0;
                    if (v === 0) return null;
                    return (
                      <tr key={k}>
                        <td style={{ fontWeight: 600 }}>{k}</td>
                        <td className="money">{fmtM(v)}</td>
                        <td className="money" style={{ color: '#888' }}>{(v / expBreakdown.total * 100).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  <tr style={{ fontWeight: 800, borderTop: '2px solid #dc2626' }}>
                    <td>合計</td>
                    <td className="money">{fmtM(expBreakdown.total)}</td>
                    <td className="money">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Profit summary */}
        <div style={{ background: '#f9fafb', borderRadius: 8, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: ACCENT }}>利潤摘要</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '6px 16px', fontSize: 13 }}>
            <div>營業收入合計</div><div style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmtM(revBreakdown.total)}</div><div />
            <div style={{ paddingLeft: 12, color: '#888' }}>減：藥材成本</div><div style={{ textAlign: 'right', fontFamily: 'monospace', color: '#dc2626' }}>({fmtM(expBreakdown.map['藥材成本'] || 0)})</div><div />
            <div style={{ fontWeight: 700, borderTop: '1px solid #ddd', paddingTop: 4 }}>毛利</div>
            <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, borderTop: '1px solid #ddd', paddingTop: 4 }}>{fmtM(grossProfit)}</div>
            <div style={{ borderTop: '1px solid #ddd', paddingTop: 4, color: '#888', fontSize: 11 }}>{grossMargin}%</div>
            <div style={{ paddingLeft: 12, color: '#888' }}>減：其他開支</div><div style={{ textAlign: 'right', fontFamily: 'monospace', color: '#dc2626' }}>({fmtM(expBreakdown.total - (expBreakdown.map['藥材成本'] || 0))})</div><div />
            <div style={{ fontWeight: 800, borderTop: '2px solid #333', paddingTop: 6, fontSize: 15, color: netProfit >= 0 ? '#16a34a' : '#dc2626' }}>淨利潤</div>
            <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, borderTop: '2px solid #333', paddingTop: 6, fontSize: 15, color: netProfit >= 0 ? '#16a34a' : '#dc2626' }}>{fmtM(netProfit)}</div>
            <div style={{ borderTop: '2px solid #333', paddingTop: 6, fontSize: 11, color: '#888' }}>{netMargin}%</div>
          </div>
        </div>

        {revBreakdown.total === 0 && expBreakdown.total === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>此期間暫無財務數據<br /><span style={{ fontSize: 12 }}>請先到「收入」及「支出」頁面錄入數據</span></div>
        )}
      </div>

      {/* ══ Multi-Month Trend ══ */}
      {showTrend && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: ACCENT, marginBottom: 12 }}>📈 近 6 個月趨勢</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>月份</th>
                  <th style={{ textAlign: 'right' }}>收入</th>
                  <th style={{ textAlign: 'right' }}>開支</th>
                  <th style={{ textAlign: 'right' }}>淨利潤</th>
                  <th style={{ textAlign: 'right' }}>利率</th>
                  <th style={{ width: '30%' }}>對比</th>
                </tr>
              </thead>
              <tbody>
                {trendData.map(d => {
                  const margin = d.rev > 0 ? (d.net / d.rev * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={d.month} style={{ background: d.month === selMonth ? '#f0fdfa' : '', fontWeight: d.month === selMonth ? 700 : 400 }}>
                      <td style={{ fontWeight: 600, color: d.month === selMonth ? ACCENT : 'inherit' }}>{d.label}</td>
                      <td className="money">{fmtM(d.rev)}</td>
                      <td className="money" style={{ color: '#dc2626' }}>{fmtM(d.exp)}</td>
                      <td className="money" style={{ color: d.net >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{fmtM(d.net)}</td>
                      <td className="money" style={{ color: '#888' }}>{margin}%</td>
                      <td>
                        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                          <div style={{ height: 14, background: ACCENT, borderRadius: 2, width: `${trendMax > 0 ? (d.rev / trendMax) * 100 : 0}%`, minWidth: d.rev > 0 ? 2 : 0 }} />
                          <div style={{ height: 14, background: '#fca5a5', borderRadius: 2, width: `${trendMax > 0 ? (d.exp / trendMax) * 100 : 0}%`, minWidth: d.exp > 0 ? 2 : 0 }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ Store-by-Store Breakdown ══ */}
      {showStoreBreakdown && storeData.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: ACCENT, marginBottom: 12 }}>🏪 分店損益對比</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(storeData.length, 3)}, 1fr)`, gap: 12 }}>
            {storeData.map(s => (
              <div key={s.store} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: ACCENT, marginBottom: 8, textAlign: 'center' }}>{s.store}</div>
                {/* Mini summary */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                  <div style={{ textAlign: 'center', padding: 6, background: '#ecfdf5', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: '#666' }}>收入</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: ACCENT }}>{fmtM(s.rev)}</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 6, background: '#fef2f2', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: '#666' }}>開支</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#dc2626' }}>{fmtM(s.exp)}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: 8, background: s.net >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 6, marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: '#666' }}>淨利潤</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.net >= 0 ? '#16a34a' : '#dc2626' }}>{fmtM(s.net)}</div>
                  <div style={{ fontSize: 10, color: '#888' }}>利率 {s.rev > 0 ? (s.net / s.rev * 100).toFixed(1) : '0.0'}%</div>
                </div>
                {/* Revenue breakdown */}
                <div style={{ fontSize: 11 }}>
                  {REV_ORDER.map(k => {
                    const v = s.revMap[k] || 0;
                    if (v === 0) return null;
                    return (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #f3f4f6' }}>
                        <span style={{ color: '#555' }}>{k}</span>
                        <span style={{ fontWeight: 600 }}>{fmtM(v)}</span>
                      </div>
                    );
                  })}
                  <div style={{ borderTop: '1px solid #ddd', marginTop: 4, paddingTop: 4 }}>
                    {EXP_ORDER.map(k => {
                      const v = s.expMap[k] || 0;
                      if (v === 0) return null;
                      return (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #f3f4f6' }}>
                          <span style={{ color: '#888' }}>{k}</span>
                          <span style={{ color: '#dc2626' }}>{fmtM(v)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
