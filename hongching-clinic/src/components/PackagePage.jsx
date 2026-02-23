import { useState, useMemo, useRef } from 'react';
import { savePackage, saveEnrollment } from '../api';
import { uid, fmtM, DOCTORS, MEMBERSHIP_TIERS, getMembershipTier, TCM_TREATMENTS } from '../data';
import { useFocusTrap, nullRef } from './ConfirmModal';
import ConfirmModal from './ConfirmModal';

const EMPTY_PKG = { name: '', type: 'session', sessions: 10, price: '', validDays: 180, treatments: [], active: true };
const EMPTY_ENROLL = { packageId: '', patientId: '', patientName: '', patientPhone: '', store: '宋皇臺' };

function getEnrollmentStatus(e) {
  const today = new Date().toISOString().substring(0, 10);
  if (e.usedSessions >= e.totalSessions) return 'completed';
  if (e.expiryDate < today) return 'expired';
  return 'active';
}

const STATUS_LABELS = { active: '使用中', completed: '已完成', expired: '已過期' };
const STATUS_COLORS = {
  active: { color: '#0e7490', bg: '#ecfeff' },
  completed: { color: '#16a34a', bg: '#f0fdf4' },
  expired: { color: '#dc2626', bg: '#fef2f2' },
};

export default function PackagePage({ data, setData, showToast, allData }) {
  const [tab, setTab] = useState('packages');
  const [showPkgModal, setShowPkgModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [editPkg, setEditPkg] = useState(null);
  const [pkgForm, setPkgForm] = useState({ ...EMPTY_PKG });
  const [enrollForm, setEnrollForm] = useState({ ...EMPTY_ENROLL });
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDrop, setShowPatientDrop] = useState(false);
  const [confirmUse, setConfirmUse] = useState(null);

  const pkgModalRef = useRef(null);
  const enrollModalRef = useRef(null);
  useFocusTrap(showPkgModal ? pkgModalRef : nullRef);
  useFocusTrap(showEnrollModal ? enrollModalRef : nullRef);

  const packages = data.packages || [];
  const enrollments = data.enrollments || [];
  const patients = data.patients || [];

  // ── Package Stats ──
  const pkgStats = useMemo(() => {
    const activePkgs = packages.filter(p => p.active).length;
    const totalEnroll = enrollments.length;
    const revenue = enrollments.reduce((s, e) => {
      const pkg = packages.find(p => p.id === e.packageId);
      return s + (pkg ? Number(pkg.price) : 0);
    }, 0);
    const avgUtil = totalEnroll > 0
      ? enrollments.reduce((s, e) => s + (e.totalSessions > 0 ? (e.usedSessions / e.totalSessions) * 100 : 0), 0) / totalEnroll
      : 0;
    return { activePkgs, totalEnroll, revenue, avgUtil };
  }, [packages, enrollments]);

  // ── Enriched enrollments with computed status ──
  const enrichedEnrollments = useMemo(() => {
    return enrollments.map(e => ({
      ...e,
      status: getEnrollmentStatus(e),
      packageName: (packages.find(p => p.id === e.packageId) || {}).name || '未知套餐',
    })).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  }, [enrollments, packages]);

  // ── Patient membership data ──
  const membershipData = useMemo(() => {
    return patients
      .map(p => {
        const spent = Number(p.totalSpent || 0);
        const tier = getMembershipTier(spent);
        return { ...p, totalSpent: spent, tier };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [patients]);

  // ── Patient search autocomplete ──
  const filteredPatients = useMemo(() => {
    if (!patientSearch) return [];
    const q = patientSearch.toLowerCase();
    return patients.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q)).slice(0, 8);
  }, [patients, patientSearch]);

  // ── Active packages for enrollment dropdown ──
  const activePkgs = useMemo(() => packages.filter(p => p.active), [packages]);

  // ══════════════════════════════════
  // Package CRUD
  // ══════════════════════════════════
  const openAddPkg = () => {
    setEditPkg(null);
    setPkgForm({ ...EMPTY_PKG });
    setShowPkgModal(true);
  };

  const openEditPkg = (pkg) => {
    setEditPkg(pkg);
    setPkgForm({ ...pkg });
    setShowPkgModal(true);
  };

  const handleSavePkg = async (e) => {
    e.preventDefault();
    if (!pkgForm.name || !pkgForm.price) return showToast('請填寫套餐名稱和價格');
    const record = {
      ...pkgForm,
      id: editPkg ? editPkg.id : uid(),
      price: parseFloat(pkgForm.price),
      sessions: parseInt(pkgForm.sessions) || 0,
      validDays: parseInt(pkgForm.validDays) || 180,
    };
    await savePackage(record);
    const updated = editPkg
      ? packages.map(p => p.id === record.id ? record : p)
      : [...packages, record];
    setData({ ...data, packages: updated });
    setShowPkgModal(false);
    showToast(editPkg ? '已更新套餐' : '已新增套餐');
  };

  const toggleTreatment = (t) => {
    setPkgForm(f => ({
      ...f,
      treatments: f.treatments.includes(t)
        ? f.treatments.filter(x => x !== t)
        : [...f.treatments, t],
    }));
  };

  // ══════════════════════════════════
  // Enrollment CRUD
  // ══════════════════════════════════
  const openAddEnroll = () => {
    setEnrollForm({ ...EMPTY_ENROLL });
    setPatientSearch('');
    setShowEnrollModal(true);
  };

  const handleSelectPatient = (p) => {
    setEnrollForm(f => ({ ...f, patientId: p.id, patientName: p.name, patientPhone: p.phone || '' }));
    setPatientSearch(p.name);
    setShowPatientDrop(false);
  };

  const handleSaveEnroll = async (e) => {
    e.preventDefault();
    if (!enrollForm.packageId || !enrollForm.patientId) return showToast('請選擇套餐和病人');
    const pkg = packages.find(p => p.id === enrollForm.packageId);
    if (!pkg) return showToast('套餐不存在');
    const today = new Date().toISOString().substring(0, 10);
    const expiry = new Date(Date.now() + (pkg.validDays || 180) * 86400000).toISOString().substring(0, 10);
    const record = {
      id: uid(),
      packageId: enrollForm.packageId,
      patientId: enrollForm.patientId,
      patientName: enrollForm.patientName,
      patientPhone: enrollForm.patientPhone,
      purchaseDate: today,
      expiryDate: expiry,
      totalSessions: pkg.sessions || 0,
      usedSessions: 0,
      status: 'active',
      store: enrollForm.store,
    };
    await saveEnrollment(record);
    setData({ ...data, enrollments: [...enrollments, record] });
    setShowEnrollModal(false);
    showToast('已新增登記');
  };

  // ── Use session ──
  const handleUseSession = async () => {
    if (!confirmUse) return;
    const e = confirmUse;
    const updated = { ...e, usedSessions: e.usedSessions + 1 };
    updated.status = getEnrollmentStatus(updated);
    await saveEnrollment(updated);
    setData({ ...data, enrollments: enrollments.map(x => x.id === e.id ? updated : x) });
    setConfirmUse(null);
    showToast(`已使用 1 次 (${updated.usedSessions}/${updated.totalSessions})`);
  };

  // ══════════════════════════════════
  // Render
  // ══════════════════════════════════
  return (
    <>
      {/* Tab Bar */}
      <div className="tab-bar">
        <button className={`tab-btn ${tab === 'packages' ? 'active' : ''}`} onClick={() => setTab('packages')}>套餐管理</button>
        <button className={`tab-btn ${tab === 'enrollments' ? 'active' : ''}`} onClick={() => setTab('enrollments')}>會員管理</button>
        <button className={`tab-btn ${tab === 'tiers' ? 'active' : ''}`} onClick={() => setTab('tiers')}>會員等級</button>
      </div>

      {/* ════════════════════════════════ */}
      {/* Tab 1: Package Management       */}
      {/* ════════════════════════════════ */}
      {tab === 'packages' && (
        <>
          <div className="stats-grid">
            <div className="stat-card teal"><div className="stat-label">活躍套餐</div><div className="stat-value teal">{pkgStats.activePkgs}</div></div>
            <div className="stat-card green"><div className="stat-label">總登記數</div><div className="stat-value green">{pkgStats.totalEnroll}</div></div>
            <div className="stat-card gold"><div className="stat-label">套餐收入</div><div className="stat-value gold">{fmtM(pkgStats.revenue)}</div></div>
            <div className="stat-card"><div className="stat-label">平均使用率</div><div className="stat-value teal">{pkgStats.avgUtil.toFixed(0)}%</div></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-teal" onClick={openAddPkg}>+ 新增套餐</button>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>套餐名稱</th><th>類型</th><th>次數</th><th>價格</th>
                    <th>有效天數</th><th>治療項目</th><th>狀態</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map(p => (
                    <tr key={p.id} style={!p.active ? { opacity: 0.5 } : {}}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.type === 'session' ? '次數制' : '時間制'}</td>
                      <td>{p.sessions}</td>
                      <td className="money">{fmtM(p.price)}</td>
                      <td>{p.validDays} 天</td>
                      <td style={{ fontSize: 11 }}>{(p.treatments || []).join('、') || '-'}</td>
                      <td>
                        <span className={`tag ${p.active ? 'tag-fps' : 'tag-other'}`}>
                          {p.active ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-outline btn-sm" onClick={() => openEditPkg(p)}>編輯</button>
                      </td>
                    </tr>
                  ))}
                  {packages.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24 }}>暫無套餐</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════ */}
      {/* Tab 2: Enrollment Management    */}
      {/* ════════════════════════════════ */}
      {tab === 'enrollments' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-teal" onClick={openAddEnroll}>+ 新增登記</button>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>病人</th><th>套餐</th><th>店舖</th><th>購買日期</th>
                    <th>到期日</th><th>使用進度</th><th>狀態</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichedEnrollments.map(e => {
                    const st = STATUS_COLORS[e.status] || STATUS_COLORS.active;
                    return (
                      <tr key={e.id}>
                        <td style={{ fontWeight: 600 }}>{e.patientName}</td>
                        <td>{e.packageName}</td>
                        <td>{e.store}</td>
                        <td>{e.purchaseDate}</td>
                        <td>{e.expiryDate}</td>
                        <td style={{ minWidth: 120 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: 'var(--gray-200)', borderRadius: 3 }}>
                              <div style={{ width: `${e.totalSessions > 0 ? (e.usedSessions / e.totalSessions) * 100 : 0}%`, height: '100%', background: 'var(--teal-600)', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11 }}>{e.usedSessions}/{e.totalSessions}</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: st.color, background: st.bg }}>
                            {STATUS_LABELS[e.status]}
                          </span>
                        </td>
                        <td>
                          {e.status === 'active' && e.usedSessions < e.totalSessions && (
                            <button className="btn btn-teal btn-sm" onClick={() => setConfirmUse(e)}>使用</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {enrichedEnrollments.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24 }}>暫無登記紀錄</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════ */}
      {/* Tab 3: Membership Tiers         */}
      {/* ════════════════════════════════ */}
      {tab === 'tiers' && (
        <>
          {/* Tier Info Cards */}
          <div className="stats-grid">
            {MEMBERSHIP_TIERS.map(tier => (
              <div className="stat-card" key={tier.name} style={{ borderLeft: `4px solid ${tier.color}` }}>
                <div className="stat-label">{tier.name}</div>
                <div className="stat-value" style={{ color: tier.color, fontSize: 18 }}>
                  {tier.minSpent > 0 ? fmtM(tier.minSpent) : '預設'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4 }}>
                  {tier.discount > 0 ? `${(tier.discount * 100).toFixed(0)}% 折扣` : '無折扣'}
                </div>
              </div>
            ))}
          </div>

          {/* Patient Membership Table */}
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>病人姓名</th><th>電話</th><th>累計消費</th><th>會員等級</th><th>折扣率</th>
                  </tr>
                </thead>
                <tbody>
                  {membershipData.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.phone}</td>
                      <td className="money">{fmtM(p.totalSpent)}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                          color: p.tier.color, background: p.tier.bg,
                          border: `1px solid ${p.tier.color}`,
                        }}>
                          {p.tier.name} {p.tier.discount > 0 ? `${p.tier.discount * 100}%折扣` : ''}
                        </span>
                      </td>
                      <td>{p.tier.discount > 0 ? `${(p.tier.discount * 100).toFixed(0)}%` : '-'}</td>
                    </tr>
                  ))}
                  {membershipData.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24 }}>暫無病人資料</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════ */}
      {/* Package Add/Edit Modal          */}
      {/* ════════════════════════════════ */}
      {showPkgModal && (
        <div className="modal-overlay" onClick={() => setShowPkgModal(false)} role="dialog" aria-modal="true" aria-label={editPkg ? '編輯套餐' : '新增套餐'}>
          <div className="modal" onClick={e => e.stopPropagation()} ref={pkgModalRef} style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>{editPkg ? '編輯套餐' : '新增套餐'}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowPkgModal(false)} aria-label="關閉">✕</button>
            </div>
            <form onSubmit={handleSavePkg}>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div>
                  <label>套餐名稱 *</label>
                  <input value={pkgForm.name} onChange={e => setPkgForm({ ...pkgForm, name: e.target.value })} placeholder="例: 針灸療程10次" />
                </div>
                <div>
                  <label>類型</label>
                  <select value={pkgForm.type} onChange={e => setPkgForm({ ...pkgForm, type: e.target.value })}>
                    <option value="session">次數制</option>
                    <option value="time">時間制</option>
                  </select>
                </div>
              </div>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div>
                  <label>次數</label>
                  <input type="number" min="1" value={pkgForm.sessions} onChange={e => setPkgForm({ ...pkgForm, sessions: e.target.value })} />
                </div>
                <div>
                  <label>價格 ($) *</label>
                  <input type="number" min="0" step="0.01" value={pkgForm.price} onChange={e => setPkgForm({ ...pkgForm, price: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label>有效天數</label>
                  <input type="number" min="1" value={pkgForm.validDays} onChange={e => setPkgForm({ ...pkgForm, validDays: e.target.value })} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>治療項目</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {TCM_TREATMENTS.map(t => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: pkgForm.treatments.includes(t) ? 'var(--teal-50)' : 'var(--gray-50)', border: `1px solid ${pkgForm.treatments.includes(t) ? 'var(--teal-400)' : 'var(--gray-200)'}` }}>
                      <input type="checkbox" checked={pkgForm.treatments.includes(t)} onChange={() => toggleTreatment(t)} style={{ width: 14, height: 14 }} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={pkgForm.active} onChange={e => setPkgForm({ ...pkgForm, active: e.target.checked })} style={{ width: 16, height: 16 }} />
                  啟用此套餐
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-teal">{editPkg ? '更新套餐' : '新增套餐'}</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowPkgModal(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* Enrollment Add Modal            */}
      {/* ════════════════════════════════ */}
      {showEnrollModal && (
        <div className="modal-overlay" onClick={() => setShowEnrollModal(false)} role="dialog" aria-modal="true" aria-label="新增登記">
          <div className="modal" onClick={e => e.stopPropagation()} ref={enrollModalRef} style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>新增套餐登記</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowEnrollModal(false)} aria-label="關閉">✕</button>
            </div>
            <form onSubmit={handleSaveEnroll}>
              <div style={{ marginBottom: 12 }}>
                <label>選擇套餐 *</label>
                <select value={enrollForm.packageId} onChange={e => setEnrollForm({ ...enrollForm, packageId: e.target.value })}>
                  <option value="">-- 請選擇 --</option>
                  {activePkgs.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({fmtM(p.price)} / {p.sessions}次)</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 12, position: 'relative' }}>
                <label>搜尋病人 *</label>
                <input
                  value={patientSearch}
                  onChange={e => { setPatientSearch(e.target.value); setShowPatientDrop(true); setEnrollForm(f => ({ ...f, patientId: '', patientName: '', patientPhone: '' })); }}
                  onFocus={() => { if (patientSearch) setShowPatientDrop(true); }}
                  placeholder="輸入姓名或電話..."
                />
                {showPatientDrop && filteredPatients.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
                    {filteredPatients.map(p => (
                      <div key={p.id} onClick={() => handleSelectPatient(p)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-50)'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                        <span style={{ color: 'var(--gray-400)' }}>{p.phone}</span>
                      </div>
                    ))}
                  </div>
                )}
                {enrollForm.patientId && (
                  <div style={{ fontSize: 11, color: 'var(--teal-600)', marginTop: 4 }}>
                    已選擇: {enrollForm.patientName} ({enrollForm.patientPhone})
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>店舖</label>
                <select value={enrollForm.store} onChange={e => setEnrollForm({ ...enrollForm, store: e.target.value })}>
                  <option>宋皇臺</option>
                  <option>太子</option>
                </select>
              </div>
              {enrollForm.packageId && (() => {
                const pkg = packages.find(p => p.id === enrollForm.packageId);
                if (!pkg) return null;
                const today = new Date().toISOString().substring(0, 10);
                const expiry = new Date(Date.now() + (pkg.validDays || 180) * 86400000).toISOString().substring(0, 10);
                return (
                  <div style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 12 }}>
                    <div className="grid-2">
                      <div><strong>購買日期：</strong>{today}</div>
                      <div><strong>到期日：</strong>{expiry}</div>
                      <div><strong>總次數：</strong>{pkg.sessions} 次</div>
                      <div><strong>價格：</strong>{fmtM(pkg.price)}</div>
                    </div>
                  </div>
                );
              })()}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-teal">確認登記</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowEnrollModal(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* Confirm Use Session Modal       */}
      {/* ════════════════════════════════ */}
      {confirmUse && (
        <ConfirmModal
          message={`確認使用 ${confirmUse.patientName} 的「${enrichedEnrollments.find(e => e.id === confirmUse.id)?.packageName || ''}」套餐 1 次？ (目前 ${confirmUse.usedSessions}/${confirmUse.totalSessions})`}
          onConfirm={handleUseSession}
          onCancel={() => setConfirmUse(null)}
        />
      )}
    </>
  );
}
