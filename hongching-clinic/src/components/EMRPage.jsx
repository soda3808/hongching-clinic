import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { saveConsultation, deleteConsultation, openWhatsApp, saveQueue, saveEnrollment } from '../api';
import { uid, fmtM, TCM_HERBS, TCM_FORMULAS, TCM_TREATMENTS, ACUPOINTS, TCM_HERBS_DB, TCM_FORMULAS_DB, ACUPOINTS_DB, MERIDIANS, GRANULE_PRODUCTS, searchGranules, convertToGranule, getDoctors, getStoreNames, getDefaultStore } from '../data';
import { getClinicName, getClinicNameEn, getTenantStoreNames, getTenantStores } from '../tenant';
import { useFocusTrap, nullRef } from './ConfirmModal';
import ConfirmModal from './ConfirmModal';
import { checkInteractions, getHerbSafetyInfo, checkDosage, getSafetyBadges } from '../utils/drugInteractions';
import { searchDiagnoses, searchZheng, searchProcedures } from '../data/hkctt';
import VoiceButton from './VoiceButton';
import MedicineLabel from './MedicineLabel';
import SignaturePad, { SignaturePreview } from './SignaturePad';
import ConsultAI from './ConsultAI';

const EMPTY_RX = { herb: '', dosage: '' };
function makeEmptyForm() {
  const doctors = getDoctors();
  const defaultStore = getDefaultStore();
  return {
    patientId: '', patientName: '', patientPhone: '', date: '', doctor: doctors[0] || '', store: defaultStore,
    subjective: '', objective: '', assessment: '', plan: '',
    tcmDiagnosis: '', tcmPattern: '', tongue: '', pulse: '',
    icd10Code: '', cmDiagnosisCode: '', cmZhengCode: '',
    prescription: [{ ...EMPTY_RX }], formulaName: '', formulaDays: 3, formulaInstructions: '每日一劑，水煎服',
    prescriptionType: 'decoction', granuleDosesPerDay: 2, specialNotes: '',
    treatments: [], acupuncturePoints: '',
    followUpDate: '', followUpNotes: '', fee: 0,
  };
}

export default function EMRPage({ data, setData, showToast, allData, user, onNavigate }) {
  const doctors = getDoctors();
  const storeNames = getStoreNames();
  const clinicName = getClinicName();
  const clinicNameEn = getClinicNameEn();

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...makeEmptyForm(), date: new Date().toISOString().substring(0, 10) });
  const [detail, setDetail] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterDoc, setFilterDoc] = useState('all');
  const [filterStore, setFilterStore] = useState('all');
  const [filterHerb, setFilterHerb] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDD, setShowPatientDD] = useState(false);
  const [herbSearch, setHerbSearch] = useState({});
  const [activeHerbIdx, setActiveHerbIdx] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [showLabel, setShowLabel] = useState(null);
  const [acupointMeridian, setAcupointMeridian] = useState('all');
  const [customFormulas, setCustomFormulas] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_custom_formulas') || '[]'); } catch { return []; }
  });
  const [showSigPad, setShowSigPad] = useState(false);
  const [doctorSig, setDoctorSig] = useState(() => sessionStorage.getItem(`hcmc_sig_doctor_${user?.name || ''}`) || '');
  const [diagSearch, setDiagSearch] = useState('');
  const [showDiagDD, setShowDiagDD] = useState(false);
  const [zhengSearch, setZhengSearch] = useState('');
  const [showZhengDD, setShowZhengDD] = useState(false);
  const [showDraftRestore, setShowDraftRestore] = useState(false);
  const [draftData, setDraftData] = useState(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versionHistoryData, setVersionHistoryData] = useState([]);

  const addRef = useRef(null);
  const detailRef = useRef(null);
  useFocusTrap(showAdd ? addRef : nullRef);
  useFocusTrap(detail ? detailRef : nullRef);

  // ── Pick up pending consult from Queue ──
  useEffect(() => {
    const pending = sessionStorage.getItem('hcmc_pending_consult');
    if (!pending) return;
    try {
      const p = JSON.parse(pending);
      sessionStorage.removeItem('hcmc_pending_consult'); // Remove immediately to prevent double-fire
      const patient = (data.patients || []).find(pt => pt.name === p.patientName || pt.phone === p.patientPhone);
      setForm(f => ({
        ...f,
        patientId: patient?.id || '',
        patientName: p.patientName || '',
        patientPhone: p.patientPhone || patient?.phone || '',
        doctor: p.doctor || f.doctor,
        store: p.store || f.store,
        date: p.date || new Date().toISOString().substring(0, 10),
      }));
      setPatientSearch(p.patientName || '');
      setShowAdd(true);
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save Draft (#autosave) ──
  const getDraftKey = useCallback((pid) => `hc_emr_draft_${pid || 'new'}`, []);

  // Check for unsaved draft on mount / when showAdd opens
  useEffect(() => {
    if (!showAdd) return;
    const pid = form.patientId || 'new';
    const key = getDraftKey(pid);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const draft = JSON.parse(raw);
        // Only offer restore if draft has meaningful content
        if (draft.subjective || draft.objective || draft.assessment || draft.plan ||
            draft.tcmDiagnosis || (draft.prescription && draft.prescription.some(r => r.herb))) {
          setDraftData(draft);
          setShowDraftRestore(true);
        }
      }
    } catch { /* ignore corrupt drafts */ }
  }, [showAdd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save every 30 seconds while form is open
  useEffect(() => {
    if (!showAdd) return;
    const timer = setInterval(() => {
      const pid = form.patientId || 'new';
      const key = getDraftKey(pid);
      try {
        localStorage.setItem(key, JSON.stringify({ ...form, _draftSavedAt: new Date().toISOString() }));
      } catch { /* storage full, ignore */ }
    }, 30000);
    return () => clearInterval(timer);
  }, [showAdd, form, getDraftKey]);

  const restoreDraft = () => {
    if (!draftData) return;
    setForm(f => ({ ...f, ...draftData }));
    if (draftData.patientName) setPatientSearch(draftData.patientName);
    setShowDraftRestore(false);
    setDraftData(null);
    showToast('已恢復草稿');
  };

  const dismissDraft = () => {
    setShowDraftRestore(false);
    setDraftData(null);
  };

  const clearDraft = (pid) => {
    try { localStorage.removeItem(getDraftKey(pid || 'new')); } catch {}
  };

  const consultations = data.consultations || [];
  const patients = data.patients || [];
  const today = new Date().toISOString().substring(0, 10);
  const thisMonth = today.substring(0, 7);

  // ── SOAP Note Templates (#40) ──
  const SOAP_TEMPLATES = [
    { name: '感冒(風寒)', subjective: '惡寒發熱，頭痛，鼻塞流涕，噴嚏', objective: '舌淡苔白，脈浮緊', tcmDiagnosis: '感冒', tcmPattern: '風寒束表', assessment: '風寒感冒', plan: '疏風散寒，宣肺解表' },
    { name: '感冒(風熱)', subjective: '發熱重，惡風，頭痛，咽喉腫痛', objective: '舌尖紅苔薄黃，脈浮數', tcmDiagnosis: '感冒', tcmPattern: '風熱犯表', assessment: '風熱感冒', plan: '辛涼解表，清熱解毒' },
    { name: '咳嗽(痰濕)', subjective: '咳嗽痰多，色白易咯，胸悶，食少', objective: '舌淡苔白膩，脈濡滑', tcmDiagnosis: '咳嗽', tcmPattern: '痰濕蘊肺', assessment: '痰濕咳嗽', plan: '燥濕化痰，理氣止咳' },
    { name: '胃痛(脾胃虛寒)', subjective: '胃脘隱痛，喜溫喜按，空腹痛甚，得食則緩', objective: '舌淡苔白，脈沉遲無力', tcmDiagnosis: '胃痛', tcmPattern: '脾胃虛寒', assessment: '虛寒胃痛', plan: '溫中健脾，和胃止痛' },
    { name: '失眠(心脾兩虛)', subjective: '不易入睡，多夢易醒，心悸健忘，神疲食少', objective: '舌淡苔薄，脈細弱', tcmDiagnosis: '不寐', tcmPattern: '心脾兩虛', assessment: '心脾兩虛型失眠', plan: '補益心脾，養血安神' },
    { name: '腰痛(腎虛)', subjective: '腰膝痠軟，腰痛綿綿，喜按喜揉，勞累加重', objective: '舌淡苔白，脈沉細', tcmDiagnosis: '腰痛', tcmPattern: '腎虛腰痛', assessment: '腎虛腰痛', plan: '補腎壯腰，強筋健骨' },
    { name: '頭痛(肝陽上亢)', subjective: '頭痛眩暈，心煩易怒，面紅目赤', objective: '舌紅苔黃，脈弦有力', tcmDiagnosis: '頭痛', tcmPattern: '肝陽上亢', assessment: '肝陽頭痛', plan: '平肝潛陽，滋陰降火' },
    { name: '濕疹', subjective: '皮膚瘙癢，紅斑丘疹，反覆發作', objective: '舌紅苔黃膩，脈滑數', tcmDiagnosis: '濕瘡', tcmPattern: '濕熱蘊膚', assessment: '濕熱型濕疹', plan: '清熱利濕，涼血止癢' },
    { name: '月經不調(氣血虛)', subjective: '月經後期，量少色淡，面色萎黃，頭暈', objective: '舌淡苔薄白，脈細弱', tcmDiagnosis: '月經不調', tcmPattern: '氣血虧虛', assessment: '氣血虛型月經不調', plan: '補氣養血，調經' },
    { name: '頸肩痛(氣滯血瘀)', subjective: '頸肩疼痛，轉側不利，痛有定處', objective: '舌暗有瘀點，脈弦澀', tcmDiagnosis: '痹證', tcmPattern: '氣滯血瘀', assessment: '氣滯血瘀型頸肩痛', plan: '活血化瘀，行氣止痛，針灸推拿' },
    { name: '感冒(桂枝湯)', subjective: '頭痛、鼻塞、流鼻水', objective: '舌淡紅苔薄白、脈浮', tcmDiagnosis: '感冒', tcmPattern: '風寒表虛', assessment: '風寒感冒', plan: '桂枝湯加減' },
    { name: '腰痛(寒濕)', subjective: '腰部酸痛、活動受限', objective: '腰椎壓痛、直腿抬高試驗(-)', tcmDiagnosis: '腰痛', tcmPattern: '寒濕腰痛', assessment: '寒濕腰痛', plan: '獨活寄生湯' },
    { name: '失眠(心腎不交)', subjective: '難入睡、多夢、心煩', objective: '舌紅少苔、脈細數', tcmDiagnosis: '不寐', tcmPattern: '心腎不交', assessment: '心腎不交', plan: '天王補心丹' },
    { name: '胃痛(肝氣犯胃)', subjective: '胃脘脹痛、噯氣', objective: '舌淡苔白膩、脈弦', tcmDiagnosis: '胃痛', tcmPattern: '肝氣犯胃', assessment: '肝氣犯胃', plan: '柴胡疏肝散' },
  ];

  const applySOAPTemplate = (tmpl) => {
    setForm(f => ({
      ...f,
      subjective: f.subjective ? f.subjective + '\n' + tmpl.subjective : tmpl.subjective,
      objective: f.objective ? f.objective + '\n' + tmpl.objective : tmpl.objective,
      assessment: f.assessment ? f.assessment + '\n' + tmpl.assessment : tmpl.assessment,
      plan: f.plan ? f.plan + '\n' + tmpl.plan : tmpl.plan,
      tcmDiagnosis: f.tcmDiagnosis ? f.tcmDiagnosis : tmpl.tcmDiagnosis,
      tcmPattern: f.tcmPattern ? f.tcmPattern : tmpl.tcmPattern,
    }));
    showToast(`已套用模板「${tmpl.name}」`);
  };

  // ── Repeat Prescription (#37) ──
  const loadLastPrescription = (patientName) => {
    const lastConsult = consultations
      .filter(c => c.patientName === patientName && (c.prescription || []).some(r => r.herb))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    if (!lastConsult) return showToast('找不到該病人的歷史處方');
    setForm(f => ({
      ...f,
      prescription: (lastConsult.prescription || []).map(r => ({ ...r })),
      formulaName: lastConsult.formulaName || '',
      formulaDays: lastConsult.formulaDays || 3,
      formulaInstructions: lastConsult.formulaInstructions || '每日一劑，水煎服',
      prescriptionType: lastConsult.prescriptionType || 'decoction',
      treatments: lastConsult.treatments || [],
      tcmDiagnosis: lastConsult.tcmDiagnosis || '',
      tcmPattern: lastConsult.tcmPattern || '',
      icd10Code: lastConsult.icd10Code || '',
      cmDiagnosisCode: lastConsult.cmDiagnosisCode || '',
      cmZhengCode: lastConsult.cmZhengCode || '',
    }));
    showToast(`已載入 ${patientName} 上次處方（${lastConsult.date}）`);
  };

  const weekStart = useMemo(() => {
    const d = new Date(); const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1); return d.toISOString().substring(0, 10);
  }, []);
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 6); return d.toISOString().substring(0, 10);
  }, [weekStart]);

  // ── Stats ──
  const stats = useMemo(() => {
    const todayCount = consultations.filter(c => c.date === today).length;
    const monthCount = consultations.filter(c => (c.date || '').substring(0, 7) === thisMonth).length;
    const uniquePatients = new Set(consultations.map(c => c.patientId || c.patientName)).size;
    const followUps = consultations.filter(c => c.followUpDate >= weekStart && c.followUpDate <= weekEnd).length;
    return { todayCount, monthCount, uniquePatients, followUps };
  }, [consultations, today, thisMonth, weekStart, weekEnd]);

  // ── Filtered list ──
  const filtered = useMemo(() => {
    let list = [...consultations];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.patientName || '').toLowerCase().includes(q) ||
        (c.tcmDiagnosis || '').toLowerCase().includes(q) ||
        (c.tcmPattern || '').toLowerCase().includes(q) ||
        (c.icd10Code || '').toLowerCase().includes(q) ||
        (c.assessment || '').toLowerCase().includes(q) ||
        (c.subjective || '').toLowerCase().includes(q) ||
        (c.plan || '').toLowerCase().includes(q) ||
        (c.formulaName || '').toLowerCase().includes(q)
      );
    }
    if (filterDoc !== 'all') list = list.filter(c => c.doctor === filterDoc);
    if (filterStore !== 'all') list = list.filter(c => c.store === filterStore);
    if (filterHerb) {
      const hq = filterHerb.toLowerCase();
      list = list.filter(c => (c.prescription || []).some(rx => (rx.herb || '').toLowerCase().includes(hq)));
    }
    if (filterDate === 'today') list = list.filter(c => c.date === today);
    else if (filterDate === 'week') list = list.filter(c => c.date >= weekStart && c.date <= weekEnd);
    else if (filterDate === 'custom' && customStart && customEnd) list = list.filter(c => c.date >= customStart && c.date <= customEnd);
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [consultations, search, filterDoc, filterStore, filterHerb, filterDate, today, weekStart, weekEnd, customStart, customEnd]);

  // ── Patient autocomplete ──
  const patientMatches = useMemo(() => {
    if (!patientSearch) return [];
    const q = patientSearch.toLowerCase();
    return patients.filter(p => p.name.toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [patients, patientSearch]);

  // ── HKCTT diagnosis autocomplete ──
  const diagMatches = useMemo(() => {
    if (!diagSearch || diagSearch.length < 1) return [];
    return searchDiagnoses(diagSearch).slice(0, 10);
  }, [diagSearch]);

  const zhengMatches = useMemo(() => {
    if (!zhengSearch || zhengSearch.length < 1) return [];
    return searchZheng(zhengSearch, form.cmDiagnosisCode).slice(0, 10);
  }, [zhengSearch, form.cmDiagnosisCode]);

  const selectDiagnosis = (diag) => {
    setForm(f => ({
      ...f,
      tcmDiagnosis: diag.name,
      icd10Code: diag.icd10 || '',
      cmDiagnosisCode: diag.code || '',
    }));
    setDiagSearch(diag.name);
    setShowDiagDD(false);
  };

  const selectZheng = (zheng) => {
    setForm(f => ({
      ...f,
      tcmPattern: zheng.name,
      cmZhengCode: zheng.code || '',
    }));
    setZhengSearch(zheng.name);
    setShowZhengDD(false);
  };

  const selectPatient = (p) => {
    setForm(f => ({ ...f, patientId: p.id, patientName: p.name, patientPhone: p.phone || '' }));
    setPatientSearch(p.name);
    setShowPatientDD(false);
  };

  // ── Package Usage Tracking (#70) ──
  const activePackages = useMemo(() => {
    if (!form.patientId && !form.patientName) return [];
    const enrollments = data.enrollments || [];
    const packages = data.packages || [];
    const today = new Date().toISOString().substring(0, 10);
    return enrollments.filter(e => {
      if (e.patientId !== form.patientId && e.patientName !== form.patientName) return false;
      if (e.usedSessions >= e.totalSessions) return false;
      if (e.expiryDate && e.expiryDate < today) return false;
      return true;
    }).map(e => ({
      ...e,
      packageName: (packages.find(p => p.id === e.packageId) || {}).name || '未知套餐',
      remaining: e.totalSessions - (e.usedSessions || 0),
    }));
  }, [form.patientId, form.patientName, data.enrollments, data.packages]);

  const deductPackageSession = async (enrollment) => {
    const updated = { ...enrollment, usedSessions: (enrollment.usedSessions || 0) + 1 };
    await saveEnrollment(updated);
    setData(d => ({ ...d, enrollments: (d.enrollments || []).map(e => e.id === updated.id ? updated : e) }));
    showToast(`${enrollment.packageName || '套餐'} 已扣減 1 次（餘 ${updated.totalSessions - updated.usedSessions} 次）`);
  };

  // ── Treatment toggle ──
  const toggleTreatment = (t) => {
    setForm(f => {
      const arr = [...f.treatments];
      const idx = arr.indexOf(t);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(t);
      return { ...f, treatments: arr };
    });
  };

  // ── Prescription helpers ──
  const updateRx = (i, field, val) => {
    setForm(f => {
      const rx = [...f.prescription];
      rx[i] = { ...rx[i], [field]: val };
      return { ...f, prescription: rx };
    });
  };
  const addRxRow = () => setForm(f => ({ ...f, prescription: [...f.prescription, { ...EMPTY_RX }] }));
  const removeRxRow = (i) => setForm(f => ({ ...f, prescription: f.prescription.filter((_, j) => j !== i) }));

  const loadFormula = (name) => {
    // Try expanded DB first, then backward-compatible
    const dbFormula = TCM_FORMULAS_DB.find(f => f.name === name);
    if (dbFormula) {
      setForm(f => ({
        ...f,
        prescription: dbFormula.herbs.map(h => ({ herb: h.h, dosage: h.d })),
        formulaName: dbFormula.name,
      }));
      showToast(`已載入 ${dbFormula.name}（${dbFormula.src}）`);
      return;
    }
    const formula = TCM_FORMULAS.find(f => f.name === name);
    if (!formula) return;
    setForm(f => ({
      ...f,
      prescription: formula.herbs.map(h => ({ herb: h.herb, dosage: h.dosage })),
      formulaName: formula.name,
    }));
    showToast(`已載入 ${formula.name}`);
  };

  // ── Custom Formula Save/Load ──
  const saveCustomFormula = () => {
    const rx = form.prescription.filter(r => r.herb);
    if (!rx.length) return showToast('處方不能為空');
    const name = form.formulaName || prompt('請輸入處方名稱：');
    if (!name) return;
    const cf = { id: uid(), name, herbs: rx, indication: form.tcmDiagnosis || '', doctor: user?.name || '', createdAt: new Date().toISOString().substring(0, 10) };
    const updated = [...customFormulas.filter(f => f.name !== name), cf];
    setCustomFormulas(updated);
    localStorage.setItem('hcmc_custom_formulas', JSON.stringify(updated));
    showToast(`已儲存自訂處方「${name}」`);
  };

  const deleteCustomFormula = (id) => {
    const updated = customFormulas.filter(f => f.id !== id);
    setCustomFormulas(updated);
    localStorage.setItem('hcmc_custom_formulas', JSON.stringify(updated));
    showToast('已刪除自訂處方');
  };

  const loadCustomFormula = (cf) => {
    setForm(f => ({ ...f, prescription: cf.herbs.map(h => ({ ...h })), formulaName: cf.name }));
    showToast(`已載入自訂處方「${cf.name}」`);
  };

  // ── Acupoint chip toggle ──
  const toggleAcupoint = (pt) => {
    setForm(f => {
      const pts = f.acupuncturePoints ? f.acupuncturePoints.split('、').map(s => s.trim()).filter(Boolean) : [];
      const idx = pts.indexOf(pt);
      if (idx >= 0) pts.splice(idx, 1); else pts.push(pt);
      return { ...f, acupuncturePoints: pts.join('、') };
    });
  };

  const currentAcupoints = form.acupuncturePoints ? form.acupuncturePoints.split('、').map(s => s.trim()).filter(Boolean) : [];

  // ── Herb autocomplete matches (expanded DB with safety info) ──
  const getHerbMatches = (idx) => {
    const q = (herbSearch[idx] || '').toLowerCase();
    if (!q) return [];
    return TCM_HERBS_DB.filter(h => h.n.includes(q) || h.py.includes(q)).slice(0, 8);
  };

  // ── Save ──
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.patientName) return showToast('請選擇病人');
    if (!form.date) return showToast('請填寫日期');
    const record = {
      ...form, id: uid(),
      prescription: form.prescription.filter(r => r.herb),
      fee: Number(form.fee) || 0,
      doctorSignature: doctorSig || '',
      icd10Code: form.icd10Code || '',
      cmDiagnosisCode: form.cmDiagnosisCode || '',
      cmZhengCode: form.cmZhengCode || '',
      createdAt: new Date().toISOString().substring(0, 10),
      versionHistory: [{ savedAt: new Date().toISOString(), savedBy: user?.name || '', snapshot: { ...form, prescription: form.prescription.filter(r => r.herb) } }],
    };
    await saveConsultation(record);
    setData(d => ({ ...d, consultations: [...(d.consultations || []), record] }));
    // Clear auto-save draft
    clearDraft(form.patientId);
    clearDraft('new');
    setShowAdd(false);
    setForm({ ...makeEmptyForm(), date: new Date().toISOString().substring(0, 10) });
    setPatientSearch('');
    showToast('已儲存診症紀錄');
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteConsultation(deleteId);
    setData(d => ({ ...d, consultations: (d.consultations || []).filter(c => c.id !== deleteId) }));
    showToast('已刪除');
    setDeleteId(null);
  };

  // ── Send to Billing ──
  const sendToBilling = async (item) => {
    const queue = data.queue || [];
    // Find existing queue entry for this patient/date
    let queueEntry = queue.find(q => q.patientName === item.patientName && q.date === item.date && q.status !== 'completed');
    if (queueEntry) {
      // Update existing queue entry
      const updated = { ...queueEntry, status: 'dispensing', consultationId: item.id, prescription: item.prescription, formulaName: item.formulaName, formulaDays: item.formulaDays };
      await saveQueue(updated);
      setData(d => ({ ...d, queue: (d.queue || []).map(q => q.id === updated.id ? updated : q) }));
    } else {
      // Create new queue entry
      const newEntry = {
        id: uid(), queueNo: 'B' + String(queue.filter(q => q.date === item.date).length + 1).padStart(3, '0'),
        patientName: item.patientName, patientPhone: item.patientPhone || '', date: item.date,
        registeredAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        arrivedAt: '', completedAt: '', doctor: item.doctor, store: item.store || (storeNames[0] || ''),
        services: '配藥收費', serviceFee: Number(item.fee) || 0, status: 'dispensing',
        dispensingStatus: 'pending', paymentStatus: 'pending',
        consultationId: item.id, prescription: item.prescription, formulaName: item.formulaName, formulaDays: item.formulaDays,
        createdAt: new Date().toISOString(),
      };
      await saveQueue(newEntry);
      setData(d => ({ ...d, queue: [...(d.queue || []), newEntry] }));
    }
    showToast(`已送往配藥收費 — ${item.patientName}`);
    if (onNavigate) onNavigate('billing');
  };

  // ── Print Prescription (#66) ──
  const printPrescription = (item) => {
    const clinic = (() => { try { return JSON.parse(localStorage.getItem('hcmc_clinic') || '{}'); } catch { return {}; } })();
    const rxRows = (item.prescription || []).filter(r => r.herb).map((r, i) => `<tr><td style="text-align:center">${i + 1}</td><td style="font-weight:600">${r.herb}</td><td style="text-align:center">${r.dosage}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return showToast('請允許彈出視窗');
    w.document.write(`<!DOCTYPE html><html><head><title>處方箋 - ${item.patientName}</title><style>
      @page{size:A5;margin:15mm}body{font-family:'Microsoft YaHei',sans-serif;padding:20px;max-width:500px;margin:0 auto;color:#333}
      .header{text-align:center;border-bottom:3px double #0e7490;padding-bottom:10px;margin-bottom:12px}
      .header h1{font-size:16px;color:#0e7490;margin:0}.header p{font-size:10px;color:#888;margin:2px 0}
      .title{text-align:center;font-size:16px;font-weight:800;color:#0e7490;margin:10px 0;letter-spacing:3px}
      .info{font-size:12px;margin:8px 0;display:flex;flex-wrap:wrap;gap:8px}
      .info span{background:#f0fdfa;padding:3px 8px;border-radius:4px}
      table{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}
      th{background:#0e7490;color:#fff;padding:6px 8px;text-align:left}td{padding:5px 8px;border-bottom:1px solid #eee}
      tr:nth-child(even){background:#f9fafb}.note{font-size:11px;color:#555;margin:10px 0;padding:8px;background:#fffbeb;border-radius:6px;border-left:3px solid #d97706}
      .sig{margin-top:40px;display:flex;justify-content:space-between}.sig-box{text-align:center;width:150px}
      .sig-line{border-top:1px solid #333;margin-top:50px;padding-top:4px;font-size:10px}
      .footer{text-align:center;font-size:9px;color:#aaa;margin-top:20px;border-top:1px solid #eee;padding-top:8px}
    </style></head><body>
      <div class="header"><h1>${clinic.name || clinicName}</h1><p>${clinic.nameEn || clinicNameEn}</p></div>
      <div class="title">處 方 箋</div>
      <div class="info"><span>病人：<strong>${item.patientName}</strong></span><span>日期：${item.date}</span><span>醫師：${item.doctor}</span><span>店舖：${item.store}</span></div>
      ${item.tcmDiagnosis ? `<div class="info"><span>診斷：<strong>${item.tcmDiagnosis}</strong></span>${item.tcmPattern ? `<span>證型：${item.tcmPattern}</span>` : ''}</div>` : ''}
      ${item.formulaName ? `<div style="font-size:13px;font-weight:700;color:#0e7490;margin:8px 0">方劑：${item.formulaName}${item.formulaDays ? ` (${item.formulaDays}天)` : ''}</div>` : ''}
      <table><thead><tr><th style="width:30px">#</th><th>藥材</th><th style="width:80px;text-align:center">劑量</th></tr></thead><tbody>${rxRows}</tbody></table>
      <div class="note"><strong>服法：</strong>${item.formulaInstructions || '每日一劑，水煎服'}${item.specialNotes ? `<br/><strong>注意：</strong>${item.specialNotes}` : ''}</div>
      ${(item.treatments || []).length ? `<div style="font-size:11px;margin:8px 0"><strong>治療：</strong>${item.treatments.join('、')}</div>` : ''}
      ${item.acupuncturePoints ? `<div style="font-size:11px;margin:8px 0"><strong>穴位：</strong>${item.acupuncturePoints}</div>` : ''}
      ${item.followUpDate ? `<div style="font-size:12px;margin:8px 0;padding:6px;background:#f0fdfa;border-radius:4px"><strong>覆診：</strong>${item.followUpDate}${item.followUpNotes ? ` — ${item.followUpNotes}` : ''}</div>` : ''}
      <div class="sig"><div class="sig-box">${item.doctorSignature ? `<img src="${item.doctorSignature}" style="height:50px;object-fit:contain;display:block;margin:0 auto 4px" />` : '<div style="margin-top:50px"></div>'}<div class="sig-line">主診醫師：${item.doctor}</div></div><div class="sig-box"><div style="margin-top:50px"></div><div class="sig-line">診所蓋章</div></div></div>
      <div class="footer">此處方箋由系統生成 | ${clinic.name || clinicName}${item.doctorSignature ? ' | 已電子簽署' : ''}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // ── Print SOAP Note (#66) ──
  const printSOAPNote = (item) => {
    const clinic = (() => { try { return JSON.parse(localStorage.getItem('hcmc_clinic') || '{}'); } catch { return {}; } })();
    const rxRows = (item.prescription || []).filter(r => r.herb).map((r, i) => `<tr><td>${i + 1}</td><td>${r.herb}</td><td>${r.dosage}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return showToast('請允許彈出視窗');
    w.document.write(`<!DOCTYPE html><html><head><title>SOAP 病歷 - ${item.patientName}</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:30px 40px;max-width:750px;margin:0 auto;color:#333}
      .header{text-align:center;border-bottom:3px solid #0e7490;padding-bottom:12px;margin-bottom:16px}
      .header h1{font-size:18px;color:#0e7490;margin:0}.header p{font-size:11px;color:#888;margin:3px 0}
      .title{text-align:center;font-size:16px;font-weight:800;color:#0e7490;margin:12px 0}
      .meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px;margin-bottom:16px;padding:10px;background:#f9fafb;border-radius:6px}
      .soap{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
      .soap-box{padding:12px;border-radius:6px;border-left:4px solid #0e7490;background:#f0fdfa;min-height:60px}
      .soap-box h4{font-size:12px;color:#0e7490;margin:0 0 6px}.soap-box p{font-size:12px;margin:0;white-space:pre-wrap}
      .section{margin:12px 0;font-size:12px}.section h4{font-size:12px;font-weight:700;margin:0 0 6px;color:#555}
      table{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
      th{background:#f3f4f6;padding:5px 8px;text-align:left}td{padding:4px 8px;border-bottom:1px solid #eee}
      .sig{margin-top:40px;display:flex;justify-content:space-between}.sig-box{text-align:center;width:180px}
      .sig-line{border-top:1px solid #333;margin-top:50px;padding-top:4px;font-size:10px}
      .footer{text-align:center;font-size:9px;color:#aaa;margin-top:20px}
      @media print{body{padding:15px}}
    </style></head><body>
      <div class="header"><h1>${clinic.name || clinicName}</h1><p>${clinic.nameEn || clinicNameEn}</p></div>
      <div class="title">診症紀錄 (SOAP Note)</div>
      <div class="meta"><div><strong>病人：</strong>${item.patientName}</div><div><strong>日期：</strong>${item.date}</div><div><strong>醫師：</strong>${item.doctor}</div><div><strong>電話：</strong>${item.patientPhone || '-'}</div><div><strong>店舖：</strong>${item.store}</div><div><strong>診金：</strong>$${item.fee || 0}</div></div>
      <div class="soap">
        <div class="soap-box"><h4>S — Subjective 主訴</h4><p>${item.subjective || '-'}</p></div>
        <div class="soap-box"><h4>O — Objective 客觀</h4><p>${item.objective || '-'}</p></div>
        <div class="soap-box"><h4>A — Assessment 評估</h4><p>${item.assessment || '-'}</p></div>
        <div class="soap-box"><h4>P — Plan 計劃</h4><p>${item.plan || '-'}</p></div>
      </div>
      <div class="section"><h4>中醫辨證</h4><div>診斷：<strong>${item.tcmDiagnosis || '-'}</strong>${item.icd10Code ? ` <span style="font-size:10px;color:#666">(ICD-10: ${item.icd10Code})</span>` : ''} | 證型：<strong>${item.tcmPattern || '-'}</strong>${item.cmZhengCode ? ` <span style="font-size:10px;color:#666">(${item.cmZhengCode})</span>` : ''} | 舌象：${item.tongue || '-'} | 脈象：${item.pulse || '-'}</div></div>
      ${(item.treatments || []).length ? `<div class="section"><h4>治療方式</h4><div>${item.treatments.join('、')}</div></div>` : ''}
      ${item.acupuncturePoints ? `<div class="section"><h4>穴位</h4><div>${item.acupuncturePoints}</div></div>` : ''}
      ${rxRows ? `<div class="section"><h4>處方${item.formulaName ? ' — ' + item.formulaName : ''}${item.formulaDays ? ' (' + item.formulaDays + '天)' : ''}</h4><table><thead><tr><th>#</th><th>藥材</th><th>劑量</th></tr></thead><tbody>${rxRows}</tbody></table><div>服法：${item.formulaInstructions || '每日一劑，水煎服'}</div></div>` : ''}
      ${item.followUpDate ? `<div class="section" style="padding:8px;background:#f0fdfa;border-radius:6px"><h4>覆診安排</h4><div>${item.followUpDate}${item.followUpNotes ? ' — ' + item.followUpNotes : ''}</div></div>` : ''}
      <div class="sig"><div class="sig-box">${item.doctorSignature ? `<img src="${item.doctorSignature}" style="height:50px;object-fit:contain;display:block;margin:0 auto 4px" />` : '<div style="margin-top:50px"></div>'}<div class="sig-line">主診醫師：${item.doctor}</div></div><div class="sig-box"><div style="margin-top:50px"></div><div class="sig-line">診所蓋章</div></div></div>
      <div class="footer">此病歷由系統生成 | ${clinic.name || clinicName} | ${new Date().toLocaleString('zh-HK')}${item.doctorSignature ? ' | 已電子簽署' : ''}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const handlePrint = () => { window.print(); };

  // ── WhatsApp med reminder ──
  const sendMedReminder = (item) => {
    const rxList = (item.prescription || []).map(r => r.herb).filter(Boolean).join('、');
    const text = `【${clinicName}】${item.patientName}你好！提醒你按時服藥。\n` +
      (item.formulaName ? `處方：${item.formulaName}\n` : '') +
      (rxList ? `藥材：${rxList}\n` : '') +
      (item.formulaDays ? `共 ${item.formulaDays} 天\n` : '') +
      `服法：${item.formulaInstructions || '每日一劑，水煎服'}\n` +
      (item.followUpDate ? `覆診日期：${item.followUpDate}\n` : '') +
      `如有不適請聯絡我們，祝早日康復！`;
    openWhatsApp(item.patientPhone, text);
    showToast('已開啟 WhatsApp');
  };

  // ── Drug Interaction Check ──
  const rxWarnings = useMemo(() => {
    return checkInteractions(form.prescription);
  }, [form.prescription]);

  // ── AI Prescription Suggestion ──
  const handleAiSuggest = async () => {
    if (!form.tcmDiagnosis && !form.subjective) return showToast('請先填寫診斷或主訴');
    setAiLoading(true);
    setAiSuggestion(null);
    try {
      const res = await fetch('/api/ai?action=prescription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagnosis: form.tcmDiagnosis,
          pattern: form.tcmPattern,
          tongue: form.tongue,
          pulse: form.pulse,
          subjective: form.subjective,
        }),
      });
      const result = await res.json();
      if (result.success) {
        setAiSuggestion(result);
      } else {
        showToast(result.error || 'AI 建議失敗');
      }
    } catch { showToast('網絡錯誤'); }
    setAiLoading(false);
  };

  const applyAiSuggestion = () => {
    if (!aiSuggestion) return;
    if (aiSuggestion.herbs) {
      setForm(f => ({ ...f, prescription: aiSuggestion.herbs, formulaName: aiSuggestion.formulaName || '' }));
    }
    if (aiSuggestion.acupoints) {
      setForm(f => ({ ...f, acupuncturePoints: aiSuggestion.acupoints.join('、') }));
    }
    setAiSuggestion(null);
    showToast('已套用 AI 建議');
  };

  // ── Referral Letter ──
  const handleReferral = (item) => {
    const clinic = (() => { try { return JSON.parse(localStorage.getItem('hcmc_clinic') || '{}'); } catch { return {}; } })();
    const w = window.open('', '_blank');
    if (!w) return showToast('請允許彈出視窗');
    w.document.write(`<!DOCTYPE html><html><head><title>轉介信</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:40px 50px;max-width:700px;margin:0 auto;color:#333}
      .header{text-align:center;border-bottom:3px solid #0e7490;padding-bottom:16px;margin-bottom:24px}
      .header h1{font-size:18px;color:#0e7490;margin:0}
      .header p{font-size:12px;color:#888;margin:4px 0}
      .title{text-align:center;font-size:20px;font-weight:800;margin:24px 0;color:#0e7490}
      .field{margin:12px 0;font-size:14px;line-height:1.8}
      .field .label{font-weight:700;color:#555}
      .body-text{margin:24px 0;font-size:14px;line-height:2}
      .sig{margin-top:60px;display:flex;justify-content:space-between}
      .sig-box{text-align:center;width:200px}
      .sig-line{border-top:1px solid #333;margin-top:60px;padding-top:4px;font-size:12px}
      .footer{margin-top:40px;text-align:center;font-size:10px;color:#aaa}
    </style></head><body>
      <div class="header">
        <h1>${clinic.name || clinicName}</h1>
        <p>${clinic.nameEn || clinicNameEn}</p>
        <p>${(() => { const tenantStores = getTenantStores(); const s = tenantStores.find(st => st.name === item.store) || tenantStores[0] || {}; return s.address || ''; })()}</p>
      </div>
      <div class="title">轉介信 Referral Letter</div>
      <div class="field"><span class="label">日期：</span>${new Date().toISOString().substring(0, 10)}</div>
      <div class="field"><span class="label">病人姓名：</span>${item.patientName}</div>
      <div class="field"><span class="label">聯絡電話：</span>${item.patientPhone || '-'}</div>
      <div class="body-text">
        <p>致有關醫生：</p>
        <p>上述病人因 <strong>${item.tcmDiagnosis || item.assessment || '（請填寫）'}</strong> 於本中心就診。</p>
        <p><strong>證型：</strong>${item.tcmPattern || '-'}</p>
        <p><strong>舌象：</strong>${item.tongue || '-'} ｜ <strong>脈象：</strong>${item.pulse || '-'}</p>
        <p><strong>治療紀錄：</strong>${(item.treatments || []).join('、') || '-'}</p>
        ${item.prescription?.length ? `<p><strong>處方：</strong>${item.prescription.map(r => r.herb + ' ' + r.dosage).join('、')}</p>` : ''}
        <p>現轉介 閣下跟進診治，煩請惠予診療。如有查詢，歡迎致電本中心。</p>
      </div>
      <div class="sig">
        <div class="sig-box">${item.doctorSignature ? `<img src="${item.doctorSignature}" style="height:50px;object-fit:contain;display:block;margin:0 auto 4px" />` : '<div style="margin-top:60px"></div>'}<div class="sig-line">主診醫師：${item.doctor}</div></div>
        <div class="sig-box"><div style="margin-top:60px"></div><div class="sig-line">診所蓋章</div></div>
      </div>
      <div class="footer">此轉介信由 ${clinic.name || clinicName} 簽發${item.doctorSignature ? ' | 已電子簽署' : ''}</div>
    </body></html>`);
    w.document.close();
    w.print();
  };

  // ── Version History (#versionhistory) ──
  const openVersionHistory = (item) => {
    setVersionHistoryData(item.versionHistory || []);
    setShowVersionHistory(true);
  };

  const restoreVersion = async (item, versionSnapshot) => {
    // Create a new version entry for the current state before restoring
    const currentHistory = item.versionHistory || [];
    const newVersion = { savedAt: new Date().toISOString(), savedBy: user?.name || '', note: '版本還原', snapshot: { ...item } };
    const updatedHistory = [...currentHistory, newVersion].slice(-10); // max 10 versions

    const restored = {
      ...item,
      subjective: versionSnapshot.subjective || '',
      objective: versionSnapshot.objective || '',
      assessment: versionSnapshot.assessment || '',
      plan: versionSnapshot.plan || '',
      tcmDiagnosis: versionSnapshot.tcmDiagnosis || '',
      tcmPattern: versionSnapshot.tcmPattern || '',
      tongue: versionSnapshot.tongue || '',
      pulse: versionSnapshot.pulse || '',
      prescription: versionSnapshot.prescription || [],
      formulaName: versionSnapshot.formulaName || '',
      formulaDays: versionSnapshot.formulaDays || 3,
      formulaInstructions: versionSnapshot.formulaInstructions || '',
      treatments: versionSnapshot.treatments || [],
      acupuncturePoints: versionSnapshot.acupuncturePoints || '',
      followUpDate: versionSnapshot.followUpDate || '',
      followUpNotes: versionSnapshot.followUpNotes || '',
      fee: versionSnapshot.fee || 0,
      versionHistory: updatedHistory,
    };
    await saveConsultation(restored);
    setData(d => ({ ...d, consultations: (d.consultations || []).map(c => c.id === restored.id ? restored : c) }));
    setDetail(restored);
    setShowVersionHistory(false);
    showToast('已還原至選定版本');
  };

  // Save a new version snapshot for an existing consultation (used when editing)
  const saveVersionSnapshot = async (item) => {
    const currentHistory = item.versionHistory || [];
    const newVersion = { savedAt: new Date().toISOString(), savedBy: user?.name || '', snapshot: { ...item } };
    const updatedHistory = [...currentHistory, newVersion].slice(-10);
    const updated = { ...item, versionHistory: updatedHistory };
    await saveConsultation(updated);
    setData(d => ({ ...d, consultations: (d.consultations || []).map(c => c.id === updated.id ? updated : c) }));
    if (detail && detail.id === updated.id) setDetail(updated);
    showToast('已儲存版本快照');
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">今日診症</div><div className="stat-value teal">{stats.todayCount}</div></div>
        <div className="stat-card green"><div className="stat-label">本月診症</div><div className="stat-value green">{stats.monthCount}</div></div>
        <div className="stat-card gold"><div className="stat-label">診症病人數</div><div className="stat-value gold">{stats.uniquePatients}</div></div>
        <div className="stat-card red"><div className="stat-label">本週覆診</div><div className="stat-value red">{stats.followUps}</div></div>
      </div>

      {/* Top action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>診症紀錄</h3>
        <button className="btn btn-teal" onClick={() => setShowAdd(true)}>+ 新增診症</button>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ flex: 1, minWidth: 160 }} placeholder="搜尋病人/診斷/證型/方劑..." value={search} onChange={e => setSearch(e.target.value)} />
        <input style={{ width: 120 }} placeholder="篩選藥材..." value={filterHerb} onChange={e => setFilterHerb(e.target.value)} />
        <div className="preset-bar" style={{ marginBottom: 0 }}>
          {[['all', '全部'], ['today', '今日'], ['week', '本週'], ['custom', '自選']].map(([k, l]) => (
            <button key={k} className={`preset-chip ${filterDate === k ? 'active' : ''}`} onClick={() => setFilterDate(k)}>{l}</button>
          ))}
        </div>
        {filterDate === 'custom' && (
          <>
            <input type="date" style={{ width: 'auto' }} value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span style={{ fontSize: 12 }}>至</span>
            <input type="date" style={{ width: 'auto' }} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </>
        )}
        <select style={{ width: 'auto' }} value={filterDoc} onChange={e => setFilterDoc(e.target.value)}>
          <option value="all">所有醫師</option>
          {doctors.map(d => <option key={d}>{d}</option>)}
        </select>
        <select style={{ width: 'auto' }} value={filterStore} onChange={e => setFilterStore(e.target.value)}>
          <option value="all">所有店舖</option>
          {storeNames.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn btn-outline btn-sm" onClick={() => {
          if (!filtered.length) return showToast('沒有診症紀錄可匯出');
          const headers = ['日期','病人','醫師','店舖','中醫診斷','ICD-10','證型','證型碼','處方','劑數','治療','覆診日期'];
          const rows = filtered.map(c => [
            c.date, c.patientName, c.doctor, c.store, c.tcmDiagnosis || '', c.icd10Code || '', c.tcmPattern || '', c.cmZhengCode || '',
            (c.prescription || []).map(rx => `${rx.herb}${rx.dosage ? ' ' + rx.dosage : ''}`).join('、'),
            c.formulaDays || '', (c.treatments || []).join('、'), c.followUpDate || ''
          ]);
          const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
          a.download = `consultations_${new Date().toISOString().substring(0,10)}.csv`; a.click();
          showToast('已匯出診症紀錄');
        }}>匯出CSV</button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日期</th><th>病人</th><th>醫師</th><th>店舖</th>
                <th>中醫診斷</th><th>治療</th><th>覆診日期</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>{(c.date || '').substring(0, 10)}</td>
                  <td>
                    <span style={{ color: 'var(--teal-700)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setDetail(c)}>
                      {c.patientName}
                    </span>
                  </td>
                  <td>{c.doctor}</td>
                  <td>{c.store}</td>
                  <td>{c.tcmDiagnosis || '-'}{c.icd10Code && <span style={{ fontSize: 10, color: 'var(--gray-400)', marginLeft: 4 }}>({c.icd10Code})</span>}</td>
                  <td>{(c.treatments || []).length > 0 ? c.treatments.join('、') : '-'}</td>
                  <td>{c.followUpDate || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setDetail(c)}>詳情</button>
                      <button className="btn btn-red btn-sm" onClick={() => setDeleteId(c.id)}>刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24 }}>暫無診症紀錄</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════ New Consultation Modal ══════ */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)} role="dialog" aria-modal="true" aria-label="新增診症">
          <div className="modal" onClick={e => e.stopPropagation()} ref={addRef} style={{ maxWidth: 820, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>新增診症紀錄</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowAdd(false)} aria-label="關閉">✕</button>
            </div>
            {/* Draft Restore Banner */}
            {showDraftRestore && draftData && (
              <div style={{ marginBottom: 12, padding: 12, background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13 }}>
                  <strong style={{ color: '#92400e' }}>發現未儲存的草稿</strong>
                  <span style={{ color: '#78716c', marginLeft: 8, fontSize: 11 }}>
                    {draftData._draftSavedAt ? `(${new Date(draftData._draftSavedAt).toLocaleString('zh-HK')})` : ''}
                    {draftData.patientName ? ` — ${draftData.patientName}` : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-gold btn-sm" style={{ fontSize: 11 }} onClick={restoreDraft}>恢復草稿</button>
                  <button type="button" className="btn btn-outline btn-sm" style={{ fontSize: 11 }} onClick={dismissDraft}>忽略</button>
                </div>
              </div>
            )}
            <form onSubmit={handleSave}>
              {/* Patient selector */}
              <div className="card-header" style={{ padding: 0, marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: 13 }}>病人資料</h4></div>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div style={{ position: 'relative' }}>
                  <label>病人 *</label>
                  <input value={patientSearch} placeholder="搜尋姓名或電話..."
                    onChange={e => { setPatientSearch(e.target.value); setShowPatientDD(true); setForm(f => ({ ...f, patientName: e.target.value, patientId: '' })); }}
                    onFocus={() => patientSearch && setShowPatientDD(true)}
                    onBlur={() => setTimeout(() => setShowPatientDD(false), 200)} />
                  {showPatientDD && patientMatches.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 6, zIndex: 99, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                      {patientMatches.map(p => (
                        <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--gray-100)' }}
                          onMouseDown={() => selectPatient(p)}>
                          <strong>{p.name}</strong> <span style={{ color: 'var(--gray-400)' }}>{p.phone}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div><label>電話</label><input value={form.patientPhone} readOnly style={{ background: 'var(--gray-50)' }} /></div>
                <div><label>日期 *</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              </div>
              <div className="grid-3" style={{ marginBottom: 16 }}>
                <div><label>醫師</label><select value={form.doctor} onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))}>{doctors.map(d => <option key={d}>{d}</option>)}</select></div>
                <div><label>店舖</label><select value={form.store} onChange={e => setForm(f => ({ ...f, store: e.target.value }))}>{storeNames.map(s => <option key={s}>{s}</option>)}</select></div>
                <div><label>診金 ($)</label><input type="number" min="0" value={form.fee} onChange={e => setForm(f => ({ ...f, fee: e.target.value }))} /></div>
              </div>

              {/* Active Packages (#70) */}
              {activePackages.length > 0 && (
                <div style={{ marginBottom: 12, padding: 10, background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-700)', marginBottom: 6 }}>🎫 有效套餐</div>
                  {activePackages.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 12 }}>
                      <span><strong>{p.packageName}</strong> — 餘 <strong>{p.remaining}</strong>/{p.totalSessions} 次 {p.expiryDate && <span style={{ color: 'var(--gray-400)' }}>(到期: {p.expiryDate})</span>}</span>
                      <button type="button" className="btn btn-green btn-sm" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => deductPackageSession(p)}>扣減 1 次</button>
                    </div>
                  ))}
                </div>
              )}

              {/* SOAP Notes */}
              {/* AI Consultation Assistant */}
              <ConsultAI form={form} setForm={setForm} showToast={showToast} />

              <div className="card-header" style={{ padding: 0, marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 13 }}>SOAP 病歷</h4>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select style={{ width: 'auto', fontSize: 11, padding: '3px 6px' }} value="" onChange={e => { const t = SOAP_TEMPLATES.find(t => t.name === e.target.value); if (t) applySOAPTemplate(t); }}>
                    <option value="">快捷模板...</option>
                    {SOAP_TEMPLATES.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </select>
                  {form.patientName && <button type="button" className="btn btn-outline btn-sm" style={{ fontSize: 10 }} onClick={() => loadLastPrescription(form.patientName)}>重複上次處方</button>}
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>🎙 mic 語音</span>
                </div>
              </div>
              <div className="grid-2" style={{ marginBottom: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label style={{ flex: 1 }}>Subjective 主訴</label>
                    <VoiceButton onTranscript={t => setForm(f => ({ ...f, subjective: f.subjective + t }))} />
                  </div>
                  <textarea rows={2} value={form.subjective} onChange={e => setForm(f => ({ ...f, subjective: e.target.value }))} placeholder="主訴、病史..." />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label style={{ flex: 1 }}>Objective 客觀</label>
                    <VoiceButton onTranscript={t => setForm(f => ({ ...f, objective: f.objective + t }))} />
                  </div>
                  <textarea rows={2} value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))} placeholder="望聞問切、檢查結果..." />
                </div>
              </div>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label style={{ flex: 1 }}>Assessment 評估</label>
                    <VoiceButton onTranscript={t => setForm(f => ({ ...f, assessment: f.assessment + t }))} />
                  </div>
                  <textarea rows={2} value={form.assessment} onChange={e => setForm(f => ({ ...f, assessment: e.target.value }))} placeholder="中醫診斷..." />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label style={{ flex: 1 }}>Plan 計劃</label>
                    <VoiceButton onTranscript={t => setForm(f => ({ ...f, plan: f.plan + t }))} />
                  </div>
                  <textarea rows={2} value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))} placeholder="治療方案..." />
                </div>
              </div>

              {/* TCM Specific */}
              <div className="card-header" style={{ padding: 0, marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: 13 }}>中醫辨證</h4></div>
              <div className="grid-2" style={{ marginBottom: 8 }}>
                <div style={{ position: 'relative' }}>
                  <label>中醫診斷 {form.icd10Code && <span style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 400 }}>ICD-10: {form.icd10Code}</span>}</label>
                  <input value={form.tcmDiagnosis}
                    placeholder="搜尋病名（HKCTT 編碼）..."
                    onChange={e => { setForm(f => ({ ...f, tcmDiagnosis: e.target.value, icd10Code: '', cmDiagnosisCode: '' })); setDiagSearch(e.target.value); setShowDiagDD(true); }}
                    onFocus={() => { if (form.tcmDiagnosis) { setDiagSearch(form.tcmDiagnosis); setShowDiagDD(true); } }}
                    onBlur={() => setTimeout(() => setShowDiagDD(false), 200)} />
                  {showDiagDD && diagMatches.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 6, zIndex: 99, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                      {diagMatches.map(d => (
                        <div key={d.code} style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseDown={() => selectDiagnosis(d)}>
                          <span><strong>{d.name}</strong> <span style={{ color: 'var(--gray-400)', fontSize: 11 }}>{d.category}</span></span>
                          <span style={{ fontSize: 10, display: 'flex', gap: 4 }}>
                            <span style={{ background: 'var(--teal-50)', color: 'var(--teal-700)', padding: '1px 4px', borderRadius: 3 }}>ICD: {d.icd10}</span>
                            <span style={{ color: 'var(--gray-400)' }}>{d.code}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <label>證型 {form.cmZhengCode && <span style={{ fontSize: 10, color: 'var(--teal)', fontWeight: 400 }}>code: {form.cmZhengCode}</span>}</label>
                  <input value={form.tcmPattern}
                    placeholder="搜尋證型..."
                    onChange={e => { setForm(f => ({ ...f, tcmPattern: e.target.value, cmZhengCode: '' })); setZhengSearch(e.target.value); setShowZhengDD(true); }}
                    onFocus={() => { if (form.tcmPattern) { setZhengSearch(form.tcmPattern); setShowZhengDD(true); } }}
                    onBlur={() => setTimeout(() => setShowZhengDD(false), 200)} />
                  {showZhengDD && zhengMatches.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 6, zIndex: 99, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                      {zhengMatches.map(z => (
                        <div key={z.code} style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between' }}
                          onMouseDown={() => selectZheng(z)}>
                          <strong>{z.name}</strong>
                          <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>{z.code}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {form.icd10Code && (
                <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
                  {form.cmDiagnosisCode && <span style={{ background: 'var(--teal-50)', color: 'var(--teal-700)', padding: '2px 8px', borderRadius: 4 }}>HKCTT: {form.cmDiagnosisCode}</span>}
                  <span style={{ background: '#eff6ff', color: '#1e40af', padding: '2px 8px', borderRadius: 4 }}>ICD-10: {form.icd10Code}</span>
                  {form.cmZhengCode && <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 4 }}>證型: {form.cmZhengCode}</span>}
                </div>
              )}
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div><label>舌象</label><input value={form.tongue} onChange={e => setForm(f => ({ ...f, tongue: e.target.value }))} placeholder="舌質舌苔" /></div>
                <div><label>脈象</label><input value={form.pulse} onChange={e => setForm(f => ({ ...f, pulse: e.target.value }))} placeholder="脈象" /></div>
              </div>

              {/* Treatments */}
              <div className="card-header" style={{ padding: 0, marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: 13 }}>治療方式</h4></div>
              <div className="preset-bar" style={{ marginBottom: 16 }}>
                {TCM_TREATMENTS.map(t => (
                  <button type="button" key={t} className={`preset-chip ${form.treatments.includes(t) ? 'active' : ''}`} onClick={() => toggleTreatment(t)}>{t}</button>
                ))}
              </div>

              {/* Acupoints */}
              <div style={{ marginBottom: 16 }}>
                <label>穴位</label>
                <input value={form.acupuncturePoints} onChange={e => setForm(f => ({ ...f, acupuncturePoints: e.target.value }))} placeholder="輸入穴位或點擊下方選取" style={{ marginBottom: 6 }} />
                <div style={{ marginBottom: 4 }}>
                  <select style={{ width: 'auto', fontSize: 11, padding: '3px 6px' }} value={acupointMeridian} onChange={e => setAcupointMeridian(e.target.value)}>
                    <option value="all">常用穴位</option>
                    {MERIDIANS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="preset-bar" style={{ maxHeight: 120, overflowY: 'auto' }}>
                  {(acupointMeridian === 'all'
                    ? ACUPOINTS_DB.filter(a => ['合谷','足三里','三陰交','太衝','內關','外關','曲池','肩井','風池','百會','大椎','命門','腎俞','肝俞','脾俞','肺俞','心俞','委中','環跳','陽陵泉','陰陵泉','太溪','崑崙','中脘','關元','氣海','天樞','血海','列缺','迎香','地倉','頰車','太陽','印堂'].includes(a.name))
                    : ACUPOINTS_DB.filter(a => a.mer === acupointMeridian)
                  ).map(pt => (
                    <button type="button" key={pt.name} className={`preset-chip ${currentAcupoints.includes(pt.name) ? 'active' : ''}`} onClick={() => toggleAcupoint(pt.name)} title={`${pt.code} ${pt.ind}`}>{pt.name}</button>
                  ))}
                </div>
              </div>

              {/* Prescription Builder */}
              <div className="card-header" style={{ padding: 0, marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 13 }}>處方</h4>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }} value="" onChange={e => {
                    const v = e.target.value;
                    if (!v) return;
                    if (v.startsWith('custom:')) { const cf = customFormulas.find(f => f.id === v.slice(7)); if (cf) loadCustomFormula(cf); }
                    else loadFormula(v);
                  }}>
                    <option value="">從方劑庫載入 ({TCM_FORMULAS_DB.length + customFormulas.length} 方)...</option>
                    {customFormulas.length > 0 && (
                      <optgroup label={`我的處方 (${customFormulas.length})`}>
                        {customFormulas.map(f => (
                          <option key={f.id} value={`custom:${f.id}`}>{f.name} — {f.herbs.map(h => h.herb).join('、').substring(0, 30)}</option>
                        ))}
                      </optgroup>
                    )}
                    {FORMULA_CATEGORIES.map(cat => (
                      <optgroup key={cat} label={cat}>
                        {TCM_FORMULAS_DB.filter(f => f.cat === cat).map(f => (
                          <option key={f.name} value={f.name}>{f.name}（{f.src}）- {f.ind?.substring(0, 20)}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button type="button" className="btn btn-sm" style={{ fontSize: 11, background: '#7c3aed', color: '#fff' }} onClick={saveCustomFormula} title="儲存當前處方為自訂模板">
                    儲存處方
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={handleAiSuggest} disabled={aiLoading} style={{ fontSize: 11 }}>
                    {aiLoading ? '分析中...' : '🤖 AI 處方建議'}
                  </button>
                </div>
              </div>
              {/* AI Suggestion Panel */}
              {aiSuggestion && (
                <div style={{ background: 'var(--teal-50)', border: '1px solid var(--teal-200)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ color: 'var(--teal-700)' }}>🤖 AI 建議</strong>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" className="btn btn-teal btn-sm" style={{ fontSize: 11 }} onClick={applyAiSuggestion}>套用建議</button>
                      <button type="button" className="btn btn-outline btn-sm" style={{ fontSize: 11 }} onClick={() => setAiSuggestion(null)}>關閉</button>
                    </div>
                  </div>
                  {aiSuggestion.formulaName && <div><strong>方劑：</strong>{aiSuggestion.formulaName}</div>}
                  {aiSuggestion.herbs && <div style={{ marginTop: 4 }}><strong>處方：</strong>{aiSuggestion.herbs.map(h => `${h.herb} ${h.dosage}`).join('、')}</div>}
                  {aiSuggestion.acupoints && <div style={{ marginTop: 4 }}><strong>穴位：</strong>{aiSuggestion.acupoints.join('、')}</div>}
                  {aiSuggestion.explanation && <div style={{ marginTop: 4, color: 'var(--gray-600)' }}>{aiSuggestion.explanation}</div>}
                  {aiSuggestion.caution && <div style={{ marginTop: 4, color: 'var(--red-600)' }}>⚠️ {aiSuggestion.caution}</div>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input type="radio" name="rxType" checked={form.prescriptionType === 'decoction'} onChange={() => setForm(f => ({ ...f, prescriptionType: 'decoction', formulaInstructions: '每日一劑，水煎服' }))} /> 飲片（煎藥）
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input type="radio" name="rxType" checked={form.prescriptionType === 'granule'} onChange={() => setForm(f => ({ ...f, prescriptionType: 'granule', formulaInstructions: '每日沖服' }))} /> 顆粒（濃縮藥粉）
                </label>
              </div>
              <div className="grid-3" style={{ marginBottom: 8 }}>
                <div><label>方名</label><input value={form.formulaName} onChange={e => setForm(f => ({ ...f, formulaName: e.target.value }))} placeholder="處方名稱" /></div>
                <div><label>天數</label><input type="number" min="1" value={form.formulaDays} onChange={e => setForm(f => ({ ...f, formulaDays: e.target.value }))} /></div>
                <div><label>服法</label><input value={form.formulaInstructions} onChange={e => setForm(f => ({ ...f, formulaInstructions: e.target.value }))} /></div>
              </div>
              {form.prescriptionType === 'granule' && (
                <div className="grid-2" style={{ marginBottom: 8 }}>
                  <div><label>每日次數</label><input type="number" min="1" max="4" value={form.granuleDosesPerDay} onChange={e => setForm(f => ({ ...f, granuleDosesPerDay: Number(e.target.value) }))} /></div>
                  <div><label>特別注意</label><input value={form.specialNotes || ''} onChange={e => setForm(f => ({ ...f, specialNotes: e.target.value }))} placeholder="如忌口、特殊服法等" /></div>
                </div>
              )}
              <div className="table-wrap" style={{ marginBottom: 8 }}>
                <table>
                  <thead><tr><th>藥材</th><th>劑量</th><th></th></tr></thead>
                  <tbody>
                    {form.prescription.map((rx, i) => (
                      <tr key={i}>
                        <td style={{ position: 'relative' }}>
                          <input value={rx.herb} placeholder="藥材名..."
                            onChange={e => { updateRx(i, 'herb', e.target.value); setHerbSearch(s => ({ ...s, [i]: e.target.value })); setActiveHerbIdx(i); }}
                            onFocus={() => { setHerbSearch(s => ({ ...s, [i]: rx.herb })); setActiveHerbIdx(i); }}
                            onBlur={() => setTimeout(() => setActiveHerbIdx(null), 200)} />
                          {activeHerbIdx === i && getHerbMatches(i).length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 6, zIndex: 99, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                              {getHerbMatches(i).map(h => (
                                <div key={h.n} style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                  onMouseDown={() => { updateRx(i, 'herb', h.n); if (!form.prescription[i].dosage) updateRx(i, 'dosage', `${h.dMax}g`); setHerbSearch(s => ({ ...s, [i]: '' })); setActiveHerbIdx(null); }}>
                                  <span>{h.n} <span style={{ color: '#999', fontSize: 11 }}>{h.py}</span></span>
                                  <span style={{ fontSize: 10, display: 'flex', gap: 3 }}>
                                    <span style={{ color: '#888' }}>{h.dMin}-{h.dMax}g</span>
                                    {h.tox > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>{['','小毒','有毒','大毒'][h.tox]}</span>}
                                    {h.sch1 && <span style={{ background: '#dc2626', color: '#fff', padding: '0 3px', borderRadius: 2 }}>附表一</span>}
                                    {h.preg > 0 && <span style={{ color: '#d97706' }}>孕{['','慎','忌','禁'][h.preg]}</span>}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ position: 'relative' }}>
                          <input value={rx.dosage} placeholder="例: 10g" onChange={e => updateRx(i, 'dosage', e.target.value)}
                            style={(() => {
                              if (!rx.herb || !rx.dosage) return {};
                              const d = checkDosage(rx.herb, parseFloat(rx.dosage));
                              if (!d) return { borderColor: '#16a34a' };
                              if (d.level === 'danger') return { borderColor: '#dc2626', background: '#fef2f2' };
                              if (d.level === 'warning') return { borderColor: '#d97706', background: '#fffbeb' };
                              return { borderColor: '#3b82f6', background: '#eff6ff' };
                            })()} />
                          {rx.herb && (() => {
                            const info = getHerbSafetyInfo(rx.herb);
                            if (!info.maxDosage) return null;
                            return <div style={{ fontSize: 9, color: 'var(--gray-400)', marginTop: 1 }}>{info.maxDosage.min}-{info.maxDosage.max}g{info.maxDosage.note ? ` (${info.maxDosage.note})` : ''}</div>;
                          })()}
                        </td>
                        <td style={{ width: 40 }}>
                          {form.prescription.length > 1 && (
                            <button type="button" className="btn btn-red btn-sm" onClick={() => removeRxRow(i)} style={{ padding: '2px 8px' }}>✕</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={addRxRow}>+ 加藥材</button>
              </div>
              {/* Drug Interaction Warnings */}
              {rxWarnings.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {rxWarnings.map((w, i) => (
                    <div key={i} style={{
                      padding: '8px 12px', borderRadius: 6, marginBottom: 4, fontSize: 12, fontWeight: 600,
                      background: w.level === 'danger' ? '#fef2f2' : w.level === 'warning' ? '#fffbeb' : '#f0f9ff',
                      color: w.level === 'danger' ? '#991b1b' : w.level === 'warning' ? '#92400e' : '#1e40af',
                      border: `1px solid ${w.level === 'danger' ? '#fecaca' : w.level === 'warning' ? '#fed7aa' : '#bfdbfe'}`,
                    }}>
                      {w.level === 'danger' ? '🚫' : w.level === 'warning' ? '⚠️' : 'ℹ️'} {w.message}
                    </div>
                  ))}
                </div>
              )}

              {/* Follow-up */}
              <div className="card-header" style={{ padding: 0, marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: 13 }}>覆診安排</h4></div>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div><label>覆診日期</label><input type="date" value={form.followUpDate} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))} /></div>
                <div><label>覆診備註</label><input value={form.followUpNotes} onChange={e => setForm(f => ({ ...f, followUpNotes: e.target.value }))} placeholder="覆診注意事項" /></div>
              </div>

              {/* Doctor Signature */}
              <div className="card-header" style={{ padding: 0, marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: 13 }}>醫師簽名</h4></div>
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                {doctorSig ? (
                  <>
                    <SignaturePreview src={doctorSig} label={form.doctor} height={50} />
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowSigPad(true)}>重新簽名</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { setDoctorSig(''); sessionStorage.removeItem(`hcmc_sig_doctor_${user?.name || ''}`); }}>清除</button>
                  </>
                ) : (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowSigPad(true)} style={{ padding: '8px 16px' }}>
                    簽名 Sign
                  </button>
                )}
                <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>簽名將自動記住至此登入期間</span>
              </div>

              {/* Submit */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-teal">儲存診症紀錄</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════ Detail Modal ══════ */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)} role="dialog" aria-modal="true" aria-label="診症詳情">
          <div className="modal emr-print" onClick={e => e.stopPropagation()} ref={detailRef} style={{ maxWidth: 750, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 12 }} className="print-only">
              <img src="/logo.jpg" alt={clinicName} style={{ height: 48 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>診症詳情 -- {detail.patientName}</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-teal btn-sm" onClick={() => printPrescription(detail)}>列印處方</button>
                <button className="btn btn-outline btn-sm" onClick={() => printSOAPNote(detail)}>列印SOAP</button>
                <button className="btn btn-sm" style={{ background: '#7c3aed', color: '#fff' }} onClick={() => setShowLabel(detail)}>藥袋標籤</button>
                <button className="btn btn-gold btn-sm" onClick={() => sendToBilling(detail)}>送往配藥收費</button>
                <button className="btn btn-green btn-sm" onClick={() => handleReferral(detail)}>轉介信</button>
                {detail.patientPhone && <button className="btn btn-sm" style={{ background: '#25D366', color: '#fff' }} onClick={() => sendMedReminder(detail)}>💊 WhatsApp 服藥提醒</button>}
                <button className="btn btn-sm" style={{ background: '#6366f1', color: '#fff', fontSize: 11 }} onClick={() => saveVersionSnapshot(detail)}>儲存版本</button>
                <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }} onClick={() => openVersionHistory(detail)}>版本歷史</button>
                <button className="btn btn-outline btn-sm" onClick={() => setDetail(null)} aria-label="關閉">✕ 關閉</button>
              </div>
            </div>

            {/* Basic info */}
            <div className="grid-3" style={{ marginBottom: 16, fontSize: 13 }}>
              <div><strong>日期：</strong>{detail.date}</div>
              <div><strong>醫師：</strong>{detail.doctor}</div>
              <div><strong>店舖：</strong>{detail.store}</div>
              <div><strong>電話：</strong>{detail.patientPhone || '-'}</div>
              <div><strong>診金：</strong>{fmtM(detail.fee || 0)}</div>
              <div><strong>建立：</strong>{detail.createdAt || '-'}</div>
            </div>

            {/* SOAP */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>SOAP 病歷</h4>
              <div className="grid-2" style={{ gap: 8 }}>
                {[['S - 主訴', detail.subjective], ['O - 客觀', detail.objective], ['A - 評估', detail.assessment], ['P - 計劃', detail.plan]].map(([label, val]) => (
                  <div key={label} style={{ background: 'var(--gray-50)', padding: 10, borderRadius: 6, fontSize: 13 }}>
                    <strong>{label}</strong>
                    <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{val || '-'}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* TCM */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>中醫辨證</h4>
              <div className="grid-2" style={{ fontSize: 13, gap: 8 }}>
                <div><strong>診斷：</strong>{detail.tcmDiagnosis || '-'}</div>
                <div><strong>證型：</strong>{detail.tcmPattern || '-'}</div>
                <div><strong>舌象：</strong>{detail.tongue || '-'}</div>
                <div><strong>脈象：</strong>{detail.pulse || '-'}</div>
              </div>
              {(detail.icd10Code || detail.cmDiagnosisCode || detail.cmZhengCode) && (
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {detail.cmDiagnosisCode && <span style={{ fontSize: 10, background: 'var(--teal-50)', color: 'var(--teal-700)', padding: '2px 8px', borderRadius: 4 }}>HKCTT: {detail.cmDiagnosisCode}</span>}
                  {detail.icd10Code && <span style={{ fontSize: 10, background: '#eff6ff', color: '#1e40af', padding: '2px 8px', borderRadius: 4 }}>ICD-10: {detail.icd10Code}</span>}
                  {detail.cmZhengCode && <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 4 }}>證型: {detail.cmZhengCode}</span>}
                </div>
              )}
            </div>

            {/* Treatments */}
            {(detail.treatments || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>治療方式</h4>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {detail.treatments.map(t => <span key={t} className="tag">{t}</span>)}
                </div>
              </div>
            )}

            {/* Acupoints */}
            {detail.acupuncturePoints && (
              <div style={{ marginBottom: 16, fontSize: 13 }}>
                <strong>穴位：</strong>{detail.acupuncturePoints}
              </div>
            )}

            {/* Prescription */}
            {(detail.prescription || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  處方{detail.formulaName ? ` -- ${detail.formulaName}` : ''}
                  {detail.formulaDays ? ` (${detail.formulaDays}天)` : ''}
                </h4>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>#</th><th>藥材</th><th>劑量</th></tr></thead>
                    <tbody>
                      {detail.prescription.map((rx, i) => (
                        <tr key={i}><td>{i + 1}</td><td>{rx.herb}</td><td>{rx.dosage}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {detail.formulaInstructions && (
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 6 }}>服法：{detail.formulaInstructions}</div>
                )}
              </div>
            )}

            {/* Follow-up */}
            {detail.followUpDate && (
              <div style={{ marginBottom: 16, fontSize: 13, padding: 10, background: 'var(--teal-50)', borderRadius: 6 }}>
                <strong>覆診日期：</strong>{detail.followUpDate}
                {detail.followUpNotes && <span> | {detail.followUpNotes}</span>}
              </div>
            )}

            {/* Doctor Signature */}
            {detail.doctorSignature && (
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 13 }}>醫師簽名：</strong>
                <SignaturePreview src={detail.doctorSignature} label={detail.doctor} height={50} />
                <span style={{ fontSize: 10, color: 'var(--green-600)', fontWeight: 600 }}>已電子簽署</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && <ConfirmModal message="確認刪除此診症紀錄？此操作無法復原。" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />}

      {/* Medicine Label */}
      {showLabel && <MedicineLabel consultation={showLabel} onClose={() => setShowLabel(null)} showToast={showToast} />}

      {/* Signature Pad */}
      {showSigPad && (
        <SignaturePad
          title="醫師簽名"
          label={`${form.doctor || user?.name || '醫師'} — 請在下方簽名`}
          cacheKey={`doctor_${user?.name || ''}`}
          onConfirm={(sig) => { setDoctorSig(sig); setShowSigPad(false); showToast('簽名已記錄'); }}
          onCancel={() => setShowSigPad(false)}
        />
      )}

      {/* Version History Modal */}
      {showVersionHistory && (
        <div className="modal-overlay" onClick={() => setShowVersionHistory(false)} role="dialog" aria-modal="true" aria-label="版本歷史">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>版本歷史</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowVersionHistory(false)} aria-label="關閉">✕</button>
            </div>
            {versionHistoryData.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 24 }}>暫無版本歷史紀錄</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...versionHistoryData].reverse().map((ver, idx) => (
                  <div key={idx} style={{ padding: 12, border: '1px solid var(--gray-200)', borderRadius: 8, background: idx === 0 ? 'var(--teal-50)' : 'var(--gray-50)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div>
                        <strong style={{ fontSize: 13 }}>{idx === 0 ? '最新版本' : `版本 ${versionHistoryData.length - idx}`}</strong>
                        <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 8 }}>{new Date(ver.savedAt).toLocaleString('zh-HK')}</span>
                        {ver.savedBy && <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 8 }}>by {ver.savedBy}</span>}
                        {ver.note && <span style={{ fontSize: 11, color: '#6366f1', marginLeft: 8 }}>({ver.note})</span>}
                      </div>
                      {idx !== 0 && detail && (
                        <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }} onClick={() => restoreVersion(detail, ver.snapshot)}>還原此版本</button>
                      )}
                    </div>
                    {ver.snapshot && (
                      <div style={{ fontSize: 11, color: 'var(--gray-500)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                        {ver.snapshot.subjective && <div><strong>S:</strong> {ver.snapshot.subjective.substring(0, 40)}{ver.snapshot.subjective.length > 40 ? '...' : ''}</div>}
                        {ver.snapshot.objective && <div><strong>O:</strong> {ver.snapshot.objective.substring(0, 40)}{ver.snapshot.objective.length > 40 ? '...' : ''}</div>}
                        {ver.snapshot.assessment && <div><strong>A:</strong> {ver.snapshot.assessment.substring(0, 40)}{ver.snapshot.assessment.length > 40 ? '...' : ''}</div>}
                        {ver.snapshot.plan && <div><strong>P:</strong> {ver.snapshot.plan.substring(0, 40)}{ver.snapshot.plan.length > 40 ? '...' : ''}</div>}
                        {ver.snapshot.tcmDiagnosis && <div><strong>診斷:</strong> {ver.snapshot.tcmDiagnosis}</div>}
                        {ver.snapshot.formulaName && <div><strong>方劑:</strong> {ver.snapshot.formulaName}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
