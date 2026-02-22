import { useState, useMemo } from 'react';
import { savePatient } from '../api';
import { uid, fmtM, getMonth, DOCTORS } from '../data';

const EMPTY = { name:'', phone:'', gender:'男', dob:'', address:'', allergies:'', notes:'', store:'宋皇臺', doctor:DOCTORS[0] };

export default function PatientPage({ data, setData, showToast }) {
  const [form, setForm] = useState({ ...EMPTY });
  const [search, setSearch] = useState('');
  const [filterDoc, setFilterDoc] = useState('all');
  const [filterStore, setFilterStore] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [detail, setDetail] = useState(null);

  const patients = data.patients || [];
  const thisMonth = new Date().toISOString().substring(0, 7);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().substring(0, 10);

  const stats = useMemo(() => {
    const total = patients.length;
    const newThisMonth = patients.filter(p => getMonth(p.createdAt) === thisMonth).length;
    const active = patients.filter(p => p.lastVisit >= thirtyDaysAgo).length;
    const avgSpent = total ? patients.reduce((s, p) => s + Number(p.totalSpent || 0), 0) / total : 0;
    return { total, newThisMonth, active, avgSpent };
  }, [patients, thisMonth, thirtyDaysAgo]);

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
      r.name === detail.name || r.name.includes(detail.name)
    ).sort((a, b) => b.date.localeCompare(a.date));
  }, [detail, data.revenue]);

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">總病人數</div><div className="stat-value teal">{stats.total}</div></div>
        <div className="stat-card green"><div className="stat-label">本月新病人</div><div className="stat-value green">{stats.newThisMonth}</div></div>
        <div className="stat-card gold"><div className="stat-label">活躍病人 (30天)</div><div className="stat-value gold">{stats.active}</div></div>
        <div className="stat-card"><div className="stat-label">平均消費</div><div className="stat-value teal">{fmtM(stats.avgSpent)}</div></div>
      </div>

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
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>病人詳情 — {detail.name}</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setDetail(null)}>✕ 關閉</button>
            </div>
            <div className="grid-3" style={{ marginBottom: 16, fontSize: 13 }}>
              <div><strong>電話：</strong>{detail.phone}</div>
              <div><strong>性別：</strong>{detail.gender}</div>
              <div><strong>年齡：</strong>{calcAge(detail.dob)}</div>
              <div><strong>地址：</strong>{detail.address || '-'}</div>
              <div><strong>過敏史：</strong>{detail.allergies || '-'}</div>
              <div><strong>主診：</strong>{detail.doctor}</div>
            </div>
            {detail.notes && <div style={{ fontSize: 13, marginBottom: 16, padding: 10, background: 'var(--gray-50)', borderRadius: 6 }}><strong>備註：</strong>{detail.notes}</div>}
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>就診歷史</h4>
            <div className="table-wrap">
              <table>
                <thead><tr><th>日期</th><th>項目</th><th>金額</th><th>醫師</th><th>店舖</th></tr></thead>
                <tbody>
                  {visitHistory.map(r => (
                    <tr key={r.id}><td>{String(r.date).substring(0, 10)}</td><td>{r.item}</td><td className="money">{fmtM(r.amount)}</td><td>{r.doctor}</td><td>{r.store}</td></tr>
                  ))}
                  {visitHistory.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-400)' }}>暫無就診紀錄</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
