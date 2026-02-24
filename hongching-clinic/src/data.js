// ══════════════════════════════════
// Utilities & Seed Data
// ══════════════════════════════════

export const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

export const fmt = (n) => Math.round(n).toLocaleString('en-HK');
export const fmtM = (n) => `$${fmt(n)}`;
export const getMonth = (d) => d ? String(d).substring(0, 7) : '';
export const monthLabel = (m) => {
  if (!m) return '';
  const [y, mo] = m.split('-');
  const names = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[+mo]} ${y}`;
};

// ── Linear Regression (for revenue forecast) ──
export function linearRegression(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// ── Membership Tiers ──
export const MEMBERSHIP_TIERS = [
  { name: '普通', minSpent: 0, discount: 0, color: '#888', bg: '#f5f5f5' },
  { name: '銅卡', minSpent: 3000, discount: 0.05, color: '#CD7F32', bg: '#FFF8F0' },
  { name: '銀卡', minSpent: 8000, discount: 0.10, color: '#A0A0A0', bg: '#F8F8F8' },
  { name: '金卡', minSpent: 20000, discount: 0.15, color: '#DAA520', bg: '#FFFDF0' },
];

export function getMembershipTier(totalSpent) {
  let tier = MEMBERSHIP_TIERS[0];
  for (const t of MEMBERSHIP_TIERS) {
    if (totalSpent >= t.minSpent) tier = t;
  }
  return tier;
}

// ── TCM Herbs Database ──
export const TCM_HERBS = [
  '黃芪','當歸','川芎','白芍','熟地','生地','人參','黨參','白朮','茯苓',
  '甘草','柴胡','半夏','陳皮','枳殼','香附','桃仁','紅花','丹參','三七',
  '枸杞子','菊花','金銀花','連翹','板藍根','黃芩','黃連','黃柏','蒼朮','厚朴',
  '山藥','蓮子','薏苡仁','砂仁','木香','延胡索','杜仲','續斷','牛膝','獨活',
  '羌活','防風','荊芥','桂枝','麻黃','石膏','知母','天麻','鉤藤','葛根',
  '北沙參','麥冬','玉竹','百合','五味子','酸棗仁','遠志','龍骨','牡蠣','珍珠母',
  '附子','肉桂','乾薑','吳茱萸','小茴香','丁香','艾葉','益母草','澤瀉','車前子',
  '大黃','芒硝','火麻仁','肉蓯蓉','何首烏','阿膠','雞血藤','白芷','細辛','蒼耳子',
];

// ── TCM Formula Templates ──
export const TCM_FORMULAS = [
  { name: '四物湯', herbs: [{herb:'熟地',dosage:'12g'},{herb:'當歸',dosage:'10g'},{herb:'白芍',dosage:'10g'},{herb:'川芎',dosage:'6g'}], indication: '血虛、月經不調' },
  { name: '四君子湯', herbs: [{herb:'人參',dosage:'10g'},{herb:'白朮',dosage:'10g'},{herb:'茯苓',dosage:'10g'},{herb:'甘草',dosage:'5g'}], indication: '脾胃氣虛' },
  { name: '六味地黃丸', herbs: [{herb:'熟地',dosage:'24g'},{herb:'山藥',dosage:'12g'},{herb:'茯苓',dosage:'9g'},{herb:'澤瀉',dosage:'9g'},{herb:'牛膝',dosage:'9g'},{herb:'枸杞子',dosage:'9g'}], indication: '腎陰虛' },
  { name: '補陽還五湯', herbs: [{herb:'黃芪',dosage:'120g'},{herb:'當歸',dosage:'6g'},{herb:'川芎',dosage:'4.5g'},{herb:'桃仁',dosage:'3g'},{herb:'紅花',dosage:'3g'},{herb:'白芍',dosage:'4.5g'},{herb:'生地',dosage:'3g'}], indication: '中風後遺症、氣虛血瘀' },
  { name: '逍遙散', herbs: [{herb:'柴胡',dosage:'10g'},{herb:'當歸',dosage:'10g'},{herb:'白芍',dosage:'10g'},{herb:'白朮',dosage:'10g'},{herb:'茯苓',dosage:'10g'},{herb:'甘草',dosage:'5g'},{herb:'生地',dosage:'6g'},{herb:'薏苡仁',dosage:'6g'}], indication: '肝鬱脾虛' },
  { name: '小柴胡湯', herbs: [{herb:'柴胡',dosage:'12g'},{herb:'黃芩',dosage:'9g'},{herb:'半夏',dosage:'9g'},{herb:'人參',dosage:'6g'},{herb:'甘草',dosage:'5g'},{herb:'生地',dosage:'3g'},{herb:'大黃',dosage:'3g'}], indication: '少陽病、寒熱往來' },
  { name: '桂枝湯', herbs: [{herb:'桂枝',dosage:'9g'},{herb:'白芍',dosage:'9g'},{herb:'甘草',dosage:'6g'},{herb:'生地',dosage:'3g'},{herb:'大黃',dosage:'3g'}], indication: '太陽中風' },
  { name: '麻黃湯', herbs: [{herb:'麻黃',dosage:'6g'},{herb:'桂枝',dosage:'4g'},{herb:'甘草',dosage:'3g'},{herb:'杏仁',dosage:'9g'}], indication: '太陽傷寒' },
  { name: '銀翹散', herbs: [{herb:'金銀花',dosage:'15g'},{herb:'連翹',dosage:'15g'},{herb:'荊芥',dosage:'6g'},{herb:'薏苡仁',dosage:'6g'},{herb:'甘草',dosage:'5g'},{herb:'桔梗',dosage:'6g'}], indication: '風熱感冒' },
  { name: '天王補心丹', herbs: [{herb:'人參',dosage:'10g'},{herb:'麥冬',dosage:'10g'},{herb:'五味子',dosage:'6g'},{herb:'當歸',dosage:'10g'},{herb:'生地',dosage:'15g'},{herb:'酸棗仁',dosage:'10g'},{herb:'遠志',dosage:'6g'}], indication: '心陰不足、失眠多夢' },
  { name: '歸脾湯', herbs: [{herb:'黨參',dosage:'12g'},{herb:'黃芪',dosage:'12g'},{herb:'白朮',dosage:'10g'},{herb:'當歸',dosage:'10g'},{herb:'茯苓',dosage:'10g'},{herb:'龍骨',dosage:'10g'},{herb:'酸棗仁',dosage:'10g'},{herb:'遠志',dosage:'6g'},{herb:'甘草',dosage:'5g'}], indication: '心脾兩虛' },
  { name: '獨活寄生湯', herbs: [{herb:'獨活',dosage:'9g'},{herb:'桑寄生',dosage:'12g'},{herb:'杜仲',dosage:'10g'},{herb:'牛膝',dosage:'10g'},{herb:'當歸',dosage:'10g'},{herb:'川芎',dosage:'6g'},{herb:'白芍',dosage:'10g'},{herb:'熟地',dosage:'12g'},{herb:'人參',dosage:'6g'},{herb:'茯苓',dosage:'10g'},{herb:'甘草',dosage:'5g'},{herb:'桂枝',dosage:'6g'},{herb:'防風',dosage:'6g'},{herb:'細辛',dosage:'3g'},{herb:'秦艽',dosage:'10g'}], indication: '風寒濕痹、腰膝痠痛' },
  { name: '血府逐瘀湯', herbs: [{herb:'桃仁',dosage:'12g'},{herb:'紅花',dosage:'9g'},{herb:'當歸',dosage:'9g'},{herb:'川芎',dosage:'4.5g'},{herb:'白芍',dosage:'6g'},{herb:'生地',dosage:'9g'},{herb:'柴胡',dosage:'3g'},{herb:'枳殼',dosage:'6g'},{herb:'甘草',dosage:'3g'},{herb:'桔梗',dosage:'4.5g'},{herb:'牛膝',dosage:'9g'}], indication: '胸中血瘀' },
  { name: '溫膽湯', herbs: [{herb:'半夏',dosage:'6g'},{herb:'陳皮',dosage:'9g'},{herb:'茯苓',dosage:'6g'},{herb:'甘草',dosage:'3g'},{herb:'枳殼',dosage:'6g'},{herb:'竹茹',dosage:'6g'}], indication: '痰熱擾心' },
  { name: '二陳湯', herbs: [{herb:'半夏',dosage:'10g'},{herb:'陳皮',dosage:'10g'},{herb:'茯苓',dosage:'10g'},{herb:'甘草',dosage:'5g'}], indication: '濕痰咳嗽' },
  { name: '補中益氣湯', herbs: [{herb:'黃芪',dosage:'15g'},{herb:'人參',dosage:'10g'},{herb:'白朮',dosage:'10g'},{herb:'當歸',dosage:'10g'},{herb:'陳皮',dosage:'6g'},{herb:'柴胡',dosage:'6g'},{herb:'甘草',dosage:'5g'}], indication: '中氣下陷' },
];

// ── TCM Treatment Types ──
export const TCM_TREATMENTS = ['內服中藥','針灸','推拿','天灸','拔罐','刮痧','艾灸','耳穴','其他'];

// ── Common Acupuncture Points ──
export const ACUPOINTS = [
  '合谷','足三里','三陰交','太衝','內關','外關','曲池','肩井','風池','百會',
  '大椎','命門','腎俞','肝俞','脾俞','肺俞','心俞','委中','環跳','陽陵泉',
  '陰陵泉','太溪','崑崙','中脘','關元','氣海','神闕','天樞','血海','膈俞',
];

export const EXPENSE_CATEGORIES = {
  '固定成本': ['租金', '管理費', '保險', '牌照/註冊'],
  '人事成本': ['人工', 'MPF', '勞保', '培訓'],
  '營運成本': ['藥材/耗材', '電費', '水費', '電話/網絡', '醫療器材', '電腦/軟件'],
  '行政雜費': ['日常雜費', '文具/印刷', '交通', '飲食招待', '清潔'],
  '資本開支': ['裝修工程', '傢俬/設備', '按金/訂金'],
  '市場推廣': ['廣告/宣傳', '推廣活動'],
  '其他': ['其他'],
};

export const ALL_CATEGORIES = Object.values(EXPENSE_CATEGORIES).flat();

export const EMPLOYEES = [
  { id: 'hui', name: '許植輝', pos: '註冊中醫師', type: 'monthly', rate: 33000, start: '2026-02-01',
    comm: { tiers: [
      { min: 0, max: 100000, r: 0.02 },
      { min: 100000, max: 150000, r: 0.05 },
      { min: 150000, max: 250000, r: 0.15 },
      { min: 250000, max: 400000, r: 0.30 },
    ]}
  },
  { id: 'tsang', name: '曾其方', pos: '兼職中醫師', type: 'daily', rate: 1000, start: '', comm: null },
  { id: 'tam', name: '譚玉冰', pos: '診所助理', type: 'monthly', rate: 10000, start: '', comm: null },
  { id: 'cheung', name: '常凱晴', pos: '負責人/中醫師', type: 'monthly', rate: 25000, start: '', comm: null },
];

export const DOCTORS = ['常凱晴', '許植輝', '曾其方'];

// ── Clinic Pricing (for AI chatbot) ──
export const CLINIC_PRICING = {
  '初診': { price: 450, desc: '首次診症（含診金+藥費）' },
  '覆診': { price: 350, desc: '覆診（含診金+藥費）' },
  '針灸': { price: 450, desc: '針灸治療' },
  '推拿': { price: 350, desc: '推拿治療' },
  '天灸': { price: 388, desc: '天灸貼藥' },
  '拔罐': { price: 250, desc: '拔罐治療' },
  '刮痧': { price: 300, desc: '刮痧治療' },
  '針灸+推拿': { price: 650, desc: '針灸加推拿套餐' },
};

export const SEED_DATA = {
  revenue: [
    { id:'s11a', date:'2025-11-01', name:'(11月匯總)', item:'11月診症', amount:72389, payment:'混合', store:'宋皇臺', doctor:'常凱晴', note:'TKW 11月總營業額' },
    { id:'d1218a', date:'2025-12-18', name:'烏若汝', item:'天灸', amount:388, payment:'FPS', store:'宋皇臺', doctor:'常凱晴', note:'' },
    { id:'d1218b', date:'2025-12-18', name:'李雪儀', item:'天灸', amount:388, payment:'FPS', store:'宋皇臺', doctor:'常凱晴', note:'' },
    { id:'d1218c', date:'2025-12-18', name:'麥翊迪', item:'90x4', amount:360, payment:'AlipayHK', store:'宋皇臺', doctor:'常凱晴', note:'' },
    { id:'d1218d', date:'2025-12-18', name:'紀翊聲', item:'90x14', amount:1260, payment:'FPS', store:'宋皇臺', doctor:'常凱晴', note:'' },
    { id:'d12bal', date:'2025-12-15', name:'(12月上半+其他)', item:'12月1-17日', amount:25118, payment:'混合', store:'宋皇臺', doctor:'常凱晴', note:'PDF差額補回' },
    { id:'s01a', date:'2026-01-15', name:'(1月匯總)', item:'1月診症', amount:31324, payment:'混合', store:'宋皇臺', doctor:'許植輝', note:'TKW 1月' },
    { id:'s02a', date:'2026-02-10', name:'(2月匯總至19日)', item:'2月診症', amount:33291, payment:'混合', store:'宋皇臺', doctor:'許植輝', note:'TKW 2月前19日' },
    { id:'p01a', date:'2026-01-15', name:'(太子1月匯總)', item:'1月診症', amount:20950, payment:'混合', store:'太子', doctor:'常凱晴', note:'PE 1月' },
    { id:'p02a', date:'2026-02-10', name:'(太子2月匯總至19日)', item:'2月診症', amount:63928, payment:'混合', store:'太子', doctor:'常凱晴', note:'PE 2月前19日' },
  ],
  expenses: [
    { id:'e_r11', date:'2025-11-01', merchant:'業主', amount:16500, category:'租金', store:'宋皇臺', payment:'轉帳', desc:'11月租金', receipt:'' },
    { id:'e_r12', date:'2025-12-01', merchant:'業主', amount:16500, category:'租金', store:'宋皇臺', payment:'轉帳', desc:'12月租金', receipt:'' },
    { id:'e_r01', date:'2026-01-01', merchant:'業主', amount:16500, category:'租金', store:'宋皇臺', payment:'轉帳', desc:'1月租金', receipt:'' },
    { id:'e_r02', date:'2026-02-01', merchant:'業主', amount:16500, category:'租金', store:'宋皇臺', payment:'轉帳', desc:'2月租金', receipt:'' },
    { id:'e_rp01', date:'2026-01-01', merchant:'業主', amount:20000, category:'租金', store:'太子', payment:'轉帳', desc:'1月租金', receipt:'' },
    { id:'e_rp02', date:'2026-02-01', merchant:'業主', amount:20000, category:'租金', store:'太子', payment:'轉帳', desc:'2月租金', receipt:'' },
    { id:'e_ck11', date:'2025-11-30', merchant:'常凱晴', amount:25000, category:'人工', store:'宋皇臺', payment:'轉帳', desc:'11月底薪', receipt:'' },
    { id:'e_ck12', date:'2025-12-31', merchant:'常凱晴', amount:25000, category:'人工', store:'宋皇臺', payment:'轉帳', desc:'12月底薪', receipt:'' },
    { id:'e_ck01', date:'2026-01-31', merchant:'常凱晴', amount:25000, category:'人工', store:'太子', payment:'轉帳', desc:'1月底薪', receipt:'' },
    { id:'e_ck02', date:'2026-02-28', merchant:'常凱晴', amount:25000, category:'人工', store:'太子', payment:'轉帳', desc:'2月底薪', receipt:'' },
    { id:'e_tam11', date:'2025-11-30', merchant:'譚玉冰', amount:10000, category:'人工', store:'宋皇臺', payment:'轉帳', desc:'11月薪金', receipt:'' },
    { id:'e_tam12', date:'2025-12-31', merchant:'譚玉冰', amount:10000, category:'人工', store:'宋皇臺', payment:'轉帳', desc:'12月薪金', receipt:'' },
    { id:'e_tam01', date:'2026-01-31', merchant:'譚玉冰', amount:10000, category:'人工', store:'兩店共用', payment:'轉帳', desc:'1月薪金', receipt:'' },
    { id:'e_tam02', date:'2026-02-28', merchant:'譚玉冰', amount:10000, category:'人工', store:'兩店共用', payment:'轉帳', desc:'2月薪金', receipt:'' },
    { id:'e_yu11', date:'2025-11-30', merchant:'余耀安', amount:16000, category:'人工', store:'宋皇臺', payment:'轉帳', desc:'11月薪金', receipt:'' },
    { id:'e_yu12', date:'2025-12-31', merchant:'余耀安', amount:3348, category:'人工', store:'宋皇臺', payment:'轉帳', desc:'12月薪金(部分月)', receipt:'' },
    { id:'e_ch11', date:'2025-11-30', merchant:'張泳怡', amount:5000, category:'人工', store:'宋皇臺', payment:'轉帳', desc:'11月薪金', receipt:'' },
    { id:'e_ch12', date:'2025-12-31', merchant:'張泳怡', amount:1652, category:'人工', store:'宋皇臺', payment:'轉帳', desc:'12月薪金', receipt:'' },
    { id:'e_hui01', date:'2026-01-31', merchant:'許植輝', amount:13200, category:'人工', store:'宋皇臺', payment:'轉帳', desc:'1月(自僱$1,100/日x12天)', receipt:'' },
    { id:'e_hui02', date:'2026-02-28', merchant:'許植輝', amount:33000, category:'人工', store:'宋皇臺', payment:'轉帳', desc:'2月底薪$33K', receipt:'' },
    { id:'e_ts01', date:'2026-01-31', merchant:'曾其方', amount:6202, category:'人工', store:'兩店共用', payment:'轉帳', desc:'1月兼職', receipt:'' },
    { id:'e_ts02', date:'2026-02-28', merchant:'曾其方', amount:3900, category:'人工', store:'兩店共用', payment:'轉帳', desc:'2月兼職', receipt:'' },
    { id:'e_chiu01', date:'2026-01-31', merchant:'趙穎欣', amount:7200, category:'人工', store:'兩店共用', payment:'轉帳', desc:'1月助理$60/hr', receipt:'' },
    { id:'e_mpf11', date:'2025-11-30', merchant:'MPF受託人', amount:2800, category:'MPF', store:'兩店共用', payment:'轉帳', desc:'11月僱主供款', receipt:'' },
    { id:'e_mpf12', date:'2025-12-31', merchant:'MPF受託人', amount:2000, category:'MPF', store:'兩店共用', payment:'轉帳', desc:'12月僱主供款', receipt:'' },
    { id:'e_mpf01', date:'2026-01-31', merchant:'MPF受託人', amount:1500, category:'MPF', store:'兩店共用', payment:'轉帳', desc:'1月僱主供款', receipt:'' },
    { id:'e_mpf02', date:'2026-02-28', merchant:'MPF受託人', amount:1500, category:'MPF', store:'兩店共用', payment:'轉帳', desc:'2月僱主供款', receipt:'' },
    { id:'e_herb11', date:'2025-11-30', merchant:'百子櫃', amount:217, category:'藥材/耗材', store:'宋皇臺', payment:'轉帳', desc:'11月中藥', receipt:'' },
    { id:'e_herb12', date:'2025-12-31', merchant:'百子櫃', amount:1605, category:'藥材/耗材', store:'宋皇臺', payment:'轉帳', desc:'12月中藥', receipt:'' },
    { id:'e_herb01', date:'2026-01-31', merchant:'百子櫃', amount:1303, category:'藥材/耗材', store:'宋皇臺', payment:'轉帳', desc:'1月中藥', receipt:'' },
    { id:'e_clp', date:'2025-12-24', merchant:'CLP中電', amount:479, category:'電費', store:'宋皇臺', payment:'轉帳', desc:'電費', receipt:'' },
    { id:'e_water', date:'2025-12-18', merchant:'水務署', amount:108.70, category:'水費', store:'宋皇臺', payment:'支票', desc:'水費', receipt:'' },
    { id:'e_trans', date:'2025-12-07', merchant:'揚邦中港運輸', amount:250, category:'裝修工程', store:'宋皇臺', payment:'現金', desc:'地板運送', receipt:'' },
    { id:'e_food1', date:'2025-12-06', merchant:'紅運餐廳', amount:163, category:'飲食招待', store:'兩店共用', payment:'現金', desc:'外賣', receipt:'' },
    { id:'e_octo', date:'2025-12-04', merchant:'港鐵', amount:500, category:'交通', store:'兩店共用', payment:'現金', desc:'八達通增值', receipt:'' },
    { id:'e_hw1', date:'2025-12-06', merchant:'永勝五金', amount:139, category:'日常雜費', store:'宋皇臺', payment:'現金', desc:'五金雜項', receipt:'' },
    { id:'e_sand', date:'2025-12-05', merchant:'建材店', amount:8, category:'裝修工程', store:'宋皇臺', payment:'現金', desc:'包裝沙', receipt:'' },
    { id:'e_hw2', date:'2025-12-05', merchant:'永勝五金', amount:27, category:'日常雜費', store:'宋皇臺', payment:'現金', desc:'五金', receipt:'' },
    { id:'e_hw3', date:'2025-12-05', merchant:'永勝五金', amount:66, category:'日常雜費', store:'宋皇臺', payment:'現金', desc:'五金', receipt:'' },
    { id:'e_used', date:'2025-12-24', merchant:'二手特區', amount:2400, category:'傢俬/設備', store:'宋皇臺', payment:'現金', desc:'二手電器3件', receipt:'' },
    { id:'e_food2', date:'2025-12-24', merchant:'愛文生飯店', amount:380, category:'飲食招待', store:'兩店共用', payment:'其他', desc:'聖誕晚餐', receipt:'' },
  ],
  arap: [],
  patients: [
    { id:'pt1', name:'陳大文', phone:'91234567', gender:'男', dob:'1975-03-15', address:'九龍城', allergies:'無', notes:'腰痛舊患', firstVisit:'2025-11-05', lastVisit:'2026-02-10', totalVisits:8, totalSpent:3200, store:'宋皇臺', doctor:'常凱晴', status:'active', createdAt:'2025-11-05' },
    { id:'pt2', name:'李美玲', phone:'92345678', gender:'女', dob:'1988-07-22', address:'紅磡', allergies:'青霉素', notes:'偏頭痛', firstVisit:'2025-12-01', lastVisit:'2026-02-15', totalVisits:5, totalSpent:2100, store:'宋皇臺', doctor:'許植輝', status:'active', createdAt:'2025-12-01' },
    { id:'pt3', name:'王志明', phone:'93456789', gender:'男', dob:'1962-11-08', address:'太子', allergies:'無', notes:'高血壓 糖尿病', firstVisit:'2026-01-10', lastVisit:'2026-02-18', totalVisits:4, totalSpent:1800, store:'太子', doctor:'常凱晴', status:'active', createdAt:'2026-01-10' },
    { id:'pt4', name:'張小燕', phone:'94567890', gender:'女', dob:'1995-01-30', address:'旺角', allergies:'無', notes:'濕疹', firstVisit:'2026-01-20', lastVisit:'2026-02-05', totalVisits:3, totalSpent:1350, store:'太子', doctor:'曾其方', status:'active', createdAt:'2026-01-20' },
    { id:'pt5', name:'烏若汝', phone:'95678901', gender:'女', dob:'1980-05-12', address:'土瓜灣', allergies:'無', notes:'天灸療程', firstVisit:'2025-12-18', lastVisit:'2025-12-18', totalVisits:1, totalSpent:388, store:'宋皇臺', doctor:'常凱晴', status:'inactive', createdAt:'2025-12-18' },
  ],
  bookings: [
    { id:'bk1', patientName:'陳大文', patientPhone:'91234567', date:'2026-02-24', time:'10:00', duration:30, doctor:'常凱晴', store:'宋皇臺', type:'覆診', status:'confirmed', notes:'腰痛跟進', createdAt:'2026-02-20' },
    { id:'bk2', patientName:'李美玲', patientPhone:'92345678', date:'2026-02-24', time:'14:30', duration:30, doctor:'許植輝', store:'宋皇臺', type:'針灸', status:'confirmed', notes:'', createdAt:'2026-02-21' },
    { id:'bk3', patientName:'王志明', patientPhone:'93456789', date:'2026-02-25', time:'11:00', duration:30, doctor:'常凱晴', store:'太子', type:'覆診', status:'confirmed', notes:'血壓跟進', createdAt:'2026-02-21' },
  ],
  payslips: [],
  consultations: [],
  packages: [],
  enrollments: [],
  conversations: [],
  inventory: [],
};
