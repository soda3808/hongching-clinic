// Patient Insurance Information & Claim Tracking (病人保險管理)
// Manage insurance details, submit claims, track status, print summaries

import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';

const LS_KEY = 'hcmc_patient_insurance';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || { policies: [], claims: [], directory: [] }; } catch { return { policies: [], claims: [], directory: [] }; } };
const save = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));
const today = () => new Date().toISOString().substring(0, 10);
const fmtA = (n) => `$${Math.round(Number(n || 0)).toLocaleString('en-HK')}`;
const ACC = '#0e7490';
const COVERAGE_TYPES = ['門診', '住院', '中醫'];
const CLAIM_STATUSES = ['待審批', '已批核', '已拒絕', '已賠付'];
const STATUS_COLORS = { '待審批': '#d97706', '已批核': '#2563eb', '已拒絕': '#dc2626', '已賠付': '#16a34a' };

const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #e5e7eb' };
const inp = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' };
const btn = (bg = ACC) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 });
const lbl = { fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block', color: '#334155' };
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modal = { background: '#fff', borderRadius: 12, padding: 24, width: '95%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' };
const badge = (status) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: (STATUS_COLORS[status] || '#64748b') + '22', color: STATUS_COLORS[status] || '#64748b' });

export default function PatientInsurance({ data, showToast, user }) {
  const clinicName = getClinicName();
  const patients = data.patients || [];
  const [store, setStore] = useState(load);
  const [search, setSearch] = useState('');
  const [selPatient, setSelPatient] = useState(null);
  const [tab, setTab] = useState('policies');
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showDirModal, setShowDirModal] = useState(false);
  const [policyForm, setPolicyForm] = useState(null);
  const [claimForm, setClaimForm] = useState(null);
  const [dirForm, setDirForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' });
  const [editDirId, setEditDirId] = useState(null);

  const persist = (next) => { setStore(next); save(next); };

  // Patient search suggestions
  const suggestions = useMemo(() => {
    if (!search || selPatient) return [];
    const q = search.toLowerCase();
    return patients.filter(p => p.name.toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [search, selPatient, patients]);

  // Policies for selected patient
  const patientPolicies = useMemo(() => {
    if (!selPatient) return [];
    return store.policies.filter(p => p.patientId === selPatient.id);
  }, [store.policies, selPatient]);

  // Claims for selected patient
  const patientClaims = useMemo(() => {
    if (!selPatient) return [];
    return store.claims.filter(c => c.patientId === selPatient.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [store.claims, selPatient]);

  // Auto-calculations
  const stats = useMemo(() => {
    const totalClaimed = patientClaims.reduce((s, c) => s + Number(c.amount || 0), 0);
    const totalCoverage = patientPolicies.reduce((s, p) => s + Number(p.coverageAmount || 0), 0);
    const remaining = Math.max(0, totalCoverage - totalClaimed);
    const approved = patientClaims.filter(c => c.status === '已批核' || c.status === '已賠付').length;
    const total = patientClaims.length;
    const successRate = total > 0 ? Math.round(approved / total * 100) : 0;
    return { totalClaimed, totalCoverage, remaining, successRate, total, approved };
  }, [patientClaims, patientPolicies]);

  // Expiry alerts: policies expiring within 30 days
  const expiryAlerts = useMemo(() => {
    const now = new Date();
    const threshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return store.policies.filter(p => {
      if (!p.expiryDate) return false;
      const exp = new Date(p.expiryDate);
      return exp >= now && exp <= threshold;
    }).map(p => {
      const patient = patients.find(pt => pt.id === p.patientId);
      const days = Math.ceil((new Date(p.expiryDate) - now) / (1000 * 60 * 60 * 24));
      return { ...p, patientName: patient?.name || p.patientName || '未知', daysLeft: days };
    });
  }, [store.policies, patients]);

  // ── Policy CRUD ──
  const openAddPolicy = () => {
    setPolicyForm({ company: '', policyNumber: '', coverageType: '中醫', coverageAmount: '', expiryDate: '' });
    setShowPolicyModal(true);
  };
  const openEditPolicy = (p) => { setPolicyForm({ ...p }); setShowPolicyModal(true); };
  const savePolicy = () => {
    if (!policyForm.company || !policyForm.policyNumber) { showToast('請填寫保險公司及保單號碼', 'error'); return; }
    let next;
    if (policyForm.id) {
      next = { ...store, policies: store.policies.map(p => p.id === policyForm.id ? { ...policyForm } : p) };
    } else {
      const pol = { ...policyForm, id: uid(), patientId: selPatient.id, patientName: selPatient.name, createdAt: today() };
      next = { ...store, policies: [...store.policies, pol] };
    }
    persist(next); setShowPolicyModal(false); setPolicyForm(null);
    showToast(policyForm.id ? '保險資料已更新' : '保險資料已新增');
  };
  const deletePolicy = (id) => {
    if (!window.confirm('確定刪除此保險記錄？')) return;
    persist({ ...store, policies: store.policies.filter(p => p.id !== id) });
    showToast('已刪除');
  };

  // ── Claim CRUD ──
  const openAddClaim = () => {
    setClaimForm({ date: today(), amount: '', status: '待審批', policyId: patientPolicies[0]?.id || '', description: '' });
    setShowClaimModal(true);
  };
  const saveClaim = () => {
    if (!claimForm.amount || Number(claimForm.amount) <= 0) { showToast('請輸入索償金額', 'error'); return; }
    let next;
    if (claimForm.id) {
      next = { ...store, claims: store.claims.map(c => c.id === claimForm.id ? { ...claimForm } : c) };
    } else {
      const clm = { ...claimForm, id: uid(), claimId: 'CLM-' + Date.now().toString(36).toUpperCase().slice(-6), patientId: selPatient.id, patientName: selPatient.name, createdAt: today(), createdBy: user?.name || '系統' };
      next = { ...store, claims: [...store.claims, clm] };
    }
    persist(next); setShowClaimModal(false); setClaimForm(null);
    showToast(claimForm.id ? '索償記錄已更新' : '索償已提交');
  };
  const updateClaimStatus = (id, status) => {
    persist({ ...store, claims: store.claims.map(c => c.id === id ? { ...c, status } : c) });
    showToast(`狀態已更新為「${status}」`);
  };
  const deleteClaim = (id) => {
    if (!window.confirm('確定刪除此索償記錄？')) return;
    persist({ ...store, claims: store.claims.filter(c => c.id !== id) });
    showToast('已刪除');
  };

  // ── Insurance Directory ──
  const saveDirEntry = () => {
    if (!dirForm.name) { showToast('請輸入公司名稱', 'error'); return; }
    let next;
    if (editDirId) {
      next = { ...store, directory: store.directory.map(d => d.id === editDirId ? { ...dirForm, id: editDirId } : d) };
    } else {
      next = { ...store, directory: [...store.directory, { ...dirForm, id: uid() }] };
    }
    persist(next); setShowDirModal(false); setDirForm({ name: '', phone: '', email: '', address: '', notes: '' }); setEditDirId(null);
    showToast(editDirId ? '已更新' : '已新增保險公司');
  };
  const deleteDirEntry = (id) => {
    if (!window.confirm('確定刪除？')) return;
    persist({ ...store, directory: store.directory.filter(d => d.id !== id) });
    showToast('已刪除');
  };

  // ── Print ──
  const printSummary = () => {
    const w = window.open('', '_blank');
    const polRows = patientPolicies.map(p => `<tr><td>${p.company}</td><td>${p.policyNumber}</td><td>${p.coverageType}</td><td>${fmtA(p.coverageAmount)}</td><td>${p.expiryDate || '-'}</td></tr>`).join('');
    const clmRows = patientClaims.map(c => {
      const pol = store.policies.find(p => p.id === c.policyId);
      return `<tr><td>${c.claimId || '-'}</td><td>${c.date}</td><td>${pol?.company || '-'}</td><td>${fmtA(c.amount)}</td><td>${c.status}</td><td>${c.description || ''}</td></tr>`;
    }).join('');
    w.document.write(`<html><head><title>保險摘要</title><style>body{font-family:sans-serif;padding:24px;color:#1e293b}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px}th{background:#f0fdfa}h2{color:${ACC}}h3{margin-top:20px;color:#334155}.stats{display:flex;gap:20px;margin:12px 0}.stat{padding:8px 16px;background:#f0fdfa;border-radius:8px}.stat b{color:${ACC}}</style></head><body>`);
    w.document.write(`<h2>${clinicName} — 病人保險摘要</h2>`);
    w.document.write(`<p><b>病人：</b>${selPatient.name}　<b>電話：</b>${selPatient.phone || '-'}　<b>列印日期：</b>${today()}</p>`);
    w.document.write(`<div class="stats"><div class="stat">總保額：<b>${fmtA(stats.totalCoverage)}</b></div><div class="stat">已索償：<b>${fmtA(stats.totalClaimed)}</b></div><div class="stat">餘額：<b>${fmtA(stats.remaining)}</b></div><div class="stat">成功率：<b>${stats.successRate}%</b></div></div>`);
    w.document.write(`<h3>保險資料</h3><table><tr><th>保險公司</th><th>保單號碼</th><th>保障類型</th><th>保額</th><th>到期日</th></tr>${polRows || '<tr><td colspan="5" style="text-align:center">暫無記錄</td></tr>'}</table>`);
    w.document.write(`<h3>索償記錄</h3><table><tr><th>索償編號</th><th>日期</th><th>保險公司</th><th>金額</th><th>狀態</th><th>描述</th></tr>${clmRows || '<tr><td colspan="6" style="text-align:center">暫無記錄</td></tr>'}</table>`);
    w.document.write('<script>window.print()<\/script></body></html>');
    w.document.close();
  };

  // ── Stat card helper ──
  const StatCard = ({ title, value, color }) => (
    <div style={{ flex: '1 1 130px', background: '#fff', borderRadius: 10, padding: '12px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', borderTop: `3px solid ${color || ACC}` }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || ACC, marginTop: 4 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ padding: 16, maxWidth: 1000, margin: '0 auto' }}>
      <h2 style={{ color: ACC, margin: '0 0 16px' }}>病人保險管理</h2>

      {/* Expiry Alerts */}
      {expiryAlerts.length > 0 && (
        <div style={{ ...card, background: '#fffbeb', borderColor: '#f59e0b' }}>
          <div style={{ fontWeight: 700, color: '#d97706', marginBottom: 6 }}>保單即將到期提醒（30日內）</div>
          {expiryAlerts.map(a => (
            <div key={a.id} style={{ fontSize: 13, padding: '3px 0', color: '#92400e' }}>
              {a.patientName} — {a.company}（{a.policyNumber}）— 剩餘 <b>{a.daysLeft}</b> 天（{a.expiryDate}）
            </div>
          ))}
        </div>
      )}

      {/* Patient Search */}
      {!selPatient ? (
        <div style={card}>
          <label style={lbl}>搜尋病人</label>
          <input style={inp} placeholder="輸入姓名或電話..." value={search} onChange={e => { setSearch(e.target.value); setSelPatient(null); }} />
          {suggestions.length > 0 && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
              {suggestions.map(p => (
                <div key={p.id} onClick={() => { setSelPatient(p); setSearch(p.name); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}>
                  {p.name}　<span style={{ color: '#888', fontSize: 13 }}>{p.phone}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div><b>病人：</b>{selPatient.name}　<span style={{ color: '#888' }}>{selPatient.phone}</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={btn()} onClick={printSummary}>列印摘要</button>
            <button style={btn('#6b7280')} onClick={() => { setSelPatient(null); setSearch(''); setTab('policies'); }}>返回</button>
          </div>
        </div>
      )}

      {/* Selected Patient View */}
      {selPatient && <>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <StatCard title="總保額" value={fmtA(stats.totalCoverage)} />
          <StatCard title="已索償" value={fmtA(stats.totalClaimed)} color="#d97706" />
          <StatCard title="剩餘保額" value={fmtA(stats.remaining)} color="#16a34a" />
          <StatCard title="索償成功率" value={`${stats.successRate}%`} color="#2563eb" />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
          {[['policies', '保險資料'], ['claims', '索償記錄'], ['directory', '保險公司通訊錄']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: '10px 20px', fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer', borderBottom: tab === k ? `3px solid ${ACC}` : '3px solid transparent', background: 'transparent', color: tab === k ? ACC : '#64748b' }}>{l}</button>
          ))}
        </div>

        {/* ═══ Policies Tab ═══ */}
        {tab === 'policies' && <>
          <button style={{ ...btn(), marginBottom: 14 }} onClick={openAddPolicy}>+ 新增保險</button>
          {patientPolicies.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#94a3b8' }}>暫無保險記錄</div>}
          {patientPolicies.map(p => {
            const isExpiring = p.expiryDate && new Date(p.expiryDate) <= new Date(Date.now() + 30 * 86400000) && new Date(p.expiryDate) >= new Date();
            const isExpired = p.expiryDate && new Date(p.expiryDate) < new Date();
            return (
              <div key={p.id} style={{ ...card, borderLeft: `4px solid ${isExpired ? '#dc2626' : isExpiring ? '#f59e0b' : ACC}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: ACC }}>{p.company}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {isExpired && <span style={{ ...badge('已拒絕'), background: '#fef2f2', color: '#dc2626' }}>已過期</span>}
                    {isExpiring && !isExpired && <span style={{ ...badge('待審批'), background: '#fffbeb', color: '#d97706' }}>即將到期</span>}
                    <button style={{ ...btn('#6b7280'), padding: '4px 10px', fontSize: 13 }} onClick={() => openEditPolicy(p)}>編輯</button>
                    <button style={{ ...btn('#dc2626'), padding: '4px 10px', fontSize: 13 }} onClick={() => deletePolicy(p.id)}>刪除</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: 14 }}>
                  <div><b>保單號碼：</b>{p.policyNumber}</div>
                  <div><b>保障類型：</b>{p.coverageType}</div>
                  <div><b>保額：</b>{fmtA(p.coverageAmount)}</div>
                  <div><b>到期日：</b>{p.expiryDate || '-'}</div>
                </div>
              </div>
            );
          })}
        </>}

        {/* ═══ Claims Tab ═══ */}
        {tab === 'claims' && <>
          <button style={{ ...btn(), marginBottom: 14 }} onClick={openAddClaim}>+ 新增索償</button>
          {patientClaims.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#94a3b8' }}>暫無索償記錄</div>}
          <div style={{ overflowX: 'auto' }}>
            {patientClaims.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ background: '#f0fdfa' }}>
                  {['索償編號', '日期', '保險公司', '金額', '狀態', '描述', '操作'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {patientClaims.map(c => {
                    const pol = store.policies.find(p => p.id === c.policyId);
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{c.claimId || '-'}</td>
                        <td style={{ padding: '8px 10px' }}>{c.date}</td>
                        <td style={{ padding: '8px 10px' }}>{pol?.company || '-'}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>{fmtA(c.amount)}</td>
                        <td style={{ padding: '8px 10px' }}><span style={badge(c.status)}>{c.status}</span></td>
                        <td style={{ padding: '8px 10px' }}>{c.description || '-'}</td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <select value={c.status} onChange={e => updateClaimStatus(c.id, e.target.value)} style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, border: '1px solid #d1d5db', marginRight: 4 }}>
                            {CLAIM_STATUSES.map(s => <option key={s}>{s}</option>)}
                          </select>
                          <button style={{ ...btn('#dc2626'), padding: '2px 8px', fontSize: 12 }} onClick={() => deleteClaim(c.id)}>刪除</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>}

        {/* ═══ Directory Tab ═══ */}
        {tab === 'directory' && <>
          <button style={{ ...btn(), marginBottom: 14 }} onClick={() => { setDirForm({ name: '', phone: '', email: '', address: '', notes: '' }); setEditDirId(null); setShowDirModal(true); }}>+ 新增保險公司</button>
          {store.directory.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#94a3b8' }}>暫無保險公司記錄</div>}
          {store.directory.map(d => (
            <div key={d.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: ACC }}>{d.name}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ ...btn('#6b7280'), padding: '4px 10px', fontSize: 13 }} onClick={() => { setDirForm({ ...d }); setEditDirId(d.id); setShowDirModal(true); }}>編輯</button>
                  <button style={{ ...btn('#dc2626'), padding: '4px 10px', fontSize: 13 }} onClick={() => deleteDirEntry(d.id)}>刪除</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px', fontSize: 14 }}>
                <div><b>電話：</b>{d.phone || '-'}</div>
                <div><b>電郵：</b>{d.email || '-'}</div>
                <div style={{ gridColumn: '1/-1' }}><b>地址：</b>{d.address || '-'}</div>
                {d.notes && <div style={{ gridColumn: '1/-1' }}><b>備註：</b>{d.notes}</div>}
              </div>
            </div>
          ))}
        </>}
      </>}

      {/* ═══ Policy Modal ═══ */}
      {showPolicyModal && policyForm && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ color: ACC, marginTop: 0 }}>{policyForm.id ? '編輯保險資料' : '新增保險資料'} — {selPatient.name}</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <div><label style={lbl}>保險公司 *</label><input style={inp} value={policyForm.company} onChange={e => setPolicyForm({ ...policyForm, company: e.target.value })} placeholder="如：AIA、保柏" /></div>
              <div><label style={lbl}>保單號碼 *</label><input style={inp} value={policyForm.policyNumber} onChange={e => setPolicyForm({ ...policyForm, policyNumber: e.target.value })} placeholder="保單編號" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>保障類型</label><select style={inp} value={policyForm.coverageType} onChange={e => setPolicyForm({ ...policyForm, coverageType: e.target.value })}>{COVERAGE_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><label style={lbl}>保額 ($)</label><input style={inp} type="number" min={0} value={policyForm.coverageAmount} onChange={e => setPolicyForm({ ...policyForm, coverageAmount: e.target.value })} /></div>
              </div>
              <div><label style={lbl}>到期日</label><input style={inp} type="date" value={policyForm.expiryDate} onChange={e => setPolicyForm({ ...policyForm, expiryDate: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button style={btn('#6b7280')} onClick={() => { setShowPolicyModal(false); setPolicyForm(null); }}>取消</button>
              <button style={btn()} onClick={savePolicy}>儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Claim Modal ═══ */}
      {showClaimModal && claimForm && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ color: ACC, marginTop: 0 }}>新增索償 — {selPatient.name}</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <div><label style={lbl}>關聯保單</label><select style={inp} value={claimForm.policyId} onChange={e => setClaimForm({ ...claimForm, policyId: e.target.value })}>
                <option value="">— 選擇保單 —</option>
                {patientPolicies.map(p => <option key={p.id} value={p.id}>{p.company}（{p.policyNumber}）</option>)}
              </select></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>索償日期</label><input style={inp} type="date" value={claimForm.date} onChange={e => setClaimForm({ ...claimForm, date: e.target.value })} /></div>
                <div><label style={lbl}>索償金額 ($)</label><input style={inp} type="number" min={0} value={claimForm.amount} onChange={e => setClaimForm({ ...claimForm, amount: e.target.value })} /></div>
              </div>
              <div><label style={lbl}>狀態</label><select style={inp} value={claimForm.status} onChange={e => setClaimForm({ ...claimForm, status: e.target.value })}>{CLAIM_STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
              <div><label style={lbl}>描述</label><textarea style={{ ...inp, minHeight: 60 }} value={claimForm.description} onChange={e => setClaimForm({ ...claimForm, description: e.target.value })} placeholder="索償項目描述" /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button style={btn('#6b7280')} onClick={() => { setShowClaimModal(false); setClaimForm(null); }}>取消</button>
              <button style={btn()} onClick={saveClaim}>提交</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Directory Modal ═══ */}
      {showDirModal && (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ color: ACC, marginTop: 0 }}>{editDirId ? '編輯保險公司' : '新增保險公司'}</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <div><label style={lbl}>公司名稱 *</label><input style={inp} value={dirForm.name} onChange={e => setDirForm({ ...dirForm, name: e.target.value })} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>電話</label><input style={inp} value={dirForm.phone} onChange={e => setDirForm({ ...dirForm, phone: e.target.value })} /></div>
                <div><label style={lbl}>電郵</label><input style={inp} value={dirForm.email} onChange={e => setDirForm({ ...dirForm, email: e.target.value })} /></div>
              </div>
              <div><label style={lbl}>地址</label><input style={inp} value={dirForm.address} onChange={e => setDirForm({ ...dirForm, address: e.target.value })} /></div>
              <div><label style={lbl}>備註</label><textarea style={{ ...inp, minHeight: 50 }} value={dirForm.notes} onChange={e => setDirForm({ ...dirForm, notes: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button style={btn('#6b7280')} onClick={() => { setShowDirModal(false); setEditDirId(null); }}>取消</button>
              <button style={btn()} onClick={saveDirEntry}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
