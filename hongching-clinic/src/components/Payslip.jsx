import { useState, useMemo, useCallback } from 'react';
import { saveExpense } from '../api';
import { uid, fmtM, fmt, getMonth, getEmployees, saveEmployees } from '../data';
import { getClinicName, getClinicNameEn } from '../tenant';
import { getCurrentUser, hasPermission } from '../auth';
import escapeHtml from '../utils/escapeHtml';

export default function Payslip({ data, setData, showToast, allData }) {
  const currentUser = getCurrentUser();
  const isAdmin = hasPermission('viewPayroll'); // admin/superadmin
  const isDoctorSelfView = !isAdmin && hasPermission('viewOwnPayslip');

  const [employees, setEmployeesState] = useState(() => getEmployees());

  // Doctor can only see their own payslip
  const visibleEmployees = isDoctorSelfView
    ? employees.filter(e => e.name === currentUser?.name)
    : employees;

  const [empId, setEmpId] = useState(visibleEmployees[0]?.id || 'hui');
  const [form, setForm] = useState({
    period: (() => { const d = new Date(); return `${d.getFullYear()}年${d.getMonth() + 1}月`; })(),
    periodStart: '', periodEnd: '',
    revenue: 0, revenueByStore: [],
    bonus: 0, allow: 0, deduct: 0, deductNote: '',
    hours: 0, workDays: 0,
  });
  const [showEditor, setShowEditor] = useState(false);
  const [editEmp, setEditEmp] = useState(null);

  const emp = visibleEmployees.find(e => e.id === empId) || visibleEmployees[0];

  const loadEmp = (id) => {
    setEmpId(id);
    const e = employees.find(x => x.id === id);
    setForm(f => ({
      ...f, revenue: 0, revenueByStore: (e?.stores || []).map(s => ({ store: s, visits: 0, amount: 0 })),
      bonus: 0, allow: 0, deduct: 0, deductNote: '', hours: 0, workDays: 0,
    }));
  };

  // Commission calculation — tiered
  const calcComm = useCallback((rev) => {
    if (!emp?.comm) return { total: 0, bd: [] };
    let total = 0, bd = [];
    emp.comm.tiers.forEach(t => {
      if (rev < t.min) return;
      const base = Math.min(rev, t.max) - t.min;
      if (base > 0) { const c = base * t.r; bd.push({ range: `$${fmt(t.min)}-$${fmt(t.max)}`, rate: `${t.r * 100}%`, amt: c }); total += c; }
    });
    return { total, bd };
  }, [emp]);

  // MPF calculation — HK rules:
  // - Both employer & employee EXEMPT if employed < 60 calendar days
  // - Employee exempt first 30 days + first incomplete pay period (employer pays from day 1)
  // - Employee exempt if gross < $7,100
  const calcMPF = useCallback((gross) => {
    const daysEmployed = emp?.start ? ((new Date() - new Date(emp.start)) / 864e5) : null;
    // Under 60 calendar days: BOTH exempt (not yet required to enrol)
    if (daysEmployed !== null && daysEmployed < 60) return { ee: 0, er: 0, status: '受僱未滿60天，毋須供款' };
    const erMpf = Math.min(gross * 0.05, 1500);
    // Employee exempt first 30 days (employer still pays)
    if (daysEmployed !== null && daysEmployed < 30) return { ee: 0, er: erMpf, status: '入職首30天僱員免供' };
    if (gross < 7100) return { ee: 0, er: erMpf, status: '低於$7,100' };
    return { ee: Math.min(gross * 0.05, 1500), er: erMpf, status: '正常供款' };
  }, [emp]);

  // Hourly worker calculation
  const hourlyPay = emp?.type === 'hourly' ? (() => {
    const h = form.hours;
    const mealBreak = h > 6 ? 1 : 0;
    const paidHours = Math.max(h - mealBreak, 0);
    return { paidHours, mealBreak, total: paidHours * (emp.rate || 0) };
  })() : null;

  const totalRevenue = form.revenueByStore.reduce((s, r) => s + (r.amount || 0), 0) || form.revenue;
  const totalVisits = form.revenueByStore.reduce((s, r) => s + (r.visits || 0), 0);
  const comm = calcComm(totalRevenue);
  const base = emp?.type === 'monthly' ? (emp.rate || 0)
    : emp?.type === 'hourly' ? (hourlyPay?.total || 0)
    : 0;
  const gross = base + comm.total + form.bonus + form.allow;
  const mpf = calcMPF(gross);
  const net = gross - mpf.ee - form.deduct;

  // ── Print professional payslip ──
  const handlePrint = () => {
    const clinicName = escapeHtml(getClinicName());
    const clinicNameEn = escapeHtml(getClinicNameEn().toUpperCase());
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');

    const storeRows = form.revenueByStore.filter(r => r.amount > 0).map(r =>
      `<tr><td>${escapeHtml(r.store)}</td><td class="c">${r.visits || '-'}</td><td class="r">$ ${fmt(r.amount)}.00</td></tr>`
    ).join('');

    const commRows = comm.bd.map((b, i) =>
      `<tr><td>(${String.fromCharCode(97 + i)})</td><td>${escapeHtml(b.range)}</td><td class="r">$ ${fmt(totalRevenue)}.00</td><td class="c">${escapeHtml(b.rate)}</td><td class="r">$ ${fmt(b.amt)}</td></tr>`
    ).join('');

    // Empty tier rows
    const emptyTiers = (emp?.comm?.tiers || []).filter(t => totalRevenue <= t.min).map((t, i) =>
      `<tr><td>(${String.fromCharCode(97 + comm.bd.length + i)})</td><td>$${fmt(t.min)} - $${fmt(t.max)}</td><td class="r">$ 0.00</td><td class="c">${t.r * 100}%</td><td class="r">$ 0.00</td></tr>`
    ).join('');

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 15mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:"Noto Sans TC","PingFang HK","Microsoft JhengHei",sans-serif; font-size:13px; color:#1a1a1a; padding:30px;
    -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  .wrap { max-width:750px; margin:0 auto; }
  .hdr { text-align:center; border-bottom:3px solid #2c5f7c; padding-bottom:16px; margin-bottom:16px; }
  .hdr h1 { font-size:20px; color:#2c5f7c; letter-spacing:5px; }
  .hdr h2 { font-size:12px; color:#666; font-weight:normal; letter-spacing:2px; }
  .hdr .sub { font-size:16px; color:#333; margin-top:10px; letter-spacing:3px; font-weight:600; }
  .conf { text-align:right; font-size:10px; color:#c00; font-weight:bold; margin-bottom:8px; }
  .info { display:flex; flex-wrap:wrap; padding:12px 16px; background:#f8fafb; border-radius:6px; border:1px solid #e0e8ed; margin-bottom:16px; }
  .info .it { width:50%; display:flex; padding:3px 0; }
  .info .lb { font-weight:600; color:#555; min-width:85px; }
  .sec { font-size:13px; font-weight:700; color:#2c5f7c; margin:16px 0 6px; padding-bottom:3px; border-bottom:1.5px solid #d0dde4; }
  table { width:100%; border-collapse:collapse; margin-bottom:12px; }
  th { background:#2c5f7c; color:#fff; font-weight:600; font-size:11.5px; padding:7px 10px; text-align:left; }
  th.r, td.r { text-align:right; } th.c, td.c { text-align:center; }
  td { padding:6px 10px; border-bottom:1px solid #e8e8e8; font-size:12px; }
  tr.tot { background:#e8f0f5; font-weight:700; border-top:2px solid #2c5f7c; }
  tr.grand { background:#2c5f7c !important; color:#fff !important; font-weight:700; font-size:13px; }
  tr.grand td { border:none; color:#fff !important; padding:9px 10px; }
  .net { background:#2c5f7c; color:#fff; padding:16px 22px; border-radius:8px; margin:16px 0; display:flex; justify-content:space-between; align-items:center; }
  .net .lb { font-size:15px; letter-spacing:2px; } .net .amt { font-size:26px; font-weight:700; }
  .sigs { display:flex; justify-content:space-between; margin-top:20px; }
  .sig { width:44%; } .sig-line { border-top:1px solid #999; padding-top:6px; margin-top:50px; }
  .sig-role { font-size:11px; color:#666; } .sig-name { font-size:10px; color:#888; margin-top:3px; }
  .fn { font-size:10px; color:#888; margin-top:18px; text-align:center; line-height:1.6; }
  .no-print { text-align:center; margin-bottom:14px; }
  @media print { .no-print { display:none !important; } body { padding:0 !important; } }
</style></head><body>
<div class="no-print"><button onclick="window.print()" style="padding:10px 30px;font-size:15px;background:#2c5f7c;color:#fff;border:none;border-radius:6px;cursor:pointer">列印 / 儲存 PDF</button></div>
<div class="wrap">
  <div class="hdr">
    <h1>${clinicName}</h1>
    <h2>${clinicNameEn}</h2>
    <div class="sub">薪金單 PAYSLIP</div>
  </div>
  <div class="conf">機密文件 CONFIDENTIAL</div>
  <div class="info">
    <div class="it"><span class="lb">員工姓名：</span><span>${escapeHtml(emp.name)}${emp.nameEn ? ` (${escapeHtml(emp.nameEn)})` : ''}</span></div>
    <div class="it"><span class="lb">職位：</span><span>${escapeHtml(emp.pos)}</span></div>
    ${emp.regNo ? `<div class="it"><span class="lb">註冊編號：</span><span>${escapeHtml(emp.regNo)}</span></div>` : ''}
    <div class="it"><span class="lb">糧期：</span><span>${escapeHtml(form.period)}</span></div>
    <div class="it"><span class="lb">發薪日期：</span><span>${today}</span></div>
    <div class="it"><span class="lb">付款方式：</span><span>銀行轉帳</span></div>
  </div>
  ${storeRows ? `
  <div class="sec">營業額明細</div>
  <table><thead><tr><th>分店</th><th class="c">服務次數</th><th class="r">營業額</th></tr></thead>
  <tbody>${storeRows}
  <tr class="tot"><td>總營業額</td><td class="c">${totalVisits}</td><td class="r">$ ${fmt(totalRevenue)}.00</td></tr>
  </tbody></table>` : ''}
  ${comm.bd.length > 0 ? `
  <div class="sec">階梯業績佣金計算</div>
  <table><thead><tr><th>階梯</th><th>營業額範圍</th><th class="r">適用金額</th><th class="c">佣金比例</th><th class="r">佣金</th></tr></thead>
  <tbody>${commRows}${emptyTiers}
  <tr class="tot"><td colspan="4">佣金合計</td><td class="r">$ ${fmt(comm.total)}</td></tr>
  </tbody></table>` : ''}
  <div class="sec">薪酬總結</div>
  <table><thead><tr><th>收入項目</th><th class="r">金額 (HK$)</th></tr></thead><tbody>
  <tr><td>${emp.type === 'monthly' ? '基本月薪' : emp.type === 'hourly' ? `時薪 (${hourlyPay?.paidHours || 0}小時 × $${emp.rate})` : '底薪'}</td><td class="r">$ ${fmt(base)}</td></tr>
  ${comm.total > 0 ? `<tr><td>階梯業績佣金</td><td class="r">$ ${fmt(comm.total)}</td></tr>` : ''}
  ${form.bonus > 0 ? `<tr><td>獎金</td><td class="r">$ ${fmt(form.bonus)}</td></tr>` : ''}
  ${form.allow > 0 ? `<tr><td>津貼</td><td class="r">$ ${fmt(form.allow)}</td></tr>` : ''}
  <tr class="tot"><td>應付薪酬（稅前）</td><td class="r">$ ${fmt(gross)}</td></tr>
  </tbody></table>
  <table><thead><tr><th>扣減項目</th><th class="r">金額 (HK$)</th></tr></thead><tbody>
  <tr><td>強積金 MPF — 僱員供款（${escapeHtml(mpf.status)}）</td><td class="r">$ ${fmt(mpf.ee)}</td></tr>
  ${form.deduct > 0 ? `<tr><td>扣款${form.deductNote ? ` — ${escapeHtml(form.deductNote)}` : ''}</td><td class="r">$ ${fmt(form.deduct)}</td></tr>` : ''}
  <tr class="tot"><td>扣減合計</td><td class="r">$ ${fmt(mpf.ee + form.deduct)}</td></tr>
  </tbody></table>
  <div class="net"><div class="lb">實發薪金 NET PAY</div><div class="amt">HK$ ${Number(net).toLocaleString('en-HK', { minimumFractionDigits: 2 })}</div></div>
  <table><thead><tr><th>僱主成本摘要</th><th class="r">金額 (HK$)</th></tr></thead><tbody>
  <tr><td>員工薪酬</td><td class="r">$ ${fmt(net)}</td></tr>
  <tr><td>僱主強積金供款（5%，上限 $1,500）</td><td class="r">$ ${fmt(mpf.er)}</td></tr>
  <tr class="grand"><td>僱主總成本</td><td class="r">$ ${fmt(net + mpf.er)}</td></tr>
  </tbody></table>
  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #ddd">
    <div class="sigs">
      <div class="sig"><div class="sig-line"><div class="sig-role">僱主代表簽署</div><div class="sig-name">${clinicName}</div></div></div>
      <div class="sig"><div class="sig-line"><div class="sig-role">僱員簽署確認</div><div class="sig-name">${escapeHtml(emp.name)}${emp.nameEn ? ` (${escapeHtml(emp.nameEn)})` : ''}</div></div></div>
    </div>
    <div class="fn">此薪金單由${clinicName}系統自動生成。如有任何疑問，請聯絡人事部。<br>This payslip is system-generated by ${clinicNameEn}. For enquiries, please contact HR.</div>
  </div>
</div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  const handleAddToExp = async () => {
    if (!net) { alert('淨薪為0'); return; }
    const rec = { id: uid(), date: new Date().toISOString().split('T')[0], merchant: emp.name, amount: net, category: '人工', store: '兩店共用', payment: '轉帳', desc: `${form.period} 薪酬`, receipt: '' };
    await saveExpense(rec);
    if (setData) setData({ ...data, expenses: [...(data.expenses || []), rec] });
    showToast(`已將 ${emp.name} ${fmtM(net)} 計入開支`);
  };

  // ── Employee editor ──
  const openEditor = (e) => { setEditEmp({ ...e, comm: e.comm ? JSON.parse(JSON.stringify(e.comm)) : null }); setShowEditor(true); };
  const saveEditor = () => {
    const updated = employees.map(e => e.id === editEmp.id ? editEmp : e);
    setEmployeesState(updated);
    saveEmployees(updated);
    setShowEditor(false);
    showToast(`已更新 ${editEmp.name} 資料`);
  };

  return (
    <>
      {/* Employee Presets — hidden for doctor self-view with single employee */}
      {(!isDoctorSelfView || visibleEmployees.length > 1) && (
        <div className="card">
          <div className="card-header"><h3>👤 選擇員工</h3></div>
          <div className="preset-bar">
            {visibleEmployees.map(e => (
              <div key={e.id} className={`preset-chip ${empId === e.id ? 'active' : ''}`} onClick={() => loadEmp(e.id)}>
                {e.name} <span style={{ opacity: .6, marginLeft: 4, fontSize: 10 }}>{e.pos}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid-2">
        {/* Employee Info */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>{isDoctorSelfView ? '📋 我的薪金資料' : '1️⃣ 員工資料'}</h3>
            {isAdmin && <button className="btn btn-sm" onClick={() => openEditor(emp)} style={{ fontSize: 11, padding: '4px 10px' }}>✏️ 編輯</button>}
          </div>
          <div className="grid-2" style={{ gap: 10 }}>
            <div><label>員工姓名</label><input value={emp?.name || ''} readOnly /></div>
            <div><label>職位</label><input value={emp?.pos || ''} readOnly /></div>
            <div><label>薪酬類型</label><input value={emp?.type === 'monthly' ? '月薪制' : emp?.type === 'hourly' ? '時薪制' : emp?.type === 'commission' ? '佣金制' : '日薪制'} readOnly /></div>
            <div><label>{emp?.type === 'monthly' ? '月薪' : emp?.type === 'hourly' ? '時薪' : '底薪'} ($)</label><input value={fmt(emp?.rate || 0)} readOnly /></div>
            <div><label>入職日期</label><input value={emp?.start || '-'} readOnly /></div>
            <div><label>發薪月份</label><input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} /></div>
          </div>
          {emp?.note && <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--yellow-50, #fffbeb)', borderRadius: 6, fontSize: 11, color: '#92400e' }}>📝 {emp.note}</div>}
        </div>

        {/* Revenue & Commission */}
        <div className="card">
          <div className="card-header"><h3>2️⃣ 佣金及MPF</h3></div>

          {/* Store-by-store revenue input */}
          {emp?.comm && emp?.stores?.length > 0 && (
            <div style={{ background: 'var(--teal-50, #f0fdfa)', border: '1px solid var(--teal-200, #99f6e4)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12 }}>
              <label style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>📊 各分店營業額</label>
              {form.revenueByStore.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ minWidth: 70, fontWeight: 500 }}>{r.store}</span>
                  <div style={{ flex: 1 }}>
                    <input type="number" placeholder="服務次數" value={r.visits || ''} onChange={e => {
                      const arr = [...form.revenueByStore]; arr[i] = { ...arr[i], visits: +e.target.value };
                      setForm(f => ({ ...f, revenueByStore: arr }));
                    }} style={{ width: '100%' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input type="number" placeholder="營業額 $" value={r.amount || ''} onChange={e => {
                      const arr = [...form.revenueByStore]; arr[i] = { ...arr[i], amount: +e.target.value };
                      setForm(f => ({ ...f, revenueByStore: arr }));
                    }} style={{ width: '100%' }} />
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--teal-200, #99f6e4)', marginTop: 6, paddingTop: 6 }}>
                <span>總營業額 ({totalVisits} 次)</span><span>{fmtM(totalRevenue)}</span>
              </div>
              {comm.bd.length > 0 && (
                <div style={{ marginTop: 8, borderTop: '1px dashed #ccc', paddingTop: 6 }}>
                  {comm.bd.map((b, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>{b.range} × {b.rate}</span><span>{fmtM(b.amt)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--teal-200, #99f6e4)', marginTop: 4, paddingTop: 4 }}>
                    <span>佣金合計</span><span>{fmtM(comm.total)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hourly worker hours input */}
          {emp?.type === 'hourly' && (
            <div style={{ background: 'var(--blue-50, #eff6ff)', border: '1px solid var(--blue-200, #bfdbfe)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12 }}>
              <label>⏰ 本月總工時</label>
              <input type="number" value={form.hours || ''} onChange={e => setForm(f => ({ ...f, hours: +e.target.value }))} placeholder="小時" />
              {hourlyPay && form.hours > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#555' }}>
                  {hourlyPay.mealBreak > 0 && <div>🍽️ 扣飯鐘: {hourlyPay.mealBreak}小時</div>}
                  <div>💰 有薪工時: {hourlyPay.paidHours}小時 × ${emp.rate} = <b>{fmtM(hourlyPay.total)}</b></div>
                </div>
              )}
            </div>
          )}

          <div className="grid-3" style={{ gap: 10 }}>
            <div><label>全勤獎金</label><input type="number" value={form.bonus || ''} onChange={e => setForm(f => ({ ...f, bonus: +e.target.value }))} /></div>
            <div><label>津貼</label><input type="number" value={form.allow || ''} onChange={e => setForm(f => ({ ...f, allow: +e.target.value }))} /></div>
            <div><label>扣款</label><input type="number" value={form.deduct || ''} onChange={e => setForm(f => ({ ...f, deduct: +e.target.value }))} /></div>
          </div>

          <div className="grid-3" style={{ gap: 10, marginTop: 10 }}>
            <div><label>僱員MPF</label><input value={fmtM(mpf.ee)} readOnly /><div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{mpf.status}</div></div>
            <div><label>僱主MPF</label><input value={fmtM(mpf.er)} readOnly /></div>
            <div>
              <label style={{ color: 'var(--teal-700, #0f766e)' }}>淨發薪額</label>
              <input value={fmtM(net)} readOnly style={{ background: 'var(--teal-50, #f0fdfa)', fontWeight: 800, fontSize: 18, color: 'var(--teal-700, #0f766e)', textAlign: 'center' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-teal" onClick={handlePrint}>🖨️ 列印糧單</button>
        {isAdmin && <button className="btn btn-green" onClick={handleAddToExp}>📤 計入開支</button>}
      </div>

      {/* Preview */}
      <div className="card payslip-preview">
        <div className="payslip-header">
          <div><b style={{ fontSize: 16 }}>{getClinicName()}</b><br /><small style={{ color: 'var(--gray-400, #9ca3af)' }}>{getClinicNameEn().toUpperCase()}</small></div>
          <div style={{ textAlign: 'right' }}><b style={{ fontSize: 20 }}>PAYSLIP</b></div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', marginBottom: 14, fontSize: 13 }}>
          <div><b>員工:</b> {emp?.name}</div>
          <div><b>職位:</b> {emp?.pos}</div>
          <div><b>月份:</b> {form.period}</div>
        </div>

        {/* Revenue by store */}
        {form.revenueByStore.some(r => r.amount > 0) && (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead><tr style={{ background: 'var(--teal-700, #0f766e)', color: '#fff' }}><th style={{ padding: '6px 10px', textAlign: 'left' }}>分店</th><th style={{ padding: '6px 10px', textAlign: 'center' }}>次數</th><th style={{ padding: '6px 10px', textAlign: 'right' }}>營業額</th></tr></thead>
            <tbody>
              {form.revenueByStore.filter(r => r.amount > 0).map((r, i) => (
                <tr key={i}><td style={{ padding: '4px 10px' }}>{r.store}</td><td style={{ padding: '4px 10px', textAlign: 'center' }}>{r.visits}</td><td style={{ padding: '4px 10px', textAlign: 'right' }}>{fmtM(r.amount)}</td></tr>
              ))}
              <tr style={{ background: 'var(--gray-100, #f3f4f6)', fontWeight: 700, borderTop: '2px solid #ccc' }}>
                <td style={{ padding: '6px 10px' }}>合計</td><td style={{ padding: '6px 10px', textAlign: 'center' }}>{totalVisits}</td><td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtM(totalRevenue)}</td>
              </tr>
            </tbody>
          </table>
        )}

        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'var(--teal-700, #0f766e)', color: '#fff' }}><th style={{ padding: '8px 12px', textAlign: 'left' }}>項目</th><th style={{ padding: '8px 12px', textAlign: 'right' }}>金額</th></tr></thead>
          <tbody>
            <tr><td style={{ padding: '6px 12px' }}>{emp?.type === 'monthly' ? '基本月薪' : emp?.type === 'hourly' ? `時薪 (${hourlyPay?.paidHours || 0}h × $${emp?.rate})` : '底薪'}</td><td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtM(base)}</td></tr>
            {comm.total > 0 && <tr><td style={{ padding: '6px 12px' }}>佣金 (營業額 {fmtM(totalRevenue)})</td><td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtM(comm.total)}</td></tr>}
            {form.bonus > 0 && <tr><td style={{ padding: '6px 12px' }}>獎金</td><td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtM(form.bonus)}</td></tr>}
            {form.allow > 0 && <tr><td style={{ padding: '6px 12px' }}>津貼</td><td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtM(form.allow)}</td></tr>}
            <tr><td style={{ padding: '6px 12px', color: 'var(--gray-400, #9ca3af)' }}>MPF僱員 ({mpf.status})</td><td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--red-600, #dc2626)' }}>-{fmtM(mpf.ee)}</td></tr>
            {form.deduct > 0 && <tr><td style={{ padding: '6px 12px', color: 'var(--gray-400, #9ca3af)' }}>扣款</td><td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--red-600, #dc2626)' }}>-{fmtM(form.deduct)}</td></tr>}
            <tr style={{ background: 'var(--gray-100, #f3f4f6)', fontWeight: 700, borderTop: '2px solid var(--gray-300, #d1d5db)' }}>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>淨發薪額</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 18, color: 'var(--teal-700, #0f766e)' }}>{fmtM(net)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>僱主MPF: {fmtM(mpf.er)} ｜ 僱主總成本: {fmtM(net + mpf.er)}</div>
      </div>

      {/* Employee Editor Modal */}
      {showEditor && editEmp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowEditor(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 500, width: '90%', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 14 }}>✏️ 編輯員工 — {editEmp.name}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label>姓名</label><input value={editEmp.name} onChange={e => setEditEmp(p => ({ ...p, name: e.target.value }))} /></div>
              <div><label>英文名</label><input value={editEmp.nameEn || ''} onChange={e => setEditEmp(p => ({ ...p, nameEn: e.target.value }))} /></div>
              <div><label>職位</label><input value={editEmp.pos} onChange={e => setEditEmp(p => ({ ...p, pos: e.target.value }))} /></div>
              <div><label>註冊編號</label><input value={editEmp.regNo || ''} onChange={e => setEditEmp(p => ({ ...p, regNo: e.target.value }))} /></div>
              <div>
                <label>薪酬類型</label>
                <select value={editEmp.type} onChange={e => setEditEmp(p => ({ ...p, type: e.target.value }))}>
                  <option value="monthly">月薪制</option><option value="hourly">時薪制</option><option value="daily">日薪制</option><option value="commission">佣金制</option>
                </select>
              </div>
              <div><label>{editEmp.type === 'monthly' ? '月薪' : editEmp.type === 'hourly' ? '時薪' : '底薪'} ($)</label><input type="number" value={editEmp.rate || ''} onChange={e => setEditEmp(p => ({ ...p, rate: +e.target.value }))} /></div>
              <div><label>入職日期</label><input type="date" value={editEmp.start || ''} onChange={e => setEditEmp(p => ({ ...p, start: e.target.value }))} /></div>
              <div><label>備註</label><input value={editEmp.note || ''} onChange={e => setEditEmp(p => ({ ...p, note: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowEditor(false)}>取消</button>
              <button className="btn btn-teal" onClick={saveEditor}>💾 儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Performance Dashboard */}
      {(() => {
        const src = allData || data;
        const doctors = employees.filter(e => e.pos?.includes('醫師')).map(e => e.name);
        const thisMonth = new Date().toISOString().substring(0, 7);
        const today = new Date().toISOString().substring(0, 10);
        const doctorPerf = doctors.map(doc => {
          const monthRev = (src?.revenue || []).filter(r => r.doctor === doc && getMonth(r.date) === thisMonth);
          const monthConsult = (src?.consultations || []).filter(c => c.doctor === doc && getMonth(c.date) === thisMonth);
          const todayQueue = (src?.queue || []).filter(q => q.doctor === doc && q.date === today);
          const revenue = monthRev.reduce((s, r) => s + Number(r.amount || 0), 0);
          const consultCount = monthConsult.length;
          const todayPatients = todayQueue.length;
          const avgPerConsult = consultCount > 0 ? Math.round(revenue / consultCount) : 0;
          const targets = (() => { try { return JSON.parse(localStorage.getItem('hcmc_doctor_targets') || '{}'); } catch { return {}; } })();
          const target = Number(targets[doc] || 0);
          const achievement = target > 0 ? Math.round(revenue / target * 100) : null;
          return { doc, revenue, consultCount, todayPatients, avgPerConsult, target, achievement };
        });
        if (!doctorPerf.length) return null;
        return (
          <div className="card" style={{ marginTop: 16, padding: 0 }}>
            <div className="card-header"><h3>本月醫師績效一覽 ({thisMonth})</h3></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>醫師</th><th style={{ textAlign: 'right' }}>本月營業額</th><th style={{ textAlign: 'right' }}>診症數</th><th style={{ textAlign: 'right' }}>平均單價</th><th style={{ textAlign: 'right' }}>目標</th><th style={{ textAlign: 'right' }}>達成率</th><th style={{ textAlign: 'right' }}>今日病人</th></tr>
                </thead>
                <tbody>
                  {doctorPerf.map(d => (
                    <tr key={d.doc}>
                      <td style={{ fontWeight: 600 }}>{d.doc}</td>
                      <td className="money" style={{ color: 'var(--gold-700, #b45309)', fontWeight: 600 }}>{fmtM(d.revenue)}</td>
                      <td className="money">{d.consultCount}</td>
                      <td className="money">{fmtM(d.avgPerConsult)}</td>
                      <td className="money" style={{ color: 'var(--gray-400, #9ca3af)' }}>{d.target > 0 ? fmtM(d.target) : '未設'}</td>
                      <td className="money" style={{ fontWeight: 700, color: d.achievement === null ? 'var(--gray-400, #9ca3af)' : d.achievement >= 100 ? 'var(--green-600, #16a34a)' : d.achievement >= 80 ? '#d97706' : '#dc2626' }}>
                        {d.achievement !== null ? `${d.achievement}%` : '-'}
                      </td>
                      <td className="money">{d.todayPatients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </>
  );
}
