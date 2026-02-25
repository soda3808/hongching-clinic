import { useState, useMemo, useRef, useEffect } from 'react';
import { saveConversation, sendWhatsApp } from '../api';
import { uid, DOCTORS, CLINIC_PRICING } from '../data';
import { useFocusTrap, nullRef } from './ConfirmModal';

const WA_SETTINGS_KEY = 'hcmc_wa_settings';
const defaultSettings = { autoConfirm: false, autoReminder: false, autoMedReminder: false, tkwPhone: '', pePhone: '' };

function loadWASettings() {
  try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(WA_SETTINGS_KEY) || '{}') }; }
  catch { return { ...defaultSettings }; }
}
function saveWASettings(s) {
  try { localStorage.setItem(WA_SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

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
  const [tab, setTab] = useState('chat');
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [msgInput, setMsgInput] = useState('');
  const [medPatient, setMedPatient] = useState('');
  const [medMsg, setMedMsg] = useState('');
  const [followSending, setFollowSending] = useState({});
  const [reminderSending, setReminderSending] = useState({});
  const [waSettings, setWaSettings] = useState(loadWASettings);
  const chatEndRef = useRef(null);

  const conversations = data.conversations || [];
  const patients = data.patients || [];
  const bookings = data.bookings || [];

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

  async function handleSendWhatsApp() {
    if (!msgInput.trim() || !selectedConv) return;
    handleSendMessage(msgInput, 'text');
    const res = await sendWhatsApp(selectedConv.patientPhone, msgInput.trim(), 'text', selectedConv.store || '宋皇臺');
    if (res?.success) {
      showToast('WhatsApp 已發送');
    } else {
      showToast('WhatsApp 發送失敗：' + (res?.error || '未知錯誤'));
    }
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

  async function handleSendMedReminder(patient, message) {
    const text = message.replace('{name}', patient.name);
    const conv = getOrCreateConv(patient);
    const msg = { id: uid(), text, sender: 'clinic', timestamp: nowTimestamp(), status: 'sent', type: 'reminder' };
    const updated = { ...conv, messages: [...(conv.messages || []), msg], lastMessage: text.substring(0, 50), lastTimestamp: nowTimestamp() };
    updateConversation(updated);
    const res = await sendWhatsApp(patient.phone, text, 'reminder', patient.store || '宋皇臺');
    if (res?.success) showToast(`已發送藥物提醒給 ${patient.name}`);
    else showToast('發送失敗：' + (res?.error || '未知錯誤'));
  }

  async function handleSendBookingReminder(bk) {
    setReminderSending(prev => ({ ...prev, [bk.id]: true }));
    const patient = patients.find(p => p.phone === bk.patientPhone) || { id: '', name: bk.patientName, phone: bk.patientPhone, store: bk.store };
    const text = `【康晴醫療中心】${bk.patientName}你好！提醒你明天 ${bk.time} 有預約（${bk.doctor}，${bk.store}）。請準時到達，謝謝！`;
    const conv = getOrCreateConv(patient);
    const msg = { id: uid(), text, sender: 'clinic', timestamp: nowTimestamp(), status: 'sent', type: 'booking' };
    const updated = { ...conv, messages: [...(conv.messages || []), msg], lastMessage: text.substring(0, 50), lastTimestamp: nowTimestamp() };
    updateConversation(updated);
    await sendWhatsApp(bk.patientPhone, text, 'booking', bk.store);
    setReminderSending(prev => ({ ...prev, [bk.id]: false }));
    showToast(`已發送預約提醒給 ${bk.patientName}`);
  }

  async function handleSendAllReminders() {
    for (const bk of tomorrowBookings) {
      await handleSendBookingReminder(bk);
    }
    showToast(`已發送全部 ${tomorrowBookings.length} 個預約提醒`);
  }

  async function handleSendFollowUp(patient) {
    setFollowSending(prev => ({ ...prev, [patient.id]: true }));
    const text = `【康晴醫療中心】${patient.name}你好！希望你身體漸有好轉。如有任何不適，歡迎預約覆診。`;
    const conv = getOrCreateConv(patient);
    const msg = { id: uid(), text, sender: 'clinic', timestamp: nowTimestamp(), status: 'sent', type: 'reminder' };
    const updated = { ...conv, messages: [...(conv.messages || []), msg], lastMessage: text.substring(0, 50), lastTimestamp: nowTimestamp() };
    updateConversation(updated);
    await sendWhatsApp(patient.phone, text, 'reminder', patient.store || '宋皇臺');
    setFollowSending(prev => ({ ...prev, [patient.id]: false }));
    showToast(`已發送覆診提醒給 ${patient.name}`);
  }

  // --- Settings helpers ---
  function updateSetting(key, value) {
    const next = { ...waSettings, [key]: value };
    setWaSettings(next);
    saveWASettings(next);
  }

  // ═══════════════════════════════
  // RENDER
  // ═══════════════════════════════

  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>WhatsApp CRM</h2>

      {/* Tab bar */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-btn${tab === 'chat' ? ' active' : ''}`} onClick={() => setTab('chat')}>對話</button>
        <button className={`tab-btn${tab === 'quick' ? ' active' : ''}`} onClick={() => setTab('quick')}>快速操作</button>
        <button className={`tab-btn${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>設定</button>
      </div>

      {/* ── Tab 1: Conversations ── */}
      {tab === 'chat' && (
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden', minHeight: 520 }}>
          {/* Left panel - conversation list */}
          <div style={{ width: '30%', borderRight: '1px solid var(--gray-200)', background: '#fff', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 8, borderBottom: '1px solid var(--gray-100)' }}>
              <input
                type="text" placeholder="搜尋病人姓名/電話..." value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--gray-200)', borderRadius: 6, fontSize: 13 }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredConvs.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>暫無對話</div>
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
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--gray-200)', background: '#fff', display: 'flex', gap: 8 }}>
                  <textarea
                    value={msgInput} onChange={e => setMsgInput(e.target.value)} placeholder="輸入訊息..."
                    rows={2}
                    style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: 13, resize: 'none' }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(msgInput); } }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button className="btn btn-teal btn-sm" onClick={() => handleSendMessage(msgInput)} style={{ fontSize: 12 }}>發送</button>
                    <button className="btn btn-green btn-sm" onClick={handleSendWhatsApp} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>WhatsApp</button>
                  </div>
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
                              disabled={reminderSending[bk.id]}
                              onClick={() => handleSendBookingReminder(bk)}
                            >
                              {reminderSending[bk.id] ? '發送中...' : '發送提醒'}
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
                            disabled={followSending[pt.id]}
                            onClick={() => handleSendFollowUp(pt)}
                          >
                            {followSending[pt.id] ? '發送中...' : '發送跟進'}
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

          {/* Connection status */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>WhatsApp Business 連接狀態</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: waSettings.tkwPhone || waSettings.pePhone ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
              <span style={{ fontSize: 13 }}>{waSettings.tkwPhone || waSettings.pePhone ? '已配置電話號碼' : '未連接'}</span>
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 4, display: 'block' }}>宋皇臺店電話號碼</label>
                <input
                  type="tel" value={waSettings.tkwPhone} placeholder="例：852XXXXXXXX"
                  onChange={e => updateSetting('tkwPhone', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--gray-200)', borderRadius: 6, fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 4, display: 'block' }}>太子店電話號碼</label>
                <input
                  type="tel" value={waSettings.pePhone} placeholder="例：852XXXXXXXX"
                  onChange={e => updateSetting('pePhone', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--gray-200)', borderRadius: 6, fontSize: 13 }}
                />
              </div>
            </div>
          </div>

          {/* Auto-send toggles */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>自動發送設定</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={waSettings.autoConfirm}
                  onChange={e => updateSetting('autoConfirm', e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--teal-600)' }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>自動發送預約確認</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>新預約建立時自動發送 WhatsApp 確認訊息</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={waSettings.autoReminder}
                  onChange={e => updateSetting('autoReminder', e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--teal-600)' }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>自動發送 24 小時預約提醒</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>預約前 24 小時自動發送提醒訊息</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={waSettings.autoMedReminder}
                  onChange={e => updateSetting('autoMedReminder', e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--teal-600)' }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>自動發送服藥提醒</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>診症後自動發送服藥提醒訊息</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={waSettings.autoFollowUp || false}
                  onChange={e => updateSetting('autoFollowUp', e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--teal-600)' }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>自動發送診後跟進</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>診症後 3 天自動發送 WhatsApp 跟進關懷訊息</div>
                </div>
              </label>
            </div>
          </div>

          {/* Meta Business note */}
          <div className="card" style={{ padding: 16, background: 'var(--gray-50)', border: '1px dashed var(--gray-300)' }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>設定須知</h3>
            <p style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 12 }}>
              需要設定 Meta Business 帳戶及 WhatsApp Cloud API 才能使用自動發送功能。
              請確保已完成以下步驟：
            </p>
            <ul style={{ fontSize: 12, color: 'var(--gray-500)', paddingLeft: 20, lineHeight: 1.8 }}>
              <li>建立 Meta Business 帳戶</li>
              <li>申請 WhatsApp Business API 存取權</li>
              <li>驗證商業電話號碼</li>
              <li>設定訊息範本（Message Templates）</li>
              <li>配置 Webhook 接收回覆訊息</li>
            </ul>
          </div>

          {/* Pricing info */}
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>WhatsApp Business API 收費參考</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>訊息類型</th>
                    <th>說明</th>
                    <th>費用 (HKD)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Business-initiated</td><td>由商家主動發送</td><td>~$0.46/條</td></tr>
                  <tr><td>User-initiated</td><td>由用戶先發起的 24 小時對話</td><td>~$0.27/對話</td></tr>
                  <tr><td>Utility</td><td>預約確認、付款通知等</td><td>~$0.20/條</td></tr>
                  <tr><td>Authentication</td><td>驗證碼</td><td>~$0.18/條</td></tr>
                  <tr><td>Marketing</td><td>推廣訊息</td><td>~$0.73/條</td></tr>
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 8 }}>
              * 價格僅供參考，實際收費以 Meta 官方為準。每月首 1,000 個 user-initiated 對話免費。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
