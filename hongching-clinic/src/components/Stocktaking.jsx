import { useState, useMemo } from 'react';
import { getStoreNames, getDefaultStore } from '../data';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_stocktaking';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const today = () => new Date().toISOString().substring(0, 10);
const fmtM = n => `$${Math.round(n).toLocaleString('en-HK')}`;
const loadRecords = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } };
const saveRecords = arr => localStorage.setItem(LS_KEY, JSON.stringify(arr));

const S = {
  page: { padding: 16, fontFamily: "'Microsoft YaHei',sans-serif", maxWidth: 1100, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, color: '#0e7490', margin: '0 0 12px' },
  tabs: { display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 },
  tab: (a) => ({ padding: '8px 20px', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? '#0e7490' : '#666', borderBottom: a ? '2px solid #0e7490' : '2px solid transparent', marginBottom: -2, background: 'none', border: 'none', fontSize: 14 }),
  card: { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  label: { fontSize: 12, color: '#555', marginBottom: 2 },
  input: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 120 },
  select: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' },
  btn: (c = '#0e7490') => ({ padding: '7px 16px', background: c, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  btnSm: (c = '#0e7490') => ({ padding: '4px 10px', background: c, color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }),
  th: { padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, borderBottom: '2px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' },
  td: { padding: '6px', fontSize: 13, borderBottom: '1px solid #f0f0f0' },
  stat: (bg) => ({ padding: '10px 16px', borderRadius: 8, background: bg, flex: '1 1 140px', minWidth: 130 }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', borderRadius: 10, padding: 20, width: '90%', maxWidth: 800, maxHeight: '85vh', overflowY: 'auto' },
};

export default function Stocktaking({ data, setData, showToast, user }) {
  const STORES = getStoreNames();
  const [tab, setTab] = useState('new');
  const [records, setRecords] = useState(loadRecords);
  const [store, setStore] = useState(getDefaultStore());
  const [date, setDate] = useState(today());
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState({});
  const [notes, setNotes] = useState({});
  const [quickMode, setQuickMode] = useState(false);
  const [hideZero, setHideZero] = useState(false);
  const [autoAdjust, setAutoAdjust] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);

  const inventory = useMemo(() => (data.inventory || []).filter(i => !store || i.store === store), [data.inventory, store]);

  const filtered = useMemo(() => {
    let list = inventory;
    if (search) list = list.filter(i => i.name.includes(search));
    if (quickMode && hideZero) list = list.filter(i => i.stock > 0);
    return list;
  }, [inventory, search, quickMode, hideZero]);

  const stats = useMemo(() => {
    let diffCount = 0, diffPos = 0, diffNeg = 0;
    filtered.forEach(i => {
      const actual = counts[i.id];
      if (actual === undefined || actual === '') return;
      const diff = Number(actual) - i.stock;
      if (diff !== 0) { diffCount++; diff > 0 ? (diffPos += diff * (i.cost || 0)) : (diffNeg += diff * (i.cost || 0)); }
    });
    const lastRecord = records.find(r => r.store === store);
    return { total: filtered.length, diffCount, diffPos, diffNeg, lastDate: lastRecord?.date || '-' };
  }, [filtered, counts, records, store]);

  const handleSubmit = () => {
    const items = filtered.map(i => {
      const actual = counts[i.id] !== undefined && counts[i.id] !== '' ? Number(counts[i.id]) : null;
      return { id: i.id, name: i.name, category: i.category, unit: i.unit, systemQty: i.stock, actualQty: actual, diff: actual !== null ? actual - i.stock : null, cost: i.cost || 0, note: notes[i.id] || '' };
    }).filter(it => it.actualQty !== null);
    if (items.length === 0) return showToast('請至少輸入一項實際數量');
    const diffItems = items.filter(it => it.diff !== 0);
    const record = { id: uid(), date, store, user: user?.name || '未知', items, totalItems: items.length, diffItems: diffItems.length, diffAmount: diffItems.reduce((s, it) => s + it.diff * it.cost, 0), createdAt: new Date().toISOString() };
    const updated = [record, ...records];
    setRecords(updated);
    saveRecords(updated);
    if (autoAdjust && setData) {
      const inv = (data.inventory || []).map(i => { const found = items.find(it => it.id === i.id); return found && found.actualQty !== null ? { ...i, stock: found.actualQty } : i; });
      setData(prev => ({ ...prev, inventory: inv }));
    }
    showToast(`盤點已保存 (${items.length} 項${autoAdjust ? ', 庫存已調整' : ''})`);
    setCounts({}); setNotes({});
  };

  const printReport = (rec) => {
    const w = window.open('', '_blank'); if (!w) return;
    const clinic = getClinicName();
    const rows = (rec.items || []).map(it => {
      const color = it.diff > 0 ? '#16a34a' : it.diff < 0 ? '#dc2626' : '#666';
      return `<tr><td>${it.name}</td><td>${it.category}</td><td style="text-align:right">${it.systemQty}${it.unit}</td><td style="text-align:right">${it.actualQty}${it.unit}</td><td style="text-align:right;color:${color};font-weight:700">${it.diff > 0 ? '+' : ''}${it.diff}${it.unit}</td><td>${it.note}</td></tr>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>盤點報表</title><style>body{font-family:'Microsoft YaHei',sans-serif;padding:20px;max-width:800px;margin:0 auto}h1{color:#0e7490;font-size:18px;border-bottom:2px solid #0e7490;padding-bottom:8px}table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border-bottom:1px solid #eee;font-size:12px}th{background:#f8f8f8;text-align:left;font-weight:700}.footer{text-align:center;font-size:10px;color:#aaa;margin-top:20px}@media print{body{padding:10px}}</style></head><body><h1>${clinic} — 盤點報表</h1><p style="font-size:12px;color:#666">日期: ${rec.date} | 店舖: ${rec.store} | 盤點人: ${rec.user} | 項目: ${rec.totalItems} | 差異: ${rec.diffItems}項</p><table><thead><tr><th>藥材</th><th>分類</th><th style="text-align:right">系統</th><th style="text-align:right">實際</th><th style="text-align:right">差異</th><th>備註</th></tr></thead><tbody>${rows}</tbody></table><p style="font-weight:700;margin-top:12px">差異金額: <span style="color:${rec.diffAmount >= 0 ? '#16a34a' : '#dc2626'}">${fmtM(rec.diffAmount)}</span></p><div class="footer">列印時間: ${new Date().toLocaleString('zh-HK')}</div></body></html>`);
    w.document.close(); w.print();
  };

  return (
    <div style={S.page}>
      <h1 style={S.h1}>庫存盤點</h1>
      <div style={S.tabs}>
        <button style={S.tab(tab === 'new')} onClick={() => setTab('new')}>新增盤點</button>
        <button style={S.tab(tab === 'history')} onClick={() => setTab('history')}>盤點記錄</button>
      </div>

      {tab === 'new' && <>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={S.stat('#f0fdfa')}><div style={S.label}>總品項</div><div style={{ fontSize: 20, fontWeight: 700, color: '#0e7490' }}>{stats.total}</div></div>
          <div style={S.stat('#fef2f2')}><div style={S.label}>有差異項目</div><div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{stats.diffCount}</div></div>
          <div style={S.stat('#f0fdf4')}><div style={S.label}>差異金額 (正)</div><div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>{fmtM(stats.diffPos)}</div></div>
          <div style={S.stat('#fef2f2')}><div style={S.label}>差異金額 (負)</div><div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>{fmtM(stats.diffNeg)}</div></div>
          <div style={S.stat('#f8fafc')}><div style={S.label}>上次盤點</div><div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{stats.lastDate}</div></div>
        </div>

        {/* Form controls */}
        <div style={S.card}>
          <div style={S.row}>
            <div><div style={S.label}>店舖</div><select style={S.select} value={store} onChange={e => setStore(e.target.value)}>{STORES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><div style={S.label}>日期</div><input type="date" style={S.input} value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><div style={S.label}>搜索藥材</div><input style={{ ...S.input, width: 180 }} placeholder="輸入藥材名稱..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={quickMode} onChange={e => setQuickMode(e.target.checked)} /> 快速盤點
            </label>
            {quickMode && <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={hideZero} onChange={e => setHideZero(e.target.checked)} /> 隱藏零庫存
            </label>}
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={autoAdjust} onChange={e => setAutoAdjust(e.target.checked)} /> 自動調整庫存
            </label>
          </div>
        </div>

        {/* Item table */}
        <div style={{ ...S.card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {!quickMode && <th style={S.th}>#</th>}
              <th style={S.th}>藥材名稱</th>
              {!quickMode && <th style={S.th}>分類</th>}
              <th style={{ ...S.th, textAlign: 'right' }}>系統數量</th>
              <th style={{ ...S.th, textAlign: 'center' }}>實際數量</th>
              <th style={{ ...S.th, textAlign: 'right' }}>差異</th>
              {!quickMode && <th style={S.th}>備註</th>}
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={quickMode ? 4 : 7} style={{ ...S.td, textAlign: 'center', color: '#aaa', padding: 30 }}>沒有符合的藥材</td></tr>}
              {filtered.map((item, idx) => {
                const actual = counts[item.id];
                const diff = actual !== undefined && actual !== '' ? Number(actual) - item.stock : null;
                const diffColor = diff === null || diff === 0 ? '#666' : diff > 0 ? '#16a34a' : '#dc2626';
                return (
                  <tr key={item.id} style={{ background: idx % 2 ? '#fafbfc' : '#fff' }}>
                    {!quickMode && <td style={S.td}>{idx + 1}</td>}
                    <td style={{ ...S.td, fontWeight: 600 }}>{item.name}</td>
                    {!quickMode && <td style={S.td}>{item.category}</td>}
                    <td style={{ ...S.td, textAlign: 'right' }}>{item.stock} {item.unit}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>
                      <input type="number" min="0" style={{ ...S.input, width: 80, textAlign: 'right' }} placeholder="-" value={counts[item.id] ?? ''} onChange={e => setCounts(p => ({ ...p, [item.id]: e.target.value }))} />
                    </td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: diffColor }}>
                      {diff !== null ? `${diff > 0 ? '+' : ''}${diff} ${item.unit}` : '-'}
                    </td>
                    {!quickMode && <td style={S.td}>
                      <input style={{ ...S.input, width: 120 }} placeholder="備註" value={notes[item.id] || ''} onChange={e => setNotes(p => ({ ...p, [item.id]: e.target.value }))} />
                    </td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button style={S.btn('#6b7280')} onClick={() => { setCounts({}); setNotes({}); }}>清空</button>
          <button style={S.btn()} onClick={handleSubmit}>提交盤點</button>
        </div>
      </>}

      {tab === 'history' && <>
        <div style={{ ...S.card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>日期</th><th style={S.th}>店舖</th><th style={S.th}>盤點人</th>
              <th style={{ ...S.th, textAlign: 'right' }}>總項目</th><th style={{ ...S.th, textAlign: 'right' }}>差異項目數</th>
              <th style={{ ...S.th, textAlign: 'right' }}>差異金額</th><th style={S.th}>操作</th>
            </tr></thead>
            <tbody>
              {records.length === 0 && <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#aaa', padding: 30 }}>暫無盤點記錄</td></tr>}
              {records.map(r => (
                <tr key={r.id}>
                  <td style={S.td}>{r.date}</td><td style={S.td}>{r.store}</td><td style={S.td}>{r.user}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{r.totalItems}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: r.diffItems > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{r.diffItems}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: r.diffAmount >= 0 ? '#16a34a' : '#dc2626' }}>{fmtM(r.diffAmount)}</td>
                  <td style={S.td}>
                    <button style={S.btnSm()} onClick={() => setDetailRecord(r)}>查看詳情</button>{' '}
                    <button style={S.btnSm('#0e7490')} onClick={() => printReport(r)}>列印</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}

      {/* Detail Modal */}
      {detailRecord && (
        <div style={S.overlay} onClick={() => setDetailRecord(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: '#0e7490' }}>盤點詳情 — {detailRecord.date}</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={S.btnSm()} onClick={() => printReport(detailRecord)}>列印</button>
                <button style={{ ...S.btnSm('#6b7280') }} onClick={() => setDetailRecord(null)}>關閉</button>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 10px' }}>店舖: {detailRecord.store} | 盤點人: {detailRecord.user} | 項目: {detailRecord.totalItems} | 差異: {detailRecord.diffItems}項 | 差異金額: <span style={{ fontWeight: 700, color: detailRecord.diffAmount >= 0 ? '#16a34a' : '#dc2626' }}>{fmtM(detailRecord.diffAmount)}</span></p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={S.th}>藥材名稱</th><th style={S.th}>分類</th>
                <th style={{ ...S.th, textAlign: 'right' }}>系統數量</th><th style={{ ...S.th, textAlign: 'right' }}>實際數量</th>
                <th style={{ ...S.th, textAlign: 'right' }}>差異</th><th style={S.th}>備註</th>
              </tr></thead>
              <tbody>
                {(detailRecord.items || []).map((it, idx) => {
                  const color = it.diff > 0 ? '#16a34a' : it.diff < 0 ? '#dc2626' : '#666';
                  return (
                    <tr key={idx} style={{ background: idx % 2 ? '#fafbfc' : '#fff' }}>
                      <td style={{ ...S.td, fontWeight: 600 }}>{it.name}</td><td style={S.td}>{it.category}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{it.systemQty} {it.unit}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{it.actualQty} {it.unit}</td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color }}>{it.diff > 0 ? '+' : ''}{it.diff} {it.unit}</td>
                      <td style={S.td}>{it.note || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
