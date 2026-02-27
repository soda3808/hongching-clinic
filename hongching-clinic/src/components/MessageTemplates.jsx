import { useState, useMemo, useRef } from 'react';
import { uid } from '../data';

const STORAGE_KEY = 'hcmc_msg_templates';
const TYPES = ['預約提醒', '覆診通知', '取藥通知', '生日祝福', '繳費提醒', '推廣訊息', '診所公告', '其他'];
const VARIABLES = ['{{姓名}}', '{{日期}}', '{{時間}}', '{{醫師}}', '{{診所}}', '{{處方}}', '{{金額}}'];
const SAMPLE = { '{{姓名}}': '陳先生', '{{日期}}': '2026-02-28', '{{時間}}': '14:00', '{{醫師}}': '許植輝', '{{診所}}': '宋皇臺店', '{{處方}}': '四物湯', '{{金額}}': '$350' };

const DEFAULT_TEMPLATES = [
  { id: 'default_1', name: '預約提醒', type: '預約提醒', content: '{{姓名}}您好，提醒您明天({{日期}}) {{時間}}於{{診所}}有預約，醫師：{{醫師}}。如需更改請致電診所。', createdBy: '系統', createdAt: '2026-01-01' },
  { id: 'default_2', name: '覆診通知', type: '覆診通知', content: '{{姓名}}您好，您的覆診日期為{{日期}}，請提前預約。{{診所}}祝您健康。', createdBy: '系統', createdAt: '2026-01-01' },
  { id: 'default_3', name: '取藥通知', type: '取藥通知', content: '{{姓名}}您好，您的藥物已配好，請到{{診所}}取藥。', createdBy: '系統', createdAt: '2026-01-01' },
  { id: 'default_4', name: '生日祝福', type: '生日祝福', content: '{{姓名}}您好，{{診所}}祝您生日快樂！🎂', createdBy: '系統', createdAt: '2026-01-01' },
];

function loadTemplates() { try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY)); return d && d.length ? d : DEFAULT_TEMPLATES; } catch { return DEFAULT_TEMPLATES; } }
function saveTemplates(arr) { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }
function renderPreview(content) { let s = content; VARIABLES.forEach(v => { s = s.replaceAll(v, SAMPLE[v]); }); return s; }
function extractVars(content) { return VARIABLES.filter(v => content.includes(v)).map(v => v.replace(/[{}]/g, '')); }

const accent = '#0e7490';
const S = {
  page: { padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 },
  btn: { background: accent, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  btnSm: { background: accent, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  btnDanger: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  stats: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
  stat: { background: '#f0fdfa', border: `1px solid ${accent}33`, borderRadius: 8, padding: '10px 18px', textAlign: 'center', minWidth: 90 },
  statNum: { fontSize: 22, fontWeight: 700, color: accent },
  statLabel: { fontSize: 12, color: '#64748b' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { background: '#f1f5f9', padding: '10px 8px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' },
  td: { padding: '10px 8px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 28, width: '90%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#1e293b' },
  field: { marginBottom: 14 },
  label: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#334155' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, minHeight: 80, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  varRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 },
  varBtn: { background: '#ecfdf5', border: `1px solid ${accent}55`, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12, color: accent },
  preview: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, fontSize: 14, lineHeight: 1.6, color: '#1e293b', marginTop: 8, whiteSpace: 'pre-wrap' },
  badge: { display: 'inline-block', background: `${accent}18`, color: accent, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, marginRight: 4 },
  filter: { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' },
};

export default function MessageTemplates({ showToast, user }) {
  const [templates, setTemplates] = useState(loadTemplates);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', type: '預約提醒', content: '' });
  const [filterType, setFilterType] = useState('全部');
  const textRef = useRef(null);

  const save = (arr) => { setTemplates(arr); saveTemplates(arr); };

  const filtered = useMemo(() => filterType === '全部' ? templates : templates.filter(t => t.type === filterType), [templates, filterType]);

  const typeCounts = useMemo(() => {
    const m = {}; TYPES.forEach(t => { m[t] = 0; }); templates.forEach(t => { m[t.type] = (m[t.type] || 0) + 1; }); return m;
  }, [templates]);

  const openAdd = () => { setEditId(null); setForm({ name: '', type: '預約提醒', content: '' }); setShowModal(true); };
  const openEdit = (t) => { setEditId(t.id); setForm({ name: t.name, type: t.type, content: t.content }); setShowModal(true); };

  const handleSave = () => {
    if (!form.name.trim() || !form.content.trim()) { showToast && showToast('請填寫範本名稱和內容'); return; }
    if (editId) {
      save(templates.map(t => t.id === editId ? { ...t, name: form.name, type: form.type, content: form.content } : t));
      showToast && showToast('範本已更新');
    } else {
      const entry = { id: uid(), name: form.name, type: form.type, content: form.content, createdBy: user?.name || '未知', createdAt: new Date().toISOString().substring(0, 10) };
      save([...templates, entry]);
      showToast && showToast('範本已新增');
    }
    setShowModal(false);
  };

  const handleDelete = (id) => { if (window.confirm('確定刪除此範本？')) { save(templates.filter(t => t.id !== id)); showToast && showToast('範本已刪除'); } };

  const handleCopy = (content) => {
    const text = renderPreview(content);
    navigator.clipboard.writeText(text).then(() => showToast && showToast('已複製到剪貼板')).catch(() => showToast && showToast('複製失敗'));
  };

  const insertVar = (v) => {
    const ta = textRef.current; if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const newContent = form.content.substring(0, start) + v + form.content.substring(end);
    setForm({ ...form, content: newContent });
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + v.length; }, 0);
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h2 style={S.title}>訊息範本管理</h2>
        <button style={S.btn} onClick={openAdd}>+ 新增範本</button>
      </div>

      <div style={S.stats}>
        <div style={S.stat}><div style={S.statNum}>{templates.length}</div><div style={S.statLabel}>總範本數</div></div>
        {TYPES.filter(t => typeCounts[t] > 0).map(t => (
          <div key={t} style={S.stat}><div style={S.statNum}>{typeCounts[t]}</div><div style={S.statLabel}>{t}</div></div>
        ))}
      </div>

      <div style={S.filter}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#475569' }}>篩選類型：</span>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...S.input, width: 'auto' }}>
          <option>全部</option>
          {TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={S.table}>
          <thead>
            <tr>{['範本名稱', '類型', '內容預覽', '變數', '建立人', '建立日期', '操作'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 32 }}>沒有範本</td></tr>}
            {filtered.map(t => (
              <tr key={t.id}>
                <td style={{ ...S.td, fontWeight: 600 }}>{t.name}</td>
                <td style={S.td}><span style={S.badge}>{t.type}</span></td>
                <td style={{ ...S.td, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.content}</td>
                <td style={S.td}>{extractVars(t.content).map(v => <span key={v} style={{ ...S.badge, background: '#f0f9ff', color: '#0369a1' }}>{v}</span>)}</td>
                <td style={S.td}>{t.createdBy}</td>
                <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{t.createdAt}</td>
                <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                  <button style={S.btnSm} onClick={() => openEdit(t)}>編輯</button>
                  <button style={{ ...S.btnSm, background: '#6366f1' }} onClick={() => handleCopy(t.content)}>複製</button>
                  <button style={S.btnDanger} onClick={() => handleDelete(t.id)}>刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={S.overlay} onClick={() => setShowModal(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={S.modalTitle}>{editId ? '編輯範本' : '新增範本'}</h3>
            <div style={S.field}>
              <label style={S.label}>範本名稱</label>
              <input style={S.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例：預約提醒" />
            </div>
            <div style={S.field}>
              <label style={S.label}>類型</label>
              <select style={S.input} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={S.field}>
              <label style={S.label}>內容</label>
              <textarea ref={textRef} style={S.textarea} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="輸入訊息內容，可插入變數..." />
              <div style={S.varRow}>
                {VARIABLES.map(v => <button key={v} type="button" style={S.varBtn} onClick={() => insertVar(v)}>{v}</button>)}
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>預覽</label>
              <div style={S.preview}>{form.content ? renderPreview(form.content) : '（請輸入內容以預覽）'}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button style={{ ...S.btn, background: '#94a3b8' }} onClick={() => setShowModal(false)}>取消</button>
              <button style={S.btn} onClick={handleSave}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
