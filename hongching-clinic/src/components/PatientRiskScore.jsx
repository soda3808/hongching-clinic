import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_risk_scores';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const save = (arr) => localStorage.setItem(LS_KEY, JSON.stringify(arr));

const ACCENT = '#0e7490';
const ACCENT_LIGHT = '#f0fdfa';
const RED = '#dc2626';
const ORANGE = '#ea580c';
const YELLOW = '#ca8a04';
const GREEN = '#16a34a';
const GRAY = '#6b7280';

const card = { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.1)' };
const btn = { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 500 };
const btnOut = { ...btn, background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}` };
const inp = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };

const CHRONIC = ['糖尿病', '高血壓', '心臟病', '中風', '腎病', '哮喘', '關節炎', '痛風', '甲狀腺疾病', '肝病'];
const LIFE_OPTS = { smoking: '吸煙', alcohol: '飲酒', noExercise: '缺乏運動' };
const FACTOR_LABELS = [
  ['age', '年齡風險'], ['chronic', '慢性病'], ['allergy', '過敏史'],
  ['med', '用藥複雜度'], ['compliance', '覆診依從性'], ['lifestyle', '生活習慣'],
];

function riskLevel(score) {
  if (score <= 30) return { label: '低風險', color: GREEN, bg: '#f0fdf4' };
  if (score <= 60) return { label: '中風險', color: YELLOW, bg: '#fefce8' };
  if (score <= 80) return { label: '高風險', color: ORANGE, bg: '#fff7ed' };
  return { label: '極高風險', color: RED, bg: '#fef2f2' };
}

function calcScore(a) {
  const age = a.age > 65 ? 10 : a.age > 50 ? 5 : 1;
  const chronic = Math.min(10, (a.chronic || []).length * 3);
  const allergy = Math.min(10, (a.allergyCount || 0) * 2);
  const med = Math.min(10, (a.medCount || 0) * 2);
  const compliance = 10 - Math.min(10, Math.round((a.complianceRate || 0) / 10));
  let life = 0;
  if (a.smoking) life += 4;
  if (a.alcohol) life += 3;
  if (a.noExercise) life += 3;
  const total = Math.min(100, Math.round((age + chronic + allergy + med + compliance + life) / 60 * 100));
  return { age, chronic, allergy, med, compliance, lifestyle: life, total };
}

const EMPTY = { age: '', chronic: [], allergyCount: 0, medCount: 0, complianceRate: 100, smoking: false, alcohol: false, noExercise: false };

export default function PatientRiskScore({ data, showToast, user }) {
  const clinicName = getClinicName();
  const patients = data?.patients || [];
  const [records, setRecords] = useState(load);
  const [search, setSearch] = useState('');
  const [selPatient, setSelPatient] = useState(null);
  const [showDD, setShowDD] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('assess');

  const persist = (next) => { setRecords(next); save(next); };

  const matched = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return patients.filter(p =>
      (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)
    ).slice(0, 10);
  }, [search, patients]);

  const currentRec = useMemo(() => {
    return selPatient ? records.find(r => r.patientId === selPatient.id) || null : null;
  }, [selPatient, records]);

  const dashboard = useMemo(() => {
    const d = { low: 0, med: 0, high: 0, critical: 0 };
    records.forEach(r => {
      const s = r.totalScore || 0;
      if (s <= 30) d.low++; else if (s <= 60) d.med++;
      else if (s <= 80) d.high++; else d.critical++;
    });
    return d;
  }, [records]);

  const highRiskList = useMemo(() =>
    records.filter(r => (r.totalScore || 0) > 60).sort((a, b) => b.totalScore - a.totalScore),
  [records]);

  function selectPatient(p) {
    setSelPatient(p); setSearch(p.name); setShowDD(false);
    const ex = records.find(r => r.patientId === p.id);
    if (ex) {
      setForm({ age: ex.age, chronic: ex.chronic || [], allergyCount: ex.allergyCount || 0,
        medCount: ex.medCount || 0, complianceRate: ex.complianceRate ?? 100,
        smoking: ex.smoking || false, alcohol: ex.alcohol || false, noExercise: ex.noExercise || false });
      setEditing(false);
    } else {
      const age = p.dob ? Math.floor((Date.now() - new Date(p.dob).getTime()) / 31557600000) : '';
      setForm({ ...EMPTY, age }); setEditing(true);
    }
  }

  function handleSave() {
    if (!form.age || isNaN(form.age)) { showToast && showToast('請輸入年齡', 'error'); return; }
    const scores = calcScore(form);
    const rec = {
      id: currentRec?.id || uid(), patientId: selPatient.id, patientName: selPatient.name,
      ...form, age: Number(form.age), scores, totalScore: scores.total,
      updatedAt: new Date().toISOString().slice(0, 10), updatedBy: user?.name || 'staff',
    };
    persist(currentRec ? records.map(r => r.id === rec.id ? rec : r) : [...records, rec]);
    setEditing(false);
    showToast && showToast('已保存風險評估');
  }

  function handleDelete() {
    if (!currentRec) return;
    persist(records.filter(r => r.id !== currentRec.id));
    setSelPatient(null); setSearch(''); setForm({ ...EMPTY });
    showToast && showToast('已刪除評估記錄');
  }

  function printReport() {
    const r = currentRec; if (!r) return;
    const rl = riskLevel(r.totalScore);
    const rows = FACTOR_LABELS.map(([k, l]) =>
      `<tr><td>${l}</td><td>${r.scores[k]}/10</td><td><div class="bar"><div class="fill" style="width:${r.scores[k]*10}%"></div></div></td></tr>`
    ).join('');
    const lifeStr = [r.smoking && '吸煙', r.alcohol && '飲酒', r.noExercise && '缺乏運動'].filter(Boolean).join('、') || '無';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>風險評估報告</title>
<style>body{font-family:sans-serif;padding:30px;max-width:700px;margin:0 auto}
h1{color:${ACCENT};font-size:20px}h2{font-size:16px;margin-top:24px;color:#333}
.badge{display:inline-block;padding:4px 14px;border-radius:12px;font-weight:700;color:#fff;background:${rl.color}}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #e5e7eb}
th{background:#f9fafb;font-size:13px;color:#555}
.bar{height:10px;border-radius:4px;background:#e5e7eb}
.fill{height:10px;border-radius:4px;background:${ACCENT}}
.footer{margin-top:30px;font-size:12px;color:#999}</style></head>
<body><h1>${clinicName} - 患者風險評估報告</h1>
<p><b>患者：</b>${r.patientName}　<b>年齡：</b>${r.age}歲　<b>評估日期：</b>${r.updatedAt}</p>
<p>整體風險分數：<b style="font-size:22px;color:${rl.color}">${r.totalScore}</b>/100　<span class="badge">${rl.label}</span></p>
<h2>各項風險因子</h2><table><tr><th>因子</th><th>分數</th><th>比例</th></tr>${rows}</table>
<h2>詳細資料</h2>
<p><b>慢性病：</b>${(r.chronic || []).join('、') || '無'}</p>
<p><b>已知過敏數：</b>${r.allergyCount}　<b>同時用藥數：</b>${r.medCount}</p>
<p><b>覆診出席率：</b>${r.complianceRate}%</p>
<p><b>生活習慣風險：</b>${lifeStr}</p>
<div class="footer"><p>評估者：${r.updatedBy}　列印日期：${new Date().toISOString().slice(0, 10)}</p>
<p>${clinicName} 風險評估系統 - 僅供臨床參考</p></div></body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close(); w.print();
  }

  const previewScore = useMemo(() => {
    return (form.age && !isNaN(form.age)) ? calcScore(form) : null;
  }, [form]);

  const tabs = [['assess', '風險評估'], ['dashboard', '風險總覽'], ['alerts', '高風險警示']];

  function ScoreBar({ label, value, max = 10 }) {
    const pct = Math.round((value / max) * 100);
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
          <span style={{ color: '#374151' }}>{label}</span>
          <span style={{ fontWeight: 600 }}>{value}/{max}</span>
        </div>
        <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4 }}>
          <div style={{ height: 8, borderRadius: 4, width: `${pct}%`, transition: 'width .3s',
            background: pct > 70 ? RED : pct > 40 ? ORANGE : ACCENT }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: 16 }}>
      <h2 style={{ color: ACCENT, marginBottom: 4, fontSize: 20 }}>患者風險評估</h2>
      <p style={{ color: GRAY, fontSize: 13, marginTop: 0, marginBottom: 14 }}>{clinicName} - 自動化風險評分系統</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ ...btn, background: tab === k ? ACCENT : '#fff', color: tab === k ? '#fff' : ACCENT,
              border: `1px solid ${ACCENT}` }}>{l}</button>
        ))}
      </div>

      {/* ── Assess Tab ── */}
      {tab === 'assess' && <>
        <div style={{ ...card, position: 'relative' }}>
          <label style={{ fontSize: 13, color: GRAY, marginBottom: 4, display: 'block' }}>搜尋患者</label>
          <input style={inp} placeholder="輸入患者姓名或電話..." value={search}
            onChange={e => { setSearch(e.target.value); setShowDD(true);
              if (selPatient && e.target.value !== selPatient.name) setSelPatient(null); }}
            onFocus={() => setShowDD(true)} />
          {showDD && matched.length > 0 && !selPatient && (
            <div style={{ position: 'absolute', left: 16, right: 16, top: '100%', background: '#fff',
              border: '1px solid #d1d5db', borderRadius: 6, zIndex: 20, maxHeight: 220, overflowY: 'auto',
              boxShadow: '0 4px 12px rgba(0,0,0,.12)' }}>
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

        {selPatient && <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 17 }}>{selPatient.name}
              {selPatient.phone && <span style={{ color: GRAY, fontSize: 13, marginLeft: 8 }}>{selPatient.phone}</span>}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {!editing && <button style={btn} onClick={() => setEditing(true)}>編輯評估</button>}
              {!editing && currentRec && <button style={btnOut} onClick={printReport}>列印報告</button>}
              {!editing && currentRec && <button style={{ ...btn, background: RED }} onClick={handleDelete}>刪除</button>}
            </div>
          </div>

          {/* Score display card */}
          {currentRec && !editing && (() => {
            const rl = riskLevel(currentRec.totalScore);
            return (
              <div style={{ ...card, borderLeft: `4px solid ${rl.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 28, fontWeight: 700, color: rl.color }}>{currentRec.totalScore}</span>
                    <span style={{ fontSize: 14, color: GRAY, marginLeft: 4 }}>/100</span>
                    <span style={{ display: 'inline-block', marginLeft: 12, padding: '3px 12px', borderRadius: 12,
                      fontSize: 13, fontWeight: 600, color: '#fff', background: rl.color }}>{rl.label}</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>更新：{currentRec.updatedAt} / {currentRec.updatedBy}</span>
                </div>
                {FACTOR_LABELS.map(([k, l]) => <ScoreBar key={k} label={l} value={currentRec.scores[k]} />)}
                <div style={{ marginTop: 12, fontSize: 13, padding: '8px 12px', background: ACCENT_LIGHT, borderRadius: 6 }}>
                  <div><span style={{ color: ACCENT, fontWeight: 500 }}>慢性病：</span>{(currentRec.chronic || []).join('、') || '無'}</div>
                  <div>
                    <span style={{ color: ACCENT, fontWeight: 500 }}>過敏數：</span>{currentRec.allergyCount}
                    <span style={{ color: ACCENT, fontWeight: 500 }}>用藥數：</span>{currentRec.medCount}
                    <span style={{ color: ACCENT, fontWeight: 500 }}>出席率：</span>{currentRec.complianceRate}%
                  </div>
                  <div><span style={{ color: ACCENT, fontWeight: 500 }}>生活習慣：</span>
                    {[currentRec.smoking && '吸煙', currentRec.alcohol && '飲酒', currentRec.noExercise && '缺乏運動'].filter(Boolean).join('、') || '無特殊風險'}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Edit form */}
          {editing && (
            <div style={{ ...card, border: `2px solid ${ACCENT}` }}>
              <h4 style={{ margin: '0 0 12px', color: ACCENT, fontSize: 16 }}>風險因子評估</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {[['age', '年齡', '歲'], ['allergyCount', '已知過敏數量', ''], ['medCount', '同時用藥數量', ''], ['complianceRate', '覆診出席率 (%)', '']].map(([k, l, ph]) => (
                  <div key={k} style={{ flex: '0 0 48%' }}>
                    <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 3 }}>{l}</label>
                    <input style={inp} type="number" value={form[k]} placeholder={ph}
                      min={k === 'complianceRate' ? 0 : undefined} max={k === 'complianceRate' ? 100 : undefined}
                      onChange={e => setForm(f => ({ ...f, [k]: k === 'age' ? e.target.value
                        : k === 'complianceRate' ? Math.min(100, Math.max(0, Number(e.target.value) || 0))
                        : Number(e.target.value) || 0 }))} />
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 6 }}>慢性病（可多選）</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CHRONIC.map(c => {
                    const on = form.chronic.includes(c);
                    return (
                      <button key={c} onClick={() => setForm(f => ({ ...f, chronic: on ? f.chronic.filter(x => x !== c) : [...f.chronic, c] }))}
                        style={{ padding: '4px 12px', borderRadius: 14, fontSize: 13, cursor: 'pointer',
                          border: `1px solid ${on ? ACCENT : '#d1d5db'}`, background: on ? ACCENT : '#fff',
                          color: on ? '#fff' : '#374151' }}>{c}</button>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 6 }}>生活習慣風險</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  {Object.entries(LIFE_OPTS).map(([k, l]) => (
                    <label key={k} style={{ fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="checkbox" checked={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))} /> {l}
                    </label>
                  ))}
                </div>
              </div>

              {previewScore && (
                <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 6,
                  background: riskLevel(previewScore.total).bg,
                  border: `1px solid ${riskLevel(previewScore.total).color}30` }}>
                  <span style={{ fontWeight: 600, color: riskLevel(previewScore.total).color }}>
                    預覽分數：{previewScore.total}/100 - {riskLevel(previewScore.total).label}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button style={btn} onClick={handleSave}>保存評估</button>
                <button style={{ ...btn, background: GRAY }}
                  onClick={() => { setEditing(false); if (!currentRec) { setSelPatient(null); setSearch(''); } }}>取消</button>
              </div>
            </div>
          )}
        </>}
      </>}

      {/* ── Dashboard Tab ── */}
      {tab === 'dashboard' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[{ l: '低風險', v: dashboard.low, c: GREEN }, { l: '中風險', v: dashboard.med, c: YELLOW },
              { l: '高風險', v: dashboard.high, c: ORANGE }, { l: '極高風險', v: dashboard.critical, c: RED }].map(d => (
              <div key={d.l} style={{ ...card, textAlign: 'center', borderTop: `3px solid ${d.c}` }}>
                <div style={{ fontSize: 13, color: GRAY }}>{d.l}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: d.c }}>{d.v}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>位患者</div>
              </div>
            ))}
          </div>
          <div style={card}>
            <h4 style={{ margin: '0 0 10px', color: ACCENT, fontSize: 15 }}>風險分布</h4>
            {records.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#9ca3af' }}>暫無評估記錄</div>
            ) : (
              <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden' }}>
                {[{ v: dashboard.low, c: GREEN }, { v: dashboard.med, c: YELLOW },
                  { v: dashboard.high, c: ORANGE }, { v: dashboard.critical, c: RED }]
                  .filter(d => d.v > 0).map((d, i) => (
                    <div key={i} style={{ flex: d.v, background: d.c, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 600 }}>{d.v}</div>
                  ))}
              </div>
            )}
            <div style={{ fontSize: 13, color: GRAY, marginTop: 10 }}>已評估患者總數：{records.length}</div>
          </div>
        </div>
      )}

      {/* ── Alerts Tab ── */}
      {tab === 'alerts' && (
        <div>
          <div style={{ ...card, background: highRiskList.length > 0 ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${highRiskList.length > 0 ? '#fecaca' : '#bbf7d0'}` }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: highRiskList.length > 0 ? RED : GREEN }}>
              {highRiskList.length > 0
                ? `${highRiskList.length} 位高風險/極高風險患者需要關注`
                : '目前沒有高風險患者警示'}
            </span>
          </div>
          {highRiskList.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: 40, color: '#9ca3af' }}>所有患者風險評分均在安全範圍內</div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {highRiskList.map(r => {
                const rl = riskLevel(r.totalScore);
                return (
                  <div key={r.id} style={{ ...card, borderLeft: `4px solid ${rl.color}`, cursor: 'pointer' }}
                    onClick={() => { const p = patients.find(x => x.id === r.patientId); if (p) { selectPatient(p); setTab('assess'); } }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{r.patientName}</span>
                        <span style={{ marginLeft: 10, padding: '2px 10px', borderRadius: 10, fontSize: 12,
                          fontWeight: 600, color: '#fff', background: rl.color }}>{rl.label}</span>
                      </div>
                      <span style={{ fontSize: 22, fontWeight: 700, color: rl.color }}>{r.totalScore}</span>
                    </div>
                    <div style={{ fontSize: 12, color: GRAY, marginTop: 4 }}>
                      慢性病：{(r.chronic || []).join('、') || '無'}　|　用藥數：{r.medCount}　|　更新：{r.updatedAt}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
