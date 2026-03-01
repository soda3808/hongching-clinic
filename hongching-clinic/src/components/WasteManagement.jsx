import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_LOG = 'hcmc_waste_log';
const LS_CON = 'hcmc_waste_contractors';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const today = () => new Date().toISOString().substring(0, 10);
const month = () => today().substring(0, 7);
const load = k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const CATS = ['一般廢物', '利器廢物', '化學廢物', '藥物廢物', '感染性廢物'];
const METHODS = ['焚化處理', '高溫消毒', '化學消毒', '安全填埋', '回收處理'];
const CAT_COLORS = { '一般廢物': '#6b7280', '利器廢物': '#dc2626', '化學廢物': '#f59e0b', '藥物廢物': '#8b5cf6', '感染性廢物': '#ef4444' };
const ACCENT = '#0e7490';

const S = {
  page: { padding: 16, fontFamily: "'Microsoft YaHei',sans-serif", maxWidth: 1100, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, color: ACCENT, margin: '0 0 12px' },
  tabs: { display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 },
  tab: a => ({ padding: '8px 18px', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? ACCENT : '#666', borderBottom: a ? `2px solid ${ACCENT}` : '2px solid transparent', marginBottom: -2, background: 'none', border: 'none', fontSize: 14 }),
  card: { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  label: { fontSize: 12, color: '#555', marginBottom: 2 },
  input: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: 120 },
  select: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' },
  btn: (c = ACCENT) => ({ padding: '7px 16px', background: c, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  btnSm: (c = ACCENT) => ({ padding: '4px 10px', background: c, color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }),
  th: { padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, borderBottom: '2px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' },
  td: { padding: '6px', fontSize: 13, borderBottom: '1px solid #f0f0f0' },
  stat: bg => ({ padding: '10px 16px', borderRadius: 8, background: bg, flex: '1 1 140px', minWidth: 130 }),
  badge: c => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: '#fff', background: c }),
};

const BLANK_LOG = { date: today(), category: CATS[0], weight: '', containerId: '', method: METHODS[0], handler: '' };
const BLANK_CON = { name: '', license: '', contractStart: today(), contractEnd: '', contact: '', phone: '' };
const CHECKLIST_ITEMS = ['廢物標籤正確', '容器密封完好', '儲存區域清潔', '收集準時完成', '記錄文件完整', '防護裝備齊全'];

export default function WasteManagement({ showToast, user }) {
  const [tab, setTab] = useState('log');
  const [logs, setLogs] = useState(() => load(LS_LOG));
  const [contractors, setContractors] = useState(() => load(LS_CON));
  const [form, setForm] = useState({ ...BLANK_LOG });
  const [conForm, setConForm] = useState({ ...BLANK_CON });
  const [editId, setEditId] = useState(null);
  const [filterMonth, setFilterMonth] = useState(month());
  const [checks, setChecks] = useState({});
  const [checkMonth, setCheckMonth] = useState(month());

  const filtered = useMemo(() => logs.filter(l => l.date?.startsWith(filterMonth)), [logs, filterMonth]);

  const stats = useMemo(() => {
    const byCat = {};
    CATS.forEach(c => { byCat[c] = 0; });
    let total = 0;
    filtered.forEach(l => { const w = Number(l.weight) || 0; byCat[l.category] = (byCat[l.category] || 0) + w; total += w; });
    return { byCat, total, count: filtered.length };
  }, [filtered]);

  const saveLog = arr => { setLogs(arr); save(LS_LOG, arr); };
  const saveCon = arr => { setContractors(arr); save(LS_CON, arr); };

  const handleAddLog = () => {
    if (!form.weight || !form.handler) return showToast('請填寫重量及處理人');
    if (editId) {
      saveLog(logs.map(l => l.id === editId ? { ...l, ...form } : l));
      showToast('記錄已更新'); setEditId(null);
    } else {
      saveLog([{ id: uid(), ...form, createdBy: user?.name || '未知', createdAt: new Date().toISOString() }, ...logs]);
      showToast('棄置記錄已新增');
    }
    setForm({ ...BLANK_LOG });
  };

  const handleDeleteLog = id => { saveLog(logs.filter(l => l.id !== id)); showToast('記錄已刪除'); };

  const handleAddCon = () => {
    if (!conForm.name || !conForm.license) return showToast('請填寫承辦商名稱及牌照號碼');
    saveCon([{ id: uid(), ...conForm }, ...contractors]);
    setConForm({ ...BLANK_CON }); showToast('承辦商已新增');
  };

  const handleDeleteCon = id => { saveCon(contractors.filter(c => c.id !== id)); showToast('承辦商已刪除'); };

  const handleSaveChecklist = () => {
    const rec = { id: uid(), month: checkMonth, checks: { ...checks }, user: user?.name || '未知', date: today() };
    const existing = logs.find(l => l.type === 'checklist' && l.month === checkMonth);
    if (existing) {
      saveLog(logs.map(l => l.id === existing.id ? { ...l, checks: rec.checks, user: rec.user, date: rec.date } : l));
    } else {
      saveLog([{ ...rec, type: 'checklist' }, ...logs]);
    }
    showToast('合規檢查已保存'); setChecks({});
  };

  const printReport = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const clinic = getClinicName();
    const rows = filtered.filter(l => !l.type).map(l =>
      `<tr><td>${l.date}</td><td><span style="color:${CAT_COLORS[l.category] || '#333'};font-weight:600">${escapeHtml(l.category)}</span></td><td style="text-align:right">${l.weight} kg</td><td>${escapeHtml(l.containerId || '-')}</td><td>${escapeHtml(l.method)}</td><td>${escapeHtml(l.handler)}</td></tr>`
    ).join('');
    const catRows = CATS.map(c => `<tr><td>${escapeHtml(c)}</td><td style="text-align:right;font-weight:700">${(stats.byCat[c] || 0).toFixed(1)} kg</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>醫療廢物報表</title><style>body{font-family:'Microsoft YaHei',sans-serif;padding:20px;max-width:800px;margin:0 auto}h1{color:${ACCENT};font-size:18px;border-bottom:2px solid ${ACCENT};padding-bottom:8px}h2{font-size:14px;color:#333;margin:18px 0 6px}table{width:100%;border-collapse:collapse;margin-bottom:16px}th,td{padding:6px 8px;border-bottom:1px solid #eee;font-size:12px}th{background:#f8f8f8;text-align:left;font-weight:700}.footer{text-align:center;font-size:10px;color:#aaa;margin-top:20px}@media print{body{padding:10px}}</style></head><body><h1>${escapeHtml(clinic)} — 醫療廢物月報</h1><p style="font-size:12px;color:#666">月份: ${filterMonth} | 總記錄: ${stats.count} | 總重量: ${stats.total.toFixed(1)} kg</p><h2>分類統計</h2><table><thead><tr><th>類別</th><th style="text-align:right">重量</th></tr></thead><tbody>${catRows}</tbody></table><h2>棄置明細</h2><table><thead><tr><th>日期</th><th>類別</th><th style="text-align:right">重量</th><th>容器編號</th><th>處理方式</th><th>處理人</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">列印時間: ${new Date().toLocaleString('zh-HK')}</div></body></html>`);
    w.document.close(); w.print();
  };

  const TABS = [['log', '棄置記錄'], ['stats', '統計'], ['checklist', '合規檢查'], ['contractor', '承辦商']];

  return (
    <div style={S.page}>
      <h1 style={S.h1}>醫療廢物管理</h1>
      <div style={S.tabs}>{TABS.map(([k, v]) => <button key={k} style={S.tab(tab === k)} onClick={() => setTab(k)}>{v}</button>)}</div>

      {tab === 'log' && <>
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#333' }}>{editId ? '編輯記錄' : '新增棄置記錄'}</div>
          <div style={S.row}>
            <div><div style={S.label}>日期</div><input type="date" style={S.input} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div><div style={S.label}>類別</div><select style={S.select} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><div style={S.label}>重量 (kg)</div><input type="number" min="0" step="0.1" style={S.input} placeholder="0.0" value={form.weight} onChange={e => setForm(p => ({ ...p, weight: e.target.value }))} /></div>
            <div><div style={S.label}>容器編號</div><input style={S.input} placeholder="W-001" value={form.containerId} onChange={e => setForm(p => ({ ...p, containerId: e.target.value }))} /></div>
            <div><div style={S.label}>處理方式</div><select style={S.select} value={form.method} onChange={e => setForm(p => ({ ...p, method: e.target.value }))}>{METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
            <div><div style={S.label}>處理人</div><input style={S.input} placeholder="姓名" value={form.handler} onChange={e => setForm(p => ({ ...p, handler: e.target.value }))} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btn()} onClick={handleAddLog}>{editId ? '更新' : '新增'}</button>
            {editId && <button style={S.btn('#6b7280')} onClick={() => { setEditId(null); setForm({ ...BLANK_LOG }); }}>取消</button>}
          </div>
        </div>

        <div style={{ ...S.row, marginBottom: 8 }}>
          <div><div style={S.label}>篩選月份</div><input type="month" style={S.input} value={filterMonth} onChange={e => setFilterMonth(e.target.value)} /></div>
          <button style={S.btnSm()} onClick={printReport}>列印月報</button>
        </div>

        <div style={{ ...S.card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>日期</th><th style={S.th}>類別</th><th style={{ ...S.th, textAlign: 'right' }}>重量</th>
              <th style={S.th}>容器</th><th style={S.th}>處理方式</th><th style={S.th}>處理人</th><th style={S.th}>操作</th>
            </tr></thead>
            <tbody>
              {filtered.filter(l => !l.type).length === 0 && <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#aaa', padding: 30 }}>本月暫無記錄</td></tr>}
              {filtered.filter(l => !l.type).map((l, idx) => (
                <tr key={l.id} style={{ background: idx % 2 ? '#fafbfc' : '#fff' }}>
                  <td style={S.td}>{l.date}</td>
                  <td style={S.td}><span style={S.badge(CAT_COLORS[l.category] || '#666')}>{l.category}</span></td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>{l.weight} kg</td>
                  <td style={S.td}>{l.containerId || '-'}</td>
                  <td style={S.td}>{l.method}</td>
                  <td style={S.td}>{l.handler}</td>
                  <td style={S.td}>
                    <button style={S.btnSm()} onClick={() => { setForm({ date: l.date, category: l.category, weight: l.weight, containerId: l.containerId, method: l.method, handler: l.handler }); setEditId(l.id); }}>編輯</button>{' '}
                    <button style={S.btnSm('#dc2626')} onClick={() => handleDeleteLog(l.id)}>刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}

      {tab === 'stats' && <>
        <div style={{ ...S.row, marginBottom: 8 }}>
          <div><div style={S.label}>月份</div><input type="month" style={S.input} value={filterMonth} onChange={e => setFilterMonth(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={S.stat('#f0fdfa')}><div style={S.label}>總記錄</div><div style={{ fontSize: 20, fontWeight: 700, color: ACCENT }}>{stats.count}</div></div>
          <div style={S.stat('#f0fdfa')}><div style={S.label}>總重量</div><div style={{ fontSize: 20, fontWeight: 700, color: ACCENT }}>{stats.total.toFixed(1)} kg</div></div>
        </div>
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>分類統計</div>
          {CATS.map(c => {
            const w = stats.byCat[c] || 0;
            const pct = stats.total > 0 ? (w / stats.total * 100) : 0;
            return (
              <div key={c} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                  <span><span style={S.badge(CAT_COLORS[c])}>{c}</span></span>
                  <span style={{ fontWeight: 600 }}>{w.toFixed(1)} kg ({pct.toFixed(0)}%)</span>
                </div>
                <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4 }}>
                  <div style={{ height: 8, borderRadius: 4, background: CAT_COLORS[c], width: `${pct}%`, transition: 'width .3s' }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'right' }}><button style={S.btn()} onClick={printReport}>列印月報</button></div>
      </>}

      {tab === 'checklist' && <>
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>每月合規檢查</div>
            <div><div style={S.label}>月份</div><input type="month" style={S.input} value={checkMonth} onChange={e => setCheckMonth(e.target.value)} /></div>
          </div>
          {CHECKLIST_ITEMS.map((item, idx) => (
            <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={!!checks[idx]} onChange={e => setChecks(p => ({ ...p, [idx]: e.target.checked }))} />
              <span style={{ color: checks[idx] ? '#16a34a' : '#333', fontWeight: checks[idx] ? 600 : 400 }}>{checks[idx] ? '\u2713 ' : ''}{item}</span>
            </label>
          ))}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#666' }}>完成: {Object.values(checks).filter(Boolean).length} / {CHECKLIST_ITEMS.length}</span>
            <button style={S.btn()} onClick={handleSaveChecklist}>保存檢查</button>
          </div>
        </div>
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>歷史檢查記錄</div>
          {logs.filter(l => l.type === 'checklist').length === 0 && <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: 20 }}>暫無記錄</div>}
          {logs.filter(l => l.type === 'checklist').map(l => (
            <div key={l.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span>{l.month} | 檢查人: {l.user} | 日期: {l.date}</span>
              <span style={{ color: '#16a34a', fontWeight: 600 }}>{Object.values(l.checks || {}).filter(Boolean).length}/{CHECKLIST_ITEMS.length} 通過</span>
            </div>
          ))}
        </div>
      </>}

      {tab === 'contractor' && <>
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>新增承辦商</div>
          <div style={S.row}>
            <div><div style={S.label}>公司名稱</div><input style={{ ...S.input, width: 160 }} value={conForm.name} onChange={e => setConForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><div style={S.label}>牌照號碼</div><input style={S.input} value={conForm.license} onChange={e => setConForm(p => ({ ...p, license: e.target.value }))} /></div>
            <div><div style={S.label}>合約開始</div><input type="date" style={S.input} value={conForm.contractStart} onChange={e => setConForm(p => ({ ...p, contractStart: e.target.value }))} /></div>
            <div><div style={S.label}>合約結束</div><input type="date" style={S.input} value={conForm.contractEnd} onChange={e => setConForm(p => ({ ...p, contractEnd: e.target.value }))} /></div>
            <div><div style={S.label}>聯絡人</div><input style={S.input} value={conForm.contact} onChange={e => setConForm(p => ({ ...p, contact: e.target.value }))} /></div>
            <div><div style={S.label}>電話</div><input style={S.input} value={conForm.phone} onChange={e => setConForm(p => ({ ...p, phone: e.target.value }))} /></div>
          </div>
          <button style={S.btn()} onClick={handleAddCon}>新增承辦商</button>
        </div>
        <div style={{ ...S.card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>公司名稱</th><th style={S.th}>牌照</th><th style={S.th}>合約期</th>
              <th style={S.th}>聯絡人</th><th style={S.th}>電話</th><th style={S.th}>操作</th>
            </tr></thead>
            <tbody>
              {contractors.length === 0 && <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#aaa', padding: 30 }}>暫無承辦商</td></tr>}
              {contractors.map((c, idx) => (
                <tr key={c.id} style={{ background: idx % 2 ? '#fafbfc' : '#fff' }}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{c.name}</td>
                  <td style={S.td}>{c.license}</td>
                  <td style={S.td}>{c.contractStart} ~ {c.contractEnd || '未定'}</td>
                  <td style={S.td}>{c.contact}</td>
                  <td style={S.td}>{c.phone || '-'}</td>
                  <td style={S.td}><button style={S.btnSm('#dc2626')} onClick={() => handleDeleteCon(c.id)}>刪除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  );
}
