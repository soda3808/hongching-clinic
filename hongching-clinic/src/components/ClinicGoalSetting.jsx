import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_clinic_goals';

const CATEGORIES = ['營業目標', '病人增長', '服務質量', '團隊發展', '營運效率'];
const PERIODS = ['Q1', 'Q2', 'Q3', 'Q4', '年度'];
const LEVELS = ['診所', '部門', '個人'];

function load() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } }
function save(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); }

function statusOf(pct) {
  if (pct >= 70) return { label: '正常', color: '#16a34a' };
  if (pct >= 40) return { label: '有風險', color: '#d97706' };
  return { label: '落後', color: '#dc2626' };
}

function okrScore(obj) {
  if (!obj.keyResults?.length) return 0;
  const total = obj.keyResults.reduce((s, kr) => {
    const t = Number(kr.target) || 1;
    const c = Math.min(Number(kr.current) || 0, t);
    return s + (c / t) * 100;
  }, 0);
  return Math.round(total / obj.keyResults.length);
}

export default function ClinicGoalSetting({ data, showToast, user }) {
  const clinicName = getClinicName();
  const [goals, setGoals] = useState(load);
  const [view, setView] = useState('list');       // list | form | review | history
  const [filterCat, setFilterCat] = useState('全部');
  const [filterPeriod, setFilterPeriod] = useState('全部');
  const [editId, setEditId] = useState(null);

  const now = new Date();
  const curQ = `Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  const curYear = now.getFullYear();

  // Form state
  const blank = { title: '', category: CATEGORIES[0], period: curQ, year: curYear, level: '診所', keyResults: [{ description: '', target: '', current: '0', unit: '' }], reviewNotes: '' };
  const [form, setForm] = useState({ ...blank });

  const persist = (next) => { setGoals(next); save(next); };

  /* ── Filtered & scored ── */
  const scored = useMemo(() => goals.map(g => ({ ...g, score: okrScore(g), status: statusOf(okrScore(g)) })), [goals]);
  const filtered = useMemo(() => {
    return scored.filter(g => {
      if (filterCat !== '全部' && g.category !== filterCat) return false;
      if (filterPeriod !== '全部' && g.period !== filterPeriod) return false;
      return true;
    });
  }, [scored, filterCat, filterPeriod]);

  const overallScore = useMemo(() => {
    const current = scored.filter(g => g.year === curYear && (g.period === curQ || g.period === '年度'));
    if (!current.length) return 0;
    return Math.round(current.reduce((s, g) => s + g.score, 0) / current.length);
  }, [scored, curYear, curQ]);

  const historyData = useMemo(() => {
    const map = {};
    scored.forEach(g => {
      const key = `${g.year} ${g.period}`;
      if (!map[key]) map[key] = { period: key, scores: [] };
      map[key].scores.push(g.score);
    });
    return Object.values(map).map(h => ({ ...h, avg: Math.round(h.scores.reduce((a, b) => a + b, 0) / h.scores.length) })).sort((a, b) => a.period.localeCompare(b.period));
  }, [scored]);

  /* ── CRUD ── */
  const openNew = () => { setForm({ ...blank }); setEditId(null); setView('form'); };
  const openEdit = (g) => { setForm({ ...g }); setEditId(g.id); setView('form'); };
  const openReview = (g) => { setForm({ ...g }); setEditId(g.id); setView('review'); };

  const saveGoal = () => {
    if (!form.title.trim()) return showToast?.('請輸入目標名稱');
    if (!form.keyResults.some(kr => kr.description.trim())) return showToast?.('請至少填寫一項關鍵結果');
    const entry = { ...form, id: editId || uid(), updatedAt: new Date().toISOString(), createdBy: user?.name || '系統' };
    const next = editId ? goals.map(g => g.id === editId ? entry : g) : [...goals, entry];
    persist(next);
    showToast?.('目標已儲存');
    setView('list');
  };

  const deleteGoal = (id) => { persist(goals.filter(g => g.id !== id)); showToast?.('已刪除'); };

  const addKR = () => setForm(f => ({ ...f, keyResults: [...f.keyResults, { description: '', target: '', current: '0', unit: '' }] }));
  const removeKR = (i) => setForm(f => ({ ...f, keyResults: f.keyResults.filter((_, j) => j !== i) }));
  const updateKR = (i, field, val) => setForm(f => ({ ...f, keyResults: f.keyResults.map((kr, j) => j === i ? { ...kr, [field]: val } : kr) }));

  const saveReview = () => { saveGoal(); showToast?.('季度審查已更新'); };

  /* ── Print ── */
  const printReport = () => {
    const w = window.open('', '_blank');
    if (!w) return showToast?.('無法開啟列印視窗');
    const rows = filtered.map(g => {
      const sc = okrScore(g);
      const st = statusOf(sc);
      const krs = g.keyResults.map(kr => {
        const t = Number(kr.target) || 1;
        const c = Number(kr.current) || 0;
        const p = Math.round((c / t) * 100);
        return `<div style="margin:2px 0;font-size:12px">• ${kr.description}: ${c}/${t} ${kr.unit} (${p}%)</div>`;
      }).join('');
      return `<tr><td>${g.title}</td><td>${g.category}</td><td>${g.period} ${g.year}</td><td>${g.level}</td><td style="text-align:center"><span style="color:${st.color};font-weight:700">${sc}%</span></td><td>${krs}</td></tr>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>${clinicName} OKR報告</title>
      <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:8px;font-size:13px;vertical-align:top}th{background:#f0fdfa;color:${ACCENT}}.hdr{color:${ACCENT}}@media print{body{padding:0}}</style>
      </head><body><h2 class="hdr">${clinicName} - OKR 目標追蹤報告</h2>
      <p style="color:#666;font-size:13px">整體OKR評分: ${overallScore}% | 報告日期: ${now.toLocaleDateString('zh-HK')}</p>
      <table><thead><tr><th>目標</th><th>類別</th><th>週期</th><th>層級</th><th>評分</th><th>關鍵結果</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="margin-top:20px;font-size:11px;color:#999">列印時間: ${now.toLocaleString('zh-HK')}</p></body></html>`);
    w.document.close();
    w.print();
  };

  /* ── Styles ── */
  const s = {
    wrap: { fontFamily: 'system-ui, sans-serif' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    title: { fontSize: 18, fontWeight: 800, color: ACCENT, margin: 0 },
    row: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
    btn: { padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: ACCENT, color: '#fff' },
    btnOut: { padding: '6px 14px', borderRadius: 6, border: `1px solid ${ACCENT}`, background: '#fff', color: ACCENT, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    btnSm: { padding: '4px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
    card: { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)', marginBottom: 12 },
    label: { fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4, display: 'block' },
    input: { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' },
    select: { padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 },
    tag: (c) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: '#fff', background: c, marginRight: 4 }),
    light: (c) => ({ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block', marginRight: 6 }),
    progBg: { height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden', flex: 1 },
    progFill: (pct, c) => ({ height: '100%', width: `${Math.min(pct, 100)}%`, background: c, borderRadius: 4, transition: 'width .3s' }),
    scoreCircle: (c) => ({ width: 80, height: 80, borderRadius: '50%', border: `5px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', margin: '0 auto 8px' }),
  };

  /* ── Form View ── */
  if (view === 'form') return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h3 style={s.title}>{editId ? '編輯目標' : '新增OKR目標'}</h3>
        <button style={s.btnOut} onClick={() => setView('list')}>返回</button>
      </div>
      <div style={s.card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ gridColumn: '1/3' }}><label style={s.label}>目標名稱</label><input style={s.input} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="例：提高診所月營業額至50萬" /></div>
          <div><label style={s.label}>類別</label><select style={s.select} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label style={s.label}>週期</label><select style={s.select} value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))}>{PERIODS.map(p => <option key={p}>{p}</option>)}</select></div>
          <div><label style={s.label}>年份</label><input style={{ ...s.input, width: 100 }} type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))} /></div>
          <div><label style={s.label}>層級</label><select style={s.select} value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>{LEVELS.map(l => <option key={l}>{l}</option>)}</select></div>
        </div>

        <h4 style={{ fontSize: 14, fontWeight: 700, color: ACCENT, marginBottom: 8 }}>關鍵結果 (Key Results)</h4>
        {form.keyResults.map((kr, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px 32px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
            <div><label style={s.label}>描述</label><input style={s.input} value={kr.description} onChange={e => updateKR(i, 'description', e.target.value)} placeholder="例：月營業額" /></div>
            <div><label style={s.label}>目標值</label><input style={s.input} type="number" value={kr.target} onChange={e => updateKR(i, 'target', e.target.value)} /></div>
            <div><label style={s.label}>目前值</label><input style={s.input} type="number" value={kr.current} onChange={e => updateKR(i, 'current', e.target.value)} /></div>
            <div><label style={s.label}>單位</label><input style={s.input} value={kr.unit} onChange={e => updateKR(i, 'unit', e.target.value)} placeholder="$, %, 人" /></div>
            <button style={{ ...s.btnSm, background: '#fee2e2', color: '#dc2626', marginBottom: 1 }} onClick={() => removeKR(i)}>✕</button>
          </div>
        ))}
        <button style={{ ...s.btnSm, background: '#f0fdfa', color: ACCENT, marginBottom: 16 }} onClick={addKR}>+ 新增關鍵結果</button>

        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn} onClick={saveGoal}>儲存目標</button>
          <button style={s.btnOut} onClick={() => setView('list')}>取消</button>
        </div>
      </div>
    </div>
  );

  /* ── Review View ── */
  if (view === 'review') {
    const sc = okrScore(form);
    const st = statusOf(sc);
    return (
      <div style={s.wrap}>
        <div style={s.header}>
          <h3 style={s.title}>季度審查 - {form.title}</h3>
          <button style={s.btnOut} onClick={() => setView('list')}>返回</button>
        </div>
        <div style={s.card}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={s.scoreCircle(st.color)}>
              <span style={{ fontSize: 22, fontWeight: 800, color: st.color }}>{sc}%</span>
            </div>
            <span style={s.tag(st.color)}>{st.label}</span>
            <span style={{ fontSize: 13, color: '#64748b', marginLeft: 6 }}>{form.period} {form.year} | {form.category}</span>
          </div>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: ACCENT, marginBottom: 8 }}>更新關鍵結果進度</h4>
          {form.keyResults.map((kr, i) => {
            const t = Number(kr.target) || 1;
            const c = Number(kr.current) || 0;
            const p = Math.round((c / t) * 100);
            const krSt = statusOf(p);
            return (
              <div key={i} style={{ marginBottom: 12, padding: 10, background: '#f8fafc', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{kr.description}</span>
                  <span style={{ fontSize: 12, color: krSt.color, fontWeight: 700 }}>{p}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={s.progBg}><div style={s.progFill(p, krSt.color)} /></div>
                  <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{c}/{t} {kr.unit}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ fontSize: 12, color: '#64748b' }}>更新目前值:</label>
                  <input style={{ ...s.input, width: 100 }} type="number" value={kr.current} onChange={e => updateKR(i, 'current', e.target.value)} />
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 12 }}>
            <label style={s.label}>審查備註</label>
            <textarea style={{ ...s.input, height: 70, resize: 'vertical' }} value={form.reviewNotes || ''} onChange={e => setForm(f => ({ ...f, reviewNotes: e.target.value }))} placeholder="記錄本季度觀察、改進建議..." />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={s.btn} onClick={saveReview}>儲存審查</button>
            <button style={s.btnOut} onClick={() => setView('list')}>取消</button>
          </div>
        </div>
      </div>
    );
  }

  /* ── History View ── */
  if (view === 'history') return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h3 style={s.title}>OKR 歷史表現</h3>
        <button style={s.btnOut} onClick={() => setView('list')}>返回</button>
      </div>
      {historyData.length === 0 ? <p style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', padding: 40 }}>暫無歷史資料</p> : (
        <div style={s.card}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['週期', '目標數', '平均評分', '狀態'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: `2px solid ${ACCENT}`, color: ACCENT, fontWeight: 700 }}>{h}</th>)}</tr></thead>
            <tbody>
              {historyData.map(h => {
                const st = statusOf(h.avg);
                return (
                  <tr key={h.period} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{h.period}</td>
                    <td style={{ padding: '8px 10px' }}>{h.scores.length}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={s.progBg}><div style={s.progFill(h.avg, st.color)} /></div>
                        <span style={{ fontWeight: 700, color: st.color }}>{h.avg}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px' }}><span style={s.light(st.color)} />{st.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  /* ── List View (default) ── */
  const overallSt = statusOf(overallScore);
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h3 style={s.title}>OKR 目標管理</h3>
        <div style={s.row}>
          <button style={s.btn} onClick={openNew}>+ 新增目標</button>
          <button style={s.btnOut} onClick={() => setView('history')}>歷史記錄</button>
          <button style={s.btnOut} onClick={printReport}>列印報告</button>
        </div>
      </div>

      {/* Overall score */}
      <div style={{ ...s.card, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>{curYear} {curQ} 整體OKR評分</div>
        <div style={s.scoreCircle(overallSt.color)}>
          <span style={{ fontSize: 24, fontWeight: 800, color: overallSt.color }}>{overallScore}%</span>
        </div>
        <span style={s.tag(overallSt.color)}>{overallSt.label}</span>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12, fontSize: 13, color: '#64748b' }}>
          <span>目標總數: {scored.length}</span>
          <span>正常: {scored.filter(g => g.score >= 70).length}</span>
          <span>有風險: {scored.filter(g => g.score >= 40 && g.score < 70).length}</span>
          <span>落後: {scored.filter(g => g.score < 40).length}</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {['全部', ...CATEGORIES].map(c => (
          <button key={c} style={{ ...s.btnSm, background: filterCat === c ? ACCENT : '#f1f5f9', color: filterCat === c ? '#fff' : '#475569' }} onClick={() => setFilterCat(c)}>{c}</button>
        ))}
        <span style={{ width: 1, background: '#e2e8f0', margin: '0 4px' }} />
        {['全部', ...PERIODS].map(p => (
          <button key={p} style={{ ...s.btnSm, background: filterPeriod === p ? ACCENT : '#f1f5f9', color: filterPeriod === p ? '#fff' : '#475569' }} onClick={() => setFilterPeriod(p)}>{p}</button>
        ))}
      </div>

      {/* Goal cards */}
      {filtered.length === 0 && <p style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', padding: 40 }}>尚未設定任何目標，點擊「+ 新增目標」開始</p>}
      {filtered.map(g => (
        <div key={g.id} style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{g.title}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <span style={s.tag(ACCENT)}>{g.category}</span>
                <span style={s.tag('#6366f1')}>{g.period} {g.year}</span>
                <span style={s.tag('#8b5cf6')}>{g.level}</span>
                <span style={s.tag(g.status.color)}>{g.status.label}</span>
              </div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 56 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: g.status.color }}>{g.score}%</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>OKR</div>
            </div>
          </div>

          {g.keyResults.map((kr, i) => {
            const t = Number(kr.target) || 1;
            const c = Number(kr.current) || 0;
            const p = Math.round((c / t) * 100);
            const krSt = statusOf(p);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={s.light(krSt.color)} />
                <span style={{ fontSize: 13, flex: 1 }}>{kr.description}</span>
                <div style={{ ...s.progBg, maxWidth: 120 }}><div style={s.progFill(p, krSt.color)} /></div>
                <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', minWidth: 70, textAlign: 'right' }}>{c}/{t} {kr.unit} ({p}%)</span>
              </div>
            );
          })}

          {g.reviewNotes && <div style={{ marginTop: 8, padding: 8, background: '#f0fdfa', borderRadius: 6, fontSize: 12, color: '#475569' }}>審查備註: {g.reviewNotes}</div>}

          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button style={{ ...s.btnSm, background: '#f0fdfa', color: ACCENT }} onClick={() => openReview(g)}>季度審查</button>
            <button style={{ ...s.btnSm, background: '#f1f5f9', color: '#475569' }} onClick={() => openEdit(g)}>編輯</button>
            <button style={{ ...s.btnSm, background: '#fee2e2', color: '#dc2626' }} onClick={() => deleteGoal(g.id)}>刪除</button>
          </div>
        </div>
      ))}
    </div>
  );
}
