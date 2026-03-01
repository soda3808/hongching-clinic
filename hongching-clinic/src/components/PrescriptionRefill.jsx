import { useState, useMemo } from 'react';
import { uid, getDoctors } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_refills';
function loadRefills() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
function saveRefills(r) { localStorage.setItem(LS_KEY, JSON.stringify(r)); }
function today() { return new Date().toISOString().substring(0, 10); }

export default function PrescriptionRefill({ data, setData, showToast, user }) {
  const doctors = getDoctors();
  const clinicName = getClinicName();
  const consultations = data.consultations || [];

  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [refills, setRefills] = useState(loadRefills);
  const [editingId, setEditingId] = useState(null);
  const [editRx, setEditRx] = useState([]);
  const [editDays, setEditDays] = useState(3);
  const [editDoctor, setEditDoctor] = useState('');
  const [tab, setTab] = useState('refill'); // refill | history

  // All unique patient names
  const patientNames = useMemo(() => {
    const set = new Set();
    consultations.forEach(c => { if (c.patientName) set.add(c.patientName); });
    return [...set].sort();
  }, [consultations]);

  // Search results
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return patientNames.filter(n => n.toLowerCase().includes(q));
  }, [search, patientNames]);

  // Patient prescriptions (most recent first, only those with herbs)
  const patientRx = useMemo(() => {
    if (!selectedPatient) return [];
    return consultations
      .filter(c => c.patientName === selectedPatient && (c.prescription || []).some(p => p.herb))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [consultations, selectedPatient]);

  // Refill count for a consultation
  const getRefillCount = (origId) => {
    return Object.values(refills).filter(r => r.originalId === origId).length;
  };

  // Check if a consultation is itself a refill
  const isRefill = (id) => !!refills[id];

  // Quick refill — copy exact prescription into new consultation
  const handleQuickRefill = (c) => {
    const newId = uid();
    const doctor = user?.name || c.doctor || doctors[0] || '';
    const record = {
      id: newId,
      patientId: c.patientId || '',
      patientName: c.patientName,
      patientPhone: c.patientPhone || '',
      date: today(),
      doctor,
      store: c.store || '',
      prescription: (c.prescription || []).filter(p => p.herb).map(p => ({ herb: p.herb, dosage: p.dosage })),
      formulaName: c.formulaName || '',
      formulaDays: c.formulaDays || 3,
      formulaInstructions: c.formulaInstructions || '每日一劑，水煎服',
      specialNotes: `重配自 ${c.date} 處方`,
      createdAt: today(),
    };
    setData(d => ({ ...d, consultations: [...(d.consultations || []), record] }));
    const origId = refills[c.id]?.originalId || c.id;
    const next = { ...refills, [newId]: { originalId: origId, refillDate: today(), sourceId: c.id, doctor } };
    setRefills(next);
    saveRefills(next);
    showToast('已重配處方');
  };

  // Start editing before refill
  const handleStartEdit = (c) => {
    setEditingId(c.id);
    setEditRx((c.prescription || []).filter(p => p.herb).map(p => ({ herb: p.herb, dosage: p.dosage })));
    setEditDays(c.formulaDays || 3);
    setEditDoctor(user?.name || c.doctor || doctors[0] || '');
  };

  // Confirm adjusted refill
  const handleConfirmEdit = (c) => {
    const newId = uid();
    const record = {
      id: newId,
      patientId: c.patientId || '',
      patientName: c.patientName,
      patientPhone: c.patientPhone || '',
      date: today(),
      doctor: editDoctor,
      store: c.store || '',
      prescription: editRx.filter(p => p.herb),
      formulaName: c.formulaName || '',
      formulaDays: editDays,
      formulaInstructions: c.formulaInstructions || '每日一劑，水煎服',
      specialNotes: `重配自 ${c.date} 處方（已調整）`,
      createdAt: today(),
    };
    setData(d => ({ ...d, consultations: [...(d.consultations || []), record] }));
    const origId = refills[c.id]?.originalId || c.id;
    const next = { ...refills, [newId]: { originalId: origId, refillDate: today(), sourceId: c.id, doctor: editDoctor, adjusted: true } };
    setRefills(next);
    saveRefills(next);
    setEditingId(null);
    showToast('已重配（調整後）處方');
  };

  // Refill history for patient
  const refillHistory = useMemo(() => {
    if (!selectedPatient) return [];
    return consultations
      .filter(c => c.patientName === selectedPatient && refills[c.id])
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [consultations, selectedPatient, refills]);

  // Print refill prescription
  const handlePrint = (c) => {
    const herbs = (c.prescription || []).filter(p => p.herb);
    const rows = herbs.map((p, i) => `<tr><td style="text-align:center">${i + 1}</td><td style="font-weight:600">${escapeHtml(p.herb)}</td><td style="text-align:center">${escapeHtml(p.dosage)}</td></tr>`).join('');
    const refillInfo = refills[c.id] ? `<div style="color:#d97706;font-size:11px;margin:6px 0">重配處方 | 原處方日期：${refills[c.id].refillDate || '-'}</div>` : '';
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>處方 - ${escapeHtml(c.patientName)}</title><style>@page{size:A4;margin:12mm}body{font-family:'PingFang TC','Microsoft YaHei',sans-serif;font-size:12px;padding:20px;max-width:700px;margin:0 auto}h1{font-size:17px;text-align:center;margin:0 0 2px}p.sub{text-align:center;color:#888;font-size:11px;margin:0 0 14px}table{width:100%;border-collapse:collapse}th,td{padding:5px 10px;border-bottom:1px solid #ddd;font-size:12px}th{background:#f3f4f6;font-weight:700}.info{display:flex;justify-content:space-between;margin-bottom:12px;font-size:12px}@media print{body{padding:8px}}</style></head><body><h1>${escapeHtml(clinicName)} — 處方箋</h1><p class="sub">${isRefill(c.id) ? '【重配處方】' : ''}</p><div class="info"><span>病人：${escapeHtml(c.patientName)}</span><span>醫師：${escapeHtml(c.doctor || '-')}</span><span>日期：${c.date}</span></div>${refillInfo}${c.formulaName ? `<div style="font-weight:700;color:#0e7490;margin:8px 0">方劑：${escapeHtml(c.formulaName)}（${c.formulaDays || '-'}天）</div>` : ''}<table><thead><tr><th>#</th><th>藥材</th><th>劑量</th></tr></thead><tbody>${rows}</tbody></table><div style="margin-top:12px;font-size:11px;color:#555">服法：${escapeHtml(c.formulaInstructions || '每日一劑，水煎服')}</div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 };
  const labelStyle = { fontSize: 11, color: '#888', marginBottom: 2 };
  const statNum = { fontSize: 22, fontWeight: 700, color: '#0e7490' };
  const btnRefill = { background: '#0e7490', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 };
  const btnOutline = { background: '#fff', color: '#0e7490', border: '1px solid #0e7490', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>處方重配</h2>
        <div style={{ flex: 1 }} />
        {selectedPatient && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setTab('refill')} style={{ ...btnOutline, background: tab === 'refill' ? '#0e7490' : '#fff', color: tab === 'refill' ? '#fff' : '#0e7490' }}>重配</button>
            <button onClick={() => setTab('history')} style={{ ...btnOutline, background: tab === 'history' ? '#0e7490' : '#fff', color: tab === 'history' ? '#fff' : '#0e7490' }}>重配記錄</button>
          </div>
        )}
      </div>

      {/* Patient Search */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>搜尋病人</div>
        <div style={{ position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="輸入病人姓名..." className="input" style={{ width: '100%', fontSize: 14 }} />
          {searchResults.length > 0 && search && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
              {searchResults.map(name => (
                <div key={name} onClick={() => { setSelectedPatient(name); setSearch(''); setEditingId(null); setTab('refill'); }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6' }}
                  onMouseEnter={e => e.target.style.background = '#f0fdfa'} onMouseLeave={e => e.target.style.background = ''}>
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>
        {selectedPatient && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0e7490' }}>當前病人：{selectedPatient}</span>
            <button onClick={() => { setSelectedPatient(''); setSearch(''); setEditingId(null); }} style={{ fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>清除</button>
          </div>
        )}
      </div>

      {selectedPatient && tab === 'refill' && <>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8, marginBottom: 12 }}>
          <div style={cardStyle}><div style={labelStyle}>處方總數</div><div style={statNum}>{patientRx.length}</div></div>
          <div style={cardStyle}><div style={labelStyle}>已重配次數</div><div style={statNum}>{refillHistory.length}</div></div>
          <div style={cardStyle}><div style={labelStyle}>最近就診</div><div style={{ fontSize: 14, fontWeight: 600, color: '#0e7490' }}>{patientRx[0]?.date || '-'}</div></div>
        </div>

        {/* Prescription list */}
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>近期處方（{patientRx.length} 筆）</div>
        {patientRx.length === 0 && <div style={{ ...cardStyle, textAlign: 'center', color: '#888', fontSize: 13 }}>未找到處方記錄</div>}
        {patientRx.map(c => {
          const herbs = (c.prescription || []).filter(p => p.herb);
          const count = getRefillCount(refills[c.id]?.originalId || c.id);
          const isEditing = editingId === c.id;
          return (
            <div key={c.id} style={{ ...cardStyle, borderLeft: `4px solid ${isRefill(c.id) ? '#d97706' : '#0e7490'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#0e7490' }}>{c.date}</span>
                  <span style={{ marginLeft: 10, fontSize: 12, color: '#555' }}>{c.doctor || '-'}</span>
                  {isRefill(c.id) && <span style={{ marginLeft: 8, background: '#fef3c7', color: '#92400e', fontSize: 10, padding: '2px 6px', borderRadius: 8 }}>重配</span>}
                  {count > 0 && <span style={{ marginLeft: 6, background: '#ecfdf5', color: '#065f46', fontSize: 10, padding: '2px 6px', borderRadius: 8 }}>已重配 {count} 次</span>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {c.formulaName && <span style={{ background: '#ecfdf5', color: '#065f46', fontSize: 11, padding: '2px 8px', borderRadius: 10 }}>{c.formulaName}</span>}
                  {c.formulaDays && <span style={{ background: '#eff6ff', color: '#1e40af', fontSize: 11, padding: '2px 8px', borderRadius: 10 }}>{c.formulaDays}天</span>}
                </div>
              </div>
              {/* Herbs */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {herbs.map((p, i) => (
                  <span key={i} style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', fontSize: 11, padding: '2px 7px', borderRadius: 6 }}>{p.herb} <b>{p.dosage}</b></span>
                ))}
              </div>

              {/* Edit panel */}
              {isEditing && (
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#0e7490' }}>調整處方後重配</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#888' }}>醫師</div>
                      <select value={editDoctor} onChange={e => setEditDoctor(e.target.value)} className="input" style={{ fontSize: 12, width: 120 }}>
                        {doctors.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#888' }}>天數</div>
                      <input type="number" value={editDays} onChange={e => setEditDays(Number(e.target.value))} className="input" style={{ width: 60, fontSize: 12 }} min={1} />
                    </div>
                  </div>
                  {editRx.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, width: 80 }}>{r.herb}</span>
                      <input value={r.dosage} onChange={e => { const next = [...editRx]; next[i] = { ...next[i], dosage: e.target.value }; setEditRx(next); }} className="input" style={{ width: 70, fontSize: 12 }} />
                      <button onClick={() => setEditRx(editRx.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14 }}>x</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button onClick={() => handleConfirmEdit(c)} style={btnRefill}>確認重配</button>
                    <button onClick={() => setEditingId(null)} style={btnOutline}>取消</button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {!isEditing && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => handleQuickRefill(c)} style={btnRefill}>重配</button>
                  <button onClick={() => handleStartEdit(c)} style={btnOutline}>調整後重配</button>
                  <button onClick={() => handlePrint(c)} style={btnOutline}>列印</button>
                </div>
              )}
            </div>
          );
        })}
      </>}

      {/* Refill History Tab */}
      {selectedPatient && tab === 'history' && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>重配記錄（{refillHistory.length} 筆）</div>
          {refillHistory.length === 0 && <div style={{ ...cardStyle, textAlign: 'center', color: '#888', fontSize: 13 }}>尚無重配記錄</div>}
          {refillHistory.map(c => {
            const info = refills[c.id];
            const herbs = (c.prescription || []).filter(p => p.herb);
            return (
              <div key={c.id} style={{ ...cardStyle, borderLeft: '4px solid #d97706' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#0e7490' }}>{c.date}</span>
                    <span style={{ marginLeft: 10, fontSize: 12, color: '#555' }}>{c.doctor || info?.doctor || '-'}</span>
                    {info?.adjusted && <span style={{ marginLeft: 8, background: '#fef3c7', color: '#92400e', fontSize: 10, padding: '2px 6px', borderRadius: 8 }}>已調整</span>}
                  </div>
                  <button onClick={() => handlePrint(c)} style={btnOutline}>列印</button>
                </div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>原處方來源：{info?.sourceId || '-'} | 重配日期：{info?.refillDate || '-'}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {herbs.map((p, i) => (
                    <span key={i} style={{ background: '#fef9c3', border: '1px solid #fde68a', fontSize: 11, padding: '2px 7px', borderRadius: 6 }}>{p.herb} <b>{p.dosage}</b></span>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {!selectedPatient && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: '#888' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>Rx</div>
          <div style={{ fontSize: 14 }}>請搜尋並選擇病人以進行處方重配</div>
        </div>
      )}
    </div>
  );
}
