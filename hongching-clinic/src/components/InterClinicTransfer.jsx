import { useState, useMemo } from 'react';
import { getStoreNames, uid } from '../data';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_transfers';
const today = () => new Date().toISOString().substring(0, 10);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } };
const save = arr => localStorage.setItem(LS_KEY, JSON.stringify(arr));

const STATUS_FLOW = [
  { key: 'pending',    label: '待確認', color: '#f59e0b', bg: '#fffbeb' },
  { key: 'confirmed',  label: '已確認', color: '#3b82f6', bg: '#eff6ff' },
  { key: 'shipping',   label: '運送中', color: '#8b5cf6', bg: '#f5f3ff' },
  { key: 'received',   label: '已收貨', color: '#10b981', bg: '#ecfdf5' },
  { key: 'completed',  label: '完成',   color: '#059669', bg: '#d1fae5' },
];
const CANCEL = { key: 'cancelled', label: '取消', color: '#ef4444', bg: '#fef2f2' };
const allStatuses = [...STATUS_FLOW, CANCEL];
const statusOf = k => allStatuses.find(s => s.key === k) || STATUS_FLOW[0];
const nextStatus = k => { const i = STATUS_FLOW.findIndex(s => s.key === k); return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : null; };

const A = '#0e7490';
const S = {
  page: { padding: 16, fontFamily: "'Microsoft YaHei',sans-serif", maxWidth: 1100, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, color: A, margin: '0 0 12px' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 10 },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' },
  select: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' },
  btn: (c = A) => ({ padding: '7px 16px', background: c, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  btnSm: (c = A) => ({ padding: '4px 10px', background: c, color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }),
  badge: (st) => ({ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: st.color, background: st.bg }),
  stat: (bg) => ({ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', textAlign: 'center', flex: '1 1 130px' }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', borderRadius: 10, padding: 20, width: '92%', maxWidth: 720, maxHeight: '85vh', overflowY: 'auto' },
  th: { padding: '6px 8px', textAlign: 'left', fontSize: 12, fontWeight: 700, borderBottom: '2px solid #e5e7eb', background: '#f8fafc' },
  td: { padding: '5px 8px', fontSize: 13, borderBottom: '1px solid #f0f0f0' },
};

const emptyForm = () => ({ fromStore: '', toStore: '', items: [{ name: '', qty: '', unit: 'g' }], notes: '', date: today() });

export default function InterClinicTransfer({ data, showToast, user }) {
  const STORES = getStoreNames();
  const clinicName = getClinicName();
  const [records, setRecords] = useState(load);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [expandId, setExpandId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  /* ---------- helpers ---------- */
  const persist = list => { setRecords(list); save(list); };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      return !q || r.fromStore?.toLowerCase().includes(q) || r.toStore?.toLowerCase().includes(q)
        || r.transferNo?.toLowerCase().includes(q) || r.items?.some(i => i.name?.toLowerCase().includes(q));
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [records, search, filterStatus]);

  const stats = useMemo(() => {
    const month = new Date().toISOString().substring(0, 7);
    const thisMonth = records.filter(r => r.date?.substring(0, 7) === month && r.status !== 'cancelled');
    const pending = records.filter(r => r.status === 'pending').length;
    const freq = {};
    thisMonth.forEach(r => r.items?.forEach(i => { freq[i.name] = (freq[i.name] || 0) + (Number(i.qty) || 0); }));
    const topItems = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { monthTotal: thisMonth.length, pending, topItems };
  }, [records]);

  /* ---------- actions ---------- */
  const handleCreate = () => {
    const items = form.items.filter(i => i.name.trim());
    if (!form.fromStore) return showToast('請選擇調出分店');
    if (!form.toStore) return showToast('請選擇調入分店');
    if (form.fromStore === form.toStore) return showToast('調出與調入分店不能相同');
    if (!items.length) return showToast('請至少加入一項藥材');
    const transferNo = `TF-${new Date().toISOString().substring(2, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const entry = {
      id: uid(), transferNo, fromStore: form.fromStore, toStore: form.toStore,
      items, notes: form.notes, date: form.date, status: 'pending',
      timeline: [{ status: 'pending', time: new Date().toISOString(), by: user?.name || '未知' }],
      createdBy: user?.name || '未知', createdAt: new Date().toISOString(),
    };
    persist([entry, ...records]);
    showToast('已建立調撥單');
    setShowForm(false);
    setForm(emptyForm());
  };

  const advanceStatus = (id) => {
    const updated = records.map(r => {
      if (r.id !== id) return r;
      const ns = nextStatus(r.status);
      if (!ns) return r;
      return { ...r, status: ns.key, timeline: [...(r.timeline || []), { status: ns.key, time: new Date().toISOString(), by: user?.name || '未知' }] };
    });
    persist(updated);
    const rec = updated.find(r => r.id === id);
    showToast(`已更新為「${statusOf(rec?.status).label}」`);
  };

  const cancelTransfer = (id) => {
    const updated = records.map(r => r.id === id ? { ...r, status: 'cancelled', timeline: [...(r.timeline || []), { status: 'cancelled', time: new Date().toISOString(), by: user?.name || '未知' }] } : r);
    persist(updated);
    showToast('已取消調撥單');
  };

  const handlePrint = (rec) => {
    const rows = rec.items.map((i, idx) => `<tr><td>${idx + 1}</td><td>${i.name}</td><td>${i.qty}</td><td>${i.unit}</td></tr>`).join('');
    const st = statusOf(rec.status);
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>調撥單 ${rec.transferNo}</title><style>body{font:12px sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ddd;padding:5px 8px;font-size:11px}th{background:#f3f4f6}h1{font-size:16px;margin:0 0 8px}p{margin:4px 0;font-size:12px}.row{display:flex;justify-content:space-between;margin-bottom:10px}.box{border:1px solid #ccc;border-radius:6px;padding:8px 12px;flex:1;margin:0 4px}.lbl{font-size:10px;color:#888}@media print{body{padding:10px}}</style></head><body><h1>${clinicName} — 跨店調撥單</h1><p>單號：<strong>${rec.transferNo}</strong> | 日期：${rec.date} | 狀態：${st.label}</p><div class="row"><div class="box"><div class="lbl">調出分店</div><strong>${rec.fromStore}</strong></div><div style="align-self:center;font-size:18px;padding:0 6px">→</div><div class="box"><div class="lbl">調入分店</div><strong>${rec.toStore}</strong></div></div><table><thead><tr><th>#</th><th>藥材/物品</th><th>數量</th><th>單位</th></tr></thead><tbody>${rows}</tbody></table>${rec.notes ? `<p>備註：${rec.notes}</p>` : ''}<p style="font-size:10px;color:#999;margin-top:20px">建立者：${rec.createdBy} | 列印時間：${new Date().toLocaleString('zh-HK')}</p><div style="display:flex;justify-content:space-between;margin-top:40px;font-size:11px"><div>調出方簽名：_______________</div><div>調入方簽名：_______________</div></div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  /* ---------- form helpers ---------- */
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { name: '', qty: '', unit: 'g' }] }));
  const removeItem = idx => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== idx) }));
  const updateItem = (idx, key, val) => setForm(f => ({ ...f, items: f.items.map((it, j) => j === idx ? { ...it, [key]: val } : it) }));

  /* ---------- render ---------- */
  return (
    <div style={S.page}>
      <div style={{ ...S.row, marginBottom: 12 }}>
        <h2 style={S.h1}>跨店調撥</h2>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setShowForm(true); setForm(emptyForm()); }} style={S.btn()}>+ 新增調撥</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={S.stat()}><div style={{ fontSize: 22, fontWeight: 700, color: A }}>{stats.monthTotal}</div><div style={{ fontSize: 11, color: '#888' }}>本月調撥</div></div>
        <div style={S.stat()}><div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{stats.pending}</div><div style={{ fontSize: 11, color: '#888' }}>待確認</div></div>
        <div style={S.stat()}><div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{stats.topItems.length ? stats.topItems.map(([n, q]) => `${n}(${q})`).join('、') : '-'}</div><div style={{ fontSize: 11, color: '#888' }}>本月熱門調撥品項</div></div>
      </div>

      {/* Filters */}
      <div style={{ ...S.row, marginBottom: 12 }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...S.select, width: 120 }}>
          <option value="all">全部狀態</option>
          {allStatuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋分店/單號/藥材..." style={{ ...S.input, flex: 1, minWidth: 150 }} />
      </div>

      {/* List */}
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>沒有調撥紀錄</div>}
      {filtered.map(r => {
        const st = statusOf(r.status);
        const expanded = expandId === r.id;
        const ns = nextStatus(r.status);
        return (
          <div key={r.id} style={S.card}>
            <div style={{ ...S.row, cursor: 'pointer' }} onClick={() => setExpandId(expanded ? null : r.id)}>
              <strong style={{ color: A }}>{r.transferNo}</strong>
              <span style={S.badge(st)}>{st.label}</span>
              <span style={{ fontSize: 12, color: '#555' }}>{r.fromStore} → {r.toStore}</span>
              <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>{r.date}</span>
              <span style={{ fontSize: 11, color: '#aaa' }}>{expanded ? '▲' : '▼'}</span>
            </div>
            <div style={{ fontSize: 13, color: '#444', marginTop: 4 }}>
              {r.items.slice(0, 4).map(i => `${i.name}×${i.qty}${i.unit}`).join('、')}{r.items.length > 4 ? ` ...+${r.items.length - 4}` : ''}
            </div>

            {expanded && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                  <thead><tr><th style={S.th}>#</th><th style={S.th}>藥材/物品</th><th style={S.th}>數量</th><th style={S.th}>單位</th></tr></thead>
                  <tbody>
                    {r.items.map((it, idx) => (
                      <tr key={idx}><td style={S.td}>{idx + 1}</td><td style={S.td}>{it.name}</td><td style={S.td}>{it.qty}</td><td style={S.td}>{it.unit}</td></tr>
                    ))}
                  </tbody>
                </table>
                {r.notes && <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>備註：{r.notes}</div>}

                {/* Timeline */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 4 }}>狀態歷程</div>
                  {(r.timeline || []).map((t, i) => {
                    const ts = statusOf(t.status);
                    return (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 2 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: ts.color, flexShrink: 0 }} />
                        <span style={{ color: ts.color, fontWeight: 600 }}>{ts.label}</span>
                        <span style={{ color: '#888' }}>{new Date(t.time).toLocaleString('zh-HK')}</span>
                        <span style={{ color: '#aaa' }}>by {t.by}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {ns && r.status !== 'cancelled' && <button onClick={() => advanceStatus(r.id)} style={S.btnSm(ns.color)}>推進至「{ns.label}」</button>}
                  {r.status !== 'completed' && r.status !== 'cancelled' && <button onClick={() => cancelTransfer(r.id)} style={S.btnSm('#ef4444')}>取消</button>}
                  <button onClick={() => handlePrint(r)} style={S.btnSm('#6b7280')}>列印調撥單</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* New Transfer Modal */}
      {showForm && (
        <div style={S.overlay} onClick={() => setShowForm(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', color: A }}>新增跨店調撥</h3>
            <div style={{ ...S.row, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>調出分店</div>
                <select value={form.fromStore} onChange={e => setForm(f => ({ ...f, fromStore: e.target.value }))} style={{ ...S.select, width: 160 }}>
                  <option value="">— 選擇 —</option>
                  {STORES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ alignSelf: 'flex-end', fontSize: 18, padding: '0 4px' }}>→</div>
              <div>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>調入分店</div>
                <select value={form.toStore} onChange={e => setForm(f => ({ ...f, toStore: e.target.value }))} style={{ ...S.select, width: 160 }}>
                  <option value="">— 選擇 —</option>
                  {STORES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>日期</div>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ ...S.input, width: 140 }} />
              </div>
            </div>

            {/* Items */}
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#333' }}>調撥品項</div>
            {form.items.map((it, idx) => (
              <div key={idx} style={{ ...S.row, marginBottom: 6 }}>
                <input value={it.name} onChange={e => updateItem(idx, 'name', e.target.value)} placeholder="藥材名稱" style={{ ...S.input, flex: 1, minWidth: 120 }} />
                <input type="number" value={it.qty} onChange={e => updateItem(idx, 'qty', e.target.value)} placeholder="數量" style={{ ...S.input, width: 70 }} />
                <select value={it.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} style={{ ...S.select, width: 60 }}>
                  {['g', 'kg', '包', '瓶', '盒', '支', '片', '個'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                {form.items.length > 1 && <button onClick={() => removeItem(idx)} style={{ ...S.btnSm('#ef4444'), padding: '3px 8px' }}>✕</button>}
              </div>
            ))}
            <button onClick={addItem} style={{ ...S.btnSm('#6b7280'), marginBottom: 10 }}>+ 加入品項</button>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>備註</div>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="選填" style={{ ...S.input, width: '100%' }} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={S.btn('#6b7280')}>取消</button>
              <button onClick={handleCreate} style={S.btn()}>建立調撥單</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
