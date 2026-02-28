import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const PW_KEY = 'hcmc_pathways';
const AS_KEY = 'hcmc_pathway_assignments';
const loadPW = () => { try { return JSON.parse(localStorage.getItem(PW_KEY) || '[]'); } catch { return []; } };
const savePW = d => localStorage.setItem(PW_KEY, JSON.stringify(d));
const loadAS = () => { try { return JSON.parse(localStorage.getItem(AS_KEY) || '[]'); } catch { return []; } };
const saveAS = d => localStorage.setItem(AS_KEY, JSON.stringify(d));
const ACCENT = '#0e7490';

const DEFAULT_PATHWAYS = [
  { id: 'pw_cold', name: '感冒', condition: '感冒（風寒/風熱）', stages: [
    { name: '急性期', desc: '疏風散寒/清熱，緩解頭痛發熱', duration: '1-3天', treatments: '荊防敗毒散/銀翹散加減；針灸：風池、合谷、列缺', followUp: '每日覆診', outcomes: '體溫恢復正常，頭痛減輕' },
    { name: '緩解期', desc: '扶正祛邪，恢復正氣', duration: '3-5天', treatments: '參蘇飲加減；艾灸足三里、關元', followUp: '隔日覆診', outcomes: '咳嗽減少，食慾恢復' },
    { name: '恢復期', desc: '補氣固表，預防復發', duration: '5-7天', treatments: '玉屏風散；推拿保健', followUp: '一週後覆診', outcomes: '精神恢復，無反覆症狀' },
  ]},
  { id: 'pw_lbp', name: '腰痛', condition: '腰痛（寒濕/腎虛/瘀血）', stages: [
    { name: '止痛期', desc: '活血化瘀，通絡止痛', duration: '1-2週', treatments: '獨活寄生湯加減；針灸：腎俞、委中、環跳、阿是穴', followUp: '每三日覆診', outcomes: 'VAS疼痛評分下降≥50%' },
    { name: '修復期', desc: '舒筋活絡，強筋健骨', duration: '2-4週', treatments: '補腎壯筋湯；推拿手法、拔罐', followUp: '每週覆診', outcomes: '活動範圍改善，日常功能恢復' },
    { name: '鞏固期', desc: '補益肝腎，培元固本', duration: '2-4週', treatments: '六味地黃丸加杜仲、續斷；艾灸腎俞、命門', followUp: '兩週覆診', outcomes: '疼痛基本消失，腰部力量恢復' },
    { name: '預防期', desc: '功能鍛煉，防止復發', duration: '持續', treatments: '八段錦指導；季節性調理', followUp: '每月追蹤', outcomes: '無復發，生活品質良好' },
  ]},
  { id: 'pw_insomnia', name: '失眠', condition: '失眠（心脾兩虛/肝鬱化火/陰虛火旺）', stages: [
    { name: '調理期', desc: '辨證論治，安神定志', duration: '1-2週', treatments: '天王補心丹/歸脾湯/酸棗仁湯；針灸：神門、內關、百會、安眠穴', followUp: '每週覆診', outcomes: '入睡時間縮短，夜醒次數減少' },
    { name: '穩定期', desc: '鞏固療效，調整陰陽', duration: '2-4週', treatments: '方劑微調；耳穴貼壓（心、腎、神門）', followUp: '兩週覆診', outcomes: '睡眠時數≥6小時，日間精神改善' },
    { name: '維持期', desc: '養心安神，建立規律作息', duration: '4-8週', treatments: '膏方調理；生活起居指導', followUp: '每月追蹤', outcomes: '穩定入睡，停藥無反彈' },
  ]},
  { id: 'pw_rhinitis', name: '過敏性鼻炎', condition: '過敏性鼻炎（肺氣虛寒/脾氣虛弱）', stages: [
    { name: '發作期', desc: '疏風通竅，宣肺散寒', duration: '1-2週', treatments: '蒼耳子散合玉屏風散；針灸：迎香、印堂、合谷、風池', followUp: '每週覆診', outcomes: '噴嚏鼻涕減少，鼻塞改善' },
    { name: '緩解期', desc: '健脾益肺，扶正固表', duration: '4-6週', treatments: '補中益氣湯加減；天灸（三伏貼/三九貼）', followUp: '兩週覆診', outcomes: '發作頻率降低≥50%' },
    { name: '預防期', desc: '體質調理，減少復發', duration: '3-6月', treatments: '膏方調理；生活飲食指導', followUp: '每月追蹤', outcomes: '換季不發作或症狀輕微' },
  ]},
  { id: 'pw_dyspepsia', name: '消化不良', condition: '消化不良（脾胃虛弱/食積/肝胃不和）', stages: [
    { name: '消導期', desc: '消食導滯，理氣和胃', duration: '1-2週', treatments: '保和丸/香砂六君子湯；針灸：中脘、足三里、內關', followUp: '每週覆診', outcomes: '腹脹噯氣減輕，食慾改善' },
    { name: '健脾期', desc: '健脾益胃，恢復運化', duration: '2-4週', treatments: '四君子湯加減；艾灸中脘、脾俞', followUp: '兩週覆診', outcomes: '大便成形，消化功能恢復' },
    { name: '調養期', desc: '鞏固脾胃，飲食調護', duration: '4-8週', treatments: '參苓白朮散；食療方案指導', followUp: '每月追蹤', outcomes: '飲食正常，體重穩定' },
  ]},
  { id: 'pw_menses', name: '月經不調', condition: '月經不調（氣滯血瘀/氣血虛弱/腎虛）', stages: [
    { name: '經期調理', desc: '活血調經，緩解經痛', duration: '經期3-7天', treatments: '桃紅四物湯/溫經湯；針灸：關元、三陰交、血海', followUp: '經期覆診', outcomes: '經痛緩解，經量改善' },
    { name: '經後滋養', desc: '滋陰養血，填精益髓', duration: '經後7-10天', treatments: '四物湯加減；食療（當歸紅棗茶）', followUp: '排卵期覆診', outcomes: '面色紅潤，不感疲倦' },
    { name: '經前疏理', desc: '疏肝理氣，健脾化濕', duration: '經前7-10天', treatments: '逍遙散加減；耳穴貼壓', followUp: '經前覆診', outcomes: '乳脹腹脹改善，情緒穩定' },
    { name: '體質鞏固', desc: '調和氣血，穩定週期', duration: '3-6個月', treatments: '膏方調理；經期日記追蹤', followUp: '每月追蹤', outcomes: '週期規律（28±3天），症狀消失' },
  ]},
  { id: 'pw_hypertension', name: '高血壓調理', condition: '高血壓（肝陽上亢/陰虛陽亢/痰濕壅盛）', stages: [
    { name: '平肝降壓', desc: '平肝潛陽，清火熄風', duration: '2-4週', treatments: '天麻鈎藤飲/鎮肝熄風湯；針灸：太衝、曲池、風池、百會', followUp: '每週覆診量血壓', outcomes: '血壓下降10-20mmHg，頭暈改善' },
    { name: '滋陰降火', desc: '滋補肝腎，平衡陰陽', duration: '4-8週', treatments: '杞菊地黃丸加減；耳穴降壓溝', followUp: '兩週覆診', outcomes: '血壓趨穩，減少波動' },
    { name: '化痰祛濕', desc: '健脾化痰，通絡降壓', duration: '4-8週', treatments: '半夏白朮天麻湯；推拿頸肩部', followUp: '兩週覆診', outcomes: '體重下降，血脂改善' },
    { name: '長期管理', desc: '生活調攝，穩定控壓', duration: '持續', treatments: '代茶飲（菊花決明子茶）；運動處方', followUp: '每月追蹤', outcomes: '血壓穩定達標，無靶器官損害' },
  ]},
  { id: 'pw_eczema', name: '濕疹', condition: '濕疹（濕熱蘊膚/脾虛濕蘊/血虛風燥）', stages: [
    { name: '急性期', desc: '清熱利濕，涼血消斑', duration: '1-3週', treatments: '龍膽瀉肝湯/消風散；外洗方（苦參、黃柏）；針灸：曲池、血海、三陰交', followUp: '每週覆診', outcomes: '紅腫滲液減少，瘙癢減輕' },
    { name: '亞急性期', desc: '健脾化濕，養血潤膚', duration: '2-4週', treatments: '除濕胃苓湯/當歸飲子；外用紫雲膏', followUp: '兩週覆診', outcomes: '皮損面積縮小≥50%，結痂脫落' },
    { name: '慢性期', desc: '養血潤燥，調理體質', duration: '4-12週', treatments: '四物消風飲加減；食療（薏仁、山藥粥）', followUp: '每月追蹤', outcomes: '皮膚潤澤，無新發皮損，復發率降低' },
  ]},
];

export default function ClinicalPathway({ data, showToast, user }) {
  const clinicName = getClinicName();
  const patients = data?.patients || [];
  const [customPW, setCustomPW] = useState(loadPW);
  const [assignments, setAssignments] = useState(loadAS);
  const [tab, setTab] = useState('pathways'); // pathways | assign | report | custom
  const [selPW, setSelPW] = useState(null);
  const [search, setSearch] = useState('');
  const [selPatient, setSelPatient] = useState(null);
  const [assignPW, setAssignPW] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const [editAssign, setEditAssign] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customForm, setCustomForm] = useState({ name: '', condition: '', stages: [{ name: '', desc: '', duration: '', treatments: '', followUp: '', outcomes: '' }] });

  const allPW = useMemo(() => [...DEFAULT_PATHWAYS, ...customPW], [customPW]);
  const persistPW = n => { setCustomPW(n); savePW(n); };
  const persistAS = n => { setAssignments(n); saveAS(n); };

  const suggestions = useMemo(() => {
    if (!search || selPatient) return [];
    const q = search.toLowerCase();
    return patients.filter(p => p.name.includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [search, selPatient, patients]);

  const patientAssignments = useMemo(() => {
    if (!selPatient) return [];
    return assignments.filter(a => a.patientId === selPatient.id).sort((a, b) => (b.assignedAt || '').localeCompare(a.assignedAt || ''));
  }, [assignments, selPatient]);

  const reportData = useMemo(() => {
    const total = assignments.length;
    const byPW = {};
    assignments.forEach(a => {
      const pw = allPW.find(p => p.id === a.pathwayId);
      const name = pw?.name || '未知';
      if (!byPW[name]) byPW[name] = { total: 0, completed: 0, active: 0, adherence: [] };
      byPW[name].total++;
      const stages = pw?.stages?.length || 1;
      const pct = Math.round((a.currentStage / stages) * 100);
      byPW[name].adherence.push(pct);
      if (a.currentStage >= stages) byPW[name].completed++;
      else byPW[name].active++;
    });
    Object.values(byPW).forEach(v => { v.avgAdherence = v.adherence.length ? Math.round(v.adherence.reduce((s, x) => s + x, 0) / v.adherence.length) : 0; });
    return { total, byPW };
  }, [assignments, allPW]);

  const handleAssign = () => {
    if (!selPatient || !assignPW) { showToast('請選擇病人和臨床路徑', 'error'); return; }
    const a = { id: uid(), patientId: selPatient.id, patientName: selPatient.name, pathwayId: assignPW, currentStage: 0, notes: [], assignedAt: new Date().toISOString().slice(0, 10), assignedBy: user?.name || '' };
    persistAS([...assignments, a]);
    setAssignPW('');
    showToast('已指派臨床路徑');
  };

  const advanceStage = (aId) => {
    const next = assignments.map(a => {
      if (a.id !== aId) return a;
      const pw = allPW.find(p => p.id === a.pathwayId);
      const max = pw?.stages?.length || 1;
      const newStage = Math.min(a.currentStage + 1, max);
      const note = { stage: a.currentStage, text: progressNote || '進入下一階段', date: new Date().toISOString().slice(0, 10), by: user?.name || '' };
      return { ...a, currentStage: newStage, notes: [...(a.notes || []), note] };
    });
    persistAS(next);
    setProgressNote('');
    setEditAssign(null);
    showToast('已更新階段進度');
  };

  const removeAssignment = id => { persistAS(assignments.filter(a => a.id !== id)); showToast('已移除指派'); };

  const handleSaveCustom = () => {
    if (!customForm.name) { showToast('請輸入路徑名稱', 'error'); return; }
    const validStages = customForm.stages.filter(s => s.name);
    if (!validStages.length) { showToast('請至少填寫一個階段', 'error'); return; }
    const pw = { id: uid(), name: customForm.name, condition: customForm.condition, stages: validStages, custom: true, createdBy: user?.name || '', createdAt: new Date().toISOString().slice(0, 10) };
    persistPW([...customPW, pw]);
    setShowCustom(false);
    setCustomForm({ name: '', condition: '', stages: [{ name: '', desc: '', duration: '', treatments: '', followUp: '', outcomes: '' }] });
    showToast('自訂路徑已建立');
  };

  const deleteCustom = id => { persistPW(customPW.filter(p => p.id !== id)); showToast('已刪除自訂路徑'); };

  const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #e5e7eb' };
  const btn = (bg = ACCENT) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 14 });
  const inp = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' };
  const tabBtn = (active) => ({ padding: '8px 18px', border: 'none', borderBottom: active ? `3px solid ${ACCENT}` : '3px solid transparent', background: 'none', color: active ? ACCENT : '#6b7280', fontWeight: active ? 700 : 500, cursor: 'pointer', fontSize: 14 });

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ color: ACCENT, marginBottom: 4 }}>臨床路徑管理</h2>
      <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0, marginBottom: 12 }}>{clinicName} — 中醫標準化診療路徑</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        {[['pathways', '路徑總覽'], ['assign', '指派管理'], ['report', '依從報告'], ['custom', '自訂路徑']].map(([k, l]) => (
          <button key={k} style={tabBtn(tab === k)} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* ===== Tab: Pathway Overview ===== */}
      {tab === 'pathways' && <>
        {selPW ? (() => {
          const pw = allPW.find(p => p.id === selPW);
          if (!pw) return null;
          return <div>
            <button style={{ ...btn('#6b7280'), marginBottom: 12, padding: '5px 14px', fontSize: 13 }} onClick={() => setSelPW(null)}>← 返回列表</button>
            <div style={card}>
              <h3 style={{ color: ACCENT, marginTop: 0 }}>{pw.name}{pw.custom && <span style={{ fontSize: 12, color: '#d97706', marginLeft: 8 }}>自訂</span>}</h3>
              <p style={{ color: '#374151', fontSize: 14, margin: '4px 0 12px' }}><b>適應症：</b>{pw.condition}</p>
              <div style={{ position: 'relative', paddingLeft: 20 }}>
                {pw.stages.map((s, i) => (
                  <div key={i} style={{ position: 'relative', paddingBottom: i < pw.stages.length - 1 ? 20 : 0, marginBottom: 8 }}>
                    <div style={{ position: 'absolute', left: -20, top: 2, width: 14, height: 14, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700 }}>{i + 1}</div>
                    {i < pw.stages.length - 1 && <div style={{ position: 'absolute', left: -14, top: 18, width: 2, height: 'calc(100% - 6px)', background: '#d1d5db' }} />}
                    <div style={{ background: '#f0fdfa', borderRadius: 8, padding: 12, border: `1px solid ${ACCENT}22` }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{s.name}<span style={{ fontWeight: 400, color: '#6b7280', fontSize: 13, marginLeft: 8 }}>{s.duration}</span></div>
                      <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{s.desc}</div>
                      <div style={{ fontSize: 13, marginBottom: 2 }}><b>治療方案：</b>{s.treatments}</div>
                      <div style={{ fontSize: 13, marginBottom: 2 }}><b>覆診安排：</b>{s.followUp}</div>
                      <div style={{ fontSize: 13 }}><b>預期成效：</b>{s.outcomes}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>;
        })() : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
            {allPW.map(pw => (
              <div key={pw.id} style={{ ...card, cursor: 'pointer', transition: 'box-shadow .2s' }} onClick={() => setSelPW(pw.id)}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(14,116,144,.18)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.08)'}>
                <div style={{ fontWeight: 700, fontSize: 16, color: ACCENT, marginBottom: 4 }}>{pw.name}{pw.custom && <span style={{ fontSize: 11, color: '#d97706', marginLeft: 6 }}>自訂</span>}</div>
                <div style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>{pw.condition}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{pw.stages.length} 個階段</div>
              </div>
            ))}
          </div>
        )}
      </>}

      {/* ===== Tab: Assign ===== */}
      {tab === 'assign' && <>
        {!selPatient ? (
          <div style={card}>
            <label style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>搜尋病人</label>
            <input style={inp} placeholder="輸入姓名或電話..." value={search} onChange={e => { setSearch(e.target.value); setSelPatient(null); }} />
            {suggestions.length > 0 && <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
              {suggestions.map(p => <div key={p.id} onClick={() => { setSelPatient(p); setSearch(p.name); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}>{p.name}　<span style={{ color: '#888', fontSize: 13 }}>{p.phone}</span></div>)}
            </div>}
          </div>
        ) : (
          <div>
            <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div><b>病人：</b>{selPatient.name}　<span style={{ color: '#888' }}>{selPatient.phone}</span></div>
              <button style={btn('#6b7280')} onClick={() => { setSelPatient(null); setSearch(''); }}>返回搜尋</button>
            </div>

            {/* Assign new pathway */}
            <div style={{ ...card, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>選擇臨床路徑</label>
                <select style={inp} value={assignPW} onChange={e => setAssignPW(e.target.value)}>
                  <option value="">-- 請選擇 --</option>
                  {allPW.map(pw => <option key={pw.id} value={pw.id}>{pw.name}（{pw.stages.length}階段）</option>)}
                </select>
              </div>
              <button style={btn()} onClick={handleAssign}>指派路徑</button>
            </div>

            {/* Existing assignments */}
            {patientAssignments.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#888' }}>此病人尚未指派任何臨床路徑</div>}
            {patientAssignments.map(a => {
              const pw = allPW.find(p => p.id === a.pathwayId);
              if (!pw) return null;
              const total = pw.stages.length;
              const done = a.currentStage >= total;
              const pct = Math.round((a.currentStage / total) * 100);
              const currentStageName = done ? '已完成' : pw.stages[a.currentStage]?.name || '';
              return (
                <div key={a.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: ACCENT }}>{pw.name}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ background: done ? '#dcfce7' : '#ecfdf5', color: done ? '#16a34a' : ACCENT, padding: '2px 10px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>{done ? '已完成' : `第${a.currentStage + 1}階段：${currentStageName}`}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>指派日期：{a.assignedAt}　指派人：{a.assignedBy}</div>

                  {/* Progress bar */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span>進度：{a.currentStage}/{total}</span><span>{pct}%</span>
                    </div>
                    <div style={{ background: '#e5e7eb', borderRadius: 8, height: 8 }}>
                      <div style={{ width: pct + '%', background: done ? '#16a34a' : ACCENT, height: 8, borderRadius: 8, transition: 'width .3s' }} />
                    </div>
                  </div>

                  {/* Stage mini-timeline */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
                    {pw.stages.map((s, i) => (
                      <div key={i} style={{ padding: '3px 10px', borderRadius: 12, fontSize: 12, background: i < a.currentStage ? '#dcfce7' : i === a.currentStage && !done ? ACCENT + '22' : '#f3f4f6', color: i < a.currentStage ? '#16a34a' : i === a.currentStage && !done ? ACCENT : '#9ca3af', fontWeight: i === a.currentStage && !done ? 700 : 400, border: i === a.currentStage && !done ? `1px solid ${ACCENT}` : '1px solid transparent' }}>
                        {s.name}
                      </div>
                    ))}
                  </div>

                  {/* Notes history */}
                  {a.notes?.length > 0 && <div style={{ background: '#fafafa', borderRadius: 6, padding: 8, marginBottom: 8, maxHeight: 120, overflowY: 'auto' }}>
                    {a.notes.map((n, i) => <div key={i} style={{ fontSize: 12, marginBottom: 3, color: '#374151' }}><span style={{ color: '#9ca3af' }}>{n.date}</span>　{n.text}<span style={{ color: '#9ca3af', marginLeft: 6 }}>— {n.by}</span></div>)}
                  </div>}

                  {/* Actions */}
                  {!done && <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    {editAssign === a.id ? <>
                      <input style={{ ...inp, flex: 1, minWidth: 180 }} placeholder="進度備註..." value={progressNote} onChange={e => setProgressNote(e.target.value)} />
                      <button style={btn('#16a34a')} onClick={() => advanceStage(a.id)}>確認推進</button>
                      <button style={btn('#6b7280')} onClick={() => { setEditAssign(null); setProgressNote(''); }}>取消</button>
                    </> : <>
                      <button style={btn()} onClick={() => setEditAssign(a.id)}>推進至下一階段</button>
                      <button style={{ ...btn('#ef4444'), padding: '5px 12px', fontSize: 13 }} onClick={() => removeAssignment(a.id)}>移除</button>
                    </>}
                  </div>}
                </div>
              );
            })}
          </div>
        )}
      </>}

      {/* ===== Tab: Report ===== */}
      {tab === 'report' && <>
        <div style={card}>
          <h3 style={{ color: ACCENT, marginTop: 0, marginBottom: 12 }}>路徑依從性報告</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#f0fdfa', borderRadius: 8, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: ACCENT }}>{reportData.total}</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>總指派數</div>
            </div>
            <div style={{ background: '#f0fdf4', borderRadius: 8, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{Object.values(reportData.byPW).reduce((s, v) => s + v.completed, 0)}</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>已完成</div>
            </div>
            <div style={{ background: '#fefce8', borderRadius: 8, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#d97706' }}>{Object.values(reportData.byPW).reduce((s, v) => s + v.active, 0)}</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>進行中</div>
            </div>
          </div>

          {Object.keys(reportData.byPW).length === 0 && <div style={{ textAlign: 'center', color: '#888', padding: 24 }}>暫無數據，請先指派臨床路徑</div>}

          {Object.entries(reportData.byPW).map(([name, v]) => (
            <div key={name} style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{name}</span>
                <span style={{ fontSize: 13, color: '#6b7280' }}>共 {v.total} 例（完成 {v.completed}，進行中 {v.active}）</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 6, height: 8 }}>
                  <div style={{ width: v.avgAdherence + '%', background: v.avgAdherence >= 70 ? '#16a34a' : v.avgAdherence >= 40 ? '#d97706' : '#ef4444', height: 8, borderRadius: 6, transition: 'width .3s' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: v.avgAdherence >= 70 ? '#16a34a' : v.avgAdherence >= 40 ? '#d97706' : '#ef4444' }}>{v.avgAdherence}%</span>
              </div>
            </div>
          ))}
        </div>
      </>}

      {/* ===== Tab: Custom ===== */}
      {tab === 'custom' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>自訂臨床路徑</span>
          <button style={btn()} onClick={() => setShowCustom(true)}>＋ 新增路徑</button>
        </div>
        {customPW.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#888' }}>尚未建立自訂路徑</div>}
        {customPW.map(pw => (
          <div key={pw.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><span style={{ fontWeight: 700, color: ACCENT, fontSize: 16 }}>{pw.name}</span><span style={{ color: '#6b7280', fontSize: 13, marginLeft: 8 }}>{pw.condition}</span></div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...btn(ACCENT), padding: '4px 12px', fontSize: 13 }} onClick={() => setSelPW(pw.id) || setTab('pathways')}>查看</button>
                <button style={{ ...btn('#ef4444'), padding: '4px 12px', fontSize: 13 }} onClick={() => deleteCustom(pw.id)}>刪除</button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{pw.stages.length} 個階段　建立者：{pw.createdBy}　{pw.createdAt}</div>
          </div>
        ))}

        {/* Create custom pathway modal */}
        {showCustom && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '95%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ color: ACCENT, marginTop: 0 }}>新增自訂臨床路徑</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>路徑名稱 *</label><input style={inp} value={customForm.name} onChange={e => setCustomForm({ ...customForm, name: e.target.value })} placeholder="如：頸椎病" /></div>
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>適應症</label><input style={inp} value={customForm.condition} onChange={e => setCustomForm({ ...customForm, condition: e.target.value })} placeholder="如：頸椎病（氣滯血瘀型）" /></div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>階段設定</label>
                {customForm.stages.map((s, i) => (
                  <div key={i} style={{ background: '#fafafa', borderRadius: 8, padding: 12, marginBottom: 8, border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>第 {i + 1} 階段</span>
                      {customForm.stages.length > 1 && <button style={{ ...btn('#ef4444'), padding: '2px 8px', fontSize: 12 }} onClick={() => setCustomForm({ ...customForm, stages: customForm.stages.filter((_, j) => j !== i) })}>移除</button>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <input style={inp} placeholder="階段名稱 *" value={s.name} onChange={e => { const st = [...customForm.stages]; st[i] = { ...st[i], name: e.target.value }; setCustomForm({ ...customForm, stages: st }); }} />
                      <input style={inp} placeholder="預計時長" value={s.duration} onChange={e => { const st = [...customForm.stages]; st[i] = { ...st[i], duration: e.target.value }; setCustomForm({ ...customForm, stages: st }); }} />
                    </div>
                    <textarea style={{ ...inp, marginTop: 6, minHeight: 36 }} placeholder="描述" value={s.desc} onChange={e => { const st = [...customForm.stages]; st[i] = { ...st[i], desc: e.target.value }; setCustomForm({ ...customForm, stages: st }); }} />
                    <textarea style={{ ...inp, marginTop: 6, minHeight: 36 }} placeholder="治療方案（中藥/針灸）" value={s.treatments} onChange={e => { const st = [...customForm.stages]; st[i] = { ...st[i], treatments: e.target.value }; setCustomForm({ ...customForm, stages: st }); }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                      <input style={inp} placeholder="覆診安排" value={s.followUp} onChange={e => { const st = [...customForm.stages]; st[i] = { ...st[i], followUp: e.target.value }; setCustomForm({ ...customForm, stages: st }); }} />
                      <input style={inp} placeholder="預期成效" value={s.outcomes} onChange={e => { const st = [...customForm.stages]; st[i] = { ...st[i], outcomes: e.target.value }; setCustomForm({ ...customForm, stages: st }); }} />
                    </div>
                  </div>
                ))}
                <button style={{ ...btn('#6b7280'), padding: '4px 12px', fontSize: 13 }} onClick={() => setCustomForm({ ...customForm, stages: [...customForm.stages, { name: '', desc: '', duration: '', treatments: '', followUp: '', outcomes: '' }] })}>＋ 增加階段</button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button style={btn('#6b7280')} onClick={() => { setShowCustom(false); setCustomForm({ name: '', condition: '', stages: [{ name: '', desc: '', duration: '', treatments: '', followUp: '', outcomes: '' }] }); }}>取消</button>
              <button style={btn()} onClick={handleSaveCustom}>建立路徑</button>
            </div>
          </div>
        </div>}
      </>}
    </div>
  );
}
