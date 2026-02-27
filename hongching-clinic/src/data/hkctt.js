// ══════════════════════════════════
// HKCTT-Compatible CM Diagnosis & Procedure Codes
// Based on: GB/T 15657-1995, ICD-10, HKCTT terminology tables
// For eHRSS (醫健通) interoperability
// ══════════════════════════════════

// ── CM Diagnosis Codes (中醫病名 + 證型) ──
// Each entry: { code, name, nameEn, icd10, category, zheng (patterns) }
export const CM_DIAGNOSES = [
  // ── 內科 Internal Medicine ──
  { code: 'CM-INT-001', name: '感冒', nameEn: 'Common Cold', icd10: 'J06.9', cat: '內科',
    zheng: [
      { code: 'Z-001', name: '風寒束表', nameEn: 'Wind-cold constraining exterior' },
      { code: 'Z-002', name: '風熱犯表', nameEn: 'Wind-heat invading exterior' },
      { code: 'Z-003', name: '暑濕感冒', nameEn: 'Summerheat-dampness cold' },
      { code: 'Z-004', name: '氣虛感冒', nameEn: 'Qi deficiency cold' },
    ]},
  { code: 'CM-INT-002', name: '咳嗽', nameEn: 'Cough', icd10: 'R05', cat: '內科',
    zheng: [
      { code: 'Z-010', name: '風寒犯肺', nameEn: 'Wind-cold invading lung' },
      { code: 'Z-011', name: '風熱犯肺', nameEn: 'Wind-heat invading lung' },
      { code: 'Z-012', name: '痰濕阻肺', nameEn: 'Phlegm-dampness obstructing lung' },
      { code: 'Z-013', name: '肺陰虛', nameEn: 'Lung yin deficiency' },
    ]},
  { code: 'CM-INT-003', name: '哮喘', nameEn: 'Asthma', icd10: 'J45.9', cat: '內科',
    zheng: [
      { code: 'Z-020', name: '寒哮', nameEn: 'Cold-type asthma' },
      { code: 'Z-021', name: '熱哮', nameEn: 'Heat-type asthma' },
      { code: 'Z-022', name: '肺脾氣虛', nameEn: 'Lung-spleen qi deficiency' },
      { code: 'Z-023', name: '腎不納氣', nameEn: 'Kidney failing to grasp qi' },
    ]},
  { code: 'CM-INT-004', name: '胃痛', nameEn: 'Stomach Pain', icd10: 'K29.7', cat: '內科',
    zheng: [
      { code: 'Z-030', name: '寒邪犯胃', nameEn: 'Cold invading stomach' },
      { code: 'Z-031', name: '肝氣犯胃', nameEn: 'Liver qi invading stomach' },
      { code: 'Z-032', name: '脾胃虛寒', nameEn: 'Spleen-stomach cold deficiency' },
      { code: 'Z-033', name: '胃陰不足', nameEn: 'Stomach yin insufficiency' },
    ]},
  { code: 'CM-INT-005', name: '泄瀉', nameEn: 'Diarrhea', icd10: 'K59.1', cat: '內科',
    zheng: [
      { code: 'Z-040', name: '寒濕泄瀉', nameEn: 'Cold-dampness diarrhea' },
      { code: 'Z-041', name: '濕熱泄瀉', nameEn: 'Damp-heat diarrhea' },
      { code: 'Z-042', name: '脾虛泄瀉', nameEn: 'Spleen deficiency diarrhea' },
      { code: 'Z-043', name: '腎虛泄瀉', nameEn: 'Kidney deficiency diarrhea' },
    ]},
  { code: 'CM-INT-006', name: '便秘', nameEn: 'Constipation', icd10: 'K59.0', cat: '內科',
    zheng: [
      { code: 'Z-050', name: '熱秘', nameEn: 'Heat constipation' },
      { code: 'Z-051', name: '氣秘', nameEn: 'Qi constipation' },
      { code: 'Z-052', name: '血虛便秘', nameEn: 'Blood deficiency constipation' },
      { code: 'Z-053', name: '陽虛便秘', nameEn: 'Yang deficiency constipation' },
    ]},
  { code: 'CM-INT-007', name: '頭痛', nameEn: 'Headache', icd10: 'R51', cat: '內科',
    zheng: [
      { code: 'Z-060', name: '風寒頭痛', nameEn: 'Wind-cold headache' },
      { code: 'Z-061', name: '風熱頭痛', nameEn: 'Wind-heat headache' },
      { code: 'Z-062', name: '肝陽上亢', nameEn: 'Liver yang rising' },
      { code: 'Z-063', name: '氣血虧虛', nameEn: 'Qi-blood deficiency' },
      { code: 'Z-064', name: '瘀血頭痛', nameEn: 'Blood stasis headache' },
    ]},
  { code: 'CM-INT-008', name: '眩暈', nameEn: 'Dizziness', icd10: 'R42', cat: '內科',
    zheng: [
      { code: 'Z-070', name: '肝陽上亢', nameEn: 'Liver yang rising' },
      { code: 'Z-071', name: '痰濕中阻', nameEn: 'Phlegm-dampness middle obstruction' },
      { code: 'Z-072', name: '氣血虧虛', nameEn: 'Qi-blood deficiency' },
      { code: 'Z-073', name: '腎精不足', nameEn: 'Kidney essence insufficiency' },
    ]},
  { code: 'CM-INT-009', name: '失眠', nameEn: 'Insomnia', icd10: 'G47.0', cat: '內科',
    zheng: [
      { code: 'Z-080', name: '心脾兩虛', nameEn: 'Heart-spleen dual deficiency' },
      { code: 'Z-081', name: '心腎不交', nameEn: 'Heart-kidney disharmony' },
      { code: 'Z-082', name: '肝火擾心', nameEn: 'Liver fire disturbing heart' },
      { code: 'Z-083', name: '痰熱擾心', nameEn: 'Phlegm-heat disturbing heart' },
    ]},
  { code: 'CM-INT-010', name: '心悸', nameEn: 'Palpitation', icd10: 'R00.2', cat: '內科',
    zheng: [
      { code: 'Z-090', name: '心氣虛', nameEn: 'Heart qi deficiency' },
      { code: 'Z-091', name: '心血虛', nameEn: 'Heart blood deficiency' },
      { code: 'Z-092', name: '心陽虛', nameEn: 'Heart yang deficiency' },
    ]},
  { code: 'CM-INT-011', name: '高血壓', nameEn: 'Hypertension', icd10: 'I10', cat: '內科',
    zheng: [
      { code: 'Z-100', name: '肝陽上亢', nameEn: 'Liver yang rising' },
      { code: 'Z-101', name: '陰虛陽亢', nameEn: 'Yin deficiency yang excess' },
      { code: 'Z-102', name: '痰濕壅盛', nameEn: 'Phlegm-dampness exuberance' },
    ]},
  { code: 'CM-INT-012', name: '糖尿病', nameEn: 'Diabetes', icd10: 'E11.9', cat: '內科',
    zheng: [
      { code: 'Z-110', name: '陰虛燥熱', nameEn: 'Yin deficiency dryness-heat' },
      { code: 'Z-111', name: '氣陰兩虛', nameEn: 'Qi-yin dual deficiency' },
      { code: 'Z-112', name: '陰陽兩虛', nameEn: 'Yin-yang dual deficiency' },
    ]},
  { code: 'CM-INT-013', name: '水腫', nameEn: 'Edema', icd10: 'R60.0', cat: '內科',
    zheng: [
      { code: 'Z-120', name: '風水相搏', nameEn: 'Wind-water conflict' },
      { code: 'Z-121', name: '脾虛水泛', nameEn: 'Spleen deficiency water overflow' },
      { code: 'Z-122', name: '腎陽衰微', nameEn: 'Kidney yang decline' },
    ]},

  // ── 骨傷科 Musculoskeletal ──
  { code: 'CM-MSK-001', name: '腰痛', nameEn: 'Low Back Pain', icd10: 'M54.5', cat: '骨傷科',
    zheng: [
      { code: 'Z-200', name: '寒濕腰痛', nameEn: 'Cold-dampness back pain' },
      { code: 'Z-201', name: '瘀血腰痛', nameEn: 'Blood stasis back pain' },
      { code: 'Z-202', name: '腎虛腰痛', nameEn: 'Kidney deficiency back pain' },
    ]},
  { code: 'CM-MSK-002', name: '頸椎病', nameEn: 'Cervical Spondylosis', icd10: 'M47.8', cat: '骨傷科',
    zheng: [
      { code: 'Z-210', name: '風寒濕痹', nameEn: 'Wind-cold-damp bi syndrome' },
      { code: 'Z-211', name: '氣滯血瘀', nameEn: 'Qi stagnation blood stasis' },
      { code: 'Z-212', name: '肝腎虧虛', nameEn: 'Liver-kidney deficiency' },
    ]},
  { code: 'CM-MSK-003', name: '肩周炎', nameEn: 'Frozen Shoulder', icd10: 'M75.0', cat: '骨傷科',
    zheng: [
      { code: 'Z-220', name: '風寒侵襲', nameEn: 'Wind-cold invasion' },
      { code: 'Z-221', name: '瘀血阻絡', nameEn: 'Blood stasis blocking collaterals' },
      { code: 'Z-222', name: '氣血虧虛', nameEn: 'Qi-blood deficiency' },
    ]},
  { code: 'CM-MSK-004', name: '膝關節痛', nameEn: 'Knee Pain', icd10: 'M25.56', cat: '骨傷科',
    zheng: [
      { code: 'Z-230', name: '風寒濕痹', nameEn: 'Wind-cold-damp bi syndrome' },
      { code: 'Z-231', name: '瘀血痹阻', nameEn: 'Blood stasis bi obstruction' },
      { code: 'Z-232', name: '肝腎虧虛', nameEn: 'Liver-kidney deficiency' },
    ]},
  { code: 'CM-MSK-005', name: '痹證', nameEn: 'Bi Syndrome', icd10: 'M79.3', cat: '骨傷科',
    zheng: [
      { code: 'Z-240', name: '行痹（風痹）', nameEn: 'Wandering bi (wind bi)' },
      { code: 'Z-241', name: '痛痹（寒痹）', nameEn: 'Painful bi (cold bi)' },
      { code: 'Z-242', name: '著痹（濕痹）', nameEn: 'Fixed bi (damp bi)' },
      { code: 'Z-243', name: '熱痹', nameEn: 'Heat bi' },
    ]},

  // ── 皮膚科 Dermatology ──
  { code: 'CM-DRM-001', name: '濕疹', nameEn: 'Eczema', icd10: 'L30.9', cat: '皮膚科',
    zheng: [
      { code: 'Z-300', name: '濕熱浸淫', nameEn: 'Damp-heat immersion' },
      { code: 'Z-301', name: '脾虛濕蘊', nameEn: 'Spleen deficiency dampness' },
      { code: 'Z-302', name: '血虛風燥', nameEn: 'Blood deficiency wind dryness' },
    ]},
  { code: 'CM-DRM-002', name: '蕁麻疹', nameEn: 'Urticaria', icd10: 'L50.9', cat: '皮膚科',
    zheng: [
      { code: 'Z-310', name: '風熱犯表', nameEn: 'Wind-heat invading exterior' },
      { code: 'Z-311', name: '風寒束表', nameEn: 'Wind-cold constraining exterior' },
      { code: 'Z-312', name: '血虛風燥', nameEn: 'Blood deficiency wind dryness' },
    ]},
  { code: 'CM-DRM-003', name: '痤瘡', nameEn: 'Acne', icd10: 'L70.9', cat: '皮膚科',
    zheng: [
      { code: 'Z-320', name: '肺經風熱', nameEn: 'Lung channel wind-heat' },
      { code: 'Z-321', name: '濕熱蘊結', nameEn: 'Damp-heat accumulation' },
      { code: 'Z-322', name: '痰瘀凝結', nameEn: 'Phlegm-stasis congealing' },
    ]},

  // ── 婦科 Gynecology ──
  { code: 'CM-GYN-001', name: '月經不調', nameEn: 'Irregular Menstruation', icd10: 'N92.6', cat: '婦科',
    zheng: [
      { code: 'Z-400', name: '氣滯血瘀', nameEn: 'Qi stagnation blood stasis' },
      { code: 'Z-401', name: '氣血虧虛', nameEn: 'Qi-blood deficiency' },
      { code: 'Z-402', name: '腎虛', nameEn: 'Kidney deficiency' },
      { code: 'Z-403', name: '肝鬱', nameEn: 'Liver depression' },
    ]},
  { code: 'CM-GYN-002', name: '痛經', nameEn: 'Dysmenorrhea', icd10: 'N94.6', cat: '婦科',
    zheng: [
      { code: 'Z-410', name: '氣滯血瘀', nameEn: 'Qi stagnation blood stasis' },
      { code: 'Z-411', name: '寒凝血瘀', nameEn: 'Cold congealing blood stasis' },
      { code: 'Z-412', name: '氣血虧虛', nameEn: 'Qi-blood deficiency' },
    ]},

  // ── 兒科 Pediatrics ──
  { code: 'CM-PED-001', name: '小兒咳嗽', nameEn: 'Pediatric Cough', icd10: 'R05', cat: '兒科',
    zheng: [
      { code: 'Z-500', name: '風寒咳嗽', nameEn: 'Wind-cold cough' },
      { code: 'Z-501', name: '風熱咳嗽', nameEn: 'Wind-heat cough' },
      { code: 'Z-502', name: '痰熱咳嗽', nameEn: 'Phlegm-heat cough' },
    ]},
  { code: 'CM-PED-002', name: '小兒食積', nameEn: 'Pediatric Food Stagnation', icd10: 'K30', cat: '兒科',
    zheng: [
      { code: 'Z-510', name: '乳食積滯', nameEn: 'Milk-food stagnation' },
      { code: 'Z-511', name: '脾虛食積', nameEn: 'Spleen deficiency food stagnation' },
    ]},

  // ── 五官科 ENT / Ophthalmology ──
  { code: 'CM-ENT-001', name: '鼻鼽（鼻敏感）', nameEn: 'Allergic Rhinitis', icd10: 'J30.4', cat: '五官科',
    zheng: [
      { code: 'Z-600', name: '肺氣虛寒', nameEn: 'Lung qi deficiency cold' },
      { code: 'Z-601', name: '脾氣虛弱', nameEn: 'Spleen qi weakness' },
      { code: 'Z-602', name: '腎陽不足', nameEn: 'Kidney yang insufficiency' },
    ]},
  { code: 'CM-ENT-002', name: '咽喉痛', nameEn: 'Sore Throat', icd10: 'J02.9', cat: '五官科',
    zheng: [
      { code: 'Z-610', name: '風熱外襲', nameEn: 'Wind-heat external attack' },
      { code: 'Z-611', name: '陰虛火旺', nameEn: 'Yin deficiency fire flaring' },
    ]},
];

// ── CM Procedure Codes ──
export const CM_PROCEDURES = [
  { code: 'CMP-001', name: '針灸', nameEn: 'Acupuncture', category: '針灸' },
  { code: 'CMP-002', name: '電針', nameEn: 'Electroacupuncture', category: '針灸' },
  { code: 'CMP-003', name: '耳針', nameEn: 'Auricular Acupuncture', category: '針灸' },
  { code: 'CMP-004', name: '頭皮針', nameEn: 'Scalp Acupuncture', category: '針灸' },
  { code: 'CMP-005', name: '推拿', nameEn: 'Tui Na (Massage)', category: '推拿' },
  { code: 'CMP-006', name: '正骨', nameEn: 'Bone Setting', category: '推拿' },
  { code: 'CMP-007', name: '拔罐', nameEn: 'Cupping', category: '外治' },
  { code: 'CMP-008', name: '刮痧', nameEn: 'Gua Sha', category: '外治' },
  { code: 'CMP-009', name: '艾灸', nameEn: 'Moxibustion', category: '外治' },
  { code: 'CMP-010', name: '天灸', nameEn: 'Tian Jiu (Herbal Plaster)', category: '外治' },
  { code: 'CMP-011', name: '放血療法', nameEn: 'Bloodletting', category: '外治' },
  { code: 'CMP-012', name: '穴位敷貼', nameEn: 'Acupoint Application', category: '外治' },
  { code: 'CMP-013', name: '中藥熏蒸', nameEn: 'Herbal Fumigation', category: '外治' },
  { code: 'CMP-014', name: '中藥外敷', nameEn: 'Herbal External Application', category: '外治' },
];

// ── Diagnosis Category Labels ──
export const DIAGNOSIS_CATEGORIES = ['內科', '骨傷科', '皮膚科', '婦科', '兒科', '五官科'];

// ── Search Functions ──
export function searchDiagnoses(query) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  return CM_DIAGNOSES.filter(d =>
    d.name.includes(query) ||
    d.nameEn.toLowerCase().includes(q) ||
    d.icd10.toLowerCase().includes(q) ||
    d.code.toLowerCase().includes(q)
  ).slice(0, 20);
}

export function searchZheng(diagCode, query) {
  const diag = CM_DIAGNOSES.find(d => d.code === diagCode);
  if (!diag) return [];
  if (!query) return diag.zheng || [];
  const q = query.toLowerCase();
  return (diag.zheng || []).filter(z =>
    z.name.includes(query) || z.nameEn.toLowerCase().includes(q)
  );
}

export function getDiagnosesByCategory(cat) {
  return CM_DIAGNOSES.filter(d => d.cat === cat);
}

export function getDiagnosisInfo(code) {
  return CM_DIAGNOSES.find(d => d.code === code);
}

export function getProcedureInfo(code) {
  return CM_PROCEDURES.find(p => p.code === code);
}

export function searchProcedures(query) {
  if (!query) return CM_PROCEDURES;
  const q = query.toLowerCase();
  return CM_PROCEDURES.filter(p =>
    p.name.includes(query) || p.nameEn.toLowerCase().includes(q)
  );
}
