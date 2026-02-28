import { useState, useMemo } from 'react';
import { getDoctors } from '../data';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_discharges';
const load = () => JSON.parse(localStorage.getItem(LS_KEY) || '[]');
const save = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const OUTCOMES = [
  { value: 'improved', label: '好轉', en: 'Improved' },
  { value: 'stable', label: '穩定', en: 'Stable' },
  { value: 'referred', label: '轉介', en: 'Referred' },
  { value: 'other', label: '其他', en: 'Other' },
];
const CHECKLIST_ITEMS = ['處方完成', '費用結清', '覆診安排', '轉介信函', '健康指導', '病歷歸檔'];
const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #e5e7eb' };
const btn = (bg = ACCENT) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 14 });
const inp = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' };
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function PatientDischarge({ data, showToast, user }) {
  const doctors = getDoctors();
  const clinicName = getClinicName();
  const patients = data?.patients || [];
  const [records, setRecords] = useState(load);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('list'); // list | create | history
  const [selPatient, setSelPatient] = useState(null);
  const [historyPatient, setHistoryPatient] = useState(null);
  const [historySearch, setHistorySearch] = useState('');
  const [form, setForm] = useState(null);
  const [checklist, setChecklist] = useState(CHECKLIST_ITEMS.map(() => false));
  const [followups, setFollowups] = useState(load().filter(r => r.nextReviewDate && r.nextReviewDate >= today() && !r.followUpDone));

  const persist = (next) => { setRecords(next); save(next); };

  // Stats
  const stats = useMemo(() => {
    const cm = thisMonth();
    const monthRecs = records.filter(r => (r.dischargeDate || '').slice(0, 7) === cm);
    const outcomeDist = OUTCOMES.map(o => ({ ...o, count: records.filter(r => r.outcome === o.value).length }));
    const avgDuration = records.length ? Math.round(records.reduce((s, r) => {
      if (!r.firstVisit || !r.dischargeDate) return s;
      return s + (new Date(r.dischargeDate) - new Date(r.firstVisit)) / 86400000;
    }, 0) / records.length) : 0;
    return { total: records.length, thisMonth: monthRecs.length, outcomeDist, avgDuration };
  }, [records]);

  // Suggestions for patient search
  const suggestions = useMemo(() => {
    if (!search || selPatient) return [];
    const q = search.toLowerCase();
    return patients.filter(p => p.name.includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [search, selPatient, patients]);

  const historySuggestions = useMemo(() => {
    if (!historySearch || historyPatient) return [];
    const q = historySearch.toLowerCase();
    return patients.filter(p => p.name.includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [historySearch, historyPatient, patients]);

  const patientHistory = useMemo(() => {
    if (!historyPatient) return [];
    return records.filter(r => r.patientId === historyPatient.id).sort((a, b) => (b.dischargeDate || '').localeCompare(a.dischargeDate || ''));
  }, [records, historyPatient]);

  const filteredRecords = useMemo(() => {
    let list = [...records].sort((a, b) => (b.dischargeDate || '').localeCompare(a.dischargeDate || ''));
    if (search && !selPatient) {
      const q = search.toLowerCase();
      list = list.filter(r => (r.patientName || '').toLowerCase().includes(q) || (r.diagnosis || '').toLowerCase().includes(q));
    }
    return list;
  }, [records, search, selPatient]);

  const pendingFollowups = useMemo(() => {
    const t = today();
    return records.filter(r => r.nextReviewDate && !r.followUpDone).sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));
  }, [records]);

  const selectPatient = (p) => { setSelPatient(p); setSearch(p.name); };

  const startCreate = () => {
    if (!selPatient) return showToast('請先選擇病人');
    const consultations = data?.consultations || [];
    const firstVisit = consultations.filter(c => c.patientId === selPatient.id || c.patientName === selPatient.name)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0]?.date || '';
    setForm({
      doctor: doctors[0] || '', dischargeDate: today(), diagnosis: '', treatmentSummary: '',
      outcome: 'improved', followUpPlan: '', medications: '', lifestyleAdvice: '',
      referralTo: '', nextReviewDate: '', dischargeLetter: '', firstVisit,
    });
    setChecklist(CHECKLIST_ITEMS.map(() => false));
    setTab('create');
  };

  const handleSave = () => {
    if (!form.dischargeDate || !form.diagnosis) return showToast('請填寫出院日期及診斷');
    const incomplete = checklist.filter(c => !c).length;
    if (incomplete > 0 && !window.confirm(`尚有 ${incomplete} 項清單未完成，確定儲存？`)) return;
    const rec = { ...form, id: uid(), patientId: selPatient.id, patientName: selPatient.name,
      patientPhone: selPatient.phone || '', createdAt: today(), createdBy: user?.name || '',
      checklist: CHECKLIST_ITEMS.reduce((o, item, i) => { o[item] = checklist[i]; return o; }, {}), followUpDone: false };
    persist([...records, rec]);
    showToast('出院記錄已建立');
    setTab('list'); setForm(null); setSelPatient(null); setSearch('');
  };

  const toggleFollowUp = (id) => {
    const next = records.map(r => r.id === id ? { ...r, followUpDone: true, followUpAt: today() } : r);
    persist(next); showToast('已標記跟進完成');
  };

  const deleteRecord = (id) => {
    if (!window.confirm('確定刪除此出院記錄？')) return;
    persist(records.filter(r => r.id !== id)); showToast('已刪除');
  };

  const generateLetter = () => {
    if (!selPatient || !form) return;
    const oc = OUTCOMES.find(o => o.value === form.outcome) || OUTCOMES[0];
    const letter = `致有關醫療人員：\n\n茲證明 ${selPatient.name} 病人已於本中心完成療程，現予出院。\n\n診斷：${form.diagnosis}\n治療摘要：${form.treatmentSummary}\n治療結果：${oc.label}（${oc.en}）\n${form.medications ? `持續用藥：${form.medications}\n` : ''}${form.followUpPlan ? `跟進計劃：${form.followUpPlan}\n` : ''}${form.lifestyleAdvice ? `生活建議：${form.lifestyleAdvice}\n` : ''}${form.referralTo ? `轉介至：${form.referralTo}\n` : ''}${form.nextReviewDate ? `下次覆診日期：${form.nextReviewDate}\n` : ''}\n如有查詢，請與本中心聯絡。\n\n${clinicName}\n主診醫師：${form.doctor}\n日期：${form.dischargeDate}`;
    setForm({ ...form, dischargeLetter: letter });
  };

  const printSummary = (rec) => {
    const oc = OUTCOMES.find(o => o.value === rec.outcome) || OUTCOMES[0];
    const cl = Object.entries(rec.checklist || {}).map(([k, v]) => `<tr><td style="padding:4px 10px">${k}</td><td style="padding:4px 10px;color:${v ? '#16a34a' : '#d97706'}">${v ? 'OK' : '--'}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return showToast('請允許彈出視窗');
    w.document.write(`<!DOCTYPE html><html><head><title>出院摘要</title><style>body{font-family:'Microsoft YaHei',sans-serif;padding:30px 40px;max-width:700px;margin:0 auto;color:#333}h2{color:${ACCENT};border-bottom:2px solid ${ACCENT};padding-bottom:8px}.row{display:flex;margin:6px 0;font-size:14px}.row b{width:120px;flex-shrink:0}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ddd;text-align:left}th{background:#f0fdfa}@media print{body{padding:20px}}</style></head><body>
      <h2>${clinicName} -- 出院摘要 Discharge Summary</h2>
      <div class="row"><b>病人：</b>${rec.patientName}</div>
      <div class="row"><b>出院日期：</b>${rec.dischargeDate}</div>
      <div class="row"><b>主診醫師：</b>${rec.doctor}</div>
      <div class="row"><b>診斷：</b>${rec.diagnosis}</div>
      <div class="row"><b>治療摘要：</b>${rec.treatmentSummary || '-'}</div>
      <div class="row"><b>治療結果：</b>${oc.label}（${oc.en}）</div>
      ${rec.medications ? `<div class="row"><b>持續用藥：</b>${rec.medications}</div>` : ''}
      ${rec.followUpPlan ? `<div class="row"><b>跟進計劃：</b>${rec.followUpPlan}</div>` : ''}
      ${rec.lifestyleAdvice ? `<div class="row"><b>生活建議：</b>${rec.lifestyleAdvice}</div>` : ''}
      ${rec.referralTo ? `<div class="row"><b>轉介至：</b>${rec.referralTo}</div>` : ''}
      ${rec.nextReviewDate ? `<div class="row"><b>下次覆診：</b>${rec.nextReviewDate}</div>` : ''}
      <h3 style="color:${ACCENT};margin-top:20px">出院核查清單</h3>
      <table>${cl}</table>
      <div style="margin-top:40px;text-align:center;font-size:11px;color:#aaa">${clinicName} | ${rec.dischargeDate}</div>
      <script>window.print()<\/script></body></html>`);
    w.document.close();
  };

  const printLetter = (rec) => {
    const w = window.open('', '_blank');
    if (!w) return showToast('請允許彈出視窗');
    w.document.write(`<!DOCTYPE html><html><head><title>出院信函</title><style>body{font-family:'Microsoft YaHei',sans-serif;padding:40px 50px;max-width:700px;margin:0 auto;color:#333;white-space:pre-wrap;line-height:1.8;font-size:14px}h2{color:${ACCENT};text-align:center;border-bottom:2px solid ${ACCENT};padding-bottom:10px}@media print{body{padding:20px}}</style></head><body>
      <h2>${clinicName} -- 出院信函 Discharge Letter</h2>
      <div style="margin-top:20px">${(rec.dischargeLetter || '').replace(/\n/g, '<br/>')}</div>
      <script>window.print()<\/script></body></html>`);
    w.document.close();
  };

  const tabBtn = (t) => ({ ...btn(tab === t ? ACCENT : '#94a3b8'), marginRight: 6, fontSize: 13, padding: '6px 14px' });

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ color: ACCENT, marginBottom: 4 }}>出院管理</h2>
      <p style={{ color: '#888', fontSize: 13, marginTop: 0, marginBottom: 14 }}>管理病人療程完成出院、出院信函及跟進追蹤</p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
        <div style={{ ...card, textAlign: 'center', padding: 14 }}><div style={{ fontSize: 24, fontWeight: 700, color: ACCENT }}>{stats.total}</div><div style={{ fontSize: 12, color: '#888' }}>總出院數</div></div>
        <div style={{ ...card, textAlign: 'center', padding: 14 }}><div style={{ fontSize: 24, fontWeight: 700, color: '#d97706' }}>{stats.thisMonth}</div><div style={{ fontSize: 12, color: '#888' }}>本月出院</div></div>
        <div style={{ ...card, textAlign: 'center', padding: 14 }}><div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{stats.avgDuration}</div><div style={{ fontSize: 12, color: '#888' }}>平均療程(天)</div></div>
        <div style={{ ...card, textAlign: 'center', padding: 14 }}><div style={{ fontSize: 24, fontWeight: 700, color: '#7c3aed' }}>{pendingFollowups.length}</div><div style={{ fontSize: 12, color: '#888' }}>待跟進</div></div>
      </div>

      {/* Outcome distribution */}
      <div style={{ ...card, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>治療結果分佈</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {stats.outcomeDist.map(o => (
            <div key={o.value} style={{ fontSize: 13 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', marginRight: 4, background: o.value === 'improved' ? '#16a34a' : o.value === 'stable' ? '#0ea5e9' : o.value === 'referred' ? '#d97706' : '#6b7280' }} />
              {o.label}：<b>{o.count}</b>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: 14 }}>
        <button style={tabBtn('list')} onClick={() => { setTab('list'); setSelPatient(null); setSearch(''); }}>出院記錄</button>
        <button style={tabBtn('create')} onClick={() => setTab('create')}>新增出院</button>
        <button style={tabBtn('followup')} onClick={() => setTab('followup')}>跟進追蹤</button>
        <button style={tabBtn('history')} onClick={() => setTab('history')}>病人查詢</button>
      </div>

      {/* === List Tab === */}
      {tab === 'list' && <>
        <div style={{ ...card, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input style={{ ...inp, flex: 1 }} placeholder="搜尋病人或診斷..." value={search} onChange={e => { setSearch(e.target.value); setSelPatient(null); }} />
        </div>
        {filteredRecords.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#888', padding: 40 }}>暫無出院記錄</div>}
        {filteredRecords.map(r => {
          const oc = OUTCOMES.find(o => o.value === r.outcome) || OUTCOMES[0];
          return (
            <div key={r.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{r.patientName} <span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>{r.patientPhone}</span></div>
                <span style={{ background: oc.value === 'improved' ? '#dcfce7' : oc.value === 'stable' ? '#e0f2fe' : oc.value === 'referred' ? '#fef3c7' : '#f3f4f6',
                  color: oc.value === 'improved' ? '#16a34a' : oc.value === 'stable' ? '#0284c7' : oc.value === 'referred' ? '#d97706' : '#6b7280',
                  padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{oc.label}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 20px', fontSize: 13, color: '#555' }}>
                <div><b>出院日期：</b>{r.dischargeDate}</div>
                <div><b>醫師：</b>{r.doctor}</div>
                <div><b>診斷：</b>{r.diagnosis}</div>
                {r.nextReviewDate && <div><b>覆診日期：</b>{r.nextReviewDate}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button style={{ ...btn(ACCENT), padding: '4px 12px', fontSize: 12 }} onClick={() => printSummary(r)}>列印摘要</button>
                {r.dischargeLetter && <button style={{ ...btn('#7c3aed'), padding: '4px 12px', fontSize: 12 }} onClick={() => printLetter(r)}>列印信函</button>}
                <button style={{ ...btn('#ef4444'), padding: '4px 12px', fontSize: 12 }} onClick={() => deleteRecord(r.id)}>刪除</button>
              </div>
            </div>
          );
        })}
      </>}

      {/* === Create Tab === */}
      {tab === 'create' && <>
        {!form ? (
          <div style={card}>
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>選擇病人</label>
            <input style={inp} placeholder="輸入姓名或電話搜尋..." value={search} onChange={e => { setSearch(e.target.value); setSelPatient(null); }} />
            {suggestions.length > 0 && <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
              {suggestions.map(p => <div key={p.id} onClick={() => selectPatient(p)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>{p.name} <span style={{ color: '#888' }}>{p.phone}</span></div>)}
            </div>}
            {selPatient && <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>已選：<b>{selPatient.name}</b></span>
              <button style={btn()} onClick={startCreate}>開始建立出院記錄</button>
            </div>}
          </div>
        ) : (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ color: ACCENT, margin: 0 }}>出院記錄 -- {selPatient.name}</h3>
              <button style={btn('#6b7280')} onClick={() => { setForm(null); setTab('list'); setSelPatient(null); setSearch(''); }}>取消</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>出院日期 *</label><input type="date" style={inp} value={form.dischargeDate} onChange={e => setForm({ ...form, dischargeDate: e.target.value })} /></div>
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>主診醫師</label><select style={inp} value={form.doctor} onChange={e => setForm({ ...form, doctor: e.target.value })}>{doctors.map(d => <option key={d}>{d}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: 10 }}><label style={{ fontSize: 13, fontWeight: 600 }}>診斷 *</label><input style={inp} value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} placeholder="主要診斷" /></div>
            <div style={{ marginBottom: 10 }}><label style={{ fontSize: 13, fontWeight: 600 }}>治療摘要</label><textarea style={{ ...inp, minHeight: 60 }} value={form.treatmentSummary} onChange={e => setForm({ ...form, treatmentSummary: e.target.value })} placeholder="治療經過及方法" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>治療結果</label><select style={inp} value={form.outcome} onChange={e => setForm({ ...form, outcome: e.target.value })}>{OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>下次覆診日期</label><input type="date" style={inp} value={form.nextReviewDate} onChange={e => setForm({ ...form, nextReviewDate: e.target.value })} /></div>
            </div>
            <div style={{ marginBottom: 10 }}><label style={{ fontSize: 13, fontWeight: 600 }}>跟進計劃</label><input style={inp} value={form.followUpPlan} onChange={e => setForm({ ...form, followUpPlan: e.target.value })} placeholder="出院後跟進安排" /></div>
            <div style={{ marginBottom: 10 }}><label style={{ fontSize: 13, fontWeight: 600 }}>持續用藥</label><input style={inp} value={form.medications} onChange={e => setForm({ ...form, medications: e.target.value })} placeholder="出院後需繼續服用的藥物" /></div>
            <div style={{ marginBottom: 10 }}><label style={{ fontSize: 13, fontWeight: 600 }}>生活建議</label><textarea style={{ ...inp, minHeight: 50 }} value={form.lifestyleAdvice} onChange={e => setForm({ ...form, lifestyleAdvice: e.target.value })} placeholder="飲食、運動、作息等建議" /></div>
            <div style={{ marginBottom: 10 }}><label style={{ fontSize: 13, fontWeight: 600 }}>轉介至</label><input style={inp} value={form.referralTo} onChange={e => setForm({ ...form, referralTo: e.target.value })} placeholder="如需轉介，填寫轉介機構/醫師" /></div>

            {/* Checklist */}
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: ACCENT, marginBottom: 8 }}>出院核查清單</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {CHECKLIST_ITEMS.map((item, i) => (
                  <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={checklist[i]} onChange={() => setChecklist(cl => cl.map((c, j) => j === i ? !c : c))} />
                    {item}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>已完成 {checklist.filter(Boolean).length}/{CHECKLIST_ITEMS.length} 項</div>
            </div>

            {/* Discharge Letter */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>出院信函</label>
                <button style={{ ...btn('#7c3aed'), padding: '4px 12px', fontSize: 12 }} onClick={generateLetter}>自動生成</button>
              </div>
              <textarea style={{ ...inp, minHeight: 120, fontFamily: 'monospace', fontSize: 13 }} value={form.dischargeLetter} onChange={e => setForm({ ...form, dischargeLetter: e.target.value })} placeholder="點擊「自動生成」或手動輸入出院信函內容" />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn()} onClick={handleSave}>儲存出院記錄</button>
              <button style={btn('#6b7280')} onClick={() => { setForm(null); setTab('list'); setSelPatient(null); setSearch(''); }}>取消</button>
            </div>
          </div>
        )}
      </>}

      {/* === Follow-up Tab === */}
      {tab === 'followup' && <>
        <div style={{ ...card, padding: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: ACCENT, marginBottom: 8 }}>待跟進出院病人 ({pendingFollowups.length})</div>
          {pendingFollowups.length === 0 && <div style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: 20 }}>目前沒有待跟進的病人</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            {pendingFollowups.length > 0 && <thead><tr style={{ background: '#f0fdfa' }}>
              <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>病人</th>
              <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>覆診日期</th>
              <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>出院日期</th>
              <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>跟進計劃</th>
              <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>狀態</th>
              <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>操作</th>
            </tr></thead>}
            <tbody>{pendingFollowups.map(r => {
              const overdue = r.nextReviewDate < today();
              return (
                <tr key={r.id} style={{ background: overdue ? '#fef2f2' : '#fff' }}>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontWeight: 600 }}>{r.patientName}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>{r.nextReviewDate}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>{r.dischargeDate}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>{r.followUpPlan || '-'}</td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ color: overdue ? '#dc2626' : '#d97706', fontWeight: 600, fontSize: 12 }}>{overdue ? '已過期' : '待覆診'}</span>
                  </td>
                  <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6' }}>
                    <button style={{ ...btn('#16a34a'), padding: '3px 10px', fontSize: 12 }} onClick={() => toggleFollowUp(r.id)}>完成跟進</button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        {/* Completed follow-ups */}
        <div style={{ ...card, padding: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>已完成跟進</div>
          {records.filter(r => r.followUpDone).length === 0 && <div style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: 20 }}>暫無已完成跟進記錄</div>}
          {records.filter(r => r.followUpDone).slice(0, 20).map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span><b>{r.patientName}</b> -- {r.diagnosis}</span>
              <span style={{ color: '#888' }}>跟進於 {r.followUpAt}</span>
            </div>
          ))}
        </div>
      </>}

      {/* === History Tab === */}
      {tab === 'history' && <>
        <div style={card}>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>搜尋病人出院記錄</label>
          <input style={inp} placeholder="輸入姓名或電話..." value={historySearch} onChange={e => { setHistorySearch(e.target.value); setHistoryPatient(null); }} />
          {historySuggestions.length > 0 && <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
            {historySuggestions.map(p => <div key={p.id} onClick={() => { setHistoryPatient(p); setHistorySearch(p.name); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>{p.name} <span style={{ color: '#888' }}>{p.phone}</span></div>)}
          </div>}
        </div>
        {historyPatient && <>
          <div style={{ ...card, background: '#f0fdfa' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: ACCENT }}>{historyPatient.name} <span style={{ fontWeight: 400, fontSize: 13, color: '#888' }}>{historyPatient.phone}</span></div>
            <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>共 {patientHistory.length} 次出院記錄</div>
          </div>
          {patientHistory.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#888' }}>此病人暫無出院記錄</div>}
          {patientHistory.map(r => {
            const oc = OUTCOMES.find(o => o.value === r.outcome) || OUTCOMES[0];
            return (
              <div key={r.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>{r.dischargeDate}</span>
                  <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, fontWeight: 600,
                    background: oc.value === 'improved' ? '#dcfce7' : '#f3f4f6', color: oc.value === 'improved' ? '#16a34a' : '#6b7280' }}>{oc.label}</span>
                </div>
                <div style={{ fontSize: 13, color: '#555' }}><b>診斷：</b>{r.diagnosis}　<b>醫師：</b>{r.doctor}</div>
                {r.treatmentSummary && <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}><b>治療摘要：</b>{r.treatmentSummary}</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button style={{ ...btn(ACCENT), padding: '3px 10px', fontSize: 12 }} onClick={() => printSummary(r)}>列印摘要</button>
                  {r.dischargeLetter && <button style={{ ...btn('#7c3aed'), padding: '3px 10px', fontSize: 12 }} onClick={() => printLetter(r)}>列印信函</button>}
                </div>
              </div>
            );
          })}
        </>}
      </>}
    </div>
  );
}
