import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';

const LS_LIST = 'hcmc_price_list';
const LS_HIST = 'hcmc_price_history';
const ACCENT = '#0e7490';
const CATS = ['診金', '針灸', '推拿', '拔罐', '中藥', '檢查', '其他'];
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const today = () => new Date().toISOString().substring(0, 10);
const load = (k, fb = []) => { try { return JSON.parse(localStorage.getItem(k)) || fb; } catch { return fb; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const fmtD = n => `$${Number(n || 0).toLocaleString()}`;

const S = {
  card: { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  input: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' },
  select: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' },
  btn: (c = ACCENT) => ({ padding: '6px 14px', background: c, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  label: { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 2, display: 'block' },
  th: { padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, borderBottom: '2px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' },
  td: { padding: '6px', fontSize: 13, borderBottom: '1px solid #f0f0f0' },
  tag: { background: '#e0f2fe', color: ACCENT, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 },
  tab: a => ({ padding: '8px 20px', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? ACCENT : '#666', borderBottom: a ? `2px solid ${ACCENT}` : '2px solid transparent', marginBottom: -2, background: 'none', border: 'none', fontSize: 14 }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', borderRadius: 10, padding: 20, width: '90%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' },
};

const EMPTY = { name: '', category: '診金', price: '', memberPrice: '', description: '', isActive: true, sortOrder: 0 };

export default function PriceList({ data, showToast, user }) {
  const [items, setItems] = useState(() => load(LS_LIST));
  const [history, setHistory] = useState(() => load(LS_HIST));
  const [tab, setTab] = useState('list');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCat, setBulkCat] = useState('all');
  const [bulkPct, setBulkPct] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');

  const saveItems = l => { setItems(l); save(LS_LIST, l); };
  const logHist = entries => { const u = [...entries, ...history].slice(0, 500); setHistory(u); save(LS_HIST, u); };

  // --- Filtered / sorted list ---
  const filtered = useMemo(() => {
    let l = [...items];
    if (filterCat !== 'all') l = l.filter(i => i.category === filterCat);
    if (search) { const q = search.toLowerCase(); l = l.filter(i => i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q)); }
    return l.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name, 'zh-Hant'));
  }, [items, search, filterCat]);

  // --- Stats ---
  const stats = useMemo(() => {
    const active = items.filter(i => i.isActive !== false);
    const avgPrice = active.length ? Math.round(active.reduce((s, i) => s + Number(i.price || 0), 0) / active.length) : 0;
    const withMember = active.filter(i => i.memberPrice > 0).length;
    return { total: items.length, active: active.length, avgPrice, withMember, cats: [...new Set(items.map(i => i.category))].length };
  }, [items]);

  // --- CRUD ---
  const openAdd = () => { setEditId(null); setForm({ ...EMPTY, sortOrder: items.length }); setShowForm(true); };
  const openEdit = item => { setEditId(item.id); setForm({ ...item }); setShowForm(true); };

  const handleSave = () => {
    if (!form.name.trim()) return showToast('請輸入項目名稱');
    if (!form.price && form.price !== 0) return showToast('請輸入價格');
    const record = { ...form, id: editId || uid(), price: Number(form.price) || 0, memberPrice: Number(form.memberPrice) || 0, sortOrder: Number(form.sortOrder) || 0 };
    if (editId) {
      const old = items.find(i => i.id === editId);
      if (old && Number(old.price) !== record.price) {
        logHist([{ id: uid(), date: today(), item: record.name, oldPrice: old.price, newPrice: record.price, reason: '手動更新', user: user?.name || '系統' }]);
      }
      saveItems(items.map(i => i.id === editId ? record : i));
      showToast('項目已更新');
    } else {
      saveItems([...items, record]);
      showToast('項目已新增');
    }
    setShowForm(false); setEditId(null);
  };

  const handleDelete = id => { saveItems(items.filter(i => i.id !== id)); showToast('項目已刪除'); };
  const toggleActive = id => {
    saveItems(items.map(i => i.id === id ? { ...i, isActive: !i.isActive } : i));
    showToast('狀態已更新');
  };

  // --- Bulk adjust ---
  const applyBulk = () => {
    const pct = parseFloat(bulkPct);
    if (!pct || isNaN(pct)) return showToast('請輸入有效百分比');
    const entries = [], updated = items.map(i => {
      if (bulkCat !== 'all' && i.category !== bulkCat) return i;
      if (i.isActive === false) return i;
      const oldP = Number(i.price || 0);
      const newP = Math.round(oldP * (1 + pct / 100));
      const oldM = Number(i.memberPrice || 0);
      const newM = oldM > 0 ? Math.round(oldM * (1 + pct / 100)) : 0;
      entries.push({ id: uid(), date: today(), item: i.name, oldPrice: oldP, newPrice: newP, reason: bulkReason || `批量調整 ${pct > 0 ? '+' : ''}${pct}%`, user: user?.name || '系統' });
      return { ...i, price: newP, memberPrice: newM };
    });
    saveItems(updated); logHist(entries);
    setBulkOpen(false); setBulkPct(''); setBulkReason('');
    showToast(`已調整 ${entries.length} 個項目價格`);
  };

  // --- Import / Export ---
  const handleExport = () => {
    const header = '名稱,類別,價格,會員價,描述,排序,啟用';
    const rows = items.map(i => [i.name, i.category, i.price, i.memberPrice || '', i.description || '', i.sortOrder || 0, i.isActive !== false ? 'Y' : 'N'].map(c => `"${c}"`).join(','));
    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `price_list_${today()}.csv`; a.click();
    showToast('價目表已匯出');
  };

  const handleImport = () => {
    if (!importText.trim()) return showToast('請貼上資料');
    const newItems = [];
    importText.trim().split('\n').forEach(line => {
      const cols = line.split('\t');
      if (cols.length < 2) return;
      const name = cols[0]?.trim(), price = parseFloat(cols[1]);
      if (!name || isNaN(price)) return;
      newItems.push({ id: uid(), name, category: cols[2]?.trim() || '其他', price, memberPrice: parseFloat(cols[3]) || 0, description: cols[4]?.trim() || '', isActive: true, sortOrder: items.length + newItems.length });
    });
    if (!newItems.length) return showToast('未能解析任何項目');
    saveItems([...items, ...newItems]);
    setShowImport(false); setImportText('');
    showToast(`已匯入 ${newItems.length} 個項目`);
  };

  // --- Print ---
  const handlePrint = () => {
    const clinic = getClinicName();
    const activeItems = items.filter(i => i.isActive !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const grouped = {};
    activeItems.forEach(i => { (grouped[i.category] = grouped[i.category] || []).push(i); });
    const catHtml = CATS.filter(c => grouped[c]?.length).map(c => `
      <h2 style="color:${ACCENT};font-size:16px;border-bottom:2px solid ${ACCENT};padding-bottom:4px;margin:18px 0 8px">${c}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f8fafc"><th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">項目</th><th style="text-align:right;padding:6px;border-bottom:1px solid #ddd">收費</th><th style="text-align:right;padding:6px;border-bottom:1px solid #ddd">會員價</th><th style="text-align:left;padding:6px;border-bottom:1px solid #ddd">備註</th></tr></thead>
        <tbody>${grouped[c].map(i => `<tr><td style="padding:5px 6px;border-bottom:1px solid #f0f0f0">${i.name}</td><td style="text-align:right;padding:5px 6px;border-bottom:1px solid #f0f0f0;font-weight:600">${fmtD(i.price)}</td><td style="text-align:right;padding:5px 6px;border-bottom:1px solid #f0f0f0;color:#059669">${i.memberPrice > 0 ? fmtD(i.memberPrice) : '-'}</td><td style="padding:5px 6px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#888">${i.description || ''}</td></tr>`).join('')}</tbody>
      </table>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${clinic} 價目表</title><style>body{font-family:'Microsoft YaHei',sans-serif;padding:30px;max-width:800px;margin:0 auto}@media print{body{padding:10px}}</style></head><body><h1 style="text-align:center;color:${ACCENT};margin-bottom:4px">${clinic}</h1><p style="text-align:center;color:#666;font-size:13px;margin-top:0">服務及收費價目表 (${today()})</p>${catHtml}<p style="text-align:center;color:#999;font-size:11px;margin-top:24px">* 以上價格僅供參考，實際收費以診所為準</p></body></html>`);
    w.document.close(); w.print();
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: '總項目', value: stats.total, color: ACCENT },
          { label: '啟用中', value: stats.active, color: '#059669' },
          { label: '平均收費', value: fmtD(stats.avgPrice), color: '#d97706' },
          { label: '設有會員價', value: stats.withMember, color: '#7c3aed' },
        ].map((s, i) => (
          <div key={i} style={{ ...S.card, textAlign: 'center', marginBottom: 0 }}>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 }}>
        <button style={S.tab(tab === 'list')} onClick={() => setTab('list')}>價目表</button>
        <button style={S.tab(tab === 'compare')} onClick={() => setTab('compare')}>會員對比</button>
        <button style={S.tab(tab === 'history')} onClick={() => setTab('history')}>調價紀錄</button>
      </div>

      {/* ── Price List Tab ── */}
      {tab === 'list' && <>
        <div style={S.card}>
          <div style={S.row}>
            <input style={{ ...S.input, width: 180 }} placeholder="搜尋項目..." value={search} onChange={e => setSearch(e.target.value)} />
            <select style={S.select} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="all">全部類別</option>
              {CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={S.btn()} onClick={openAdd}>+ 新增項目</button>
              <button style={S.btn('#7c3aed')} onClick={() => setBulkOpen(!bulkOpen)}>批量調價</button>
              <button style={S.btn('#059669')} onClick={handlePrint}>列印價目表</button>
              <button style={S.btn('#6366f1')} onClick={handleExport}>匯出</button>
              <button style={S.btn('#d97706')} onClick={() => setShowImport(true)}>匯入</button>
            </div>
          </div>
          {bulkOpen && (
            <div style={{ background: '#f0fdfa', border: `1px solid ${ACCENT}33`, borderRadius: 8, padding: 12, marginTop: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: ACCENT, marginBottom: 8 }}>批量調整價格</div>
              <div style={S.row}>
                <select style={S.select} value={bulkCat} onChange={e => setBulkCat(e.target.value)}>
                  <option value="all">全部類別</option>
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input style={{ ...S.input, width: 90 }} type="number" placeholder="例：+5 或 -10" value={bulkPct} onChange={e => setBulkPct(e.target.value)} />
                <span style={{ fontSize: 12, color: '#666' }}>%</span>
                <input style={{ ...S.input, width: 140 }} placeholder="調價原因（選填）" value={bulkReason} onChange={e => setBulkReason(e.target.value)} />
                <button style={S.btn()} onClick={applyBulk}>套用</button>
                <button style={S.btn('#9ca3af')} onClick={() => setBulkOpen(false)}>取消</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ ...S.card, padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>項目名稱</th><th style={S.th}>類別</th>
              <th style={{ ...S.th, textAlign: 'right' }}>收費</th>
              <th style={{ ...S.th, textAlign: 'right' }}>會員價</th>
              <th style={S.th}>描述</th><th style={S.th}>排序</th><th style={S.th}>狀態</th><th style={S.th}>操作</th>
            </tr></thead>
            <tbody>
              {!filtered.length && <tr><td colSpan={8} style={{ ...S.td, textAlign: 'center', color: '#aaa', padding: 40 }}>暫無項目</td></tr>}
              {filtered.map(i => {
                const discount = i.memberPrice > 0 && i.price > 0 ? Math.round((1 - i.memberPrice / i.price) * 100) : 0;
                return (
                  <tr key={i.id} style={{ opacity: i.isActive === false ? 0.5 : 1 }}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{i.name}</td>
                    <td style={S.td}><span style={S.tag}>{i.category}</span></td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#d97706' }}>{fmtD(i.price)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: '#059669', fontWeight: 600 }}>
                      {i.memberPrice > 0 ? <>{fmtD(i.memberPrice)} <span style={{ fontSize: 10, color: '#16a34a' }}>(-{discount}%)</span></> : '-'}
                    </td>
                    <td style={{ ...S.td, fontSize: 11, color: '#888', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.description || '-'}</td>
                    <td style={{ ...S.td, fontSize: 11, color: '#aaa' }}>{i.sortOrder || 0}</td>
                    <td style={S.td}>
                      <span onClick={() => toggleActive(i.id)} style={{ cursor: 'pointer', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: i.isActive !== false ? '#dcfce7' : '#f3f4f6', color: i.isActive !== false ? '#16a34a' : '#9ca3af' }}>
                        {i.isActive !== false ? '啟用' : '停用'}
                      </span>
                    </td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                      <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: ACCENT, fontWeight: 600, fontSize: 12 }} onClick={() => openEdit(i)}>編輯</button>
                      <button style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 600, fontSize: 12, marginLeft: 6 }} onClick={() => handleDelete(i.id)}>刪除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}

      {/* ── Compare Tab ── */}
      {tab === 'compare' && (
        <div style={{ ...S.card, padding: 0, overflow: 'auto' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontWeight: 700, fontSize: 15, color: '#374151' }}>會員 vs 非會員 價格對比</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>項目</th><th style={S.th}>類別</th>
              <th style={{ ...S.th, textAlign: 'right' }}>標準收費</th>
              <th style={{ ...S.th, textAlign: 'right' }}>會員價</th>
              <th style={{ ...S.th, textAlign: 'right' }}>節省</th>
              <th style={{ ...S.th, textAlign: 'right' }}>折扣率</th>
            </tr></thead>
            <tbody>
              {items.filter(i => i.isActive !== false && i.memberPrice > 0).sort((a, b) => {
                const da = 1 - a.memberPrice / a.price, db = 1 - b.memberPrice / b.price; return db - da;
              }).map(i => {
                const saved = i.price - i.memberPrice;
                const pct = Math.round((saved / i.price) * 100);
                return (
                  <tr key={i.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{i.name}</td>
                    <td style={S.td}><span style={S.tag}>{i.category}</span></td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{fmtD(i.price)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: '#059669', fontWeight: 600 }}>{fmtD(i.memberPrice)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>-{fmtD(saved)}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      <span style={{ background: pct >= 20 ? '#fef2f2' : pct >= 10 ? '#fffbeb' : '#f0fdf4', color: pct >= 20 ? '#dc2626' : pct >= 10 ? '#d97706' : '#059669', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>{pct}%</span>
                    </td>
                  </tr>
                );
              })}
              {!items.filter(i => i.isActive !== false && i.memberPrice > 0).length && (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#aaa', padding: 40 }}>暫無設定會員價的項目</td></tr>
              )}
            </tbody>
          </table>
          {items.filter(i => i.isActive !== false && i.memberPrice > 0).length > 0 && (
            <div style={{ padding: 14, background: '#f8fafc', fontSize: 12, color: '#6b7280', borderTop: '1px solid #e5e7eb' }}>
              總計 {items.filter(i => i.isActive !== false && i.memberPrice > 0).length} 個項目設有會員優惠 | 平均折扣率：{Math.round(items.filter(i => i.isActive !== false && i.memberPrice > 0).reduce((s, i) => s + (1 - i.memberPrice / i.price) * 100, 0) / items.filter(i => i.isActive !== false && i.memberPrice > 0).length)}%
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === 'history' && (
        <div style={{ ...S.card, padding: 0, overflow: 'auto' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontWeight: 700, fontSize: 15, color: '#374151' }}>價格變更紀錄</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>日期</th><th style={S.th}>項目</th>
              <th style={{ ...S.th, textAlign: 'right' }}>舊價</th>
              <th style={{ ...S.th, textAlign: 'right' }}>新價</th>
              <th style={{ ...S.th, textAlign: 'right' }}>變動</th>
              <th style={S.th}>原因</th><th style={S.th}>操作人</th>
            </tr></thead>
            <tbody>
              {!history.length && <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#aaa', padding: 40 }}>暫無調價紀錄</td></tr>}
              {history.slice(0, 100).map(h => {
                const diff = h.newPrice - h.oldPrice;
                const pct = h.oldPrice > 0 ? ((diff / h.oldPrice) * 100).toFixed(1) : 'N/A';
                return (
                  <tr key={h.id}>
                    <td style={{ ...S.td, fontSize: 12, color: '#888' }}>{h.date}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{h.item}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{fmtD(h.oldPrice)}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>{fmtD(h.newPrice)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: diff > 0 ? '#dc2626' : '#059669', fontWeight: 600 }}>
                      {diff > 0 ? '+' : ''}{fmtD(diff)} ({pct}%)
                    </td>
                    <td style={{ ...S.td, fontSize: 12 }}>{h.reason || '-'}</td>
                    <td style={{ ...S.td, fontSize: 12, color: '#888' }}>{h.user}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      {showForm && (
        <div style={S.overlay} onClick={() => setShowForm(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, color: ACCENT }}>{editId ? '編輯項目' : '新增項目'}</h3>
              <button style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#999' }} onClick={() => setShowForm(false)}>&#10005;</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><span style={S.label}>項目名稱 *</span><input style={S.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例：普通診金" /></div>
              <div><span style={S.label}>類別</span><select style={{ ...S.input }} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><span style={S.label}>收費 ($) *</span><input style={S.input} type="number" min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>
              <div><span style={S.label}>會員價 ($)</span><input style={S.input} type="number" min="0" value={form.memberPrice} onChange={e => setForm({ ...form, memberPrice: e.target.value })} placeholder="選填" /></div>
              <div><span style={S.label}>排序</span><input style={S.input} type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} /></div>
            </div>
            <div style={{ marginBottom: 10 }}><span style={S.label}>描述</span><input style={S.input} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="選填" /></div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isActive !== false} onChange={e => setForm({ ...form, isActive: e.target.checked })} style={{ marginRight: 6 }} />啟用此項目
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={S.btn()} onClick={handleSave}>{editId ? '更新' : '新增'}</button>
              <button style={S.btn('#9ca3af')} onClick={() => setShowForm(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Modal ── */}
      {showImport && (
        <div style={S.overlay} onClick={() => setShowImport(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 10px', color: ACCENT }}>匯入價目表</h3>
            <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>每行格式：名稱[Tab]價格[Tab]類別[Tab]會員價[Tab]描述</p>
            <textarea style={{ width: '100%', height: 180, border: '1px solid #d1d5db', borderRadius: 6, padding: 10, fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }} placeholder={'普通診金\t350\t診金\t300\n針灸治療\t450\t針灸\t380'} value={importText} onChange={e => setImportText(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button style={S.btn('#9ca3af')} onClick={() => setShowImport(false)}>取消</button>
              <button style={S.btn()} onClick={handleImport}>確認匯入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
