import { useState, useMemo } from 'react';
import { fmtM, getMonth, monthLabel, getDoctors, getStoreNames } from '../data';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const COLORS = ['#0e7490','#16a34a','#DAA520','#dc2626','#7C3AED','#0284c7','#f97316','#ec4899'];

const card = { background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' };
const sectionTitle = { fontSize: 15, fontWeight: 700, color: ACCENT, marginBottom: 12, borderBottom: `2px solid ${ACCENT}`, paddingBottom: 6 };
const metricCard = (color) => ({ background: '#fff', borderRadius: 10, padding: '14px 16px', minWidth: 140, flex: '1 1 160px', borderLeft: `4px solid ${color}`, boxShadow: '0 1px 3px rgba(0,0,0,.06)' });

function last12Months() {
  const out = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(d.toISOString().substring(0, 7));
  }
  return out;
}

function BarChartCSS({ data, labelKey, valueKey, color, maxH = 140, prefix = '$' }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: maxH + 30, overflowX: 'auto', padding: '0 2px' }}>
      {data.map((d, i) => {
        const h = (d[valueKey] / max) * maxH;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 0', minWidth: 28 }}>
            <div style={{ fontSize: 9, color: '#555', marginBottom: 2, whiteSpace: 'nowrap' }}>{prefix}{Math.round(d[valueKey] / 1000)}k</div>
            <div style={{ width: '80%', maxWidth: 36, height: Math.max(h, 2), background: color, borderRadius: '4px 4px 0 0', transition: 'height .3s' }} title={`${d[labelKey]}: ${prefix}${Math.round(d[valueKey]).toLocaleString()}`} />
            <div style={{ fontSize: 8, color: '#888', marginTop: 3, whiteSpace: 'nowrap' }}>{(d[labelKey] || '').substring(5)}</div>
          </div>
        );
      })}
    </div>
  );
}

function ProfitLineCSS({ data, maxH = 120 }) {
  const vals = data.map(d => d.profit);
  const max = Math.max(...vals.map(Math.abs), 1);
  const mid = maxH / 2;
  return (
    <div style={{ position: 'relative', height: maxH + 30, overflowX: 'auto' }}>
      <div style={{ position: 'absolute', top: mid, left: 0, right: 0, height: 1, background: '#ccc' }} />
      <div style={{ display: 'flex', alignItems: 'center', height: maxH, padding: '0 2px', gap: 4 }}>
        {data.map((d, i) => {
          const h = (Math.abs(d.profit) / max) * (maxH / 2 - 4);
          const isPos = d.profit >= 0;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 0', minWidth: 28, height: '100%', justifyContent: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', top: isPos ? mid - h - 12 : mid + h + 2, fontSize: 8, color: isPos ? '#16a34a' : '#dc2626' }}>{Math.round(d.profit / 1000)}k</div>
              <div style={{ position: 'absolute', width: '70%', maxWidth: 30, height: Math.max(h, 2), background: isPos ? '#16a34a' : '#dc2626', borderRadius: 3, top: isPos ? mid - h : mid, opacity: 0.8 }} title={`${d.month}: $${Math.round(d.profit).toLocaleString()}`} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '0 2px' }}>
        {data.map((d, i) => <div key={i} style={{ flex: '1 1 0', minWidth: 28, textAlign: 'center', fontSize: 8, color: '#888' }}>{(d.month || '').substring(5)}</div>)}
      </div>
    </div>
  );
}

function HorizBar({ items, total }) {
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
            <span style={{ fontWeight: 600 }}>{it.label}</span>
            <span style={{ color: '#555' }}>{fmtM(it.value)} ({total > 0 ? (it.value / total * 100).toFixed(1) : 0}%)</span>
          </div>
          <div style={{ height: 14, background: '#f1f5f9', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${total > 0 ? (it.value / total * 100) : 0}%`, background: COLORS[i % COLORS.length], borderRadius: 7, transition: 'width .3s' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FinancialDashboard({ data, showToast, user }) {
  const [filterStore, setFilterStore] = useState('');
  const DOCTORS = getDoctors();
  const STORES = getStoreNames();
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);
  const thisYear = today.substring(0, 4);
  const months12 = useMemo(last12Months, []);

  const revenue = data.revenue || [];
  const expenses = data.expenses || [];
  const consultations = data.consultations || [];
  const arap = data.arap || [];

  const filtered = useMemo(() => {
    if (!filterStore) return { rev: revenue, exp: expenses, con: consultations };
    return {
      rev: revenue.filter(r => r.store === filterStore),
      exp: expenses.filter(r => r.store === filterStore),
      con: consultations.filter(c => c.store === filterStore),
    };
  }, [revenue, expenses, consultations, filterStore]);

  // ── Key Metrics ──
  const metrics = useMemo(() => {
    const { rev, exp } = filtered;
    const todayRev = rev.filter(r => r.date === today).reduce((s, r) => s + Number(r.amount || 0), 0);
    const mtdRev = rev.filter(r => getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount || 0), 0);
    const ytdRev = rev.filter(r => (r.date || '').startsWith(thisYear)).reduce((s, r) => s + Number(r.amount || 0), 0);
    const ytdExp = exp.filter(r => (r.date || '').startsWith(thisYear)).reduce((s, r) => s + Number(r.amount || 0), 0);
    const outstanding = arap.filter(r => r.type === 'receivable' && r.status !== '已收').reduce((s, r) => s + Number(r.amount || 0), 0);
    const cashEst = ytdRev - ytdExp - outstanding;
    return { todayRev, mtdRev, ytdRev, ytdExp, outstanding, cashEst };
  }, [filtered, arap, today, thisMonth, thisYear]);

  // ── Monthly Trends ──
  const trends = useMemo(() => {
    const { rev, exp } = filtered;
    return months12.map(m => {
      const r = rev.filter(x => getMonth(x.date) === m).reduce((s, x) => s + Number(x.amount || 0), 0);
      const e = exp.filter(x => getMonth(x.date) === m).reduce((s, x) => s + Number(x.amount || 0), 0);
      return { month: m, revenue: r, expenses: e, profit: r - e };
    });
  }, [filtered, months12]);

  // ── Revenue by Service ──
  const byService = useMemo(() => {
    const map = {};
    const cats = ['診金','藥費','治療','商品','醫療券','其他'];
    filtered.rev.forEach(r => {
      const item = r.item || r.service || '其他';
      let cat = '其他';
      if (/診/.test(item)) cat = '診金';
      else if (/藥/.test(item)) cat = '藥費';
      else if (/針|灸|推拿|拔罐|刮痧|治療/.test(item)) cat = '治療';
      else if (/商品|產品/.test(item)) cat = '商品';
      else if (/醫療券|長者|voucher/i.test(item)) cat = '醫療券';
      map[cat] = (map[cat] || 0) + Number(r.amount || 0);
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return { items: cats.map(c => ({ label: c, value: map[c] || 0 })).filter(x => x.value > 0).sort((a, b) => b.value - a.value), total };
  }, [filtered.rev]);

  // ── Revenue by Doctor ──
  const byDoctor = useMemo(() => {
    const map = {};
    filtered.rev.forEach(r => { if (r.doctor) map[r.doctor] = (map[r.doctor] || 0) + Number(r.amount || 0); });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return { items: Object.entries(map).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ label: l, value: v })), total };
  }, [filtered.rev]);

  // ── Revenue by Store ──
  const byStore = useMemo(() => {
    const map = {};
    revenue.forEach(r => { if (r.store) map[r.store] = (map[r.store] || 0) + Number(r.amount || 0); });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return { items: Object.entries(map).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ label: l, value: v })), total };
  }, [revenue]);

  // ── Payment Method ──
  const byPayment = useMemo(() => {
    const map = {};
    filtered.rev.forEach(r => { const m = r.payment || '未知'; map[m] = (map[m] || 0) + Number(r.amount || 0); });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return { items: Object.entries(map).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ label: l, value: v })), total };
  }, [filtered.rev]);

  // ── Quick Ratios ──
  const ratios = useMemo(() => {
    const { rev, exp, con } = filtered;
    const mtdRev = rev.filter(r => getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount || 0), 0);
    const mtdExp = exp.filter(r => getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount || 0), 0);
    const mtdCon = con.filter(c => getMonth(c.date) === thisMonth).length;
    const mtdPatients = new Set(con.filter(c => getMonth(c.date) === thisMonth).map(c => c.patientId || c.patient)).size;
    const opMargin = mtdRev > 0 ? ((mtdRev - mtdExp) / mtdRev * 100) : 0;
    const revPerPt = mtdPatients > 0 ? mtdRev / mtdPatients : 0;
    const costPerVisit = mtdCon > 0 ? mtdExp / mtdCon : 0;
    return { opMargin, revPerPt, costPerVisit, mtdCon, mtdPatients };
  }, [filtered, thisMonth]);

  // ── Print ──
  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { showToast && showToast('無法開啟列印視窗'); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>財務總覽</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px;font-size:12px}
      h1{font-size:18px;color:${ACCENT};border-bottom:2px solid ${ACCENT};padding-bottom:6px}
      h2{font-size:14px;color:#333;margin-top:18px}
      .metrics{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px}
      .mc{border:1px solid #ddd;border-radius:6px;padding:8px 12px;min-width:120px}
      .mc .lbl{font-size:10px;color:#888}.mc .val{font-size:16px;font-weight:700;color:${ACCENT}}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{border:1px solid #ddd;padding:4px 8px;text-align:left}th{background:#f8fafc}
      .r{text-align:right}
      @media print{body{padding:0}}</style></head><body>
      <h1>財務總覽報表</h1><p style="color:#888">列印日期: ${today}</p>
      <div class="metrics">
        <div class="mc"><div class="lbl">今日營業額</div><div class="val">${fmtM(metrics.todayRev)}</div></div>
        <div class="mc"><div class="lbl">本月營業額</div><div class="val">${fmtM(metrics.mtdRev)}</div></div>
        <div class="mc"><div class="lbl">年度營業額</div><div class="val">${fmtM(metrics.ytdRev)}</div></div>
        <div class="mc"><div class="lbl">應收帳款</div><div class="val">${fmtM(metrics.outstanding)}</div></div>
        <div class="mc"><div class="lbl">現金餘額(估)</div><div class="val">${fmtM(metrics.cashEst)}</div></div>
      </div>
      <h2>收入按服務</h2><table><tr><th>類別</th><th class="r">金額</th><th class="r">佔比</th></tr>
      ${byService.items.map(it => `<tr><td>${escapeHtml(it.label)}</td><td class="r">${fmtM(it.value)}</td><td class="r">${byService.total > 0 ? (it.value / byService.total * 100).toFixed(1) : 0}%</td></tr>`).join('')}
      </table>
      <h2>收入按醫師</h2><table><tr><th>醫師</th><th class="r">金額</th><th class="r">佔比</th></tr>
      ${byDoctor.items.map(it => `<tr><td>${escapeHtml(it.label)}</td><td class="r">${fmtM(it.value)}</td><td class="r">${byDoctor.total > 0 ? (it.value / byDoctor.total * 100).toFixed(1) : 0}%</td></tr>`).join('')}
      </table>
      <h2>經營比率 (本月)</h2><table><tr><th>指標</th><th class="r">數值</th></tr>
      <tr><td>營運利潤率</td><td class="r">${ratios.opMargin.toFixed(1)}%</td></tr>
      <tr><td>每病人收入</td><td class="r">${fmtM(ratios.revPerPt)}</td></tr>
      <tr><td>每診次成本</td><td class="r">${fmtM(ratios.costPerVisit)}</td></tr>
      </table></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const mCards = [
    { label: '今日營業額', value: fmtM(metrics.todayRev), color: ACCENT },
    { label: '本月營業額', value: fmtM(metrics.mtdRev), color: '#16a34a' },
    { label: '年度營業額', value: fmtM(metrics.ytdRev), color: '#7C3AED' },
    { label: '應收帳款', value: fmtM(metrics.outstanding), color: metrics.outstanding > 0 ? '#dc2626' : '#16a34a' },
    { label: '現金餘額(估)', value: fmtM(metrics.cashEst), color: metrics.cashEst >= 0 ? ACCENT : '#dc2626' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: ACCENT, margin: 0 }}>財務總覽</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {STORES.length > 1 && (
            <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}>
              <option value="">全部分店</option>
              {STORES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button onClick={handlePrint} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: ACCENT, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>列印報表</button>
        </div>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        {mCards.map(mc => (
          <div key={mc.label} style={metricCard(mc.color)}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{mc.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: mc.color }}>{mc.value}</div>
          </div>
        ))}
      </div>

      {/* Row: Revenue + Expense Trends */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={sectionTitle}>收入趨勢 (近12個月)</div>
          {trends.some(t => t.revenue > 0) ? <BarChartCSS data={trends} labelKey="month" valueKey="revenue" color={ACCENT} /> : <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>暫無數據</div>}
        </div>
        <div style={card}>
          <div style={sectionTitle}>支出趨勢 (近12個月)</div>
          {trends.some(t => t.expenses > 0) ? <BarChartCSS data={trends} labelKey="month" valueKey="expenses" color="#dc2626" /> : <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>暫無數據</div>}
        </div>
      </div>

      {/* Profit Trend */}
      <div style={card}>
        <div style={sectionTitle}>利潤趨勢 (收入 - 支出)</div>
        {trends.some(t => t.revenue > 0 || t.expenses > 0) ? <ProfitLineCSS data={trends} /> : <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>暫無數據</div>}
      </div>

      {/* Row: By Service + By Doctor */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={sectionTitle}>收入按服務類別</div>
          {byService.items.length > 0 ? <HorizBar items={byService.items} total={byService.total} /> : <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>暫無數據</div>}
          {byService.total > 0 && <div style={{ textAlign: 'right', fontSize: 12, color: '#888', marginTop: 8 }}>合計: {fmtM(byService.total)}</div>}
        </div>
        <div style={card}>
          <div style={sectionTitle}>收入按醫師</div>
          {byDoctor.items.length > 0 ? <HorizBar items={byDoctor.items} total={byDoctor.total} /> : <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>暫無數據</div>}
          {byDoctor.total > 0 && <div style={{ textAlign: 'right', fontSize: 12, color: '#888', marginTop: 8 }}>合計: {fmtM(byDoctor.total)}</div>}
        </div>
      </div>

      {/* Row: By Store + Payment Method */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={sectionTitle}>收入按分店</div>
          {byStore.items.length > 0 ? <HorizBar items={byStore.items} total={byStore.total} /> : <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>暫無數據</div>}
        </div>
        <div style={card}>
          <div style={sectionTitle}>付款方式分佈</div>
          {byPayment.items.length > 0 ? <HorizBar items={byPayment.items} total={byPayment.total} /> : <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>暫無數據</div>}
        </div>
      </div>

      {/* Quick Ratios */}
      <div style={card}>
        <div style={sectionTitle}>經營比率 (本月)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {[
            { label: '營運利潤率', value: `${ratios.opMargin.toFixed(1)}%`, color: ratios.opMargin >= 0 ? '#16a34a' : '#dc2626', sub: '(收入-支出)/收入' },
            { label: '每病人收入', value: fmtM(ratios.revPerPt), color: ACCENT, sub: `${ratios.mtdPatients} 位病人` },
            { label: '每診次成本', value: fmtM(ratios.costPerVisit), color: '#DAA520', sub: `${ratios.mtdCon} 診次` },
          ].map(r => (
            <div key={r.label} style={{ flex: '1 1 180px', background: '#f8fafc', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{r.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: r.color }}>{r.value}</div>
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>{r.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
