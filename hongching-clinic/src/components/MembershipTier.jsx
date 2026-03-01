import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_TIERS = 'hcmc_membership_tiers';
const LS_MEMBER = 'hcmc_member_tiers';
const ACC = '#0e7490';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const load = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) || fb; } catch { return fb; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const fmtA = (n) => `$${Math.round(Number(n || 0)).toLocaleString('en-HK')}`;
const today = () => new Date().toISOString().substring(0, 10);

const DEFAULT_TIERS = [
  { id: 't1', name: '普通會員', minSpend: 0, discount: 0, pointsMultiplier: 1, benefits: ['基本診症服務', '積分累計'], color: '#94a3b8' },
  { id: 't2', name: '銀卡會員', minSpend: 5000, discount: 5, pointsMultiplier: 1.5, benefits: ['基本診症服務', '積分1.5倍', '生日月份9折', '免費覆診提醒'], color: '#a0aec0' },
  { id: 't3', name: '金卡會員', minSpend: 15000, discount: 10, pointsMultiplier: 2, benefits: ['積分2倍', '全年9折優惠', '優先預約', '免費健康講座', '生日月份85折'], color: '#d4a017' },
  { id: 't4', name: '鑽石會員', minSpend: 30000, discount: 15, pointsMultiplier: 3, benefits: ['積分3倍', '全年85折優惠', 'VIP優先預約', '免費健康講座', '專屬健康顧問', '生日月份8折', '免費年度體檢'], color: '#7c3aed' },
];

const overlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modal = { background: '#fff', borderRadius: 10, padding: 24, width: '95%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' };
const btnP = { background: ACC, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnS = { background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 14 };
const inp = { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const lbl = { fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block', color: '#334155' };

export default function MembershipTier({ data, showToast, user }) {
  const clinicName = getClinicName();
  const [tab, setTab] = useState('overview');
  const [tiers, setTiers] = useState(() => load(LS_TIERS, DEFAULT_TIERS));
  const [memberTiers, setMemberTiers] = useState(() => load(LS_MEMBER, {}));
  const [search, setSearch] = useState('');
  const [selTier, setSelTier] = useState(null);
  const [showAssign, setShowAssign] = useState(null);
  const [pSearch, setPSearch] = useState('');

  const patients = data?.patients || [];

  const persist = (t, m) => { save(LS_TIERS, t); save(LS_MEMBER, m); setTiers(t); setMemberTiers(m); };

  // Resolve each patient's tier based on annual spend or manual assignment
  const memberData = useMemo(() => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().substring(0, 10);
    return patients.map(p => {
      const annualSpend = Number(p.totalSpent || 0);
      // Find highest qualifying tier by spend
      let autoTier = tiers[0];
      for (const t of tiers) { if (annualSpend >= t.minSpend) autoTier = t; }
      // Manual override
      const manual = memberTiers[p.id];
      const tier = manual ? tiers.find(t => t.id === manual.tierId) || autoTier : autoTier;
      // Next tier
      const idx = tiers.findIndex(t => t.id === tier.id);
      const nextTier = idx < tiers.length - 1 ? tiers[idx + 1] : null;
      const progress = nextTier ? Math.min(100, (annualSpend / nextTier.minSpend) * 100) : 100;
      const remaining = nextTier ? Math.max(0, nextTier.minSpend - annualSpend) : 0;
      return { ...p, annualSpend, tier, nextTier, progress, remaining, isManual: !!manual };
    }).sort((a, b) => b.annualSpend - a.annualSpend);
  }, [patients, tiers, memberTiers]);

  // Filter by search and optional tier filter
  const filtered = useMemo(() => {
    let list = memberData;
    if (search) { const q = search.toLowerCase(); list = list.filter(m => m.name.toLowerCase().includes(q) || (m.phone || '').includes(q)); }
    if (selTier) list = list.filter(m => m.tier.id === selTier);
    return list;
  }, [memberData, search, selTier]);

  // Stats per tier
  const stats = useMemo(() => {
    return tiers.map(t => {
      const members = memberData.filter(m => m.tier.id === t.id);
      const avgSpend = members.length > 0 ? members.reduce((s, m) => s + m.annualSpend, 0) / members.length : 0;
      return { ...t, count: members.length, avgSpend };
    });
  }, [tiers, memberData]);

  // Patient dropdown for assign
  const patientOpts = useMemo(() => {
    if (!pSearch) return [];
    const q = pSearch.toLowerCase();
    return patients.filter(p => p.name.toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [patients, pSearch]);

  // Assign / override tier
  const handleAssign = (patientId, tierId) => {
    const nm = { ...memberTiers, [patientId]: { tierId, assignedBy: user?.name || '系統', assignedAt: today() } };
    persist(tiers, nm);
    setShowAssign(null); setPSearch('');
    showToast('已更新會員等級');
  };

  // Reset to auto tier
  const handleResetAuto = (patientId) => {
    const nm = { ...memberTiers }; delete nm[patientId];
    persist(tiers, nm);
    showToast('已重置為自動等級');
  };

  // Print member card
  const printCard = (member) => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>會員卡</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f3f4f6}
      .card{width:360px;height:220px;border-radius:16px;padding:28px;box-sizing:border-box;color:#fff;position:relative;overflow:hidden;
        background:linear-gradient(135deg,${member.tier.color},${member.tier.color}cc);box-shadow:0 8px 32px rgba(0,0,0,.18)}
      .logo{font-size:14px;opacity:.9;margin-bottom:4px}
      .tier{font-size:20px;font-weight:800;margin:8px 0 16px;text-shadow:0 1px 4px rgba(0,0,0,.2)}
      .name{font-size:18px;font-weight:700;margin-bottom:4px}
      .info{font-size:12px;opacity:.85;margin-top:2px}
      .disc{position:absolute;bottom:20px;right:28px;font-size:28px;font-weight:800;opacity:.9}
      .bg-circle{position:absolute;right:-40px;top:-40px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.08)}
    </style></head><body>
      <div class="card">
        <div class="bg-circle"></div>
        <div class="logo">${escapeHtml(clinicName)}</div>
        <div class="tier">${escapeHtml(member.tier.name)}</div>
        <div class="name">${escapeHtml(member.name)}</div>
        <div class="info">${escapeHtml(member.phone || '')}</div>
        <div class="info">年度消費: ${fmtA(member.annualSpend)} | 積分倍率: ${member.tier.pointsMultiplier}x</div>
        <div class="info">列印日期: ${today()}</div>
        <div class="disc">${member.tier.discount > 0 ? member.tier.discount + '% OFF' : ''}</div>
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)} style={{ padding: '10px 22px', fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer', borderBottom: tab === id ? `3px solid ${ACC}` : '3px solid transparent', background: 'transparent', color: tab === id ? ACC : '#64748b' }}>{label}</button>
  );

  const StatCard = ({ title, value, color, sub }) => (
    <div style={{ flex: '1 1 140px', background: '#fff', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', borderTop: `3px solid ${color || ACC}` }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || ACC, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ color: ACC, margin: '0 0 16px' }}>會員等級管理</h2>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        {stats.map(s => (
          <StatCard key={s.id} title={s.name} value={s.count + ' 人'} color={s.color} sub={`平均消費 ${fmtA(s.avgSpend)}`} />
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
        <TabBtn id="overview" label="等級總覽" />
        <TabBtn id="members" label="會員列表" />
        <TabBtn id="compare" label="等級比較" />
      </div>

      {/* ════ Tab: Overview ════ */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {tiers.map(t => {
            const count = memberData.filter(m => m.tier.id === t.id).length;
            return (
              <div key={t.id} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.06)', border: `1px solid #e2e8f0` }}>
                <div style={{ background: t.color, color: '#fff', padding: '16px 20px' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 12, opacity: .85, marginTop: 4 }}>年消費 {fmtA(t.minSpend)} 以上</div>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>折扣</span>
                    <span style={{ fontWeight: 700, color: t.color }}>{t.discount}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>積分倍率</span>
                    <span style={{ fontWeight: 700, color: t.color }}>{t.pointsMultiplier}x</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>會員數</span>
                    <span style={{ fontWeight: 700, color: ACC }}>{count} 人</span>
                  </div>
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>專屬權益</div>
                    {t.benefits.map((b, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#64748b', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: t.color, fontWeight: 700 }}>*</span> {b}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ════ Tab: Members ════ */}
      {tab === 'members' && <>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="搜尋會員姓名/電話..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, maxWidth: 260 }} />
          <select value={selTier || ''} onChange={e => setSelTier(e.target.value || null)} style={{ ...inp, maxWidth: 160 }}>
            <option value="">全部等級</option>
            {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={() => setShowAssign({})} style={btnP}>手動調整等級</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f1f5f9' }}>
              {['會員姓名', '電話', '年度消費', '當前等級', '升級進度', '下一等級', '操作'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>暫無會員資料</td></tr>}
              {filtered.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                    {m.name}
                    {m.isManual && <span style={{ fontSize: 10, color: '#d97706', marginLeft: 4, background: '#fefce8', padding: '1px 6px', borderRadius: 8 }}>手動</span>}
                  </td>
                  <td style={{ padding: '8px 10px' }}>{m.phone || '-'}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 600, color: ACC }}>{fmtA(m.annualSpend)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700, color: '#fff', background: m.tier.color }}>{m.tier.name}</span>
                  </td>
                  <td style={{ padding: '8px 10px', minWidth: 140 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3 }}>
                        <div style={{ width: `${m.progress}%`, height: '100%', borderRadius: 3, background: m.nextTier ? `linear-gradient(90deg, ${m.tier.color}, ${m.nextTier.color})` : m.tier.color, transition: 'width .3s' }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{Math.round(m.progress)}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: 12, color: '#64748b' }}>
                    {m.nextTier ? <span>距 <b style={{ color: m.nextTier.color }}>{m.nextTier.name}</b> 差 {fmtA(m.remaining)}</span> : <span style={{ color: '#16a34a', fontWeight: 600 }}>最高等級</span>}
                  </td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => printCard(m)} style={{ ...btnS, fontSize: 12, padding: '4px 10px', marginRight: 4 }}>列印卡</button>
                    {m.isManual && <button onClick={() => handleResetAuto(m.id)} style={{ ...btnS, fontSize: 12, padding: '4px 10px', color: '#d97706' }}>重置</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}

      {/* ════ Tab: Comparison Table ════ */}
      {tab === 'compare' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <thead><tr>
              <th style={{ padding: '12px 14px', textAlign: 'left', background: '#f8fafc', fontWeight: 600, color: '#334155' }}>權益項目</th>
              {tiers.map(t => (
                <th key={t.id} style={{ padding: '12px 14px', textAlign: 'center', background: t.color, color: '#fff', fontWeight: 700, fontSize: 14 }}>{t.name}</th>
              ))}
            </tr></thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: '#334155' }}>年消費門檻</td>
                {tiers.map(t => <td key={t.id} style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>{t.minSpend === 0 ? '無' : fmtA(t.minSpend)}</td>)}
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#fafbfc' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: '#334155' }}>折扣優惠</td>
                {tiers.map(t => <td key={t.id} style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: t.discount > 0 ? t.color : '#94a3b8' }}>{t.discount > 0 ? t.discount + '%' : '-'}</td>)}
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: '#334155' }}>積分倍率</td>
                {tiers.map(t => <td key={t.id} style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: t.color }}>{t.pointsMultiplier}x</td>)}
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#fafbfc' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: '#334155' }}>會員人數</td>
                {stats.map(s => <td key={s.id} style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: ACC }}>{s.count}</td>)}
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: '#334155' }}>平均消費</td>
                {stats.map(s => <td key={s.id} style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12, color: '#64748b' }}>{fmtA(s.avgSpend)}</td>)}
              </tr>
              {/* Render each unique benefit row */}
              {(() => {
                const allBenefits = [...new Set(tiers.flatMap(t => t.benefits))];
                return allBenefits.map((b, i) => (
                  <tr key={b} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 === 0 ? '#fafbfc' : '#fff' }}>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: '#334155' }}>{b}</td>
                    {tiers.map(t => (
                      <td key={t.id} style={{ padding: '10px 14px', textAlign: 'center', fontSize: 16 }}>
                        {t.benefits.includes(b) ? <span style={{ color: '#16a34a' }}>&#10003;</span> : <span style={{ color: '#d1d5db' }}>-</span>}
                      </td>
                    ))}
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* ════ Manual Assign Modal ════ */}
      {showAssign && <div style={overlay} onClick={() => { setShowAssign(null); setPSearch(''); }}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <h3 style={{ color: ACC, marginTop: 0 }}>手動調整會員等級</h3>
          <div style={{ marginBottom: 12, position: 'relative' }}>
            <label style={lbl}>搜尋會員</label>
            <input placeholder="輸入姓名或電話..." value={pSearch} onChange={e => setPSearch(e.target.value)} style={inp} />
            {patientOpts.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, maxHeight: 160, overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                {patientOpts.map(p => (
                  <div key={p.id} onClick={() => { setShowAssign({ patientId: p.id, patientName: p.name, tierId: '' }); setPSearch(p.name); }}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={e => e.target.style.background = '#f0fdfa'}
                    onMouseLeave={e => e.target.style.background = '#fff'}>
                    {p.name}{p.phone ? ` (${p.phone})` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
          {showAssign.patientId && <>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>選擇等級</label>
              <select value={showAssign.tierId || ''} onChange={e => setShowAssign({ ...showAssign, tierId: e.target.value })} style={inp}>
                <option value="">-- 請選擇 --</option>
                {tiers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.discount}% 折扣)</option>)}
              </select>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16, background: '#f8fafc', padding: 10, borderRadius: 6 }}>
              會員: <b>{showAssign.patientName}</b> | 手動指定將覆蓋自動計算等級
            </div>
          </>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowAssign(null); setPSearch(''); }} style={btnS}>取消</button>
            <button onClick={() => { if (!showAssign.patientId || !showAssign.tierId) { showToast('請選擇會員及等級', 'error'); return; } handleAssign(showAssign.patientId, showAssign.tierId); }} style={btnP}>確認調整</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
