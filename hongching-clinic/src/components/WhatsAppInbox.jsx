import { useState, useEffect, useRef, useMemo } from 'react';
import { loadWaMessages, sendWaReply } from '../api';
import { S, ECTCM } from '../styles/ectcm';

export default function WhatsAppInbox({ data, setData, user, showToast }) {
  const [messages, setMessages] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [storeFilter, setStoreFilter] = useState('all');
  const chatEndRef = useRef(null);

  // Load messages
  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const msgs = await loadWaMessages(null, 500);
      if (mounted) { setMessages(msgs); setLoading(false); }
    }
    load();
    const interval = setInterval(load, 15000); // poll every 15s
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Group messages by phone number (conversations)
  const conversations = useMemo(() => {
    const byPhone = {};
    messages.forEach(m => {
      if (!byPhone[m.phone]) byPhone[m.phone] = { phone: m.phone, name: m.name || m.phone, store: m.store, messages: [], lastMsg: '', lastTime: '', unread: 0 };
      byPhone[m.phone].messages.push(m);
      if (!byPhone[m.phone].lastTime || m.created_at > byPhone[m.phone].lastTime) {
        byPhone[m.phone].lastTime = m.created_at;
        byPhone[m.phone].lastMsg = (m.body || '').substring(0, 60);
        byPhone[m.phone].name = m.name || byPhone[m.phone].name;
        byPhone[m.phone].store = m.store || byPhone[m.phone].store;
      }
      if (m.direction === 'inbound' && m.status === 'received') byPhone[m.phone].unread++;
    });
    let list = Object.values(byPhone).sort((a, b) => (b.lastTime || '').localeCompare(a.lastTime || ''));
    if (storeFilter !== 'all') list = list.filter(c => c.store === storeFilter);
    // Sort messages within each conversation chronologically
    list.forEach(c => c.messages.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')));
    return list;
  }, [messages, storeFilter]);

  // Selected conversation messages
  const selectedConvo = conversations.find(c => c.phone === selectedPhone);

  // Auto-scroll to bottom
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [selectedPhone, selectedConvo?.messages.length]);

  // Send manual reply
  const handleSend = async () => {
    if (!replyText.trim() || !selectedPhone) return;
    setSending(true);
    const store = selectedConvo?.store || '宋皇臺';
    const result = await sendWaReply(selectedPhone, replyText.trim(), store);
    if (result.success) {
      setReplyText('');
      showToast?.('已發送');
      // Refresh
      const msgs = await loadWaMessages(null, 500);
      setMessages(msgs);
    } else {
      showToast?.('發送失敗: ' + (result.error || ''));
    }
    setSending(false);
  };

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);
  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date().toISOString().substring(0, 10);
    const dateStr = d.toISOString().substring(0, 10);
    if (dateStr === today) return d.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
    return dateStr.substring(5) + ' ' + d.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={S.page}>
      <div style={S.titleBar}>
        <span>💬 WhatsApp 收件箱</span>
        {totalUnread > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: 13, marginLeft: 8 }}>{totalUnread} 未讀</span>}
      </div>

      {/* Store filter tabs */}
      <div style={{ ...S.filterBar, display: 'flex', gap: 0 }}>
        {['all', '宋皇臺', '太子'].map(s => (
          <button key={s} onClick={() => setStoreFilter(s)} style={{
            padding: '6px 16px', border: 'none', cursor: 'pointer', fontSize: 13,
            background: storeFilter === s ? ECTCM.thBg : 'transparent',
            color: storeFilter === s ? '#fff' : '#333', borderRadius: 0,
          }}>{s === 'all' ? '全部' : s}</button>
        ))}
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 200px)', border: '1px solid #ddd' }}>
        {/* Left: Conversation list */}
        <div style={{ width: 280, minWidth: 220, borderRight: '1px solid #ddd', overflowY: 'auto', background: '#fafafa' }}>
          {loading && <div style={{ padding: 20, color: '#999', textAlign: 'center' }}>載入中...</div>}
          {!loading && conversations.length === 0 && <div style={{ padding: 20, color: '#999', textAlign: 'center' }}>暫無對話</div>}
          {conversations.map(c => (
            <div key={c.phone} onClick={() => setSelectedPhone(c.phone)} style={{
              padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #eee',
              background: selectedPhone === c.phone ? '#e0f2f1' : 'transparent',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#333' }}>{c.name || c.phone}</span>
                {c.unread > 0 && <span style={{ background: '#25d366', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{c.unread}</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{c.lastMsg}</span>
                <span style={{ fontSize: 11, color: '#aaa', whiteSpace: 'nowrap' }}>{formatTime(c.lastTime)}</span>
              </div>
              <div style={{ fontSize: 11, color: ECTCM.headerBg, marginTop: 2 }}>{c.store || ''}</div>
            </div>
          ))}
        </div>

        {/* Right: Chat view */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#ece5dd' }}>
          {!selectedPhone ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 15 }}>
              選擇左邊對話開始
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div style={{ padding: '10px 16px', background: ECTCM.headerBg, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{selectedConvo?.name || selectedPhone}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{selectedPhone} · {selectedConvo?.store || ''}</div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {selectedConvo?.messages.map((m, i) => (
                  <div key={m.id || i} style={{
                    display: 'flex', justifyContent: m.direction === 'inbound' ? 'flex-start' : 'flex-end',
                    marginBottom: 8,
                  }}>
                    <div style={{
                      maxWidth: '70%', padding: '8px 12px', borderRadius: 8,
                      background: m.direction === 'inbound' ? '#fff' : '#dcf8c6',
                      boxShadow: '0 1px 1px rgba(0,0,0,.1)',
                      position: 'relative',
                    }}>
                      <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        {m.direction === 'outbound' && m.status === 'ai_replied' && <span style={{ fontSize: 10, color: '#25d366' }}>🤖</span>}
                        <span style={{ fontSize: 10, color: '#999' }}>{formatTime(m.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Reply input */}
              <div style={{ padding: '8px 12px', background: '#f0f0f0', display: 'flex', gap: 8 }}>
                <input
                  type="text" value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="輸入回覆..."
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 20, border: '1px solid #ddd', fontSize: 14, outline: 'none' }}
                />
                <button onClick={handleSend} disabled={sending || !replyText.trim()} style={{
                  padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  background: '#25d366', color: '#fff', fontSize: 14, fontWeight: 600,
                  opacity: sending || !replyText.trim() ? 0.5 : 1,
                }}>{sending ? '...' : '發送'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
