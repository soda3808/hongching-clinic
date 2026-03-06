import { useState, useMemo, useEffect } from 'react';
import { openWhatsApp, dailyCareLogOps } from '../api';
import { uid } from '../data';
import { getClinicName } from '../tenant';

const ACCENT = '#0e7490';
const GREEN = '#25D366';
const LK = 'hcmc_daily_care_log';
const todayStr = () => new Date().toISOString().substring(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().substring(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const fmtDate = d => { if (!d) return '-'; const p = d.split('-'); return `${p[2]}/${p[1]}`; };

const TABS = [
  { key: 'today', label: '今日關懷', icon: '💊' },
  { key: 'followup', label: '待跟進', icon: '🔔' },
  { key: 'quick', label: '快速登記', icon: '✏️' },
  { key: 'history', label: '發送記錄', icon: '📋' },
];

// ── Quick-add form for patients not in system ──
const EMPTY_QUICK = { name: '', phone: '', treatment: '內服中藥', doctor: '', herbs: '', days: '3', diagnosis: '', store: '' };

export default function DailyCare({ data, showToast, user }) {
  const clinicName = useMemo(() => getClinicName(), []);
  const [tab, setTab] = useState('today');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [log, setLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LK) || '[]'); } catch { return []; }
  });
  const [aiMessages, setAiMessages] = useState({});
  const [aiLoading, setAiLoading] = useState({});
  const [quickForm, setQuickForm] = useState({ ...EMPTY_QUICK });
  const [quickList, setQuickList] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_daily_care_quick') || '[]'); } catch { return []; }
  });
  const [histSearch, setHistSearch] = useState('');

  // Load from Supabase on mount
  useEffect(() => {
    dailyCareLogOps.load().then(d => {
      if (d && Array.isArray(d)) { setLog(d); localStorage.setItem(LK, JSON.stringify(d)); }
    });
  }, []);

  const saveLog = (next) => {
    setLog(next);
    localStorage.setItem(LK, JSON.stringify(next));
    dailyCareLogOps.persistAll(next);
  };

  const saveQuickList = (next) => {
    setQuickList(next);
    localStorage.setItem('hcmc_daily_care_quick', JSON.stringify(next));
  };

  // ── Merge: system consultations + quick-add entries ──
  const consultations = data.consultations || [];
  const patients = data.patients || [];

  const todayItems = useMemo(() => {
    // From system consultations
    const fromSystem = consultations
      .filter(c => c.date === selectedDate)
      .map(c => {
        const pt = patients.find(p => p.id === c.patientId || p.name === c.patientName);
        const hasHerbal = (c.treatments || []).includes('內服中藥') || (c.prescription || []).some(rx => rx.herb);
        const herbs = (c.prescription || []).filter(rx => rx.herb).map(rx => `${rx.herb}${rx.dosage ? ' ' + rx.dosage : ''}`).join('、');
        return {
          id: c.id, source: 'system',
          name: c.patientName || pt?.name || '未知',
          phone: c.patientPhone || pt?.phone || '',
          doctor: c.doctor || '', store: c.store || '',
          treatment: hasHerbal ? '內服中藥' : (c.treatments || [])[0] || '其他',
          isHerbal: hasHerbal,
          herbs, days: c.formulaDays || 3,
          diagnosis: c.tcmDiagnosis || '', pattern: c.tcmPattern || '',
          instructions: c.formulaInstructions || '每日一劑，水煎服',
          date: c.date,
          consentOk: pt ? pt.consentFollowUp !== false : true,
        };
      });

    // From quick-add
    const fromQuick = quickList
      .filter(q => q.date === selectedDate)
      .map(q => ({
        ...q, source: 'quick',
        isHerbal: q.treatment === '內服中藥',
        pattern: '', instructions: '每日一劑，水煎服',
        consentOk: true,
      }));

    return [...fromSystem, ...fromQuick].sort((a, b) => {
      if (a.isHerbal !== b.isHerbal) return a.isHerbal ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [consultations, patients, selectedDate, quickList]);

  // ── Follow-ups due ──
  const followUpsDue = useMemo(() => {
    const td = todayStr();
    const allItems = [
      ...consultations.filter(c => {
        const hasHerbal = (c.treatments || []).includes('內服中藥') || (c.prescription || []).some(rx => rx.herb);
        return hasHerbal;
      }).map(c => {
        const pt = patients.find(p => p.id === c.patientId || p.name === c.patientName);
        const herbs = (c.prescription || []).filter(rx => rx.herb).map(rx => rx.herb).join('、');
        return {
          id: c.id, source: 'system', name: c.patientName || pt?.name || '',
          phone: c.patientPhone || pt?.phone || '', doctor: c.doctor || '',
          diagnosis: c.tcmDiagnosis || '', herbs, days: c.formulaDays || 3, date: c.date,
        };
      }),
      ...quickList.filter(q => q.treatment === '內服中藥').map(q => ({ ...q, source: 'quick' })),
    ];

    return allItems
      .filter(item => {
        const target = addDays(item.date, (item.days || 3) + 1);
        const diff = daysBetween(td, target);
        return diff >= -2 && diff <= 1;
      })
      .map(item => {
        const target = addDays(item.date, (item.days || 3) + 1);
        const diff = daysBetween(td, target);
        const sent = log.some(l => l.consultationId === item.id && l.type === 'day6');
        return { ...item, followUpTarget: target, diff, daysSinceVisit: daysBetween(item.date, td), day6Sent: sent };
      })
      .sort((a, b) => a.diff - b.diff);
  }, [consultations, patients, quickList, log]);

  // ── Stats ──
  const herbalCount = todayItems.filter(i => i.isHerbal).length;
  const otherCount = todayItems.filter(i => !i.isHerbal).length;
  const sentToday = log.filter(l => l.type === 'day0' && (l.sentAt || '').startsWith(selectedDate)).length;

  // ── AI Generation ──
  const generateMessage = async (item, type) => {
    const key = `${item.id}_${type}`;
    setAiLoading(prev => ({ ...prev, [key]: true }));

    let prompt;
    if (type === 'day0') {
      prompt = `你係一間中醫診所嘅助手，幫我寫一條WhatsApp訊息俾今日嚟睇過嘅病人。
病人姓名：${item.name}
診斷：${item.diagnosis || '一般調理'}
處方：${item.herbs || '中藥處方'}
服藥天數：${item.days || 3}天
煎服方法：${item.instructions || '每日一劑，水煎服'}

要求：
- 開頭用「【${clinicName}】」
- 用廣東話同繁體中文
- 親切溫暖嘅語氣，似朋友咁
- 提醒佢準時食藥
- 根據佢嘅病情簡單講下生活注意事項（例如飲食、休息）
- 2-3句就夠，唔好太長
- 直接寫訊息內容，唔好加引號或者任何前綴解釋`;
    } else {
      prompt = `你係一間中醫診所嘅助手，幫我寫一條WhatsApp跟進訊息俾病人。
病人姓名：${item.name}
原診斷：${item.diagnosis || '一般調理'}
距離睇症已經：${item.daysSinceVisit || 6}日
原處方：${item.herbs || '中藥處方'}

要求：
- 開頭用「【${clinicName}】」
- 用廣東話同繁體中文
- 關心佢食完藥之後感覺點
- 鼓勵佢如果仲有唔舒服就再預約覆診
- 親切支持嘅語氣，2-3句
- 直接寫訊息內容，唔好加引號或者任何前綴解釋`;
    }

    try {
      const res = await fetch('/api/ai?action=chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, context: {}, history: [] }),
      });
      const result = await res.json();
      if (result.success && result.reply) {
        // Clean up any quotes or prefixes the AI might add
        let msg = result.reply.trim();
        if (msg.startsWith('"') && msg.endsWith('"')) msg = msg.slice(1, -1);
        setAiMessages(prev => ({ ...prev, [key]: msg }));
      } else {
        showToast('AI 生成失敗，請重試');
      }
    } catch {
      showToast('AI 連線失敗');
    }
    setAiLoading(prev => ({ ...prev, [key]: false }));
  };

  const batchGenerate = async (items, type) => {
    const todo = items.filter(i => {
      const key = `${i.id}_${type}`;
      return !aiMessages[key] && !aiLoading[key] && i.isHerbal;
    });
    if (!todo.length) return showToast('所有訊息已生成');
    showToast(`正在生成 ${todo.length} 條訊息...`);
    for (const item of todo) {
      await generateMessage(item, type);
    }
    showToast(`✅ 已生成 ${todo.length} 條訊息`);
  };

  // ── Send WhatsApp ──
  const handleSend = (item, type) => {
    const key = `${item.id}_${type}`;
    const message = aiMessages[key];
    if (!message) return showToast('請先生成訊息');
    const phone = (item.phone || '').replace(/[\s\-()]/g, '');
    if (!phone) return showToast('此病人無電話號碼');
    if (!item.consentOk) return showToast('此病人未同意接收訊息');

    openWhatsApp(phone, message);

    const entry = {
      id: uid(), consultationId: item.id,
      patientName: item.name, phone,
      type, message,
      sentAt: new Date().toISOString(),
      sentBy: user?.name || user?.displayName || '系統',
      doctor: item.doctor, store: item.store,
      diagnosis: item.diagnosis || '',
    };
    if (!log.find(l => l.consultationId === item.id && l.type === type)) {
      saveLog([entry, ...log]);
    }
    showToast('已開啟 WhatsApp ✅');
  };

  // ── Quick Add ──
  const handleQuickAdd = () => {
    if (!quickForm.name || !quickForm.phone) return showToast('請填姓名同電話');
    const entry = { ...quickForm, id: uid(), date: selectedDate };
    const next = [entry, ...quickList];
    saveQuickList(next);
    setQuickForm({ ...EMPTY_QUICK });
    showToast('已加入今日病人 ✅');
    setTab('today');
  };

  // ── History ──
  const filteredHistory = useMemo(() => {
    let list = [...log].sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''));
    if (histSearch) list = list.filter(l =>
      (l.patientName || '').includes(histSearch) || (l.phone || '').includes(histSearch)
    );
    return list.slice(0, 100);
  }, [log, histSearch]);

  // Check if sent
  const isSent = (id, type) => log.some(l => l.consultationId === id && l.type === type);

  // ── Render ──
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>💝 每日關懷</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
          {selectedDate !== todayStr() && (
            <button onClick={() => setSelectedDate(todayStr())} style={{ ...S.btnSm, background: '#64748b' }}>返回今日</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { n: todayItems.length, label: '今日診症', color: ACCENT },
          { n: herbalCount, label: '食藥', color: '#059669' },
          { n: otherCount, label: '針灸/其他', color: '#6366f1' },
          { n: sentToday, label: '已發送', color: GREEN },
          { n: followUpsDue.filter(f => !f.day6Sent).length, label: '待跟進', color: '#dc2626' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', textAlign: 'center', flex: '1 1 100px', minWidth: 80 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.n}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 16, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14, border: 'none', background: 'none',
              color: tab === t.key ? ACCENT : '#64748b', borderBottom: `2px solid ${tab === t.key ? ACCENT : 'transparent'}`, marginBottom: -2, whiteSpace: 'nowrap' }}>
            {t.icon} {t.label}
            {t.key === 'followup' && followUpsDue.filter(f => !f.day6Sent).length > 0 && (
              <span style={{ background: '#dc2626', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, marginLeft: 6 }}>
                {followUpsDue.filter(f => !f.day6Sent).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ Tab 1: Today's Care ═══ */}
      {tab === 'today' && (
        <div>
          {herbalCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>💊 食藥病人 ({herbalCount})</div>
              <button onClick={() => batchGenerate(todayItems, 'day0')} style={S.btn}>🤖 一鍵生成全部訊息</button>
            </div>
          )}

          {todayItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>今日暫無診症記錄</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>去「✏️ 快速登記」加入今日病人</div>
            </div>
          )}

          {todayItems.map(item => {
            const key0 = `${item.id}_day0`;
            const sent = isSent(item.id, 'day0');
            return (
              <div key={item.id} style={item.isHerbal ? S.cardHerbal : S.cardLight}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{item.name}</span>
                    {item.phone && <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>📱 {item.phone}</span>}
                    {item.doctor && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>👨‍⚕️ {item.doctor}</span>}
                    {item.store && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{item.store}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span style={S.badge(item.isHerbal ? '#ecfdf5' : '#eff6ff', item.isHerbal ? '#059669' : '#2563eb')}>
                      {item.treatment}
                    </span>
                    {sent && <span style={S.badge('#f0fdf4', '#16a34a')}>✅ 已發送</span>}
                    {!item.consentOk && <span style={S.badge('#fef2f2', '#dc2626')}>⚠️ 未同意</span>}
                    {item.source === 'quick' && <span style={S.badge('#fef3c7', '#92400e')}>手動</span>}
                  </div>
                </div>

                {/* Details for herbal */}
                {item.isHerbal && (
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
                    {item.diagnosis && <div>🏥 <strong>診斷：</strong>{item.diagnosis}{item.pattern ? ` (${item.pattern})` : ''}</div>}
                    {item.herbs && <div>🌿 <strong>處方：</strong>{item.herbs}</div>}
                    <div>📅 <strong>服藥：</strong>{item.days}天 · {item.instructions}</div>
                  </div>
                )}

                {/* AI Message area for herbal patients */}
                {item.isHerbal && (
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      style={S.textarea}
                      value={aiMessages[key0] || ''}
                      onChange={e => setAiMessages(prev => ({ ...prev, [key0]: e.target.value }))}
                      placeholder={aiLoading[key0] ? '⏳ AI 生成中...' : '按「生成訊息」由 AI 自動生成溫馨提醒...'}
                      rows={3}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button onClick={() => generateMessage(item, 'day0')} disabled={aiLoading[key0]}
                        style={{ ...S.btnSm, background: aiLoading[key0] ? '#94a3b8' : ACCENT }}>
                        {aiLoading[key0] ? '⏳ 生成中...' : '🤖 生成訊息'}
                      </button>
                      <button onClick={() => handleSend(item, 'day0')} disabled={!aiMessages[key0]}
                        style={{ ...S.btnSm, background: aiMessages[key0] ? GREEN : '#d1d5db', color: aiMessages[key0] ? '#fff' : '#94a3b8' }}>
                        📱 發送 WhatsApp
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ Tab 2: Follow-ups ═══ */}
      {tab === 'followup' && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 12 }}>
            🔔 食完藥跟進（自動計算：睇症日 + 服藥天數 + 1日）
          </div>

          {followUpsDue.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>今日暫無需要跟進嘅病人</div>
            </div>
          )}

          {followUpsDue.map(item => {
            const key6 = `${item.id}_day6`;
            return (
              <div key={item.id} style={{ ...S.cardHerbal, borderLeftColor: item.diff < 0 ? '#dc2626' : item.diff === 0 ? '#f59e0b' : '#94a3b8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{item.name}</span>
                    {item.phone && <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>📱 {item.phone}</span>}
                    {item.doctor && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>👨‍⚕️ {item.doctor}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span style={S.badge(
                      item.diff < 0 ? '#fef2f2' : item.diff === 0 ? '#fffbeb' : '#f0fdf4',
                      item.diff < 0 ? '#dc2626' : item.diff === 0 ? '#d97706' : '#16a34a'
                    )}>
                      {item.diff < 0 ? `遲咗 ${Math.abs(item.diff)} 日` : item.diff === 0 ? '今日跟進' : `明日跟進`}
                    </span>
                    {item.day6Sent && <span style={S.badge('#f0fdf4', '#16a34a')}>✅ 已跟進</span>}
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
                  <div>📅 睇症日：{fmtDate(item.date)}（{item.daysSinceVisit}日前）</div>
                  {item.diagnosis && <div>🏥 原診斷：{item.diagnosis}</div>}
                  {item.herbs && <div>🌿 原處方：{item.herbs}</div>}
                  <div>💊 服藥{item.days}天 → 預計食完：{fmtDate(addDays(item.date, item.days))}</div>
                </div>

                <textarea
                  style={S.textarea}
                  value={aiMessages[key6] || ''}
                  onChange={e => setAiMessages(prev => ({ ...prev, [key6]: e.target.value }))}
                  placeholder={aiLoading[key6] ? '⏳ AI 生成中...' : '按「生成跟進訊息」由 AI 自動生成...'}
                  rows={3}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button onClick={() => generateMessage(item, 'day6')} disabled={aiLoading[key6]}
                    style={{ ...S.btnSm, background: aiLoading[key6] ? '#94a3b8' : ACCENT }}>
                    {aiLoading[key6] ? '⏳ 生成中...' : '🤖 生成跟進訊息'}
                  </button>
                  <button onClick={() => handleSend(item, 'day6')} disabled={!aiMessages[key6]}
                    style={{ ...S.btnSm, background: aiMessages[key6] ? GREEN : '#d1d5db', color: aiMessages[key6] ? '#fff' : '#94a3b8' }}>
                    📱 發送 WhatsApp
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ Tab 3: Quick Add ═══ */}
      {tab === 'quick' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 12 }}>
              ✏️ 快速登記今日病人
            </div>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 0, marginBottom: 12 }}>
              如果病人資料喺中醫在線但唔喺本系統，可以快速登記用嚟發關懷訊息。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <div>
                <label style={S.label}>姓名 *</label>
                <input style={S.input} placeholder="病人姓名" value={quickForm.name} onChange={e => setQuickForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label style={S.label}>電話 *</label>
                <input style={S.input} placeholder="8位電話" value={quickForm.phone} onChange={e => setQuickForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label style={S.label}>治療類型</label>
                <select style={S.input} value={quickForm.treatment} onChange={e => setQuickForm(f => ({ ...f, treatment: e.target.value }))}>
                  {['內服中藥', '針灸', '推拿', '天灸', '拔罐', '刮痧', '艾灸', '其他'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>醫師</label>
                <input style={S.input} placeholder="醫師名" value={quickForm.doctor} onChange={e => setQuickForm(f => ({ ...f, doctor: e.target.value }))} />
              </div>
            </div>
            {quickForm.treatment === '內服中藥' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 10 }}>
                <div>
                  <label style={S.label}>處方藥材</label>
                  <input style={S.input} placeholder="桂枝、白芍、甘草..." value={quickForm.herbs} onChange={e => setQuickForm(f => ({ ...f, herbs: e.target.value }))} />
                </div>
                <div>
                  <label style={S.label}>服藥天數</label>
                  <input style={S.input} type="number" min="1" max="30" value={quickForm.days} onChange={e => setQuickForm(f => ({ ...f, days: e.target.value }))} />
                </div>
                <div>
                  <label style={S.label}>診斷</label>
                  <input style={S.input} placeholder="感冒、腰痛..." value={quickForm.diagnosis} onChange={e => setQuickForm(f => ({ ...f, diagnosis: e.target.value }))} />
                </div>
                <div>
                  <label style={S.label}>店舖</label>
                  <input style={S.input} placeholder="太子店/宋皇臺店" value={quickForm.store} onChange={e => setQuickForm(f => ({ ...f, store: e.target.value }))} />
                </div>
              </div>
            )}
            <button onClick={handleQuickAdd} style={{ ...S.btn, marginTop: 12 }}>✅ 加入今日列表</button>
          </div>

          {/* Today's quick-added patients */}
          {quickList.filter(q => q.date === selectedDate).length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                今日已登記 ({quickList.filter(q => q.date === selectedDate).length})
              </div>
              {quickList.filter(q => q.date === selectedDate).map(q => (
                <div key={q.id} style={{ ...S.cardLight, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{q.name}</span>
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>📱 {q.phone}</span>
                    <span style={S.badge(q.treatment === '內服中藥' ? '#ecfdf5' : '#eff6ff', q.treatment === '內服中藥' ? '#059669' : '#2563eb')}>{q.treatment}</span>
                    {q.herbs && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>🌿 {q.herbs}</span>}
                  </div>
                  <button onClick={() => {
                    const next = quickList.filter(x => x.id !== q.id);
                    saveQuickList(next);
                    showToast('已刪除');
                  }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#dc2626' }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Tab 4: History ═══ */}
      {tab === 'history' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input style={S.input} placeholder="🔍 搜索病人名/電話" value={histSearch} onChange={e => setHistSearch(e.target.value)} />
            {log.length > 0 && (
              <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>共 {log.length} 條記錄</span>
            )}
          </div>

          {filteredHistory.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>暫無發送記錄</div>
            </div>
          )}

          {filteredHistory.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['日期', '病人', '類型', '醫師', '訊息摘要', '發送人'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569', fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map(l => (
                    <tr key={l.id}>
                      <td style={S.td}>{l.sentAt ? l.sentAt.substring(0, 10) : '-'}</td>
                      <td style={S.td}><strong>{l.patientName}</strong><br/><span style={{ fontSize: 11, color: '#94a3b8' }}>{l.phone}</span></td>
                      <td style={S.td}>
                        <span style={S.badge(l.type === 'day0' ? '#ecfdf5' : '#eff6ff', l.type === 'day0' ? '#059669' : '#2563eb')}>
                          {l.type === 'day0' ? '食藥提醒' : '跟進問候'}
                        </span>
                      </td>
                      <td style={S.td}>{l.doctor || '-'}</td>
                      <td style={{ ...S.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.message?.substring(0, 40)}...</td>
                      <td style={S.td}>{l.sentBy || '-'}</td>
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

const S = {
  btn: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  btnSm: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  cardHerbal: { background: '#fff', border: '1px solid #e2e8f0', borderLeft: `4px solid ${ACCENT}`, borderRadius: 10, padding: 16, marginBottom: 12 },
  cardLight: { background: '#fafafa', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 8 },
  badge: (bg, c) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: bg, color: c, marginRight: 4, marginLeft: 4 }),
  textarea: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, minHeight: 60, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  input: { width: '100%', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 },
  td: { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
};
