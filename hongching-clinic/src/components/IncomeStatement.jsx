import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';
import { fmtM, getMonth, monthLabel } from '../data';

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

  // ── Print ──
  const handlePrint = () => {
    const clinic = getClinicName();
    const period = mode === 'month' ? monthLabel(selMonth) : `${dateFrom} ~ ${dateTo}`;
    const revRows = REV_ORDER.map(k => `<tr><td style="padding-left:24px">${k}</td><td class="m">${fmtM(revBreakdown.map[k] || 0)}</td></tr>`).join('');
    const expRows = EXP_ORDER.map(k => `<tr><td style="padding-left:24px">${k}</td><td class="m">${fmtM(expBreakdown.map[k] || 0)}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>損益表 ${escapeHtml(period)}</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:30px 50px;max-width:700px;margin:0 auto;color:#333}
      .hd{text-align:center;border-bottom:3px double ${ACCENT};padding-bottom:12px;margin-bottom:20px}
      .hd h1{font-size:18px;color:${ACCENT};margin:0}
      .hd p{font-size:11px;color:#888;margin:3px 0}
      .ti{text-align:center;font-size:18px;font-weight:800;color:${ACCENT};margin:16px 0}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#f3f4f6;padding:8px 12px;text-align:left;font-weight:700}
      td{padding:6px 12px;border-bottom:1px solid #eee}
      .m{text-align:right;font-family:monospace}
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
      <div class="ft">此報表由系統自動生成 | ${escapeHtml(clinic)} | ${new Date().toLocaleString('zh-HK')}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const card = { padding: 14, borderRadius: 8, textAlign: 'center' };
  const lbl = { fontSize: 10, fontWeight: 600 };
  const big = { fontSize: 20, fontWeight: 800 };

  return (
    <div className="card" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: ACCENT, margin: 0 }}>損益表 Income Statement</h3>
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
          <button className="btn btn-teal btn-sm" onClick={handlePrint}>列印</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 60, fontSize: 12, textAlign: 'right', color: ACCENT, fontWeight: 600 }}>收入</span>
            <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 4, height: 24, position: 'relative' }}>
              <div style={{ width: `${(revBreakdown.total / barMax) * 100}%`, background: ACCENT, height: '100%', borderRadius: 4, transition: 'width .3s' }} />
              <span style={{ position: 'absolute', right: 8, top: 3, fontSize: 12, fontWeight: 700 }}>{fmtM(revBreakdown.total)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 60, fontSize: 12, textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>開支</span>
            <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 4, height: 24, position: 'relative' }}>
              <div style={{ width: `${(expBreakdown.total / barMax) * 100}%`, background: '#dc2626', height: '100%', borderRadius: 4, transition: 'width .3s' }} />
              <span style={{ position: 'absolute', right: 8, top: 3, fontSize: 12, fontWeight: 700 }}>{fmtM(expBreakdown.total)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 60, fontSize: 12, textAlign: 'right', color: netProfit >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>利潤</span>
            <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 4, height: 24, position: 'relative' }}>
              <div style={{ width: `${(Math.abs(netProfit) / barMax) * 100}%`, background: netProfit >= 0 ? '#16a34a' : '#dc2626', height: '100%', borderRadius: 4, transition: 'width .3s' }} />
              <span style={{ position: 'absolute', right: 8, top: 3, fontSize: 12, fontWeight: 700 }}>{fmtM(netProfit)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue & Expense tables side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Revenue */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: ACCENT }}>收入明細</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>項目</th><th style={{ textAlign: 'right' }}>金額</th><th style={{ textAlign: 'right' }}>佔比</th></tr></thead>
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
              <thead><tr><th>類別</th><th style={{ textAlign: 'right' }}>金額</th><th style={{ textAlign: 'right' }}>佔比</th></tr></thead>
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
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>此期間暫無財務數據</div>
      )}
    </div>
  );
}
