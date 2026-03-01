import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_quality_audits';
const ACCENT = '#0e7490';
const PASS_THRESHOLD = 80;
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const today = () => new Date().toISOString().substring(0, 10);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } };
const save = d => localStorage.setItem(LS_KEY, JSON.stringify(d));

const CHECKLIST = [
  { cat: '診所環境', items: ['清潔度符合標準', '溫度控制適當', '照明充足', '標示清楚可見'] },
  { cat: '感染控制', items: ['手部衛生執行', '器具消毒到位', '醫療廢物正確處理'] },
  { cat: '藥物管理', items: ['藥物儲存正確', '標籤清楚完整', '過期藥物已清除'] },
  { cat: '病歷管理', items: ['病歷填寫完整', '病歷保密措施', '存取權限管理'] },
  { cat: '客戶服務', items: ['等候時間合理', '員工禮貌友善', '投訴處理及時'] },
  { cat: '安全管理', items: ['消防設備齊全', '急救設備完備', '急救箱已檢查'] },
];

const s = {
  card: { background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 12 },
  hdr: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontWeight: 700, fontSize: 14, color: ACCENT },
  inp: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' },
  btn: { padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  th: { padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 11, fontWeight: 700, textAlign: 'left', color: '#6b7280', whiteSpace: 'nowrap' },
  td: { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 12, whiteSpace: 'nowrap' },
  tab: a => ({ padding: '8px 18px', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? ACCENT : '#666', borderBottom: a ? `2px solid ${ACCENT}` : '2px solid transparent', marginBottom: -2, background: 'none', border: 'none', fontSize: 14 }),
  stat: bg => ({ padding: 12, borderRadius: 8, textAlign: 'center', flex: 1, minWidth: 100, background: bg }),
  scoreColor: v => v >= 80 ? '#16a34a' : v >= 60 ? '#d97706' : '#dc2626',
};

function initResults() {
  const r = {};
  CHECKLIST.forEach(c => c.items.forEach(it => { r[c.cat + '|' + it] = ''; }));
  return r;
}

export default function QualityAudit({ showToast, user }) {
  const [audits, setAudits] = useState(load);
  const [tab, setTab] = useState('new');
  const [results, setResults] = useState(initResults);
  const [auditor, setAuditor] = useState(user?.name || '');
  const [auditDate, setAuditDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [actionText, setActionText] = useState('');
  const [actionDue, setActionDue] = useState('');
  const [actionAuditId, setActionAuditId] = useState('');

  const setResult = (key, val) => setResults(r => ({ ...r, [key]: val }));

  const calcScore = (res) => {
    const entries = Object.values(res).filter(v => v === 'pass' || v === 'fail');
    if (!entries.length) return 0;
    return Math.round(entries.filter(v => v === 'pass').length / entries.length * 100);
  };

  const calcCatScore = (res, cat) => {
    const items = CHECKLIST.find(c => c.cat === cat)?.items || [];
    const entries = items.map(it => res[cat + '|' + it]).filter(v => v === 'pass' || v === 'fail');
    if (!entries.length) return null;
    return Math.round(entries.filter(v => v === 'pass').length / entries.length * 100);
  };

  const overallScore = useMemo(() => calcScore(results), [results]);

  const handleSubmit = () => {
    const answered = Object.values(results).filter(v => v !== '').length;
    if (!answered) return showToast('請至少完成一項審核');
    if (!auditor.trim()) return showToast('請輸入審核員');
    const catScores = {};
    CHECKLIST.forEach(c => { catScores[c.cat] = calcCatScore(results, c.cat); });
    const record = { id: uid(), date: auditDate, auditor: auditor.trim(), score: overallScore, catScores, results: { ...results }, notes, actions: [], passed: overallScore >= PASS_THRESHOLD };
    const next = [record, ...audits]; setAudits(next); save(next);
    setResults(initResults()); setNotes(''); setAuditDate(today());
    showToast(`審核已提交 — ${overallScore}%`); setTab('history');
  };

  const handleDelete = id => { const next = audits.filter(a => a.id !== id); setAudits(next); save(next); showToast('已刪除'); };

  const handleAddAction = () => {
    if (!actionText.trim() || !actionAuditId) return showToast('請填寫糾正措施');
    const next = audits.map(a => a.id === actionAuditId ? { ...a, actions: [...(a.actions || []), { id: uid(), text: actionText.trim(), due: actionDue, done: false, created: today() }] } : a);
    setAudits(next); save(next); setActionText(''); setActionDue(''); showToast('糾正措施已新增');
  };

  const toggleAction = (auditId, actionId) => {
    const next = audits.map(a => a.id === auditId ? { ...a, actions: (a.actions || []).map(ac => ac.id === actionId ? { ...ac, done: !ac.done } : ac) } : a);
    setAudits(next); save(next);
  };

  const allActions = useMemo(() => audits.flatMap(a => (a.actions || []).map(ac => ({ ...ac, auditId: a.id, auditDate: a.date }))), [audits]);

  const stats = useMemo(() => {
    if (!audits.length) return { avg: 0, passed: 0, failed: 0, total: 0, trend: '-' };
    const avg = Math.round(audits.reduce((s, a) => s + a.score, 0) / audits.length);
    const passed = audits.filter(a => a.passed).length;
    const last = audits.length >= 2 ? audits[0].score - audits[1].score : 0;
    return { avg, passed, failed: audits.length - passed, total: audits.length, trend: last > 0 ? `+${last}%` : last < 0 ? `${last}%` : '-' };
  }, [audits]);

  const handlePrint = (audit) => {
    const a = audit || audits[0]; if (!a) return showToast('沒有審核記錄');
    const catRows = CHECKLIST.map(c => {
      const cs = a.catScores?.[c.cat]; const sc = cs != null ? cs + '%' : 'N/A';
      const items = c.items.map(it => { const v = a.results?.[c.cat + '|' + it] || ''; return `<tr><td style="padding-left:24px">${it}</td><td style="text-align:center;color:${v === 'pass' ? '#16a34a' : v === 'fail' ? '#dc2626' : '#999'};font-weight:700">${v === 'pass' ? '通過' : v === 'fail' ? '不通過' : 'N/A'}</td></tr>`; }).join('');
      return `<tr style="background:#f0fdfa"><td style="font-weight:700">${c.cat}</td><td style="text-align:center;font-weight:700;color:${s.scoreColor(cs || 0)}">${sc}</td></tr>${items}`;
    }).join('');
    const actRows = (a.actions || []).map(ac => `<tr><td>${escapeHtml(ac.text)}</td><td style="text-align:center">${ac.due || '-'}</td><td style="text-align:center;color:${ac.done ? '#16a34a' : '#d97706'}">${ac.done ? '已完成' : '待處理'}</td></tr>`).join('');
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>質量審核報告</title><style>body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:700px;margin:0 auto;font-size:13px}h1{font-size:18px;text-align:center;color:${ACCENT}}table{width:100%;border-collapse:collapse;margin-bottom:16px}th,td{padding:6px 10px;border-bottom:1px solid #eee;text-align:left}th{background:#f8f8f8;font-weight:700}.info{display:flex;justify-content:space-between;margin-bottom:14px;font-size:12px;color:#555}.score{text-align:center;font-size:36px;font-weight:800;margin:10px 0}@media print{body{margin:0;padding:10mm}}</style></head><body>
    <h1>${escapeHtml(getClinicName())} — 質量審核報告</h1>
    <div class="info"><span>審核日期：${a.date}</span><span>審核員：${escapeHtml(a.auditor)}</span><span>列印：${new Date().toLocaleString('zh-HK')}</span></div>
    <div class="score" style="color:${s.scoreColor(a.score)}">${a.score}%</div>
    <div style="text-align:center;margin-bottom:16px;font-weight:700;color:${a.passed ? '#16a34a' : '#dc2626'}">${a.passed ? '通過' : '不通過'}（合格線：${PASS_THRESHOLD}%）</div>
    <table><thead><tr><th>項目</th><th style="text-align:center">結果</th></tr></thead><tbody>${catRows}</tbody></table>
    ${actRows ? `<h2 style="font-size:14px;color:${ACCENT};border-bottom:2px solid ${ACCENT};padding-bottom:4px">糾正措施</h2><table><thead><tr><th>措施</th><th style="text-align:center">限期</th><th style="text-align:center">狀態</th></tr></thead><tbody>${actRows}</tbody></table>` : ''}
    ${a.notes ? `<p style="font-size:12px;color:#555"><b>備註：</b>${escapeHtml(a.notes)}</p>` : ''}
    </body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  return (<>
    {/* Stats */}
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      <div style={s.stat('#ecfeff')}><div style={{ fontSize: 10, color: ACCENT, fontWeight: 600 }}>平均分數</div><div style={{ fontSize: 24, fontWeight: 800, color: ACCENT }}>{stats.avg}%</div><div style={{ fontSize: 11, color: '#888' }}>趨勢 {stats.trend}</div></div>
      <div style={s.stat('#f0fdf4')}><div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>通過次數</div><div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>{stats.passed}</div></div>
      <div style={s.stat('#fef2f2')}><div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>不通過</div><div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626' }}>{stats.failed}</div></div>
      <div style={s.stat('#fafafa')}><div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>總審核</div><div style={{ fontSize: 24, fontWeight: 800, color: '#374151' }}>{stats.total}</div></div>
      <div style={s.stat('#fafafa')}><div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>待處理措施</div><div style={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}>{allActions.filter(a => !a.done).length}</div></div>
    </div>

    {/* Tabs */}
    <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 14 }}>
      {[['new','新增審核'],['history','審核記錄'],['actions','糾正措施']].map(([k,l]) =>
        <button key={k} style={s.tab(tab === k)} onClick={() => setTab(k)}>{l}</button>)}
    </div>

    {/* New Audit Tab */}
    {tab === 'new' && (<div style={s.card}>
      <div style={s.hdr}>質量審核表</div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div><label style={{ fontSize: 12, color: '#555' }}>審核日期</label><br/><input type="date" style={{ ...s.inp, width: 150 }} value={auditDate} onChange={e => setAuditDate(e.target.value)} /></div>
          <div><label style={{ fontSize: 12, color: '#555' }}>審核員</label><br/><input style={{ ...s.inp, width: 150 }} value={auditor} onChange={e => setAuditor(e.target.value)} placeholder="審核員姓名" /></div>
          <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: s.scoreColor(overallScore) }}>目前分數：{overallScore}%</span>
            <span style={{ fontSize: 11, marginLeft: 8, color: overallScore >= PASS_THRESHOLD ? '#16a34a' : '#dc2626' }}>{overallScore >= PASS_THRESHOLD ? '通過' : '不通過'}</span>
          </div>
        </div>
        {CHECKLIST.map(c => { const cs = calcCatScore(results, c.cat); return (
          <div key={c.cat} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f0fdfa', borderRadius: 6, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: ACCENT }}>{c.cat}</span>
              {cs != null && <span style={{ fontSize: 12, fontWeight: 700, color: s.scoreColor(cs) }}>{cs}%</span>}
            </div>
            {c.items.map(it => { const key = c.cat + '|' + it; const v = results[key]; return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #f3f4f6', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{it}</span>
                {['pass','fail','na'].map(opt => (
                  <button key={opt} onClick={() => setResult(key, opt === 'na' ? '' : opt)}
                    style={{ ...s.btn, fontSize: 11, padding: '3px 10px',
                      background: (opt === 'pass' && v === 'pass') ? '#dcfce7' : (opt === 'fail' && v === 'fail') ? '#fee2e2' : (opt === 'na' && v === '') ? '#f3f4f6' : '#fff',
                      color: (opt === 'pass' && v === 'pass') ? '#16a34a' : (opt === 'fail' && v === 'fail') ? '#dc2626' : '#888',
                      border: '1px solid #e5e7eb' }}>
                    {opt === 'pass' ? '通過' : opt === 'fail' ? '不通過' : 'N/A'}
                  </button>))}
              </div>); })}
          </div>); })}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: '#555' }}>備註</label>
          <textarea rows={2} style={{ ...s.inp, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="審核備註（選填）" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...s.btn, background: ACCENT, color: '#fff' }} onClick={handleSubmit}>提交審核</button>
          <button style={{ ...s.btn, background: '#f3f4f6', color: '#374151' }} onClick={() => { setResults(initResults()); setNotes(''); }}>重置</button>
        </div>
      </div>
    </div>)}

    {/* History Tab */}
    {tab === 'history' && (<div style={{ ...s.card, padding: 0 }}>
      <div style={{ ...s.hdr, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>審核記錄 ({audits.length})</span>
        {audits.length > 0 && <button style={{ ...s.btn, background: '#fef3c7', color: '#92400e', fontSize: 11 }} onClick={() => handlePrint()}>列印最近報告</button>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['日期','審核員','總分','結果',...CHECKLIST.map(c => c.cat),'備註',''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {!audits.length && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無審核記錄</td></tr>}
            {audits.map(a => (<tr key={a.id}>
              <td style={s.td}>{a.date}</td>
              <td style={s.td}>{a.auditor}</td>
              <td style={{ ...s.td, fontWeight: 700, color: s.scoreColor(a.score) }}>{a.score}%</td>
              <td style={{ ...s.td, fontWeight: 600, color: a.passed ? '#16a34a' : '#dc2626' }}>{a.passed ? '通過' : '不通過'}</td>
              {CHECKLIST.map(c => { const cs = a.catScores?.[c.cat]; return <td key={c.cat} style={{ ...s.td, color: cs != null ? s.scoreColor(cs) : '#999', fontWeight: 600 }}>{cs != null ? cs + '%' : '-'}</td>; })}
              <td style={{ ...s.td, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.notes || '-'}</td>
              <td style={s.td}>
                <button style={{ ...s.btn, background: '#fef3c7', color: '#92400e', fontSize: 11, padding: '3px 8px', marginRight: 4 }} onClick={() => handlePrint(a)}>列印</button>
                <button style={{ ...s.btn, background: '#fee2e2', color: '#dc2626', fontSize: 11, padding: '3px 8px' }} onClick={() => handleDelete(a.id)}>刪除</button>
              </td>
            </tr>))}
          </tbody>
        </table>
      </div>
    </div>)}

    {/* Actions Tab */}
    {tab === 'actions' && (<>
      <div style={{ ...s.card, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: ACCENT, marginBottom: 10 }}>新增糾正措施</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 180 }}><label style={{ fontSize: 12, color: '#555' }}>審核記錄</label><br/>
            <select style={{ ...s.inp }} value={actionAuditId} onChange={e => setActionAuditId(e.target.value)}>
              <option value="">選擇審核記錄</option>{audits.map(a => <option key={a.id} value={a.id}>{a.date} — {a.score}% ({a.auditor})</option>)}
            </select></div>
          <div style={{ flex: 2, minWidth: 200 }}><label style={{ fontSize: 12, color: '#555' }}>措施內容</label><br/><input style={s.inp} value={actionText} onChange={e => setActionText(e.target.value)} placeholder="描述糾正措施..." /></div>
          <div><label style={{ fontSize: 12, color: '#555' }}>限期</label><br/><input type="date" style={{ ...s.inp, width: 140 }} value={actionDue} onChange={e => setActionDue(e.target.value)} /></div>
          <button style={{ ...s.btn, background: ACCENT, color: '#fff' }} onClick={handleAddAction}>新增</button>
        </div>
      </div>
      <div style={{ ...s.card, padding: 0 }}>
        <div style={s.hdr}>糾正措施列表 ({allActions.length})</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['審核日期','措施內容','建立日期','限期','狀態',''].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {!allActions.length && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無糾正措施</td></tr>}
              {allActions.map(ac => (<tr key={ac.id}>
                <td style={s.td}>{ac.auditDate}</td>
                <td style={{ ...s.td, whiteSpace: 'normal', maxWidth: 260 }}>{ac.text}</td>
                <td style={s.td}>{ac.created}</td>
                <td style={s.td}>{ac.due || '-'}</td>
                <td style={{ ...s.td, fontWeight: 600, color: ac.done ? '#16a34a' : '#d97706' }}>{ac.done ? '已完成' : '待處理'}</td>
                <td style={s.td}><button style={{ ...s.btn, fontSize: 11, padding: '3px 10px', background: ac.done ? '#f3f4f6' : '#dcfce7', color: ac.done ? '#888' : '#16a34a' }} onClick={() => toggleAction(ac.auditId, ac.id)}>{ac.done ? '重開' : '完成'}</button></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>
    </>)}
  </>);
}
