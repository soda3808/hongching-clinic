import { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { fmtM, fmt, getMonth, monthLabel, linearRegression } from '../data';
import { getTenantStoreNames, getClinicName } from '../tenant';
import { openWhatsApp, sendTelegram } from '../api';

const COLORS = ['#0e7490','#8B6914','#C0392B','#1A7A42','#7C3AED','#EA580C','#0284C7','#BE185D'];

export default function Dashboard({ data, onNavigate }) {
  const [store, setStore] = useState('all');
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [revGoal, setRevGoal] = useState(() => {
    try { return Number(localStorage.getItem('hcmc_rev_goal')) || 200000; } catch { return 200000; }
  });
  const [editingGoal, setEditingGoal] = useState(false);

  // Daily Operations Checklist
  const todayDate = new Date().toISOString().substring(0, 10);
  const DEFAULT_CHECKLIST = [
    { id: 'open1', phase: 'morning', label: '開門/開燈/開冷氣', order: 1 },
    { id: 'open2', phase: 'morning', label: '檢查當日預約名單', order: 2 },
    { id: 'open3', phase: 'morning', label: '準備候診區/診間', order: 3 },
    { id: 'open4', phase: 'morning', label: '檢查藥材庫存', order: 4 },
    { id: 'open5', phase: 'morning', label: '發送今日預約提醒', order: 5 },
    { id: 'close1', phase: 'evening', label: '核對今日收入', order: 6 },
    { id: 'close2', phase: 'evening', label: '處理未完成掛號', order: 7 },
    { id: 'close3', phase: 'evening', label: '補記診症紀錄', order: 8 },
    { id: 'close4', phase: 'evening', label: '明日預約確認', order: 9 },
    { id: 'close5', phase: 'evening', label: '關燈/鎖門', order: 10 },
  ];
  const [checklist, setChecklist] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('hcmc_checklist') || '{}');
      if (saved.date === todayDate) return saved;
    } catch {}
    return { date: todayDate, items: DEFAULT_CHECKLIST.map(c => ({ ...c, done: false })) };
  });
  const toggleCheckItem = (id) => {
    const updated = { ...checklist, items: checklist.items.map(c => c.id === id ? { ...c, done: !c.done } : c) };
    setChecklist(updated);
    localStorage.setItem('hcmc_checklist', JSON.stringify(updated));
  };
  const checklistProgress = checklist.items.length > 0 ? Math.round((checklist.items.filter(c => c.done).length / checklist.items.length) * 100) : 0;

  // AI Daily Briefing - load once per day
  const todayKey = new Date().toISOString().substring(0, 10);
  useEffect(() => {
    const cached = localStorage.getItem('hcmc_briefing');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.date === todayKey) { setBriefing(parsed.text); return; }
      } catch {}
    }
  }, [todayKey]);

  const loadBriefing = async () => {
    setBriefingLoading(true);
    const today = new Date().toISOString().substring(0, 10);
    const thisMonth = today.substring(0, 7);
    const rev = data.revenue || [];
    const exp = data.expenses || [];
    const patients = data.patients || [];
    const bookings = data.bookings || [];
    const inventory = data.inventory || [];

    const monthRev = rev.filter(r => (r.date || '').substring(0, 7) === thisMonth).reduce((s, r) => s + Number(r.amount), 0);
    const monthExp = exp.filter(r => (r.date || '').substring(0, 7) === thisMonth).reduce((s, r) => s + Number(r.amount), 0);
    const todayBookings = bookings.filter(b => b.date === today && b.status !== 'cancelled').length;
    const lowStock = inventory.filter(i => i.stock <= (i.minStock || 10)).length;
    const newPatients = patients.filter(p => (p.createdAt || '').substring(0, 7) === thisMonth).length;

    const context = { period: thisMonth, today, revenue: { monthTotal: monthRev }, expenses: { monthTotal: monthExp }, patients: { total: patients.length, newThisMonth: newPatients }, bookings: { todayCount: todayBookings }, inventory: { lowStockCount: lowStock } };

    try {
      const res = await fetch('/api/ai?action=chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '請生成今日診所智能簡報，包括：1)今日重點數據 2)需要關注的事項 3)一句鼓勵或建議。簡短精煉，5-8行即可。',
          context,
          history: [],
        }),
      });
      const result = await res.json();
      if (result.success) {
        setBriefing(result.reply);
        localStorage.setItem('hcmc_briefing', JSON.stringify({ date: todayKey, text: result.reply }));
      }
    } catch {}
    setBriefingLoading(false);
  };

  const filtered = useMemo(() => {
    const rev = store === 'all' ? (data.revenue || []) : (data.revenue || []).filter(r => r.store === store);
    const exp = store === 'all' ? (data.expenses || []) : (data.expenses || []).filter(r => r.store === store || r.store === '兩店共用');
    return { rev, exp };
  }, [data, store]);

  const months = useMemo(() => {
    const m = new Set();
    (data.revenue || []).forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    (data.expenses || []).forEach(r => { const k = getMonth(r.date); if (k) m.add(k); });
    return [...m].sort();
  }, [data]);

  const thisMonth = new Date().toISOString().substring(0, 7);
  const lastMonth = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().substring(0, 7);
  })();

  const totalRev = filtered.rev.reduce((s, r) => s + Number(r.amount), 0);
  const totalExp = filtered.exp.reduce((s, r) => s + Number(r.amount), 0);
  const net = totalRev - totalExp;
  const thisRev = filtered.rev.filter(r => getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount), 0);
  const thisExp = filtered.exp.filter(r => getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount), 0);
  const lastRev = filtered.rev.filter(r => getMonth(r.date) === lastMonth).reduce((s, r) => s + Number(r.amount), 0);
  const revGrowth = lastRev ? ((thisRev - lastRev) / lastRev * 100).toFixed(1) : 0;
  const lastExp = filtered.exp.filter(r => getMonth(r.date) === lastMonth).reduce((s, r) => s + Number(r.amount), 0);
  const expGrowth = lastExp ? ((thisExp - lastExp) / lastExp * 100).toFixed(1) : 0;
  const patientCount = filtered.rev.filter(r => getMonth(r.date) === thisMonth && !(r.name || '').includes('匯總')).length;
  const lastPatientCount = filtered.rev.filter(r => getMonth(r.date) === lastMonth && !(r.name || '').includes('匯總')).length;
  const patientGrowth = lastPatientCount ? ((patientCount - lastPatientCount) / lastPatientCount * 100).toFixed(1) : 0;
  const thisBookings = (data.bookings || []).filter(b => (b.date || '').substring(0, 7) === thisMonth && b.status !== 'cancelled').length;
  const lastBookings = (data.bookings || []).filter(b => (b.date || '').substring(0, 7) === lastMonth && b.status !== 'cancelled').length;
  const bookingGrowth = lastBookings ? ((thisBookings - lastBookings) / lastBookings * 100).toFixed(1) : 0;
  const margin = totalRev ? ((net / totalRev) * 100).toFixed(1) : 0;

  // Chart data
  const barData = months.map(m => ({
    month: monthLabel(m).split(' ')[0],
    營業額: filtered.rev.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0),
    開支: filtered.exp.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0),
  }));

  const pieData = (() => {
    const cats = {};
    filtered.exp.forEach(r => { cats[r.category] = (cats[r.category] || 0) + Number(r.amount); });
    return Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  })();

  // P&L by month
  const revByMonth = {}, expByMonth = {}, catByMonth = {};
  months.forEach(m => {
    revByMonth[m] = filtered.rev.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0);
    expByMonth[m] = filtered.exp.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0);
  });
  const allCats = {};
  filtered.exp.forEach(r => { allCats[r.category] = (allCats[r.category] || 0) + Number(r.amount); });
  Object.keys(allCats).sort((a, b) => allCats[b] - allCats[a]).forEach(cat => {
    catByMonth[cat] = {};
    months.forEach(m => {
      catByMonth[cat][m] = filtered.exp.filter(r => getMonth(r.date) === m && r.category === cat).reduce((s, r) => s + Number(r.amount), 0);
    });
  });

  // ── Comprehensive Daily Closing Report ──
  const printDailyClose = () => {
    const today = new Date().toISOString().substring(0, 10);
    const rev = (data.revenue || []).filter(r => r.date === today);
    const exp = (data.expenses || []).filter(r => r.date === today);
    const queue = (data.queue || []).filter(r => r.date === today);
    const bookings = (data.bookings || []).filter(b => b.date === today);
    const arap = data.arap || [];
    const inventory = data.inventory || [];
    const patients = data.patients || [];

    const totalRev = rev.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalExp = exp.reduce((s, r) => s + Number(r.amount || 0), 0);
    const net = totalRev - totalExp;

    // Revenue by store
    const revByStore = {};
    rev.forEach(r => { const st = r.store || '未知'; revByStore[st] = (revByStore[st] || 0) + Number(r.amount || 0); });
    // Revenue by doctor
    const revByDoc = {};
    rev.forEach(r => { if (r.doctor) { if (!revByDoc[r.doctor]) revByDoc[r.doctor] = { amt: 0, count: 0 }; revByDoc[r.doctor].amt += Number(r.amount || 0); revByDoc[r.doctor].count++; } });
    // Revenue by payment method
    const revByPay = {};
    rev.forEach(r => { const m = r.payment || 'FPS'; revByPay[m] = (revByPay[m] || 0) + Number(r.amount || 0); });
    // Expense by category
    const expByCat = {};
    exp.forEach(r => { expByCat[r.category || '其他'] = (expByCat[r.category || '其他'] || 0) + Number(r.amount || 0); });
    // Queue stats
    const qCompleted = queue.filter(q => q.status === 'completed').length;
    const qWaiting = queue.filter(q => q.status === 'waiting').length;
    const qNoShow = queue.filter(q => q.status === 'no-show').length;
    // Bookings
    const bConfirmed = bookings.filter(b => b.status === 'confirmed').length;
    const bCompleted = bookings.filter(b => b.status === 'completed').length;
    const bCancelled = bookings.filter(b => b.status === 'cancelled').length;
    // ARAP overdue
    const overdueAR = arap.filter(r => r.type === 'receivable' && r.status !== '已收' && r.dueDate && r.dueDate < today);
    const overdueTotal = overdueAR.reduce((s, r) => s + Number(r.amount || 0), 0);
    // Inventory alerts
    const lowStock = inventory.filter(i => Number(i.stock || 0) <= Number(i.minStock || 10));
    // New patients today
    const newPatients = patients.filter(p => (p.createdAt || '').substring(0, 10) === today);

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>日結總報告 ${today}</title>
      <style>
        @page{size:A4;margin:12mm}body{font-family:'Microsoft YaHei',sans-serif;font-size:12px;color:#333;max-width:750px;margin:0 auto;padding:20px}
        h1{font-size:18px;text-align:center;color:#0e7490;margin-bottom:4px}
        .sub{text-align:center;color:#888;font-size:11px;margin-bottom:20px}
        h2{font-size:13px;color:#0e7490;border-bottom:2px solid #0e7490;padding-bottom:4px;margin-top:18px}
        .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
        .box{border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center}
        .box .n{font-size:20px;font-weight:800}.box .l{font-size:9px;color:#888}
        table{width:100%;border-collapse:collapse;margin:8px 0}
        th{background:#f8f8f8;font-weight:700;font-size:11px;padding:5px 8px;text-align:left}
        td{padding:5px 8px;border-bottom:1px solid #eee;font-size:11px}
        .r{text-align:right}.b{font-weight:700}
        .alert{background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;margin:8px 0;font-size:11px;color:#dc2626}
        .sign{display:flex;justify-content:space-between;margin-top:40px}
        .sign-box{border-top:1px solid #333;width:180px;text-align:center;padding-top:6px;font-size:10px;color:#888}
        .footer{text-align:center;font-size:9px;color:#aaa;margin-top:20px}
      </style></head><body>
      <h1>${getClinicName()} — 日結總報告</h1>
      <div class="sub">DAILY CLOSING REPORT | ${today} | 列印: ${new Date().toLocaleString('zh-HK')}</div>

      <div class="grid">
        <div class="box"><div class="n" style="color:#16a34a">${fmtM(totalRev)}</div><div class="l">今日營業額</div></div>
        <div class="box"><div class="n" style="color:#dc2626">${fmtM(totalExp)}</div><div class="l">今日開支</div></div>
        <div class="box"><div class="n" style="color:${net >= 0 ? '#0e7490' : '#dc2626'}">${fmtM(net)}</div><div class="l">淨收入</div></div>
        <div class="box"><div class="n" style="color:#0e7490">${queue.length}</div><div class="l">今日掛號</div></div>
      </div>

      <h2>營業額明細</h2>
      <table>
        <thead><tr><th>店舖</th><th class="r">金額</th><th class="r">佔比</th></tr></thead>
        <tbody>${Object.entries(revByStore).map(([st, amt]) => `<tr><td class="b">${st}</td><td class="r">${fmtM(amt)}</td><td class="r">${totalRev ? (amt / totalRev * 100).toFixed(0) : 0}%</td></tr>`).join('')}
        <tr class="b" style="background:#f0fdfa"><td>合計</td><td class="r">${fmtM(totalRev)}</td><td class="r">100%</td></tr></tbody>
      </table>

      <h2>醫師業績</h2>
      <table>
        <thead><tr><th>醫師</th><th class="r">人次</th><th class="r">金額</th></tr></thead>
        <tbody>${Object.entries(revByDoc).map(([doc, d]) => `<tr><td>${doc}</td><td class="r">${d.count}</td><td class="r">${fmtM(d.amt)}</td></tr>`).join('') || '<tr><td colspan="3" style="color:#aaa;text-align:center">無紀錄</td></tr>'}</tbody>
      </table>

      <h2>收款方式</h2>
      <table>
        <thead><tr><th>方式</th><th class="r">金額</th></tr></thead>
        <tbody>${Object.entries(revByPay).map(([m, amt]) => `<tr><td>${m}</td><td class="r">${fmtM(amt)}</td></tr>`).join('') || '<tr><td colspan="2" style="color:#aaa;text-align:center">無紀錄</td></tr>'}</tbody>
      </table>

      ${exp.length > 0 ? `<h2>今日開支</h2><table><thead><tr><th>類別</th><th class="r">金額</th></tr></thead><tbody>${Object.entries(expByCat).map(([c, amt]) => `<tr><td>${c}</td><td class="r">${fmtM(amt)}</td></tr>`).join('')}<tr class="b" style="background:#fef2f2"><td>合計</td><td class="r">${fmtM(totalExp)}</td></tr></tbody></table>` : ''}

      <h2>掛號/預約統計</h2>
      <div class="grid">
        <div class="box"><div class="n">${qCompleted}</div><div class="l">已完成</div></div>
        <div class="box"><div class="n">${qWaiting}</div><div class="l">等候中</div></div>
        <div class="box"><div class="n">${qNoShow}</div><div class="l">未到</div></div>
        <div class="box"><div class="n">${newPatients.length}</div><div class="l">新病人</div></div>
      </div>

      ${overdueAR.length > 0 ? `<div class="alert">⚠️ 逾期應收帳 ${overdueAR.length} 筆，共 ${fmtM(overdueTotal)}</div>` : ''}
      ${lowStock.length > 0 ? `<div class="alert">⚠️ 低庫存警報 ${lowStock.length} 項：${lowStock.slice(0, 5).map(i => i.name).join('、')}${lowStock.length > 5 ? '...' : ''}</div>` : ''}

      <div class="sign">
        <div class="sign-box">經手人簽名</div>
        <div class="sign-box">管理人核實</div>
      </div>
      <div class="footer">此報告由系統自動生成 | ${getClinicName()}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // Recent activity
  const recentActivity = useMemo(() => {
    const items = [];
    (data.revenue || []).forEach(r => items.push({ type: '💰', label: `營業 ${r.name} ${fmtM(r.amount)}`, date: r.date }));
    (data.expenses || []).forEach(r => items.push({ type: '🧾', label: `開支 ${r.merchant} ${fmtM(r.amount)}`, date: r.date }));
    (data.bookings || []).forEach(r => items.push({ type: '📅', label: `預約 ${r.patientName} (${r.doctor})`, date: r.createdAt || r.date }));
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  }, [data]);

  return (
    <>
      {/* AI Daily Briefing */}
      <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)', border: '1px solid var(--teal-200)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: briefing ? 8 : 0 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--teal-700)' }}>🤖 今日智能簡報</h3>
          {!briefing && (
            <button className="btn btn-teal btn-sm" onClick={loadBriefing} disabled={briefingLoading} style={{ fontSize: 11 }}>
              {briefingLoading ? '生成中...' : '生成簡報'}
            </button>
          )}
          {briefing && (
            <button className="btn btn-outline btn-sm" onClick={() => { setBriefing(null); localStorage.removeItem('hcmc_briefing'); }} style={{ fontSize: 11 }}>
              刷新
            </button>
          )}
        </div>
        {briefing && (
          <div style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--gray-700)' }}>{briefing}</div>
        )}
        {!briefing && !briefingLoading && (
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>撳「生成簡報」獲取今日 AI 分析</div>
        )}
      </div>

      {/* Daily Operations Checklist */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--teal-700)' }}>
            {new Date().getHours() < 14 ? '🌅 開店清單' : '🌙 收店清單'}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--gray-100)' }}>
              <div style={{ width: `${checklistProgress}%`, height: '100%', borderRadius: 3, background: checklistProgress === 100 ? '#16a34a' : '#0e7490', transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: checklistProgress === 100 ? 'var(--green-700)' : 'var(--teal-700)' }}>{checklistProgress}%</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {['morning', 'evening'].map(phase => (
            <div key={phase}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', marginBottom: 4 }}>{phase === 'morning' ? '☀️ 開店' : '🌙 收店'}</div>
              {checklist.items.filter(c => c.phase === phase).map(c => (
                <div key={c.id} onClick={() => toggleCheckItem(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 12 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 4, border: c.done ? 'none' : '2px solid var(--gray-300)', background: c.done ? '#16a34a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, flexShrink: 0 }}>
                    {c.done && '✓'}
                  </span>
                  <span style={{ color: c.done ? 'var(--gray-400)' : 'var(--gray-700)', textDecoration: c.done ? 'line-through' : 'none' }}>{c.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        {checklistProgress === 100 && <div style={{ marginTop: 8, padding: '6px 12px', background: 'var(--green-50)', borderRadius: 6, fontSize: 12, color: 'var(--green-700)', fontWeight: 600, textAlign: 'center' }}>全部完成！辛苦了！</div>}
      </div>

      {/* Quick Actions */}
      {onNavigate && (
        <div className="quick-actions" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { icon: '➕', label: '新增營業', page: 'rev' },
            { icon: '🧾', label: '新增開支', page: 'exp' },
            { icon: '📅', label: '新增預約', page: 'booking' },
            { icon: '📋', label: '生成糧單', page: 'pay' },
          ].map(a => (
            <button key={a.page} className="btn btn-outline" style={{ padding: '14px 12px', fontSize: 13, justifyContent: 'center' }} onClick={() => onNavigate(a.page)}>
              <span style={{ fontSize: 18 }}>{a.icon}</span> {a.label}
            </button>
          ))}
          <button className="btn" style={{ padding: '14px 12px', fontSize: 13, justifyContent: 'center', background: '#0088cc', color: '#fff' }} onClick={() => {
            const tgCfg = (() => { try { return JSON.parse(localStorage.getItem('hcmc_telegram_config') || '{}'); } catch { return {}; } })();
            const schedule = (() => { try { return JSON.parse(localStorage.getItem('hcmc_doc_schedule') || '{}'); } catch { return {}; } })();
            const dow = new Date().getDay();
            const adjDow = dow === 0 ? 6 : dow - 1;
            const dayLabels = ['一','二','三','四','五','六','日'];
            const doctors = (() => { try { const tc = JSON.parse(localStorage.getItem('hcmc_tenant_config') || '{}'); return tc.doctors || []; } catch { return []; } })();
            const lines = [`📋 今日排班 — ${new Date().toLocaleDateString('zh-HK')} 星期${dayLabels[adjDow]}\n`];
            doctors.forEach(doc => { const store = schedule[`${doc}_${adjDow}`] || ''; lines.push(store ? `✅ ${doc} → ${store}` : `⬜ ${doc} → 休息`); });
            const msg = lines.join('\n');
            if (tgCfg.botToken && tgCfg.chatId) {
              sendTelegram(msg, tgCfg.chatId).then(res => { /* silent */ });
            }
            window.open(`https://t.me/share/url?text=${encodeURIComponent(msg)}`, '_blank');
          }}>
            <span style={{ fontSize: 18 }}>📢</span> TG通知排班
          </button>
          <button className="btn btn-gold" style={{ padding: '14px 12px', fontSize: 13, justifyContent: 'center', gridColumn: '1 / -1' }} onClick={printDailyClose}>
            📊 日結總報告 — 列印今日全面結算
          </button>
        </div>
      )}

      {/* Store Tabs */}
      <div className="tab-bar">
        {['all', ...getTenantStoreNames()].map(s => (
          <button key={s} className={`tab-btn ${store === s ? 'active' : ''}`} onClick={() => setStore(s)}>
            {s === 'all' ? `🏢 ${getTenantStoreNames().length}店合計` : `📍 ${s}`}
          </button>
        ))}
      </div>

      {/* KPI Cards — with trend indicators */}
      <div className="stats-grid">
        <div className="stat-card gold">
          <div className="stat-label">本月營業額</div>
          <div className="stat-value gold">{fmtM(thisRev)}</div>
          <div className="stat-sub" style={{ color: revGrowth >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
            {revGrowth > 0 ? '↑' : revGrowth < 0 ? '↓' : '→'} {Math.abs(revGrowth)}% vs 上月
          </div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">本月開支</div>
          <div className="stat-value red">{fmtM(thisExp)}</div>
          <div className="stat-sub" style={{ color: expGrowth <= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
            {expGrowth > 0 ? '↑' : expGrowth < 0 ? '↓' : '→'} {Math.abs(expGrowth)}% vs 上月
          </div>
        </div>
        <div className="stat-card teal">
          <div className="stat-label">本月診症人次</div>
          <div className="stat-value teal">{patientCount}</div>
          <div className="stat-sub" style={{ color: patientGrowth >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
            {patientGrowth > 0 ? '↑' : patientGrowth < 0 ? '↓' : '→'} {Math.abs(patientGrowth)}% vs 上月
          </div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">本月預約數</div>
          <div className="stat-value green">{thisBookings}</div>
          <div className="stat-sub" style={{ color: bookingGrowth >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
            {bookingGrowth > 0 ? '↑' : bookingGrowth < 0 ? '↓' : '→'} {Math.abs(bookingGrowth)}% vs 上月
          </div>
        </div>
        <div className="stat-card" style={{ '--c': net >= 0 ? 'var(--green-600)' : 'var(--red-500)' }}>
          <div className="stat-label">本月損益</div>
          <div className="stat-value" style={{ color: thisRev - thisExp >= 0 ? '#16a34a' : '#dc2626' }}>
            {fmtM(thisRev - thisExp)}
          </div>
          <div className="stat-sub">利潤率 {thisRev ? ((thisRev - thisExp) / thisRev * 100).toFixed(1) : 0}%</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">總營業額</div>
          <div className="stat-value gold">{fmtM(totalRev)}</div>
          <div className="stat-sub">{months.length} 個月累計</div>
        </div>
      </div>

      {/* Quick Action Buttons */}
      {onNavigate && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          <button onClick={() => onNavigate('rev')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '14px 8px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#0e7490', transition: 'all 0.15s' }}>
            <span style={{ fontSize: 22 }}>💰</span> 新增收入
          </button>
          <button onClick={() => onNavigate('booking')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '14px 8px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#0e7490', transition: 'all 0.15s' }}>
            <span style={{ fontSize: 22 }}>📅</span> 新增預約
          </button>
          <button onClick={() => onNavigate('patient')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '14px 8px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#0e7490', transition: 'all 0.15s' }}>
            <span style={{ fontSize: 22 }}>🧑‍⚕️</span> 登記病人
          </button>
          <button onClick={() => onNavigate('ai')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '14px 8px', borderRadius: 10, border: '1px solid #d1d5db', background: 'linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#0e7490', transition: 'all 0.15s' }}>
            <span style={{ fontSize: 22 }}>🤖</span> AI 對話
          </button>
        </div>
      )}

      {/* Today's Summary Card */}
      {(() => {
        const todaySummaryStr = new Date().toISOString().substring(0, 10);
        const todayAppointments = (data.bookings || []).filter(b => b.date === todaySummaryStr && b.status !== 'cancelled').sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        const todaySummaryRev = (data.revenue || []).filter(r => r.date && r.date.substring(0, 10) === todaySummaryStr);
        const todaySummaryRevTotal = todaySummaryRev.reduce((s, r) => s + Number(r.amount || 0), 0);
        const todaySummaryNewPatients = (data.patients || []).filter(p => (p.createdAt || '').substring(0, 10) === todaySummaryStr).length;
        return (
          <div className="card" style={{ marginBottom: 16, border: '1px solid #bae6fd', background: 'linear-gradient(135deg, #f0f9ff 0%, #f0fdfa 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: '#0e7490' }}>📋 今日摘要 — {todaySummaryStr}</h3>
              <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                <span>營業額 <strong style={{ color: '#16a34a' }}>{fmtM(todaySummaryRevTotal)}</strong></span>
                <span>新病人 <strong style={{ color: '#2563eb' }}>{todaySummaryNewPatients}</strong></span>
                <span>預約 <strong style={{ color: '#0e7490' }}>{todayAppointments.length}</strong></span>
              </div>
            </div>
            {todayAppointments.length > 0 ? (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {todayAppointments.map(b => (
                  <div key={b.id} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid #e0f2fe', alignItems: 'center', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, minWidth: 48, color: '#0e7490' }}>{b.time || '--:--'}</span>
                    <span style={{ fontWeight: 600, minWidth: 70 }}>{b.patientName}</span>
                    <span style={{ color: '#6b7280' }}>{b.doctor}</span>
                    <span style={{ color: '#9ca3af', marginLeft: 'auto', fontSize: 11 }}>{b.store || ''}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '1px 8px', borderRadius: 4,
                      background: b.status === 'completed' ? '#dcfce7' : b.status === 'confirmed' ? '#dbeafe' : '#fef9c3',
                      color: b.status === 'completed' ? '#16a34a' : b.status === 'confirmed' ? '#2563eb' : '#d97706',
                    }}>
                      {b.status === 'completed' ? '已完成' : b.status === 'confirmed' ? '已確認' : '待確認'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 16, color: '#9ca3af', fontSize: 12 }}>今日暫無預約</div>
            )}
          </div>
        );
      })()}

      {/* Today's Payment Breakdown */}
      {(() => {
        const todayStr = new Date().toISOString().substring(0, 10);
        const todayRev = (data.revenue || []).filter(r => r.date && r.date.substring(0, 10) === todayStr);
        const byMethod = {};
        let todayTotal = 0;
        todayRev.forEach(r => {
          const method = r.payment || '現金';
          byMethod[method] = (byMethod[method] || 0) + Number(r.amount || 0);
          todayTotal += Number(r.amount || 0);
        });
        const methodColors = { '現金': '#16a34a', 'FPS': '#7c3aed', '八達通': '#d97706', '信用卡': '#0284c7', 'Payme': '#dc2626', '微信': '#16a34a', '支付寶': '#0e7490', '轉帳': '#6366f1' };
        const methods = Object.entries(byMethod).sort((a, b) => b[1] - a[1]);
        if (todayTotal === 0) return null;
        return (
          <div className="card" style={{ marginBottom: 16, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--teal-700)' }}>💳 今日收款明細</span>
              <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--green-700)' }}>{fmtM(todayTotal)}</span>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              {methods.map(([method, amt]) => (
                <div key={method} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ minWidth: 55, fontWeight: 600 }}>{method}</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--gray-100)', borderRadius: 4 }}>
                    <div style={{ width: `${(amt / todayTotal) * 100}%`, height: '100%', background: methodColors[method] || '#666', borderRadius: 4 }} />
                  </div>
                  <span style={{ minWidth: 80, textAlign: 'right', fontWeight: 600, color: methodColors[method] || '#666' }}>{fmtM(amt)} ({todayTotal > 0 ? ((amt / todayTotal) * 100).toFixed(0) : 0}%)</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 4 }}>共 {todayRev.length} 筆交易</div>
          </div>
        );
      })()}

      {/* Revenue Goal Tracker */}
      {(() => {
        const goalPct = revGoal > 0 ? Math.min((thisRev / revGoal) * 100, 100) : 0;
        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        const dayOfMonth = new Date().getDate();
        const dailyPace = revGoal > 0 ? (revGoal - thisRev) / Math.max(daysInMonth - dayOfMonth, 1) : 0;
        const expectedPct = (dayOfMonth / daysInMonth) * 100;
        const onTrack = goalPct >= expectedPct;
        return (
          <div className="card" style={{ marginBottom: 16, border: onTrack ? '1px solid var(--green-200)' : '1px solid var(--gold-200)', background: onTrack ? 'var(--green-50)' : '' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: 'var(--teal-700)' }}>🎯 本月營業目標</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {editingGoal ? (
                  <>
                    <input type="number" value={revGoal} onChange={e => setRevGoal(Number(e.target.value))} style={{ width: 100, padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--gray-300)' }} />
                    <button className="btn btn-teal btn-sm" style={{ fontSize: 10 }} onClick={() => { localStorage.setItem('hcmc_rev_goal', revGoal); setEditingGoal(false); }}>確定</button>
                  </>
                ) : (
                  <button className="btn btn-outline btn-sm" style={{ fontSize: 10 }} onClick={() => setEditingGoal(true)}>修改目標</button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ height: 16, borderRadius: 8, background: 'var(--gray-200)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ width: `${goalPct}%`, height: '100%', borderRadius: 8, background: goalPct >= 100 ? '#16a34a' : onTrack ? '#0e7490' : '#d97706', transition: 'width 0.5s' }} />
                  {/* Expected position marker */}
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${expectedPct}%`, width: 2, background: '#333', opacity: 0.3 }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 80 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: goalPct >= 100 ? 'var(--green-700)' : 'var(--teal-700)' }}>{goalPct.toFixed(0)}%</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>實際 <strong style={{ color: 'var(--gold-700)' }}>{fmtM(thisRev)}</strong> / 目標 <strong>{fmtM(revGoal)}</strong></span>
              <span>差距 <strong style={{ color: thisRev >= revGoal ? 'var(--green-700)' : 'var(--red-600)' }}>{fmtM(revGoal - thisRev)}</strong></span>
              <span>日均需 <strong style={{ color: dailyPace > 0 ? 'var(--gold-700)' : 'var(--green-700)' }}>{dailyPace > 0 ? fmtM(dailyPace) : '已達標'}</strong></span>
            </div>
            {goalPct >= 100 && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--green-700)', fontWeight: 700, textAlign: 'center' }}>目標已達成！超出 {fmtM(thisRev - revGoal)}</div>}
          </div>
        );
      })()}

      {/* Budget Tracker */}
      {(() => {
        const budgets = (() => { try { return JSON.parse(localStorage.getItem('hcmc_budgets')) || {}; } catch { return {}; } })();
        const thisMonth = new Date().toISOString().substring(0, 7);
        const monthExp = (data.expenses || []).filter(e => e.date && e.date.substring(0, 7) === thisMonth);
        const catSpending = {};
        monthExp.forEach(e => { catSpending[e.category || '其他'] = (catSpending[e.category || '其他'] || 0) + Number(e.amount || 0); });
        const hasBudgets = Object.keys(budgets).length > 0;
        const overBudget = Object.entries(budgets).filter(([cat, limit]) => (catSpending[cat] || 0) > limit * 0.8);
        if (!hasBudgets) return null;
        return (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3>💰 支出預算追蹤</h3></div>
          <div style={{ display: 'grid', gap: 6, padding: '4px 0' }}>
            {Object.entries(budgets).sort((a, b) => (catSpending[b[0]] || 0) / b[1] - (catSpending[a[0]] || 0) / a[1]).map(([cat, limit]) => {
              const spent = catSpending[cat] || 0;
              const pct = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
              const over = spent > limit;
              return (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ minWidth: 80, fontWeight: 600 }}>{cat}</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--gray-100)', borderRadius: 4 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: over ? '#dc2626' : pct > 80 ? '#d97706' : '#16a34a', borderRadius: 4 }} />
                  </div>
                  <span style={{ minWidth: 90, textAlign: 'right', fontWeight: 600, color: over ? '#dc2626' : pct > 80 ? '#d97706' : 'var(--gray-600)' }}>
                    {fmtM(spent)}/{fmtM(limit)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}

      {/* P&L Table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>📊 損益表 P&L Statement</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="pl-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>項目</th>
                {months.map(m => <th key={m}>{monthLabel(m)}</th>)}
                <th>合計</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ fontWeight: 700 }}>
                <td>營業額</td>
                {months.map(m => <td key={m} style={{ color: 'var(--gold-700)' }}>{fmtM(revByMonth[m])}</td>)}
                <td style={{ color: 'var(--gold-700)', fontWeight: 800 }}>{fmtM(totalRev)}</td>
              </tr>
              {Object.keys(catByMonth).map(cat => (
                <tr key={cat}>
                  <td className="row-header">{cat}</td>
                  {months.map(m => <td key={m}>{catByMonth[cat][m] ? fmtM(catByMonth[cat][m]) : '-'}</td>)}
                  <td>{fmtM(allCats[cat])}</td>
                </tr>
              ))}
              <tr className="subtotal-row">
                <td>總開支</td>
                {months.map(m => <td key={m} style={{ color: 'var(--red-600)' }}>{fmtM(expByMonth[m])}</td>)}
                <td style={{ color: 'var(--red-600)' }}>{fmtM(totalExp)}</td>
              </tr>
              <tr className="total-row">
                <td>淨利潤</td>
                {months.map(m => {
                  const n = revByMonth[m] - expByMonth[m];
                  return <td key={m} style={{ color: n >= 0 ? 'var(--green-700)' : 'var(--red-600)' }}>{fmtM(n)}</td>;
                })}
                <td style={{ color: net >= 0 ? 'var(--green-700)' : 'var(--red-600)' }}>{fmtM(net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header"><h3>📈 營業額 vs 開支趨勢</h3></div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData}>
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip formatter={v => fmtM(v)} />
              <Bar dataKey="營業額" fill="#8B6914" radius={[4,4,0,0]} />
              <Bar dataKey="開支" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-header"><h3>🍩 開支分類佔比</h3></div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => fmtM(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Line Chart */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>📉 營業額趨勢折線圖</h3></div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
            <Tooltip formatter={v => fmtM(v)} />
            <Legend />
            <Line type="monotone" dataKey="營業額" stroke="#8B6914" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="開支" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Financial Forecast */}
      {months.length >= 2 && (() => {
        const points = months.map((m, i) => [i, filtered.rev.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0)]);
        const { slope, intercept } = linearRegression(points);
        const forecastData = months.slice(-4).map((m, i) => ({
          month: monthLabel(m).split(' ')[0],
          實際: filtered.rev.filter(r => getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0),
        }));
        // Add 2 forecast months
        for (let f = 1; f <= 2; f++) {
          const idx = months.length - 1 + f;
          const val = Math.max(0, Math.round(slope * idx + intercept));
          const d = new Date(); d.setMonth(d.getMonth() + f);
          forecastData.push({ month: monthLabel(d.toISOString().substring(0, 7)).split(' ')[0] + '(預)', 預測: val });
        }
        const nextMonthForecast = Math.max(0, Math.round(slope * months.length + intercept));
        const trend = slope > 0 ? '上升' : slope < 0 ? '下降' : '持平';

        return (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>🔮 營業額預測</h3></div>
            <div style={{ padding: '12px 16px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
              <div><strong>下月預測：</strong><span style={{ color: 'var(--teal-700)', fontWeight: 700 }}>{fmtM(nextMonthForecast)}</span></div>
              <div><strong>趨勢：</strong><span style={{ color: slope > 0 ? 'var(--green-600)' : 'var(--red-500)', fontWeight: 600 }}>{trend} ({slope > 0 ? '+' : ''}{fmtM(slope)}/月)</span></div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={v => fmtM(v)} />
                <Legend />
                <Bar dataKey="實際" fill="#8B6914" radius={[4,4,0,0]} />
                <Bar dataKey="預測" fill="#0e7490" radius={[4,4,0,0]} opacity={0.6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* Store Comparison Mini */}
      {(() => {
        const storeNames = getTenantStoreNames();
        const storeColors = ['#0e7490', '#8B6914', '#C0392B', '#1A7A42', '#7C3AED', '#EA580C'];
        const storeRevs = storeNames.map(name =>
          filtered.rev.filter(r => r.store === name && getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount), 0)
        );
        const total = storeRevs.reduce((s, v) => s + v, 0) || 1;
        return (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>🏢 分店本月對比</h3></div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                {storeNames.map((name, i) => (
                  <div key={name} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: storeColors[i % storeColors.length], fontWeight: 600 }}>{name}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: storeColors[i % storeColors.length] }}>{fmtM(storeRevs[i])}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{(storeRevs[i]/total*100).toFixed(0)}%</div>
                  </div>
                ))}
              </div>
              <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', display: 'flex', background: 'var(--gray-100)' }}>
                {storeNames.map((name, i) => (
                  <div key={name} style={{ width: `${storeRevs[i]/total*100}%`, background: storeColors[i % storeColors.length], transition: 'width 0.5s' }} />
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Patient Funnel & Inventory Widget */}
      <div className="grid-2" style={{ marginTop: 16 }}>
        {/* Patient Funnel */}
        <div className="card">
          <div className="card-header"><h3>👥 病人漏斗</h3></div>
          {(() => {
            const pts = data.patients || [];
            const cons = data.consultations || [];
            const bks = data.bookings || [];
            const totalPatients = pts.length;
            const newThisMonth = pts.filter(p => (p.createdAt || '').substring(0, 7) === thisMonth).length;
            const activePatients = new Set(cons.filter(c => (c.date || '').substring(0, 7) === thisMonth).map(c => c.patientId || c.patientName)).size;
            const returning = cons.filter(c => {
              const prev = cons.filter(cc => cc.patientName === c.patientName && cc.date < c.date);
              return prev.length > 0 && (c.date || '').substring(0, 7) === thisMonth;
            });
            const returnRate = activePatients > 0 ? (returning.length / activePatients * 100).toFixed(0) : 0;
            const todayBk = bks.filter(b => b.date === new Date().toISOString().substring(0, 10) && b.status !== 'cancelled').length;
            const funnelData = [
              { label: '總病人數', value: totalPatients, color: 'var(--teal-600)', width: 100 },
              { label: '本月活躍', value: activePatients, color: 'var(--green-600)', width: activePatients / Math.max(totalPatients, 1) * 100 },
              { label: '本月新增', value: newThisMonth, color: 'var(--gold-600)', width: newThisMonth / Math.max(totalPatients, 1) * 100 },
              { label: '今日預約', value: todayBk, color: 'var(--red-500)', width: todayBk / Math.max(activePatients, 1) * 100 },
            ];
            return (
              <div style={{ padding: '8px 0' }}>
                {funnelData.map((f, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600 }}>{f.label}</span>
                      <span style={{ fontWeight: 800, color: f.color }}>{f.value}</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 4 }}>
                      <div style={{ width: `${Math.max(f.width, 3)}%`, height: '100%', background: f.color, borderRadius: 4, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--green-50)', borderRadius: 6, fontSize: 12 }}>
                  覆診率：<strong style={{ color: 'var(--green-700)' }}>{returnRate}%</strong>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Inventory Alert Widget */}
        <div className="card">
          <div className="card-header"><h3>💊 庫存警示</h3></div>
          {(() => {
            const inv = data.inventory || [];
            const lowStock = inv.filter(i => Number(i.stock) < Number(i.minStock));
            const today = new Date().toISOString().substring(0, 10);
            const in30 = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().substring(0, 10); })();
            const expired = inv.filter(i => i.expiryDate && i.expiryDate <= today);
            const expiring = inv.filter(i => i.expiryDate && i.expiryDate > today && i.expiryDate <= in30);
            const totalValue = inv.reduce((s, r) => s + Number(r.stock) * Number(r.costPerUnit), 0);
            return (
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div style={{ background: 'var(--gray-50)', padding: '10px 12px', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{inv.length}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>總品項</div>
                  </div>
                  <div style={{ background: 'var(--gray-50)', padding: '10px 12px', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-700)' }}>{fmtM(totalValue)}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>存貨總值</div>
                  </div>
                </div>
                {lowStock.length > 0 && (() => {
                  // Calculate usage rate from recent consultations
                  const cons = data.consultations || [];
                  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10);
                  const recentCons = cons.filter(c => c.date >= thirtyDaysAgo);
                  const herbUsage = {};
                  recentCons.forEach(c => {
                    (c.prescription || []).forEach(rx => {
                      if (rx.herb) {
                        const g = parseFloat(rx.dosage) || 10;
                        herbUsage[rx.herb] = (herbUsage[rx.herb] || 0) + g * (Number(c.formulaDays) || 1);
                      }
                    });
                  });
                  return (
                  <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-100)', padding: '8px 12px', borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
                    <strong style={{ color: 'var(--red-600)' }}>⚠️ {lowStock.length} 項低庫存</strong>
                    <div style={{ marginTop: 6 }}>
                      {lowStock.slice(0, 8).map(item => {
                        const monthlyUse = herbUsage[item.name] || 0;
                        const daysLeft = monthlyUse > 0 ? Math.round((Number(item.stock) / (monthlyUse / 30))) : 99;
                        const reorderQty = monthlyUse > 0 ? Math.ceil(monthlyUse * 2) : Number(item.minStock || 100) * 2;
                        return (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #fecaca' }}>
                            <div>
                              <span style={{ fontWeight: 600 }}>{item.name}</span>
                              <span style={{ color: '#dc2626', marginLeft: 6 }}>{Number(item.stock).toFixed(0)}g</span>
                              {daysLeft < 99 && <span style={{ color: '#d97706', marginLeft: 4, fontSize: 10 }}>({daysLeft}天用量)</span>}
                            </div>
                            <span style={{ fontSize: 10, padding: '1px 6px', background: '#fff', borderRadius: 3, color: '#0e7490', fontWeight: 600 }}>
                              建議補{reorderQty}g
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })()}
                {expired.length > 0 && (
                  <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-100)', padding: '8px 12px', borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
                    <strong style={{ color: '#dc2626' }}>🚫 {expired.length} 項已過期</strong>
                    <div style={{ marginTop: 4, color: 'var(--gray-600)' }}>{expired.slice(0, 3).map(i => `${i.name}(${i.expiryDate})`).join('、')}</div>
                  </div>
                )}
                {expiring.length > 0 && (
                  <div style={{ background: 'var(--gold-50)', border: '1px solid var(--gold-100)', padding: '8px 12px', borderRadius: 6, marginBottom: 6, fontSize: 12 }}>
                    <strong style={{ color: '#d97706' }}>⏰ {expiring.length} 項即將過期</strong>
                    <div style={{ marginTop: 4, color: 'var(--gray-600)' }}>{expiring.slice(0, 3).map(i => `${i.name}(${i.expiryDate})`).join('、')}</div>
                  </div>
                )}
                {lowStock.length === 0 && expired.length === 0 && expiring.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--green-600)', fontSize: 13 }}>✅ 庫存狀態良好</div>
                )}
                {onNavigate && <button className="btn btn-outline btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('inventory')}>查看庫存 →</button>}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Birthday Reminders */}
      {(() => {
        const pts = data.patients || [];
        const todayMD = new Date().toISOString().substring(5, 10);
        const next7 = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(); d.setDate(d.getDate() + i);
          return { date: d.toISOString().substring(0, 10), md: d.toISOString().substring(5, 10), dayLabel: i === 0 ? '今日' : i === 1 ? '明日' : `${i}日後` };
        });
        const birthdayList = next7.flatMap(day => pts.filter(p => p.dob && p.dob.substring(5) === day.md).map(p => ({ ...p, dayLabel: day.dayLabel, birthdayDate: day.date })));
        if (!birthdayList.length) return null;
        const sendBirthdayWA = (p) => {
          if (!p.phone) return;
          const msg = `${p.name}您好！${getClinicName()}祝您生日快樂！🎂 祝身體健康，萬事如意！`;
          openWhatsApp(p.phone, msg);
        };
        return (
          <div className="card" style={{ marginTop: 16, border: '1px solid var(--gold-200)', background: 'var(--gold-50)' }}>
            <div className="card-header"><h3>🎂 近期生日</h3></div>
            <div style={{ fontSize: 12 }}>
              {birthdayList.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: i < birthdayList.length - 1 ? '1px solid var(--gray-100)' : 'none', alignItems: 'center' }}>
                  <span className={`tag ${p.dayLabel === '今日' ? 'tag-overdue' : 'tag-pending-orange'}`} style={{ fontSize: 10 }}>{p.dayLabel}</span>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: 'var(--gray-400)' }}>{p.phone}</span>
                  <span style={{ color: 'var(--gray-400)', marginLeft: 'auto', fontSize: 11 }}>{p.dob}</span>
                  {p.phone && (
                    <button
                      onClick={() => sendBirthdayWA(p)}
                      style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >🎂 祝賀</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Follow-up Reminders Widget */}
      {(() => {
        const cons = data.consultations || [];
        const pts = data.patients || [];
        const todayStr = new Date().toISOString().substring(0, 10);
        const in7 = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().substring(0, 10); })();
        const overdueFollowUps = cons.filter(c => c.followUpDate && c.followUpDate < todayStr);
        const todayFollowUps = cons.filter(c => c.followUpDate === todayStr);
        const upcomingFollowUps = cons.filter(c => c.followUpDate > todayStr && c.followUpDate <= in7);
        const allFollowUps = [...todayFollowUps, ...overdueFollowUps, ...upcomingFollowUps.slice(0, 5)];
        if (!allFollowUps.length) return null;

        const getPhone = (name) => {
          const p = pts.find(pt => pt.name === name);
          return p?.phone || '';
        };
        const sendReminder = (c, type) => {
          const phone = getPhone(c.patientName);
          if (!phone) return;
          const clinicName = getClinicName();
          const msg = type === 'overdue'
            ? `${c.patientName}您好！${clinicName}提醒您，您原定於 ${c.followUpDate} 的覆診已逾期，請盡快致電預約覆診。祝身體健康！`
            : type === 'today'
            ? `${c.patientName}您好！${clinicName}提醒您，今日有覆診預約，醫師：${c.doctor || ''}。如需改期請提前聯繫。祝身體健康！`
            : `${c.patientName}您好！${clinicName}提醒您，您的覆診日期為 ${c.followUpDate}（${c.doctor || ''}）。如需改期請提前聯繫。祝身體健康！`;
          openWhatsApp(phone, msg);
        };
        const sendAll = (list, type) => {
          list.forEach(c => { const phone = getPhone(c.patientName); if (phone) sendReminder(c, type); });
        };

        const FollowUpRow = ({ c, type, bg }) => {
          const phone = getPhone(c.patientName);
          const typeLabels = { overdue: { text: '逾期', color: '#dc2626' }, today: { text: '今日', color: '#d97706' }, upcoming: { text: '即將', color: 'var(--teal-600)' } };
          const t = typeLabels[type];
          return (
            <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--gray-100)', alignItems: 'center', background: bg || '' }}>
              <span style={{ color: t.color, fontWeight: 700, fontSize: 10, minWidth: 36 }}>{t.text}</span>
              <span style={{ fontWeight: 600, minWidth: 60 }}>{c.patientName}</span>
              <span style={{ color: 'var(--gray-500)' }}>{c.followUpDate}</span>
              <span style={{ color: 'var(--gray-400)', flex: 1 }}>{c.doctor}</span>
              <span style={{ color: 'var(--gray-400)', fontSize: 11, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.followUpNotes || c.tcmDiagnosis || ''}</span>
              {phone && (
                <button
                  onClick={() => sendReminder(c, type)}
                  style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  title={`WhatsApp 提醒 ${c.patientName} (${phone})`}
                >📱 提醒</button>
              )}
              {!phone && <span style={{ fontSize: 10, color: 'var(--gray-300)' }}>無電話</span>}
            </div>
          );
        };

        return (
          <div className="card" style={{ marginTop: 16, border: todayFollowUps.length + overdueFollowUps.length > 0 ? '2px solid var(--gold-200)' : undefined }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>📋 覆診提醒</h3>
              <div style={{ display: 'flex', gap: 8, fontSize: 11, alignItems: 'center' }}>
                {overdueFollowUps.length > 0 && <span className="tag tag-overdue">{overdueFollowUps.length} 逾期</span>}
                {todayFollowUps.length > 0 && <span className="tag tag-pending-orange">{todayFollowUps.length} 今日</span>}
                {upcomingFollowUps.length > 0 && <span className="tag tag-paid">{upcomingFollowUps.length} 本週</span>}
                {(overdueFollowUps.length + todayFollowUps.length) > 1 && (
                  <button
                    className="btn btn-sm"
                    style={{ background: '#25D366', color: '#fff', border: 'none', fontSize: 10, padding: '3px 8px' }}
                    onClick={() => { sendAll(overdueFollowUps, 'overdue'); sendAll(todayFollowUps, 'today'); }}
                  >📱 全部提醒</button>
                )}
              </div>
            </div>
            <div style={{ fontSize: 12 }}>
              {overdueFollowUps.slice(0, 5).map((c, i) => <FollowUpRow key={'o' + i} c={c} type="overdue" />)}
              {todayFollowUps.map((c, i) => <FollowUpRow key={'t' + i} c={c} type="today" bg="var(--gold-50)" />)}
              {upcomingFollowUps.slice(0, 5).map((c, i) => <FollowUpRow key={'u' + i} c={c} type="upcoming" />)}
            </div>
            {onNavigate && <button className="btn btn-outline btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('emr')}>查看病歷 →</button>}
          </div>
        );
      })()}

      {/* ARAP & Queue Alerts */}
      <div className="grid-2" style={{ marginTop: 16 }}>
        {/* Today Queue Status */}
        <div className="card">
          <div className="card-header"><h3>🎫 今日排隊</h3></div>
          {(() => {
            const queue = data.queue || [];
            const todayStr = new Date().toISOString().substring(0, 10);
            const todayQ = queue.filter(q => q.date === todayStr);
            const waiting = todayQ.filter(q => q.status === 'waiting').length;
            const inConsult = todayQ.filter(q => q.status === 'in-consultation').length;
            const dispensing = todayQ.filter(q => q.status === 'dispensing').length;
            const completed = todayQ.filter(q => q.status === 'completed').length;
            return (
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                  <div style={{ textAlign: 'center', padding: 8, background: 'var(--gold-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold-700)' }}>{waiting}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>等候中</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 8, background: 'var(--teal-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal-700)' }}>{inConsult}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>診症中</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 8, background: 'var(--gray-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-600)' }}>{dispensing}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>配藥中</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 8, background: 'var(--green-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green-700)' }}>{completed}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>已完成</div>
                  </div>
                </div>
                {todayQ.filter(q => q.status === 'waiting').slice(0, 5).map(q => (
                  <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--gray-100)', fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: 'var(--teal-700)' }}>{q.queueNo}</span>
                    <span>{q.patientName}</span>
                    <span style={{ color: 'var(--gray-400)' }}>{q.doctor}</span>
                    <span style={{ color: 'var(--gray-400)' }}>{q.registeredAt}</span>
                  </div>
                ))}
                {todayQ.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: 'var(--gray-400)', fontSize: 12 }}>暫無排隊</div>}
                {onNavigate && <button className="btn btn-outline btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('queue')}>管理排隊 →</button>}
              </div>
            );
          })()}
        </div>

        {/* ARAP Alerts */}
        <div className="card">
          <div className="card-header"><h3>📑 應收應付提醒</h3></div>
          {(() => {
            const arap = data.arap || [];
            const todayStr = new Date().toISOString().substring(0, 10);
            const pendingAR = arap.filter(r => r.type === 'receivable' && r.status !== '已收');
            const pendingAP = arap.filter(r => r.type === 'payable' && r.status !== '已付');
            const overdueAR = pendingAR.filter(r => r.dueDate && r.dueDate < todayStr);
            const overdueAP = pendingAP.filter(r => r.dueDate && r.dueDate < todayStr);
            const totalAR = pendingAR.reduce((s, r) => s + Number(r.amount), 0);
            const totalAP = pendingAP.reduce((s, r) => s + Number(r.amount), 0);
            return (
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div style={{ padding: 10, background: 'var(--teal-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>待收</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal-700)' }}>{fmtM(totalAR)}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>{pendingAR.length} 筆</div>
                  </div>
                  <div style={{ padding: 10, background: 'var(--red-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>待付</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--red-600)' }}>{fmtM(totalAP)}</div>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>{pendingAP.length} 筆</div>
                  </div>
                </div>
                {(overdueAR.length > 0 || overdueAP.length > 0) && (
                  <div style={{ padding: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
                    <strong style={{ color: '#dc2626' }}>⚠️ 逾期</strong>
                    {overdueAR.length > 0 && <div style={{ color: '#991b1b' }}>應收 {overdueAR.length} 筆 ({fmtM(overdueAR.reduce((s, r) => s + Number(r.amount), 0))})</div>}
                    {overdueAP.length > 0 && <div style={{ color: '#991b1b' }}>應付 {overdueAP.length} 筆 ({fmtM(overdueAP.reduce((s, r) => s + Number(r.amount), 0))})</div>}
                  </div>
                )}
                {pendingAR.length === 0 && pendingAP.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: 'var(--green-600)', fontSize: 13 }}>✅ 無待處理帳項</div>}
                {onNavigate && <button className="btn btn-outline btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('arap')}>查看帳項 →</button>}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Today's Schedule */}
      {(() => {
        const bks = data.bookings || [];
        const todayStr = new Date().toISOString().substring(0, 10);
        const todayBks = bks.filter(b => b.date === todayStr && b.status !== 'cancelled').sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        if (!todayBks.length) return null;
        return (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header"><h3>📅 今日預約 ({todayBks.length})</h3></div>
            <div style={{ fontSize: 12, maxHeight: 250, overflowY: 'auto' }}>
              {todayBks.map(b => (
                <div key={b.id} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--gray-100)', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, minWidth: 42, color: 'var(--teal-700)' }}>{b.time}</span>
                  <span style={{ fontWeight: 600, minWidth: 60 }}>{b.patientName}</span>
                  <span style={{ color: 'var(--gray-400)' }}>{b.doctor}</span>
                  <span style={{ color: 'var(--gray-400)' }}>{b.store}</span>
                  <span className={`tag ${b.status === 'completed' ? 'tag-paid' : b.status === 'confirmed' ? 'tag-fps' : b.status === 'no-show' ? 'tag-overdue' : 'tag-pending-orange'}`} style={{ fontSize: 10 }}>
                    {b.status === 'completed' ? '已完成' : b.status === 'confirmed' ? '已確認' : b.status === 'no-show' ? '未到' : '待確認'}
                  </span>
                </div>
              ))}
            </div>
            {onNavigate && <button className="btn btn-outline btn-sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('booking')}>管理預約 →</button>}
          </div>
        );
      })()}

      {/* Recent Activity */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3>🕐 近期活動</h3></div>
        <div style={{ fontSize: 13 }}>
          {recentActivity.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < recentActivity.length - 1 ? '1px solid var(--gray-100)' : 'none', alignItems: 'center' }}>
              <span style={{ fontSize: 16 }}>{a.type}</span>
              <span style={{ flex: 1 }}>{a.label}</span>
              <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>{a.date}</span>
            </div>
          ))}
          {recentActivity.length === 0 && <div style={{ color: 'var(--gray-400)', textAlign: 'center', padding: 16 }}>暫無活動紀錄</div>}
        </div>
      </div>
    </>
  );
}
