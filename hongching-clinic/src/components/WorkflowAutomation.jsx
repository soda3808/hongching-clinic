import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const RULES_KEY = 'hcmc_workflow_rules';
const LOG_KEY = 'hcmc_workflow_log';

const sCard = { background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 12 };
const sBtn = { padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const sPrimary = { ...sBtn, background: ACCENT, color: '#fff' };
const sOutline = { ...sBtn, background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}` };
const sInput = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const sSelect = { ...sInput, width: 'auto', minWidth: 120 };
const sTh = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#475569', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' };
const sTd = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };

const TRIGGER_TYPES = [
  { value: 'new_patient', label: '新病人登記' },
  { value: 'appointment_before', label: '預約前提醒' },
  { value: 'inventory_low', label: '藥材庫存低於閾值' },
  { value: 'consult_done', label: '診症完成' },
  { value: 'patient_birthday', label: '病人生日' },
  { value: 'no_revisit', label: '長期未覆診' },
  { value: 'daily_close', label: '日結完成' },
  { value: 'leave_approved', label: '員工請假獲批' },
];

const ACTION_TYPES = [
  { value: 'send_whatsapp', label: '發送WhatsApp訊息' },
  { value: 'send_reminder', label: '發送提醒通知' },
  { value: 'generate_report', label: '自動生成報告' },
  { value: 'create_purchase', label: '生成採購建議' },
  { value: 'update_schedule', label: '更新排班表' },
  { value: 'send_greeting', label: '發送祝福訊息' },
  { value: 'care_notice', label: '發送關懷通知' },
];

const TEMPLATES = [
  { name: '新病人歡迎WhatsApp', trigger: 'new_patient', conditionField: '', conditionOp: '', conditionVal: '', action: 'send_whatsapp', actionParam: '歡迎加入{clinicName}，祝您身體健康！' },
  { name: '預約前24小時提醒', trigger: 'appointment_before', conditionField: 'hoursBefore', conditionOp: '==', conditionVal: '24', action: 'send_reminder', actionParam: '溫馨提醒：您明天有預約，請準時到診。' },
  { name: '藥材庫存不足採購', trigger: 'inventory_low', conditionField: 'stockQty', conditionOp: '<', conditionVal: '10', action: 'create_purchase', actionParam: '自動生成採購建議單' },
  { name: '診症完成覆診提醒', trigger: 'consult_done', conditionField: '', conditionOp: '', conditionVal: '', action: 'send_reminder', actionParam: '建議{days}天後覆診，請預約時間。' },
  { name: '病人生日祝福', trigger: 'patient_birthday', conditionField: '', conditionOp: '', conditionVal: '', action: 'send_greeting', actionParam: '祝您生日快樂！{clinicName}祝您身體健康！' },
  { name: '長期未覆診關懷(>90天)', trigger: 'no_revisit', conditionField: 'daysSince', conditionOp: '>', conditionVal: '90', action: 'care_notice', actionParam: '好耐無見，掛住您！歡迎預約覆診。' },
  { name: '日結營業報告', trigger: 'daily_close', conditionField: '', conditionOp: '', conditionVal: '', action: 'generate_report', actionParam: '自動生成今日營業報告' },
  { name: '請假更新排班', trigger: 'leave_approved', conditionField: '', conditionOp: '', conditionVal: '', action: 'update_schedule', actionParam: '自動更新排班表' },
];

const COND_OPS = ['==', '!=', '>', '<', '>=', '<=', '包含'];

function loadRules() { try { return JSON.parse(localStorage.getItem(RULES_KEY) || '[]'); } catch { return []; } }
function saveRules(r) { try { localStorage.setItem(RULES_KEY, JSON.stringify(r)); } catch {} }
function loadLog() { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } }
function saveLog(l) { try { localStorage.setItem(LOG_KEY, JSON.stringify(l.slice(0, 500))); } catch {} }
function fmtTs(ts) { if (!ts) return ''; const d = new Date(ts); return d.toLocaleDateString('zh-HK') + ' ' + d.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function triggerLabel(v) { return TRIGGER_TYPES.find(t => t.value === v)?.label || v; }
function actionLabel(v) { return ACTION_TYPES.find(a => a.value === v)?.label || v; }

export default function WorkflowAutomation({ data, showToast, user }) {
  const clinicName = getClinicName();
  const [rules, setRules] = useState(loadRules);
  const [log, setLog] = useState(loadLog);
  const [tab, setTab] = useState('rules');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', trigger: 'new_patient', conditionField: '', conditionOp: '==', conditionVal: '', action: 'send_whatsapp', actionParam: '', enabled: true });

  const updateRules = (next) => { setRules(next); saveRules(next); };
  const addLogEntry = (ruleId, ruleName, result, detail) => {
    const entry = { id: uid(), ruleId, ruleName, ts: new Date().toISOString(), result, detail, user: user?.name || 'system' };
    const next = [entry, ...log];
    setLog(next); saveLog(next);
  };

  // --- Stats ---
  const stats = useMemo(() => {
    const today = new Date().toISOString().substring(0, 10);
    const todayLogs = log.filter(l => l.ts?.startsWith(today));
    const success = todayLogs.filter(l => l.result === 'success').length;
    const rate = todayLogs.length > 0 ? Math.round((success / todayLogs.length) * 100) : 100;
    return { active: rules.filter(r => r.enabled).length, total: rules.length, todayTriggered: todayLogs.length, successRate: rate };
  }, [rules, log]);

  // --- Template apply ---
  const applyTemplate = (tpl) => {
    setForm({ name: tpl.name, trigger: tpl.trigger, conditionField: tpl.conditionField, conditionOp: tpl.conditionOp || '==', conditionVal: tpl.conditionVal, action: tpl.action, actionParam: tpl.actionParam.replace('{clinicName}', clinicName), enabled: true });
    setEditing('new');
    showToast && showToast('已套用模板：' + tpl.name);
  };

  // --- Save rule ---
  const saveRule = () => {
    if (!form.name.trim()) { showToast && showToast('請輸入規則名稱'); return; }
    if (editing === 'new') {
      const rule = { ...form, id: uid(), createdAt: new Date().toISOString(), createdBy: user?.name || '' };
      updateRules([rule, ...rules]);
    } else {
      updateRules(rules.map(r => r.id === editing ? { ...r, ...form } : r));
    }
    setEditing(null);
    showToast && showToast('規則已儲存');
  };

  // --- Toggle enable ---
  const toggleRule = (id) => {
    updateRules(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  // --- Delete rule ---
  const deleteRule = (id) => {
    updateRules(rules.filter(r => r.id !== id));
    showToast && showToast('規則已刪除');
  };

  // --- Dry run (test) ---
  const testRule = (rule) => {
    const condStr = rule.conditionField
      ? ` | 條件: ${rule.conditionField} ${rule.conditionOp} ${rule.conditionVal}`
      : '';
    const detail = `[模擬] 觸發: ${triggerLabel(rule.trigger)}${condStr} | 動作: ${actionLabel(rule.action)} — ${rule.actionParam}`;
    addLogEntry(rule.id, rule.name, 'success', detail);
    showToast && showToast('模擬執行成功：' + rule.name);
  };

  // --- Duplicate rule ---
  const duplicateRule = (rule) => {
    const copy = {
      ...rule,
      id: uid(),
      name: rule.name + ' (副本)',
      createdAt: new Date().toISOString(),
      createdBy: user?.name || '',
    };
    updateRules([copy, ...rules]);
    showToast && showToast('已複製規則：' + copy.name);
  };

  // --- Edit ---
  const startEdit = (rule) => {
    setForm({ name: rule.name, trigger: rule.trigger, conditionField: rule.conditionField || '', conditionOp: rule.conditionOp || '==', conditionVal: rule.conditionVal || '', action: rule.action, actionParam: rule.actionParam || '', enabled: rule.enabled });
    setEditing(rule.id);
  };

  // --- Stat cards ---
  const statItems = [
    { label: '啟用規則', value: stats.active + '/' + stats.total, color: ACCENT },
    { label: '今日觸發次數', value: stats.todayTriggered, color: '#059669' },
    { label: '今日成功率', value: stats.successRate + '%', color: stats.successRate >= 90 ? '#059669' : '#d97706' },
    { label: '歷史記錄', value: log.length + ' 條', color: '#6366f1' },
  ];

  const tabs = [{ key: 'rules', label: '自動化規則' }, { key: 'templates', label: '規則模板' }, { key: 'log', label: '執行記錄' }];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ color: ACCENT, margin: '0 0 16px' }}>工作流自動化</h2>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        {statItems.map(s => (
          <div key={s.label} style={{ ...sCard, textAlign: 'center', padding: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ ...sBtn, background: tab === t.key ? ACCENT : '#f1f5f9', color: tab === t.key ? '#fff' : '#475569', borderRadius: '6px 6px 0 0', padding: '8px 18px' }}>{t.label}</button>
        ))}
        {tab === 'rules' && <button style={{ ...sPrimary, marginLeft: 'auto', borderRadius: 6 }} onClick={() => { setForm({ name: '', trigger: 'new_patient', conditionField: '', conditionOp: '==', conditionVal: '', action: 'send_whatsapp', actionParam: '', enabled: true }); setEditing('new'); }}>+ 新增規則</button>}
      </div>

      {/* Rule editor modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setEditing(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 560, width: '95%', maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: ACCENT }}>{editing === 'new' ? '新增自動化規則' : '編輯規則'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>規則名稱
                <input style={sInput} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例：新病人自動歡迎訊息" />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>觸發條件
                <select style={sSelect} value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value })}>
                  {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                <legend style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>進階條件（可選）</legend>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 6, alignItems: 'center' }}>
                  <input style={sInput} value={form.conditionField} onChange={e => setForm({ ...form, conditionField: e.target.value })} placeholder="欄位名稱" />
                  <select style={sSelect} value={form.conditionOp} onChange={e => setForm({ ...form, conditionOp: e.target.value })}>
                    {COND_OPS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input style={sInput} value={form.conditionVal} onChange={e => setForm({ ...form, conditionVal: e.target.value })} placeholder="比較值" />
                </div>
              </fieldset>
              <label style={{ fontSize: 13, fontWeight: 600 }}>執行動作
                <select style={sSelect} value={form.action} onChange={e => setForm({ ...form, action: e.target.value })}>
                  {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>動作參數 / 訊息內容
                <textarea style={{ ...sInput, minHeight: 60, resize: 'vertical' }} value={form.actionParam} onChange={e => setForm({ ...form, actionParam: e.target.value })} placeholder="訊息模板或動作參數" />
              </label>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> 啟用此規則
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button style={sOutline} onClick={() => setEditing(null)}>取消</button>
              <button style={sPrimary} onClick={saveRule}>儲存規則</button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Rules list */}
      {tab === 'rules' && (
        <div style={sCard}>
          {rules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>&#9881;</div>
              <div>尚未建立任何自動化規則</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>可從「規則模板」快速建立，或點擊「+ 新增規則」自訂</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={sTh}>狀態</th><th style={sTh}>規則名稱</th><th style={sTh}>觸發</th><th style={sTh}>條件</th><th style={sTh}>動作</th><th style={sTh}>操作</th>
                </tr></thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id} style={{ opacity: r.enabled ? 1 : 0.5 }}>
                      <td style={sTd}>
                        <span onClick={() => toggleRule(r.id)} style={{ cursor: 'pointer', display: 'inline-block', width: 36, height: 20, borderRadius: 10, background: r.enabled ? '#059669' : '#cbd5e1', position: 'relative', transition: 'background .2s' }}>
                          <span style={{ position: 'absolute', top: 2, left: r.enabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
                        </span>
                      </td>
                      <td style={{ ...sTd, fontWeight: 600 }}>{r.name}</td>
                      <td style={sTd}><span style={{ background: '#ecfdf5', color: '#065f46', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{triggerLabel(r.trigger)}</span></td>
                      <td style={sTd}>{r.conditionField ? <span style={{ fontSize: 12, color: '#64748b' }}>{r.conditionField} {r.conditionOp} {r.conditionVal}</span> : <span style={{ color: '#cbd5e1', fontSize: 12 }}>--</span>}</td>
                      <td style={sTd}><span style={{ background: '#eff6ff', color: '#1e40af', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{actionLabel(r.action)}</span></td>
                      <td style={{ ...sTd, whiteSpace: 'nowrap' }}>
                        <button style={{ ...sBtn, color: ACCENT, background: 'transparent', padding: '2px 8px', fontSize: 12 }} onClick={() => testRule(r)} title="模擬執行">&#9654; 測試</button>
                        <button style={{ ...sBtn, color: '#64748b', background: 'transparent', padding: '2px 8px', fontSize: 12 }} onClick={() => startEdit(r)} title="編輯">&#9998;</button>
                        <button style={{ ...sBtn, color: '#7c3aed', background: 'transparent', padding: '2px 8px', fontSize: 12 }} onClick={() => duplicateRule(r)} title="複製">&#10697;</button>
                        <button style={{ ...sBtn, color: '#dc2626', background: 'transparent', padding: '2px 8px', fontSize: 12 }} onClick={() => deleteRule(r.id)} title="刪除">&#10005;</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Flow summary */}
          {rules.length > 0 && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: '#f8fafc', borderRadius: 6, fontSize: 12, color: '#64748b' }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: '#334155' }}>規則流程摘要</div>
              {rules.filter(r => r.enabled).map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ background: '#ecfdf5', color: '#065f46', padding: '1px 6px', borderRadius: 4 }}>{triggerLabel(r.trigger)}</span>
                  {r.conditionField && (<><span style={{ color: '#94a3b8' }}>&#10148;</span><span style={{ background: '#fef9c3', color: '#92400e', padding: '1px 6px', borderRadius: 4 }}>{r.conditionField} {r.conditionOp} {r.conditionVal}</span></>)}
                  <span style={{ color: '#94a3b8' }}>&#10148;</span>
                  <span style={{ background: '#eff6ff', color: '#1e40af', padding: '1px 6px', borderRadius: 4 }}>{actionLabel(r.action)}</span>
                  <span style={{ color: '#cbd5e1', marginLeft: 4 }}>({r.name})</span>
                </div>
              ))}
              {rules.filter(r => r.enabled).length === 0 && <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>沒有啟用中的規則</div>}
            </div>
          )}
        </div>
      )}

      {/* Tab: Templates */}
      {tab === 'templates' && (
        <div>
          <div style={{ marginBottom: 10, padding: '8px 12px', background: '#f0fdfa', borderRadius: 6, fontSize: 13, color: '#0f766e' }}>
            點擊「套用此模板」可快速建立規則，套用後可在編輯視窗中修改參數。
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
            {TEMPLATES.map((tpl, i) => (
              <div key={i} style={{ ...sCard, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: '#0f172a' }}>{tpl.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    <span style={{ background: '#ecfdf5', color: '#065f46', padding: '1px 6px', borderRadius: 4, marginRight: 4 }}>{triggerLabel(tpl.trigger)}</span>
                    <span style={{ margin: '0 4px', color: '#94a3b8' }}>&#10148;</span>
                    <span style={{ background: '#eff6ff', color: '#1e40af', padding: '1px 6px', borderRadius: 4 }}>{actionLabel(tpl.action)}</span>
                  </div>
                  {tpl.conditionField && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>條件: {tpl.conditionField} {tpl.conditionOp} {tpl.conditionVal}</div>}
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>{tpl.actionParam}</div>
                </div>
                <button style={{ ...sPrimary, marginTop: 10, width: '100%' }} onClick={() => applyTemplate(tpl)}>套用此模板</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Execution log */}
      {tab === 'log' && (
        <div style={sCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>共 {log.length} 條記錄</span>
            {log.length > 0 && <button style={sOutline} onClick={() => { setLog([]); saveLog([]); showToast && showToast('已清除執行記錄'); }}>清除記錄</button>}
          </div>
          {log.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>暫無執行記錄</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={sTh}>時間</th><th style={sTh}>規則</th><th style={sTh}>結果</th><th style={sTh}>詳細</th><th style={sTh}>執行者</th>
                </tr></thead>
                <tbody>
                  {log.slice(0, 100).map(l => (
                    <tr key={l.id}>
                      <td style={{ ...sTd, whiteSpace: 'nowrap' }}>{fmtTs(l.ts)}</td>
                      <td style={{ ...sTd, fontWeight: 600 }}>{l.ruleName}</td>
                      <td style={sTd}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: l.result === 'success' ? '#dcfce7' : '#fee2e2', color: l.result === 'success' ? '#166534' : '#991b1b' }}>
                          {l.result === 'success' ? '成功' : '失敗'}
                        </span>
                      </td>
                      <td style={{ ...sTd, fontSize: 12, color: '#64748b', maxWidth: 300, wordBreak: 'break-all' }}>{l.detail}</td>
                      <td style={sTd}>{l.user}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
