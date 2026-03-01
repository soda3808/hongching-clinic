import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getDoctors } from '../data';
import escapeHtml from '../utils/escapeHtml';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const PK = 'hcmc_policies', AK = 'hcmc_policy_acks';
const CATS = ['人事政策', '臨床政策', '行政政策', '安全政策', '財務政策', '客戶政策'];
const STATUS_LABELS = { draft: '草稿', active: '生效', archived: '已封存' };
const STATUS_COLORS = { draft: { bg: '#f1f5f9', c: '#64748b' }, active: { bg: '#dcfce7', c: '#16a34a' }, archived: { bg: '#fee2e2', c: '#dc2626' } };
const load = (k, fb) => { try { const d = JSON.parse(localStorage.getItem(k)); return Array.isArray(d) ? d : fb; } catch { return fb; } };
const persist = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const today = () => new Date().toISOString().slice(0, 10);
const diffDays = (a, b) => Math.ceil((new Date(a) - new Date(b)) / 864e5);

const S = {
  page: { padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 },
  btn: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  btnSm: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  btnDanger: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  btnGray: { background: '#94a3b8', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 12 },
  badge: { display: 'inline-block', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, marginRight: 6 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 28, width: '92%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#1e293b' },
  field: { marginBottom: 12 },
  label: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#334155' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, minHeight: 100, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  select: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  filter: { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  warn: { background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: '#92400e' },
};

const emptyForm = () => ({ title: '', category: CATS[0], content: '', effectiveDate: today(), version: '1.0', status: 'draft', lastReviewDate: today(), nextReviewDate: '', approvedBy: '' });

export default function ClinicPolicy({ data, showToast, user }) {
  const clinicName = useMemo(() => getClinicName(), []);
  const doctors = useMemo(() => getDoctors(), []);
  const [policies, setPolicies] = useState(() => load(PK, []));
  const [acks, setAcks] = useState(() => load(AK, []));
  const [modal, setModal] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('全部');
  const [filterStatus, setFilterStatus] = useState('全部');
  const [viewPolicy, setViewPolicy] = useState(null);

  const save = arr => { setPolicies(arr); persist(PK, arr); };
  const saveAcks = arr => { setAcks(arr); persist(AK, arr); };

  const filtered = useMemo(() => {
    let list = policies;
    if (filterCat !== '全部') list = list.filter(p => p.category === filterCat);
    if (filterStatus !== '全部') list = list.filter(p => p.status === filterStatus);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) || p.category.includes(q));
    }
    return list.sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''));
  }, [policies, filterCat, filterStatus, search]);

  const reminders = useMemo(() => {
    const t = today();
    return policies.filter(p => p.status === 'active' && p.nextReviewDate && diffDays(p.nextReviewDate, t) <= 30 && diffDays(p.nextReviewDate, t) >= 0);
  }, [policies]);

  const openCreate = () => { setEditId(null); setForm(emptyForm()); setModal('form'); };
  const openEdit = p => { setEditId(p.id); setForm({ title: p.title, category: p.category, content: p.content, effectiveDate: p.effectiveDate || '', version: p.version || '1.0', status: p.status, lastReviewDate: p.lastReviewDate || '', nextReviewDate: p.nextReviewDate || '', approvedBy: p.approvedBy || '' }); setModal('form'); };

  const submit = () => {
    if (!form.title.trim() || !form.content.trim()) { showToast && showToast('請填寫標題及內容'); return; }
    if (editId) {
      save(policies.map(p => p.id === editId ? { ...p, ...form, updatedAt: today() } : p));
      showToast && showToast('政策已更新');
    } else {
      save([{ id: uid(), ...form, createdBy: user?.name || '管理員', createdAt: today(), updatedAt: today() }, ...policies]);
      showToast && showToast('政策已新增');
    }
    setModal(null);
  };

  const deletePolicy = id => { save(policies.filter(p => p.id !== id)); showToast && showToast('政策已刪除'); };

  const toggleAck = policyId => {
    const userName = user?.name || '未知';
    const exists = acks.find(a => a.policyId === policyId && a.user === userName);
    if (exists) return;
    const updated = [...acks, { id: uid(), policyId, user: userName, date: today() }];
    saveAcks(updated);
    showToast && showToast('已確認閱讀');
  };

  const getAckCount = policyId => acks.filter(a => a.policyId === policyId).length;
  const hasAcked = policyId => acks.some(a => a.policyId === policyId && a.user === (user?.name || '未知'));

  const printPolicy = p => {
    const ackList = acks.filter(a => a.policyId === p.id);
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${escapeHtml(p.title)}</title><style>body{font-family:serif;padding:50px 60px;color:#1e293b;line-height:1.8}h1{text-align:center;font-size:22px;border-bottom:2px solid #333;padding-bottom:10px}h2{font-size:18px;margin-top:30px}.meta{font-size:13px;color:#555;margin-bottom:20px;text-align:center}.content{white-space:pre-wrap;font-size:15px;margin:20px 0}.footer{margin-top:40px;border-top:1px solid #ccc;padding-top:16px;font-size:12px;color:#888}.ack-table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}.ack-table th,.ack-table td{border:1px solid #ccc;padding:6px 10px;text-align:left}.ack-table th{background:#f5f5f5}</style></head><body>`
      + `<h1>${escapeHtml(clinicName)}</h1>`
      + `<h2>${escapeHtml(p.title)}</h2>`
      + `<div class="meta">類別: ${escapeHtml(p.category)} | 版本: ${escapeHtml(p.version || '1.0')} | 狀態: ${escapeHtml(STATUS_LABELS[p.status] || p.status)} | 生效日期: ${p.effectiveDate || '-'}</div>`
      + `<div class="meta">批准人: ${escapeHtml(p.approvedBy || '-')} | 上次審查: ${p.lastReviewDate || '-'} | 下次審查: ${p.nextReviewDate || '-'}</div>`
      + `<hr/><div class="content">${escapeHtml(p.content)}</div>`
      + (ackList.length ? `<div class="footer"><b>已確認閱讀人員 (${ackList.length})</b><table class="ack-table"><tr><th>姓名</th><th>日期</th></tr>${ackList.map(a => `<tr><td>${escapeHtml(a.user)}</td><td>${a.date}</td></tr>`).join('')}</table></div>` : '')
      + `</body></html>`);
    w.document.close();
    w.print();
  };

  const renderForm = () => (
    <div style={S.overlay} onClick={() => setModal(null)}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <h3 style={S.modalTitle}>{editId ? '編輯政策' : '新增政策'}</h3>
        <div style={S.field}><label style={S.label}>標題</label><input style={S.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
        <div style={{ ...S.row, ...S.field }}>
          <div style={{ flex: 1 }}><label style={S.label}>類別</label><select style={{ ...S.select, width: '100%' }} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
          <div style={{ flex: 1 }}><label style={S.label}>狀態</label><select style={{ ...S.select, width: '100%' }} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{['draft', 'active', 'archived'].map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></div>
          <div style={{ flex: 1 }}><label style={S.label}>版本</label><input style={S.input} value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} /></div>
        </div>
        <div style={S.field}><label style={S.label}>內容</label><textarea style={S.textarea} rows={6} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} /></div>
        <div style={{ ...S.row, ...S.field }}>
          <div style={{ flex: 1 }}><label style={S.label}>生效日期</label><input type="date" style={S.input} value={form.effectiveDate} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label style={S.label}>批准人</label><select style={{ ...S.select, width: '100%' }} value={form.approvedBy} onChange={e => setForm({ ...form, approvedBy: e.target.value })}><option value="">-- 選擇 --</option>{doctors.map(d => <option key={d}>{d}</option>)}</select></div>
        </div>
        <div style={{ ...S.row, ...S.field }}>
          <div style={{ flex: 1 }}><label style={S.label}>上次審查日期</label><input type="date" style={S.input} value={form.lastReviewDate} onChange={e => setForm({ ...form, lastReviewDate: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label style={S.label}>下次審查日期</label><input type="date" style={S.input} value={form.nextReviewDate} onChange={e => setForm({ ...form, nextReviewDate: e.target.value })} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button style={{ ...S.btn, background: '#94a3b8' }} onClick={() => setModal(null)}>取消</button>
          <button style={S.btn} onClick={submit}>{editId ? '更新' : '新增'}</button>
        </div>
      </div>
    </div>
  );

  const renderDetail = () => {
    const p = viewPolicy;
    if (!p) return null;
    const pAcks = acks.filter(a => a.policyId === p.id);
    const sc = STATUS_COLORS[p.status] || STATUS_COLORS.draft;
    return (
      <div style={S.overlay} onClick={() => setViewPolicy(null)}>
        <div style={S.modal} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <h3 style={{ ...S.modalTitle, margin: 0 }}>{p.title}</h3>
            <span style={{ ...S.badge, background: sc.bg, color: sc.c }}>{STATUS_LABELS[p.status]}</span>
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
            類別: {p.category} | 版本: {p.version} | 生效: {p.effectiveDate || '-'} | 批准: {p.approvedBy || '-'}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8, color: '#334155', background: '#f8fafc', borderRadius: 8, padding: 16, marginBottom: 16 }}>{p.content}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>上次審查: {p.lastReviewDate || '-'} | 下次審查: {p.nextReviewDate || '-'}</div>
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>已閱讀確認 ({pAcks.length})</span>
              {!hasAcked(p.id) && <button style={S.btn} onClick={() => { toggleAck(p.id); setViewPolicy({ ...p }); }}>確認已閱讀</button>}
              {hasAcked(p.id) && <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>已確認</span>}
            </div>
            {pAcks.length > 0 && <div style={{ fontSize: 13, color: '#475569' }}>{pAcks.map(a => <div key={a.id} style={{ padding: '3px 0' }}>{a.user} - {a.date}</div>)}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button style={S.btnGray} onClick={() => { printPolicy(p); }}>列印</button>
            <button style={{ ...S.btn, background: '#94a3b8' }} onClick={() => setViewPolicy(null)}>關閉</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h2 style={S.title}>診所政策管理</h2>
        <button style={S.btn} onClick={openCreate}>+ 新增政策</button>
      </div>

      {reminders.length > 0 && <div style={S.warn}>
        <b>審查提醒:</b> 以下 {reminders.length} 項政策的審查日期即將到期（30天內）：
        {reminders.map(r => <div key={r.id} style={{ marginTop: 4 }}> - {r.title}（到期: {r.nextReviewDate}，剩餘 {diffDays(r.nextReviewDate, today())} 天）</div>)}
      </div>}

      <div style={S.filter}>
        <input style={{ ...S.input, width: 200 }} placeholder="搜尋政策..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={S.select} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="全部">全部類別</option>
          {CATS.map(c => <option key={c}>{c}</option>)}
        </select>
        <select style={S.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="全部">全部狀態</option>
          {['draft', 'active', 'archived'].map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>共 {filtered.length} 項</span>
      </div>

      {filtered.length === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>暫無政策記錄</p> : filtered.map(p => {
        const sc = STATUS_COLORS[p.status] || STATUS_COLORS.draft;
        const approaching = p.status === 'active' && p.nextReviewDate && diffDays(p.nextReviewDate, today()) <= 30 && diffDays(p.nextReviewDate, today()) >= 0;
        return (
          <div key={p.id} style={{ ...S.card, borderLeft: `4px solid ${p.status === 'active' ? '#16a34a' : p.status === 'archived' ? '#dc2626' : '#94a3b8'}`, cursor: 'pointer' }} onClick={() => setViewPolicy(p)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <span style={{ ...S.badge, background: `${ACCENT}15`, color: ACCENT }}>{p.category}</span>
                <span style={{ ...S.badge, background: sc.bg, color: sc.c }}>{STATUS_LABELS[p.status]}</span>
                <span style={{ ...S.badge, background: '#f1f5f9', color: '#475569' }}>v{p.version}</span>
                {approaching && <span style={{ ...S.badge, background: '#fef3c7', color: '#92400e' }}>即將審查</span>}
              </div>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{p.effectiveDate}</span>
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#1e293b' }}>{p.title}</h3>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.content}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#94a3b8' }}>
              <span>批准: {p.approvedBy || '-'} | 已閱: {getAckCount(p.id)} 人{hasAcked(p.id) ? ' (已確認)' : ''}</span>
              <div onClick={e => e.stopPropagation()}>
                <button style={S.btnSm} onClick={() => openEdit(p)}>編輯</button>
                <button style={S.btnGray} onClick={() => printPolicy(p)}>列印</button>
                <button style={S.btnDanger} onClick={() => deletePolicy(p.id)}>刪除</button>
              </div>
            </div>
          </div>
        );
      })}

      {modal === 'form' && renderForm()}
      {viewPolicy && renderDetail()}
    </div>
  );
}
