import { useState, useMemo, useRef } from 'react';
import { saveConsultation, deleteConsultation } from '../api';
import { uid, fmtM, DOCTORS, TCM_HERBS, TCM_FORMULAS, TCM_TREATMENTS, ACUPOINTS } from '../data';
import { useFocusTrap, nullRef } from './ConfirmModal';
import ConfirmModal from './ConfirmModal';

const EMPTY_RX = { herb: '', dosage: '' };
const EMPTY_FORM = {
  patientId: '', patientName: '', patientPhone: '', date: '', doctor: DOCTORS[0], store: '宋皇臺',
  subjective: '', objective: '', assessment: '', plan: '',
  tcmDiagnosis: '', tcmPattern: '', tongue: '', pulse: '',
  prescription: [{ ...EMPTY_RX }], formulaName: '', formulaDays: 3, formulaInstructions: '每日一劑，水煎服',
  treatments: [], acupuncturePoints: '',
  followUpDate: '', followUpNotes: '', fee: 0,
};

export default function EMRPage({ data, setData, showToast, allData, user }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, date: new Date().toISOString().substring(0, 10) });
  const [detail, setDetail] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterDoc, setFilterDoc] = useState('all');
  const [filterStore, setFilterStore] = useState('all');
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDD, setShowPatientDD] = useState(false);
  const [herbSearch, setHerbSearch] = useState({});
  const [activeHerbIdx, setActiveHerbIdx] = useState(null);

  const addRef = useRef(null);
  const detailRef = useRef(null);
  useFocusTrap(showAdd ? addRef : nullRef);
  useFocusTrap(detail ? detailRef : nullRef);

  const consultations = data.consultations || [];
  const patients = data.patients || [];
  const today = new Date().toISOString().substring(0, 10);
  const thisMonth = today.substring(0, 7);

  const weekStart = useMemo(() => {
    const d = new Date(); const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1); return d.toISOString().substring(0, 10);
  }, []);
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 6); return d.toISOString().substring(0, 10);
  }, [weekStart]);

  // ── Stats ──
  const stats = useMemo(() => {
    const todayCount = consultations.filter(c => c.date === today).length;
    const monthCount = consultations.filter(c => (c.date || '').substring(0, 7) === thisMonth).length;
    const uniquePatients = new Set(consultations.map(c => c.patientId || c.patientName)).size;
    const followUps = consultations.filter(c => c.followUpDate >= weekStart && c.followUpDate <= weekEnd).length;
    return { todayCount, monthCount, uniquePatients, followUps };
  }, [consultations, today, thisMonth, weekStart, weekEnd]);

  // ── Filtered list ──
  const filtered = useMemo(() => {
    let list = [...consultations];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => (c.patientName || '').toLowerCase().includes(q));
    }
    if (filterDoc !== 'all') list = list.filter(c => c.doctor === filterDoc);
    if (filterStore !== 'all') list = list.filter(c => c.store === filterStore);
    if (filterDate === 'today') list = list.filter(c => c.date === today);
    else if (filterDate === 'week') list = list.filter(c => c.date >= weekStart && c.date <= weekEnd);
    else if (filterDate === 'custom' && customStart && customEnd) list = list.filter(c => c.date >= customStart && c.date <= customEnd);
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [consultations, search, filterDoc, filterStore, filterDate, today, weekStart, weekEnd, customStart, customEnd]);

  // ── Patient autocomplete ──
  const patientMatches = useMemo(() => {
    if (!patientSearch) return [];
    const q = patientSearch.toLowerCase();
    return patients.filter(p => p.name.toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [patients, patientSearch]);

  const selectPatient = (p) => {
    setForm(f => ({ ...f, patientId: p.id, patientName: p.name, patientPhone: p.phone || '' }));
    setPatientSearch(p.name);
    setShowPatientDD(false);
  };

  // ── Treatment toggle ──
  const toggleTreatment = (t) => {
    setForm(f => {
      const arr = [...f.treatments];
      const idx = arr.indexOf(t);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(t);
      return { ...f, treatments: arr };
    });
  };

  // ── Prescription helpers ──
  const updateRx = (i, field, val) => {
    setForm(f => {
      const rx = [...f.prescription];
      rx[i] = { ...rx[i], [field]: val };
      return { ...f, prescription: rx };
    });
  };
  const addRxRow = () => setForm(f => ({ ...f, prescription: [...f.prescription, { ...EMPTY_RX }] }));
  const removeRxRow = (i) => setForm(f => ({ ...f, prescription: f.prescription.filter((_, j) => j !== i) }));

  const loadFormula = (name) => {
    const formula = TCM_FORMULAS.find(f => f.name === name);
    if (!formula) return;
    setForm(f => ({
      ...f,
      prescription: formula.herbs.map(h => ({ herb: h.herb, dosage: h.dosage })),
      formulaName: formula.name,
    }));
    showToast(`已載入 ${formula.name}`);
  };

  // ── Acupoint chip toggle ──
  const toggleAcupoint = (pt) => {
    setForm(f => {
      const pts = f.acupuncturePoints ? f.acupuncturePoints.split('、').map(s => s.trim()).filter(Boolean) : [];
      const idx = pts.indexOf(pt);
      if (idx >= 0) pts.splice(idx, 1); else pts.push(pt);
      return { ...f, acupuncturePoints: pts.join('、') };
    });
  };

  const currentAcupoints = form.acupuncturePoints ? form.acupuncturePoints.split('、').map(s => s.trim()).filter(Boolean) : [];

  // ── Herb autocomplete matches ──
  const getHerbMatches = (idx) => {
    const q = (herbSearch[idx] || '').toLowerCase();
    if (!q) return [];
    return TCM_HERBS.filter(h => h.includes(q)).slice(0, 6);
  };

  // ── Save ──
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.patientName) return showToast('請選擇病人');
    if (!form.date) return showToast('請填寫日期');
    const record = {
      ...form, id: uid(),
      prescription: form.prescription.filter(r => r.herb),
      fee: Number(form.fee) || 0,
      createdAt: new Date().toISOString().substring(0, 10),
    };
    await saveConsultation(record);
    setData(d => ({ ...d, consultations: [...(d.consultations || []), record] }));
    setShowAdd(false);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().substring(0, 10) });
    setPatientSearch('');
    showToast('已儲存診症紀錄');
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteConsultation(deleteId);
    setData(d => ({ ...d, consultations: (d.consultations || []).filter(c => c.id !== deleteId) }));
    showToast('已刪除');
    setDeleteId(null);
  };

  // ── Print ──
  const handlePrint = () => { window.print(); };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">今日診症</div><div className="stat-value teal">{stats.todayCount}</div></div>
        <div className="stat-card green"><div className="stat-label">本月診症</div><div className="stat-value green">{stats.monthCount}</div></div>
        <div className="stat-card gold"><div className="stat-label">診症病人數</div><div className="stat-value gold">{stats.uniquePatients}</div></div>
        <div className="stat-card red"><div className="stat-label">本週覆診</div><div className="stat-value red">{stats.followUps}</div></div>
      </div>

      {/* Top action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>診症紀錄</h3>
        <button className="btn btn-teal" onClick={() => setShowAdd(true)}>+ 新增診症</button>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ flex: 1, minWidth: 180 }} placeholder="搜尋病人姓名..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="preset-bar" style={{ marginBottom: 0 }}>
          {[['all', '全部'], ['today', '今日'], ['week', '本週'], ['custom', '自選']].map(([k, l]) => (
            <button key={k} className={`preset-chip ${filterDate === k ? 'active' : ''}`} onClick={() => setFilterDate(k)}>{l}</button>
          ))}
        </div>
        {filterDate === 'custom' && (
          <>
            <input type="date" style={{ width: 'auto' }} value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span style={{ fontSize: 12 }}>至</span>
            <input type="date" style={{ width: 'auto' }} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </>
        )}
        <select style={{ width: 'auto' }} value={filterDoc} onChange={e => setFilterDoc(e.target.value)}>
          <option value="all">所有醫師</option>
          {DOCTORS.map(d => <option key={d}>{d}</option>)}
        </select>
        <select style={{ width: 'auto' }} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
          <option value="all">所有店舖</option>
          <option>宋皇臺</option><option>太子</option>
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日期</th><th>病人</th><th>醫師</th><th>店舖</th>
                <th>中醫診斷</th><th>治療</th><th>覆診日期</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>{(c.date || '').substring(0, 10)}</td>
                  <td>
                    <span style={{ color: 'var(--teal-700)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setDetail(c)}>
                      {c.patientName}
                    </span>
                  </td>
                  <td>{c.doctor}</td>
                  <td>{c.store}</td>
                  <td>{c.tcmDiagnosis || '-'}</td>
                  <td>{(c.treatments || []).length > 0 ? c.treatments.join('、') : '-'}</td>
                  <td>{c.followUpDate || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setDetail(c)}>詳情</button>
                      <button className="btn btn-red btn-sm" onClick={() => setDeleteId(c.id)}>刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24 }}>暫無診症紀錄</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════ New Consultation Modal ══════ */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)} role="dialog" aria-modal="true" aria-label="新增診症">
          <div className="modal" onClick={e => e.stopPropagation()} ref={addRef} style={{ maxWidth: 820, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>新增診症紀錄</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowAdd(false)} aria-label="關閉">✕</button>
            </div>
            <form onSubmit={handleSave}>
              {/* Patient selector */}
              <div className="card-header" style={{ padding: 0, marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: 13 }}>病人資料</h4></div>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div style={{ position: 'relative' }}>
                  <label>病人 *</label>
                  <input value={patientSearch} placeholder="搜尋姓名或電話..."
                    onChange={e => { setPatientSearch(e.target.value); setShowPatientDD(true); setForm(f => ({ ...f, patientName: e.target.value, patientId: '' })); }}
                    onFocus={() => patientSearch && setShowPatientDD(true)}
                    onBlur={() => setTimeout(() => setShowPatientDD(false), 200)} />
                  {showPatientDD && patientMatches.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 6, zIndex: 99, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                      {patientMatches.map(p => (
                        <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--gray-100)' }}
                          onMouseDown={() => selectPatient(p)}>
                          <strong>{p.name}</strong> <span style={{ color: 'var(--gray-400)' }}>{p.phone}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div><label>電話</label><input value={form.patientPhone} readOnly style={{ background: 'var(--gray-50)' }} /></div>
                <div><label>日期 *</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              </div>
              <div className="grid-3" style={{ marginBottom: 16 }}>
                <div><label>醫師</label><select value={form.doctor} onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))}>{DOCTORS.map(d => <option key={d}>{d}</option>)}</select></div>
                <div><label>店舖</label><select value={form.store} onChange={e => setForm(f => ({ ...f, store: e.target.value }))}><option>宋皇臺</option><option>太子</option></select></div>
                <div><label>診金 ($)</label><input type="number" min="0" value={form.fee} onChange={e => setForm(f => ({ ...f, fee: e.target.value }))} /></div>
              </div>

              {/* SOAP Notes */}
              <div className="card-header" style={{ padding: 0, marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: 13 }}>SOAP 病歷</h4></div>
              <div className="grid-2" style={{ marginBottom: 8 }}>
                <div><label>Subjective 主訴</label><textarea rows={2} value={form.subjective} onChange={e => setForm(f => ({ ...f, subjective: e.target.value }))} placeholder="主訴、病史..." /></div>
                <div><label>Objective 客觀</label><textarea rows={2} value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))} placeholder="望聞問切、檢查結果..." /></div>
              </div>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div><label>Assessment 評估</label><textarea rows={2} value={form.assessment} onChange={e => setForm(f => ({ ...f, assessment: e.target.value }))} placeholder="中醫診斷..." /></div>
                <div><label>Plan 計劃</label><textarea rows={2} value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))} placeholder="治療方案..." /></div>
              </div>

              {/* TCM Specific */}
              <div className="card-header" style={{ padding: 0, marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: 13 }}>中醫辨證</h4></div>
              <div className="grid-2" style={{ marginBottom: 8 }}>
                <div><label>中醫診斷</label><input value={form.tcmDiagnosis} onChange={e => setForm(f => ({ ...f, tcmDiagnosis: e.target.value }))} placeholder="病名" /></div>
                <div><label>證型</label><input value={form.tcmPattern} onChange={e => setForm(f => ({ ...f, tcmPattern: e.target.value }))} placeholder="辨證分型" /></div>
              </div>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div><label>舌象</label><input value={form.tongue} onChange={e => setForm(f => ({ ...f, tongue: e.target.value }))} placeholder="舌質舌苔" /></div>
                <div><label>脈象</label><input value={form.pulse} onChange={e => setForm(f => ({ ...f, pulse: e.target.value }))} placeholder="脈象" /></div>
              </div>

              {/* Treatments */}
              <div className="card-header" style={{ padding: 0, marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: 13 }}>治療方式</h4></div>
              <div className="preset-bar" style={{ marginBottom: 16 }}>
                {TCM_TREATMENTS.map(t => (
                  <button type="button" key={t} className={`preset-chip ${form.treatments.includes(t) ? 'active' : ''}`} onClick={() => toggleTreatment(t)}>{t}</button>
                ))}
              </div>

              {/* Acupoints */}
              <div style={{ marginBottom: 16 }}>
                <label>穴位</label>
                <input value={form.acupuncturePoints} onChange={e => setForm(f => ({ ...f, acupuncturePoints: e.target.value }))} placeholder="輸入穴位或點擊下方選取" style={{ marginBottom: 6 }} />
                <div className="preset-bar">
                  {ACUPOINTS.map(pt => (
                    <button type="button" key={pt} className={`preset-chip ${currentAcupoints.includes(pt) ? 'active' : ''}`} onClick={() => toggleAcupoint(pt)}>{pt}</button>
                  ))}
                </div>
              </div>

              {/* Prescription Builder */}
              <div className="card-header" style={{ padding: 0, marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 13 }}>處方</h4>
                <select style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }} value="" onChange={e => { if (e.target.value) loadFormula(e.target.value); }}>
                  <option value="">從模板載入...</option>
                  {TCM_FORMULAS.map(f => <option key={f.name} value={f.name}>{f.name} ({f.indication})</option>)}
                </select>
              </div>
              <div className="grid-3" style={{ marginBottom: 8 }}>
                <div><label>方名</label><input value={form.formulaName} onChange={e => setForm(f => ({ ...f, formulaName: e.target.value }))} placeholder="處方名稱" /></div>
                <div><label>天數</label><input type="number" min="1" value={form.formulaDays} onChange={e => setForm(f => ({ ...f, formulaDays: e.target.value }))} /></div>
                <div><label>服法</label><input value={form.formulaInstructions} onChange={e => setForm(f => ({ ...f, formulaInstructions: e.target.value }))} /></div>
              </div>
              <div className="table-wrap" style={{ marginBottom: 8 }}>
                <table>
                  <thead><tr><th>藥材</th><th>劑量</th><th></th></tr></thead>
                  <tbody>
                    {form.prescription.map((rx, i) => (
                      <tr key={i}>
                        <td style={{ position: 'relative' }}>
                          <input value={rx.herb} placeholder="藥材名..."
                            onChange={e => { updateRx(i, 'herb', e.target.value); setHerbSearch(s => ({ ...s, [i]: e.target.value })); setActiveHerbIdx(i); }}
                            onFocus={() => { setHerbSearch(s => ({ ...s, [i]: rx.herb })); setActiveHerbIdx(i); }}
                            onBlur={() => setTimeout(() => setActiveHerbIdx(null), 200)} />
                          {activeHerbIdx === i && getHerbMatches(i).length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 6, zIndex: 99, maxHeight: 160, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                              {getHerbMatches(i).map(h => (
                                <div key={h} style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}
                                  onMouseDown={() => { updateRx(i, 'herb', h); setHerbSearch(s => ({ ...s, [i]: '' })); setActiveHerbIdx(null); }}>
                                  {h}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td><input value={rx.dosage} placeholder="例: 10g" onChange={e => updateRx(i, 'dosage', e.target.value)} /></td>
                        <td style={{ width: 40 }}>
                          {form.prescription.length > 1 && (
                            <button type="button" className="btn btn-red btn-sm" onClick={() => removeRxRow(i)} style={{ padding: '2px 8px' }}>✕</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={addRxRow} style={{ marginBottom: 16 }}>+ 加藥材</button>

              {/* Follow-up */}
              <div className="card-header" style={{ padding: 0, marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: 13 }}>覆診安排</h4></div>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div><label>覆診日期</label><input type="date" value={form.followUpDate} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))} /></div>
                <div><label>覆診備註</label><input value={form.followUpNotes} onChange={e => setForm(f => ({ ...f, followUpNotes: e.target.value }))} placeholder="覆診注意事項" /></div>
              </div>

              {/* Submit */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-teal">儲存診症紀錄</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════ Detail Modal ══════ */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)} role="dialog" aria-modal="true" aria-label="診症詳情">
          <div className="modal emr-print" onClick={e => e.stopPropagation()} ref={detailRef} style={{ maxWidth: 750, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 12 }} className="print-only">
              <img src="/logo.jpg" alt="康晴醫療中心" style={{ height: 48 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>診症詳情 -- {detail.patientName}</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-teal btn-sm" onClick={handlePrint}>列印處方</button>
                <button className="btn btn-outline btn-sm" onClick={() => setDetail(null)} aria-label="關閉">✕ 關閉</button>
              </div>
            </div>

            {/* Basic info */}
            <div className="grid-3" style={{ marginBottom: 16, fontSize: 13 }}>
              <div><strong>日期：</strong>{detail.date}</div>
              <div><strong>醫師：</strong>{detail.doctor}</div>
              <div><strong>店舖：</strong>{detail.store}</div>
              <div><strong>電話：</strong>{detail.patientPhone || '-'}</div>
              <div><strong>診金：</strong>{fmtM(detail.fee || 0)}</div>
              <div><strong>建立：</strong>{detail.createdAt || '-'}</div>
            </div>

            {/* SOAP */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>SOAP 病歷</h4>
              <div className="grid-2" style={{ gap: 8 }}>
                {[['S - 主訴', detail.subjective], ['O - 客觀', detail.objective], ['A - 評估', detail.assessment], ['P - 計劃', detail.plan]].map(([label, val]) => (
                  <div key={label} style={{ background: 'var(--gray-50)', padding: 10, borderRadius: 6, fontSize: 13 }}>
                    <strong>{label}</strong>
                    <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{val || '-'}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* TCM */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>中醫辨證</h4>
              <div className="grid-2" style={{ fontSize: 13, gap: 8 }}>
                <div><strong>診斷：</strong>{detail.tcmDiagnosis || '-'}</div>
                <div><strong>證型：</strong>{detail.tcmPattern || '-'}</div>
                <div><strong>舌象：</strong>{detail.tongue || '-'}</div>
                <div><strong>脈象：</strong>{detail.pulse || '-'}</div>
              </div>
            </div>

            {/* Treatments */}
            {(detail.treatments || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>治療方式</h4>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {detail.treatments.map(t => <span key={t} className="tag">{t}</span>)}
                </div>
              </div>
            )}

            {/* Acupoints */}
            {detail.acupuncturePoints && (
              <div style={{ marginBottom: 16, fontSize: 13 }}>
                <strong>穴位：</strong>{detail.acupuncturePoints}
              </div>
            )}

            {/* Prescription */}
            {(detail.prescription || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  處方{detail.formulaName ? ` -- ${detail.formulaName}` : ''}
                  {detail.formulaDays ? ` (${detail.formulaDays}天)` : ''}
                </h4>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>#</th><th>藥材</th><th>劑量</th></tr></thead>
                    <tbody>
                      {detail.prescription.map((rx, i) => (
                        <tr key={i}><td>{i + 1}</td><td>{rx.herb}</td><td>{rx.dosage}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detail.formulaInstructions && (
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 6 }}>服法：{detail.formulaInstructions}</div>
                )}
              </div>
            )}

            {/* Follow-up */}
            {detail.followUpDate && (
              <div style={{ marginBottom: 16, fontSize: 13, padding: 10, background: 'var(--teal-50)', borderRadius: 6 }}>
                <strong>覆診日期：</strong>{detail.followUpDate}
                {detail.followUpNotes && <span> | {detail.followUpNotes}</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && <ConfirmModal message="確認刪除此診症紀錄？此操作無法復原。" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />}
    </>
  );
}
