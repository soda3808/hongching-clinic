import { useState, useMemo } from 'react';
import { getDoctors } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_doctor_ratings';
const ACCENT = '#0e7490';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const DIMS = [
  { key: 'professional', label: '專業能力' }, { key: 'communication', label: '溝通態度' },
  { key: 'waitTime', label: '等候時間' }, { key: 'effectiveness', label: '治療效果' },
  { key: 'overall', label: '整體滿意度' },
];
function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function save(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); }
function toMonth(d) { return d ? String(d).substring(0, 7) : ''; }
function starClr(v) { return v >= 4 ? '#16a34a' : v === 3 ? '#d97706' : '#dc2626'; }
function avgOf(arr) { return arr.length ? +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1) : 0; }

function Stars({ value, size = 16, interactive, onChange }) {
  return (<span style={{ display: 'inline-flex', gap: 2 }}>{[1,2,3,4,5].map(n =>
    <span key={n} onClick={() => interactive && onChange?.(n)}
      style={{ cursor: interactive ? 'pointer' : 'default', fontSize: size, color: n <= value ? starClr(value) : '#d1d5db' }}>★</span>
  )}</span>);
}

export default function DoctorRating({ data, showToast, user }) {
  const DOCTORS = getDoctors();
  const patients = data?.patients || [];
  const [reviews, setReviews] = useState(load);
  const [view, setView] = useState('board'); // board | detail | add
  const [selDoc, setSelDoc] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ patientName: '', doctor: DOCTORS[0] || '', ratings: {}, comment: '', isAnonymous: false });
  const [filterDoc, setFilterDoc] = useState('all');
  const [filterRating, setFilterRating] = useState('all');
  const [replyMap, setReplyMap] = useState({});

  const persist = (next) => { setReviews(next); save(next); };

  // ── Leaderboard ──
  const leaderboard = useMemo(() => {
    const dm = {};
    reviews.forEach(r => { if (!r.doctor) return; if (!dm[r.doctor]) dm[r.doctor] = []; dm[r.doctor].push(r); });
    return DOCTORS.map(doc => {
      const recs = dm[doc] || [];
      const avg = avgOf(recs.map(r => r.avgScore || 0));
      return { name: doc, avg, count: recs.length };
    }).sort((a, b) => b.avg - a.avg || b.count - a.count);
  }, [reviews, DOCTORS]);

  // ── Global Stats ──
  const stats = useMemo(() => {
    const n = reviews.length;
    const avg = avgOf(reviews.map(r => r.avgScore || 0));
    const promoters = reviews.filter(r => (r.ratings?.overall || 0) >= 4).length;
    const detractors = reviews.filter(r => (r.ratings?.overall || 0) <= 2).length;
    const nps = n ? Math.round((promoters - detractors) / n * 100) : 0;
    return { total: n, avg, nps };
  }, [reviews]);

  // ── Per-Doctor Detail ──
  const detail = useMemo(() => {
    if (!selDoc) return null;
    const recs = reviews.filter(r => r.doctor === selDoc);
    const dimAvg = DIMS.map(d => ({ ...d, avg: avgOf(recs.map(r => r.ratings?.[d.key] || 0)) }));
    // Rating distribution
    const dist = [0,0,0,0,0];
    recs.forEach(r => { const s = Math.round(r.avgScore || 0); if (s >= 1 && s <= 5) dist[s-1]++; });
    // Monthly trend (last 6 months)
    const mm = {};
    recs.forEach(r => { const m = toMonth(r.date); if (!m) return; if (!mm[m]) mm[m] = []; mm[m].push(r.avgScore || 0); });
    const trend = Object.entries(mm).sort((a,b) => a[0].localeCompare(b[0])).slice(-6).map(([m, vals]) => ({ month: m, avg: avgOf(vals), count: vals.length }));
    const recent = [...recs].sort((a,b) => (b.date||'').localeCompare(a.date||'')).slice(0, 10);
    return { recs, dimAvg, dist, trend, recent, avg: avgOf(recs.map(r => r.avgScore || 0)), count: recs.length };
  }, [selDoc, reviews]);

  // ── Filtered Reviews ──
  const filtered = useMemo(() => {
    let list = [...reviews];
    if (filterDoc !== 'all') list = list.filter(r => r.doctor === filterDoc);
    if (filterRating === 'high') list = list.filter(r => r.avgScore >= 4);
    if (filterRating === 'low') list = list.filter(r => r.avgScore <= 2);
    return list.sort((a,b) => (b.date||'').localeCompare(a.date||''));
  }, [reviews, filterDoc, filterRating]);

  // Patient search
  const patientSuggestions = useMemo(() => {
    if (!form.patientName.trim()) return [];
    const q = form.patientName.trim().toLowerCase();
    return patients.filter(p => (p.name||'').toLowerCase().includes(q)).slice(0, 6);
  }, [form.patientName, patients]);

  const handleSave = () => {
    if (!form.patientName.trim() && !form.isAnonymous) return showToast('請輸入病人姓名');
    if (!DIMS.some(d => (form.ratings[d.key] || 0) > 0)) return showToast('請至少評分一項');
    const vals = DIMS.map(d => form.ratings[d.key] || 0).filter(v => v > 0);
    const record = {
      id: uid(), patientName: form.isAnonymous ? '匿名' : form.patientName.trim(),
      doctor: form.doctor, date: new Date().toISOString().substring(0, 10),
      ratings: { ...form.ratings }, avgScore: avgOf(vals),
      comment: form.comment.trim(), isAnonymous: form.isAnonymous, flagged: false, reply: '',
    };
    persist([...reviews, record]);
    setForm({ patientName: '', doctor: DOCTORS[0] || '', ratings: {}, comment: '', isAnonymous: false });
    setShowAdd(false);
    showToast('評價已儲存');
  };

  const handleFlag = (id) => { persist(reviews.map(r => r.id === id ? { ...r, flagged: !r.flagged } : r)); showToast('已標記'); };
  const handleDelete = (id) => { persist(reviews.filter(r => r.id !== id)); showToast('已刪除'); };
  const handleReply = (id) => {
    const text = (replyMap[id] || '').trim();
    if (!text) return showToast('請輸入回覆');
    persist(reviews.map(r => r.id === id ? { ...r, reply: text } : r));
    setReplyMap(m => ({ ...m, [id]: '' }));
    showToast('回覆已儲存');
  };

  const handlePrint = () => {
    const doc = selDoc || '全部醫師';
    const src = selDoc ? reviews.filter(r => r.doctor === selDoc) : reviews;
    const avg = avgOf(src.map(r => r.avgScore || 0));
    const dimRows = DIMS.map(d => {
      const a = avgOf(src.map(r => r.ratings?.[d.key] || 0));
      return `<tr><td>${escapeHtml(d.label)}</td><td style="text-align:right;font-weight:700;color:${starClr(a)}">${a}/5</td></tr>`;
    }).join('');
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>醫師評價報告</title><style>body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:700px;margin:0 auto;font-size:13px}h1{font-size:18px;text-align:center;color:${ACCENT}}h2{font-size:14px;border-bottom:2px solid ${ACCENT};padding-bottom:4px;margin-top:20px;color:${ACCENT}}.sub{text-align:center;color:#888;font-size:11px;margin-bottom:20px}table{width:100%;border-collapse:collapse}th,td{padding:6px 10px;border-bottom:1px solid #eee;text-align:left}th{background:#f8f8f8;font-weight:700}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}.b{border:1px solid #ddd;border-radius:8px;padding:12px;text-align:center}.b .n{font-size:22px;font-weight:800}.b .l{font-size:10px;color:#888}@media print{body{margin:0;padding:10mm}}</style></head><body>
    <h1>${escapeHtml(getClinicName())} — 醫師評價報告</h1><div class="sub">${escapeHtml(doc)} | 列印時間：${new Date().toLocaleString('zh-HK')} | 評價數：${src.length}</div>
    <div class="g"><div class="b"><div class="n" style="color:${ACCENT}">${avg}/5</div><div class="l">平均評分</div></div><div class="b"><div class="n">${src.length}</div><div class="l">評價總數</div></div><div class="b"><div class="n" style="color:${stats.nps>=0?'#16a34a':'#dc2626'}">${stats.nps}</div><div class="l">NPS 指數</div></div></div>
    <h2>各維度平均分</h2><table><thead><tr><th>維度</th><th style="text-align:right">平均分</th></tr></thead><tbody>${dimRows}</tbody></table></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  const s = {
    card: { background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 12 },
    hdr: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontWeight: 700, fontSize: 14, color: ACCENT },
    stat: { padding: 12, borderRadius: 8, textAlign: 'center', flex: 1, minWidth: 100 },
    inp: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' },
    btn: { padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    td: { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 12, whiteSpace: 'nowrap' },
    th: { padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 11, fontWeight: 700, textAlign: 'left', color: '#6b7280', whiteSpace: 'nowrap' },
  };

  return (<>
    {/* Stats Dashboard */}
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      <div style={{ ...s.stat, background: '#ecfeff' }}>
        <div style={{ fontSize: 10, color: ACCENT, fontWeight: 600 }}>總評價數</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: ACCENT }}>{stats.total}</div>
      </div>
      <div style={{ ...s.stat, background: '#f0fdf4' }}>
        <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>平均評分</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>{stats.avg}<span style={{ fontSize: 12 }}>/5</span></div>
      </div>
      <div style={{ ...s.stat, background: stats.nps >= 0 ? '#f0fdf4' : '#fef2f2' }}>
        <div style={{ fontSize: 10, color: stats.nps >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>NPS 指數</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: stats.nps >= 0 ? '#16a34a' : '#dc2626' }}>{stats.nps}</div>
      </div>
    </div>

    {/* Tabs + Actions */}
    <div style={{ ...s.card, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button style={{ ...s.btn, background: view === 'board' ? ACCENT : '#f3f4f6', color: view === 'board' ? '#fff' : '#374151' }} onClick={() => { setView('board'); setSelDoc(null); }}>排行榜</button>
      <button style={{ ...s.btn, background: view === 'detail' ? ACCENT : '#f3f4f6', color: view === 'detail' ? '#fff' : '#374151' }} onClick={() => setView('detail')}>醫師詳情</button>
      {view === 'detail' && <select style={{ ...s.inp, width: 120 }} value={selDoc || ''} onChange={e => setSelDoc(e.target.value || null)}>
        <option value="">選擇醫師</option>{DOCTORS.map(d => <option key={d}>{d}</option>)}
      </select>}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <button style={{ ...s.btn, background: '#fef3c7', color: '#92400e' }} onClick={handlePrint}>列印報告</button>
        <button style={{ ...s.btn, background: ACCENT, color: '#fff' }} onClick={() => setShowAdd(true)}>+ 新增評價</button>
      </div>
    </div>

    {/* Leaderboard View */}
    {view === 'board' && (<>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={s.card}>
          <div style={s.hdr}>醫師排行榜</div>
          <div style={{ padding: 12 }}>
            {!leaderboard.length && <div style={{ textAlign: 'center', color: '#aaa', padding: 20, fontSize: 12 }}>暫無數據</div>}
            {leaderboard.map((d, i) => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }} onClick={() => { setSelDoc(d.name); setView('detail'); }}>
                <span style={{ width: 22, fontSize: 14, fontWeight: 800, color: i === 0 ? '#d97706' : i === 1 ? '#9ca3af' : i === 2 ? '#CD7F32' : '#d1d5db' }}>{i+1}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{d.name}</span>
                <Stars value={Math.round(d.avg)} size={13} />
                <span style={{ fontSize: 12, fontWeight: 700, color: starClr(d.avg) }}>{d.avg}</span>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>({d.count})</span>
              </div>))}
          </div>
        </div>
        <div style={s.card}>
          <div style={s.hdr}>各維度總覽</div>
          <div style={{ padding: 12 }}>{DIMS.map(d => {
            const a = avgOf(reviews.map(r => r.ratings?.[d.key] || 0));
            return (<div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 70, fontSize: 12, fontWeight: 600 }}>{d.label}</span>
              <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                <div style={{ width: `${a/5*100}%`, height: '100%', background: starClr(a), borderRadius: 6, transition: 'width .4s' }} />
              </div>
              <span style={{ width: 32, fontSize: 12, fontWeight: 700, textAlign: 'right', color: starClr(a) }}>{a}</span>
            </div>);
          })}</div>
        </div>
      </div>

      {/* Review List */}
      <div style={{ ...s.card, padding: 10, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 0 }}>
        <select style={{ ...s.inp, width: 120 }} value={filterDoc} onChange={e => setFilterDoc(e.target.value)}>
          <option value="all">全部醫師</option>{DOCTORS.map(d => <option key={d}>{d}</option>)}
        </select>
        <select style={{ ...s.inp, width: 120 }} value={filterRating} onChange={e => setFilterRating(e.target.value)}>
          <option value="all">全部評分</option><option value="high">高分 (≥4)</option><option value="low">低分 (≤2)</option>
        </select>
        <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>共 {filtered.length} 條評價</span>
      </div>
      <div style={{ ...s.card, padding: 0 }}>
        <div style={{ overflowX: 'auto', maxHeight: 400 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['日期','病人','醫師','專業','溝通','等候','療效','整體','評語','操作'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {!filtered.length && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無評價記錄</td></tr>}
              {filtered.map(r => (<tr key={r.id} style={{ background: r.flagged ? '#fef2f2' : 'transparent' }}>
                <td style={s.td}>{r.date}</td>
                <td style={{ ...s.td, fontWeight: 600 }}>{r.isAnonymous ? '匿名' : r.patientName}</td>
                <td style={s.td}>{r.doctor}</td>
                {['professional','communication','waitTime','effectiveness','overall'].map(k => <td key={k} style={s.td}><Stars value={r.ratings?.[k]||0} size={12} /></td>)}
                <td style={{ ...s.td, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.comment || '-'}</td>
                <td style={s.td}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button style={{ ...s.btn, background: r.flagged ? '#fecaca' : '#f3f4f6', color: r.flagged ? '#dc2626' : '#374151', fontSize: 11, padding: '3px 6px' }} onClick={() => handleFlag(r.id)}>{r.flagged ? '已標記' : '標記'}</button>
                    <button style={{ ...s.btn, background: '#fee2e2', color: '#dc2626', fontSize: 11, padding: '3px 6px' }} onClick={() => handleDelete(r.id)}>刪除</button>
                  </div>
                </td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>
    </>)}

    {/* Doctor Detail View */}
    {view === 'detail' && selDoc && detail && (<>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ ...s.stat, background: '#ecfeff' }}>
          <div style={{ fontSize: 10, color: ACCENT, fontWeight: 600 }}>{selDoc} 平均評分</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: ACCENT }}>{detail.avg}<span style={{ fontSize: 12 }}>/5</span></div>
        </div>
        <div style={{ ...s.stat, background: '#f0fdf4' }}>
          <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>評價數</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>{detail.count}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {/* Dimension Averages */}
        <div style={s.card}>
          <div style={s.hdr}>各維度平均分</div>
          <div style={{ padding: 12 }}>{detail.dimAvg.map(d => (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 70, fontSize: 12, fontWeight: 600 }}>{d.label}</span>
              <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                <div style={{ width: `${d.avg/5*100}%`, height: '100%', background: starClr(d.avg), borderRadius: 6, transition: 'width .4s' }} />
              </div>
              <span style={{ width: 32, fontSize: 12, fontWeight: 700, textAlign: 'right', color: starClr(d.avg) }}>{d.avg}</span>
            </div>
          ))}</div>
        </div>
        {/* Rating Distribution */}
        <div style={s.card}>
          <div style={s.hdr}>評分分佈</div>
          <div style={{ padding: 12 }}>{[5,4,3,2,1].map(star => {
            const cnt = detail.dist[star-1];
            const pct = detail.count ? Math.round(cnt / detail.count * 100) : 0;
            return (<div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 20, fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{star}★</span>
              <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: star >= 4 ? '#16a34a' : star === 3 ? '#d97706' : '#dc2626', borderRadius: 6, transition: 'width .4s' }} />
              </div>
              <span style={{ width: 40, fontSize: 11, color: '#6b7280' }}>{cnt} ({pct}%)</span>
            </div>);
          })}</div>
        </div>
      </div>
      {/* Monthly Trend */}
      {detail.trend.length > 0 && <div style={s.card}>
        <div style={s.hdr}>月度評分趨勢</div>
        <div style={{ padding: 12, display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
          {detail.trend.map(t => {
            const h = Math.max(10, (t.avg / 5) * 100);
            return (<div key={t.month} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: starClr(t.avg), marginBottom: 4 }}>{t.avg}</div>
              <div style={{ background: starClr(t.avg), height: h, borderRadius: 4, marginBottom: 4 }} />
              <div style={{ fontSize: 10, color: '#6b7280' }}>{t.month.substring(5)}月</div>
              <div style={{ fontSize: 9, color: '#9ca3af' }}>{t.count}則</div>
            </div>);
          })}
        </div>
      </div>}
      {/* Recent Reviews with Reply */}
      <div style={s.card}>
        <div style={s.hdr}>最近評價</div>
        <div style={{ padding: 12 }}>
          {!detail.recent.length && <div style={{ textAlign: 'center', color: '#aaa', padding: 20, fontSize: 12 }}>暫無評價</div>}
          {detail.recent.map(r => (
            <div key={r.id} style={{ padding: 10, borderBottom: '1px solid #f3f4f6', background: r.flagged ? '#fef2f2' : 'transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.isAnonymous ? '匿名' : r.patientName}</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{r.date}</span>
              </div>
              <Stars value={Math.round(r.avgScore || 0)} size={14} />
              <span style={{ fontSize: 12, fontWeight: 700, color: starClr(r.avgScore), marginLeft: 6 }}>{r.avgScore}</span>
              {r.comment && <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>{r.comment}</div>}
              {r.flagged && <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}> [已標記為不當]</span>}
              {r.reply && <div style={{ marginTop: 6, padding: 8, background: '#ecfeff', borderRadius: 6, fontSize: 12, color: ACCENT }}>醫師回覆：{r.reply}</div>}
              {!r.reply && <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                <input style={{ ...s.inp, flex: 1, fontSize: 12 }} placeholder="輸入回覆..." value={replyMap[r.id] || ''} onChange={e => setReplyMap(m => ({ ...m, [r.id]: e.target.value }))} />
                <button style={{ ...s.btn, background: ACCENT, color: '#fff', fontSize: 11, padding: '4px 10px' }} onClick={() => handleReply(r.id)}>回覆</button>
              </div>}
            </div>
          ))}
        </div>
      </div>
    </>)}
    {view === 'detail' && !selDoc && <div style={{ textAlign: 'center', color: '#aaa', padding: 40, fontSize: 13 }}>請從上方選擇醫師查看詳情</div>}

    {/* Add Review Modal */}
    {showAdd && (
      <div onClick={() => setShowAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 440, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>新增醫師評價</span>
            <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 13 }}>
            <input type="checkbox" checked={form.isAnonymous} onChange={e => setForm(f => ({ ...f, isAnonymous: e.target.checked }))} /> 匿名評價
          </label>
          {!form.isAnonymous && <div style={{ marginBottom: 10, position: 'relative' }}>
            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>病人姓名 *</label>
            <input style={s.inp} placeholder="輸入病人姓名..." value={form.patientName} onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))} />
            {patientSuggestions.length > 0 && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, maxHeight: 150, overflowY: 'auto', zIndex: 10 }}>
              {patientSuggestions.map(p => <div key={p.id || p.name} onClick={() => setForm(f => ({ ...f, patientName: p.name }))} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f3f4f6' }}>{p.name}</div>)}
            </div>}
          </div>}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>醫師 *</label>
            <select style={s.inp} value={form.doctor} onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))}>
              {DOCTORS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>{DIMS.map(d => (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</span>
              <Stars value={form.ratings[d.key] || 0} size={20} interactive onChange={v => setForm(f => ({ ...f, ratings: { ...f.ratings, [d.key]: v } }))} />
            </div>))}</div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>評語</label>
            <textarea rows={3} style={{ ...s.inp, resize: 'vertical' }} placeholder="對醫師的評語（選填）" value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...s.btn, background: ACCENT, color: '#fff', flex: 1 }} onClick={handleSave}>儲存評價</button>
            <button style={{ ...s.btn, background: '#f3f4f6', color: '#374151' }} onClick={() => setShowAdd(false)}>取消</button>
          </div>
        </div>
      </div>)}
  </>);
}
