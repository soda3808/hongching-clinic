import { useState, useMemo, useEffect } from 'react';
import { savePatient, openWhatsApp, saveCommunication } from '../api';
import { uid, fmtM, getMonth, DOCTORS, getMembershipTier } from '../data';
import { getPatientPoints, getLoyaltyTier, loadPointsHistory, addPointsEntry, LOYALTY_CONFIG } from '../utils/loyalty';
import { getCurrentUser } from '../auth';
import { getTenantStoreNames, getClinicName } from '../tenant';
import usePagination, { PaginationBar } from '../hooks/usePagination.jsx';
import EmptyState from './EmptyState';
import escapeHtml from '../utils/escapeHtml';
import { S, ECTCM, rowStyle } from '../styles/ectcm';

const EMPTY = { name:'', phone:'', gender:'男', dob:'', dobYear:'', dobMonth:'', dobDay:'', address:'', allergies:'', notes:'', store:getTenantStoreNames()[0] || '', doctor:DOCTORS[0], chronicConditions:'', medications:'', bloodType:'', referralSource:'', consentFollowUp: true };
const REFERRAL_SOURCES = ['親友推薦', '網上搜尋', '社交媒體', '路過', '醫師轉介', '舊病人回歸', '廣告', '其他'];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 120 }, (_, i) => currentYear - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export default function PatientPage({ data, setData, showToast, onNavigate }) {
  const [form, setForm] = useState({ ...EMPTY });
  const [justCreated, setJustCreated] = useState(null); // newly created patient for quick actions
  const [search, setSearch] = useState('');
  const [filterDoc, setFilterDoc] = useState('all');
  const [filterStore, setFilterStore] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [detail, setDetail] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importData, setImportData] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [showBatchWA, setShowBatchWA] = useState(false);
  const [batchMsg, setBatchMsg] = useState('');
  const [showCommLog, setShowCommLog] = useState(false);
  const [commForm, setCommForm] = useState({ type: 'phone', notes: '' });
  const [pointsHistory, setPointsHistory] = useState(() => loadPointsHistory());
  const [showPoints, setShowPoints] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState('');
  const [timelineFilter, setTimelineFilter] = useState('all');
  const [waModalTab, setWaModalTab] = useState('send'); // 'send' | 'schedule' | 'log'
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduledMsgs, setScheduledMsgs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hc_scheduled_msgs') || '[]'); } catch { return []; }
  });
  const [deliveryLog, setDeliveryLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hc_msg_delivery_log') || '[]'); } catch { return []; }
  });

  const patients = data.patients || [];
  const communications = data.communications || [];
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

  // ── Patient LTV & RFM Segmentation (#93) ──
  const segmentation = useMemo(() => {
    const today = new Date();
    const segments = { vip: [], highValue: [], regular: [], newPatient: [], atRisk: [], dormant: [] };
    const patientsWithLTV = patients.map(p => {
      const spent = Number(p.totalSpent || 0);
      const visits = Number(p.totalVisits || 0);
      const daysSince = p.lastVisit ? Math.floor((today - new Date(p.lastVisit)) / 86400000) : 999;
      // RFM scores (1-5)
      const recency = daysSince <= 14 ? 5 : daysSince <= 30 ? 4 : daysSince <= 60 ? 3 : daysSince <= 120 ? 2 : 1;
      const frequency = visits >= 12 ? 5 : visits >= 8 ? 4 : visits >= 4 ? 3 : visits >= 2 ? 2 : 1;
      const monetary = spent >= 5000 ? 5 : spent >= 3000 ? 4 : spent >= 1500 ? 3 : spent >= 500 ? 2 : 1;
      const rfmScore = recency + frequency + monetary;
      // Segment
      let segment = 'regular';
      if (rfmScore >= 13) segment = 'vip';
      else if (rfmScore >= 10) segment = 'highValue';
      else if (visits <= 1 && daysSince <= 30) segment = 'newPatient';
      else if (daysSince > 90) segment = 'dormant';
      else if (daysSince > 60 || (recency <= 2 && frequency >= 3)) segment = 'atRisk';
      segments[segment].push(p);
      return { ...p, ltv: spent, rfmScore, recency, frequency, monetary, segment };
    });
    const totalLTV = patientsWithLTV.reduce((s, p) => s + p.ltv, 0);
    const avgLTV = patients.length ? Math.round(totalLTV / patients.length) : 0;
    return { segments, totalLTV, avgLTV, top10: [...patientsWithLTV].sort((a, b) => b.ltv - a.ltv).slice(0, 10) };
  }, [patients]);

  const SEGMENT_CONFIG = {
    vip: { label: 'VIP', color: '#7c3aed', bg: '#f5f3ff' },
    highValue: { label: '高價值', color: '#0e7490', bg: '#ecfeff' },
    regular: { label: '正常', color: '#16a34a', bg: '#f0fdf4' },
    newPatient: { label: '新病人', color: '#2563eb', bg: '#eff6ff' },
    atRisk: { label: '流失風險', color: '#d97706', bg: '#fffbeb' },
    dormant: { label: '沉睡', color: '#9ca3af', bg: '#f9fafb' },
  };

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

  const { paged, ...pgProps } = usePagination(filtered, 50);

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
    setJustCreated(record);
    showToast('已新增病人');
    // Auto-clear after 15s
    setTimeout(() => setJustCreated(prev => prev?.id === record.id ? null : prev), 15000);
  };

  const quickQueue = (patient) => {
    // Store patient info for QueuePage quick registration
    sessionStorage.setItem('hcmc_quick_queue_patient', JSON.stringify({
      name: patient.name, phone: patient.phone, doctor: patient.doctor, store: patient.store,
    }));
    setJustCreated(null);
    if (onNavigate) onNavigate('queue');
  };

  // ── Communication Log ──
  const logCommunication = async (patientId, patientName) => {
    if (!commForm.notes.trim()) return showToast('請填寫溝通內容');
    const user = getCurrentUser();
    const record = {
      id: uid(), patientId, patientName,
      type: commForm.type, notes: commForm.notes.trim(),
      date: new Date().toISOString().substring(0, 10),
      time: new Date().toTimeString().substring(0, 5),
      staff: user?.displayName || user?.username || '員工',
      createdAt: new Date().toISOString(),
    };
    await saveCommunication(record);
    setData(prev => ({ ...prev, communications: [...(prev.communications || []), record] }));
    setCommForm({ type: 'phone', notes: '' });
    setShowCommLog(false);
    showToast('已記錄溝通');
  };

  const COMM_TYPES = [
    { value: 'phone', icon: '📞', label: '電話' },
    { value: 'whatsapp', icon: '📱', label: 'WhatsApp' },
    { value: 'walkin', icon: '🏥', label: '到店' },
    { value: 'email', icon: '📧', label: '電郵' },
    { value: 'other', icon: '📝', label: '其他' },
  ];

  // ── CSV Import ──
  const handleCSVFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { showToast('CSV 格式錯誤：至少需要標題行 + 1 筆資料'); return; }
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const nameIdx = headers.findIndex(h => /姓名|name/i.test(h));
      const phoneIdx = headers.findIndex(h => /電話|phone|tel/i.test(h));
      const genderIdx = headers.findIndex(h => /性別|gender/i.test(h));
      const dobIdx = headers.findIndex(h => /出生|dob|birth/i.test(h));
      const allergyIdx = headers.findIndex(h => /過敏|allerg/i.test(h));
      const doctorIdx = headers.findIndex(h => /醫師|doctor/i.test(h));
      const storeIdx = headers.findIndex(h => /店舖|store|分店/i.test(h));
      if (nameIdx === -1) { showToast('CSV 需包含「姓名」或「name」欄位'); return; }

      const parsed = []; const errs = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
        const name = cols[nameIdx] || '';
        const phone = phoneIdx >= 0 ? cols[phoneIdx] : '';
        if (!name) { errs.push({ row: i + 1, msg: '姓名為空' }); continue; }
        const isDupe = patients.some(p => p.phone && phone && p.phone === phone);
        parsed.push({
          name, phone,
          gender: genderIdx >= 0 ? cols[genderIdx] || '男' : '男',
          dob: dobIdx >= 0 ? cols[dobIdx] || '' : '',
          allergies: allergyIdx >= 0 ? cols[allergyIdx] || '' : '',
          doctor: doctorIdx >= 0 ? cols[doctorIdx] || DOCTORS[0] : DOCTORS[0],
          store: storeIdx >= 0 ? cols[storeIdx] || getTenantStoreNames()[0] || '' : getTenantStoreNames()[0] || '',
          isDupe, _row: i + 1,
        });
      }
      setImportData(parsed);
      setImportErrors(errs);
      setShowImport(true);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    const toImport = importData.filter(r => !r.isDupe);
    if (!toImport.length) { showToast('沒有可匯入的資料'); return; }
    const now = new Date().toISOString().substring(0, 10);
    const newPatients = [];
    for (const r of toImport) {
      const record = {
        id: uid(), name: r.name, phone: r.phone, gender: r.gender, dob: r.dob,
        allergies: r.allergies, doctor: r.doctor, store: r.store, address: '', notes: '',
        chronicConditions: '', medications: '', bloodType: '',
        firstVisit: now, lastVisit: now, totalVisits: 0, totalSpent: 0, status: 'active', createdAt: now,
      };
      await savePatient(record);
      newPatients.push(record);
    }
    setData({ ...data, patients: [...patients, ...newPatients] });
    showToast(`已匯入 ${newPatients.length} 位病人`);
    setShowImport(false);
    setImportData([]);
  };

  const visitHistory = useMemo(() => {
    if (!detail) return [];
    return (data.revenue || []).filter(r =>
      r.name === detail.name
    ).sort((a, b) => b.date.localeCompare(a.date));
  }, [detail, data.revenue]);

  const bookingHistory = useMemo(() => {
    if (!detail) return [];
    return (data.bookings || []).filter(b => b.patientName === detail.name).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [detail, data.bookings]);

  const commHistory = useMemo(() => {
    if (!detail) return [];
    return communications.filter(c => c.patientId === detail.id || c.patientName === detail.name).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [detail, communications]);

  return (
    <div style={S.page}>
      <div style={S.titleBar}>診所顧客列表 &gt; 顧客列表</div>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', flexWrap: 'wrap' }}>
        <div style={S.statCard}><div style={S.statLabel}>總病人數</div><div style={{ ...S.statValue, color: ECTCM.headerBg }}>{stats.total}</div></div>
        <div style={S.statCard}><div style={S.statLabel}>本月新病人</div><div style={{ ...S.statValue, color: ECTCM.btnSuccess }}>{stats.newThisMonth}</div></div>
        <div style={S.statCard}><div style={S.statLabel}>活躍病人 (30天)</div><div style={{ ...S.statValue, color: ECTCM.btnWarning }}>{stats.active}</div></div>
        <div style={S.statCard}><div style={S.statLabel}>流失風險</div><div style={{ ...S.statValue, color: ECTCM.btnDanger }}>{churnRisk.length}</div></div>
      </div>

      {/* Churn Risk Alert */}
      {churnRisk.length > 0 && (
        <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', marginBottom: 16 }}>
          <div className="card-header" style={{ borderBottom: 'none' }}>
            <h3 style={{ color: '#991b1b', fontSize: 14 }}>⚠️ 流失風險病人 ({churnRisk.length})</h3>
            <span style={{ fontSize: 11, color: '#991b1b' }}>60-90天未覆診 | 已流失(&gt;90天): {churned}</span>
          </div>
          <div style={{ padding: '0 16px 12px' }}>
            {churnRisk.slice(0, 10).map(p => {
              const daysSince = Math.floor((Date.now() - new Date(p.lastVisit).getTime()) / 86400000);
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #fde2e2', fontSize: 12 }}>
                  <span style={{ fontWeight: 700, minWidth: 60, cursor: 'pointer', color: '#0e7490' }} onClick={() => setDetail(p)}>{p.name}</span>
                  <span style={{ color: '#991b1b', fontSize: 10 }}>{daysSince}天前</span>
                  <span style={{ color: '#888', fontSize: 10 }}>{p.totalVisits}次 | {fmtM(p.totalSpent || 0)}</span>
                  <span style={{ color: '#888', fontSize: 10, flex: 1 }}>{p.lastVisit}</span>
                  {p.phone && (
                    <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff', fontSize: 10, padding: '2px 8px' }} onClick={(e) => {
                      e.stopPropagation();
                      openWhatsApp(p.phone, `【${getClinicName()}】${p.name}你好！好耐無見，掛住你呀！😊\n\n我哋最近推出咗新嘅療程優惠，想邀請你嚟體驗下。\n\n🎁 舊客回訪優惠：覆診免診金\n\n歡迎隨時預約！\n📞 致電或WhatsApp預約\n祝身體健康！🙏`);
                    }}>📱 WA</button>
                  )}
                </div>
              );
            })}
            {churnRisk.length > 10 && <div style={{ padding: '6px 0', fontSize: 11, color: '#991b1b' }}>+{churnRisk.length - 10} 更多...</div>}
          </div>
        </div>
      )}

      {/* Add Form */}
      <div className="card">
        <div className="card-header"><h3>新增病人</h3></div>
        <form onSubmit={handleAdd}>
          <div className="grid-3" style={{ marginBottom: 12 }}>
            <div><label>姓名 *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="病人姓名" aria-required="true" aria-label="病人姓名" /></div>
            <div><label>電話 *</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="電話號碼" aria-required="true" aria-label="病人電話" /></div>
            <div><label>性別</label><select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}><option>男</option><option>女</option></select></div>
          </div>
          <div className="grid-3" style={{ marginBottom: 12 }}>
            <div><label>出生日期</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <select value={form.dobYear} onChange={e => { const y = e.target.value; setForm(f => ({ ...f, dobYear: y, dob: y && f.dobMonth && f.dobDay ? `${y}-${String(f.dobMonth).padStart(2,'0')}-${String(f.dobDay).padStart(2,'0')}` : '' })); }} style={{ flex: 1.2 }}>
                  <option value="">年</option>{YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={form.dobMonth} onChange={e => { const m = e.target.value; setForm(f => ({ ...f, dobMonth: m, dob: f.dobYear && m && f.dobDay ? `${f.dobYear}-${String(m).padStart(2,'0')}-${String(f.dobDay).padStart(2,'0')}` : '' })); }} style={{ flex: 1 }}>
                  <option value="">月</option>{MONTHS.map(m => <option key={m} value={m}>{m}月</option>)}
                </select>
                <select value={form.dobDay} onChange={e => { const d = e.target.value; setForm(f => ({ ...f, dobDay: d, dob: f.dobYear && f.dobMonth && d ? `${f.dobYear}-${String(f.dobMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}` : '' })); }} style={{ flex: 1 }}>
                  <option value="">日</option>{DAYS.map(d => <option key={d} value={d}>{d}日</option>)}
                </select>
              </div>
            </div>
            <div><label>地址</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="地址" /></div>
            <div><label>過敏史</label><input value={form.allergies} onChange={e => setForm({...form, allergies: e.target.value})} placeholder="如無請填「無」" /></div>
          </div>
          <div className="grid-3" style={{ marginBottom: 12 }}>
            <div><label>慢性病</label><input value={form.chronicConditions} onChange={e => setForm({...form, chronicConditions: e.target.value})} placeholder="如高血壓、糖尿病" /></div>
            <div><label>長期用藥</label><input value={form.medications} onChange={e => setForm({...form, medications: e.target.value})} placeholder="西藥名稱" /></div>
            <div><label>血型</label><select value={form.bloodType} onChange={e => setForm({...form, bloodType: e.target.value})}><option value="">未知</option>{['A','B','AB','O'].map(t => <option key={t}>{t}</option>)}</select></div>
          </div>
          <div className="grid-3" style={{ marginBottom: 12 }}>
            <div><label>主診醫師</label><select value={form.doctor} onChange={e => setForm({...form, doctor: e.target.value})}>{DOCTORS.map(d => <option key={d}>{d}</option>)}</select></div>
            <div><label>轉介來源</label><select value={form.referralSource} onChange={e => setForm({...form, referralSource: e.target.value})}><option value="">未填</option>{REFERRAL_SOURCES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label>備註</label><input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="備註" /></div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13, color: '#334155' }}>
              <input type="checkbox" checked={form.consentFollowUp} onChange={e => setForm({...form, consentFollowUp: e.target.checked})} style={{ marginTop: 3 }} />
              <span>本人同意康晴綜合醫療中心透過 WhatsApp 或其他通訊方式，就本人之診療情況進行跟進聯絡及覆診提醒。</span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-teal">新增病人</button>
            <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
              📥 CSV 匯入
              <input type="file" accept=".csv" onChange={handleCSVFile} style={{ display: 'none' }} />
            </label>
          </div>
        </form>

        {/* Quick action banner after creating patient */}
        {justCreated && (
          <div style={{ marginTop: 12, padding: '12px 16px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13 }}>✅ 已新增 <b>{justCreated.name}</b></div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-teal btn-sm" onClick={() => quickQueue(justCreated)}>📋 即時掛號</button>
              {onNavigate && <button className="btn btn-green btn-sm" onClick={() => { sessionStorage.setItem('hcmc_pending_consult', JSON.stringify({ patientName: justCreated.name, patientPhone: justCreated.phone, doctor: justCreated.doctor, store: justCreated.store, date: new Date().toISOString().substring(0, 10) })); setJustCreated(null); onNavigate('emr'); }}>🩺 直接開診</button>}
              <button className="btn btn-outline btn-sm" onClick={() => setJustCreated(null)}>✕</button>
            </div>
          </div>
        )}
      </div>

      {/* CSV Import Modal */}
      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)} role="dialog" aria-modal="true">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>CSV 匯入預覽</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowImport(false)}>✕</button>
            </div>
            <div style={{ marginBottom: 12, fontSize: 12, display: 'flex', gap: 16 }}>
              <span>總共 <strong>{importData.length}</strong> 筆</span>
              <span style={{ color: 'var(--green-600)' }}>可匯入 <strong>{importData.filter(r => !r.isDupe).length}</strong></span>
              <span style={{ color: 'var(--red-500)' }}>重複 <strong>{importData.filter(r => r.isDupe).length}</strong></span>
              {importErrors.length > 0 && <span style={{ color: '#d97706' }}>錯誤 <strong>{importErrors.length}</strong></span>}
            </div>
            <div className="table-wrap" style={{ maxHeight: 350, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>狀態</th><th>姓名</th><th>電話</th><th>性別</th><th>出生日期</th><th>醫師</th><th>店舖</th></tr></thead>
                <tbody>
                  {importData.map((r, i) => (
                    <tr key={i} style={{ opacity: r.isDupe ? 0.5 : 1 }}>
                      <td>{r.isDupe ? <span className="tag tag-overdue" style={{ fontSize: 10 }}>重複</span> : <span className="tag tag-paid" style={{ fontSize: 10 }}>✓</span>}</td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td>{r.phone}</td>
                      <td>{r.gender}</td>
                      <td>{r.dob || '-'}</td>
                      <td>{r.doctor}</td>
                      <td>{r.store}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {importErrors.length > 0 && (
              <div style={{ marginTop: 8, padding: 8, background: '#fef3c7', borderRadius: 6, fontSize: 11 }}>
                {importErrors.map((e, i) => <div key={i}>第 {e.row} 行：{e.msg}</div>)}
              </div>
            )}
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button className="btn btn-teal" onClick={handleImportConfirm}>確認匯入 ({importData.filter(r => !r.isDupe).length} 筆)</button>
              <button className="btn btn-outline" onClick={() => setShowImport(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* LTV & Segmentation (#93) */}
      <div className="grid-2" style={{ marginBottom: 0 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 600, marginBottom: 8 }}>客戶分群</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(SEGMENT_CONFIG).map(([key, cfg]) => (
              <div key={key} style={{ padding: '4px 10px', background: cfg.bg, borderRadius: 8, textAlign: 'center', minWidth: 60 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: cfg.color }}>{segmentation.segments[key].length}</div>
                <div style={{ fontSize: 9, color: cfg.color }}>{cfg.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--gray-400)' }}>
            平均 LTV：{fmtM(segmentation.avgLTV)} · 總 LTV：{fmtM(segmentation.totalLTV)}
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 600, marginBottom: 8 }}>TOP 10 高價值病人</div>
          <div style={{ maxHeight: 120, overflowY: 'auto' }}>
            {segmentation.top10.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11, borderBottom: '1px solid var(--gray-100)' }}>
                <span><span style={{ fontWeight: 700, color: i < 3 ? '#d97706' : 'var(--gray-500)', marginRight: 4 }}>{i + 1}.</span>{p.name}</span>
                <span style={{ fontWeight: 600, color: 'var(--teal-700)' }}>{fmtM(p.ltv)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div style={S.filterBar} role="search" aria-label="病人搜尋與篩選">
        <span style={S.filterLabel}>搜尋：</span>
        <input style={{ ...S.filterInput, flex: 1, minWidth: 200 }} placeholder="搜尋姓名或電話..." value={search} onChange={e => setSearch(e.target.value)} aria-label="搜尋病人姓名或電話" />
        <span style={S.filterLabel}>醫師：</span>
        <select style={S.filterSelect} value={filterDoc} onChange={e => setFilterDoc(e.target.value)}>
          <option value="all">所有醫師</option>
          {DOCTORS.map(d => <option key={d}>{d}</option>)}
        </select>
        <span style={S.filterLabel}>店舖：</span>
        <select style={S.filterSelect} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
          <option value="all">所有店舖</option>
          {getTenantStoreNames().map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={S.filterLabel}>狀態：</span>
        <select style={S.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">所有狀態</option>
          <option value="active">活躍</option><option value="inactive">非活躍</option>
        </select>
      </div>

      {/* Batch Actions (#95) */}
      {selected.size > 0 && (
        <div className="card" style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', background: 'var(--teal-50)', border: '1px solid var(--teal-200)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal-700)' }}>已選 {selected.size} 位病人</span>
          <button className="btn btn-teal btn-sm" onClick={() => {
            const selPatients = filtered.filter(p => selected.has(p.id));
            const withPhone = selPatients.filter(p => p.phone);
            if (!withPhone.length) return showToast('所選病人沒有電話號碼');
            setBatchMsg(`親愛的病人，${getClinicName()}祝您身體健康！如需預約，歡迎致電或WhatsApp聯繫我們。`);
            setShowBatchWA(true);
          }}>批量 WhatsApp</button>
          <button className="btn btn-outline btn-sm" onClick={() => {
            const selPatients = filtered.filter(p => selected.has(p.id));
            const headers = ['姓名','電話','性別','年齡','主診醫師','店舖','首次到診','最後到診','總次數','累計消費'];
            const rows = selPatients.map(p => [p.name, p.phone, p.gender, calcAge(p.dob), p.doctor, p.store, p.firstVisit, p.lastVisit, p.totalVisits, p.totalSpent || 0]);
            const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `patients_selected_${new Date().toISOString().substring(0,10)}.csv`; a.click();
            showToast(`已匯出 ${selPatients.length} 位病人`);
          }}>匯出所選</button>
          <button className="btn btn-outline btn-sm" onClick={() => {
            const selPatients = filtered.filter(p => selected.has(p.id));
            const withPhone = selPatients.filter(p => p.phone || p.name);
            if (!withPhone.length) return showToast('所選病人沒有資料');
            const vcards = withPhone.map(p => {
              const nameParts = (p.name || '').split('');
              return `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${p.name || ''}\r\nN:${nameParts.length > 1 ? nameParts[0] + ';' + nameParts.slice(1).join('') : p.name + ';;;'}\r\n${p.phone ? 'TEL;TYPE=CELL:+852' + p.phone.replace(/\D/g, '') + '\r\n' : ''}${p.email ? 'EMAIL:' + p.email + '\r\n' : ''}${p.address ? 'ADR;TYPE=HOME:;;' + p.address + ';;;;\r\n' : ''}NOTE:${getClinicName()} 病人${p.doctor ? ' | 主診：' + p.doctor : ''}${p.dob ? ' | DOB：' + p.dob : ''}\r\nEND:VCARD`;
            }).join('\r\n');
            const blob = new Blob([vcards], { type: 'text/vcard;charset=utf-8' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `patients_contacts_${new Date().toISOString().substring(0,10)}.vcf`; a.click();
            showToast(`已匯出 ${withPhone.length} 位病人通訊錄（.vcf）`);
          }}>📱 匯出通訊錄</button>
          <button className="btn btn-outline btn-sm" onClick={() => setSelected(new Set())}>取消選擇</button>
        </div>
      )}

      {/* Table */}
      <div style={{ overflow: 'auto' }}>
        <table style={S.table} aria-label="病人列表">
          <thead>
            <tr>
              <th style={{ ...S.th, width: 30 }}><input type="checkbox" aria-label="全選病人" checked={filtered.length > 0 && selected.size === filtered.length} onChange={e => setSelected(e.target.checked ? new Set(filtered.map(p => p.id)) : new Set())} /></th>
              <th style={S.th}>姓名</th><th style={S.th}>電話</th><th style={S.th}>性別</th><th style={S.th}>年齡</th><th style={S.th}>主診醫師</th>
              <th style={S.th}>首次到診</th><th style={S.th}>最後到診</th><th style={S.th}>總次數</th><th style={S.th}>累計消費</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((p, idx) => (
              <tr key={p.id} style={selected.has(p.id) ? { background: '#e0f0f0' } : rowStyle(idx)}>
                <td style={S.td}><input type="checkbox" checked={selected.has(p.id)} onChange={e => { const s = new Set(selected); e.target.checked ? s.add(p.id) : s.delete(p.id); setSelected(s); }} /></td>
                <td style={S.td}><span style={{ color: ECTCM.link, cursor: 'pointer', fontWeight: 600 }} onClick={() => setDetail(p)}>{p.name}</span></td>
                <td style={S.td}>{p.phone}</td>
                <td style={S.td}>{p.gender}</td>
                <td style={S.td}>{calcAge(p.dob)}</td>
                <td style={S.td}>{p.doctor}</td>
                <td style={S.td}>{p.firstVisit}</td>
                <td style={S.td}>{p.lastVisit}</td>
                <td style={S.td}>{p.totalVisits}</td>
                <td style={{ ...S.td, textAlign: 'right' }}>{fmtM(p.totalSpent || 0)}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={10} style={{ ...S.td, padding: 0 }}><EmptyState icon="👥" title="暫無病人紀錄" description="請使用上方表單新增病人資料" compact /></td></tr>}
          </tbody>
        </table>
        <PaginationBar {...pgProps} />
      </div>

      {/* Batch WhatsApp Modal (#95) — Enhanced with scheduling, delivery log & analytics */}
      {showBatchWA && (() => {
        const targets = filtered.filter(p => selected.has(p.id) && p.phone);
        const TEMPLATES = [
          ['覆診提醒', `親愛的{姓名}，提醒您已到覆診時間，歡迎致電${getClinicName()}預約。祝健康！`],
          ['節日問候', `{姓名}您好！${getClinicName()}祝您身體健康、萬事如意！如需預約可隨時聯繫我們。`],
          ['新服務', `{姓名}您好！${getClinicName()}推出全新服務，歡迎致電或WhatsApp查詢詳情。`],
          ['健康貼士', `{姓名}您好！近日天氣轉涼，注意保暖防感冒。如有不適歡迎預約到診。${getClinicName()}`],
        ];
        const findTemplateName = (msg) => {
          const t = TEMPLATES.find(([, tpl]) => tpl === msg);
          return t ? t[0] : '自訂訊息';
        };
        // Delivery log analytics
        const logAnalytics = (() => {
          const totalSent = deliveryLog.reduce((s, l) => s + (l.successCount || 0) + (l.failCount || 0), 0);
          const totalSuccess = deliveryLog.reduce((s, l) => s + (l.successCount || 0), 0);
          const successRate = totalSent > 0 ? ((totalSuccess / totalSent) * 100).toFixed(1) : 0;
          const thisMonthStr = new Date().toISOString().substring(0, 7);
          const thisMonthSent = deliveryLog.filter(l => (l.timestamp || '').substring(0, 7) === thisMonthStr).reduce((s, l) => s + (l.successCount || 0) + (l.failCount || 0), 0);
          const templateCounts = {};
          deliveryLog.forEach(l => { templateCounts[l.template || '自訂'] = (templateCounts[l.template || '自訂'] || 0) + 1; });
          const mostUsedTemplate = Object.entries(templateCounts).sort((a, b) => b[1] - a[1])[0];
          return { totalSent, totalSuccess, successRate, thisMonthSent, mostUsedTemplate: mostUsedTemplate ? mostUsedTemplate[0] : '-' };
        })();

        return (
        <div className="modal-overlay" onClick={() => { setShowBatchWA(false); setWaModalTab('send'); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>批量 WhatsApp ({targets.length} 位)</h3>
              <button className="btn btn-outline btn-sm" onClick={() => { setShowBatchWA(false); setWaModalTab('send'); }}>✕</button>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: '2px solid #e5e7eb' }}>
              {[
                { key: 'send', label: '發送訊息' },
                { key: 'schedule', label: '定時發送' },
                { key: 'log', label: '發送記錄' },
              ].map(tab => (
                <button key={tab.key} onClick={() => setWaModalTab(tab.key)} style={{
                  padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: 'none', borderBottom: waModalTab === tab.key ? '3px solid #0e7490' : '3px solid transparent',
                  background: 'none', color: waModalTab === tab.key ? '#0e7490' : '#888',
                }}>{tab.label}</button>
              ))}
            </div>

            {/* ── Send Tab ── */}
            {waModalTab === 'send' && (<>
              {/* Message Templates */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>快速模板</label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {TEMPLATES.map(([name, tpl]) => (
                    <button key={name} className="btn btn-outline btn-sm" style={{ fontSize: 10 }}
                      onClick={() => setBatchMsg(tpl)}>{name}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>訊息內容 <span style={{ color: '#999', fontWeight: 400 }}>（可用 {'{姓名}'} 自動替換）</span></label>
                <textarea rows={4} value={batchMsg} onChange={e => setBatchMsg(e.target.value)} />
              </div>

              {/* Preview */}
              {targets[0] && (
                <div style={{ marginBottom: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: '#166534' }}>預覽（{targets[0].name}）</div>
                  <div style={{ color: '#333' }}>{batchMsg.replace(/\{姓名\}/g, targets[0].name)}</div>
                </div>
              )}

              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>發送方式：</span>
                </label>
                <div style={{ fontSize: 11, color: '#666', marginTop: 4, lineHeight: 1.5 }}>
                  透過 WhatsApp Business API 發送（每則間隔 2 秒避免被封鎖）。<br />
                  如未設定 API，會改用瀏覽器開啟 wa.me 連結。
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-teal" onClick={async () => {
                  const token = sessionStorage.getItem('hcmc_jwt');
                  let apiSent = 0, linkSent = 0, failed = 0;
                  const templateName = findTemplateName(batchMsg);
                  showToast(`開始發送 ${targets.length} 則訊息...`);
                  setShowBatchWA(false);
                  setWaModalTab('send');

                  for (let i = 0; i < targets.length; i++) {
                    const p = targets[i];
                    const personalMsg = batchMsg.replace(/\{姓名\}/g, p.name || '');
                    const phone = p.phone.replace(/[^0-9]/g, '');

                    try {
                      const res = await fetch('/api/messaging?action=whatsapp', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        body: JSON.stringify({ phone, message: personalMsg, store: p.store || '' }),
                      });
                      const result = await res.json();
                      if (result.success) { apiSent++; }
                      else if (result.demo) {
                        const fullPhone = phone.startsWith('852') ? phone : `852${phone}`;
                        window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(personalMsg)}`, '_blank');
                        linkSent++;
                      } else { failed++; }
                    } catch { failed++; }

                    if (i < targets.length - 1) await new Promise(r => setTimeout(r, 2000));
                  }

                  // Save delivery log
                  const logEntry = {
                    id: Date.now().toString(36),
                    timestamp: new Date().toISOString(),
                    messageCount: targets.length,
                    successCount: apiSent + linkSent,
                    failCount: failed,
                    template: templateName,
                    message: batchMsg.substring(0, 80),
                  };
                  const updatedLog = [logEntry, ...deliveryLog].slice(0, 100);
                  setDeliveryLog(updatedLog);
                  try { localStorage.setItem('hc_msg_delivery_log', JSON.stringify(updatedLog)); } catch {}

                  const parts = [];
                  if (apiSent) parts.push(`API 發送 ${apiSent} 則`);
                  if (linkSent) parts.push(`連結開啟 ${linkSent} 則`);
                  if (failed) parts.push(`失敗 ${failed} 則`);
                  showToast(parts.join('、') || '發送完成');
                  setSelected(new Set());
                }}>發送 ({targets.length})</button>
                <button className="btn btn-outline" onClick={() => { setShowBatchWA(false); setWaModalTab('send'); }}>取消</button>
              </div>
            </>)}

            {/* ── Schedule Tab ── */}
            {waModalTab === 'schedule' && (<>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>快速模板</label>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {TEMPLATES.map(([name, tpl]) => (
                    <button key={name} className="btn btn-outline btn-sm" style={{ fontSize: 10 }}
                      onClick={() => setBatchMsg(tpl)}>{name}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>訊息內容</label>
                <textarea rows={3} value={batchMsg} onChange={e => setBatchMsg(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>發送日期</label>
                  <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>發送時間</label>
                  <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
                </div>
              </div>
              <button className="btn btn-teal" style={{ marginBottom: 16 }} onClick={() => {
                if (!scheduleDate || !scheduleTime) return showToast('請選擇發送日期和時間');
                if (!batchMsg.trim()) return showToast('請輸入訊息內容');
                const entry = {
                  id: Date.now().toString(36),
                  scheduledAt: `${scheduleDate}T${scheduleTime}`,
                  message: batchMsg,
                  template: findTemplateName(batchMsg),
                  recipients: targets.map(p => ({ id: p.id, name: p.name, phone: p.phone })),
                  recipientCount: targets.length,
                  createdAt: new Date().toISOString(),
                  status: 'pending',
                };
                const updated = [entry, ...scheduledMsgs];
                setScheduledMsgs(updated);
                try { localStorage.setItem('hc_scheduled_msgs', JSON.stringify(updated)); } catch {}
                setScheduleDate('');
                setScheduleTime('');
                showToast(`已排程 ${targets.length} 則訊息於 ${scheduleDate} ${scheduleTime} 發送`);
              }}>排程發送 ({targets.length} 則)</button>

              {/* Pending scheduled messages */}
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0e7490', marginBottom: 8 }}>待發送排程 ({scheduledMsgs.filter(m => m.status === 'pending').length})</div>
                {scheduledMsgs.filter(m => m.status === 'pending').length === 0 && (
                  <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: 12 }}>暫無排程訊息</div>
                )}
                <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {scheduledMsgs.filter(m => m.status === 'pending').map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f3f4f6', fontSize: 11 }}>
                      <span style={{ fontWeight: 700, color: '#0e7490', minWidth: 110 }}>{(m.scheduledAt || '').replace('T', ' ')}</span>
                      <span style={{ padding: '1px 6px', borderRadius: 4, background: '#ecfdf5', color: '#059669', fontWeight: 600, fontSize: 10 }}>{m.template}</span>
                      <span style={{ color: '#6b7280' }}>{m.recipientCount} 位</span>
                      <span style={{ flex: 1, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.message.substring(0, 30)}...</span>
                      <button style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }} onClick={() => {
                        const updated = scheduledMsgs.filter(s => s.id !== m.id);
                        setScheduledMsgs(updated);
                        try { localStorage.setItem('hc_scheduled_msgs', JSON.stringify(updated)); } catch {}
                        showToast('已取消排程');
                      }}>取消</button>
                    </div>
                  ))}
                </div>
              </div>
            </>)}

            {/* ── Delivery Log Tab ── */}
            {waModalTab === 'log' && (<>
              {/* Analytics Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: '#f0fdfa', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0e7490' }}>{logAnalytics.totalSent}</div>
                  <div style={{ fontSize: 10, color: '#6b7280' }}>總發送數</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: '#f0fdf4', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>{logAnalytics.successRate}%</div>
                  <div style={{ fontSize: 10, color: '#6b7280' }}>成功率</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: '#eff6ff', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#2563eb' }}>{logAnalytics.thisMonthSent}</div>
                  <div style={{ fontSize: 10, color: '#6b7280' }}>本月發送</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 6px', background: '#fefce8', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#d97706' }}>{logAnalytics.mostUsedTemplate}</div>
                  <div style={{ fontSize: 10, color: '#6b7280' }}>最常用模板</div>
                </div>
              </div>

              {/* Log entries */}
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {deliveryLog.length === 0 && (
                  <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: 24 }}>暫無發送記錄</div>
                )}
                {deliveryLog.map(log => (
                  <div key={log.id} style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: '#374151' }}>{(log.timestamp || '').substring(0, 16).replace('T', ' ')}</span>
                      <span style={{ padding: '1px 8px', borderRadius: 4, background: '#f0fdfa', color: '#0e7490', fontWeight: 600, fontSize: 10 }}>{log.template || '自訂'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#6b7280' }}>
                      <span>共 <strong style={{ color: '#374151' }}>{log.messageCount}</strong> 則</span>
                      <span style={{ color: '#16a34a' }}>成功 <strong>{log.successCount}</strong></span>
                      {log.failCount > 0 && <span style={{ color: '#dc2626' }}>失敗 <strong>{log.failCount}</strong></span>}
                    </div>
                    {log.message && <div style={{ marginTop: 2, fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.message}</div>}
                  </div>
                ))}
              </div>
              {deliveryLog.length > 0 && (
                <button className="btn btn-outline btn-sm" style={{ marginTop: 8, fontSize: 10, color: '#dc2626', borderColor: '#fecaca' }} onClick={() => {
                  if (window.confirm('確定清除所有發送記錄？')) {
                    setDeliveryLog([]);
                    try { localStorage.setItem('hc_msg_delivery_log', '[]'); } catch {}
                    showToast('已清除發送記錄');
                  }
                }}>清除記錄</button>
              )}
            </>)}

          </div>
        </div>);
      })()}

      {/* Detail Modal */}
      {detail && (() => {
        const tier = getMembershipTier(detail.totalSpent || 0);
        const consultations = (data.consultations || []).filter(c => c.patientId === detail.id || c.patientName === detail.name).sort((a, b) => b.date.localeCompare(a.date));
        const activeEnrollments = (data.enrollments || []).filter(e => e.patientId === detail.id && e.status === 'active');
        const noShowCount = (data.bookings || []).filter(b => b.status === 'no-show' && (b.patientPhone === detail.phone || b.patientName === detail.name)).length;
        const pts = getPatientPoints(detail.name, data.revenue, pointsHistory);
        const loyaltyTier = getLoyaltyTier(pts.balance);
        return (
        <div className="modal-overlay" onClick={() => { setDetail(null); setTimelineFilter('all'); }} role="dialog" aria-modal="true" aria-label="病人詳情">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 750 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3>病人詳情 — {detail.name}</h3>
                <span className="membership-badge" style={{ color: tier.color, background: tier.bg, border: `1px solid ${tier.color}` }}>
                  {tier.name}{tier.discount > 0 ? ` ${tier.discount*100}%折扣` : ''}
                </span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: loyaltyTier.color + '18', color: loyaltyTier.color, fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => setShowPoints(!showPoints)} title="積分詳情">
                  {loyaltyTier.icon} {pts.balance.toLocaleString()}分
                </span>
                {noShowCount > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: noShowCount >= 3 ? '#dc262618' : '#d9770618', color: noShowCount >= 3 ? '#dc2626' : '#d97706', fontWeight: 700 }}>NS×{noShowCount} {noShowCount >= 3 ? '高風險' : ''}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" style={{ background: '#DAA520', color: '#fff' }} onClick={() => setShowPoints(!showPoints)}>🎁 積分</button>
                <button className="btn btn-sm" style={{ background: '#7c3aed', color: '#fff' }} onClick={() => setShowCommLog(!showCommLog)}>📝 記錄溝通</button>
                {onNavigate && <button className="btn btn-teal btn-sm" onClick={() => { setDetail(null); onNavigate('emr'); }}>開診</button>}
                <button className="btn btn-outline btn-sm" onClick={() => {
                  const p = detail;
                  const tier = getMembershipTier(p.totalSpent || 0);
                  const cons = (data.consultations || []).filter(c => c.patientId === p.id || c.patientName === p.name).sort((a, b) => b.date.localeCompare(a.date));
                  const visits = (data.revenue || []).filter(r => r.name === p.name).sort((a, b) => b.date.localeCompare(a.date));
                  const books = (data.bookings || []).filter(b => b.patientName === p.name).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                  const enrolls = (data.enrollments || []).filter(e => e.patientId === p.id && e.status === 'active');
                  const w = window.open('', '_blank');
                  if (!w) return;
                  const consRows = cons.slice(0, 30).map(c => `<tr><td>${escapeHtml(c.date)}</td><td>${escapeHtml(c.doctor||'')}</td><td>${escapeHtml(c.tcmDiagnosis||c.assessment||'-')}</td><td>${escapeHtml(c.tcmPattern||'-')}</td><td>${(c.treatments||[]).map(t => escapeHtml(t)).join('、')||'-'}</td><td>${escapeHtml(c.formulaName||'-')} ${c.formulaDays?c.formulaDays+'帖':''}</td></tr>`).join('');
                  const visitRows = visits.slice(0, 30).map(r => `<tr><td>${escapeHtml(String(r.date).substring(0,10))}</td><td>${escapeHtml(r.item||'')}</td><td style="text-align:right">$${Number(r.amount).toLocaleString()}</td><td>${escapeHtml(r.doctor||'')}</td><td>${escapeHtml(r.store||'')}</td></tr>`).join('');
                  w.document.write(`<!DOCTYPE html><html><head><title>病人檔案 — ${escapeHtml(p.name)}</title><style>
                    body{font-family:'Microsoft YaHei',sans-serif;padding:30px;max-width:800px;margin:0 auto;font-size:12px}
                    h1{color:#0e7490;font-size:18px;border-bottom:3px solid #0e7490;padding-bottom:8px}
                    h2{font-size:14px;color:#0e7490;margin:16px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}
                    table{width:100%;border-collapse:collapse;margin-bottom:12px}
                    th{background:#0e7490;color:#fff;padding:5px 8px;text-align:left;font-size:11px}td{padding:4px 8px;border-bottom:1px solid #eee}
                    .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 16px;margin-bottom:16px}
                    .info-grid div{padding:4px 0;border-bottom:1px solid #f3f4f6}
                    .alert{background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px;margin-bottom:12px}
                    .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-weight:700;font-size:11px}
                    .footer{text-align:center;font-size:9px;color:#aaa;margin-top:24px}
                    @media print{body{padding:15px}}
                  </style></head><body>
                    <h1>${escapeHtml(getClinicName())} — 病人檔案</h1>
                    <p style="color:#888;margin-bottom:16px">列印日期：${new Date().toISOString().substring(0,10)}</p>
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                      <span style="font-size:22px;font-weight:800">${escapeHtml(p.name)}</span>
                      <span class="badge" style="color:${tier.color};background:${tier.bg};border:1px solid ${tier.color}">${escapeHtml(tier.name)}</span>
                    </div>
                    <div class="info-grid">
                      <div><strong>電話：</strong>${escapeHtml(p.phone||'-')}</div>
                      <div><strong>性別：</strong>${escapeHtml(p.gender||'-')}</div>
                      <div><strong>出生日期：</strong>${escapeHtml(p.dob||'-')}</div>
                      <div><strong>地址：</strong>${escapeHtml(p.address||'-')}</div>
                      <div><strong>主診醫師：</strong>${escapeHtml(p.doctor||'-')}</div>
                      <div><strong>店舖：</strong>${escapeHtml(p.store||'-')}</div>
                      <div><strong>血型：</strong>${escapeHtml(p.bloodType||'-')}</div>
                      <div><strong>首次到診：</strong>${escapeHtml(p.firstVisit||'-')}</div>
                      <div><strong>最後到診：</strong>${escapeHtml(p.lastVisit||'-')}</div>
                      <div><strong>總就診次數：</strong>${p.totalVisits||0} 次</div>
                      <div><strong>累計消費：</strong>$${Number(p.totalSpent||0).toLocaleString()}</div>
                      <div><strong>會員等級：</strong>${escapeHtml(tier.name)}${tier.discount>0?' ('+tier.discount*100+'%折扣)':''}</div>
                    </div>
                    ${(p.allergies||p.chronicConditions||p.medications)?`<div class="alert">
                      <div style="font-weight:700;color:#991b1b;margin-bottom:4px">⚠️ 醫療警示</div>
                      ${p.allergies&&p.allergies!=='無'?`<div><strong>過敏：</strong>${escapeHtml(p.allergies)}</div>`:''}
                      ${p.chronicConditions?`<div><strong>慢性病：</strong>${escapeHtml(p.chronicConditions)}</div>`:''}
                      ${p.medications?`<div><strong>長期用藥：</strong>${escapeHtml(p.medications)}</div>`:''}
                    </div>`:''}
                    ${p.notes?`<div style="padding:8px;background:#f9fafb;border-radius:6px;margin-bottom:12px"><strong>備註：</strong>${escapeHtml(p.notes)}</div>`:''}
                    ${enrolls.length?`<h2>活躍套餐</h2>${enrolls.map(e=>{const pkg=(data.packages||[]).find(pk=>pk.id===e.packageId);return `<div style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(pkg?.name||'套餐')} — 已用 ${e.usedSessions}/${e.totalSessions} 次 | 到期：${escapeHtml(e.expiryDate||'-')}</div>`;}).join('')}`:''}
                    ${cons.length?`<h2>診症紀錄 (${cons.length})</h2><table><thead><tr><th>日期</th><th>醫師</th><th>診斷</th><th>辨證</th><th>治療</th><th>處方</th></tr></thead><tbody>${consRows}</tbody></table>`:''}
                    ${visits.length?`<h2>消費紀錄 (${visits.length})</h2><table><thead><tr><th>日期</th><th>項目</th><th style="text-align:right">金額</th><th>醫師</th><th>店舖</th></tr></thead><tbody>${visitRows}</tbody></table>`:''}
                    <div class="footer">此檔案由系統自動生成 — 僅供內部使用</div>
                  </body></html>`);
                  w.document.close();
                  setTimeout(() => w.print(), 300);
                }}>🖨️ 列印檔案</button>
                <button className="btn btn-outline btn-sm" onClick={() => { setDetail(null); setTimelineFilter('all'); }} aria-label="關閉">✕</button>
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
              {detail.bloodType && <div><strong>血型：</strong>{detail.bloodType}</div>}
              {detail.referralSource && <div><strong>轉介來源：</strong><span style={{ padding: '1px 6px', background: '#ede9fe', color: '#7c3aed', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{detail.referralSource}</span></div>}
            </div>
            {/* Medical Alerts */}
            {(detail.allergies || detail.chronicConditions || detail.medications) && (
              <div style={{ marginBottom: 16, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 13, marginBottom: 6 }}>⚠️ 醫療警示</div>
                <div style={{ fontSize: 12, display: 'grid', gap: 4 }}>
                  {detail.allergies && detail.allergies !== '無' && <div><strong style={{ color: '#dc2626' }}>過敏：</strong>{detail.allergies}</div>}
                  {detail.chronicConditions && <div><strong style={{ color: '#d97706' }}>慢性病：</strong>{detail.chronicConditions}</div>}
                  {detail.medications && <div><strong style={{ color: '#7c3aed' }}>長期用藥：</strong>{detail.medications}</div>}
                </div>
              </div>
            )}
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
            {/* ── Loyalty Points Panel ── */}
            {showPoints && (
              <div style={{ marginBottom: 16, padding: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#DAA520' }}>{loyaltyTier.icon} 忠誠積分 — {loyaltyTier.name}</div>
                  <button className="btn btn-outline btn-sm" style={{ fontSize: 10 }} onClick={() => setShowPoints(false)}>✕</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                  <div style={{ textAlign: 'center', padding: 8, background: '#fff', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>累計獲得</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#16a34a' }}>{pts.earned.toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 8, background: '#fff', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>獎勵積分</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#DAA520' }}>{pts.bonus.toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 8, background: '#fff', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>已兌換</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#dc2626' }}>{pts.redeemed.toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 8, background: '#fff', borderRadius: 6, border: '2px solid #DAA520' }}>
                    <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>可用餘額</div>
                    <div style={{ fontWeight: 700, fontSize: 18, color: '#DAA520' }}>{pts.balance.toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: 'var(--gray-400)' }}>= ${pts.discountAvailable}折扣</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-sm" style={{ background: '#16a34a', color: '#fff', fontSize: 11 }} onClick={() => {
                    const updated = addPointsEntry(pointsHistory, { patientName: detail.name, type: 'bonus', points: LOYALTY_CONFIG.referralBonus, reason: '轉介獎賞' });
                    setPointsHistory(updated);
                    showToast(`已獎勵 ${LOYALTY_CONFIG.referralBonus} 積分（轉介獎賞）`);
                  }}>+{LOYALTY_CONFIG.referralBonus} 轉介獎賞</button>
                  <button className="btn btn-sm" style={{ background: '#0e7490', color: '#fff', fontSize: 11 }} onClick={() => {
                    const updated = addPointsEntry(pointsHistory, { patientName: detail.name, type: 'bonus', points: LOYALTY_CONFIG.reviewBonus, reason: '好評獎賞' });
                    setPointsHistory(updated);
                    showToast(`已獎勵 ${LOYALTY_CONFIG.reviewBonus} 積分（好評獎賞）`);
                  }}>+{LOYALTY_CONFIG.reviewBonus} 好評獎賞</button>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="number" placeholder="兌換積分" value={redeemAmount} onChange={e => setRedeemAmount(e.target.value)} style={{ width: 80, fontSize: 11 }} />
                    <button className="btn btn-sm" style={{ background: '#dc2626', color: '#fff', fontSize: 11 }} onClick={() => {
                      const amount = Number(redeemAmount);
                      if (!amount || amount <= 0) return showToast('請輸入兌換積分');
                      if (amount > pts.balance) return showToast('積分不足');
                      const updated = addPointsEntry(pointsHistory, { patientName: detail.name, type: 'redeem', points: -amount, reason: '積分兌換' });
                      setPointsHistory(updated);
                      setRedeemAmount('');
                      showToast(`已兌換 ${amount} 積分 (= $${Math.floor(amount / LOYALTY_CONFIG.redemptionRate)} 折扣)`);
                    }}>兌換</button>
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--gray-400)' }}>
                  積分規則：每消費 $1 = {LOYALTY_CONFIG.pointsPerDollar} 積分 | {LOYALTY_CONFIG.redemptionRate} 積分 = $1 折扣 | 生日月雙倍積分
                </div>
              </div>
            )}
            {/* ── Communication Log Form ── */}
            {showCommLog && (
              <div style={{ marginBottom: 16, padding: 12, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#7c3aed', marginBottom: 8 }}>記錄溝通</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {COMM_TYPES.map(t => (
                    <button key={t.value} onClick={() => setCommForm(f => ({ ...f, type: t.value }))}
                      style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: commForm.type === t.value ? '2px solid #7c3aed' : '1px solid #ddd', background: commForm.type === t.value ? '#ede9fe' : '#fff', color: commForm.type === t.value ? '#7c3aed' : '#666' }}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                <textarea value={commForm.notes} onChange={e => setCommForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="溝通內容（例如：提醒覆診、跟進治療、回覆查詢...）"
                  style={{ width: '100%', minHeight: 60, padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                  <button className="btn btn-sm btn-outline" onClick={() => setShowCommLog(false)}>取消</button>
                  <button className="btn btn-sm" style={{ background: '#7c3aed', color: '#fff' }} onClick={() => logCommunication(detail.id, detail.name)}>儲存</button>
                </div>
              </div>
            )}
            {/* ── Consultation History Table ── */}
            {consultations.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#0e7490' }}>最近診症紀錄 ({consultations.length})</h4>
                <div className="table-wrap" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  <table style={{ fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '5px 8px' }}>日期</th>
                        <th style={{ padding: '5px 8px' }}>醫師</th>
                        <th style={{ padding: '5px 8px' }}>診斷</th>
                        <th style={{ padding: '5px 8px' }}>辨證</th>
                        <th style={{ padding: '5px 8px' }}>處方</th>
                        <th style={{ padding: '5px 8px' }}>治療</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consultations.slice(0, 10).map((c, i) => (
                        <tr key={i}>
                          <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{c.date}</td>
                          <td style={{ padding: '4px 8px' }}>{c.doctor || '-'}</td>
                          <td style={{ padding: '4px 8px', fontWeight: 600, color: '#0e7490' }}>{c.tcmDiagnosis || c.assessment || '-'}</td>
                          <td style={{ padding: '4px 8px' }}>{c.tcmPattern || '-'}</td>
                          <td style={{ padding: '4px 8px' }}>{c.formulaName ? `${c.formulaName}${c.formulaDays ? ` ${c.formulaDays}帖` : ''}` : '-'}</td>
                          <td style={{ padding: '4px 8px' }}>{(c.treatments || []).join('、') || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {consultations.length > 10 && <div style={{ fontSize: 10, color: '#888', marginTop: 4, textAlign: 'right' }}>顯示最近 10 筆，共 {consultations.length} 筆</div>}
              </div>
            )}

            {/* ── Visit Timeline ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>就診時間線 ({consultations.length + visitHistory.length + bookingHistory.length + commHistory.length} 筆紀錄)</h4>
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { key: 'all', label: '全部' },
                  { key: 'emr', label: '診症' },
                  { key: 'rev', label: '消費' },
                  { key: 'booking', label: '預約' },
                  { key: 'comm', label: '溝通' },
                ].map(f => (
                  <button key={f.key} onClick={() => setTimelineFilter(f.key)} style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    border: timelineFilter === f.key ? '1px solid #0e7490' : '1px solid #e5e7eb',
                    background: timelineFilter === f.key ? '#ecfeff' : '#fff',
                    color: timelineFilter === f.key ? '#0e7490' : '#888',
                  }}>{f.label}</button>
                ))}
              </div>
            </div>
            {/* Timeline Stats Summary */}
            {(consultations.length > 0 || commHistory.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 12 }}>
                <div style={{ padding: 8, background: 'var(--teal-50)', borderRadius: 6, textAlign: 'center', fontSize: 11 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--teal-700)' }}>{consultations.length}</div>
                  <div style={{ color: 'var(--teal-600)' }}>診症次數</div>
                </div>
                <div style={{ padding: 8, background: 'var(--green-50)', borderRadius: 6, textAlign: 'center', fontSize: 11 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green-700)' }}>{[...new Set(consultations.map(c => c.doctor).filter(Boolean))].length}</div>
                  <div style={{ color: 'var(--green-600)' }}>就診醫師</div>
                </div>
                <div style={{ padding: 8, background: 'var(--gold-50)', borderRadius: 6, textAlign: 'center', fontSize: 11 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--gold-700)' }}>{[...new Set(consultations.map(c => c.tcmDiagnosis).filter(Boolean))].length}</div>
                  <div style={{ color: 'var(--gold-700)' }}>診斷種類</div>
                </div>
                <div style={{ padding: 8, background: '#f5f3ff', borderRadius: 6, textAlign: 'center', fontSize: 11 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#7c3aed' }}>{commHistory.length}</div>
                  <div style={{ color: '#7c3aed' }}>溝通紀錄</div>
                </div>
                <div style={{ padding: 8, background: 'var(--red-50)', borderRadius: 6, textAlign: 'center', fontSize: 11 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--red-600)' }}>{consultations.filter(c => c.icd10Code).length}</div>
                  <div style={{ color: 'var(--red-600)' }}>ICD-10 編碼</div>
                </div>
              </div>
            )}
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {consultations.length === 0 && visitHistory.length === 0 && bookingHistory.length === 0 && commHistory.length === 0 && (
                <EmptyState icon="📋" title="暫無紀錄" description="此病人尚無診症、到訪或預約紀錄" compact />
              )}
              {/* Merge and sort by date */}
              {[
                ...consultations.map(c => ({ type: 'emr', date: c.date, data: c })),
                ...visitHistory.filter(r => !consultations.find(c => c.date === r.date && c.patientName === r.name)).map(r => ({ type: 'rev', date: String(r.date).substring(0, 10), data: r })),
                ...bookingHistory.filter(b => !consultations.find(c => c.date === b.date)).map(b => ({ type: 'booking', date: b.date, data: b })),
                ...commHistory.map(c => ({ type: 'comm', date: c.date, data: c })),
              ].filter(item => timelineFilter === 'all' || item.type === timelineFilter)
              .sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--gray-100)' }}>
                  {/* Timeline dot */}
                  <div style={{ minWidth: 44, textAlign: 'center' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.type === 'emr' ? '#0e7490' : item.type === 'booking' ? '#7c3aed' : item.type === 'comm' ? '#16a34a' : '#d97706', margin: '4px auto 4px' }} />
                    <div style={{ fontSize: 10, color: '#999' }}>{item.date}</div>
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, fontSize: 12 }}>
                    {item.type === 'emr' ? (
                      <>
                        <div style={{ fontWeight: 700, color: '#0e7490', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span>{item.data.tcmDiagnosis || item.data.assessment || '診症'} — {item.data.doctor}</span>
                          {item.data.icd10Code && <span style={{ fontSize: 9, padding: '1px 5px', background: '#eff6ff', color: '#1e40af', borderRadius: 3 }}>ICD-10: {item.data.icd10Code}</span>}
                        </div>
                        {item.data.tcmPattern && <div style={{ color: '#666' }}>辨證：{item.data.tcmPattern}{item.data.cmZhengCode ? ` (${item.data.cmZhengCode})` : ''}</div>}
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
                    ) : item.type === 'booking' ? (
                      <div>
                        <span style={{ fontWeight: 600, color: '#7c3aed' }}>📅 預約 — {item.data.type}</span>
                        <span style={{ marginLeft: 8 }}>{item.data.time} | {item.data.doctor} | {item.data.store}</span>
                        <span style={{ marginLeft: 8, fontSize: 11 }} className={`tag ${item.data.status === 'completed' ? 'tag-paid' : item.data.status === 'cancelled' ? 'tag-overdue' : 'tag-other'}`}>{item.data.status === 'completed' ? '已完成' : item.data.status === 'cancelled' ? '已取消' : item.data.status === 'no-show' ? '未到' : '已確認'}</span>
                      </div>
                    ) : item.type === 'comm' ? (
                      <div>
                        <div style={{ fontWeight: 600, color: '#16a34a', marginBottom: 2 }}>
                          {(COMM_TYPES.find(t => t.value === item.data.type) || COMM_TYPES[4]).icon} {(COMM_TYPES.find(t => t.value === item.data.type) || COMM_TYPES[4]).label}
                          <span style={{ fontWeight: 400, color: '#888', marginLeft: 8, fontSize: 11 }}>{item.data.time} | {item.data.staff}</span>
                        </div>
                        <div style={{ color: '#444' }}>{item.data.notes}</div>
                      </div>
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
    </div>
  );
}
