import { useState, useMemo } from 'react';
import { getStoreNames, TCM_HERBS_DB } from '../data';

const LS_PRICING = 'hcmc_drug_pricing';
const LS_HISTORY = 'hcmc_price_history';
const ACCENT = '#0e7490';
const TIERS = ['一般', '長者優惠', '員工價', 'VIP'];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().substring(0, 10);
const loadJSON = (k, fb = []) => { try { return JSON.parse(localStorage.getItem(k)) || fb; } catch { return fb; } };
const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const categories = [...new Set(TCM_HERBS_DB.map(h => h.cat))];

const S = {
  page: { padding: 16, fontFamily: "'Microsoft YaHei',sans-serif", maxWidth: 1200, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, color: ACCENT, margin: '0 0 12px' },
  tabs: { display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 },
  tab: a => ({ padding: '8px 20px', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? ACCENT : '#666', borderBottom: a ? `2px solid ${ACCENT}` : '2px solid transparent', marginBottom: -2, background: 'none', border: 'none', fontSize: 14 }),
  card: { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  input: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 100 },
  select: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' },
  btn: (c = ACCENT) => ({ padding: '6px 14px', background: c, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  btnSm: (c = ACCENT) => ({ padding: '3px 10px', background: c, color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }),
  th: { padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, borderBottom: '2px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' },
  td: { padding: '6px', fontSize: 13, borderBottom: '1px solid #f0f0f0' },
  tag: { background: '#e0f2fe', color: ACCENT, padding: '2px 8px', borderRadius: 4, fontSize: 11 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', borderRadius: 10, padding: 20, width: '90%', maxWidth: 700, maxHeight: '85vh', overflowY: 'auto' },
  stat: bg => ({ padding: '10px 16px', borderRadius: 8, background: bg, flex: '1 1 140px', minWidth: 130 }),
};

export default function DrugPricing({ data, setData, showToast, user }) {
  const [tab, setTab] = useState('pricing');
  const [pricing, setPricing] = useState(() => loadJSON(LS_PRICING, {}));
  const [history, setHistory] = useState(() => loadJSON(LS_HISTORY));
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [selected, setSelected] = useState([]);
  const [bulkMode, setBulkMode] = useState(null);
  const [bulkVal, setBulkVal] = useState('');
  const [bulkTier, setBulkTier] = useState('一般');
  const [editTier, setEditTier] = useState('一般');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [safetyCat, setSafetyCat] = useState('all');
  const [safetyBulkCat, setSafetyBulkCat] = useState(categories[0] || '');
  const [safetyBulkVal, setSafetyBulkVal] = useState('');

  const inventory = data.inventory || [];
  const savePricing = p => { setPricing(p); saveJSON(LS_PRICING, p); };
  const logHistory = entries => { const u = [...entries, ...history].slice(0, 500); setHistory(u); saveJSON(LS_HISTORY, u); };
  const getPrice = (id, tier = '一般') => pricing[id]?.[tier] || pricing[id]?.['一般'] || null;
  const getCost = item => item.cost || item.costPerUnit || 0;
  const getMargin = (c, p) => c > 0 && p > 0 ? (((p - c) / c) * 100).toFixed(1) : '-';
  const mkEntry = (name, tier, oldP, newP) => ({ id: uid(), date: today(), herb: name, tier, oldPrice: oldP, newPrice: newP, change: oldP ? (((newP - oldP) / oldP) * 100).toFixed(1) : 'N/A', user: user?.name || '系統' });
  const toggleSelect = id => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleAll = () => setSelected(selected.length === items.length ? [] : items.map(i => i.id));

  const items = useMemo(() => {
    let list = inventory;
    if (search) list = list.filter(i => i.name.includes(search));
    if (filterCat !== 'all') list = list.filter(i => i.category === filterCat);
    return list;
  }, [inventory, search, filterCat]);

  const handlePriceChange = (item, val) => {
    const price = parseFloat(val); if (isNaN(price) || price < 0) return;
    const old = getPrice(item.id, editTier);
    savePricing({ ...pricing, [item.id]: { ...pricing[item.id], [editTier]: price, updatedDate: today() } });
    logHistory([mkEntry(item.name, editTier, old || 0, price)]);
    showToast(`${item.name} ${editTier}售價已更新`);
  };

  const applyBulk = () => {
    if (!bulkVal || !selected.length) return showToast('請選擇藥材及輸入數值', 'error');
    const entries = [], updated = { ...pricing };
    selected.forEach(id => {
      const item = inventory.find(i => i.id === id); if (!item) return;
      const old = getPrice(id, bulkTier) || 0;
      const np = bulkMode === 'markup' ? Math.round(getCost(item) * (1 + parseFloat(bulkVal) / 100) * 100) / 100 : parseFloat(bulkVal);
      updated[id] = { ...updated[id], [bulkTier]: np, updatedDate: today() };
      entries.push(mkEntry(item.name, bulkTier, old, np));
    });
    savePricing(updated); logHistory(entries);
    setSelected([]); setBulkMode(null); setBulkVal('');
    showToast(`已批量更新 ${entries.length} 項藥材售價`);
  };

  const handleImport = () => {
    if (!importText.trim()) return showToast('請貼上定價資料', 'error');
    const entries = [], updated = { ...pricing };
    importText.trim().split('\n').forEach(line => {
      const [name, ps] = line.split('\t'); const price = parseFloat(ps);
      if (!name || isNaN(price)) return;
      const item = inventory.find(i => i.name === name.trim()); if (!item) return;
      const old = getPrice(item.id, '一般') || 0;
      updated[item.id] = { ...updated[item.id], '一般': price, updatedDate: today() };
      entries.push(mkEntry(item.name, '一般', old, price));
    });
    savePricing(updated); logHistory(entries);
    setShowImport(false); setImportText('');
    showToast(`已匯入 ${entries.length} 項定價`);
  };

  const handleExport = () => {
    const header = '藥材名稱\t類別\t成本價($/克)\t售價($/克)\t利潤率%\t更新日期';
    const rows = items.map(i => { const c = getCost(i), p = getPrice(i.id, editTier) || 0; return `${i.name}\t${i.category}\t${c}\t${p}\t${getMargin(c, p)}\t${pricing[i.id]?.updatedDate || '-'}`; });
    navigator.clipboard.writeText([header, ...rows].join('\n')).then(() => showToast('定價表已複製到剪貼板'));
  };

  const safetyItems = useMemo(() => {
    let list = inventory;
    if (search) list = list.filter(i => i.name.includes(search));
    if (safetyCat !== 'all') list = list.filter(i => i.category === safetyCat);
    return list.sort((a, b) => { const aL = a.stock < (a.minStock || 0), bL = b.stock < (b.minStock || 0); return aL === bL ? a.stock - b.stock : aL ? -1 : 1; });
  }, [inventory, search, safetyCat]);

  const lowStockCount = useMemo(() => inventory.filter(i => i.stock < (i.minStock || 0)).length, [inventory]);

  const handleMinStockChange = (item, val) => {
    const ms = parseInt(val); if (isNaN(ms) || ms < 0) return;
    setData(prev => ({ ...prev, inventory: inventory.map(i => i.id === item.id ? { ...i, minStock: ms } : i) }));
    showToast(`${item.name} 安全量已設為 ${ms}${item.unit}`);
  };

  const bulkSetSafety = () => {
    if (!safetyBulkVal) return showToast('請輸入安全量', 'error');
    const val = parseInt(safetyBulkVal); if (isNaN(val)) return;
    let count = 0;
    setData(prev => ({ ...prev, inventory: inventory.map(i => { if (i.category === safetyBulkCat) { count++; return { ...i, minStock: val }; } return i; }) }));
    setSafetyBulkVal('');
    showToast(`已將 ${count} 項 ${safetyBulkCat} 安全量設為 ${val}`);
  };

  return (
    <div style={S.page}>
      <h1 style={S.h1}>藥物定價與安全量管理</h1>
      <div style={S.tabs}>
        <button style={S.tab(tab === 'pricing')} onClick={() => setTab('pricing')}>藥物定價</button>
        <button style={S.tab(tab === 'safety')} onClick={() => setTab('safety')}>安全量設定</button>
      </div>

      {tab === 'pricing' && <>
        <div style={S.card}>
          <div style={S.row}>
            <input style={{ ...S.input, width: 180 }} placeholder="搜尋藥材..." value={search} onChange={e => setSearch(e.target.value)} />
            <select style={S.select} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="all">全部類別</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select style={S.select} value={editTier} onChange={e => setEditTier(e.target.value)}>
              {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button style={S.btn()} onClick={handleExport}>匯出定價</button>
            <button style={S.btn('#6366f1')} onClick={() => setShowImport(true)}>匯入定價</button>
            <button style={S.btn('#059669')} onClick={() => window.print()}>列印</button>
          </div>
          {selected.length > 0 && <div style={{ ...S.card, background: '#f0fdfa', border: `1px solid ${ACCENT}` }}>
            <div style={S.row}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>已選 {selected.length} 項</span>
              <button style={S.btnSm()} onClick={() => setBulkMode('markup')}>按加成%定價</button>
              <button style={S.btnSm('#6366f1')} onClick={() => setBulkMode('fixed')}>固定售價</button>
              {bulkMode && <>
                <select style={S.select} value={bulkTier} onChange={e => setBulkTier(e.target.value)}>
                  {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input style={{ ...S.input, width: 80 }} type="number" placeholder={bulkMode === 'markup' ? '加成%' : '售價'} value={bulkVal} onChange={e => setBulkVal(e.target.value)} />
                <button style={S.btnSm('#059669')} onClick={applyBulk}>套用</button>
                <button style={S.btnSm('#9ca3af')} onClick={() => { setBulkMode(null); setBulkVal(''); }}>取消</button>
              </>}
            </div>
          </div>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}><input type="checkbox" checked={selected.length === items.length && items.length > 0} onChange={toggleAll} /></th>
              <th style={S.th}>藥材名稱</th><th style={S.th}>類別</th><th style={S.th}>成本價($/克)</th>
              <th style={S.th}>售價($/克)</th><th style={S.th}>利潤率%</th><th style={S.th}>定價更新日期</th><th style={S.th}>操作</th>
            </tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={8} style={{ ...S.td, textAlign: 'center', color: '#999', padding: 30 }}>暫無藥材資料</td></tr>}
              {items.map(i => { const cost = getCost(i), price = getPrice(i.id, editTier) || 0; return (
                <tr key={i.id} style={{ background: selected.includes(i.id) ? '#f0fdfa' : '#fff' }}>
                  <td style={S.td}><input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggleSelect(i.id)} /></td>
                  <td style={S.td}>{i.name}</td>
                  <td style={S.td}><span style={S.tag}>{i.category}</span></td>
                  <td style={S.td}>${cost.toFixed(2)}</td>
                  <td style={S.td}><input style={{ ...S.input, width: 70, fontWeight: 600, color: price > 0 ? '#059669' : '#999' }} type="number" step="0.01" value={price || ''} placeholder="未定" onBlur={e => e.target.value && handlePriceChange(i, e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePriceChange(i, e.target.value)} /></td>
                  <td style={{ ...S.td, color: getMargin(cost, price) !== '-' && parseFloat(getMargin(cost, price)) > 0 ? '#059669' : '#dc2626' }}>{getMargin(cost, price)}%</td>
                  <td style={{ ...S.td, fontSize: 12, color: '#888' }}>{pricing[i.id]?.updatedDate || '-'}</td>
                  <td style={S.td}>{TIERS.filter(t => t !== '一般').map(t => { const tp = getPrice(i.id, t); return <span key={t} style={{ fontSize: 11, color: tp ? '#059669' : '#ccc', marginRight: 6 }} title={`${t}: ${tp ? '$' + tp : '未定'}`}>{t.charAt(0)}{tp ? '\u2713' : ''}</span>; })}</td>
                </tr>); })}
            </tbody>
          </table>
        </div>
        <div style={{ ...S.card, marginTop: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 10 }}>價格變更紀錄</h3>
          {history.length === 0 ? <p style={{ color: '#999', fontSize: 13 }}>暫無紀錄</p> : (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={S.th}>日期</th><th style={S.th}>藥材</th><th style={S.th}>級別</th><th style={S.th}>舊價</th><th style={S.th}>新價</th><th style={S.th}>變動%</th><th style={S.th}>操作人</th></tr></thead>
                <tbody>{history.slice(0, 50).map(h => (
                  <tr key={h.id}><td style={S.td}>{h.date}</td><td style={S.td}>{h.herb}</td><td style={{ ...S.td, fontSize: 11 }}>{h.tier}</td><td style={S.td}>${h.oldPrice}</td><td style={S.td}>${h.newPrice}</td>
                    <td style={{ ...S.td, color: h.change !== 'N/A' && parseFloat(h.change) > 0 ? '#dc2626' : '#059669' }}>{h.change}%</td><td style={S.td}>{h.user}</td></tr>
                ))}</tbody>
              </table>
            </div>)}
        </div>
      </>}

      {tab === 'safety' && <>
        <div style={{ ...S.row, marginBottom: 14 }}>
          <div style={S.stat('#fef2f2')}><div style={{ fontSize: 11, color: '#991b1b' }}>低於安全量</div><div style={{ fontSize: 22, fontWeight: 700, color: '#dc2626' }}>{lowStockCount}</div></div>
          <div style={S.stat('#f0fdf4')}><div style={{ fontSize: 11, color: '#166534' }}>庫存正常</div><div style={{ fontSize: 22, fontWeight: 700, color: '#059669' }}>{inventory.length - lowStockCount}</div></div>
          <div style={S.stat('#eff6ff')}><div style={{ fontSize: 11, color: '#1e40af' }}>總藥材數</div><div style={{ fontSize: 22, fontWeight: 700, color: '#2563eb' }}>{inventory.length}</div></div>
        </div>
        <div style={S.card}>
          <div style={S.row}>
            <input style={{ ...S.input, width: 180 }} placeholder="搜尋藥材..." value={search} onChange={e => setSearch(e.target.value)} />
            <select style={S.select} value={safetyCat} onChange={e => setSafetyCat(e.target.value)}>
              <option value="all">全部類別</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ ...S.row, background: '#f8fafc', padding: 10, borderRadius: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>批量設定安全量：</span>
            <select style={S.select} value={safetyBulkCat} onChange={e => setSafetyBulkCat(e.target.value)}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input style={{ ...S.input, width: 80 }} type="number" placeholder="安全量" value={safetyBulkVal} onChange={e => setSafetyBulkVal(e.target.value)} />
            <button style={S.btn()} onClick={bulkSetSafety}>套用</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={S.th}>藥材名稱</th><th style={S.th}>類別</th><th style={S.th}>現有量</th><th style={S.th}>安全量</th><th style={S.th}>狀態</th><th style={S.th}>建議訂購量</th></tr></thead>
            <tbody>
              {safetyItems.length === 0 && <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#999', padding: 30 }}>暫無藥材資料</td></tr>}
              {safetyItems.map(i => { const low = i.stock < (i.minStock || 0), suggest = low ? Math.max(0, (i.minStock || 0) * 2 - i.stock) : 0; return (
                <tr key={i.id} style={{ background: low ? '#fef2f2' : '#fff' }}>
                  <td style={S.td}>{i.name}</td>
                  <td style={S.td}><span style={S.tag}>{i.category}</span></td>
                  <td style={{ ...S.td, fontWeight: 600, color: low ? '#dc2626' : '#374151' }}>{i.stock} {i.unit}</td>
                  <td style={S.td}><input style={{ ...S.input, width: 70 }} type="number" value={i.minStock || 0} onChange={e => handleMinStockChange(i, e.target.value)} /></td>
                  <td style={S.td}>{low ? <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 12 }}>\u26A0 低於安全量</span> : <span style={{ color: '#059669', fontSize: 12 }}>正常</span>}</td>
                  <td style={{ ...S.td, fontWeight: low ? 700 : 400, color: low ? '#b91c1c' : '#888' }}>{suggest > 0 ? `${suggest} ${i.unit}` : '-'}</td>
                </tr>); })}
            </tbody>
          </table>
        </div>
      </>}

      {showImport && <div style={S.overlay} onClick={() => setShowImport(false)}>
        <div style={S.modal} onClick={e => e.stopPropagation()}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 10 }}>匯入定價資料</h3>
          <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>每行格式：藥材名稱[Tab]售價（例：麻黃	0.12）</p>
          <textarea style={{ width: '100%', height: 200, border: '1px solid #d1d5db', borderRadius: 6, padding: 10, fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }} placeholder={'麻黃\t0.12\n桂枝\t0.15'} value={importText} onChange={e => setImportText(e.target.value)} />
          <div style={{ ...S.row, marginTop: 12, justifyContent: 'flex-end' }}>
            <button style={S.btn('#9ca3af')} onClick={() => setShowImport(false)}>取消</button>
            <button style={S.btn()} onClick={handleImport}>確認匯入</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
