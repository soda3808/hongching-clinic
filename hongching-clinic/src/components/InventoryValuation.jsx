import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { fmtM } from '../data';
import escapeHtml from '../utils/escapeHtml';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const A = '#0e7490';
const CATEGORIES = ['中藥飲片', '中成藥', '西藥', '保健品', '耗材'];
const METHODS = [
  { key: 'avg', label: '加權平均法' },
  { key: 'fifo', label: '先進先出法' },
  { key: 'last', label: '最近成本法' },
];

const S = {
  page: { padding: 16, fontFamily: "'Microsoft YaHei',sans-serif", maxWidth: 1200, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, color: A, margin: '0 0 12px' },
  tabs: { display: 'flex', gap: 0, borderBottom: `2px solid #e5e7eb`, marginBottom: 16 },
  tab: a => ({ padding: '8px 18px', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? A : '#666', borderBottom: a ? `2px solid ${A}` : '2px solid transparent', marginBottom: -2, background: 'none', border: 'none', fontSize: 14 }),
  card: { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  stat: bg => ({ padding: '10px 16px', borderRadius: 8, background: bg, flex: '1 1 160px', minWidth: 140 }),
  label: { fontSize: 11, color: '#666', marginBottom: 2 },
  val: { fontSize: 20, fontWeight: 700, color: '#1e293b' },
  btn: (c = A) => ({ padding: '7px 16px', background: c, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  th: { padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, borderBottom: '2px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' },
  td: { padding: '6px', fontSize: 13, borderBottom: '1px solid #f0f0f0' },
  money: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
};

export default function InventoryValuation({ data, showToast, user }) {
  const [tab, setTab] = useState('summary');
  const [method, setMethod] = useState('avg');
  const inventory = data?.inventory || [];

  // ── Valuation calculations ──
  const valuations = useMemo(() => {
    const result = {};
    METHODS.forEach(m => {
      result[m.key] = inventory.map(item => {
        const qty = Number(item.stock) || 0;
        const cost = Number(item.costPerUnit) || Number(item.unitCost) || Number(item.cost) || 0;
        const lastCost = Number(item.lastCost) || cost;
        const avgCost = Number(item.avgCost) || cost;
        const fifoCost = Number(item.fifoCost) || cost;
        let unitVal = cost;
        if (m.key === 'avg') unitVal = avgCost;
        else if (m.key === 'fifo') unitVal = fifoCost;
        else if (m.key === 'last') unitVal = lastCost;
        return { ...item, qty, unitVal, totalVal: qty * unitVal };
      });
    });
    return result;
  }, [inventory]);

  const currentItems = valuations[method] || [];

  // ── Summary stats ──
  const summary = useMemo(() => {
    const res = {};
    METHODS.forEach(m => {
      const items = valuations[m.key] || [];
      res[m.key] = {
        skus: items.length,
        totalQty: items.reduce((s, i) => s + i.qty, 0),
        totalVal: items.reduce((s, i) => s + i.totalVal, 0),
      };
    });
    return res;
  }, [valuations]);

  // ── Category breakdown ──
  const catBreakdown = useMemo(() => {
    const map = {};
    CATEGORIES.forEach(c => { map[c] = { skus: 0, qty: 0, value: 0 }; });
    map['其他'] = { skus: 0, qty: 0, value: 0 };
    currentItems.forEach(item => {
      const cat = CATEGORIES.includes(item.category) ? item.category : '其他';
      map[cat].skus++;
      map[cat].qty += item.qty;
      map[cat].value += item.totalVal;
    });
    return Object.entries(map).filter(([, v]) => v.skus > 0).sort((a, b) => b[1].value - a[1].value);
  }, [currentItems]);

  // ── Top 20 most valuable items ──
  const top20 = useMemo(() =>
    [...currentItems].sort((a, b) => b.totalVal - a.totalVal).slice(0, 20),
  [currentItems]);

  // ── Slow-moving (no restock/usage 90+ days) ──
  const slowMoving = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().substring(0, 10);
    return currentItems.filter(item => {
      const lastDate = item.lastRestocked || item.lastUsed || '';
      return item.qty > 0 && (!lastDate || lastDate < cutoffStr);
    }).sort((a, b) => b.totalVal - a.totalVal);
  }, [currentItems]);

  // ── Dead stock (zero usage items with stock) ──
  const deadStock = useMemo(() =>
    currentItems.filter(item => {
      const used = Number(item.totalUsed) || Number(item.usageCount) || 0;
      return item.qty > 0 && used === 0 && !item.lastUsed;
    }).sort((a, b) => b.totalVal - a.totalVal),
  [currentItems]);

  // ── Turnover ratio ──
  const turnover = useMemo(() => {
    const consultations = data?.consultations || [];
    const today = new Date();
    const yearAgo = new Date(today);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const cutoff = yearAgo.toISOString().substring(0, 10);
    const usage = {};
    consultations.filter(c => c.date >= cutoff).forEach(c => {
      const days = c.formulaDays || 1;
      (c.prescription || []).forEach(rx => {
        if (!rx.herb) return;
        const dose = parseFloat(rx.dosage) || 0;
        usage[rx.herb] = (usage[rx.herb] || 0) + dose * days;
      });
    });
    return currentItems.map(item => {
      const annualUsage = usage[item.name] || 0;
      const cogsEstimate = annualUsage * item.unitVal;
      const avgInventory = item.totalVal || 1;
      const ratio = avgInventory > 0 ? cogsEstimate / avgInventory : 0;
      return { ...item, annualUsage, cogsEstimate, ratio };
    }).filter(i => i.qty > 0).sort((a, b) => a.ratio - b.ratio);
  }, [currentItems, data?.consultations]);

  // ── Comparison across methods ──
  const comparison = useMemo(() =>
    inventory.map(item => {
      const row = { name: item.name, category: item.category || '其他', qty: Number(item.stock) || 0, unit: item.unit || 'g' };
      METHODS.forEach(m => {
        const found = (valuations[m.key] || []).find(v => v.id === item.id);
        row[m.key] = found ? found.totalVal : 0;
        row[m.key + 'Unit'] = found ? found.unitVal : 0;
      });
      row.maxDiff = Math.max(row.avg, row.fifo, row.last) - Math.min(row.avg, row.fifo, row.last);
      return row;
    }).sort((a, b) => b.maxDiff - a.maxDiff),
  [inventory, valuations]);

  const totalVal = summary[method]?.totalVal || 0;
  const slowVal = slowMoving.reduce((s, i) => s + i.totalVal, 0);
  const deadVal = deadStock.reduce((s, i) => s + i.totalVal, 0);

  // ── Print report ──
  const printReport = () => {
    const clinic = getClinicName();
    const now = new Date().toLocaleString('zh-HK');
    const mLabel = METHODS.find(m => m.key === method)?.label || '';
    const catRows = catBreakdown.map(([c, v]) => `<tr><td>${escapeHtml(c)}</td><td style="text-align:right">${v.skus}</td><td style="text-align:right">${v.qty.toLocaleString()}</td><td style="text-align:right;font-weight:700">${fmtM(v.value)}</td><td style="text-align:right">${totalVal > 0 ? (v.value / totalVal * 100).toFixed(1) + '%' : '-'}</td></tr>`).join('');
    const topRows = top20.map((i, idx) => `<tr><td>${idx + 1}</td><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.category || '-')}</td><td style="text-align:right">${i.qty} ${escapeHtml(i.unit || 'g')}</td><td style="text-align:right">${fmtM(i.unitVal)}</td><td style="text-align:right;font-weight:700">${fmtM(i.totalVal)}</td></tr>`).join('');
    const compRows = METHODS.map(m => `<tr><td>${escapeHtml(m.label)}</td><td style="text-align:right">${summary[m.key].skus}</td><td style="text-align:right">${summary[m.key].totalQty.toLocaleString()}</td><td style="text-align:right;font-weight:700">${fmtM(summary[m.key].totalVal)}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>存貨估值報告</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:30px;max-width:900px;margin:0 auto;font-size:12px}
      h1{color:${A};font-size:18px;text-align:center;border-bottom:3px solid ${A};padding-bottom:8px}
      h2{color:${A};font-size:14px;margin:20px 0 6px;border-left:4px solid ${A};padding-left:8px}
      table{width:100%;border-collapse:collapse;margin:8px 0 16px}
      th{background:${A};color:#fff;padding:6px 8px;text-align:left;font-size:11px}
      td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}
      tr:nth-child(even){background:#f8fafc}
      .meta{color:#666;font-size:11px;text-align:center;margin-bottom:16px}
      @media print{body{padding:10px}h1{font-size:16px}}
    </style></head><body>
      <h1>${escapeHtml(clinic)} - 存貨估值報告</h1>
      <div class="meta">估值方法：${escapeHtml(mLabel)}　｜　列印時間：${now}　｜　操作員：${escapeHtml(user?.name || '-')}</div>
      <h2>各方法估值比較</h2>
      <table><tr><th>估值方法</th><th style="text-align:right">品項數</th><th style="text-align:right">總數量</th><th style="text-align:right">總估值</th></tr>${compRows}</table>
      <h2>分類明細（${mLabel}）</h2>
      <table><tr><th>分類</th><th style="text-align:right">品項</th><th style="text-align:right">數量</th><th style="text-align:right">估值</th><th style="text-align:right">佔比</th></tr>${catRows}</table>
      <h2>最高價值品項 Top 20</h2>
      <table><tr><th>#</th><th>品名</th><th>分類</th><th style="text-align:right">庫存</th><th style="text-align:right">單位成本</th><th style="text-align:right">估值</th></tr>${topRows}</table>
      <div style="margin-top:24px;text-align:center;color:#999;font-size:10px">— 報告完畢 —</div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  const TABS = [
    { key: 'summary', label: '估值總覽' },
    { key: 'category', label: '分類明細' },
    { key: 'top20', label: '高價值品項' },
    { key: 'slow', label: '慢動存貨' },
    { key: 'turnover', label: '週轉率' },
    { key: 'compare', label: '方法比較' },
  ];

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={S.h1}>存貨估值報告</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={method} onChange={e => setMethod(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
            {METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <button style={S.btn()} onClick={printReport}>列印報告</button>
        </div>
      </div>

      <div style={S.tabs}>
        {TABS.map(t => <button key={t.key} style={S.tab(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {/* ══ Summary ══ */}
      {tab === 'summary' && (
        <div>
          <div style={S.row}>
            <div style={S.stat('#ecfdf5')}><div style={S.label}>總品項 (SKU)</div><div style={S.val}>{summary[method]?.skus || 0}</div></div>
            <div style={S.stat('#eff6ff')}><div style={S.label}>總數量</div><div style={S.val}>{(summary[method]?.totalQty || 0).toLocaleString()}</div></div>
            <div style={S.stat('#f0fdfa')}><div style={S.label}>總估值（{METHODS.find(m => m.key === method)?.label}）</div><div style={{ ...S.val, color: A }}>{fmtM(totalVal)}</div></div>
          </div>
          <div style={S.row}>
            <div style={S.stat('#fefce8')}><div style={S.label}>慢動存貨值</div><div style={{ ...S.val, fontSize: 16, color: '#d97706' }}>{fmtM(slowVal)}</div></div>
            <div style={S.stat('#fef2f2')}><div style={S.label}>呆滯存貨值</div><div style={{ ...S.val, fontSize: 16, color: '#dc2626' }}>{fmtM(deadVal)}</div></div>
            <div style={S.stat('#f5f3ff')}><div style={S.label}>有效存貨值</div><div style={{ ...S.val, fontSize: 16, color: '#7c3aed' }}>{fmtM(totalVal - deadVal)}</div></div>
          </div>

          <div style={S.card}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: A, margin: '0 0 10px' }}>各方法估值對照</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={S.th}>估值方法</th><th style={{ ...S.th, ...S.money }}>總品項</th><th style={{ ...S.th, ...S.money }}>總數量</th><th style={{ ...S.th, ...S.money }}>總估值</th><th style={{ ...S.th, ...S.money }}>差異</th>
              </tr></thead>
              <tbody>{METHODS.map(m => {
                const s = summary[m.key];
                const diff = s.totalVal - summary.avg.totalVal;
                return (
                  <tr key={m.key} style={m.key === method ? { background: '#f0fdfa' } : {}}>
                    <td style={S.td}><span style={{ fontWeight: m.key === method ? 700 : 400 }}>{m.label}</span>{m.key === method && <span style={{ color: A, fontSize: 11, marginLeft: 6 }}>（目前）</span>}</td>
                    <td style={{ ...S.td, ...S.money }}>{s.skus}</td>
                    <td style={{ ...S.td, ...S.money }}>{s.totalQty.toLocaleString()}</td>
                    <td style={{ ...S.td, ...S.money, fontWeight: 700 }}>{fmtM(s.totalVal)}</td>
                    <td style={{ ...S.td, ...S.money, color: diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : '#666' }}>{diff === 0 ? '-' : (diff > 0 ? '+' : '') + fmtM(diff)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ Category ══ */}
      {tab === 'category' && (
        <div style={S.card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: A, margin: '0 0 10px' }}>分類估值明細（{METHODS.find(m => m.key === method)?.label}）</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>分類</th><th style={{ ...S.th, ...S.money }}>品項數</th><th style={{ ...S.th, ...S.money }}>總數量</th><th style={{ ...S.th, ...S.money }}>估值金額</th><th style={{ ...S.th, ...S.money }}>佔比</th>
              <th style={S.th}>佔比圖</th>
            </tr></thead>
            <tbody>
              {catBreakdown.map(([cat, v]) => {
                const pct = totalVal > 0 ? (v.value / totalVal * 100) : 0;
                return (
                  <tr key={cat}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{cat}</td>
                    <td style={{ ...S.td, ...S.money }}>{v.skus}</td>
                    <td style={{ ...S.td, ...S.money }}>{v.qty.toLocaleString()}</td>
                    <td style={{ ...S.td, ...S.money, fontWeight: 700 }}>{fmtM(v.value)}</td>
                    <td style={{ ...S.td, ...S.money }}>{pct.toFixed(1)}%</td>
                    <td style={S.td}><div style={{ background: '#e5e7eb', borderRadius: 4, height: 14, width: 120 }}><div style={{ background: A, borderRadius: 4, height: 14, width: `${Math.min(100, pct)}%` }} /></div></td>
                  </tr>
                );
              })}
              <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                <td style={S.td}>合計</td>
                <td style={{ ...S.td, ...S.money }}>{catBreakdown.reduce((s, [, v]) => s + v.skus, 0)}</td>
                <td style={{ ...S.td, ...S.money }}>{catBreakdown.reduce((s, [, v]) => s + v.qty, 0).toLocaleString()}</td>
                <td style={{ ...S.td, ...S.money, color: A }}>{fmtM(totalVal)}</td>
                <td style={{ ...S.td, ...S.money }}>100%</td>
                <td style={S.td} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ══ Top 20 ══ */}
      {tab === 'top20' && (
        <div style={S.card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: A, margin: '0 0 10px' }}>最高價值品項 Top 20</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>#</th><th style={S.th}>品名</th><th style={S.th}>分類</th><th style={{ ...S.th, ...S.money }}>庫存量</th>
              <th style={{ ...S.th, ...S.money }}>單位成本</th><th style={{ ...S.th, ...S.money }}>估值金額</th><th style={{ ...S.th, ...S.money }}>佔比</th>
            </tr></thead>
            <tbody>{top20.map((item, idx) => {
              const pct = totalVal > 0 ? (item.totalVal / totalVal * 100) : 0;
              return (
                <tr key={item.id || idx}>
                  <td style={S.td}>{idx + 1}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{item.name}</td>
                  <td style={S.td}>{item.category || '-'}</td>
                  <td style={{ ...S.td, ...S.money }}>{item.qty} {item.unit || 'g'}</td>
                  <td style={{ ...S.td, ...S.money }}>{fmtM(item.unitVal)}</td>
                  <td style={{ ...S.td, ...S.money, fontWeight: 700, color: A }}>{fmtM(item.totalVal)}</td>
                  <td style={{ ...S.td, ...S.money }}>{pct.toFixed(1)}%</td>
                </tr>
              );
            })}</tbody>
          </table>
          {top20.length === 0 && <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>暫無存貨資料</div>}
        </div>
      )}

      {/* ══ Slow-moving & Dead stock ══ */}
      {tab === 'slow' && (
        <div>
          <div style={S.card}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#d97706', margin: '0 0 4px' }}>慢動存貨（90天以上無異動）</h3>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>共 {slowMoving.length} 項，估值 {fmtM(slowVal)}</div>
            {slowMoving.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={S.th}>品名</th><th style={S.th}>分類</th><th style={{ ...S.th, ...S.money }}>庫存</th>
                  <th style={{ ...S.th, ...S.money }}>估值</th><th style={S.th}>最後入貨</th>
                </tr></thead>
                <tbody>{slowMoving.slice(0, 30).map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{item.name}</td>
                    <td style={S.td}>{item.category || '-'}</td>
                    <td style={{ ...S.td, ...S.money }}>{item.qty} {item.unit || 'g'}</td>
                    <td style={{ ...S.td, ...S.money, color: '#d97706', fontWeight: 600 }}>{fmtM(item.totalVal)}</td>
                    <td style={S.td}>{item.lastRestocked || '-'}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <div style={{ textAlign: 'center', color: '#999', padding: 16 }}>無慢動存貨</div>}
          </div>

          <div style={S.card}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', margin: '0 0 4px' }}>呆滯存貨（零使用量）</h3>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>共 {deadStock.length} 項，估值 {fmtM(deadVal)}</div>
            {deadStock.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={S.th}>品名</th><th style={S.th}>分類</th><th style={{ ...S.th, ...S.money }}>庫存</th>
                  <th style={{ ...S.th, ...S.money }}>估值</th><th style={S.th}>建議</th>
                </tr></thead>
                <tbody>{deadStock.slice(0, 30).map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{item.name}</td>
                    <td style={S.td}>{item.category || '-'}</td>
                    <td style={{ ...S.td, ...S.money }}>{item.qty} {item.unit || 'g'}</td>
                    <td style={{ ...S.td, ...S.money, color: '#dc2626', fontWeight: 600 }}>{fmtM(item.totalVal)}</td>
                    <td style={{ ...S.td, color: '#dc2626', fontSize: 12 }}>考慮清理或退貨</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <div style={{ textAlign: 'center', color: '#999', padding: 16 }}>無呆滯存貨</div>}
          </div>
        </div>
      )}

      {/* ══ Turnover ══ */}
      {tab === 'turnover' && (
        <div style={S.card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: A, margin: '0 0 4px' }}>存貨週轉率分析</h3>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>根據過去12個月處方用量計算（年化週轉率 = 年度用量成本 / 當前庫存估值）</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>品名</th><th style={S.th}>分類</th><th style={{ ...S.th, ...S.money }}>庫存量</th>
              <th style={{ ...S.th, ...S.money }}>庫存估值</th><th style={{ ...S.th, ...S.money }}>年用量</th>
              <th style={{ ...S.th, ...S.money }}>年用量成本</th><th style={{ ...S.th, ...S.money }}>週轉率</th><th style={S.th}>狀態</th>
            </tr></thead>
            <tbody>{turnover.slice(0, 50).map((item, idx) => {
              const rColor = item.ratio < 1 ? '#dc2626' : item.ratio < 3 ? '#d97706' : '#16a34a';
              const rLabel = item.ratio < 1 ? '極低' : item.ratio < 3 ? '偏低' : item.ratio < 6 ? '正常' : '良好';
              return (
                <tr key={item.id || idx}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{item.name}</td>
                  <td style={S.td}>{item.category || '-'}</td>
                  <td style={{ ...S.td, ...S.money }}>{item.qty} {item.unit || 'g'}</td>
                  <td style={{ ...S.td, ...S.money }}>{fmtM(item.totalVal)}</td>
                  <td style={{ ...S.td, ...S.money }}>{Math.round(item.annualUsage).toLocaleString()}</td>
                  <td style={{ ...S.td, ...S.money }}>{fmtM(item.cogsEstimate)}</td>
                  <td style={{ ...S.td, ...S.money, fontWeight: 700, color: rColor }}>{item.ratio.toFixed(2)}</td>
                  <td style={S.td}><span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: rColor + '18', color: rColor }}>{rLabel}</span></td>
                </tr>
              );
            })}</tbody>
          </table>
          {turnover.length === 0 && <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>暫無足夠資料計算週轉率</div>}
        </div>
      )}

      {/* ══ Compare ══ */}
      {tab === 'compare' && (
        <div style={S.card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: A, margin: '0 0 4px' }}>三種估值方法並列比較</h3>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>按方法間最大差異排序，差異大的品項應優先核實成本</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead><tr>
                <th style={S.th}>品名</th><th style={S.th}>分類</th><th style={{ ...S.th, ...S.money }}>庫存</th>
                <th style={{ ...S.th, ...S.money, background: '#0c6478' }}>加權平均</th>
                <th style={{ ...S.th, ...S.money, background: '#0c6478' }}>先進先出</th>
                <th style={{ ...S.th, ...S.money, background: '#0c6478' }}>最近成本</th>
                <th style={{ ...S.th, ...S.money }}>最大差異</th>
              </tr></thead>
              <tbody>{comparison.slice(0, 50).map((row, idx) => (
                <tr key={idx}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{row.name}</td>
                  <td style={S.td}>{row.category}</td>
                  <td style={{ ...S.td, ...S.money }}>{row.qty} {row.unit}</td>
                  <td style={{ ...S.td, ...S.money }}>{fmtM(row.avg)}</td>
                  <td style={{ ...S.td, ...S.money }}>{fmtM(row.fifo)}</td>
                  <td style={{ ...S.td, ...S.money }}>{fmtM(row.last)}</td>
                  <td style={{ ...S.td, ...S.money, fontWeight: 600, color: row.maxDiff > 0 ? '#d97706' : '#666' }}>{row.maxDiff > 0 ? fmtM(row.maxDiff) : '-'}</td>
                </tr>
              ))}</tbody>
              <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                <td style={S.td} colSpan={3}>合計</td>
                <td style={{ ...S.td, ...S.money, color: A }}>{fmtM(summary.avg.totalVal)}</td>
                <td style={{ ...S.td, ...S.money, color: A }}>{fmtM(summary.fifo.totalVal)}</td>
                <td style={{ ...S.td, ...S.money, color: A }}>{fmtM(summary.last.totalVal)}</td>
                <td style={{ ...S.td, ...S.money, color: '#d97706' }}>{fmtM(Math.max(summary.avg.totalVal, summary.fifo.totalVal, summary.last.totalVal) - Math.min(summary.avg.totalVal, summary.fifo.totalVal, summary.last.totalVal))}</td>
              </tr>
            </table>
          </div>
          {comparison.length === 0 && <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>暫無存貨資料</div>}
        </div>
      )}
    </div>
  );
}
