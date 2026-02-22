import { useState } from 'react';
import { saveExpense } from '../api';
import { uid, fmtM, fmt, EMPLOYEES } from '../data';

export default function Payslip({ data, setData, showToast }) {
  const [empId, setEmpId] = useState('hui');
  const [form, setForm] = useState({ period: 'Feb 2026', revenue: 0, bonus: 0, allow: 0, deduct: 0 });

  const emp = EMPLOYEES.find(e => e.id === empId) || EMPLOYEES[0];

  const loadEmp = (id) => {
    setEmpId(id);
    setForm({ period: 'Feb 2026', revenue: 0, bonus: 0, allow: 0, deduct: 0 });
  };

  const calcComm = (rev) => {
    if (!emp.comm) return { total: 0, bd: [] };
    let total = 0, bd = [];
    emp.comm.tiers.forEach(t => {
      if (rev <= t.min) return;
      const base = Math.min(rev, t.max) - t.min;
      if (base > 0) { const c = base * t.r; bd.push({ range: `$${fmt(t.min)}-$${fmt(t.max)}`, rate: `${t.r*100}%`, amt: c }); total += c; }
    });
    return { total, bd };
  };

  const calcMPF = (gross) => {
    if (emp.start) {
      const diff = (new Date() - new Date(emp.start)) / 864e5;
      if (diff < 60) return { ee: 0, er: 0, status: '首60天豁免' };
    }
    if (gross < 7100) return { ee: 0, er: Math.min(gross * 0.05, 1500), status: '低於$7,100' };
    return { ee: Math.min(gross * 0.05, 1500), er: Math.min(gross * 0.05, 1500), status: '正常供款' };
  };

  const base = emp.type === 'monthly' ? emp.rate : 0;
  const comm = calcComm(form.revenue);
  const gross = base + comm.total + form.bonus + form.allow;
  const mpf = calcMPF(gross);
  const net = gross - mpf.ee - form.deduct;

  const handlePrint = () => {
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{font-family:Arial,sans-serif;padding:40px;color:#333}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      th,td{padding:8px 12px;border-bottom:1px solid #eee;text-align:left}
      th{background:#0e7490;color:#fff}
      .total{background:#f3f4f6;font-weight:700;border-top:2px solid #ccc}
      .header{border-bottom:3px solid #0e7490;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between}
      .sig{display:flex;justify-content:space-between;margin-top:60px;padding:0 40px}
      .sig-box{text-align:center;width:35%}.sig-box div{border-bottom:1px solid #999;height:30px;margin-bottom:6px}
    </style></head><body>
    <div class="header"><div><b style="font-size:17px">康晴綜合醫療中心</b><br><small>HONG CHING INTERNATIONAL MEDICAL CENTRE</small></div><div style="text-align:right"><b style="font-size:20px">PAYSLIP 糧單</b></div></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:14px"><div><b>員工:</b> ${emp.name}<br><b>職位:</b> ${emp.pos}</div><div style="text-align:right"><b>月份:</b> ${form.period}<br><b>發薪日:</b> ${new Date().toISOString().split('T')[0]}</div></div>
    <table><thead><tr><th>項目</th><th style="text-align:right">金額</th></tr></thead><tbody>
    <tr><td>基本薪金</td><td style="text-align:right">${fmtM(base)}</td></tr>
    ${comm.total ? `<tr><td>佣金 (營業額 ${fmtM(form.revenue)})</td><td style="text-align:right">${fmtM(comm.total)}</td></tr>` : ''}
    ${form.bonus ? `<tr><td>獎金</td><td style="text-align:right">${fmtM(form.bonus)}</td></tr>` : ''}
    ${form.allow ? `<tr><td>津貼</td><td style="text-align:right">${fmtM(form.allow)}</td></tr>` : ''}
    <tr><td style="color:#888">MPF僱員 (${mpf.status})</td><td style="text-align:right;color:#dc2626">-${fmtM(mpf.ee)}</td></tr>
    ${form.deduct ? `<tr><td style="color:#888">扣款</td><td style="text-align:right;color:#dc2626">-${fmtM(form.deduct)}</td></tr>` : ''}
    <tr class="total"><td style="text-align:right">淨發薪額 NET PAY</td><td style="text-align:right;font-size:18px;color:#0e7490">${fmtM(net)}</td></tr>
    </tbody></table>
    <div style="font-size:11px;color:#888;margin-top:8px">僱主MPF供款: ${fmtM(mpf.er)}</div>
    <div class="sig"><div class="sig-box"><div></div><b>僱主簽署</b></div><div class="sig-box"><div></div><b>僱員簽署</b></div></div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  const handleAddToExp = async () => {
    if (!net) { alert('淨薪為0'); return; }
    const rec = { id: uid(), date: new Date().toISOString().split('T')[0], merchant: emp.name, amount: net, category: '人工', store: '兩店共用', payment: '轉帳', desc: `${form.period} 薪酬`, receipt: '' };
    await saveExpense(rec);
    if (setData) setData({ ...data, expenses: [...(data.expenses || []), rec] });
    showToast(`已將 ${emp.name} ${fmtM(net)} 計入開支`);
  };

  return (
    <>
      {/* Employee Presets */}
      <div className="card">
        <div className="card-header"><h3>👤 選擇員工</h3></div>
        <div className="preset-bar">
          {EMPLOYEES.map(e => (
            <div key={e.id} className={`preset-chip ${empId === e.id ? 'active' : ''}`} onClick={() => loadEmp(e.id)}>
              {e.name} <span style={{ opacity: .6, marginLeft: 4, fontSize: 10 }}>{e.pos}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        {/* Employee Info */}
        <div className="card">
          <div className="card-header"><h3>1️⃣ 員工資料</h3></div>
          <div className="grid-2" style={{ gap: 10 }}>
            <div><label>員工姓名</label><input value={emp.name} readOnly /></div>
            <div><label>職位</label><input value={emp.pos} readOnly /></div>
            <div><label>薪酬類型</label><input value={emp.type === 'monthly' ? '月薪制' : emp.type === 'daily' ? '日薪制' : '時薪制'} readOnly /></div>
            <div><label>{emp.type === 'monthly' ? '月薪' : emp.type === 'daily' ? '日薪' : '時薪'} ($)</label><input value={fmt(emp.rate)} readOnly /></div>
            <div><label>入職日期</label><input value={emp.start || '-'} readOnly /></div>
            <div><label>發薪月份</label><input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} /></div>
          </div>
        </div>

        {/* Commission & MPF */}
        <div className="card">
          <div className="card-header"><h3>2️⃣ 佣金及MPF</h3></div>

          {emp.comm && (
            <div style={{ background: 'var(--teal-50)', border: '1px solid var(--teal-200)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12 }}>
              <label>本月營業額 ($)</label>
              <input type="number" value={form.revenue} onChange={e => setForm(f => ({ ...f, revenue: +e.target.value }))} />
              {comm.bd.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {comm.bd.map((b, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>{b.range} × {b.rate}</span><span>{fmtM(b.amt)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--teal-200)', marginTop: 4, paddingTop: 4 }}>
                    <span>佣金合計</span><span>{fmtM(comm.total)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid-3" style={{ gap: 10 }}>
            <div><label>全勤獎金</label><input type="number" value={form.bonus} onChange={e => setForm(f => ({ ...f, bonus: +e.target.value }))} /></div>
            <div><label>津貼</label><input type="number" value={form.allow} onChange={e => setForm(f => ({ ...f, allow: +e.target.value }))} /></div>
            <div><label>扣款</label><input type="number" value={form.deduct} onChange={e => setForm(f => ({ ...f, deduct: +e.target.value }))} /></div>
          </div>

          <div className="grid-3" style={{ gap: 10, marginTop: 10 }}>
            <div><label>僱員MPF</label><input value={fmtM(mpf.ee)} readOnly /></div>
            <div><label>僱主MPF</label><input value={fmtM(mpf.er)} readOnly /></div>
            <div>
              <label style={{ color: 'var(--teal-700)' }}>淨發薪額</label>
              <input value={fmtM(net)} readOnly style={{ background: 'var(--teal-50)', fontWeight: 800, fontSize: 18, color: 'var(--teal-700)', textAlign: 'center' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-teal" onClick={handlePrint}>🖨️ 列印糧單</button>
        <button className="btn btn-green" onClick={handleAddToExp}>📤 計入開支</button>
      </div>

      {/* Preview */}
      <div className="card payslip-preview">
        <div className="payslip-header">
          <div><b style={{ fontSize: 16 }}>康晴綜合醫療中心</b><br /><small style={{ color: 'var(--gray-400)' }}>HONG CHING INTERNATIONAL MEDICAL CENTRE</small></div>
          <div style={{ textAlign: 'right' }}><b style={{ fontSize: 20 }}>PAYSLIP</b></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 14, fontSize: 13 }}>
          <div><b>員工:</b> {emp.name}</div>
          <div style={{ textAlign: 'right' }}><b>月份:</b> {form.period}</div>
          <div><b>職位:</b> {emp.pos}</div>
        </div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'var(--teal-700)', color: '#fff' }}><th style={{ padding: '8px 12px', textAlign: 'left' }}>項目</th><th style={{ padding: '8px 12px', textAlign: 'right' }}>金額</th></tr></thead>
          <tbody>
            <tr><td style={{ padding: '6px 12px' }}>基本薪金</td><td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtM(base)}</td></tr>
            {comm.total > 0 && <tr><td style={{ padding: '6px 12px' }}>佣金 (營業額 {fmtM(form.revenue)})</td><td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtM(comm.total)}</td></tr>}
            {form.bonus > 0 && <tr><td style={{ padding: '6px 12px' }}>獎金</td><td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtM(form.bonus)}</td></tr>}
            {form.allow > 0 && <tr><td style={{ padding: '6px 12px' }}>津貼</td><td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtM(form.allow)}</td></tr>}
            <tr><td style={{ padding: '6px 12px', color: 'var(--gray-400)' }}>MPF僱員 ({mpf.status})</td><td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--red-600)' }}>-{fmtM(mpf.ee)}</td></tr>
            {form.deduct > 0 && <tr><td style={{ padding: '6px 12px', color: 'var(--gray-400)' }}>扣款</td><td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--red-600)' }}>-{fmtM(form.deduct)}</td></tr>}
            <tr style={{ background: 'var(--gray-100)', fontWeight: 700, borderTop: '2px solid var(--gray-300)' }}>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>淨發薪額</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 18, color: 'var(--teal-700)' }}>{fmtM(net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
