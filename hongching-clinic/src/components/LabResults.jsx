import { useState, useMemo } from 'react';
import { getDoctors } from '../data';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_lab_results';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const save = (arr) => localStorage.setItem(LS_KEY, JSON.stringify(arr));

const ACCENT = '#0e7490';
const ACCENT_LIGHT = '#f0fdfa';
const RED = '#dc2626';
const GREEN = '#16a34a';
const GRAY = '#6b7280';
const card = { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.1)' };
const btn = { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 500 };
const btnOut = { ...btn, background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}` };
const btnSm = { ...btn, padding: '4px 12px', fontSize: 12 };
const btnDanger = { ...btnSm, background: RED };
const inp = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const sel = { ...inp, background: '#fff' };
const badge = (bg, color) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: bg, color });

const TEST_TYPES = ['血常規', '肝功能', '腎功能', '血糖', '血脂', '尿常規', '甲狀腺功能', '其他'];
const STATUSES = ['待報告', '已出報告', '醫師已閱', '已通知病人'];
const STATUS_COLORS = { '待報告': ['#fef3c7', '#92400e'], '已出報告': ['#dbeafe', '#1e40af'], '醫師已閱': ['#d1fae5', '#065f46'], '已通知病人': ['#e0e7ff', '#3730a3'] };

const EMPTY_FORM = { patientId: '', patientName: '', testType: TEST_TYPES[0], testDate: '', reportDate: '', doctor: '', labName: '', status: '待報告', values: [{ key: '', value: '', unit: '', normalRange: '' }], summary: '', notes: '', followUp: '' };

export default function LabResults({ data, showToast, user }) {
  const [records, setRecords] = useState(load);
  const [view, setView] = useState('list'); // list | form | detail | history
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [ptSearch, setPtSearch] = useState('');
  const [selPatient, setSelPatient] = useState(null);

  const DOCTORS = getDoctors();
  const clinicName = getClinicName();
  const patients = data?.patients || [];

  const ptMatched = useMemo(() => {
    if (!ptSearch.trim()) return [];
    const q = ptSearch.trim().toLowerCase();
    return patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [ptSearch, patients]);

  const list = useMemo(() => {
    let l = [...records].sort((a, b) => (b.testDate || '').localeCompare(a.testDate || ''));
    if (search) { const q = search.toLowerCase(); l = l.filter(r => r.patientName.toLowerCase().includes(q) || r.testType.includes(q) || r.labName?.toLowerCase().includes(q)); }
    if (filterStatus !== 'all') l = l.filter(r => r.status === filterStatus);
    return l;
  }, [records, search, filterStatus]);

  const patientHistory = useMemo(() => {
    if (!selPatient) return [];
    return records.filter(r => r.patientId === selPatient.id).sort((a, b) => (b.testDate || '').localeCompare(a.testDate || ''));
  }, [selPatient, records]);

  const persist = (next) => { setRecords(next); save(next); };

  const selectPatientForForm = (p) => {
    setForm(f => ({ ...f, patientId: p.id, patientName: p.name, doctor: p.doctor || f.doctor }));
    setPtSearch('');
  };

  const addValueRow = () => setForm(f => ({ ...f, values: [...f.values, { key: '', value: '', unit: '', normalRange: '' }] }));
  const removeValueRow = (i) => setForm(f => ({ ...f, values: f.values.filter((_, idx) => idx !== i) }));
  const updateValue = (i, field, val) => setForm(f => ({ ...f, values: f.values.map((v, idx) => idx === i ? { ...v, [field]: val } : v) }));

  const handleSave = () => {
    if (!form.patientName || !form.testType || !form.testDate) return showToast('請填寫病人、檢驗類型及日期');
    const rec = { ...form, id: editId || uid(), updatedAt: new Date().toISOString(), createdBy: user?.name || '' };
    if (editId) { persist(records.map(r => r.id === editId ? rec : r)); }
    else { persist([rec, ...records]); }
    showToast(editId ? '化驗報告已更新' : '化驗報告已新增');
    setEditId(null); setForm({ ...EMPTY_FORM, doctor: DOCTORS[0] || '' }); setView('list');
  };

  const handleDelete = (id) => { persist(records.filter(r => r.id !== id)); showToast('已刪除'); setView('list'); };

  const advanceStatus = (rec) => {
    const idx = STATUSES.indexOf(rec.status);
    if (idx >= STATUSES.length - 1) return;
    const next = STATUSES[idx + 1];
    persist(records.map(r => r.id === rec.id ? { ...r, status: next } : r));
    showToast(`狀態更新為：${next}`);
  };

  const openEdit = (rec) => { setForm({ ...rec }); setEditId(rec.id); setView('form'); };

  const isAbnormal = (v) => {
    if (!v.value || !v.normalRange) return false;
    const num = parseFloat(v.value);
    if (isNaN(num)) return false;
    const m = v.normalRange.match(/([\d.]+)\s*[-–~]\s*([\d.]+)/);
    if (!m) return false;
    return num < parseFloat(m[1]) || num > parseFloat(m[2]);
  };

  const abnormalCount = (rec) => (rec.values || []).filter(isAbnormal).length;

  const handlePrint = (rec) => {
    const pt = patients.find(p => p.id === rec.patientId) || {};
    const w = window.open('', '_blank');
    if (!w) return showToast('請允許彈出視窗');
    const valRows = (rec.values || []).filter(v => v.key).map(v => {
      const abnorm = isAbnormal(v);
      return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${v.key}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:700;${abnorm ? 'color:#dc2626' : ''}">${v.value} ${v.unit || ''} ${abnorm ? ' ⚠' : ''}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;color:#888">${v.normalRange || '-'}</td></tr>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>化驗報告 - ${rec.patientName}</title><style>
      body{font-family:'Microsoft YaHei','Arial',sans-serif;padding:40px 50px;max-width:750px;margin:0 auto;color:#333}
      .header{text-align:center;border-bottom:3px double ${ACCENT};padding-bottom:14px;margin-bottom:18px}
      .header h1{font-size:18px;color:${ACCENT};margin:0} .header p{font-size:11px;color:#888;margin:2px 0}
      .title{text-align:center;font-size:18px;font-weight:800;margin:14px 0;color:${ACCENT};letter-spacing:2px}
      .info{display:flex;flex-wrap:wrap;gap:8px 24px;font-size:13px;margin:12px 0 18px;padding:12px;background:#f9fafb;border-radius:6px}
      .info span{} .info .label{font-weight:700;color:#555} table{width:100%;border-collapse:collapse;margin:14px 0}
      th{text-align:left;padding:8px 12px;background:${ACCENT};color:#fff;font-size:13px}
      .summary{margin:16px 0;padding:14px;background:#f9fafb;border-left:4px solid ${ACCENT};border-radius:4px;font-size:13px;line-height:1.7}
      .sig{margin-top:50px;display:flex;justify-content:flex-end;gap:60px;font-size:13px}
      .sig div{text-align:center;min-width:150px} .sig .line{border-top:1px solid #333;margin-top:50px;padding-top:4px}
      @media print{body{padding:20px}}
    </style></head><body>
      <div class="header"><h1>${clinicName}</h1><p>化驗報告 Laboratory Report</p></div>
      <div class="info">
        <span><span class="label">病人：</span>${rec.patientName}</span>
        <span><span class="label">電話：</span>${pt.phone || '-'}</span>
        <span><span class="label">性別：</span>${pt.gender || '-'}</span>
        <span><span class="label">年齡：</span>${pt.dob ? Math.floor((Date.now() - new Date(pt.dob)) / 31557600000) : '-'}</span>
        <span><span class="label">檢驗類型：</span>${rec.testType}</span>
        <span><span class="label">檢驗日期：</span>${rec.testDate}</span>
        <span><span class="label">報告日期：</span>${rec.reportDate || '-'}</span>
        <span><span class="label">化驗所：</span>${rec.labName || '-'}</span>
      </div>
      <table><thead><tr><th>項目</th><th>結果</th><th>參考範圍</th></tr></thead><tbody>${valRows}</tbody></table>
      ${rec.summary ? `<div class="summary"><strong>報告摘要：</strong><br/>${rec.summary.replace(/\n/g, '<br/>')}</div>` : ''}
      ${rec.notes ? `<div class="summary"><strong>臨床備注：</strong><br/>${rec.notes.replace(/\n/g, '<br/>')}</div>` : ''}
      ${rec.followUp ? `<div class="summary"><strong>跟進建議：</strong><br/>${rec.followUp.replace(/\n/g, '<br/>')}</div>` : ''}
      <div class="sig"><div><div class="line">主診醫師：${rec.doctor || ''}</div></div><div><div class="line">日期：${new Date().toISOString().substring(0, 10)}</div></div></div>
    </body></html>`);
    w.document.close(); setTimeout(() => w.print(), 400);
  };

  // ── DETAIL VIEW ──
  if (view === 'detail') {
    const rec = records.find(r => r.id === editId);
    if (!rec) { setView('list'); return null; }
    const sc = STATUS_COLORS[rec.status] || ['#f3f4f6', '#333'];
    return (<div>
      <button style={btnOut} onClick={() => { setView('list'); setEditId(null); }}>← 返回列表</button>
      <div style={{ ...card, marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, color: ACCENT }}>{rec.patientName} — {rec.testType}</h3>
          <span style={badge(sc[0], sc[1])}>{rec.status}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: GRAY, marginTop: 8 }}>
          <span>檢驗日期：{rec.testDate}</span><span>報告日期：{rec.reportDate || '-'}</span>
          <span>醫師：{rec.doctor}</span><span>化驗所：{rec.labName || '-'}</span>
        </div>
        {abnormalCount(rec) > 0 && <div style={{ marginTop: 8, padding: '4px 10px', background: '#fef2f2', borderRadius: 6, color: RED, fontSize: 13, fontWeight: 600 }}>有 {abnormalCount(rec)} 項異常指標</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, fontSize: 13 }}>
          <thead><tr style={{ background: ACCENT_LIGHT }}><th style={{ padding: '6px 10px', textAlign: 'left' }}>項目</th><th style={{ padding: '6px 10px', textAlign: 'left' }}>結果</th><th style={{ padding: '6px 10px', textAlign: 'left' }}>單位</th><th style={{ padding: '6px 10px', textAlign: 'left' }}>參考範圍</th></tr></thead>
          <tbody>{(rec.values || []).filter(v => v.key).map((v, i) => {
            const ab = isAbnormal(v);
            return <tr key={i} style={{ background: ab ? '#fef2f2' : i % 2 ? '#fafafa' : '#fff' }}><td style={{ padding: '6px 10px' }}>{v.key}</td><td style={{ padding: '6px 10px', fontWeight: 700, color: ab ? RED : 'inherit' }}>{v.value}{ab ? ' ⚠' : ''}</td><td style={{ padding: '6px 10px', color: GRAY }}>{v.unit || ''}</td><td style={{ padding: '6px 10px', color: GRAY }}>{v.normalRange || '-'}</td></tr>;
          })}</tbody>
        </table>
        {rec.summary && <div style={{ marginTop: 12, padding: 10, background: '#f9fafb', borderRadius: 6, fontSize: 13 }}><strong>報告摘要：</strong><br />{rec.summary}</div>}
        {rec.notes && <div style={{ marginTop: 8, padding: 10, background: '#f9fafb', borderRadius: 6, fontSize: 13 }}><strong>臨床備注：</strong><br />{rec.notes}</div>}
        {rec.followUp && <div style={{ marginTop: 8, padding: 10, background: '#f0fdfa', borderRadius: 6, fontSize: 13, borderLeft: `3px solid ${ACCENT}` }}><strong>跟進建議：</strong><br />{rec.followUp}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {STATUSES.indexOf(rec.status) < STATUSES.length - 1 && <button style={btnSm} onClick={() => advanceStatus(rec)}>推進狀態 → {STATUSES[STATUSES.indexOf(rec.status) + 1]}</button>}
          <button style={btnSm} onClick={() => handlePrint(rec)}>列印報告</button>
          <button style={{ ...btnSm, background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}` }} onClick={() => openEdit(rec)}>編輯</button>
          <button style={btnDanger} onClick={() => handleDelete(rec.id)}>刪除</button>
        </div>
      </div>
    </div>);
  }

  // ── FORM VIEW ──
  if (view === 'form') {
    return (<div>
      <button style={btnOut} onClick={() => { setView('list'); setEditId(null); setForm({ ...EMPTY_FORM, doctor: DOCTORS[0] || '' }); }}>← 返回列表</button>
      <div style={{ ...card, marginTop: 12 }}>
        <h3 style={{ margin: '0 0 14px', color: ACCENT }}>{editId ? '編輯化驗報告' : '新增化驗報告'}</h3>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>病人</label>
          <input style={inp} placeholder="搜尋病人姓名/電話..." value={form.patientName || ptSearch} onChange={e => { setPtSearch(e.target.value); setForm(f => ({ ...f, patientName: e.target.value, patientId: '' })); }} />
          {ptMatched.length > 0 && <div style={{ position: 'absolute', zIndex: 10, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, width: '100%', maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.12)' }}>
            {ptMatched.map(p => <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6' }} onClick={() => selectPatientForForm(p)}>{p.name} — {p.phone || ''}</div>)}
          </div>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label style={{ fontSize: 13, fontWeight: 600 }}>檢驗類型</label><select style={sel} value={form.testType} onChange={e => setForm(f => ({ ...f, testType: e.target.value }))}>{TEST_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label style={{ fontSize: 13, fontWeight: 600 }}>主診醫師</label><select style={sel} value={form.doctor} onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))}>{DOCTORS.map(d => <option key={d}>{d}</option>)}</select></div>
          <div><label style={{ fontSize: 13, fontWeight: 600 }}>檢驗日期</label><input type="date" style={inp} value={form.testDate} onChange={e => setForm(f => ({ ...f, testDate: e.target.value }))} /></div>
          <div><label style={{ fontSize: 13, fontWeight: 600 }}>報告日期</label><input type="date" style={inp} value={form.reportDate} onChange={e => setForm(f => ({ ...f, reportDate: e.target.value }))} /></div>
          <div style={{ gridColumn: '1/-1' }}><label style={{ fontSize: 13, fontWeight: 600 }}>化驗所名稱</label><input style={inp} placeholder="e.g. 金域醫學" value={form.labName} onChange={e => setForm(f => ({ ...f, labName: e.target.value }))} /></div>
        </div>
        <h4 style={{ color: ACCENT, margin: '14px 0 8px' }}>化驗結果數值</h4>
        {form.values.map((v, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 2fr auto', gap: 6, marginBottom: 6, alignItems: 'end' }}>
            <div><input style={inp} placeholder="項目 (e.g. WBC)" value={v.key} onChange={e => updateValue(i, 'key', e.target.value)} /></div>
            <div><input style={{ ...inp, fontWeight: 700, color: isAbnormal(v) ? RED : 'inherit' }} placeholder="結果" value={v.value} onChange={e => updateValue(i, 'value', e.target.value)} /></div>
            <div><input style={inp} placeholder="單位" value={v.unit} onChange={e => updateValue(i, 'unit', e.target.value)} /></div>
            <div><input style={inp} placeholder="參考範圍 (e.g. 4.0-10.0)" value={v.normalRange} onChange={e => updateValue(i, 'normalRange', e.target.value)} /></div>
            <button style={{ ...btnDanger, padding: '6px 8px' }} onClick={() => removeValueRow(i)} title="刪除">✕</button>
          </div>
        ))}
        <button style={{ ...btnOut, fontSize: 12, marginTop: 4 }} onClick={addValueRow}>+ 新增項目</button>
        <h4 style={{ color: ACCENT, margin: '14px 0 8px' }}>摘要及備注</h4>
        <div style={{ marginBottom: 8 }}><label style={{ fontSize: 13, fontWeight: 600 }}>報告摘要</label><textarea style={{ ...inp, minHeight: 60 }} value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} placeholder="化驗結果整體評估..." /></div>
        <div style={{ marginBottom: 8 }}><label style={{ fontSize: 13, fontWeight: 600 }}>臨床備注</label><textarea style={{ ...inp, minHeight: 60 }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="醫師臨床備注..." /></div>
        <div style={{ marginBottom: 10 }}><label style={{ fontSize: 13, fontWeight: 600 }}>跟進建議</label><textarea style={{ ...inp, minHeight: 50 }} value={form.followUp} onChange={e => setForm(f => ({ ...f, followUp: e.target.value }))} placeholder="建議複查時間、轉介等..." /></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn} onClick={handleSave}>{editId ? '更新報告' : '儲存報告'}</button>
          <button style={btnOut} onClick={() => { setView('list'); setEditId(null); setForm({ ...EMPTY_FORM, doctor: DOCTORS[0] || '' }); }}>取消</button>
        </div>
      </div>
    </div>);
  }

  // ── HISTORY VIEW ──
  if (view === 'history') {
    return (<div>
      <button style={btnOut} onClick={() => { setView('list'); setSelPatient(null); }}>← 返回列表</button>
      <div style={{ ...card, marginTop: 12 }}>
        <h3 style={{ margin: '0 0 10px', color: ACCENT }}>病人化驗歷史</h3>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input style={inp} placeholder="搜尋病人姓名/電話..." value={ptSearch} onChange={e => setPtSearch(e.target.value)} />
          {ptMatched.length > 0 && !selPatient && <div style={{ position: 'absolute', zIndex: 10, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, width: '100%', maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.12)' }}>
            {ptMatched.map(p => <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6' }} onClick={() => { setSelPatient(p); setPtSearch(''); }}>{p.name} — {p.phone || ''}</div>)}
          </div>}
        </div>
        {selPatient && <div style={{ padding: '8px 12px', background: ACCENT_LIGHT, borderRadius: 6, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{selPatient.name} {selPatient.phone ? `(${selPatient.phone})` : ''}</span>
          <button style={{ ...btnSm, background: '#fff', color: GRAY, border: '1px solid #d1d5db' }} onClick={() => setSelPatient(null)}>清除</button>
        </div>}
        {selPatient && patientHistory.length === 0 && <p style={{ color: GRAY, fontSize: 13 }}>此病人暫無化驗記錄</p>}
        {selPatient && patientHistory.length > 0 && <div style={{ borderLeft: `3px solid ${ACCENT}`, paddingLeft: 16 }}>
          {patientHistory.map(r => {
            const sc = STATUS_COLORS[r.status] || ['#f3f4f6', '#333'];
            const ac = abnormalCount(r);
            return <div key={r.id} style={{ ...card, cursor: 'pointer', borderLeft: 'none' }} onClick={() => { setEditId(r.id); setView('detail'); }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: ACCENT }}>{r.testType}</strong><span style={badge(sc[0], sc[1])}>{r.status}</span>
              </div>
              <div style={{ fontSize: 12, color: GRAY, marginTop: 4 }}>檢驗：{r.testDate} | 報告：{r.reportDate || '-'} | {r.doctor}</div>
              {ac > 0 && <div style={{ fontSize: 12, color: RED, marginTop: 2 }}>{ac} 項異常</div>}
              {r.summary && <div style={{ fontSize: 12, color: '#555', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.summary}</div>}
            </div>;
          })}
        </div>}
      </div>
    </div>);
  }

  // ── LIST VIEW ──
  const stats = useMemo(() => {
    const pending = records.filter(r => r.status === '待報告').length;
    const reported = records.filter(r => r.status === '已出報告').length;
    const abnorm = records.filter(r => abnormalCount(r) > 0).length;
    return { total: records.length, pending, reported, abnorm };
  }, [records]);

  return (<div>
    <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
      {[{ l: '全部報告', v: stats.total, c: ACCENT }, { l: '待報告', v: stats.pending, c: '#d97706' }, { l: '已出報告', v: stats.reported, c: '#2563eb' }, { l: '有異常', v: stats.abnorm, c: RED }].map(s => (
        <div key={s.l} style={{ ...card, flex: '1 1 120px', textAlign: 'center', minWidth: 100 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: s.c }}>{s.v}</div>
          <div style={{ fontSize: 12, color: GRAY }}>{s.l}</div>
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <input style={{ ...inp, flex: '1 1 200px' }} placeholder="搜尋病人/檢驗類型/化驗所..." value={search} onChange={e => setSearch(e.target.value)} />
      <select style={{ ...sel, width: 'auto', flex: '0 0 auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
        <option value="all">全部狀態</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <button style={btn} onClick={() => { setForm({ ...EMPTY_FORM, doctor: DOCTORS[0] || '' }); setEditId(null); setView('form'); }}>+ 新增報告</button>
      <button style={btnOut} onClick={() => { setView('history'); setPtSearch(''); setSelPatient(null); }}>病人歷史</button>
    </div>
    {list.length === 0 && <p style={{ textAlign: 'center', color: GRAY, padding: 30, fontSize: 14 }}>暫無化驗報告記錄</p>}
    {list.map(r => {
      const sc = STATUS_COLORS[r.status] || ['#f3f4f6', '#333'];
      const ac = abnormalCount(r);
      return <div key={r.id} style={{ ...card, cursor: 'pointer' }} onClick={() => { setEditId(r.id); setView('detail'); }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <div><strong style={{ fontSize: 15 }}>{r.patientName}</strong><span style={{ color: GRAY, fontSize: 13, marginLeft: 10 }}>{r.testType}</span></div>
          <span style={badge(sc[0], sc[1])}>{r.status}</span>
        </div>
        <div style={{ fontSize: 12, color: GRAY, marginTop: 4 }}>
          檢驗：{r.testDate} | 報告：{r.reportDate || '-'} | 醫師：{r.doctor} | 化驗所：{r.labName || '-'}
        </div>
        {ac > 0 && <div style={{ fontSize: 12, color: RED, fontWeight: 600, marginTop: 3 }}>{ac} 項異常指標</div>}
        {r.summary && <div style={{ fontSize: 12, color: '#555', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.summary}</div>}
      </div>;
    })}
  </div>);
}
