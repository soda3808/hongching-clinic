import { useState, useMemo } from 'react';
import { getDoctors, getStoreNames } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_patient_feedback';
const CATS = [
  { key: 'effectiveness', label: '療效' }, { key: 'doctorAttitude', label: '醫師態度' },
  { key: 'receptionAttitude', label: '接待處態度' }, { key: 'waitTime', label: '等候時間' },
  { key: 'cleanliness', label: '環境衛生' },
];
function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function save(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); }
function toMonth(d) { return d ? String(d).substring(0, 7) : ''; }
function starColor(v) { return v >= 4 ? '#16a34a' : v === 3 ? '#d97706' : '#dc2626'; }

function Stars({ value, size = 16, interactive, onChange }) {
  return (<span style={{ display: 'inline-flex', gap: 2 }}>{[1,2,3,4,5].map(n =>
    <span key={n} onClick={() => interactive && onChange?.(n)}
      style={{ cursor: interactive ? 'pointer' : 'default', fontSize: size, color: n <= value ? starColor(value) : '#d1d5db' }}>★</span>
  )}</span>);
}

export default function PatientFeedback({ data, showToast, user }) {
  const DOCTORS = getDoctors(), STORES = getStoreNames();
  const consultations = data.consultations || [];
  const [feedbacks, setFeedbacks] = useState(load);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCon, setSelectedCon] = useState(null);
  const [ratings, setRatings] = useState({});
  const [suggestion, setSuggestion] = useState('');
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo] = useState('');
  const [fDoctor, setFDoctor] = useState('all');
  const [fStore, setFStore] = useState('all');
  const [fRating, setFRating] = useState('all');
  const thisMonth = new Date().toISOString().substring(0, 7);

  const conResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return consultations.filter(c => (c.patientName || '').toLowerCase().includes(q)).slice(0, 8);
  }, [search, consultations]);

  const filtered = useMemo(() => {
    let list = [...feedbacks];
    if (fDateFrom) list = list.filter(f => f.ratingDate >= fDateFrom);
    if (fDateTo) list = list.filter(f => f.ratingDate <= fDateTo);
    if (fDoctor !== 'all') list = list.filter(f => f.doctor === fDoctor);
    if (fStore !== 'all') list = list.filter(f => f.store === fStore);
    if (fRating === 'high') list = list.filter(f => f.avgScore >= 4);
    if (fRating === 'low') list = list.filter(f => f.avgScore <= 2);
    return list.sort((a, b) => (b.ratingDate || '').localeCompare(a.ratingDate || ''));
  }, [feedbacks, fDateFrom, fDateTo, fDoctor, fStore, fRating]);

  const stats = useMemo(() => {
    const n = feedbacks.length;
    if (!n) return { avg: 0, catAvg: CATS.map(c => ({ ...c, avg: 0 })), doctorRank: [], monthCount: 0 };
    const avg = +(feedbacks.reduce((s, f) => s + (f.avgScore || 0), 0) / n).toFixed(1);
    const catAvg = CATS.map(c => {
      const vals = feedbacks.map(f => f.ratings?.[c.key] || 0).filter(v => v > 0);
      return { ...c, avg: vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : 0 };
    });
    const dm = {};
    feedbacks.forEach(f => { if (!f.doctor) return; if (!dm[f.doctor]) dm[f.doctor] = []; dm[f.doctor].push(f.avgScore || 0); });
    const doctorRank = Object.entries(dm).map(([name, sc]) => ({
      name, avg: +(sc.reduce((s, v) => s + v, 0) / sc.length).toFixed(1), count: sc.length,
    })).sort((a, b) => b.avg - a.avg);
    return { avg, catAvg, doctorRank, monthCount: feedbacks.filter(f => toMonth(f.ratingDate) === thisMonth).length };
  }, [feedbacks, thisMonth]);

  const trend = useMemo(() => {
    const cur = feedbacks.filter(f => toMonth(f.ratingDate) === thisMonth);
    const pm = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().substring(0, 7); })();
    const prevF = feedbacks.filter(f => toMonth(f.ratingDate) === pm);
    const cA = cur.length ? cur.reduce((s, f) => s + (f.avgScore || 0), 0) / cur.length : 0;
    const pA = prevF.length ? prevF.reduce((s, f) => s + (f.avgScore || 0), 0) / prevF.length : 0;
    if (!prevF.length) return { dir: '-', diff: 0 };
    return cA >= pA ? { dir: '↑', diff: +(cA - pA).toFixed(1) } : { dir: '↓', diff: +(pA - cA).toFixed(1) };
  }, [feedbacks, thisMonth]);

  const handleSelect = (c) => { setSelectedCon(c); setSearch(c.patientName || ''); setRatings({}); setSuggestion(''); };

  const handleSave = () => {
    if (!selectedCon) return showToast('請選擇顧客');
    if (!CATS.some(c => (ratings[c.key] || 0) > 0)) return showToast('請至少評分一項');
    const vals = CATS.map(c => ratings[c.key] || 0).filter(v => v > 0);
    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      conId: selectedCon.id, regNo: selectedCon.id?.slice(-5) || '-',
      patientName: selectedCon.patientName, date: selectedCon.date,
      doctor: selectedCon.doctor, dispenser: selectedCon.dispenser || '-',
      cashier: selectedCon.cashier || user?.name || '-', store: selectedCon.store || '',
      ratingDate: new Date().toISOString().substring(0, 10),
      ratings: { ...ratings }, avgScore: +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1), suggestion,
    };
    const next = [...feedbacks, record]; setFeedbacks(next); save(next);
    setShowModal(false); setSelectedCon(null); setSearch(''); setRatings({}); setSuggestion('');
    showToast('評分已儲存');
  };

  const handleDelete = (id) => { const next = feedbacks.filter(f => f.id !== id); setFeedbacks(next); save(next); showToast('已刪除'); };

  const handlePrint = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const catR = stats.catAvg.map(c => `<tr><td>${escapeHtml(c.label)}</td><td style="text-align:right;font-weight:700;color:${starColor(c.avg)}">${c.avg}/5</td></tr>`).join('');
    const docR = stats.doctorRank.map((d, i) => `<tr><td>${i+1}. ${escapeHtml(d.name)}</td><td style="text-align:right;font-weight:700;color:${starColor(d.avg)}">${d.avg}/5</td><td style="text-align:right">${d.count}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>評分報告</title><style>body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:700px;margin:0 auto;font-size:13px}h1{font-size:18px;text-align:center;color:#0e7490}.sub{text-align:center;color:#888;font-size:11px;margin-bottom:20px}h2{font-size:14px;border-bottom:2px solid #0e7490;padding-bottom:4px;margin-top:20px;color:#0e7490}table{width:100%;border-collapse:collapse;margin-bottom:16px}th,td{padding:6px 10px;border-bottom:1px solid #eee;text-align:left}th{background:#f8f8f8;font-weight:700}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}.b{border:1px solid #ddd;border-radius:8px;padding:12px;text-align:center}.b .n{font-size:22px;font-weight:800}.b .l{font-size:10px;color:#888}@media print{body{margin:0;padding:10mm}}</style></head><body>
    <h1>${escapeHtml(getClinicName())} — 顧客評分報告</h1><div class="sub">列印時間：${new Date().toLocaleString('zh-HK')} | 總評分數：${feedbacks.length}</div>
    <div class="g"><div class="b"><div class="n" style="color:#0e7490">${stats.avg}/5</div><div class="l">平均評分</div></div><div class="b"><div class="n" style="color:#16a34a">${stats.monthCount}</div><div class="l">本月評分</div></div><div class="b"><div class="n" style="color:${trend.dir==='↑'?'#16a34a':'#dc2626'}">${trend.dir}${trend.diff}</div><div class="l">月度變化</div></div></div>
    <h2>各項目平均分</h2><table><thead><tr><th>項目</th><th style="text-align:right">平均分</th></tr></thead><tbody>${catR}</tbody></table>
    <h2>醫師評分排名</h2><table><thead><tr><th>醫師</th><th style="text-align:right">平均分</th><th style="text-align:right">評分數</th></tr></thead><tbody>${docR}</tbody></table></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  const handleCopy = () => {
    if (!filtered.length) return showToast('沒有數據可複製');
    const h = '掛號編號\t掛號日期\t顧客姓名\t診所\t醫師\t療效\t醫師態度\t接待處態度\t等候時間\t環境衛生\t平均分\t建議';
    const rows = filtered.map(f => `${f.regNo}\t${f.date}\t${f.patientName}\t${f.store}\t${f.doctor}\t${f.ratings?.effectiveness||'-'}\t${f.ratings?.doctorAttitude||'-'}\t${f.ratings?.receptionAttitude||'-'}\t${f.ratings?.waitTime||'-'}\t${f.ratings?.cleanliness||'-'}\t${f.avgScore}\t${f.suggestion||''}`);
    navigator.clipboard.writeText([h, ...rows].join('\n')).then(() => showToast('已複製到剪貼板'));
  };

  const s = {
    card: { background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 12 },
    hdr: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontWeight: 700, fontSize: 14, color: '#0e7490' },
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
        <div style={{ fontSize: 10, color: '#0e7490', fontWeight: 600 }}>平均評分</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#0e7490' }}>{stats.avg}<span style={{ fontSize: 12 }}>/5</span></div>
        <div style={{ fontSize: 11, color: trend.dir === '↑' ? '#16a34a' : trend.dir === '↓' ? '#dc2626' : '#888' }}>
          {trend.dir !== '-' ? `${trend.dir} ${trend.diff}` : '-'} vs 上月
        </div>
      </div>
      <div style={{ ...s.stat, background: '#f0fdf4' }}>
        <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>本月評分數量</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>{stats.monthCount}</div>
      </div>
      {stats.catAvg.slice(0, 3).map(c => (
        <div key={c.key} style={{ ...s.stat, background: '#fafafa', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{c.label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: starColor(c.avg) }}>{c.avg}<span style={{ fontSize: 11 }}>/5</span></div>
        </div>
      ))}
    </div>

    {/* Category Averages + Doctor Ranking */}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
      <div style={s.card}>
        <div style={s.hdr}>各項目平均分</div>
        <div style={{ padding: 12 }}>{stats.catAvg.map(c => (
          <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 70, fontSize: 12, fontWeight: 600 }}>{c.label}</span>
            <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 6, height: 14, overflow: 'hidden' }}>
              <div style={{ width: `${c.avg/5*100}%`, height: '100%', background: starColor(c.avg), borderRadius: 6, transition: 'width .4s' }} />
            </div>
            <span style={{ width: 32, fontSize: 12, fontWeight: 700, textAlign: 'right', color: starColor(c.avg) }}>{c.avg}</span>
          </div>
        ))}</div>
      </div>
      <div style={s.card}>
        <div style={s.hdr}>醫師評分排名</div>
        <div style={{ padding: 12 }}>
          {!stats.doctorRank.length && <div style={{ textAlign: 'center', color: '#aaa', padding: 20, fontSize: 12 }}>暫無數據</div>}
          {stats.doctorRank.map((d, i) => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 20, fontSize: 13, fontWeight: 800, color: i === 0 ? '#d97706' : '#9ca3af' }}>{i+1}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{d.name}</span>
              <Stars value={Math.round(d.avg)} size={13} />
              <span style={{ fontSize: 12, fontWeight: 700, color: starColor(d.avg) }}>{d.avg}</span>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>({d.count})</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Filters + Actions */}
    <div style={{ ...s.card, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input type="date" style={{ ...s.inp, width: 130 }} value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} />
      <span style={{ fontSize: 12, color: '#9ca3af' }}>至</span>
      <input type="date" style={{ ...s.inp, width: 130 }} value={fDateTo} onChange={e => setFDateTo(e.target.value)} />
      <select style={{ ...s.inp, width: 100 }} value={fDoctor} onChange={e => setFDoctor(e.target.value)}>
        <option value="all">全部醫師</option>{DOCTORS.map(d => <option key={d}>{d}</option>)}
      </select>
      <select style={{ ...s.inp, width: 100 }} value={fStore} onChange={e => setFStore(e.target.value)}>
        <option value="all">全部診所</option>{STORES.map(st => <option key={st}>{st}</option>)}
      </select>
      <select style={{ ...s.inp, width: 100 }} value={fRating} onChange={e => setFRating(e.target.value)}>
        <option value="all">全部評分</option><option value="high">高分 (≥4)</option><option value="low">低分 (≤2)</option>
      </select>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <button style={{ ...s.btn, background: '#f3f4f6', color: '#374151' }} onClick={handleCopy}>複製數據</button>
        <button style={{ ...s.btn, background: '#fef3c7', color: '#92400e' }} onClick={handlePrint}>列印報告</button>
        <button style={{ ...s.btn, background: '#0e7490', color: '#fff' }} onClick={() => setShowModal(true)}>+ 新增評分</button>
      </div>
    </div>

    {/* Feedback Table */}
    <div style={{ ...s.card, padding: 0 }}>
      <div style={s.hdr}>評分記錄 ({filtered.length})</div>
      <div style={{ overflowX: 'auto', maxHeight: 480 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['掛號編號','掛號日期','顧客姓名','診所','醫師','配藥員','收費員','評分日期','療效','醫師態度','接待處態度','建議',''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {!filtered.length && <tr><td colSpan={13} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無評分記錄</td></tr>}
            {filtered.map(f => (<tr key={f.id}>
              <td style={s.td}>{f.regNo}</td><td style={s.td}>{f.date}</td>
              <td style={{ ...s.td, fontWeight: 600 }}>{f.patientName}</td>
              <td style={s.td}>{f.store || '-'}</td><td style={s.td}>{f.doctor}</td>
              <td style={s.td}>{f.dispenser}</td><td style={s.td}>{f.cashier}</td>
              <td style={s.td}>{f.ratingDate}</td>
              <td style={s.td}><Stars value={f.ratings?.effectiveness||0} size={13} /></td>
              <td style={s.td}><Stars value={f.ratings?.doctorAttitude||0} size={13} /></td>
              <td style={s.td}><Stars value={f.ratings?.receptionAttitude||0} size={13} /></td>
              <td style={{ ...s.td, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.suggestion || '-'}</td>
              <td style={s.td}><button style={{ ...s.btn, background: '#fee2e2', color: '#dc2626', fontSize: 11, padding: '3px 8px' }} onClick={() => handleDelete(f.id)}>刪除</button></td>
            </tr>))}
          </tbody>
        </table>
      </div>
    </div>

    {/* Add Feedback Modal */}
    {showModal && (
      <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 440, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#0e7490' }}>新增顧客評分</span>
            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
          </div>
          <div style={{ marginBottom: 12, position: 'relative' }}>
            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>顧客姓名 *</label>
            <input style={s.inp} placeholder="搜尋顧客姓名..." value={search} onChange={e => { setSearch(e.target.value); setSelectedCon(null); }} />
            {conResults.length > 0 && !selectedCon && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, maxHeight: 180, overflowY: 'auto', zIndex: 10 }}>
                {conResults.map(c => (
                  <div key={c.id} onClick={() => handleSelect(c)} style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{c.patientName}</span>
                    <span style={{ color: '#9ca3af' }}>{c.date} · {c.doctor}</span>
                  </div>))}
              </div>)}
          </div>
          {selectedCon && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <div><label style={{ fontSize: 11, color: '#6b7280' }}>掛號日期</label><div style={{ fontSize: 13, fontWeight: 600 }}>{selectedCon.date}</div></div>
              <div><label style={{ fontSize: 11, color: '#6b7280' }}>醫師</label><div style={{ fontSize: 13, fontWeight: 600 }}>{selectedCon.doctor}</div></div>
            </div>)}
          <div style={{ marginBottom: 14 }}>{CATS.map(c => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</span>
              <Stars value={ratings[c.key] || 0} size={20} interactive onChange={v => setRatings(r => ({ ...r, [c.key]: v }))} />
            </div>))}</div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>建議</label>
            <textarea rows={3} style={{ ...s.inp, resize: 'vertical' }} placeholder="顧客的建議或意見（選填）" value={suggestion} onChange={e => setSuggestion(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...s.btn, background: '#0e7490', color: '#fff', flex: 1 }} onClick={handleSave}>儲存評分</button>
            <button style={{ ...s.btn, background: '#f3f4f6', color: '#374151' }} onClick={() => setShowModal(false)}>取消</button>
          </div>
        </div>
      </div>)}
  </>);
}
