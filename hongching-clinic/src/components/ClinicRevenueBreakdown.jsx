import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getDoctors, getStoreNames, fmtM } from '../data';

const ACCENT = '#0e7490';
const COLORS = ['#0e7490', '#16a34a', '#DAA520', '#dc2626', '#7C3AED', '#0284c7', '#f97316', '#059669', '#9333ea', '#b91c1c'];
const SVC_KEYS = ['診金', '針灸', '推拿', '中藥'];

const S = {
  header: { fontSize: 20, fontWeight: 800, color: ACCENT, marginBottom: 16 },
  filterBar: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20, alignItems: 'center' },
  btn: (on) => ({
    padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
    border: `1px solid ${on ? ACCENT : '#ddd'}`, background: on ? ACCENT : '#fff', color: on ? '#fff' : '#333',
  }),
  card: { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: ACCENT, marginBottom: 14, borderBottom: `2px solid ${ACCENT}`, paddingBottom: 6 },
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 10px', background: '#f8fafb', fontWeight: 700, fontSize: 12, borderBottom: '2px solid #e5e7eb' },
  thR: { textAlign: 'right', padding: '8px 10px', background: '#f8fafb', fontWeight: 700, fontSize: 12, borderBottom: '2px solid #e5e7eb' },
  td: { padding: '7px 10px', borderBottom: '1px solid #f0f0f0' },
  tdR: { padding: '7px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontFamily: 'monospace' },
  badge: (bg, c) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: bg, color: c }),
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  sNum: { fontSize: 22, fontWeight: 800, color: ACCENT },
  sLbl: { fontSize: 11, color: '#888', marginTop: 2 },
  dateInput: { padding: '5px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 },
  printBtn: {
    padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 14,
  },
};

/* ── SVG Pie Chart Helper ── */
function PieChart({ segments, size = 200 }) {
  const total = segments.reduce((s, g) => s + g.value, 0);
  if (!total) return <div style={{ textAlign: 'center', padding: 30, color: '#ccc' }}>暫無數據</div>;

  const cx = size / 2, cy = size / 2, r = size / 2 - 8;
  let cumAngle = -Math.PI / 2;

  const paths = segments.filter(s => s.value / total > 0.001).map((seg, i) => {
    const frac = seg.value / total;
    const angle = frac * 2 * Math.PI;
    const largeArc = angle > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(cumAngle);
    const y1 = cy + r * Math.sin(cumAngle);
    const x2 = cx + r * Math.cos(cumAngle + angle);
    const y2 = cy + r * Math.sin(cumAngle + angle);
    const d = segments.length === 1
      ? `M ${cx},${cy - r} A ${r},${r} 0 1,1 ${cx - 0.01},${cy - r} Z`
      : `M ${cx},${cy} L ${x1},${y1} A ${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`;
    cumAngle += angle;
    return <path key={i} d={d} fill={seg.color} stroke="#fff" strokeWidth="1.5" />;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>{paths}</svg>
      <div style={{ flex: 1, minWidth: 120 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 600, flex: 1 }}>{seg.label}</span>
            <span style={{ fontFamily: 'monospace', color: '#666' }}>{fmtM(seg.value)}</span>
            <span style={{ color: '#999', width: 44, textAlign: 'right' }}>{(seg.value / total * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Date Helpers ── */
function toDS(d) { return d.toISOString().substring(0, 10); }
function addDays(d, n) { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt; }
function startOfWeek(d) { const dt = new Date(d); dt.setDate(dt.getDate() - dt.getDay()); return dt; }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

function getRange(mode, cf, ct) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (mode === 'today') return { from: today, to: today };
  if (mode === 'week') return { from: startOfWeek(today), to: today };
  if (mode === 'custom' && cf && ct) return { from: new Date(cf), to: new Date(ct) };
  return { from: startOfMonth(today), to: today };
}

function getPrevRange(from, to) {
  const span = Math.round((to - from) / 86400000) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));
  return { from: prevFrom, to: prevTo };
}

function classifySvc(item) {
  if (!item) return '其他';
  for (const k of SVC_KEYS) { if (item.includes(k)) return k; }
  if (item.includes('藥') || item.includes('herb')) return '中藥';
  return '其他';
}

const chgPct = (cur, prev) => prev ? ((cur - prev) / prev * 100) : (cur > 0 ? 100 : 0);

function Arrow({ pct }) {
  if (pct === 0) return <span style={{ color: '#999', fontSize: 12 }}>—</span>;
  const up = pct > 0;
  return (
    <span style={{ color: up ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: 13 }}>
      {up ? '\u25B2' : '\u25BC'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/* ── Main Component ── */
export default function ClinicRevenueBreakdown({ data, showToast, user }) {
  const clinicName = useMemo(() => getClinicName(), []);

  const [rangeMode, setRangeMode] = useState(() => {
    try { return localStorage.getItem('hcmc_revbd_mode') || 'month'; } catch { return 'month'; }
  });
  const [customFrom, setCustomFrom] = useState(() => {
    try { return localStorage.getItem('hcmc_revbd_from') || ''; } catch { return ''; }
  });
  const [customTo, setCustomTo] = useState(() => {
    try { return localStorage.getItem('hcmc_revbd_to') || ''; } catch { return ''; }
  });
  const [tab, setTab] = useState('service');

  const setMode = (m) => { setRangeMode(m); try { localStorage.setItem('hcmc_revbd_mode', m); } catch {} };
  const setFrom = (v) => { setCustomFrom(v); try { localStorage.setItem('hcmc_revbd_from', v); } catch {} };
  const setTo = (v) => { setCustomTo(v); try { localStorage.setItem('hcmc_revbd_to', v); } catch {} };

  const revenue = data.revenue || [];

  /* ── Filter current + previous period ── */
  const { current, previous, range } = useMemo(() => {
    const rg = getRange(rangeMode, customFrom, customTo);
    const fromStr = toDS(rg.from), toStr = toDS(rg.to);
    const cur = revenue.filter(r => r.date >= fromStr && r.date <= toStr);
    const pr = getPrevRange(rg.from, rg.to);
    const pfStr = toDS(pr.from), ptStr = toDS(pr.to);
    const pre = revenue.filter(r => r.date >= pfStr && r.date <= ptStr);
    return { current: cur, previous: pre, range: rg };
  }, [revenue, rangeMode, customFrom, customTo]);

  const curTotal = current.reduce((s, r) => s + Number(r.amount || 0), 0);
  const prevTotal = previous.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalChg = prevTotal ? ((curTotal - prevTotal) / prevTotal * 100) : 0;
  const curN = current.length, prevN = previous.length;
  const avgPer = curN ? curTotal / curN : 0;
  const prevAvg = prevN ? prevTotal / prevN : 0;
  const avgChg = prevAvg ? ((avgPer - prevAvg) / prevAvg * 100) : 0;

  const buildBreakdown = (arr, keyFn) => {
    const map = {};
    arr.forEach(r => { const k = keyFn(r); map[k] = (map[k] || 0) + Number(r.amount || 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }));
  };

  const byService = useMemo(() => buildBreakdown(current, r => classifySvc(r.item)), [current]);
  const byDoctor = useMemo(() => buildBreakdown(current, r => r.doctor || '未指定'), [current]);
  const byStore = useMemo(() => buildBreakdown(current, r => r.store || '未指定'), [current]);
  const byPayment = useMemo(() => buildBreakdown(current, r => r.payment || '其他'), [current]);

  const topItems = useMemo(() => {
    const map = {};
    current.forEach(r => { const k = r.item || '診症服務'; if (!map[k]) map[k] = { count: 0, total: 0 }; map[k].count++; map[k].total += Number(r.amount || 0); });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total).slice(0, 10).map(([name, d]) => ({ name, ...d }));
  }, [current]);

  const buildPrevMap = (keyFn) => { const m = {}; previous.forEach(r => { const k = keyFn(r); m[k] = (m[k] || 0) + Number(r.amount || 0); }); return m; };
  const prevBySvc = useMemo(() => buildPrevMap(r => classifySvc(r.item)), [previous]);
  const prevByDoc = useMemo(() => buildPrevMap(r => r.doctor || '未指定'), [previous]);

  const tabs = [{ key: 'service', label: '服務類型' }, { key: 'doctor', label: '醫師' }, { key: 'store', label: '分店' }, { key: 'payment', label: '付款方式' }];
  const activeData = tab === 'service' ? byService : tab === 'doctor' ? byDoctor : tab === 'store' ? byStore : byPayment;
  const prevMap = tab === 'service' ? prevBySvc : tab === 'doctor' ? prevByDoc : {};
  const hasPrev = Object.keys(prevMap).length > 0;
  const rangeLabel = rangeMode === 'today' ? '今日' : rangeMode === 'week' ? '本週' : rangeMode === 'month' ? '本月' : `${customFrom} ~ ${customTo}`;

  /* ── Print detailed report ── */
  const handlePrint = () => {
    const fs = toDS(range.from), ts = toDS(range.to);
    const td = 'padding:5px 8px;border-bottom:1px solid #eee';
    const bR = (rows) => rows.map(r => `<tr><td style="${td};font-weight:600">${r.label}</td><td style="${td};text-align:right;font-family:monospace">${fmtM(r.value)}</td><td style="${td};text-align:right;color:#888">${curTotal ? (r.value / curTotal * 100).toFixed(1) : 0}%</td></tr>`).join('');
    const tR = topItems.map((t, i) => `<tr><td style="${td}">${i + 1}</td><td style="${td};font-weight:600">${t.name}</td><td style="${td};text-align:right">${t.count}</td><td style="${td};text-align:right;font-family:monospace">${fmtM(t.total)}</td></tr>`).join('');
    const sec = (title, hdr, body) => `<h2>${title}</h2><table><thead><tr>${hdr}</tr></thead><tbody>${body}</tbody></table>`;
    const thH = (cols) => cols.map(c => `<th${c[1] ? ' class="r"' : ''}>${c[0]}</th>`).join('');
    const w = window.open('', '_blank');
    if (!w) { showToast && showToast('無法開啟列印視窗'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>營業額分析報告</title>
<style>@page{size:A4;margin:12mm}body{font-family:'Microsoft YaHei',sans-serif;font-size:12px;color:#333;max-width:720px;margin:0 auto;padding:20px}
h1{font-size:18px;text-align:center;color:${ACCENT};margin-bottom:4px}.sub{text-align:center;color:#888;font-size:11px;margin-bottom:20px}
h2{font-size:14px;color:${ACCENT};border-bottom:2px solid ${ACCENT};padding-bottom:4px;margin-top:22px}
table{width:100%;border-collapse:collapse;margin:8px 0}th{background:#f8f8f8;font-weight:700;font-size:11px;padding:6px 8px;text-align:left;border-bottom:2px solid #ddd}.r{text-align:right}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:12px 0}.box{border:1px solid #ddd;border-radius:8px;padding:12px;text-align:center}.box .n{font-size:20px;font-weight:800}.box .l{font-size:10px;color:#888;margin-top:2px}
.footer{text-align:center;font-size:9px;color:#aaa;margin-top:30px;border-top:1px solid #eee;padding-top:8px}</style></head><body>
<h1>${clinicName} — 營業額分析報告</h1>
<div class="sub">REVENUE ANALYSIS REPORT | ${fs} ~ ${ts} | 列印: ${new Date().toLocaleString('zh-HK')}</div>
<div class="grid"><div class="box"><div class="n" style="color:${ACCENT}">${fmtM(curTotal)}</div><div class="l">${rangeLabel}營業額</div></div><div class="box"><div class="n" style="color:#666">${curN}</div><div class="l">交易筆數</div></div><div class="box"><div class="n" style="color:${ACCENT}">${fmtM(avgPer)}</div><div class="l">平均每筆</div></div></div>
${sec('按服務類型', thH([['服務'],['金額',1],['佔比',1]]), bR(byService))}
${sec('按醫師', thH([['醫師'],['金額',1],['佔比',1]]), bR(byDoctor))}
${sec('按分店', thH([['分店'],['金額',1],['佔比',1]]), bR(byStore))}
${sec('按付款方式', thH([['方式'],['金額',1],['佔比',1]]), bR(byPayment))}
${sec('Top 10 項目', thH([['#'],['項目'],['筆數',1],['金額',1]]), tR)}
<div class="footer">${clinicName} | 報告由系統自動生成 | ${new Date().toLocaleString('zh-HK')}</div></body></html>`);
    w.document.close(); w.print();
    showToast && showToast('已開啟列印視窗');
  };

  /* ── Render ── */
  return (
    <div>
      {/* Header + Print */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        <h2 style={S.header}>營業額分析</h2>
        <button style={S.printBtn} onClick={handlePrint}>列印報告</button>
      </div>

      {/* Date Range Filter */}
      <div style={S.filterBar}>
        {[['today', '今日'], ['week', '本週'], ['month', '本月'], ['custom', '自訂']].map(([k, l]) => (
          <button key={k} style={S.btn(rangeMode === k)} onClick={() => setMode(k)}>{l}</button>
        ))}
        {rangeMode === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setFrom(e.target.value)} style={S.dateInput} />
            <span style={{ color: '#888' }}>~</span>
            <input type="date" value={customTo} onChange={e => setTo(e.target.value)} style={S.dateInput} />
          </>
        )}
        <span style={{ fontSize: 12, color: '#888', marginLeft: 6 }}>
          {toDS(range.from)} ~ {toDS(range.to)} ({curN} 筆)
        </span>
      </div>

      {/* Summary Cards with period comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div style={S.card}>
          <div style={S.sLbl}>{rangeLabel}營業額</div>
          <div style={S.sNum}>{fmtM(curTotal)}</div>
          <Arrow pct={totalChg} />
          <div style={{ fontSize: 11, color: '#aaa' }}>上期 {fmtM(prevTotal)}</div>
        </div>
        <div style={S.card}>
          <div style={S.sLbl}>交易筆數</div>
          <div style={{ ...S.sNum, color: '#333' }}>{curN}</div>
          <Arrow pct={prevN ? ((curN - prevN) / prevN * 100) : 0} />
          <div style={{ fontSize: 11, color: '#aaa' }}>上期 {prevN}</div>
        </div>
        <div style={S.card}>
          <div style={S.sLbl}>平均每筆金額</div>
          <div style={S.sNum}>{fmtM(avgPer)}</div>
          <Arrow pct={avgChg} />
          <div style={{ fontSize: 11, color: '#aaa' }}>上期 {fmtM(prevAvg)}</div>
        </div>
        <div style={S.card}>
          <div style={S.sLbl}>增長率</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: totalChg >= 0 ? '#16a34a' : '#dc2626' }}>
            {totalChg >= 0 ? '+' : ''}{totalChg.toFixed(1)}%
          </div>
          <div style={{ fontSize: 11, color: '#aaa' }}>對比上期</div>
        </div>
      </div>

      {/* Breakdown by Category (tabbed) */}
      <div style={S.card}>
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e5e7eb' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 14, marginBottom: -2,
              borderBottom: tab === t.key ? `3px solid ${ACCENT}` : '3px solid transparent',
              background: 'none', fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? ACCENT : '#888',
            }}>{t.label}</button>
          ))}
        </div>

        {activeData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#bbb' }}>暫無數據</div>
        ) : (
          <>
            <PieChart segments={activeData.map(b => ({ label: b.label, value: b.value, color: b.color }))} size={200} />
            <table style={{ ...S.tbl, marginTop: 16 }}>
              <thead>
                <tr>
                  <th style={S.th}>{tabs.find(t => t.key === tab)?.label}</th>
                  <th style={S.thR}>金額</th>
                  <th style={S.thR}>佔比</th>
                  {hasPrev && <th style={S.thR}>對比上期</th>}
                </tr>
              </thead>
              <tbody>
                {activeData.map((b, i) => (
                  <tr key={b.label} style={{ background: i % 2 ? '#fafbfc' : '#fff' }}>
                    <td style={S.td}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: b.color, marginRight: 8, verticalAlign: 'middle' }} />
                      <span style={{ fontWeight: 600 }}>{b.label}</span>
                    </td>
                    <td style={S.tdR}>{fmtM(b.value)}</td>
                    <td style={S.tdR}>{curTotal ? (b.value / curTotal * 100).toFixed(1) : 0}%</td>
                    {hasPrev && <td style={S.tdR}><Arrow pct={chgPct(b.value, prevMap[b.label] || 0)} /></td>}
                  </tr>
                ))}
                <tr style={{ background: '#f0fdfa', fontWeight: 700 }}>
                  <td style={S.td}>合計</td>
                  <td style={S.tdR}>{fmtM(curTotal)}</td>
                  <td style={S.tdR}>100%</td>
                  {hasPrev && <td style={S.tdR}><Arrow pct={totalChg} /></td>}
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Top 10 Revenue Items */}
      <div style={S.card}>
        <div style={S.cardTitle}>Top 10 收入項目</div>
        {topItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#bbb' }}>暫無數據</div>
        ) : (
          <table style={S.tbl}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 36 }}>#</th>
                <th style={S.th}>項目名稱</th>
                <th style={S.thR}>筆數</th>
                <th style={S.thR}>總金額</th>
                <th style={S.thR}>平均金額</th>
              </tr>
            </thead>
            <tbody>
              {topItems.map((t, i) => (
                <tr key={t.name} style={{ background: i % 2 ? '#fafbfc' : '#fff' }}>
                  <td style={S.td}>
                    <span style={S.badge(
                      i < 3 ? ['#fef3c7', '#f1f5f9', '#fff7ed'][i] : '#f5f5f5',
                      i < 3 ? ['#92400e', '#475569', '#c2410c'][i] : '#888'
                    )}>{i + 1}</span>
                  </td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{t.name}</td>
                  <td style={S.tdR}>{t.count}</td>
                  <td style={{ ...S.tdR, color: ACCENT, fontWeight: 700 }}>{fmtM(t.total)}</td>
                  <td style={S.tdR}>{fmtM(t.count ? t.total / t.count : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Doctor + Store Side-by-side Panels */}
      <div style={S.grid2}>
        <div style={S.card}>
          <div style={S.cardTitle}>醫師營業額</div>
          <PieChart segments={byDoctor.map(b => ({ label: b.label, value: b.value, color: b.color }))} size={160} />
          {byDoctor.map(d => (
            <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{d.label}</span>
              <span>
                <span style={{ fontFamily: 'monospace', marginRight: 8 }}>{fmtM(d.value)}</span>
                <Arrow pct={chgPct(d.value, prevByDoc[d.label] || 0)} />
              </span>
            </div>
          ))}
        </div>
        <div style={S.card}>
          <div style={S.cardTitle}>分店營業額</div>
          <PieChart segments={byStore.map(b => ({ label: b.label, value: b.value, color: b.color }))} size={160} />
          {byStore.map(d => (
            <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{d.label}</span>
              <span style={{ fontFamily: 'monospace' }}>{fmtM(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
