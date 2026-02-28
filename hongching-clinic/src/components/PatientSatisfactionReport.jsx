import { useState, useMemo } from 'react';
import { fmtM, getMonth, getDoctors, getStoreNames } from '../data';
import { getClinicName } from '../tenant';

const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_satisfaction_actions';
const CATS = [
  { key: 'q1', label: '候診時間' },
  { key: 'q2', label: '醫師態度' },
  { key: 'q3', label: '治療效果' },
  { key: 'q4', label: '環境舒適度' },
  { key: 'q5', label: '整體服務' },
];

function loadActions() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function saveActions(a) { localStorage.setItem(LS_KEY, JSON.stringify(a)); }
function scoreColor(v) { return v >= 4 ? '#16a34a' : v >= 3 ? '#d97706' : '#dc2626'; }
function sentimentOf(text) {
  if (!text) return 'neutral';
  const pos = /(好|棒|滿意|推薦|感謝|專業|細心|舒適|乾淨|讚|不錯|開心|快|準時)/.test(text);
  const neg = /(差|慢|久|等|髒|態度差|不好|失望|投訴|嘈|臭|亂)/.test(text);
  return pos && !neg ? 'positive' : neg && !pos ? 'negative' : 'neutral';
}
const sentimentLabel = { positive: '正面', neutral: '中性', negative: '負面' };
const sentimentColor = { positive: '#16a34a', neutral: '#6b7280', negative: '#dc2626' };

export default function PatientSatisfactionReport({ data, showToast, user }) {
  const surveys = data.surveys || [];
  const DOCTORS = getDoctors();
  const STORES = getStoreNames();
  const thisMonth = new Date().toISOString().substring(0, 7);
  const [actions, setActions] = useState(loadActions);
  const [newAction, setNewAction] = useState('');

  // ── Overall score + trend ──
  const overall = useMemo(() => {
    if (!surveys.length) return null;
    const avg = q => surveys.reduce((s, sv) => s + (sv.ratings?.[q] || 0), 0) / surveys.length;
    const score = +(CATS.reduce((s, c) => s + avg(c.key), 0) / CATS.length).toFixed(1);
    const lastM = surveys.filter(s => getMonth(s.date) !== thisMonth);
    const lastScore = lastM.length ? +(CATS.reduce((s, c) => s + lastM.reduce((a, sv) => a + (sv.ratings?.[c.key] || 0), 0) / lastM.length, 0) / CATS.length).toFixed(1) : score;
    return { score, diff: +(score - lastScore).toFixed(1), count: surveys.length };
  }, [surveys, thisMonth]);

  // ── Category scores ──
  const catScores = useMemo(() => {
    if (!surveys.length) return [];
    return CATS.map(c => {
      const vals = surveys.map(s => s.ratings?.[c.key] || 0).filter(v => v > 0);
      const avg = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
      return { ...c, avg, count: vals.length };
    });
  }, [surveys]);

  // ── Monthly trend (12 months) ──
  const monthly = useMemo(() => {
    const map = {};
    surveys.forEach(s => {
      const m = getMonth(s.date);
      if (!m) return;
      if (!map[m]) map[m] = { total: 0, count: 0 };
      const avg = CATS.reduce((a, c) => a + (s.ratings?.[c.key] || 0), 0) / CATS.length;
      map[m].total += avg;
      map[m].count++;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
      .map(([m, d]) => ({ month: m, label: m.substring(5) + '月', avg: +(d.total / d.count).toFixed(1), count: d.count }));
  }, [surveys]);

  // ── Doctor comparison ──
  const byDoctor = useMemo(() => {
    return DOCTORS.map(doc => {
      const ds = surveys.filter(s => s.doctor === doc);
      if (!ds.length) return { doctor: doc, avg: 0, count: 0 };
      const avg = +(ds.reduce((a, s) => a + CATS.reduce((t, c) => t + (s.ratings?.[c.key] || 0), 0) / CATS.length, 0) / ds.length).toFixed(1);
      return { doctor: doc, avg, count: ds.length };
    }).filter(d => d.count > 0).sort((a, b) => b.avg - a.avg);
  }, [surveys, DOCTORS]);

  // ── Store comparison ──
  const byStore = useMemo(() => {
    return STORES.map(store => {
      const ss = surveys.filter(s => s.store === store);
      if (!ss.length) return { store, avg: 0, count: 0 };
      const avg = +(ss.reduce((a, s) => a + CATS.reduce((t, c) => t + (s.ratings?.[c.key] || 0), 0) / CATS.length, 0) / ss.length).toFixed(1);
      return { store, avg, count: ss.length };
    }).filter(s => s.count > 0).sort((a, b) => b.avg - a.avg);
  }, [surveys, STORES]);

  // ── Comments with sentiment ──
  const comments = useMemo(() => {
    return surveys.filter(s => s.comment).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 20)
      .map(s => ({ ...s, sentiment: sentimentOf(s.comment) }));
  }, [surveys]);

  // ── NPS (q5: 5=promoter, 4=passive, 1-3=detractor) ──
  const nps = useMemo(() => {
    const rated = surveys.filter(s => s.ratings?.q5 > 0);
    if (!rated.length) return { score: 0, promoters: 0, passives: 0, detractors: 0, total: 0 };
    const promoters = rated.filter(s => s.ratings.q5 >= 5).length;
    const detractors = rated.filter(s => s.ratings.q5 <= 3).length;
    const passives = rated.length - promoters - detractors;
    return { score: Math.round(((promoters - detractors) / rated.length) * 100), promoters, passives, detractors, total: rated.length };
  }, [surveys]);

  // ── Improvement actions ──
  const addAction = () => {
    if (!newAction.trim()) return;
    const updated = [...actions, { id: Date.now(), text: newAction.trim(), date: new Date().toISOString().substring(0, 10), done: false }];
    setActions(updated); saveActions(updated); setNewAction(''); showToast?.('已新增改善項目');
  };
  const toggleAction = (id) => {
    const updated = actions.map(a => a.id === id ? { ...a, done: !a.done } : a);
    setActions(updated); saveActions(updated);
  };
  const removeAction = (id) => {
    const updated = actions.filter(a => a.id !== id);
    setActions(updated); saveActions(updated);
  };

  // ── Print ──
  const handlePrint = () => {
    const clinic = getClinicName();
    const catRows = catScores.map(c => `<tr><td>${c.label}</td><td style="text-align:right;font-weight:700;color:${scoreColor(c.avg)}">${c.avg}/5</td><td style="text-align:right">${c.count}份</td></tr>`).join('');
    const docRows = byDoctor.map(d => `<tr><td>${d.doctor}</td><td style="text-align:right;font-weight:700">${d.avg}/5</td><td style="text-align:right">${d.count}份</td></tr>`).join('');
    const storeRows = byStore.map(s => `<tr><td>${s.store}</td><td style="text-align:right;font-weight:700">${s.avg}/5</td><td style="text-align:right">${s.count}份</td></tr>`).join('');
    const html = `<html><head><title>滿意度分析報告</title><style>body{font-family:sans-serif;padding:24px;color:#1e293b}h1{color:${ACCENT};font-size:18px}h2{font-size:14px;margin-top:20px;color:${ACCENT}}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #e2e8f0;padding:6px 10px;font-size:12px}th{background:#f1f5f9;font-weight:700}.big{font-size:36px;font-weight:800;color:${ACCENT};text-align:center;margin:16px 0}</style></head><body>` +
      `<h1>${clinic} - 病人滿意度分析報告</h1><p style="font-size:12px;color:#64748b">列印日期：${new Date().toLocaleDateString('zh-TW')}</p>` +
      `<div class="big">${overall?.score || 0}/5</div><p style="text-align:center;font-size:12px;color:#64748b">共 ${overall?.count || 0} 份問卷 | NPS: ${nps.score}</p>` +
      `<h2>分項評分</h2><table><thead><tr><th>項目</th><th style="text-align:right">平均分</th><th style="text-align:right">份數</th></tr></thead><tbody>${catRows}</tbody></table>` +
      `<h2>醫師評分</h2><table><thead><tr><th>醫師</th><th style="text-align:right">平均分</th><th style="text-align:right">份數</th></tr></thead><tbody>${docRows}</tbody></table>` +
      (storeRows ? `<h2>分店評分</h2><table><thead><tr><th>分店</th><th style="text-align:right">平均分</th><th style="text-align:right">份數</th></tr></thead><tbody>${storeRows}</tbody></table>` : '') +
      `</body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html); w.document.close(); w.print();
  };

  const barMax = 5;
  const S = {
    card: { background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
    h2: { fontSize: 14, fontWeight: 800, color: ACCENT, marginBottom: 12, marginTop: 0 },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
    badge: (bg, fg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: bg, color: fg }),
  };

  if (!surveys.length) return (
    <div style={S.card}><h2 style={S.h2}>滿意度分析報告</h2><p style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>暫無問卷數據</p></div>
  );

  return (
    <div>
      {/* Header + Print */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: ACCENT, margin: 0 }}>滿意度分析報告</h2>
        <button onClick={handlePrint} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>列印報告</button>
      </div>

      {/* Overall Score */}
      <div style={{ ...S.card, textAlign: 'center', background: `linear-gradient(135deg, ${ACCENT}11, ${ACCENT}22)` }}>
        <div style={{ fontSize: 48, fontWeight: 900, color: ACCENT }}>{overall.score}<span style={{ fontSize: 20 }}>/5</span></div>
        <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
          綜合滿意度（共 {overall.count} 份問卷）
          <span style={{ marginLeft: 8, fontWeight: 700, color: overall.diff >= 0 ? '#16a34a' : '#dc2626' }}>
            {overall.diff >= 0 ? '▲' : '▼'} {Math.abs(overall.diff)}
          </span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}> vs 上月</span>
        </div>
      </div>

      {/* Category Scores */}
      <div style={S.card}>
        <h3 style={S.h2}>分項評分</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {catScores.map(c => (
            <div key={c.key} style={{ textAlign: 'center', padding: 12, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: scoreColor(c.avg) }}>{c.avg}</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.count} 份</div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.grid2}>
        {/* Monthly Trend Bar Chart */}
        <div style={S.card}>
          <h3 style={S.h2}>月度趨勢</h3>
          {monthly.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140 }}>
              {monthly.map(m => (
                <div key={m.month} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, marginBottom: 2 }}>{m.avg}</div>
                  <div style={{ background: ACCENT, borderRadius: '4px 4px 0 0', height: `${(m.avg / barMax) * 100}%`, minHeight: 4, transition: 'height .3s' }} />
                  <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 4 }}>{m.label}</div>
                </div>
              ))}
            </div>
          ) : <p style={{ color: '#94a3b8', textAlign: 'center' }}>數據不足</p>}
        </div>

        {/* NPS Score */}
        <div style={S.card}>
          <h3 style={S.h2}>NPS 淨推薦值</h3>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: nps.score >= 50 ? '#16a34a' : nps.score >= 0 ? '#d97706' : '#dc2626' }}>{nps.score}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{nps.total} 人評分</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ label: '推薦者', val: nps.promoters, color: '#16a34a' }, { label: '中立者', val: nps.passives, color: '#d97706' }, { label: '貶損者', val: nps.detractors, color: '#dc2626' }].map(g => (
              <div key={g.label} style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: g.color, fontWeight: 600 }}>{g.label}</span><span style={{ fontWeight: 700 }}>{g.val}</span>
                </div>
                <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4 }}>
                  <div style={{ width: `${nps.total ? (g.val / nps.total) * 100 : 0}%`, height: '100%', background: g.color, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={S.grid2}>
        {/* Doctor Comparison */}
        <div style={S.card}>
          <h3 style={S.h2}>醫師評分排名</h3>
          {byDoctor.length ? byDoctor.map((d, i) => (
            <div key={d.doctor} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < byDoctor.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#d97706' : '#e2e8f0', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{d.doctor}</span>
              <span style={{ fontWeight: 800, fontSize: 14, color: scoreColor(d.avg) }}>{d.avg}</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>{d.count}份</span>
            </div>
          )) : <p style={{ color: '#94a3b8', fontSize: 12 }}>暫無數據</p>}
        </div>

        {/* Store Comparison */}
        <div style={S.card}>
          <h3 style={S.h2}>分店評分比較</h3>
          {byStore.length ? byStore.map(s => (
            <div key={s.store} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ fontWeight: 600 }}>{s.store}</span>
                <span style={{ fontWeight: 800, color: scoreColor(s.avg) }}>{s.avg}/5 ({s.count}份)</span>
              </div>
              <div style={{ height: 10, background: '#e2e8f0', borderRadius: 6 }}>
                <div style={{ width: `${(s.avg / barMax) * 100}%`, height: '100%', background: ACCENT, borderRadius: 6, transition: 'width .3s' }} />
              </div>
            </div>
          )) : <p style={{ color: '#94a3b8', fontSize: 12 }}>暫無數據</p>}
        </div>
      </div>

      {/* Comments Analysis */}
      <div style={S.card}>
        <h3 style={S.h2}>病人評語分析</h3>
        {comments.length ? (
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {comments.map((c, i) => (
              <div key={c.id || i} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span><strong>{c.patientName || '匿名'}</strong>{c.doctor && <span style={{ color: '#94a3b8', marginLeft: 6 }}>({c.doctor})</span>}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={S.badge(sentimentColor[c.sentiment] + '18', sentimentColor[c.sentiment])}>{sentimentLabel[c.sentiment]}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{(c.date || '').substring(0, 10)}</span>
                  </span>
                </div>
                <div style={{ color: '#475569', lineHeight: 1.5 }}>{c.comment}</div>
              </div>
            ))}
          </div>
        ) : <p style={{ color: '#94a3b8', textAlign: 'center' }}>暫無評語</p>}
      </div>

      {/* Improvement Tracking */}
      <div style={S.card}>
        <h3 style={S.h2}>改善追蹤</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input value={newAction} onChange={e => setNewAction(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAction()}
            placeholder="新增改善項目..." style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none' }} />
          <button onClick={addAction} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>新增</button>
        </div>
        {actions.length ? actions.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
            <input type="checkbox" checked={a.done} onChange={() => toggleAction(a.id)} style={{ accentColor: ACCENT }} />
            <span style={{ flex: 1, textDecoration: a.done ? 'line-through' : 'none', color: a.done ? '#94a3b8' : '#1e293b' }}>{a.text}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{a.date}</span>
            <button onClick={() => removeAction(a.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>x</button>
          </div>
        )) : <p style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>尚未新增改善項目</p>}
      </div>
    </div>
  );
}
