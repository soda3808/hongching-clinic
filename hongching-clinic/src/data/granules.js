// Concentrated Granule Medicine Database (濃縮中藥)
// Common products from 農本方 (PuraPharm/NONG'S) and 仙豐 (Sun Ten)

export const GRANULE_SUPPLIERS = [
  { id: 'nongs', name: '農本方', nameEn: "NONG'S", country: 'HK' },
  { id: 'sunten', name: '仙豐', nameEn: 'Sun Ten', country: 'TW' },
  { id: 'kaiser', name: '港香蘭', nameEn: 'Kaiser', country: 'TW' },
  { id: 'koda', name: '科達', nameEn: 'KPC', country: 'TW' },
];

// Granule type: 'single' = 單味藥 (individual herb), 'formula' = 複方 (compound formula)
export const GRANULE_PRODUCTS = [
  // ═══ 農本方 單味藥 (NONG'S Single Herbs) ═══
  { id: 'ng001', name: '黃芪', supplier: 'nongs', type: 'single', code: 'N001', unit: 'g', defaultDose: 3, maxDose: 10, price: 0.8 },
  { id: 'ng002', name: '當歸', supplier: 'nongs', type: 'single', code: 'N002', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.9 },
  { id: 'ng003', name: '川芎', supplier: 'nongs', type: 'single', code: 'N003', unit: 'g', defaultDose: 1.5, maxDose: 5, price: 0.8 },
  { id: 'ng004', name: '白芍', supplier: 'nongs', type: 'single', code: 'N004', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.7 },
  { id: 'ng005', name: '熟地黃', supplier: 'nongs', type: 'single', code: 'N005', unit: 'g', defaultDose: 3, maxDose: 8, price: 0.8 },
  { id: 'ng006', name: '生地黃', supplier: 'nongs', type: 'single', code: 'N006', unit: 'g', defaultDose: 3, maxDose: 8, price: 0.8 },
  { id: 'ng007', name: '人參', supplier: 'nongs', type: 'single', code: 'N007', unit: 'g', defaultDose: 2, maxDose: 6, price: 2.5 },
  { id: 'ng008', name: '黨參', supplier: 'nongs', type: 'single', code: 'N008', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.9 },
  { id: 'ng009', name: '白朮', supplier: 'nongs', type: 'single', code: 'N009', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.7 },
  { id: 'ng010', name: '茯苓', supplier: 'nongs', type: 'single', code: 'N010', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.6 },
  { id: 'ng011', name: '甘草', supplier: 'nongs', type: 'single', code: 'N011', unit: 'g', defaultDose: 1, maxDose: 3, price: 0.5 },
  { id: 'ng012', name: '柴胡', supplier: 'nongs', type: 'single', code: 'N012', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.8 },
  { id: 'ng013', name: '半夏', supplier: 'nongs', type: 'single', code: 'N013', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.9 },
  { id: 'ng014', name: '陳皮', supplier: 'nongs', type: 'single', code: 'N014', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.6 },
  { id: 'ng015', name: '枳殼', supplier: 'nongs', type: 'single', code: 'N015', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.7 },
  { id: 'ng016', name: '香附', supplier: 'nongs', type: 'single', code: 'N016', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.7 },
  { id: 'ng017', name: '桃仁', supplier: 'nongs', type: 'single', code: 'N017', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.8 },
  { id: 'ng018', name: '紅花', supplier: 'nongs', type: 'single', code: 'N018', unit: 'g', defaultDose: 1, maxDose: 3, price: 0.9 },
  { id: 'ng019', name: '丹參', supplier: 'nongs', type: 'single', code: 'N019', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.8 },
  { id: 'ng020', name: '三七', supplier: 'nongs', type: 'single', code: 'N020', unit: 'g', defaultDose: 1, maxDose: 3, price: 2.0 },
  { id: 'ng021', name: '枸杞子', supplier: 'nongs', type: 'single', code: 'N021', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.8 },
  { id: 'ng022', name: '菊花', supplier: 'nongs', type: 'single', code: 'N022', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.7 },
  { id: 'ng023', name: '金銀花', supplier: 'nongs', type: 'single', code: 'N023', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.9 },
  { id: 'ng024', name: '連翹', supplier: 'nongs', type: 'single', code: 'N024', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.8 },
  { id: 'ng025', name: '板藍根', supplier: 'nongs', type: 'single', code: 'N025', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.7 },
  { id: 'ng026', name: '黃芩', supplier: 'nongs', type: 'single', code: 'N026', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.7 },
  { id: 'ng027', name: '黃連', supplier: 'nongs', type: 'single', code: 'N027', unit: 'g', defaultDose: 1, maxDose: 3, price: 1.2 },
  { id: 'ng028', name: '黃柏', supplier: 'nongs', type: 'single', code: 'N028', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.8 },
  { id: 'ng029', name: '蒼朮', supplier: 'nongs', type: 'single', code: 'N029', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.7 },
  { id: 'ng030', name: '厚朴', supplier: 'nongs', type: 'single', code: 'N030', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.7 },
  { id: 'ng031', name: '山藥', supplier: 'nongs', type: 'single', code: 'N031', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.7 },
  { id: 'ng032', name: '薏苡仁', supplier: 'nongs', type: 'single', code: 'N032', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.6 },
  { id: 'ng033', name: '砂仁', supplier: 'nongs', type: 'single', code: 'N033', unit: 'g', defaultDose: 1, maxDose: 3, price: 1.5 },
  { id: 'ng034', name: '木香', supplier: 'nongs', type: 'single', code: 'N034', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.8 },
  { id: 'ng035', name: '延胡索', supplier: 'nongs', type: 'single', code: 'N035', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.9 },
  { id: 'ng036', name: '杜仲', supplier: 'nongs', type: 'single', code: 'N036', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.8 },
  { id: 'ng037', name: '續斷', supplier: 'nongs', type: 'single', code: 'N037', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.7 },
  { id: 'ng038', name: '牛膝', supplier: 'nongs', type: 'single', code: 'N038', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.7 },
  { id: 'ng039', name: '防風', supplier: 'nongs', type: 'single', code: 'N039', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.7 },
  { id: 'ng040', name: '荊芥', supplier: 'nongs', type: 'single', code: 'N040', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.6 },
  { id: 'ng041', name: '桂枝', supplier: 'nongs', type: 'single', code: 'N041', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.7 },
  { id: 'ng042', name: '麻黃', supplier: 'nongs', type: 'single', code: 'N042', unit: 'g', defaultDose: 1, maxDose: 3, price: 0.8 },
  { id: 'ng043', name: '石膏', supplier: 'nongs', type: 'single', code: 'N043', unit: 'g', defaultDose: 3, maxDose: 10, price: 0.5 },
  { id: 'ng044', name: '知母', supplier: 'nongs', type: 'single', code: 'N044', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.7 },
  { id: 'ng045', name: '天麻', supplier: 'nongs', type: 'single', code: 'N045', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 2.0 },
  { id: 'ng046', name: '鉤藤', supplier: 'nongs', type: 'single', code: 'N046', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.8 },
  { id: 'ng047', name: '葛根', supplier: 'nongs', type: 'single', code: 'N047', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.7 },
  { id: 'ng048', name: '北沙參', supplier: 'nongs', type: 'single', code: 'N048', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.9 },
  { id: 'ng049', name: '麥冬', supplier: 'nongs', type: 'single', code: 'N049', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.8 },
  { id: 'ng050', name: '五味子', supplier: 'nongs', type: 'single', code: 'N050', unit: 'g', defaultDose: 1, maxDose: 3, price: 1.0 },
  { id: 'ng051', name: '酸棗仁', supplier: 'nongs', type: 'single', code: 'N051', unit: 'g', defaultDose: 2, maxDose: 6, price: 1.2 },
  { id: 'ng052', name: '遠志', supplier: 'nongs', type: 'single', code: 'N052', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.9 },
  { id: 'ng053', name: '附子', supplier: 'nongs', type: 'single', code: 'N053', unit: 'g', defaultDose: 1, maxDose: 3, price: 1.5, toxic: true },
  { id: 'ng054', name: '肉桂', supplier: 'nongs', type: 'single', code: 'N054', unit: 'g', defaultDose: 1, maxDose: 3, price: 0.9 },
  { id: 'ng055', name: '乾薑', supplier: 'nongs', type: 'single', code: 'N055', unit: 'g', defaultDose: 1, maxDose: 3, price: 0.6 },
  { id: 'ng056', name: '大黃', supplier: 'nongs', type: 'single', code: 'N056', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.7 },
  { id: 'ng057', name: '細辛', supplier: 'nongs', type: 'single', code: 'N057', unit: 'g', defaultDose: 0.5, maxDose: 1.5, price: 1.2, toxic: true },
  { id: 'ng058', name: '薄荷', supplier: 'nongs', type: 'single', code: 'N058', unit: 'g', defaultDose: 1, maxDose: 3, price: 0.6 },
  { id: 'ng059', name: '藿香', supplier: 'nongs', type: 'single', code: 'N059', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.7 },
  { id: 'ng060', name: '澤瀉', supplier: 'nongs', type: 'single', code: 'N060', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.7 },
  { id: 'ng061', name: '車前子', supplier: 'nongs', type: 'single', code: 'N061', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.6 },
  { id: 'ng062', name: '益母草', supplier: 'nongs', type: 'single', code: 'N062', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.7 },
  { id: 'ng063', name: '何首烏', supplier: 'nongs', type: 'single', code: 'N063', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.9 },
  { id: 'ng064', name: '白芷', supplier: 'nongs', type: 'single', code: 'N064', unit: 'g', defaultDose: 1.5, maxDose: 4, price: 0.7 },
  { id: 'ng065', name: '龍骨', supplier: 'nongs', type: 'single', code: 'N065', unit: 'g', defaultDose: 3, maxDose: 8, price: 0.6 },
  { id: 'ng066', name: '牡蠣', supplier: 'nongs', type: 'single', code: 'N066', unit: 'g', defaultDose: 3, maxDose: 8, price: 0.5 },
  { id: 'ng067', name: '阿膠', supplier: 'nongs', type: 'single', code: 'N067', unit: 'g', defaultDose: 2, maxDose: 5, price: 3.0 },
  { id: 'ng068', name: '雞血藤', supplier: 'nongs', type: 'single', code: 'N068', unit: 'g', defaultDose: 2, maxDose: 6, price: 0.7 },
  { id: 'ng069', name: '山楂', supplier: 'nongs', type: 'single', code: 'N069', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.6 },
  { id: 'ng070', name: '神曲', supplier: 'nongs', type: 'single', code: 'N070', unit: 'g', defaultDose: 2, maxDose: 5, price: 0.6 },

  // ═══ 農本方 複方 (NONG'S Compound Formulas) ═══
  { id: 'nf001', name: '四物湯', supplier: 'nongs', type: 'formula', code: 'NF001', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf002', name: '四君子湯', supplier: 'nongs', type: 'formula', code: 'NF002', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf003', name: '六味地黃丸', supplier: 'nongs', type: 'formula', code: 'NF003', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.3 },
  { id: 'nf004', name: '逍遙散', supplier: 'nongs', type: 'formula', code: 'NF004', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf005', name: '補中益氣湯', supplier: 'nongs', type: 'formula', code: 'NF005', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.3 },
  { id: 'nf006', name: '歸脾湯', supplier: 'nongs', type: 'formula', code: 'NF006', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.3 },
  { id: 'nf007', name: '小柴胡湯', supplier: 'nongs', type: 'formula', code: 'NF007', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf008', name: '桂枝湯', supplier: 'nongs', type: 'formula', code: 'NF008', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.1 },
  { id: 'nf009', name: '銀翹散', supplier: 'nongs', type: 'formula', code: 'NF009', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf010', name: '天王補心丹', supplier: 'nongs', type: 'formula', code: 'NF010', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.4 },
  { id: 'nf011', name: '血府逐瘀湯', supplier: 'nongs', type: 'formula', code: 'NF011', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.3 },
  { id: 'nf012', name: '溫膽湯', supplier: 'nongs', type: 'formula', code: 'NF012', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf013', name: '二陳湯', supplier: 'nongs', type: 'formula', code: 'NF013', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.1 },
  { id: 'nf014', name: '獨活寄生湯', supplier: 'nongs', type: 'formula', code: 'NF014', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.3 },
  { id: 'nf015', name: '麻黃湯', supplier: 'nongs', type: 'formula', code: 'NF015', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.1 },
  { id: 'nf016', name: '理中丸', supplier: 'nongs', type: 'formula', code: 'NF016', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf017', name: '五苓散', supplier: 'nongs', type: 'formula', code: 'NF017', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.1 },
  { id: 'nf018', name: '保和丸', supplier: 'nongs', type: 'formula', code: 'NF018', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.1 },
  { id: 'nf019', name: '藿香正氣散', supplier: 'nongs', type: 'formula', code: 'NF019', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf020', name: '平胃散', supplier: 'nongs', type: 'formula', code: 'NF020', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.1 },
  { id: 'nf021', name: '白虎湯', supplier: 'nongs', type: 'formula', code: 'NF021', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.1 },
  { id: 'nf022', name: '生脈散', supplier: 'nongs', type: 'formula', code: 'NF022', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.3 },
  { id: 'nf023', name: '參苓白朮散', supplier: 'nongs', type: 'formula', code: 'NF023', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf024', name: '玉屏風散', supplier: 'nongs', type: 'formula', code: 'NF024', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf025', name: '當歸補血湯', supplier: 'nongs', type: 'formula', code: 'NF025', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf026', name: '腎氣丸', supplier: 'nongs', type: 'formula', code: 'NF026', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.4 },
  { id: 'nf027', name: '酸棗仁湯', supplier: 'nongs', type: 'formula', code: 'NF027', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.3 },
  { id: 'nf028', name: '龍膽瀉肝湯', supplier: 'nongs', type: 'formula', code: 'NF028', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf029', name: '半夏瀉心湯', supplier: 'nongs', type: 'formula', code: 'NF029', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf030', name: '黃連解毒湯', supplier: 'nongs', type: 'formula', code: 'NF030', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf031', name: '大承氣湯', supplier: 'nongs', type: 'formula', code: 'NF031', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.1 },
  { id: 'nf032', name: '桃核承氣湯', supplier: 'nongs', type: 'formula', code: 'NF032', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf033', name: '小建中湯', supplier: 'nongs', type: 'formula', code: 'NF033', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf034', name: '四逆湯', supplier: 'nongs', type: 'formula', code: 'NF034', unit: 'g', defaultDose: 4, maxDose: 8, price: 1.3 },
  { id: 'nf035', name: '真武湯', supplier: 'nongs', type: 'formula', code: 'NF035', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.3 },
  { id: 'nf036', name: '消風散', supplier: 'nongs', type: 'formula', code: 'NF036', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf037', name: '天麻鉤藤飲', supplier: 'nongs', type: 'formula', code: 'NF037', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.4 },
  { id: 'nf038', name: '川芎茶調散', supplier: 'nongs', type: 'formula', code: 'NF038', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.1 },
  { id: 'nf039', name: '生化湯', supplier: 'nongs', type: 'formula', code: 'NF039', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.2 },
  { id: 'nf040', name: '止嗽散', supplier: 'nongs', type: 'formula', code: 'NF040', unit: 'g', defaultDose: 6, maxDose: 12, price: 1.1 },
];

// Granule dosage conversion: decoction → granule ratio (typically 1:5 to 1:7)
export const DECOCTION_TO_GRANULE_RATIO = 5; // e.g., 10g decoction ≈ 2g granule

export function convertToGranule(decoctionGrams) {
  return Math.round((decoctionGrams / DECOCTION_TO_GRANULE_RATIO) * 10) / 10;
}

export function convertToDecoction(granuleGrams) {
  return Math.round(granuleGrams * DECOCTION_TO_GRANULE_RATIO * 10) / 10;
}

export function searchGranules(query, supplier = 'all') {
  const q = query.toLowerCase();
  return GRANULE_PRODUCTS.filter(p =>
    (supplier === 'all' || p.supplier === supplier) &&
    (p.name.includes(q) || p.code.toLowerCase().includes(q))
  );
}

export function getGranulesByType(type, supplier = 'all') {
  return GRANULE_PRODUCTS.filter(p =>
    p.type === type && (supplier === 'all' || p.supplier === supplier)
  );
}
