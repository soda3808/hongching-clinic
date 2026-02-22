import { useState, useMemo } from 'react';
import { fmtM, fmt, getMonth, monthLabel, EXPENSE_CATEGORIES } from '../data';

export default function Reports({ data }) {
  const [reportType, setReportType] = useState('monthly');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [selectedStore, setSelectedStore] = useState('all');

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
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal-700)' }}>康晴綜合醫療中心</div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>HONG CHING INTERNATIONAL MEDICAL CENTRE</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>月結報表</div>
            <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>{monthLabel(selectedMonth)} | {selectedStore === 'all' ? '兩店合計' : selectedStore}</div>
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
          報表生成時間: {new Date().toLocaleString('zh-HK')} | 康晴綜合醫療中心
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
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold-700)' }}>康晴綜合醫療中心</div>
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

  const handlePrint = () => window.print();

  return (
    <>
      {/* Report Type Tabs */}
      <div className="tab-bar">
        <button className={`tab-btn ${reportType === 'monthly' ? 'active' : ''}`} onClick={() => setReportType('monthly')}>📅 月結報表</button>
        <button className={`tab-btn ${reportType === 'tax' ? 'active' : ''}`} onClick={() => setReportType('tax')}>🏛️ 稅務/年結</button>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
        {reportType === 'monthly' && (
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
            <option value="all">兩店合計</option><option>宋皇臺</option><option>太子</option>
          </select>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-teal" onClick={handlePrint}>🖨️ 列印報表</button>
        </div>
      </div>

      {/* Report Content */}
      {reportType === 'monthly' ? <MonthlyReport /> : <TaxReport />}
    </>
  );
}
