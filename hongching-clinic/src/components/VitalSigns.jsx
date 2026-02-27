import { useState, useMemo } from 'react';
import { getDoctors } from '../data';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_vital_signs';
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
const inp = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };

// Abnormal value thresholds
function isAbnormal(key, val) {
  if (val === '' || val == null) return false;
  const n = Number(val);
  if (isNaN(n)) return false;
  if (key === 'temp') return n > 37.5 || n < 35;
  if (key === 'bpSys') return n > 140 || n < 90;
  if (key === 'bpDia') return n > 90 || n < 60;
  if (key === 'hr') return n > 100 || n < 50;
  if (key === 'spo2') return n < 95;
  if (key === 'bmi') return n > 28 || n < 18.5;
  return false;
}

// Trend arrow comparing current vs previous reading
function trend(cur, prev) {
  if (prev == null || cur == null || cur === '' || prev === '') return null;
  const c = Number(cur), p = Number(prev);
  if (isNaN(c) || isNaN(p) || c === p) return null;
  return c > p ? 'up' : 'down';
}

function calcBMI(w, h) {
  const wn = Number(w), hn = Number(h);
  if (!wn || !hn) return '';
  return (wn / ((hn / 100) ** 2)).toFixed(1);
}

const EMPTY = { temp: '', bpSys: '', bpDia: '', hr: '', spo2: '', weight: '', height: '', tongue: '', pulse: '', notes: '' };

export default function VitalSigns({ data, setData, showToast, user }) {
  const [records, setRecords] = useState(load);
  const [search, setSearch] = useState('');
  const [selPatient, setSelPatient] = useState(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [showForm, setShowForm] = useState(false);
  const [showDD, setShowDD] = useState(false);

  const clinicName = getClinicName();
  const patients = data?.patients || [];

  // Patient search results
  const matched = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 10);
  }, [search, patients]);

  // Records for selected patient, sorted newest first
  const patientRecs = useMemo(() => {
    if (!selPatient) return [];
    return records.filter(r => r.patientId === selPatient.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [selPatient, records]);

  const lastRec = patientRecs[0] || null;

  // Count abnormal values in a record
  const abnormalCount = (r) => {
    let c = 0;
    ['temp', 'bpSys', 'bpDia', 'hr', 'spo2'].forEach(k => { if (isAbnormal(k, r[k])) c++; });
    return c;
  };

  function selectPatient(p) {
    setSelPatient(p);
    setSearch(p.name);
    setShowDD(false);
    setShowForm(false);
  }

  // Quick entry: pre-fill from last reading
  function startNew() {
    if (lastRec) {
      setForm({
        temp: lastRec.temp || '', bpSys: lastRec.bpSys || '', bpDia: lastRec.bpDia || '',
        hr: lastRec.hr || '', spo2: lastRec.spo2 || '', weight: lastRec.weight || '',
        height: lastRec.height || '', tongue: lastRec.tongue || '', pulse: lastRec.pulse || '', notes: '',
      });
    } else {
      setForm({ ...EMPTY });
    }
    setShowForm(true);
  }

  function handleSave() {
    const now = new Date();
    const rec = {
      id: uid(), patientId: selPatient.id, patientName: selPatient.name,
      date: now.toISOString().substring(0, 10), time: now.toTimeString().substring(0, 5),
      temp: form.temp, bpSys: form.bpSys, bpDia: form.bpDia, hr: form.hr,
      spo2: form.spo2, weight: form.weight, height: form.height,
      bmi: calcBMI(form.weight, form.height),
      tongue: form.tongue, pulse: form.pulse, notes: form.notes,
      recordedBy: user?.name || 'staff',
    };
    const updated = [rec, ...records];
    setRecords(updated);
    save(updated);
    setShowForm(false);
    showToast && showToast('已保存生命體徵記錄');
  }

  function handleDelete(id) {
    const updated = records.filter(r => r.id !== id);
    setRecords(updated);
    save(updated);
    showToast && showToast('已刪除記錄');
  }

  // Inline field component
  function Field({ label, field, unit, half, textarea }) {
    const ab = isAbnormal(field, form[field]);
    const trendDir = lastRec ? trend(form[field], lastRec[field]) : null;
    return (
      <div style={{ flex: half ? '0 0 48%' : '1 1 100%', marginBottom: 10 }}>
        <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 3 }}>
          {label}{unit ? ` (${unit})` : ''}
          {trendDir && <span style={{ marginLeft: 4, color: trendDir === 'up' ? RED : GREEN, fontSize: 12 }}>{trendDir === 'up' ? '\u2191' : '\u2193'}</span>}
        </label>
        {textarea ? (
          <textarea style={{ ...inp, minHeight: 48, resize: 'vertical' }} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
        ) : (
          <input style={{ ...inp, borderColor: ab ? RED : '#d1d5db', background: ab ? '#fef2f2' : '#fff' }} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
        )}
        {ab && <span style={{ fontSize: 11, color: RED, fontWeight: 500 }}>! 異常值</span>}
      </div>
    );
  }

  // Value display cell with trend and alert
  function Val({ label, val, field, prev }) {
    const ab = isAbnormal(field, val);
    const t = trend(val, prev);
    return (
      <div style={{ display: 'inline-flex', alignItems: 'baseline', marginRight: 16, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: GRAY, marginRight: 4 }}>{label}</span>
        <span style={{ fontWeight: 600, color: ab ? RED : '#111', background: ab ? '#fef2f2' : 'transparent', padding: ab ? '1px 4px' : 0, borderRadius: 3 }}>
          {val || '-'}
        </span>
        {t && <span style={{ color: t === 'up' ? RED : GREEN, marginLeft: 2, fontSize: 14, fontWeight: 700 }}>{t === 'up' ? '\u2191' : '\u2193'}</span>}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 16 }}>
      <h2 style={{ color: ACCENT, marginBottom: 4, fontSize: 20 }}>健康資訊管理</h2>
      <p style={{ color: GRAY, fontSize: 13, marginTop: 0, marginBottom: 14 }}>{clinicName} - 患者生命體徵追蹤</p>

      {/* Patient search */}
      <div style={{ ...card, position: 'relative' }}>
        <label style={{ fontSize: 13, color: GRAY, marginBottom: 4, display: 'block' }}>搜尋患者</label>
        <input
          style={inp} placeholder="輸入患者姓名或電話..."
          value={search}
          onChange={e => { setSearch(e.target.value); setShowDD(true); if (selPatient && e.target.value !== selPatient.name) setSelPatient(null); }}
          onFocus={() => setShowDD(true)}
        />
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

      {/* Selected patient */}
      {selPatient && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 17 }}>{selPatient.name}</span>
              {selPatient.phone && <span style={{ color: GRAY, fontSize: 13, marginLeft: 8 }}>{selPatient.phone}</span>}
              <span style={{ fontSize: 12, color: ACCENT, marginLeft: 8 }}>共 {patientRecs.length} 筆記錄</span>
            </div>
            {!showForm && <button style={btn} onClick={startNew}>+ 新增記錄</button>}
          </div>

          {/* Alert summary for latest record */}
          {lastRec && abnormalCount(lastRec) > 0 && !showForm && (
            <div style={{ ...card, background: '#fef2f2', border: '1px solid #fecaca' }}>
              <span style={{ color: RED, fontWeight: 600, fontSize: 14 }}>
                ⚠ 最近一次記錄有 {abnormalCount(lastRec)} 項異常值，請留意
              </span>
            </div>
          )}

          {/* New record form */}
          {showForm && (
            <div style={{ ...card, border: `2px solid ${ACCENT}` }}>
              <h4 style={{ margin: '0 0 12px', color: ACCENT, fontSize: 16 }}>記錄生命體徵</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Field label="體溫" field="temp" unit="\u00B0C" half />
                <Field label="心率" field="hr" unit="bpm" half />
                <Field label="血壓(收縮壓)" field="bpSys" unit="mmHg" half />
                <Field label="血壓(舒張壓)" field="bpDia" unit="mmHg" half />
                <Field label="血氧 SpO2" field="spo2" unit="%" half />
                <Field label="體重" field="weight" unit="kg" half />
                <Field label="身高" field="height" unit="cm" half />
                <div style={{ flex: '0 0 48%', marginBottom: 10 }}>
                  <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 3 }}>BMI（自動計算）</label>
                  <input style={{ ...inp, background: '#f9fafb', color: isAbnormal('bmi', calcBMI(form.weight, form.height)) ? RED : '#111' }} value={calcBMI(form.weight, form.height)} readOnly />
                </div>
              </div>
              <Field label="舌象" field="tongue" textarea />
              <Field label="脈象" field="pulse" textarea />
              <Field label="備註" field="notes" textarea />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button style={btn} onClick={handleSave}>保存</button>
                <button style={{ ...btn, background: '#6b7280' }} onClick={() => setShowForm(false)}>取消</button>
              </div>
              {lastRec && (
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 8, marginBottom: 0 }}>
                  已從上次記錄（{lastRec.date}）自動帶入數值，僅需修改變動項目
                </p>
              )}
            </div>
          )}

          {/* History timeline */}
          {patientRecs.length === 0 && !showForm && (
            <div style={{ ...card, textAlign: 'center', color: '#9ca3af', padding: 32 }}>暫無生命體徵記錄</div>
          )}

          {patientRecs.map((r, idx) => {
            const prev = patientRecs[idx + 1] || null;
            const hasAbnormal = abnormalCount(r) > 0;
            return (
              <div key={r.id} style={{ ...card, borderLeft: `4px solid ${hasAbnormal ? RED : ACCENT}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600, color: ACCENT, fontSize: 14 }}>{r.date}</span>
                    <span style={{ color: GRAY, fontSize: 13, marginLeft: 8 }}>{r.time}</span>
                    {hasAbnormal && <span style={{ color: RED, fontSize: 12, marginLeft: 8, fontWeight: 500 }}>有異常值</span>}
                  </div>
                  <button style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 13 }} onClick={() => handleDelete(r.id)}>刪除</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', lineHeight: 1.8 }}>
                  <Val label="體溫" val={r.temp ? `${r.temp}\u00B0C` : ''} field="temp" prev={prev?.temp} />
                  <Val label="血壓" val={r.bpSys && r.bpDia ? `${r.bpSys}/${r.bpDia}` : ''} field="bpSys" prev={prev?.bpSys} />
                  <Val label="心率" val={r.hr ? `${r.hr}` : ''} field="hr" prev={prev?.hr} />
                  <Val label="血氧" val={r.spo2 ? `${r.spo2}%` : ''} field="spo2" prev={prev?.spo2} />
                  <Val label="體重" val={r.weight ? `${r.weight}kg` : ''} field="" prev={null} />
                  <Val label="身高" val={r.height ? `${r.height}cm` : ''} field="" prev={null} />
                  <Val label="BMI" val={r.bmi || ''} field="bmi" prev={prev?.bmi} />
                </div>
                {(r.tongue || r.pulse) && (
                  <div style={{ fontSize: 13, marginTop: 6, padding: '6px 10px', background: ACCENT_LIGHT, borderRadius: 4 }}>
                    {r.tongue && <div><span style={{ color: ACCENT, fontWeight: 500 }}>舌象：</span>{r.tongue}</div>}
                    {r.pulse && <div><span style={{ color: ACCENT, fontWeight: 500 }}>脈象：</span>{r.pulse}</div>}
                  </div>
                )}
                {r.notes && <div style={{ fontSize: 13, color: GRAY, marginTop: 4 }}>備註：{r.notes}</div>}
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>記錄者：{r.recordedBy}</div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
