import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_patient_allergy';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const save = (arr) => localStorage.setItem(LS_KEY, JSON.stringify(arr));

const ACCENT = '#0e7490';
const ACCENT_LIGHT = '#f0fdfa';
const RED = '#dc2626';
const ORANGE = '#d97706';
const GRAY = '#6b7280';
const card = { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.1)' };
const btn = { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 500 };
const btnOut = { ...btn, background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}` };
const btnDanger = { ...btn, background: RED };
const inp = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const sel = { ...inp, background: '#fff' };

const CATEGORIES = ['中藥', '西藥', '食物', '環境', '其他'];
const SEVERITIES = [
  { value: 'mild', label: '輕微', color: '#16a34a' },
  { value: 'moderate', label: '中等', color: ORANGE },
  { value: 'severe', label: '嚴重', color: '#ea580c' },
  { value: 'life-threatening', label: '危及生命', color: RED },
];
const sevLabel = (v) => SEVERITIES.find(s => s.value === v)?.label || v;
const sevColor = (v) => SEVERITIES.find(s => s.value === v)?.color || GRAY;

const EMPTY_FORM = { allergen: '', category: '中藥', severity: 'mild', reaction: '', onsetDate: '', verifiedBy: '', notes: '' };

export default function PatientAllergy({ data, showToast, user }) {
  const [records, setRecords] = useState(load);
  const [search, setSearch] = useState('');
  const [selPatient, setSelPatient] = useState(null);
  const [showDD, setShowDD] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [filterCat, setFilterCat] = useState('all');
  const [tab, setTab] = useState('allergies'); // allergies | history | conflicts

  const clinicName = getClinicName();
  const patients = data?.patients || [];
  const consultations = data?.consultations || [];

  const matched = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 10);
  }, [search, patients]);

  // Active allergies for selected patient
  const patientAllergies = useMemo(() => {
    if (!selPatient) return [];
    let list = records.filter(r => r.patientId === selPatient.id && !r.removed);
    if (filterCat !== 'all') list = list.filter(r => r.category === filterCat);
    return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [selPatient, records, filterCat]);

  // Full history timeline (additions and removals)
  const historyLog = useMemo(() => {
    if (!selPatient) return [];
    return records
      .filter(r => r.patientId === selPatient.id)
      .map(r => {
        const events = [{ date: r.createdAt, type: 'added', allergen: r.allergen, category: r.category, severity: r.severity, id: r.id }];
        if (r.removed) events.push({ date: r.removedAt, type: 'removed', allergen: r.allergen, category: r.category, reason: r.removeReason, id: r.id });
        return events;
      })
      .flat()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [selPatient, records]);

  // Prescription conflict detection
  const conflicts = useMemo(() => {
    if (!selPatient) return [];
    const herbAllergies = records.filter(r => r.patientId === selPatient.id && !r.removed && r.category === '中藥');
    if (!herbAllergies.length) return [];
    const allergenSet = new Set(herbAllergies.map(a => a.allergen.trim()));
    const found = [];
    consultations
      .filter(c => c.patientName === selPatient.name)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 50)
      .forEach(c => {
        (c.prescription || []).forEach(rx => {
          if (rx.herb && allergenSet.has(rx.herb.trim())) {
            found.push({ date: c.date, doctor: c.doctor, herb: rx.herb, dosage: rx.dosage, consultId: c.id });
          }
        });
      });
    return found;
  }, [selPatient, records, consultations]);

  function selectPatient(p) {
    setSelPatient(p); setSearch(p.name); setShowDD(false); setShowForm(false); setTab('allergies'); setFilterCat('all');
  }

  function handleAdd() {
    if (!form.allergen.trim()) { showToast && showToast('請輸入過敏原名稱', 'error'); return; }
    const rec = {
      id: uid(), patientId: selPatient.id, patientName: selPatient.name,
      allergen: form.allergen.trim(), category: form.category, severity: form.severity,
      reaction: form.reaction, onsetDate: form.onsetDate, verifiedBy: form.verifiedBy,
      notes: form.notes, createdAt: new Date().toISOString().substring(0, 10),
      createdBy: user?.name || 'staff', removed: false,
    };
    const updated = [rec, ...records];
    setRecords(updated); save(updated);
    setForm({ ...EMPTY_FORM }); setShowForm(false);
    showToast && showToast('已新增過敏記錄');
  }

  function handleRemove(id) {
    const reason = prompt('請輸入移除原因（如：已確認非過敏）');
    if (reason === null) return;
    const updated = records.map(r => r.id === id ? { ...r, removed: true, removedAt: new Date().toISOString().substring(0, 10), removeReason: reason || '無', removedBy: user?.name || 'staff' } : r);
    setRecords(updated); save(updated);
    showToast && showToast('已移除過敏記錄');
  }

  function handleRestore(id) {
    const updated = records.map(r => r.id === id ? { ...r, removed: false, removedAt: null, removeReason: null, removedBy: null } : r);
    setRecords(updated); save(updated);
    showToast && showToast('已恢復過敏記錄');
  }

  function printAllergyCard() {
    const active = records.filter(r => r.patientId === selPatient.id && !r.removed);
    const emergencyContact = selPatient.emergencyContact || selPatient.phone || '未填寫';
    const rows = active.map(a =>
      `<tr><td style="padding:6px 10px;border:1px solid #ccc">${a.allergen}</td>` +
      `<td style="padding:6px 10px;border:1px solid #ccc">${a.category}</td>` +
      `<td style="padding:6px 10px;border:1px solid #ccc;color:${sevColor(a.severity)};font-weight:600">${sevLabel(a.severity)}</td>` +
      `<td style="padding:6px 10px;border:1px solid #ccc">${a.reaction || '-'}</td></tr>`
    ).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>過敏警示卡</title></head>` +
      `<body style="font-family:'Microsoft YaHei',sans-serif;padding:24px;max-width:600px;margin:0 auto">` +
      `<div style="border:3px solid ${RED};border-radius:10px;padding:20px">` +
      `<div style="text-align:center;margin-bottom:16px">` +
      `<h2 style="color:${RED};margin:0 0 4px">過敏警示卡</h2>` +
      `<p style="color:#666;margin:0;font-size:13px">${clinicName}</p></div>` +
      `<table style="width:100%;margin-bottom:12px"><tr><td style="font-size:14px"><strong>患者姓名：</strong>${selPatient.name}</td>` +
      `<td style="font-size:14px"><strong>出生日期：</strong>${selPatient.dob || '-'}</td></tr>` +
      `<tr><td colspan="2" style="font-size:14px"><strong>緊急聯絡：</strong>${emergencyContact}</td></tr></table>` +
      `<table style="width:100%;border-collapse:collapse;font-size:13px">` +
      `<thead><tr style="background:#fef2f2"><th style="padding:6px 10px;border:1px solid #ccc;text-align:left">過敏原</th>` +
      `<th style="padding:6px 10px;border:1px solid #ccc;text-align:left">類別</th>` +
      `<th style="padding:6px 10px;border:1px solid #ccc;text-align:left">嚴重程度</th>` +
      `<th style="padding:6px 10px;border:1px solid #ccc;text-align:left">反應</th></tr></thead>` +
      `<tbody>${rows || '<tr><td colspan="4" style="padding:10px;text-align:center;color:#999">無過敏記錄</td></tr>'}</tbody></table>` +
      `<p style="font-size:11px;color:#999;margin-top:14px;text-align:center">列印日期：${new Date().toISOString().substring(0, 10)} | ${clinicName}</p>` +
      `</div></body></html>`;
    const w = window.open('', '_blank', 'width=700,height=500');
    w.document.write(html); w.document.close(); w.print();
  }

  function Field({ label, children, half }) {
    return (
      <div style={{ flex: half ? '0 0 48%' : '1 1 100%', marginBottom: 10 }}>
        <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 3 }}>{label}</label>
        {children}
      </div>
    );
  }

  const sevBadge = (severity) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, color: '#fff', background: sevColor(severity) }}>
      {sevLabel(severity)}
    </span>
  );

  const catBadge = (cat) => (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, color: ACCENT, background: '#e0f2fe' }}>{cat}</span>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <h2 style={{ color: ACCENT, marginBottom: 4, fontSize: 20 }}>過敏及不良反應管理</h2>
      <p style={{ color: GRAY, fontSize: 13, marginTop: 0, marginBottom: 14 }}>{clinicName} - 患者過敏記錄</p>

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
          {/* Patient header + tabs */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 17 }}>{selPatient.name}</span>
              {selPatient.phone && <span style={{ color: GRAY, fontSize: 13, marginLeft: 8 }}>{selPatient.phone}</span>}
              <span style={{ fontSize: 12, color: ACCENT, marginLeft: 8 }}>
                {patientAllergies.length} 項過敏{conflicts.length > 0 && <span style={{ color: RED, marginLeft: 6 }}>({conflicts.length} 項衝突)</span>}
              </span>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 12 }}>
            {[['allergies', '過敏記錄'], ['conflicts', '處方衝突'], ['history', '變更歷史']].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 18px', cursor: 'pointer', fontWeight: tab === k ? 700 : 400, color: tab === k ? ACCENT : '#666', borderBottom: tab === k ? `2px solid ${ACCENT}` : '2px solid transparent', marginBottom: -2, background: 'none', border: 'none', fontSize: 14 }}>
                {l}{k === 'conflicts' && conflicts.length > 0 && <span style={{ background: RED, color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 11, marginLeft: 4 }}>{conflicts.length}</span>}
              </button>
            ))}
          </div>

          {/* Conflict banner */}
          {conflicts.length > 0 && tab === 'allergies' && (
            <div style={{ ...card, background: '#fef2f2', border: `1px solid ${RED}`, padding: 12 }}>
              <strong style={{ color: RED, fontSize: 14 }}>! 處方衝突警告</strong>
              <p style={{ fontSize: 13, color: '#7f1d1d', margin: '4px 0 0' }}>
                發現 {conflicts.length} 項處方藥材與已知過敏原衝突，請點擊「處方衝突」標籤查看詳情。
              </p>
            </div>
          )}

          {/* TAB: Allergies */}
          {tab === 'allergies' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {!showForm && <button style={btn} onClick={() => { setForm({ ...EMPTY_FORM }); setShowForm(true); }}>+ 新增過敏</button>}
                <button style={btnOut} onClick={printAllergyCard}>列印警示卡</button>
                <select style={{ ...sel, width: 'auto' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                  <option value="all">全部類別</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Add form */}
              {showForm && (
                <div style={{ ...card, border: `2px solid ${ACCENT}` }}>
                  <h4 style={{ margin: '0 0 12px', color: ACCENT, fontSize: 16 }}>新增過敏記錄</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Field label="過敏原名稱 *" half>
                      <input style={inp} value={form.allergen} onChange={e => setForm(f => ({ ...f, allergen: e.target.value }))} placeholder="例：青霉素、花生..." />
                    </Field>
                    <Field label="類別" half>
                      <select style={sel} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="嚴重程度" half>
                      <select style={sel} value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                        {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </Field>
                    <Field label="反應症狀" half>
                      <input style={inp} value={form.reaction} onChange={e => setForm(f => ({ ...f, reaction: e.target.value }))} placeholder="例：皮疹、呼吸困難..." />
                    </Field>
                    <Field label="發現日期" half>
                      <input type="date" style={inp} value={form.onsetDate} onChange={e => setForm(f => ({ ...f, onsetDate: e.target.value }))} />
                    </Field>
                    <Field label="確認醫師" half>
                      <input style={inp} value={form.verifiedBy} onChange={e => setForm(f => ({ ...f, verifiedBy: e.target.value }))} placeholder="醫師姓名" />
                    </Field>
                    <Field label="備註">
                      <textarea style={{ ...inp, minHeight: 48, resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </Field>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button style={btn} onClick={handleAdd}>保存</button>
                    <button style={{ ...btn, background: GRAY }} onClick={() => setShowForm(false)}>取消</button>
                  </div>
                </div>
              )}

              {/* Allergy list */}
              {patientAllergies.length === 0 && !showForm && (
                <div style={{ ...card, textAlign: 'center', color: '#9ca3af', padding: 32 }}>暫無過敏記錄</div>
              )}
              {patientAllergies.map(a => (
                <div key={a.id} style={{ ...card, borderLeft: `4px solid ${sevColor(a.severity)}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 15, marginRight: 8 }}>{a.allergen}</span>
                      {catBadge(a.category)} {sevBadge(a.severity)}
                    </div>
                    <button style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 13 }} onClick={() => handleRemove(a.id)}>移除</button>
                  </div>
                  {a.reaction && <div style={{ fontSize: 13, marginTop: 6 }}><span style={{ color: ACCENT, fontWeight: 500 }}>反應：</span>{a.reaction}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6, fontSize: 12, color: GRAY }}>
                    {a.onsetDate && <span>發現日期：{a.onsetDate}</span>}
                    {a.verifiedBy && <span>確認醫師：{a.verifiedBy}</span>}
                    <span>記錄日期：{a.createdAt}</span>
                    <span>記錄者：{a.createdBy}</span>
                  </div>
                  {a.notes && <div style={{ fontSize: 12, color: GRAY, marginTop: 4 }}>備註：{a.notes}</div>}
                </div>
              ))}
            </>
          )}

          {/* TAB: Conflicts */}
          {tab === 'conflicts' && (
            <>
              {conflicts.length === 0 ? (
                <div style={{ ...card, textAlign: 'center', color: '#16a34a', padding: 32 }}>無處方衝突，所有處方藥材與過敏記錄無衝突。</div>
              ) : (
                <>
                  <div style={{ ...card, background: '#fef2f2', border: `1px solid ${RED}` }}>
                    <p style={{ margin: 0, fontSize: 14, color: '#7f1d1d', fontWeight: 600 }}>發現 {conflicts.length} 項處方衝突</p>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#7f1d1d' }}>以下處方中的藥材與患者已知過敏原相符，請醫師評估。</p>
                  </div>
                  {conflicts.map((c, i) => (
                    <div key={i} style={{ ...card, borderLeft: `4px solid ${RED}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontWeight: 700, color: RED, fontSize: 14 }}>{c.herb}</span>
                        <span style={{ fontSize: 12, color: GRAY }}>{c.date}</span>
                      </div>
                      <div style={{ fontSize: 13, color: GRAY, marginTop: 4 }}>
                        醫師：{c.doctor || '-'} | 劑量：{c.dosage || '-'}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* TAB: History */}
          {tab === 'history' && (
            <>
              {historyLog.length === 0 ? (
                <div style={{ ...card, textAlign: 'center', color: '#9ca3af', padding: 32 }}>暫無變更記錄</div>
              ) : (
                historyLog.map((ev, i) => {
                  const rec = records.find(r => r.id === ev.id);
                  const isAdd = ev.type === 'added';
                  return (
                    <div key={`${ev.id}-${ev.type}-${i}`} style={{ display: 'flex', gap: 12, marginBottom: 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 28 }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: isAdd ? ACCENT : RED, flexShrink: 0, marginTop: 4 }} />
                        {i < historyLog.length - 1 && <div style={{ width: 2, flex: 1, background: '#e5e7eb' }} />}
                      </div>
                      <div style={{ ...card, flex: 1, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: isAdd ? ACCENT : RED }}>
                            {isAdd ? '新增' : '移除'}: {ev.allergen}
                          </span>
                          <span style={{ fontSize: 12, color: GRAY }}>{ev.date}</span>
                        </div>
                        <div style={{ fontSize: 12, color: GRAY, marginTop: 4 }}>
                          {catBadge(ev.category)} {isAdd && sevBadge(ev.severity)}
                          {!isAdd && ev.reason && <span style={{ marginLeft: 8 }}>原因：{ev.reason}</span>}
                        </div>
                        {!isAdd && rec && (
                          <button style={{ background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', fontSize: 12, padding: 0, marginTop: 4 }} onClick={() => handleRestore(ev.id)}>恢復此記錄</button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
