// Common TCM herb interactions and contraindications
// Based on 十八反 (18 Incompatibilities) and 十九畏 (19 Mutual Fears)

// 十八反 — Herbs that must NOT be combined
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

// 十九畏 — Herbs that should be used cautiously together
const CAUTION_PAIRS = [
  ['硫黃', '朴硝'], ['水銀', '砒霜'], ['狼毒', '密陀僧'],
  ['巴豆', '牽牛子'], ['丁香', '鬱金'], ['牙硝', '三稜'],
  ['川烏', '犀角'], ['草烏', '犀角'], ['人參', '五靈脂'],
  ['官桂', '赤石脂'], ['肉桂', '赤石脂'],
];

// Pregnancy contraindicated herbs
const PREGNANCY_CAUTION = [
  '附子', '川烏', '草烏', '大黃', '芒硝', '巴豆', '牽牛子',
  '麝香', '三稜', '莪術', '水蛭', '虻蟲', '斑蝥', '雄黃',
  '砒霜', '馬錢子', '蜈蚣', '全蠍', '桃仁', '紅花',
];

// Check for interactions in a list of herbs
export function checkInteractions(herbs) {
  const warnings = [];
  const herbNames = herbs.map(h => h.herb || h).filter(Boolean);

  // Check incompatible pairs (十八反)
  for (const [a, b] of INCOMPATIBLE_PAIRS) {
    if (herbNames.includes(a) && herbNames.includes(b)) {
      warnings.push({
        level: 'danger',
        message: `十八反：${a} 與 ${b} 不可同用`,
        herbs: [a, b],
      });
    }
  }

  // Check caution pairs (十九畏)
  for (const [a, b] of CAUTION_PAIRS) {
    if (herbNames.includes(a) && herbNames.includes(b)) {
      warnings.push({
        level: 'warning',
        message: `十九畏：${a} 畏 ${b}，慎用`,
        herbs: [a, b],
      });
    }
  }

  // Check pregnancy cautions
  const pregHerbs = herbNames.filter(h => PREGNANCY_CAUTION.includes(h));
  if (pregHerbs.length > 0) {
    warnings.push({
      level: 'info',
      message: `孕婦慎用/禁用：${pregHerbs.join('、')}`,
      herbs: pregHerbs,
    });
  }

  return warnings;
}
