import { useState, useMemo } from 'react';
import { fmtM, getEmployees } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_mpf_records';
const MPF_MIN = 7100;
const MPF_MAX = 30000;
const MPF_CAP = 1500;
const FIRST_60 = 60;

const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const save = (r) => localStorage.setItem(LS_KEY, JSON.stringify(r));
const toYM = (d) => d.toISOString().substring(0, 7);
const now = new Date();
const curYM = toYM(now);
const curYear = now.getFullYear();
const MONTHS = Array.from({ length: 12 }, (_, i) => `${curYear}-${String(i + 1).padStart(2, '0')}`);

function calcMPF(gross, startDate) {
  if (startDate) {
    const diff = (now - new Date(startDate)) / 864e5;
    if (diff < FIRST_60) return { ee: 0, er: 0, note: '首60天豁免' };
  }
  if (gross <= 0) return { ee: 0, er: 0, note: '無收入' };
  if (gross < MPF_MIN) return { ee: 0, er: Math.min(gross * 0.05, MPF_CAP), note: `低於$${MPF_MIN.toLocaleString()}` };
  const ri = Math.min(gross, MPF_MAX);
  const ee = Math.min(ri * 0.05, MPF_CAP);
  const er = Math.min(ri * 0.05, MPF_CAP);
  return { ee, er, note: gross > MPF_MAX ? `上限$${MPF_MAX.toLocaleString()}` : '正常供款' };
}

const S = {
  page: { padding: 16, maxWidth: 1000, margin: '0 auto' },
  title: { fontSize: 20, fontWeight: 700, color: ACCENT, marginBottom: 12 },
  tabs: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  tab: (a) => ({ padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: a ? ACCENT : '#e5e7eb', color: a ? '#fff' : '#333' }),
  card: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0002', padding: 16, marginBottom: 16 },
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 6px', borderBottom: `2px solid ${ACCENT}`, color: ACCENT, fontWeight: 600 },
  thR: { textAlign: 'right', padding: '8px 6px', borderBottom: `2px solid ${ACCENT}`, color: ACCENT, fontWeight: 600 },
  td: { padding: '7px 6px', borderBottom: '1px solid #f3f4f6' },
  tdR: { padding: '7px 6px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' },
  row: { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' },
  sel: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 },
  inp: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: 90 },
  btn: { padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: ACCENT, color: '#fff' },
  btnO: { padding: '7px 16px', borderRadius: 6, border: `1px solid ${ACCENT}`, cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#fff', color: ACCENT },
  stat: { textAlign: 'center', flex: 1, minWidth: 120, padding: 14, borderRadius: 8, background: '#f0fdfa' },
  statN: { fontSize: 22, fontWeight: 700, color: ACCENT },
  statL: { fontSize: 11, color: '#666', marginTop: 2 },
  badge: (c) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: '#fff', background: c }),
  total: { background: '#f0fdfa', fontWeight: 700, borderTop: `2px solid ${ACCENT}` },
};

export default function MPFCalculator({ data, showToast, user }) {
  const [tab, setTab] = useState('monthly');
  const [month, setMonth] = useState(curYM);
  const [records, setRecords] = useState(load);
  const [volForm, setVolForm] = useState({});
  const employees = useMemo(() => getEmployees(), []);

  const payslips = data.payslips || [];

  // Build monthly contribution rows for each employee
  const monthRows = useMemo(() => {
    return employees.map(emp => {
      const ps = payslips.find(p => p.empId === emp.id && p.period === month);
      const basic = emp.type === 'monthly' ? emp.rate : 0;
      const allow = ps ? Number(ps.allow || 0) : 0;
      const bonus = ps ? Number(ps.bonus || 0) : 0;
      const gross = basic + allow + bonus;
      const mpf = calcMPF(gross, emp.start);
      const vol = Number(volForm[emp.id] || 0);
      const saved = records.find(r => r.empId === emp.id && r.month === month);
      return { ...emp, gross, mpf, vol, total: mpf.ee + mpf.er + vol, saved };
    });
  }, [employees, payslips, month, volForm, records]);

  const totals = useMemo(() => {
    let ee = 0, er = 0, vol = 0;
    monthRows.forEach(r => { ee += r.mpf.ee; er += r.mpf.er; vol += r.vol; });
    return { ee, er, vol, total: ee + er + vol };
  }, [monthRows]);

  // Annual YTD
  const ytdRows = useMemo(() => {
    return employees.map(emp => {
      let eeSum = 0, erSum = 0;
      MONTHS.forEach(m => {
        const basic = emp.type === 'monthly' ? emp.rate : 0;
        const ps = payslips.find(p => p.empId === emp.id && p.period === m);
        const allow = ps ? Number(ps.allow || 0) : 0;
        const bonus = ps ? Number(ps.bonus || 0) : 0;
        const mpf = calcMPF(basic + allow + bonus, emp.start);
        eeSum += mpf.ee; erSum += mpf.er;
      });
      return { ...emp, eeSum, erSum, total: eeSum + erSum };
    });
  }, [employees, payslips]);

  // Contribution schedule
  const schedule = useMemo(() => {
    return MONTHS.map(m => {
      const due = `${m}-10`;
      const paid = records.filter(r => r.month === m);
      const status = paid.length >= employees.length ? 'paid' : paid.length > 0 ? 'partial' : 'unpaid';
      let total = 0;
      employees.forEach(emp => {
        const basic = emp.type === 'monthly' ? emp.rate : 0;
        const mpf = calcMPF(basic, emp.start);
        total += mpf.ee + mpf.er;
      });
      return { month: m, due, status, total };
    });
  }, [employees, records]);

  const saveMonth = () => {
    const updated = records.filter(r => r.month !== month);
    monthRows.forEach(r => {
      updated.push({ empId: r.id, month, ee: r.mpf.ee, er: r.mpf.er, vol: r.vol, date: new Date().toISOString().split('T')[0] });
    });
    setRecords(updated);
    save(updated);
    showToast(`${month} 強積金記錄已儲存`);
  };

  const markPaid = (m) => {
    const updated = [...records];
    employees.forEach(emp => {
      if (!updated.find(r => r.empId === emp.id && r.month === m)) {
        const basic = emp.type === 'monthly' ? emp.rate : 0;
        const mpf = calcMPF(basic, emp.start);
        updated.push({ empId: emp.id, month: m, ee: mpf.ee, er: mpf.er, vol: 0, date: new Date().toISOString().split('T')[0] });
      }
    });
    setRecords(updated);
    save(updated);
    showToast(`${m} 已標記為已繳付`);
  };

  const handlePrint = () => {
    const clinic = getClinicName();
    const rows = monthRows.map(r => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(r.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${escapeHtml(r.pos)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmtM(r.gross)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmtM(r.mpf.ee)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmtM(r.mpf.er)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmtM(r.vol)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${fmtM(r.total)}</td></tr>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;padding:40px;color:#333}table{width:100%;border-collapse:collapse;margin:12px 0}th{background:${ACCENT};color:#fff;padding:8px;text-align:left}td{padding:6px 8px}h2{color:${ACCENT};margin:0 0 4px}@media print{body{padding:20px}}</style></head><body><h2>${escapeHtml(clinic)}</h2><p style="color:#666;margin:0 0 16px">強積金供款表 — ${escapeHtml(month)}</p><table><thead><tr><th>員工</th><th>職位</th><th style="text-align:right">有關入息</th><th style="text-align:right">僱員供款</th><th style="text-align:right">僱主供款</th><th style="text-align:right">自願供款</th><th style="text-align:right">合計</th></tr></thead><tbody>${rows}<tr style="background:#f0fdfa;font-weight:700;border-top:2px solid ${ACCENT}"><td colspan="3" style="padding:8px;text-align:right">合計</td><td style="padding:8px;text-align:right">${fmtM(totals.ee)}</td><td style="padding:8px;text-align:right">${fmtM(totals.er)}</td><td style="padding:8px;text-align:right">${fmtM(totals.vol)}</td><td style="padding:8px;text-align:right">${fmtM(totals.total)}</td></tr></tbody></table><div style="margin-top:24px;font-size:11px;color:#999"><p>截止日期：${month}-10 ｜ 列印日期：${new Date().toISOString().split('T')[0]}</p><p>強積金條例：有關入息下限 $${MPF_MIN.toLocaleString()} / 上限 $${MPF_MAX.toLocaleString()} ｜ 強制性供款上限 $${MPF_CAP.toLocaleString()}/月</p></div><div style="display:flex;justify-content:space-between;margin-top:50px;padding:0 30px"><div style="text-align:center;width:35%"><div style="border-bottom:1px solid #999;height:30px;margin-bottom:6px"></div><b>僱主簽署</b></div><div style="text-align:center;width:35%"><div style="border-bottom:1px solid #999;height:30px;margin-bottom:6px"></div><b>受託人確認</b></div></div></body></html>`);
    w.document.close();
    w.print();
  };

  const TABS = [
    { key: 'monthly', label: '每月供款' },
    { key: 'annual', label: '年度累計' },
    { key: 'schedule', label: '供款日程' },
    { key: 'rules', label: 'MPF規則' },
  ];

  return (
    <div style={S.page}>
      <div style={S.title}>強積金計算器 MPF Calculator</div>

      <div style={S.tabs}>
        {TABS.map(t => <button key={t.key} style={S.tab(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {/* ── Monthly Contributions ── */}
      {tab === 'monthly' && <>
        <div style={S.row}>
          <select style={S.sel} value={month} onChange={e => setMonth(e.target.value)}>
            {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button style={S.btn} onClick={saveMonth}>儲存記錄</button>
          <button style={S.btnO} onClick={handlePrint}>列印供款表</button>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={S.stat}><div style={S.statN}>{fmtM(totals.ee)}</div><div style={S.statL}>僱員供款合計</div></div>
          <div style={S.stat}><div style={S.statN}>{fmtM(totals.er)}</div><div style={S.statL}>僱主供款合計</div></div>
          <div style={S.stat}><div style={{ ...S.statN, color: '#b45309' }}>{fmtM(totals.vol)}</div><div style={S.statL}>自願供款</div></div>
          <div style={S.stat}><div style={{ ...S.statN, color: '#047857' }}>{fmtM(totals.total)}</div><div style={S.statL}>總供款</div></div>
        </div>

        <div style={S.card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tbl}>
              <thead>
                <tr>
                  <th style={S.th}>員工</th><th style={S.th}>職位</th>
                  <th style={S.thR}>有關入息</th><th style={S.thR}>僱員(5%)</th>
                  <th style={S.thR}>僱主(5%)</th><th style={S.thR}>自願供款</th>
                  <th style={S.thR}>合計</th><th style={S.th}>狀態</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{r.name}</td>
                    <td style={S.td}>{r.pos}</td>
                    <td style={S.tdR}>{fmtM(r.gross)}</td>
                    <td style={S.tdR}>{fmtM(r.mpf.ee)}</td>
                    <td style={S.tdR}>{fmtM(r.mpf.er)}</td>
                    <td style={S.tdR}>
                      <input type="number" style={{ ...S.inp, width: 70 }} value={volForm[r.id] || ''} placeholder="0"
                        onChange={e => setVolForm(v => ({ ...v, [r.id]: e.target.value }))} />
                    </td>
                    <td style={{ ...S.tdR, fontWeight: 700, color: ACCENT }}>{fmtM(r.total)}</td>
                    <td style={S.td}>
                      {r.saved
                        ? <span style={S.badge('#16a34a')}>已記錄</span>
                        : <span style={S.badge('#f59e0b')}>{r.mpf.note}</span>}
                    </td>
                  </tr>
                ))}
                <tr style={S.total}>
                  <td colSpan={2} style={{ ...S.td, textAlign: 'right' }}>合計</td>
                  <td style={S.tdR}>{fmtM(monthRows.reduce((s, r) => s + r.gross, 0))}</td>
                  <td style={S.tdR}>{fmtM(totals.ee)}</td>
                  <td style={S.tdR}>{fmtM(totals.er)}</td>
                  <td style={S.tdR}>{fmtM(totals.vol)}</td>
                  <td style={{ ...S.tdR, color: ACCENT }}>{fmtM(totals.total)}</td>
                  <td style={S.td}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </>}

      {/* ── Annual YTD ── */}
      {tab === 'annual' && <div style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: ACCENT }}>{curYear} 年度累計供款</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.tbl}>
            <thead>
              <tr><th style={S.th}>員工</th><th style={S.th}>職位</th><th style={S.thR}>僱員累計</th><th style={S.thR}>僱主累計</th><th style={S.thR}>年度合計</th></tr>
            </thead>
            <tbody>
              {ytdRows.map(r => (
                <tr key={r.id}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{r.name}</td>
                  <td style={S.td}>{r.pos}</td>
                  <td style={S.tdR}>{fmtM(r.eeSum)}</td>
                  <td style={S.tdR}>{fmtM(r.erSum)}</td>
                  <td style={{ ...S.tdR, fontWeight: 700, color: ACCENT }}>{fmtM(r.total)}</td>
                </tr>
              ))}
              <tr style={S.total}>
                <td colSpan={2} style={{ ...S.td, textAlign: 'right' }}>合計</td>
                <td style={S.tdR}>{fmtM(ytdRows.reduce((s, r) => s + r.eeSum, 0))}</td>
                <td style={S.tdR}>{fmtM(ytdRows.reduce((s, r) => s + r.erSum, 0))}</td>
                <td style={{ ...S.tdR, color: ACCENT }}>{fmtM(ytdRows.reduce((s, r) => s + r.total, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>}

      {/* ── Contribution Schedule ── */}
      {tab === 'schedule' && <div style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: ACCENT }}>{curYear} 供款日程（每月10日前繳付）</div>
        <table style={S.tbl}>
          <thead>
            <tr><th style={S.th}>月份</th><th style={S.th}>截止日期</th><th style={S.thR}>預計供款</th><th style={S.th}>狀態</th><th style={S.th}>操作</th></tr>
          </thead>
          <tbody>
            {schedule.map(s => (
              <tr key={s.month}>
                <td style={{ ...S.td, fontWeight: 600 }}>{s.month}</td>
                <td style={S.td}>{s.due}</td>
                <td style={S.tdR}>{fmtM(s.total)}</td>
                <td style={S.td}>
                  {s.status === 'paid' ? <span style={S.badge('#16a34a')}>已繳付</span>
                    : s.status === 'partial' ? <span style={S.badge('#f59e0b')}>部分</span>
                    : <span style={S.badge('#dc2626')}>未繳付</span>}
                </td>
                <td style={S.td}>
                  {s.status !== 'paid' && <button style={{ ...S.btn, padding: '4px 10px', fontSize: 12 }} onClick={() => markPaid(s.month)}>標記已付</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      {/* ── MPF Rules ── */}
      {tab === 'rules' && <div style={S.card}>
        <div style={{ fontWeight: 700, fontSize: 16, color: ACCENT, marginBottom: 12 }}>香港強積金（MPF）規則摘要</div>
        <table style={{ ...S.tbl, maxWidth: 600 }}>
          <tbody>
            <tr><td style={{ ...S.td, fontWeight: 600, width: 180 }}>有關入息下限</td><td style={S.td}>${MPF_MIN.toLocaleString()}/月 — 低於此額僱員無需供款，僱主仍需供款</td></tr>
            <tr><td style={{ ...S.td, fontWeight: 600 }}>有關入息上限</td><td style={S.td}>${MPF_MAX.toLocaleString()}/月 — 超出部分不計算強制性供款</td></tr>
            <tr><td style={{ ...S.td, fontWeight: 600 }}>強制性供款率</td><td style={S.td}>僱員及僱主各 5%</td></tr>
            <tr><td style={{ ...S.td, fontWeight: 600 }}>每月供款上限</td><td style={S.td}>${MPF_CAP.toLocaleString()}/月（僱員及僱主各自）</td></tr>
            <tr><td style={{ ...S.td, fontWeight: 600 }}>首60天豁免</td><td style={S.td}>新入職僱員首60天豁免僱員供款，僱主仍需供款</td></tr>
            <tr><td style={{ ...S.td, fontWeight: 600 }}>供款期限</td><td style={S.td}>糧期後第10日或之前</td></tr>
            <tr><td style={{ ...S.td, fontWeight: 600 }}>自願性供款</td><td style={S.td}>僱員或僱主可額外作出自願性供款，無上限</td></tr>
            <tr><td style={{ ...S.td, fontWeight: 600 }}>適用對象</td><td style={S.td}>18至65歲、受僱60天以上之僱員</td></tr>
          </tbody>
        </table>
        <div style={{ marginTop: 16, padding: 12, background: '#fffbeb', borderRadius: 8, fontSize: 12, color: '#92400e', border: '1px solid #fde68a' }}>
          <b>注意：</b>本計算器僅供參考，實際供款請以積金局指引為準。如有疑問請諮詢註冊強積金中介人。
        </div>
      </div>}
    </div>
  );
}
