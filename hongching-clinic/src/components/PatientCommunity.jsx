import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_patient_community';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const CATS = ['養生保健', '中藥知識', '穴位保健', '季節調養', '飲食療法', '運動保健'];
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } };
const save = d => localStorage.setItem(LS_KEY, JSON.stringify(d));
const today = () => new Date().toISOString().slice(0, 10);
const accent = '#0e7490';

const SEED = [
  { id: 'seed1', title: '春季養肝護眼指南', content: '春季對應肝臟，宜多食綠色蔬菜如菠菜、芹菜，配合枸杞菊花茶養肝明目。建議每日按壓太衝穴三至五分鐘，有助疏肝理氣。避免熬夜，保持心情舒暢。', category: '季節調養', author: '王醫師', date: '2026-02-20', pinned: true, likes: 12, bookmarks: 5 },
  { id: 'seed2', title: '常見穴位自我保健', content: '合谷穴：位於虎口處，主治頭痛、牙痛、感冒。足三里：位於膝下三寸，主治胃痛、腹脹、增強免疫力。每日按壓各穴位三至五分鐘，力度以酸脹為宜。', category: '穴位保健', author: '李醫師', date: '2026-02-18', pinned: false, likes: 8, bookmarks: 3 },
  { id: 'seed3', title: '冬季進補注意事項', content: '冬令進補需因人而異，體質偏熱者不宜過食溫補藥材。常用藥膳如當歸生薑羊肉湯適合氣血虛弱者。進補前建議先諮詢中醫師，辨明體質後再行調理。', category: '中藥知識', author: '張醫師', date: '2026-02-15', pinned: false, likes: 15, bookmarks: 7 },
  { id: 'seed4', title: '八段錦日常練習要點', content: '八段錦為傳統養生功法，動作柔和，適合各年齡層。建議每日晨起練習一遍，注意呼吸配合動作，動作宜慢不宜快。長期堅持可增強體質、改善睡眠。', category: '運動保健', author: '陳醫師', date: '2026-02-10', pinned: false, likes: 6, bookmarks: 2 },
  { id: 'seed5', title: '藥膳養生粥品推薦', content: '山藥薏仁粥：健脾祛濕，適合春季食用。紅棗桂圓粥：補氣養血，適合體質虛弱者。百合蓮子粥：養心安神，適合失眠多夢者。每週食用二至三次為宜。', category: '飲食療法', author: '王醫師', date: '2026-02-05', pinned: false, likes: 10, bookmarks: 4 },
];

const S = {
  page: { padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 },
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 },
  tabs: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e2e8f0' },
  tab: { padding: '10px 22px', cursor: 'pointer', fontWeight: 600, fontSize: 14, border: 'none', background: 'none', color: '#64748b', borderBottom: '2px solid transparent', marginBottom: -2 },
  tabOn: { color: accent, borderBottomColor: accent },
  btn: { background: accent, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  btnSm: { background: accent, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  btnDanger: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  btnGray: { background: '#94a3b8', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 12, position: 'relative' },
  badge: { display: 'inline-block', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, marginRight: 6 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 28, width: '92%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#1e293b' },
  field: { marginBottom: 12 },
  label: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#334155' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, minHeight: 100, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  select: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14 },
  filter: { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  stat: { background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, padding: '12px 16px', textAlign: 'center', flex: '1 1 120px' },
};

const catColor = { '養生保健': '#16a34a', '中藥知識': '#d97706', '穴位保健': '#7c3aed', '季節調養': '#0e7490', '飲食療法': '#e11d48', '運動保健': '#2563eb' };

export default function PatientCommunity({ data, showToast, user }) {
  const clinicName = useMemo(() => getClinicName(), []);
  const [posts, setPosts] = useState(() => { const d = load(); return d.length ? d : SEED; });
  const [tab, setTab] = useState(0); // 0=文章列表, 1=月度主題
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('全部');
  const [modal, setModal] = useState(null); // null | 'create' | 'edit' | 'view'
  const [viewPost, setViewPost] = useState(null);
  const [form, setForm] = useState({ title: '', content: '', category: '養生保健', author: user?.name || '' });
  const [editId, setEditId] = useState(null);
  const [likedSet, setLikedSet] = useState(() => new Set());
  const [bookmarkSet, setBookmarkSet] = useState(() => new Set());
  const [schedMonth, setSchedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [schedules, setSchedules] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY + '_sched') || '{}'); } catch { return {}; }
  });
  const [schedForm, setSchedForm] = useState({ week: '', topic: '', category: '養生保健' });
  const [showBookmarked, setShowBookmarked] = useState(false);

  const persist = d => { setPosts(d); save(d); };
  const persistSched = d => { setSchedules(d); localStorage.setItem(LS_KEY + '_sched', JSON.stringify(d)); };

  const filtered = useMemo(() => {
    let list = [...posts];
    if (filterCat !== '全部') list = list.filter(p => p.category === filterCat);
    if (showBookmarked) list = list.filter(p => bookmarkSet.has(p.id));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.content || '').toLowerCase().includes(q) ||
        (p.author || '').toLowerCase().includes(q)
      );
    }
    const pinned = list.filter(p => p.pinned).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const rest = list.filter(p => !p.pinned).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return [...pinned, ...rest];
  }, [posts, filterCat, search, showBookmarked, bookmarkSet]);

  const stats = useMemo(() => ({
    total: posts.length,
    totalLikes: posts.reduce((s, p) => s + (p.likes || 0), 0),
    totalBookmarks: posts.reduce((s, p) => s + (p.bookmarks || 0), 0),
    catCount: CATS.map(c => ({ cat: c, count: posts.filter(p => p.category === c).length })),
  }), [posts]);

  const openCreate = () => { setForm({ title: '', content: '', category: '養生保健', author: user?.name || '' }); setEditId(null); setModal('create'); };
  const openEdit = p => { setForm({ title: p.title, content: p.content, category: p.category, author: p.author }); setEditId(p.id); setModal('edit'); };
  const openView = p => { setViewPost(p); setModal('view'); };

  const handleSave = () => {
    if (!form.title.trim() || !form.content.trim()) return showToast?.('請填寫標題和內容');
    if (modal === 'edit' && editId) {
      const next = posts.map(p => p.id === editId ? { ...p, ...form, editedAt: today() } : p);
      persist(next); showToast?.('文章已更新');
    } else {
      const np = { id: uid(), ...form, date: today(), pinned: false, likes: 0, bookmarks: 0 };
      persist([np, ...posts]); showToast?.('文章已發布');
    }
    setModal(null);
  };

  const handleDelete = id => {
    if (!window.confirm('確定刪除此文章？')) return;
    persist(posts.filter(p => p.id !== id)); showToast?.('已刪除');
  };

  const togglePin = id => {
    persist(posts.map(p => p.id === id ? { ...p, pinned: !p.pinned } : p));
  };

  const toggleLike = id => {
    const liked = likedSet.has(id);
    const next = new Set(likedSet);
    if (liked) { next.delete(id); persist(posts.map(p => p.id === id ? { ...p, likes: Math.max(0, (p.likes || 0) - 1) } : p)); }
    else { next.add(id); persist(posts.map(p => p.id === id ? { ...p, likes: (p.likes || 0) + 1 } : p)); }
    setLikedSet(next);
  };

  const toggleBookmark = id => {
    const marked = bookmarkSet.has(id);
    const next = new Set(bookmarkSet);
    if (marked) { next.delete(id); persist(posts.map(p => p.id === id ? { ...p, bookmarks: Math.max(0, (p.bookmarks || 0) - 1) } : p)); }
    else { next.add(id); persist(posts.map(p => p.id === id ? { ...p, bookmarks: (p.bookmarks || 0) + 1 } : p)); }
    setBookmarkSet(next);
  };

  const printPost = p => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(p.title)}</title>
      <style>body{font-family:-apple-system,sans-serif;padding:40px;max-width:700px;margin:0 auto}
      h1{font-size:22px;color:#1e293b;margin-bottom:8px}
      .meta{color:#64748b;font-size:13px;margin-bottom:20px}
      .badge{display:inline-block;background:${catColor[p.category] || accent};color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;margin-right:8px}
      .content{font-size:15px;line-height:1.8;color:#334155;white-space:pre-wrap}
      .footer{margin-top:30px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:12px;color:#94a3b8;text-align:center}
      @media print{body{padding:20px}}</style></head>
      <body><h1>${escapeHtml(p.title)}</h1>
      <div class="meta"><span class="badge">${escapeHtml(p.category)}</span>作者：${escapeHtml(p.author || '匿名')} | 日期：${p.date || ''}</div>
      <div class="content">${(p.content || '').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>
      <div class="footer">${escapeHtml(clinicName)} - 健康教育專欄 | 列印日期：${today()}</div>
      </body></html>`);
    w.document.close(); w.print();
  };

  const addSchedule = () => {
    if (!schedForm.week.trim() || !schedForm.topic.trim()) return showToast?.('請填寫週次和主題');
    const key = schedMonth;
    const existing = schedules[key] || [];
    const next = { ...schedules, [key]: [...existing, { id: uid(), ...schedForm }] };
    persistSched(next); setSchedForm({ week: '', topic: '', category: '養生保健' }); showToast?.('主題已排程');
  };

  const removeSchedule = (month, id) => {
    const next = { ...schedules, [month]: (schedules[month] || []).filter(s => s.id !== id) };
    persistSched(next);
  };

  const monthScheds = schedules[schedMonth] || [];

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h2 style={S.title}>健康教育專欄</h2>
        <button style={S.btn} onClick={openCreate}>+ 發布文章</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={S.stat}><div style={{ fontSize: 22, fontWeight: 700, color: accent }}>{stats.total}</div><div style={{ fontSize: 12, color: '#64748b' }}>文章總數</div></div>
        <div style={S.stat}><div style={{ fontSize: 22, fontWeight: 700, color: '#e11d48' }}>{stats.totalLikes}</div><div style={{ fontSize: 12, color: '#64748b' }}>總讚數</div></div>
        <div style={S.stat}><div style={{ fontSize: 22, fontWeight: 700, color: '#d97706' }}>{stats.totalBookmarks}</div><div style={{ fontSize: 12, color: '#64748b' }}>總收藏</div></div>
        {stats.catCount.filter(c => c.count > 0).slice(0, 3).map(c => (
          <div key={c.cat} style={S.stat}><div style={{ fontSize: 22, fontWeight: 700, color: catColor[c.cat] }}>{c.count}</div><div style={{ fontSize: 12, color: '#64748b' }}>{c.cat}</div></div>
        ))}
      </div>

      <div style={S.tabs}>
        {['文章列表', '月度主題'].map((t, i) => (
          <button key={i} style={{ ...S.tab, ...(tab === i ? S.tabOn : {}) }} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {tab === 0 && (<>
        <div style={S.filter}>
          <input style={{ ...S.input, maxWidth: 240 }} placeholder="搜尋標題、內容、作者..." value={search} onChange={e => setSearch(e.target.value)} />
          <select style={S.select} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="全部">全部分類</option>
            {CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            style={{ ...S.btnSm, background: showBookmarked ? '#d97706' : '#f1f5f9', color: showBookmarked ? '#fff' : '#64748b' }}
            onClick={() => setShowBookmarked(!showBookmarked)}
          >
            {showBookmarked ? '★ 已收藏' : '☆ 收藏篩選'}
          </button>
          <span style={{ fontSize: 13, color: '#64748b' }}>共 {filtered.length} 篇</span>
        </div>

        {/* Category distribution bar */}
        {posts.length > 0 && (
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 16, background: '#e2e8f0' }}>
            {stats.catCount.filter(c => c.count > 0).map(c => (
              <div
                key={c.cat}
                title={`${c.cat}: ${c.count} 篇`}
                style={{ width: `${(c.count / posts.length) * 100}%`, background: catColor[c.cat] || accent, transition: 'width 0.3s' }}
              />
            ))}
          </div>
        )}

        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>暫無文章</div>}

        {filtered.map(p => (
          <div key={p.id} style={{ ...S.card, borderLeft: `4px solid ${catColor[p.category] || accent}` }}>
            {p.pinned && <span style={{ ...S.badge, background: '#fef3c7', color: '#d97706' }}>置頂</span>}
            <span style={{ ...S.badge, background: catColor[p.category] || accent, color: '#fff' }}>{p.category}</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              {p.date} | {p.author || '匿名'}
              {p.editedAt && <span style={{ marginLeft: 6, fontStyle: 'italic' }}>(已編輯 {p.editedAt})</span>}
            </span>
            <h3 style={{ margin: '8px 0 6px', fontSize: 16, color: '#1e293b', cursor: 'pointer' }} onClick={() => openView(p)}>{p.title}</h3>
            <p style={{ fontSize: 14, color: '#475569', margin: 0, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.content}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={{ ...S.btnSm, background: likedSet.has(p.id) ? '#e11d48' : '#f1f5f9', color: likedSet.has(p.id) ? '#fff' : '#64748b' }} onClick={() => toggleLike(p.id)}>
                {likedSet.has(p.id) ? '♥' : '♡'} {p.likes || 0}
              </button>
              <button style={{ ...S.btnSm, background: bookmarkSet.has(p.id) ? '#d97706' : '#f1f5f9', color: bookmarkSet.has(p.id) ? '#fff' : '#64748b' }} onClick={() => toggleBookmark(p.id)}>
                {bookmarkSet.has(p.id) ? '★' : '☆'} {p.bookmarks || 0}
              </button>
              <button style={S.btnSm} onClick={() => openView(p)}>閱讀</button>
              <button style={{ ...S.btnSm, background: '#f0fdfa', color: accent }} onClick={() => printPost(p)}>列印</button>
              <button style={{ ...S.btnSm, background: p.pinned ? '#fef3c7' : '#f1f5f9', color: p.pinned ? '#d97706' : '#64748b' }} onClick={() => togglePin(p.id)}>
                {p.pinned ? '取消置頂' : '置頂'}
              </button>
              <button style={{ ...S.btnSm, background: '#f1f5f9', color: accent }} onClick={() => openEdit(p)}>編輯</button>
              <button style={S.btnDanger} onClick={() => handleDelete(p.id)}>刪除</button>
            </div>
          </div>
        ))}
      </>)}

      {tab === 1 && (
        <div>
          <div style={S.filter}>
            <label style={{ fontWeight: 600, fontSize: 13 }}>月份：</label>
            <input type="month" style={{ ...S.input, maxWidth: 200 }} value={schedMonth} onChange={e => setSchedMonth(e.target.value)} />
            <span style={{ fontSize: 13, color: '#64748b' }}>
              本月已排 {monthScheds.length} 個主題 | 全部月份共 {Object.values(schedules).reduce((s, arr) => s + arr.length, 0)} 個
            </span>
          </div>
          <div style={S.card}>
            <h4 style={{ margin: '0 0 12px', color: '#1e293b' }}>{schedMonth} 健康主題排程</h4>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={S.field}>
                <label style={S.label}>週次</label>
                <input style={{ ...S.input, width: 100 }} placeholder="如: 第一週" value={schedForm.week} onChange={e => setSchedForm({ ...schedForm, week: e.target.value })} />
              </div>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>主題</label>
                <input style={S.input} placeholder="健康主題名稱" value={schedForm.topic} onChange={e => setSchedForm({ ...schedForm, topic: e.target.value })} />
              </div>
              <div style={S.field}>
                <label style={S.label}>分類</label>
                <select style={S.select} value={schedForm.category} onChange={e => setSchedForm({ ...schedForm, category: e.target.value })}>
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button style={{ ...S.btn, marginBottom: 12 }} onClick={addSchedule}>新增</button>
            </div>
            {monthScheds.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>本月尚未排程主題</div>}
            {monthScheds.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontWeight: 600, minWidth: 70, color: '#334155' }}>{s.week}</span>
                <span style={{ flex: 1, color: '#1e293b' }}>{s.topic}</span>
                <span style={{ ...S.badge, background: catColor[s.category] || accent, color: '#fff' }}>{s.category}</span>
                <button style={S.btnDanger} onClick={() => removeSchedule(schedMonth, s.id)}>刪除</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={S.modalTitle}>{modal === 'edit' ? '編輯文章' : '發布新文章'}</h3>
            <div style={S.field}>
              <label style={S.label}>標題 *</label>
              <input style={S.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="文章標題" />
            </div>
            <div style={S.field}>
              <label style={S.label}>分類</label>
              <select style={S.select} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={S.field}>
              <label style={S.label}>作者</label>
              <input style={S.input} value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} placeholder="作者名稱" />
            </div>
            <div style={S.field}>
              <label style={S.label}>內容 *</label>
              <textarea style={S.textarea} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="文章內容..." />
              <div style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                {form.content.length} 字
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={S.btnGray} onClick={() => setModal(null)}>取消</button>
              <button style={S.btn} onClick={handleSave}>{modal === 'edit' ? '更新' : '發布'}</button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {modal === 'view' && viewPost && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={{ ...S.modal, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ ...S.badge, background: catColor[viewPost.category] || accent, color: '#fff' }}>{viewPost.category}</span>
              {viewPost.pinned && <span style={{ ...S.badge, background: '#fef3c7', color: '#d97706' }}>置頂</span>}
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{viewPost.date} | {viewPost.author || '匿名'}</span>
            </div>
            <h3 style={{ margin: '0 0 16px', fontSize: 20, color: '#1e293b' }}>{viewPost.title}</h3>
            <div style={{ fontSize: 15, lineHeight: 1.8, color: '#334155', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{viewPost.content}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
              共 {(viewPost.content || '').length} 字
              {viewPost.editedAt && <span style={{ marginLeft: 8 }}>| 最後編輯：{viewPost.editedAt}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
              <button style={{ ...S.btnSm, background: likedSet.has(viewPost.id) ? '#e11d48' : '#f1f5f9', color: likedSet.has(viewPost.id) ? '#fff' : '#64748b' }} onClick={() => toggleLike(viewPost.id)}>
                {likedSet.has(viewPost.id) ? '♥' : '♡'} {posts.find(p => p.id === viewPost.id)?.likes || 0}
              </button>
              <button style={{ ...S.btnSm, background: bookmarkSet.has(viewPost.id) ? '#d97706' : '#f1f5f9', color: bookmarkSet.has(viewPost.id) ? '#fff' : '#64748b' }} onClick={() => toggleBookmark(viewPost.id)}>
                {bookmarkSet.has(viewPost.id) ? '★' : '☆'} {posts.find(p => p.id === viewPost.id)?.bookmarks || 0}
              </button>
              <button style={{ ...S.btnSm, background: '#f0fdfa', color: accent }} onClick={() => printPost(viewPost)}>列印派發</button>
              <div style={{ flex: 1 }} />
              <button style={S.btnGray} onClick={() => setModal(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
