import { useState, useMemo, useEffect } from 'react';
import { getDoctors, getStoreNames } from '../data';
import { getClinicName } from '../tenant';
import { auditTrailOps } from '../api';
import escapeHtml from '../utils/escapeHtml';
import { S, ECTCM } from '../styles/ectcm';

const AUDIT_KEY = 'hcmc_audit_log';
const OP_TYPES = ['全部', '新增', '修改', '刪除', '查看', '匯出', '列印'];
const ENTITY_TYPES = ['全部', '病人資料', '預約', '診症', '收入', '支出', '庫存', '處方', '藥材'];
const OP_COLORS = { '新增': '#059669', '修改': '#d97706', '刪除': '#dc2626', '查看': '#6366f1', '匯出': '#0891b2', '列印': '#7c3aed' };
const OP_MAP = { create: '新增', update: '修改', delete: '刪除', view: '查看', export: '匯出', print: '列印', add: '新增', edit: '修改', remove: '刪除' };
const ENTITY_MAP = { patients: '病人資料', patient: '病人資料', bookings: '預約', booking: '預約', consultations: '診症', consultation: '診症', revenue: '收入', expenses: '支出', expense: '支出', inventory: '庫存', prescriptions: '處方', prescription: '處方', herbs: '藥材', herb: '藥材' };

// ── Exported helper: other components call this to record audit entries ──
export function recordAudit(action, entity, entityId, before, after, operator) {
  const logs = getAuditLogs();
  const entry = { id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5), ts: new Date().toISOString(), userId: operator?.userId || 'system', userName: operator?.name || operator || 'System', action, target: entity, detail: { changes: diffObj(before, after), entityId }, entityId };
  logs.unshift(entry);
  if (logs.length > 500) logs.length = 500;
  try { localStorage.setItem(AUDIT_KEY, JSON.stringify(logs)); } catch {}
  auditTrailOps.persist(entry);
}

function getAuditLogs() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch { return []; }
}

function diffObj(before, after) {
  if (!before || !after) return {};
  const c = {};
  Object.keys(after).forEach(k => { if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) c[k] = { from: before[k], to: after[k] }; });
  return c;
}

function mapOp(raw) { return OP_MAP[raw?.toLowerCase()] || raw || '修改'; }
function mapEntity(raw) { return ENTITY_MAP[raw?.toLowerCase()] || raw || '其他'; }
function fmtTs(ts) { if (!ts) return ''; const d = new Date(ts); return d.toLocaleDateString('zh-HK') + ' ' + d.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' }); }

const sCard = { background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 12 };
const sBtn = { padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const sPrimary = { ...sBtn, background: '#0e7490', color: '#fff' };
const sOutline = { ...sBtn, background: '#fff', color: '#0e7490', border: '1px solid #0e7490' };
const sInput = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, outline: 'none' };
const sSelect = { ...sInput, minWidth: 90 };
const sTh = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: '#475569', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' };
const sTd = { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };

export default function AuditTrail({ data, showToast, user }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [opFilter, setOpFilter] = useState('全部');
  const [entityFilter, setEntityFilter] = useState('全部');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  const [logs, setLogs] = useState(getAuditLogs);
  useEffect(() => { auditTrailOps.load().then(d => { if (d) setLogs(d); }); }, []);

  // ── Normalize logs ──
  const normalized = useMemo(() => logs.map(l => {
    const op = mapOp(l.action);
    const entity = mapEntity(l.target);
    const changes = (typeof l.detail === 'object' && l.detail?.changes) ? l.detail.changes : {};
    const patientName = l.detail?.patientName || l.detail?.entityId || '';
    const entityId = l.detail?.entityId || l.entityId || '';
    return { ...l, op, entity, changes, patientName, entityId, operator: l.userName || l.userId || '' };
  }), [logs]);

  // ── Filtered ──
  const filtered = useMemo(() => {
    let list = normalized;
    if (dateFrom) list = list.filter(l => l.ts >= dateFrom);
    if (dateTo) list = list.filter(l => l.ts <= dateTo + 'T23:59:59');
    if (opFilter !== '全部') list = list.filter(l => l.op === opFilter);
    if (entityFilter !== '全部') list = list.filter(l => l.entity === entityFilter);
    if (keyword) { const kw = keyword.toLowerCase(); list = list.filter(l => (l.patientName + l.operator + l.entityId).toLowerCase().includes(kw)); }
    return list;
  }, [normalized, dateFrom, dateTo, opFilter, entityFilter, keyword]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;

  // ── Stats ──
  const stats = useMemo(() => {
    const today = new Date().toISOString().substring(0, 10);
    const month = today.substring(0, 7);
    const todayCount = normalized.filter(l => l.ts?.startsWith(today)).length;
    const monthCount = normalized.filter(l => l.ts?.startsWith(month)).length;
    const userCounts = {};
    const moduleCounts = {};
    normalized.forEach(l => {
      userCounts[l.operator] = (userCounts[l.operator] || 0) + 1;
      moduleCounts[l.entity] = (moduleCounts[l.entity] || 0) + 1;
    });
    const topUser = Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0];
    const topModule = Object.entries(moduleCounts).sort((a, b) => b[1] - a[1])[0];
    return { todayCount, monthCount, topUser: topUser ? `${topUser[0]} (${topUser[1]})` : '-', topModule: topModule ? `${topModule[0]} (${topModule[1]})` : '-' };
  }, [normalized]);

  // ── Copy to clipboard ──
  const handleExport = () => {
    const header = '時間\t操作\t模組\t操作者\t詳細';
    const rows = filtered.map(l => `${fmtTs(l.ts)}\t${l.op}\t${l.entity}\t${l.operator}\t${JSON.stringify(l.changes)}`);
    navigator.clipboard.writeText(header + '\n' + rows.join('\n')).then(() => showToast('已複製審計記錄到剪貼板'));
  };

  // ── Print ──
  const handlePrint = () => {
    const clinic = getClinicName();
    const win = window.open('', '_blank');
    const rows = filtered.slice(0, 200).map(l => `<tr><td>${escapeHtml(fmtTs(l.ts))}</td><td>${escapeHtml(l.op)}</td><td>${escapeHtml(l.entity)}</td><td>${escapeHtml(l.operator)}</td><td style="max-width:300px;word-break:break-all;font-size:11px">${escapeHtml(JSON.stringify(l.changes))}</td></tr>`).join('');
    win.document.write(`<html><head><title>審計報告</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}th{background:#0e7490;color:#fff}h2{color:#0e7490}</style></head><body><h2>${escapeHtml(clinic)} — 審計報告</h2><p>列印日期: ${new Date().toLocaleDateString('zh-HK')} | 共 ${filtered.length} 條記錄</p><table><tr><th>時間</th><th>操作</th><th>模組</th><th>操作者</th><th>詳細</th></tr>${rows}</table></body></html>`);
    win.document.close();
    win.print();
  };

  // ── Detail Modal ──
  const renderDetail = () => {
    if (!selected) return null;
    const changes = selected.changes || {};
    const keys = Object.keys(changes);
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setSelected(null)}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 700, width: '95%', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: '#0e7490' }}>操作詳情</h3>
            <button style={sOutline} onClick={() => setSelected(null)}>關閉</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 13 }}>
            <div><b>操作類型:</b> {selected.op}</div>
            <div><b>模組:</b> {selected.entity}</div>
            <div><b>操作者:</b> {selected.operator}</div>
            <div><b>時間:</b> {fmtTs(selected.ts)}</div>
            {selected.entityId && <div style={{ gridColumn: '1/3' }}><b>記錄編號:</b> {selected.entityId}</div>}
          </div>
          {keys.length > 0 ? (
            <>
              <h4 style={{ color: '#334155', margin: '12px 0 8px' }}>修改前 / 修改後 對比</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr><th style={{ ...sTh, width: '25%' }}>欄位</th><th style={{ ...sTh, width: '37%' }}>修改前</th><th style={{ ...sTh, width: '37%' }}>修改後</th></tr></thead>
                <tbody>{keys.map(k => {
                  const changed = JSON.stringify(changes[k]?.from) !== JSON.stringify(changes[k]?.to);
                  const bg = changed ? '#fef9c3' : '#f8fafc';
                  const color = changed ? '#92400e' : '#94a3b8';
                  return (<tr key={k} style={{ background: bg }}><td style={{ ...sTd, fontWeight: 600, color }}>{k}</td><td style={{ ...sTd, color }}>{String(changes[k]?.from ?? '-')}</td><td style={{ ...sTd, color }}>{String(changes[k]?.to ?? '-')}</td></tr>);
                })}</tbody>
              </table>
            </>
          ) : <p style={{ color: '#94a3b8', fontSize: 13 }}>此操作沒有欄位變更記錄</p>}
        </div>
      </div>
    );
  };

  // ── Stat Cards ──
  const statItems = [
    { label: '今日操作數', value: stats.todayCount, icon: '📊' },
    { label: '本月操作數', value: stats.monthCount, icon: '📅' },
    { label: '最活躍用戶', value: stats.topUser, icon: '👤' },
    { label: '最多修改的模組', value: stats.topModule, icon: '🏷' },
  ];

  return (
    <div style={S.page}>
      <div style={S.titleBar}>系統 &gt; 修改日誌</div>
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: '#0e7490' }}>審計日誌</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={sOutline} onClick={handleExport}>複製到剪貼板</button>
          <button style={sPrimary} onClick={handlePrint}>列印報告</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {statItems.map(s => (
          <div key={s.label} style={{ ...sCard, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>{s.icon}</span>
            <div><div style={{ fontSize: 12, color: '#64748b' }}>{s.label}</div><div style={{ fontSize: 18, fontWeight: 700, color: '#0e7490' }}>{s.value}</div></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...sCard, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: '#475569' }}>日期:</label>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} style={sInput} />
        <span style={{ fontSize: 13 }}>至</span>
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} style={sInput} />
        <select value={opFilter} onChange={e => { setOpFilter(e.target.value); setPage(0); }} style={sSelect}>
          {OP_TYPES.map(o => <option key={o}>{o}</option>)}
        </select>
        <select value={entityFilter} onChange={e => { setEntityFilter(e.target.value); setPage(0); }} style={sSelect}>
          {ENTITY_TYPES.map(o => <option key={o}>{o}</option>)}
        </select>
        <input placeholder="搜索姓名/操作者" value={keyword} onChange={e => { setKeyword(e.target.value); setPage(0); }} style={{ ...sInput, minWidth: 140 }} />
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>共 {filtered.length} 條記錄</span>
      </div>

      {/* Table */}
      <div style={{ ...sCard, overflowX: 'auto', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['顧客姓名', '顧客編號', '修改時間', '操作類型', '模組', '修改摘要', '申請人'].map(h => <th key={h} style={sTh}>{h}</th>)}
          </tr></thead>
          <tbody>
            {paged.length === 0 && <tr><td colSpan={7} style={{ ...sTd, textAlign: 'center', color: '#94a3b8', padding: 32 }}>沒有審計記錄</td></tr>}
            {paged.map((l, i) => {
              const changedKeys = Object.keys(l.changes || {});
              const summary = changedKeys.length > 0 ? changedKeys.slice(0, 3).join(', ') + (changedKeys.length > 3 ? '...' : '') : (typeof l.detail === 'string' ? l.detail : '-');
              return (
                <tr key={i} style={{ cursor: 'pointer', transition: 'background .15s' }} onClick={() => setSelected(l)} onMouseEnter={e => e.currentTarget.style.background = '#f0fdfa'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={sTd}>{l.patientName || '-'}</td>
                  <td style={{ ...sTd, fontSize: 12, color: '#64748b' }}>{l.entityId || '-'}</td>
                  <td style={{ ...sTd, whiteSpace: 'nowrap', fontSize: 12 }}>{fmtTs(l.ts)}</td>
                  <td style={sTd}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, color: '#fff', background: OP_COLORS[l.op] || '#64748b' }}>{l.op}</span></td>
                  <td style={sTd}>{l.entity}</td>
                  <td style={{ ...sTd, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: '#475569' }}>{summary}</td>
                  <td style={sTd}>{l.operator}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          <button style={sOutline} disabled={page === 0} onClick={() => setPage(p => p - 1)}>上一頁</button>
          <span style={{ padding: '6px 12px', fontSize: 13, color: '#475569' }}>第 {page + 1} / {totalPages} 頁</span>
          <button style={sOutline} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>下一頁</button>
        </div>
      )}

      {renderDetail()}
    </div>
    </div>
  );
}
