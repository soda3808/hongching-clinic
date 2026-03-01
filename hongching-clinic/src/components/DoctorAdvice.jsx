import { useState, useMemo } from 'react';
import { uid } from '../data';
import escapeHtml from '../utils/escapeHtml';

const PERSONAL_KEY = 'hcmc_doctor_advice';
const COMPANY_KEY = 'hcmc_company_advice';
const CATEGORIES = ['服藥方法', '飲食禁忌', '生活建議', '覆診提醒', '其他'];
const PRESETS = [
  '忌食生冷、辛辣、油膩食物',
  '服藥期間忌飲茶、咖啡',
  '每日一劑，水煎服，分兩次溫服',
  '孕婦慎用',
  '如有不適，請即停藥並覆診',
  '七天後覆診',
];

function load(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } }
function save(key, arr) { localStorage.setItem(key, JSON.stringify(arr)); }

export default function DoctorAdvice({ showToast, user }) {
  const [tab, setTab] = useState('personal');
  const [items, setItems] = useState(() => ({ personal: load(PERSONAL_KEY), company: load(COMPANY_KEY) }));
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ text: '', showOnRx: true, category: '其他' });

  const list = items[tab];
  const storageKey = tab === 'personal' ? PERSONAL_KEY : COMPANY_KEY;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return list.filter(a => !q || a.text?.toLowerCase().includes(q) || a.category?.includes(q) || a.createdBy?.includes(q));
  }, [list, search]);

  const persist = (key, arr) => {
    setItems(prev => ({ ...prev, [tab]: arr }));
    save(key, arr);
  };

  const openAdd = (presetText) => {
    setEditId(null);
    setForm({ text: presetText || '', showOnRx: true, category: '其他' });
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditId(item.id);
    setForm({ text: item.text, showOnRx: item.showOnRx ?? true, category: item.category || '其他' });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.text.trim()) return showToast('請輸入醫囑文字');
    const entry = { id: editId || uid(), text: form.text.trim(), showOnRx: form.showOnRx, category: form.category, createdBy: editId ? list.find(a => a.id === editId)?.createdBy : (user?.name || ''), createdAt: editId ? list.find(a => a.id === editId)?.createdAt : new Date().toISOString().substring(0, 10) };
    const updated = editId ? list.map(a => a.id === editId ? entry : a) : [...list, entry];
    persist(storageKey, updated);
    showToast(editId ? '已更新醫囑' : '已新增醫囑');
    setShowModal(false);
  };

  const handleDelete = (id) => {
    const updated = list.filter(a => a.id !== id);
    persist(storageKey, updated);
    showToast('已刪除醫囑');
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text).then(() => showToast('已複製到剪貼板'));
  };

  const handlePrint = () => {
    const rows = filtered.map(a => `${escapeHtml(a.text)}  [${escapeHtml(a.category)}]  ${a.showOnRx ? '處方顯示' : ''}  ${escapeHtml(a.createdBy)} ${escapeHtml(a.createdAt)}`).join('\n');
    const w = window.open('', '_blank');
    w.document.write(`<pre style="font-family:serif;font-size:14px;line-height:1.8">${tab === 'personal' ? '我的醫囑' : '公司醫囑'} 範本列表\n${'─'.repeat(40)}\n${rows || '(無資料)'}\n${'─'.repeat(40)}\n列印日期：${new Date().toLocaleDateString('zh-TW')}</pre>`);
    w.document.close();
    w.print();
  };

  const AC = '#0e7490';

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>📋 醫囑範本管理</h2>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
          {[['personal', `我的醫囑 (${items.personal.length})`], ['company', `公司醫囑 (${items.company.length})`]].map(([k, label]) => (
            <button key={k} onClick={() => { setTab(k); setSearch(''); }} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === k ? 700 : 400, background: tab === k ? AC : 'transparent', color: tab === k ? '#fff' : '#555' }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Search & Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋醫囑內容..." className="input" style={{ flex: 1, minWidth: 200 }} />
        <button onClick={() => openAdd()} className="btn btn-primary" style={{ background: AC }}>+ 新增醫囑</button>
        <button onClick={handlePrint} className="btn btn-outline" style={{ fontSize: 13 }}>🖨 列印</button>
      </div>

      {/* Presets */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>常用醫囑快速新增：</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESETS.map(p => (
            <button key={p} onClick={() => openAdd(p)} style={{ padding: '4px 10px', fontSize: 12, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 14, cursor: 'pointer', color: '#065f46' }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              {['醫囑文字', '分類', '處方上顯示', '建立人員', '建立日期', '操作'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#999' }}>尚無醫囑範本，點擊「新增醫囑」或使用上方快速新增按鈕。</td></tr>
            )}
            {filtered.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '8px 10px', maxWidth: 320, wordBreak: 'break-all' }}>{a.text}</td>
                <td style={{ padding: '8px 10px' }}><span style={{ background: '#e0f2fe', color: AC, padding: '2px 8px', borderRadius: 10, fontSize: 12 }}>{a.category}</span></td>
                <td style={{ padding: '8px 10px' }}>{a.showOnRx ? <span style={{ color: '#059669' }}>✓ 是</span> : <span style={{ color: '#aaa' }}>否</span>}</td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{a.createdBy}</td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{a.createdAt}</td>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => copyText(a.text)} className="btn btn-outline" style={{ fontSize: 11, padding: '3px 8px' }}>複製</button>
                    <button onClick={() => openEdit(a)} className="btn btn-outline" style={{ fontSize: 11, padding: '3px 8px' }}>編輯</button>
                    <button onClick={() => handleDelete(a.id)} className="btn btn-outline" style={{ fontSize: 11, padding: '3px 8px', color: '#dc2626' }}>刪除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 480, boxShadow: '0 8px 30px rgba(0,0,0,.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{editId ? '編輯醫囑' : '新增醫囑'}</h3>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>醫囑文字</label>
            <textarea value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} rows={3} className="input" style={{ width: '100%', marginBottom: 12, resize: 'vertical' }} placeholder="輸入醫囑內容..." />
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>分類</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="input" style={{ width: '100%', marginBottom: 12 }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.showOnRx} onChange={e => setForm(f => ({ ...f, showOnRx: e.target.checked }))} />
              處方上顯示此醫囑
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} className="btn btn-outline">取消</button>
              <button onClick={handleSave} className="btn btn-primary" style={{ background: AC }}>{editId ? '更新' : '新增'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
