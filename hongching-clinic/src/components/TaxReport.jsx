import { useState, useMemo } from 'react';
import { fmtM, getMonth } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_tax_adjustments';

const TAX_YEARS = (() => {
  const yrs = [];
  for (let y = 2020; y <= new Date().getFullYear() + 1; y++) yrs.push(`${y}/${String(y + 1).slice(2)}`);
  return yrs.reverse();
})();

const inTaxYear = (dateStr, taxYear) => {
  if (!dateStr || !taxYear) return false;
  const [startY] = taxYear.split('/');
  const start = `${startY}-04-01`;
  const end = `${Number(startY) + 1}-03-31`;
  return dateStr >= start && dateStr <= end;
};

const DEDUCTION_CATS = [
  { key: 'rent', label: '租金', cats: ['租金', '管理費'] },
  { key: 'salaries', label: '薪酬', cats: ['人工'] },
  { key: 'utilities', label: '水電雜費', cats: ['電費', '水費', '電話/網絡'] },
  { key: 'supplies', label: '藥材/耗材', cats: ['藥材/耗材'] },
  { key: 'equipment', label: '器材折舊', cats: ['醫療器材', '電腦/軟件', '傢俬/設備'] },
  { key: 'mpf', label: 'MPF 供款', cats: ['MPF'] },
  { key: 'professional', label: '專業費用', cats: ['牌照/註冊', '保險', '培訓'] },
  { key: 'marketing', label: '市場推廣', cats: ['廣告/宣傳', '推廣活動'] },
  { key: 'other', label: '其他開支', cats: ['日常雜費', '文具/印刷', '交通', '飲食招待', '清潔', '裝修工程', '按金/訂金', '其他', '勞保'] },
];

const calcTax = (profit) => {
  if (profit <= 0) return 0;
  if (profit <= 2000000) return profit * 0.0825;
  return 2000000 * 0.0825 + (profit - 2000000) * 0.165;
};

const card = { background: '#fff', borderRadius: 10, padding: 18, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' };
const th = { padding: '8px 10px', textAlign: 'left', borderBottom: `2px solid ${ACCENT}`, fontSize: 13, color: ACCENT, fontWeight: 700 };
const td = { padding: '7px 10px', borderBottom: '1px solid #eee', fontSize: 13 };
const tdR = { ...td, textAlign: 'right', fontFamily: 'monospace' };
const btn = { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 };

export default function TaxReport({ data, showToast, user }) {
  const [taxYear, setTaxYear] = useState(TAX_YEARS[0]);
  const [tab, setTab] = useState('summary');
  const [adjustments, setAdjustments] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
  });

  const saveAdj = (obj) => { setAdjustments(obj); localStorage.setItem(LS_KEY, JSON.stringify(obj)); };
  const yearAdj = adjustments[taxYear] || {};
  const setYearAdj = (k, v) => { const na = { ...adjustments, [taxYear]: { ...yearAdj, [k]: v } }; saveAdj(na); };

  // ── Revenue by service type ──
  const revenueBreakdown = useMemo(() => {
    const items = (data.revenue || []).filter(r => inTaxYear(r.date, taxYear));
    const byService = {};
    items.forEach(r => {
      const svc = r.item || r.service || '其他';
      byService[svc] = (byService[svc] || 0) + Number(r.amount);
    });
    const total = items.reduce((s, r) => s + Number(r.amount), 0);
    return { byService, total, count: items.length };
  }, [data.revenue, taxYear]);

  // ── Deductions from expenses ──
  const deductions = useMemo(() => {
    const items = (data.expenses || []).filter(r => inTaxYear(r.date, taxYear));
    const result = {};
    DEDUCTION_CATS.forEach(dc => {
      result[dc.key] = items.filter(r => dc.cats.includes(r.category)).reduce((s, r) => s + Number(r.amount), 0);
    });
    result._total = Object.values(result).reduce((s, v) => s + v, 0);
    return result;
  }, [data.expenses, taxYear]);

  // ── Monthly revenue for quarterly provision ──
  const monthlyRevenue = useMemo(() => {
    const items = (data.revenue || []).filter(r => inTaxYear(r.date, taxYear));
    const byMonth = {};
    items.forEach(r => { const m = getMonth(r.date); byMonth[m] = (byMonth[m] || 0) + Number(r.amount); });
    return byMonth;
  }, [data.revenue, taxYear]);

  // ── Monthly expenses for schedules ──
  const monthlyExpenses = useMemo(() => {
    const items = (data.expenses || []).filter(r => inTaxYear(r.date, taxYear));
    const byMonth = {};
    items.forEach(r => { const m = getMonth(r.date); byMonth[m] = (byMonth[m] || 0) + Number(r.amount); });
    return byMonth;
  }, [data.expenses, taxYear]);

  // ── Supporting schedules ──
  const schedules = useMemo(() => {
    const items = (data.expenses || []).filter(r => inTaxYear(r.date, taxYear));
    const rent = items.filter(r => ['租金', '管理費'].includes(r.category));
    const salary = items.filter(r => ['人工', 'MPF'].includes(r.category));
    const depreciation = items.filter(r => ['醫療器材', '電腦/軟件', '傢俬/設備', '裝修工程'].includes(r.category));
    return { rent, salary, depreciation };
  }, [data.expenses, taxYear]);

  // ── Profit computation ──
  const addBackAdj = Number(yearAdj.addBack) || 0;
  const extraDeductAdj = Number(yearAdj.extraDeduct) || 0;
  const assessableProfit = revenueBreakdown.total - deductions._total + addBackAdj - extraDeductAdj;
  const taxPayable = calcTax(assessableProfit);
  const quarterlyProvision = taxPayable / 4;

  // ── Quarters ──
  const [startY] = taxYear.split('/');
  const quarters = [
    { label: `Q1 (${startY}/4-6月)`, months: [`${startY}-04`, `${startY}-05`, `${startY}-06`] },
    { label: `Q2 (${startY}/7-9月)`, months: [`${startY}-07`, `${startY}-08`, `${startY}-09`] },
    { label: `Q3 (${startY}/10-12月)`, months: [`${startY}-10`, `${startY}-11`, `${startY}-12`] },
    { label: `Q4 (${Number(startY) + 1}/1-3月)`, months: [`${Number(startY) + 1}-01`, `${Number(startY) + 1}-02`, `${Number(startY) + 1}-03`] },
  ];

  // ── Print ──
  const handlePrint = () => {
    const clinic = getClinicName();
    const w = window.open('', '_blank');
    if (!w) { showToast('請允許彈出視窗'); return; }
    const svcRows = Object.entries(revenueBreakdown.byService).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<tr><td style="padding:4px 12px">${escapeHtml(k)}</td><td style="padding:4px 12px;text-align:right">${fmtM(v)}</td></tr>`).join('');
    const dedRows = DEDUCTION_CATS.map(dc =>
      `<tr><td style="padding:4px 12px">${escapeHtml(dc.label)}</td><td style="padding:4px 12px;text-align:right">${fmtM(deductions[dc.key])}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>稅務計算表 - ${escapeHtml(clinic)}</title>
      <style>body{font-family:'Microsoft YaHei',sans-serif;padding:30px 40px;max-width:800px;margin:0 auto;color:#333;font-size:13px}
      h1{color:${ACCENT};font-size:20px;text-align:center;margin-bottom:4px}
      h2{color:${ACCENT};font-size:15px;margin:18px 0 8px;border-bottom:2px solid ${ACCENT};padding-bottom:4px}
      .sub{text-align:center;color:#666;font-size:13px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;margin-bottom:12px}
      .total-row td{font-weight:700;border-top:2px solid #333;padding-top:6px}
      .highlight{background:#f0fdfa;font-weight:700;font-size:15px}
      @media print{body{padding:20px}}</style></head><body>
      <h1>${escapeHtml(clinic)}</h1>
      <div class="sub">利得稅計算表 &mdash; 課稅年度 ${taxYear}</div>
      <h2>一、應評稅收入</h2>
      <table>${svcRows}<tr class="total-row"><td style="padding:4px 12px">收入合計</td><td style="padding:4px 12px;text-align:right">${fmtM(revenueBreakdown.total)}</td></tr></table>
      <h2>二、可扣除支出</h2>
      <table>${dedRows}<tr class="total-row"><td style="padding:4px 12px">支出合計</td><td style="padding:4px 12px;text-align:right">${fmtM(deductions._total)}</td></tr></table>
      ${addBackAdj ? `<h2>三、稅務調整</h2><table><tr><td style="padding:4px 12px">加回不可扣除項目</td><td style="padding:4px 12px;text-align:right">+${fmtM(addBackAdj)}</td></tr><tr><td style="padding:4px 12px">額外扣減</td><td style="padding:4px 12px;text-align:right">-${fmtM(extraDeductAdj)}</td></tr></table>` : ''}
      <h2>${addBackAdj ? '四' : '三'}、應評稅利潤</h2>
      <table><tr class="highlight"><td style="padding:8px 12px">應評稅利潤</td><td style="padding:8px 12px;text-align:right">${fmtM(assessableProfit)}</td></tr></table>
      <h2>${addBackAdj ? '五' : '四'}、利得稅估算</h2>
      <table>
        <tr><td style="padding:4px 12px">首 $2,000,000 (8.25%)</td><td style="padding:4px 12px;text-align:right">${fmtM(Math.min(Math.max(assessableProfit, 0), 2000000) * 0.0825)}</td></tr>
        <tr><td style="padding:4px 12px">超出部分 (16.5%)</td><td style="padding:4px 12px;text-align:right">${fmtM(assessableProfit > 2000000 ? (assessableProfit - 2000000) * 0.165 : 0)}</td></tr>
        <tr class="total-row highlight"><td style="padding:8px 12px">應繳稅款</td><td style="padding:8px 12px;text-align:right">${fmtM(taxPayable)}</td></tr>
      </table>
      <div style="margin-top:30px;font-size:11px;color:#999;text-align:center">此表僅供參考，最終稅務責任請諮詢註冊會計師 &mdash; ${escapeHtml(clinic)} 管理系統自動生成</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const tabs = [
    { key: 'summary', label: '稅務摘要' },
    { key: 'quarterly', label: '季度撥備' },
    { key: 'schedules', label: '附表明細' },
  ];

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: ACCENT }}>稅務報告 (利得稅)</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={taxYear} onChange={e => setTaxYear(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14 }}>
            {TAX_YEARS.map(y => <option key={y} value={y}>課稅年度 {y}</option>)}
          </select>
          <button onClick={handlePrint} style={btn}>列印稅務計算表</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 18, borderBottom: `2px solid #e5e7eb` }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '9px 20px', border: 'none', background: tab === t.key ? ACCENT : 'transparent', color: tab === t.key ? '#fff' : '#555', fontWeight: 600, fontSize: 14, cursor: 'pointer', borderRadius: '6px 6px 0 0' }}>{t.label}</button>
        ))}
      </div>

      {/* ═══ Tab: Summary ═══ */}
      {tab === 'summary' && <>
        {/* Revenue */}
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', color: ACCENT, fontSize: 15 }}>一、應評稅收入</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>服務類型</th><th style={{ ...th, textAlign: 'right' }}>金額</th><th style={{ ...th, textAlign: 'right' }}>佔比</th></tr></thead>
            <tbody>
              {Object.entries(revenueBreakdown.byService).sort((a, b) => b[1] - a[1]).map(([svc, amt]) => (
                <tr key={svc}><td style={td}>{svc}</td><td style={tdR}>{fmtM(amt)}</td><td style={tdR}>{revenueBreakdown.total ? (amt / revenueBreakdown.total * 100).toFixed(1) + '%' : '-'}</td></tr>
              ))}
              <tr style={{ fontWeight: 700 }}><td style={{ ...td, borderTop: `2px solid ${ACCENT}` }}>收入合計 ({revenueBreakdown.count} 筆)</td><td style={{ ...tdR, borderTop: `2px solid ${ACCENT}` }}>{fmtM(revenueBreakdown.total)}</td><td style={{ ...tdR, borderTop: `2px solid ${ACCENT}` }}>100%</td></tr>
            </tbody>
          </table>
        </div>

        {/* Deductions */}
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', color: ACCENT, fontSize: 15 }}>二、可扣除支出</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>類別</th><th style={{ ...th, textAlign: 'right' }}>金額</th><th style={{ ...th, textAlign: 'right' }}>佔比</th></tr></thead>
            <tbody>
              {DEDUCTION_CATS.map(dc => (
                <tr key={dc.key}><td style={td}>{dc.label}</td><td style={tdR}>{fmtM(deductions[dc.key])}</td><td style={tdR}>{deductions._total ? (deductions[dc.key] / deductions._total * 100).toFixed(1) + '%' : '-'}</td></tr>
              ))}
              <tr style={{ fontWeight: 700 }}><td style={{ ...td, borderTop: `2px solid ${ACCENT}` }}>支出合計</td><td style={{ ...tdR, borderTop: `2px solid ${ACCENT}` }}>{fmtM(deductions._total)}</td><td style={{ ...tdR, borderTop: `2px solid ${ACCENT}` }}>100%</td></tr>
            </tbody>
          </table>
        </div>

        {/* Adjustments */}
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', color: ACCENT, fontSize: 15 }}>三、稅務調整（手動）</h3>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13 }}>加回不可扣除項目
              <input type="number" value={yearAdj.addBack || ''} onChange={e => setYearAdj('addBack', e.target.value)} placeholder="0" style={{ display: 'block', marginTop: 4, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, width: 160, fontSize: 14 }} />
            </label>
            <label style={{ fontSize: 13 }}>額外扣減（如研發開支）
              <input type="number" value={yearAdj.extraDeduct || ''} onChange={e => setYearAdj('extraDeduct', e.target.value)} placeholder="0" style={{ display: 'block', marginTop: 4, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6, width: 160, fontSize: 14 }} />
            </label>
          </div>
        </div>

        {/* Profit Computation */}
        <div style={{ ...card, background: assessableProfit >= 0 ? '#f0fdfa' : '#fef2f2' }}>
          <h3 style={{ margin: '0 0 10px', color: ACCENT, fontSize: 15 }}>四、應評稅利潤計算</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={td}>收入合計</td><td style={tdR}>{fmtM(revenueBreakdown.total)}</td></tr>
              <tr><td style={td}>減：可扣除支出</td><td style={{ ...tdR, color: '#dc2626' }}>({fmtM(deductions._total)})</td></tr>
              {addBackAdj > 0 && <tr><td style={td}>加：不可扣除項目加回</td><td style={tdR}>{fmtM(addBackAdj)}</td></tr>}
              {extraDeductAdj > 0 && <tr><td style={td}>減：額外扣減</td><td style={{ ...tdR, color: '#dc2626' }}>({fmtM(extraDeductAdj)})</td></tr>}
              <tr style={{ fontWeight: 700, fontSize: 15 }}>
                <td style={{ ...td, borderTop: `2px solid ${ACCENT}` }}>應評稅利潤</td>
                <td style={{ ...tdR, borderTop: `2px solid ${ACCENT}`, color: assessableProfit >= 0 ? ACCENT : '#dc2626' }}>{fmtM(assessableProfit)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Tax Estimation */}
        <div style={{ ...card, border: `2px solid ${ACCENT}` }}>
          <h3 style={{ margin: '0 0 10px', color: ACCENT, fontSize: 15 }}>五、利得稅估算（兩級制）</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={td}>首 HK$2,000,000 @ 8.25%</td><td style={tdR}>{fmtM(Math.min(Math.max(assessableProfit, 0), 2000000) * 0.0825)}</td></tr>
              <tr><td style={td}>超出部分 @ 16.5%</td><td style={tdR}>{fmtM(assessableProfit > 2000000 ? (assessableProfit - 2000000) * 0.165 : 0)}</td></tr>
              <tr style={{ fontWeight: 700, fontSize: 16 }}>
                <td style={{ ...td, borderTop: `2px solid ${ACCENT}` }}>估計應繳稅款</td>
                <td style={{ ...tdR, borderTop: `2px solid ${ACCENT}`, color: ACCENT }}>{fmtM(taxPayable)}</td>
              </tr>
              <tr><td style={{ ...td, color: '#666' }}>有效稅率</td><td style={tdR}>{assessableProfit > 0 ? (taxPayable / assessableProfit * 100).toFixed(2) + '%' : '-'}</td></tr>
            </tbody>
          </table>
          {assessableProfit <= 0 && <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef3c7', borderRadius: 6, fontSize: 13, color: '#92400e' }}>本年度無應評稅利潤，毋須繳納利得稅。</div>}
        </div>
      </>}

      {/* ═══ Tab: Quarterly Provision ═══ */}
      {tab === 'quarterly' && <>
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', color: ACCENT, fontSize: 15 }}>季度稅款撥備建議</h3>
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>建議每季預留以下金額，以備年度繳稅之用：</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>季度</th><th style={{ ...th, textAlign: 'right' }}>季度收入</th><th style={{ ...th, textAlign: 'right' }}>季度支出</th><th style={{ ...th, textAlign: 'right' }}>建議撥備</th></tr></thead>
            <tbody>
              {quarters.map(q => {
                const qRev = q.months.reduce((s, m) => s + (monthlyRevenue[m] || 0), 0);
                const qExp = q.months.reduce((s, m) => s + (monthlyExpenses[m] || 0), 0);
                return (
                  <tr key={q.label}>
                    <td style={td}>{q.label}</td>
                    <td style={tdR}>{fmtM(qRev)}</td>
                    <td style={tdR}>{fmtM(qExp)}</td>
                    <td style={{ ...tdR, fontWeight: 700, color: ACCENT }}>{fmtM(quarterlyProvision)}</td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 700 }}>
                <td style={{ ...td, borderTop: `2px solid ${ACCENT}` }}>全年合計</td>
                <td style={{ ...tdR, borderTop: `2px solid ${ACCENT}` }}>{fmtM(revenueBreakdown.total)}</td>
                <td style={{ ...tdR, borderTop: `2px solid ${ACCENT}` }}>{fmtM(deductions._total)}</td>
                <td style={{ ...tdR, borderTop: `2px solid ${ACCENT}`, color: ACCENT }}>{fmtM(taxPayable)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ ...card, background: '#f0fdfa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, color: '#666' }}>每季建議撥備</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: ACCENT }}>{fmtM(quarterlyProvision)}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#666' }}>全年估計稅款</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: ACCENT }}>{fmtM(taxPayable)}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#666' }}>應評稅利潤</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: assessableProfit >= 0 ? ACCENT : '#dc2626' }}>{fmtM(assessableProfit)}</div>
            </div>
          </div>
        </div>
      </>}

      {/* ═══ Tab: Supporting Schedules ═══ */}
      {tab === 'schedules' && <>
        {/* Rent Schedule */}
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', color: ACCENT, fontSize: 15 }}>附表一：租金明細</h3>
          {schedules.rent.length === 0 ? <p style={{ color: '#999', fontSize: 13 }}>本年度無租金記錄</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>日期</th><th style={th}>類別</th><th style={th}>商戶/備註</th><th style={{ ...th, textAlign: 'right' }}>金額</th></tr></thead>
              <tbody>
                {schedules.rent.sort((a, b) => a.date.localeCompare(b.date)).map((r, i) => (
                  <tr key={i}><td style={td}>{r.date}</td><td style={td}>{r.category}</td><td style={td}>{r.merchant || r.desc || '-'}</td><td style={tdR}>{fmtM(Number(r.amount))}</td></tr>
                ))}
                <tr style={{ fontWeight: 700 }}><td colSpan={3} style={{ ...td, borderTop: `2px solid ${ACCENT}` }}>合計</td><td style={{ ...tdR, borderTop: `2px solid ${ACCENT}` }}>{fmtM(schedules.rent.reduce((s, r) => s + Number(r.amount), 0))}</td></tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Salary Schedule */}
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', color: ACCENT, fontSize: 15 }}>附表二：薪酬及 MPF 明細</h3>
          {schedules.salary.length === 0 ? <p style={{ color: '#999', fontSize: 13 }}>本年度無薪酬記錄</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>日期</th><th style={th}>類別</th><th style={th}>備註</th><th style={{ ...th, textAlign: 'right' }}>金額</th></tr></thead>
              <tbody>
                {schedules.salary.sort((a, b) => a.date.localeCompare(b.date)).map((r, i) => (
                  <tr key={i}><td style={td}>{r.date}</td><td style={td}>{r.category}</td><td style={td}>{r.merchant || r.desc || '-'}</td><td style={tdR}>{fmtM(Number(r.amount))}</td></tr>
                ))}
                <tr style={{ fontWeight: 700 }}><td colSpan={3} style={{ ...td, borderTop: `2px solid ${ACCENT}` }}>合計</td><td style={{ ...tdR, borderTop: `2px solid ${ACCENT}` }}>{fmtM(schedules.salary.reduce((s, r) => s + Number(r.amount), 0))}</td></tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Depreciation Schedule */}
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', color: ACCENT, fontSize: 15 }}>附表三：折舊及資本開支明細</h3>
          {schedules.depreciation.length === 0 ? <p style={{ color: '#999', fontSize: 13 }}>本年度無資本開支記錄</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>日期</th><th style={th}>類別</th><th style={th}>項目</th><th style={{ ...th, textAlign: 'right' }}>金額</th></tr></thead>
              <tbody>
                {schedules.depreciation.sort((a, b) => a.date.localeCompare(b.date)).map((r, i) => (
                  <tr key={i}><td style={td}>{r.date}</td><td style={td}>{r.category}</td><td style={td}>{r.merchant || r.desc || '-'}</td><td style={tdR}>{fmtM(Number(r.amount))}</td></tr>
                ))}
                <tr style={{ fontWeight: 700 }}><td colSpan={3} style={{ ...td, borderTop: `2px solid ${ACCENT}` }}>合計</td><td style={{ ...tdR, borderTop: `2px solid ${ACCENT}` }}>{fmtM(schedules.depreciation.reduce((s, r) => s + Number(r.amount), 0))}</td></tr>
              </tbody>
            </table>
          )}
        </div>
      </>}

      <div style={{ textAlign: 'center', color: '#999', fontSize: 12, marginTop: 20 }}>此報告僅供內部參考，正式報稅請諮詢註冊會計師</div>
    </div>
  );
}
