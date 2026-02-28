import { useState, useMemo, useEffect } from 'react';
import { getClinicName } from '../tenant';
import { getDoctors } from '../data';

const LS_KEY = 'hcmc_testimonials';
const ACCENT = '#0e7490';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } };
const save = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));
const TREATMENTS = ['內科', '針灸', '推拿', '正骨', '拔罐', '刮痧', '天灸', '其他'];

function Stars({ value, size = 16, interactive, onChange }) {
  return (<span style={{ display: 'inline-flex', gap: 2 }}>{[1,2,3,4,5].map(n =>
    <span key={n} onClick={() => interactive && onChange?.(n)}
      style={{ cursor: interactive ? 'pointer' : 'default', fontSize: size, color: n <= value ? '#f59e0b' : '#d1d5db' }}>★</span>
  )}</span>);
}

export default function ClinicFeedbackWall({ data, showToast, user }) {
  const DOCTORS = getDoctors();
  const clinicName = getClinicName();
  const [items, setItems] = useState(load);
  const [tab, setTab] = useState('wall'); // wall | manage | stats
  const [viewMode, setViewMode] = useState('grid'); // grid | list | slideshow
  const [showAdd, setShowAdd] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const [slideInterval, setSlideInterval] = useState(5);
  const [filter, setFilter] = useState({ doctor: 'all', treatment: 'all', rating: 'all' });
  const [embedModal, setEmbedModal] = useState(false);
  const [form, setForm] = useState({ patientName: '', rating: 5, comment: '', treatment: TREATMENTS[0], doctor: DOCTORS[0] || '', anonymous: false, photo: '' });

  const approved = useMemo(() => {
    let list = items.filter(t => t.isApproved);
    if (filter.doctor !== 'all') list = list.filter(t => t.doctor === filter.doctor);
    if (filter.treatment !== 'all') list = list.filter(t => t.treatment === filter.treatment);
    if (filter.rating !== 'all') list = list.filter(t => t.rating === +filter.rating);
    const featured = list.filter(t => t.isFeatured).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const normal = list.filter(t => !t.isFeatured).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return [...featured, ...normal];
  }, [items, filter]);

  const pending = useMemo(() => items.filter(t => !t.isApproved).sort((a, b) => (b.date || '').localeCompare(a.date || '')), [items]);

  const stats = useMemo(() => {
    const total = items.length;
    const approvedCount = items.filter(t => t.isApproved).length;
    const avg = total ? +(items.reduce((s, t) => s + (t.rating || 0), 0) / total).toFixed(1) : 0;
    const rate = total ? +(approvedCount / total * 100).toFixed(0) : 0;
    const byRating = [5,4,3,2,1].map(r => ({ r, count: items.filter(t => t.rating === r).length }));
    const byDoctor = {};
    items.filter(t => t.isApproved).forEach(t => { if (!byDoctor[t.doctor]) byDoctor[t.doctor] = []; byDoctor[t.doctor].push(t.rating); });
    const doctorStats = Object.entries(byDoctor).map(([name, ratings]) => ({ name, avg: +(ratings.reduce((s, v) => s + v, 0) / ratings.length).toFixed(1), count: ratings.length })).sort((a, b) => b.avg - a.avg);
    return { total, approvedCount, avg, rate, byRating, doctorStats };
  }, [items]);

  // Slideshow auto-rotate
  useEffect(() => {
    if (viewMode !== 'slideshow' || !approved.length) return;
    const timer = setInterval(() => setSlideIdx(i => (i + 1) % approved.length), slideInterval * 1000);
    return () => clearInterval(timer);
  }, [viewMode, approved.length, slideInterval]);

  const persist = (next) => { setItems(next); save(next); };

  const handleAdd = () => {
    if (!form.comment.trim()) return showToast('請輸入評語');
    const entry = { id: uid(), patientName: form.anonymous ? '匿名' : (form.patientName || '匿名'), rating: form.rating, comment: form.comment, treatment: form.treatment, doctor: form.doctor, date: new Date().toISOString().slice(0, 10), isApproved: false, isFeatured: false, photo: form.photo || '' };
    persist([...items, entry]);
    setForm({ patientName: '', rating: 5, comment: '', treatment: TREATMENTS[0], doctor: DOCTORS[0] || '', anonymous: false, photo: '' });
    setShowAdd(false);
    showToast('感謝您的評價！待管理員審核後顯示。');
  };

  const handleApprove = (id) => { persist(items.map(t => t.id === id ? { ...t, isApproved: true } : t)); showToast('已審核通過'); };
  const handleReject = (id) => { persist(items.filter(t => t.id !== id)); showToast('已拒絕並刪除'); };
  const toggleFeatured = (id) => { persist(items.map(t => t.id === id ? { ...t, isFeatured: !t.isFeatured } : t)); showToast('已更新精選狀態'); };
  const handleDelete = (id) => { persist(items.filter(t => t.id !== id)); showToast('已刪除'); };

  const handlePhoto = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 500000) return showToast('圖片不可超過500KB');
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, photo: reader.result }));
    reader.readAsDataURL(file);
  };

  const generateShareCard = (t) => {
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>好評分享</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0f9ff;font-family:'PingFang TC',sans-serif}.card{width:400px;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.1);text-align:center}.stars{color:#f59e0b;font-size:28px;margin:12px 0}.quote{font-size:16px;color:#334155;line-height:1.6;margin:16px 0;font-style:italic}.meta{font-size:13px;color:#94a3b8;margin-top:12px}.clinic{font-size:14px;font-weight:700;color:${ACCENT};margin-top:16px;padding-top:12px;border-top:1px solid #e2e8f0}</style></head><body><div class="card">${t.photo ? `<img src="${t.photo}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;margin-bottom:8px"/>` : ''}<div class="stars">${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</div><div class="quote">「${t.comment}」</div><div class="meta">${t.patientName} · ${t.treatment} · ${t.doctor}</div><div class="clinic">${clinicName}</div></div></body></html>`);
    w.document.close();
  };

  const handlePrint = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const rows = approved.slice(0, 20).map(t => `<div style="break-inside:avoid;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:12px"><div style="color:#f59e0b;font-size:18px;margin-bottom:6px">${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</div><div style="font-size:14px;color:#334155;line-height:1.5;margin-bottom:8px">「${t.comment}」</div><div style="font-size:12px;color:#94a3b8">${t.patientName} · ${t.treatment} · ${t.doctor} · ${t.date}</div>${t.isFeatured ? '<div style="display:inline-block;background:#fef3c7;color:#d97706;border-radius:4px;padding:1px 8px;font-size:11px;margin-top:6px">精選</div>' : ''}</div>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>顧客好評</title><style>body{font-family:'PingFang TC',sans-serif;max-width:700px;margin:0 auto;padding:20px}h1{text-align:center;color:${ACCENT};font-size:20px}p.sub{text-align:center;color:#94a3b8;font-size:12px;margin-bottom:24px}.stats{display:flex;justify-content:center;gap:24px;margin-bottom:24px}.st{text-align:center}.st .n{font-size:22px;font-weight:800;color:${ACCENT}}.st .l{font-size:11px;color:#94a3b8}@media print{body{padding:10mm}}</style></head><body><h1>${clinicName} — 顧客好評牆</h1><p class="sub">列印時間：${new Date().toLocaleString('zh-HK')} | 共 ${approved.length} 則好評</p><div class="stats"><div class="st"><div class="n">${stats.avg}/5</div><div class="l">平均評分</div></div><div class="st"><div class="n">${stats.approvedCount}</div><div class="l">已審核</div></div><div class="st"><div class="n">${stats.rate}%</div><div class="l">審核通過率</div></div></div>${rows}</body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  const embedCode = `<iframe src="${window.location.origin}/feedback-wall?mode=embed" width="100%" height="600" frameborder="0" style="border:none;border-radius:12px"></iframe>`;

  const S = {
    card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, position: 'relative' },
    btn: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
    btnSm: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
    btnOut: { background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 6, padding: '7px 15px', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
    btnDanger: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
    inp: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' },
    sel: { padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modal: { background: '#fff', borderRadius: 12, padding: 24, width: '92%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' },
    label: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#334155' },
    tab: { padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14, border: 'none', background: 'none', color: '#64748b', borderBottom: '2px solid transparent', marginBottom: -2 },
    tabOn: { color: ACCENT, borderBottomColor: ACCENT },
    stat: { textAlign: 'center', padding: 14, borderRadius: 8, flex: 1, minWidth: 90 },
  };

  const renderTestimonialCard = (t) => (
    <div key={t.id} style={{ ...S.card, marginBottom: 12, borderLeft: t.isFeatured ? `3px solid #f59e0b` : undefined }}>
      {t.isFeatured && <span style={{ position: 'absolute', top: 8, right: 10, background: '#fef3c7', color: '#d97706', borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>精選</span>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        {t.photo ? <img src={t.photo} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: ACCENT }}>{(t.patientName || '匿')[0]}</div>}
        <div><div style={{ fontWeight: 700, fontSize: 14 }}>{t.patientName}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>{t.treatment} · {t.doctor} · {t.date}</div></div>
      </div>
      <Stars value={t.rating} size={15} />
      <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, margin: '8px 0' }}>「{t.comment}」</div>
      {tab === 'manage' && <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {!t.isApproved && <button style={S.btnSm} onClick={() => handleApprove(t.id)}>通過</button>}
        {!t.isApproved && <button style={S.btnDanger} onClick={() => handleReject(t.id)}>拒絕</button>}
        <button style={{ ...S.btnSm, background: t.isFeatured ? '#d97706' : '#94a3b8' }} onClick={() => toggleFeatured(t.id)}>{t.isFeatured ? '取消精選' : '設為精選'}</button>
        <button style={{ ...S.btnSm, background: '#64748b' }} onClick={() => generateShareCard(t)}>分享卡片</button>
        {t.isApproved && <button style={S.btnDanger} onClick={() => handleDelete(t.id)}>刪除</button>}
      </div>}
    </div>
  );

  const slideItem = approved[slideIdx] || null;

  return (<div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
    {/* Header */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 20, color: '#1e293b' }}>好評牆</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={S.btnOut} onClick={() => setShowAdd(true)}>新增評價</button>
        <button style={S.btnOut} onClick={handlePrint}>列印</button>
        <button style={S.btnOut} onClick={() => setEmbedModal(true)}>嵌入代碼</button>
      </div>
    </div>

    {/* Tabs */}
    <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 16 }}>
      {[['wall','好評展示'],['manage','審核管理'],['stats','統計分析']].map(([k,l]) =>
        <button key={k} style={{ ...S.tab, ...(tab === k ? S.tabOn : {}) }} onClick={() => setTab(k)}>{l}{k === 'manage' && pending.length ? <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, marginLeft: 6 }}>{pending.length}</span> : null}</button>
      )}
    </div>

    {/* ── Wall Tab ── */}
    {tab === 'wall' && <>
      {/* Filters + View Toggle */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <select style={S.sel} value={filter.doctor} onChange={e => setFilter(f => ({ ...f, doctor: e.target.value }))}>
          <option value="all">全部醫師</option>{DOCTORS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select style={S.sel} value={filter.treatment} onChange={e => setFilter(f => ({ ...f, treatment: e.target.value }))}>
          <option value="all">全部療程</option>{TREATMENTS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select style={S.sel} value={filter.rating} onChange={e => setFilter(f => ({ ...f, rating: e.target.value }))}>
          <option value="all">全部評分</option>{[5,4,3,2,1].map(r => <option key={r} value={r}>{r} 星</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {['grid','list','slideshow'].map(m => (
          <button key={m} style={{ ...S.btnSm, background: viewMode === m ? ACCENT : '#cbd5e1' }} onClick={() => { setViewMode(m); setSlideIdx(0); }}>
            {{ grid: '宮格', list: '列表', slideshow: '幻燈片' }[m]}
          </button>
        ))}
        {viewMode === 'slideshow' && <select style={{ ...S.sel, width: 80 }} value={slideInterval} onChange={e => setSlideInterval(+e.target.value)}>
          {[3,5,8,10,15].map(s => <option key={s} value={s}>{s}秒</option>)}
        </select>}
      </div>

      {!approved.length && <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40, fontSize: 14 }}>暫無已審核的評價</div>}

      {/* Grid View */}
      {viewMode === 'grid' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {approved.map(t => renderTestimonialCard(t))}
      </div>}

      {/* List View */}
      {viewMode === 'list' && <div>{approved.map(t => renderTestimonialCard(t))}</div>}

      {/* Slideshow View */}
      {viewMode === 'slideshow' && slideItem && (
        <div style={{ background: 'linear-gradient(135deg,#ecfeff,#f0f9ff)', borderRadius: 16, padding: 48, textAlign: 'center', minHeight: 260 }}>
          {slideItem.photo ? <img src={slideItem.photo} alt="" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', marginBottom: 12 }} /> : <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#cffafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, color: ACCENT, margin: '0 auto 12px' }}>{(slideItem.patientName || '匿')[0]}</div>}
          <Stars value={slideItem.rating} size={28} />
          <div style={{ fontSize: 20, color: '#334155', lineHeight: 1.6, margin: '16px auto', maxWidth: 500, fontStyle: 'italic' }}>「{slideItem.comment}」</div>
          <div style={{ fontSize: 14, color: '#64748b' }}>{slideItem.patientName} · {slideItem.treatment} · {slideItem.doctor}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{slideItem.date}</div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 6 }}>
            {approved.map((_, i) => <span key={i} onClick={() => setSlideIdx(i)} style={{ width: 8, height: 8, borderRadius: '50%', background: i === slideIdx ? ACCENT : '#cbd5e1', cursor: 'pointer', display: 'inline-block' }} />)}
          </div>
        </div>
      )}
    </>}

    {/* ── Manage Tab ── */}
    {tab === 'manage' && <>
      <div style={{ marginBottom: 12, fontWeight: 700, fontSize: 15, color: '#1e293b' }}>待審核 ({pending.length})</div>
      {!pending.length && <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24, fontSize: 13 }}>沒有待審核的評價</div>}
      {pending.map(t => renderTestimonialCard(t))}
      <div style={{ marginTop: 20, marginBottom: 12, fontWeight: 700, fontSize: 15, color: '#1e293b' }}>已審核 ({approved.length})</div>
      {approved.map(t => renderTestimonialCard(t))}
    </>}

    {/* ── Stats Tab ── */}
    {tab === 'stats' && <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ ...S.stat, background: '#ecfeff' }}>
          <div style={{ fontSize: 10, color: ACCENT, fontWeight: 600 }}>總評價數</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: ACCENT }}>{stats.total}</div>
        </div>
        <div style={{ ...S.stat, background: '#fffbeb' }}>
          <div style={{ fontSize: 10, color: '#d97706', fontWeight: 600 }}>平均評分</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#d97706' }}>{stats.avg}<span style={{ fontSize: 12 }}>/5</span></div>
        </div>
        <div style={{ ...S.stat, background: '#f0fdf4' }}>
          <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>已審核</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#16a34a' }}>{stats.approvedCount}</div>
        </div>
        <div style={{ ...S.stat, background: '#faf5ff' }}>
          <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600 }}>審核通過率</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#7c3aed' }}>{stats.rate}%</div>
        </div>
      </div>

      {/* Rating distribution */}
      <div style={S.card}>
        <div style={{ fontWeight: 700, fontSize: 14, color: ACCENT, marginBottom: 12 }}>評分分佈</div>
        {stats.byRating.map(({ r, count }) => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 40, fontSize: 13, fontWeight: 600 }}>{r} 星</span>
            <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 6, height: 16, overflow: 'hidden' }}>
              <div style={{ width: stats.total ? `${count / stats.total * 100}%` : 0, height: '100%', background: r >= 4 ? '#16a34a' : r === 3 ? '#d97706' : '#ef4444', borderRadius: 6, transition: 'width .4s' }} />
            </div>
            <span style={{ width: 30, fontSize: 12, color: '#64748b', textAlign: 'right' }}>{count}</span>
          </div>
        ))}
      </div>

      {/* Doctor ranking */}
      {stats.doctorStats.length > 0 && <div style={{ ...S.card, marginTop: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: ACCENT, marginBottom: 12 }}>醫師評分排名</div>
        {stats.doctorStats.map((d, i) => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 22, fontSize: 14, fontWeight: 800, color: i === 0 ? '#d97706' : '#94a3b8' }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{d.name}</span>
            <Stars value={Math.round(d.avg)} size={13} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>{d.avg}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>({d.count})</span>
          </div>
        ))}
      </div>}
    </>}

    {/* ── Add Modal ── */}
    {showAdd && <div style={S.overlay} onClick={() => setShowAdd(false)}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 17, color: '#1e293b' }}>新增評價</h3>
        <div style={{ marginBottom: 10 }}>
          <label style={S.label}>姓名</label>
          <input style={S.inp} value={form.patientName} onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))} placeholder="輸入姓名" disabled={form.anonymous} />
          <label style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={form.anonymous} onChange={e => setForm(f => ({ ...f, anonymous: e.target.checked }))} /> 匿名評價
          </label>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={S.label}>評分</label>
          <Stars value={form.rating} size={24} interactive onChange={v => setForm(f => ({ ...f, rating: v }))} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>療程類型</label>
            <select style={{ ...S.sel, width: '100%' }} value={form.treatment} onChange={e => setForm(f => ({ ...f, treatment: e.target.value }))}>
              {TREATMENTS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>醫師</label>
            <select style={{ ...S.sel, width: '100%' }} value={form.doctor} onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))}>
              {DOCTORS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={S.label}>評語</label>
          <textarea style={{ ...S.inp, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} placeholder="分享您的體驗..." />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>照片（選填，≤500KB）</label>
          <input type="file" accept="image/*" onChange={handlePhoto} style={{ fontSize: 12 }} />
          {form.photo && <img src={form.photo} alt="" style={{ width: 50, height: 50, borderRadius: 6, objectFit: 'cover', marginTop: 6 }} />}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={{ ...S.btn, background: '#94a3b8' }} onClick={() => setShowAdd(false)}>取消</button>
          <button style={S.btn} onClick={handleAdd}>提交評價</button>
        </div>
      </div>
    </div>}

    {/* ── Embed Modal ── */}
    {embedModal && <div style={S.overlay} onClick={() => setEmbedModal(false)}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: 17, color: '#1e293b' }}>嵌入代碼</h3>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>複製以下代碼嵌入您的網站，展示好評牆：</p>
        <textarea readOnly value={embedCode} style={{ ...S.inp, minHeight: 80, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button style={{ ...S.btn, background: '#94a3b8' }} onClick={() => setEmbedModal(false)}>關閉</button>
          <button style={S.btn} onClick={() => { navigator.clipboard.writeText(embedCode).then(() => showToast('已複製嵌入代碼')); }}>複製代碼</button>
        </div>
      </div>
    </div>}
  </div>);
}
