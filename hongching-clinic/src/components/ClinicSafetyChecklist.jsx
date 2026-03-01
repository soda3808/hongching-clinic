import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_safety_checklist';
const ACCENT = '#0e7490';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

const TEMPLATES = {
  daily_open: { name: '每日開店', freq: '每日', items: ['開啟空調及通風系統', '檢查等候區座椅及地面清潔', '補充洗手液及消毒液', '檢查急救箱物資', '確認消防通道暢通', '開啟電腦及診療設備', '檢查飲水機運作正常'] },
  daily_close: { name: '每日關店', freq: '每日', items: ['清潔及消毒診療床', '清理醫療廢物並封袋', '地面清潔拖抹', '關閉電器及空調', '鎖好藥物儲存櫃', '檢查門窗關妥', '設定保安系統'] },
  weekly_clean: { name: '每週清潔', freq: '每週', items: ['深層清潔廁所', '清洗冷氣隔塵網', '消毒候診區玩具及雜誌', '檢查滅蟲裝置', '清理雪櫃過期物品', '擦拭門把及開關面板', '檢查消毒用品存量'] },
  monthly_fire: { name: '每月消防', freq: '每月', items: ['檢查滅火器壓力正常', '測試緊急照明燈', '測試火警鐘', '確認走火通道標示清晰', '檢查防火門關閉正常', '核對緊急聯絡名單更新', '員工消防知識溫習'] },
};

const load = () => { try { const d = JSON.parse(localStorage.getItem(LS_KEY)); return d && d.records ? d : { records: [], custom: [] }; } catch { return { records: [], custom: [] }; } };
const save = d => { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {} };
const today = () => new Date().toISOString().slice(0, 10);
const fmtDt = ts => ts ? new Date(ts).toLocaleString('zh-HK', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
const weekKey = d => { const dt = new Date(d); const jan1 = new Date(dt.getFullYear(), 0, 1); return `${dt.getFullYear()}-W${String(Math.ceil(((dt - jan1) / 86400000 + jan1.getDay() + 1) / 7)).padStart(2, '0')}`; };

const sCard = { background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 12 };
const sBtn = { padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const sPrimary = { ...sBtn, background: ACCENT, color: '#fff' };
const sOutline = { ...sBtn, background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}` };
const sInput = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const sTh = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#475569', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' };
const sTd = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
const sBadge = c => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#fff', background: c });

export default function ClinicSafetyChecklist({ data, showToast, user }) {
  const [store, setStore] = useState(load);
  const [tab, setTab] = useState('dashboard');
  const [active, setActive] = useState(null);       // active checklist being filled
  const [editing, setEditing] = useState(null);      // 'NEW' | customId for custom template editor
  const [custForm, setCustForm] = useState({ name: '', freq: '每日', items: [''] });
  const [viewRec, setViewRec] = useState(null);      // view detail of a past record

  const persist = next => { setStore(next); save(next); };
  const allTemplates = useMemo(() => {
    const base = Object.entries(TEMPLATES).map(([k, v]) => ({ key: k, ...v }));
    return [...base, ...store.custom.map(c => ({ key: c.id, ...c }))];
  }, [store.custom]);

  /* ── Start a new checklist ── */
  const startChecklist = tpl => {
    const rec = { id: uid(), templateKey: tpl.key, templateName: tpl.name, freq: tpl.freq, startedAt: Date.now(), completedAt: null, completedBy: '', items: tpl.items.map(t => ({ text: t, checked: false, note: '' })) };
    setActive(rec);
  };

  const toggleItem = idx => { if (!active) return; const next = { ...active, items: active.items.map((it, i) => i === idx ? { ...it, checked: !it.checked } : it) }; setActive(next); };
  const setNote = (idx, v) => { if (!active) return; const next = { ...active, items: active.items.map((it, i) => i === idx ? { ...it, note: v } : it) }; setActive(next); };

  const submitChecklist = () => {
    const finished = { ...active, completedAt: Date.now(), completedBy: user?.name || user?.username || '未知' };
    persist({ ...store, records: [finished, ...store.records] });
    setActive(null);
    showToast?.('檢查表已提交');
  };

  const pct = active ? Math.round(active.items.filter(i => i.checked).length / active.items.length * 100) : 0;

  /* ── Dashboard metrics ── */
  const last30 = useMemo(() => { const cutoff = Date.now() - 30 * 86400000; return store.records.filter(r => r.completedAt >= cutoff); }, [store.records]);
  const complianceByWeek = useMemo(() => {
    const m = {};
    store.records.filter(r => r.completedAt).forEach(r => {
      const wk = weekKey(r.completedAt);
      if (!m[wk]) m[wk] = { total: 0, checked: 0 };
      r.items.forEach(it => { m[wk].total++; if (it.checked) m[wk].checked++; });
    });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).slice(-8).map(([wk, v]) => ({ wk, rate: v.total ? Math.round(v.checked / v.total * 100) : 0 }));
  }, [store.records]);

  const overdue = useMemo(() => {
    const freqDays = { '每日': 1, '每週': 7, '每月': 30 };
    return allTemplates.filter(tpl => {
      const last = store.records.find(r => r.templateKey === tpl.key);
      if (!last) return true;
      const gap = (Date.now() - last.completedAt) / 86400000;
      return gap > (freqDays[tpl.freq] || 30);
    });
  }, [allTemplates, store.records]);

  const topIssues = useMemo(() => {
    const m = {};
    last30.forEach(r => r.items.forEach(it => { if (!it.checked) { m[it.text] = (m[it.text] || 0) + 1; } }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [last30]);

  /* ── Custom template CRUD ── */
  const openAddCustom = () => { setCustForm({ name: '', freq: '每日', items: [''] }); setEditing('NEW'); };
  const openEditCustom = c => { setCustForm({ name: c.name, freq: c.freq, items: [...c.items] }); setEditing(c.id); };
  const saveCustom = () => {
    if (!custForm.name) { showToast?.('請輸入名稱'); return; }
    const items = custForm.items.filter(i => i.trim());
    if (!items.length) { showToast?.('請至少加入一個檢查項目'); return; }
    let next;
    if (editing === 'NEW') { next = { ...store, custom: [...store.custom, { id: uid(), name: custForm.name, freq: custForm.freq, items }] }; }
    else { next = { ...store, custom: store.custom.map(c => c.id === editing ? { ...c, name: custForm.name, freq: custForm.freq, items } : c) }; }
    persist(next); setEditing(null); showToast?.('已儲存');
  };
  const deleteCustom = id => { if (!window.confirm('確定刪除此自訂檢查表？')) return; persist({ ...store, custom: store.custom.filter(c => c.id !== id) }); showToast?.('已刪除'); };
  const deleteRecord = id => { if (!window.confirm('確定刪除此檢查記錄？')) return; persist({ ...store, records: store.records.filter(r => r.id !== id) }); showToast?.('已刪除'); };

  /* ── Print ── */
  const printReport = rec => {
    const clinic = getClinicName();
    const passCount = rec.items.filter(i => i.checked).length;
    const pctVal = Math.round(passCount / rec.items.length * 100);
    const rows = rec.items.map(it => `<tr><td>${it.checked ? '&#10003;' : '&#10007;'}</td><td>${escapeHtml(it.text)}</td><td>${escapeHtml(it.note || '-')}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>檢查報告</title>
<style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px;text-align:left}th{background:#f0fdfa;font-weight:700}.hdr{color:${ACCENT}}.footer{margin-top:24px;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:8px}@media print{body{padding:0}}</style></head>
<body><h2 class="hdr">${escapeHtml(clinic)} - ${escapeHtml(rec.templateName)}檢查報告</h2>
<p>完成日期：${fmtDt(rec.completedAt)} | 執行人：${escapeHtml(rec.completedBy)} | 完成率：<strong>${pctVal}%</strong> (${passCount}/${rec.items.length})</p>
<table><thead><tr><th style="width:40px">結果</th><th>檢查項目</th><th>備註</th></tr></thead><tbody>${rows}</tbody></table>
<div class="footer"><p>${escapeHtml(clinic)} - 安全衛生管理</p></div>
<script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  };

  /* ── Print summary report ── */
  const printSummary = () => {
    const clinic = getClinicName();
    const rows = last30.map(r => {
      const p = r.items.filter(i => i.checked).length;
      const t = r.items.length;
      return `<tr><td>${escapeHtml(r.templateName)}</td><td>${escapeHtml(r.freq)}</td><td>${fmtDt(r.completedAt)}</td><td>${escapeHtml(r.completedBy)}</td><td>${Math.round(p / t * 100)}%</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>安全檢查總覽</title>
<style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px;text-align:left}th{background:#f0fdfa;font-weight:700}.hdr{color:${ACCENT}}.footer{margin-top:24px;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:8px}@media print{body{padding:0}}</style></head>
<body><h2 class="hdr">${escapeHtml(clinic)} - 安全衛生檢查總覽</h2>
<p>列印日期：${new Date().toLocaleDateString('zh-HK')} | 近30天完成：${last30.length} 次 | 逾期：${overdue.length} 項</p>
<table><thead><tr><th>檢查表</th><th>頻率</th><th>完成日期</th><th>執行人</th><th>完成率</th></tr></thead><tbody>${rows}</tbody></table>
<div class="footer"><p>${escapeHtml(clinic)} - 安全衛生管理</p></div>
<script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  };

  /* ── Render: Active Checklist ── */
  const renderActive = () => (
    <div style={sCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: ACCENT }}>{active.templateName}</h3>
        <button style={sOutline} onClick={() => setActive(null)}>取消</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, height: 14, background: '#e2e8f0', borderRadius: 7, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#059669' : ACCENT, borderRadius: 7, transition: 'width .3s' }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? '#059669' : ACCENT }}>{pct}%</span>
      </div>
      {active.items.map((it, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
          <input type="checkbox" checked={it.checked} onChange={() => toggleItem(idx)} style={{ marginTop: 3, accentColor: ACCENT, width: 18, height: 18, cursor: 'pointer' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, textDecoration: it.checked ? 'line-through' : 'none', color: it.checked ? '#94a3b8' : '#1e293b' }}>{it.text}</div>
            <input placeholder="備註..." style={{ ...sInput, marginTop: 4, fontSize: 12, border: '1px solid #e2e8f0' }} value={it.note} onChange={e => setNote(idx, e.target.value)} />
          </div>
          <div style={{ width: 60, height: 44, border: '1px dashed #cbd5e1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8', flexShrink: 0, cursor: 'default' }}>相片</div>
        </div>
      ))}
      <div style={{ textAlign: 'right', marginTop: 14 }}>
        <button style={sPrimary} onClick={submitChecklist}>提交檢查表</button>
      </div>
    </div>
  );

  /* ── Render: Dashboard ── */
  const renderDashboard = () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ ...sCard, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: ACCENT }}>{last30.length}</div><div style={{ fontSize: 13, color: '#64748b' }}>近30天完成次數</div></div>
        <div style={{ ...sCard, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: overdue.length ? '#dc2626' : '#059669' }}>{overdue.length}</div><div style={{ fontSize: 13, color: '#64748b' }}>逾期未檢查</div></div>
        <div style={{ ...sCard, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: '#059669' }}>{complianceByWeek.length ? complianceByWeek[complianceByWeek.length - 1].rate : 0}%</div><div style={{ fontSize: 13, color: '#64748b' }}>本週合規率</div></div>
        <div style={{ ...sCard, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700, color: '#6366f1' }}>{store.records.length}</div><div style={{ fontSize: 13, color: '#64748b' }}>歷史記錄總數</div></div>
      </div>
      {/* Compliance by week chart */}
      {complianceByWeek.length > 0 && (
        <div style={sCard}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: ACCENT }}>每週合規率趨勢</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
            {complianceByWeek.map(w => (
              <div key={w.wk} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: w.rate >= 80 ? '#059669' : '#dc2626' }}>{w.rate}%</span>
                <div style={{ width: '100%', maxWidth: 36, height: `${Math.max(w.rate, 4)}%`, background: w.rate >= 80 ? '#059669' : w.rate >= 50 ? '#d97706' : '#dc2626', borderRadius: '4px 4px 0 0', marginTop: 2 }} />
                <span style={{ fontSize: 9, color: '#94a3b8', marginTop: 4, whiteSpace: 'nowrap' }}>{w.wk.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Overdue */}
      {overdue.length > 0 && (
        <div style={{ ...sCard, borderLeft: '4px solid #dc2626' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 15, color: '#dc2626' }}>逾期未完成</h3>
          {overdue.map(tpl => (
            <div key={tpl.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
              <span>{tpl.name} <span style={{ color: '#94a3b8', fontSize: 11 }}>({tpl.freq})</span></span>
              <button style={{ ...sBtn, background: '#fee2e2', color: '#dc2626', fontSize: 12 }} onClick={() => startChecklist(tpl)}>立即檢查</button>
            </div>
          ))}
        </div>
      )}
      {/* Top issues */}
      {topIssues.length > 0 && (
        <div style={sCard}>
          <h3 style={{ margin: '0 0 10px', fontSize: 15, color: ACCENT }}>常見未通過項目</h3>
          {topIssues.map(([text, count], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
              <span>{text}</span><span style={sBadge('#dc2626')}>{count} 次</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  /* ── Render: Templates / Start ── */
  const renderTemplates = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: ACCENT, fontSize: 15 }}>檢查表範本</h3>
        <button style={sPrimary} onClick={openAddCustom}>+ 自訂範本</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        {allTemplates.map(tpl => {
          const lastRec = store.records.find(r => r.templateKey === tpl.key);
          const isCustom = store.custom.some(c => c.id === tpl.key);
          return (
            <div key={tpl.key} style={{ ...sCard, borderTop: `3px solid ${ACCENT}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: '0 0 4px', fontSize: 14 }}>{tpl.name}</h4>
                <span style={sBadge(ACCENT)}>{tpl.freq}</span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{tpl.items.length} 個檢查項目</div>
              {lastRec && <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>上次完成：{fmtDt(lastRec.completedAt)}</div>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={sPrimary} onClick={() => startChecklist(tpl)}>開始檢查</button>
                {isCustom && <>
                  <button style={sOutline} onClick={() => openEditCustom(tpl)}>編輯</button>
                  <button style={{ ...sBtn, color: '#dc2626', background: '#fee2e2' }} onClick={() => deleteCustom(tpl.key)}>刪除</button>
                </>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ── Render: History ── */
  const renderHistory = () => (
    <div style={sCard}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15, color: ACCENT }}>歷史記錄 ({store.records.length})</h3>
      {store.records.length === 0 && <p style={{ color: '#94a3b8', fontSize: 13 }}>尚無記錄</p>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          {store.records.length > 0 && <thead><tr>{['檢查表', '頻率', '完成日期', '執行人', '結果', '完成率', '操作'].map(h => <th key={h} style={sTh}>{h}</th>)}</tr></thead>}
          <tbody>
            {store.records.map(r => {
              const pass = r.items.filter(i => i.checked).length;
              const total = r.items.length;
              const rate = Math.round(pass / total * 100);
              return (
                <tr key={r.id}>
                  <td style={sTd}>{r.templateName}</td>
                  <td style={sTd}>{r.freq}</td>
                  <td style={sTd}>{fmtDt(r.completedAt)}</td>
                  <td style={sTd}>{r.completedBy}</td>
                  <td style={sTd}><span style={sBadge(rate === 100 ? '#059669' : rate >= 70 ? '#d97706' : '#dc2626')}>{rate === 100 ? '通過' : '部分通過'}</span></td>
                  <td style={sTd}>{pass}/{total} ({rate}%)</td>
                  <td style={{ ...sTd, whiteSpace: 'nowrap' }}>
                    <button style={{ ...sBtn, color: ACCENT, background: 'none', padding: '2px 6px' }} onClick={() => setViewRec(r)}>檢視</button>
                    <button style={{ ...sBtn, color: ACCENT, background: 'none', padding: '2px 6px' }} onClick={() => printReport(r)}>列印</button>
                    <button style={{ ...sBtn, color: '#dc2626', background: 'none', padding: '2px 6px' }} onClick={() => deleteRecord(r.id)}>刪除</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  /* ── Render: Custom Template Form ── */
  const renderCustForm = () => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 480, maxHeight: '85vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 16px', color: ACCENT }}>{editing === 'NEW' ? '新增自訂範本' : '編輯自訂範本'}</h3>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>範本名稱</label>
          <input style={sInput} value={custForm.name} onChange={e => setCustForm({ ...custForm, name: e.target.value })} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>頻率</label>
          <select style={sInput} value={custForm.freq} onChange={e => setCustForm({ ...custForm, freq: e.target.value })}>
            {['每日', '每週', '每月'].map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>檢查項目</label>
          {custForm.items.map((it, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input style={{ ...sInput, flex: 1 }} placeholder={`項目 ${idx + 1}`} value={it} onChange={e => { const arr = [...custForm.items]; arr[idx] = e.target.value; setCustForm({ ...custForm, items: arr }); }} />
              {custForm.items.length > 1 && <button style={{ ...sBtn, color: '#dc2626', background: '#fee2e2', padding: '2px 8px' }} onClick={() => setCustForm({ ...custForm, items: custForm.items.filter((_, i) => i !== idx) })}>-</button>}
            </div>
          ))}
          <button style={{ ...sBtn, color: ACCENT, background: '#f0fdfa', marginTop: 4 }} onClick={() => setCustForm({ ...custForm, items: [...custForm.items, ''] })}>+ 新增項目</button>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button style={sOutline} onClick={() => setEditing(null)}>取消</button>
          <button style={sPrimary} onClick={saveCustom}>儲存</button>
        </div>
      </div>
    </div>
  );

  const TABS = [
    { key: 'dashboard', label: '安全總覽' },
    { key: 'templates', label: '檢查範本' },
    { key: 'history', label: '歷史記錄' },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ color: ACCENT, margin: 0 }}>安全衛生檢查</h2>
        <button style={sOutline} onClick={printSummary}>列印總覽報告</button>
      </div>
      <p style={{ color: '#888', marginTop: 0, marginBottom: 16, fontSize: 14 }}>每日、每週、每月安全及清潔檢查管理</p>
      {active ? renderActive() : (
        <>
          <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 16 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: tab === t.key ? ACCENT : '#64748b', borderBottom: tab === t.key ? `2px solid ${ACCENT}` : '2px solid transparent', marginBottom: -2 }}>{t.label}</button>
            ))}
          </div>
          {tab === 'dashboard' && renderDashboard()}
          {tab === 'templates' && renderTemplates()}
          {tab === 'history' && renderHistory()}
        </>
      )}
      {editing !== null && renderCustForm()}
      {/* ── Detail view modal ── */}
      {viewRec && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 520, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: ACCENT }}>{viewRec.templateName} - 檢查詳情</h3>
              <button style={sOutline} onClick={() => setViewRec(null)}>關閉</button>
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              完成日期：{fmtDt(viewRec.completedAt)} | 執行人：{viewRec.completedBy} | 完成率：{Math.round(viewRec.items.filter(i => i.checked).length / viewRec.items.length * 100)}%
            </div>
            {viewRec.items.map((it, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 16, width: 22, textAlign: 'center', color: it.checked ? '#059669' : '#dc2626' }}>{it.checked ? '\u2713' : '\u2717'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: it.checked ? '#1e293b' : '#dc2626' }}>{it.text}</div>
                  {it.note && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>備註：{it.note}</div>}
                </div>
              </div>
            ))}
            <div style={{ textAlign: 'right', marginTop: 14 }}>
              <button style={sPrimary} onClick={() => { printReport(viewRec); }}>列印報告</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
