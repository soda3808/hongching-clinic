// Elderly Healthcare Voucher Tracking (長者醫療券)
// HK Government $2000/year scheme for 65+ age patients

import { useState, useMemo } from 'react';
import { uid, fmtM, getMonth } from '../data';
import { savePatient } from '../api';
import { getClinicName, getTenantStoreNames } from '../tenant';

const VOUCHER_LIMIT = 2000; // Annual limit
const ELIGIBLE_AGE = 65;
const CURRENT_YEAR = new Date().getFullYear();

function getAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function ElderlyVoucherPage({ data, setData, showToast, allData, user }) {
  const clinicName = getClinicName();
  const storeNames = getTenantStoreNames();

  const [search, setSearch] = useState('');
  const [showClaim, setShowClaim] = useState(null);
  const [claimAmount, setClaimAmount] = useState('');
  const [claimDesc, setClaimDesc] = useState('診金');
  const [showHistory, setShowHistory] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showReport, setShowReport] = useState(false);

  const patients = data.patients || [];

  // Get eligible patients (65+ age)
  const eligiblePatients = useMemo(() => {
    return patients.filter(p => {
      const age = getAge(p.dob);
      return age !== null && age >= ELIGIBLE_AGE;
    }).map(p => {
      const age = getAge(p.dob);
      const vouchers = p.voucherClaims || [];
      const thisYearClaims = vouchers.filter(v => v.year === CURRENT_YEAR);
      const totalUsed = thisYearClaims.reduce((s, v) => s + Number(v.amount || 0), 0);
      const remaining = Math.max(0, VOUCHER_LIMIT - totalUsed);
      return { ...p, age, totalUsed, remaining, thisYearClaims, allClaims: vouchers };
    });
  }, [patients]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = [...eligiblePatients];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.phone || '').includes(q));
    }
    if (filterStatus === 'available') list = list.filter(p => p.remaining > 0);
    if (filterStatus === 'exhausted') list = list.filter(p => p.remaining === 0);
    return list.sort((a, b) => b.remaining - a.remaining);
  }, [eligiblePatients, search, filterStatus]);

  // Stats
  const stats = useMemo(() => ({
    totalEligible: eligiblePatients.length,
    withRemaining: eligiblePatients.filter(p => p.remaining > 0).length,
    totalClaimed: eligiblePatients.reduce((s, p) => s + p.totalUsed, 0),
    totalRemaining: eligiblePatients.reduce((s, p) => s + p.remaining, 0),
  }), [eligiblePatients]);

  // ── Compliance & Audit (#87) ──
  const compliance = useMemo(() => {
    // All claims this year across all patients
    const allClaims = eligiblePatients.flatMap(p =>
      (p.thisYearClaims || []).map(c => ({ ...c, patientName: p.name, patientAge: p.age, patientPhone: p.phone }))
    );
    // Monthly breakdown
    const byMonth = {};
    allClaims.forEach(c => {
      const m = (c.date || '').substring(0, 7);
      if (!byMonth[m]) byMonth[m] = { count: 0, amount: 0 };
      byMonth[m].count++;
      byMonth[m].amount += Number(c.amount || 0);
    });
    const monthly = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));
    // By purpose
    const byPurpose = {};
    allClaims.forEach(c => {
      byPurpose[c.desc || '其他'] = (byPurpose[c.desc || '其他'] || 0) + Number(c.amount || 0);
    });
    // By store
    const byStore = {};
    allClaims.forEach(c => {
      const fallbackStore = storeNames[0] || '';
      byStore[c.store || fallbackStore] = (byStore[c.store || fallbackStore] || 0) + Number(c.amount || 0);
    });
    // Utilization rate
    const utilization = eligiblePatients.length > 0
      ? (eligiblePatients.filter(p => p.totalUsed > 0).length / eligiblePatients.length * 100).toFixed(0)
      : 0;
    // Avg claim per visit
    const avgClaim = allClaims.length > 0
      ? (allClaims.reduce((s, c) => s + Number(c.amount || 0), 0) / allClaims.length).toFixed(0)
      : 0;
    return { allClaims, monthly, byPurpose, byStore, utilization, avgClaim, totalClaims: allClaims.length };
  }, [eligiblePatients]);

  // ── Form Validation (#85) ──
  const [claimError, setClaimError] = useState('');
  const validateClaim = () => {
    if (!claimAmount || isNaN(Number(claimAmount))) { setClaimError('請輸入有效金額'); return false; }
    const amt = Number(claimAmount);
    if (amt <= 0) { setClaimError('金額必須大於零'); return false; }
    if (amt > showClaim.remaining) { setClaimError(`超出剩餘額度 ${fmtM(showClaim.remaining)}`); return false; }
    if (amt > 2000) { setClaimError('單次申報不能超過 $2,000'); return false; }
    setClaimError('');
    return true;
  };

  // Submit voucher claim
  const handleClaim = async () => {
    if (!showClaim) return;
    if (!validateClaim()) return;
    const amount = Number(claimAmount);
    const patient = patients.find(p => p.id === showClaim.id);
    if (!patient) return;

    const claim = {
      id: uid(),
      year: CURRENT_YEAR,
      date: new Date().toISOString().substring(0, 10),
      amount,
      desc: claimDesc,
      claimedBy: user?.name || '',
      store: patient.store || storeNames[0] || '',
    };

    const updatedPatient = {
      ...patient,
      voucherClaims: [...(patient.voucherClaims || []), claim],
    };

    await savePatient(updatedPatient);
    setData(d => ({
      ...d,
      patients: d.patients.map(p => p.id === patient.id ? updatedPatient : p),
    }));

    showToast(`已申報醫療券 ${fmtM(amount)} — ${patient.name}`);
    setShowClaim(null);
    setClaimAmount('');
    setClaimDesc('診金');
  };

  // Delete a claim
  const deleteClaim = async (patient, claimId) => {
    const updatedPatient = {
      ...patient,
      voucherClaims: (patient.voucherClaims || []).filter(v => v.id !== claimId),
    };
    await savePatient(updatedPatient);
    setData(d => ({
      ...d,
      patients: d.patients.map(p => p.id === patient.id ? updatedPatient : p),
    }));
    showToast('已刪除申報紀錄');
    // Refresh history view
    if (showHistory?.id === patient.id) {
      setShowHistory(eligiblePatients.find(p => p.id === patient.id) || null);
    }
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal">
          <div className="stat-label">合資格長者</div>
          <div className="stat-value teal">{stats.totalEligible}</div>
          <div className="stat-sub">{ELIGIBLE_AGE}歲或以上</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">尚有餘額</div>
          <div className="stat-value green">{stats.withRemaining}</div>
          <div className="stat-sub">可使用醫療券</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">{CURRENT_YEAR}年已申報</div>
          <div className="stat-value gold">{fmtM(stats.totalClaimed)}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">總剩餘額度</div>
          <div className="stat-value red">{fmtM(stats.totalRemaining)}</div>
        </div>
      </div>

      {/* Info banner */}
      <div className="card" style={{ padding: 12, background: '#f0f9ff', border: '1px solid #bae6fd', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>
          長者醫療券計劃 Elderly Health Care Voucher Scheme
        </div>
        <div style={{ fontSize: 12, color: '#0c4a6e' }}>
          每年每位 {ELIGIBLE_AGE} 歲或以上長者可獲 {fmtM(VOUCHER_LIMIT)} 醫療券，用於支付中醫診金及藥費。
          醫療券可於已登記的醫療服務提供者處使用。
        </div>
      </div>

      {/* Compliance summary (#87) */}
      <div className="grid-2" style={{ marginBottom: 0 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 600, marginBottom: 8 }}>使用率及統計</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 10, color: 'var(--gray-400)' }}>使用率</div><div style={{ fontSize: 20, fontWeight: 800, color: Number(compliance.utilization) >= 50 ? 'var(--green-600)' : '#d97706' }}>{compliance.utilization}%</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--gray-400)' }}>申報次數</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{compliance.totalClaims}</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--gray-400)' }}>平均每次</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{fmtM(compliance.avgClaim)}</div></div>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 600, marginBottom: 8 }}>用途分佈</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(compliance.byPurpose).sort((a, b) => b[1] - a[1]).map(([p, amt]) => (
              <div key={p} style={{ padding: '4px 8px', background: 'var(--gray-50)', borderRadius: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal-700)' }}>{fmtM(amt)}</div>
                <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{p}</div>
              </div>
            ))}
            {!Object.keys(compliance.byPurpose).length && <div style={{ color: '#aaa', fontSize: 12 }}>暫無申報</div>}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ flex: 1, minWidth: 180 }} placeholder="搜尋長者姓名或電話..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="preset-bar" style={{ marginBottom: 0 }}>
          {[['all', '全部'], ['available', '有餘額'], ['exhausted', '已用完']].map(([k, l]) => (
            <button key={k} className={`preset-chip ${filterStatus === k ? 'active' : ''}`} onClick={() => setFilterStatus(k)}>{l}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => {
            if (!eligiblePatients.length) return showToast('沒有紀錄可匯出');
            const headers = ['姓名','年齡','電話','店舖','已使用','剩餘','申報次數'];
            const rows = eligiblePatients.map(p => [p.name, p.age, p.phone || '', p.store || '', p.totalUsed, p.remaining, (p.thisYearClaims || []).length]);
            const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `elderly_voucher_${CURRENT_YEAR}.csv`;
            a.click();
            showToast('已匯出醫療券紀錄');
          }}>匯出CSV</button>
          <button className="btn btn-gold btn-sm" onClick={() => {
            const w = window.open('', '_blank');
            if (!w) return;
            w.document.write(`<!DOCTYPE html><html><head><title>醫療券報告 ${CURRENT_YEAR}</title>
              <style>body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:700px;margin:0 auto;font-size:13px}
              h1{font-size:18px;text-align:center}
              .sub{text-align:center;color:#888;font-size:11px;margin-bottom:20px}
              h2{font-size:14px;border-bottom:2px solid #0e7490;padding-bottom:4px;margin-top:20px;color:#0e7490}
              table{width:100%;border-collapse:collapse;margin-bottom:16px}
              th,td{padding:6px 10px;border-bottom:1px solid #eee;text-align:left}
              th{background:#f8f8f8;font-weight:700}
              .r{text-align:right}
              .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
              .box{border:1px solid #ddd;border-radius:8px;padding:12px;text-align:center}
              .box .n{font-size:22px;font-weight:800}
              .box .l{font-size:10px;color:#888}
              @media print{body{margin:0;padding:10mm}}
              </style></head><body>
              <h1>${clinicName} — 長者醫療券報告</h1>
              <div class="sub">${CURRENT_YEAR}年度 | 列印時間：${new Date().toLocaleString('zh-HK')}</div>
              <div class="grid">
                <div class="box"><div class="n" style="color:#0e7490">${stats.totalEligible}</div><div class="l">合資格長者</div></div>
                <div class="box"><div class="n" style="color:#16a34a">${compliance.utilization}%</div><div class="l">使用率</div></div>
                <div class="box"><div class="n" style="color:#d97706">${fmtM(stats.totalClaimed)}</div><div class="l">已申報</div></div>
                <div class="box"><div class="n" style="color:#dc2626">${fmtM(stats.totalRemaining)}</div><div class="l">剩餘額度</div></div>
              </div>
              <h2>月度申報明細</h2>
              <table><thead><tr><th>月份</th><th class="r">次數</th><th class="r">金額</th></tr></thead>
              <tbody>${compliance.monthly.map(([m, d]) => `<tr><td>${m}</td><td class="r">${d.count}</td><td class="r">${fmtM(d.amount)}</td></tr>`).join('')}</tbody></table>
              <h2>長者使用詳情</h2>
              <table><thead><tr><th>姓名</th><th>年齡</th><th class="r">已使用</th><th class="r">剩餘</th></tr></thead>
              <tbody>${eligiblePatients.slice(0, 50).map(p => `<tr><td>${p.name}</td><td>${p.age}歲</td><td class="r">${fmtM(p.totalUsed)}</td><td class="r">${fmtM(p.remaining)}</td></tr>`).join('')}</tbody></table>
            </body></html>`);
            w.document.close();
            setTimeout(() => w.print(), 300);
          }}>列印報告</button>
        </div>
      </div>

      {/* Patient list */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header">
          <h3>長者醫療券紀錄 ({CURRENT_YEAR}年)</h3>
        </div>
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>病人</th>
                <th>年齡</th>
                <th>電話</th>
                <th>店舖</th>
                <th style={{ textAlign: 'right' }}>已使用</th>
                <th style={{ textAlign: 'right' }}>剩餘</th>
                <th>進度</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const pct = Math.min(100, (p.totalUsed / VOUCHER_LIMIT) * 100);
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>{p.age} 歲</td>
                    <td>{p.phone || '-'}</td>
                    <td>{p.store || '-'}</td>
                    <td className="money">{fmtM(p.totalUsed)}</td>
                    <td className="money" style={{ color: p.remaining > 0 ? 'var(--green-600)' : 'var(--red-600)', fontWeight: 700 }}>
                      {fmtM(p.remaining)}
                    </td>
                    <td style={{ minWidth: 120 }}>
                      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                        <div style={{
                          width: `${pct}%`, height: '100%', borderRadius: 4,
                          background: pct >= 100 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#10b981',
                        }} />
                      </div>
                      <span style={{ fontSize: 10, color: '#888' }}>{Math.round(pct)}%</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {p.remaining > 0 && (
                          <button className="btn btn-teal btn-sm" onClick={() => { setShowClaim(p); setClaimAmount(''); }}>
                            申報
                          </button>
                        )}
                        <button className="btn btn-outline btn-sm" onClick={() => setShowHistory(p)}>
                          紀錄
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>
                  {search ? '搜尋不到合資格長者' : '暫無合資格長者（需年滿65歲且有出生日期紀錄）'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Claim Modal */}
      {showClaim && (
        <div className="modal-overlay" onClick={() => setShowClaim(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>申報醫療券</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowClaim(null)}>✕</button>
            </div>

            <div style={{ background: '#f0f9ff', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
              <div><strong>病人：</strong>{showClaim.name}</div>
              <div><strong>年齡：</strong>{showClaim.age} 歲</div>
              <div><strong>剩餘額度：</strong>
                <span style={{ color: 'var(--green-600)', fontWeight: 700 }}>{fmtM(showClaim.remaining)}</span>
                / {fmtM(VOUCHER_LIMIT)}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>申報金額 ($) *</label>
              <input type="number" min="1" max={showClaim.remaining} value={claimAmount}
                onChange={e => setClaimAmount(e.target.value)} placeholder={`最高 ${showClaim.remaining}`} />
              {(claimError || Number(claimAmount) > showClaim.remaining) && (
                <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{claimError || '超出剩餘額度！'}</div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>用途</label>
              <select value={claimDesc} onChange={e => setClaimDesc(e.target.value)}>
                <option>診金</option>
                <option>藥費</option>
                <option>診金+藥費</option>
                <option>針灸</option>
                <option>推拿</option>
                <option>其他治療</option>
              </select>
            </div>

            {/* Quick amount buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {[100, 200, 350, 450, 500].filter(a => a <= showClaim.remaining).map(amt => (
                <button key={amt} type="button" className={`preset-chip ${Number(claimAmount) === amt ? 'active' : ''}`}
                  onClick={() => setClaimAmount(String(amt))}>
                  ${amt}
                </button>
              ))}
              {showClaim.remaining > 0 && (
                <button type="button" className={`preset-chip ${Number(claimAmount) === showClaim.remaining ? 'active' : ''}`}
                  onClick={() => setClaimAmount(String(showClaim.remaining))}>
                  全部 ${showClaim.remaining}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-teal" onClick={handleClaim}
                disabled={!claimAmount || Number(claimAmount) <= 0 || Number(claimAmount) > showClaim.remaining}>
                確認申報 {claimAmount ? fmtM(Number(claimAmount)) : ''}
              </button>
              <button className="btn btn-outline" onClick={() => setShowClaim(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>醫療券紀錄 — {showHistory.name}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowHistory(null)}>✕</button>
            </div>

            <div style={{ background: '#f0f9ff', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><strong>年齡：</strong>{showHistory.age} 歲</span>
                <span><strong>年度：</strong>{CURRENT_YEAR}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span><strong>已使用：</strong>{fmtM(showHistory.totalUsed)}</span>
                <span style={{ color: showHistory.remaining > 0 ? 'var(--green-600)' : 'var(--red-600)', fontWeight: 700 }}>
                  <strong>剩餘：</strong>{fmtM(showHistory.remaining)}
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ background: '#e5e7eb', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, (showHistory.totalUsed / VOUCHER_LIMIT) * 100)}%`,
                    height: '100%', borderRadius: 4,
                    background: showHistory.remaining === 0 ? '#ef4444' : '#10b981',
                  }} />
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>日期</th><th>金額</th><th>用途</th><th>申報人</th><th>店舖</th><th></th></tr>
                </thead>
                <tbody>
                  {(showHistory.allClaims || [])
                    .filter(v => v.year === CURRENT_YEAR)
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                    .map(v => (
                      <tr key={v.id}>
                        <td>{v.date}</td>
                        <td className="money">{fmtM(v.amount)}</td>
                        <td>{v.desc}</td>
                        <td>{v.claimedBy || '-'}</td>
                        <td>{v.store || '-'}</td>
                        <td>
                          <button className="btn btn-red btn-sm" style={{ padding: '2px 8px', fontSize: 10 }}
                            onClick={() => deleteClaim(showHistory, v.id)}>刪除</button>
                        </td>
                      </tr>
                    ))}
                  {(showHistory.thisYearClaims || []).length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#aaa', padding: 20 }}>今年暫無申報紀錄</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Previous years summary */}
            {(showHistory.allClaims || []).some(v => v.year !== CURRENT_YEAR) && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ fontSize: 13, marginBottom: 8 }}>往年紀錄</h4>
                {[...new Set((showHistory.allClaims || []).filter(v => v.year !== CURRENT_YEAR).map(v => v.year))]
                  .sort((a, b) => b - a)
                  .map(year => {
                    const yearClaims = (showHistory.allClaims || []).filter(v => v.year === year);
                    const yearTotal = yearClaims.reduce((s, v) => s + Number(v.amount || 0), 0);
                    return (
                      <div key={year} style={{ fontSize: 12, padding: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{year}年</span>
                        <span>{yearClaims.length} 次申報，共 {fmtM(yearTotal)}</span>
                      </div>
                    );
                  })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              {showHistory.remaining > 0 && (
                <button className="btn btn-teal" onClick={() => { setShowHistory(null); setShowClaim(showHistory); }}>
                  申報醫療券
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setShowHistory(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
