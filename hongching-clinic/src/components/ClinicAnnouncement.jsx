import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const TYPES = ['重要通知', '人事公告', '營運更新', '培訓通知', '系統維護', '一般公告'];
const PRIORITIES = ['urgent', 'normal', 'low'];
const PRI_LABEL = { urgent: '緊急', normal: '普通', low: '低' };
const AUDIENCES = ['all', 'doctors', 'staff', 'admin'];
const AUD_LABEL = { all: '全體', doctors: '醫師', staff: '職員', admin: '管理員' };
const AK = 'hcmc_announcements', RK = 'hcmc_announcement_reads';
const load = (k, fb) => { try { const d = JSON.parse(localStorage.getItem(k)); return Array.isArray(d) ? d : fb; } catch { return fb; } };
const persist = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const A = '#0e7490';

const priColor = {
  urgent: { bg: '#fef2f2', bd: '#ef4444', tx: '#dc2626' },
  normal: { bg: '#f0fdfa', bd: '#0e7490', tx: '#0e7490' },
  low: { bg: '#f8fafc', bd: '#94a3b8', tx: '#64748b' },
};

const S = {
  page: { padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  hdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  h2: { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 },
  bar: { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  stats: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
  statBox: { flex: 1, minWidth: 120, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', textAlign: 'center' },
  statNum: { fontSize: 22, fontWeight: 700, color: A },
  statLbl: { fontSize: 12, color: '#64748b', marginTop: 2 },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' },
  sel: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14 },
  ta: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, minHeight: 100, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  btn: { background: A, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  sm: { background: A, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  smD: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  smG: { background: '#94a3b8', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 12, cursor: 'pointer' },
  badge: { display: 'inline-block', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, marginRight: 6 },
  ov: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 28, width: '92%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' },
  mh: { fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#1e293b' },
  fl: { marginBottom: 12 },
  lb: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#334155' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  unread: { background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700, marginLeft: 6 },
};

const SEED = [
  { id: 'a1', title: '診所春節休假安排', type: '重要通知', content: '診所將於農曆新年期間（2月10日至14日）休息，2月15日恢復正常營業。\n\n請各同事提前安排工作交接，確保病人複診安排妥當。\n\n如有緊急事務，請聯繫管理員。', priority: 'urgent', author: '管理員', publishDate: '2026-02-01', expiryDate: '2026-02-20', pinned: true, targetAudience: 'all', createdAt: '2026-02-01 09:00' },
  { id: 'a2', title: '新員工入職培訓通知', type: '培訓通知', content: '下週一將舉辦新員工入職培訓，涵蓋診所系統操作、工作流程及注意事項。請相關同事準時參加。', priority: 'normal', author: '人事部', publishDate: '2026-02-15', expiryDate: '2026-03-15', pinned: false, targetAudience: 'staff', createdAt: '2026-02-15 10:00' },
  { id: 'a3', title: '系統定期維護通知', type: '系統維護', content: '本週六凌晨2:00至5:00將進行系統維護升級，届時系統暫停使用，請提前做好準備。', priority: 'normal', author: '系統管理員', publishDate: '2026-02-20', expiryDate: '2026-02-28', pinned: false, targetAudience: 'all', createdAt: '2026-02-20 14:00' },
  { id: 'a4', title: '三月排班表已更新', type: '營運更新', content: '三月份醫師排班表已更新，請各醫師登入系統查看並確認。如有問題請於本週五前聯繫管理處。', priority: 'low', author: '管理員', publishDate: '2026-02-25', expiryDate: '2026-03-31', pinned: false, targetAudience: 'doctors', createdAt: '2026-02-25 11:00' },
  { id: 'a5', title: '員工健康檢查安排', type: '人事公告', content: '年度員工健康檢查將於三月第二週進行，請各同事提前預留時間。詳細安排將另行通知。', priority: 'normal', author: '人事部', publishDate: '2026-02-26', expiryDate: '2026-03-20', pinned: false, targetAudience: 'all', createdAt: '2026-02-26 09:30' },
  { id: 'a6', title: '藥材庫存盤點提醒', type: '一般公告', content: '本月底將進行藥材庫存盤點，請各分店提前整理藥材存放區域，確保盤點順利進行。', priority: 'low', author: '管理員', publishDate: '2026-02-27', expiryDate: '2026-03-05', pinned: false, targetAudience: 'staff', createdAt: '2026-02-27 15:00' },
];

export default function ClinicAnnouncement({ data, showToast, user }) {
  const clinicName = useMemo(() => getClinicName(), []);
  const [items, setItems] = useState(() => load(AK, SEED));
  const [reads, setReads] = useState(() => new Set(load(RK, [])));
  const [modal, setModal] = useState(null); // null | 'create' | 'edit' | 'detail'
  const [editId, setEditId] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const [search, setSearch] = useState('');
  const [fType, setFType] = useState('全部');
  const [fPri, setFPri] = useState('全部');
  const [showArchived, setShowArchived] = useState(false);
  const blank = { title: '', type: '一般公告', content: '', priority: 'normal', publishDate: today(), expiryDate: '', pinned: false, targetAudience: 'all' };
  const [form, setForm] = useState(blank);

  const save = arr => { setItems(arr); persist(AK, arr); };
  const markRead = id => { if (reads.has(id)) return; const s = new Set(reads); s.add(id); setReads(s); persist(RK, [...s]); };
  const markAllRead = () => { const s = new Set(reads); items.forEach(a => s.add(a.id)); setReads(s); persist(RK, [...s]); showToast && showToast('已全部標記為已讀'); };

  const isExpired = a => a.expiryDate && a.expiryDate < today();

  const activeList = useMemo(() => {
    let list = items.filter(a => showArchived ? isExpired(a) : !isExpired(a));
    if (fType !== '全部') list = list.filter(a => a.type === fType);
    if (fPri !== '全部') list = list.filter(a => a.priority === fPri);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(a => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q) || a.author.toLowerCase().includes(q));
    }
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
    return list;
  }, [items, fType, fPri, search, showArchived]);

  const unreadCount = useMemo(() => items.filter(a => !isExpired(a) && !reads.has(a.id)).length, [items, reads]);
  const pinnedCount = useMemo(() => items.filter(a => a.pinned && !isExpired(a)).length, [items]);
  const archivedCount = useMemo(() => items.filter(a => isExpired(a)).length, [items]);
  const urgentCount = useMemo(() => items.filter(a => a.priority === 'urgent' && !isExpired(a)).length, [items]);

  const openCreate = () => { setEditId(null); setForm({ ...blank }); setModal('create'); };
  const openEdit = a => { setEditId(a.id); setForm({ title: a.title, type: a.type, content: a.content, priority: a.priority, publishDate: a.publishDate || '', expiryDate: a.expiryDate || '', pinned: a.pinned, targetAudience: a.targetAudience || 'all' }); setModal('edit'); };
  const openDetail = a => { markRead(a.id); setViewItem(a); setModal('detail'); };

  const submit = () => {
    if (!form.title.trim() || !form.content.trim()) { showToast && showToast('請填寫標題及內容'); return; }
    if (modal === 'edit' && editId) {
      save(items.map(a => a.id === editId ? { ...a, ...form } : a));
      showToast && showToast('公告已更新');
    } else {
      const item = { id: uid(), ...form, author: user?.name || '管理員', createdAt: now() };
      save([item, ...items]);
      showToast && showToast('公告已發布');
    }
    setModal(null);
  };

  const remove = id => { save(items.filter(a => a.id !== id)); showToast && showToast('已刪除'); };
  const togglePin = id => { save(items.map(a => a.id === id ? { ...a, pinned: !a.pinned } : a)); };

  const printAnn = a => {
    const w = window.open('', '_blank');
    w.document.write(
      `<html><head><title>${escapeHtml(a.title)}</title><style>` +
      `body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:40px;color:#1e293b;max-width:700px;margin:0 auto}` +
      `h1{font-size:20px;color:${A};margin-bottom:4px}h2{font-size:18px;margin:8px 0}` +
      `.meta{font-size:13px;color:#64748b;margin:8px 0 16px;line-height:1.6}` +
      `hr{border:none;border-top:1px solid #e2e8f0;margin:16px 0}` +
      `.body{white-space:pre-wrap;line-height:1.8;font-size:14px}` +
      `.footer{margin-top:32px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}` +
      `</style></head><body>` +
      `<h1>${escapeHtml(clinicName)}</h1><h2>${escapeHtml(a.title)}</h2>` +
      `<div class="meta">類型: ${escapeHtml(a.type)} | 優先級: ${escapeHtml(PRI_LABEL[a.priority])} | 對象: ${escapeHtml(AUD_LABEL[a.targetAudience])}<br/>` +
      `發布日期: ${a.publishDate}${a.expiryDate ? ' | 到期日期: ' + a.expiryDate : ''} | 發布者: ${escapeHtml(a.author)}</div>` +
      `<hr/><div class="body">${escapeHtml(a.content)}</div>` +
      `<div class="footer">此公告由 ${escapeHtml(clinicName)} 管理系統列印 | ${now()}</div>` +
      `</body></html>`
    );
    w.document.close();
    w.print();
  };

  const renderCard = a => {
    const pc = priColor[a.priority] || priColor.normal;
    const unread = !reads.has(a.id);
    const expired = isExpired(a);
    return (
      <div key={a.id} style={{ ...S.card, borderLeft: `4px solid ${pc.bd}`, background: unread && !expired ? '#fefce8' : expired ? '#f8fafc' : '#fff', opacity: expired ? 0.7 : 1 }} onClick={() => openDetail(a)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            {a.pinned && <span style={{ ...S.badge, background: '#fef3c7', color: '#92400e' }}>置頂</span>}
            <span style={{ ...S.badge, background: pc.bg, color: pc.tx }}>{PRI_LABEL[a.priority]}</span>
            <span style={{ ...S.badge, background: `${A}15`, color: A }}>{a.type}</span>
            <span style={{ ...S.badge, background: '#f0f9ff', color: '#0369a1' }}>{AUD_LABEL[a.targetAudience]}</span>
            {expired && <span style={{ ...S.badge, background: '#fee2e2', color: '#dc2626' }}>已過期</span>}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{a.createdAt}</div>
        </div>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#1e293b' }}>
          {unread && !expired && <span style={{ color: '#ef4444', marginRight: 4 }}>●</span>}{a.title}
        </h3>
        <p style={{ margin: '0 0 8px', fontSize: 14, color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 60, overflow: 'hidden' }}>{a.content}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#94a3b8' }}>
          <span>作者: {a.author} | 發布: {a.publishDate}{a.expiryDate ? ` | 到期: ${a.expiryDate}` : ''}</span>
          <div>
            <button style={S.sm} onClick={e => { e.stopPropagation(); togglePin(a.id); }}>{a.pinned ? '取消置頂' : '置頂'}</button>
            <button style={S.sm} onClick={e => { e.stopPropagation(); openEdit(a); }}>編輯</button>
            <button style={S.smG} onClick={e => { e.stopPropagation(); printAnn(a); }}>列印</button>
            <button style={S.smD} onClick={e => { e.stopPropagation(); remove(a.id); }}>刪除</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <h2 style={S.h2}>內部公告欄 {unreadCount > 0 && <span style={S.unread}>{unreadCount}</span>}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {unreadCount > 0 && <button style={{ ...S.btn, background: '#64748b' }} onClick={markAllRead}>全部已讀</button>}
          <button style={{ ...S.btn, background: showArchived ? A : '#94a3b8' }} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? '返回最新' : `已過期 (${archivedCount})`}
          </button>
          <button style={S.btn} onClick={openCreate}>+ 新增公告</button>
        </div>
      </div>

      <div style={S.stats}>
        <div style={S.statBox}><div style={S.statNum}>{items.filter(a => !isExpired(a)).length}</div><div style={S.statLbl}>有效公告</div></div>
        <div style={S.statBox}><div style={{ ...S.statNum, color: '#ef4444' }}>{unreadCount}</div><div style={S.statLbl}>未讀</div></div>
        <div style={S.statBox}><div style={{ ...S.statNum, color: '#dc2626' }}>{urgentCount}</div><div style={S.statLbl}>緊急</div></div>
        <div style={S.statBox}><div style={{ ...S.statNum, color: '#f59e0b' }}>{pinnedCount}</div><div style={S.statLbl}>置頂</div></div>
        <div style={S.statBox}><div style={{ ...S.statNum, color: '#94a3b8' }}>{archivedCount}</div><div style={S.statLbl}>已過期</div></div>
      </div>

      <div style={S.bar}>
        <input style={{ ...S.input, maxWidth: 240 }} placeholder="搜尋標題、內容或作者..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={S.sel} value={fType} onChange={e => setFType(e.target.value)}>
          <option value="全部">全部類型</option>{TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={S.sel} value={fPri} onChange={e => setFPri(e.target.value)}>
          <option value="全部">全部優先級</option>{PRIORITIES.map(p => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}
        </select>
        {(search || fType !== '全部' || fPri !== '全部') && (
          <button style={S.smG} onClick={() => { setSearch(''); setFType('全部'); setFPri('全部'); }}>清除篩選</button>
        )}
      </div>

      {activeList.length === 0
        ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>暫無{showArchived ? '已過期' : ''}公告</p>
        : <>
            {activeList.map(renderCard)}
            <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', padding: '8px 0 4px' }}>
              共 {activeList.length} 則{showArchived ? '已過期' : ''}公告
            </div>
          </>
      }

      {/* Detail modal */}
      {modal === 'detail' && viewItem && (
        <div style={S.ov} onClick={() => setModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <h3 style={{ ...S.mh, marginBottom: 0 }}>{viewItem.title}</h3>
              <button style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', padding: 0 }} onClick={() => setModal(null)}>x</button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {viewItem.pinned && <span style={{ ...S.badge, background: '#fef3c7', color: '#92400e' }}>置頂</span>}
              <span style={{ ...S.badge, background: priColor[viewItem.priority]?.bg, color: priColor[viewItem.priority]?.tx }}>{PRI_LABEL[viewItem.priority]}</span>
              <span style={{ ...S.badge, background: `${A}15`, color: A }}>{viewItem.type}</span>
              <span style={{ ...S.badge, background: '#f0f9ff', color: '#0369a1' }}>{AUD_LABEL[viewItem.targetAudience]}</span>
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
              發布者: {viewItem.author} | 發布日期: {viewItem.publishDate}{viewItem.expiryDate ? ` | 到期日期: ${viewItem.expiryDate}` : ''} | 建立: {viewItem.createdAt}
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 14, color: '#334155', minHeight: 80 }}>
              {viewItem.content}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <button style={S.sm} onClick={() => { setModal(null); openEdit(viewItem); }}>編輯</button>
              <button style={S.smG} onClick={() => printAnn(viewItem)}>列印</button>
              <button style={S.smD} onClick={() => { remove(viewItem.id); setModal(null); }}>刪除</button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div style={S.ov} onClick={() => setModal(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={S.mh}>{modal === 'edit' ? '編輯公告' : '新增公告'}</h3>
            <div style={S.fl}><label style={S.lb}>標題</label><input style={S.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="請輸入公告標題" /></div>
            <div style={S.fl}><label style={S.lb}>內容</label><textarea style={S.ta} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="請輸入公告內容..." /></div>
            <div style={{ ...S.row, ...S.fl }}>
              <div style={{ flex: 1 }}><label style={S.lb}>類型</label>
                <select style={{ ...S.sel, width: '100%' }} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
              </div>
              <div style={{ flex: 1 }}><label style={S.lb}>優先級</label>
                <select style={{ ...S.sel, width: '100%' }} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{PRIORITIES.map(p => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}</select>
              </div>
            </div>
            <div style={{ ...S.row, ...S.fl }}>
              <div style={{ flex: 1 }}><label style={S.lb}>發布日期</label><input type="date" style={S.input} value={form.publishDate} onChange={e => setForm({ ...form, publishDate: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label style={S.lb}>到期日期</label><input type="date" style={S.input} value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></div>
            </div>
            <div style={S.fl}><label style={S.lb}>目標對象</label>
              <select style={{ ...S.sel, width: '100%' }} value={form.targetAudience} onChange={e => setForm({ ...form, targetAudience: e.target.value })}>
                {AUDIENCES.map(a => <option key={a} value={a}>{AUD_LABEL[a]}</option>)}
              </select>
            </div>
            <div style={S.fl}>
              <label style={{ ...S.lb, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.pinned} onChange={e => setForm({ ...form, pinned: e.target.checked })} /> 置頂此公告
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={{ ...S.btn, background: '#94a3b8' }} onClick={() => setModal(null)}>取消</button>
              <button style={S.btn} onClick={submit}>{modal === 'edit' ? '更新' : '發布'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
