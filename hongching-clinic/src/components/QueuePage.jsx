import { useState, useMemo, useRef } from 'react';
import { saveQueue, deleteQueue } from '../api';
import { uid, DOCTORS, fmtM } from '../data';
import { getServices } from '../config';
import { useFocusTrap, nullRef } from './ConfirmModal';
import ConfirmModal from './ConfirmModal';

const STATUS_LABELS = {
  waiting: '等候中',
  'in-consultation': '診症中',
  dispensing: '配藥中',
  billing: '收費中',
  completed: '已完成',
};

const STATUS_TAGS = {
  waiting: 'tag-pending',
  'in-consultation': 'tag-fps',
  dispensing: 'tag-pending-orange',
  billing: 'tag-cash',
  completed: 'tag-paid',
};

const STORES = ['宋皇臺', '太子'];

function getToday() {
  return new Date().toISOString().substring(0, 10);
}

function getTimeNow() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function generateQueueNo(existingQueue, date) {
  const todayQueue = existingQueue.filter(q => q.date === date);
  const num = todayQueue.length + 1;
  return 'A' + String(num).padStart(3, '0');
}

export default function QueuePage({ data, setData, showToast, allData, user }) {
  const [showModal, setShowModal] = useState(false);
  const [filterDate, setFilterDate] = useState(getToday());
  const [filterDoctor, setFilterDoctor] = useState('all');
  const [filterStore, setFilterStore] = useState('all');
  const [deleteId, setDeleteId] = useState(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedServices, setSelectedServices] = useState([]);
  const [formDoctor, setFormDoctor] = useState(DOCTORS[0]);
  const [formStore, setFormStore] = useState(STORES[0]);
  const [patientSuggestions, setPatientSuggestions] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [saving, setSaving] = useState(false);

  const modalRef = useRef(null);
  useFocusTrap(showModal ? modalRef : nullRef);

  const SERVICES = getServices().filter(s => s.active);
  const queue = data.queue || [];
  const patients = allData?.patients || data.patients || [];

  // Stats for today
  const todayQueue = useMemo(() => {
    let q = queue.filter(r => r.date === filterDate);
    if (filterDoctor !== 'all') q = q.filter(r => r.doctor === filterDoctor);
    if (filterStore !== 'all') q = q.filter(r => r.store === filterStore);
    return q.sort((a, b) => (a.queueNo || '').localeCompare(b.queueNo || ''));
  }, [queue, filterDate, filterDoctor, filterStore]);

  const stats = useMemo(() => ({
    total: todayQueue.length,
    waiting: todayQueue.filter(r => r.status === 'waiting').length,
    inConsult: todayQueue.filter(r => r.status === 'in-consultation').length,
    completed: todayQueue.filter(r => r.status === 'completed').length,
  }), [todayQueue]);

  // Patient search autocomplete
  const handlePatientSearch = (val) => {
    setPatientSearch(val);
    setSelectedPatient(null);
    if (val.length > 0) {
      const q = val.toLowerCase();
      const matches = patients.filter(p =>
        p.name.toLowerCase().includes(q) || (p.phone && p.phone.includes(q))
      ).slice(0, 6);
      setPatientSuggestions(matches);
    } else {
      setPatientSuggestions([]);
    }
  };

  const selectPatient = (p) => {
    setSelectedPatient(p);
    setPatientSearch(p.name);
    setPatientSuggestions([]);
  };

  const toggleService = (label) => {
    setSelectedServices(prev =>
      prev.includes(label) ? prev.filter(s => s !== label) : [...prev, label]
    );
  };

  // Quick registration
  const handleRegister = async (e) => {
    e.preventDefault();
    const name = selectedPatient ? selectedPatient.name : patientSearch.trim();
    if (!name) return showToast('請選擇或輸入病人');
    if (!selectedServices.length) return showToast('請選擇服務項目');

    setSaving(true);
    const totalFee = selectedServices.reduce((sum, label) => {
      const svc = SERVICES.find(s => s.label === label);
      return sum + (svc ? svc.fee : 0);
    }, 0);

    const record = {
      id: uid(),
      queueNo: generateQueueNo(queue, filterDate),
      patientName: name,
      patientPhone: selectedPatient?.phone || '',
      date: filterDate,
      registeredAt: getTimeNow(),
      arrivedAt: '',
      completedAt: '',
      doctor: formDoctor,
      store: formStore,
      services: selectedServices.join('; '),
      serviceFee: totalFee,
      status: 'waiting',
      dispensingStatus: 'not-needed',
      paymentStatus: 'pending',
      consultationId: '',
      createdAt: new Date().toISOString(),
    };

    await saveQueue(record);
    setData({ ...data, queue: [...queue, record] });
    showToast(`已掛號 ${record.queueNo} — ${name}`);
    setPatientSearch('');
    setSelectedPatient(null);
    setSelectedServices([]);
    setSaving(false);
    setShowModal(false);
  };

  // Status transitions
  const updateStatus = async (item, newStatus) => {
    const updated = { ...item, status: newStatus };
    if (newStatus === 'in-consultation') updated.arrivedAt = getTimeNow();
    if (newStatus === 'completed') updated.completedAt = getTimeNow();
    await saveQueue(updated);
    setData({ ...data, queue: queue.map(q => q.id === item.id ? updated : q) });
    showToast(`${item.queueNo} ${STATUS_LABELS[newStatus]}`);
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteQueue(deleteId);
    setData({ ...data, queue: queue.filter(q => q.id !== deleteId) });
    showToast('已刪除');
    setDeleteId(null);
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">今日掛號</div><div className="stat-value teal">{stats.total}</div></div>
        <div className="stat-card gold"><div className="stat-label">等候中</div><div className="stat-value gold">{stats.waiting}</div></div>
        <div className="stat-card green"><div className="stat-label">診症中</div><div className="stat-value green">{stats.inConsult}</div></div>
        <div className="stat-card red"><div className="stat-label">已完成</div><div className="stat-value red">{stats.completed}</div></div>
      </div>

      {/* Filter + Quick Register */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" style={{ width: 'auto' }} value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        <select style={{ width: 'auto' }} value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)}>
          <option value="all">全部醫師</option>
          {DOCTORS.map(d => <option key={d}>{d}</option>)}
        </select>
        <select style={{ width: 'auto' }} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
          <option value="all">全部店舖</option>
          {STORES.map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-teal" onClick={() => setShowModal(true)}>+ 快速掛號</button>
      </div>

      {/* Queue Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header">
          <h3>排隊列表 ({todayQueue.length} 人)</h3>
        </div>
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>號碼</th>
                <th>病人</th>
                <th>電話</th>
                <th>醫師</th>
                <th>服務</th>
                <th style={{ textAlign: 'right' }}>費用</th>
                <th>掛號時間</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {!todayQueue.length && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無掛號紀錄</td></tr>
              )}
              {todayQueue.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 800, fontSize: 14, color: 'var(--teal-700)' }}>{r.queueNo}</td>
                  <td style={{ fontWeight: 600 }}>{r.patientName}</td>
                  <td style={{ color: 'var(--gray-500)', fontSize: 11 }}>{r.patientPhone || '-'}</td>
                  <td>{r.doctor}</td>
                  <td style={{ fontSize: 11 }}>{r.services}</td>
                  <td className="money">{fmtM(r.serviceFee)}</td>
                  <td style={{ fontSize: 11, color: 'var(--gray-500)' }}>{r.registeredAt}</td>
                  <td><span className={`tag ${STATUS_TAGS[r.status] || ''}`}>{STATUS_LABELS[r.status]}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {r.status === 'waiting' && (
                        <button className="btn btn-green btn-sm" onClick={() => updateStatus(r, 'in-consultation')}>開診</button>
                      )}
                      {r.status === 'in-consultation' && (
                        <button className="btn btn-gold btn-sm" onClick={() => updateStatus(r, 'dispensing')}>配藥</button>
                      )}
                      {r.status === 'dispensing' && (
                        <button className="btn btn-teal btn-sm" onClick={() => updateStatus(r, 'billing')}>收費</button>
                      )}
                      {r.status === 'billing' && (
                        <button className="btn btn-green btn-sm" onClick={() => updateStatus(r, 'completed')}>完成</button>
                      )}
                      {r.status !== 'completed' && (
                        <button className="btn btn-outline btn-sm" onClick={() => setDeleteId(r.id)}>刪除</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Registration Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)} role="dialog" aria-modal="true" aria-label="快速掛號">
          <div className="modal" onClick={e => e.stopPropagation()} ref={modalRef} style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>快速掛號</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowModal(false)} aria-label="關閉">✕</button>
            </div>
            <form onSubmit={handleRegister}>
              <div style={{ marginBottom: 12, position: 'relative' }}>
                <label>病人 *</label>
                <input
                  value={patientSearch}
                  onChange={e => handlePatientSearch(e.target.value)}
                  onBlur={() => setTimeout(() => setPatientSuggestions([]), 150)}
                  placeholder="搜尋病人姓名或電話..."
                  autoFocus
                />
                {patientSuggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 180, overflowY: 'auto' }}>
                    {patientSuggestions.map(p => (
                      <div key={p.id} onMouseDown={() => selectPatient(p)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--gray-100)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--teal-50)'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        {p.name} — {p.phone}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div>
                  <label>醫師</label>
                  <select value={formDoctor} onChange={e => setFormDoctor(e.target.value)}>
                    {DOCTORS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label>店舖</label>
                  <select value={formStore} onChange={e => setFormStore(e.target.value)}>
                    {STORES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>服務項目 *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SERVICES.map(svc => (
                    <button
                      type="button"
                      key={svc.label}
                      className={`preset-chip ${selectedServices.includes(svc.label) ? 'active' : ''}`}
                      onClick={() => toggleService(svc.label)}
                    >
                      {svc.label} ({fmtM(svc.fee)})
                    </button>
                  ))}
                </div>
              </div>
              {selectedServices.length > 0 && (
                <div style={{ background: 'var(--teal-50)', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--teal-700)' }}>
                  費用合計：<strong>{fmtM(selectedServices.reduce((sum, label) => {
                    const svc = SERVICES.find(s => s.label === label);
                    return sum + (svc ? svc.fee : 0);
                  }, 0))}</strong>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-teal" disabled={saving}>
                  {saving ? '掛號中...' : '確認掛號'}
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <ConfirmModal
          message="確認刪除此掛號紀錄？"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </>
  );
}
