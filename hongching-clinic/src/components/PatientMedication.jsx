import { useState, useMemo } from 'react';
import { getDoctors } from '../data';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_patient_med';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const save = (arr) => localStorage.setItem(LS_KEY, JSON.stringify(arr));

const ACCENT = '#0e7490';
const ACCENT_LIGHT = '#f0fdfa';
const RED = '#dc2626';
const ORANGE = '#ea580c';
const GREEN = '#16a34a';
const GRAY = '#6b7280';
const card = { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.1)' };
const btn = { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 500 };
const btnOut = { ...btn, background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}` };
const btnSm = { ...btn, padding: '4px 12px', fontSize: 12 };
const inp = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const sel = { ...inp, appearance: 'auto' };

const CATEGORIES = ['中藥', '西藥', '保健品'];
const ROUTES = ['口服', '外用', '注射'];
const FREQ_OPTIONS = ['每日1次', '每日2次', '每日3次', '每日4次', '需要時服用'];

// Common interaction pairs (simplified for demo)
const INTERACTION_PAIRS = [
  [['華法林', 'Warfarin'], ['阿士匹靈', 'Aspirin'], '出血風險增加'],
  [['華法林', 'Warfarin'], ['丹參'], '增強抗凝效果'],
  [['甘草'], ['降壓藥', '氨氯地平'], '可能降低降壓效果'],
  [['人參'], ['華法林', 'Warfarin'], '影響抗凝效果'],
  [['當歸'], ['華法林', 'Warfarin'], '增強抗凝效果'],
  [['麻黃'], ['降壓藥'], '可能升高血壓'],
  [['黃連'], ['環孢素'], '影響藥物代謝'],
  [['Metformin', '二甲雙胍'], ['酒精'], '乳酸中毒風險'],
];

function checkInteractions(meds) {
  const warnings = [];
  const names = meds.map(m => m.name);
  for (const [groupA, groupB, note] of INTERACTION_PAIRS) {
    const matchA = names.find(n => groupA.some(a => n.includes(a)));
    const matchB = names.find(n => n !== matchA && groupB.some(b => n.includes(b)));
    if (matchA && matchB) warnings.push({ a: matchA, b: matchB, note });
  }
  return warnings;
}

function reviewDue(med) {
  if (!med.startDate || med.endDate) return false;
  const start = new Date(med.startDate);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  return months >= 3;
}

const EMPTY = { name: '', category: '中藥', dosage: '', frequency: '每日2次', route: '口服', doctor: '', startDate: '', endDate: '', notes: '' };

export default function PatientMedication({ data, showToast, user }) {
  const [records, setRecords] = useState(load);
  const [search, setSearch] = useState('');
  const [selPatient, setSelPatient] = useState(null);
  const [showDD, setShowDD] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [viewMode, setViewMode] = useState('active'); // active | discontinued | timeline

  const clinicName = getClinicName();
  const doctors = getDoctors();
  const patients = data?.patients || [];

  const matched = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 10);
  }, [search, patients]);

  const patientMeds = useMemo(() => {
    if (!selPatient) return [];
    return records.filter(r => r.patientId === selPatient.id).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  }, [selPatient, records]);

  const activeMeds = useMemo(() => patientMeds.filter(m => !m.endDate), [patientMeds]);
  const discontinuedMeds = useMemo(() => patientMeds.filter(m => m.endDate), [patientMeds]);
  const displayMeds = viewMode === 'active' ? activeMeds : viewMode === 'discontinued' ? discontinuedMeds : patientMeds;
  const interactions = useMemo(() => checkInteractions(activeMeds), [activeMeds]);
  const reviewList = useMemo(() => activeMeds.filter(reviewDue), [activeMeds]);

  function selectPatient(p) { setSelPatient(p); setSearch(p.name); setShowDD(false); setShowForm(false); setEditId(null); }

  function openNew() {
    setForm({ ...EMPTY, doctor: doctors[0] || '', startDate: new Date().toISOString().substring(0, 10) });
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(med) {
    setForm({ name: med.name, category: med.category, dosage: med.dosage, frequency: med.frequency, route: med.route, doctor: med.doctor, startDate: med.startDate || '', endDate: med.endDate || '', notes: med.notes || '' });
    setEditId(med.id);
    setShowForm(true);
  }

  function handleSave() {
    if (!form.name.trim()) { showToast && showToast('請輸入藥物名稱'); return; }
    let updated;
    if (editId) {
      updated = records.map(r => r.id === editId ? { ...r, ...form, updatedAt: new Date().toISOString().substring(0, 10), updatedBy: user?.name || 'staff' } : r);
    } else {
      const rec = { id: uid(), patientId: selPatient.id, patientName: selPatient.name, ...form, createdAt: new Date().toISOString().substring(0, 10), createdBy: user?.name || 'staff' };
      updated = [rec, ...records];
    }
    setRecords(updated);
    save(updated);
    setShowForm(false);
    setEditId(null);
    showToast && showToast(editId ? '已更新藥物記錄' : '已新增藥物記錄');
  }

  function handleDiscontinue(id) {
    const today = new Date().toISOString().substring(0, 10);
    const updated = records.map(r => r.id === id ? { ...r, endDate: today, updatedBy: user?.name || 'staff' } : r);
    setRecords(updated);
    save(updated);
    showToast && showToast('已停用藥物');
  }

  function handleDelete(id) {
    const updated = records.filter(r => r.id !== id);
    setRecords(updated);
    save(updated);
    showToast && showToast('已刪除藥物記錄');
  }

  function handlePrint() {
    const meds = activeMeds;
    const rows = meds.map(m =>
      `<tr><td>${m.name}</td><td>${m.category}</td><td>${m.dosage}</td><td>${m.frequency}</td><td>${m.route}</td><td>${m.doctor}</td><td>${m.startDate || '-'}</td></tr>`
    ).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>藥物清單</title>
<style>body{font-family:sans-serif;padding:30px;max-width:800px;margin:0 auto}
h1{color:${ACCENT};font-size:20px}table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px}
th{background:#f9fafb;color:#555;font-size:12px}.footer{margin-top:30px;font-size:11px;color:#999}
</style></head><body>
<h1>${clinicName} - 患者藥物清單</h1>
<p><b>患者：</b>${selPatient.name}　<b>列印日期：</b>${new Date().toISOString().substring(0, 10)}</p>
<h3 style="font-size:15px;color:#333">現行藥物（共 ${meds.length} 項）</h3>
<table><tr><th>藥物名稱</th><th>分類</th><th>劑量</th><th>頻率</th><th>途徑</th><th>處方醫師</th><th>開始日期</th></tr>${rows}</table>
${interactions.length ? `<h3 style="font-size:15px;color:${RED};margin-top:24px">藥物交互作用警告</h3><ul>${interactions.map(w => `<li>${w.a} + ${w.b}：${w.note}</li>`).join('')}</ul>` : ''}
<p class="footer">本清單由 ${clinicName} 管理系統生成，僅供參考。如有疑問請聯絡您的醫師。</p>
</body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  }

  // Timeline helpers
  function timelineBar(med) {
    const start = new Date(med.startDate || med.createdAt);
    const end = med.endDate ? new Date(med.endDate) : new Date();
    const now = new Date();
    const earliest = new Date(Math.min(...patientMeds.map(m => new Date(m.startDate || m.createdAt).getTime())));
    const range = now.getTime() - earliest.getTime() || 1;
    const left = ((start.getTime() - earliest.getTime()) / range) * 100;
    const width = Math.max(((end.getTime() - start.getTime()) / range) * 100, 2);
    const color = med.endDate ? GRAY : med.category === '中藥' ? ACCENT : med.category === '西藥' ? '#6366f1' : GREEN;
    return { left: `${Math.max(0, left)}%`, width: `${Math.min(width, 100 - left)}%`, background: color, height: 14, borderRadius: 4, position: 'absolute', top: 3, opacity: med.endDate ? 0.5 : 1 };
  }

  const catBadge = (cat) => {
    const colors = { '中藥': { bg: '#ecfdf5', color: '#065f46' }, '西藥': { bg: '#eef2ff', color: '#3730a3' }, '保健品': { bg: '#fffbeb', color: '#92400e' } };
    const c = colors[cat] || { bg: '#f3f4f6', color: GRAY };
    return { display: 'inline-block', fontSize: 11, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.color, fontWeight: 500 };
  };

  return (
    <div style={{ maxWidth: 750, margin: '0 auto', padding: 16 }}>
      <h2 style={{ color: ACCENT, marginBottom: 4, fontSize: 20 }}>患者用藥管理</h2>
      <p style={{ color: GRAY, fontSize: 13, marginTop: 0, marginBottom: 14 }}>{clinicName} - 藥物記錄與追蹤</p>

      {/* Patient search */}
      <div style={{ ...card, position: 'relative' }}>
        <label style={{ fontSize: 13, color: GRAY, marginBottom: 4, display: 'block' }}>搜尋患者</label>
        <input style={inp} placeholder="輸入患者姓名或電話..." value={search}
          onChange={e => { setSearch(e.target.value); setShowDD(true); if (selPatient && e.target.value !== selPatient.name) setSelPatient(null); }}
          onFocus={() => setShowDD(true)} />
        {showDD && matched.length > 0 && !selPatient && (
          <div style={{ position: 'absolute', left: 16, right: 16, top: '100%', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, zIndex: 20, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.12)' }}>
            {matched.map(p => (
              <div key={p.id} onClick={() => selectPatient(p)}
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: 14 }}
                onMouseEnter={e => e.currentTarget.style.background = ACCENT_LIGHT}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                <strong>{p.name}</strong> {p.phone ? <span style={{ color: GRAY }}>({p.phone})</span> : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {selPatient && (
        <>
          {/* Header bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 17 }}>{selPatient.name}</span>
              {selPatient.phone && <span style={{ color: GRAY, fontSize: 13, marginLeft: 8 }}>{selPatient.phone}</span>}
              <span style={{ fontSize: 12, color: ACCENT, marginLeft: 8 }}>現行 {activeMeds.length} 項 / 已停 {discontinuedMeds.length} 項</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {!showForm && <button style={btn} onClick={openNew}>+ 新增藥物</button>}
              {activeMeds.length > 0 && <button style={btnOut} onClick={handlePrint}>列印藥物清單</button>}
            </div>
          </div>

          {/* Interaction warnings */}
          {interactions.length > 0 && (
            <div style={{ ...card, background: '#fef2f2', border: `1px solid #fecaca` }}>
              <div style={{ fontWeight: 600, color: RED, fontSize: 14, marginBottom: 6 }}>藥物交互作用警告</div>
              {interactions.map((w, i) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 4, color: '#7f1d1d' }}>
                  <span style={{ display: 'inline-block', background: RED, color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 8, marginRight: 6 }}>警告</span>
                  <b>{w.a}</b> + <b>{w.b}</b>：{w.note}
                </div>
              ))}
            </div>
          )}

          {/* Review reminders */}
          {reviewList.length > 0 && (
            <div style={{ ...card, background: '#fffbeb', border: '1px solid #fde68a' }}>
              <div style={{ fontWeight: 600, color: ORANGE, fontSize: 14, marginBottom: 6 }}>覆審提醒（超過3個月未覆審）</div>
              {reviewList.map(m => (
                <div key={m.id} style={{ fontSize: 13, color: '#92400e', marginBottom: 3 }}>
                  <b>{m.name}</b> — 開始日期：{m.startDate}，處方醫師：{m.doctor || '-'}
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit form */}
          {showForm && (
            <div style={{ ...card, border: `2px solid ${ACCENT}` }}>
              <h4 style={{ margin: '0 0 12px', color: ACCENT, fontSize: 16 }}>{editId ? '編輯藥物' : '新增藥物'}</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ flex: '1 1 60%', minWidth: 180, marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 3 }}>藥物名稱 *</label>
                  <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="例：柴胡、Metformin" />
                </div>
                <div style={{ flex: '0 0 35%', minWidth: 120, marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 3 }}>分類</label>
                  <select style={sel} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ flex: '0 0 48%', minWidth: 120, marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 3 }}>劑量</label>
                  <input style={inp} value={form.dosage} onChange={e => setForm(f => ({ ...f, dosage: e.target.value }))} placeholder="例：10g、500mg" />
                </div>
                <div style={{ flex: '0 0 48%', minWidth: 120, marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 3 }}>頻率</label>
                  <select style={sel} value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                    {FREQ_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div style={{ flex: '0 0 48%', minWidth: 120, marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 3 }}>給藥途徑</label>
                  <select style={sel} value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))}>
                    {ROUTES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div style={{ flex: '0 0 48%', minWidth: 120, marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 3 }}>處方醫師</label>
                  <select style={sel} value={form.doctor} onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))}>
                    <option value="">-- 選擇 --</option>
                    {doctors.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{ flex: '0 0 48%', minWidth: 120, marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 3 }}>開始日期</label>
                  <input type="date" style={inp} value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div style={{ flex: '0 0 48%', minWidth: 120, marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 3 }}>結束日期（留空=持續中）</label>
                  <input type="date" style={inp} value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
                </div>
                <div style={{ flex: '1 1 100%', marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 3 }}>備註</label>
                  <textarea style={{ ...inp, minHeight: 40, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button style={btn} onClick={handleSave}>{editId ? '更新' : '保存'}</button>
                <button style={{ ...btn, background: GRAY }} onClick={() => { setShowForm(false); setEditId(null); }}>取消</button>
              </div>
            </div>
          )}

          {/* View mode tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {[['active', '現行藥物'], ['discontinued', '已停用'], ['timeline', '時間軸']].map(([k, l]) => (
              <button key={k} onClick={() => setViewMode(k)}
                style={{ ...btnSm, background: viewMode === k ? ACCENT : '#fff', color: viewMode === k ? '#fff' : ACCENT, border: `1px solid ${ACCENT}` }}>{l}</button>
            ))}
          </div>

          {/* Timeline view */}
          {viewMode === 'timeline' && patientMeds.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 13, color: GRAY, marginBottom: 10 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: ACCENT, marginRight: 4, verticalAlign: 'middle' }} /> 中藥
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#6366f1', marginLeft: 12, marginRight: 4, verticalAlign: 'middle' }} /> 西藥
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: GREEN, marginLeft: 12, marginRight: 4, verticalAlign: 'middle' }} /> 保健品
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: GRAY, marginLeft: 12, marginRight: 4, verticalAlign: 'middle', opacity: 0.5 }} /> 已停用
              </div>
              {patientMeds.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ width: 120, fontSize: 12, fontWeight: 500, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                  <div style={{ flex: 1, position: 'relative', height: 20, background: '#f3f4f6', borderRadius: 4 }}>
                    <div style={timelineBar(m)} title={`${m.startDate || '?'} ~ ${m.endDate || '持續中'}`} />
                  </div>
                  <div style={{ width: 80, fontSize: 11, color: GRAY, textAlign: 'right', flexShrink: 0, marginLeft: 6 }}>{m.startDate || '-'}</div>
                </div>
              ))}
            </div>
          )}

          {/* Medication list */}
          {viewMode !== 'timeline' && displayMeds.length === 0 && !showForm && (
            <div style={{ ...card, textAlign: 'center', color: '#9ca3af', padding: 32 }}>
              {viewMode === 'active' ? '暫無現行藥物記錄' : '暫無已停用藥物'}
            </div>
          )}

          {viewMode !== 'timeline' && displayMeds.map(m => (
            <div key={m.id} style={{ ...card, borderLeft: `4px solid ${m.endDate ? GRAY : ACCENT}`, opacity: m.endDate ? 0.8 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 15, color: '#111' }}>{m.name}</span>
                  <span style={catBadge(m.category)}>{m.category}</span>
                  {reviewDue(m) && <span style={{ fontSize: 10, background: ORANGE, color: '#fff', padding: '1px 6px', borderRadius: 8, marginLeft: 6 }}>需覆審</span>}
                  {m.endDate && <span style={{ fontSize: 10, background: GRAY, color: '#fff', padding: '1px 6px', borderRadius: 8, marginLeft: 6 }}>已停用</span>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={{ ...btnSm, background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}` }} onClick={() => openEdit(m)}>編輯</button>
                  {!m.endDate && <button style={{ ...btnSm, background: '#fff', color: ORANGE, border: `1px solid ${ORANGE}` }} onClick={() => handleDiscontinue(m.id)}>停用</button>}
                  <button style={{ ...btnSm, background: '#fff', color: RED, border: `1px solid ${RED}` }} onClick={() => handleDelete(m.id)}>刪除</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13, color: '#374151' }}>
                <span><b>劑量：</b>{m.dosage || '-'}</span>
                <span><b>頻率：</b>{m.frequency || '-'}</span>
                <span><b>途徑：</b>{m.route || '-'}</span>
                <span><b>醫師：</b>{m.doctor || '-'}</span>
              </div>
              <div style={{ fontSize: 12, color: GRAY, marginTop: 4 }}>
                {m.startDate || '-'} ~ {m.endDate || '持續中'}
                {m.notes && <span style={{ marginLeft: 12 }}>備註：{m.notes}</span>}
              </div>
            </div>
          ))}

          {/* Category summary */}
          {activeMeds.length > 0 && viewMode === 'active' && (
            <div style={{ ...card, background: ACCENT_LIGHT }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: ACCENT, marginBottom: 6 }}>用藥摘要</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                {CATEGORIES.map(cat => {
                  const count = activeMeds.filter(m => m.category === cat).length;
                  return count > 0 ? <span key={cat}><span style={catBadge(cat)}>{cat}</span> {count} 項</span> : null;
                })}
                <span style={{ color: GRAY }}>合共 {activeMeds.length} 項現行藥物</span>
              </div>
            </div>
          )}
        </>
      )}

      {!selPatient && !search.trim() && (
        <div style={{ ...card, textAlign: 'center', color: '#9ca3af', padding: 40 }}>
          請搜尋患者以查看或管理藥物記錄
        </div>
      )}
    </div>
  );
}
