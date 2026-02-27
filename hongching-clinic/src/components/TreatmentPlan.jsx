import { useState, useMemo } from 'react';
import { uid, getDoctors } from '../data';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_treatment_plans';
const load = () => JSON.parse(localStorage.getItem(LS_KEY) || '[]');
const save = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));
const TYPES = ['診症', '針灸', '推拿', '拔罐', '艾灸', '其他'];
const STATUS_MAP = { active: '進行中', completed: '已完成', paused: '已暫停' };
const STATUS_COLORS = { active: '#0e7490', completed: '#16a34a', paused: '#d97706' };
const accent = '#0e7490';

export default function TreatmentPlan({ data, showToast, user }) {
  const doctors = getDoctors();
  const clinicName = getClinicName();
  const patients = data.patients || [];
  const [plans, setPlans] = useState(load);
  const [search, setSearch] = useState('');
  const [selPatient, setSelPatient] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editSession, setEditSession] = useState(null); // { planId, idx }
  const [sessionNotes, setSessionNotes] = useState('');
  const [form, setForm] = useState(null);

  const suggestions = useMemo(() => {
    if (!search || selPatient) return [];
    const q = search.toLowerCase();
    return patients.filter(p => p.name.includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [search, selPatient, patients]);

  const patientPlans = useMemo(() => {
    if (!selPatient) return [];
    return plans.filter(p => p.patientId === selPatient.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [plans, selPatient]);

  const persist = (next) => { setPlans(next); save(next); };

  const openCreate = () => {
    setForm({ name: '', diagnosis: '', goals: '', expectedSessions: 6, prescription: '', precautions: '', doctor: doctors[0] || '', status: 'active',
      sessions: [{ date: new Date().toISOString().slice(0, 10), type: '診症', notes: '', done: false }] });
    setShowModal(true);
  };

  const addSession = () => setForm(f => ({ ...f, sessions: [...f.sessions, { date: '', type: '診症', notes: '', done: false }] }));
  const removeSession = (i) => setForm(f => ({ ...f, sessions: f.sessions.filter((_, j) => j !== i) }));
  const updateSession = (i, k, v) => setForm(f => ({ ...f, sessions: f.sessions.map((s, j) => j === i ? { ...s, [k]: v } : s) }));

  const handleSave = () => {
    if (!form.name) { showToast('請輸入計劃名稱', 'error'); return; }
    const plan = { ...form, id: uid(), patientId: selPatient.id, patientName: selPatient.name, createdAt: new Date().toISOString().slice(0, 10), createdBy: user?.name || '' };
    persist([...plans, plan]);
    setShowModal(false); setForm(null);
    showToast('治療計劃已建立');
  };

  const markSession = (planId, idx) => {
    const p = plans.find(x => x.id === planId);
    setEditSession({ planId, idx }); setSessionNotes(p.sessions[idx].notes || '');
  };

  const confirmSession = () => {
    const next = plans.map(p => p.id === editSession.planId ? { ...p, sessions: p.sessions.map((s, i) => i === editSession.idx ? { ...s, done: true, notes: sessionNotes, completedAt: new Date().toISOString().slice(0, 10) } : s) } : p);
    persist(next); setEditSession(null); showToast('療程已完成');
  };

  const toggleStatus = (id, status) => { persist(plans.map(p => p.id === id ? { ...p, status } : p)); };

  const printPlan = (plan) => {
    const w = window.open('', '_blank');
    const sessRows = plan.sessions.map((s, i) => `<tr><td>${i + 1}</td><td>${s.date}</td><td>${s.type}</td><td>${s.done ? '已完成' : '未完成'}</td><td>${s.notes || ''}</td></tr>`).join('');
    w.document.write(`<html><head><title>治療計劃</title><style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f0fdfa}</style></head><body>
      <h2>${clinicName} — 治療計劃</h2><p><b>病人：</b>${plan.patientName}　<b>醫師：</b>${plan.doctor}　<b>日期：</b>${plan.createdAt}</p>
      <p><b>計劃名稱：</b>${plan.name}　<b>狀態：</b>${STATUS_MAP[plan.status]}</p>
      <p><b>診斷：</b>${plan.diagnosis || '-'}</p><p><b>治療目標：</b>${plan.goals || '-'}</p>
      <table><tr><th>#</th><th>日期</th><th>治療</th><th>狀態</th><th>備註</th></tr>${sessRows}</table>
      <p><b>處方建議：</b>${plan.prescription || '-'}</p><p><b>注意事項：</b>${plan.precautions || '-'}</p>
      <script>window.print()</script></body></html>`);
    w.document.close();
  };

  const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #e5e7eb' };
  const btn = (bg = accent) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 14 });
  const inp = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ color: accent, marginBottom: 8 }}>治療計劃管理</h2>

      {/* Patient Search */}
      {!selPatient ? (
        <div style={card}>
          <label style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>搜尋病人</label>
          <input style={inp} placeholder="輸入姓名或電話..." value={search} onChange={e => { setSearch(e.target.value); setSelPatient(null); }} />
          {suggestions.length > 0 && <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
            {suggestions.map(p => <div key={p.id} onClick={() => { setSelPatient(p); setSearch(p.name); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}>{p.name}　<span style={{ color: '#888', fontSize: 13 }}>{p.phone}</span></div>)}
          </div>}
        </div>
      ) : (
        <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><b>病人：</b>{selPatient.name}　<span style={{ color: '#888' }}>{selPatient.phone}</span></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btn()} onClick={openCreate}>＋ 新增計劃</button>
            <button style={btn('#6b7280')} onClick={() => { setSelPatient(null); setSearch(''); }}>返回</button>
          </div>
        </div>
      )}

      {/* Plan List */}
      {selPatient && patientPlans.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#888' }}>暫無治療計劃，請新增</div>}
      {selPatient && patientPlans.map(plan => {
        const done = plan.sessions.filter(s => s.done).length;
        const total = plan.sessions.length;
        const pct = total ? Math.round(done / total * 100) : 0;
        return (
          <div key={plan.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: accent }}>{plan.name}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ background: STATUS_COLORS[plan.status] + '22', color: STATUS_COLORS[plan.status], padding: '2px 10px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>{STATUS_MAP[plan.status]}</span>
                <button style={{ ...btn('#6b7280'), padding: '4px 10px', fontSize: 13 }} onClick={() => printPlan(plan)}>列印</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: 14, marginBottom: 8 }}>
              <div><b>診斷：</b>{plan.diagnosis || '-'}</div>
              <div><b>醫師：</b>{plan.doctor}</div>
              <div><b>治療目標：</b>{plan.goals || '-'}</div>
              <div><b>建立日期：</b>{plan.createdAt}</div>
            </div>

            {/* Progress */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                <span>療程進度：{done}/{total}（預計 {plan.expectedSessions} 次）</span><span>{pct}%</span>
              </div>
              <div style={{ background: '#e5e7eb', borderRadius: 8, height: 10 }}>
                <div style={{ width: pct + '%', background: accent, height: 10, borderRadius: 8, transition: 'width .3s' }} />
              </div>
            </div>

            {/* Sessions Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 8 }}>
              <thead><tr style={{ background: '#f0fdfa' }}>
                <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>#</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>日期</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>治療</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>狀態</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>備註</th>
              </tr></thead>
              <tbody>{plan.sessions.map((s, i) => (
                <tr key={i} onClick={() => !s.done && markSession(plan.id, i)} style={{ cursor: s.done ? 'default' : 'pointer', background: s.done ? '#f0fdf4' : '#fff' }}>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #f3f4f6' }}>{i + 1}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #f3f4f6' }}>{s.date || '-'}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #f3f4f6' }}>{s.type}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #f3f4f6' }}>{s.done ? <span style={{ color: '#16a34a' }}>已完成</span> : <span style={{ color: '#d97706' }}>未完成</span>}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid #f3f4f6' }}>{s.notes || '-'}</td>
                </tr>
              ))}</tbody>
            </table>

            {plan.prescription && <div style={{ fontSize: 13, marginBottom: 4 }}><b>處方建議：</b>{plan.prescription}</div>}
            {plan.precautions && <div style={{ fontSize: 13, marginBottom: 4 }}><b>注意事項：</b>{plan.precautions}</div>}

            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {plan.status !== 'completed' && <button style={{ ...btn('#16a34a'), padding: '4px 12px', fontSize: 13 }} onClick={() => toggleStatus(plan.id, 'completed')}>標記完成</button>}
              {plan.status === 'active' && <button style={{ ...btn('#d97706'), padding: '4px 12px', fontSize: 13 }} onClick={() => toggleStatus(plan.id, 'paused')}>暫停</button>}
              {plan.status === 'paused' && <button style={{ ...btn(accent), padding: '4px 12px', fontSize: 13 }} onClick={() => toggleStatus(plan.id, 'active')}>恢復</button>}
            </div>
          </div>
        );
      })}

      {/* Create Modal */}
      {showModal && form && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '95%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
          <h3 style={{ color: accent, marginTop: 0 }}>新增治療計劃 — {selPatient.name}</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <div><label style={{ fontSize: 13, fontWeight: 600 }}>計劃名稱 *</label><input style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="如：腰痛治療計劃" /></div>
            <div><label style={{ fontSize: 13, fontWeight: 600 }}>診斷</label><input style={inp} value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} /></div>
            <div><label style={{ fontSize: 13, fontWeight: 600 }}>治療目標</label><input style={inp} value={form.goals} onChange={e => setForm({ ...form, goals: e.target.value })} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>醫師</label><select style={inp} value={form.doctor} onChange={e => setForm({ ...form, doctor: e.target.value })}>{doctors.map(d => <option key={d}>{d}</option>)}</select></div>
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>預計療程次數</label><input style={inp} type="number" min={1} value={form.expectedSessions} onChange={e => setForm({ ...form, expectedSessions: +e.target.value })} /></div>
            </div>
            <div><label style={{ fontSize: 13, fontWeight: 600 }}>處方建議</label><textarea style={{ ...inp, minHeight: 50 }} value={form.prescription} onChange={e => setForm({ ...form, prescription: e.target.value })} /></div>
            <div><label style={{ fontSize: 13, fontWeight: 600 }}>注意事項</label><textarea style={{ ...inp, minHeight: 50 }} value={form.precautions} onChange={e => setForm({ ...form, precautions: e.target.value })} /></div>

            <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>療程安排</label>
              {form.sessions.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <input type="date" style={{ ...inp, width: 140 }} value={s.date} onChange={e => updateSession(i, 'date', e.target.value)} />
                  <select style={{ ...inp, width: 100 }} value={s.type} onChange={e => updateSession(i, 'type', e.target.value)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
                  <input style={{ ...inp, flex: 1 }} placeholder="備註" value={s.notes} onChange={e => updateSession(i, 'notes', e.target.value)} />
                  <button style={{ ...btn('#ef4444'), padding: '4px 8px', fontSize: 13 }} onClick={() => removeSession(i)}>✕</button>
                </div>
              ))}
              <button style={{ ...btn('#6b7280'), padding: '4px 12px', fontSize: 13 }} onClick={addSession}>＋ 增加療程</button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button style={btn('#6b7280')} onClick={() => { setShowModal(false); setForm(null); }}>取消</button>
            <button style={btn()} onClick={handleSave}>建立計劃</button>
          </div>
        </div>
      </div>}

      {/* Complete Session Modal */}
      {editSession && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '95%', maxWidth: 400 }}>
          <h3 style={{ color: accent, marginTop: 0 }}>完成療程 #{editSession.idx + 1}</h3>
          <label style={{ fontSize: 13, fontWeight: 600 }}>備註</label>
          <textarea style={{ ...inp, minHeight: 60, marginTop: 4 }} value={sessionNotes} onChange={e => setSessionNotes(e.target.value)} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button style={btn('#6b7280')} onClick={() => setEditSession(null)}>取消</button>
            <button style={btn('#16a34a')} onClick={confirmSession}>標記完成</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
