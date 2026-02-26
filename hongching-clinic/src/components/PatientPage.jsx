import { useState, useMemo } from 'react';
import { savePatient } from '../api';
import { uid, fmtM, getMonth, DOCTORS, getMembershipTier } from '../data';

const EMPTY = { name:'', phone:'', gender:'男', dob:'', address:'', allergies:'', notes:'', store:'宋皇臺', doctor:DOCTORS[0] };

export default function PatientPage({ data, setData, showToast, onNavigate }) {
  const [form, setForm] = useState({ ...EMPTY });
  const [search, setSearch] = useState('');
  const [filterDoc, setFilterDoc] = useState('all');
  const [filterStore, setFilterStore] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [detail, setDetail] = useState(null);

  const patients = data.patients || [];
  const thisMonth = new Date().toISOString().substring(0, 7);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10);

  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().substring(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().substring(0, 10);

  const stats = useMemo(() => {
    const total = patients.length;
    const newThisMonth = patients.filter(p => getMonth(p.createdAt) === thisMonth).length;
    const active = patients.filter(p => p.lastVisit >= thirtyDaysAgo).length;
    const avgSpent = total ? patients.reduce((s, p) => s + Number(p.totalSpent || 0), 0) / total : 0;
    return { total, newThisMonth, active, avgSpent };
  }, [patients, thisMonth, thirtyDaysAgo]);

  // Churn prediction: patients who visited before but haven't in 60+ days
  const churnRisk = useMemo(() => {
    return patients
      .filter(p => p.lastVisit && p.lastVisit < sixtyDaysAgo && p.lastVisit >= ninetyDaysAgo && (p.totalVisits || 0) >= 2)
      .sort((a, b) => (a.lastVisit || '').localeCompare(b.lastVisit || ''));
  }, [patients, sixtyDaysAgo, ninetyDaysAgo]);

  const churned = useMemo(() => {
    return patients
      .filter(p => p.lastVisit && p.lastVisit < ninetyDaysAgo && (p.totalVisits || 0) >= 2)
      .length;
  }, [patients, ninetyDaysAgo]);

  const filtered = useMemo(() => {
    let list = [...patients];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q));
    }
    if (filterDoc !== 'all') list = list.filter(p => p.doctor === filterDoc);
    if (filterStore !== 'all') list = list.filter(p => p.store === filterStore);
    if (filterStatus !== 'all') list = list.filter(p => p.status === filterStatus);
    return list;
  }, [patients, search, filterDoc, filterStore, filterStatus]);

  const calcAge = (dob) => {
    if (!dob) return '-';
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (365.25 * 86400000));
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) return showToast('請填寫姓名和電話');
    const now = new Date().toISOString().substring(0, 10);
    const record = {
      ...form, id: uid(), firstVisit: now, lastVisit: now,
      totalVisits: 0, totalSpent: 0, status: 'active', createdAt: now,
    };
    await savePatient(record);
    setData({ ...data, patients: [...patients, record] });
    setForm({ ...EMPTY });
    showToast('已新增病人');
  };

  const visitHistory = useMemo(() => {
    if (!detail) return [];
    return (data.revenue || []).filter(r =>
      r.name === detail.name
    ).sort((a, b) => b.date.localeCompare(a.date));
  }, [detail, data.revenue]);

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">總病人數</div><div className="stat-value teal">{stats.total}</div></div>
        <div className="stat-card green"><div className="stat-label">本月新病人</div><div className="stat-value green">{stats.newThisMonth}</div></div>
        <div className="stat-card gold"><div className="stat-label">活躍病人 (30天)</div><div className="stat-value gold">{stats.active}</div></div>
        <div className="stat-card red"><div className="stat-label">流失風險</div><div className="stat-value red">{churnRisk.length}</div></div>
      </div>

      {/* Churn Risk Alert */}
      {churnRisk.length > 0 && (
        <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', marginBottom: 16 }}>
          <div className="card-header" style={{ borderBottom: 'none' }}>
            <h3 style={{ color: '#991b1b', fontSize: 14 }}>⚠️ 流失風險病人 ({churnRisk.length})</h3>
            <span style={{ fontSize: 11, color: '#991b1b' }}>60-90天未覆診 | 已流失(&gt;90天): {churned}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 16px 12px' }}>
            {churnRisk.slice(0, 8).map(p => (
              <div key={p.id} onClick={() => setDetail(p)} style={{
                padding: '6px 12px', borderRadius: 8, background: '#fff', border: '1px solid #fecaca',
                cursor: 'pointer', fontSize: 12,
              }}>
                <strong>{p.name}</strong>
                <div style={{ color: '#991b1b', fontSize: 10 }}>最後到訪: {p.lastVisit} | {p.totalVisits}次 | {fmtM(p.totalSpent || 0)}</div>
              </div>
            ))}
            {churnRisk.length > 8 && <div style={{ padding: '6px 12px', fontSize: 12, color: '#991b1b' }}>+{churnRisk.length - 8} 更多...</div>}
          </div>
        </div>
      )}

      {/* Add Form */}
      <div className="card">
        <div className="card-header"><h3>新增病人</h3></div>
        <form onSubmit={handleAdd}>
          <div className="grid-3" style={{ marginBottom: 12 }}>
            <div><label>姓名 *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="病人姓名" /></div>
            <div><label>電話 *</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="電話號碼" /></div>
            <div><label>性別</label><select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}><option>男</option><option>女</option></select></div>
          </div>
          <div className="grid-3" style={{ marginBottom: 12 }}>
            <div><label>出生日期</label><input type="date" value={form.dob} onChange={e => setForm({...form, dob: e.target.value})} /></div>
            <div><label>地址</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="地址" /></div>
            <div><label>過敏史</label><input value={form.allergies} onChange={e => setForm({...form, allergies: e.target.value})} placeholder="如無請填「無」" /></div>
          </div>
          <div className="grid-2" style={{ marginBottom: 12 }}>
            <div><label>主診醫師</label><select value={form.doctor} onChange={e => setForm({...form, doctor: e.target.value})}>{DOCTORS.map(d => <option key={d}>{d}</option>)}</select></div>
            <div><label>備註</label><input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="備註" /></div>
          </div>
          <button type="submit" className="btn btn-teal">新增病人</button>
        </form>
      </div>

      {/* Search & Filter */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ flex: 1, minWidth: 200 }} placeholder="🔍 搜尋姓名或電話..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ width: 'auto' }} value={filterDoc} onChange={e => setFilterDoc(e.target.value)}>
          <option value="all">所有醫師</option>
          {DOCTORS.map(d => <option key={d}>{d}</option>)}
        </select>
        <select style={{ width: 'auto' }} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
          <option value="all">所有店舖</option>
          <option>宋皇臺</option><option>太子</option>
        </select>
        <select style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">所有狀態</option>
          <option value="active">活躍</option><option value="inactive">非活躍</option>
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>姓名</th><th>電話</th><th>性別</th><th>年齡</th><th>主診醫師</th>
                <th>首次到診</th><th>最後到診</th><th>總次數</th><th>累計消費</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td><span style={{ color: 'var(--teal-700)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setDetail(p)}>{p.name}</span></td>
                  <td>{p.phone}</td>
                  <td>{p.gender}</td>
                  <td>{calcAge(p.dob)}</td>
                  <td>{p.doctor}</td>
                  <td>{p.firstVisit}</td>
                  <td>{p.lastVisit}</td>
                  <td>{p.totalVisits}</td>
                  <td className="money">{fmtM(p.totalSpent || 0)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24 }}>暫無病人紀錄</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {detail && (() => {
        const tier = getMembershipTier(detail.totalSpent || 0);
        const consultations = (data.consultations || []).filter(c => c.patientId === detail.id || c.patientName === detail.name).sort((a, b) => b.date.localeCompare(a.date));
        const activeEnrollments = (data.enrollments || []).filter(e => e.patientId === detail.id && e.status === 'active');
        return (
        <div className="modal-overlay" onClick={() => setDetail(null)} role="dialog" aria-modal="true" aria-label="病人詳情">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 750 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3>病人詳情 — {detail.name}</h3>
                <span className="membership-badge" style={{ color: tier.color, background: tier.bg, border: `1px solid ${tier.color}` }}>
                  {tier.name}{tier.discount > 0 ? ` ${tier.discount*100}%折扣` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {onNavigate && <button className="btn btn-teal btn-sm" onClick={() => { setDetail(null); onNavigate('emr'); }}>開診</button>}
                <button className="btn btn-outline btn-sm" onClick={() => setDetail(null)} aria-label="關閉">✕</button>
              </div>
            </div>
            <div className="grid-3" style={{ marginBottom: 16, fontSize: 13 }}>
              <div><strong>電話：</strong>{detail.phone}</div>
              <div><strong>性別：</strong>{detail.gender}</div>
              <div><strong>年齡：</strong>{calcAge(detail.dob)}</div>
              <div><strong>地址：</strong>{detail.address || '-'}</div>
              <div><strong>過敏史：</strong>{detail.allergies || '-'}</div>
              <div><strong>主診：</strong>{detail.doctor}</div>
              <div><strong>累計消費：</strong>{fmtM(detail.totalSpent || 0)}</div>
              <div><strong>總就診：</strong>{detail.totalVisits || 0} 次</div>
              <div><strong>店舖：</strong>{detail.store}</div>
            </div>
            {detail.notes && <div style={{ fontSize: 13, marginBottom: 16, padding: 10, background: 'var(--gray-50)', borderRadius: 6 }}><strong>備註：</strong>{detail.notes}</div>}
            {activeEnrollments.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>活躍套餐</h4>
                {activeEnrollments.map(e => {
                  const pkg = (data.packages || []).find(p => p.id === e.packageId);
                  return (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, background: 'var(--teal-50)', borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
                      <strong>{pkg?.name || '套餐'}</strong>
                      <div className="progress-bar" style={{ flex: 1 }}>
                        <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: `${(e.usedSessions/e.totalSessions)*100}%` }} /></div>
                        <span className="progress-bar-label">{e.usedSessions}/{e.totalSessions}</span>
                      </div>
                      <span style={{ color: 'var(--gray-400)' }}>到期：{e.expiryDate}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {/* ── Visit Timeline ── */}
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>就診時間線 ({consultations.length + visitHistory.length} 筆紀錄)</h4>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {consultations.length === 0 && visitHistory.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24, fontSize: 13 }}>暫無就診紀錄</div>
              )}
              {/* Merge and sort by date */}
              {[
                ...consultations.map(c => ({ type: 'emr', date: c.date, data: c })),
                ...visitHistory.filter(r => !consultations.find(c => c.date === r.date && c.patientName === r.name)).map(r => ({ type: 'rev', date: String(r.date).substring(0, 10), data: r })),
              ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--gray-100)' }}>
                  {/* Timeline dot */}
                  <div style={{ minWidth: 44, textAlign: 'center' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.type === 'emr' ? '#0e7490' : '#d97706', margin: '4px auto 4px' }} />
                    <div style={{ fontSize: 10, color: '#999' }}>{item.date}</div>
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, fontSize: 12 }}>
                    {item.type === 'emr' ? (
                      <>
                        <div style={{ fontWeight: 700, color: '#0e7490', marginBottom: 2 }}>
                          {item.data.tcmDiagnosis || item.data.assessment || '診症'} — {item.data.doctor}
                        </div>
                        {item.data.tcmPattern && <div style={{ color: '#666' }}>辨證：{item.data.tcmPattern}</div>}
                        {(item.data.treatments || []).length > 0 && <div>治療：{item.data.treatments.join('、')}</div>}
                        {item.data.formulaName && <div style={{ fontWeight: 600 }}>處方：{item.data.formulaName} ({item.data.formulaDays || '-'}帖)</div>}
                        {(item.data.prescription || []).length > 0 && (
                          <div style={{ color: '#666', marginTop: 2 }}>
                            藥材：{item.data.prescription.map(r => `${r.herb} ${r.dosage}`).join('、')}
                          </div>
                        )}
                        {item.data.acupuncturePoints && <div>穴位：{item.data.acupuncturePoints}</div>}
                        {item.data.subjective && <div style={{ color: '#888', marginTop: 2 }}>主訴：{item.data.subjective}</div>}
                        {item.data.followUpDate && <div style={{ color: '#d97706' }}>覆診：{item.data.followUpDate}</div>}
                      </>
                    ) : (
                      <div>
                        <span style={{ fontWeight: 600, color: '#92400e' }}>{item.data.item}</span>
                        <span style={{ marginLeft: 8 }}>{fmtM(item.data.amount)}</span>
                        <span style={{ marginLeft: 8, color: '#888' }}>{item.data.doctor} | {item.data.store}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        );
      })()}
    </>
  );
}
