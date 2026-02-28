import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { EXPENSE_CATEGORIES, fmtM } from '../data';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const A = '#0e7490';
const ALL_CATS = Object.values(EXPENSE_CATEGORIES).flat();
const LS = {
  config: 'hcmc_tg_expense_config',
  pending: 'hcmc_tg_expense_pending',
  history: 'hcmc_tg_expense_history',
  rules: 'hcmc_tg_expense_rules',
};
const load = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) || fb; } catch { return fb; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const btn = (bg = A, color = '#fff') => ({
  padding: '7px 16px', background: bg, color, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
});
const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,.08)' };
const label = { fontSize: 12, color: '#666', marginBottom: 4, display: 'block' };
const inp = { width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };

export default function TelegramExpense({ data, setData, showToast, user }) {
  const clinic = getClinicName();
  const [tab, setTab] = useState('setup');
  const [config, setConfig] = useState(() => load(LS.config, { token: '', chatId: '', autoReport: false, webhookUrl: '' }));
  const [pending, setPending] = useState(() => load(LS.pending, []));
  const [history, setHistory] = useState(() => load(LS.history, []));
  const [rules, setRules] = useState(() => load(LS.rules, { patterns: [], threshold: 85 }));
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [simForm, setSimForm] = useState({ amount: '', vendor: '', date: new Date().toISOString().split('T')[0], category: ALL_CATS[0] });
  const [ruleForm, setRuleForm] = useState({ pattern: '', category: ALL_CATS[0] });
  const [histFilter, setHistFilter] = useState({ status: '', category: '', from: '', to: '' });

  const webhookUrl = useMemo(() => {
    try { return `${window.location.origin}/api/telegram-expense-webhook`; } catch { return ''; }
  }, []);

  // ── Config ──
  const saveConfig = (patch) => {
    const c = { ...config, ...patch };
    setConfig(c);
    save(LS.config, c);
  };

  const testConnection = () => {
    if (!config.token) return showToast('請先填寫 Bot Token');
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      showToast('Bot 連線成功 (模擬)');
    }, 1200);
  };

  // ── Pending ──
  const savePending = (list) => { setPending(list); save(LS.pending, list); };
  const saveHistory = (list) => { setHistory(list); save(LS.history, list); };
  const saveRules = (r) => { setRules(r); save(LS.rules, r); };

  const autoCategory = (vendor) => {
    for (const r of rules.patterns) {
      if (vendor && vendor.includes(r.pattern)) return r.category;
    }
    return ALL_CATS[0];
  };

  const confirmItem = (item) => {
    const rec = {
      id: uid(), date: item.date, merchant: item.vendor, amount: parseFloat(item.amount),
      category: item.category, store: '', payment: '其他', desc: `Telegram收據 (${item.vendor})`, receipt: item.thumbnail || '',
    };
    setData(prev => ({ ...prev, expenses: [...prev.expenses, rec] }));
    const h = { ...item, status: 'confirmed', processedAt: new Date().toISOString(), processedBy: user?.name || 'system' };
    const newPending = pending.filter(p => p.id !== item.id);
    savePending(newPending);
    saveHistory([h, ...history]);
    showToast(`已確認開支 ${fmtM(parseFloat(item.amount))}`);
  };

  const rejectItem = (item) => {
    const h = { ...item, status: 'rejected', processedAt: new Date().toISOString(), processedBy: user?.name || 'system' };
    const newPending = pending.filter(p => p.id !== item.id);
    savePending(newPending);
    saveHistory([h, ...history]);
    showToast('已拒絕該收據');
  };

  const batchConfirm = () => {
    if (!selected.size) return showToast('請先勾選項目');
    const items = pending.filter(p => selected.has(p.id));
    items.forEach(item => {
      const rec = {
        id: uid(), date: item.date, merchant: item.vendor, amount: parseFloat(item.amount),
        category: item.category, store: '', payment: '其他', desc: `Telegram收據 (${item.vendor})`, receipt: item.thumbnail || '',
      };
      setData(prev => ({ ...prev, expenses: [...prev.expenses, rec] }));
    });
    const confirmed = items.map(i => ({ ...i, status: 'confirmed', processedAt: new Date().toISOString(), processedBy: user?.name || 'system' }));
    const newPending = pending.filter(p => !selected.has(p.id));
    savePending(newPending);
    saveHistory([...confirmed, ...history]);
    setSelected(new Set());
    showToast(`已批量確認 ${items.length} 筆開支`);
  };

  const startEdit = (item) => { setEditId(item.id); setEditForm({ amount: item.amount, vendor: item.vendor, date: item.date, category: item.category }); };
  const saveEdit = () => {
    const updated = pending.map(p => p.id === editId ? { ...p, ...editForm } : p);
    savePending(updated);
    setEditId(null);
    showToast('已更新');
  };

  // ── Simulation ──
  const simulateUpload = () => {
    if (!simForm.amount || !simForm.vendor) return showToast('請填寫金額和商戶');
    const confidence = Math.floor(Math.random() * 25 + 70);
    const item = {
      id: uid(), amount: simForm.amount, vendor: simForm.vendor, date: simForm.date,
      category: autoCategory(simForm.vendor) || simForm.category,
      confidence, thumbnail: '', uploadedAt: new Date().toISOString(), source: 'simulation',
    };
    if (confidence >= rules.threshold) {
      const rec = {
        id: uid(), date: item.date, merchant: item.vendor, amount: parseFloat(item.amount),
        category: item.category, store: '', payment: '其他', desc: `Telegram自動確認 (${item.vendor})`, receipt: '',
      };
      setData(prev => ({ ...prev, expenses: [...prev.expenses, rec] }));
      saveHistory([{ ...item, status: 'auto-confirmed', processedAt: new Date().toISOString(), processedBy: 'auto' }, ...history]);
      showToast(`信心度 ${confidence}% >= ${rules.threshold}%，已自動確認`);
    } else {
      savePending([item, ...pending]);
      showToast(`信心度 ${confidence}%，需人工審核`);
    }
    setSimForm({ amount: '', vendor: '', date: new Date().toISOString().split('T')[0], category: ALL_CATS[0] });
  };

  // ── Rules ──
  const addRule = () => {
    if (!ruleForm.pattern) return showToast('請填寫關鍵字');
    const updated = { ...rules, patterns: [...rules.patterns.filter(r => r.pattern !== ruleForm.pattern), { pattern: ruleForm.pattern, category: ruleForm.category }] };
    saveRules(updated);
    setRuleForm({ pattern: '', category: ALL_CATS[0] });
    showToast('規則已新增');
  };
  const delRule = (pattern) => { saveRules({ ...rules, patterns: rules.patterns.filter(r => r.pattern !== pattern) }); };

  // ── History filter ──
  const filteredHistory = useMemo(() => {
    let h = [...history];
    if (histFilter.status) h = h.filter(i => i.status === histFilter.status);
    if (histFilter.category) h = h.filter(i => i.category === histFilter.category);
    if (histFilter.from) h = h.filter(i => i.date >= histFilter.from);
    if (histFilter.to) h = h.filter(i => i.date <= histFilter.to);
    return h;
  }, [history, histFilter]);

  const histStats = useMemo(() => {
    const total = history.length;
    const auto = history.filter(i => i.status === 'auto-confirmed').length;
    const confirmed = history.filter(i => i.status === 'confirmed').length;
    const rejected = history.filter(i => i.status === 'rejected').length;
    return { total, auto, confirmed, rejected, autoRate: total ? Math.round(auto / total * 100) : 0 };
  }, [history]);

  // ── Monthly Report ──
  const generateReport = () => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthExpenses = (data.expenses || []).filter(e => e.date && e.date.startsWith(ym));
    const monthRevenue = (data.revenue || []).filter(r => r.date && r.date.startsWith(ym));
    const totalExp = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalRev = monthRevenue.reduce((s, r) => s + Number(r.amount || r.total || 0), 0);
    const net = totalRev - totalExp;
    const catBreak = {};
    monthExpenses.forEach(e => { catBreak[e.category] = (catBreak[e.category] || 0) + Number(e.amount || 0); });
    const topCats = Object.entries(catBreak).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${clinic} 月度報表</title>
      <style>body{font-family:sans-serif;padding:30px;max-width:700px;margin:auto}h1{color:${A}}
      table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:${A};color:#fff}.total{font-size:22px;font-weight:700;color:${A}}
      .neg{color:#dc2626}.pos{color:#16a34a}</style></head>
      <body><h1>${clinic} - ${ym} 月度損益摘要</h1>
      <p>報表生成時間：${now.toLocaleString('zh-HK')}</p>
      <table><tr><td>總收入</td><td class="total pos">${fmtM(totalRev)}</td></tr>
      <tr><td>總支出</td><td class="total neg">${fmtM(totalExp)}</td></tr>
      <tr><td>淨利潤</td><td class="total ${net >= 0 ? 'pos' : 'neg'}">${fmtM(net)}</td></tr></table>
      <h2>支出分類排行</h2><table><tr><th>分類</th><th>金額</th></tr>
      ${topCats.map(([c, v]) => `<tr><td>${c}</td><td>${fmtM(v)}</td></tr>`).join('')}
      ${!topCats.length ? '<tr><td colspan="2">本月暫無開支記錄</td></tr>' : ''}
      </table><p style="color:#888;font-size:12px;margin-top:30px">此報表由 Telegram Expense Bot 自動生成</p></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  // ── Tabs ──
  const tabs = [
    { key: 'setup', label: '機器人設定' },
    { key: 'pending', label: `待審核 (${pending.length})` },
    { key: 'history', label: '歷史記錄' },
    { key: 'rules', label: '自動規則' },
    { key: 'report', label: '月度報表' },
    { key: 'simulate', label: '模擬上傳' },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ color: A, margin: '0 0 4px' }}>Telegram 開支機器人</h2>
      <p style={{ color: '#888', fontSize: 13, margin: '0 0 16px' }}>透過 Telegram 拍照上傳收據，自動建立開支記錄</p>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            ...btn(tab === t.key ? A : '#f1f5f9', tab === t.key ? '#fff' : '#334155'),
            borderRadius: 20, fontSize: 12, padding: '6px 14px',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ═══ Setup Tab ═══ */}
      {tab === 'setup' && (
        <div>
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#334155' }}>Bot Token</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input style={{ ...inp, flex: 1 }} type={showToken ? 'text' : 'password'} placeholder="貼上 BotFather 提供的 Token"
                value={config.token} onChange={e => saveConfig({ token: e.target.value })} />
              <button style={btn('#e2e8f0', '#334155')} onClick={() => setShowToken(!showToken)}>
                {showToken ? '隱藏' : '顯示'}
              </button>
            </div>
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#334155' }}>Chat ID (報表接收)</h3>
            <input style={inp} placeholder="Telegram Chat ID（用於發送月度報表）"
              value={config.chatId} onChange={e => saveConfig({ chatId: e.target.value })} />
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#334155' }}>Webhook URL</h3>
            <div style={{ ...inp, background: '#f8fafc', color: '#64748b', wordBreak: 'break-all' }}>{webhookUrl}</div>
            <button style={{ ...btn('#e2e8f0', '#334155'), marginTop: 8, fontSize: 12 }}
              onClick={() => { navigator.clipboard?.writeText(webhookUrl); showToast('已複製'); }}>複製 URL</button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button style={btn()} onClick={testConnection} disabled={testing}>
              {testing ? '測試中...' : '測試連線'}
            </button>
          </div>

          <div style={{ ...card, background: '#f0fdfa' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14, color: A }}>設定說明</h3>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#475569', lineHeight: 2 }}>
              <li>在 Telegram 搜尋 <b>@BotFather</b>，輸入 /newbot 建立新機器人</li>
              <li>複製取得的 Bot Token 並貼上</li>
              <li>將 Webhook URL 設定至 Telegram Bot API</li>
              <li>在 Telegram 發送 /start 給你的機器人取得 Chat ID</li>
              <li>拍照或傳送收據圖片給機器人，系統將自動 OCR 識別</li>
              <li>識別結果會出現在「待審核」分頁，確認後自動建立開支記錄</li>
            </ol>
          </div>
        </div>
      )}

      {/* ═══ Pending Tab ═══ */}
      {tab === 'pending' && (
        <div>
          {pending.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <label style={{ fontSize: 13 }}>
                <input type="checkbox" checked={selected.size === pending.length && pending.length > 0}
                  onChange={() => setSelected(selected.size === pending.length ? new Set() : new Set(pending.map(p => p.id)))} />
                {' '}全選
              </label>
              <button style={btn()} onClick={batchConfirm}>批量確認 ({selected.size})</button>
            </div>
          )}

          {!pending.length && (
            <div style={{ ...card, textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>&#x2705;</div>
              <p>暫無待審核收據</p>
              <p style={{ fontSize: 12 }}>透過 Telegram 發送收據圖片，或使用「模擬上傳」測試流程</p>
            </div>
          )}

          {pending.map(item => (
            <div key={item.id} style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={selected.has(item.id)}
                onChange={() => { const s = new Set(selected); s.has(item.id) ? s.delete(item.id) : s.add(item.id); setSelected(s); }}
                style={{ marginTop: 4 }} />
              <div style={{ width: 64, height: 64, background: '#f1f5f9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                {item.thumbnail ? <img src={item.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 28 }}>&#x1F4C4;</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {editId === item.id ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div><span style={label}>金額</span><input style={inp} value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} /></div>
                    <div><span style={label}>商戶</span><input style={inp} value={editForm.vendor} onChange={e => setEditForm({ ...editForm, vendor: e.target.value })} /></div>
                    <div><span style={label}>日期</span><input style={inp} type="date" value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })} /></div>
                    <div><span style={label}>分類</span>
                      <select style={inp} value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}>
                        {ALL_CATS.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: '1/3', display: 'flex', gap: 6, marginTop: 4 }}>
                      <button style={btn()} onClick={saveEdit}>儲存</button>
                      <button style={btn('#e2e8f0', '#334155')} onClick={() => setEditId(null)}>取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b style={{ fontSize: 15, color: '#0f172a' }}>{fmtM(parseFloat(item.amount || 0))}</b>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 10,
                        background: item.confidence >= 85 ? '#dcfce7' : item.confidence >= 70 ? '#fef9c3' : '#fee2e2',
                        color: item.confidence >= 85 ? '#16a34a' : item.confidence >= 70 ? '#ca8a04' : '#dc2626',
                      }}>信心度 {item.confidence}%</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{item.vendor} | {item.date} | {item.category}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button style={btn()} onClick={() => confirmItem(item)}>確認</button>
                      <button style={btn('#f1f5f9', '#334155')} onClick={() => startEdit(item)}>編輯</button>
                      <button style={btn('#fee2e2', '#dc2626')} onClick={() => rejectItem(item)}>拒絕</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ History Tab ═══ */}
      {tab === 'history' && (
        <div>
          <div style={{ ...card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <span style={label}>狀態</span>
              <select style={inp} value={histFilter.status} onChange={e => setHistFilter({ ...histFilter, status: e.target.value })}>
                <option value="">全部</option>
                <option value="confirmed">已確認</option>
                <option value="auto-confirmed">自動確認</option>
                <option value="rejected">已拒絕</option>
              </select>
            </div>
            <div>
              <span style={label}>分類</span>
              <select style={inp} value={histFilter.category} onChange={e => setHistFilter({ ...histFilter, category: e.target.value })}>
                <option value="">全部</option>
                {ALL_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>從</span>
              <input type="date" style={inp} value={histFilter.from} onChange={e => setHistFilter({ ...histFilter, from: e.target.value })} />
            </div>
            <div>
              <span style={label}>至</span>
              <input type="date" style={inp} value={histFilter.to} onChange={e => setHistFilter({ ...histFilter, to: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8, marginBottom: 12 }}>
            {[
              { label: '總處理', val: histStats.total, color: A },
              { label: '已確認', val: histStats.confirmed, color: '#16a34a' },
              { label: '自動確認', val: histStats.auto, color: '#0284c7' },
              { label: '已拒絕', val: histStats.rejected, color: '#dc2626' },
              { label: '自動確認率', val: `${histStats.autoRate}%`, color: '#7c3aed' },
            ].map(s => (
              <div key={s.label} style={{ ...card, textAlign: 'center', padding: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {!filteredHistory.length && <div style={{ ...card, textAlign: 'center', color: '#94a3b8', padding: 30 }}>暫無記錄</div>}
          {filteredHistory.map(item => (
            <div key={item.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
              <div>
                <b style={{ fontSize: 14 }}>{item.vendor}</b>
                <div style={{ fontSize: 12, color: '#64748b' }}>{item.date} | {item.category} | 信心度 {item.confidence}%</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{fmtM(parseFloat(item.amount || 0))}</div>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 10,
                  background: item.status === 'confirmed' ? '#dcfce7' : item.status === 'auto-confirmed' ? '#dbeafe' : '#fee2e2',
                  color: item.status === 'confirmed' ? '#16a34a' : item.status === 'auto-confirmed' ? '#0284c7' : '#dc2626',
                }}>
                  {item.status === 'confirmed' ? '已確認' : item.status === 'auto-confirmed' ? '自動確認' : '已拒絕'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Rules Tab ═══ */}
      {tab === 'rules' && (
        <div>
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#334155' }}>自動分類規則</h3>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>當商戶名稱包含指定關鍵字時，自動歸類至對應分類</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input style={{ ...inp, flex: 1, minWidth: 120 }} placeholder="關鍵字（如：中藥、電費、MTR）"
                value={ruleForm.pattern} onChange={e => setRuleForm({ ...ruleForm, pattern: e.target.value })} />
              <select style={{ ...inp, width: 'auto' }} value={ruleForm.category} onChange={e => setRuleForm({ ...ruleForm, category: e.target.value })}>
                {ALL_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
              <button style={btn()} onClick={addRule}>新增規則</button>
            </div>
            {!rules.patterns.length && <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 16 }}>暫無規則，建議新增常用分類規則</div>}
            {rules.patterns.map(r => (
              <div key={r.pattern} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <span style={{ background: '#f0fdfa', color: A, padding: '2px 8px', borderRadius: 4, fontSize: 13, fontWeight: 600 }}>{r.pattern}</span>
                  <span style={{ color: '#64748b', margin: '0 8px' }}>&#x2192;</span>
                  <span style={{ fontSize: 13, color: '#334155' }}>{r.category}</span>
                </div>
                <button style={{ ...btn('#fee2e2', '#dc2626'), padding: '4px 10px', fontSize: 11 }} onClick={() => delRule(r.pattern)}>刪除</button>
              </div>
            ))}
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#334155' }}>自動確認門檻</h3>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>OCR 信心度達到此百分比以上時，自動確認無需人工審核</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min="50" max="100" value={rules.threshold}
                onChange={e => saveRules({ ...rules, threshold: Number(e.target.value) })}
                style={{ flex: 1 }} />
              <span style={{ fontSize: 18, fontWeight: 700, color: A, minWidth: 50 }}>{rules.threshold}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              <span>50% (較寬鬆)</span><span>100% (全部人工)</span>
            </div>
          </div>

          <div style={{ ...card, background: '#fffbeb' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#92400e' }}>建議規則</h4>
            <div style={{ fontSize: 12, color: '#78716c', lineHeight: 1.8 }}>
              「中藥」/ 「藥材」 → 藥材/耗材<br />
              「電費」/ 「CLP」 → 電費<br />
              「水費」 → 水費<br />
              「MTR」/ 「巴士」 → 交通<br />
              「文具」/ 「影印」 → 文具/印刷<br />
              「清潔」 → 清潔
            </div>
          </div>
        </div>
      )}

      {/* ═══ Report Tab ═══ */}
      {tab === 'report' && (
        <div>
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#334155' }}>月度報表設定</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={config.autoReport} onChange={e => saveConfig({ autoReport: e.target.checked })} />
              每月 1 號自動發送損益摘要至 Telegram
            </label>
            {config.autoReport && !config.chatId && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f2', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>
                請先在「機器人設定」填寫 Chat ID 以接收報表
              </div>
            )}
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#334155' }}>報表內容預覽</h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px' }}>報表包含以下內容：</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
              <li>本月總收入</li>
              <li>本月總支出</li>
              <li>淨利潤（收入 - 支出）</li>
              <li>支出分類排行（前5名）</li>
            </ul>
            <button style={{ ...btn(), marginTop: 12 }} onClick={generateReport}>預覽本月報表</button>
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#334155' }}>報表發送記錄</h3>
            <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: 16 }}>
              暫無發送記錄（啟用自動發送後，記錄將顯示於此）
            </div>
          </div>
        </div>
      )}

      {/* ═══ Simulate Tab ═══ */}
      {tab === 'simulate' && (
        <div>
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#334155' }}>模擬收據上傳</h3>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>模擬 Telegram Bot 接收收據並 OCR 識別的流程。填寫以下資料如同 OCR 提取的結果。</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <span style={label}>金額 *</span>
                <input style={inp} type="number" placeholder="例：150" value={simForm.amount}
                  onChange={e => setSimForm({ ...simForm, amount: e.target.value })} />
              </div>
              <div>
                <span style={label}>商戶 *</span>
                <input style={inp} placeholder="例：百草堂中藥行" value={simForm.vendor}
                  onChange={e => setSimForm({ ...simForm, vendor: e.target.value })} />
              </div>
              <div>
                <span style={label}>日期</span>
                <input style={inp} type="date" value={simForm.date}
                  onChange={e => setSimForm({ ...simForm, date: e.target.value })} />
              </div>
              <div>
                <span style={label}>分類</span>
                <select style={inp} value={simForm.category}
                  onChange={e => setSimForm({ ...simForm, category: e.target.value })}>
                  {ALL_CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <button style={btn()} onClick={simulateUpload}>模擬上傳</button>
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 12 }}>系統將隨機分配信心度並根據門檻自動/待審</span>
          </div>

          <div style={{ ...card, background: '#f0f9ff' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#0369a1' }}>流程說明</h4>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#475569', lineHeight: 1.8 }}>
              <li>使用者透過 Telegram 發送收據圖片給機器人</li>
              <li>後端進行 OCR 識別，提取金額、商戶、日期</li>
              <li>系統根據自動規則匹配分類，計算信心度</li>
              <li>信心度 &ge; 門檻值：自動確認，直接建立開支記錄</li>
              <li>信心度 &lt; 門檻值：加入「待審核」列表，等待人工確認</li>
              <li>確認後的記錄會自動加入開支系統</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
