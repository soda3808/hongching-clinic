import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const LS_KEY = 'hcmc_survey_builder';
const ACC = '#0e7490';
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{"surveys":[],"responses":[]}'); } catch { return { surveys: [], responses: [] }; } };
const persist = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));

const QTYPES = [
  { value: 'choice', label: '選擇題' },
  { value: 'rating5', label: '評分 (1-5)' },
  { value: 'rating10', label: '評分 (1-10)' },
  { value: 'text', label: '文字輸入' },
  { value: 'yesno', label: '是/否' },
  { value: 'nps', label: 'NPS (0-10)' },
];

const q = (type, title, options = []) => ({ type, title, options });
const TEMPLATES = [
  { name: '病人滿意度', questions: [q('rating5','整體滿意度'), q('rating5','醫師專業度'), q('rating5','接待服務'), q('yesno','是否會再次光臨'), q('text','其他意見')] },
  { name: '治療後回饋', questions: [q('rating5','治療效果'), q('choice','症狀改善程度',['明顯改善','稍有改善','沒有變化','稍有惡化']), q('yesno','是否出現副作用'), q('text','治療後感受'), q('nps','推薦意願 (NPS)')] },
  { name: '診所環境', questions: [q('rating5','環境整潔度'), q('rating5','候診區舒適度'), q('rating5','設備完善程度'), q('choice','最需改善的區域',['候診區','診療室','洗手間','停車場','其他']), q('text','環境改善建議')] },
  { name: '員工服務', questions: [q('rating5','前台服務態度'), q('rating5','醫師溝通能力'), q('rating5','配藥員服務'), q('yesno','員工是否有禮貌'), q('text','對員工的建議')] },
];

const sBtn = { padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const sCard = { background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 14 };
const sInput = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' };

export default function ClinicSurveyBuilder({ data, showToast, user }) {
  const [store, setStore] = useState(load);
  const [tab, setTab] = useState('list');
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewAnswers, setPreviewAnswers] = useState({});
  const [viewResp, setViewResp] = useState(null);

  const save = (next) => { setStore(next); persist(next); };

  /* ── Survey editor state ── */
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [questions, setQuestions] = useState([]);
  const [dragIdx, setDragIdx] = useState(null);

  const startNew = (tpl) => {
    setTitle(tpl ? tpl.name : '');
    setDesc('');
    setQuestions(tpl ? tpl.questions.map(q => ({ ...q, id: uid() })) : []);
    setEditing('new');
    setTab('edit');
  };

  const startEdit = (s) => {
    setTitle(s.title); setDesc(s.desc || ''); setQuestions([...s.questions]);
    setEditing(s.id);
    setTab('edit');
  };

  const addQuestion = () => {
    setQuestions(q => [...q, { id: uid(), type: 'rating5', title: '', options: [] }]);
  };

  const updateQ = (idx, field, val) => {
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, [field]: val } : q));
  };

  const removeQ = (idx) => setQuestions(qs => qs.filter((_, i) => i !== idx));

  const handleDrop = (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx) return;
    setQuestions(qs => {
      const copy = [...qs]; const item = copy.splice(dragIdx, 1)[0];
      copy.splice(targetIdx, 0, item); return copy;
    });
    setDragIdx(null);
  };

  const saveSurvey = () => {
    if (!title.trim()) return showToast('請輸入問卷標題');
    if (!questions.length) return showToast('請至少新增一個問題');
    if (questions.find(qn => !qn.title.trim())) return showToast('每個問題都需要標題');
    if (questions.find(qn => qn.type === 'choice' && (!qn.options || qn.options.filter(o => o.trim()).length < 2))) return showToast('選擇題至少需要兩個選項');
    const next = { ...store };
    if (editing === 'new') { next.surveys = [...next.surveys, { id: uid(), title: title.trim(), desc: desc.trim(), questions, status: 'draft', createdAt: new Date().toISOString(), createdBy: user?.name || '管理員' }]; }
    else { next.surveys = next.surveys.map(s => s.id === editing ? { ...s, title: title.trim(), desc: desc.trim(), questions } : s); }
    save(next); showToast('問卷已儲存'); setTab('list'); setEditing(null);
  };

  const togglePublish = (id) => { const next = { ...store, surveys: store.surveys.map(s => s.id === id ? { ...s, status: s.status === 'published' ? 'draft' : 'published' } : s) }; save(next); showToast(next.surveys.find(s => s.id === id).status === 'published' ? '已發佈' : '已取消發佈'); };
  const deleteSurvey = (id) => { save({ ...store, surveys: store.surveys.filter(s => s.id !== id), responses: store.responses.filter(r => r.surveyId !== id) }); showToast('已刪除問卷'); };
  const getSurveyLink = (id) => { const url = `${window.location.origin}/survey/${id}`; navigator.clipboard?.writeText(url).then(() => showToast('連結已複製')).catch(() => showToast('連結: ' + url)); };
  const submitPreview = () => { if (!preview) return; save({ ...store, responses: [...store.responses, { id: uid(), surveyId: preview.id, answers: { ...previewAnswers }, submittedAt: new Date().toISOString() }] }); showToast('已提交測試回覆'); setPreview(null); setPreviewAnswers({}); };

  /* ── Analytics ── */
  const respForSurvey = (sid) => store.responses.filter(r => r.surveyId === sid);

  const analytics = useMemo(() => {
    if (!viewResp) return null;
    const survey = store.surveys.find(s => s.id === viewResp);
    if (!survey) return null;
    const resps = respForSurvey(viewResp);
    return survey.questions.map(qn => {
      const answers = resps.map(r => r.answers?.[qn.id]).filter(a => a !== undefined && a !== '');
      if (['rating5','rating10','nps'].includes(qn.type)) {
        const nums = answers.map(Number).filter(n => !isNaN(n)), max = qn.type === 'rating5' ? 5 : 10;
        const avg = nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1) : 0, dist = {};
        for (let i = (qn.type === 'nps' ? 0 : 1); i <= max; i++) dist[i] = 0;
        nums.forEach(n => { if (dist[n] !== undefined) dist[n]++; });
        return { ...qn, avg, count: nums.length, dist, max };
      }
      if (qn.type === 'choice') { const dist = {}; (qn.options || []).forEach(o => dist[o] = 0); answers.forEach(a => { dist[a] = (dist[a] || 0) + 1; }); return { ...qn, dist, count: answers.length }; }
      if (qn.type === 'yesno') { const yes = answers.filter(a => a === '是').length; return { ...qn, yes, no: answers.length - yes, count: answers.length }; }
      return { ...qn, answers, count: answers.length };
    });
  }, [viewResp, store]);

  const exportCSV = (sid) => {
    const survey = store.surveys.find(s => s.id === sid); if (!survey) return;
    const resps = respForSurvey(sid); if (!resps.length) return showToast('沒有回覆可匯出');
    const headers = ['提交時間', ...survey.questions.map(qn => qn.title)];
    const rows = resps.map(r => [r.submittedAt, ...survey.questions.map(qn => r.answers?.[qn.id] || '')]);
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `survey_${survey.title}_${new Date().toISOString().substring(0,10)}.csv`; a.click();
    showToast('已匯出回覆數據');
  };

  const printReport = (sid) => {
    const survey = store.surveys.find(s => s.id === sid); if (!survey) return;
    const resps = respForSurvey(sid), w = window.open('', '_blank'); if (!w) return;
    const qRows = survey.questions.map(qn => {
      const ans = resps.map(r => r.answers?.[qn.id]).filter(a => a !== undefined && a !== '');
      if (['rating5','rating10','nps'].includes(qn.type)) { const nums = ans.map(Number).filter(n => !isNaN(n)); const avg = nums.length ? (nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(1) : '-'; return `<tr><td>${qn.title}</td><td class="r">${avg}</td><td class="r">${nums.length}</td></tr>`; }
      return `<tr><td>${qn.title}</td><td class="r">-</td><td class="r">${ans.length}</td></tr>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>問卷報告</title><style>body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:700px;margin:0 auto;font-size:13px}h1{font-size:18px;text-align:center;color:${ACC}}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:6px 10px;border-bottom:1px solid #eee;text-align:left}th{background:#f8f8f8}.r{text-align:right}@media print{body{padding:10mm}}</style></head><body><h1>${getClinicName()} — ${survey.title}</h1><p style="text-align:center;color:#888;font-size:11px">列印：${new Date().toLocaleString('zh-HK')} | 回覆數：${resps.length}</p><table><thead><tr><th>問題</th><th class="r">平均分/結果</th><th class="r">回覆數</th></tr></thead><tbody>${qRows}</tbody></table></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  /* ── SVG Bar helper ── */
  const BarSVG = ({ dist, max, barH = 22 }) => {
    const entries = Object.entries(dist);
    const peak = Math.max(...entries.map(e => e[1]), 1);
    const w = 280, h = entries.length * (barH + 6) + 4;
    return (
      <svg width={w} height={h} style={{ display: 'block', margin: '8px 0' }}>
        {entries.map(([label, count], i) => {
          const y = i * (barH + 6) + 2;
          const bw = (count / peak) * (w - 80);
          return (
            <g key={label}>
              <text x={0} y={y + barH / 2 + 4} fontSize={11} fill="#555">{label}</text>
              <rect x={35} y={y} width={Math.max(bw, 0)} height={barH} rx={4} fill={ACC} opacity={0.8} />
              <text x={35 + Math.max(bw, 0) + 6} y={y + barH / 2 + 4} fontSize={11} fill="#333" fontWeight={600}>{count}</text>
            </g>
          );
        })}
      </svg>
    );
  };

  /* ── Tab buttons ── */
  const TabBtn = ({ k, label }) => (
    <button onClick={() => { setTab(k); if (k !== 'edit') setEditing(null); if (k !== 'analytics') setViewResp(null); }}
      style={{ ...sBtn, background: tab === k ? ACC : '#f3f4f6', color: tab === k ? '#fff' : '#374151' }}>{label}</button>
  );

  /* ── Render question in preview ── */
  const setPA = (qid, v) => setPreviewAnswers(a => ({ ...a, [qid]: v }));
  const NumBtns = ({ start, end, qid, val, colorFn }) => (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{Array.from({ length: end - start + 1 }, (_, i) => i + start).map(n =>
      <button key={n} onClick={() => setPA(qid, n)} style={{ ...sBtn, width: 32, padding: '4px 0', background: val === n ? (colorFn ? colorFn(n) : ACC) : '#f3f4f6', color: val === n ? '#fff' : '#374151' }}>{n}</button>
    )}</div>
  );
  const RadioOpts = ({ opts, qid, val, inline }) => opts.map(o =>
    <label key={o} style={{ display: inline ? 'inline-flex' : 'flex', alignItems: 'center', gap: inline ? 4 : 6, marginRight: inline ? 16 : 0, marginBottom: inline ? 0 : 4, cursor: 'pointer', fontSize: 13 }}>
      <input type="radio" name={qid} checked={val === o} onChange={() => setPA(qid, o)} /> {o}
    </label>
  );
  const PreviewQ = ({ q, idx }) => {
    const val = previewAnswers[q.id] || '';
    return (
      <div style={{ ...sCard, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{idx + 1}. {q.title}</div>
        {q.type === 'rating5' && <div style={{ display: 'flex', gap: 6 }}>{[1,2,3,4,5].map(n =>
          <span key={n} onClick={() => setPA(q.id, n)} style={{ cursor: 'pointer', fontSize: 22, color: n <= (val || 0) ? '#f59e0b' : '#d1d5db' }}>★</span>)}</div>}
        {q.type === 'rating10' && <NumBtns start={1} end={10} qid={q.id} val={val} />}
        {q.type === 'nps' && <NumBtns start={0} end={10} qid={q.id} val={val} colorFn={n => n <= 6 ? '#dc2626' : n <= 8 ? '#d97706' : '#16a34a'} />}
        {q.type === 'choice' && <RadioOpts opts={q.options || []} qid={q.id} val={val} />}
        {q.type === 'yesno' && <RadioOpts opts={['是', '否']} qid={q.id} val={val} inline />}
        {q.type === 'text' && <textarea rows={2} value={val} onChange={e => setPA(q.id, e.target.value)} style={{ ...sInput, resize: 'vertical' }} placeholder="請輸入..." />}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <TabBtn k="list" label="問卷列表" />
        <TabBtn k="edit" label={editing ? '編輯問卷' : '建立問卷'} />
        <TabBtn k="analytics" label="回覆分析" />
      </div>

      {/* ═══ LIST TAB ═══ */}
      {tab === 'list' && (
        <div>
          {/* Quick create from template */}
          <div style={{ ...sCard, padding: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>快速建立（範本）</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TEMPLATES.map(t => (
                <button key={t.name} onClick={() => startNew(t)} style={{ ...sBtn, background: '#f0fdfa', color: ACC, border: `1px solid ${ACC}` }}>{t.name}</button>
              ))}
              <button onClick={() => startNew(null)} style={{ ...sBtn, background: ACC, color: '#fff' }}>+ 自訂問卷</button>
            </div>
          </div>

          {/* Survey list */}
          {store.surveys.length === 0 && <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>尚未建立任何問卷</div>}
          {store.surveys.map(s => {
            const rc = respForSurvey(s.id).length, pub = s.status === 'published';
            return (
              <div key={s.id} style={{ ...sCard, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{s.title}
                    <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 10, background: pub ? '#dcfce7' : '#f3f4f6', color: pub ? '#16a34a' : '#888' }}>{pub ? '已發佈' : '草稿'}</span></div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{s.questions.length} 個問題 · {rc} 個回覆 · 建立者：{s.createdBy}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[['預覽', '#f3f4f6', '#374151', () => { setPreview(s); setPreviewAnswers({}); }],
                    ['編輯', '#f3f4f6', '#374151', () => startEdit(s)],
                    [pub ? '取消發佈' : '發佈', pub ? '#fef3c7' : '#dcfce7', pub ? '#92400e' : '#166534', () => togglePublish(s.id)],
                    ['複製連結', '#eff6ff', '#1d4ed8', () => getSurveyLink(s.id)],
                    ['分析', '#f0fdfa', ACC, () => { setViewResp(s.id); setTab('analytics'); }],
                    ['刪除', '#fef2f2', '#dc2626', () => deleteSurvey(s.id)],
                  ].map(([l, bg, c, fn]) => <button key={l} onClick={fn} style={{ ...sBtn, background: bg, color: c }}>{l}</button>)}
                </div>
              </div>);
          })}
        </div>
      )}

      {/* ═══ EDIT TAB ═══ */}
      {tab === 'edit' && (
        <div>
          <div style={{ ...sCard, padding: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>問卷標題 *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={{ ...sInput, marginBottom: 8 }} placeholder="例：病人滿意度調查" />
            <label style={{ fontSize: 12, fontWeight: 600 }}>描述</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} style={sInput} placeholder="問卷說明（選填）" />
          </div>

          {/* Questions */}
          {questions.map((q, idx) => (
            <div key={q.id} draggable onDragStart={() => setDragIdx(idx)} onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(idx)}
              style={{ ...sCard, padding: 14, borderLeft: `3px solid ${ACC}`, cursor: 'grab' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: ACC }}>問題 {idx + 1} ⠿</span>
                <button onClick={() => removeQ(idx)} style={{ ...sBtn, background: '#fef2f2', color: '#dc2626', padding: '3px 10px', fontSize: 12 }}>移除</button>
              </div>
              <input value={q.title} onChange={e => updateQ(idx, 'title', e.target.value)} style={{ ...sInput, marginBottom: 6 }} placeholder="問題標題" />
              <select value={q.type} onChange={e => updateQ(idx, 'type', e.target.value)} style={{ ...sInput, width: 'auto', marginBottom: 6 }}>
                {QTYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {q.type === 'choice' && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>選項（每行一個）</div>
                  <textarea rows={3} value={(q.options || []).join('\n')} onChange={e => updateQ(idx, 'options', e.target.value.split('\n'))}
                    style={{ ...sInput, resize: 'vertical', fontSize: 12 }} placeholder="選項A&#10;選項B&#10;選項C" />
                </div>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={addQuestion} style={{ ...sBtn, background: '#f0fdfa', color: ACC, border: `1px dashed ${ACC}` }}>+ 新增問題</button>
            <button onClick={saveSurvey} style={{ ...sBtn, background: ACC, color: '#fff' }}>儲存問卷</button>
            <button onClick={() => { setTab('list'); setEditing(null); }} style={{ ...sBtn, background: '#f3f4f6', color: '#374151' }}>取消</button>
          </div>
        </div>
      )}

      {/* ═══ ANALYTICS TAB ═══ */}
      {tab === 'analytics' && (
        <div>
          {!viewResp && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>選擇問卷查看回覆分析</div>
              {store.surveys.map(s => (
                <button key={s.id} onClick={() => setViewResp(s.id)}
                  style={{ ...sBtn, display: 'block', width: '100%', textAlign: 'left', marginBottom: 6, background: '#f9fafb', color: '#111', padding: 12 }}>
                  {s.title} — {respForSurvey(s.id).length} 個回覆
                </button>
              ))}
              {!store.surveys.length && <div style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>尚無問卷</div>}
            </div>
          )}
          {viewResp && analytics && (() => {
            const survey = store.surveys.find(s => s.id === viewResp), resps = respForSurvey(viewResp);
            const YesNo = ({ a }) => (<div style={{ display: 'flex', gap: 16 }}>
              {[['是', '#16a34a', a.yes], ['否', '#dc2626', a.no]].map(([l, c, v]) =>
                <div key={l} style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div><div style={{ fontSize: 11, color: '#888' }}>{l}</div></div>)}
              <div style={{ fontSize: 12, color: '#888', alignSelf: 'center' }}>({a.count} 回覆)</div>
            </div>);
            return (<div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                <div><div style={{ fontSize: 16, fontWeight: 700 }}>{survey?.title}</div><div style={{ fontSize: 12, color: '#888' }}>共 {resps.length} 個回覆</div></div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => exportCSV(viewResp)} style={{ ...sBtn, background: '#f3f4f6', color: '#374151' }}>匯出 CSV</button>
                  <button onClick={() => printReport(viewResp)} style={{ ...sBtn, background: '#fef3c7', color: '#92400e' }}>列印報告</button>
                  <button onClick={() => setViewResp(null)} style={{ ...sBtn, background: '#f3f4f6', color: '#374151' }}>返回</button>
                </div>
              </div>
              {!resps.length && <div style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>尚無回覆數據</div>}
              {analytics.map((a, i) => (
                <div key={a.id} style={{ ...sCard, padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{i + 1}. {a.title}</div>
                  {['rating5','rating10','nps'].includes(a.type) && <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: ACC }}>{a.avg} <span style={{ fontSize: 12, fontWeight: 400, color: '#888' }}>/ {a.max} 平均 ({a.count} 回覆)</span></div>
                    <BarSVG dist={a.dist} max={a.max} /></div>}
                  {a.type === 'choice' && <div><div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{a.count} 個回覆</div><BarSVG dist={a.dist} /></div>}
                  {a.type === 'yesno' && <YesNo a={a} />}
                  {a.type === 'text' && <div>{a.answers?.length ? a.answers.map((ans, ai) =>
                    <div key={ai} style={{ fontSize: 12, padding: '4px 8px', background: '#f9fafb', borderRadius: 6, marginBottom: 4 }}>{ans}</div>
                  ) : <span style={{ color: '#aaa', fontSize: 12 }}>尚無文字回覆</span>}</div>}
                </div>))}
            </div>);
          })()}
        </div>
      )}

      {/* ═══ PREVIEW MODAL ═══ */}
      {preview && (
        <div onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: '90%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{preview.title}</h3>
              <button onClick={() => setPreview(null)} style={{ ...sBtn, background: '#f3f4f6' }}>✕</button>
            </div>
            {preview.desc && <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>{preview.desc}</div>}
            {preview.questions.map((q, i) => <PreviewQ key={q.id} q={q} idx={i} />)}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={submitPreview} style={{ ...sBtn, background: ACC, color: '#fff' }}>提交測試回覆</button>
              <button onClick={() => setPreview(null)} style={{ ...sBtn, background: '#f3f4f6', color: '#374151' }}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
