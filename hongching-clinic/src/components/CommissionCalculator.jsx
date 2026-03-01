import { useState, useMemo } from 'react';
import { fmtM, getMonth, getDoctors } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const LS_RULES = 'hcmc_commission_rules';
const LS_HISTORY = 'hcmc_commission_history';

const CATEGORIES = [
  { key: 'consult', label: '診金', keywords: ['診金', '初診', '覆診', '診症', '診察'] },
  { key: 'medicine', label: '藥費', keywords: ['藥', '中藥', '藥費', '藥材', '處方', '顆粒'] },
  { key: 'treatment', label: '治療', keywords: ['針灸', '推拿', '拔罐', '刮痧', '艾灸', '天灸', '治療', '耳穴'] },
  { key: 'product', label: '商品', keywords: ['商品', '產品', '保健品', '花茶', '外用'] },
];

function classifyItem(item) {
  if (!item) return 'consult';
  const s = item.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.keywords.some(kw => s.includes(kw))) return cat.key;
  }
  return 'consult';
}

function loadRules() {
  try { return JSON.parse(localStorage.getItem(LS_RULES)) || {}; } catch { return {}; }
}
function saveRules(r) { localStorage.setItem(LS_RULES, JSON.stringify(r)); }
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY)) || []; } catch { return []; }
}
function saveHistory(h) { localStorage.setItem(LS_HISTORY, JSON.stringify(h)); }

const defaultRule = { consult: 10, medicine: 5, treatment: 10, product: 8, base: 0 };

const S = {
  page: { padding: 24, fontFamily: 'system-ui, sans-serif', color: '#1e293b' },
  h1: { fontSize: 22, fontWeight: 700, color: ACCENT, marginBottom: 20, borderBottom: `3px solid ${ACCENT}`, paddingBottom: 8 },
  card: { background: '#fff', borderRadius: 10, padding: 18, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #e2e8f0' },
  tabs: { display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' },
  tab: (a) => ({ padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: a ? ACCENT : '#f1f5f9', color: a ? '#fff' : '#64748b' }),
  label: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  select: { padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' },
  btn: (c) => ({ padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: c || ACCENT, color: '#fff' }),
  th: { padding: '10px 12px', background: '#f8fafc', borderBottom: `2px solid ${ACCENT}`, textAlign: 'left', fontSize: 12, color: '#475569', fontWeight: 700 },
  td: { padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13 },
  tdr: { padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13, textAlign: 'right', fontFamily: 'monospace' },
  badge: (c) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: c || '#e0f2fe', color: ACCENT }),
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 },
  stat: { textAlign: 'center', padding: 14, background: '#f0fdfa', borderRadius: 8, border: `1px solid ${ACCENT}22` },
  statN: { fontSize: 22, fontWeight: 700, color: ACCENT },
  statL: { fontSize: 11, color: '#64748b', marginTop: 2 },
};

export default function CommissionCalculator({ data, showToast, user }) {
  const DOCTORS = getDoctors();
  const [tab, setTab] = useState('calc');
  const [rules, setRules] = useState(loadRules);
  const [history, setHistory] = useState(loadHistory);
  const [selMonth, setSelMonth] = useState(new Date().toISOString().substring(0, 7));
  const [editDoc, setEditDoc] = useState(DOCTORS[0] || '');

  const getRule = (doc) => rules[doc] || { ...defaultRule };
  const updateRule = (doc, field, val) => {
    const next = { ...rules, [doc]: { ...getRule(doc), [field]: Number(val) || 0 } };
    setRules(next);
    saveRules(next);
  };

  const months = useMemo(() => {
    const m = new Set();
    (data.revenue || []).forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    return [...m].sort().reverse();
  }, [data.revenue]);

  // Calculate doctor revenue by category for a given month
  const calcDoctor = (doc, month) => {
    const recs = (data.revenue || []).filter(r => r.doctor === doc && getMonth(r.date) === month);
    const byCat = { consult: 0, medicine: 0, treatment: 0, product: 0 };
    recs.forEach(r => { byCat[classifyItem(r.item)] += Number(r.amount) || 0; });
    const rule = getRule(doc);
    const commByCat = {
      consult: byCat.consult * (rule.consult / 100),
      medicine: byCat.medicine * (rule.medicine / 100),
      treatment: byCat.treatment * (rule.treatment / 100),
      product: byCat.product * (rule.product / 100),
    };
    const totalRev = Object.values(byCat).reduce((a, b) => a + b, 0);
    const totalComm = Object.values(commByCat).reduce((a, b) => a + b, 0);
    return { doc, recs: recs.length, byCat, commByCat, totalRev, totalComm, base: rule.base, total: rule.base + totalComm };
  };

  const allCalc = useMemo(() => DOCTORS.map(d => calcDoctor(d, selMonth)), [data.revenue, selMonth, rules]);
  const grandTotal = allCalc.reduce((s, c) => s + c.total, 0);

  const handleSaveHistory = () => {
    const entry = { month: selMonth, date: new Date().toISOString(), doctors: allCalc.map(c => ({ ...c })) };
    const next = [entry, ...history.filter(h => h.month !== selMonth)];
    setHistory(next);
    saveHistory(next);
    showToast?.(`已儲存 ${selMonth} 佣金記錄`);
  };

  const handlePrint = (c) => {
    const rule = getRule(c.doc);
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{font-family:Arial,sans-serif;padding:40px;color:#333;max-width:700px;margin:0 auto}
      table{width:100%;border-collapse:collapse;margin:14px 0}
      th,td{padding:8px 12px;border-bottom:1px solid #eee;text-align:left}
      th{background:${ACCENT};color:#fff} .r{text-align:right;font-family:monospace}
      .total{background:#f3f4f6;font-weight:700;border-top:2px solid #ccc}
      .header{border-bottom:3px solid ${ACCENT};padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between}
      .sig{display:flex;justify-content:space-between;margin-top:60px;padding:0 40px}
      .sig-box{text-align:center;width:35%}.sig-box div{border-bottom:1px solid #999;height:30px;margin-bottom:6px}
    </style></head><body>
    <div class="header"><div><b style="font-size:17px">${escapeHtml(getClinicName())}</b></div><div style="text-align:right"><b style="font-size:18px">佣金結算單</b></div></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:14px">
      <div><b>醫師：</b>${escapeHtml(c.doc)}</div>
      <div><b>月份：</b>${selMonth}</div>
      <div><b>列印日期：</b>${new Date().toISOString().split('T')[0]}</div>
    </div>
    <table><thead><tr><th>類別</th><th class="r">營業額</th><th class="r">佣金率</th><th class="r">佣金</th></tr></thead><tbody>
    <tr><td>診金</td><td class="r">${fmtM(c.byCat.consult)}</td><td class="r">${rule.consult}%</td><td class="r">${fmtM(c.commByCat.consult)}</td></tr>
    <tr><td>藥費</td><td class="r">${fmtM(c.byCat.medicine)}</td><td class="r">${rule.medicine}%</td><td class="r">${fmtM(c.commByCat.medicine)}</td></tr>
    <tr><td>治療</td><td class="r">${fmtM(c.byCat.treatment)}</td><td class="r">${rule.treatment}%</td><td class="r">${fmtM(c.commByCat.treatment)}</td></tr>
    <tr><td>商品</td><td class="r">${fmtM(c.byCat.product)}</td><td class="r">${rule.product}%</td><td class="r">${fmtM(c.commByCat.product)}</td></tr>
    <tr class="total"><td>小計佣金</td><td class="r">${fmtM(c.totalRev)}</td><td></td><td class="r">${fmtM(c.totalComm)}</td></tr>
    </tbody></table>
    <table><tbody>
    <tr><td>固定底薪</td><td class="r">${fmtM(c.base)}</td></tr>
    <tr><td>佣金合計</td><td class="r">${fmtM(c.totalComm)}</td></tr>
    <tr class="total"><td><b>應發總額</b></td><td class="r" style="font-size:18px;color:${ACCENT}"><b>${fmtM(c.total)}</b></td></tr>
    </tbody></table>
    <div class="sig"><div class="sig-box"><div></div><b>公司蓋章</b></div><div class="sig-box"><div></div><b>員工簽署</b></div></div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  // ── Stats ──
  const stats = useMemo(() => {
    const totalPaid = history.reduce((s, h) => s + h.doctors.reduce((ss, d) => ss + d.total, 0), 0);
    const totalComm = history.reduce((s, h) => s + h.doctors.reduce((ss, d) => ss + d.totalComm, 0), 0);
    const totalRev = history.reduce((s, h) => s + h.doctors.reduce((ss, d) => ss + d.totalRev, 0), 0);
    const avgRate = totalRev ? (totalComm / totalRev * 100) : 0;
    return { totalPaid, totalComm, avgRate, months: history.length };
  }, [history]);

  const TABS = [
    { key: 'calc', label: '月度計算' },
    { key: 'rules', label: '佣金規則' },
    { key: 'compare', label: '醫師對比' },
    { key: 'history', label: '歷史記錄' },
    { key: 'stats', label: '統計總覽' },
  ];

  return (
    <div style={S.page}>
      <h2 style={S.h1}>佣金計算器</h2>
      <div style={S.tabs}>
        {TABS.map(t => <button key={t.key} style={S.tab(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {/* ═══ Monthly Calculation ═══ */}
      {tab === 'calc' && (
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <label style={S.label}>選擇月份</label>
            <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ ...S.input, width: 180 }} />
            <button style={S.btn()} onClick={handleSaveHistory}>儲存本月記錄</button>
          </div>
          {allCalc.map(c => (
            <div key={c.doc} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div><b style={{ fontSize: 16, color: ACCENT }}>{c.doc}</b> <span style={S.badge()}>交易 {c.recs} 筆</span></div>
                <button style={S.btn('#0369a1')} onClick={() => handlePrint(c)}>列印結算單</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={S.th}>類別</th><th style={{ ...S.th, textAlign: 'right' }}>營業額</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>佣金率</th><th style={{ ...S.th, textAlign: 'right' }}>佣金</th>
                </tr></thead>
                <tbody>
                  {CATEGORIES.map(cat => (
                    <tr key={cat.key}>
                      <td style={S.td}>{cat.label}</td>
                      <td style={S.tdr}>{fmtM(c.byCat[cat.key])}</td>
                      <td style={S.tdr}>{getRule(c.doc)[cat.key]}%</td>
                      <td style={S.tdr}>{fmtM(c.commByCat[cat.key])}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#f0fdfa', fontWeight: 700 }}>
                    <td style={S.td}>合計</td><td style={S.tdr}>{fmtM(c.totalRev)}</td><td style={S.tdr}></td><td style={S.tdr}>{fmtM(c.totalComm)}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 8 }}>
                <span>固定底薪：<b>{fmtM(c.base)}</b></span>
                <span>佣金：<b>{fmtM(c.totalComm)}</b></span>
                <span style={{ color: ACCENT, fontSize: 16, fontWeight: 700 }}>應發總額：{fmtM(c.total)}</span>
              </div>
            </div>
          ))}
          <div style={{ ...S.card, background: '#f0fdfa', textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>本月全部醫師應發合計：</span>
            <b style={{ fontSize: 20, color: ACCENT, marginLeft: 8 }}>{fmtM(grandTotal)}</b>
          </div>
        </div>
      )}

      {/* ═══ Commission Rules ═══ */}
      {tab === 'rules' && (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DOCTORS.map(d => (
              <button key={d} style={S.tab(editDoc === d)} onClick={() => setEditDoc(d)}>{d}</button>
            ))}
          </div>
          {editDoc && (
            <div style={S.card}>
              <h3 style={{ margin: '0 0 16px', color: ACCENT }}>{editDoc} — 佣金規則設定</h3>
              <div style={S.grid}>
                {CATEGORIES.map(cat => (
                  <div key={cat.key}>
                    <div style={S.label}>{cat.label}佣金 (%)</div>
                    <input type="number" min="0" max="100" value={getRule(editDoc)[cat.key]}
                      onChange={e => updateRule(editDoc, cat.key, e.target.value)} style={S.input} />
                  </div>
                ))}
                <div>
                  <div style={S.label}>固定底薪 ($)</div>
                  <input type="number" min="0" value={getRule(editDoc).base}
                    onChange={e => updateRule(editDoc, 'base', e.target.value)} style={S.input} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                提示：佣金率以百分比輸入，底薪以港幣輸入。設定會自動儲存。
              </div>
            </div>
          )}
          <div style={S.card}>
            <h3 style={{ margin: '0 0 12px', color: '#475569', fontSize: 14 }}>所有醫師規則一覽</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={S.th}>醫師</th>
                {CATEGORIES.map(c => <th key={c.key} style={{ ...S.th, textAlign: 'right' }}>{c.label} %</th>)}
                <th style={{ ...S.th, textAlign: 'right' }}>底薪</th>
              </tr></thead>
              <tbody>
                {DOCTORS.map(d => {
                  const r = getRule(d);
                  return (
                    <tr key={d} style={{ cursor: 'pointer' }} onClick={() => setEditDoc(d)}>
                      <td style={S.td}><b>{d}</b></td>
                      {CATEGORIES.map(c => <td key={c.key} style={S.tdr}>{r[c.key]}%</td>)}
                      <td style={S.tdr}>{fmtM(r.base)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Doctor Comparison ═══ */}
      {tab === 'compare' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>對比月份：</label>
            <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ ...S.input, width: 180 }} />
          </div>
          <div style={S.card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={S.th}>醫師</th><th style={{ ...S.th, textAlign: 'right' }}>筆數</th>
                <th style={{ ...S.th, textAlign: 'right' }}>總營業額</th><th style={{ ...S.th, textAlign: 'right' }}>總佣金</th>
                <th style={{ ...S.th, textAlign: 'right' }}>底薪</th><th style={{ ...S.th, textAlign: 'right' }}>應發總額</th>
                <th style={{ ...S.th, textAlign: 'right' }}>佣金率</th>
              </tr></thead>
              <tbody>
                {allCalc.map(c => (
                  <tr key={c.doc}>
                    <td style={S.td}><b style={{ color: ACCENT }}>{c.doc}</b></td>
                    <td style={S.tdr}>{c.recs}</td>
                    <td style={S.tdr}>{fmtM(c.totalRev)}</td>
                    <td style={S.tdr}>{fmtM(c.totalComm)}</td>
                    <td style={S.tdr}>{fmtM(c.base)}</td>
                    <td style={{ ...S.tdr, fontWeight: 700, color: ACCENT }}>{fmtM(c.total)}</td>
                    <td style={S.tdr}>{c.totalRev ? (c.totalComm / c.totalRev * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f0fdfa', fontWeight: 700 }}>
                  <td style={S.td}>合計</td>
                  <td style={S.tdr}>{allCalc.reduce((s, c) => s + c.recs, 0)}</td>
                  <td style={S.tdr}>{fmtM(allCalc.reduce((s, c) => s + c.totalRev, 0))}</td>
                  <td style={S.tdr}>{fmtM(allCalc.reduce((s, c) => s + c.totalComm, 0))}</td>
                  <td style={S.tdr}>{fmtM(allCalc.reduce((s, c) => s + c.base, 0))}</td>
                  <td style={{ ...S.tdr, color: ACCENT, fontSize: 15 }}>{fmtM(grandTotal)}</td>
                  <td style={S.tdr}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Category breakdown bar */}
          <div style={{ ...S.card }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#475569' }}>各醫師分類營業額對比</h3>
            {allCalc.map(c => {
              const max = Math.max(...allCalc.map(x => x.totalRev), 1);
              return (
                <div key={c.doc} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <b>{c.doc}</b><span>{fmtM(c.totalRev)}</span>
                  </div>
                  <div style={{ display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden', background: '#f1f5f9' }}>
                    {[{ k: 'consult', c: ACCENT }, { k: 'medicine', c: '#16a34a' }, { k: 'treatment', c: '#d97706' }, { k: 'product', c: '#7c3aed' }].map(cat => (
                      <div key={cat.k} style={{ width: `${(c.byCat[cat.k] / max) * 100}%`, background: cat.c, minWidth: c.byCat[cat.k] ? 2 : 0 }}
                        title={`${CATEGORIES.find(x => x.key === cat.k)?.label}: ${fmtM(c.byCat[cat.k])}`} />
                    ))}
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#64748b' }}>
              {[{ k: 'consult', c: ACCENT, l: '診金' }, { k: 'medicine', c: '#16a34a', l: '藥費' }, { k: 'treatment', c: '#d97706', l: '治療' }, { k: 'product', c: '#7c3aed', l: '商品' }].map(x => (
                <span key={x.k}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: x.c, marginRight: 4 }} />{x.l}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ History ═══ */}
      {tab === 'history' && (
        <div>
          {history.length === 0 && <div style={{ ...S.card, textAlign: 'center', color: '#94a3b8' }}>暫無歷史記錄。請在「月度計算」頁面點擊「儲存本月記錄」。</div>}
          {history.map((h, i) => (
            <div key={i} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <b style={{ color: ACCENT, fontSize: 15 }}>{h.month}</b>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>儲存於 {h.date?.split('T')[0]}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={S.th}>醫師</th><th style={{ ...S.th, textAlign: 'right' }}>營業額</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>佣金</th><th style={{ ...S.th, textAlign: 'right' }}>底薪</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>應發總額</th>
                </tr></thead>
                <tbody>
                  {(h.doctors || []).map(d => (
                    <tr key={d.doc}>
                      <td style={S.td}>{d.doc}</td>
                      <td style={S.tdr}>{fmtM(d.totalRev)}</td>
                      <td style={S.tdr}>{fmtM(d.totalComm)}</td>
                      <td style={S.tdr}>{fmtM(d.base)}</td>
                      <td style={{ ...S.tdr, fontWeight: 700, color: ACCENT }}>{fmtM(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f0fdfa', fontWeight: 700 }}>
                    <td style={S.td}>合計</td>
                    <td style={S.tdr}>{fmtM((h.doctors || []).reduce((s, d) => s + d.totalRev, 0))}</td>
                    <td style={S.tdr}>{fmtM((h.doctors || []).reduce((s, d) => s + d.totalComm, 0))}</td>
                    <td style={S.tdr}>{fmtM((h.doctors || []).reduce((s, d) => s + d.base, 0))}</td>
                    <td style={{ ...S.tdr, color: ACCENT }}>{fmtM((h.doctors || []).reduce((s, d) => s + d.total, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Stats ═══ */}
      {tab === 'stats' && (
        <div>
          <div style={S.grid}>
            <div style={S.stat}><div style={S.statN}>{fmtM(stats.totalPaid)}</div><div style={S.statL}>累計已發佣金+底薪</div></div>
            <div style={S.stat}><div style={S.statN}>{fmtM(stats.totalComm)}</div><div style={S.statL}>累計佣金總額</div></div>
            <div style={S.stat}><div style={S.statN}>{stats.avgRate.toFixed(1)}%</div><div style={S.statL}>平均佣金率</div></div>
            <div style={S.stat}><div style={S.statN}>{stats.months}</div><div style={S.statL}>已記錄月份數</div></div>
          </div>
          <div style={S.card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#475569' }}>各醫師歷史佣金分佈</h3>
            {DOCTORS.map(doc => {
              const docHistory = history.map(h => {
                const d = (h.doctors || []).find(x => x.doc === doc);
                return d ? { month: h.month, total: d.total, comm: d.totalComm, rev: d.totalRev } : null;
              }).filter(Boolean);
              const maxT = Math.max(...docHistory.map(x => x.total), 1);
              return (
                <div key={doc} style={{ marginBottom: 14 }}>
                  <b style={{ color: ACCENT, fontSize: 13 }}>{doc}</b>
                  {docHistory.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>暫無記錄</span>}
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'flex-end', height: 60 }}>
                    {docHistory.map(h => (
                      <div key={h.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: '100%', maxWidth: 40, background: ACCENT, borderRadius: '3px 3px 0 0', height: `${(h.total / maxT) * 50}px` }}
                          title={`${h.month}: ${fmtM(h.total)}`} />
                        <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{h.month.substring(5)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ ...S.card, background: '#fffbeb', border: '1px solid #fbbf2433' }}>
            <div style={{ fontSize: 13, color: '#92400e' }}>
              <b>說明：</b>統計數據來自已儲存的歷史記錄。請定期在「月度計算」中儲存每月佣金數據，以確保統計準確。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
