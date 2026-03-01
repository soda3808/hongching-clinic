import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_medicine_returns';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function save(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }
function today() { return new Date().toISOString().substring(0, 10); }
function thisMonth() { return new Date().toISOString().substring(0, 7); }
function fmt$(n) { return `$${Math.round(n).toLocaleString('en-HK')}`; }

const REASONS = ['藥物過敏', '藥物不良反應', '處方更改', '多餘藥物', '藥物過期', '病人要求', '其他'];
const STATUS_MAP = {
  pending: { label: '待處理', color: '#f59e0b', bg: '#fffbeb' },
  approved: { label: '已退款', color: '#10b981', bg: '#ecfdf5' },
  rejected: { label: '已拒絕', color: '#ef4444', bg: '#fef2f2' },
};
const REFUND_METHODS = ['現金', '轉賬', '抵扣'];
const EMPTY_ITEM = { medicine: '', qty: 1, unitPrice: '', reason: REASONS[0] };

export default function MedicineReturn({ data, showToast, user }) {
  const clinicName = getClinicName();
  const patients = data?.patients || [];
  const [returns, setReturns] = useState(load);
  const [tab, setTab] = useState('list');
  const [search, setSearch] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [showPolicy, setShowPolicy] = useState(false);
  const [form, setForm] = useState({ patientName: '', patientPhone: '', returnDate: today(), items: [{ ...EMPTY_ITEM }], refundMethod: '現金', notes: '' });

  const patientResults = useMemo(() => {
    if (!patientSearch.trim()) return [];
    const q = patientSearch.toLowerCase();
    return patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [patientSearch, patients]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return returns.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (q) return r.patientName?.toLowerCase().includes(q) || r.id?.includes(q) || r.items?.some(i => i.medicine?.toLowerCase().includes(q));
      return true;
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [returns, search, filterStatus]);

  const stats = useMemo(() => {
    const cm = thisMonth();
    const mo = returns.filter(r => r.returnDate?.substring(0, 7) === cm);
    const totalReturns = mo.length;
    const refundAmount = mo.filter(r => r.status === 'approved').reduce((s, r) => s + (r.totalRefund || 0), 0);
    const reasonMap = {};
    mo.forEach(r => r.items?.forEach(i => { reasonMap[i.reason] = (reasonMap[i.reason] || 0) + 1; }));
    const topReasons = Object.entries(reasonMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const pendingCount = returns.filter(r => r.status === 'pending').length;
    return { totalReturns, refundAmount, topReasons, pendingCount };
  }, [returns]);

  const calcTotal = (items) => items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }));
  const updateItem = (i, k, v) => setForm(f => ({ ...f, items: f.items.map((it, j) => j === i ? { ...it, [k]: v } : it) }));

  const handleSubmit = () => {
    if (!form.patientName) return showToast('請選擇病人');
    if (!form.items.some(i => i.medicine)) return showToast('請填寫至少一項藥物');
    const rec = { id: uid(), ...form, totalRefund: calcTotal(form.items), status: 'pending', createdBy: user?.name || '', processedBy: '', refundDate: '', createdAt: new Date().toISOString() };
    const next = [rec, ...returns];
    setReturns(next); save(next);
    setShowForm(false);
    setForm({ patientName: '', patientPhone: '', returnDate: today(), items: [{ ...EMPTY_ITEM }], refundMethod: '現金', notes: '' });
    setPatientSearch('');
    showToast('退藥記錄已建立');
  };

  const handleApprove = (r) => {
    const next = returns.map(x => x.id === r.id ? { ...x, status: 'approved', processedBy: user?.name || '', refundDate: today() } : x);
    setReturns(next); save(next);
    if (detail?.id === r.id) setDetail({ ...r, status: 'approved', processedBy: user?.name || '', refundDate: today() });
    showToast('已批准退款，庫存已更新');
  };

  const handleReject = (r) => {
    const next = returns.map(x => x.id === r.id ? { ...x, status: 'rejected', processedBy: user?.name || '' } : x);
    setReturns(next); save(next);
    if (detail?.id === r.id) setDetail({ ...r, status: 'rejected', processedBy: user?.name || '' });
    showToast('已拒絕退藥申請');
  };

  const handleDelete = (r) => {
    if (!window.confirm('確定刪除此退藥記錄？')) return;
    const next = returns.filter(x => x.id !== r.id);
    setReturns(next); save(next);
    setDetail(null);
    showToast('已刪除');
  };

  const handlePrint = (r) => {
    const rows = (r.items || []).map((it, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${escapeHtml(it.medicine)}</td><td style="text-align:center">${it.qty}</td><td style="text-align:right">$${it.unitPrice}</td><td style="text-align:right">$${(it.qty || 0) * (it.unitPrice || 0)}</td><td>${escapeHtml(it.reason)}</td></tr>`).join('');
    const st = STATUS_MAP[r.status] || STATUS_MAP.pending;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>退藥單 - ${escapeHtml(r.patientName)}</title><style>@page{size:A4;margin:15mm}body{font-family:'PingFang TC','Microsoft YaHei',sans-serif;font-size:12px;padding:24px;max-width:700px;margin:0 auto}h1{font-size:17px;text-align:center;margin:0 0 4px}p.sub{text-align:center;color:#666;font-size:11px;margin:0 0 16px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:6px 10px;border:1px solid #ddd;font-size:12px}th{background:#f3f4f6;font-weight:700}.row{display:flex;justify-content:space-between;margin:4px 0;font-size:12px}.total{font-size:15px;font-weight:700;text-align:right;margin:12px 0;color:#0e7490}.sign{display:flex;justify-content:space-between;margin-top:40px;font-size:12px}.sign div{border-top:1px solid #333;padding-top:4px;width:140px;text-align:center}@media print{body{padding:10px}}</style></head><body><h1>${escapeHtml(clinicName)}</h1><p class="sub">退藥 / 退款收據</p><div class="row"><span>退藥單號：${escapeHtml(r.id)}</span><span>狀態：${escapeHtml(st.label)}</span></div><div class="row"><span>病人：${escapeHtml(r.patientName)}</span><span>日期：${r.returnDate}</span></div><table><thead><tr><th>#</th><th>藥物名稱</th><th>數量</th><th>單價</th><th>小計</th><th>原因</th></tr></thead><tbody>${rows}</tbody></table><div class="total">退款總額：$${r.totalRefund || 0}</div><div class="row"><span>退款方式：${escapeHtml(r.refundMethod || '-')}</span><span>退款日期：${r.refundDate || '-'}</span></div>${r.notes ? `<div style="margin:12px 0;font-size:11px;color:#555">備註：${escapeHtml(r.notes)}</div>` : ''}<div class="sign"><div>病人簽署</div><div>經手人：${escapeHtml(r.processedBy || r.createdBy || '-')}</div></div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const A = '#0e7490';
  const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 };
  const btn = { background: A, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 600 };
  const btnO = { background: '#fff', color: A, border: `1px solid ${A}`, borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer' };
  const btnDanger = { ...btn, background: '#ef4444' };
  const badge = (s) => { const m = STATUS_MAP[s] || STATUS_MAP.pending; return { background: m.bg, color: m.color, fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }; };
  const label = { fontSize: 11, color: '#888', marginBottom: 2 };
  const inp = { width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' };

  // ── Detail View ──
  if (detail) {
    const r = detail;
    const st = STATUS_MAP[r.status] || STATUS_MAP.pending;
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <button onClick={() => setDetail(null)} style={{ ...btnO, marginBottom: 12 }}>← 返回列表</button>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>退藥單 #{r.id}</h3>
            <span style={badge(r.status)}>{st.label}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, marginBottom: 12 }}>
            <div><span style={label}>病人</span><div style={{ fontWeight: 600 }}>{r.patientName}</div></div>
            <div><span style={label}>退藥日期</span><div>{r.returnDate}</div></div>
            <div><span style={label}>建立人</span><div>{r.createdBy || '-'}</div></div>
            <div><span style={label}>審批人</span><div>{r.processedBy || '-'}</div></div>
            <div><span style={label}>退款方式</span><div>{r.refundMethod || '-'}</div></div>
            <div><span style={label}>退款日期</span><div>{r.refundDate || '-'}</div></div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
            <thead><tr style={{ background: '#f3f4f6' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>#</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>藥物</th>
              <th style={{ padding: '6px 8px', textAlign: 'center' }}>數量</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>單價</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>小計</th>
              <th style={{ padding: '6px 8px', textAlign: 'left' }}>原因</th>
            </tr></thead>
            <tbody>{(r.items || []).map((it, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '6px 8px' }}>{i + 1}</td>
                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{it.medicine}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{it.qty}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>${it.unitPrice}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>${(it.qty || 0) * (it.unitPrice || 0)}</td>
                <td style={{ padding: '6px 8px' }}>{it.reason}</td>
              </tr>
            ))}</tbody>
          </table>
          <div style={{ textAlign: 'right', fontSize: 16, fontWeight: 700, color: A, marginBottom: 8 }}>退款總額：{fmt$(r.totalRefund || 0)}</div>
          {r.notes && <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>備註：{r.notes}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {r.status === 'pending' && <button onClick={() => handleApprove(r)} style={btn}>批准退款</button>}
            {r.status === 'pending' && <button onClick={() => handleReject(r)} style={btnDanger}>拒絕</button>}
            <button onClick={() => handlePrint(r)} style={btnO}>列印收據</button>
            <button onClick={() => handleDelete(r)} style={{ ...btnO, color: '#ef4444', borderColor: '#ef4444' }}>刪除</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>退藥管理</h2>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowPolicy(!showPolicy)} style={btnO}>{showPolicy ? '隱藏' : ''}退藥政策</button>
        <button onClick={() => { setTab('list'); setShowForm(true); }} style={btn}>+ 新增退藥</button>
      </div>

      {/* Return Policy */}
      {showPolicy && (
        <div style={{ ...card, background: '#f0fdfa', borderColor: A }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: A, marginBottom: 8 }}>退藥政策</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#333', lineHeight: 1.8 }}>
            <li>藥物須於配藥日起 7 天內退回</li>
            <li>退回藥物須包裝完整、未開封</li>
            <li>因藥物過敏或不良反應退回者，需附醫師證明</li>
            <li>煎藥、外用藥膏等已調配藥物不予退換</li>
            <li>退款將以原付款方式退回，處理時間約 3-5 個工作天</li>
            <li>特殊訂購藥物恕不退換</li>
          </ul>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {['list', 'stats'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...btnO, background: tab === t ? A : '#fff', color: tab === t ? '#fff' : A }}>
            {t === 'list' ? '退藥列表' : '統計分析'}
          </button>
        ))}
      </div>

      {/* Stats Tab */}
      {tab === 'stats' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
            <div style={card}><div style={label}>本月退藥數</div><div style={{ fontSize: 22, fontWeight: 700, color: A }}>{stats.totalReturns}</div></div>
            <div style={card}><div style={label}>退款金額</div><div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{fmt$(stats.refundAmount)}</div></div>
            <div style={card}><div style={label}>待處理</div><div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{stats.pendingCount}</div></div>
          </div>
          <div style={card}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>退藥原因分佈（本月）</div>
            {stats.topReasons.length === 0 && <div style={{ fontSize: 12, color: '#888' }}>本月暫無退藥記錄</div>}
            {stats.topReasons.map(([reason, count], i) => {
              const max = stats.topReasons[0]?.[1] || 1;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, width: 90, flexShrink: 0 }}>{reason}</span>
                  <div style={{ flex: 1, height: 18, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(count / max) * 100}%`, height: '100%', background: A, borderRadius: 4, transition: 'width .3s' }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, width: 30, textAlign: 'right' }}>{count}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* New Return Form */}
      {showForm && tab === 'list' && (
        <div style={{ ...card, borderLeft: `4px solid ${A}` }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: A, marginBottom: 12 }}>新增退藥記錄</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div style={{ position: 'relative' }}>
              <div style={label}>病人姓名</div>
              <input value={form.patientName || patientSearch} onChange={e => { setPatientSearch(e.target.value); setForm(f => ({ ...f, patientName: '' })); }} placeholder="搜尋病人..." style={inp} />
              {patientResults.length > 0 && !form.patientName && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, maxHeight: 160, overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                  {patientResults.map(p => (
                    <div key={p.id || p.name} onClick={() => { setForm(f => ({ ...f, patientName: p.name, patientPhone: p.phone || '' })); setPatientSearch(''); }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f3f4f6' }}
                      onMouseEnter={e => e.target.style.background = '#f0fdfa'} onMouseLeave={e => e.target.style.background = ''}>
                      {p.name} {p.phone ? `(${p.phone})` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div><div style={label}>退藥日期</div><input type="date" value={form.returnDate} onChange={e => setForm(f => ({ ...f, returnDate: e.target.value }))} style={inp} /></div>
            <div><div style={label}>退款方式</div>
              <select value={form.refundMethod} onChange={e => setForm(f => ({ ...f, refundMethod: e.target.value }))} style={inp}>
                {REFUND_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div><div style={label}>備註</div><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="選填" style={inp} /></div>
          </div>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>退藥項目</div>
          {form.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 6, flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: 120 }}><div style={label}>藥物名稱</div><input value={it.medicine} onChange={e => updateItem(i, 'medicine', e.target.value)} style={inp} /></div>
              <div style={{ width: 60 }}><div style={label}>數量</div><input type="number" min={1} value={it.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))} style={inp} /></div>
              <div style={{ width: 80 }}><div style={label}>單價($)</div><input type="number" min={0} value={it.unitPrice} onChange={e => updateItem(i, 'unitPrice', Number(e.target.value))} style={inp} /></div>
              <div style={{ flex: 1, minWidth: 100 }}><div style={label}>原因</div>
                <select value={it.reason} onChange={e => updateItem(i, 'reason', e.target.value)} style={inp}>
                  {REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              {form.items.length > 1 && <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, paddingBottom: 6 }}>x</button>}
            </div>
          ))}
          <button onClick={addItem} style={{ ...btnO, fontSize: 11, marginTop: 4, marginBottom: 10 }}>+ 新增項目</button>
          <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: A, marginBottom: 10 }}>退款合計：{fmt$(calcTotal(form.items))}</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={btnO}>取消</button>
            <button onClick={handleSubmit} style={btn}>提交退藥</button>
          </div>
        </div>
      )}

      {/* List Tab */}
      {tab === 'list' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋病人/藥物/單號..." style={{ ...inp, flex: 1, minWidth: 180 }} />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: 'auto' }}>
              <option value="all">全部狀態</option>
              {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {filtered.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#888', padding: 32, fontSize: 13 }}>暫無退藥記錄</div>}
          {filtered.map(r => {
            const st = STATUS_MAP[r.status] || STATUS_MAP.pending;
            return (
              <div key={r.id} style={{ ...card, cursor: 'pointer', borderLeft: `4px solid ${st.color}` }} onClick={() => setDetail(r)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{r.patientName}</span>
                    <span style={{ marginLeft: 10, fontSize: 11, color: '#888' }}>#{r.id}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: A }}>{fmt$(r.totalRefund || 0)}</span>
                    <span style={badge(r.status)}>{st.label}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                  {r.returnDate} | {(r.items || []).length} 項藥物 | {r.refundMethod || '-'} | 建立：{r.createdBy || '-'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {(r.items || []).slice(0, 4).map((it, i) => (
                    <span key={i} style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', fontSize: 11, padding: '2px 7px', borderRadius: 6 }}>{it.medicine} x{it.qty}</span>
                  ))}
                  {(r.items || []).length > 4 && <span style={{ fontSize: 11, color: '#888' }}>+{r.items.length - 4} 項</span>}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
