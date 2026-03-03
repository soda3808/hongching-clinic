import { useState, useMemo, useRef, useEffect } from 'react';
import { saveQueue, deleteQueue } from '../api';
import { uid, DOCTORS, fmtM } from '../data';
import { getServices } from '../config';
import { getTenantStoreNames, getClinicName, getClinicNameEn } from '../tenant';
import { useFocusTrap, nullRef } from './ConfirmModal';
import ConfirmModal from './ConfirmModal';
import SignaturePad, { SignaturePreview } from './SignaturePad';
import escapeHtml from '../utils/escapeHtml';

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

const STORES = getTenantStoreNames();

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

export default function QueuePage({ data, setData, showToast, allData, user, onNavigate }) {
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

  // Pick up quick-queue patient from PatientPage
  useEffect(() => {
    const stored = sessionStorage.getItem('hcmc_quick_queue_patient');
    if (!stored) return;
    try {
      const p = JSON.parse(stored);
      sessionStorage.removeItem('hcmc_quick_queue_patient');
      setPatientSearch(p.name || '');
      setSelectedPatient({ name: p.name, phone: p.phone });
      if (p.doctor) setFormDoctor(p.doctor);
      if (p.store) setFormStore(p.store);
      setShowModal(true);
    } catch {}
  }, []);

  const [consentItem, setConsentItem] = useState(null);
  const [consentStep, setConsentStep] = useState('patient'); // 'patient' | 'doctor'
  const [patientSig, setPatientSig] = useState('');
  const [doctorSigForConsent, setDoctorSigForConsent] = useState(() => sessionStorage.getItem(`hcmc_sig_doctor_${user?.name || ''}`) || '');

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

  // ── Wait Time Tracking (#57) ──
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 60000); // Update every minute
    return () => clearInterval(t);
  }, []);

  const parseTime = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return { h: 0, m: 0 };
    const parts = timeStr.split(':').map(Number);
    return { h: parts[0] || 0, m: parts[1] || 0 };
  };

  const getWaitMins = (item) => {
    if (!item.registeredAt || item.status === 'completed') return null;
    const { h, m } = parseTime(item.registeredAt);
    const now = new Date();
    const regTime = new Date(); regTime.setHours(h, m, 0, 0);
    if (regTime > now) return 0;
    return Math.floor((now - regTime) / 60000);
  };

  const avgWaitTime = useMemo(() => {
    const completedToday = todayQueue.filter(r => r.status !== 'waiting' && r.registeredAt && r.arrivedAt);
    if (!completedToday.length) return 0;
    const waits = completedToday.map(r => {
      const reg = parseTime(r.registeredAt);
      const arr = parseTime(r.arrivedAt);
      return (arr.h * 60 + arr.m) - (reg.h * 60 + reg.m);
    }).filter(w => w >= 0);
    return waits.length ? Math.round(waits.reduce((s, w) => s + w, 0) / waits.length) : 0;
  }, [todayQueue]);

  const estimatedWait = useMemo(() => {
    const waitingCount = todayQueue.filter(r => r.status === 'waiting').length;
    const avgConsultTime = avgWaitTime > 0 ? avgWaitTime : 15; // Default 15min
    return waitingCount * avgConsultTime;
  }, [todayQueue, avgWaitTime]);

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

  // Status transitions with full timestamp tracking
  const updateStatus = async (item, newStatus) => {
    try {
      const updated = { ...item, status: newStatus };
      if (newStatus === 'in-consultation' && !updated.arrivedAt) updated.arrivedAt = getTimeNow();
      if (newStatus === 'dispensing') updated.dispensingAt = getTimeNow();
      if (newStatus === 'billing') updated.billingAt = getTimeNow();
      if (newStatus === 'completed') updated.completedAt = getTimeNow();
      await saveQueue(updated);
      setData({ ...data, queue: queue.map(q => q.id === item.id ? updated : q) });
    } catch (err) {
      console.error('updateStatus error:', err);
      showToast('更新狀態失敗，請重試');
    }
    showToast(`${item.queueNo} ${STATUS_LABELS[newStatus]}`);
  };

  // ── Queue Analytics ──
  const [showAnalytics, setShowAnalytics] = useState(false);
  const analytics = useMemo(() => {
    const completed = todayQueue.filter(r => r.status === 'completed' && r.registeredAt && r.completedAt);
    const timeDiff = (from, to) => {
      if (!from || !to) return null;
      const [fh, fm] = from.split(':').map(Number);
      const [th, tm] = to.split(':').map(Number);
      return (th * 60 + tm) - (fh * 60 + fm);
    };
    const waitTimes = completed.map(r => timeDiff(r.registeredAt, r.arrivedAt)).filter(t => t !== null && t >= 0);
    const consultTimes = completed.map(r => timeDiff(r.arrivedAt, r.dispensingAt || r.billingAt || r.completedAt)).filter(t => t !== null && t >= 0);
    const totalTimes = completed.map(r => timeDiff(r.registeredAt, r.completedAt)).filter(t => t !== null && t >= 0);
    const avg = arr => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;

    // Peak hours
    const hourCounts = {};
    todayQueue.forEach(r => {
      if (r.registeredAt) {
        const { h } = parseTime(r.registeredAt);
        const hStr = String(h).padStart(2, '0');
        hourCounts[hStr] = (hourCounts[hStr] || 0) + 1;
      }
    });
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];

    // By doctor
    const byDoctor = {};
    completed.forEach(r => {
      if (!byDoctor[r.doctor]) byDoctor[r.doctor] = { count: 0, totalTime: 0 };
      byDoctor[r.doctor].count++;
      const ct = timeDiff(r.arrivedAt, r.dispensingAt || r.billingAt || r.completedAt);
      if (ct > 0) byDoctor[r.doctor].totalTime += ct;
    });

    return {
      completedCount: completed.length,
      avgWait: avg(waitTimes),
      avgConsult: avg(consultTimes),
      avgTotal: avg(totalTimes),
      maxWait: waitTimes.length ? Math.max(...waitTimes) : 0,
      peakHour: peakHour ? `${peakHour[0]}:00 (${peakHour[1]}人)` : '-',
      byDoctor: Object.entries(byDoctor).map(([doc, d]) => ({
        doctor: doc, count: d.count, avgConsult: d.count ? Math.round(d.totalTime / d.count) : 0,
      })),
      hourCounts,
    };
  }, [todayQueue]);

  // Start consultation — navigate to EMR with pre-filled data
  const startConsultation = async (item) => {
    try {
      // Update queue status to in-consultation
      const updated = { ...item, status: 'in-consultation', arrivedAt: item.arrivedAt || getTimeNow() };
      await saveQueue(updated);
      setData({ ...data, queue: queue.map(q => q.id === item.id ? updated : q) });
      // Store pending consultation data for EMR to pick up
      sessionStorage.setItem('hcmc_pending_consult', JSON.stringify({
        queueId: item.id,
        patientName: item.patientName,
        patientPhone: item.patientPhone,
        doctor: item.doctor,
        store: item.store,
        services: item.services,
        date: item.date,
      }));
      showToast(`${item.queueNo || item.patientName} 開始診症`);
      if (onNavigate) onNavigate('emr');
    } catch (err) {
      console.error('startConsultation error:', err);
      showToast('開始診症失敗，請重試');
    }
  };

  // ── WhatsApp Queue Notification (#112) ──
  const [notifiedIds, setNotifiedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_queue_notified') || '{}'); } catch { return {}; }
  });

  const notifyPatient = (item, type) => {
    if (!item.patientPhone) return showToast('此病人無電話號碼');
    const phone = item.patientPhone.replace(/\D/g, '');
    const messages = {
      ready: `${item.patientName} 你好，我係${getClinicName()}。你嘅號碼 ${item.queueNo} 即將到你，請準備入診症室。醫師：${item.doctor}。`,
      dispensing: `${item.patientName} 你好，你嘅藥已配好，請到櫃檯取藥及結帳。號碼：${item.queueNo}。`,
      completed: `${item.patientName} 你好，感謝你今日嚟診。如有任何不適，歡迎致電查詢。祝早日康復！${getClinicName()}`,
      reminder: `${item.patientName} 你好，你目前排隊號碼為 ${item.queueNo}，前面仲有約 ${todayQueue.filter(r => r.status === 'waiting' && (r.queueNo || '') < (item.queueNo || '')).length} 位。預計等候時間約 ${Math.max(5, todayQueue.filter(r => r.status === 'waiting' && (r.queueNo || '') < (item.queueNo || '')).length * (avgWaitTime || 15))} 分鐘。`,
    };
    const msg = messages[type] || messages.ready;
    window.open(`https://wa.me/852${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    // Track notification
    const key = `${item.id}_${type}`;
    const updated = { ...notifiedIds, [key]: new Date().toISOString() };
    setNotifiedIds(updated);
    localStorage.setItem('hcmc_queue_notified', JSON.stringify(updated));
    showToast(`已開啟 WhatsApp 通知 ${item.patientName}`);
  };

  const isNotified = (itemId, type) => !!notifiedIds[`${itemId}_${type}`];

  const batchNotifyWaiting = () => {
    const waiting = todayQueue.filter(r => r.status === 'waiting' && r.patientPhone && !isNotified(r.id, 'reminder'));
    if (!waiting.length) return showToast('沒有可通知的等候病人');
    waiting.slice(0, 5).forEach((item, i) => {
      setTimeout(() => notifyPatient(item, 'reminder'), i * 800);
    });
    if (waiting.length > 5) showToast(`已通知首 5 位，剩餘 ${waiting.length - 5} 位請稍後再發`);
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteQueue(deleteId);
    setData({ ...data, queue: queue.filter(q => q.id !== deleteId) });
    showToast('已刪除');
    setDeleteId(null);
  };

  // ── Consent Signing Flow ──
  const startConsentSign = (item) => {
    setConsentItem(item);
    setConsentStep('patient');
    setPatientSig('');
  };

  const finishConsent = () => {
    if (consentItem) printConsentForm(consentItem, patientSig, doctorSigForConsent);
    setConsentItem(null);
    setPatientSig('');
  };

  // ── Treatment Consent Form Printing (#56) ──
  const printConsentForm = (item, pSig = '', dSig = '') => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>治療同意書</title>
      <style>
        @page { size: A4; margin: 20mm; }
        body { font-family: 'Microsoft YaHei', 'PingFang TC', serif; font-size: 13px; color: #333; max-width: 650px; margin: 0 auto; padding: 20px; line-height: 1.8; }
        h1 { text-align: center; font-size: 18px; margin-bottom: 2px; }
        .en { text-align: center; font-size: 11px; color: #888; margin-bottom: 4px; }
        h2 { text-align: center; font-size: 16px; border-bottom: 2px solid #0e7490; padding-bottom: 6px; margin-top: 16px; color: #0e7490; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0; font-size: 13px; }
        .info-item { display: flex; gap: 8px; }
        .info-label { font-weight: 700; min-width: 80px; }
        .section { margin: 16px 0; }
        .section-title { font-weight: 700; font-size: 14px; margin-bottom: 6px; color: #0e7490; }
        .terms { padding-left: 20px; }
        .terms li { margin-bottom: 6px; }
        .sign-area { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .sign-box { border-top: 1px solid #333; padding-top: 6px; text-align: center; font-size: 11px; color: #888; margin-top: 50px; }
        .checkbox { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px; }
        .checkbox input { margin-top: 4px; }
        @media print { body { margin: 0; padding: 15mm; } }
      </style>
    </head><body>
      <h1>${escapeHtml(getClinicName())}</h1>
      <div class="en">${escapeHtml(getClinicNameEn())}</div>
      <h2>治療同意書 Treatment Consent Form</h2>

      <div class="info-grid">
        <div class="info-item"><span class="info-label">病人姓名：</span><span>${escapeHtml(item.patientName)}</span></div>
        <div class="info-item"><span class="info-label">掛號編號：</span><span>${escapeHtml(item.queueNo)}</span></div>
        <div class="info-item"><span class="info-label">就診日期：</span><span>${item.date}</span></div>
        <div class="info-item"><span class="info-label">主診醫師：</span><span>${escapeHtml(item.doctor)}</span></div>
        <div class="info-item"><span class="info-label">診所分店：</span><span>${escapeHtml(item.store)}</span></div>
        <div class="info-item"><span class="info-label">治療項目：</span><span>${escapeHtml(item.services)}</span></div>
      </div>

      <div class="section">
        <div class="section-title">一、治療說明</div>
        <p>本人已獲醫師充分說明以下治療方案之內容、目的、預期效果及可能之風險：</p>
        <ol class="terms">
          <li><strong>中醫診症：</strong>包括望聞問切四診合參，辨證論治。</li>
          <li><strong>針灸治療：</strong>使用一次性無菌毫針，可能出現輕微出血、瘀斑、暫時性疼痛等正常反應。</li>
          <li><strong>推拿治療：</strong>以手法操作為主，治療後可能出現短暫酸痛，屬正常反應。</li>
          <li><strong>中藥處方：</strong>根據辨證結果開具處方，應按醫囑服用，如有不適即時通知醫師。</li>
          <li><strong>拔罐/刮痧：</strong>治療後可能出現皮膚瘀紅，一般數日內消退。</li>
        </ol>
      </div>

      <div class="section">
        <div class="section-title">二、注意事項</div>
        <ol class="terms">
          <li>如有藥物過敏、慢性疾病、懷孕或正在服用其他藥物，請務必告知醫師。</li>
          <li>治療期間如感不適，請即時告知醫護人員。</li>
          <li>請遵從醫囑按時覆診，如未能依時到診請提前通知。</li>
          <li>中藥煎煮方法及服用時間請依照醫師指示。</li>
        </ol>
      </div>

      <div class="section">
        <div class="section-title">三、同意聲明</div>
        <div class="checkbox">☐ 本人已閱讀並明白以上治療說明及注意事項。</div>
        <div class="checkbox">☐ 本人同意接受上述治療方案。</div>
        <div class="checkbox">☐ 本人同意診所收集及使用本人醫療記錄作治療用途。</div>
      </div>

      <div class="sign-area">
        <div>
          ${pSig ? `<img src="${pSig}" style="height:50px;object-fit:contain;display:block;margin:0 auto 4px" />` : '<div style="margin-top:50px"></div>'}
          <div class="sign-box">病人簽名 Patient Signature</div>
        </div>
        <div>
          ${dSig ? `<img src="${dSig}" style="height:50px;object-fit:contain;display:block;margin:0 auto 4px" />` : '<div style="margin-top:50px"></div>'}
          <div class="sign-box">醫師簽名 Doctor Signature<br/>${escapeHtml(item.doctor)}</div>
        </div>
      </div>
      <div style="text-align:center; margin-top:20px; font-size:11px; color:#aaa">
        日期：${item.date}${(pSig || dSig) ? ' | 已電子簽署 Digitally Signed' : ''}
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">今日掛號</div><div className="stat-value teal">{stats.total}</div></div>
        <div className="stat-card gold"><div className="stat-label">等候中</div><div className="stat-value gold">{stats.waiting}</div>{estimatedWait > 0 && <div className="stat-sub">預計等 ~{estimatedWait} 分鐘</div>}</div>
        <div className="stat-card green"><div className="stat-label">診症中</div><div className="stat-value green">{stats.inConsult}</div></div>
        <div className="stat-card red"><div className="stat-label">平均等候</div><div className="stat-value red">{avgWaitTime} 分</div></div>
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
        {stats.waiting > 0 && (
          <button className="btn btn-green btn-sm" onClick={batchNotifyWaiting}>WhatsApp 通知等候中 ({stats.waiting})</button>
        )}
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
                  <td style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                    {r.registeredAt}
                    {r.status === 'waiting' && (() => {
                      const mins = getWaitMins(r);
                      if (mins === null) return null;
                      const color = mins > 60 ? '#dc2626' : mins > 30 ? '#d97706' : 'var(--teal-600)';
                      return <div style={{ fontSize: 10, fontWeight: 700, color }}>{mins} 分鐘</div>;
                    })()}
                  </td>
                  <td><span className={`tag ${STATUS_TAGS[r.status] || ''}`}>{STATUS_LABELS[r.status]}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {r.status === 'waiting' && (
                        <>
                          <button className="btn btn-green btn-sm" onClick={() => startConsultation(r)}>開始診症</button>
                          {r.patientPhone && <button className="btn btn-outline btn-sm" onClick={() => notifyPatient(r, 'ready')} title="WhatsApp 叫號通知" style={isNotified(r.id, 'ready') ? { background: '#dcfce7' } : {}}>📱{isNotified(r.id, 'ready') ? '✓' : ''}</button>}
                        </>
                      )}
                      {r.status === 'in-consultation' && (
                        <>
                          <button className="btn btn-teal btn-sm" onClick={() => startConsultation(r)}>開EMR</button>
                          <button className="btn btn-gold btn-sm" onClick={() => updateStatus(r, 'dispensing')}>配藥</button>
                        </>
                      )}
                      {r.status === 'dispensing' && (
                        <>
                          <button className="btn btn-teal btn-sm" onClick={() => updateStatus(r, 'billing')}>收費</button>
                          {r.patientPhone && <button className="btn btn-outline btn-sm" onClick={() => notifyPatient(r, 'dispensing')} title="WhatsApp 取藥通知" style={isNotified(r.id, 'dispensing') ? { background: '#dcfce7' } : {}}>📱{isNotified(r.id, 'dispensing') ? '✓' : ''}</button>}
                        </>
                      )}
                      {r.status === 'billing' && (
                        <button className="btn btn-green btn-sm" onClick={() => updateStatus(r, 'completed')}>完成</button>
                      )}
                      {r.status === 'completed' && r.patientPhone && (
                        <button className="btn btn-outline btn-sm" onClick={() => notifyPatient(r, 'completed')} title="WhatsApp 感謝通知" style={isNotified(r.id, 'completed') ? { background: '#dcfce7' } : {}}>📱{isNotified(r.id, 'completed') ? '✓' : ''}</button>
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => startConsentSign(r)} title="同意書(簽名)">📄</button>
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

      {/* Queue Analytics */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-outline btn-sm" onClick={() => setShowAnalytics(!showAnalytics)}>{showAnalytics ? '隱藏' : '📊'} 排隊分析</button>
        {showAnalytics && <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>今日已完成 {analytics.completedCount} 人</span>}
      </div>
      {showAnalytics && (
        <div className="card">
          <div className="card-header"><h3>📊 今日排隊分析</h3></div>
          <div className="stats-grid" style={{ marginBottom: 12 }}>
            <div className="stat-card teal"><div className="stat-label">平均等候</div><div className="stat-value teal">{analytics.avgWait} 分</div></div>
            <div className="stat-card green"><div className="stat-label">平均診症</div><div className="stat-value green">{analytics.avgConsult} 分</div></div>
            <div className="stat-card gold"><div className="stat-label">平均總時</div><div className="stat-value gold">{analytics.avgTotal} 分</div></div>
            <div className="stat-card red"><div className="stat-label">最長等候</div><div className="stat-value red">{analytics.maxWait} 分</div></div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--teal-700)' }}>醫師效率</div>
              {analytics.byDoctor.map(d => (
                <div key={d.doctor} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--gray-100)' }}>
                  <span style={{ fontWeight: 600 }}>{d.doctor}</span>
                  <span>{d.count} 人 | 平均 {d.avgConsult} 分/人</span>
                </div>
              ))}
              {analytics.byDoctor.length === 0 && <div style={{ color: 'var(--gray-400)' }}>暫無數據</div>}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--teal-700)' }}>掛號時段分佈</div>
              {Object.entries(analytics.hourCounts).sort().map(([h, c]) => (
                <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ minWidth: 40, fontWeight: 600 }}>{h}:00</span>
                  <div style={{ flex: 1, height: 14, background: 'var(--gray-100)', borderRadius: 4 }}>
                    <div style={{ width: `${(c / Math.max(...Object.values(analytics.hourCounts), 1)) * 100}%`, height: '100%', background: 'var(--teal-500)', borderRadius: 4 }} />
                  </div>
                  <span style={{ minWidth: 20, textAlign: 'right' }}>{c}</span>
                </div>
              ))}
              <div style={{ marginTop: 8, color: 'var(--gray-500)' }}>高峰時段：{analytics.peakHour}</div>
            </div>
          </div>
        </div>
      )}

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

      {/* Treatment Consent Signing Flow */}
      {consentItem && consentStep === 'patient' && (
        <SignaturePad
          title="治療同意書 — 病人簽名"
          label={`${consentItem.patientName} — 請病人在下方簽名確認同意`}
          onConfirm={(sig) => {
            setPatientSig(sig);
            // Check if doctor sig is cached
            const cachedDocSig = sessionStorage.getItem(`hcmc_sig_doctor_${user?.name || ''}`);
            if (cachedDocSig) {
              setDoctorSigForConsent(cachedDocSig);
              // Both signatures ready, print directly
              printConsentForm(consentItem, sig, cachedDocSig);
              setConsentItem(null);
              setPatientSig('');
              showToast('已列印已簽署同意書');
            } else {
              setConsentStep('doctor');
            }
          }}
          onCancel={() => { setConsentItem(null); setPatientSig(''); }}
        />
      )}
      {consentItem && consentStep === 'doctor' && (
        <SignaturePad
          title="治療同意書 — 醫師簽名"
          label={`${consentItem.doctor} — 醫師請簽名`}
          cacheKey={`doctor_${user?.name || ''}`}
          onConfirm={(sig) => {
            setDoctorSigForConsent(sig);
            printConsentForm(consentItem, patientSig, sig);
            setConsentItem(null);
            setPatientSig('');
            showToast('已列印已簽署同意書');
          }}
          onCancel={() => { setConsentItem(null); setPatientSig(''); }}
        />
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
