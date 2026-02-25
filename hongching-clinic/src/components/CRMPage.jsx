import { useState, useMemo, useRef, useEffect } from 'react';
import { saveConversation, openWhatsApp, saveInquiry } from '../api';
import { uid, DOCTORS, CLINIC_PRICING } from '../data';
import { useFocusTrap, nullRef } from './ConfirmModal';


const QUICK_REPLIES = [
  { label: '收費表', text: Object.entries(CLINIC_PRICING).map(([k, v]) => `${k}：$${v.price}`).join('\n') },
  { label: '預約', text: '歡迎預約！請提供以下資料：\n1. 姓名\n2. 聯絡電話\n3. 希望日期及時間\n4. 診症類型（初診/覆診/針灸/推拿）' },
  { label: '營業時間', text: '營業時間：\n星期一至六 10:00-20:00\n星期日及公眾假期 休息' },
  { label: '地址', text: '宋皇臺店：九龍宋皇臺道38號傲寓地下5號舖\n太子店：太子彌敦道788號利安大廈1樓B室' },
];

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
      const res = await fetch('/api/ai-chat', {
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
    const text = `【康晴醫療中心】${inquiry.name}你好！\n${replyText}`;
    openWhatsApp(inquiry.phone, text);
    // Mark as replied
    const updated = { ...inquiry, status: 'replied', repliedAt: new Date().toISOString() };
    saveInquiry(updated);
    setData(prev => ({ ...prev, inquiries: (prev.inquiries || []).map(i => i.id === inquiry.id ? updated : i) }));
    // Also create conversation record
    const conv = {
      id: uid(), patientId: '', patientName: inquiry.name, patientPhone: inquiry.phone,
      store: '宋皇臺', messages: [
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
      store: patient.store || '宋皇臺', messages: [], lastMessage: '', lastTimestamp: nowTimestamp(),
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
    const text = `【康晴醫療中心】${bk.patientName}你好！提醒你明天 ${bk.time} 有預約（${bk.doctor}，${bk.store}）。請準時到達，謝謝！`;
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
    const text = `【康晴醫療中心】${patient.name}你好！希望你身體漸有好轉。如有任何不適，歡迎預約覆診。`;
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

  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>WhatsApp CRM</h2>

      {/* Tab bar */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-btn${tab === 'inquiries' ? ' active' : ''}`} onClick={() => setTab('inquiries')}>
          客人查詢{newInquiries.length > 0 ? ` (${newInquiries.length})` : ''}
        </button>
        <button className={`tab-btn${tab === 'chat' ? ' active' : ''}`} onClick={() => setTab('chat')}>對話</button>
        <button className={`tab-btn${tab === 'quick' ? ' active' : ''}`} onClick={() => setTab('quick')}>快速操作</button>
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
                          setMedMsg(`【康晴醫療中心】${p.name}你好！提醒你按時服藥。每日一劑，水煎服。如有不適請聯絡我們。`);
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
                placeholder="【康晴醫療中心】{name}你好！提醒你按時服藥。每日一劑，水煎服。如有不適請聯絡我們。"
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

      {/* ── Tab 3: Settings ── */}
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
