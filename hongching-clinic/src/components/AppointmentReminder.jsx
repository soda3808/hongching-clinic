import { useState, useMemo, useEffect } from 'react';
import { getClinicName } from '../tenant';
import { uid } from '../data';
import { reminderRulesOps, reminderLogOps } from '../api';

const ACCENT = '#0e7490';
const TIMING_OPTS = ['1天前', '2天前', '3天前', '當天早上', '1小時前'];
const CHANNEL_OPTS = ['WhatsApp', 'SMS', '電話'];
const VARIABLES = ['{{姓名}}', '{{日期}}', '{{時間}}', '{{醫師}}', '{{診所}}'];
const SAMPLE = { '{{姓名}}': '陳先生', '{{日期}}': '2026-03-01', '{{時間}}': '14:00', '{{醫師}}': '許植輝', '{{診所}}': getClinicName() };
const STATUS_COLOR = { 已發送: '#2563eb', 已讀: '#16a34a', 失敗: '#ef4444' };
const TABS = ['提醒規則', '待發提醒', '發送記錄', '訊息模板'];

const DEFAULT_TEMPLATES = [
  { id: 'tpl_1', name: '預約提醒（標準）', content: '{{姓名}}您好，提醒您{{日期}} {{時間}}於{{診所}}有預約，醫師：{{醫師}}。如需更改請致電診所。' },
  { id: 'tpl_2', name: '當天提醒', content: '{{姓名}}您好，今天{{時間}}於{{診所}}有預約（{{醫師}}醫師），請準時到達。' },
];

function loadRules() { try { const d = JSON.parse(localStorage.getItem('hcmc_reminder_rules')); return Array.isArray(d) ? d : []; } catch { return []; } }
function saveRules(arr) { localStorage.setItem('hcmc_reminder_rules', JSON.stringify(arr)); reminderRulesOps.persistAll(arr); }
function loadLog() { try { const d = JSON.parse(localStorage.getItem('hcmc_reminder_log')); return Array.isArray(d) ? d : []; } catch { return []; } }
function saveLog(arr) { localStorage.setItem('hcmc_reminder_log', JSON.stringify(arr)); reminderLogOps.persistAll(arr); }
function renderPreview(content) { let s = content; VARIABLES.forEach(v => { s = s.replaceAll(v, SAMPLE[v]); }); return s; }

const S = {
  page: { padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 },
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 },
  tabs: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e2e8f0' },
  tab: { padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14, border: 'none', background: 'none', color: '#64748b', borderBottom: '2px solid transparent', marginBottom: -2 },
  tabActive: { color: ACCENT, borderBottomColor: ACCENT },
  stats: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  stat: { background: '#f0fdfa', border: `1px solid ${ACCENT}33`, borderRadius: 8, padding: '10px 18px', textAlign: 'center', minWidth: 100 },
  statNum: { fontSize: 22, fontWeight: 700, color: ACCENT },
  statLabel: { fontSize: 12, color: '#64748b' },
  btn: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  btnSm: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 },
  btnDanger: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 },
  btnOutline: { background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { background: '#f1f5f9', padding: '10px 8px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' },
  td: { padding: '10px 8px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 18, marginBottom: 14 },
  field: { marginBottom: 12 },
  label: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#334155' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' },
  select: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14 },
  textarea: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, minHeight: 70, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  varBtn: { background: '#ecfdf5', border: `1px solid ${ACCENT}55`, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12, color: ACCENT },
  preview: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#1e293b', marginTop: 6 },
  badge: (color) => ({ display: 'inline-block', background: color + '18', color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }),
  toggle: (on) => ({ width: 40, height: 22, borderRadius: 11, background: on ? ACCENT : '#cbd5e1', position: 'relative', cursor: 'pointer', border: 'none', transition: 'background .2s' }),
  toggleDot: (on) => ({ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 2, left: on ? 20 : 2, transition: 'left .2s' }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' },
  modalTitle: { fontSize: 18, fontWeight: 700, marginBottom: 14, color: '#1e293b' },
};

export default function AppointmentReminder({ data, showToast, user }) {
  const [tab, setTab] = useState(0);
  const [rules, setRules] = useState(loadRules);
  const [log, setLog] = useState(loadLog);
  useEffect(() => {
    reminderRulesOps.load().then(d => { if (d) setRules(d); });
    reminderLogOps.load().then(d => { if (d) setLog(d); });
  }, []);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [editRule, setEditRule] = useState(null);
  const [editTpl, setEditTpl] = useState(null);

  const bookings = useMemo(() => {
    const appts = data?.bookings || data?.appointments || [];
    const today = new Date().toISOString().substring(0, 10);
    return appts.filter(b => b.date >= today && b.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  }, [data]);

  const todayStr = new Date().toISOString().substring(0, 10);
  const todayLog = useMemo(() => log.filter(l => l.sentAt?.startsWith(todayStr)), [log, todayStr]);
  const sentToday = todayLog.length;
  const successRate = sentToday ? Math.round(todayLog.filter(l => l.status !== '失敗').length / sentToday * 100) : 0;
  const readRate = sentToday ? Math.round(todayLog.filter(l => l.status === '已讀').length / sentToday * 100) : 0;

  /* ---- Rule helpers ---- */
  const saveRule = (r) => {
    const updated = r.id ? rules.map(x => x.id === r.id ? r : x) : [...rules, { ...r, id: uid() }];
    setRules(updated); saveRules(updated); setEditRule(null); showToast('規則已儲存');
  };
  const deleteRule = (id) => { const updated = rules.filter(x => x.id !== id); setRules(updated); saveRules(updated); showToast('規則已刪除'); };
  const toggleRule = (id) => {
    const updated = rules.map(x => x.id === id ? { ...x, active: !x.active } : x);
    setRules(updated); saveRules(updated);
  };

  /* ---- Manual send ---- */
  const sendReminder = (appt) => {
    const entry = { id: uid(), patient: appt.patientName || appt.patient, date: appt.date, time: appt.time, channel: 'WhatsApp', status: '已發送', sentAt: new Date().toISOString(), sentBy: user?.name || '系統' };
    const updated = [entry, ...log];
    setLog(updated); saveLog(updated); showToast(`已發送提醒給 ${entry.patient}`);
  };

  /* ---- Template helpers ---- */
  const saveTpl = (t) => {
    const updated = t.id && templates.find(x => x.id === t.id) ? templates.map(x => x.id === t.id ? t : x) : [...templates, { ...t, id: uid() }];
    setTemplates(updated); setEditTpl(null); showToast('模板已儲存');
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h2 style={S.title}>預約提醒設定</h2>
        <div style={{ fontSize: 13, color: '#64748b' }}>{getClinicName()}</div>
      </div>

      {/* Stats */}
      <div style={S.stats}>
        <div style={S.stat}><div style={S.statNum}>{sentToday}</div><div style={S.statLabel}>今日已發送</div></div>
        <div style={S.stat}><div style={S.statNum}>{successRate}%</div><div style={S.statLabel}>成功率</div></div>
        <div style={S.stat}><div style={S.statNum}>{readRate}%</div><div style={S.statLabel}>已讀率</div></div>
        <div style={S.stat}><div style={S.statNum}>{rules.filter(r => r.active).length}</div><div style={S.statLabel}>啟用規則</div></div>
        <div style={S.stat}><div style={S.statNum}>{bookings.length}</div><div style={S.statLabel}>待提醒預約</div></div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{ ...S.tab, ...(tab === i ? S.tabActive : {}) }}>{t}</button>
        ))}
      </div>

      {/* Tab 0: Rules */}
      {tab === 0 && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <button style={S.btn} onClick={() => setEditRule({ timing: '1天前', channel: 'WhatsApp', templateId: templates[0]?.id || '', active: true })}>+ 新增規則</button>
          </div>
          {rules.length === 0 && <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>尚未設定提醒規則</div>}
          {rules.map(r => (
            <div key={r.id} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <span style={{ fontWeight: 600, marginRight: 8 }}>{r.timing}</span>
                <span style={S.badge(ACCENT)}>{r.channel}</span>
                <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>模板: {templates.find(t => t.id === r.templateId)?.name || '-'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button style={S.toggle(r.active)} onClick={() => toggleRule(r.id)}><span style={S.toggleDot(r.active)} /></button>
                <button style={S.btnOutline} onClick={() => setEditRule(r)}>編輯</button>
                <button style={S.btnDanger} onClick={() => deleteRule(r.id)}>刪除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 1: Upcoming reminders */}
      {tab === 1 && (
        <div style={{ overflowX: 'auto' }}>
          {bookings.length === 0 && <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>暫無待發提醒</div>}
          {bookings.length > 0 && (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>患者</th><th style={S.th}>日期</th><th style={S.th}>時間</th><th style={S.th}>醫師</th><th style={S.th}>狀態</th><th style={S.th}>操作</th>
              </tr></thead>
              <tbody>
                {bookings.slice(0, 50).map(b => {
                  const sent = log.some(l => l.patient === (b.patientName || b.patient) && l.date === b.date);
                  return (
                    <tr key={b.id || b.date + b.time}>
                      <td style={S.td}>{b.patientName || b.patient || '-'}</td>
                      <td style={S.td}>{b.date}</td>
                      <td style={S.td}>{b.time || '-'}</td>
                      <td style={S.td}>{b.doctor || '-'}</td>
                      <td style={S.td}>{sent ? <span style={S.badge('#16a34a')}>已提醒</span> : <span style={S.badge('#d97706')}>未提醒</span>}</td>
                      <td style={S.td}><button style={S.btnSm} onClick={() => sendReminder(b)}>發送提醒</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 2: Log */}
      {tab === 2 && (
        <div style={{ overflowX: 'auto' }}>
          {log.length === 0 && <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>暫無發送記錄</div>}
          {log.length > 0 && (
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>患者</th><th style={S.th}>日期</th><th style={S.th}>渠道</th><th style={S.th}>狀態</th><th style={S.th}>發送時間</th><th style={S.th}>操作人</th>
              </tr></thead>
              <tbody>
                {log.slice(0, 100).map(l => (
                  <tr key={l.id}>
                    <td style={S.td}>{l.patient}</td>
                    <td style={S.td}>{l.date} {l.time || ''}</td>
                    <td style={S.td}>{l.channel}</td>
                    <td style={S.td}><span style={S.badge(STATUS_COLOR[l.status] || '#64748b')}>{l.status}</span></td>
                    <td style={S.td}>{l.sentAt ? new Date(l.sentAt).toLocaleString('zh-HK') : '-'}</td>
                    <td style={S.td}>{l.sentBy || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3: Templates */}
      {tab === 3 && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <button style={S.btn} onClick={() => setEditTpl({ name: '', content: '' })}>+ 新增模板</button>
          </div>
          {templates.map(t => (
            <div key={t.id} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700 }}>{t.name}</span>
                <button style={S.btnOutline} onClick={() => setEditTpl(t)}>編輯</button>
              </div>
              <div style={S.preview}>{renderPreview(t.content)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Rule modal */}
      {editRule && (
        <div style={S.overlay} onClick={() => setEditRule(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={S.modalTitle}>{editRule.id ? '編輯規則' : '新增規則'}</h3>
            <div style={S.field}>
              <label style={S.label}>提醒時間</label>
              <select style={S.select} value={editRule.timing} onChange={e => setEditRule({ ...editRule, timing: e.target.value })}>
                {TIMING_OPTS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={S.field}>
              <label style={S.label}>發送渠道</label>
              <select style={S.select} value={editRule.channel} onChange={e => setEditRule({ ...editRule, channel: e.target.value })}>
                {CHANNEL_OPTS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div style={S.field}>
              <label style={S.label}>訊息模板</label>
              <select style={S.select} value={editRule.templateId} onChange={e => setEditRule({ ...editRule, templateId: e.target.value })}>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button style={S.btn} onClick={() => saveRule(editRule)}>儲存</button>
              <button style={{ ...S.btn, background: '#94a3b8' }} onClick={() => setEditRule(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Template modal */}
      {editTpl && (
        <div style={S.overlay} onClick={() => setEditTpl(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={S.modalTitle}>{editTpl.id ? '編輯模板' : '新增模板'}</h3>
            <div style={S.field}>
              <label style={S.label}>模板名稱</label>
              <input style={S.input} value={editTpl.name} onChange={e => setEditTpl({ ...editTpl, name: e.target.value })} />
            </div>
            <div style={S.field}>
              <label style={S.label}>訊息內容</label>
              <textarea style={S.textarea} value={editTpl.content} onChange={e => setEditTpl({ ...editTpl, content: e.target.value })} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {VARIABLES.map(v => (
                  <button key={v} style={S.varBtn} onClick={() => setEditTpl({ ...editTpl, content: editTpl.content + v })}>{v}</button>
                ))}
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>預覽</label>
              <div style={S.preview}>{renderPreview(editTpl.content)}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button style={S.btn} onClick={() => saveTpl(editTpl)}>儲存</button>
              <button style={{ ...S.btn, background: '#94a3b8' }} onClick={() => setEditTpl(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
