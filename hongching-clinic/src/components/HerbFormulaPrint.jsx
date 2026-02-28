// Herb Formula Label Printing Component
// Build, preview and print herb formula labels for dispensing

import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getDoctors } from '../data';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const today = () => new Date().toISOString().substring(0, 10);

const LS_PRINTS = 'hcmc_formula_prints';
const LS_CUSTOM = 'hcmc_custom_formulas';

const loadJSON = (key, fallback = []) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
};
const saveJSON = (key, val) => localStorage.setItem(key, JSON.stringify(val));

// ── Classic Formulas ──
const CLASSIC_FORMULAS = [
  { name: '四君子湯', herbs: [{ herb: '人參', g: 9 }, { herb: '白朮', g: 9 }, { herb: '茯苓', g: 9 }, { herb: '甘草', g: 6 }],
    method: '水煎服，每日一劑，分早晚兩次溫服。', contra: '實證、熱證忌用' },
  { name: '四物湯', herbs: [{ herb: '熟地', g: 12 }, { herb: '當歸', g: 10 }, { herb: '白芍', g: 10 }, { herb: '川芎', g: 6 }],
    method: '水煎服，每日一劑，分早晚兩次溫服。', contra: '脾虛泄瀉者慎用' },
  { name: '六味地黃丸', herbs: [{ herb: '熟地', g: 24 }, { herb: '山萸肉', g: 12 }, { herb: '山藥', g: 12 }, { herb: '澤瀉', g: 9 }, { herb: '丹皮', g: 9 }, { herb: '茯苓', g: 9 }],
    method: '水煎服，每日一劑，分早晚溫服；或蜜丸，每次9g，日服二次。', contra: '脾虛泄瀉者慎用' },
  { name: '補中益氣湯', herbs: [{ herb: '黃芪', g: 15 }, { herb: '甘草', g: 5 }, { herb: '人參', g: 9 }, { herb: '當歸', g: 6 }, { herb: '陳皮', g: 6 }, { herb: '升麻', g: 6 }, { herb: '柴胡', g: 6 }, { herb: '白朮', g: 9 }],
    method: '水煎服，每日一劑，食前溫服。', contra: '陰虛發熱者忌用' },
  { name: '逍遙散', herbs: [{ herb: '柴胡', g: 9 }, { herb: '當歸', g: 9 }, { herb: '白芍', g: 9 }, { herb: '白朮', g: 9 }, { herb: '茯苓', g: 9 }, { herb: '甘草', g: 6 }, { herb: '薄荷', g: 3 }, { herb: '煨薑', g: 6 }],
    method: '水煎服，每日一劑，分早晚溫服。', contra: '陰虛火旺者不宜' },
  { name: '桂枝湯', herbs: [{ herb: '桂枝', g: 9 }, { herb: '芍藥', g: 9 }, { herb: '生薑', g: 9 }, { herb: '大棗', g: 9 }, { herb: '甘草', g: 6 }],
    method: '水煎服，溫服，服後啜熱稀粥，溫覆取微汗。', contra: '外感風寒表實無汗者禁用' },
  { name: '麻黃湯', herbs: [{ herb: '麻黃', g: 9 }, { herb: '桂枝', g: 6 }, { herb: '杏仁', g: 9 }, { herb: '甘草', g: 3 }],
    method: '水煎服，每日一劑，溫服取微汗。', contra: '表虛自汗、體虛外感忌用' },
  { name: '銀翹散', herbs: [{ herb: '金銀花', g: 15 }, { herb: '連翹', g: 15 }, { herb: '薄荷', g: 6 }, { herb: '荊芥穗', g: 6 }, { herb: '淡豆豉', g: 6 }, { herb: '牛蒡子', g: 9 }, { herb: '桔梗', g: 6 }, { herb: '竹葉', g: 6 }, { herb: '蘆根', g: 15 }, { herb: '甘草', g: 5 }],
    method: '鮮蘆根湯煎香氣大出即取服，勿過煮。每日一劑。', contra: '風寒表證忌用' },
  { name: '小柴胡湯', herbs: [{ herb: '柴胡', g: 12 }, { herb: '黃芩', g: 9 }, { herb: '人參', g: 6 }, { herb: '半夏', g: 9 }, { herb: '甘草', g: 6 }, { herb: '生薑', g: 9 }, { herb: '大棗', g: 9 }],
    method: '水煎服，每日一劑，分早晚兩次溫服。', contra: '陰虛血少者慎用' },
  { name: '半夏瀉心湯', herbs: [{ herb: '半夏', g: 9 }, { herb: '黃芩', g: 9 }, { herb: '黃連', g: 3 }, { herb: '乾薑', g: 9 }, { herb: '人參', g: 9 }, { herb: '甘草', g: 9 }, { herb: '大棗', g: 9 }],
    method: '水煎服，每日一劑，分早晚溫服。', contra: '實熱痞滿者不宜' },
];

// ── Print HTML builders ──
const printCSS = (size) => {
  const base = `body{margin:0;font-family:'Microsoft YaHei','PingFang TC',sans-serif;color:#333}`;
  if (size === 'small') return `${base}
    @page{size:90mm 60mm;margin:0}
    .lbl{width:90mm;min-height:56mm;padding:6mm;box-sizing:border-box;font-size:11px;line-height:1.5;page-break-after:always}
    .lbl:last-child{page-break-after:auto}
    .hdr{text-align:center;border-bottom:1px solid #333;padding-bottom:4px;margin-bottom:6px}
    .hdr .cn{font-size:14px;font-weight:800}
    .row{display:flex;justify-content:space-between;margin-bottom:2px}
    .row b{font-size:11px}
    .herbs{font-size:10px;margin-top:4px;padding:4px;background:#f9f9f9;border-radius:2px}
    .inst{margin-top:6px;padding:4px;border:1px dashed #999;border-radius:2px;font-size:10px;font-weight:700}
    .warn{color:#c00;font-weight:700;font-size:9px;margin-top:3px}
    .foot{margin-top:4px;font-size:7px;color:#888;text-align:center;border-top:1px solid #ccc;padding-top:3px}
    @media print{body{margin:0}}`;
  if (size === 'medium') return `${base}
    @page{size:120mm 90mm;margin:0}
    .lbl{width:120mm;min-height:84mm;padding:8mm;box-sizing:border-box;font-size:12px;line-height:1.6;page-break-after:always}
    .lbl:last-child{page-break-after:auto}
    .hdr{text-align:center;border-bottom:2px solid ${ACCENT};padding-bottom:6px;margin-bottom:8px}
    .hdr .cn{font-size:16px;font-weight:800;color:${ACCENT}}
    .fname{font-size:14px;font-weight:700;text-align:center;margin:6px 0;color:${ACCENT};letter-spacing:2px}
    .row{display:flex;justify-content:space-between;margin-bottom:3px}
    .row b{font-size:12px}
    .herbs{font-size:11px;margin-top:6px;padding:6px;background:#f9f9f9;border-radius:3px;border-left:3px solid ${ACCENT}}
    .inst{margin-top:8px;padding:6px;border:1px dashed #999;border-radius:3px;font-size:11px;font-weight:700}
    .warn{color:#c00;font-weight:700;font-size:10px;margin-top:4px}
    .foot{margin-top:6px;font-size:8px;color:#888;text-align:center;border-top:1px solid #ccc;padding-top:4px}
    @media print{body{margin:0}}`;
  // A5
  return `${base}
    @page{size:A5;margin:10mm}
    .card{padding:20px 24px;max-width:500px;margin:0 auto;page-break-after:always;border:1px solid #ddd;border-radius:6px}
    .card:last-child{page-break-after:auto}
    .hdr{text-align:center;border-bottom:3px double ${ACCENT};padding-bottom:10px;margin-bottom:10px}
    .hdr .cn{font-size:18px;font-weight:800;color:${ACCENT};letter-spacing:2px}
    .ttl{text-align:center;font-size:16px;font-weight:800;color:${ACCENT};margin:10px 0;letter-spacing:3px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;font-size:12px;margin-bottom:12px}
    .grid b{color:#555}
    table{width:100%;border-collapse:collapse;margin:10px 0}
    th{background:${ACCENT};color:#fff;padding:5px 8px;font-size:11px;text-align:left}
    td{padding:5px 8px;border-bottom:1px solid #eee;font-size:12px}
    tr:nth-child(even){background:#f9fafb}
    .sec{margin:10px 0;padding:8px 12px;background:#f9fafb;border-left:3px solid ${ACCENT};border-radius:4px;font-size:12px}
    .sec.warn{border-left-color:#e67e22;background:#fef9ee}
    .total{text-align:right;font-size:12px;font-weight:700;color:${ACCENT};margin-top:4px}
    .foot{text-align:center;font-size:8px;color:#aaa;border-top:1px solid #eee;padding-top:8px;margin-top:20px}
    @media print{body{margin:0}.card{border:none}}`;
};

const buildLabelHtml = (f, idx, total, size) => {
  const herbStr = f.herbs.map(h => `${h.herb} ${h.g}g`).join('、');
  const totalW = f.herbs.reduce((s, h) => s + (parseFloat(h.g) || 0), 0);
  if (size === 'a5') {
    const rows = f.herbs.map((h, i) => `<tr><td>${i + 1}</td><td>${h.herb}</td><td>${h.g}g</td></tr>`).join('');
    return `<div class="card">
      <div class="hdr"><div class="cn">${f.clinicName}</div></div>
      <div class="ttl">${f.formulaName || '中藥處方'}</div>
      <div class="grid">
        <div><b>病人姓名：</b>${f.patientName}</div>
        <div><b>日期：</b>${f.date}</div>
        <div><b>主診醫師：</b>${f.doctor}</div>
        <div><b>帖數：</b>${f.doses} 帖</div>
      </div>
      <table><thead><tr><th>#</th><th>藥材</th><th>劑量</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="total">每帖總重：${totalW}g</div>
      <div class="sec"><b>煎服法：</b>${f.method}</div>
      ${f.contra ? `<div class="sec warn"><b>禁忌注意：</b>${f.contra}</div>` : ''}
      <div class="foot">${idx}/${total} | 如有不適請立即停藥並聯絡本中心</div>
    </div>`;
  }
  // small / medium label
  return `<div class="lbl">
    <div class="hdr"><div class="cn">${f.clinicName}</div></div>
    ${size === 'medium' && f.formulaName ? `<div class="fname">${f.formulaName}</div>` : ''}
    <div class="row"><span><b>病人：</b>${f.patientName}</span><span><b>日期：</b>${f.date}</span></div>
    <div class="row"><span><b>醫師：</b>${f.doctor}</span><span><b>帖數：</b>${f.doses} 帖</span></div>
    ${size === 'small' && f.formulaName ? `<div style="font-size:11px;font-weight:700;margin-top:3px">處方：${f.formulaName}</div>` : ''}
    <div class="herbs"><b>藥材（${totalW}g）：</b>${herbStr}</div>
    <div class="inst">煎服法：${f.method}</div>
    ${f.contra ? `<div class="warn">禁忌：${f.contra}</div>` : ''}
    <div class="foot">${idx}/${total} | 如有不適請立即停藥並聯絡本中心</div>
  </div>`;
};

// ── Styles ──
const S = {
  wrap: { display: 'flex', gap: 16, flexWrap: 'wrap' },
  col: { flex: 1, minWidth: 320 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 },
  cardH: { fontSize: 15, fontWeight: 700, color: ACCENT, margin: '0 0 10px' },
  row: { display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' },
  select: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' },
  btn: { padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none' },
  btnT: { background: ACCENT, color: '#fff' },
  btnO: { background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}` },
  btnD: { background: '#dc2626', color: '#fff' },
  btnSm: { padding: '4px 10px', fontSize: 12 },
  tag: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, marginRight: 4, marginBottom: 4, cursor: 'pointer' },
  herbRow: { display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 },
  stat: { textAlign: 'center', padding: 12, borderRadius: 8, flex: 1, minWidth: 100 },
};

export default function HerbFormulaPrint({ data, showToast, user }) {
  const patients = data?.patients || [];
  const doctors = getDoctors();
  const clinicName = getClinicName();

  // Formula builder state
  const [patientId, setPatientId] = useState('');
  const [doctor, setDoctor] = useState(doctors[0] || '');
  const [formulaName, setFormulaName] = useState('');
  const [herbs, setHerbs] = useState([]);
  const [method, setMethod] = useState('水煎服，每日一劑，分早晚兩次溫服。');
  const [contra, setContra] = useState('');
  const [doses, setDoses] = useState(3);
  const [labelSize, setLabelSize] = useState('medium');
  const [herbInput, setHerbInput] = useState('');
  const [herbDosage, setHerbDosage] = useState(9);
  const [searchQ, setSearchQ] = useState('');

  // History & custom
  const [history, setHistory] = useState(() => loadJSON(LS_PRINTS));
  const [customFormulas, setCustomFormulas] = useState(() => loadJSON(LS_CUSTOM));
  const [tab, setTab] = useState('build'); // build | history | custom

  const patient = patients.find(p => p.id === patientId);
  const totalWeight = useMemo(() => herbs.reduce((s, h) => s + (parseFloat(h.g) || 0), 0), [herbs]);

  // ── Herb management ──
  const addHerb = () => {
    const name = herbInput.trim();
    if (!name) return;
    if (herbs.find(h => h.herb === name)) return showToast?.('此藥材已在列表中');
    setHerbs(prev => [...prev, { herb: name, g: herbDosage }]);
    setHerbInput('');
    setHerbDosage(9);
  };

  const removeHerb = (idx) => setHerbs(prev => prev.filter((_, i) => i !== idx));
  const updateDosage = (idx, g) => setHerbs(prev => prev.map((h, i) => i === idx ? { ...h, g: Math.max(0.5, Number(g) || 0) } : h));

  // ── Load classic formula ──
  const loadClassic = (f) => {
    setFormulaName(f.name);
    setHerbs(f.herbs.map(h => ({ ...h })));
    setMethod(f.method);
    setContra(f.contra || '');
    showToast?.(`已載入 ${f.name}`);
  };

  // ── Print ──
  const handlePrint = () => {
    if (!patient) return showToast?.('請先選擇病人');
    if (herbs.length === 0) return showToast?.('請至少添加一味藥材');
    const payload = { clinicName, patientName: patient.name, doctor, formulaName, herbs, method, contra, doses, date: today() };
    const w = window.open('', '_blank');
    if (!w) return showToast?.('請允許彈出視窗');
    const total = doses;
    const body = Array.from({ length: total }, (_, i) => buildLabelHtml(payload, i + 1, total, labelSize)).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>藥方標籤 - ${formulaName || '處方'}</title><style>${printCSS(labelSize)}</style></head><body>${body}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
    // Save to history
    const record = { id: uid(), ...payload, size: labelSize, printedAt: new Date().toISOString() };
    const next = [record, ...history].slice(0, 50);
    setHistory(next);
    saveJSON(LS_PRINTS, next);
    showToast?.(`正在列印 ${total} 張${formulaName || '處方'}標籤`);
  };

  // ── Custom formula save/load ──
  const saveCustom = () => {
    if (!formulaName.trim()) return showToast?.('請輸入處方名稱');
    if (herbs.length === 0) return showToast?.('請至少添加一味藥材');
    const exists = customFormulas.findIndex(f => f.name === formulaName.trim());
    const entry = { id: uid(), name: formulaName.trim(), herbs: herbs.map(h => ({ ...h })), method, contra, savedAt: new Date().toISOString() };
    let next;
    if (exists >= 0) { next = [...customFormulas]; next[exists] = entry; }
    else { next = [entry, ...customFormulas]; }
    setCustomFormulas(next);
    saveJSON(LS_CUSTOM, next);
    showToast?.(`已儲存「${formulaName}」`);
  };

  const loadCustom = (f) => {
    setFormulaName(f.name);
    setHerbs(f.herbs.map(h => ({ ...h })));
    setMethod(f.method || '水煎服，每日一劑，分早晚兩次溫服。');
    setContra(f.contra || '');
    setTab('build');
    showToast?.(`已載入「${f.name}」`);
  };

  const deleteCustom = (id) => {
    const next = customFormulas.filter(f => f.id !== id);
    setCustomFormulas(next);
    saveJSON(LS_CUSTOM, next);
    showToast?.('已刪除');
  };

  const reprint = (rec) => {
    const w = window.open('', '_blank');
    if (!w) return showToast?.('請允許彈出視窗');
    const total = rec.doses || 1;
    const body = Array.from({ length: total }, (_, i) => buildLabelHtml(rec, i + 1, total, rec.size || 'medium')).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>藥方標籤</title><style>${printCSS(rec.size || 'medium')}</style></head><body>${body}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
    showToast?.('正在重印標籤');
  };

  const clearForm = () => {
    setFormulaName(''); setHerbs([]); setMethod('水煎服，每日一劑，分早晚兩次溫服。'); setContra(''); setDoses(3);
  };

  const filteredClassics = useMemo(() => {
    if (!searchQ) return CLASSIC_FORMULAS;
    const q = searchQ.toLowerCase();
    return CLASSIC_FORMULAS.filter(f => f.name.toLowerCase().includes(q) || f.herbs.some(h => h.herb.toLowerCase().includes(q)));
  }, [searchQ]);

  const filteredHistory = useMemo(() => history.slice(0, 20), [history]);

  return (
    <>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ ...S.stat, background: '#ecfdf5', border: `1px solid ${ACCENT}22` }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: ACCENT }}>{herbs.length}</div>
          <div style={{ fontSize: 12, color: '#666' }}>藥材數</div>
        </div>
        <div style={{ ...S.stat, background: '#fef9ee', border: '1px solid #f0c96022' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#b45309' }}>{totalWeight}g</div>
          <div style={{ fontSize: 12, color: '#666' }}>每帖總重</div>
        </div>
        <div style={{ ...S.stat, background: '#eff6ff', border: '1px solid #3b82f622' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb' }}>{doses}</div>
          <div style={{ fontSize: 12, color: '#666' }}>帖數</div>
        </div>
        <div style={{ ...S.stat, background: '#fdf2f8', border: '1px solid #ec489922' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#db2777' }}>{history.length}</div>
          <div style={{ fontSize: 12, color: '#666' }}>列印記錄</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {[['build', '組方列印'], ['history', '列印記錄'], ['custom', '自訂方劑']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ ...S.btn, ...(tab === k ? S.btnT : S.btnO), borderRadius: '6px 6px 0 0' }}>{label}</button>
        ))}
      </div>

      {tab === 'build' && (
        <div style={S.wrap}>
          {/* Left: Formula Builder */}
          <div style={S.col}>
            <div style={S.card}>
              <h4 style={S.cardH}>處方組方</h4>
              {/* Patient & Doctor */}
              <div style={S.row}>
                <select value={patientId} onChange={e => setPatientId(e.target.value)} style={{ ...S.select, flex: 1 }}>
                  <option value="">-- 選擇病人 --</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` (${p.phone})` : ''}</option>)}
                </select>
                <select value={doctor} onChange={e => setDoctor(e.target.value)} style={{ ...S.select, width: 120 }}>
                  {doctors.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              {/* Formula name */}
              <div style={S.row}>
                <input placeholder="處方名稱（如：加味逍遙散）" value={formulaName} onChange={e => setFormulaName(e.target.value)}
                  style={{ ...S.input, flex: 1 }} />
                <input type="number" min={1} max={30} value={doses} onChange={e => setDoses(Math.max(1, Number(e.target.value)))}
                  style={{ ...S.input, width: 60, textAlign: 'center' }} />
                <span style={{ fontSize: 13, color: '#666' }}>帖</span>
              </div>
              {/* Add herb */}
              <div style={S.row}>
                <input placeholder="輸入藥材名稱" value={herbInput} onChange={e => setHerbInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addHerb()} style={{ ...S.input, flex: 1 }} />
                <input type="number" min={0.5} step={0.5} value={herbDosage} onChange={e => setHerbDosage(Number(e.target.value))}
                  style={{ ...S.input, width: 60, textAlign: 'center' }} />
                <span style={{ fontSize: 12, color: '#888' }}>g</span>
                <button onClick={addHerb} style={{ ...S.btn, ...S.btnT }}>添加</button>
              </div>
              {/* Herb list */}
              <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 8 }}>
                {herbs.length === 0 && <div style={{ color: '#999', fontSize: 13, padding: 12, textAlign: 'center' }}>尚未添加藥材，請從上方輸入或選擇經典方劑</div>}
                {herbs.map((h, i) => (
                  <div key={i} style={S.herbRow}>
                    <span style={{ flex: 1, fontWeight: 500 }}>{i + 1}. {h.herb}</span>
                    <input type="number" min={0.5} step={0.5} value={h.g} onChange={e => updateDosage(i, e.target.value)}
                      style={{ ...S.input, width: 55, textAlign: 'center', padding: '3px 6px' }} />
                    <span style={{ fontSize: 12, color: '#888' }}>g</span>
                    <button onClick={() => removeHerb(i)} style={{ ...S.btn, ...S.btnD, ...S.btnSm }}>刪</button>
                  </div>
                ))}
              </div>
              {herbs.length > 0 && (
                <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: ACCENT }}>
                  每帖總重：{totalWeight}g
                </div>
              )}
              {/* Method & Contra */}
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>煎服法：</label>
                <textarea value={method} onChange={e => setMethod(e.target.value)} rows={2}
                  style={{ ...S.input, width: '100%', resize: 'vertical', boxSizing: 'border-box', marginTop: 4 }} />
              </div>
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>禁忌/注意事項：</label>
                <input value={contra} onChange={e => setContra(e.target.value)}
                  style={{ ...S.input, width: '100%', boxSizing: 'border-box', marginTop: 4 }} placeholder="可留空" />
              </div>
              {/* Actions */}
              <div style={{ ...S.row, marginTop: 12 }}>
                <select value={labelSize} onChange={e => setLabelSize(e.target.value)} style={S.select}>
                  <option value="small">小標籤 (90x60mm)</option>
                  <option value="medium">中標籤 (120x90mm)</option>
                  <option value="a5">A5 處方卡</option>
                </select>
                <button onClick={handlePrint} style={{ ...S.btn, ...S.btnT }}>列印 {doses} 帖標籤</button>
                <button onClick={saveCustom} style={{ ...S.btn, ...S.btnO }}>儲存方劑</button>
                <button onClick={clearForm} style={{ ...S.btn, ...S.btnO }}>清空</button>
              </div>
            </div>
          </div>

          {/* Right: Classic formulas */}
          <div style={{ ...S.col, maxWidth: 380 }}>
            <div style={S.card}>
              <h4 style={S.cardH}>經典方劑</h4>
              <input placeholder="搜尋方劑或藥材..." value={searchQ} onChange={e => setSearchQ(e.target.value)}
                style={{ ...S.input, width: '100%', boxSizing: 'border-box', marginBottom: 8 }} />
              <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                {filteredClassics.map(f => (
                  <div key={f.name} style={{ padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: ACCENT }}>{f.name}</span>
                      <button onClick={() => loadClassic(f)} style={{ ...S.btn, ...S.btnT, ...S.btnSm }}>載入</button>
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                      {f.herbs.map(h => `${h.herb} ${h.g}g`).join('、')}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>
                      總重 {f.herbs.reduce((s, h) => s + h.g, 0)}g | {f.contra && `禁忌：${f.contra}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div style={S.card}>
          <h4 style={S.cardH}>最近列印記錄</h4>
          {filteredHistory.length === 0 && <div style={{ color: '#999', fontSize: 13, padding: 20, textAlign: 'center' }}>暫無列印記錄</div>}
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {filteredHistory.map(rec => (
              <div key={rec.id} style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {rec.formulaName || '自訂處方'}
                    <span style={{ ...S.tag, background: '#ecfdf5', color: ACCENT }}>{rec.doses} 帖</span>
                    <span style={{ ...S.tag, background: '#eff6ff', color: '#2563eb' }}>
                      {rec.size === 'small' ? '小標籤' : rec.size === 'a5' ? 'A5' : '中標籤'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    病人：{rec.patientName} | 醫師：{rec.doctor} | {rec.date}
                  </div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    {rec.herbs.map(h => `${h.herb} ${h.g}g`).join('、')}
                  </div>
                </div>
                <button onClick={() => reprint(rec)} style={{ ...S.btn, ...S.btnT, ...S.btnSm }}>重印</button>
                <button onClick={() => {
                  const p = patients.find(pt => pt.name === rec.patientName);
                  if (p) setPatientId(p.id);
                  setFormulaName(rec.formulaName || '');
                  setHerbs(rec.herbs.map(h => ({ ...h })));
                  setMethod(rec.method || '');
                  setContra(rec.contra || '');
                  setDoses(rec.doses || 3);
                  setDoctor(rec.doctor || doctors[0] || '');
                  setTab('build');
                  showToast?.('已載入至組方');
                }} style={{ ...S.btn, ...S.btnO, ...S.btnSm }}>載入</button>
              </div>
            ))}
          </div>
          {history.length > 0 && (
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <button onClick={() => { setHistory([]); saveJSON(LS_PRINTS, []); showToast?.('已清除所有記錄'); }}
                style={{ ...S.btn, ...S.btnD, ...S.btnSm }}>清除所有記錄</button>
            </div>
          )}
        </div>
      )}

      {tab === 'custom' && (
        <div style={S.card}>
          <h4 style={S.cardH}>自訂方劑庫</h4>
          {customFormulas.length === 0 && <div style={{ color: '#999', fontSize: 13, padding: 20, textAlign: 'center' }}>尚未儲存自訂方劑。在「組方列印」中組方後點擊「儲存方劑」即可。</div>}
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {customFormulas.map(f => (
              <div key={f.id} style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: ACCENT }}>{f.name}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => loadCustom(f)} style={{ ...S.btn, ...S.btnT, ...S.btnSm }}>載入</button>
                    <button onClick={() => deleteCustom(f.id)} style={{ ...S.btn, ...S.btnD, ...S.btnSm }}>刪除</button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                  {f.herbs.map(h => `${h.herb} ${h.g}g`).join('、')}
                </div>
                <div style={{ fontSize: 11, color: '#999' }}>
                  總重 {f.herbs.reduce((s, h) => s + (parseFloat(h.g) || 0), 0)}g
                  {f.method && ` | 煎服法：${f.method.substring(0, 30)}...`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
