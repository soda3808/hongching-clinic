import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const REG_KEY = 'hcmc_chronic_registry';
const NOTE_KEY = 'hcmc_chronic_notes';
const loadReg = () => { try { return JSON.parse(localStorage.getItem(REG_KEY)) || []; } catch { return []; } };
const saveReg = (d) => localStorage.setItem(REG_KEY, JSON.stringify(d));
const loadNotes = () => { try { return JSON.parse(localStorage.getItem(NOTE_KEY)) || []; } catch { return []; } };
const saveNotes = (d) => localStorage.setItem(NOTE_KEY, JSON.stringify(d));

const ACCENT = '#0e7490';
const ACCENT_LIGHT = '#f0fdfa';
const RED = '#dc2626';
const GREEN = '#16a34a';
const ORANGE = '#d97706';
const GRAY = '#6b7280';
const CONDITIONS = ['高血壓', '糖尿病', '高血脂', '痛風', '哮喘', '濕疹', '失眠', '頸腰痛', '過敏性鼻炎', '胃病'];
const FREQ = { weekly: '每週', biweekly: '每兩週', monthly: '每月', quarterly: '每季' };
const FREQ_DAYS = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 90 };
const SEVERITY = { mild: '輕度', moderate: '中度', severe: '重度' };
const SEV_COLOR = { mild: GREEN, moderate: ORANGE, severe: RED };

const card = { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.1)' };
const btn = { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 500 };
const btnOut = { ...btn, background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}` };
const btnSm = { ...btn, padding: '4px 12px', fontSize: 13 };
const btnDanger = { ...btnSm, background: RED };
const inp = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const sel = { ...inp, background: '#fff' };
const label = { fontSize: 13, color: GRAY, marginBottom: 2, display: 'block' };
const badge = (bg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 12, color: '#fff', background: bg, marginRight: 4 });

const today = () => new Date().toISOString().slice(0, 10);
const daysDiff = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

export default function ChronicDiseaseTracker({ data, showToast, user }) {
  const clinicName = getClinicName();
  const patients = data?.patients || [];
  const [registry, setRegistry] = useState(loadReg);
  const [notes, setNotes] = useState(loadNotes);
  const [tab, setTab] = useState('list'); // list | add | stats | alerts
  const [search, setSearch] = useState('');
  const [selPatient, setSelPatient] = useState(null);
  const [filterCond, setFilterCond] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(null); // regId
  const [noteText, setNoteText] = useState('');
  const [noteScore, setNoteScore] = useState(5);
  const [form, setForm] = useState({ patientId: '', condition: CONDITIONS[0], since: today(), severity: 'moderate', treatment: '', frequency: 'monthly' });

  const persistReg = (next) => { setRegistry(next); saveReg(next); };
  const persistNotes = (next) => { setNotes(next); saveNotes(next); };

  const suggestions = useMemo(() => {
    if (!search || selPatient) return [];
    const q = search.toLowerCase();
    return patients.filter(p => p.name?.includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [search, selPatient, patients]);

  const filtered = useMemo(() => {
    let list = registry;
    if (filterCond) list = list.filter(r => r.condition === filterCond);
    if (selPatient) list = list.filter(r => r.patientId === selPatient.id);
    return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [registry, filterCond, selPatient]);

  const alerts = useMemo(() => {
    const overdue = [];
    const worsening = [];
    registry.forEach(r => {
      const lastNote = notes.filter(n => n.regId === r.id).sort((a, b) => b.date.localeCompare(a.date))[0];
      const lastDate = lastNote?.date || r.createdAt;
      const diff = daysDiff(lastDate);
      const freqDays = FREQ_DAYS[r.frequency] || 30;
      if (diff > freqDays) overdue.push({ ...r, overdueDays: diff - freqDays, lastDate });
      const rNotes = notes.filter(n => n.regId === r.id).sort((a, b) => a.date.localeCompare(b.date));
      if (rNotes.length >= 2) {
        const last = rNotes[rNotes.length - 1].score;
        const prev = rNotes[rNotes.length - 2].score;
        if (last > prev + 1) worsening.push({ ...r, prevScore: prev, curScore: last });
      }
    });
    return { overdue, worsening };
  }, [registry, notes]);

  const stats = useMemo(() => {
    const condCount = {};
    CONDITIONS.forEach(c => { condCount[c] = registry.filter(r => r.condition === c).length; });
    const sorted = Object.entries(condCount).sort((a, b) => b[1] - a[1]).filter(e => e[1] > 0);
    let improved = 0, total = 0;
    registry.forEach(r => {
      const rNotes = notes.filter(n => n.regId === r.id).sort((a, b) => a.date.localeCompare(b.date));
      if (rNotes.length >= 2) {
        total++;
        if (rNotes[rNotes.length - 1].score < rNotes[0].score) improved++;
      }
    });
    return { condCount: sorted, totalPatients: new Set(registry.map(r => r.patientId)).size, totalRecords: registry.length, improvementRate: total > 0 ? Math.round(improved / total * 100) : 0, totalWithNotes: total };
  }, [registry, notes]);

  const handleAdd = () => {
    if (!selPatient) { showToast('請先選擇病人', 'error'); return; }
    if (!form.treatment) { showToast('請填寫治療方案', 'error'); return; }
    const dup = registry.find(r => r.patientId === selPatient.id && r.condition === form.condition);
    if (dup) { showToast('此病人已登記該慢性病', 'error'); return; }
    const rec = { ...form, id: uid(), patientId: selPatient.id, patientName: selPatient.name, createdAt: today(), createdBy: user?.name || '' };
    persistReg([...registry, rec]);
    showToast('慢性病登記成功');
    setTab('list');
  };

  const handleRemove = (id) => {
    persistReg(registry.filter(r => r.id !== id));
    persistNotes(notes.filter(n => n.regId !== id));
    showToast('已移除');
  };

  const handleAddNote = () => {
    if (!noteText.trim()) { showToast('請輸入備註', 'error'); return; }
    const note = { id: uid(), regId: showNoteModal, text: noteText, score: Number(noteScore), date: new Date().toISOString().slice(0, 16).replace('T', ' '), by: user?.name || '' };
    persistNotes([...notes, note]);
    setShowNoteModal(null); setNoteText(''); setNoteScore(5);
    showToast('進度記錄已新增');
  };

  const getNotesFor = (regId) => notes.filter(n => n.regId === regId).sort((a, b) => b.date.localeCompare(a.date));
  const getTrend = (regId) => {
    const rn = notes.filter(n => n.regId === regId).sort((a, b) => a.date.localeCompare(b.date));
    if (rn.length < 2) return null;
    const last = rn[rn.length - 1].score, first = rn[0].score;
    return last < first ? 'improved' : last > first ? 'worsened' : 'stable';
  };

  const printSummary = (rec) => {
    const rNotes = getNotesFor(rec.id);
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>慢性病摘要</title><style>body{font-family:sans-serif;padding:20px;font-size:14px}h2{color:${ACCENT}}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f3f4f6}.meta{color:#666;font-size:13px}@media print{button{display:none}}</style></head><body>`);
    w.document.write(`<h2>${escapeHtml(clinicName)} - 慢性病管理摘要</h2>`);
    w.document.write(`<p class="meta">列印日期：${today()}</p>`);
    w.document.write(`<table><tr><th>病人</th><td>${escapeHtml(rec.patientName)}</td><th>病症</th><td>${escapeHtml(rec.condition)}</td></tr>`);
    w.document.write(`<tr><th>嚴重程度</th><td>${escapeHtml(SEVERITY[rec.severity])}</td><th>登記日期</th><td>${escapeHtml(rec.since)}</td></tr>`);
    w.document.write(`<tr><th>覆診頻率</th><td>${escapeHtml(FREQ[rec.frequency])}</td><th>治療方案</th><td>${escapeHtml(rec.treatment)}</td></tr></table>`);
    if (rNotes.length) {
      w.document.write('<h3>進度記錄</h3><table><tr><th>日期</th><th>症狀評分</th><th>備註</th><th>記錄者</th></tr>');
      rNotes.forEach(n => w.document.write(`<tr><td>${escapeHtml(n.date)}</td><td>${n.score}/10</td><td>${escapeHtml(n.text)}</td><td>${escapeHtml(n.by)}</td></tr>`));
      w.document.write('</table>');
    }
    w.document.write(`<br/><button onclick="window.print()">列印</button></body></html>`);
    w.document.close();
  };

  const tabBtn = (t, lbl, count) => (
    <button key={t} onClick={() => setTab(t)} style={{ ...btn, background: tab === t ? ACCENT : '#fff', color: tab === t ? '#fff' : ACCENT, border: `1px solid ${ACCENT}`, marginRight: 6, position: 'relative' }}>
      {lbl}{count > 0 && <span style={{ ...badge(RED), position: 'relative', top: -1, marginLeft: 4 }}>{count}</span>}
    </button>
  );

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ color: ACCENT, marginBottom: 12 }}>慢性病管理</h2>
      <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tabBtn('list', '病人列表', 0)}
        {tabBtn('add', '新增登記', 0)}
        {tabBtn('alerts', '提醒', alerts.overdue.length + alerts.worsening.length)}
        {tabBtn('stats', '統計', 0)}
      </div>

      {/* Patient search */}
      <div style={{ ...card, position: 'relative' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="搜尋病人姓名或電話..." value={search} onChange={e => { setSearch(e.target.value); setSelPatient(null); }} style={{ ...inp, flex: 1 }} />
          {selPatient && <span style={{ ...badge(ACCENT) }}>{selPatient.name}</span>}
          {selPatient && <button onClick={() => { setSelPatient(null); setSearch(''); }} style={{ ...btnSm, background: GRAY }}>清除</button>}
          {filterCond && <button onClick={() => setFilterCond('')} style={{ ...btnSm, background: ORANGE }}>清除篩選: {filterCond}</button>}
        </div>
        {suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: 52, left: 16, right: 16, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, zIndex: 10, maxHeight: 200, overflow: 'auto' }}>
            {suggestions.map(p => <div key={p.id} onClick={() => { setSelPatient(p); setSearch(p.name); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }} onMouseEnter={e => e.target.style.background = ACCENT_LIGHT} onMouseLeave={e => e.target.style.background = '#fff'}>{p.name} {p.phone && `(${p.phone})`}</div>)}
          </div>
        )}
      </div>

      {/* Add registration */}
      {tab === 'add' && (
        <div style={card}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>新增慢性病登記</h3>
          {!selPatient && <p style={{ color: RED, fontSize: 13 }}>請先在上方搜尋並選擇病人</p>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><label style={label}>慢性病類型</label><select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} style={sel}>{CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label style={label}>嚴重程度</label><select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} style={sel}>{Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label style={label}>發病日期</label><input type="date" value={form.since} onChange={e => setForm({ ...form, since: e.target.value })} style={inp} /></div>
            <div><label style={label}>覆診頻率</label><select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} style={sel}>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          <div style={{ marginBottom: 10 }}><label style={label}>治療方案</label><textarea value={form.treatment} onChange={e => setForm({ ...form, treatment: e.target.value })} style={{ ...inp, height: 60 }} placeholder="中藥處方、針灸穴位、生活建議等..." /></div>
          <button onClick={handleAdd} style={btn}>確認登記</button>
        </div>
      )}

      {/* List */}
      {tab === 'list' && (
        <div>
          <div style={{ marginBottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CONDITIONS.map(c => { const cnt = registry.filter(r => r.condition === c).length; return cnt > 0 && <button key={c} onClick={() => setFilterCond(filterCond === c ? '' : c)} style={{ ...btnSm, background: filterCond === c ? ACCENT : '#e5e7eb', color: filterCond === c ? '#fff' : '#374151' }}>{c} ({cnt})</button>; })}
          </div>
          {filtered.length === 0 && <p style={{ color: GRAY, textAlign: 'center', padding: 30 }}>暫無記錄。請新增慢性病登記。</p>}
          {filtered.map(r => {
            const rNotes = getNotesFor(r.id);
            const trend = getTrend(r.id);
            const tColor = trend === 'improved' ? GREEN : trend === 'worsened' ? RED : ORANGE;
            const tLabel = trend === 'improved' ? '好轉' : trend === 'worsened' ? '惡化' : '穩定';
            const lastNote = rNotes[0];
            const freqDays = FREQ_DAYS[r.frequency] || 30;
            const diff = daysDiff(lastNote?.date || r.createdAt);
            const isOverdue = diff > freqDays;
            return (
              <div key={r.id} style={{ ...card, borderLeft: `4px solid ${SEV_COLOR[r.severity]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <strong style={{ fontSize: 16 }}>{r.patientName}</strong>
                    <span style={{ ...badge(ACCENT), marginLeft: 8 }}>{r.condition}</span>
                    <span style={badge(SEV_COLOR[r.severity])}>{SEVERITY[r.severity]}</span>
                    {trend && <span style={badge(tColor)}>{tLabel}</span>}
                    {isOverdue && <span style={badge(RED)}>逾期覆診</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => { setShowNoteModal(r.id); setNoteText(''); setNoteScore(lastNote?.score || 5); }} style={btnSm}>新增記錄</button>
                    <button onClick={() => printSummary(r)} style={{ ...btnSm, background: '#6366f1' }}>列印</button>
                    <button onClick={() => handleRemove(r.id)} style={btnDanger}>移除</button>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: GRAY, marginTop: 6 }}>
                  發病：{r.since} | 覆診：{FREQ[r.frequency]} | 治療：{r.treatment?.slice(0, 40)}{r.treatment?.length > 40 ? '...' : ''}
                </div>
                {/* Symptom score trend bar */}
                {rNotes.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: GRAY, marginBottom: 4 }}>症狀評分趨勢（1=最輕 10=最重）</div>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 40 }}>
                      {notes.filter(n => n.regId === r.id).sort((a, b) => a.date.localeCompare(b.date)).slice(-10).map((n, i) => (
                        <div key={i} title={`${n.date}: ${n.score}/10`} style={{ width: 18, height: `${n.score * 4}px`, background: n.score <= 3 ? GREEN : n.score <= 6 ? ORANGE : RED, borderRadius: 3, minHeight: 4 }} />
                      ))}
                    </div>
                  </div>
                )}
                {/* Recent notes */}
                {rNotes.length > 0 && (
                  <div style={{ marginTop: 8, borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>
                    <div style={{ fontSize: 12, color: GRAY }}>最近記錄：</div>
                    {rNotes.slice(0, 3).map(n => (
                      <div key={n.id} style={{ fontSize: 13, padding: '3px 0', display: 'flex', gap: 8 }}>
                        <span style={{ color: GRAY, minWidth: 110 }}>{n.date}</span>
                        <span style={{ color: n.score <= 3 ? GREEN : n.score <= 6 ? ORANGE : RED, fontWeight: 600, minWidth: 40 }}>{n.score}/10</span>
                        <span>{n.text}</span>
                      </div>
                    ))}
                    {rNotes.length > 3 && <div style={{ fontSize: 12, color: ACCENT, cursor: 'pointer' }}>...共 {rNotes.length} 條記錄</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Alerts */}
      {tab === 'alerts' && (
        <div>
          <h3 style={{ color: RED, marginTop: 0 }}>逾期覆診 ({alerts.overdue.length})</h3>
          {alerts.overdue.length === 0 && <p style={{ color: GRAY }}>暫無逾期覆診病人</p>}
          {alerts.overdue.map(r => (
            <div key={r.id} style={{ ...card, borderLeft: `4px solid ${RED}` }}>
              <strong>{r.patientName}</strong> - {r.condition}
              <span style={{ ...badge(RED), marginLeft: 8 }}>逾期 {r.overdueDays} 天</span>
              <div style={{ fontSize: 13, color: GRAY }}>上次記錄：{r.lastDate} | 覆診頻率：{FREQ[r.frequency]}</div>
            </div>
          ))}
          <h3 style={{ color: ORANGE, marginTop: 16 }}>症狀惡化 ({alerts.worsening.length})</h3>
          {alerts.worsening.length === 0 && <p style={{ color: GRAY }}>暫無惡化病人</p>}
          {alerts.worsening.map(r => (
            <div key={r.id} style={{ ...card, borderLeft: `4px solid ${ORANGE}` }}>
              <strong>{r.patientName}</strong> - {r.condition}
              <span style={{ ...badge(ORANGE), marginLeft: 8 }}>{r.prevScore} → {r.curScore}</span>
              <div style={{ fontSize: 13, color: GRAY }}>評分上升，需留意</div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {tab === 'stats' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10, marginBottom: 16 }}>
            <div style={{ ...card, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: ACCENT }}>{stats.totalPatients}</div><div style={{ fontSize: 13, color: GRAY }}>慢性病病人數</div></div>
            <div style={{ ...card, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: ACCENT }}>{stats.totalRecords}</div><div style={{ fontSize: 13, color: GRAY }}>登記總數</div></div>
            <div style={{ ...card, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: GREEN }}>{stats.improvementRate}%</div><div style={{ fontSize: 13, color: GRAY }}>好轉率 ({stats.totalWithNotes}人)</div></div>
            <div style={{ ...card, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: RED }}>{alerts.overdue.length}</div><div style={{ fontSize: 13, color: GRAY }}>逾期覆診</div></div>
          </div>
          <div style={card}>
            <h3 style={{ color: ACCENT, marginTop: 0 }}>各慢性病人數</h3>
            {stats.condCount.length === 0 && <p style={{ color: GRAY }}>暫無資料</p>}
            {stats.condCount.map(([c, n]) => {
              const max = stats.condCount[0]?.[1] || 1;
              return (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 90, fontSize: 14, textAlign: 'right' }}>{c}</span>
                  <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 4, height: 20 }}>
                    <div style={{ width: `${(n / max) * 100}%`, background: ACCENT, borderRadius: 4, height: 20, minWidth: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12 }}>{n}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Note modal */}
      {showNoteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowNoteModal(null)}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 400, maxWidth: '92vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: ACCENT, marginTop: 0 }}>新增進度記錄</h3>
            <div style={{ marginBottom: 10 }}>
              <label style={label}>症狀評分（1=最輕 10=最重）</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" min="1" max="10" value={noteScore} onChange={e => setNoteScore(Number(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontSize: 20, fontWeight: 700, color: noteScore <= 3 ? GREEN : noteScore <= 6 ? ORANGE : RED, minWidth: 30, textAlign: 'center' }}>{noteScore}</span>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}><label style={label}>進度備註</label><textarea value={noteText} onChange={e => setNoteText(e.target.value)} style={{ ...inp, height: 70 }} placeholder="病情變化、用藥調整、生活建議等..." /></div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNoteModal(null)} style={btnOut}>取消</button>
              <button onClick={handleAddNote} style={btn}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
