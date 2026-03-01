import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const LS_INS = 'hcmc_clinic_insurance';
const LS_CLM = 'hcmc_insurance_claims_log';
const today = () => new Date().toISOString().substring(0, 10);
const load = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const diffDays = d => Math.ceil((new Date(d) - new Date()) / 86400000);
const fmtK = n => { const v = Number(n) || 0; return v >= 10000 ? `$${(v / 10000).toFixed(1)}萬` : `$${v.toLocaleString()}`; };
const fmtD = n => `$${(Number(n) || 0).toLocaleString()}`;

const TYPES = ['專業責任保險', '公眾責任保險', '僱員補償保險', '火險', '盜竊保險', '醫療設備保險'];
const STATUS_LABELS = { active: '生效中', expired: '已過期', pending: '待生效' };
const STATUS_COLORS = { active: '#16a34a', expired: '#dc2626', pending: '#d97706' };
const STATUS_BG = { active: '#f0fdf4', expired: '#fef2f2', pending: '#fffbeb' };

const cardS = { background: '#fff', borderRadius: 10, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.08)', marginBottom: 14 };
const btnS = { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnOutS = { ...btnS, background: '#fff', color: ACCENT, border: `1.5px solid ${ACCENT}` };
const btnSmS = c => ({ padding: '4px 10px', background: c || ACCENT, color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 });
const inputS = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const thS = { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' };
const tdS = { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 14 };
const tabS = a => ({ padding: '8px 18px', border: 'none', borderBottom: a ? `3px solid ${ACCENT}` : '3px solid transparent', background: 'none', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? ACCENT : '#6b7280', fontSize: 14 });

const EMPTY_POLICY = { insurer: '', policyNumber: '', type: TYPES[0], premium: '', coverAmount: '', startDate: today(), endDate: '', status: 'active', renewalDate: '', agent: '', agentPhone: '', notes: '' };
const EMPTY_CLAIM = { policyId: '', date: today(), amount: '', description: '', status: '處理中', result: '', notes: '' };

export default function ClinicInsurance({ data, showToast, user }) {
  const [policies, setPolicies] = useState(() => load(LS_INS));
  const [claims, setClaims] = useState(() => load(LS_CLM));
  const [tab, setTab] = useState('dashboard');
  const [form, setForm] = useState({ ...EMPTY_POLICY });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [claimForm, setClaimForm] = useState({ ...EMPTY_CLAIM });
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const persistP = list => { setPolicies(list); save(LS_INS, list); };
  const persistC = list => { setClaims(list); save(LS_CLM, list); };
  const resetForm = () => { setForm({ ...EMPTY_POLICY }); setEditId(null); setShowForm(false); };
  const resetClaimForm = () => { setClaimForm({ ...EMPTY_CLAIM }); setShowClaimForm(false); };

  /* derive status from dates */
  const deriveStatus = p => {
    const t = today();
    if (p.startDate > t) return 'pending';
    if (p.endDate && p.endDate < t) return 'expired';
    return 'active';
  };

  /* stats */
  const stats = useMemo(() => {
    const active = policies.filter(p => deriveStatus(p) === 'active');
    const totalPremium = active.reduce((s, p) => s + (Number(p.premium) || 0), 0);
    const totalCover = active.reduce((s, p) => s + (Number(p.coverAmount) || 0), 0);
    const renewalSoon = policies.filter(p => p.endDate && diffDays(p.endDate) >= 0 && diffDays(p.endDate) <= 30 && deriveStatus(p) !== 'expired').length;
    const expired = policies.filter(p => deriveStatus(p) === 'expired').length;
    const totalClaims = claims.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    return { activeCount: active.length, totalPremium, totalCover, renewalSoon, expired, totalClaims, claimCount: claims.length };
  }, [policies, claims]);

  /* renewal alerts (30 days) */
  const renewalAlerts = useMemo(() => policies.filter(p => {
    if (deriveStatus(p) === 'expired') return false;
    const d = diffDays(p.endDate || p.renewalDate);
    return d >= 0 && d <= 30;
  }).sort((a, b) => diffDays(a.endDate) - diffDays(b.endDate)), [policies]);

  /* save policy */
  const handleSave = () => {
    if (!form.insurer || !form.policyNumber || !form.endDate) { showToast('請填寫保險公司、保單號碼及到期日', 'error'); return; }
    let next;
    if (editId) {
      next = policies.map(p => p.id === editId ? { ...p, ...form, status: deriveStatus(form) } : p);
    } else {
      next = [...policies, { ...form, id: uid(), status: deriveStatus(form), createdAt: today(), createdBy: user?.name || '' }];
    }
    persistP(next); showToast(editId ? '保單已更新' : '保單已新增'); resetForm();
  };

  const handleDelete = id => {
    if (!window.confirm('確定刪除此保單？')) return;
    persistP(policies.filter(p => p.id !== id));
    persistC(claims.filter(c => c.policyId !== id));
    showToast('保單已刪除');
  };

  const handleEdit = p => { setForm({ insurer: p.insurer, policyNumber: p.policyNumber, type: p.type, premium: p.premium, coverAmount: p.coverAmount, startDate: p.startDate, endDate: p.endDate, status: p.status, renewalDate: p.renewalDate, agent: p.agent, agentPhone: p.agentPhone, notes: p.notes }); setEditId(p.id); setShowForm(true); setTab('policies'); };

  /* save claim */
  const handleSaveClaim = () => {
    if (!claimForm.policyId || !claimForm.amount || !claimForm.description) { showToast('請填寫保單、金額及描述', 'error'); return; }
    const next = [...claims, { ...claimForm, id: uid(), createdAt: today(), createdBy: user?.name || '' }];
    persistC(next); showToast('索賠記錄已新增'); resetClaimForm();
  };

  const handleDeleteClaim = id => {
    if (!window.confirm('確定刪除此索賠記錄？')) return;
    persistC(claims.filter(c => c.id !== id)); showToast('索賠記錄已刪除');
  };

  /* print */
  const printSchedule = () => {
    const clinic = getClinicName();
    const rows = policies.map(p => {
      const st = deriveStatus(p);
      return `<tr><td>${escapeHtml(p.type)}</td><td>${escapeHtml(p.insurer)}</td><td>${escapeHtml(p.policyNumber)}</td><td>${fmtD(p.premium)}</td><td>${fmtD(p.coverAmount)}</td><td>${p.startDate} ~ ${p.endDate}</td><td style="color:${STATUS_COLORS[st]}">${escapeHtml(STATUS_LABELS[st])}</td><td>${escapeHtml(p.agent || '-')}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>保險一覽表</title>
<style>body{font-family:sans-serif;padding:40px;color:#333}h1{color:${ACCENT};margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
th{background:#f9fafb}.sub{color:#888;font-size:13px;margin-bottom:20px}
.summary{margin-top:20px;padding:14px;background:#f0fdfa;border-radius:8px;font-size:14px}
.footer{margin-top:40px;font-size:12px;color:#888;border-top:1px solid #eee;padding-top:12px}
@media print{body{padding:20px}}</style></head><body>
<h1>${escapeHtml(clinic)} — 保險一覽表</h1><div class="sub">列印時間：${new Date().toLocaleString('zh-HK')}</div>
<div class="summary"><strong>生效保單：</strong>${stats.activeCount} 份 | <strong>年度保費：</strong>${fmtD(stats.totalPremium)} | <strong>總保額：</strong>${fmtD(stats.totalCover)}</div>
<table><thead><tr><th>保險類型</th><th>保險公司</th><th>保單號碼</th><th>年保費</th><th>保額</th><th>保障期間</th><th>狀態</th><th>經紀</th></tr></thead>
<tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:#aaa">暫無保單</td></tr>'}</tbody></table>
<div class="footer"><p>${escapeHtml(clinic)} - 保險管理</p></div>
<script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  };

  /* detail view */
  const detailPolicy = detailId ? policies.find(p => p.id === detailId) : null;
  const detailClaims = detailId ? claims.filter(c => c.policyId === detailId) : [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ color: ACCENT, marginBottom: 4 }}>診所保險管理</h2>
      <p style={{ color: '#888', marginTop: 0, marginBottom: 16, fontSize: 14 }}>管理診所各類保險保單、續保提醒及索賠記錄</p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: '生效保單', val: stats.activeCount, unit: '份' },
          { label: '年度保費', val: fmtD(stats.totalPremium) },
          { label: '總保額', val: fmtK(stats.totalCover) },
          { label: '即將續保', val: stats.renewalSoon, unit: '份', warn: stats.renewalSoon > 0 },
          { label: '索賠總額', val: fmtD(stats.totalClaims) },
        ].map((s, i) => (
          <div key={i} style={{ ...cardS, textAlign: 'center', borderLeft: s.warn ? '4px solid #f59e0b' : `4px solid ${ACCENT}` }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.warn ? '#d97706' : ACCENT }}>{s.val}{s.unit && <span style={{ fontSize: 13, fontWeight: 400 }}> {s.unit}</span>}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        {[['dashboard', '總覽'], ['policies', '保單列表'], ['claims', `索賠記錄 (${claims.length})`], ['renewals', `續保提醒 (${renewalAlerts.length})`]].map(([k, l]) => (
          <button key={k} style={tabS(tab === k)} onClick={() => { setTab(k); setDetailId(null); }}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button style={{ ...btnOutS, padding: '4px 14px', fontSize: 13 }} onClick={printSchedule}>列印保險一覽</button>
      </div>

      {/* ===== DASHBOARD ===== */}
      {tab === 'dashboard' && !detailId && <>
        {/* Renewal alerts banner */}
        {renewalAlerts.length > 0 && (
          <div style={{ ...cardS, background: '#fffbeb', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8 }}>續保提醒（30日內到期）</div>
            {renewalAlerts.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #fde68a' }}>
                <span><strong>{p.type}</strong> — {p.insurer}（{p.policyNumber}）</span>
                <span style={{ color: '#d97706', fontWeight: 600 }}>剩餘 {diffDays(p.endDate)} 天</span>
              </div>
            ))}
          </div>
        )}

        {/* Coverage summary by type */}
        <div style={cardS}>
          <h3 style={{ margin: '0 0 12px', color: ACCENT }}>保險覆蓋概覽</h3>
          {TYPES.map(t => {
            const matched = policies.filter(p => p.type === t && deriveStatus(p) === 'active');
            const hasCover = matched.length > 0;
            return (
              <div key={t} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 6, marginBottom: 6, background: hasCover ? '#f0fdf4' : '#fef2f2' }}>
                <span style={{ fontWeight: 600 }}>{t}</span>
                {hasCover ? (
                  <span style={{ color: '#16a34a', fontSize: 13 }}>已投保 — {matched.map(m => m.insurer).join(', ')} | 保額 {fmtD(matched.reduce((s, m) => s + (Number(m.coverAmount) || 0), 0))}</span>
                ) : (
                  <span style={{ color: '#dc2626', fontSize: 13 }}>未投保</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Premium breakdown */}
        <div style={cardS}>
          <h3 style={{ margin: '0 0 12px', color: ACCENT }}>保費分佈</h3>
          {policies.filter(p => deriveStatus(p) === 'active').length === 0 && <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: 20 }}>暫無生效保單</div>}
          {policies.filter(p => deriveStatus(p) === 'active').map(p => {
            const pct = stats.totalPremium > 0 ? ((Number(p.premium) || 0) / stats.totalPremium * 100) : 0;
            return (
              <div key={p.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span>{p.type} — {p.insurer}</span>
                  <span style={{ fontWeight: 600 }}>{fmtD(p.premium)} ({pct.toFixed(1)}%)</span>
                </div>
                <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4 }}>
                  <div style={{ height: 8, background: ACCENT, borderRadius: 4, width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </>}

      {/* ===== POLICY DETAIL ===== */}
      {detailId && detailPolicy && <>
        <button style={{ ...btnOutS, padding: '4px 14px', fontSize: 13, marginBottom: 14 }} onClick={() => setDetailId(null)}>返回列表</button>
        <div style={{ ...cardS, border: `2px solid ${ACCENT}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: '0 0 6px', color: ACCENT }}>{detailPolicy.type}</h3>
              <div style={{ fontSize: 13, color: '#6b7280' }}>保單號碼：{detailPolicy.policyNumber}</div>
            </div>
            <span style={{ padding: '3px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: STATUS_COLORS[deriveStatus(detailPolicy)], background: STATUS_BG[deriveStatus(detailPolicy)] }}>{STATUS_LABELS[deriveStatus(detailPolicy)]}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 14, fontSize: 14 }}>
            <div><span style={{ color: '#6b7280', fontSize: 12 }}>保險公司</span><br />{detailPolicy.insurer}</div>
            <div><span style={{ color: '#6b7280', fontSize: 12 }}>年保費</span><br />{fmtD(detailPolicy.premium)}</div>
            <div><span style={{ color: '#6b7280', fontSize: 12 }}>保額</span><br />{fmtD(detailPolicy.coverAmount)}</div>
            <div><span style={{ color: '#6b7280', fontSize: 12 }}>保障期間</span><br />{detailPolicy.startDate} ~ {detailPolicy.endDate}</div>
            <div><span style={{ color: '#6b7280', fontSize: 12 }}>續保日期</span><br />{detailPolicy.renewalDate || '-'}</div>
            <div><span style={{ color: '#6b7280', fontSize: 12 }}>經紀人</span><br />{detailPolicy.agent || '-'} {detailPolicy.agentPhone ? `(${detailPolicy.agentPhone})` : ''}</div>
          </div>
          {detailPolicy.notes && <div style={{ marginTop: 12, padding: 10, background: '#f9fafb', borderRadius: 6, fontSize: 13 }}><strong>備註：</strong>{detailPolicy.notes}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button style={btnSmS()} onClick={() => handleEdit(detailPolicy)}>編輯</button>
            <button style={btnSmS('#dc2626')} onClick={() => { handleDelete(detailPolicy.id); setDetailId(null); setTab('policies'); }}>刪除</button>
          </div>
        </div>

        {/* Claims for this policy */}
        <div style={cardS}>
          <h4 style={{ margin: '0 0 10px', color: ACCENT }}>索賠記錄（{detailClaims.length}）</h4>
          {detailClaims.length === 0 && <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: 12 }}>暫無索賠記錄</div>}
          {detailClaims.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
              <div><strong>{c.date}</strong> — {c.description}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{fmtD(c.amount)}</span>
                <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, background: c.status === '已批核' ? '#f0fdf4' : c.status === '已拒絕' ? '#fef2f2' : '#fffbeb', color: c.status === '已批核' ? '#16a34a' : c.status === '已拒絕' ? '#dc2626' : '#d97706' }}>{c.status}</span>
              </div>
            </div>
          ))}
        </div>
      </>}

      {/* ===== POLICIES TAB ===== */}
      {tab === 'policies' && !detailId && <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button style={btnS} onClick={() => { resetForm(); setShowForm(true); }}>+ 新增保單</button>
        </div>

        {showForm && (
          <div style={{ ...cardS, border: `2px solid ${ACCENT}`, marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 12px', color: ACCENT }}>{editId ? '編輯保單' : '新增保單'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 13 }}>保險公司 *<input style={inputS} value={form.insurer} onChange={e => setForm({ ...form, insurer: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>保單號碼 *<input style={inputS} value={form.policyNumber} onChange={e => setForm({ ...form, policyNumber: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>保險類型
                <select style={inputS} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>年保費 (HKD)<input type="number" style={inputS} value={form.premium} onChange={e => setForm({ ...form, premium: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>保額 (HKD)<input type="number" style={inputS} value={form.coverAmount} onChange={e => setForm({ ...form, coverAmount: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>開始日期<input type="date" style={inputS} value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>到期日 *<input type="date" style={inputS} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>續保日期<input type="date" style={inputS} value={form.renewalDate} onChange={e => setForm({ ...form, renewalDate: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>經紀人<input style={inputS} value={form.agent} onChange={e => setForm({ ...form, agent: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>經紀電話<input style={inputS} value={form.agentPhone} onChange={e => setForm({ ...form, agentPhone: e.target.value })} /></label>
            </div>
            <label style={{ fontSize: 13, display: 'block', marginTop: 10 }}>備註<textarea style={{ ...inputS, minHeight: 50 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={btnS} onClick={handleSave}>{editId ? '更新保單' : '新增保單'}</button>
              <button style={btnOutS} onClick={resetForm}>取消</button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['保險類型', '保險公司', '保單號碼', '年保費', '保額', '到期日', '狀態', '操作'].map(h => <th key={h} style={thS}>{h}</th>)}
            </tr></thead>
            <tbody>
              {policies.length === 0 && <tr><td colSpan={8} style={{ ...tdS, textAlign: 'center', color: '#aaa' }}>暫無保單，點擊「+ 新增保單」開始</td></tr>}
              {policies.map(p => {
                const st = deriveStatus(p);
                const daysLeft = p.endDate ? diffDays(p.endDate) : null;
                return (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(p.id)}>
                    <td style={tdS}><strong>{p.type}</strong></td>
                    <td style={tdS}>{p.insurer}</td>
                    <td style={tdS}>{p.policyNumber}</td>
                    <td style={tdS}>{fmtD(p.premium)}</td>
                    <td style={tdS}>{fmtD(p.coverAmount)}</td>
                    <td style={tdS}>{p.endDate}{daysLeft !== null && daysLeft >= 0 && daysLeft <= 30 && <span style={{ marginLeft: 6, fontSize: 11, color: '#d97706', background: '#fffbeb', padding: '1px 6px', borderRadius: 8 }}>剩{daysLeft}天</span>}</td>
                    <td style={tdS}><span style={{ padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: STATUS_COLORS[st], background: STATUS_BG[st] }}>{STATUS_LABELS[st]}</span></td>
                    <td style={tdS} onClick={e => e.stopPropagation()}>
                      <button style={btnSmS()} onClick={() => handleEdit(p)}>編輯</button>{' '}
                      <button style={btnSmS('#dc2626')} onClick={() => handleDelete(p.id)}>刪除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}

      {/* ===== CLAIMS TAB ===== */}
      {tab === 'claims' && !detailId && <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button style={btnS} onClick={() => { resetClaimForm(); setShowClaimForm(true); }}>+ 新增索賠</button>
        </div>

        {showClaimForm && (
          <div style={{ ...cardS, border: `2px solid ${ACCENT}`, marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 12px', color: ACCENT }}>新增索賠記錄</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 13 }}>保單 *
                <select style={inputS} value={claimForm.policyId} onChange={e => setClaimForm({ ...claimForm, policyId: e.target.value })}>
                  <option value="">請選擇保單</option>
                  {policies.map(p => <option key={p.id} value={p.id}>{p.type} - {p.insurer} ({p.policyNumber})</option>)}
                </select>
              </label>
              <label style={{ fontSize: 13 }}>日期<input type="date" style={inputS} value={claimForm.date} onChange={e => setClaimForm({ ...claimForm, date: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>索賠金額 (HKD) *<input type="number" style={inputS} value={claimForm.amount} onChange={e => setClaimForm({ ...claimForm, amount: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}>狀態
                <select style={inputS} value={claimForm.status} onChange={e => setClaimForm({ ...claimForm, status: e.target.value })}>
                  {['處理中', '已批核', '已拒絕'].map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <label style={{ fontSize: 13, display: 'block', marginTop: 10 }}>描述 *<textarea style={{ ...inputS, minHeight: 50 }} value={claimForm.description} onChange={e => setClaimForm({ ...claimForm, description: e.target.value })} /></label>
            <label style={{ fontSize: 13, display: 'block', marginTop: 10 }}>備註<input style={inputS} value={claimForm.notes} onChange={e => setClaimForm({ ...claimForm, notes: e.target.value })} /></label>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={btnS} onClick={handleSaveClaim}>新增索賠</button>
              <button style={btnOutS} onClick={resetClaimForm}>取消</button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['日期', '保單', '描述', '金額', '狀態', '操作'].map(h => <th key={h} style={thS}>{h}</th>)}
            </tr></thead>
            <tbody>
              {claims.length === 0 && <tr><td colSpan={6} style={{ ...tdS, textAlign: 'center', color: '#aaa' }}>暫無索賠記錄</td></tr>}
              {[...claims].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(c => {
                const pol = policies.find(p => p.id === c.policyId);
                return (
                  <tr key={c.id}>
                    <td style={tdS}>{c.date}</td>
                    <td style={tdS}>{pol ? `${pol.type} (${pol.policyNumber})` : '—'}</td>
                    <td style={tdS}>{c.description}</td>
                    <td style={tdS}><strong>{fmtD(c.amount)}</strong></td>
                    <td style={tdS}><span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: c.status === '已批核' ? '#f0fdf4' : c.status === '已拒絕' ? '#fef2f2' : '#fffbeb', color: c.status === '已批核' ? '#16a34a' : c.status === '已拒絕' ? '#dc2626' : '#d97706' }}>{c.status}</span></td>
                    <td style={tdS}><button style={btnSmS('#dc2626')} onClick={() => handleDeleteClaim(c.id)}>刪除</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}

      {/* ===== RENEWALS TAB ===== */}
      {tab === 'renewals' && !detailId && (
        <div>
          {renewalAlerts.length === 0 && <div style={{ ...cardS, textAlign: 'center', color: '#aaa', padding: 40 }}>30日內無需續保的保單</div>}
          {renewalAlerts.map(p => {
            const days = diffDays(p.endDate);
            return (
              <div key={p.id} style={{ ...cardS, borderLeft: days <= 7 ? '4px solid #dc2626' : days <= 14 ? '4px solid #f59e0b' : `4px solid ${ACCENT}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{p.type}</strong>
                    <span style={{ marginLeft: 10, fontSize: 13, color: '#6b7280' }}>{p.insurer} — {p.policyNumber}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: days <= 7 ? '#dc2626' : '#d97706' }}>{days} 天</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>到期：{p.endDate}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 13, color: '#555' }}>
                  <span>保費：{fmtD(p.premium)}</span>
                  <span>保額：{fmtD(p.coverAmount)}</span>
                  {p.agent && <span>經紀：{p.agent} {p.agentPhone ? `(${p.agentPhone})` : ''}</span>}
                </div>
                <div style={{ marginTop: 10 }}>
                  <button style={btnSmS()} onClick={() => setDetailId(p.id)}>查看詳情</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
