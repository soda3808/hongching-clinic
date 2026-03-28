import { useState, useMemo, useEffect } from 'react';
import { openWhatsApp, sendFollowupWhatsApp, dailyCareLogOps } from '../api';
import { uid } from '../data';
import { getClinicName } from '../tenant';

const ACCENT = '#0e7490';
const GREEN = '#25D366';
const LK = 'hcmc_daily_care_log';
const todayStr = () => new Date().toISOString().substring(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().substring(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const fmtDate = d => { if (!d) return '-'; const p = d.split('-'); return `${p[2]}/${p[1]}`; };

// ── Fixed Templates ──
const TEMPLATE_A = `【康晴綜合醫療中心 🌿】

Hi 👋，

做完治療，感覺 OK 嗎？
記得返去 多飲水、多休息 🛌，
等身體回一回氣，
咁樣對恢復最有幫助架！

順手 Follow 埋我地 IG @hongchingmed 呀 👇 https://instagram.com/hongchingmed

仲有我地Google 都可以評論，留言及5星喔 ☺️
https://maps.app.goo.gl/aA26FVw9QeHs5rju5

我地會定期 Update 養生健康資訊，得閒可以睇下～ 📱

下次見～😊`;

const TEMPLATE_B = `哈囉～
康晴綜合醫療中心提提您～
記得飲藥喔😉
有咩問題都歡迎查詢

順手 Follow 埋我地 IG @hongchingmed 呀 👇 https://instagram.com/hongchingmed

仲有我地Google 都可以評論及星星喔 ☺️
https://maps.app.goo.gl/aA26FVw9QeHs5rju5

我地會定期 Update 養生健康資訊，得閒可以睇～ 📱`;

const IMG_ACUPUNCTURE = '/images/acupuncture-aftercare.png';
const IMG_HERBAL = '/images/herbal-brewing.png';

const TABS = [
  { key: 'import', label: '匯入', icon: '📋' },
  { key: 'today', label: '今日關懷', icon: '💊' },
  { key: 'followup', label: '待跟進', icon: '🔔' },
  { key: 'quick', label: '快速登記', icon: '✏️' },
  { key: 'history', label: '發送記錄', icon: '📋' },
];

// ── TCM Online Parser ──
function classifyTreatment(service) {
  const s = service || '';
  const hasAcu = /針灸|拔罐|刮痧|艾灸|推拿|天灸/.test(s);
  const hasHerbal = /中藥|配藥|處方/.test(s);
  if (hasAcu && hasHerbal) return 'both';
  if (hasHerbal) return 'herbal';
  return 'acupuncture';
}

function parseTCMOnline(text, patients) {
  if (!text.trim()) return [];
  const lines = text.trim().split('\n');
  const results = [];

  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 9) continue;
    // Skip header row
    if (cols[4]?.includes('顧客姓名') || cols[3]?.includes('顧客編號')) continue;

    const patientName = cols[4]?.trim();
    if (!patientName) continue;

    // Match phone from existing patients
    const ptMatch = (patients || []).find(p =>
      p.name === patientName || (p.name || '').replace(/\s/g, '') === patientName.replace(/\s/g, '')
    );

    const service = cols[8]?.trim() || '';
    const treatmentType = classifyTreatment(service);

    results.push({
      id: uid(),
      store: cols[0]?.trim() || '',
      date: cols[1]?.trim() || todayStr(),
      queueNo: cols[2]?.trim() || '',
      customerCode: cols[3]?.trim() || '',
      patientName,
      gender: cols[5]?.trim() || '',
      age: cols[6]?.trim() || '',
      doctor: cols[7]?.trim() || '',
      service,
      treatmentType,
      phone: ptMatch?.phone || '',
      phoneSrc: ptMatch ? 'auto' : 'manual',
      include: true,
    });
  }
  return results;
}

function treatmentLabel(t) {
  if (t === 'herbal') return '中藥';
  if (t === 'acupuncture') return '針灸';
  return '中藥+針灸';
}
function treatmentColor(t) {
  if (t === 'herbal') return ['#ecfdf5', '#059669'];
  if (t === 'acupuncture') return ['#eff6ff', '#2563eb'];
  return ['#fef3c7', '#92400e'];
}

const EMPTY_QUICK = { name: '', phone: '', treatment: '內服中藥', doctor: '', herbs: '', days: '3', diagnosis: '', store: '' };

export default function DailyCare({ data, showToast, user }) {
  const clinicName = useMemo(() => getClinicName(), []);
  const [tab, setTab] = useState('import');
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

  // Import state
  const [pasteText, setPasteText] = useState('');
  const [parsedItems, setParsedItems] = useState([]);
  const [importDone, setImportDone] = useState(false);

  // Sending state
  const [sendingIds, setSendingIds] = useState({});
  const [batchSending, setBatchSending] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

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

  // ── Build app base URL for images ──
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

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
        const hasAcu = (c.treatments || []).some(t => /針灸|拔罐|艾灸|推拿|天灸/.test(t));
        const herbs = (c.prescription || []).filter(rx => rx.herb).map(rx => `${rx.herb}${rx.dosage ? ' ' + rx.dosage : ''}`).join('、');
        let treatmentType = 'acupuncture';
        if (hasHerbal && hasAcu) treatmentType = 'both';
        else if (hasHerbal) treatmentType = 'herbal';
        return {
          id: c.id, source: 'system',
          name: c.patientName || pt?.name || '未知',
          phone: c.patientPhone || pt?.phone || '',
          doctor: c.doctor || '', store: c.store || '',
          treatment: hasHerbal ? '內服中藥' : (c.treatments || [])[0] || '其他',
          treatmentType,
          isHerbal: hasHerbal,
          herbs, days: c.formulaDays || 3,
          diagnosis: c.tcmDiagnosis || '', pattern: c.tcmPattern || '',
          instructions: c.formulaInstructions || '每日一劑，水煎服',
          date: c.date, service: (c.treatments || []).join(';'),
          consentOk: pt ? pt.consentFollowUp !== false : true,
        };
      });

    // From quick-add
    const fromQuick = quickList
      .filter(q => q.date === selectedDate)
      .map(q => ({
        ...q, source: 'quick',
        name: q.name || q.patientName || '',
        treatmentType: q.treatmentType || (q.treatment === '內服中藥' ? 'herbal' : 'acupuncture'),
        isHerbal: q.treatment === '內服中藥' || q.treatmentType === 'herbal' || q.treatmentType === 'both',
        pattern: '', instructions: '每日一劑，水煎服',
        consentOk: true,
      }));

    return [...fromSystem, ...fromQuick].sort((a, b) => {
      const order = { both: 0, herbal: 1, acupuncture: 2 };
      if ((order[a.treatmentType] || 0) !== (order[b.treatmentType] || 0))
        return (order[a.treatmentType] || 0) - (order[b.treatmentType] || 0);
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
      ...quickList.filter(q => q.treatment === '內服中藥' || q.treatmentType === 'herbal').map(q => ({
        ...q, source: 'quick', name: q.name || q.patientName || '',
      })),
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
  const herbalCount = todayItems.filter(i => i.treatmentType === 'herbal' || i.treatmentType === 'both').length;
  const acuCount = todayItems.filter(i => i.treatmentType === 'acupuncture' || i.treatmentType === 'both').length;
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

  // ── Get template and image for treatment type ──
  const getTemplateAndImage = (treatmentType) => {
    if (treatmentType === 'herbal') return { message: TEMPLATE_B, imageUrl: `${appUrl}${IMG_HERBAL}` };
    if (treatmentType === 'acupuncture') return { message: TEMPLATE_A, imageUrl: `${appUrl}${IMG_ACUPUNCTURE}` };
    // 'both' → send herbal template (includes medicine reminder which is more important)
    return { message: TEMPLATE_B, imageUrl: `${appUrl}${IMG_HERBAL}` };
  };

  // ── Send via WhatsApp API (single) ──
  const handleApiSend = async (item, templateType) => {
    const phone = (item.phone || '').replace(/[\s\-()]/g, '');
    if (!phone) return showToast('此病人無電話號碼');

    const sendKey = `${item.id}_${templateType}`;
    setSendingIds(prev => ({ ...prev, [sendKey]: 'sending' }));

    const { message, imageUrl } = getTemplateAndImage(templateType);
    const result = await sendFollowupWhatsApp({ phone, message, imageUrl, store: item.store || '' });

    if (result.success) {
      setSendingIds(prev => ({ ...prev, [sendKey]: 'sent' }));
      const entry = {
        id: uid(), consultationId: item.id,
        patientName: item.name, phone,
        type: 'day0', message: `[${treatmentLabel(templateType)}模板] ${message.substring(0, 50)}...`,
        sentAt: new Date().toISOString(),
        sentBy: user?.name || user?.displayName || '系統',
        doctor: item.doctor, store: item.store || '',
        diagnosis: item.diagnosis || '', templateType,
        textMessageId: result.textMessageId, imageMessageId: result.imageMessageId,
      };
      if (!log.find(l => l.consultationId === item.id && l.type === 'day0' && l.templateType === templateType)) {
        saveLog([entry, ...log]);
      }
      showToast(`✅ 已發送 WhatsApp 俾 ${item.name}`);
    } else if (result.demo) {
      // Demo mode: fallback to wa.me
      setSendingIds(prev => ({ ...prev, [sendKey]: 'sent' }));
      const { message: msg } = getTemplateAndImage(templateType);
      openWhatsApp(phone, msg);
      const entry = {
        id: uid(), consultationId: item.id,
        patientName: item.name, phone,
        type: 'day0', message: `[${treatmentLabel(templateType)}模板-手動] ${msg.substring(0, 50)}...`,
        sentAt: new Date().toISOString(),
        sentBy: user?.name || user?.displayName || '系統',
        doctor: item.doctor, store: item.store || '',
        diagnosis: item.diagnosis || '', templateType,
      };
      if (!log.find(l => l.consultationId === item.id && l.type === 'day0' && l.templateType === templateType)) {
        saveLog([entry, ...log]);
      }
      showToast(`📱 已開啟 WhatsApp（API 未設定，用 wa.me 代替）`);
    } else {
      setSendingIds(prev => ({ ...prev, [sendKey]: 'failed' }));
      showToast(`❌ 發送失敗：${result.error || '未知錯誤'}`);
    }
  };

  // ── Send with custom AI message (wa.me fallback) ──
  const handleSendCustom = (item, type) => {
    const key = `${item.id}_${type}`;
    const message = aiMessages[key];
    if (!message) return showToast('請先生成訊息');
    const phone = (item.phone || '').replace(/[\s\-()]/g, '');
    if (!phone) return showToast('此病人無電話號碼');

    openWhatsApp(phone, message);

    const entry = {
      id: uid(), consultationId: item.id,
      patientName: item.name, phone,
      type, message,
      sentAt: new Date().toISOString(),
      sentBy: user?.name || user?.displayName || '系統',
      doctor: item.doctor, store: item.store || '',
      diagnosis: item.diagnosis || '',
    };
    if (!log.find(l => l.consultationId === item.id && l.type === type)) {
      saveLog([entry, ...log]);
    }
    showToast('已開啟 WhatsApp ✅');
  };

  // ── Batch Send All ──
  const handleBatchSend = async () => {
    const pending = todayItems.filter(item => {
      const phone = (item.phone || '').replace(/[\s\-()]/g, '');
      if (!phone) return false;
      const key = `${item.id}_${item.treatmentType}`;
      return sendingIds[key] !== 'sent' && !log.some(l => l.consultationId === item.id && l.type === 'day0');
    });

    if (!pending.length) return showToast('無待發送嘅病人');
    setBatchSending(true);
    setBatchProgress({ current: 0, total: pending.length });

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      setBatchProgress({ current: i + 1, total: pending.length });
      await handleApiSend(item, item.treatmentType);
      if (i < pending.length - 1) await new Promise(r => setTimeout(r, 1000));
    }

    setBatchSending(false);
    showToast(`✅ 批量發送完成！共 ${pending.length} 條`);
  };

  // ── Import handlers ──
  const handleParse = () => {
    const items = parseTCMOnline(pasteText, patients);
    if (!items.length) return showToast('無法解析，請確認複製咗完整嘅表格');
    setParsedItems(items);
    setImportDone(false);
    showToast(`✅ 已解析 ${items.length} 個病人`);
  };

  const handleImport = () => {
    const toImport = parsedItems.filter(i => i.include && i.phone);
    const noPhone = parsedItems.filter(i => i.include && !i.phone);
    if (noPhone.length > 0) {
      showToast(`⚠️ ${noPhone.length} 個病人無電話號碼，請手動填寫`);
      return;
    }
    if (!toImport.length) return showToast('無可匯入嘅病人');

    // Add to quickList
    const newEntries = toImport.map(i => ({
      id: i.id, date: i.date || selectedDate,
      name: i.patientName, patientName: i.patientName,
      phone: i.phone, treatment: i.treatmentType === 'herbal' ? '內服中藥' : '針灸',
      treatmentType: i.treatmentType,
      doctor: i.doctor, store: i.store,
      service: i.service, customerCode: i.customerCode,
      herbs: '', days: '3', diagnosis: '',
    }));

    const next = [...newEntries, ...quickList];
    saveQuickList(next);
    setImportDone(true);
    showToast(`✅ 已匯入 ${toImport.length} 個病人`);
    setTab('today');
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
  const getSendStatus = (id, tType) => sendingIds[`${id}_${tType}`] || (isSent(id, 'day0') ? 'sent' : 'pending');

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
          { n: herbalCount, label: '中藥', color: '#059669' },
          { n: acuCount, label: '針灸', color: '#6366f1' },
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

      {/* ═══ Tab: Import from 中醫在線 ═══ */}
      {tab === 'import' && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginBottom: 8 }}>📋 從中醫在線匯入今日病人</div>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
            1. 喺中醫在線揀選今日記錄 → 2. 全選表格內容（Ctrl+A）→ 3. 複製（Ctrl+C）→ 4. 貼入下面
          </p>

          <textarea
            style={{ ...S.textarea, minHeight: 120, fontFamily: 'monospace', fontSize: 12 }}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder="貼入中醫在線表格數據...&#10;&#10;例如：&#10;康晴綜合醫療中心(宋皇臺店)	2026-03-28	A004	CL1029742	吳月冰	女	62歲	許植輝	針灸治療	0.00	198.00	不需配藥	已收費"
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={handleParse} disabled={!pasteText.trim()} style={{ ...S.btn, opacity: pasteText.trim() ? 1 : 0.5 }}>🔍 解析</button>
            {parsedItems.length > 0 && (
              <button onClick={() => { setPasteText(''); setParsedItems([]); setImportDone(false); }} style={{ ...S.btnSm, background: '#64748b' }}>清除</button>
            )}
          </div>

          {/* Parsed preview */}
          {parsedItems.length > 0 && !importDone && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>預覽（{parsedItems.filter(i => i.include).length}/{parsedItems.length} 個病人）</div>
                <button onClick={handleImport} style={{ ...S.btn, background: GREEN }}>✅ 確認匯入</button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['', '姓名', '治療', '醫師', '電話', '店舖'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569', fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedItems.map((item, idx) => {
                      const [bg, fg] = treatmentColor(item.treatmentType);
                      return (
                        <tr key={item.id} style={{ background: item.include ? '#fff' : '#f8f8f8', opacity: item.include ? 1 : 0.5 }}>
                          <td style={S.td}>
                            <input type="checkbox" checked={item.include}
                              onChange={() => {
                                const next = [...parsedItems]; next[idx] = { ...next[idx], include: !next[idx].include }; setParsedItems(next);
                              }} />
                          </td>
                          <td style={S.td}><strong>{item.patientName}</strong></td>
                          <td style={S.td}>
                            <span style={S.badge(bg, fg)}>{treatmentLabel(item.treatmentType)}</span>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{item.service}</div>
                          </td>
                          <td style={S.td}>{item.doctor}</td>
                          <td style={S.td}>
                            {item.phoneSrc === 'auto' ? (
                              <span style={{ color: '#059669' }}>✅ {item.phone}</span>
                            ) : (
                              <input style={{ ...S.input, width: 120, border: '1px solid #f59e0b' }}
                                placeholder="輸入電話"
                                value={item.phone}
                                onChange={e => {
                                  const next = [...parsedItems]; next[idx] = { ...next[idx], phone: e.target.value }; setParsedItems(next);
                                }} />
                            )}
                          </td>
                          <td style={{ ...S.td, fontSize: 11, color: '#94a3b8' }}>{item.store}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Tab: Today's Care ═══ */}
      {tab === 'today' && (
        <div>
          {/* Batch send button */}
          {todayItems.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>
                💊 今日病人 ({todayItems.length})
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleBatchSend} disabled={batchSending}
                  style={{ ...S.btn, background: batchSending ? '#94a3b8' : GREEN }}>
                  {batchSending ? `📤 發送中 (${batchProgress.current}/${batchProgress.total})...` : '📤 一鍵發送全部'}
                </button>
              </div>
            </div>
          )}

          {/* Batch progress */}
          {batchSending && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ background: '#e2e8f0', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ background: GREEN, height: '100%', width: `${(batchProgress.current / batchProgress.total) * 100}%`, transition: 'width 0.3s' }} />
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center' }}>
                正在發送 {batchProgress.current}/{batchProgress.total}...
              </div>
            </div>
          )}

          {todayItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>今日暫無診症記錄</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>去「📋 匯入」從中醫在線匯入，或「✏️ 快速登記」手動加入</div>
            </div>
          )}

          {todayItems.map(item => {
            const status = getSendStatus(item.id, item.treatmentType);
            const [bg, fg] = treatmentColor(item.treatmentType);
            const key0 = `${item.id}_day0`;
            return (
              <div key={item.id} style={{ ...S.cardHerbal, borderLeftColor: status === 'sent' ? '#16a34a' : status === 'failed' ? '#dc2626' : ACCENT }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{item.name}</span>
                    {item.phone && <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>📱 {item.phone}</span>}
                    {item.doctor && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>👨‍⚕️ {item.doctor}</span>}
                    {item.store && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{item.store}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <span style={S.badge(bg, fg)}>{treatmentLabel(item.treatmentType)}</span>
                    {status === 'sent' && <span style={S.badge('#f0fdf4', '#16a34a')}>✅ 已發送</span>}
                    {status === 'sending' && <span style={S.badge('#fef3c7', '#92400e')}>⏳ 發送中</span>}
                    {status === 'failed' && <span style={S.badge('#fef2f2', '#dc2626')}>❌ 失敗</span>}
                    {item.source === 'quick' && <span style={S.badge('#fef3c7', '#92400e')}>匯入</span>}
                  </div>
                </div>

                {/* Service details */}
                {item.service && (
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
                    🏥 <strong>服務：</strong>{item.service}
                    {item.herbs && <><br/>🌿 <strong>處方：</strong>{item.herbs}</>}
                  </div>
                )}

                {/* Quick send buttons */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {/* Template-based quick send */}
                  {(item.treatmentType === 'acupuncture' || item.treatmentType === 'both') && (
                    <button onClick={() => handleApiSend(item, 'acupuncture')}
                      disabled={status === 'sending' || sendingIds[`${item.id}_acupuncture`] === 'sent'}
                      style={{ ...S.btnSm, background: sendingIds[`${item.id}_acupuncture`] === 'sent' ? '#94a3b8' : '#2563eb' }}>
                      {sendingIds[`${item.id}_acupuncture`] === 'sending' ? '⏳...' :
                       sendingIds[`${item.id}_acupuncture`] === 'sent' ? '✅ 針灸已發' : '⚡ 針灸模板'}
                    </button>
                  )}
                  {(item.treatmentType === 'herbal' || item.treatmentType === 'both') && (
                    <button onClick={() => handleApiSend(item, 'herbal')}
                      disabled={status === 'sending' || sendingIds[`${item.id}_herbal`] === 'sent'}
                      style={{ ...S.btnSm, background: sendingIds[`${item.id}_herbal`] === 'sent' ? '#94a3b8' : '#059669' }}>
                      {sendingIds[`${item.id}_herbal`] === 'sending' ? '⏳...' :
                       sendingIds[`${item.id}_herbal`] === 'sent' ? '✅ 中藥已發' : '⚡ 中藥模板'}
                    </button>
                  )}

                  {/* AI custom message */}
                  <button onClick={() => generateMessage(item, 'day0')} disabled={aiLoading[key0]}
                    style={{ ...S.btnSm, background: aiLoading[key0] ? '#94a3b8' : '#64748b' }}>
                    {aiLoading[key0] ? '⏳ AI...' : '🤖 AI 訊息'}
                  </button>
                  {aiMessages[key0] && (
                    <button onClick={() => handleSendCustom(item, 'day0')}
                      style={{ ...S.btnSm, background: GREEN }}>
                      📱 發 AI 訊息
                    </button>
                  )}
                </div>

                {/* AI message textarea (only shown when AI message exists) */}
                {(aiMessages[key0] || aiLoading[key0]) && (
                  <textarea
                    style={{ ...S.textarea, marginTop: 8 }}
                    value={aiMessages[key0] || ''}
                    onChange={e => setAiMessages(prev => ({ ...prev, [key0]: e.target.value }))}
                    placeholder={aiLoading[key0] ? '⏳ AI 生成中...' : ''}
                    rows={3}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ Tab: Follow-ups ═══ */}
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
                      {item.diff < 0 ? `遲咗 ${Math.abs(item.diff)} 日` : item.diff === 0 ? '今日跟進' : '明日跟進'}
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
                  <button onClick={() => handleSendCustom(item, 'day6')} disabled={!aiMessages[key6]}
                    style={{ ...S.btnSm, background: aiMessages[key6] ? GREEN : '#d1d5db', color: aiMessages[key6] ? '#fff' : '#94a3b8' }}>
                    📱 發送 WhatsApp
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ Tab: Quick Add ═══ */}
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
                    <span style={{ fontWeight: 600 }}>{q.name || q.patientName}</span>
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>📱 {q.phone}</span>
                    {(() => {
                      const tt = q.treatmentType || (q.treatment === '內服中藥' ? 'herbal' : 'acupuncture');
                      const [bg2, fg2] = treatmentColor(tt);
                      return <span style={S.badge(bg2, fg2)}>{treatmentLabel(tt)}</span>;
                    })()}
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

      {/* ═══ Tab: History ═══ */}
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
                          {l.templateType ? `${treatmentLabel(l.templateType)}模板` : l.type === 'day0' ? '食藥提醒' : '跟進問候'}
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
