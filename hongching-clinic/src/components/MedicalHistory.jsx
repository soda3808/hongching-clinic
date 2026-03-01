import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_medical_history';
const ALLERGY_KEY = 'hcmc_allergies';
const ACCENT = '#0e7490';
const GRAY = '#6b7280';
const card = { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.1)' };
const btn = { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 500 };
const btnOut = { ...btn, background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}` };
const btnSm = { ...btn, padding: '4px 12px', fontSize: 13 };
const inp = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const label = { display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 3 };
const sectionTitle = { fontSize: 15, fontWeight: 600, color: ACCENT, margin: '0 0 8px', borderBottom: `2px solid ${ACCENT}`, paddingBottom: 4 };

const loadHistory = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
const saveHistory = (obj) => localStorage.setItem(LS_KEY, JSON.stringify(obj));
const loadAllergies = () => { try { return JSON.parse(localStorage.getItem(ALLERGY_KEY)) || []; } catch { return []; } };

const EMPTY_SECTIONS = {
  pastMedical: { conditions: '', details: '', updatedAt: '' },
  familyHistory: { conditions: '', details: '', updatedAt: '' },
  surgicalHistory: { surgeries: '', details: '', updatedAt: '' },
  medicationHistory: { currentMeds: '', pastMeds: '', updatedAt: '' },
  socialHistory: { smoking: '無', alcohol: '無', exercise: '無', occupation: '', details: '', updatedAt: '' },
};

export default function MedicalHistory({ data, showToast, user }) {
  const [search, setSearch] = useState('');
  const [selPatient, setSelPatient] = useState(null);
  const [showDD, setShowDD] = useState(false);
  const [allHistory, setAllHistory] = useState(loadHistory);
  const [editSection, setEditSection] = useState(null);
  const [editForm, setEditForm] = useState({});

  const clinicName = getClinicName();
  const patients = data?.patients || [];
  const consultations = data?.consultations || [];
  const allergies = useMemo(() => loadAllergies(), []);

  const matched = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [search, patients]);

  const patientHistory = selPatient ? (allHistory[selPatient.id] || { ...EMPTY_SECTIONS }) : null;
  const patientAllergies = useMemo(() => {
    if (!selPatient) return [];
    return allergies.filter(a => a.patientId === selPatient.id || a.patientName === selPatient.name);
  }, [selPatient, allergies]);

  const patientConsults = useMemo(() => {
    if (!selPatient) return [];
    return consultations.filter(c => c.patientId === selPatient.id || c.patientName === selPatient.name)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [selPatient, consultations]);

  const selectPatient = (p) => { setSelPatient(p); setSearch(''); setShowDD(false); setEditSection(null); };

  const startEdit = (section) => {
    const current = patientHistory?.[section] || EMPTY_SECTIONS[section] || {};
    setEditForm({ ...current });
    setEditSection(section);
  };

  const saveEdit = (section) => {
    if (!selPatient) return;
    const updated = { ...allHistory };
    const pid = selPatient.id;
    if (!updated[pid]) updated[pid] = { ...EMPTY_SECTIONS };
    updated[pid][section] = { ...editForm, updatedAt: new Date().toISOString() };
    setAllHistory(updated);
    saveHistory(updated);
    setEditSection(null);
    showToast?.('已儲存');
  };

  const handlePrint = () => {
    if (!selPatient || !patientHistory) return;
    const w = window.open('', '_blank', 'width=800,height=900');
    const sevColor = { '輕微': '#16a34a', '中度': '#ea580c', '嚴重': '#dc2626', '致命': '#7c2d12' };
    const allergyRows = patientAllergies.map(a =>
      `<tr><td>${escapeHtml(a.allergen || '')}</td><td>${escapeHtml(a.type || '')}</td><td style="color:${sevColor[a.severity] || '#333'}">${escapeHtml(a.severity || '')}</td><td>${escapeHtml(a.reaction || '')}</td></tr>`
    ).join('');
    const consultRows = patientConsults.slice(0, 20).map(c =>
      `<tr><td>${c.date || ''}</td><td>${escapeHtml(c.doctor || '')}</td><td>${escapeHtml(c.tcmDiagnosis || c.assessment || '')}</td><td>${escapeHtml(c.tcmPattern || '')}</td></tr>`
    ).join('');
    const h = patientHistory;
    const sm = { smoking: '吸煙', alcohol: '飲酒', exercise: '運動' };
    const socialText = Object.entries(sm).map(([k, l]) => `${l}：${h.socialHistory?.[k] || '無'}`).join('　');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>病歷總覽 - ${escapeHtml(selPatient.name)}</title>
<style>body{font-family:sans-serif;padding:20px;color:#333}h1{color:${ACCENT};font-size:20px;border-bottom:2px solid ${ACCENT};padding-bottom:6px}
h2{color:${ACCENT};font-size:16px;margin:16px 0 6px;border-left:4px solid ${ACCENT};padding-left:8px}
table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #d1d5db;padding:5px 8px;font-size:13px;text-align:left}
th{background:#f0fdfa}p{margin:4px 0;font-size:13px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px}
@media print{body{padding:0}}</style></head><body>
<h1>${escapeHtml(clinicName)} — 病歷總覽</h1>
<h2>基本資料</h2>
<div class="info-grid">
<p><b>姓名：</b>${escapeHtml(selPatient.name || '')}</p><p><b>電話：</b>${escapeHtml(selPatient.phone || '')}</p>
<p><b>性別：</b>${escapeHtml(selPatient.gender || '')}</p><p><b>出生日期：</b>${selPatient.dob || ''}</p>
<p><b>地址：</b>${escapeHtml(selPatient.address || '')}</p><p><b>血型：</b>${escapeHtml(selPatient.bloodType || '')}</p>
</div>
<h2>過往病史</h2><p>${escapeHtml(h.pastMedical?.conditions || '無記錄')}</p><p>${escapeHtml(h.pastMedical?.details || '')}</p>
<h2>家族病史</h2><p>${escapeHtml(h.familyHistory?.conditions || '無記錄')}</p><p>${escapeHtml(h.familyHistory?.details || '')}</p>
<h2>過敏史</h2>${patientAllergies.length ? `<table><tr><th>過敏原</th><th>類型</th><th>嚴重程度</th><th>反應</th></tr>${allergyRows}</table>` : '<p>無記錄</p>'}
<h2>手術史</h2><p>${escapeHtml(h.surgicalHistory?.surgeries || '無記錄')}</p><p>${escapeHtml(h.surgicalHistory?.details || '')}</p>
<h2>用藥史</h2><p><b>目前用藥：</b>${escapeHtml(h.medicationHistory?.currentMeds || '無')}</p><p><b>過往用藥：</b>${escapeHtml(h.medicationHistory?.pastMeds || '無')}</p>
<h2>社交史</h2><p>${escapeHtml(socialText)}</p><p>${escapeHtml(h.socialHistory?.details || '')}</p>
<h2>診症記錄（近20次）</h2>${patientConsults.length ? `<table><tr><th>日期</th><th>醫師</th><th>診斷</th><th>辨證</th></tr>${consultRows}</table>` : '<p>無記錄</p>'}
<p style="margin-top:20px;font-size:11px;color:#999">列印日期：${new Date().toLocaleDateString('zh-TW')}　${escapeHtml(clinicName)}</p>
</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const renderField = (lbl, key, textarea) => (
    <div key={key} style={{ marginBottom: 8 }}>
      <label style={label}>{lbl}</label>
      {textarea
        ? <textarea style={{ ...inp, minHeight: 60 }} value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} />
        : <input style={inp} value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} />}
    </div>
  );

  const renderSelect = (lbl, key, options) => (
    <div key={key} style={{ marginBottom: 8 }}>
      <label style={label}>{lbl}</label>
      <select style={inp} value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const renderUpdated = (section) => {
    const ts = patientHistory?.[section]?.updatedAt;
    return ts ? <span style={{ fontSize: 11, color: GRAY }}>最後更新：{new Date(ts).toLocaleString('zh-TW')}</span> : null;
  };

  const SectionCard = ({ title, section, children, readOnly }) => (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={sectionTitle}>{title}</h3>
        {!readOnly && editSection !== section && <button style={btnSm} onClick={() => startEdit(section)}>編輯</button>}
      </div>
      {editSection === section ? (
        <div>
          {children}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={btn} onClick={() => saveEdit(section)}>儲存</button>
            <button style={btnOut} onClick={() => setEditSection(null)}>取消</button>
          </div>
        </div>
      ) : (
        <div>{children}</div>
      )}
      {renderUpdated(section)}
    </div>
  );

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ color: ACCENT, marginBottom: 12 }}>病歷總覽</h2>

      {/* Patient Search */}
      <div style={{ ...card, position: 'relative' }}>
        <label style={label}>搜尋病人（姓名或電話）</label>
        <input style={inp} placeholder="輸入姓名或電話…" value={search}
          onChange={e => { setSearch(e.target.value); setShowDD(true); }}
          onFocus={() => setShowDD(true)} />
        {showDD && matched.length > 0 && (
          <div style={{ position: 'absolute', left: 16, right: 16, top: 72, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, zIndex: 10, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.12)' }}>
            {matched.map(p => (
              <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: 14 }}
                onClick={() => selectPatient(p)}
                onMouseEnter={e => e.currentTarget.style.background = '#f0fdfa'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                <b>{p.name}</b> <span style={{ color: GRAY }}>{p.phone || ''} | {p.gender || ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!selPatient && <p style={{ textAlign: 'center', color: GRAY, marginTop: 40 }}>請先搜尋並選擇病人以查看病歷</p>}

      {selPatient && (
        <>
          {/* Header */}
          <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdfa' }}>
            <div>
              <span style={{ fontSize: 18, fontWeight: 600, color: ACCENT }}>{selPatient.name}</span>
              <span style={{ marginLeft: 12, color: GRAY, fontSize: 13 }}>{selPatient.phone || ''} | {selPatient.gender || ''} | {selPatient.dob || ''}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn} onClick={handlePrint}>列印病歷</button>
              <button style={btnOut} onClick={() => { setSelPatient(null); setEditSection(null); }}>返回</button>
            </div>
          </div>

          {/* Demographics */}
          <div style={card}>
            <h3 style={sectionTitle}>基本資料</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 14 }}>
              <p><b>姓名：</b>{selPatient.name || '-'}</p>
              <p><b>電話：</b>{selPatient.phone || '-'}</p>
              <p><b>性別：</b>{selPatient.gender || '-'}</p>
              <p><b>出生日期：</b>{selPatient.dob || '-'}</p>
              <p><b>地址：</b>{selPatient.address || '-'}</p>
              <p><b>血型：</b>{selPatient.bloodType || '-'}</p>
              <p><b>緊急聯絡人：</b>{selPatient.emergencyContact || patientHistory?.emergencyContact || '-'}</p>
              <p><b>備註：</b>{selPatient.notes || '-'}</p>
            </div>
          </div>

          {/* Past Medical History */}
          <SectionCard title="過往病史" section="pastMedical">
            {editSection === 'pastMedical' ? (<>
              {renderField('慢性疾病/病史', 'conditions', true)}
              {renderField('詳細說明', 'details', true)}
            </>) : (
              <div style={{ fontSize: 14 }}>
                <p><b>慢性疾病/病史：</b>{patientHistory?.pastMedical?.conditions || <span style={{ color: GRAY }}>未填寫</span>}</p>
                <p><b>詳細說明：</b>{patientHistory?.pastMedical?.details || <span style={{ color: GRAY }}>未填寫</span>}</p>
              </div>
            )}
          </SectionCard>

          {/* Family History */}
          <SectionCard title="家族病史" section="familyHistory">
            {editSection === 'familyHistory' ? (<>
              {renderField('家族疾病', 'conditions', true)}
              {renderField('詳細說明', 'details', true)}
            </>) : (
              <div style={{ fontSize: 14 }}>
                <p><b>家族疾病：</b>{patientHistory?.familyHistory?.conditions || <span style={{ color: GRAY }}>未填寫</span>}</p>
                <p><b>詳細說明：</b>{patientHistory?.familyHistory?.details || <span style={{ color: GRAY }}>未填寫</span>}</p>
              </div>
            )}
          </SectionCard>

          {/* Allergy History (read-only from hcmc_allergies) */}
          <SectionCard title="過敏史" section="allergies" readOnly>
            {patientAllergies.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f0fdfa' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>過敏原</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>類型</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>嚴重程度</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>反應</th>
                  </tr>
                </thead>
                <tbody>
                  {patientAllergies.map((a, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '6px 8px' }}>{a.allergen}</td>
                      <td style={{ padding: '6px 8px' }}>{a.type}</td>
                      <td style={{ padding: '6px 8px', color: { '輕微': '#16a34a', '中度': '#ea580c', '嚴重': '#dc2626', '致命': '#7c2d12' }[a.severity] || '#333', fontWeight: 600 }}>{a.severity}</td>
                      <td style={{ padding: '6px 8px' }}>{a.reaction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p style={{ fontSize: 14, color: GRAY }}>無過敏記錄（請到「過敏警示」頁面管理）</p>}
          </SectionCard>

          {/* Surgical History */}
          <SectionCard title="手術史" section="surgicalHistory">
            {editSection === 'surgicalHistory' ? (<>
              {renderField('手術名稱/日期', 'surgeries', true)}
              {renderField('詳細說明', 'details', true)}
            </>) : (
              <div style={{ fontSize: 14 }}>
                <p><b>手術記錄：</b>{patientHistory?.surgicalHistory?.surgeries || <span style={{ color: GRAY }}>未填寫</span>}</p>
                <p><b>詳細說明：</b>{patientHistory?.surgicalHistory?.details || <span style={{ color: GRAY }}>未填寫</span>}</p>
              </div>
            )}
          </SectionCard>

          {/* Medication History */}
          <SectionCard title="用藥史" section="medicationHistory">
            {editSection === 'medicationHistory' ? (<>
              {renderField('目前用藥', 'currentMeds', true)}
              {renderField('過往用藥', 'pastMeds', true)}
            </>) : (
              <div style={{ fontSize: 14 }}>
                <p><b>目前用藥：</b>{patientHistory?.medicationHistory?.currentMeds || <span style={{ color: GRAY }}>未填寫</span>}</p>
                <p><b>過往用藥：</b>{patientHistory?.medicationHistory?.pastMeds || <span style={{ color: GRAY }}>未填寫</span>}</p>
              </div>
            )}
          </SectionCard>

          {/* Social History */}
          <SectionCard title="社交史" section="socialHistory">
            {editSection === 'socialHistory' ? (<>
              {renderSelect('吸煙', 'smoking', ['無', '已戒', '偶爾', '每日'])}
              {renderSelect('飲酒', 'alcohol', ['無', '已戒', '偶爾', '經常'])}
              {renderSelect('運動', 'exercise', ['無', '偶爾', '每週1-2次', '每週3次以上', '每日'])}
              {renderField('職業', 'occupation')}
              {renderField('其他備註', 'details', true)}
            </>) : (
              <div style={{ fontSize: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                <p><b>吸煙：</b>{patientHistory?.socialHistory?.smoking || '無'}</p>
                <p><b>飲酒：</b>{patientHistory?.socialHistory?.alcohol || '無'}</p>
                <p><b>運動：</b>{patientHistory?.socialHistory?.exercise || '無'}</p>
                <p><b>職業：</b>{patientHistory?.socialHistory?.occupation || <span style={{ color: GRAY }}>未填寫</span>}</p>
                {patientHistory?.socialHistory?.details && <p style={{ gridColumn: '1/-1' }}><b>備註：</b>{patientHistory.socialHistory.details}</p>}
              </div>
            )}
          </SectionCard>

          {/* Consultation Summary */}
          <div style={card}>
            <h3 style={sectionTitle}>診症記錄（共 {patientConsults.length} 次）</h3>
            {patientConsults.length === 0 && <p style={{ fontSize: 14, color: GRAY }}>暫無診症記錄</p>}
            {patientConsults.length > 0 && (
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f0fdfa', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>日期</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>醫師</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>診斷</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>辨證</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>處方</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patientConsults.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{c.date}</td>
                        <td style={{ padding: '6px 8px' }}>{c.doctor || '-'}</td>
                        <td style={{ padding: '6px 8px' }}>{c.tcmDiagnosis || c.assessment || '-'}</td>
                        <td style={{ padding: '6px 8px' }}>{c.tcmPattern || '-'}</td>
                        <td style={{ padding: '6px 8px' }}>{(c.prescription || []).filter(p => p.herb).map(p => p.herb).join('、') || c.formulaName || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
