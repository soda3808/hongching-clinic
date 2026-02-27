import { useState, useMemo, lazy, Suspense } from 'react';
import { fmtM, fmt, getMonth, monthLabel, EXPENSE_CATEGORIES, DOCTORS, linearRegression } from '../data';
import { getClinicName, getClinicNameEn, getTenantStoreNames } from '../tenant';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

// Lazy-loaded sub-reports for code splitting
const DoctorConsultRate = lazy(() => import('./reports/DoctorConsultRate'));
const PrescriptionStats = lazy(() => import('./reports/PrescriptionStats'));
const PatientAgeReport = lazy(() => import('./reports/PatientAgeReport'));
const RegistrationStats = lazy(() => import('./reports/RegistrationStats'));
const TreatmentReport = lazy(() => import('./reports/TreatmentReport'));
const PatientRxSummary = lazy(() => import('./reports/PatientRxSummary'));
const ServiceUsageReport = lazy(() => import('./reports/ServiceUsageReport'));
const PaymentMethodReport = lazy(() => import('./reports/PaymentMethodReport'));
const PackageReport = lazy(() => import('./reports/PackageReport'));
const KPIDashboard = lazy(() => import('./reports/KPIDashboard'));
const DrugSafetyReport = lazy(() => import('./reports/DrugSafetyReport'));
const ClinicalAnalytics = lazy(() => import('./reports/ClinicalAnalytics'));
const HerbAnalytics = lazy(() => import('./reports/HerbAnalytics'));
const ProfitLoss = lazy(() => import('./reports/ProfitLoss'));
const QueueAnalytics = lazy(() => import('./reports/QueueAnalytics'));
const InventoryForecast = lazy(() => import('./reports/InventoryForecast'));
const RetentionAnalytics = lazy(() => import('./reports/RetentionAnalytics'));
const TreatmentOutcome = lazy(() => import('./reports/TreatmentOutcome'));
const StaffPerformance = lazy(() => import('./reports/StaffPerformance'));
const AgingReport = lazy(() => import('./reports/AgingReport'));
const SatisfactionReport = lazy(() => import('./reports/SatisfactionReport'));
const ReferralAnalytics = lazy(() => import('./reports/ReferralAnalytics'));
const NoShowAnalytics = lazy(() => import('./reports/NoShowAnalytics'));
const VisitHeatmap = lazy(() => import('./reports/VisitHeatmap'));
const BranchComparison = lazy(() => import('./reports/BranchComparison'));
const StaffKPIReport = lazy(() => import('./reports/StaffKPIReport'));
const TreatmentProgress = lazy(() => import('./reports/TreatmentProgress'));
const CashFlowForecast = lazy(() => import('./reports/CashFlowForecast'));
const MonthlyExecutiveReport = lazy(() => import('./reports/MonthlyExecutiveReport'));

const ReportLoader = () => (
  <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)' }}>
    <div style={{ fontSize: 24, marginBottom: 8 }}>載入中...</div>
  </div>
);

const COLORS = ['#0e7490', '#16a34a', '#DAA520', '#dc2626', '#7C3AED', '#0284c7'];

const REPORT_GROUPS = [
  { label: '財務', tabs: [
    { id: 'monthly', icon: '📅', label: '月結報表' },
    { id: 'pnl', icon: '💹', label: '損益表' },
    { id: 'aging', icon: '📑', label: '帳齡分析' },
    { id: 'tax', icon: '🏛️', label: '稅務/年結' },
    { id: 'yoy', icon: '📊', label: '按年比較' },
    { id: 'forecast', icon: '📈', label: '營業預測' },
    { id: 'paymethod', icon: '💳', label: '付款方式' },
    { id: 'kpi', icon: '🎯', label: '系統KPI' },
    { id: 'branch', icon: '🏢', label: '分店比較' },
    { id: 'cashflow', icon: '💰', label: '現金流預測' },
    { id: 'executive', icon: '📋', label: '管理報告' },
  ]},
  { label: '醫師', tabs: [
    { id: 'doctor', icon: '👨‍⚕️', label: '醫師績效' },
    { id: 'consultrate', icon: '📋', label: '診症率' },
    { id: 'staffperf', icon: '👥', label: '員工績效' },
    { id: 'staffkpi', icon: '🏆', label: 'KPI 總覽' },
  ]},
  { label: '病人', tabs: [
    { id: 'patient', icon: '👥', label: '病人分析' },
    { id: 'retention', icon: '📊', label: '留存分析' },
    { id: 'age', icon: '📊', label: '年齡統計' },
    { id: 'regstats', icon: '🎫', label: '掛號統計' },
    { id: 'treatment', icon: '💉', label: '治療項目' },
    { id: 'outcome', icon: '🎯', label: '治療成效' },
    { id: 'satisfaction', icon: '😊', label: '滿意度' },
    { id: 'referral', icon: '🔗', label: '轉介分析' },
    { id: 'noshow', icon: '❌', label: '缺席分析' },
    { id: 'heatmap', icon: '🗓️', label: '熱度圖' },
    { id: 'progress', icon: '📈', label: '治療進度' },
    { id: 'rxsummary', icon: '📜', label: '處方報表' },
  ]},
  { label: '營運', tabs: [
    { id: 'clinical', icon: '📊', label: '臨床分析' },
    { id: 'rxstats', icon: '💊', label: '藥物處方' },
    { id: 'herbanalytics', icon: '🌿', label: '藥材分析' },
    { id: 'invforecast', icon: '📦', label: '庫存預測' },
    { id: 'queueanalytics', icon: '🎫', label: '排隊分析' },
    { id: 'drugsafety', icon: '⚠️', label: '藥物安全量' },
    { id: 'serviceusage', icon: '🔧', label: '服務頻率' },
    { id: 'packagereport', icon: '🎫', label: '醫療計劃' },
    { id: 'close', icon: '✅', label: '月結對帳' },
  ]},
];

export default function Reports({ data }) {
  const [reportType, setReportType] = useState('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [selectedStore, setSelectedStore] = useState('all');
  const [doctorTarget, setDoctorTarget] = useState(80000);

  const months = useMemo(() => {
    const m = new Set();
    data.revenue.forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    data.expenses.forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    return [...m].sort();
  }, [data]);

  const filterStore = (list) => {
    if (selectedStore === 'all') return list;
    return list.filter(r => r.store === selectedStore || r.store === '兩店共用');
  };

  // ── MONTHLY REPORT ──
  const MonthlyReport = () => {
    const rev = filterStore(data.revenue.filter(r => getMonth(r.date) === selectedMonth));
    const exp = filterStore(data.expenses.filter(r => getMonth(r.date) === selectedMonth));
    const totalRev = rev.reduce((s, r) => s + Number(r.amount), 0);
    const totalExp = exp.reduce((s, r) => s + Number(r.amount), 0);
    const net = totalRev - totalExp;

    // Revenue by doctor
    const byDoctor = {};
    rev.forEach(r => { byDoctor[r.doctor] = (byDoctor[r.doctor] || 0) + Number(r.amount); });

    // Revenue by payment method
    const byPayment = {};
    rev.forEach(r => { byPayment[r.payment] = (byPayment[r.payment] || 0) + Number(r.amount); });

    // Expense by category group
    const byCatGroup = {};
    Object.entries(EXPENSE_CATEGORIES).forEach(([group, cats]) => {
      const total = exp.filter(r => cats.includes(r.category)).reduce((s, r) => s + Number(r.amount), 0);
      if (total > 0) byCatGroup[group] = { total, items: {} };
      if (byCatGroup[group]) {
        cats.forEach(cat => {
          const catTotal = exp.filter(r => r.category === cat).reduce((s, r) => s + Number(r.amount), 0);
          if (catTotal > 0) byCatGroup[group].items[cat] = catTotal;
        });
      }
    });

    const patientCount = rev.filter(r => !r.name.includes('匯總')).length;

    return (
      <div className="card" id="monthlyReport">
        <div style={{ borderBottom: '3px solid var(--teal-700)', paddingBottom: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal-700)' }}>{getClinicName()}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{getClinicNameEn().toUpperCase()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>月結報表</div>
            <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>{monthLabel(selectedMonth)} | {selectedStore === 'all' ? '全店合計' : selectedStore}</div>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card gold"><div className="stat-label">營業額</div><div className="stat-value gold">{fmtM(totalRev)}</div></div>
          <div className="stat-card red"><div className="stat-label">總開支</div><div className="stat-value red">{fmtM(totalExp)}</div></div>
          <div className="stat-card" style={{ borderLeft: `4px solid ${net >= 0 ? 'var(--green-600)' : 'var(--red-500)'}` }}>
            <div className="stat-label">淨利潤</div>
            <div className="stat-value" style={{ color: net >= 0 ? 'var(--green-700)' : 'var(--red-600)' }}>{fmtM(net)}</div>
            <div className="stat-sub">利潤率 {totalRev ? (net/totalRev*100).toFixed(1) : 0}%</div>
          </div>
          <div className="stat-card teal"><div className="stat-label">診症人次</div><div className="stat-value teal">{patientCount}</div></div>
        </div>

        {/* Revenue by Doctor */}
        <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>📊 營業額 — 按醫師</h4>
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead><tr><th>醫師</th><th style={{ textAlign: 'right' }}>營業額</th><th style={{ textAlign: 'right' }}>佔比</th></tr></thead>
            <tbody>
              {Object.entries(byDoctor).sort((a, b) => b[1] - a[1]).map(([doc, amt]) => (
                <tr key={doc}><td style={{ fontWeight: 600 }}>{doc}</td><td className="money" style={{ color: 'var(--gold-700)' }}>{fmtM(amt)}</td><td className="money">{totalRev ? (amt/totalRev*100).toFixed(1) : 0}%</td></tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--gray-300)', background: 'var(--gray-50)' }}>
                <td>合計</td><td className="money" style={{ color: 'var(--gold-700)' }}>{fmtM(totalRev)}</td><td className="money">100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Revenue by Payment */}
        <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>💳 營業額 — 按付款方式</h4>
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead><tr><th>付款方式</th><th style={{ textAlign: 'right' }}>金額</th><th style={{ textAlign: 'right' }}>佔比</th></tr></thead>
            <tbody>
              {Object.entries(byPayment).sort((a, b) => b[1] - a[1]).map(([pay, amt]) => (
                <tr key={pay}><td>{pay}</td><td className="money">{fmtM(amt)}</td><td className="money">{totalRev ? (amt/totalRev*100).toFixed(1) : 0}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Expenses by Category Group */}
        <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>🧾 開支明細 — 按類別</h4>
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead><tr><th>類別</th><th style={{ textAlign: 'right' }}>金額</th><th style={{ textAlign: 'right' }}>佔比</th></tr></thead>
            <tbody>
              {Object.entries(byCatGroup).map(([group, { total, items }]) => (
                <>
                  <tr key={group} style={{ background: 'var(--gray-50)', fontWeight: 700 }}>
                    <td>{group}</td><td className="money" style={{ color: 'var(--red-600)' }}>{fmtM(total)}</td><td className="money">{(total/totalExp*100).toFixed(1)}%</td>
                  </tr>
                  {Object.entries(items).map(([cat, amt]) => (
                    <tr key={cat}><td style={{ paddingLeft: 24, color: 'var(--gray-500)' }}>{cat}</td><td className="money">{fmtM(amt)}</td><td className="money">{(amt/totalExp*100).toFixed(1)}%</td></tr>
                  ))}
                </>
              ))}
              <tr style={{ fontWeight: 800, borderTop: '2px solid var(--gray-300)', background: 'var(--gray-100)' }}>
                <td>總開支</td><td className="money" style={{ color: 'var(--red-600)' }}>{fmtM(totalExp)}</td><td className="money">100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 10, color: 'var(--gray-400)', textAlign: 'right', marginTop: 16 }}>
          報表生成時間: {new Date().toLocaleString('zh-HK')} | {getClinicName()}
        </div>
      </div>
    );
  };

  // ── TAX / ANNUAL REPORT ──
  const TaxReport = () => {
    const rev = filterStore(data.revenue);
    const exp = filterStore(data.expenses);
    const totalRev = rev.reduce((s, r) => s + Number(r.amount), 0);
    const totalExp = exp.reduce((s, r) => s + Number(r.amount), 0);
    const net = totalRev - totalExp;

    // Group expenses for tax
    const taxDeductible = {};
    exp.forEach(r => { taxDeductible[r.category] = (taxDeductible[r.category] || 0) + Number(r.amount); });

    // Salary expenses
    const salaryExp = exp.filter(r => r.category === '人工').reduce((s, r) => s + Number(r.amount), 0);
    const mpfExp = exp.filter(r => r.category === 'MPF').reduce((s, r) => s + Number(r.amount), 0);
    const rentExp = exp.filter(r => r.category === '租金').reduce((s, r) => s + Number(r.amount), 0);

    return (
      <div className="card">
        <div style={{ borderBottom: '3px solid var(--gold-700)', paddingBottom: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold-700)' }}>{getClinicName()}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>稅務年結摘要</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>利得稅計算表</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{months[0] ? monthLabel(months[0]) : ''} 至 {months.length ? monthLabel(months[months.length-1]) : ''}</div>
          </div>
        </div>

        <div className="table-wrap" style={{ marginBottom: 20 }}>
          <table className="pl-table">
            <thead><tr><th style={{ textAlign: 'left' }}>項目</th><th>金額</th><th>備註</th></tr></thead>
            <tbody>
              <tr style={{ fontWeight: 700 }}><td>營業收入</td><td className="money" style={{ color: 'var(--gold-700)' }}>{fmtM(totalRev)}</td><td style={{ textAlign: 'right', color: 'var(--gray-400)', fontSize: 11 }}>{months.length}個月</td></tr>
              <tr style={{ background: 'var(--gray-50)' }}><td colSpan={3} style={{ fontWeight: 700, textAlign: 'left' }}>減：可扣除開支</td></tr>
              <tr><td style={{ paddingLeft: 24 }}>員工薪酬</td><td className="money">{fmtM(salaryExp)}</td><td style={{ textAlign: 'right', color: 'var(--gray-400)', fontSize: 11 }}>S.16(1)</td></tr>
              <tr><td style={{ paddingLeft: 24 }}>強積金供款</td><td className="money">{fmtM(mpfExp)}</td><td style={{ textAlign: 'right', color: 'var(--gray-400)', fontSize: 11 }}>S.16(1)</td></tr>
              <tr><td style={{ paddingLeft: 24 }}>租金</td><td className="money">{fmtM(rentExp)}</td><td style={{ textAlign: 'right', color: 'var(--gray-400)', fontSize: 11 }}>S.16(1)</td></tr>
              {Object.entries(taxDeductible).filter(([cat]) => !['人工','MPF','租金'].includes(cat)).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => (
                <tr key={cat}><td style={{ paddingLeft: 24 }}>{cat}</td><td className="money">{fmtM(amt)}</td><td></td></tr>
              ))}
              <tr className="subtotal-row"><td>可扣除開支合計</td><td className="money" style={{ color: 'var(--red-600)' }}>{fmtM(totalExp)}</td><td></td></tr>
              <tr className="total-row">
                <td style={{ fontSize: 14 }}>應評稅利潤</td>
                <td className="money" style={{ color: net >= 0 ? 'var(--green-700)' : 'var(--red-600)', fontSize: 16 }}>{fmtM(net)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Tax Estimate */}
        <div className="card card-flat" style={{ background: 'var(--gold-50)', border: '1px solid var(--gold-100)' }}>
          <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>💰 利得稅估算 (兩級制)</h4>
          <div style={{ fontSize: 13 }}>
            {net <= 0 ? (
              <div style={{ color: 'var(--green-700)', fontWeight: 600 }}>本期虧損，無需繳稅</div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>首 $2,000,000 × 8.25%</span>
                  <span style={{ fontWeight: 600 }}>{fmtM(Math.min(net, 2000000) * 0.0825)}</span>
                </div>
                {net > 2000000 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span>餘額 {fmtM(net - 2000000)} × 16.5%</span>
                    <span style={{ fontWeight: 600 }}>{fmtM((net - 2000000) * 0.165)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 800, borderTop: '1px solid var(--gold-500)', marginTop: 4 }}>
                  <span>預計稅款</span>
                  <span style={{ color: 'var(--red-600)', fontSize: 16 }}>{fmtM(
                    Math.min(net, 2000000) * 0.0825 + Math.max(net - 2000000, 0) * 0.165
                  )}</span>
                </div>
              </>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 8 }}>
            * 此為簡化估算，實際稅務情況請諮詢會計師。未包括折舊免稅額、虧損結轉等。
          </div>
        </div>

        <div style={{ fontSize: 10, color: 'var(--gray-400)', textAlign: 'right', marginTop: 16 }}>
          生成時間: {new Date().toLocaleString('zh-HK')} | 僅供參考，非正式稅務文件
        </div>
      </div>
    );
  };

  // ── YOY COMPARISON (按年比較) ──
  const YoYReport = () => {
    const rev = filterStore(data.revenue);
    const monthlyTotals = {};
    rev.forEach(r => {
      const m = getMonth(r.date);
      if (m) monthlyTotals[m] = (monthlyTotals[m] || 0) + Number(r.amount);
    });
    const sorted = Object.entries(monthlyTotals).sort((a, b) => a[0].localeCompare(b[0]));
    const tableData = sorted.map(([m, total], i) => {
      const prev = i > 0 ? sorted[i - 1][1] : null;
      const growth = prev !== null ? ((total - prev) / prev * 100) : null;
      return { month: m, revenue: total, prevRevenue: prev, growth };
    });
    const chartData = sorted.map(([m, total]) => ({ name: monthLabel(m), revenue: total }));

    return (
      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>📊 按月營業額比較</h3>
        <div style={{ width: '100%', height: 300, marginBottom: 24 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmtM(v)} />
              <Bar dataKey="revenue" name="營業額" fill={COLORS[0]} radius={[4,4,0,0]}>
                {chartData.map((_, i) => {
                  const row = tableData[i];
                  const isNeg = row && row.growth !== null && row.growth < 0;
                  return <Cell key={i} fill={isNeg ? COLORS[3] : COLORS[0]} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>月份</th><th style={{ textAlign: 'right' }}>營業額</th><th style={{ textAlign: 'right' }}>上月營業額</th><th style={{ textAlign: 'right' }}>按月增長 %</th></tr>
            </thead>
            <tbody>
              {tableData.map(row => (
                <tr key={row.month}>
                  <td style={{ fontWeight: 600 }}>{monthLabel(row.month)}</td>
                  <td className="money" style={{ color: 'var(--gold-700)' }}>{fmtM(row.revenue)}</td>
                  <td className="money">{row.prevRevenue !== null ? fmtM(row.prevRevenue) : '—'}</td>
                  <td className="money" style={{ color: row.growth !== null && row.growth < 0 ? 'var(--red-600)' : 'var(--green-700)', fontWeight: 600 }}>
                    {row.growth !== null ? `${row.growth >= 0 ? '+' : ''}${row.growth.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── DOCTOR PERFORMANCE (醫師績效) ──
  const DoctorReport = () => {
    const rev = filterStore(data.revenue.filter(r => getMonth(r.date) === selectedMonth));
    const byDoctor = {};
    rev.forEach(r => {
      const doc = r.doctor;
      if (!byDoctor[doc]) byDoctor[doc] = { revenue: 0, count: 0 };
      byDoctor[doc].revenue += Number(r.amount);
      if (!r.name.includes('匯總')) byDoctor[doc].count += 1;
    });
    const totalRev = rev.reduce((s, r) => s + Number(r.amount), 0);
    const rows = Object.entries(byDoctor).sort((a, b) => b[1].revenue - a[1].revenue).map(([doc, d]) => ({
      doctor: doc, revenue: d.revenue, count: d.count,
      avg: d.count > 0 ? d.revenue / d.count : 0,
      share: totalRev > 0 ? (d.revenue / totalRev * 100) : 0,
    }));
    const chartData = rows.map(r => ({ name: r.doctor, revenue: r.revenue }));

    return (
      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 12 }}>👨‍⚕️ 醫師績效 — {monthLabel(selectedMonth)}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>月度目標:</label>
          <input type="number" value={doctorTarget} onChange={e => setDoctorTarget(Number(e.target.value))}
            style={{ width: 120, padding: '4px 8px', border: '1px solid var(--gray-300)', borderRadius: 6 }} />
        </div>

        <div style={{ width: '100%', height: 260, marginBottom: 24 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" fontSize={11} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <YAxis dataKey="name" type="category" fontSize={12} width={70} />
              <Tooltip formatter={v => fmtM(v)} />
              <Bar dataKey="revenue" name="營業額" radius={[0,4,4,0]}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr><th>醫師</th><th style={{ textAlign: 'right' }}>營業額</th><th style={{ textAlign: 'right' }}>人次</th><th style={{ textAlign: 'right' }}>平均單價</th><th style={{ textAlign: 'right' }}>佔比</th><th style={{ width: 160 }}>目標進度</th></tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const pct = Math.min((r.revenue / doctorTarget) * 100, 100);
                return (
                  <tr key={r.doctor}>
                    <td style={{ fontWeight: 600 }}>{r.doctor}</td>
                    <td className="money" style={{ color: 'var(--gold-700)' }}>{fmtM(r.revenue)}</td>
                    <td className="money">{r.count}</td>
                    <td className="money">{fmtM(r.avg)}</td>
                    <td className="money">{r.share.toFixed(1)}%</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 8, background: 'var(--gray-200)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--green-600)' : 'var(--teal-600)', borderRadius: 4, transition: 'width .3s' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: pct >= 100 ? 'var(--green-700)' : 'var(--gray-500)', minWidth: 38, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── PATIENT ANALYTICS (病人分析) ──
  const PatientReport = () => {
    const patients = data.patients || [];
    const totalPatients = patients.length;
    const newThisMonth = patients.filter(p => getMonth(p.firstVisit) === selectedMonth).length;
    const returning = patients.filter(p => p.totalVisits > 1).length;
    const returningRate = totalPatients > 0 ? (returning / totalPatients * 100) : 0;
    const avgVisits = totalPatients > 0 ? (patients.reduce((s, p) => s + (p.totalVisits || 0), 0) / totalPatients) : 0;

    // Top 10 spenders
    const topSpenders = [...patients].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, 10);

    // Visit frequency distribution
    const freqBuckets = { '1次': 0, '2-3次': 0, '4-5次': 0, '6次+': 0 };
    patients.forEach(p => {
      const v = p.totalVisits || 0;
      if (v <= 1) freqBuckets['1次']++;
      else if (v <= 3) freqBuckets['2-3次']++;
      else if (v <= 5) freqBuckets['4-5次']++;
      else freqBuckets['6次+']++;
    });
    const freqData = Object.entries(freqBuckets).map(([name, count]) => ({ name, count }));

    // New vs Returning by month
    const newRetByMonth = {};
    months.forEach(m => { newRetByMonth[m] = { newP: 0, retP: 0 }; });
    // For each revenue record, check if the patient's firstVisit month matches
    data.revenue.forEach(r => {
      const m = getMonth(r.date);
      if (!m || !newRetByMonth[m]) return;
      const pt = patients.find(p => p.name === r.name);
      if (!pt) return;
      if (getMonth(pt.firstVisit) === m) newRetByMonth[m].newP++;
      else newRetByMonth[m].retP++;
    });
    const newRetData = months.map(m => ({ name: monthLabel(m), '新症': newRetByMonth[m]?.newP || 0, '覆診': newRetByMonth[m]?.retP || 0 }));

    return (
      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>👥 病人分析</h3>

        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card teal"><div className="stat-label">總病人數</div><div className="stat-value teal">{totalPatients}</div></div>
          <div className="stat-card gold"><div className="stat-label">本月新症</div><div className="stat-value gold">{newThisMonth}</div></div>
          <div className="stat-card"><div className="stat-label">覆診率</div><div className="stat-value" style={{ color: 'var(--green-700)' }}>{returningRate.toFixed(1)}%</div></div>
          <div className="stat-card"><div className="stat-label">平均到訪次數</div><div className="stat-value" style={{ color: 'var(--teal-700)' }}>{avgVisits.toFixed(1)}</div></div>
        </div>

        {/* Visit frequency chart */}
        <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>📊 到訪頻率分佈</h4>
        <div style={{ width: '100%', height: 240, marginBottom: 24 }}>
          <ResponsiveContainer>
            <BarChart data={freqData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="病人數" radius={[4,4,0,0]}>
                {freqData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top 10 spenders */}
        <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>🏆 消費排行 Top 10</h4>
        <div className="table-wrap" style={{ marginBottom: 20 }}>
          <table>
            <thead><tr><th>#</th><th>姓名</th><th style={{ textAlign: 'right' }}>總消費</th><th style={{ textAlign: 'right' }}>到訪次數</th><th style={{ textAlign: 'right' }}>平均單次</th><th>主診醫師</th></tr></thead>
            <tbody>
              {topSpenders.map((p, i) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700, color: i < 3 ? 'var(--gold-700)' : 'var(--gray-400)' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="money" style={{ color: 'var(--gold-700)' }}>{fmtM(p.totalSpent || 0)}</td>
                  <td className="money">{p.totalVisits || 0}</td>
                  <td className="money">{p.totalVisits ? fmtM((p.totalSpent || 0) / p.totalVisits) : '—'}</td>
                  <td>{p.doctor || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* New vs Returning by month */}
        <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>📈 新症 vs 覆診（按月）</h4>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={newRetData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="新症" fill={COLORS[1]} radius={[4,4,0,0]} />
              <Bar dataKey="覆診" fill={COLORS[0]} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  // ── REVENUE FORECAST (營業預測) ──
  const ForecastReport = () => {
    const rev = filterStore(data.revenue);
    const monthlyTotals = {};
    rev.forEach(r => {
      const m = getMonth(r.date);
      if (m) monthlyTotals[m] = (monthlyTotals[m] || 0) + Number(r.amount);
    });
    const sorted = Object.entries(monthlyTotals).sort((a, b) => a[0].localeCompare(b[0]));
    const points = sorted.map(([, total], i) => ({ x: i, y: total }));
    const { slope, intercept } = linearRegression(points);

    // Build actual data
    const actualData = sorted.map(([m, total], i) => ({
      name: monthLabel(m), actual: total, projected: null, month: m, idx: i,
    }));

    // Project 3 months forward
    const lastMonth = sorted.length > 0 ? sorted[sorted.length - 1][0] : new Date().toISOString().substring(0, 7);
    const projectedData = [];
    let pm = lastMonth;
    for (let j = 1; j <= 3; j++) {
      const [y, mo] = pm.split('-').map(Number);
      const nextMo = mo === 12 ? 1 : mo + 1;
      const nextY = mo === 12 ? y + 1 : y;
      pm = `${nextY}-${String(nextMo).padStart(2, '0')}`;
      const idx = sorted.length - 1 + j;
      const val = Math.max(0, slope * idx + intercept);
      projectedData.push({ name: monthLabel(pm), actual: null, projected: Math.round(val), month: pm, idx });
    }

    // Merge: for the bridge point, duplicate last actual as projected too
    const merged = [...actualData];
    if (merged.length > 0) {
      merged[merged.length - 1] = { ...merged[merged.length - 1], projected: merged[merged.length - 1].actual };
    }
    const chartData = [...merged, ...projectedData];

    return (
      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>📈 營業預測</h3>

        <div style={{ width: '100%', height: 320, marginBottom: 24 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => v !== null ? fmtM(v) : '—'} />
              <Legend />
              <Line type="monotone" dataKey="actual" name="實際營業額" stroke={COLORS[0]} strokeWidth={2} dot={{ r: 4 }} connectNulls={false} />
              <Line type="monotone" dataKey="projected" name="預測營業額" stroke={COLORS[2]} strokeWidth={2} strokeDasharray="8 4" dot={{ r: 4 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>🔮 未來三個月預測</h4>
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead><tr><th>月份</th><th style={{ textAlign: 'right' }}>預計營業額</th><th style={{ textAlign: 'right' }}>預計增長</th></tr></thead>
            <tbody>
              {projectedData.map((row, i) => {
                const prevVal = i === 0 ? (sorted.length > 0 ? sorted[sorted.length - 1][1] : 0) : projectedData[i - 1].projected;
                const growth = prevVal > 0 ? ((row.projected - prevVal) / prevVal * 100) : 0;
                return (
                  <tr key={row.month}>
                    <td style={{ fontWeight: 600 }}>{row.name}</td>
                    <td className="money" style={{ color: 'var(--gold-700)' }}>{fmtM(row.projected)}</td>
                    <td className="money" style={{ color: growth >= 0 ? 'var(--green-700)' : 'var(--red-600)' }}>
                      {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Budget vs Actual (#92) */}
        {(() => {
          const budgets = (() => { try { return JSON.parse(localStorage.getItem('hcmc_budgets') || '{}'); } catch { return {}; } })();
          const recentMonths = sorted.slice(-6);
          if (!recentMonths.length) return null;
          return (
            <>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8, marginTop: 16 }}>預算 vs 實際 (近6個月)</h4>
              <div className="table-wrap" style={{ marginBottom: 16 }}>
                <table>
                  <thead><tr><th>月份</th><th style={{ textAlign: 'right' }}>實際</th><th style={{ textAlign: 'right' }}>預算</th><th style={{ textAlign: 'right' }}>差異</th><th style={{ textAlign: 'right' }}>達成率</th></tr></thead>
                  <tbody>
                    {recentMonths.map(([m, actual]) => {
                      const budget = Number(budgets[m] || budgets.default || 0);
                      const diff = actual - budget;
                      const rate = budget > 0 ? (actual / budget * 100).toFixed(0) : '-';
                      return (
                        <tr key={m}>
                          <td style={{ fontWeight: 600 }}>{monthLabel(m)}</td>
                          <td className="money">{fmtM(actual)}</td>
                          <td className="money" style={{ color: 'var(--gray-400)' }}>{budget > 0 ? fmtM(budget) : '未設定'}</td>
                          <td className="money" style={{ color: diff >= 0 ? 'var(--green-600)' : '#dc2626' }}>{budget > 0 ? `${diff >= 0 ? '+' : ''}${fmtM(diff)}` : '-'}</td>
                          <td className="money" style={{ color: Number(rate) >= 100 ? 'var(--green-600)' : Number(rate) >= 80 ? '#d97706' : '#dc2626', fontWeight: 700 }}>{rate !== '-' ? `${rate}%` : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}

        {/* Seasonal Pattern (#92) */}
        {sorted.length >= 6 && (() => {
          const monthMap = {};
          sorted.forEach(([m, total]) => {
            const mo = parseInt(m.split('-')[1]);
            if (!monthMap[mo]) monthMap[mo] = [];
            monthMap[mo].push(total);
          });
          const seasonalAvg = Object.entries(monthMap).map(([mo, vals]) => ({
            month: `${mo}月`,
            avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
            count: vals.length,
          })).sort((a, b) => parseInt(a.month) - parseInt(b.month));
          const maxAvg = Math.max(...seasonalAvg.map(s => s.avg)) || 1;
          return (
            <>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8, marginTop: 16 }}>季節性分析</h4>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, marginBottom: 8 }}>
                {seasonalAvg.map(s => (
                  <div key={s.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontSize: 8, color: 'var(--gray-400)' }}>{fmtM(s.avg)}</div>
                    <div style={{ width: '100%', height: Math.max(4, (s.avg / maxAvg) * 80), background: s.avg === maxAvg ? 'var(--green-500)' : 'var(--teal-500)', borderRadius: '3px 3px 0 0', minWidth: 16 }} />
                    <div style={{ fontSize: 9, color: 'var(--gray-500)', marginTop: 2 }}>{s.month}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 16 }}>
                旺季：{seasonalAvg.sort((a, b) => b.avg - a.avg).slice(0, 3).map(s => s.month).join('、')} |
                淡季：{seasonalAvg.sort((a, b) => a.avg - b.avg).slice(0, 3).map(s => s.month).join('、')}
              </div>
            </>
          );
        })()}

        {/* Expense Trend (#92) */}
        {(() => {
          const exp = filterStore(data.expenses || []);
          const expMonthly = {};
          exp.forEach(r => { const m = getMonth(r.date); if (m) expMonthly[m] = (expMonthly[m] || 0) + Number(r.amount); });
          const expSorted = Object.entries(expMonthly).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
          if (!expSorted.length) return null;
          return (
            <>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8, marginTop: 16 }}>收支對比 (近6個月)</h4>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>月份</th><th style={{ textAlign: 'right' }}>營業額</th><th style={{ textAlign: 'right' }}>開支</th><th style={{ textAlign: 'right' }}>淨利</th><th style={{ textAlign: 'right' }}>利潤率</th></tr></thead>
                  <tbody>
                    {expSorted.map(([m, expTotal]) => {
                      const revTotal = monthlyTotals[m] || 0;
                      const net = revTotal - expTotal;
                      const margin = revTotal > 0 ? (net / revTotal * 100).toFixed(1) : 0;
                      return (
                        <tr key={m}>
                          <td style={{ fontWeight: 600 }}>{monthLabel(m)}</td>
                          <td className="money" style={{ color: 'var(--green-600)' }}>{fmtM(revTotal)}</td>
                          <td className="money" style={{ color: '#dc2626' }}>{fmtM(expTotal)}</td>
                          <td className="money" style={{ fontWeight: 700, color: net >= 0 ? 'var(--green-600)' : '#dc2626' }}>{fmtM(net)}</td>
                          <td className="money" style={{ color: Number(margin) >= 30 ? 'var(--green-600)' : Number(margin) >= 10 ? '#d97706' : '#dc2626' }}>{margin}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}

        <div style={{ fontSize: 11, color: 'var(--gray-400)', padding: '8px 12px', background: 'var(--gray-50)', borderRadius: 6, border: '1px solid var(--gray-200)', marginTop: 16 }}>
          * 預測基於線性回歸模型，僅供參考。設定月度預算可在「設定」頁面進行。
        </div>
      </div>
    );
  };

  // ── Enhanced Print (#67) ──
  const handlePrint = () => window.print();
  const handleExportReport = () => {
    const el = document.querySelector('.content .card');
    if (!el) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const tabLabel = REPORT_GROUPS.flatMap(g => g.tabs).find(t => t.id === reportType);
    w.document.write(`<!DOCTYPE html><html><head><title>${tabLabel?.label || '報表'} — ${getClinicName()}</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:20px 30px;color:#333;max-width:900px;margin:0 auto}
      .report-header{text-align:center;border-bottom:3px solid #0e7490;padding-bottom:12px;margin-bottom:16px}
      .report-header h1{font-size:18px;color:#0e7490;margin:0}
      .report-header p{font-size:11px;color:#888;margin:2px 0}
      table{width:100%;border-collapse:collapse;font-size:11px;margin:12px 0}
      th{background:#0e7490;color:#fff;padding:6px 8px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #eee}
      tr:nth-child(even){background:#f9fafb}.money{text-align:right;font-family:monospace}
      .stat-card{display:inline-block;padding:12px 20px;border:1px solid #ddd;border-radius:8px;margin:4px;text-align:center}
      .stat-label{font-size:10px;color:#888}.stat-value{font-size:18px;font-weight:800}
      h3,h4{color:#0e7490}.footer{text-align:center;font-size:9px;color:#aaa;margin-top:30px;border-top:1px solid #eee;padding-top:8px}
      @media print{body{padding:10px}}
    </style></head><body>
      <div class="report-header"><h1>${getClinicName()}</h1><p>${getClinicNameEn().toUpperCase()}</p><p>${tabLabel?.icon || ''} ${tabLabel?.label || ''} | ${selectedStore === 'all' ? '全店合計' : selectedStore} | 生成：${new Date().toLocaleString('zh-HK')}</p></div>
      ${el.innerHTML}
      <div class="footer">報表由系統自動生成 | 僅供內部參考</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const showMonthFilter = ['monthly', 'doctor', 'patient', 'consultrate', 'regstats', 'treatment', 'serviceusage', 'paymethod', 'close'].includes(reportType);

  return (
    <>
      {/* Report Type Tabs — Grouped */}
      {REPORT_GROUPS.map(group => (
        <div key={group.label} style={{ marginBottom: 2 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-400)', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: 1 }}>{group.label}</div>
          <div className="tab-bar" style={{ flexWrap: 'wrap', marginBottom: 0 }}>
            {group.tabs.map(tab => (
              <button key={tab.id} className={`tab-btn ${reportType === tab.id ? 'active' : ''}`} onClick={() => setReportType(tab.id)}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Filters */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
        {showMonthFilter && (
          <div>
            <label>月份</label>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ width: 'auto' }}>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
        )}
        <div>
          <label>店舖</label>
          <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)} style={{ width: 'auto' }}>
            <option value="all">全店合計</option>
            {getTenantStoreNames().map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-teal" onClick={handleExportReport}>🖨️ 列印報表</button>
          <button className="btn btn-outline" onClick={handlePrint}>快速列印</button>
        </div>
      </div>

      {/* Report Content — Original 6 */}
      {reportType === 'monthly' && <MonthlyReport />}
      {reportType === 'tax' && <TaxReport />}
      {reportType === 'yoy' && <YoYReport />}
      {reportType === 'doctor' && <DoctorReport />}
      {reportType === 'patient' && <PatientReport />}
      {reportType === 'forecast' && <ForecastReport />}

      {/* Report Content — Lazy-loaded sub-reports */}
      <Suspense fallback={<ReportLoader />}>
        {reportType === 'consultrate' && <DoctorConsultRate data={data} />}
        {reportType === 'rxstats' && <PrescriptionStats data={data} />}
        {reportType === 'age' && <PatientAgeReport data={data} />}
        {reportType === 'regstats' && <RegistrationStats data={data} />}
        {reportType === 'treatment' && <TreatmentReport data={data} />}
        {reportType === 'rxsummary' && <PatientRxSummary data={data} />}
        {reportType === 'serviceusage' && <ServiceUsageReport data={data} />}
        {reportType === 'paymethod' && <PaymentMethodReport data={data} />}
        {reportType === 'packagereport' && <PackageReport data={data} />}
        {reportType === 'kpi' && <KPIDashboard data={data} />}
        {reportType === 'drugsafety' && <DrugSafetyReport data={data} />}
        {reportType === 'clinical' && <ClinicalAnalytics data={data} />}
        {reportType === 'herbanalytics' && <HerbAnalytics data={data} />}
        {reportType === 'pnl' && <ProfitLoss data={data} />}
        {reportType === 'queueanalytics' && <QueueAnalytics data={data} />}
        {reportType === 'invforecast' && <InventoryForecast data={data} />}
        {reportType === 'retention' && <RetentionAnalytics data={data} />}
        {reportType === 'outcome' && <TreatmentOutcome data={data} />}
        {reportType === 'staffperf' && <StaffPerformance data={data} />}
        {reportType === 'aging' && <AgingReport data={data} />}
        {reportType === 'satisfaction' && <SatisfactionReport data={data} />}
        {reportType === 'referral' && <ReferralAnalytics data={data} />}
        {reportType === 'noshow' && <NoShowAnalytics data={data} />}
        {reportType === 'heatmap' && <VisitHeatmap data={data} />}
        {reportType === 'branch' && <BranchComparison data={data} />}
        {reportType === 'staffkpi' && <StaffKPIReport data={data} />}
        {reportType === 'progress' && <TreatmentProgress data={data} />}
        {reportType === 'cashflow' && <CashFlowForecast data={data} />}
        {reportType === 'executive' && <MonthlyExecutiveReport data={data} />}
      </Suspense>
      {reportType === 'close' && <MonthlyClose data={data} selectedMonth={selectedMonth} />}
    </>
  );
}

// ── Monthly Close Checklist ──
function MonthlyClose({ data, selectedMonth }) {
  const [checks, setChecks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_month_close') || '{}'); } catch { return {}; }
  });

  const key = selectedMonth;
  const monthChecks = checks[key] || {};

  const toggleCheck = (id) => {
    const updated = { ...checks, [key]: { ...monthChecks, [id]: monthChecks[id] ? null : new Date().toISOString() } };
    setChecks(updated);
    localStorage.setItem('hcmc_month_close', JSON.stringify(updated));
  };

  const revenue = (data.revenue || []).filter(r => getMonth(r.date) === selectedMonth);
  const expenses = (data.expenses || []).filter(r => getMonth(r.date) === selectedMonth);
  const queue = (data.queue || []).filter(q => (q.date || '').substring(0, 7) === selectedMonth);
  const arap = data.arap || [];
  const consultations = (data.consultations || []).filter(c => getMonth(c.date) === selectedMonth);

  const totalRev = revenue.reduce((s, r) => s + Number(r.amount), 0);
  const totalExp = expenses.reduce((s, r) => s + Number(r.amount), 0);
  const completedQueue = queue.filter(q => q.status === 'completed').length;
  const totalQueue = queue.length;
  const pendingAR = arap.filter(r => r.type === 'receivable' && r.status !== '已收' && r.dueDate && r.dueDate.substring(0, 7) <= selectedMonth);
  const overdueAR = pendingAR.filter(r => r.dueDate < new Date().toISOString().substring(0, 10));

  // Payment reconciliation
  const byPayment = {};
  revenue.forEach(r => { byPayment[r.payment || '未知'] = (byPayment[r.payment || '未知'] || 0) + Number(r.amount); });

  const CHECKLIST = [
    { id: 'rev_review', label: '營業額已核對', desc: `本月營業 ${fmtM(totalRev)} (${revenue.length} 筆)`, auto: revenue.length > 0 },
    { id: 'exp_review', label: '開支已核對', desc: `本月開支 ${fmtM(totalExp)} (${expenses.length} 筆)`, auto: expenses.length > 0 },
    { id: 'queue_match', label: '排隊紀錄已匹配', desc: `完成 ${completedQueue}/${totalQueue} 筆`, auto: completedQueue === totalQueue && totalQueue > 0 },
    { id: 'arap_review', label: '應收應付已覆核', desc: overdueAR.length > 0 ? `⚠️ ${overdueAR.length} 筆逾期` : '無逾期帳項', auto: overdueAR.length === 0 },
    { id: 'payment_reconcile', label: '付款方式已對帳', desc: Object.entries(byPayment).map(([k, v]) => `${k}: ${fmtM(v)}`).join(' | ') },
    { id: 'inventory_check', label: '庫存已盤點', desc: '確認系統庫存與實際相符' },
    { id: 'consult_review', label: '診症紀錄已覆核', desc: `本月 ${consultations.length} 筆診症` },
    { id: 'manager_signoff', label: '管理層簽核', desc: '確認本月結已完成' },
  ];

  const completedCount = CHECKLIST.filter(c => monthChecks[c.id]).length;
  const allDone = completedCount === CHECKLIST.length;

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>✅ {monthLabel(selectedMonth)} 月結對帳</h3>
        <span style={{ fontSize: 12, fontWeight: 700, color: allDone ? '#16a34a' : '#d97706' }}>
          {completedCount}/{CHECKLIST.length} {allDone ? '已完成' : '進行中'}
        </span>
      </div>

      {/* Progress Bar */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${(completedCount / CHECKLIST.length) * 100}%`, height: '100%', background: allDone ? '#16a34a' : '#0e7490', borderRadius: 4, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Summary Stats */}
      <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
        <div style={{ padding: 10, background: 'var(--teal-50)', borderRadius: 6, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>營業額</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)' }}>{fmtM(totalRev)}</div>
        </div>
        <div style={{ padding: 10, background: 'var(--red-50)', borderRadius: 6, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>開支</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--red-600)' }}>{fmtM(totalExp)}</div>
        </div>
        <div style={{ padding: 10, background: totalRev - totalExp >= 0 ? 'var(--green-50)' : 'var(--red-50)', borderRadius: 6, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: totalRev - totalExp >= 0 ? 'var(--green-600)' : 'var(--red-600)', fontWeight: 600 }}>淨利潤</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: totalRev - totalExp >= 0 ? 'var(--green-700)' : 'var(--red-600)' }}>{fmtM(totalRev - totalExp)}</div>
        </div>
        <div style={{ padding: 10, background: 'var(--gold-50)', borderRadius: 6, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>利潤率</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold-700)' }}>{totalRev ? ((totalRev - totalExp) / totalRev * 100).toFixed(1) : 0}%</div>
        </div>
      </div>

      {/* Checklist */}
      <div style={{ padding: '0 16px 16px' }}>
        {CHECKLIST.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--gray-100)', cursor: 'pointer' }}
            onClick={() => toggleCheck(c.id)}>
            <div style={{
              width: 24, height: 24, borderRadius: 6,
              border: monthChecks[c.id] ? '2px solid #16a34a' : '2px solid var(--gray-300)',
              background: monthChecks[c.id] ? '#16a34a' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {monthChecks[c.id] && <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>✓</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: monthChecks[c.id] ? 'var(--green-700)' : 'var(--gray-800)', textDecoration: monthChecks[c.id] ? 'line-through' : 'none' }}>{c.label}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{c.desc}</div>
            </div>
            {monthChecks[c.id] && (
              <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>
                {new Date(monthChecks[c.id]).toLocaleString('zh-HK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Payment Reconciliation */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>付款方式對帳</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>付款方式</th><th style={{ textAlign: 'right' }}>金額</th><th style={{ textAlign: 'right' }}>筆數</th><th style={{ textAlign: 'right' }}>佔比</th></tr></thead>
            <tbody>
              {Object.entries(byPayment).sort((a, b) => b[1] - a[1]).map(([method, amount]) => (
                <tr key={method}>
                  <td style={{ fontWeight: 600 }}>{method}</td>
                  <td className="money">{fmtM(amount)}</td>
                  <td style={{ textAlign: 'right' }}>{revenue.filter(r => (r.payment || '未知') === method).length}</td>
                  <td style={{ textAlign: 'right', color: 'var(--gray-500)' }}>{totalRev ? (amount / totalRev * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
