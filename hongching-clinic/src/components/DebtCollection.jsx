import { useState, useMemo } from 'react';
import { fmtM } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const A = '#0e7490';
const LS_DEBTS = 'hcmc_debts';
const LS_PAY = 'hcmc_debt_payments';
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const today = () => new Date().toISOString().split('T')[0];
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000);

const STATUSES = ['未繳', '已提醒', '協商中', '已部分收回', '已全數收回', '已豁免'];
const badge = (s) => {
  const m = { '未繳': '#dc2626', '已提醒': '#d97706', '協商中': '#2563eb', '已部分收回': '#7c3aed', '已全數收回': '#16a34a', '已豁免': '#6b7280' };
  return { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: '#fff', background: m[s] || '#888' };
};

export default function DebtCollection({ data, showToast, user }) {
  const [debts, setDebts] = useState(() => load(LS_DEBTS));
  const [payments, setPayments] = useState(() => load(LS_PAY));
  const [tab, setTab] = useState('list'); // list | add | aging
  const [search, setSearch] = useState('');
  const [payModal, setPayModal] = useState(null);
  const [payAmt, setPayAmt] = useState('');
  const [payNote, setPayNote] = useState('');
  const [statusModal, setStatusModal] = useState(null);
  const [form, setForm] = useState({ patientId: '', amount: '', invoiceDate: today(), desc: '', notes: '' });
  const [pSearch, setPSearch] = useState('');

  const patients = data.patients || [];
  const pResults = useMemo(() => {
    if (!pSearch) return [];
    const q = pSearch.toLowerCase();
    return patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [pSearch, patients]);

  const persist = (d, p) => { save(LS_DEBTS, d); save(LS_PAY, p); };

  // ── Stats ──
  const stats = useMemo(() => {
    const open = debts.filter(d => d.status !== '已全數收回' && d.status !== '已豁免');
    const totalOwed = open.reduce((s, d) => s + Number(d.amount), 0);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const collected = debts.filter(d => d.status === '已全數收回');
    const rate = debts.length ? ((collected.length / debts.length) * 100).toFixed(1) : '0.0';
    const avgDays = collected.length ? (collected.reduce((s, d) => {
      const ps = payments.filter(p => p.debtId === d.id).sort((a, b) => b.date.localeCompare(a.date));
      return s + (ps.length ? daysBetween(d.invoiceDate, ps[0].date) : 0);
    }, 0) / collected.length).toFixed(0) : '-';
    return { totalOwed, totalPaid, rate, avgDays, openCount: open.length };
  }, [debts, payments]);

  // ── Aging ──
  const aging = useMemo(() => {
    const open = debts.filter(d => d.status !== '已全數收回' && d.status !== '已豁免');
    const t = new Date();
    const buckets = { d30: [], d60: [], d90: [], d90p: [] };
    open.forEach(d => {
      const days = Math.floor((t - new Date(d.invoiceDate)) / 86400000);
      if (days <= 30) buckets.d30.push(d);
      else if (days <= 60) buckets.d60.push(d);
      else if (days <= 90) buckets.d90.push(d);
      else buckets.d90p.push(d);
    });
    const sum = arr => arr.reduce((s, d) => s + Number(d.amount), 0);
    return [
      { label: '0-30天', items: buckets.d30, total: sum(buckets.d30), color: '#d97706' },
      { label: '31-60天', items: buckets.d60, total: sum(buckets.d60), color: '#ea580c' },
      { label: '61-90天', items: buckets.d90, total: sum(buckets.d90), color: '#dc2626' },
      { label: '90天以上', items: buckets.d90p, total: sum(buckets.d90p), color: '#991b1b' },
    ];
  }, [debts]);

  // ── Helpers ──
  const paidFor = (debtId) => payments.filter(p => p.debtId === debtId).reduce((s, p) => s + Number(p.amount), 0);
  const remaining = (d) => Number(d.amount) - paidFor(d.id);

  const filtered = useMemo(() => {
    if (!search) return debts;
    const q = search.toLowerCase();
    return debts.filter(d => (d.patientName || '').toLowerCase().includes(q) || (d.patientPhone || '').includes(q));
  }, [debts, search]);

  // ── Actions ──
  const handleAdd = () => {
    if (!form.patientId || !form.amount) { showToast('請選擇病人及輸入金額'); return; }
    const p = patients.find(x => x.id === form.patientId);
    const rec = { id: uid(), patientId: form.patientId, patientName: p?.name || '', patientPhone: p?.phone || '',
      amount: parseFloat(form.amount), invoiceDate: form.invoiceDate, desc: form.desc, notes: form.notes,
      status: '未繳', createdBy: user?.name || '', createdAt: new Date().toISOString() };
    const nd = [...debts, rec];
    setDebts(nd); persist(nd, payments);
    setForm({ patientId: '', amount: '', invoiceDate: today(), desc: '', notes: '' }); setPSearch('');
    showToast('已新增欠款紀錄'); setTab('list');
  };

  const handlePay = () => {
    if (!payModal || !payAmt || Number(payAmt) <= 0) return;
    const amt = Math.min(Number(payAmt), remaining(payModal));
    const pr = { id: uid(), debtId: payModal.id, amount: amt, date: today(), note: payNote, recordedBy: user?.name || '' };
    const np = [...payments, pr]; setPayments(np);
    const newRem = Number(payModal.amount) - paidFor(payModal.id) - amt;
    let ns = payModal.status;
    if (newRem <= 0) ns = '已全數收回';
    else if (ns === '未繳' || ns === '已提醒') ns = '已部分收回';
    const nd = debts.map(d => d.id === payModal.id ? { ...d, status: ns } : d);
    setDebts(nd); persist(nd, np);
    showToast(`已記錄收款 ${fmtM(amt)}`); setPayModal(null); setPayAmt(''); setPayNote('');
  };

  const changeStatus = (id, ns) => {
    const nd = debts.map(d => d.id === id ? { ...d, status: ns } : d);
    setDebts(nd); persist(nd, payments); showToast(`狀態已更新為「${ns}」`); setStatusModal(null);
  };

  const deleteDebt = (id) => {
    if (!window.confirm('確定刪除此欠款紀錄？')) return;
    const nd = debts.filter(d => d.id !== id);
    const np = payments.filter(p => p.debtId !== id);
    setDebts(nd); setPayments(np); persist(nd, np); showToast('已刪除');
  };

  // ── Reminders ──
  const sendWhatsApp = (d) => {
    const days = daysBetween(d.invoiceDate, today());
    const msg = `${getClinicName()} 付款提醒\n\n${d.patientName} 您好，\n\n根據紀錄，閣下尚有以下未繳款項：\n金額：${fmtM(remaining(d))}\n帳單日期：${d.invoiceDate}\n逾期天數：${days}天\n服務：${d.desc || '-'}\n\n請儘快安排繳款，如已繳付請忽略。\n如有疑問歡迎聯絡本診所，謝謝！`;
    const phone = (d.patientPhone || '').replace(/[^0-9]/g, '');
    window.open(`https://wa.me/852${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    const nd = debts.map(x => x.id === d.id && x.status === '未繳' ? { ...x, status: '已提醒' } : x);
    setDebts(nd); persist(nd, payments); showToast('已開啟 WhatsApp 提醒');
  };

  const logCall = (d) => {
    const note = window.prompt('輸入電話跟進備註：');
    if (!note) return;
    const nd = debts.map(x => x.id === d.id ? { ...x, notes: `${x.notes ? x.notes + '\n' : ''}[${today()} 電話] ${note}` } : x);
    setDebts(nd); persist(nd, payments); showToast('已記錄電話跟進');
  };

  const printLetter = (d) => {
    const w = window.open('', '_blank'); if (!w) return;
    const days = daysBetween(d.invoiceDate, today());
    w.document.write(`<!DOCTYPE html><html><head><title>付款提醒函</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:40px;max-width:600px;margin:0 auto}
      h1{color:${A};font-size:20px;border-bottom:3px solid ${A};padding-bottom:10px}
      .amt{font-size:24px;color:#dc2626;font-weight:800}
      .footer{margin-top:40px;border-top:1px solid #ddd;padding-top:12px;font-size:10px;color:#999;text-align:center}
    </style></head><body>
      <h1>${escapeHtml(getClinicName())} — 付款提醒函</h1>
      <p>日期：${today()}</p>
      <p style="margin-top:20px"><strong>${escapeHtml(d.patientName)}</strong> 閣下：</p>
      <p>根據本診所紀錄，閣下尚有以下款項未繳：</p>
      <p>帳單日期：${d.invoiceDate}</p>
      <p>應繳金額：<span class="amt">${fmtM(remaining(d))}</span></p>
      <p>逾期天數：${days} 天</p>
      <p>服務描述：${escapeHtml(d.desc || '-')}</p>
      <p style="margin-top:24px">敬請於收到本函後七日內安排繳付。如已繳款請忽略此通知。</p>
      <p>如有疑問，歡迎聯絡本診所。</p>
      <p style="margin-top:32px">此致<br/>${escapeHtml(getClinicName())}</p>
      <div class="footer">此函件由系統自動生成</div>
    </body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  const printStatement = (d) => {
    const w = window.open('', '_blank'); if (!w) return;
    const dPayments = payments.filter(p => p.debtId === d.id);
    const rows = dPayments.map(p => `<tr><td>${p.date}</td><td style="text-align:right">${fmtM(p.amount)}</td><td>${escapeHtml(p.note || '-')}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>欠款結算單</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:30px;max-width:700px;margin:0 auto}
      h1{color:${A};font-size:18px;border-bottom:3px solid ${A};padding-bottom:8px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0}
      th{background:${A};color:#fff;padding:6px 8px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #eee}
      .summary{background:#f8fafc;padding:12px;border-radius:6px;margin:16px 0}
      .footer{text-align:center;font-size:9px;color:#aaa;margin-top:24px}
    </style></head><body>
      <h1>${escapeHtml(getClinicName())} — 病人欠款結算單</h1>
      <p style="font-size:12px;color:#888">列印日期：${today()}</p>
      <div class="summary">
        <p><strong>病人：</strong>${escapeHtml(d.patientName)}　　<strong>電話：</strong>${escapeHtml(d.patientPhone || '-')}</p>
        <p><strong>帳單日期：</strong>${d.invoiceDate}　　<strong>服務：</strong>${escapeHtml(d.desc || '-')}</p>
        <p><strong>應繳總額：</strong>${fmtM(d.amount)}　　<strong>已繳：</strong>${fmtM(paidFor(d.id))}　　<strong style="color:#dc2626">尚欠：${fmtM(remaining(d))}</strong></p>
        <p><strong>狀態：</strong>${d.status}</p>
      </div>
      <h3>繳款紀錄</h3>
      ${dPayments.length ? `<table><thead><tr><th>日期</th><th style="text-align:right">金額</th><th>備註</th></tr></thead><tbody>${rows}</tbody></table>` : '<p style="color:#999">暫無繳款紀錄</p>'}
      <div class="footer">此結算單由系統自動生成，如有疑問請聯絡本診所</div>
    </body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  // ── Styles ──
  const S = {
    wrap: { padding: 16 },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    title: { fontSize: 20, fontWeight: 700, color: A },
    tabs: { display: 'flex', gap: 6 },
    tab: (active) => ({ padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: active ? A : '#e5e7eb', color: active ? '#fff' : '#374151' }),
    card: { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
    statRow: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
    stat: { flex: 1, minWidth: 140, background: '#f0fdfa', borderRadius: 8, padding: 12, textAlign: 'center' },
    statVal: { fontSize: 22, fontWeight: 800, color: A },
    statLbl: { fontSize: 11, color: '#6b7280', marginTop: 2 },
    input: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' },
    btn: (bg = A) => ({ padding: '6px 14px', border: 'none', borderRadius: 6, background: bg, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }),
    sm: { padding: '3px 8px', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#fff' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
    th: { background: A, color: '#fff', padding: '6px 8px', textAlign: 'left', fontSize: 11 },
    td: { padding: '6px 8px', borderBottom: '1px solid #f1f1f1' },
    overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
    modal: { background: '#fff', borderRadius: 10, padding: 20, width: 380, maxHeight: '80vh', overflow: 'auto' },
  };

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div style={S.title}>欠款追收管理</div>
        <div style={S.tabs}>
          {[['list', '欠款列表'], ['add', '新增欠款'], ['aging', '帳齡分析']].map(([k, l]) =>
            <button key={k} style={S.tab(tab === k)} onClick={() => setTab(k)}>{l}</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={S.statRow}>
        <div style={S.stat}><div style={S.statVal}>{fmtM(stats.totalOwed)}</div><div style={S.statLbl}>總欠款額</div></div>
        <div style={S.stat}><div style={S.statVal}>{stats.openCount}</div><div style={S.statLbl}>未結清筆數</div></div>
        <div style={S.stat}><div style={S.statVal}>{stats.rate}%</div><div style={S.statLbl}>全數收回率</div></div>
        <div style={S.stat}><div style={S.statVal}>{stats.avgDays}</div><div style={S.statLbl}>平均收款天數</div></div>
      </div>

      {/* ── List Tab ── */}
      {tab === 'list' && (
        <div style={S.card}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input style={{ ...S.input, maxWidth: 260 }} placeholder="搜尋病人姓名/電話..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead><tr>
                {['病人', '電話', '應繳金額', '已繳', '尚欠', '帳單日期', '逾期天數', '狀態', '操作'].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={9} style={{ ...S.td, textAlign: 'center', color: '#aaa' }}>暫無欠款紀錄</td></tr>}
                {filtered.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate)).map(d => {
                  const days = daysBetween(d.invoiceDate, today());
                  const rem = remaining(d);
                  const closed = d.status === '已全數收回' || d.status === '已豁免';
                  return (
                    <tr key={d.id} style={{ background: closed ? '#f8faf8' : undefined }}>
                      <td style={S.td}><strong>{d.patientName}</strong></td>
                      <td style={S.td}>{d.patientPhone || '-'}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{fmtM(d.amount)}</td>
                      <td style={{ ...S.td, textAlign: 'right', color: '#16a34a' }}>{fmtM(paidFor(d.id))}</td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: rem > 0 ? '#dc2626' : '#16a34a' }}>{fmtM(rem)}</td>
                      <td style={S.td}>{d.invoiceDate}</td>
                      <td style={{ ...S.td, color: days > 90 ? '#991b1b' : days > 60 ? '#dc2626' : days > 30 ? '#ea580c' : '#d97706', fontWeight: 600 }}>{days}天</td>
                      <td style={S.td}><span style={badge(d.status)}>{d.status}</span></td>
                      <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                        {!closed && <button style={{ ...S.sm, background: '#16a34a', marginRight: 3 }} onClick={() => { setPayModal(d); setPayAmt(''); setPayNote(''); }}>收款</button>}
                        <button style={{ ...S.sm, background: '#2563eb', marginRight: 3 }} onClick={() => setStatusModal(d)}>狀態</button>
                        <button style={{ ...S.sm, background: '#059669', marginRight: 3 }} onClick={() => sendWhatsApp(d)} title="WhatsApp提醒">WA</button>
                        <button style={{ ...S.sm, background: '#7c3aed', marginRight: 3 }} onClick={() => logCall(d)} title="電話跟進">電話</button>
                        <button style={{ ...S.sm, background: '#0284c7', marginRight: 3 }} onClick={() => printLetter(d)} title="列印提醒函">函件</button>
                        <button style={{ ...S.sm, background: '#64748b', marginRight: 3 }} onClick={() => printStatement(d)} title="列印結算單">列印</button>
                        <button style={{ ...S.sm, background: '#ef4444' }} onClick={() => deleteDebt(d.id)}>刪</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add Tab ── */}
      {tab === 'add' && (
        <div style={S.card}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: A }}>新增欠款紀錄</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1/3', position: 'relative' }}>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, display: 'block' }}>病人</label>
              <input style={S.input} placeholder="輸入姓名或電話搜尋..." value={pSearch} onChange={e => { setPSearch(e.target.value); setForm(f => ({ ...f, patientId: '' })); }} />
              {form.patientId && <div style={{ fontSize: 12, color: '#16a34a', marginTop: 2 }}>已選：{patients.find(p => p.id === form.patientId)?.name}</div>}
              {pResults.length > 0 && !form.patientId && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, maxHeight: 180, overflow: 'auto', zIndex: 10 }}>
                  {pResults.map(p => (
                    <div key={p.id} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f1f1f1' }}
                      onClick={() => { setForm(f => ({ ...f, patientId: p.id })); setPSearch(p.name); }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0fdfa'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                      <strong>{p.name}</strong> <span style={{ color: '#888' }}>{p.phone || ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, display: 'block' }}>金額 ($)</label>
              <input style={S.input} type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, display: 'block' }}>帳單日期</label>
              <input style={S.input} type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1/3' }}>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, display: 'block' }}>服務描述</label>
              <input style={S.input} value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} placeholder="如：針灸治療、中藥處方..." />
            </div>
            <div style={{ gridColumn: '1/3' }}>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, display: 'block' }}>備註</label>
              <textarea style={{ ...S.input, minHeight: 50, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <button style={S.btn()} onClick={handleAdd}>新增欠款</button>
          </div>
        </div>
      )}

      {/* ── Aging Tab ── */}
      {tab === 'aging' && (
        <div style={S.card}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: A }}>帳齡分析</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            {aging.map(b => (
              <div key={b.label} style={{ background: '#f8fafc', borderRadius: 8, padding: 12, borderLeft: `4px solid ${b.color}` }}>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{b.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: b.color }}>{fmtM(b.total)}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{b.items.length} 筆</div>
              </div>
            ))}
          </div>
          {aging.filter(b => b.items.length > 0).map(b => (
            <div key={b.label} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: b.color, marginBottom: 6 }}>{b.label}（{b.items.length} 筆，共 {fmtM(b.total)}）</div>
              <table style={S.table}>
                <thead><tr>{['病人', '金額', '尚欠', '帳單日期', '逾期天數', '狀態'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>{b.items.map(d => (
                  <tr key={d.id}>
                    <td style={S.td}>{d.patientName}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{fmtM(d.amount)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>{fmtM(remaining(d))}</td>
                    <td style={S.td}>{d.invoiceDate}</td>
                    <td style={{ ...S.td, fontWeight: 600, color: b.color }}>{daysBetween(d.invoiceDate, today())}天</td>
                    <td style={S.td}><span style={badge(d.status)}>{d.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
          {aging.every(b => b.items.length === 0) && <p style={{ color: '#aaa', textAlign: 'center' }}>暫無未結清欠款</p>}
        </div>
      )}

      {/* ── Payment Modal ── */}
      {payModal && (
        <div style={S.overlay} onClick={() => setPayModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, color: A }}>記錄收款</h3>
            <p style={{ fontSize: 12, color: '#555' }}><strong>{payModal.patientName}</strong> — 尚欠 <span style={{ color: '#dc2626', fontWeight: 700 }}>{fmtM(remaining(payModal))}</span></p>
            <div style={{ margin: '10px 0' }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>收款金額 ($)</label>
              <input style={{ ...S.input, marginTop: 4 }} type="number" min="0" max={remaining(payModal)} step="0.01" value={payAmt} onChange={e => setPayAmt(e.target.value)} />
            </div>
            <div style={{ margin: '10px 0' }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>備註</label>
              <input style={{ ...S.input, marginTop: 4 }} value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="如：現金 / 轉帳..." />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button style={S.btn('#6b7280')} onClick={() => setPayModal(null)}>取消</button>
              <button style={S.btn('#16a34a')} onClick={() => { setPayAmt(String(remaining(payModal))); }}>全額</button>
              <button style={S.btn()} onClick={handlePay}>確認收款</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Status Modal ── */}
      {statusModal && (
        <div style={S.overlay} onClick={() => setStatusModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, color: A }}>更改狀態</h3>
            <p style={{ fontSize: 12, marginBottom: 10 }}><strong>{statusModal.patientName}</strong> — 目前：<span style={badge(statusModal.status)}>{statusModal.status}</span></p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {STATUSES.map(s => (
                <button key={s} style={{ ...S.btn(s === statusModal.status ? '#9ca3af' : badge(s).background), opacity: s === statusModal.status ? 0.5 : 1 }}
                  disabled={s === statusModal.status} onClick={() => changeStatus(statusModal.id, s)}>{s}</button>
              ))}
            </div>
            <div style={{ textAlign: 'right', marginTop: 14 }}><button style={S.btn('#6b7280')} onClick={() => setStatusModal(null)}>關閉</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
