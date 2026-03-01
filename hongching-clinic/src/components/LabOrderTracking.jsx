import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getDoctors } from '../data';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_lab_orders';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

const TEST_PANELS = ['全血計數', '肝功能', '腎功能', '血脂', '血糖', '甲狀腺', '尿常規', '心電圖'];
const EXT_LABS = ['金域檢驗', '華大基因', '養和化驗', '聯合醫務化驗'];
const SAMPLE_TYPES = ['血液', '尿液', '糞便', '其他'];
const URGENCY_MAP = { routine: '常規', urgent: '緊急', stat: '即時' };
const STATUS_LIST = ['已開單', '已採樣', '已送出', '結果待覆', '已完成', '已取消'];
const STATUS_STYLE = {
  '已開單': { color: '#6b7280', bg: '#f3f4f6' },
  '已採樣': { color: '#f59e0b', bg: '#fffbeb' },
  '已送出': { color: '#3b82f6', bg: '#eff6ff' },
  '結果待覆': { color: '#8b5cf6', bg: '#f5f3ff' },
  '已完成': { color: '#10b981', bg: '#ecfdf5' },
  '已取消': { color: '#ef4444', bg: '#fef2f2' },
};

function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function save(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }

const today = () => new Date().toISOString().substring(0, 10);

const badge = (s) => {
  const st = STATUS_STYLE[s] || { color: '#666', bg: '#eee' };
  return { display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: st.color, background: st.bg };
};

export default function LabOrderTracking({ data, showToast, user }) {
  const [orders, setOrders] = useState(load);
  const [tab, setTab] = useState('list');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterLab, setFilterLab] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [patSearch, setPatSearch] = useState('');
  const [form, setForm] = useState({ patientId: '', patientName: '', doctor: '', lab: '', tests: [], urgency: 'routine', sampleType: '血液', collectedDate: '', sentDate: '', expectedDate: '', resultDate: '', status: '已開單', results: '', notes: '' });

  const patients = data?.patients || [];
  const doctors = getDoctors();
  const clinicName = getClinicName();

  const patientSuggestions = useMemo(() => {
    if (!patSearch || patSearch.length < 1) return [];
    const q = patSearch.toLowerCase();
    return patients.filter(p => p.name?.toLowerCase().includes(q) || p.phone?.includes(q) || p.id?.includes(q)).slice(0, 8);
  }, [patSearch, patients]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orders.filter(o => {
      if (filterStatus !== 'all' && o.status !== filterStatus) return false;
      if (filterLab !== 'all' && o.lab !== filterLab) return false;
      if (q && !o.patientName?.toLowerCase().includes(q) && !o.lab?.toLowerCase().includes(q) && !o.tests?.some(t => t.toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [orders, search, filterStatus, filterLab]);

  const overdue = useMemo(() => orders.filter(o => o.expectedDate && o.expectedDate < today() && !['已完成', '已取消'].includes(o.status)), [orders]);

  const stats = useMemo(() => {
    const byLab = {};
    EXT_LABS.forEach(l => { byLab[l] = 0; });
    let totalTurn = 0, turnCount = 0, pending = 0;
    orders.forEach(o => {
      if (byLab[o.lab] !== undefined) byLab[o.lab]++;
      if (!['已完成', '已取消'].includes(o.status)) pending++;
      if (o.status === '已完成' && o.sentDate && o.resultDate) {
        const diff = (new Date(o.resultDate) - new Date(o.sentDate)) / 86400000;
        if (diff > 0) { totalTurn += diff; turnCount++; }
      }
    });
    return { byLab, avgTurn: turnCount ? (totalTurn / turnCount).toFixed(1) : '-', pending };
  }, [orders]);

  const resetForm = () => { setForm({ patientId: '', patientName: '', doctor: '', lab: '', tests: [], urgency: 'routine', sampleType: '血液', collectedDate: '', sentDate: '', expectedDate: '', resultDate: '', status: '已開單', results: '', notes: '' }); setPatSearch(''); setEditId(null); };

  const openNew = () => { resetForm(); setShowForm(true); };

  const openEdit = (o) => { setForm({ ...o }); setPatSearch(o.patientName || ''); setEditId(o.id); setShowForm(true); };

  const handleSave = () => {
    if (!form.patientName) return showToast('請選擇病人');
    if (!form.lab) return showToast('請選擇化驗所');
    if (!form.tests.length) return showToast('請選擇化驗項目');
    const entry = { ...form, id: editId || uid(), createdAt: editId ? orders.find(o => o.id === editId)?.createdAt : new Date().toISOString(), createdBy: user?.name || '' };
    const updated = editId ? orders.map(o => o.id === editId ? entry : o) : [...orders, entry];
    setOrders(updated); save(updated);
    showToast(editId ? '已更新化驗單' : '已建立化驗單');
    setShowForm(false); resetForm();
  };

  const updateStatus = (id, status) => {
    const now = today();
    const updated = orders.map(o => {
      if (o.id !== id) return o;
      const patch = { status };
      if (status === '已採樣' && !o.collectedDate) patch.collectedDate = now;
      if (status === '已送出' && !o.sentDate) patch.sentDate = now;
      if (status === '已完成' && !o.resultDate) patch.resultDate = now;
      return { ...o, ...patch };
    });
    setOrders(updated); save(updated);
    showToast(`狀態已更新為「${status}」`);
    if (detail) setDetail(updated.find(o => o.id === detail.id));
  };

  const deleteOrder = (id) => { if (!window.confirm('確定刪除此化驗單？')) return; const updated = orders.filter(o => o.id !== id); setOrders(updated); save(updated); setDetail(null); showToast('已刪除'); };

  const toggleTest = (t) => setForm(f => ({ ...f, tests: f.tests.includes(t) ? f.tests.filter(x => x !== t) : [...f.tests, t] }));

  const printOrder = (o) => {
    const p = patients.find(pt => pt.id === o.patientId) || {};
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>化驗單</title><style>body{font-family:sans-serif;padding:40px;color:#222}h2{color:${ACCENT};margin-bottom:4px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ccc;padding:8px 12px;text-align:left}th{background:#f3f4f6}.sig{margin-top:60px;display:flex;justify-content:space-between}.sig div{width:40%;border-top:1px solid #333;padding-top:4px;text-align:center}</style></head><body>`);
    w.document.write(`<h2>${escapeHtml(clinicName)}</h2><p>外判化驗申請單</p><hr/>`);
    w.document.write(`<table><tr><th>病人姓名</th><td>${escapeHtml(o.patientName)}</td><th>電話</th><td>${escapeHtml(p.phone || '-')}</td></tr><tr><th>主診醫師</th><td>${escapeHtml(o.doctor || '-')}</td><th>緊急程度</th><td>${escapeHtml(URGENCY_MAP[o.urgency] || o.urgency)}</td></tr><tr><th>化驗所</th><td>${escapeHtml(o.lab)}</td><th>樣本類型</th><td>${escapeHtml(o.sampleType || '-')}</td></tr><tr><th>採樣日期</th><td>${o.collectedDate || '-'}</td><th>送出日期</th><td>${o.sentDate || '-'}</td></tr><tr><th>預計日期</th><td>${o.expectedDate || '-'}</td><th>狀態</th><td>${escapeHtml(o.status)}</td></tr></table>`);
    w.document.write(`<h3>化驗項目</h3><ul>${o.tests.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`);
    if (o.notes) w.document.write(`<p><b>備註：</b>${escapeHtml(o.notes)}</p>`);
    if (o.results) w.document.write(`<p><b>結果：</b>${escapeHtml(o.results)}</p>`);
    w.document.write(`<div class="sig"><div>醫師簽名</div><div>日期</div></div>`);
    w.document.write(`<script>window.print();<\/script></body></html>`);
    w.document.close();
  };

  /* ── timeline ── */
  const Timeline = ({ order }) => {
    const steps = ['已開單', '已採樣', '已送出', '結果待覆', '已完成'];
    if (order.status === '已取消') return <span style={badge('已取消')}>已取消</span>;
    const idx = steps.indexOf(order.status);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '8px 0' }}>
        {steps.map((s, i) => {
          const done = i <= idx;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: done ? ACCENT : '#e5e7eb', color: done ? '#fff' : '#aaa', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{i + 1}</div>
              <span style={{ fontSize: 11, margin: '0 2px', color: done ? ACCENT : '#aaa' }}>{s}</span>
              {i < steps.length - 1 && <div style={{ width: 18, height: 2, background: i < idx ? ACCENT : '#e5e7eb' }} />}
            </div>
          );
        })}
      </div>
    );
  };

  const inp = { padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, width: '100%', boxSizing: 'border-box' };
  const btn = (bg = ACCENT) => ({ padding: '7px 18px', borderRadius: 6, border: 'none', background: bg, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 });
  const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' };
  const tabStyle = (active) => ({ padding: '8px 20px', borderRadius: '8px 8px 0 0', border: 'none', background: active ? ACCENT : '#e5e7eb', color: active ? '#fff' : '#555', cursor: 'pointer', fontWeight: 600, fontSize: 14 });

  /* ── FORM ── */
  if (showForm) return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: ACCENT, margin: 0 }}>{editId ? '編輯化驗單' : '新增化驗單'}</h3>
        <button onClick={() => { setShowForm(false); resetForm(); }} style={btn('#6b7280')}>返回</button>
      </div>
      <div style={card}>
        <div style={{ marginBottom: 12, position: 'relative' }}>
          <label style={{ fontWeight: 600, fontSize: 13 }}>病人 *</label>
          <input style={inp} placeholder="搜尋病人姓名/電話" value={patSearch} onChange={e => { setPatSearch(e.target.value); setForm(f => ({ ...f, patientName: e.target.value, patientId: '' })); }} />
          {patientSuggestions.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 10, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, width: '100%', maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {patientSuggestions.map(p => <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }} onClick={() => { setForm(f => ({ ...f, patientId: p.id, patientName: p.name })); setPatSearch(p.name); }}>{p.name} {p.phone ? `(${p.phone})` : ''}</div>)}
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontWeight: 600, fontSize: 13 }}>主診醫師</label>
            <select style={inp} value={form.doctor} onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))}>
              <option value="">-- 選擇 --</option>
              {doctors.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontWeight: 600, fontSize: 13 }}>外判化驗所 *</label>
            <select style={inp} value={form.lab} onChange={e => setForm(f => ({ ...f, lab: e.target.value }))}>
              <option value="">-- 選擇 --</option>
              {EXT_LABS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13 }}>化驗項目 * (可多選)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {TEST_PANELS.map(t => (
              <button key={t} onClick={() => toggleTest(t)} style={{ padding: '5px 14px', borderRadius: 16, border: form.tests.includes(t) ? `2px solid ${ACCENT}` : '1px solid #d1d5db', background: form.tests.includes(t) ? '#ecfeff' : '#fff', color: form.tests.includes(t) ? ACCENT : '#555', cursor: 'pointer', fontSize: 13, fontWeight: form.tests.includes(t) ? 700 : 400 }}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontWeight: 600, fontSize: 13 }}>緊急程度</label>
            <select style={inp} value={form.urgency} onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))}>
              {Object.entries(URGENCY_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontWeight: 600, fontSize: 13 }}>樣本類型</label>
            <select style={inp} value={form.sampleType} onChange={e => setForm(f => ({ ...f, sampleType: e.target.value }))}>
              {SAMPLE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={{ fontWeight: 600, fontSize: 13 }}>採樣日期</label><input type="date" style={inp} value={form.collectedDate} onChange={e => setForm(f => ({ ...f, collectedDate: e.target.value }))} /></div>
          <div><label style={{ fontWeight: 600, fontSize: 13 }}>送出日期</label><input type="date" style={inp} value={form.sentDate} onChange={e => setForm(f => ({ ...f, sentDate: e.target.value }))} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div><label style={{ fontWeight: 600, fontSize: 13 }}>預計結果日期</label><input type="date" style={inp} value={form.expectedDate} onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))} /></div>
          <div><label style={{ fontWeight: 600, fontSize: 13 }}>結果日期</label><input type="date" style={inp} value={form.resultDate} onChange={e => setForm(f => ({ ...f, resultDate: e.target.value }))} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontWeight: 600, fontSize: 13 }}>狀態</label>
            <select style={inp} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13 }}>結果/報告</label>
          <textarea style={{ ...inp, minHeight: 60 }} value={form.results} onChange={e => setForm(f => ({ ...f, results: e.target.value }))} placeholder="化驗結果摘要" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontWeight: 600, fontSize: 13 }}>備註</label>
          <textarea style={{ ...inp, minHeight: 50 }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="其他備註" />
        </div>
        <button onClick={handleSave} style={btn()}>{editId ? '更新' : '建立化驗單'}</button>
      </div>
    </div>
  );

  /* ── DETAIL ── */
  if (detail) return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ color: ACCENT, margin: 0 }}>化驗單詳情</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => printOrder(detail)} style={btn('#6b7280')}>列印</button>
          <button onClick={() => openEdit(detail)} style={btn('#f59e0b')}>編輯</button>
          <button onClick={() => setDetail(null)} style={btn('#6b7280')}>返回</button>
        </div>
      </div>
      <div style={card}>
        <Timeline order={detail} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 14, marginTop: 12 }}>
          <div><b>病人：</b>{detail.patientName}</div>
          <div><b>醫師：</b>{detail.doctor || '-'}</div>
          <div><b>化驗所：</b>{detail.lab}</div>
          <div><b>緊急程度：</b>{URGENCY_MAP[detail.urgency] || detail.urgency}</div>
          <div><b>樣本類型：</b>{detail.sampleType || '-'}</div>
          <div><b>狀態：</b><span style={badge(detail.status)}>{detail.status}</span></div>
          <div><b>採樣日期：</b>{detail.collectedDate || '-'}</div>
          <div><b>送出日期：</b>{detail.sentDate || '-'}</div>
          <div><b>預計日期：</b>{detail.expectedDate || '-'}</div>
          <div><b>結果日期：</b>{detail.resultDate || '-'}</div>
        </div>
        <div style={{ marginTop: 12 }}><b>化驗項目：</b>{detail.tests?.join('、')}</div>
        {detail.results && <div style={{ marginTop: 8, padding: 10, background: '#f0fdfa', borderRadius: 6, fontSize: 14 }}><b>結果：</b>{detail.results}</div>}
        {detail.notes && <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}><b>備註：</b>{detail.notes}</div>}
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {detail.status !== '已完成' && detail.status !== '已取消' && STATUS_LIST.filter(s => s !== detail.status && s !== '已取消').map(s => (
            <button key={s} onClick={() => updateStatus(detail.id, s)} style={{ ...btn(STATUS_STYLE[s]?.color || '#888'), fontSize: 12, padding: '5px 12px' }}>{s}</button>
          ))}
          {detail.status !== '已取消' && detail.status !== '已完成' && <button onClick={() => updateStatus(detail.id, '已取消')} style={{ ...btn('#ef4444'), fontSize: 12, padding: '5px 12px' }}>取消</button>}
          <button onClick={() => deleteOrder(detail.id)} style={{ ...btn('#ef4444'), fontSize: 12, padding: '5px 12px' }}>刪除</button>
        </div>
      </div>
    </div>
  );

  /* ── MAIN LIST ── */
  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ color: ACCENT, margin: 0 }}>外判化驗追蹤</h3>
        <button onClick={openNew} style={btn()}>+ 新增化驗單</button>
      </div>

      {/* Overdue alerts */}
      {overdue.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
          <b style={{ color: '#ef4444' }}>逾期提醒 ({overdue.length})</b>
          {overdue.slice(0, 5).map(o => (
            <div key={o.id} style={{ marginTop: 4, cursor: 'pointer', color: '#b91c1c' }} onClick={() => setDetail(o)}>{o.patientName} — {o.lab} — 預計 {o.expectedDate}</div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 0 }}>
        <button onClick={() => setTab('list')} style={tabStyle(tab === 'list')}>化驗單列表</button>
        <button onClick={() => setTab('stats')} style={tabStyle(tab === 'stats')}>統計</button>
      </div>

      {tab === 'stats' ? (
        <div style={{ ...card, borderTopLeftRadius: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ textAlign: 'center', padding: 16, background: '#ecfeff', borderRadius: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: ACCENT }}>{orders.length}</div>
              <div style={{ fontSize: 13, color: '#666' }}>總化驗單</div>
            </div>
            <div style={{ textAlign: 'center', padding: 16, background: '#fffbeb', borderRadius: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{stats.pending}</div>
              <div style={{ fontSize: 13, color: '#666' }}>待處理</div>
            </div>
            <div style={{ textAlign: 'center', padding: 16, background: '#ecfdf5', borderRadius: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>{stats.avgTurn}</div>
              <div style={{ fontSize: 13, color: '#666' }}>平均周轉天數</div>
            </div>
          </div>
          <h4 style={{ color: ACCENT, marginBottom: 8 }}>各化驗所訂單數</h4>
          {Object.entries(stats.byLab).map(([lab, count]) => (
            <div key={lab} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 100, fontSize: 13 }}>{lab}</span>
              <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 4, height: 18 }}>
                <div style={{ width: `${orders.length ? (count / orders.length) * 100 : 0}%`, background: ACCENT, height: '100%', borderRadius: 4, minWidth: count ? 18 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>{count || ''}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Filters */}
          <div style={{ ...card, borderTopLeftRadius: 0, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input style={{ ...inp, maxWidth: 220 }} placeholder="搜尋病人/化驗所/項目" value={search} onChange={e => setSearch(e.target.value)} />
            <select style={{ ...inp, maxWidth: 130 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">全部狀態</option>
              {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={{ ...inp, maxWidth: 140 }} value={filterLab} onChange={e => setFilterLab(e.target.value)}>
              <option value="all">全部化驗所</option>
              {EXT_LABS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <span style={{ fontSize: 13, color: '#888' }}>共 {filtered.length} 筆</span>
          </div>

          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無化驗單</div>}

          {filtered.map(o => {
            const isOverdue = o.expectedDate && o.expectedDate < today() && !['已完成', '已取消'].includes(o.status);
            return (
              <div key={o.id} onClick={() => setDetail(o)} style={{ ...card, cursor: 'pointer', borderLeft: isOverdue ? '4px solid #ef4444' : `4px solid ${STATUS_STYLE[o.status]?.color || '#ccc'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <b>{o.patientName}</b>
                    <span style={{ margin: '0 8px', color: '#aaa' }}>|</span>
                    <span style={{ fontSize: 13, color: '#666' }}>{o.lab}</span>
                    {isOverdue && <span style={{ marginLeft: 8, fontSize: 11, color: '#ef4444', fontWeight: 700 }}>逾期</span>}
                  </div>
                  <span style={badge(o.status)}>{o.status}</span>
                </div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{o.tests?.join('、')}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                  {o.urgency !== 'routine' && <span style={{ color: o.urgency === 'stat' ? '#ef4444' : '#f59e0b', fontWeight: 600, marginRight: 8 }}>{URGENCY_MAP[o.urgency]}</span>}
                  {o.doctor && <span style={{ marginRight: 8 }}>醫師: {o.doctor}</span>}
                  {o.expectedDate && <span>預計: {o.expectedDate}</span>}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
