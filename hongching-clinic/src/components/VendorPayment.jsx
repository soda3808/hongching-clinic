import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { fmtM } from '../data';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const A = '#0e7490';
const KEY = 'hcmc_vendor_payments';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const save = (arr) => localStorage.setItem(KEY, JSON.stringify(arr));
const today = () => new Date().toISOString().substring(0, 10);
const STATUS_MAP = { '未付': { c: '#dc2626', bg: '#fef2f2' }, '部分付': { c: '#d97706', bg: '#fffbeb' }, '已付': { c: '#16a34a', bg: '#f0fdf4' } };
const METHODS = ['現金', '轉賬', '支票'];
const blank = () => ({ vendor: '', invoiceNumber: '', amount: '', paymentDate: today(), dueDate: '', status: '未付', paymentMethod: '現金', chequeNumber: '', notes: '' });

export default function VendorPayment({ data, showToast, user }) {
  const [records, setRecords] = useState(load);
  const [form, setForm] = useState(blank);
  const [tab, setTab] = useState('list'); // list | schedule | history
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState(null);
  const [batch, setBatch] = useState(new Set());
  const [historyVendor, setHistoryVendor] = useState('');

  const persist = (arr) => { setRecords(arr); save(arr); };

  // --- Stats ---
  const stats = useMemo(() => {
    const unpaid = records.filter(r => r.status !== '已付');
    const totalPayable = unpaid.reduce((s, r) => s + Number(r.amount || 0), 0);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const overdue = unpaid.filter(r => r.dueDate && new Date(r.dueDate) < now);
    const overdueAmt = overdue.reduce((s, r) => s + Number(r.amount || 0), 0);
    const mo = today().substring(0, 7);
    const thisMonth = records.filter(r => r.status === '已付' && (r.paymentDate || '').startsWith(mo)).reduce((s, r) => s + Number(r.amount || 0), 0);
    return { totalPayable, overdueAmt, thisMonth, overdueCount: overdue.length };
  }, [records]);

  // --- Aging ---
  const aging = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const b = { current: [], d30: [], d60: [], d90: [] };
    records.filter(r => r.status !== '已付').forEach(r => {
      if (!r.dueDate) { b.current.push(r); return; }
      const days = Math.floor((now - new Date(r.dueDate)) / 86400000);
      if (days <= 0) b.current.push(r);
      else if (days <= 30) b.d30.push(r);
      else if (days <= 60) b.d60.push(r);
      else b.d90.push(r);
    });
    const sum = a => a.reduce((s, r) => s + Number(r.amount || 0), 0);
    return [
      { label: '未到期', key: 'current', items: b.current, total: sum(b.current), color: '#16a34a' },
      { label: '1-30天', key: 'd30', items: b.d30, total: sum(b.d30), color: '#d97706' },
      { label: '31-60天', key: 'd60', items: b.d60, total: sum(b.d60), color: '#ea580c' },
      { label: '90天+', key: 'd90', items: b.d90, total: sum(b.d90), color: '#991b1b' },
    ];
  }, [records]);

  // --- Schedule (upcoming 30 days) ---
  const schedule = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const limit = new Date(now); limit.setDate(limit.getDate() + 30);
    return records.filter(r => r.status !== '已付' && r.dueDate && new Date(r.dueDate) >= now && new Date(r.dueDate) <= limit)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [records]);

  // --- Vendor list for history ---
  const vendors = useMemo(() => [...new Set(records.map(r => r.vendor).filter(Boolean))].sort(), [records]);
  const vendorHistory = useMemo(() => {
    if (!historyVendor) return [];
    return records.filter(r => r.vendor === historyVendor).sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
  }, [records, historyVendor]);

  // --- Filtered list ---
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter(r => !q || r.vendor?.toLowerCase().includes(q) || r.invoiceNumber?.toLowerCase().includes(q) || r.notes?.toLowerCase().includes(q))
      .sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
  }, [records, search]);

  // --- Handlers ---
  const handleSave = () => {
    if (!form.vendor || !form.amount) return showToast('請填寫供應商及金額');
    const rec = { ...form, id: editId || uid(), amount: parseFloat(form.amount), createdBy: user?.name || '', createdAt: editId ? (records.find(r => r.id === editId)?.createdAt || new Date().toISOString()) : new Date().toISOString() };
    const arr = editId ? records.map(r => r.id === editId ? rec : r) : [...records, rec];
    persist(arr);
    showToast(editId ? '已更新付款紀錄' : '已新增付款紀錄');
    setForm(blank()); setEditId(null);
  };

  const handleEdit = (r) => { setForm({ vendor: r.vendor, invoiceNumber: r.invoiceNumber || '', amount: String(r.amount), paymentDate: r.paymentDate || '', dueDate: r.dueDate || '', status: r.status, paymentMethod: r.paymentMethod || '現金', chequeNumber: r.chequeNumber || '', notes: r.notes || '' }); setEditId(r.id); setTab('list'); };

  const handleDelete = (id) => { if (!confirm('確認刪除此付款紀錄？')) return; persist(records.filter(r => r.id !== id)); showToast('已刪除'); };

  const handleStatus = (id, s) => { persist(records.map(r => r.id === id ? { ...r, status: s } : r)); showToast(`已更新為「${s}」`); };

  // --- Batch ---
  const toggleBatch = (id) => { const n = new Set(batch); n.has(id) ? n.delete(id) : n.add(id); setBatch(n); };
  const batchPay = () => {
    if (!batch.size) return showToast('請先勾選付款項目');
    persist(records.map(r => batch.has(r.id) ? { ...r, status: '已付', paymentDate: today() } : r));
    showToast(`已批量標記 ${batch.size} 筆為已付`); setBatch(new Set());
  };

  // --- Print voucher ---
  const printVoucher = (r) => {
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>付款憑證</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:40px;max-width:600px;margin:0 auto}
      h1{color:${A};font-size:20px;border-bottom:3px solid ${A};padding-bottom:10px}
      .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;font-size:13px}
      .label{color:#666;min-width:100px}.val{font-weight:600}
      .amount{font-size:28px;color:${A};font-weight:800;text-align:center;margin:20px 0}
      .footer{text-align:center;font-size:9px;color:#aaa;margin-top:40px;border-top:1px solid #ddd;padding-top:12px}
      .sig{display:flex;justify-content:space-between;margin-top:50px;font-size:12px}
      .sig div{text-align:center;width:40%;border-top:1px solid #333;padding-top:6px}
    </style></head><body>
      <h1>${getClinicName()} - 付款憑證</h1>
      <p style="font-size:11px;color:#888">列印日期：${today()}</p>
      <div class="amount">${fmtM(r.amount)}</div>
      <div class="row"><span class="label">供應商</span><span class="val">${r.vendor}</span></div>
      <div class="row"><span class="label">發票編號</span><span class="val">${r.invoiceNumber || '-'}</span></div>
      <div class="row"><span class="label">付款日期</span><span class="val">${r.paymentDate || '-'}</span></div>
      <div class="row"><span class="label">到期日</span><span class="val">${r.dueDate || '-'}</span></div>
      <div class="row"><span class="label">付款方式</span><span class="val">${r.paymentMethod || '-'}</span></div>
      ${r.chequeNumber ? `<div class="row"><span class="label">支票號碼</span><span class="val">${r.chequeNumber}</span></div>` : ''}
      <div class="row"><span class="label">狀態</span><span class="val">${r.status}</span></div>
      <div class="row"><span class="label">備註</span><span class="val">${r.notes || '-'}</span></div>
      <div class="sig"><div>經手人簽署</div><div>批核人簽署</div></div>
      <div class="footer">${getClinicName()} - 此憑證由系統自動生成</div>
    </body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  // --- Print aging report ---
  const printAging = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const rows = aging.map(b => `<tr><td style="font-weight:600;color:${b.color}">${b.label}</td><td style="text-align:right">${b.items.length}</td><td style="text-align:right;font-weight:700">${fmtM(b.total)}</td></tr>`).join('');
    const detail = aging.filter(b => b.items.length).map(b =>
      `<tr style="background:#f3f4f6"><td colspan="5" style="font-weight:700;color:${b.color}">${b.label} (${b.items.length}筆)</td></tr>` +
      b.items.map(r => `<tr><td>${r.vendor}</td><td>${r.invoiceNumber || '-'}</td><td style="text-align:right">${fmtM(r.amount)}</td><td>${r.dueDate || '-'}</td><td>${r.notes || '-'}</td></tr>`).join('')
    ).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>應付帳齡報告</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:30px;max-width:800px;margin:0 auto}
      h1{color:${A};font-size:18px;border-bottom:3px solid ${A};padding-bottom:8px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0}
      th{background:${A};color:#fff;padding:6px 8px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #eee}
      .footer{text-align:center;font-size:9px;color:#aaa;margin-top:20px}
    </style></head><body>
      <h1>${getClinicName()} - 供應商應付帳齡分析</h1>
      <p style="font-size:12px;color:#888">生成日期：${today()}</p>
      <h3>摘要</h3><table><thead><tr><th>帳齡</th><th style="text-align:right">筆數</th><th style="text-align:right">金額</th></tr></thead><tbody>${rows}</tbody></table>
      <h3>明細</h3><table><thead><tr><th>供應商</th><th>發票號</th><th style="text-align:right">金額</th><th>到期日</th><th>備註</th></tr></thead><tbody>${detail}</tbody></table>
      <div class="footer">此報表由系統自動生成</div>
    </body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  const sty = {
    tabs: { display: 'flex', gap: 0, marginBottom: 16, borderBottom: `2px solid ${A}20` },
    tab: (active) => ({ padding: '10px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer', border: 'none', background: active ? A : 'transparent', color: active ? '#fff' : '#666', borderRadius: '8px 8px 0 0', transition: 'all .2s' }),
    card: { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: '0 1px 4px #0001' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 },
    label: { fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 3, display: 'block' },
    input: { width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' },
    btn: (bg, c) => ({ padding: '7px 16px', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer', background: bg, color: c || '#fff' }),
    tag: (s) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700, color: STATUS_MAP[s]?.c || '#666', background: STATUS_MAP[s]?.bg || '#f3f4f6' }),
    statCard: (c) => ({ background: `${c}10`, borderRadius: 10, padding: 14, textAlign: 'center', border: `1px solid ${c}25` }),
  };

  return (
    <>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10, marginBottom: 14 }}>
        <div style={sty.statCard(A)}>
          <div style={{ fontSize: 11, color: A, fontWeight: 600 }}>應付總額</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: A }}>{fmtM(stats.totalPayable)}</div>
        </div>
        <div style={sty.statCard('#dc2626')}>
          <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>逾期金額</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{fmtM(stats.overdueAmt)}</div>
          <div style={{ fontSize: 10, color: '#999' }}>{stats.overdueCount} 筆逾期</div>
        </div>
        <div style={sty.statCard('#16a34a')}>
          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>本月已付</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>{fmtM(stats.thisMonth)}</div>
        </div>
        <div style={sty.statCard('#6366f1')}>
          <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>供應商數</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#6366f1' }}>{vendors.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={sty.tabs}>
        {[['list', '付款紀錄'], ['schedule', '付款排程'], ['aging', '帳齡分析'], ['history', '供應商歷史']].map(([k, l]) =>
          <button key={k} style={sty.tab(tab === k)} onClick={() => setTab(k)}>{l}</button>
        )}
      </div>

      {/* ===== TAB: List ===== */}
      {tab === 'list' && <>
        {/* Form */}
        <div style={sty.card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: A }}>{editId ? '編輯付款' : '新增付款'}</div>
          <div style={sty.grid}>
            <div><label style={sty.label}>供應商 *</label><input style={sty.input} placeholder="供應商名稱" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} list="vendor-list" /><datalist id="vendor-list">{vendors.map(v => <option key={v} value={v} />)}</datalist></div>
            <div><label style={sty.label}>發票編號</label><input style={sty.input} placeholder="INV-001" value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} /></div>
            <div><label style={sty.label}>金額 ($) *</label><input style={sty.input} type="number" min="0" step="0.01" placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div><label style={sty.label}>付款日期</label><input style={sty.input} type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} /></div>
            <div><label style={sty.label}>到期日</label><input style={sty.input} type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
            <div><label style={sty.label}>狀態</label><select style={sty.input} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>{Object.keys(STATUS_MAP).map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label style={sty.label}>付款方式</label><select style={sty.input} value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}>{METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
            {form.paymentMethod === '支票' && <div><label style={sty.label}>支票號碼</label><input style={sty.input} placeholder="支票號碼" value={form.chequeNumber} onChange={e => setForm(f => ({ ...f, chequeNumber: e.target.value }))} /></div>}
            <div><label style={sty.label}>備註</label><input style={sty.input} placeholder="備註" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button style={sty.btn(A)} onClick={handleSave}>{editId ? '更新' : '+ 新增'}</button>
            {editId && <button style={sty.btn('#6b7280')} onClick={() => { setForm(blank()); setEditId(null); }}>取消</button>}
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ ...sty.card, padding: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input style={{ ...sty.input, maxWidth: 220 }} placeholder="搜尋供應商/發票..." value={search} onChange={e => setSearch(e.target.value)} />
          {batch.size > 0 && <button style={sty.btn('#16a34a')} onClick={batchPay}>批量付款 ({batch.size})</button>}
          <button style={sty.btn('#f3f4f6', '#333')} onClick={printAging}>列印帳齡報告</button>
        </div>

        {/* Table */}
        <div style={{ ...sty.card, padding: 0, overflow: 'auto', maxHeight: 500 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: A, color: '#fff' }}>
              <th style={{ padding: '8px 6px', textAlign: 'center', width: 30 }}><input type="checkbox" onChange={e => { if (e.target.checked) { setBatch(new Set(filtered.filter(r => r.status !== '已付').map(r => r.id))); } else setBatch(new Set()); }} /></th>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>供應商</th>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>發票號</th>
              <th style={{ padding: '8px 6px', textAlign: 'right' }}>金額</th>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>付款日</th>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>到期日</th>
              <th style={{ padding: '8px 6px', textAlign: 'center' }}>狀態</th>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>方式</th>
              <th style={{ padding: '8px 6px', textAlign: 'center' }}>操作</th>
            </tr></thead>
            <tbody>
              {!filtered.length && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>未有紀錄</td></tr>}
              {filtered.map(r => {
                const overdue = r.status !== '已付' && r.dueDate && new Date(r.dueDate) < new Date(today());
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: r.status === '已付' ? 0.55 : 1, background: overdue ? '#fef2f2' : 'transparent' }}>
                    <td style={{ padding: '6px', textAlign: 'center' }}>{r.status !== '已付' && <input type="checkbox" checked={batch.has(r.id)} onChange={() => toggleBatch(r.id)} />}</td>
                    <td style={{ padding: '6px', fontWeight: 600 }}>{r.vendor}</td>
                    <td style={{ padding: '6px', color: '#666' }}>{r.invoiceNumber || '-'}</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, color: A }}>{fmtM(r.amount)}</td>
                    <td style={{ padding: '6px' }}>{r.paymentDate || '-'}</td>
                    <td style={{ padding: '6px', color: overdue ? '#dc2626' : 'inherit', fontWeight: overdue ? 700 : 400 }}>{r.dueDate || '-'}{overdue && ' !'}</td>
                    <td style={{ padding: '6px', textAlign: 'center' }}><span style={sty.tag(r.status)}>{r.status}</span></td>
                    <td style={{ padding: '6px', fontSize: 11 }}>{r.paymentMethod}{r.chequeNumber ? ` #${r.chequeNumber}` : ''}</td>
                    <td style={{ padding: '6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {r.status !== '已付' && <button style={{ ...sty.btn('#16a34a'), padding: '3px 8px', marginRight: 3 }} onClick={() => handleStatus(r.id, '已付')}>已付</button>}
                      {r.status === '未付' && <button style={{ ...sty.btn('#d97706'), padding: '3px 8px', marginRight: 3 }} onClick={() => handleStatus(r.id, '部分付')}>部分</button>}
                      <button style={{ ...sty.btn('#f3f4f6', A), padding: '3px 8px', marginRight: 3 }} onClick={() => handleEdit(r)}>編輯</button>
                      <button style={{ ...sty.btn('#f3f4f6', A), padding: '3px 8px', marginRight: 3 }} onClick={() => printVoucher(r)}>憑證</button>
                      <button style={{ ...sty.btn('#fef2f2', '#dc2626'), padding: '3px 8px' }} onClick={() => handleDelete(r.id)}>刪除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}

      {/* ===== TAB: Schedule ===== */}
      {tab === 'schedule' && (
        <div style={sty.card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: A }}>未來 30 天付款排程 ({schedule.length} 筆)</div>
          {!schedule.length && <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>暫無即將到期的付款</div>}
          {schedule.map(r => {
            const days = Math.ceil((new Date(r.dueDate) - new Date(today())) / 86400000);
            const urgent = days <= 7;
            return (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #f0f0f0', background: urgent ? '#fffbeb' : 'transparent' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.vendor}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{r.invoiceNumber || '-'} | {r.notes || ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: A, fontSize: 15 }}>{fmtM(r.amount)}</div>
                  <div style={{ fontSize: 11, color: urgent ? '#dc2626' : '#888', fontWeight: urgent ? 700 : 400 }}>{r.dueDate} ({days} 天後)</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={{ ...sty.btn('#16a34a'), padding: '4px 10px' }} onClick={() => handleStatus(r.id, '已付')}>標記已付</button>
                  <button style={{ ...sty.btn('#f3f4f6', A), padding: '4px 10px' }} onClick={() => printVoucher(r)}>憑證</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== TAB: Aging ===== */}
      {tab === 'aging' && (
        <div style={sty.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: A }}>帳齡分析</div>
            <button style={sty.btn(A)} onClick={printAging}>列印報告</button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {aging.map(b => (
              <div key={b.key} style={{ flex: 1, minWidth: 130, padding: 14, borderRadius: 10, border: `2px solid ${b.color}25`, background: `${b.color}08`, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: b.color, fontWeight: 600 }}>{b.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: b.color }}>{fmtM(b.total)}</div>
                <div style={{ fontSize: 10, color: '#999' }}>{b.items.length} 筆</div>
              </div>
            ))}
          </div>
          {aging.filter(b => b.items.length > 0).map(b => (
            <div key={b.key} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: b.color, marginBottom: 4 }}>{b.label}</div>
              {b.items.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', fontSize: 12, borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontWeight: 600, minWidth: 120 }}>{r.vendor}</span>
                  <span style={{ color: '#888' }}>{r.invoiceNumber || '-'}</span>
                  <span style={{ color: b.color, fontWeight: 700 }}>{fmtM(r.amount)}</span>
                  <span style={{ color: '#aaa' }}>{r.dueDate || '-'}</span>
                  <button style={{ ...sty.btn('#16a34a'), padding: '2px 8px', fontSize: 10 }} onClick={() => handleStatus(r.id, '已付')}>已付</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ===== TAB: History ===== */}
      {tab === 'history' && (
        <div style={sty.card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: A }}>供應商付款歷史</div>
          <select style={{ ...sty.input, maxWidth: 280, marginBottom: 14 }} value={historyVendor} onChange={e => setHistoryVendor(e.target.value)}>
            <option value="">-- 選擇供應商 --</option>
            {vendors.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          {historyVendor && <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={sty.statCard(A)}><div style={{ fontSize: 10, color: A }}>總付款</div><div style={{ fontSize: 18, fontWeight: 800, color: A }}>{fmtM(vendorHistory.reduce((s, r) => s + Number(r.amount || 0), 0))}</div></div>
              <div style={sty.statCard('#16a34a')}><div style={{ fontSize: 10, color: '#16a34a' }}>已付</div><div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>{fmtM(vendorHistory.filter(r => r.status === '已付').reduce((s, r) => s + Number(r.amount || 0), 0))}</div></div>
              <div style={sty.statCard('#dc2626')}><div style={{ fontSize: 10, color: '#dc2626' }}>未付</div><div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626' }}>{fmtM(vendorHistory.filter(r => r.status !== '已付').reduce((s, r) => s + Number(r.amount || 0), 0))}</div></div>
              <div style={sty.statCard('#6366f1')}><div style={{ fontSize: 10, color: '#6366f1' }}>紀錄數</div><div style={{ fontSize: 18, fontWeight: 800, color: '#6366f1' }}>{vendorHistory.length}</div></div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: '#f8f8f8' }}>
                <th style={{ padding: 6, textAlign: 'left' }}>日期</th><th style={{ padding: 6, textAlign: 'left' }}>發票號</th><th style={{ padding: 6, textAlign: 'right' }}>金額</th><th style={{ padding: 6, textAlign: 'center' }}>狀態</th><th style={{ padding: 6, textAlign: 'left' }}>方式</th><th style={{ padding: 6, textAlign: 'left' }}>備註</th><th style={{ padding: 6 }}>操作</th>
              </tr></thead>
              <tbody>{vendorHistory.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: 6 }}>{r.paymentDate || '-'}</td>
                  <td style={{ padding: 6, color: '#666' }}>{r.invoiceNumber || '-'}</td>
                  <td style={{ padding: 6, textAlign: 'right', fontWeight: 700, color: A }}>{fmtM(r.amount)}</td>
                  <td style={{ padding: 6, textAlign: 'center' }}><span style={sty.tag(r.status)}>{r.status}</span></td>
                  <td style={{ padding: 6 }}>{r.paymentMethod}</td>
                  <td style={{ padding: 6, color: '#888' }}>{r.notes || '-'}</td>
                  <td style={{ padding: 6 }}><button style={{ ...sty.btn('#f3f4f6', A), padding: '2px 8px' }} onClick={() => printVoucher(r)}>憑證</button></td>
                </tr>
              ))}</tbody>
            </table>
          </>}
          {!historyVendor && <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>請選擇供應商查看歷史紀錄</div>}
        </div>
      )}
    </>
  );
}
