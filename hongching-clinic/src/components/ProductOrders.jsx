import { useState, useMemo } from 'react';
import { uid, getStoreNames } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';
import { S as ES, ECTCM } from '../styles/ectcm';

const LS_KEY = 'hcmc_product_orders';
const STATUSES = [
  { key: 'pending', label: '待付款', color: '#f59e0b', bg: '#fffbeb' },
  { key: 'paid', label: '已付款', color: '#3b82f6', bg: '#eff6ff' },
  { key: 'shipped', label: '已發貨', color: '#8b5cf6', bg: '#f5f3ff' },
  { key: 'completed', label: '已完成', color: '#10b981', bg: '#ecfdf5' },
  { key: 'cancelled', label: '已取消', color: '#ef4444', bg: '#fef2f2' },
];
const statusMap = Object.fromEntries(STATUSES.map(s => [s.key, s]));
const PAYMENTS = ['現金', 'FPS', '信用卡', 'PayMe', '八達通'];

function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function save(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }
function fmt$(n) { return `$${Math.round(n).toLocaleString('en-HK')}`; }
function today() { return new Date().toISOString().substring(0, 10); }
function thisMonth() { return new Date().toISOString().substring(0, 7); }

const EMPTY_FORM = { buyer: '', phone: '', seller: '', store: '', payment: '現金', items: [{ name: '', qty: 1, price: '' }], notes: '' };

export default function ProductOrders({ data, showToast, user }) {
  const [orders, setOrders] = useState(load);
  const [tab, setTab] = useState('list');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStore, setFilterStore] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, items: [{ name: '', qty: 1, price: '' }] });
  const [detail, setDetail] = useState(null);

  const STORES = getStoreNames();
  const clinicName = getClinicName();
  const staff = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_employees') || '[]').map(e => e.name); } catch { return []; }
  }, []);

  // Filtered orders
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(o => {
      if (filterStatus !== 'all' && o.status !== filterStatus) return false;
      if (filterStore !== 'all' && o.store !== filterStore) return false;
      if (dateFrom && o.createdAt?.substring(0, 10) < dateFrom) return false;
      if (dateTo && o.createdAt?.substring(0, 10) > dateTo) return false;
      if (q) return o.orderNo?.toLowerCase().includes(q) || o.buyer?.toLowerCase().includes(q) || o.seller?.toLowerCase().includes(q) || o.items?.some(i => i.name?.toLowerCase().includes(q));
      return true;
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [orders, search, filterStatus, filterStore, dateFrom, dateTo]);

  // Revenue stats
  const stats = useMemo(() => {
    const cm = thisMonth();
    const mo = orders.filter(o => o.createdAt?.substring(0, 7) === cm && o.status !== 'cancelled');
    const cancelled = orders.filter(o => o.createdAt?.substring(0, 7) === cm && o.status === 'cancelled');
    const totalSales = mo.reduce((s, o) => s + (o.paidAmount || 0), 0);
    const refund = cancelled.reduce((s, o) => s + (o.totalAmount || 0), 0);
    // Top 5 products
    const prodMap = {};
    mo.forEach(o => o.items?.forEach(i => { const k = i.name || '未命名'; prodMap[k] = (prodMap[k] || 0) + (Number(i.qty) || 0) * (Number(i.price) || 0); }));
    const top5 = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    // Monthly trend (last 6 months)
    const months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); months.push(d.toISOString().substring(0, 7)); }
    const trend = months.map(m => ({ month: m, total: orders.filter(o => o.createdAt?.substring(0, 7) === m && o.status !== 'cancelled').reduce((s, o) => s + (o.paidAmount || 0), 0) }));
    // Payment breakdown
    const payMap = {};
    mo.forEach(o => { payMap[o.payment || '其他'] = (payMap[o.payment || '其他'] || 0) + (o.paidAmount || 0); });
    return { totalSales, count: mo.length, avg: mo.length ? totalSales / mo.length : 0, refund, top5, trend, payMap };
  }, [orders]);

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { name: '', qty: 1, price: '' }] }));
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }));
  const updateItem = (i, k, v) => setForm(f => ({ ...f, items: f.items.map((it, j) => j === i ? { ...it, [k]: v } : it) }));

  const handleSave = () => {
    if (!form.buyer) return showToast('請輸入購買人');
    const items = form.items.filter(i => i.name);
    if (!items.length) return showToast('請至少加入一項商品');
    const totalAmount = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0);
    const orderNo = `SO-${today().replace(/-/g, '').substring(2)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const entry = { id: uid(), orderNo, buyer: form.buyer, phone: form.phone, seller: form.seller || user?.name || '', store: form.store || STORES[0] || '', payment: form.payment, items, totalAmount, paidAmount: form.payment ? totalAmount : 0, itemCount: items.reduce((s, i) => s + (Number(i.qty) || 0), 0), notes: form.notes, status: 'pending', createdAt: new Date().toISOString(), createdBy: user?.name || '' };
    const updated = [...orders, entry];
    setOrders(updated); save(updated);
    showToast('已建立訂單');
    setShowForm(false);
    setForm({ ...EMPTY_FORM, items: [{ name: '', qty: 1, price: '' }] });
  };

  const updateStatus = (id, status) => {
    const updated = orders.map(o => o.id === id ? { ...o, status, ...(status === 'paid' ? { paidAmount: o.totalAmount } : {}), ...(status === 'cancelled' ? { paidAmount: 0 } : {}) } : o);
    setOrders(updated); save(updated);
    showToast(`已更新為「${statusMap[status]?.label}」`);
    if (detail?.id === id) setDetail({ ...detail, status });
  };

  const handlePrint = (o) => {
    const rows = o.items.map((i, idx) => `<tr><td>${idx + 1}</td><td>${escapeHtml(i.name)}</td><td>${i.qty}</td><td>$${Number(i.price || 0).toFixed(2)}</td><td>$${((Number(i.qty) || 0) * (Number(i.price) || 0)).toFixed(2)}</td></tr>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>訂單 ${escapeHtml(o.orderNo)}</title><style>body{font:12px sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ddd;padding:5px 8px;font-size:11px}th{background:#f3f4f6}h1{font-size:16px;margin:0}@media print{body{padding:10px}}</style></head><body><h1>${escapeHtml(clinicName)} — 銷售訂單</h1><p>單號：<b>${escapeHtml(o.orderNo)}</b> | 購買人：<b>${escapeHtml(o.buyer)}</b> | 店舖：${escapeHtml(o.store)} | 支付：${escapeHtml(o.payment)}</p><table><thead><tr><th>#</th><th>商品</th><th>數量</th><th>單價</th><th>小計</th></tr></thead><tbody>${rows}</tbody></table><p style="text-align:right;font-weight:700">訂單金額：${fmt$(o.totalAmount)} | 已付：${fmt$(o.paidAmount || 0)}</p>${o.notes ? `<p>備註：${escapeHtml(o.notes)}</p>` : ''}<p style="font-size:10px;color:#999;margin-top:20px">銷售員：${escapeHtml(o.seller)} | 列印時間：${new Date().toLocaleString('zh-HK')}</p></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  const handleExport = () => {
    const header = '訂單編號\t購買人\t銷售員\t店舖\t訂單金額\t已付款\t商品總數\t支付方式\t狀態\t創建時間';
    const rows = filtered.map(o => `${o.orderNo}\t${o.buyer}\t${o.seller}\t${o.store}\t${o.totalAmount}\t${o.paidAmount || 0}\t${o.itemCount}\t${o.payment}\t${statusMap[o.status]?.label || o.status}\t${o.createdAt?.substring(0, 10)}`);
    navigator.clipboard.writeText([header, ...rows].join('\n')).then(() => showToast('已複製到剪貼板'));
  };

  const trendMax = Math.max(...stats.trend.map(t => t.total), 1);
  const top5Max = stats.top5.length ? stats.top5[0][1] : 1;
  const payTotal = Object.values(stats.payMap).reduce((a, b) => a + b, 0) || 1;

  const S = { card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }, badge: (st) => ({ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, display: 'inline-block' }) };

  return (
    <div style={ES.page}>
      <div style={ES.titleBar}>商品管理 &gt; 訂單管理</div>
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>🛒 商品訂單管理</h2>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
          {[['list', '訂單列表'], ['stats', '收入統計']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === k ? 700 : 400, background: tab === k ? '#0e7490' : 'transparent', color: tab === k ? '#fff' : '#555' }}>{label}</button>
          ))}
        </div>
      </div>

      {tab === 'list' && <>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" style={{ width: 140 }} />
          <span style={{ color: '#999', fontSize: 12 }}>至</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" style={{ width: 140 }} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input" style={{ width: 120 }}>
            <option value="all">全部狀態</option>
            {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select value={filterStore} onChange={e => setFilterStore(e.target.value)} className="input" style={{ width: 120 }}>
            <option value="all">全部店舖</option>
            {STORES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋單號/購買人/商品..." className="input" style={{ flex: 1, minWidth: 150 }} />
          <button onClick={handleExport} className="btn btn-outline" style={{ fontSize: 12 }}>📋 匯出</button>
          <button onClick={() => { setShowForm(true); setForm({ ...EMPTY_FORM, store: STORES[0] || '', items: [{ name: '', qty: 1, price: '' }] }); }} className="btn btn-primary">+ 新增訂單</button>
        </div>

        {/* Order table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff', borderRadius: 8 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['訂單編號', '購買人', '銷售員', '診所', '訂單金額', '已付款金額', '商品詳情', '商品總數', '支付方式', '訂單狀態', '創建時間', '操作'].map(h => (
                  <th key={h} style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: 11, color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={12} style={{ textAlign: 'center', padding: 40, color: '#999' }}>沒有訂單</td></tr>}
              {filtered.map(o => {
                const st = statusMap[o.status] || statusMap.pending;
                return (
                  <tr key={o.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px', fontWeight: 600, color: '#0e7490', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setDetail(o)}>{o.orderNo}</td>
                    <td style={{ padding: '6px' }}>{o.buyer}</td>
                    <td style={{ padding: '6px' }}>{o.seller}</td>
                    <td style={{ padding: '6px' }}>{o.store}</td>
                    <td style={{ padding: '6px', fontWeight: 600 }}>{fmt$(o.totalAmount)}</td>
                    <td style={{ padding: '6px' }}>{fmt$(o.paidAmount || 0)}</td>
                    <td style={{ padding: '6px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.items?.map(i => `${i.name}×${i.qty}`).join('、')}</td>
                    <td style={{ padding: '6px', textAlign: 'center' }}>{o.itemCount}</td>
                    <td style={{ padding: '6px' }}>{o.payment}</td>
                    <td style={{ padding: '6px' }}><span style={S.badge(st)}>{st.label}</span></td>
                    <td style={{ padding: '6px', whiteSpace: 'nowrap', color: '#888' }}>{o.createdAt?.substring(0, 10)}</td>
                    <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => setDetail(o)} className="btn btn-outline" style={{ fontSize: 10, padding: '2px 6px', marginRight: 4 }}>詳情</button>
                      <button onClick={() => handlePrint(o)} className="btn btn-outline" style={{ fontSize: 10, padding: '2px 6px' }}>🖨️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>共 {filtered.length} 筆訂單</div>
      </>}

      {tab === 'stats' && <>
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 16 }}>
          {[['本月銷售額', fmt$(stats.totalSales), '#0e7490'], ['訂單數', stats.count, '#3b82f6'], ['平均訂單金額', fmt$(stats.avg), '#8b5cf6'], ['退款金額', fmt$(stats.refund), '#ef4444']].map(([l, v, c]) => (
            <div key={l} style={S.card}><div style={{ fontSize: 22, fontWeight: 700, color: c }}>{v}</div><div style={{ fontSize: 11, color: '#888' }}>{l}</div></div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Top 5 products */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Top 5 商品 (按收入)</div>
            {stats.top5.length === 0 && <div style={{ color: '#999', fontSize: 12 }}>本月暫無數據</div>}
            {stats.top5.map(([name, val], i) => (
              <div key={name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                  <span>{i + 1}. {name}</span><span style={{ fontWeight: 600 }}>{fmt$(val)}</span>
                </div>
                <div style={{ background: '#f3f4f6', borderRadius: 4, height: 14 }}>
                  <div style={{ width: `${(val / top5Max) * 100}%`, background: '#0e7490', borderRadius: 4, height: 14 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Payment breakdown */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>支付方式分佈</div>
            {Object.keys(stats.payMap).length === 0 && <div style={{ color: '#999', fontSize: 12 }}>本月暫無數據</div>}
            {Object.entries(stats.payMap).sort((a, b) => b[1] - a[1]).map(([method, val]) => (
              <div key={method} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                  <span>{method}</span><span style={{ fontWeight: 600 }}>{fmt$(val)} ({Math.round(val / payTotal * 100)}%)</span>
                </div>
                <div style={{ background: '#f3f4f6', borderRadius: 4, height: 12 }}>
                  <div style={{ width: `${(val / payTotal) * 100}%`, background: '#3b82f6', borderRadius: 4, height: 12 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly trend */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>近 6 個月銷售趨勢</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
            {stats.trend.map(t => (
              <div key={t.month} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2 }}>{t.total ? fmt$(t.total) : '-'}</div>
                <div style={{ background: '#0e7490', borderRadius: '4px 4px 0 0', height: `${Math.max((t.total / trendMax) * 90, 2)}px`, margin: '0 auto', width: '70%' }} />
                <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>{t.month.substring(5)}月</div>
              </div>
            ))}
          </div>
        </div>
      </>}

      {/* Create Order Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '95%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 12px' }}>新增商品訂單</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={form.buyer} onChange={e => setForm(f => ({ ...f, buyer: e.target.value }))} placeholder="購買人姓名 *" className="input" style={{ flex: 1 }} />
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="手機號碼" className="input" style={{ width: 140 }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={form.seller} onChange={e => setForm(f => ({ ...f, seller: e.target.value }))} className="input" style={{ flex: 1 }}>
                  <option value="">選擇銷售員</option>
                  {staff.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={form.store} onChange={e => setForm(f => ({ ...f, store: e.target.value }))} className="input" style={{ flex: 1 }}>
                  {STORES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={form.payment} onChange={e => setForm(f => ({ ...f, payment: e.target.value }))} className="input" style={{ width: 110 }}>
                  {PAYMENTS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>商品列表：</div>
              {form.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} placeholder="商品名稱" className="input" style={{ flex: 2 }} />
                  <input type="number" value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} placeholder="數量" className="input" style={{ width: 65 }} min={1} />
                  <input type="number" value={item.price} onChange={e => updateItem(i, 'price', e.target.value)} placeholder="單價$" className="input" style={{ width: 80 }} />
                  <span style={{ fontSize: 12, color: '#888', minWidth: 55, textAlign: 'right' }}>{fmt$((Number(item.qty) || 0) * (Number(item.price) || 0))}</span>
                  {form.items.length > 1 && <button onClick={() => removeItem(i)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18 }}>×</button>}
                </div>
              ))}
              <button onClick={addItem} className="btn btn-outline" style={{ fontSize: 12 }}>+ 加商品</button>
              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 14 }}>
                合計：{fmt$(form.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0))}
              </div>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="備註（可選）" className="input" rows={2} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} className="btn btn-outline">取消</button>
              <button onClick={handleSave} className="btn btn-primary">建立訂單</button>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }} onClick={() => setDetail(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '95%', maxWidth: 550, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>訂單詳情</h3>
              <span style={S.badge(statusMap[detail.status] || statusMap.pending)}>{(statusMap[detail.status] || statusMap.pending).label}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13, marginBottom: 12 }}>
              <div><span style={{ color: '#888' }}>單號：</span><b>{detail.orderNo}</b></div>
              <div><span style={{ color: '#888' }}>購買人：</span>{detail.buyer}</div>
              <div><span style={{ color: '#888' }}>手機：</span>{detail.phone || '-'}</div>
              <div><span style={{ color: '#888' }}>銷售員：</span>{detail.seller}</div>
              <div><span style={{ color: '#888' }}>店舖：</span>{detail.store}</div>
              <div><span style={{ color: '#888' }}>支付方式：</span>{detail.payment}</div>
              <div><span style={{ color: '#888' }}>創建時間：</span>{detail.createdAt?.substring(0, 10)}</div>
              {detail.notes && <div style={{ gridColumn: '1/3' }}><span style={{ color: '#888' }}>備註：</span>{detail.notes}</div>}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 10 }}>
              <thead><tr style={{ background: '#f9fafb' }}>{['#', '商品', '數量', '單價', '小計'].map(h => <th key={h} style={{ padding: '6px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>{h}</th>)}</tr></thead>
              <tbody>{detail.items?.map((it, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '5px 6px' }}>{i + 1}</td>
                  <td style={{ padding: '5px 6px' }}>{it.name}</td>
                  <td style={{ padding: '5px 6px' }}>{it.qty}</td>
                  <td style={{ padding: '5px 6px' }}>{fmt$(Number(it.price) || 0)}</td>
                  <td style={{ padding: '5px 6px', fontWeight: 600 }}>{fmt$((Number(it.qty) || 0) * (Number(it.price) || 0))}</td>
                </tr>
              ))}</tbody>
            </table>
            <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>訂單金額：{fmt$(detail.totalAmount)} | 已付：{fmt$(detail.paidAmount || 0)}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {detail.status === 'pending' && <button onClick={() => { updateStatus(detail.id, 'paid'); setDetail(d => ({ ...d, status: 'paid', paidAmount: d.totalAmount })); }} className="btn btn-primary" style={{ fontSize: 12 }}>確認付款</button>}
              {detail.status === 'paid' && <button onClick={() => { updateStatus(detail.id, 'shipped'); setDetail(d => ({ ...d, status: 'shipped' })); }} className="btn btn-primary" style={{ fontSize: 12 }}>標記發貨</button>}
              {(detail.status === 'shipped' || detail.status === 'paid') && <button onClick={() => { updateStatus(detail.id, 'completed'); setDetail(d => ({ ...d, status: 'completed' })); }} className="btn btn-primary" style={{ fontSize: 12 }}>完成訂單</button>}
              {detail.status !== 'cancelled' && detail.status !== 'completed' && <button onClick={() => { updateStatus(detail.id, 'cancelled'); setDetail(d => ({ ...d, status: 'cancelled', paidAmount: 0 })); }} className="btn btn-outline" style={{ fontSize: 12, color: '#ef4444' }}>取消訂單</button>}
              <button onClick={() => handlePrint(detail)} className="btn btn-outline" style={{ fontSize: 12 }}>🖨️ 列印</button>
              <button onClick={() => setDetail(null)} className="btn btn-outline" style={{ fontSize: 12 }}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
