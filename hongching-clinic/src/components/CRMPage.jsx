import { useState, useMemo, useRef, useEffect } from 'react';
import { saveConversation, openWhatsApp, saveInquiry } from '../api';
import { uid, CLINIC_PRICING } from '../data';
import { getClinicName, getTenantStores, getTenantStoreNames } from '../tenant';
import { useFocusTrap, nullRef } from './ConfirmModal';
import { S, ECTCM, rowStyle } from '../styles/ectcm';


function buildQuickReplies() {
  const clinicName = getClinicName();
  const stores = getTenantStores();
  const addrLines = stores.map(s => `${s.name}店：${s.address || ''}`).join('\n');
  return [
    { label: '收費表', text: Object.entries(CLINIC_PRICING).map(([k, v]) => `${k}：$${v.price}`).join('\n') },
    { label: '預約', text: '歡迎預約！請提供以下資料：\n1. 姓名\n2. 聯絡電話\n3. 希望日期及時間\n4. 診症類型（初診/覆診/針灸/推拿）' },
    { label: '營業時間', text: '營業時間：\n星期一至六 10:00-20:00\n星期日及公眾假期 休息' },
    { label: '地址', text: addrLines },
    { label: '🎂 生日', text: `【${clinicName}】祝你生日快樂！🎂🎉\n\n感謝你一直以來的支持！為答謝你的信任，我們特別送上生日優惠：\n🎁 診金8折優惠（本月有效）\n\n歡迎預約：\n📞 致電或WhatsApp預約\n祝身體健康，萬事如意！🙏` },
    { label: '覆診提醒', text: `【${clinicName}】你好！溫馨提醒你的覆診日期快到了。\n\n為確保治療效果，建議按時覆診。\n\n歡迎致電或WhatsApp預約時間。\n祝早日康復！🙏` },
  ];
}

function fmtTime(ts) {
  if (!ts) return '';
  if (ts.length <= 5) return ts;
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ts; }
}

function nowTimestamp() {
  const d = new Date();
  return d.toISOString().substring(0, 16).replace('T', ' ');
}

export default function CRMPage({ data, setData, showToast }) {
  const clinicName = getClinicName();
  const storeNames = getTenantStoreNames();
  const defaultStore = storeNames[0] || '';
  const QUICK_REPLIES = buildQuickReplies();

  const [tab, setTab] = useState('inquiries');
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [msgInput, setMsgInput] = useState('');
  const [medPatient, setMedPatient] = useState('');
  const [medMsg, setMedMsg] = useState('');
  const [showNewConv, setShowNewConv] = useState(false);
  const [newConvSearch, setNewConvSearch] = useState('');
  const chatEndRef = useRef(null);

  const [aiReplying, setAiReplying] = useState({});
  const [aiReplies, setAiReplies] = useState({});

  const conversations = data.conversations || [];
  const patients = data.patients || [];
  const bookings = data.bookings || [];
  const inquiries = data.inquiries || [];

  const newInquiries = useMemo(() => inquiries.filter(i => i.status === 'new').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), [inquiries]);
  const repliedInquiries = useMemo(() => inquiries.filter(i => i.status === 'replied').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')), [inquiries]);

  // AI suggested reply
  async function getAiReply(inquiry) {
    setAiReplying(prev => ({ ...prev, [inquiry.id]: true }));
    try {
      const res = await fetch('/api/ai?action=chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `客人「${inquiry.name}」查詢（類型：${inquiry.type}）：「${inquiry.message}」\n\n請用廣東話（繁體中文）幫我草擬一個專業友善嘅 WhatsApp 回覆，2-3句就夠。直接寫回覆內容，唔好加引號或者前綴。`,
          context: { pricing: Object.entries(CLINIC_PRICING).map(([k, v]) => `${k}：$${v.price}`).join(', ') },
          history: [],
        }),
      });
      const result = await res.json();
      if (result.success) {
        setAiReplies(prev => ({ ...prev, [inquiry.id]: result.reply }));
      }
    } catch {}
    setAiReplying(prev => ({ ...prev, [inquiry.id]: false }));
  }

  function handleReplyInquiry(inquiry, replyText) {
    const text = `【${clinicName}】${inquiry.name}你好！\n${replyText}`;
    openWhatsApp(inquiry.phone, text);
    // Mark as replied
    const updated = { ...inquiry, status: 'replied', repliedAt: new Date().toISOString() };
    saveInquiry(updated);
    setData(prev => ({ ...prev, inquiries: (prev.inquiries || []).map(i => i.id === inquiry.id ? updated : i) }));
    // Also create conversation record
    const conv = {
      id: uid(), patientId: '', patientName: inquiry.name, patientPhone: inquiry.phone,
      store: defaultStore, messages: [
        { id: uid(), text: `[查詢] ${inquiry.message}`, sender: 'patient', timestamp: inquiry.createdAt, type: 'text' },
        { id: uid(), text: replyText, sender: 'clinic', timestamp: new Date().toISOString().substring(0, 16).replace('T', ' '), status: 'sent', type: 'text' },
      ],
      lastMessage: replyText.substring(0, 50), lastTimestamp: new Date().toISOString().substring(0, 16).replace('T', ' '),
      unread: 0, status: 'active',
    };
    updateConversation(conv);
    showToast(`已開啟 WhatsApp 回覆 ${inquiry.name}`);
  }

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConvId, conversations]);

  // --- Conversations Tab helpers ---
  const filteredConvs = useMemo(() => {
    if (!searchQ.trim()) return conversations;
    const q = searchQ.toLowerCase();
    return conversations.filter(c =>
      (c.patientName || '').toLowerCase().includes(q) ||
      (c.patientPhone || '').includes(q)
    );
  }, [conversations, searchQ]);

  const selectedConv = useMemo(() => conversations.find(c => c.id === selectedConvId), [conversations, selectedConvId]);

  function updateConversation(conv) {
    const updated = conversations.map(c => c.id === conv.id ? conv : c);
    const isNew = !conversations.find(c => c.id === conv.id);
    const list = isNew ? [...conversations, conv] : updated;
    setData(prev => ({ ...prev, conversations: list }));
    saveConversation(conv);
  }

  function handleSendMessage(text, type = 'text') {
    if (!text.trim() || !selectedConv) return;
    const msg = { id: uid(), text: text.trim(), sender: 'clinic', timestamp: nowTimestamp(), status: 'sent', type };
    const updated = {
      ...selectedConv,
      messages: [...(selectedConv.messages || []), msg],
      lastMessage: text.trim().substring(0, 50),
      lastTimestamp: nowTimestamp(),
    };
    updateConversation(updated);
    setMsgInput('');
  }

  function handleSendWhatsApp() {
    if (!msgInput.trim() || !selectedConv) return;
    handleSendMessage(msgInput, 'text');
    openWhatsApp(selectedConv.patientPhone, msgInput.trim());
    showToast('已開啟 WhatsApp');
  }

  function handleQuickReply(qr) {
    setMsgInput(qr.text);
  }

  // --- Quick Actions helpers ---
  const tomorrow = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().substring(0, 10);
  }, []);

  const tomorrowBookings = useMemo(() =>
    bookings.filter(b => b.date === tomorrow && b.status === 'confirmed'),
    [bookings, tomorrow]
  );

  const recentPatients = useMemo(() => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const cutoff = threeDaysAgo.toISOString().substring(0, 10);
    const consults = data.consultations || [];
    const recentPIds = new Set(consults.filter(c => c.date >= cutoff).map(c => c.patientId));
    return patients.filter(p => recentPIds.has(p.id));
  }, [patients, data.consultations]);

  const matchedPatients = useMemo(() => {
    if (!medPatient.trim()) return [];
    const q = medPatient.toLowerCase();
    return patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [patients, medPatient]);

  // New conversation patient search
  const newConvMatches = useMemo(() => {
    if (!newConvSearch.trim()) return [];
    const q = newConvSearch.toLowerCase();
    return patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [patients, newConvSearch]);

  function startNewConversation(patient) {
    const conv = getOrCreateConv(patient);
    updateConversation(conv);
    setSelectedConvId(conv.id);
    setShowNewConv(false);
    setNewConvSearch('');
  }

  function handleLogReceived(text) {
    if (!text.trim() || !selectedConv) return;
    const msg = { id: uid(), text: text.trim(), sender: 'patient', timestamp: nowTimestamp(), type: 'text' };
    const updated = {
      ...selectedConv,
      messages: [...(selectedConv.messages || []), msg],
      lastMessage: text.trim().substring(0, 50),
      lastTimestamp: nowTimestamp(),
    };
    updateConversation(updated);
  }

  function getOrCreateConv(patient) {
    const existing = conversations.find(c => c.patientId === patient.id);
    if (existing) return existing;
    const conv = {
      id: uid(), patientId: patient.id, patientName: patient.name, patientPhone: patient.phone,
      store: patient.store || defaultStore, messages: [], lastMessage: '', lastTimestamp: nowTimestamp(),
      unread: 0, status: 'active',
    };
    return conv;
  }

  function handleSendMedReminder(patient, message) {
    const text = message.replace('{name}', patient.name);
    const conv = getOrCreateConv(patient);
    const msg = { id: uid(), text, sender: 'clinic', timestamp: nowTimestamp(), status: 'sent', type: 'reminder' };
    const updated = { ...conv, messages: [...(conv.messages || []), msg], lastMessage: text.substring(0, 50), lastTimestamp: nowTimestamp() };
    updateConversation(updated);
    openWhatsApp(patient.phone, text);
    showToast(`已開啟 WhatsApp — ${patient.name}`);
  }

  function handleSendBookingReminder(bk) {
    const patient = patients.find(p => p.phone === bk.patientPhone) || { id: '', name: bk.patientName, phone: bk.patientPhone, store: bk.store };
    const text = `【${clinicName}】${bk.patientName}你好！提醒你明天 ${bk.time} 有預約（${bk.doctor}，${bk.store}）。請準時到達，謝謝！`;
    const conv = getOrCreateConv(patient);
    const msg = { id: uid(), text, sender: 'clinic', timestamp: nowTimestamp(), status: 'sent', type: 'booking' };
    const updated = { ...conv, messages: [...(conv.messages || []), msg], lastMessage: text.substring(0, 50), lastTimestamp: nowTimestamp() };
    updateConversation(updated);
    openWhatsApp(bk.patientPhone, text);
    showToast(`已開啟 WhatsApp — ${bk.patientName}`);
  }

  function handleSendAllReminders() {
    for (const bk of tomorrowBookings) {
      handleSendBookingReminder(bk);
    }
    showToast(`已逐個開啟 WhatsApp（共 ${tomorrowBookings.length} 個）`);
  }

  function handleSendFollowUp(patient) {
    const text = `【${clinicName}】${patient.name}你好！希望你身體漸有好轉。如有任何不適，歡迎預約覆診。`;
    const conv = getOrCreateConv(patient);
    const msg = { id: uid(), text, sender: 'clinic', timestamp: nowTimestamp(), status: 'sent', type: 'reminder' };
    const updated = { ...conv, messages: [...(conv.messages || []), msg], lastMessage: text.substring(0, 50), lastTimestamp: nowTimestamp() };
    updateConversation(updated);
    openWhatsApp(patient.phone, text);
    showToast(`已開啟 WhatsApp — ${patient.name}`);
  }


  // ═══════════════════════════════
  // RENDER
  // ═══════════════════════════════

  // ── Patient Engagement Score & Lifecycle ──
  const engagementData = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().substring(0, 10);
    const cons = data.consultations || [];
    const rev = data.revenue || [];

    return patients.map(p => {
      const visits = cons.filter(c => c.patientId === p.id || c.patientName === p.name).length;
      const spent = Number(p.totalSpent || 0);
      const daysSinceVisit = p.lastVisit ? Math.floor((today - new Date(p.lastVisit)) / 86400000) : 999;

      // Engagement score (0-100)
      const visitScore = Math.min(visits * 8, 40); // max 40
      const spendScore = Math.min(spent / 500, 30); // max 30 ($15k = 30)
      const recencyScore = daysSinceVisit <= 30 ? 30 : daysSinceVisit <= 60 ? 20 : daysSinceVisit <= 90 ? 10 : 0;
      const score = Math.round(visitScore + spendScore + recencyScore);

      // Lifecycle stage
      let stage, stageColor;
      if (daysSinceVisit <= 30) { stage = '活躍'; stageColor = '#16a34a'; }
      else if (daysSinceVisit <= 60) { stage = '正常'; stageColor = '#0e7490'; }
      else if (daysSinceVisit <= 90) { stage = '流失風險'; stageColor = '#d97706'; }
      else if (daysSinceVisit <= 180) { stage = '沉睡'; stageColor = '#dc2626'; }
      else { stage = '已流失'; stageColor = '#991b1b'; }

      return { ...p, score, stage, stageColor, daysSinceVisit, visits };
    }).sort((a, b) => b.score - a.score);
  }, [patients, data.consultations]);

  const lifecycleSummary = useMemo(() => {
    const summary = {};
    engagementData.forEach(p => { summary[p.stage] = (summary[p.stage] || 0) + 1; });
    return summary;
  }, [engagementData]);

  // ── Birthday Detection ──
  const birthdayData = useMemo(() => {
    const today = new Date();
    const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const upcoming = [];
    const todayBdays = [];
    patients.forEach(p => {
      if (!p.dob) return;
      const dobDate = new Date(p.dob);
      if (isNaN(dobDate.getTime())) return;
      const md = `${String(dobDate.getMonth() + 1).padStart(2, '0')}-${String(dobDate.getDate()).padStart(2, '0')}`;
      const age = today.getFullYear() - dobDate.getFullYear();
      if (md === todayMD) {
        todayBdays.push({ ...p, age, daysUntil: 0 });
      } else {
        // Next birthday
        let nextBday = new Date(today.getFullYear(), dobDate.getMonth(), dobDate.getDate());
        if (nextBday < today) nextBday.setFullYear(nextBday.getFullYear() + 1);
        const daysUntil = Math.ceil((nextBday - today) / 86400000);
        if (daysUntil <= 30) {
          upcoming.push({ ...p, age: age + (nextBday.getFullYear() > today.getFullYear() ? 1 : 0), daysUntil });
        }
      }
    });
    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
    return { todayBdays, upcoming };
  }, [patients]);

  // ── Follow-up Automation ──
  const followUpData = useMemo(() => {
    const today = new Date().toISOString().substring(0, 10);
    const cons = data.consultations || [];
    const overdue = [];
    const upcoming = [];
    cons.forEach(c => {
      if (!c.followUpDate) return;
      const patient = patients.find(p => p.id === c.patientId || p.name === c.patientName);
      const entry = { ...c, patientPhone: patient?.phone || c.patientPhone || '', daysOverdue: Math.floor((new Date() - new Date(c.followUpDate)) / 86400000) };
      if (c.followUpDate < today) overdue.push(entry);
      else if (c.followUpDate <= new Date(Date.now() + 7 * 86400000).toISOString().substring(0, 10)) upcoming.push(entry);
    });
    overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
    upcoming.sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
    return { overdue, upcoming };
  }, [data.consultations, patients]);

  // Batch WhatsApp
  const [batchSegment, setBatchSegment] = useState('流失風險');
  const handleBatchSend = (segment, template) => {
    const targets = engagementData.filter(p => p.stage === segment && p.phone);
    if (!targets.length) { showToast('此群組暫無病人'); return; }
    targets.slice(0, 10).forEach((p, i) => {
      setTimeout(() => {
        const text = template.replace('{name}', p.name);
        openWhatsApp(p.phone, text);
      }, i * 1500);
    });
    showToast(`已開啟 WhatsApp（共 ${Math.min(targets.length, 10)} 個）`);
  };

  // ── Seasonal Campaigns ──
  const seasonalCampaigns = useMemo(() => {
    const month = new Date().getMonth() + 1; // 1-12
    const campaigns = [
      { id: 'tianjiu-summer', label: '三伏天灸', season: [6, 7, 8], icon: '☀️', color: '#dc2626',
        desc: '夏季天灸療程推廣，適合哮喘、鼻敏感、體質虛寒患者',
        template: `【${clinicName}】{name}你好！☀️\n\n今年三伏天灸療程現正接受預約！\n\n天灸適合：鼻敏感、哮喘、易感冒、手腳冰冷\n\n早鳥優惠：3次療程套餐特價\n📞 立即預約，名額有限！`,
        targetDiags: ['鼻敏感', '哮喘', '體虛', '感冒', '鼻炎', '過敏'] },
      { id: 'tianjiu-winter', label: '三九天灸', season: [12, 1, 2], icon: '❄️', color: '#0e7490',
        desc: '冬季天灸療程推廣，鞏固體質',
        template: `【${clinicName}】{name}你好！❄️\n\n三九天灸療程現正接受預約！\n\n冬季養生，鞏固體質，預防來年春季易發病。\n\n📞 歡迎預約！`,
        targetDiags: ['鼻敏感', '哮喘', '體虛', '感冒'] },
      { id: 'spring-liver', label: '春季養肝', season: [2, 3, 4], icon: '🌱', color: '#16a34a',
        desc: '春季養肝護肝調理',
        template: `【${clinicName}】{name}你好！🌱\n\n春季養肝好時機！中醫認為春應肝木，是調理肝氣的最佳季節。\n\n我哋推出春季養肝調理療程，適合經常熬夜、壓力大、易怒的朋友。\n\n📞 歡迎預約諮詢！`,
        targetDiags: ['失眠', '肝氣', '頭痛', '壓力', '鬱'] },
      { id: 'summer-heat', label: '夏季清熱', season: [5, 6, 7, 8], icon: '🌞', color: '#d97706',
        desc: '夏季清熱祛濕調理',
        template: `【${clinicName}】{name}你好！🌞\n\n夏季炎熱潮濕，容易上火、濕重。\n\n我哋特設夏季清熱祛濕療程，助你消暑養生！\n\n📞 歡迎預約！`,
        targetDiags: ['濕', '上火', '皮膚', '腸胃', '暑'] },
      { id: 'autumn-lung', label: '秋季潤肺', season: [9, 10, 11], icon: '🍂', color: '#8B6914',
        desc: '秋季潤肺養陰',
        template: `【${clinicName}】{name}你好！🍂\n\n秋燥傷肺，是潤肺養陰的好時節。\n\n推薦秋季潤肺調理，適合乾咳、皮膚乾燥、鼻敏感朋友。\n\n📞 歡迎預約！`,
        targetDiags: ['咳嗽', '乾咳', '鼻敏感', '皮膚', '燥'] },
      { id: 'winter-kidney', label: '冬季補腎', season: [11, 12, 1, 2], icon: '🌨️', color: '#7C3AED',
        desc: '冬季補腎養精固本',
        template: `【${clinicName}】{name}你好！🌨️\n\n冬季是補腎養精的最佳季節！\n\n推薦冬季進補調理，適合腰膝酸軟、手腳冰冷、疲倦乏力。\n\n📞 歡迎預約！`,
        targetDiags: ['腎虛', '腰痛', '疲倦', '冷', '虛'] },
    ];
    return campaigns.filter(c => c.season.includes(month));
  }, [clinicName]);

  const getTargetPatients = (campaign) => {
    const cons = data.consultations || [];
    const targetSet = new Set();
    cons.forEach(c => {
      if (!c.tcmDiagnosis) return;
      const match = campaign.targetDiags.some(d => c.tcmDiagnosis.includes(d));
      if (match) targetSet.add(c.patientId || c.patientName);
    });
    return patients.filter(p => targetSet.has(p.id) || targetSet.has(p.name)).filter(p => p.phone);
  };

  return (
    <div style={S.page}>
      <div style={S.titleBar}>顧客管理 &gt; 顧客分析</div>

      {/* Tab bar */}
      <div className="tab-bar" style={{ marginBottom: 0 }}>
        <button className={`tab-btn${tab === 'inquiries' ? ' active' : ''}`} onClick={() => setTab('inquiries')}>
          客人查詢{newInquiries.length > 0 ? ` (${newInquiries.length})` : ''}
        </button>
        <button className={`tab-btn${tab === 'chat' ? ' active' : ''}`} onClick={() => setTab('chat')}>對話</button>
        <button className={`tab-btn${tab === 'quick' ? ' active' : ''}`} onClick={() => setTab('quick')}>快速操作</button>
        <button className={`tab-btn${tab === 'engage' ? ' active' : ''}`} onClick={() => setTab('engage')}>客群分析</button>
        <button className={`tab-btn${tab === 'birthday' ? ' active' : ''}`} onClick={() => setTab('birthday')}>
          🎂 生日{birthdayData.todayBdays.length > 0 ? ` (${birthdayData.todayBdays.length})` : ''}
        </button>
        <button className={`tab-btn${tab === 'followup' ? ' active' : ''}`} onClick={() => setTab('followup')}>
          📋 跟進{followUpData.overdue.length > 0 ? ` (${followUpData.overdue.length})` : ''}
        </button>
        {seasonalCampaigns.length > 0 && (
          <button className={`tab-btn${tab === 'campaign' ? ' active' : ''}`} onClick={() => setTab('campaign')}>
            🎯 季節推廣
          </button>
        )}
        <button className={`tab-btn${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>設定</button>
      </div>

      {/* ── Tab 0: Inquiries ── */}
      {tab === 'inquiries' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Public link */}
          <div className="card" style={{ padding: '10px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: 'var(--teal-50)', border: '1px solid var(--teal-200)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--teal-700)' }}>客人查詢連結：</span>
            <code style={{ fontSize: 12, background: '#fff', padding: '4px 8px', borderRadius: 4, flex: 1, wordBreak: 'break-all' }}>{window.location.origin}/inquiry</code>
            <button className="btn btn-teal btn-sm" style={{ fontSize: 11 }} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/inquiry`); showToast('已複製連結'); }}>複製</button>
          </div>

          {/* New inquiries */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>新查詢 ({newInquiries.length})</h3>
            {newInquiries.length === 0 && <div style={{ color: 'var(--gray-400)', fontSize: 13, padding: 12 }}>暫無新查詢</div>}
            {newInquiries.map(inq => (
              <div key={inq.id} style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>{inq.name}</strong>
                    <span style={{ fontSize: 12, color: 'var(--gray-500)', marginLeft: 8 }}>{inq.phone}</span>
                    <span className="tag" style={{ marginLeft: 8, fontSize: 10 }}>{inq.type}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{inq.createdAt ? new Date(inq.createdAt).toLocaleString('zh-HK') : ''}</span>
                </div>
                <div style={{ fontSize: 13, padding: 10, background: 'var(--gray-50)', borderRadius: 6, marginBottom: 10, lineHeight: 1.6 }}>{inq.message}</div>
                {/* AI reply */}
                {aiReplies[inq.id] && (
                  <div style={{ fontSize: 12, padding: 10, background: 'var(--teal-50)', borderRadius: 6, marginBottom: 10, border: '1px solid var(--teal-200)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--teal-700)', marginBottom: 4 }}>🤖 AI 建議回覆：</div>
                    <div style={{ lineHeight: 1.6 }}>{aiReplies[inq.id]}</div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 11 }}
                    onClick={() => handleReplyInquiry(inq, aiReplies[inq.id] || `多謝你嘅查詢！關於你問嘅問題，`)}>
                    WhatsApp 回覆
                  </button>
                  <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }} onClick={() => getAiReply(inq)} disabled={aiReplying[inq.id]}>
                    {aiReplying[inq.id] ? '生成中...' : '🤖 AI 建議'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Replied */}
          {repliedInquiries.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <h3 style={{ fontSize: 15, marginBottom: 12, color: 'var(--gray-500)' }}>已回覆 ({repliedInquiries.length})</h3>
              {repliedInquiries.slice(0, 10).map(inq => (
                <div key={inq.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 13 }}>
                  <div>
                    <strong>{inq.name}</strong>
                    <span style={{ color: 'var(--gray-400)', marginLeft: 8 }}>{inq.phone}</span>
                    <span style={{ color: 'var(--gray-400)', marginLeft: 8, fontSize: 11 }}>{inq.type}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{inq.repliedAt ? new Date(inq.repliedAt).toLocaleString('zh-HK') : ''}</span>
                    <span className="tag tag-paid" style={{ fontSize: 10 }}>已回覆</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 1: Conversations ── */}
      {tab === 'chat' && (
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden', minHeight: 520 }}>
          {/* Left panel - conversation list */}
          <div style={{ width: '30%', borderRight: '1px solid var(--gray-200)', background: '#fff', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 8, borderBottom: '1px solid var(--gray-100)', display: 'flex', gap: 6 }}>
              <input
                type="text" placeholder="搜尋..." value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--gray-200)', borderRadius: 6, fontSize: 13 }}
              />
              <button className="btn btn-teal btn-sm" style={{ fontSize: 11, whiteSpace: 'nowrap', padding: '4px 8px' }} onClick={() => setShowNewConv(true)}>+ 新增</button>
            </div>
            {/* New conversation search dropdown */}
            {showNewConv && (
              <div style={{ padding: 8, borderBottom: '1px solid var(--gray-200)', background: 'var(--teal-50)' }}>
                <div style={{ fontSize: 11, color: 'var(--teal-700)', fontWeight: 600, marginBottom: 4 }}>選擇病人開始對話</div>
                <input
                  type="text" placeholder="輸入姓名或電話..." value={newConvSearch} autoFocus
                  onChange={e => setNewConvSearch(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--teal-200)', borderRadius: 6, fontSize: 13, marginBottom: 4 }}
                />
                {newConvMatches.map(p => (
                  <div key={p.id} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, borderRadius: 4, background: '#fff', marginBottom: 2 }}
                    onClick={() => startNewConversation(p)}>
                    <strong>{p.name}</strong> <span style={{ color: 'var(--gray-400)' }}>{p.phone}</span>
                  </div>
                ))}
                {newConvSearch && newConvMatches.length === 0 && <div style={{ fontSize: 11, color: 'var(--gray-400)', padding: 4 }}>搵唔到病人</div>}
                <button className="btn btn-outline btn-sm" style={{ fontSize: 10, marginTop: 4 }} onClick={() => { setShowNewConv(false); setNewConvSearch(''); }}>取消</button>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredConvs.length === 0 && !showNewConv && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>暫無對話<br/><span style={{ fontSize: 11 }}>撳「+ 新增」開始</span></div>
              )}
              {filteredConvs.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  style={{ padding: '10px 12px', borderBottom: '1px solid var(--gray-100)', cursor: 'pointer', background: selectedConvId === conv.id ? 'var(--teal-50)' : '' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 13 }}>{conv.patientName}</strong>
                    <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>{fmtTime(conv.lastTimestamp)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{conv.lastMessage}</div>
                    {conv.unread > 0 && (
                      <span style={{ background: 'var(--teal-600)', color: '#fff', borderRadius: '50%', minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, marginLeft: 6, flexShrink: 0 }}>
                        {conv.unread}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right panel - chat view */}
          <div style={{ width: '70%', display: 'flex', flexDirection: 'column', background: 'var(--gray-50)' }}>
            {!selectedConv ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
                  <div>選擇對話以查看訊息</div>
                </div>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--gray-200)', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{selectedConv.patientName}</strong>
                    <span style={{ fontSize: 12, color: 'var(--gray-400)', marginLeft: 8 }}>{selectedConv.patientPhone}</span>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: selectedConv.status === 'active' ? 'var(--teal-50)' : 'var(--gray-100)', color: selectedConv.status === 'active' ? 'var(--teal-600)' : 'var(--gray-500)' }}>
                    {selectedConv.status === 'active' ? '進行中' : '已結束'}
                  </span>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                  {(selectedConv.messages || []).length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: 13, marginTop: 40 }}>尚無訊息</div>
                  )}
                  {(selectedConv.messages || []).map(msg => (
                    msg.sender === 'clinic' ? (
                      <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                        <div style={{ maxWidth: '70%', padding: '8px 12px', borderRadius: '12px 12px 2px 12px', background: 'var(--teal-600)', color: '#fff', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                          {msg.text}
                          <div style={{ fontSize: 10, opacity: 0.7, textAlign: 'right', marginTop: 2 }}>
                            {fmtTime(msg.timestamp)} {msg.status === 'read' ? '✓✓' : '✓'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
                        <div style={{ maxWidth: '70%', padding: '8px 12px', borderRadius: '12px 12px 12px 2px', background: 'var(--gray-100)', color: 'var(--gray-700)', fontSize: 13, whiteSpace: 'pre-wrap' }}>
                          {msg.text}
                          <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 2 }}>{fmtTime(msg.timestamp)}</div>
                        </div>
                      </div>
                    )
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Quick reply chips */}
                <div style={{ padding: '4px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {QUICK_REPLIES.map(qr => (
                    <button key={qr.label} className="btn btn-sm btn-outline" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => handleQuickReply(qr)}>
                      {qr.label}
                    </button>
                  ))}
                </div>

                {/* Message input */}
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--gray-200)', background: '#fff' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <textarea
                      value={msgInput} onChange={e => setMsgInput(e.target.value)} placeholder="輸入訊息..."
                      rows={2}
                      style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: 13, resize: 'none' }}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendWhatsApp(); } }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 12 }} onClick={handleSendWhatsApp}>WhatsApp</button>
                      <button className="btn btn-outline btn-sm" style={{ fontSize: 10 }} onClick={() => { handleLogReceived(msgInput); setMsgInput(''); }}>記錄收到</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 4 }}>Enter = 開 WhatsApp 發送 ｜「記錄收到」= 記低客人回覆</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tab 2: Quick Actions ── */}
      {tab === 'quick' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Medication reminder */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>💊 發送服藥提醒</h3>
            <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                <label style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 4, display: 'block' }}>選擇病人</label>
                <input
                  type="text" placeholder="輸入姓名或電話搜尋..." value={medPatient}
                  onChange={e => setMedPatient(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--gray-200)', borderRadius: 6, fontSize: 13 }}
                />
                {medPatient.trim() && matchedPatients.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 6, zIndex: 10, maxHeight: 160, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                    {matchedPatients.map(p => (
                      <div key={p.id} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--gray-50)' }}
                        onClick={() => {
                          setMedPatient(p.name);
                          setMedMsg(`【${clinicName}】${p.name}你好！提醒你按時服藥。每日一劑，水煎服。如有不適請聯絡我們。`);
                        }}
                      >
                        <strong>{p.name}</strong> <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>{p.phone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 4, display: 'block' }}>訊息內容</label>
              <textarea
                value={medMsg} onChange={e => setMedMsg(e.target.value)} rows={3}
                placeholder={`【${clinicName}】{name}你好！提醒你按時服藥。每日一劑，水煎服。如有不適請聯絡我們。`}
                style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--gray-200)', borderRadius: 6, fontSize: 13, resize: 'none' }}
              />
            </div>
            <button
              className="btn btn-green"
              disabled={!medPatient.trim() || !medMsg.trim()}
              onClick={() => {
                const pt = patients.find(p => p.name === medPatient);
                if (pt) handleSendMedReminder(pt, medMsg);
                else showToast('找不到該病人');
              }}
            >
              發送服藥提醒
            </button>
          </div>

          {/* Booking reminder */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>📅 明日預約提醒</h3>
            {tomorrowBookings.length === 0 ? (
              <div style={{ color: 'var(--gray-400)', fontSize: 13, padding: 12 }}>明天沒有已確認的預約</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>病人</th>
                        <th>電話</th>
                        <th>時間</th>
                        <th>醫師</th>
                        <th>分店</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tomorrowBookings.map(bk => (
                        <tr key={bk.id}>
                          <td>{bk.patientName}</td>
                          <td>{bk.patientPhone}</td>
                          <td>{bk.time}</td>
                          <td>{bk.doctor}</td>
                          <td>{bk.store}</td>
                          <td>
                            <button
                              className="btn btn-sm btn-green"
                              onClick={() => handleSendBookingReminder(bk)}
                            >
                              發送提醒
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 10, textAlign: 'right' }}>
                  <button className="btn btn-teal" onClick={handleSendAllReminders}>
                    全部發送 ({tomorrowBookings.length})
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Follow-up */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>🔄 覆診跟進</h3>
            <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 10 }}>最近 3 天內有診症紀錄的病人</p>
            {recentPatients.length === 0 ? (
              <div style={{ color: 'var(--gray-400)', fontSize: 13, padding: 12 }}>暫無近期診症紀錄</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>病人</th>
                      <th>電話</th>
                      <th>分店</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPatients.map(pt => (
                      <tr key={pt.id}>
                        <td>{pt.name}</td>
                        <td>{pt.phone}</td>
                        <td>{pt.store}</td>
                        <td>
                          <button
                            className="btn btn-sm btn-teal"
                            onClick={() => handleSendFollowUp(pt)}
                          >
                            發送跟進
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab 3: Engagement ── */}
      {tab === 'engage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Lifecycle Summary */}
          <div className="stats-grid">
            {[
              { label: '活躍', key: '活躍', color: '#16a34a' },
              { label: '正常', key: '正常', color: '#0e7490' },
              { label: '流失風險', key: '流失風險', color: '#d97706' },
              { label: '沉睡/已流失', key: null, color: '#dc2626' },
            ].map(s => (
              <div key={s.label} className="stat-card" style={{ borderLeft: `4px solid ${s.color}` }}>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ color: s.color }}>
                  {s.key ? (lifecycleSummary[s.key] || 0) : (lifecycleSummary['沉睡'] || 0) + (lifecycleSummary['已流失'] || 0)}
                </div>
              </div>
            ))}
          </div>

          {/* Batch Actions */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>📨 批量 WhatsApp 推送</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <select value={batchSegment} onChange={e => setBatchSegment(e.target.value)} style={{ width: 'auto' }}>
                <option value="流失風險">流失風險客人</option>
                <option value="沉睡">沉睡客人</option>
                <option value="已流失">已流失客人</option>
                <option value="活躍">活躍客人（感謝）</option>
              </select>
              <span style={{ fontSize: 12, color: 'var(--gray-400)', alignSelf: 'center' }}>
                ({engagementData.filter(p => p.stage === batchSegment && p.phone).length} 人)
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff' }}
                onClick={() => handleBatchSend(batchSegment, `【${clinicName}】{name}你好！好耐無見，掛住你呀！😊 我哋最近推出咗新嘅療程優惠，歡迎隨時預約！祝身體健康🙏`)}>
                回訪邀請
              </button>
              <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff' }}
                onClick={() => handleBatchSend(batchSegment, `【${clinicName}】{name}你好！溫馨提醒你注意季節轉換時的保養。如有任何不適，歡迎預約覆診。🙏`)}>
                健康關懷
              </button>
              <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff' }}
                onClick={() => handleBatchSend(batchSegment, `【${clinicName}】{name}你好！限時優惠：舊客回訪免診金！優惠期至本月底。立即預約：📞 WhatsApp 回覆「預約」🎉`)}>
                優惠推送
              </button>
            </div>
          </div>

          {/* Engagement Ranking */}
          <div className="card" style={{ padding: 0 }}>
            <div className="card-header"><h3>📊 病人互動指數排名</h3></div>
            <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>排名</th><th>病人</th><th>互動分</th><th>生命週期</th><th>就診次數</th><th>最後到診</th><th>操作</th></tr></thead>
                <tbody>
                  {engagementData.slice(0, 50).map((p, i) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 700, color: i < 3 ? 'var(--gold-700)' : 'var(--gray-400)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 60, height: 8, background: 'var(--gray-100)', borderRadius: 4 }}>
                            <div style={{ width: `${p.score}%`, height: '100%', background: p.score >= 60 ? '#16a34a' : p.score >= 30 ? '#d97706' : '#dc2626', borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700 }}>{p.score}</span>
                        </div>
                      </td>
                      <td><span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: p.stageColor + '18', color: p.stageColor, fontWeight: 700 }}>{p.stage}</span></td>
                      <td>{p.visits}</td>
                      <td style={{ fontSize: 11, color: 'var(--gray-500)' }}>{p.lastVisit || '-'}</td>
                      <td>
                        {p.phone && (
                          <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 10, padding: '2px 6px' }}
                            onClick={() => openWhatsApp(p.phone, `【${clinicName}】${p.name}你好！希望你一切安好。如有需要歡迎預約覆診。🙏`)}>
                            WA
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 4: Settings ── */}
      {/* ── Birthday Tab ── */}
      {tab === 'birthday' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Today's birthdays */}
          {birthdayData.todayBdays.length > 0 && (
            <div className="card" style={{ border: '2px solid #f59e0b', background: '#fffbeb' }}>
              <div className="card-header"><h3 style={{ color: '#d97706' }}>🎂 今日壽星 ({birthdayData.todayBdays.length})</h3></div>
              {birthdayData.todayBdays.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #fde68a' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>🎉 {p.name}</span>
                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--gray-500)' }}>{p.age} 歲</span>
                    {p.phone && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gray-400)' }}>{p.phone}</span>}
                  </div>
                  {p.phone && (
                    <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 11 }} onClick={() => {
                      openWhatsApp(p.phone, `【${clinicName}】${p.name}你好！🎂🎉\n\n祝你生日快樂！感謝你一直以來的支持！\n\n為答謝你的信任，我們特別送上生日優惠：\n🎁 診金8折優惠（本月有效）\n\n歡迎預約：📞 WhatsApp 或致電預約\n祝身體健康，萬事如意！🙏`);
                      showToast(`已開啟 WhatsApp 祝賀 ${p.name}`);
                    }}>🎂 發送祝福</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {birthdayData.todayBdays.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 24, color: 'var(--gray-400)' }}>今日沒有壽星</div>
          )}

          {/* Upcoming birthdays */}
          <div className="card">
            <div className="card-header"><h3>📅 即將來臨的生日 (30天內)</h3></div>
            {birthdayData.upcoming.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>病人</th><th>生日日期</th><th>年齡</th><th>電話</th><th>倒數</th><th>操作</th></tr></thead>
                  <tbody>
                    {birthdayData.upcoming.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td>{p.dob}</td>
                        <td>{p.age} 歲</td>
                        <td>{p.phone || '-'}</td>
                        <td style={{ fontWeight: 700, color: p.daysUntil <= 3 ? '#dc2626' : p.daysUntil <= 7 ? '#d97706' : 'var(--teal-600)' }}>
                          {p.daysUntil} 天
                        </td>
                        <td>
                          {p.phone && (
                            <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 11 }} onClick={() => {
                              openWhatsApp(p.phone, `【${clinicName}】${p.name}你好！🎂\n\n提前祝你生日快樂！感謝你一直以來的支持！\n🎁 生日月份專享診金8折優惠\n\n歡迎預約！🙏`);
                            }}>📱 提前祝福</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--gray-400)' }}>未來 30 天沒有生日</div>
            )}
          </div>

          {/* Batch birthday greetings */}
          {birthdayData.todayBdays.filter(p => p.phone).length > 1 && (
            <div className="card" style={{ padding: 12 }}>
              <button className="btn btn-gold" onClick={() => {
                const targets = birthdayData.todayBdays.filter(p => p.phone);
                targets.forEach((p, i) => {
                  setTimeout(() => {
                    openWhatsApp(p.phone, `【${clinicName}】${p.name}你好！🎂🎉\n\n祝你生日快樂！\n🎁 生日優惠：診金8折（本月有效）\n\n歡迎預約！🙏`);
                  }, i * 1500);
                });
                showToast(`已批量發送 ${targets.length} 個生日祝福`);
              }}>🎂 批量發送今日生日祝福 ({birthdayData.todayBdays.filter(p => p.phone).length}人)</button>
            </div>
          )}
        </div>
      )}

      {/* ── Follow-up Tab ── */}
      {tab === 'followup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card red"><div className="stat-label">逾期覆診</div><div className="stat-value red">{followUpData.overdue.length}</div></div>
            <div className="stat-card gold"><div className="stat-label">本週覆診</div><div className="stat-value gold">{followUpData.upcoming.length}</div></div>
          </div>

          {/* Overdue follow-ups */}
          {followUpData.overdue.length > 0 && (
            <div className="card" style={{ border: '1px solid #fecaca' }}>
              <div className="card-header"><h3 style={{ color: '#dc2626' }}>⚠️ 逾期未覆診 ({followUpData.overdue.length})</h3></div>
              <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>病人</th><th>覆診日</th><th>逾期天數</th><th>診斷</th><th>醫師</th><th>操作</th></tr></thead>
                  <tbody>
                    {followUpData.overdue.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.patientName}</td>
                        <td style={{ color: '#dc2626' }}>{c.followUpDate}</td>
                        <td style={{ fontWeight: 700, color: '#dc2626' }}>{c.daysOverdue} 天</td>
                        <td style={{ fontSize: 11, color: 'var(--gray-500)' }}>{c.tcmDiagnosis || c.assessment || '-'}</td>
                        <td>{c.doctor}</td>
                        <td>
                          {c.patientPhone && (
                            <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 11 }} onClick={() => {
                              const msg = `【${clinicName}】${c.patientName}你好！\n\n溫馨提醒：你的覆診日期（${c.followUpDate}）已過期。\n\n${c.tcmDiagnosis ? `上次診斷：${c.tcmDiagnosis}` : ''}\n${c.followUpNotes ? `醫囑：${c.followUpNotes}` : ''}\n\n為確保治療效果，建議儘快安排覆診。\n歡迎致電或 WhatsApp 預約。🙏`;
                              openWhatsApp(c.patientPhone, msg);
                              showToast(`已開啟覆診提醒 ${c.patientName}`);
                            }}>📱 覆診提醒</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {followUpData.overdue.filter(c => c.patientPhone).length > 1 && (
                <div style={{ padding: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => {
                    const targets = followUpData.overdue.filter(c => c.patientPhone);
                    targets.slice(0, 10).forEach((c, i) => {
                      setTimeout(() => {
                        openWhatsApp(c.patientPhone, `【${clinicName}】${c.patientName}你好！溫馨提醒你的覆診日期已過期（${c.followUpDate}）。建議儘快安排覆診，以確保治療效果。歡迎預約！🙏`);
                      }, i * 1500);
                    });
                    showToast(`已批量發送 ${Math.min(targets.length, 10)} 個覆診提醒`);
                  }}>批量發送覆診提醒 ({followUpData.overdue.filter(c => c.patientPhone).length}人)</button>
                </div>
              )}
            </div>
          )}

          {/* Upcoming follow-ups */}
          {followUpData.upcoming.length > 0 && (
            <div className="card">
              <div className="card-header"><h3>📅 本週覆診 ({followUpData.upcoming.length})</h3></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>病人</th><th>覆診日</th><th>診斷</th><th>醫師</th><th>操作</th></tr></thead>
                  <tbody>
                    {followUpData.upcoming.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.patientName}</td>
                        <td style={{ color: 'var(--teal-600)', fontWeight: 600 }}>{c.followUpDate}</td>
                        <td style={{ fontSize: 11, color: 'var(--gray-500)' }}>{c.tcmDiagnosis || '-'}</td>
                        <td>{c.doctor}</td>
                        <td>
                          {c.patientPhone && (
                            <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 11 }} onClick={() => {
                              openWhatsApp(c.patientPhone, `【${clinicName}】${c.patientName}你好！\n\n提醒你即將到來的覆診：${c.followUpDate}\n${c.followUpNotes ? `醫囑：${c.followUpNotes}` : ''}\n\n歡迎提前預約時間。🙏`);
                            }}>📱 提醒</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {followUpData.overdue.length === 0 && followUpData.upcoming.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無需要跟進的覆診</div>
          )}
        </div>
      )}

      {/* ── Seasonal Campaign Tab ── */}
      {tab === 'campaign' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: '12px 16px', background: 'linear-gradient(135deg, #f0fdfa 0%, #fefce8 100%)', border: '1px solid var(--teal-200)' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 4 }}>🎯 當季推廣活動</div>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>根據季節自動推薦適合的推廣活動，系統會自動匹配相關診斷紀錄的病人。</div>
          </div>
          {seasonalCampaigns.map(campaign => {
            const targets = getTargetPatients(campaign);
            return (
              <div key={campaign.id} className="card" style={{ borderLeft: `4px solid ${campaign.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: campaign.color }}>{campaign.icon} {campaign.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>{campaign.desc}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: campaign.color }}>{targets.length}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>目標病人</div>
                  </div>
                </div>
                {/* Preview template */}
                <div style={{ padding: 10, background: 'var(--gray-50)', borderRadius: 6, marginBottom: 12, fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--gray-600)' }}>
                  {campaign.template.replace('{name}', '陳先生/女士')}
                </div>
                {/* Target diagnosis tags */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
                  <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>目標診斷：</span>
                  {campaign.targetDiags.map(d => (
                    <span key={d} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: campaign.color + '18', color: campaign.color, fontWeight: 600 }}>{d}</span>
                  ))}
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    className="btn btn-sm"
                    style={{ background: '#25D366', color: '#fff' }}
                    disabled={targets.length === 0}
                    onClick={() => {
                      if (!targets.length) return;
                      targets.slice(0, 10).forEach((p, i) => {
                        setTimeout(() => openWhatsApp(p.phone, campaign.template.replace('{name}', p.name)), i * 1500);
                      });
                      showToast(`已開啟 ${Math.min(targets.length, 10)} 個 WhatsApp 推廣`);
                    }}
                  >
                    📱 批量發送（最多10人）
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                    {targets.length > 10 ? `共 ${targets.length} 人，分批發送` : `共 ${targets.length} 人`}
                  </span>
                </div>
                {/* Patient preview list */}
                {targets.length > 0 && (
                  <div style={{ marginTop: 10, maxHeight: 150, overflowY: 'auto' }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 4 }}>目標病人列表：</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {targets.slice(0, 20).map(p => (
                        <span key={p.id} style={{ fontSize: 10, padding: '2px 8px', background: 'var(--gray-50)', borderRadius: 4 }}>{p.name}</span>
                      ))}
                      {targets.length > 20 && <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>...等 {targets.length - 20} 人</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {seasonalCampaigns.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>當前無季節推廣活動</div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* How it works */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>使用說明</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>即時可用 — 無需額外設定</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.7, marginBottom: 12 }}>
              所有 WhatsApp 功能透過 <strong>wa.me 直接連結</strong> 運作：
            </p>
            <ul style={{ fontSize: 13, color: 'var(--gray-600)', paddingLeft: 20, lineHeight: 2 }}>
              <li>撳「WhatsApp」或「發送提醒」→ 自動開啟 WhatsApp 並預填訊息</li>
              <li>你只需要撳「發送」就完成</li>
              <li>支援手機 WhatsApp 同 WhatsApp Web</li>
              <li>所有發送紀錄會自動保存喺對話 Tab</li>
            </ul>
          </div>

          {/* Quick reply templates */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>快速回覆範本</h3>
            <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 12 }}>喺對話區可以直接選用以下範本：</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {QUICK_REPLIES.map(qr => (
                <div key={qr.label} style={{ padding: 10, background: 'var(--gray-50)', borderRadius: 6, fontSize: 12 }}>
                  <strong style={{ color: 'var(--teal-700)' }}>{qr.label}</strong>
                  <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', color: 'var(--gray-600)', fontSize: 11 }}>{qr.text}</pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
