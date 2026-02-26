// =============================================================================
// 中藥安全檢查系統 — TCM Herb Safety Checking System
// =============================================================================
// Covers:
//   1. 十八反 (18 Incompatibilities)
//   2. 十九畏 (19 Mutual Fears)
//   3. G6PD Contraindications
//   4. Schedule 1 Toxic Herbs (HK CMCHK 附表一)
//   5. Pregnancy Contraindications (3-Tier)
//   6. Dosage Limit Checking (Pharmacopoeia-based)
// =============================================================================

// ---------------------------------------------------------------------------
// 1. 十八反 — Herbs that must NOT be combined (DANGER level)
// ---------------------------------------------------------------------------
const INCOMPATIBLE_PAIRS = [
  // 甘草反 (Licorice incompatibilities)
  ['甘草', '海藻'], ['甘草', '大戟'], ['甘草', '甘遂'], ['甘草', '芫花'],
  // 烏頭反 (Aconite incompatibilities)
  ['川烏', '半夏'], ['川烏', '瓜蔞'], ['川烏', '貝母'], ['川烏', '白蘞'], ['川烏', '白及'],
  ['草烏', '半夏'], ['草烏', '瓜蔞'], ['草烏', '貝母'], ['草烏', '白蘞'], ['草烏', '白及'],
  ['附子', '半夏'], ['附子', '瓜蔞'], ['附子', '貝母'], ['附子', '白蘞'], ['附子', '白及'],
  // 藜蘆反 (Veratrum incompatibilities)
  ['藜蘆', '人參'], ['藜蘆', '黨參'], ['藜蘆', '沙參'], ['藜蘆', '丹參'],
  ['藜蘆', '玄參'], ['藜蘆', '細辛'], ['藜蘆', '芍藥'], ['藜蘆', '白芍'],
];

// ---------------------------------------------------------------------------
// 2. 十九畏 — Herbs that should be used cautiously together (WARNING level)
// ---------------------------------------------------------------------------
const CAUTION_PAIRS = [
  ['硫黃', '朴硝'], ['水銀', '砒霜'], ['狼毒', '密陀僧'],
  ['巴豆', '牽牛子'], ['丁香', '鬱金'], ['牙硝', '三稜'],
  ['川烏', '犀角'], ['草烏', '犀角'], ['人參', '五靈脂'],
  ['官桂', '赤石脂'], ['肉桂', '赤石脂'],
];

// ---------------------------------------------------------------------------
// 3. G6PD Contraindications
// ---------------------------------------------------------------------------
// level 2 = Forbidden (禁用), level 1 = Caution (慎用)
const G6PD_HERBS = {
  // Forbidden — strong oxidative stress risk
  '金銀花': { level: 2, note: 'G6PD 禁用：可誘發溶血' },
  '薄荷':   { level: 2, note: 'G6PD 禁用：含薄荷醇，可誘發溶血' },
  '牛黃':   { level: 2, note: 'G6PD 禁用：可誘發溶血' },
  '珍珠末': { level: 2, note: 'G6PD 禁用：可誘發溶血' },
  '臘梅花': { level: 2, note: 'G6PD 禁用：可誘發溶血' },
  '川蓮':   { level: 2, note: 'G6PD 禁用：可誘發溶血' },
  // Caution — moderate oxidative stress risk
  '黃連':   { level: 1, note: 'G6PD 慎用：含小檗鹼，有溶血風險' },
  '黃芩':   { level: 1, note: 'G6PD 慎用：含黃芩苷，有溶血風險' },
  '黃柏':   { level: 1, note: 'G6PD 慎用：含小檗鹼，有溶血風險' },
  '大黃':   { level: 1, note: 'G6PD 慎用：含蒽醌類，有溶血風險' },
  '蒲公英': { level: 1, note: 'G6PD 慎用：有溶血風險' },
  '板藍根': { level: 1, note: 'G6PD 慎用：有溶血風險' },
  '連翹':   { level: 1, note: 'G6PD 慎用：有溶血風險' },
  '梔子':   { level: 1, note: 'G6PD 慎用：含梔子苷，有溶血風險' },
  '苦參':   { level: 1, note: 'G6PD 慎用：有溶血風險' },
  '龍膽':   { level: 1, note: 'G6PD 慎用：有溶血風險' },
  '魚腥草': { level: 1, note: 'G6PD 慎用：有溶血風險' },
  '野菊花': { level: 1, note: 'G6PD 慎用：有溶血風險' },
};

// ---------------------------------------------------------------------------
// 4. Schedule 1 Toxic Herbs — HK CMCHK 附表一 (31 controlled herbs)
// ---------------------------------------------------------------------------
const SCHEDULE_1_HERBS = new Map([
  ['川烏',       { toxicity: '大毒', note: '需先煎 1-2 小時' }],
  ['草烏',       { toxicity: '大毒', note: '需先煎 1-2 小時' }],
  ['附子(生)',   { toxicity: '大毒', note: '生附子，需先煎 1-2 小時' }],
  ['馬錢子',     { toxicity: '大毒', note: '有劇毒，內服須炮製' }],
  ['生半夏',     { toxicity: '有毒', note: '需炮製後用' }],
  ['生天南星',   { toxicity: '有毒', note: '需炮製後用' }],
  ['生甘遂',     { toxicity: '有毒', note: '有毒，峻下逐水' }],
  ['生大戟',     { toxicity: '有毒', note: '有毒，峻下逐水' }],
  ['芫花',       { toxicity: '有毒', note: '有毒，峻下逐水' }],
  ['巴豆',       { toxicity: '大毒', note: '有大毒，峻下' }],
  ['牽牛子',     { toxicity: '有毒', note: '有毒，峻下' }],
  ['千金子',     { toxicity: '有毒', note: '有毒，峻下逐水' }],
  ['斑蝥',       { toxicity: '大毒', note: '外用為主，內服極量 0.03g' }],
  ['全蠍',       { toxicity: '有毒', note: '有毒，息風止痙' }],
  ['蜈蚣',       { toxicity: '有毒', note: '有毒，息風止痙' }],
  ['雷公藤',     { toxicity: '大毒', note: '大毒，需先煎 1-2 小時' }],
  ['藜蘆',       { toxicity: '大毒', note: '有大毒，催吐' }],
  ['鴉膽子',     { toxicity: '有毒', note: '有毒，清熱解毒' }],
  ['狼毒',       { toxicity: '大毒', note: '有大毒，逐水祛痰' }],
  ['商陸',       { toxicity: '有毒', note: '有毒，逐水消腫' }],
  ['雄黃',       { toxicity: '有毒', note: '含砷化合物，有毒' }],
  ['砒霜',       { toxicity: '劇毒', note: '劇毒，外用蝕瘡' }],
  ['水銀',       { toxicity: '劇毒', note: '劇毒，外用殺蟲' }],
  ['輕粉',       { toxicity: '有毒', note: '含汞化合物，有毒' }],
  ['鉛丹',       { toxicity: '有毒', note: '含鉛化合物，有毒' }],
  ['密陀僧',     { toxicity: '有毒', note: '含鉛化合物，有毒' }],
  ['紅粉',       { toxicity: '大毒', note: '含汞化合物，大毒' }],
  ['白降丹',     { toxicity: '大毒', note: '含汞化合物，大毒' }],
  ['硫黃(外用)', { toxicity: '有毒', note: '有毒，外用殺蟲止癢' }],
  ['洋金花',     { toxicity: '有毒', note: '有毒，含莨菪鹼' }],
  ['天仙子',     { toxicity: '有毒', note: '有毒，含莨菪鹼' }],
]);

// Also build a Set that checks base names for fuzzy matching
// e.g. "附子" should match "附子(生)", "硫黃" should match "硫黃(外用)"
const SCHEDULE_1_BASE_NAMES = new Set();
const SCHEDULE_1_FULL_NAMES = new Set();
for (const key of SCHEDULE_1_HERBS.keys()) {
  SCHEDULE_1_FULL_NAMES.add(key);
  // Extract base name before any parenthetical
  const baseName = key.replace(/\(.*\)/, '').trim();
  SCHEDULE_1_BASE_NAMES.add(baseName);
}

/**
 * Look up Schedule 1 info for a given herb name.
 * Matches full name first, then tries base-name matching.
 */
function getSchedule1Info(herbName) {
  if (SCHEDULE_1_HERBS.has(herbName)) {
    return SCHEDULE_1_HERBS.get(herbName);
  }
  // Try to match base name: e.g. "附子" matches "附子(生)"
  for (const [fullName, info] of SCHEDULE_1_HERBS.entries()) {
    const baseName = fullName.replace(/\(.*\)/, '').trim();
    if (baseName === herbName) {
      return info;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5. Pregnancy Contraindications — 3-Tier System
// ---------------------------------------------------------------------------
// level 3 = Forbidden (禁用), level 2 = Avoid (不宜), level 1 = Caution (慎用)
const PREGNANCY_HERBS = {
  // 禁用 (Forbidden) — level 3
  '附子':   { level: 3, category: '禁用', note: '孕婦禁用：大毒，可致流產' },
  '川烏':   { level: 3, category: '禁用', note: '孕婦禁用：大毒' },
  '草烏':   { level: 3, category: '禁用', note: '孕婦禁用：大毒' },
  '巴豆':   { level: 3, category: '禁用', note: '孕婦禁用：峻下，可致流產' },
  '牽牛子': { level: 3, category: '禁用', note: '孕婦禁用：峻下' },
  '三稜':   { level: 3, category: '禁用', note: '孕婦禁用：破血行氣' },
  '莪術':   { level: 3, category: '禁用', note: '孕婦禁用：破血行氣' },
  '水蛭':   { level: 3, category: '禁用', note: '孕婦禁用：破血逐瘀' },
  '虻蟲':   { level: 3, category: '禁用', note: '孕婦禁用：破血逐瘀' },
  '斑蝥':   { level: 3, category: '禁用', note: '孕婦禁用：大毒' },
  '麝香':   { level: 3, category: '禁用', note: '孕婦禁用：開竅活血，可致流產' },
  '蜈蚣':   { level: 3, category: '禁用', note: '孕婦禁用：有毒，息風' },
  '全蠍':   { level: 3, category: '禁用', note: '孕婦禁用：有毒，息風' },
  '雄黃':   { level: 3, category: '禁用', note: '孕婦禁用：有毒' },
  '砒霜':   { level: 3, category: '禁用', note: '孕婦禁用：劇毒' },
  '馬錢子': { level: 3, category: '禁用', note: '孕婦禁用：大毒' },
  '商陸':   { level: 3, category: '禁用', note: '孕婦禁用：有毒，逐水' },

  // 不宜 (Avoid) — level 2
  '大黃':     { level: 2, category: '不宜', note: '孕婦不宜：瀉下力強' },
  '芒硝':     { level: 2, category: '不宜', note: '孕婦不宜：瀉下力強' },
  '桃仁':     { level: 2, category: '不宜', note: '孕婦不宜：活血祛瘀' },
  '紅花':     { level: 2, category: '不宜', note: '孕婦不宜：活血祛瘀' },
  '乳香':     { level: 2, category: '不宜', note: '孕婦不宜：活血止痛' },
  '沒藥':     { level: 2, category: '不宜', note: '孕婦不宜：活血止痛' },
  '王不留行': { level: 2, category: '不宜', note: '孕婦不宜：活血通經' },
  '穿山甲':   { level: 2, category: '不宜', note: '孕婦不宜：活血通經' },
  '益母草':   { level: 2, category: '不宜', note: '孕婦不宜：活血調經' },
  '枳實':     { level: 2, category: '不宜', note: '孕婦不宜：破氣消積' },
  '番瀉葉':   { level: 2, category: '不宜', note: '孕婦不宜：瀉下' },
  '蘆薈':     { level: 2, category: '不宜', note: '孕婦不宜：瀉下' },

  // 慎用 (Caution) — level 1
  '半夏':   { level: 1, category: '慎用', note: '孕婦慎用：辛燥' },
  '牛膝':   { level: 1, category: '慎用', note: '孕婦慎用：活血通經，引血下行' },
  '通草':   { level: 1, category: '慎用', note: '孕婦慎用：通利' },
  '薏苡仁': { level: 1, category: '慎用', note: '孕婦慎用：滑利' },
  '丹參':   { level: 1, category: '慎用', note: '孕婦慎用：活血' },
  '肉桂':   { level: 1, category: '慎用', note: '孕婦慎用：辛熱' },
  '乾薑':   { level: 1, category: '慎用', note: '孕婦慎用：辛熱' },
  '川芎':   { level: 1, category: '慎用', note: '孕婦慎用：活血行氣' },
  '延胡索': { level: 1, category: '慎用', note: '孕婦慎用：活血行氣' },
  '車前子': { level: 1, category: '慎用', note: '孕婦慎用：滑利' },
};

// ---------------------------------------------------------------------------
// 6. Dosage Limits — Pharmacopoeia-based (中國藥典 / 香港中藥典)
// ---------------------------------------------------------------------------
// min/max in grams, pharmacopoeiaMax = absolute ceiling, note = special instructions
const DOSAGE_LIMITS = {
  // --- Toxic / Schedule 1 herbs (strict limits) ---
  '附子':   { min: 3,   max: 15,  unit: 'g', pharmacopoeiaMax: 15,  note: '先煎 30-60 分鐘' },
  '川烏':   { min: 1.5, max: 3,   unit: 'g', pharmacopoeiaMax: 3,   note: '先煎 1-2 小時' },
  '草烏':   { min: 1.5, max: 3,   unit: 'g', pharmacopoeiaMax: 3,   note: '先煎 1-2 小時' },
  '細辛':   { min: 1,   max: 3,   unit: 'g', pharmacopoeiaMax: 3,   note: '不宜久煎' },
  '馬錢子': { min: 0.3, max: 0.6, unit: 'g', pharmacopoeiaMax: 0.9, note: '炮製後用，有大毒' },
  '全蠍':   { min: 2,   max: 5,   unit: 'g', pharmacopoeiaMax: 5,   note: '研末吞服 0.6-1g' },
  '蜈蚣':   { min: 1,   max: 3,   unit: 'g', pharmacopoeiaMax: 3,   note: '1-3 條，研末 0.6-1g' },
  '雷公藤': { min: 10,  max: 25,  unit: 'g', pharmacopoeiaMax: 25,  note: '先煎 1-2 小時，大毒' },
  '甘遂':   { min: 0.5, max: 1.5, unit: 'g', pharmacopoeiaMax: 1.5, note: '醋製入丸散' },
  '大戟':   { min: 1.5, max: 3,   unit: 'g', pharmacopoeiaMax: 3,   note: '醋製入丸散' },
  '芫花':   { min: 1.5, max: 3,   unit: 'g', pharmacopoeiaMax: 3,   note: '醋製' },
  '巴豆':   { min: 0.1, max: 0.3, unit: 'g', pharmacopoeiaMax: 0.3, note: '去油用霜，入丸散' },
  '斑蝥':   { min: 0.03,max: 0.06,unit: 'g', pharmacopoeiaMax: 0.1, note: '入丸散，外用適量' },
  '藜蘆':   { min: 0.3, max: 0.6, unit: 'g', pharmacopoeiaMax: 0.9, note: '入丸散，有大毒' },
  '洋金花': { min: 0.3, max: 0.6, unit: 'g', pharmacopoeiaMax: 0.6, note: '有毒，含莨菪鹼' },
  '天仙子': { min: 0.06,max: 0.6, unit: 'g', pharmacopoeiaMax: 0.6, note: '有毒，含莨菪鹼' },
  '狼毒':   { min: 0.6, max: 1.5, unit: 'g', pharmacopoeiaMax: 1.5, note: '有大毒' },
  '商陸':   { min: 3,   max: 9,   unit: 'g', pharmacopoeiaMax: 9,   note: '有毒，不宜久服' },
  '雄黃':   { min: 0.05,max: 0.1, unit: 'g', pharmacopoeiaMax: 0.1, note: '入丸散，不入煎劑' },
  '鴉膽子': { min: 0.5, max: 2,   unit: 'g', pharmacopoeiaMax: 2,   note: '去殼，龍眼肉包服' },
  '牽牛子': { min: 3,   max: 6,   unit: 'g', pharmacopoeiaMax: 9,   note: '有毒' },
  '千金子': { min: 1,   max: 2,   unit: 'g', pharmacopoeiaMax: 2,   note: '去油用霜' },

  // --- 解表藥 (Exterior-releasing herbs) ---
  '麻黃':   { min: 2,   max: 9,   unit: 'g', pharmacopoeiaMax: 10,  note: '發汗力強' },
  '桂枝':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '紫蘇葉': { min: 5,   max: 10,  unit: 'g', pharmacopoeiaMax: 15,  note: '不宜久煎' },
  '荊芥':   { min: 5,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '防風':   { min: 5,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '羌活':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '白芷':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '薄荷':   { min: 3,   max: 6,   unit: 'g', pharmacopoeiaMax: 6,   note: '後下' },
  '柴胡':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '葛根':   { min: 10,  max: 15,  unit: 'g', pharmacopoeiaMax: 20,  note: null },
  '升麻':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '蔓荊子': { min: 5,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },

  // --- 清熱藥 (Heat-clearing herbs) ---
  '石膏':   { min: 15,  max: 60,  unit: 'g', pharmacopoeiaMax: 60,  note: '先煎' },
  '知母':   { min: 6,   max: 12,  unit: 'g', pharmacopoeiaMax: 12,  note: null },
  '黃連':   { min: 2,   max: 5,   unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '黃芩':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '黃柏':   { min: 3,   max: 12,  unit: 'g', pharmacopoeiaMax: 12,  note: null },
  '龍膽':   { min: 3,   max: 6,   unit: 'g', pharmacopoeiaMax: 6,   note: null },
  '苦參':   { min: 5,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '金銀花': { min: 6,   max: 15,  unit: 'g', pharmacopoeiaMax: 20,  note: null },
  '連翹':   { min: 6,   max: 15,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '板藍根': { min: 9,   max: 15,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '蒲公英': { min: 10,  max: 15,  unit: 'g', pharmacopoeiaMax: 30,  note: null },
  '魚腥草': { min: 15,  max: 25,  unit: 'g', pharmacopoeiaMax: 30,  note: '不宜久煎' },
  '野菊花': { min: 9,   max: 15,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '梔子':   { min: 6,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },

  // --- 瀉下藥 (Purgative herbs) ---
  '大黃':   { min: 3,   max: 15,  unit: 'g', pharmacopoeiaMax: 15,  note: '後下（瀉下用）' },
  '芒硝':   { min: 6,   max: 12,  unit: 'g', pharmacopoeiaMax: 15,  note: '沖服' },
  '番瀉葉': { min: 2,   max: 6,   unit: 'g', pharmacopoeiaMax: 6,   note: '後下或泡服' },
  '蘆薈':   { min: 2,   max: 5,   unit: 'g', pharmacopoeiaMax: 5,   note: '入丸散' },

  // --- 祛風濕藥 (Wind-damp dispelling herbs) ---
  '獨活':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '威靈仙': { min: 6,   max: 10,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '秦艽':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '木瓜':   { min: 6,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },

  // --- 化濕藥 / 利水滲濕藥 ---
  '蒼朮':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '厚朴':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '藿香':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: '後下' },
  '茯苓':   { min: 10,  max: 15,  unit: 'g', pharmacopoeiaMax: 30,  note: null },
  '澤瀉':   { min: 6,   max: 10,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '薏苡仁': { min: 10,  max: 30,  unit: 'g', pharmacopoeiaMax: 30,  note: null },
  '車前子': { min: 10,  max: 15,  unit: 'g', pharmacopoeiaMax: 15,  note: '包煎' },
  '通草':   { min: 3,   max: 5,   unit: 'g', pharmacopoeiaMax: 5,   note: null },

  // --- 溫裏藥 (Interior-warming herbs) ---
  '肉桂':   { min: 1,   max: 5,   unit: 'g', pharmacopoeiaMax: 5,   note: '後下或焗服' },
  '乾薑':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '吳茱萸': { min: 2,   max: 5,   unit: 'g', pharmacopoeiaMax: 5,   note: null },
  '丁香':   { min: 1,   max: 3,   unit: 'g', pharmacopoeiaMax: 3,   note: null },
  '花椒':   { min: 3,   max: 6,   unit: 'g', pharmacopoeiaMax: 6,   note: null },

  // --- 理氣藥 (Qi-regulating herbs) ---
  '陳皮':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '枳殼':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '枳實':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '木香':   { min: 3,   max: 6,   unit: 'g', pharmacopoeiaMax: 10,  note: '後下' },
  '香附':   { min: 6,   max: 10,  unit: 'g', pharmacopoeiaMax: 12,  note: null },

  // --- 消食藥 ---
  '山楂':   { min: 10,  max: 15,  unit: 'g', pharmacopoeiaMax: 30,  note: null },
  '神曲':   { min: 6,   max: 15,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '麥芽':   { min: 10,  max: 15,  unit: 'g', pharmacopoeiaMax: 30,  note: null },
  '萊菔子': { min: 6,   max: 10,  unit: 'g', pharmacopoeiaMax: 15,  note: null },

  // --- 活血化瘀藥 ---
  '川芎':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '丹參':   { min: 10,  max: 15,  unit: 'g', pharmacopoeiaMax: 20,  note: null },
  '桃仁':   { min: 5,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '紅花':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '益母草': { min: 10,  max: 15,  unit: 'g', pharmacopoeiaMax: 30,  note: null },
  '延胡索': { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '乳香':   { min: 3,   max: 5,   unit: 'g', pharmacopoeiaMax: 5,   note: '入丸散' },
  '沒藥':   { min: 3,   max: 5,   unit: 'g', pharmacopoeiaMax: 5,   note: '入丸散' },
  '牛膝':   { min: 5,   max: 12,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '三稜':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '莪術':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },

  // --- 止血藥 ---
  '白及':   { min: 6,   max: 15,  unit: 'g', pharmacopoeiaMax: 15,  note: '研末 3-6g' },
  '三七':   { min: 3,   max: 9,   unit: 'g', pharmacopoeiaMax: 9,   note: '研末 1-3g 吞服' },
  '蒲黃':   { min: 5,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: '包煎' },
  '艾葉':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },

  // --- 補虛藥 (Tonifying herbs) ---
  '人參':   { min: 3,   max: 9,   unit: 'g', pharmacopoeiaMax: 10,  note: '另煎兌入；急救 15-30g' },
  '黨參':   { min: 10,  max: 30,  unit: 'g', pharmacopoeiaMax: 30,  note: null },
  '黃芪':   { min: 10,  max: 30,  unit: 'g', pharmacopoeiaMax: 60,  note: null },
  '白朮':   { min: 6,   max: 12,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '山藥':   { min: 15,  max: 30,  unit: 'g', pharmacopoeiaMax: 30,  note: null },
  '甘草':   { min: 2,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '當歸':   { min: 6,   max: 12,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '熟地黃': { min: 10,  max: 30,  unit: 'g', pharmacopoeiaMax: 30,  note: null },
  '白芍':   { min: 5,   max: 10,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '阿膠':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: '烊化兌服' },
  '何首烏': { min: 6,   max: 12,  unit: 'g', pharmacopoeiaMax: 12,  note: '制用' },
  '沙參':   { min: 10,  max: 15,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '麥冬':   { min: 6,   max: 12,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '天冬':   { min: 6,   max: 12,  unit: 'g', pharmacopoeiaMax: 12,  note: null },
  '枸杞子': { min: 6,   max: 12,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '杜仲':   { min: 6,   max: 10,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '續斷':   { min: 9,   max: 15,  unit: 'g', pharmacopoeiaMax: 20,  note: null },

  // --- 安神藥 ---
  '酸棗仁': { min: 10,  max: 15,  unit: 'g', pharmacopoeiaMax: 20,  note: '研碎' },
  '柏子仁': { min: 10,  max: 15,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
  '遠志':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },

  // --- 平肝息風藥 ---
  '天麻':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: '研末 1-1.5g' },
  '鉤藤':   { min: 3,   max: 12,  unit: 'g', pharmacopoeiaMax: 15,  note: '後下' },
  '石決明': { min: 15,  max: 30,  unit: 'g', pharmacopoeiaMax: 30,  note: '先煎' },
  '牡蠣':   { min: 15,  max: 30,  unit: 'g', pharmacopoeiaMax: 30,  note: '先煎' },
  '龍骨':   { min: 15,  max: 30,  unit: 'g', pharmacopoeiaMax: 30,  note: '先煎' },

  // --- 化痰止咳平喘藥 ---
  '半夏':   { min: 3,   max: 9,   unit: 'g', pharmacopoeiaMax: 9,   note: '制用（法半夏/薑半夏）' },
  '天南星': { min: 3,   max: 9,   unit: 'g', pharmacopoeiaMax: 9,   note: '制用' },
  '瓜蔞':   { min: 10,  max: 20,  unit: 'g', pharmacopoeiaMax: 20,  note: null },
  '貝母':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: '研末 1-2g' },
  '桔梗':   { min: 3,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '杏仁':   { min: 5,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: '含苦杏仁苷' },
  '百部':   { min: 3,   max: 9,   unit: 'g', pharmacopoeiaMax: 9,   note: null },
  '紫菀':   { min: 5,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },
  '款冬花': { min: 5,   max: 10,  unit: 'g', pharmacopoeiaMax: 10,  note: null },

  // --- 收澀藥 ---
  '五味子': { min: 2,   max: 6,   unit: 'g', pharmacopoeiaMax: 6,   note: '研碎' },
  '山茱萸': { min: 6,   max: 12,  unit: 'g', pharmacopoeiaMax: 12,  note: null },
  '芡實':   { min: 10,  max: 15,  unit: 'g', pharmacopoeiaMax: 15,  note: null },
};

// ---------------------------------------------------------------------------
// Severity ordering for sort
// ---------------------------------------------------------------------------
const SEVERITY_ORDER = { danger: 0, warning: 1, info: 2 };

// ---------------------------------------------------------------------------
// Helper: parse dosage string to grams
// ---------------------------------------------------------------------------
function parseDosageToGrams(dosageStr) {
  if (!dosageStr) return null;
  const str = String(dosageStr).trim();
  // Match patterns like "10g", "10 g", "10克", "10", "0.5g"
  const match = str.match(/^([\d.]+)\s*(g|克|公克)?$/);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

// =============================================================================
// EXPORTED FUNCTIONS
// =============================================================================

/**
 * Check all safety warnings for a prescription.
 *
 * @param {Array} herbs - Array of { herb: string, dosage?: string }
 * @param {Object} patientInfo - { isPregnant?: boolean, hasG6PD?: boolean, age?: number }
 * @returns {Array} Array of warning objects sorted by severity:
 *   { level: 'danger'|'warning'|'info', type: string, message: string, herbs: string[] }
 */
export function checkInteractions(herbs, patientInfo = {}) {
  const warnings = [];
  const herbEntries = (herbs || []).filter(Boolean);
  const herbNames = herbEntries.map(h => (typeof h === 'string' ? h : h.herb) || '').filter(Boolean);

  // -------------------------------------------------------------------------
  // A) 十八反 — Incompatible pairs (DANGER)
  // -------------------------------------------------------------------------
  for (const [a, b] of INCOMPATIBLE_PAIRS) {
    if (herbNames.includes(a) && herbNames.includes(b)) {
      warnings.push({
        level: 'danger',
        type: '十八反',
        message: `十八反：${a} 與 ${b} 不可同用`,
        herbs: [a, b],
      });
    }
  }

  // -------------------------------------------------------------------------
  // B) 十九畏 — Caution pairs (WARNING)
  // -------------------------------------------------------------------------
  for (const [a, b] of CAUTION_PAIRS) {
    if (herbNames.includes(a) && herbNames.includes(b)) {
      warnings.push({
        level: 'warning',
        type: '十九畏',
        message: `十九畏：${a} 畏 ${b}，慎用`,
        herbs: [a, b],
      });
    }
  }

  // -------------------------------------------------------------------------
  // C) G6PD Contraindications (if patient has G6PD deficiency)
  // -------------------------------------------------------------------------
  if (patientInfo.hasG6PD) {
    for (const name of herbNames) {
      const g6pdInfo = G6PD_HERBS[name];
      if (g6pdInfo) {
        if (g6pdInfo.level === 2) {
          warnings.push({
            level: 'danger',
            type: 'G6PD禁用',
            message: `G6PD 缺乏症禁用：${name}（${g6pdInfo.note}）`,
            herbs: [name],
          });
        } else {
          warnings.push({
            level: 'warning',
            type: 'G6PD慎用',
            message: `G6PD 缺乏症慎用：${name}（${g6pdInfo.note}）`,
            herbs: [name],
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // D) Pregnancy Contraindications (if patient is pregnant)
  // -------------------------------------------------------------------------
  if (patientInfo.isPregnant) {
    const forbidden = [];
    const avoid = [];
    const caution = [];

    for (const name of herbNames) {
      const pregInfo = PREGNANCY_HERBS[name];
      if (pregInfo) {
        if (pregInfo.level === 3) forbidden.push(name);
        else if (pregInfo.level === 2) avoid.push(name);
        else if (pregInfo.level === 1) caution.push(name);
      }
    }

    if (forbidden.length > 0) {
      warnings.push({
        level: 'danger',
        type: '妊娠禁用',
        message: `孕婦禁用：${forbidden.join('、')}`,
        herbs: forbidden,
      });
    }
    if (avoid.length > 0) {
      warnings.push({
        level: 'warning',
        type: '妊娠不宜',
        message: `孕婦不宜使用：${avoid.join('、')}`,
        herbs: avoid,
      });
    }
    if (caution.length > 0) {
      warnings.push({
        level: 'info',
        type: '妊娠慎用',
        message: `孕婦慎用：${caution.join('、')}`,
        herbs: caution,
      });
    }
  }

  // -------------------------------------------------------------------------
  // E) Dosage limit checking
  // -------------------------------------------------------------------------
  for (const entry of herbEntries) {
    const name = typeof entry === 'string' ? entry : entry.herb;
    const dosageStr = typeof entry === 'string' ? null : entry.dosage;
    if (!name || !dosageStr) continue;

    const grams = parseDosageToGrams(dosageStr);
    if (grams === null) continue;

    const dosageResult = checkDosage(name, grams);
    if (dosageResult) {
      warnings.push({
        level: dosageResult.level,
        type: '劑量',
        message: dosageResult.message,
        herbs: [name],
      });
    }
  }

  // -------------------------------------------------------------------------
  // F) Schedule 1 toxic herb alerts (INFO)
  // -------------------------------------------------------------------------
  const schedule1Found = [];
  for (const name of herbNames) {
    const s1Info = getSchedule1Info(name);
    if (s1Info) {
      schedule1Found.push({ name, ...s1Info });
    }
  }
  if (schedule1Found.length > 0) {
    for (const item of schedule1Found) {
      warnings.push({
        level: 'info',
        type: '附表一',
        message: `附表一毒性中藥：${item.name}（${item.toxicity}）— ${item.note}`,
        herbs: [item.name],
      });
    }
  }

  // -------------------------------------------------------------------------
  // Sort by severity: danger first, then warning, then info
  // -------------------------------------------------------------------------
  warnings.sort((a, b) => SEVERITY_ORDER[a.level] - SEVERITY_ORDER[b.level]);

  return warnings;
}

/**
 * Check if a single herb has any safety concerns.
 *
 * @param {string} herbName
 * @returns {Object} {
 *   isSchedule1: boolean,
 *   toxicity: string|null,
 *   g6pdLevel: number|null,     // 2=forbidden, 1=caution, null=safe
 *   pregnancyLevel: number|null, // 3=forbidden, 2=avoid, 1=caution, null=safe
 *   maxDosage: { min, max, unit, pharmacopoeiaMax, note }|null,
 *   schedule1Note: string|null,
 *   pregnancyNote: string|null,
 *   g6pdNote: string|null,
 * }
 */
export function getHerbSafetyInfo(herbName) {
  if (!herbName) {
    return {
      isSchedule1: false,
      toxicity: null,
      g6pdLevel: null,
      pregnancyLevel: null,
      maxDosage: null,
      schedule1Note: null,
      pregnancyNote: null,
      g6pdNote: null,
    };
  }

  const s1Info = getSchedule1Info(herbName);
  const g6pdInfo = G6PD_HERBS[herbName] || null;
  const pregInfo = PREGNANCY_HERBS[herbName] || null;
  const dosageInfo = DOSAGE_LIMITS[herbName] || null;

  return {
    isSchedule1: s1Info !== null,
    toxicity: s1Info ? s1Info.toxicity : null,
    g6pdLevel: g6pdInfo ? g6pdInfo.level : null,
    pregnancyLevel: pregInfo ? pregInfo.level : null,
    maxDosage: dosageInfo,
    schedule1Note: s1Info ? s1Info.note : null,
    pregnancyNote: pregInfo ? pregInfo.note : null,
    g6pdNote: g6pdInfo ? g6pdInfo.note : null,
  };
}

/**
 * Check dosage against pharmacopoeia limits.
 *
 * @param {string} herbName
 * @param {number} dosageGrams - dosage in grams
 * @returns {null|{ level: string, message: string }}
 *   null if within limits, or a warning object if exceeded
 */
export function checkDosage(herbName, dosageGrams) {
  if (!herbName || dosageGrams === null || dosageGrams === undefined) return null;

  const limits = DOSAGE_LIMITS[herbName];
  if (!limits) return null;

  const grams = parseFloat(dosageGrams);
  if (isNaN(grams) || grams <= 0) return null;

  // Check against pharmacopoeia maximum (hard ceiling) — DANGER
  if (limits.pharmacopoeiaMax && grams > limits.pharmacopoeiaMax) {
    const noteStr = limits.note ? `（${limits.note}）` : '';
    return {
      level: 'danger',
      message: `${herbName} 用量 ${grams}g 超出藥典極量 ${limits.pharmacopoeiaMax}g${noteStr}，常用量 ${limits.min}-${limits.max}g`,
    };
  }

  // Check against standard maximum range — WARNING
  if (grams > limits.max) {
    const noteStr = limits.note ? `（${limits.note}）` : '';
    return {
      level: 'warning',
      message: `${herbName} 用量 ${grams}g 超出常用量上限 ${limits.max}g${noteStr}，常用量 ${limits.min}-${limits.max}g，藥典極量 ${limits.pharmacopoeiaMax}g`,
    };
  }

  // Check if below standard minimum — INFO (possibly sub-therapeutic)
  if (grams < limits.min) {
    return {
      level: 'info',
      message: `${herbName} 用量 ${grams}g 低於常用量下限 ${limits.min}g，常用量 ${limits.min}-${limits.max}g`,
    };
  }

  return null;
}

/**
 * Get safety badges for display next to a herb name.
 *
 * @param {string} herbName
 * @returns {Array} Array of badge objects:
 *   { label: string, color: string, tooltip: string }
 */
export function getSafetyBadges(herbName) {
  if (!herbName) return [];

  const badges = [];
  const info = getHerbSafetyInfo(herbName);

  // Schedule 1 / Toxicity badge
  if (info.isSchedule1) {
    const toxLabel = info.toxicity || '有毒';
    let color;
    switch (info.toxicity) {
      case '劇毒': color = '#7f1d1d'; break; // very dark red
      case '大毒': color = '#dc2626'; break; // red
      default:     color = '#ef4444'; break; // lighter red
    }
    badges.push({
      label: toxLabel,
      color,
      tooltip: `附表一毒性中藥：${herbName}${info.schedule1Note ? ' — ' + info.schedule1Note : ''}`,
    });
  }

  // Pregnancy badge
  if (info.pregnancyLevel !== null) {
    let label, color;
    switch (info.pregnancyLevel) {
      case 3:
        label = '孕禁';
        color = '#dc2626'; // red
        break;
      case 2:
        label = '孕忌';
        color = '#f97316'; // orange
        break;
      case 1:
        label = '孕慎';
        color = '#eab308'; // yellow
        break;
      default:
        label = '孕慎';
        color = '#eab308';
    }
    badges.push({
      label,
      color,
      tooltip: info.pregnancyNote || `妊娠${info.pregnancyLevel === 3 ? '禁用' : info.pregnancyLevel === 2 ? '不宜' : '慎用'}`,
    });
  }

  // G6PD badge
  if (info.g6pdLevel !== null) {
    badges.push({
      label: info.g6pdLevel === 2 ? 'G6PD禁' : 'G6PD慎',
      color: info.g6pdLevel === 2 ? '#dc2626' : '#f97316',
      tooltip: info.g6pdNote || 'G6PD 缺乏症注意',
    });
  }

  // Dosage note badge (if there is a special instruction)
  const dosage = DOSAGE_LIMITS[herbName];
  if (dosage && dosage.note) {
    badges.push({
      label: dosage.note.length > 4 ? dosage.note.substring(0, 4) : dosage.note,
      color: '#6366f1', // indigo
      tooltip: `${herbName}：常用量 ${dosage.min}-${dosage.max}g${dosage.note ? '，' + dosage.note : ''}`,
    });
  }

  return badges;
}

// ---------------------------------------------------------------------------
// Additional exports for direct access to raw data if needed
// ---------------------------------------------------------------------------
export { DOSAGE_LIMITS };
export { PREGNANCY_HERBS };
export { G6PD_HERBS };
export { SCHEDULE_1_HERBS };
export { INCOMPATIBLE_PAIRS };
export { CAUTION_PAIRS };
