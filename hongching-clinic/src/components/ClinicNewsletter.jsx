import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const NK = 'hcmc_newsletters', SK = 'hcmc_newsletter_sends';
const load = (k, fb) => { try { const d = JSON.parse(localStorage.getItem(k)); return Array.isArray(d) ? d : fb; } catch { return fb; } };
const persist = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const today = () => new Date().toISOString().slice(0, 10);
const ACCENT = '#0e7490';
const TEMPLATES = ['月刊', '健康資訊', '節氣養生', '新服務推廣', '優惠通知'];
const TARGETS = ['所有病人', '按年齡組別', '按到診頻率', '按治療類型'];
const AGE_GROUPS = ['18歲以下', '18-35歲', '36-50歲', '51-65歲', '65歲以上'];
const FREQ_GROUPS = ['首次到診', '1-3次', '4-10次', '10次以上'];
const TX_TYPES = ['診症', '針灸', '推拿', '拔罐', '天灸', '其他'];

const emptyForm = () => ({ title: '', subtitle: '', template: '月刊', sections: [{ heading: '', body: '' }], footer: '', target: '所有病人', targetDetail: '', scheduleDate: '', scheduleTime: '', channel: 'email' });

const S = {
  page: { padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 },
  tabs: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e2e8f0' },
  tab: { padding: '10px 22px', cursor: 'pointer', fontWeight: 600, fontSize: 14, border: 'none', background: 'none', color: '#64748b', borderBottom: '2px solid transparent', marginBottom: -2 },
  tabOn: { color: ACCENT, borderBottomColor: ACCENT },
  btn: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  btnSm: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  btnDanger: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  btnGray: { background: '#94a3b8', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 12 },
  stats: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
  stat: { background: '#f0fdfa', border: `1px solid ${ACCENT}33`, borderRadius: 8, padding: '10px 18px', textAlign: 'center', minWidth: 100 },
  statNum: { fontSize: 22, fontWeight: 700, color: ACCENT },
  statLabel: { fontSize: 12, color: '#64748b' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 28, width: '92%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#1e293b' },
  field: { marginBottom: 12 },
  label: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#334155' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, minHeight: 60, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  select: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  badge: { display: 'inline-block', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, marginRight: 6 },
  preview: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, lineHeight: 1.8, color: '#1e293b' },
};

function calcAge(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / 31557600000);
}

function matchTarget(patients, target, detail) {
  if (target === '所有病人') return patients;
  if (target === '按年齡組別') {
    return patients.filter(p => {
      const age = calcAge(p.dob);
      if (age === null) return false;
      if (detail === '18歲以下') return age < 18;
      if (detail === '18-35歲') return age >= 18 && age <= 35;
      if (detail === '36-50歲') return age >= 36 && age <= 50;
      if (detail === '51-65歲') return age >= 51 && age <= 65;
      if (detail === '65歲以上') return age > 65;
      return false;
    });
  }
  if (target === '按到診頻率') {
    return patients.filter(p => {
      const v = Number(p.totalVisits || 0);
      if (detail === '首次到診') return v <= 1;
      if (detail === '1-3次') return v >= 1 && v <= 3;
      if (detail === '4-10次') return v >= 4 && v <= 10;
      if (detail === '10次以上') return v > 10;
      return false;
    });
  }
  if (target === '按治療類型') {
    return patients.filter(p => (p.notes || '').includes(detail) || (p.lastService || '') === detail);
  }
  return patients;
}

export default function ClinicNewsletter({ data, showToast, user }) {
  const clinicName = useMemo(() => getClinicName(), []);
  const patients = data?.patients || [];
  const [tab, setTab] = useState(0);
  const [newsletters, setNewsletters] = useState(() => load(NK, []));
  const [sends, setSends] = useState(() => load(SK, []));
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [previewNl, setPreviewNl] = useState(null);

  const saveNl = arr => { setNewsletters(arr); persist(NK, arr); };
  const saveSd = arr => { setSends(arr); persist(SK, arr); };

  const openCreate = () => { setEditId(null); setForm(emptyForm()); setModal('edit'); };
  const openEdit = n => { setEditId(n.id); setForm({ title: n.title, subtitle: n.subtitle || '', template: n.template, sections: n.sections || [{ heading: '', body: '' }], footer: n.footer || '', target: n.target || '所有病人', targetDetail: n.targetDetail || '', scheduleDate: n.scheduleDate || '', scheduleTime: n.scheduleTime || '', channel: n.channel || 'email' }); setModal('edit'); };

  const addSection = () => setForm({ ...form, sections: [...form.sections, { heading: '', body: '' }] });
  const removeSection = i => setForm({ ...form, sections: form.sections.filter((_, idx) => idx !== i) });
  const updateSection = (i, key, val) => { const s = [...form.sections]; s[i] = { ...s[i], [key]: val }; setForm({ ...form, sections: s }); };

  const submitNl = () => {
    if (!form.title.trim()) { showToast && showToast('請填寫通訊標題'); return; }
    if (form.sections.every(s => !s.body.trim())) { showToast && showToast('請至少填寫一個內容段落'); return; }
    if (editId) {
      saveNl(newsletters.map(n => n.id === editId ? { ...n, ...form, updatedAt: now() } : n));
      showToast && showToast('通訊已更新');
    } else {
      const item = { id: uid(), ...form, author: user?.name || '管理員', createdAt: now(), status: '草稿' };
      saveNl([item, ...newsletters]);
      showToast && showToast('通訊已建立');
    }
    setModal(null);
  };

  const deleteNl = id => { saveNl(newsletters.filter(n => n.id !== id)); showToast && showToast('已刪除'); };

  const sendNl = n => {
    const recipients = matchTarget(patients, n.target, n.targetDetail);
    const count = recipients.length || Math.floor(Math.random() * 50) + 10;
    const openRate = Math.floor(Math.random() * 40) + 30;
    const clickRate = Math.floor(Math.random() * 20) + 5;
    const record = { id: uid(), newsletterId: n.id, title: n.title, channel: n.channel || 'email', sentAt: now(), recipientCount: count, openRate, clickRate, author: user?.name || '管理員' };
    saveSd([record, ...sends]);
    saveNl(newsletters.map(x => x.id === n.id ? { ...x, status: '已發送', lastSentAt: now() } : x));
    showToast && showToast(`已發送給 ${count} 位病人 (${n.channel === 'whatsapp' ? 'WhatsApp' : '電郵'})`);
  };

  const scheduleNl = n => {
    if (!n.scheduleDate || !n.scheduleTime) { showToast && showToast('請先設定排程日期和時間'); return; }
    saveNl(newsletters.map(x => x.id === n.id ? { ...x, status: '已排程' } : x));
    showToast && showToast(`已排程於 ${n.scheduleDate} ${n.scheduleTime} 發送`);
  };

  const printFlyer = n => {
    const sections = (n.sections || []).map(s => `${s.heading ? `<h3 style="color:${ACCENT};margin:16px 0 6px">${escapeHtml(s.heading)}</h3>` : ''}<p style="line-height:1.8;white-space:pre-wrap">${escapeHtml(s.body)}</p>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${escapeHtml(n.title)}</title><style>body{font-family:sans-serif;padding:40px;max-width:700px;margin:auto}h1{color:${ACCENT}}h2{color:#475569;font-size:16px;font-weight:400}hr{border:none;border-top:2px solid ${ACCENT};margin:20px 0}.footer{margin-top:30px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;color:#94a3b8}</style></head><body><h1>${escapeHtml(clinicName)}</h1><h1>${escapeHtml(n.title)}</h1>${n.subtitle ? `<h2>${escapeHtml(n.subtitle)}</h2>` : ''}<hr/>${sections}${n.footer ? `<div class="footer">${escapeHtml(n.footer)}</div>` : ''}</body></html>`);
    w.document.close();
    w.print();
  };

  const recipientCount = useMemo(() => {
    if (!form.target) return patients.length;
    return matchTarget(patients, form.target, form.targetDetail).length;
  }, [patients, form.target, form.targetDetail]);

  const statistics = useMemo(() => {
    const totalSent = sends.reduce((s, r) => s + (r.recipientCount || 0), 0);
    const avgOpen = sends.length ? Math.round(sends.reduce((s, r) => s + (r.openRate || 0), 0) / sends.length) : 0;
    const avgClick = sends.length ? Math.round(sends.reduce((s, r) => s + (r.clickRate || 0), 0) / sends.length) : 0;
    const tplCount = {};
    newsletters.forEach(n => { tplCount[n.template] = (tplCount[n.template] || 0) + 1; });
    const popular = Object.entries(tplCount).sort((a, b) => b[1] - a[1])[0];
    return { totalSent, avgOpen, avgClick, sendCount: sends.length, nlCount: newsletters.length, popular: popular ? popular[0] : '-' };
  }, [sends, newsletters]);

  const tabNames = ['建立通訊', '發送記錄', '通訊存檔', '統計'];

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h2 style={S.title}>診所通訊管理</h2>
        {tab === 0 && <button style={S.btn} onClick={openCreate}>+ 新增通訊</button>}
      </div>

      <div style={S.tabs}>
        {tabNames.map((t, i) => (
          <button key={t} style={{ ...S.tab, ...(tab === i ? S.tabOn : {}) }} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {tab === 0 && <>
        {newsletters.filter(n => n.status !== '已發送').length === 0
          ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>暫無草稿通訊，點擊「新增通訊」開始建立</p>
          : newsletters.filter(n => n.status !== '已發送').map(n => (
            <div key={n.id} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{ ...S.badge, background: `${ACCENT}15`, color: ACCENT }}>{n.template}</span>
                  <span style={{ ...S.badge, background: n.status === '草稿' ? '#f1f5f9' : n.status === '已排程' ? '#fef3c7' : '#dcfce7', color: n.status === '草稿' ? '#64748b' : n.status === '已排程' ? '#92400e' : '#16a34a' }}>{n.status}</span>
                  <span style={{ ...S.badge, background: '#f0f9ff', color: '#0369a1' }}>{n.channel === 'whatsapp' ? 'WhatsApp' : '電郵'}</span>
                </div>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{n.createdAt}</span>
              </div>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#1e293b' }}>{n.title}</h3>
              {n.subtitle && <p style={{ margin: '0 0 6px', fontSize: 13, color: '#64748b' }}>{n.subtitle}</p>}
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#475569' }}>目標：{n.target}{n.targetDetail ? ` - ${n.targetDetail}` : ''} | 作者：{n.author}</p>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button style={S.btnSm} onClick={() => openEdit(n)}>編輯</button>
                <button style={S.btnSm} onClick={() => setPreviewNl(n)}>預覽</button>
                <button style={{ ...S.btnSm, background: '#16a34a' }} onClick={() => sendNl(n)}>立即發送</button>
                <button style={{ ...S.btnSm, background: '#f59e0b' }} onClick={() => scheduleNl(n)}>排程發送</button>
                <button style={S.btnSm} onClick={() => printFlyer(n)}>列印傳單</button>
                <button style={S.btnDanger} onClick={() => deleteNl(n.id)}>刪除</button>
              </div>
            </div>
          ))
        }
      </>}

      {tab === 1 && <>
        {sends.length === 0
          ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>暫無發送記錄</p>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead><tr>{['標題', '渠道', '發送時間', '收件人數', '開啟率', '點擊率', '發送者'].map(h => <th key={h} style={{ background: '#f1f5f9', padding: '10px 8px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {sends.map(s => (
                    <tr key={s.id}>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9', fontWeight: 600 }}>{s.title}</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9' }}><span style={{ ...S.badge, background: '#f0f9ff', color: '#0369a1' }}>{s.channel === 'whatsapp' ? 'WhatsApp' : '電郵'}</span></td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{s.sentAt}</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>{s.recipientCount}</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: s.openRate >= 50 ? '#16a34a' : '#d97706' }}>{s.openRate}%</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>{s.clickRate}%</td>
                      <td style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9' }}>{s.author}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </>}

      {tab === 2 && <>
        {newsletters.filter(n => n.status === '已發送').length === 0
          ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>暫無已發送通訊</p>
          : newsletters.filter(n => n.status === '已發送').map(n => (
            <div key={n.id} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <span style={{ ...S.badge, background: `${ACCENT}15`, color: ACCENT }}>{n.template}</span>
                  <span style={{ ...S.badge, background: '#dcfce7', color: '#16a34a' }}>已發送</span>
                </div>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{n.lastSentAt || n.createdAt}</span>
              </div>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#1e293b' }}>{n.title}</h3>
              {n.subtitle && <p style={{ margin: '0 0 6px', fontSize: 13, color: '#64748b' }}>{n.subtitle}</p>}
              <div style={{ display: 'flex', gap: 4 }}>
                <button style={S.btnSm} onClick={() => setPreviewNl(n)}>查看內容</button>
                <button style={S.btnSm} onClick={() => printFlyer(n)}>列印傳單</button>
                <button style={{ ...S.btnSm, background: '#6366f1' }} onClick={() => sendNl(n)}>重新發送</button>
              </div>
            </div>
          ))
        }
      </>}

      {tab === 3 && <>
        <div style={S.stats}>
          <div style={S.stat}><div style={S.statNum}>{statistics.nlCount}</div><div style={S.statLabel}>通訊總數</div></div>
          <div style={S.stat}><div style={S.statNum}>{statistics.sendCount}</div><div style={S.statLabel}>發送次數</div></div>
          <div style={S.stat}><div style={S.statNum}>{statistics.totalSent}</div><div style={S.statLabel}>總送達人次</div></div>
          <div style={S.stat}><div style={S.statNum}>{statistics.avgOpen}%</div><div style={S.statLabel}>平均開啟率</div></div>
          <div style={S.stat}><div style={S.statNum}>{statistics.avgClick}%</div><div style={S.statLabel}>平均點擊率</div></div>
          <div style={S.stat}><div style={S.statNum}>{statistics.popular}</div><div style={S.statLabel}>最受歡迎類型</div></div>
        </div>
        {sends.length > 0 && <div style={S.card}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#1e293b' }}>發送趨勢</h3>
          {sends.slice(0, 10).map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 13 }}>
              <span style={{ minWidth: 100, color: '#64748b' }}>{(s.sentAt || '').slice(0, 10)}</span>
              <span style={{ fontWeight: 600, flex: 1 }}>{s.title}</span>
              <div style={{ width: 120, background: '#e2e8f0', borderRadius: 4, height: 16, position: 'relative' }}>
                <div style={{ width: `${s.openRate}%`, background: ACCENT, borderRadius: 4, height: '100%' }} />
                <span style={{ position: 'absolute', right: 4, top: 0, fontSize: 11, color: '#fff', lineHeight: '16px' }}>{s.openRate}%</span>
              </div>
            </div>
          ))}
        </div>}
      </>}

      {modal === 'edit' && <div style={S.overlay} onClick={() => setModal(null)}>
        <div style={S.modal} onClick={e => e.stopPropagation()}>
          <h3 style={S.modalTitle}>{editId ? '編輯通訊' : '新增通訊'}</h3>
          <div style={{ ...S.row, ...S.field }}>
            <div style={{ flex: 2 }}><label style={S.label}>範本類型</label><select style={{ ...S.select, width: '100%' }} value={form.template} onChange={e => setForm({ ...form, template: e.target.value })}>{TEMPLATES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div style={{ flex: 1 }}><label style={S.label}>發送渠道</label><select style={{ ...S.select, width: '100%' }} value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}><option value="email">電郵</option><option value="whatsapp">WhatsApp</option></select></div>
          </div>
          <div style={S.field}><label style={S.label}>標題</label><input style={S.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="例：二月份健康月刊" /></div>
          <div style={S.field}><label style={S.label}>副標題</label><input style={S.input} value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} placeholder="選填" /></div>
          <div style={S.field}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ ...S.label, margin: 0 }}>內容段落</label>
              <button style={S.btnSm} onClick={addSection}>+ 新增段落</button>
            </div>
            {form.sections.map((sec, i) => (
              <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>段落 {i + 1}</span>
                  {form.sections.length > 1 && <button style={{ ...S.btnDanger, fontSize: 11, padding: '2px 6px' }} onClick={() => removeSection(i)}>移除</button>}
                </div>
                <input style={{ ...S.input, marginBottom: 6 }} value={sec.heading} onChange={e => updateSection(i, 'heading', e.target.value)} placeholder="段落標題（選填）" />
                <textarea style={S.textarea} value={sec.body} onChange={e => updateSection(i, 'body', e.target.value)} placeholder="段落內容" />
              </div>
            ))}
          </div>
          <div style={S.field}><label style={S.label}>頁尾</label><input style={S.input} value={form.footer} onChange={e => setForm({ ...form, footer: e.target.value })} placeholder="例：如有查詢，請致電診所" /></div>
          <div style={{ ...S.row, ...S.field }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>目標受眾</label>
              <select style={{ ...S.select, width: '100%' }} value={form.target} onChange={e => setForm({ ...form, target: e.target.value, targetDetail: '' })}>{TARGETS.map(t => <option key={t}>{t}</option>)}</select>
            </div>
            {form.target === '按年齡組別' && <div style={{ flex: 1 }}><label style={S.label}>年齡組別</label><select style={{ ...S.select, width: '100%' }} value={form.targetDetail} onChange={e => setForm({ ...form, targetDetail: e.target.value })}><option value="">選擇</option>{AGE_GROUPS.map(g => <option key={g}>{g}</option>)}</select></div>}
            {form.target === '按到診頻率' && <div style={{ flex: 1 }}><label style={S.label}>頻率</label><select style={{ ...S.select, width: '100%' }} value={form.targetDetail} onChange={e => setForm({ ...form, targetDetail: e.target.value })}><option value="">選擇</option>{FREQ_GROUPS.map(g => <option key={g}>{g}</option>)}</select></div>}
            {form.target === '按治療類型' && <div style={{ flex: 1 }}><label style={S.label}>治療類型</label><select style={{ ...S.select, width: '100%' }} value={form.targetDetail} onChange={e => setForm({ ...form, targetDetail: e.target.value })}><option value="">選擇</option>{TX_TYPES.map(g => <option key={g}>{g}</option>)}</select></div>}
          </div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>預計收件人數：{recipientCount} 人</p>
          <div style={{ ...S.row, ...S.field }}>
            <div style={{ flex: 1 }}><label style={S.label}>排程日期</label><input type="date" style={S.input} value={form.scheduleDate} onChange={e => setForm({ ...form, scheduleDate: e.target.value })} /></div>
            <div style={{ flex: 1 }}><label style={S.label}>排程時間</label><input type="time" style={S.input} value={form.scheduleTime} onChange={e => setForm({ ...form, scheduleTime: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button style={{ ...S.btn, background: '#94a3b8' }} onClick={() => setModal(null)}>取消</button>
            <button style={S.btn} onClick={submitNl}>{editId ? '更新' : '儲存草稿'}</button>
          </div>
        </div>
      </div>}

      {previewNl && <div style={S.overlay} onClick={() => setPreviewNl(null)}>
        <div style={{ ...S.modal, maxWidth: 580 }} onClick={e => e.stopPropagation()}>
          <h3 style={S.modalTitle}>通訊預覽</h3>
          <div style={S.preview}>
            <div style={{ textAlign: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${ACCENT}` }}>
              <div style={{ fontSize: 13, color: ACCENT, fontWeight: 600, marginBottom: 4 }}>{clinicName}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{previewNl.title}</div>
              {previewNl.subtitle && <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{previewNl.subtitle}</div>}
            </div>
            {(previewNl.sections || []).map((sec, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                {sec.heading && <div style={{ fontSize: 15, fontWeight: 700, color: ACCENT, marginBottom: 4 }}>{sec.heading}</div>}
                <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{sec.body}</div>
              </div>
            ))}
            {previewNl.footer && <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e2e8f0', fontSize: 13, color: '#94a3b8' }}>{previewNl.footer}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <button style={S.btnGray} onClick={() => setPreviewNl(null)}>關閉</button>
            <button style={S.btnSm} onClick={() => printFlyer(previewNl)}>列印</button>
            <button style={{ ...S.btnSm, background: '#16a34a' }} onClick={() => { sendNl(previewNl); setPreviewNl(null); }}>確認發送</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
