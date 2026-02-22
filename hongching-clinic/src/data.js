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
};
