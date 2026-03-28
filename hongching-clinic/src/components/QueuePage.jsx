import { useState, useMemo, useRef, useEffect } from 'react';
import { saveQueue, deleteQueue } from '../api';
import { uid, DOCTORS, fmtM } from '../data';
import { getServices } from '../config';
import { getTenantStoreNames, getClinicName, getClinicNameEn } from '../tenant';
import { useFocusTrap, nullRef } from './ConfirmModal';
import ConfirmModal from './ConfirmModal';
import SignaturePad, { SignaturePreview } from './SignaturePad';
import escapeHtml from '../utils/escapeHtml';
import { S, ECTCM, rowStyle, statusTag } from '../styles/ectcm';

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

const STATUS_TAG_TYPE = {
  waiting: 'orange',
  'in-consultation': 'blue',
  dispensing: 'orange',
  billing: 'blue',
  completed: 'green',
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
    <div style={S.page}>
      {/* eCTCM Title Bar */}
      <div style={S.titleBar}>顧客管理 &gt; 掛號列表</div>

      {/* Tab Bar */}
      <div style={S.tabBar}>
        <div style={S.tabActive}>掛號列表 ({stats.total})</div>
        <div style={S.tab}>網上預約列表</div>
        <div style={S.tab}>顧客列表 ({patients.length})</div>
      </div>

      {/* Quick Action Toolbar */}
      <div style={S.toolbar}>
        <button style={S.actionBtn} onClick={() => setShowModal(true)}>掛號</button>
        <button style={S.actionBtn} onClick={() => setShowModal(true)}>快速掛號</button>
        {stats.waiting > 0 && (
          <button style={S.actionBtnGreen} onClick={batchNotifyWaiting}>WhatsApp 通知等候中 ({stats.waiting})</button>
        )}
        <button style={{ ...S.actionBtn, background: '#666', border: '1px solid #555' }} onClick={() => setShowAnalytics(!showAnalytics)}>{showAnalytics ? '隱藏分析' : '排隊分析'}</button>
        <div style={{ flex: 1 }} />
        {/* Compact stats */}
        <span style={{ fontSize: 12, color: ECTCM.textLight }}>
          等候 <strong style={{ color: ECTCM.btnWarning }}>{stats.waiting}</strong> | 診症 <strong style={{ color: ECTCM.btnSuccess }}>{stats.inConsult}</strong> | 已完成 <strong style={{ color: ECTCM.headerBg }}>{stats.completed}</strong> | 平均等 <strong>{avgWaitTime}分</strong>
          {estimatedWait > 0 && <span> | 預計等 ~{estimatedWait}分</span>}
        </span>
      </div>

      {/* Yellow Filter Bar */}
      <div style={S.filterBar}>
        <span style={S.filterLabel}>所屬分店</span>
        <select style={{ ...S.filterSelect, minWidth: 100 }} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
          <option value="all">全部店舖</option>
          {STORES.map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={S.filterLabel}>掛號日期</span>
        <input type="date" style={{ ...S.filterInput, width: 140 }} value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        <span style={S.filterLabel}>醫師/治療師</span>
        <select style={{ ...S.filterSelect, minWidth: 100 }} value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)}>
          <option value="all">全部醫師</option>
          {DOCTORS.map(d => <option key={d}>{d}</option>)}
        </select>
        <button style={S.actionBtn} onClick={() => { setFilterDate(getToday()); setFilterDoctor('all'); setFilterStore('all'); }}>刷新</button>
        <button style={S.actionBtn} onClick={() => { setFilterDate(getToday()); }}>今天所有掛號</button>
      </div>

      {/* Dense Queue Table */}
      <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>排號</th>
              <th style={S.th}>顧客姓名</th>
              <th style={S.th}>手機</th>
              <th style={S.th}>診所</th>
              <th style={S.th}>掛號時間</th>
              <th style={S.th}>等候</th>
              <th style={S.th}>診治醫師</th>
              <th style={S.th}>服務項目</th>
              <th style={{ ...S.th, textAlign: 'right' }}>費用</th>
              <th style={S.th}>狀態</th>
              <th style={S.th}>操作</th>
            </tr>
          </thead>
          <tbody>
            {!todayQueue.length && (
              <tr><td colSpan={11} style={{ ...S.td, textAlign: 'center', padding: 40, color: ECTCM.textMuted }}>暫無掛號紀錄</td></tr>
            )}
            {todayQueue.map((r, idx) => (
              <tr key={r.id} style={{ ...rowStyle(idx), cursor: 'default' }}
                onMouseEnter={e => e.currentTarget.style.background = ECTCM.trHoverBg}
                onMouseLeave={e => e.currentTarget.style.background = (idx % 2 === 0 ? ECTCM.trOddBg : ECTCM.trEvenBg)}>
                <td style={{ ...S.td, fontWeight: 700, color: ECTCM.headerBg }}>{r.queueNo}</td>
                <td style={{ ...S.td, fontWeight: 600 }}>{r.patientName}</td>
                <td style={{ ...S.td, fontSize: 12, color: ECTCM.textLight }}>{r.patientPhone || '-'}</td>
                <td style={{ ...S.td, fontSize: 12 }}>{r.store}</td>
                <td style={{ ...S.td, fontSize: 12, color: ECTCM.textLight }}>{r.registeredAt}</td>
                <td style={S.td}>
                  {r.status === 'waiting' && (() => {
                    const mins = getWaitMins(r);
                    if (mins === null) return '-';
                    const color = mins > 60 ? ECTCM.btnDanger : mins > 30 ? ECTCM.btnWarning : ECTCM.headerBg;
                    return <span style={{ fontSize: 11, fontWeight: 700, color }}>{mins}分</span>;
                  })()}
                  {r.status !== 'waiting' && '-'}
                </td>
                <td style={S.td}>{r.doctor}</td>
                <td style={{ ...S.td, fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.services}</td>
                <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, fontSize: 12 }}>{fmtM(r.serviceFee)}</td>
                <td style={S.td}><span style={statusTag(STATUS_LABELS[r.status], STATUS_TAG_TYPE[r.status] || 'blue')}>{STATUS_LABELS[r.status]}</span></td>
                <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                  {r.status === 'waiting' && (
                    <>
                      <span style={{ ...S.link, marginRight: 6 }} onClick={() => startConsultation(r)}>開始診症</span>
                      {r.patientPhone && <span style={{ ...S.link, color: ECTCM.btnSuccess, marginRight: 6 }} onClick={() => notifyPatient(r, 'ready')}>{isNotified(r.id, 'ready') ? 'WA✓' : 'WA'}</span>}
                    </>
                  )}
                  {r.status === 'in-consultation' && (
                    <>
                      <span style={{ ...S.link, marginRight: 6 }} onClick={() => startConsultation(r)}>開EMR</span>
                      <span style={{ ...S.link, color: ECTCM.btnWarning, marginRight: 6 }} onClick={() => updateStatus(r, 'dispensing')}>配藥</span>
                    </>
                  )}
                  {r.status === 'dispensing' && (
                    <>
                      <span style={{ ...S.link, marginRight: 6 }} onClick={() => updateStatus(r, 'billing')}>收費</span>
                      {r.patientPhone && <span style={{ ...S.link, color: ECTCM.btnSuccess, marginRight: 6 }} onClick={() => notifyPatient(r, 'dispensing')}>{isNotified(r.id, 'dispensing') ? 'WA✓' : 'WA'}</span>}
                    </>
                  )}
                  {r.status === 'billing' && (
                    <span style={{ ...S.link, color: ECTCM.btnSuccess, marginRight: 6 }} onClick={() => updateStatus(r, 'completed')}>完成</span>
                  )}
                  {r.status === 'completed' && r.patientPhone && (
                    <span style={{ ...S.link, color: ECTCM.btnSuccess, marginRight: 6 }} onClick={() => notifyPatient(r, 'completed')}>{isNotified(r.id, 'completed') ? 'WA✓' : 'WA'}</span>
                  )}
                  <span style={{ ...S.link, marginRight: 6 }} onClick={() => startConsentSign(r)}>同意書</span>
                  {r.status !== 'completed' && (
                    <span style={{ ...S.link, color: ECTCM.btnDanger }} onClick={() => setDeleteId(r.id)}>刪除</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Stats */}
      <div style={S.footer}>
        共 {todayQueue.length} 筆記錄 | 等候 {stats.waiting} | 診症中 {stats.inConsult} | 已完成 {stats.completed}
      </div>

      {/* Queue Analytics */}
      {showAnalytics && (
        <div style={{ background: ECTCM.cardBg, border: `1px solid ${ECTCM.borderColor}`, margin: '8px 0', padding: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: ECTCM.headerBg, marginBottom: 8 }}>今日排隊分析 — 已完成 {analytics.completedCount} 人</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={S.statCard}><div style={S.statValue}>{analytics.avgWait}</div><div style={S.statLabel}>平均等候(分)</div></div>
            <div style={S.statCard}><div style={{ ...S.statValue, color: ECTCM.btnSuccess }}>{analytics.avgConsult}</div><div style={S.statLabel}>平均診症(分)</div></div>
            <div style={S.statCard}><div style={{ ...S.statValue, color: ECTCM.btnWarning }}>{analytics.avgTotal}</div><div style={S.statLabel}>平均總時(分)</div></div>
            <div style={S.statCard}><div style={{ ...S.statValue, color: ECTCM.btnDanger }}>{analytics.maxWait}</div><div style={S.statLabel}>最長等候(分)</div></div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: ECTCM.headerBg }}>醫師效率</div>
              {analytics.byDoctor.map(d => (
                <div key={d.doctor} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: `1px solid ${ECTCM.tdBorder}` }}>
                  <span style={{ fontWeight: 600 }}>{d.doctor}</span>
                  <span>{d.count} 人 | 平均 {d.avgConsult} 分/人</span>
                </div>
              ))}
              {analytics.byDoctor.length === 0 && <div style={{ color: ECTCM.textMuted }}>暫無數據</div>}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: ECTCM.headerBg }}>掛號時段分佈</div>
              {Object.entries(analytics.hourCounts).sort().map(([h, c]) => (
                <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ minWidth: 36, fontWeight: 600 }}>{h}:00</span>
                  <div style={{ flex: 1, height: 12, background: '#e8e8e8', borderRadius: 3 }}>
                    <div style={{ width: `${(c / Math.max(...Object.values(analytics.hourCounts), 1)) * 100}%`, height: '100%', background: ECTCM.headerBg, borderRadius: 3 }} />
                  </div>
                  <span style={{ minWidth: 18, textAlign: 'right' }}>{c}</span>
                </div>
              ))}
              <div style={{ marginTop: 6, color: ECTCM.textLight }}>高峰時段：{analytics.peakHour}</div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Registration Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)} role="dialog" aria-modal="true" aria-label="快速掛號">
          <div className="modal" onClick={e => e.stopPropagation()} ref={modalRef} style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: ECTCM.headerBg }}>快速掛號</h3>
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
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${ECTCM.borderColor}`, borderRadius: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 180, overflowY: 'auto' }}>
                    {patientSuggestions.map(p => (
                      <div key={p.id} onMouseDown={() => selectPatient(p)} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: `1px solid ${ECTCM.tdBorder}` }}
                        onMouseEnter={e => e.currentTarget.style.background = ECTCM.trHoverBg}
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
                <div style={{ background: ECTCM.trEvenBg, padding: 10, borderRadius: 4, marginBottom: 16, fontSize: 13, color: ECTCM.headerBg }}>
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
    </div>
  );
}
