import { useState, useMemo } from 'react';
import { getStoreNames, fmtM } from '../data';

const LS_EQ = 'hcmc_equipment';
const LS_ML = 'hcmc_maintenance_log';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const today = () => new Date().toISOString().substring(0, 10);
const load = k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const CATS = ['醫療設備', '辦公設備', 'IT設備', '其他'];
const STATUSES = ['正常', '維修中', '報廢'];
const MAINT_TYPES = ['定期保養', '維修', '校準'];
const DEP_YEARS = 5;
const A = '#0e7490';

const S = {
  page: { padding: 16, fontFamily: "'Microsoft YaHei',sans-serif", maxWidth: 1100, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, color: A, margin: '0 0 12px' },
  tabs: { display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 },
  tab: a => ({ padding: '8px 20px', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? A : '#666', borderBottom: a ? `2px solid ${A}` : '2px solid transparent', marginBottom: -2, background: 'none', border: 'none', fontSize: 14 }),
  card: { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  label: { fontSize: 12, color: '#555', marginBottom: 2 },
  input: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 150 },
  select: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' },
  btn: (c = A) => ({ padding: '7px 16px', background: c, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  btnSm: (c = A) => ({ padding: '4px 10px', background: c, color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }),
  th: { padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, borderBottom: '2px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' },
  td: { padding: '6px', fontSize: 13, borderBottom: '1px solid #f0f0f0' },
  stat: bg => ({ padding: '10px 16px', borderRadius: 8, background: bg, flex: '1 1 140px', minWidth: 130 }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', borderRadius: 10, padding: 20, width: '90%', maxWidth: 700, maxHeight: '85vh', overflowY: 'auto' },
  qr: { width: 64, height: 64, border: '2px dashed #ccc', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#999', textAlign: 'center' },
};

const blankEq = () => ({ id: uid(), name: '', model: '', serial: '', purchaseDate: today(), cost: 0, warrantyExpiry: '', status: '正常', store: '', category: '醫療設備', notes: '' });

export default function EquipmentManagement({ showToast, user }) {
  const STORES = getStoreNames();
  const [tab, setTab] = useState('list');
  const [eqs, setEqs] = useState(() => load(LS_EQ));
  const [logs, setLogs] = useState(() => load(LS_ML));
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editing, setEditing] = useState(null);
  const [logForm, setLogForm] = useState(null);

  const persist = (next, nextLogs) => { save(LS_EQ, next); setEqs(next); if (nextLogs !== undefined) { save(LS_ML, nextLogs); setLogs(nextLogs); } };

  // --- stats ---
  const stats = useMemo(() => {
    const yr = new Date().getFullYear();
    const totalVal = eqs.reduce((s, e) => s + (+e.cost || 0), 0);
    const maintCost = logs.filter(l => l.date?.startsWith(String(yr))).reduce((s, l) => s + (+l.cost || 0), 0);
    const warningDays = 60;
    const soon = new Date(); soon.setDate(soon.getDate() + warningDays);
    const expiring = eqs.filter(e => e.warrantyExpiry && new Date(e.warrantyExpiry) <= soon && new Date(e.warrantyExpiry) >= new Date() && e.status !== '報廢').length;
    const needAttention = eqs.filter(e => e.status === '維修中').length + expiring;
    return { total: eqs.length, totalVal, maintCost, needAttention, expiring };
  }, [eqs, logs]);

  // --- depreciation ---
  const depreciationOf = e => {
    if (!e.purchaseDate || !e.cost) return { book: 0, dep: 0, pct: 100 };
    const age = (Date.now() - new Date(e.purchaseDate).getTime()) / (365.25 * 864e5);
    const yearly = e.cost / DEP_YEARS;
    const dep = Math.min(e.cost, yearly * age);
    return { book: Math.max(0, e.cost - dep), dep, pct: Math.min(100, (age / DEP_YEARS) * 100) };
  };

  // --- warranty alerts ---
  const warrantyAlerts = useMemo(() => {
    const now = new Date();
    return eqs.filter(e => e.warrantyExpiry && e.status !== '報廢').map(e => {
      const exp = new Date(e.warrantyExpiry);
      const days = Math.ceil((exp - now) / 864e5);
      return { ...e, daysLeft: days };
    }).filter(e => e.daysLeft <= 90 && e.daysLeft >= -30).sort((a, b) => a.daysLeft - b.daysLeft);
  }, [eqs]);

  // --- filtered list ---
  const filtered = useMemo(() => eqs.filter(e => {
    if (filterCat && e.category !== filterCat) return false;
    if (filterStatus && e.status !== filterStatus) return false;
    if (search && !`${e.name}${e.model}${e.serial}`.includes(search)) return false;
    return true;
  }), [eqs, search, filterCat, filterStatus]);

  const saveEq = () => {
    if (!editing.name) return showToast?.('請輸入設備名稱');
    const idx = eqs.findIndex(e => e.id === editing.id);
    const next = idx >= 0 ? eqs.map(e => e.id === editing.id ? editing : e) : [...eqs, editing];
    persist(next);
    setEditing(null);
    showToast?.(idx >= 0 ? '設備已更新' : '設備已新增');
  };

  const deleteEq = id => { if (!confirm('確定刪除此設備？')) return; persist(eqs.filter(e => e.id !== id)); showToast?.('已刪除'); };

  const saveLog = () => {
    if (!logForm.equipmentId || !logForm.date) return showToast?.('請填寫必要欄位');
    const next = [...logs, { ...logForm, id: uid() }];
    save(LS_ML, next); setLogs(next);
    setLogForm(null);
    showToast?.('維護記錄已新增');
  };

  const TABS = [['list', '設備列表'], ['warranty', '保固追蹤'], ['maintenance', '維護記錄'], ['depreciation', '折舊計算']];

  return (
    <div style={S.page}>
      <h1 style={S.h1}>設備管理</h1>

      {/* Stats */}
      <div style={{ ...S.row, marginBottom: 16 }}>
        <div style={S.stat('#e0f2fe')}><div style={S.label}>設備總數</div><b style={{ fontSize: 20, color: A }}>{stats.total}</b></div>
        <div style={S.stat('#fef9c3')}><div style={S.label}>設備總值</div><b style={{ fontSize: 18 }}>{fmtM(stats.totalVal)}</b></div>
        <div style={S.stat('#dcfce7')}><div style={S.label}>本年維護費</div><b style={{ fontSize: 18 }}>{fmtM(stats.maintCost)}</b></div>
        <div style={S.stat(stats.needAttention > 0 ? '#fee2e2' : '#f0fdf4')}><div style={S.label}>需注意</div><b style={{ fontSize: 20, color: stats.needAttention > 0 ? '#dc2626' : '#16a34a' }}>{stats.needAttention}</b></div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>{TABS.map(([k, l]) => <button key={k} style={S.tab(tab === k)} onClick={() => setTab(k)}>{l}</button>)}</div>

      {/* ===== Equipment List ===== */}
      {tab === 'list' && <>
        <div style={S.row}>
          <input style={{ ...S.input, width: 200 }} placeholder="搜尋名稱/型號/序號..." value={search} onChange={e => setSearch(e.target.value)} />
          <select style={S.select} value={filterCat} onChange={e => setFilterCat(e.target.value)}><option value="">所有類別</option>{CATS.map(c => <option key={c}>{c}</option>)}</select>
          <select style={S.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="">所有狀態</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
          <button style={S.btn()} onClick={() => setEditing(blankEq())}>+ 新增設備</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['名稱', '型號', '序號', '類別', '位置', '狀態', '購入日期', '保固到期', 'QR', '操作'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>{filtered.length === 0 ? <tr><td colSpan={10} style={{ ...S.td, textAlign: 'center', color: '#999' }}>無設備記錄</td></tr> : filtered.map(e => (
              <tr key={e.id}>
                <td style={S.td}>{e.name}</td>
                <td style={S.td}>{e.model}</td>
                <td style={{ ...S.td, fontSize: 11, fontFamily: 'monospace' }}>{e.serial}</td>
                <td style={S.td}>{e.category}</td>
                <td style={S.td}>{e.store}</td>
                <td style={S.td}><span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: e.status === '正常' ? '#dcfce7' : e.status === '維修中' ? '#fef3c7' : '#fee2e2', color: e.status === '正常' ? '#16a34a' : e.status === '維修中' ? '#d97706' : '#dc2626' }}>{e.status}</span></td>
                <td style={S.td}>{e.purchaseDate}</td>
                <td style={S.td}>{e.warrantyExpiry || '-'}</td>
                <td style={S.td}><div style={S.qr}>QR<br />{e.id.slice(-5)}</div></td>
                <td style={S.td}>
                  <button style={S.btnSm()} onClick={() => setEditing({ ...e })}>編輯</button>{' '}
                  <button style={S.btnSm('#f59e0b')} onClick={() => setLogForm({ equipmentId: e.id, equipmentName: e.name, date: today(), type: '定期保養', cost: 0, technician: '', notes: '' })}>維護</button>{' '}
                  <button style={S.btnSm('#ef4444')} onClick={() => deleteEq(e.id)}>刪除</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </>}

      {/* ===== Warranty Tracking ===== */}
      {tab === 'warranty' && <div style={S.card}>
        <h3 style={{ margin: '0 0 10px', color: A }}>保固到期提醒（90天內）</h3>
        {warrantyAlerts.length === 0 ? <p style={{ color: '#999' }}>目前無即將到期的保固</p> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['設備', '型號', '保固到期', '剩餘天數', '狀態'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>{warrantyAlerts.map(e => <tr key={e.id}>
              <td style={S.td}>{e.name}</td><td style={S.td}>{e.model}</td><td style={S.td}>{e.warrantyExpiry}</td>
              <td style={{ ...S.td, fontWeight: 700, color: e.daysLeft <= 0 ? '#dc2626' : e.daysLeft <= 30 ? '#d97706' : '#16a34a' }}>{e.daysLeft <= 0 ? `已過期 ${Math.abs(e.daysLeft)} 天` : `${e.daysLeft} 天`}</td>
              <td style={S.td}>{e.status}</td>
            </tr>)}</tbody></table>}
      </div>}

      {/* ===== Maintenance Log ===== */}
      {tab === 'maintenance' && <div style={S.card}>
        <div style={{ ...S.row, justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, color: A }}>維護記錄</h3>
          <button style={S.btn()} onClick={() => setLogForm({ equipmentId: '', equipmentName: '', date: today(), type: '定期保養', cost: 0, technician: '', notes: '' })}>+ 新增記錄</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}><thead><tr>{['日期', '設備', '類型', '技術員', '費用', '備註'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{logs.length === 0 ? <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#999' }}>無維護記錄</td></tr> : [...logs].reverse().map(l => <tr key={l.id}>
            <td style={S.td}>{l.date}</td><td style={S.td}>{l.equipmentName || eqs.find(e => e.id === l.equipmentId)?.name || '-'}</td>
            <td style={S.td}>{l.type}</td><td style={S.td}>{l.technician}</td><td style={S.td}>{fmtM(l.cost)}</td><td style={S.td}>{l.notes}</td>
          </tr>)}</tbody></table>
      </div>}

      {/* ===== Depreciation ===== */}
      {tab === 'depreciation' && <div style={S.card}>
        <h3 style={{ margin: '0 0 10px', color: A }}>折舊計算（直線法 / {DEP_YEARS} 年）</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['設備', '購入成本', '購入日期', '累計折舊', '帳面淨值', '折舊%'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>{eqs.filter(e => e.cost > 0).map(e => { const d = depreciationOf(e); return (
            <tr key={e.id}><td style={S.td}>{e.name}</td><td style={S.td}>{fmtM(e.cost)}</td><td style={S.td}>{e.purchaseDate}</td>
              <td style={S.td}>{fmtM(d.dep)}</td><td style={{ ...S.td, fontWeight: 600 }}>{fmtM(d.book)}</td>
              <td style={S.td}><div style={{ background: '#e5e7eb', borderRadius: 4, height: 14, width: 80 }}><div style={{ background: A, borderRadius: 4, height: 14, width: `${Math.min(100, d.pct)}%` }} /></div><span style={{ fontSize: 11 }}>{d.pct.toFixed(1)}%</span></td>
            </tr>); })}</tbody></table>
      </div>}

      {/* ===== Equipment Form Modal ===== */}
      {editing && <div style={S.overlay} onClick={e => e.target === e.currentTarget && setEditing(null)}>
        <div style={S.modal}>
          <h3 style={{ margin: '0 0 14px', color: A }}>{eqs.find(e => e.id === editing.id) ? '編輯設備' : '新增設備'}</h3>
          {[['name', '設備名稱', 'text'], ['model', '型號', 'text'], ['serial', '序號', 'text']].map(([k, l, t]) => (
            <div key={k} style={{ marginBottom: 10 }}><label style={S.label}>{l}</label><br /><input style={{ ...S.input, width: '100%' }} type={t} value={editing[k]} onChange={e => setEditing({ ...editing, [k]: e.target.value })} /></div>
          ))}
          <div style={S.row}>
            <div><label style={S.label}>類別</label><br /><select style={S.select} value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label style={S.label}>狀態</label><br /><select style={S.select} value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label style={S.label}>位置</label><br /><select style={S.select} value={editing.store} onChange={e => setEditing({ ...editing, store: e.target.value })}><option value="">選擇分店</option>{STORES.map(s => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div style={S.row}>
            <div><label style={S.label}>購入日期</label><br /><input style={S.input} type="date" value={editing.purchaseDate} onChange={e => setEditing({ ...editing, purchaseDate: e.target.value })} /></div>
            <div><label style={S.label}>購入成本 ($)</label><br /><input style={S.input} type="number" value={editing.cost} onChange={e => setEditing({ ...editing, cost: +e.target.value })} /></div>
            <div><label style={S.label}>保固到期</label><br /><input style={S.input} type="date" value={editing.warrantyExpiry} onChange={e => setEditing({ ...editing, warrantyExpiry: e.target.value })} /></div>
          </div>
          <div style={{ marginBottom: 10 }}><label style={S.label}>備註</label><br /><textarea style={{ ...S.input, width: '100%', height: 50 }} value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={S.btn('#888')} onClick={() => setEditing(null)}>取消</button>
            <button style={S.btn()} onClick={saveEq}>儲存</button>
          </div>
        </div>
      </div>}

      {/* ===== Maintenance Log Form Modal ===== */}
      {logForm && <div style={S.overlay} onClick={e => e.target === e.currentTarget && setLogForm(null)}>
        <div style={S.modal}>
          <h3 style={{ margin: '0 0 14px', color: A }}>新增維護記錄</h3>
          <div style={S.row}>
            <div style={{ flex: 1 }}><label style={S.label}>設備</label><br /><select style={{ ...S.select, width: '100%' }} value={logForm.equipmentId} onChange={e => { const eq = eqs.find(x => x.id === e.target.value); setLogForm({ ...logForm, equipmentId: e.target.value, equipmentName: eq?.name || '' }); }}><option value="">選擇設備</option>{eqs.map(eq => <option key={eq.id} value={eq.id}>{eq.name} ({eq.model})</option>)}</select></div>
            <div><label style={S.label}>日期</label><br /><input style={S.input} type="date" value={logForm.date} onChange={e => setLogForm({ ...logForm, date: e.target.value })} /></div>
          </div>
          <div style={S.row}>
            <div><label style={S.label}>類型</label><br /><select style={S.select} value={logForm.type} onChange={e => setLogForm({ ...logForm, type: e.target.value })}>{MAINT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label style={S.label}>費用 ($)</label><br /><input style={S.input} type="number" value={logForm.cost} onChange={e => setLogForm({ ...logForm, cost: +e.target.value })} /></div>
            <div><label style={S.label}>技術員</label><br /><input style={S.input} value={logForm.technician} onChange={e => setLogForm({ ...logForm, technician: e.target.value })} /></div>
          </div>
          <div style={{ marginBottom: 10 }}><label style={S.label}>備註</label><br /><textarea style={{ ...S.input, width: '100%', height: 50 }} value={logForm.notes} onChange={e => setLogForm({ ...logForm, notes: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={S.btn('#888')} onClick={() => setLogForm(null)}>取消</button>
            <button style={S.btn()} onClick={saveLog}>儲存</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
