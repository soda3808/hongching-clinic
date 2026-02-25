import { useState, useMemo, useRef, useEffect } from 'react';
import { fmtM, getMonth } from '../data';

const QUICK_QUESTIONS = [
  '本月營業額分析',
  '邊個醫師業績最好？',
  '病人統計概況',
  '庫存有咩需要補貨？',
  '本月開支分析',
  '預約情況點樣？',
];

function getChatHistory() {
  try { return JSON.parse(localStorage.getItem('hcmc_ai_chat')) || []; } catch { return []; }
}
function saveChatHistory(msgs) {
  localStorage.setItem('hcmc_ai_chat', JSON.stringify(msgs.slice(-50)));
}

export default function AIChatPage({ data, setData, showToast, allData, user }) {
  const [messages, setMessages] = useState(getChatHistory);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const thisMonth = new Date().toISOString().substring(0, 7);
  const today = new Date().toISOString().substring(0, 10);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Build data context summary
  const context = useMemo(() => {
    const src = allData || data;
    const revenue = src.revenue || [];
    const expenses = src.expenses || [];
    const patients = src.patients || [];
    const inventory = src.inventory || [];
    const bookings = src.bookings || [];
    const consultations = src.consultations || [];
    const queue = src.queue || [];

    const monthRev = revenue.filter(r => getMonth(r.date) === thisMonth);
    const monthExp = expenses.filter(e => getMonth(e.date) === thisMonth);

    // Revenue by store
    const byStore = {};
    monthRev.forEach(r => { byStore[r.store] = (byStore[r.store] || 0) + (r.amount || 0); });

    // Revenue by doctor
    const byDoctor = {};
    monthRev.forEach(r => { if (r.doctor) byDoctor[r.doctor] = (byDoctor[r.doctor] || 0) + (r.amount || 0); });

    // Revenue by payment
    const byPayment = {};
    monthRev.forEach(r => { if (r.payment) byPayment[r.payment] = (byPayment[r.payment] || 0) + (r.amount || 0); });

    // Expense by category
    const expByCat = {};
    monthExp.forEach(e => { const cat = e.category || '其他'; expByCat[cat] = (expByCat[cat] || 0) + (e.amount || 0); });

    // Patient stats
    const newPatients = patients.filter(p => getMonth(p.createdAt || p.firstVisit || '') === thisMonth).length;
    const patByStore = {};
    patients.forEach(p => { if (p.store) patByStore[p.store] = (patByStore[p.store] || 0) + 1; });

    // Inventory
    const lowStock = inventory.filter(i => i.active !== false && i.stock <= (i.minStock || 10));
    const invValue = inventory.reduce((s, i) => s + (i.stock || 0) * (i.cost || 0), 0);

    // Bookings
    const todayBookings = bookings.filter(b => b.date === today && b.status !== 'cancelled');
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    const ws = weekStart.toISOString().substring(0, 10);
    const we = weekEnd.toISOString().substring(0, 10);
    const weekBookings = bookings.filter(b => b.date >= ws && b.date <= we && b.status !== 'cancelled');

    // Consultations
    const monthConsult = consultations.filter(c => getMonth(c.date || c.createdAt || '') === thisMonth);
    const consultByDoc = {};
    monthConsult.forEach(c => { if (c.doctor) consultByDoc[c.doctor] = (consultByDoc[c.doctor] || 0) + 1; });

    return {
      period: thisMonth,
      today,
      revenue: {
        monthTotal: monthRev.reduce((s, r) => s + (r.amount || 0), 0),
        monthCount: monthRev.length,
        byStore,
        byDoctor,
        byPayment,
      },
      expenses: {
        monthTotal: monthExp.reduce((s, e) => s + (e.amount || 0), 0),
        monthCount: monthExp.length,
        byCategory: expByCat,
      },
      patients: {
        total: patients.length,
        newThisMonth: newPatients,
        byStore: patByStore,
      },
      inventory: {
        totalItems: inventory.length,
        lowStockItems: lowStock.map(i => `${i.name}(剩${i.stock})`).slice(0, 15),
        lowStockCount: lowStock.length,
        totalValue: invValue,
      },
      bookings: {
        todayCount: todayBookings.length,
        thisWeekCount: weekBookings.length,
      },
      consultations: {
        thisMonthCount: monthConsult.length,
        byDoctor: consultByDoc,
      },
    };
  }, [data, allData, thisMonth, today]);

  // Quick stats for cards
  const stats = context;

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: 'user', content: text.trim(), ts: new Date().toISOString() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    saveChatHistory(updated);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          context,
          history: updated.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const result = await res.json();
      const aiMsg = {
        role: 'ai',
        content: result.success ? result.reply : `錯誤: ${result.error || '無法連接AI服務'}`,
        ts: new Date().toISOString(),
      };
      const final = [...updated, aiMsg];
      setMessages(final);
      saveChatHistory(final);
    } catch (err) {
      const errMsg = { role: 'ai', content: '網絡錯誤，請稍後再試。', ts: new Date().toISOString() };
      const final = [...updated, errMsg];
      setMessages(final);
      saveChatHistory(final);
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const clearChat = () => {
    setMessages([]);
    saveChatHistory([]);
    showToast('對話已清除');
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">本月營業額</div><div className="stat-value teal">{fmtM(stats.revenue.monthTotal)}</div></div>
        <div className="stat-card green"><div className="stat-label">病人總數</div><div className="stat-value green">{stats.patients.total}</div></div>
        <div className="stat-card red"><div className="stat-label">低庫存警報</div><div className="stat-value red">{stats.inventory.lowStockCount}</div></div>
        <div className="stat-card gold"><div className="stat-label">今日預約</div><div className="stat-value gold">{stats.bookings.todayCount}</div></div>
      </div>

      {/* Chat Area */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 280px)', minHeight: 400, padding: 0 }}>
        {/* Header */}
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>AI 數據助手</h3>
          <button className="btn btn-outline btn-sm" onClick={clearChat}>清除對話</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--gray-400)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>你好！我係康晴AI助手</div>
              <div style={{ fontSize: 12, marginBottom: 20 }}>你可以問我任何關於診所數據嘅問題</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {QUICK_QUESTIONS.map(q => (
                  <button
                    key={q}
                    className="btn btn-outline btn-sm"
                    style={{ fontSize: 12, borderRadius: 20 }}
                    onClick={() => sendMessage(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 12,
            }}>
              <div style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' ? 'var(--teal-600)' : '#fff',
                color: msg.role === 'user' ? '#fff' : 'var(--gray-800)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--gray-200)',
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.content}
                <div style={{
                  fontSize: 10,
                  opacity: 0.6,
                  marginTop: 4,
                  textAlign: msg.role === 'user' ? 'right' : 'left',
                }}>
                  {msg.ts ? new Date(msg.ts).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' }) : ''}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
              <div style={{
                padding: '10px 14px', borderRadius: '16px 16px 16px 4px',
                background: '#fff', border: '1px solid var(--gray-200)',
                fontSize: 13, color: 'var(--gray-400)',
              }}>
                AI 分析中...
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Quick questions (when there are messages) */}
        {messages.length > 0 && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--gray-100)', display: 'flex', gap: 6, overflowX: 'auto' }}>
            {QUICK_QUESTIONS.slice(0, 4).map(q => (
              <button
                key={q}
                className="btn btn-outline btn-sm"
                style={{ fontSize: 11, borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => sendMessage(q)}
                disabled={loading}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} style={{
          padding: 12, borderTop: '1px solid var(--gray-200)',
          display: 'flex', gap: 8, background: 'var(--gray-50)',
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="問我關於診所數據嘅問題..."
            style={{ flex: 1, borderRadius: 20, padding: '10px 16px' }}
            disabled={loading}
          />
          <button
            type="submit"
            className="btn btn-teal"
            style={{ borderRadius: 20, padding: '10px 20px' }}
            disabled={loading || !input.trim()}
          >
            {loading ? '...' : '發送'}
          </button>
        </form>
      </div>
    </>
  );
}
