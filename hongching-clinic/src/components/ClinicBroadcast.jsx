import { useState, useMemo } from 'react';
import { uid, getStoreNames } from '../data';
import { getClinicName } from '../tenant';

const TYPES = ['系統公告', '診所通知', '緊急通知', '排班變更', '促銷活動', '其他'];
const PRIORITIES = ['普通', '重要', '緊急'];
const BK = 'hcmc_broadcasts', MK = 'hcmc_messages', RK = 'hcmc_read_broadcasts';
const load = (k, fb) => { try { const d = JSON.parse(localStorage.getItem(k)); return Array.isArray(d) ? d : fb; } catch { return fb; } };
const persist = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const accent = '#0e7490';

const SEED = [
  { id: 'b1', title: '春節假期安排', content: '診所將於農曆新年期間（2月10日至2月14日）休息，2月15日恢復正常營業。', type: '診所通知', priority: '重要', author: '管理員', createdAt: '2026-02-01 09:00', status: '已發布', stores: ['全部'], startDate: '2026-02-01', endDate: '2026-02-20', pinned: true },
  { id: 'b2', title: '系統升級通知', content: '系統將於本週六凌晨2點至5點進行升級維護，届時系統暫停使用。', type: '系統公告', priority: '普通', author: '系統', createdAt: '2026-02-20 14:00', status: '已發布', stores: ['全部'], startDate: '2026-02-20', endDate: '2026-03-01', pinned: false },
];

const S = {
  page: { padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
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
  textarea: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, minHeight: 70, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  select: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  unread: { background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700, marginLeft: 6 },
  msgCard: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10 },
  filter: { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
};

const priColor = { '緊急': { bg: '#fef2f2', border: '#ef4444', text: '#dc2626' }, '重要': { bg: '#fffbeb', border: '#f59e0b', text: '#d97706' }, '普通': { bg: '#f0fdfa', border: '#0e7490', text: '#0e7490' } };

export default function ClinicBroadcast({ showToast, user }) {
  const stores = useMemo(() => getStoreNames(), []);
  const clinicName = useMemo(() => getClinicName(), []);
  const [tab, setTab] = useState(0);
  const [broadcasts, setBroadcasts] = useState(() => load(BK, SEED));
  const [messages, setMessages] = useState(() => load(MK, []));
  const [readSet, setReadSet] = useState(() => new Set(load(RK, [])));
  const [modal, setModal] = useState(null); // null | 'create' | 'edit'
  const [msgModal, setMsgModal] = useState(false);
  const [filterType, setFilterType] = useState('全部');
  const [form, setForm] = useState({ title: '', content: '', type: '診所通知', priority: '普通', stores: ['全部'], startDate: today(), endDate: '', pinned: false, status: '已發布' });
  const [editId, setEditId] = useState(null);
  const [msgForm, setMsgForm] = useState({ to: '全部', subject: '', content: '' });

  const saveBc = arr => { setBroadcasts(arr); persist(BK, arr); };
  const saveMsg = arr => { setMessages(arr); persist(MK, arr); };
  const markRead = id => { const s = new Set(readSet); s.add(id); setReadSet(s); persist(RK, [...s]); };

  const active = useMemo(() => {
    let list = broadcasts.filter(b => b.status !== '已刪除');
    if (filterType !== '全部') list = list.filter(b => b.type === filterType);
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
    return list;
  }, [broadcasts, filterType]);

  const unreadCount = useMemo(() => broadcasts.filter(b => b.status === '已發布' && !readSet.has(b.id)).length, [broadcasts, readSet]);

  const openCreate = () => { setEditId(null); setForm({ title: '', content: '', type: '診所通知', priority: '普通', stores: ['全部'], startDate: today(), endDate: '', pinned: false, status: '已發布' }); setModal('create'); };
  const openEdit = b => { setEditId(b.id); setForm({ title: b.title, content: b.content, type: b.type, priority: b.priority, stores: b.stores || ['全部'], startDate: b.startDate || '', endDate: b.endDate || '', pinned: b.pinned, status: b.status }); setModal('edit'); };

  const submitBc = () => {
    if (!form.title.trim() || !form.content.trim()) { showToast && showToast('請填寫標題及內容'); return; }
    if (modal === 'edit' && editId) {
      saveBc(broadcasts.map(b => b.id === editId ? { ...b, ...form } : b));
      showToast && showToast('公告已更新');
    } else {
      const item = { id: uid(), ...form, author: user?.name || '管理員', createdAt: now() };
      saveBc([item, ...broadcasts]);
      showToast && showToast('公告已發布');
    }
    setModal(null);
  };

  const deleteBc = id => { saveBc(broadcasts.map(b => b.id === id ? { ...b, status: '已刪除' } : b)); showToast && showToast('已刪除'); };
  const archiveBc = id => { saveBc(broadcasts.map(b => b.id === id ? { ...b, status: '已過期' } : b)); showToast && showToast('已封存'); };
  const printBc = b => { const w = window.open('', '_blank'); w.document.write(`<html><head><title>${b.title}</title><style>body{font-family:sans-serif;padding:40px;}</style></head><body><h1>${clinicName} - 公告</h1><h2>${b.title}</h2><p><b>類型:</b> ${b.type} | <b>優先級:</b> ${b.priority} | <b>日期:</b> ${b.createdAt}</p><hr/><div style="white-space:pre-wrap;line-height:1.8">${b.content}</div></body></html>`); w.document.close(); w.print(); };

  const sendMsg = () => {
    if (!msgForm.subject.trim() || !msgForm.content.trim()) { showToast && showToast('請填寫主題及內容'); return; }
    const m = { id: uid(), from: user?.name || '管理員', to: msgForm.to, subject: msgForm.subject, content: msgForm.content, sentAt: now() };
    saveMsg([m, ...messages]);
    setMsgForm({ to: '全部', subject: '', content: '' }); setMsgModal(false);
    showToast && showToast('消息已發送');
  };

  const renderCard = b => {
    const pc = priColor[b.priority] || priColor['普通'];
    const isUnread = !readSet.has(b.id);
    return (
      <div key={b.id} style={{ ...S.card, borderLeft: `4px solid ${pc.border}`, background: isUnread ? '#fefce8' : '#fff' }} onClick={() => markRead(b.id)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            {b.pinned && <span style={{ ...S.badge, background: '#fef3c7', color: '#92400e' }}>置頂</span>}
            <span style={{ ...S.badge, background: pc.bg, color: pc.text }}>{b.priority}</span>
            <span style={{ ...S.badge, background: `${accent}15`, color: accent }}>{b.type}</span>
            <span style={{ ...S.badge, background: b.status === '已發布' ? '#dcfce7' : b.status === '草稿' ? '#f1f5f9' : '#fee2e2', color: b.status === '已發布' ? '#16a34a' : b.status === '草稿' ? '#64748b' : '#dc2626' }}>{b.status}</span>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{b.createdAt}</div>
        </div>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#1e293b' }}>{isUnread && <span style={{ color: '#ef4444', marginRight: 4 }}>●</span>}{b.title}</h3>
        <p style={{ margin: '0 0 8px', fontSize: 14, color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{b.content}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#94a3b8' }}>
          <span>發布者: {b.author} | 目標: {(b.stores || ['全部']).join(', ')}{b.endDate ? ` | 有效至: ${b.endDate}` : ''}</span>
          <div>
            <button style={S.btnSm} onClick={e => { e.stopPropagation(); openEdit(b); }}>編輯</button>
            <button style={S.btnSm} onClick={e => { e.stopPropagation(); printBc(b); }}>列印</button>
            <button style={S.btnGray} onClick={e => { e.stopPropagation(); archiveBc(b.id); }}>封存</button>
            <button style={S.btnDanger} onClick={e => { e.stopPropagation(); deleteBc(b.id); }}>刪除</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h2 style={S.title}>診所公告與消息</h2>
        {tab === 0 && <button style={S.btn} onClick={openCreate}>+ 新增公告</button>}
        {tab === 1 && <button style={S.btn} onClick={() => setMsgModal(true)}>+ 發送消息</button>}
      </div>

      <div style={S.tabs}>
        <button style={{ ...S.tab, ...(tab === 0 ? S.tabOn : {}) }} onClick={() => setTab(0)}>
          公告列表 {unreadCount > 0 && <span style={S.unread}>{unreadCount}</span>}
        </button>
        <button style={{ ...S.tab, ...(tab === 1 ? S.tabOn : {}) }} onClick={() => setTab(1)}>發送消息</button>
      </div>

      {tab === 0 && <>
        <div style={S.filter}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>類型篩選:</span>
          {['全部', ...TYPES].map(t => (
            <button key={t} onClick={() => setFilterType(t)} style={{ ...S.btnSm, background: filterType === t ? accent : '#e2e8f0', color: filterType === t ? '#fff' : '#475569' }}>{t}</button>
          ))}
        </div>
        {active.length === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>暫無公告</p> : active.map(renderCard)}
      </>}

      {tab === 1 && <>
        {messages.length === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>暫無消息記錄</p> : messages.map(m => (
          <div key={m.id} style={S.msgCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{m.subject}</span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{m.sentAt}</span>
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>發件人: {m.from} | 收件人: {m.to}</div>
            <p style={{ margin: 0, fontSize: 14, color: '#475569', whiteSpace: 'pre-wrap' }}>{m.content}</p>
          </div>
        ))}
      </>}

      {modal && <div style={S.overlay} onClick={() => setModal(null)}>
        <div style={S.modal} onClick={e => e.stopPropagation()}>
          <h3 style={S.modalTitle}>{modal === 'edit' ? '編輯公告' : '新增公告'}</h3>
          <div style={S.field}><label style={S.label}>標題</label><input style={S.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div style={S.field}><label style={S.label}>內容</label><textarea style={S.textarea} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} /></div>
          <div style={{ ...S.row, ...S.field }}>
            <div style={{ flex: 1 }}><label style={S.label}>類型</label><select style={S.select} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div style={{ flex: 1 }}><label style={S.label}>優先級</label><select style={S.select} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></div>
            <div style={{ flex: 1 }}><label style={S.label}>狀態</label><select style={S.select} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{['已發布', '草稿'].map(s => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div style={S.field}>
            <label style={S.label}>目標店舖</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={form.stores.includes('全部')} onChange={() => setForm({ ...form, stores: ['全部'] })} /> 全部</label>
              {stores.map(s => <label key={s} style={{ fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={form.stores.includes(s)} onChange={() => { const ns = form.stores.filter(x => x !== '全部'); setForm({ ...form, stores: ns.includes(s) ? ns.filter(x => x !== s) : [...ns, s] }); }} /> {s}</label>)}
            </div>
          </div>
          <div style={{ ...S.row, ...S.field }}>
            <div style={{ flex: 1 }}><label style={S.label}>開始日期</label><input type="date" style={S.input} value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
            <div style={{ flex: 1 }}><label style={S.label}>結束日期</label><input type="date" style={S.input} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
          </div>
          <div style={S.field}><label style={{ ...S.label, cursor: 'pointer' }}><input type="checkbox" checked={form.pinned} onChange={e => setForm({ ...form, pinned: e.target.checked })} /> 置頂公告</label></div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button style={{ ...S.btn, background: '#94a3b8' }} onClick={() => setModal(null)}>取消</button>
            <button style={S.btn} onClick={submitBc}>{modal === 'edit' ? '更新' : '發布'}</button>
          </div>
        </div>
      </div>}

      {msgModal && <div style={S.overlay} onClick={() => setMsgModal(false)}>
        <div style={S.modal} onClick={e => e.stopPropagation()}>
          <h3 style={S.modalTitle}>發送消息</h3>
          <div style={S.field}><label style={S.label}>收件人</label><select style={{ ...S.select, width: '100%' }} value={msgForm.to} onChange={e => setMsgForm({ ...msgForm, to: e.target.value })}><option>全部</option>{stores.map(s => <option key={s}>{s}</option>)}</select></div>
          <div style={S.field}><label style={S.label}>主題</label><input style={S.input} value={msgForm.subject} onChange={e => setMsgForm({ ...msgForm, subject: e.target.value })} /></div>
          <div style={S.field}><label style={S.label}>內容</label><textarea style={S.textarea} value={msgForm.content} onChange={e => setMsgForm({ ...msgForm, content: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button style={{ ...S.btn, background: '#94a3b8' }} onClick={() => setMsgModal(false)}>取消</button>
            <button style={S.btn} onClick={sendMsg}>發送</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
