import { useState, useMemo, useEffect } from 'react';
import { uid, fmtM } from '../data';
import { getClinicName } from '../tenant';
import { expiryRecordsOps, disposalLogOps } from '../api';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const LS_EXP = 'hcmc_expiry_records';
const LS_DISP = 'hcmc_disposal_log';
const today = () => new Date().toISOString().substring(0, 10);
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const save = (k, v) => {
  localStorage.setItem(k, JSON.stringify(v));
  if (k === LS_EXP) expiryRecordsOps.persistAll(v);
  if (k === LS_DISP) disposalLogOps.persistAll(v);
};
const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
const alertLevel = (d) => d <= 0 ? { label: '已過期', color: '#dc2626', bg: '#fef2f2' }
  : d <= 30 ? { label: '30天內', color: '#dc2626', bg: '#fef2f2' }
  : d <= 60 ? { label: '31-60天', color: '#ea580c', bg: '#fff7ed' }
  : d <= 90 ? { label: '61-90天', color: '#ca8a04', bg: '#fefce8' }
  : { label: '安全', color: '#16a34a', bg: '#f0fdf4' };

const S = {
  page: { padding: 16, fontFamily: "'Microsoft YaHei',sans-serif", maxWidth: 1100, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, color: ACCENT, margin: '0 0 12px' },
  tabs: { display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 },
  tab: a => ({ padding: '8px 20px', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? ACCENT : '#666', borderBottom: a ? `2px solid ${ACCENT}` : '2px solid transparent', marginBottom: -2, background: 'none', border: 'none', fontSize: 14 }),
  card: { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  label: { fontSize: 12, color: '#555', marginBottom: 2 },
  input: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 140 },
  select: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' },
  btn: (c = ACCENT) => ({ padding: '7px 16px', background: c, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  btnSm: (c = ACCENT) => ({ padding: '4px 10px', background: c, color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }),
  th: { padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, borderBottom: '2px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' },
  td: { padding: '6px', fontSize: 13, borderBottom: '1px solid #f0f0f0' },
  stat: bg => ({ padding: '10px 16px', borderRadius: 8, background: bg, flex: '1 1 140px', minWidth: 130 }),
  badge: (c, bg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: c, background: bg }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', borderRadius: 10, padding: 20, width: '90%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' },
};

const Field = ({ label, children }) => <div style={{ marginBottom: 10 }}><div style={S.label}>{label}</div>{children}</div>;

export default function InventoryExpiry({ data, showToast, user }) {
  const [tab, setTab] = useState('overview');
  const [records, setRecords] = useState(() => load(LS_EXP));
  const [disposals, setDisposals] = useState(() => load(LS_DISP));
  const [showAdd, setShowAdd] = useState(false);
  const [showDispose, setShowDispose] = useState(false);
  const [form, setForm] = useState({ itemId: '', batch: '', expiryDate: '', qty: '' });
  const [dispForm, setDispForm] = useState({ recordId: '', qty: '', reason: '已過期', date: today(), authorizedBy: user?.name || '' });
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');

  const inventory = data.inventory || [];
  const clinicName = getClinicName();

  useEffect(() => {
    expiryRecordsOps.load().then(d => { if (d) setRecords(d); });
    disposalLogOps.load().then(d => { if (d) setDisposals(d); });
  }, []);
  const nowStr = today();
  const saveRec = arr => { setRecords(arr); save(LS_EXP, arr); };
  const saveDisp = arr => { setDisposals(arr); save(LS_DISP, arr); };
  const daysLabel = r => r.daysLeft <= 0 ? '已過期' : r.daysLeft + '天';

  const enriched = useMemo(() =>
    records.map(r => {
      const inv = inventory.find(i => i.id === r.itemId);
      const daysLeft = daysBetween(r.expiryDate, nowStr);
      return { ...r, itemName: inv?.name || r.itemName || '未知', stock: r.qty, daysLeft, level: alertLevel(daysLeft) };
    }).sort((a, b) => a.daysLeft - b.daysLeft),
  [records, inventory, nowStr]);

  const stats = useMemo(() => {
    const expired = enriched.filter(r => r.daysLeft <= 0).length;
    const d30 = enriched.filter(r => r.daysLeft > 0 && r.daysLeft <= 30).length;
    const d60 = enriched.filter(r => r.daysLeft > 30 && r.daysLeft <= 60).length;
    const d90 = enriched.filter(r => r.daysLeft > 60 && r.daysLeft <= 90).length;
    const dv = disposals.reduce((s, d) => s + (d.qty || 0) * (d.costPerUnit || 0), 0);
    return { total: enriched.length, expired, d30, d60, d90, dispCount: disposals.length, dispValue: dv };
  }, [enriched, disposals]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (search) { const q = search.toLowerCase(); list = list.filter(r => r.itemName.toLowerCase().includes(q) || r.batch?.toLowerCase().includes(q)); }
    if (filterLevel === 'expired') list = list.filter(r => r.daysLeft <= 0);
    else if (filterLevel === '30') list = list.filter(r => r.daysLeft > 0 && r.daysLeft <= 30);
    else if (filterLevel === '60') list = list.filter(r => r.daysLeft > 30 && r.daysLeft <= 60);
    else if (filterLevel === '90') list = list.filter(r => r.daysLeft > 60 && r.daysLeft <= 90);
    else if (filterLevel === 'safe') list = list.filter(r => r.daysLeft > 90);
    return list;
  }, [enriched, search, filterLevel]);

  const fifoGroups = useMemo(() => {
    const map = {};
    enriched.forEach(r => { if (!map[r.itemId]) map[r.itemId] = { name: r.itemName, batches: [] }; map[r.itemId].batches.push(r); });
    Object.values(map).forEach(g => g.batches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)));
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }, [enriched]);

  const handleAdd = () => {
    if (!form.itemId || !form.expiryDate || !form.qty) return showToast?.('請填寫所有必填欄位');
    const inv = inventory.find(i => i.id === form.itemId);
    saveRec([{ id: uid(), itemId: form.itemId, itemName: inv?.name || '', batch: form.batch, expiryDate: form.expiryDate, qty: Number(form.qty), costPerUnit: inv?.costPerUnit || 0, createdAt: new Date().toISOString() }, ...records]);
    setForm({ itemId: '', batch: '', expiryDate: '', qty: '' }); setShowAdd(false); showToast?.('已新增有效期記錄');
  };

  const handleDispose = () => {
    if (!dispForm.recordId || !dispForm.qty) return showToast?.('請填寫所有必填欄位');
    const rec = records.find(r => r.id === dispForm.recordId);
    if (!rec) return showToast?.('找不到記錄');
    saveDisp([{ id: uid(), recordId: dispForm.recordId, itemName: rec.itemName, batch: rec.batch, qty: Number(dispForm.qty), costPerUnit: rec.costPerUnit || 0, reason: dispForm.reason, date: dispForm.date, authorizedBy: dispForm.authorizedBy, createdAt: new Date().toISOString() }, ...disposals]);
    saveRec(records.map(r => r.id === dispForm.recordId ? { ...r, qty: Math.max(0, r.qty - Number(dispForm.qty)) } : r));
    setDispForm({ recordId: '', qty: '', reason: '已過期', date: today(), authorizedBy: user?.name || '' }); setShowDispose(false); showToast?.('已記錄銷毀');
  };

  const printReport = () => {
    const att = enriched.filter(r => r.daysLeft <= 90);
    const rows = att.map(r => `<tr><td>${escapeHtml(r.itemName)}</td><td>${escapeHtml(r.batch || '-')}</td><td>${r.expiryDate}</td><td style="color:${r.level.color}">${escapeHtml(daysLabel(r))}</td><td>${r.stock}</td><td style="color:${r.level.color}">${escapeHtml(r.level.label)}</td></tr>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>有效期報告</title><style>body{font-family:sans-serif;padding:30px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 8px;font-size:13px;text-align:left}th{background:#f0f9ff;font-weight:700}.hdr{color:${ACCENT}}</style></head><body><h2 class="hdr">${escapeHtml(clinicName)} — 藥材有效期報告</h2><p>列印日期：${nowStr} ｜需注意項目：${att.length} 項</p><table><thead><tr><th>品名</th><th>批號</th><th>有效日期</th><th>剩餘天數</th><th>庫存量</th><th>狀態</th></tr></thead><tbody>${rows}</tbody></table><p style="margin-top:20px;font-size:12px;color:#888">經手人簽名：________________　日期：________________</p></body></html>`);
    w.document.close(); w.print();
  };

  const urgent = useMemo(() => enriched.filter(r => r.daysLeft <= 30), [enriched]);
  const TH = cols => <thead><tr>{cols.map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>;
  const Empty = ({ cols }) => <tr><td colSpan={cols} style={{ ...S.td, textAlign: 'center', color: '#aaa', padding: 30 }}>暫無記錄</td></tr>;

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={S.h1}>藥材有效期管理</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.btn()} onClick={() => setShowAdd(true)}>+ 新增記錄</button>
          <button style={S.btn('#7c3aed')} onClick={() => setShowDispose(true)}>銷毀登記</button>
          <button style={S.btn('#475569')} onClick={printReport}>列印報告</button>
        </div>
      </div>
      <div style={S.tabs}>
        {[['overview','總覽'],['list','有效期列表'],['fifo','FIFO 追蹤'],['disposal','銷毀記錄']].map(([k,l]) => <button key={k} style={S.tab(tab===k)} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'overview' && <div>
        <div style={{ ...S.row, gap: 10, marginBottom: 16 }}>
          {[['已過期', stats.expired, '#dc2626', '#fef2f2'],['30天內到期', stats.d30, '#ea580c', '#fff7ed'],['31-60天到期', stats.d60, '#ca8a04', '#fefce8'],['61-90天到期', stats.d90, '#16a34a', '#f0fdf4']].map(([l,v,c,bg]) =>
            <div key={l} style={S.stat(bg)}><div style={S.label}>{l}</div><div style={{ fontSize: 22, fontWeight: 700, color: c }}>{v}</div></div>)}
        </div>
        <div style={{ ...S.row, gap: 10 }}>
          <div style={S.stat('#f0f9ff')}><div style={S.label}>追蹤批次總數</div><div style={{ fontSize: 20, fontWeight: 700, color: ACCENT }}>{stats.total}</div></div>
          <div style={S.stat('#faf5ff')}><div style={S.label}>銷毀次數</div><div style={{ fontSize: 20, fontWeight: 700, color: '#7c3aed' }}>{stats.dispCount}</div></div>
          <div style={S.stat('#fef2f2')}><div style={S.label}>銷毀總值</div><div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{fmtM(stats.dispValue)}</div></div>
        </div>
        {urgent.length > 0 && <div style={{ ...S.card, marginTop: 16 }}>
          <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>需即時處理 ({urgent.length} 項)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            {TH(['品名','批號','有效日期','剩餘天數','庫存'])}
            <tbody>{urgent.slice(0, 10).map(r => <tr key={r.id}>
              <td style={S.td}>{r.itemName}</td><td style={S.td}>{r.batch || '-'}</td><td style={S.td}>{r.expiryDate}</td>
              <td style={{ ...S.td, color: r.level.color, fontWeight: 600 }}>{daysLabel(r)}</td><td style={S.td}>{r.stock}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>}

      {tab === 'list' && <div>
        <div style={S.row}>
          <input style={{ ...S.input, width: 200 }} placeholder="搜尋品名/批號…" value={search} onChange={e => setSearch(e.target.value)} />
          <select style={S.select} value={filterLevel} onChange={e => setFilterLevel(e.target.value)}>
            {[['all','全部狀態'],['expired','已過期'],['30','30天內'],['60','31-60天'],['90','61-90天'],['safe','安全（>90天）']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <span style={{ fontSize: 12, color: '#888' }}>共 {filtered.length} 筆</span>
        </div>
        <div style={S.card}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
          {TH(['品名','批號','有效日期','剩餘天數','庫存量','狀態','操作'])}
          <tbody>{filtered.length === 0 && <Empty cols={7} />}
            {filtered.map(r => <tr key={r.id}>
              <td style={S.td}>{r.itemName}</td><td style={S.td}>{r.batch || '-'}</td><td style={S.td}>{r.expiryDate}</td>
              <td style={{ ...S.td, fontWeight: 600, color: r.level.color }}>{daysLabel(r)}</td><td style={S.td}>{r.stock}</td>
              <td style={S.td}><span style={S.badge(r.level.color, r.level.bg)}>{r.level.label}</span></td>
              <td style={S.td}><button style={S.btnSm('#ef4444')} onClick={() => { saveRec(records.filter(x => x.id !== r.id)); showToast?.('已刪除'); }}>刪除</button></td>
            </tr>)}
          </tbody>
        </table></div>
      </div>}

      {tab === 'fifo' && <div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>先進先出追蹤：按有效日期排序，優先使用最早到期批次</div>
        {fifoGroups.length === 0 && <div style={{ ...S.card, textAlign: 'center', color: '#aaa', padding: 30 }}>暫無追蹤記錄</div>}
        {fifoGroups.map((g, gi) => <div key={gi} style={S.card}>
          <div style={{ fontWeight: 700, color: ACCENT, marginBottom: 8, fontSize: 14 }}>{g.name}（{g.batches.length} 批次）</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            {TH(['優先順序','批號','有效日期','剩餘天數','庫存量','狀態'])}
            <tbody>{g.batches.map((r, idx) => <tr key={r.id} style={{ background: idx === 0 ? '#f0f9ff' : 'transparent' }}>
              <td style={{ ...S.td, fontWeight: idx === 0 ? 700 : 400, color: idx === 0 ? ACCENT : '#333' }}>{idx === 0 ? '▶ 優先使用' : `#${idx + 1}`}</td>
              <td style={S.td}>{r.batch || '-'}</td><td style={S.td}>{r.expiryDate}</td>
              <td style={{ ...S.td, fontWeight: 600, color: r.level.color }}>{daysLabel(r)}</td><td style={S.td}>{r.stock}</td>
              <td style={S.td}><span style={S.badge(r.level.color, r.level.bg)}>{r.level.label}</span></td>
            </tr>)}</tbody>
          </table>
        </div>)}
      </div>}

      {tab === 'disposal' && <div style={S.card}>
        <div style={{ fontWeight: 700, marginBottom: 10, color: ACCENT }}>銷毀記錄（共 {disposals.length} 筆）</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          {TH(['品名','批號','數量','原因','銷毀日期','經手人'])}
          <tbody>{disposals.length === 0 && <Empty cols={6} />}
            {disposals.map(d => <tr key={d.id}><td style={S.td}>{d.itemName}</td><td style={S.td}>{d.batch || '-'}</td><td style={S.td}>{d.qty}</td><td style={S.td}>{d.reason}</td><td style={S.td}>{d.date}</td><td style={S.td}>{d.authorizedBy}</td></tr>)}
          </tbody>
        </table>
      </div>}

      {showAdd && <div style={S.overlay} onClick={() => setShowAdd(false)}><div style={S.modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 14px', color: ACCENT }}>新增有效期記錄</h3>
        <Field label="藥材品項 *"><select style={{ ...S.select, width: '100%' }} value={form.itemId} onChange={e => setForm({ ...form, itemId: e.target.value })}>
          <option value="">— 選擇藥材 —</option>
          {inventory.map(i => <option key={i.id} value={i.id}>{i.name} ({i.stock}{i.unit})</option>)}
        </select></Field>
        <Field label="批號"><input style={{ ...S.input, width: '100%' }} placeholder="例：BT-20260101" value={form.batch} onChange={e => setForm({ ...form, batch: e.target.value })} /></Field>
        <Field label="有效日期 *"><input type="date" style={{ ...S.input, width: '100%' }} value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></Field>
        <Field label="數量 *"><input type="number" min="0" style={{ ...S.input, width: '100%' }} placeholder="庫存數量" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} /></Field>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button style={S.btn('#94a3b8')} onClick={() => setShowAdd(false)}>取消</button>
          <button style={S.btn()} onClick={handleAdd}>確認新增</button>
        </div>
      </div></div>}

      {showDispose && <div style={S.overlay} onClick={() => setShowDispose(false)}><div style={S.modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 14px', color: '#dc2626' }}>銷毀登記</h3>
        <Field label="選擇批次 *"><select style={{ ...S.select, width: '100%' }} value={dispForm.recordId} onChange={e => setDispForm({ ...dispForm, recordId: e.target.value })}>
          <option value="">— 選擇批次 —</option>
          {records.filter(r => r.qty > 0).map(r => <option key={r.id} value={r.id}>{r.itemName} | {r.batch || '無批號'} | 到期 {r.expiryDate} | 餘 {r.qty}</option>)}
        </select></Field>
        <Field label="銷毀數量 *"><input type="number" min="1" style={{ ...S.input, width: '100%' }} value={dispForm.qty} onChange={e => setDispForm({ ...dispForm, qty: e.target.value })} /></Field>
        <Field label="原因"><select style={{ ...S.select, width: '100%' }} value={dispForm.reason} onChange={e => setDispForm({ ...dispForm, reason: e.target.value })}>
          {['已過期','變質','損壞','召回','其他'].map(r => <option key={r} value={r}>{r}</option>)}
        </select></Field>
        <Field label="銷毀日期"><input type="date" style={{ ...S.input, width: '100%' }} value={dispForm.date} onChange={e => setDispForm({ ...dispForm, date: e.target.value })} /></Field>
        <Field label="經手人"><input style={{ ...S.input, width: '100%' }} value={dispForm.authorizedBy} onChange={e => setDispForm({ ...dispForm, authorizedBy: e.target.value })} /></Field>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button style={S.btn('#94a3b8')} onClick={() => setShowDispose(false)}>取消</button>
          <button style={S.btn('#dc2626')} onClick={handleDispose}>確認銷毀</button>
        </div>
      </div></div>}
    </div>
  );
}
