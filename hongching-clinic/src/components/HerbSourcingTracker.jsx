import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_herb_sourcing';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const today = () => new Date().toISOString().substring(0, 10);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } };
const save = arr => localStorage.setItem(LS_KEY, JSON.stringify(arr));

const GRADES = ['特級', '甲級', '乙級', '丙級'];
const GRADE_COLOR = { '特級': '#b45309', '甲級': '#16a34a', '乙級': '#2563eb', '丙級': '#6b7280' };
const GRADE_BG = { '特級': '#fffbeb', '甲級': '#f0fdf4', '乙級': '#eff6ff', '丙級': '#f3f4f6' };

const S = {
  page: { padding: 16, fontFamily: "'Microsoft YaHei',sans-serif", maxWidth: 1100, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, color: '#0e7490', margin: '0 0 12px' },
  tabs: { display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 },
  tab: a => ({ padding: '8px 20px', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? '#0e7490' : '#666', borderBottom: a ? '2px solid #0e7490' : '2px solid transparent', marginBottom: -2, background: 'none', border: 'none', fontSize: 14 }),
  card: { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  label: { fontSize: 12, color: '#555', marginBottom: 2 },
  input: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 120 },
  select: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' },
  btn: (c = '#0e7490') => ({ padding: '7px 16px', background: c, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  btnSm: (c = '#0e7490') => ({ padding: '4px 10px', background: c, color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }),
  th: { padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, borderBottom: '2px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' },
  td: { padding: '6px', fontSize: 13, borderBottom: '1px solid #f0f0f0' },
  stat: bg => ({ padding: '10px 16px', borderRadius: 8, background: bg, flex: '1 1 130px', minWidth: 120 }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', borderRadius: 10, padding: 20, width: '90%', maxWidth: 800, maxHeight: '85vh', overflowY: 'auto' },
  badge: (color, bg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color, background: bg }),
  stars: n => '★'.repeat(n) + '☆'.repeat(5 - n),
};

const EMPTY_BATCH = { herbName: '', supplier: '', batchNo: '', origin: '', harvestDate: '', receivedDate: today(), grade: '甲級', expiryDate: '', notes: '' };
const EMPTY_INSPECT = { appearance: '', smell: '', taste: '', moisture: '', impurity: false, result: 'pass', inspector: '', inspectDate: today(), remarks: '' };

export default function HerbSourcingTracker({ data, showToast, user }) {
  const [batches, setBatches] = useState(load);
  const [tab, setTab] = useState('batches');
  const [search, setSearch] = useState('');
  const [filterGrade, setFilterGrade] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_BATCH });
  const [inspectBatch, setInspectBatch] = useState(null);
  const [inspectForm, setInspectForm] = useState({ ...EMPTY_INSPECT });
  const [detail, setDetail] = useState(null);

  const clinicName = getClinicName();

  // Derived: days until expiry
  const withExpiry = useMemo(() => batches.map(b => {
    if (!b.expiryDate) return { ...b, daysLeft: null };
    const diff = Math.ceil((new Date(b.expiryDate) - new Date()) / 86400000);
    return { ...b, daysLeft: diff };
  }), [batches]);

  // Filter batches
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return withExpiry.filter(b => {
      if (filterGrade !== 'all' && b.grade !== filterGrade) return false;
      if (tab === 'expiry') return b.daysLeft !== null && b.daysLeft <= 90;
      return !q || b.herbName?.toLowerCase().includes(q) || b.supplier?.toLowerCase().includes(q) || b.batchNo?.toLowerCase().includes(q);
    }).sort((a, b) => (b.receivedDate || '').localeCompare(a.receivedDate || ''));
  }, [withExpiry, search, filterGrade, tab]);

  // Supplier ratings
  const supplierRatings = useMemo(() => {
    const map = {};
    batches.forEach(b => {
      if (!b.supplier) return;
      if (!map[b.supplier]) map[b.supplier] = { total: 0, score: 0, batches: 0, pass: 0, fail: 0 };
      const m = map[b.supplier];
      m.batches++;
      const gs = { '特級': 5, '甲級': 4, '乙級': 3, '丙級': 2 };
      m.score += gs[b.grade] || 3;
      m.total++;
      if (b.inspection) { b.inspection.result === 'pass' ? m.pass++ : m.fail++; }
    });
    return Object.entries(map).map(([name, d]) => ({
      name, batches: d.batches, avgScore: Math.round(d.score / d.total), pass: d.pass, fail: d.fail,
      rating: Math.min(5, Math.max(1, Math.round(d.score / d.total))),
    })).sort((a, b) => b.rating - a.rating);
  }, [batches]);

  // Stats
  const stats = useMemo(() => {
    const expiring = withExpiry.filter(b => b.daysLeft !== null && b.daysLeft > 0 && b.daysLeft <= 30).length;
    const expired = withExpiry.filter(b => b.daysLeft !== null && b.daysLeft <= 0).length;
    const inspected = batches.filter(b => b.inspection).length;
    const passed = batches.filter(b => b.inspection?.result === 'pass').length;
    return { total: batches.length, expiring, expired, inspected, passed };
  }, [batches, withExpiry]);

  const handleSave = () => {
    if (!form.herbName) return showToast('請輸入藥材名稱');
    if (!form.supplier) return showToast('請輸入供應商');
    if (!form.batchNo) return showToast('請輸入批次編號');
    const entry = { ...form, id: editId || uid(), updatedAt: new Date().toISOString() };
    if (!editId) entry.createdAt = new Date().toISOString();
    const updated = editId ? batches.map(b => b.id === editId ? { ...b, ...entry } : b) : [...batches, entry];
    setBatches(updated); save(updated);
    showToast(editId ? '已更新批次資料' : '已新增藥材批次');
    setShowForm(false); setEditId(null); setForm({ ...EMPTY_BATCH });
  };

  const handleInspect = () => {
    if (!inspectBatch) return;
    const updated = batches.map(b => b.id === inspectBatch.id ? { ...b, inspection: { ...inspectForm, inspectedBy: user?.name || '' } } : b);
    setBatches(updated); save(updated);
    showToast('質量檢驗已保存');
    setInspectBatch(null); setInspectForm({ ...EMPTY_INSPECT });
  };

  const deleteBatch = id => {
    const updated = batches.filter(b => b.id !== id);
    setBatches(updated); save(updated);
    showToast('已刪除批次'); setDetail(null);
  };

  const expiryBadge = daysLeft => {
    if (daysLeft === null) return { label: '無期限', color: '#6b7280', bg: '#f3f4f6' };
    if (daysLeft <= 0) return { label: '已過期', color: '#dc2626', bg: '#fef2f2' };
    if (daysLeft <= 30) return { label: `${daysLeft}天`, color: '#dc2626', bg: '#fef2f2' };
    if (daysLeft <= 90) return { label: `${daysLeft}天`, color: '#f59e0b', bg: '#fffbeb' };
    return { label: `${daysLeft}天`, color: '#16a34a', bg: '#f0fdf4' };
  };

  // Linked prescriptions (from data.consultations)
  const linkedRx = batchId => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return [];
    return (data.consultations || []).filter(c =>
      (c.prescription || []).some(p => p.herb === batch.herbName)
    ).slice(0, 10);
  };

  const printCert = batch => {
    if (!batch?.inspection) return showToast('此批次尚未檢驗');
    const ins = batch.inspection;
    const clinic = clinicName;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>質量檢驗證書</title>
<style>body{font-family:'Microsoft YaHei',sans-serif;padding:30px;max-width:700px;margin:0 auto;font-size:13px}
h1{color:#0e7490;font-size:20px;text-align:center;border-bottom:3px solid #0e7490;padding-bottom:10px}
h2{font-size:14px;color:#333;margin:18px 0 8px}
.info{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin:10px 0}
.info span{font-weight:700}
table{width:100%;border-collapse:collapse;margin:10px 0}th,td{padding:8px;border:1px solid #ddd;text-align:left}
th{background:#f0fdfa;color:#0e7490;font-weight:700}
.result{text-align:center;font-size:24px;font-weight:700;padding:16px;margin:14px 0;border-radius:8px}
.pass{color:#16a34a;background:#f0fdf4;border:2px solid #16a34a}
.fail{color:#dc2626;background:#fef2f2;border:2px solid #dc2626}
.footer{text-align:center;margin-top:30px;font-size:11px;color:#999}
.sig{display:flex;justify-content:space-between;margin-top:40px;font-size:12px}
.sig div{text-align:center;width:200px;border-top:1px solid #333;padding-top:6px}
@media print{body{padding:15px}}</style></head>
<body><h1>${clinic} — 中藥質量檢驗證書</h1>
<h2>藥材基本資料</h2>
<div class="info"><div>藥材名稱：<span>${batch.herbName}</span></div><div>批次編號：<span>${batch.batchNo}</span></div>
<div>供應商：<span>${batch.supplier}</span></div><div>產地：<span>${batch.origin || '-'}</span></div>
<div>採收日期：<span>${batch.harvestDate || '-'}</span></div><div>接收日期：<span>${batch.receivedDate || '-'}</span></div>
<div>品質等級：<span>${batch.grade}</span></div><div>有效期至：<span>${batch.expiryDate || '-'}</span></div></div>
<h2>感官及理化檢驗</h2>
<table><thead><tr><th>檢驗項目</th><th>結果</th></tr></thead><tbody>
<tr><td>外觀</td><td>${ins.appearance || '-'}</td></tr>
<tr><td>氣味</td><td>${ins.smell || '-'}</td></tr>
<tr><td>味道</td><td>${ins.taste || '-'}</td></tr>
<tr><td>含水量 (%)</td><td>${ins.moisture || '-'}%</td></tr>
<tr><td>雜質檢查</td><td>${ins.impurity ? '發現雜質' : '未發現雜質'}</td></tr>
</tbody></table>
<div class="result ${ins.result === 'pass' ? 'pass' : 'fail'}">${ins.result === 'pass' ? '合格 PASSED' : '不合格 FAILED'}</div>
<p>備註：${ins.remarks || '無'}</p>
<div class="sig"><div>檢驗人員：${ins.inspectedBy || ins.inspector || ''}</div><div>檢驗日期：${ins.inspectDate || ''}</div></div>
<div class="footer">本證書由 ${clinic} 管理系統自動生成 | 列印時間：${new Date().toLocaleString('zh-HK')}</div>
<script>setTimeout(()=>window.print(),300)</script></body></html>`;
    const w = window.open('', '_blank'); if (!w) return; w.document.write(html); w.document.close();
  };

  const openEdit = b => { setForm({ herbName: b.herbName, supplier: b.supplier, batchNo: b.batchNo, origin: b.origin || '', harvestDate: b.harvestDate || '', receivedDate: b.receivedDate || '', grade: b.grade, expiryDate: b.expiryDate || '', notes: b.notes || '' }); setEditId(b.id); setShowForm(true); };
  const openInspect = b => { setInspectBatch(b); setInspectForm(b.inspection ? { ...b.inspection } : { ...EMPTY_INSPECT, inspector: user?.name || '' }); };

  return (
    <div style={S.page}>
      <h1 style={S.h1}>中藥溯源及品質管理</h1>

      <div style={S.tabs}>
        {['batches', 'expiry', 'suppliers'].map(t => (
          <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
            {{ batches: '藥材批次', expiry: '到期預警', suppliers: '供應商評級' }[t]}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={S.stat('#f0fdfa')}><div style={S.label}>總批次</div><div style={{ fontSize: 20, fontWeight: 700, color: '#0e7490' }}>{stats.total}</div></div>
        <div style={S.stat('#fffbeb')}><div style={S.label}>即將到期</div><div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>{stats.expiring}</div></div>
        <div style={S.stat('#fef2f2')}><div style={S.label}>已過期</div><div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{stats.expired}</div></div>
        <div style={S.stat('#f0fdf4')}><div style={S.label}>已檢驗</div><div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{stats.inspected}</div></div>
        <div style={S.stat('#eff6ff')}><div style={S.label}>合格率</div><div style={{ fontSize: 20, fontWeight: 700, color: '#2563eb' }}>{stats.inspected ? Math.round(stats.passed / stats.inspected * 100) : 0}%</div></div>
      </div>

      {/* Batches Tab */}
      {(tab === 'batches' || tab === 'expiry') && <>
        <div style={{ ...S.row, marginBottom: 14 }}>
          <input style={{ ...S.input, width: 200 }} placeholder="搜索藥材/供應商/批號..." value={search} onChange={e => setSearch(e.target.value)} />
          <select style={S.select} value={filterGrade} onChange={e => setFilterGrade(e.target.value)}>
            <option value="all">全部等級</option>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          {tab === 'batches' && <button style={S.btn()} onClick={() => { setForm({ ...EMPTY_BATCH }); setEditId(null); setShowForm(true); }}>+ 新增批次</button>}
        </div>

        <div style={{ ...S.card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>藥材名稱</th><th style={S.th}>批次編號</th><th style={S.th}>供應商</th>
              <th style={S.th}>產地</th><th style={S.th}>等級</th><th style={S.th}>接收日期</th>
              <th style={S.th}>到期狀態</th><th style={S.th}>檢驗</th><th style={S.th}>操作</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} style={{ ...S.td, textAlign: 'center', color: '#aaa', padding: 30 }}>{tab === 'expiry' ? '暫無到期預警批次' : '暫無藥材批次'}</td></tr>}
              {filtered.map((b, idx) => {
                const eb = expiryBadge(b.daysLeft);
                return (
                  <tr key={b.id} style={{ background: idx % 2 ? '#fafbfc' : '#fff' }}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{b.herbName}</td>
                    <td style={S.td}>{b.batchNo}</td>
                    <td style={S.td}>{b.supplier}</td>
                    <td style={S.td}>{b.origin || '-'}</td>
                    <td style={S.td}><span style={S.badge(GRADE_COLOR[b.grade], GRADE_BG[b.grade])}>{b.grade}</span></td>
                    <td style={S.td}>{b.receivedDate || '-'}</td>
                    <td style={S.td}><span style={S.badge(eb.color, eb.bg)}>{eb.label}</span></td>
                    <td style={S.td}>{b.inspection ? <span style={S.badge(b.inspection.result === 'pass' ? '#16a34a' : '#dc2626', b.inspection.result === 'pass' ? '#f0fdf4' : '#fef2f2')}>{b.inspection.result === 'pass' ? '合格' : '不合格'}</span> : <span style={{ color: '#aaa', fontSize: 12 }}>未檢</span>}</td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                      <button style={S.btnSm()} onClick={() => setDetail(b)}>詳情</button>{' '}
                      <button style={S.btnSm('#0891b2')} onClick={() => openInspect(b)}>檢驗</button>{' '}
                      <button style={S.btnSm('#6b7280')} onClick={() => openEdit(b)}>編輯</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}

      {/* Suppliers Tab */}
      {tab === 'suppliers' && (
        <div style={{ ...S.card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>供應商</th><th style={S.th}>評級</th><th style={{ ...S.th, textAlign: 'right' }}>總批次</th>
              <th style={{ ...S.th, textAlign: 'right' }}>檢驗合格</th><th style={{ ...S.th, textAlign: 'right' }}>檢驗不合格</th><th style={S.th}>合格率</th>
            </tr></thead>
            <tbody>
              {supplierRatings.length === 0 && <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#aaa', padding: 30 }}>暫無供應商記錄</td></tr>}
              {supplierRatings.map((s, idx) => (
                <tr key={s.name} style={{ background: idx % 2 ? '#fafbfc' : '#fff' }}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{s.name}</td>
                  <td style={{ ...S.td, color: '#f59e0b', fontSize: 16, letterSpacing: 2 }}>{S.stars(s.rating)}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{s.batches}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{s.pass}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{s.fail}</td>
                  <td style={S.td}>{(s.pass + s.fail) > 0 ? Math.round(s.pass / (s.pass + s.fail) * 100) + '%' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Batch Modal */}
      {showForm && (
        <div style={S.overlay} onClick={() => setShowForm(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 14px', fontSize: 18, color: '#0e7490' }}>{editId ? '編輯批次' : '新增藥材批次'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div style={S.label}>藥材名稱 *</div><input style={{ ...S.input, width: '100%' }} value={form.herbName} onChange={e => setForm({ ...form, herbName: e.target.value })} /></div>
              <div><div style={S.label}>供應商 *</div><input style={{ ...S.input, width: '100%' }} value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></div>
              <div><div style={S.label}>批次編號 *</div><input style={{ ...S.input, width: '100%' }} value={form.batchNo} onChange={e => setForm({ ...form, batchNo: e.target.value })} /></div>
              <div><div style={S.label}>產地</div><input style={{ ...S.input, width: '100%' }} placeholder="例：雲南、四川" value={form.origin} onChange={e => setForm({ ...form, origin: e.target.value })} /></div>
              <div><div style={S.label}>採收日期</div><input type="date" style={{ ...S.input, width: '100%' }} value={form.harvestDate} onChange={e => setForm({ ...form, harvestDate: e.target.value })} /></div>
              <div><div style={S.label}>接收日期</div><input type="date" style={{ ...S.input, width: '100%' }} value={form.receivedDate} onChange={e => setForm({ ...form, receivedDate: e.target.value })} /></div>
              <div><div style={S.label}>品質等級</div><select style={{ ...S.select, width: '100%' }} value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })}>{GRADES.map(g => <option key={g} value={g}>{g}</option>)}</select></div>
              <div><div style={S.label}>有效日期</div><input type="date" style={{ ...S.input, width: '100%' }} value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}><div style={S.label}>備註</div><input style={{ ...S.input, width: '100%' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={S.btn('#6b7280')} onClick={() => setShowForm(false)}>取消</button>
              <button style={S.btn()} onClick={handleSave}>{editId ? '更新' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Inspection Modal */}
      {inspectBatch && (
        <div style={S.overlay} onClick={() => setInspectBatch(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 6px', fontSize: 18, color: '#0e7490' }}>質量檢驗 — {inspectBatch.herbName}</h2>
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 14px' }}>批次：{inspectBatch.batchNo} | 供應商：{inspectBatch.supplier}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><div style={S.label}>外觀</div><input style={{ ...S.input, width: '100%' }} placeholder="色澤、形態、大小..." value={inspectForm.appearance} onChange={e => setInspectForm({ ...inspectForm, appearance: e.target.value })} /></div>
              <div><div style={S.label}>氣味</div><input style={{ ...S.input, width: '100%' }} placeholder="氣味描述..." value={inspectForm.smell} onChange={e => setInspectForm({ ...inspectForm, smell: e.target.value })} /></div>
              <div><div style={S.label}>味道</div><input style={{ ...S.input, width: '100%' }} placeholder="味道描述..." value={inspectForm.taste} onChange={e => setInspectForm({ ...inspectForm, taste: e.target.value })} /></div>
              <div><div style={S.label}>含水量 (%)</div><input type="number" style={{ ...S.input, width: '100%' }} placeholder="例：12" value={inspectForm.moisture} onChange={e => setInspectForm({ ...inspectForm, moisture: e.target.value })} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={inspectForm.impurity} onChange={e => setInspectForm({ ...inspectForm, impurity: e.target.checked })} /> 發現雜質
                </label>
              </div>
              <div><div style={S.label}>檢驗結果</div>
                <select style={{ ...S.select, width: '100%' }} value={inspectForm.result} onChange={e => setInspectForm({ ...inspectForm, result: e.target.value })}>
                  <option value="pass">合格</option><option value="fail">不合格</option>
                </select>
              </div>
              <div><div style={S.label}>檢驗人員</div><input style={{ ...S.input, width: '100%' }} value={inspectForm.inspector} onChange={e => setInspectForm({ ...inspectForm, inspector: e.target.value })} /></div>
              <div><div style={S.label}>檢驗日期</div><input type="date" style={{ ...S.input, width: '100%' }} value={inspectForm.inspectDate} onChange={e => setInspectForm({ ...inspectForm, inspectDate: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}><div style={S.label}>備註</div><input style={{ ...S.input, width: '100%' }} value={inspectForm.remarks} onChange={e => setInspectForm({ ...inspectForm, remarks: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={S.btn('#6b7280')} onClick={() => setInspectBatch(null)}>取消</button>
              <button style={S.btn()} onClick={handleInspect}>儲存檢驗</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div style={S.overlay} onClick={() => setDetail(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: '#0e7490' }}>批次詳情 — {detail.herbName}</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                {detail.inspection && <button style={S.btnSm('#0e7490')} onClick={() => printCert(detail)}>列印證書</button>}
                <button style={S.btnSm('#dc2626')} onClick={() => deleteBatch(detail.id)}>刪除</button>
                <button style={S.btnSm('#6b7280')} onClick={() => setDetail(null)}>關閉</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, marginBottom: 14 }}>
              <div><span style={{ color: '#888' }}>批次編號：</span><b>{detail.batchNo}</b></div>
              <div><span style={{ color: '#888' }}>供應商：</span><b>{detail.supplier}</b></div>
              <div><span style={{ color: '#888' }}>產地：</span>{detail.origin || '-'}</div>
              <div><span style={{ color: '#888' }}>品質等級：</span><span style={S.badge(GRADE_COLOR[detail.grade], GRADE_BG[detail.grade])}>{detail.grade}</span></div>
              <div><span style={{ color: '#888' }}>採收日期：</span>{detail.harvestDate || '-'}</div>
              <div><span style={{ color: '#888' }}>接收日期：</span>{detail.receivedDate || '-'}</div>
              <div><span style={{ color: '#888' }}>有效日期：</span>{detail.expiryDate || '-'}</div>
              <div><span style={{ color: '#888' }}>備註：</span>{detail.notes || '-'}</div>
            </div>
            {detail.inspection && <>
              <h3 style={{ fontSize: 14, color: '#0e7490', marginBottom: 8 }}>質量檢驗結果</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13, padding: 10, background: '#f8fafc', borderRadius: 6, marginBottom: 14 }}>
                <div>外觀：{detail.inspection.appearance || '-'}</div>
                <div>氣味：{detail.inspection.smell || '-'}</div>
                <div>味道：{detail.inspection.taste || '-'}</div>
                <div>含水量：{detail.inspection.moisture || '-'}%</div>
                <div>雜質：{detail.inspection.impurity ? '發現' : '未發現'}</div>
                <div>結果：<b style={{ color: detail.inspection.result === 'pass' ? '#16a34a' : '#dc2626' }}>{detail.inspection.result === 'pass' ? '合格' : '不合格'}</b></div>
                <div>檢驗人：{detail.inspection.inspectedBy || detail.inspection.inspector || '-'}</div>
                <div>日期：{detail.inspection.inspectDate || '-'}</div>
              </div>
            </>}
            <h3 style={{ fontSize: 14, color: '#0e7490', marginBottom: 8 }}>關聯處方記錄</h3>
            {linkedRx(detail.id).length === 0
              ? <p style={{ fontSize: 12, color: '#aaa' }}>暫無關聯處方</p>
              : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={S.th}>日期</th><th style={S.th}>病人</th><th style={S.th}>醫師</th></tr></thead>
                  <tbody>{linkedRx(detail.id).map((c, i) => (
                    <tr key={i}><td style={S.td}>{c.date}</td><td style={S.td}>{c.patientName}</td><td style={S.td}>{c.doctor}</td></tr>
                  ))}</tbody>
                </table>
            }
          </div>
        </div>
      )}
    </div>
  );
}
