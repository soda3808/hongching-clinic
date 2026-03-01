import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const CALC_KEY = 'hcmc_herb_calculator';
const BLEND_KEY = 'hcmc_saved_blends';
const A = '#0e7490';

function load(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) || fallback; } catch { return fallback; } }
function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

const DEFAULT_RATIOS = { '黃芪': 5, '人參': 7, '白朮': 5, '茯苓': 5, '甘草': 5, '當歸': 5, '川芎': 5, '熟地': 5, '白芍': 5, '柴胡': 6, '黃芩': 5, '半夏': 6, '生薑': 5, '大棗': 5, '桂枝': 5, '麻黃': 6, '杏仁': 5, '石膏': 5, '知母': 5, '附子': 7 };
const ROLE_INFO = [
  { role: '君藥', pct: '30-40%', desc: '針對主病主證，起主要治療作用' },
  { role: '臣藥', pct: '25-30%', desc: '輔助君藥加強治療作用' },
  { role: '佐藥', pct: '15-25%', desc: '佐助、佐制或反佐' },
  { role: '使藥', pct: '5-15%', desc: '引經或調和諸藥' },
];

const btn = (bg = A, color = '#fff') => ({ padding: '6px 14px', background: bg, color, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 });
const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)' };
const inp = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' };

export default function HerbBlendCalculator({ data, showToast, user }) {
  const [mode, setMode] = useState('raw'); // raw | granule
  const [herbs, setHerbs] = useState([{ id: uid(), name: '', dosage: '', ratio: 5, cost: '', role: '臣藥' }]);
  const [days, setDays] = useState(1);
  const [markup, setMarkup] = useState(30);
  const [patientType, setPatientType] = useState('adult'); // adult | child | pregnant
  const [childAge, setChildAge] = useState('');
  const [childWeight, setChildWeight] = useState('');
  const [showRef, setShowRef] = useState(false);
  const [savedBlends, setSavedBlends] = useState(() => load(BLEND_KEY, []));
  const [blendName, setBlendName] = useState('');
  const [showSaved, setShowSaved] = useState(false);

  // dosage factor
  const factor = useMemo(() => {
    if (patientType === 'adult') return 1;
    if (patientType === 'pregnant') return 0.7;
    if (patientType === 'child') {
      const w = parseFloat(childWeight);
      if (w > 0) return Math.min(1, Math.max(0.15, w / 60));
      const age = parseFloat(childAge);
      if (age > 0) {
        if (age <= 1) return 0.2;
        if (age <= 3) return 0.3;
        if (age <= 6) return 0.4;
        if (age <= 9) return 0.55;
        if (age <= 12) return 0.7;
        return 0.85;
      }
      return 0.5;
    }
    return 1;
  }, [patientType, childAge, childWeight]);

  // calculations
  const calc = useMemo(() => {
    const rows = herbs.filter(h => h.name && parseFloat(h.dosage) > 0).map(h => {
      const raw = parseFloat(h.dosage) * factor;
      const ratio = parseFloat(h.ratio) || 5;
      const granule = raw / ratio;
      const unitCost = parseFloat(h.cost) || 0;
      return { ...h, rawAdj: Math.round(raw * 10) / 10, granule: Math.round(granule * 100) / 100, ratio, herbCost: mode === 'raw' ? unitCost * raw : unitCost * granule };
    });
    const totalRaw = rows.reduce((s, r) => s + r.rawAdj, 0);
    const totalGranule = rows.reduce((s, r) => s + r.granule, 0);
    const totalCost = rows.reduce((s, r) => s + r.herbCost, 0);
    const totalDaysCost = totalCost * days;
    const sellingPrice = totalDaysCost * (1 + markup / 100);
    const waterAmount = Math.round(totalRaw * 10);
    return { rows, totalRaw: Math.round(totalRaw * 10) / 10, totalGranule: Math.round(totalGranule * 100) / 100, totalCost: Math.round(totalCost * 100) / 100, totalDaysCost: Math.round(totalDaysCost * 100) / 100, sellingPrice: Math.round(sellingPrice), waterAmount };
  }, [herbs, factor, mode, days, markup]);

  const addRow = () => setHerbs(h => [...h, { id: uid(), name: '', dosage: '', ratio: 5, cost: '', role: '臣藥' }]);
  const removeRow = (id) => setHerbs(h => h.length > 1 ? h.filter(r => r.id !== id) : h);
  const updateRow = (id, field, val) => setHerbs(h => h.map(r => r.id === id ? { ...r, [field]: val } : r));
  const autoRatio = (name) => DEFAULT_RATIOS[name] || 5;

  const scaleHerbs = (multiplier) => {
    setHerbs(h => h.map(r => ({ ...r, dosage: r.dosage ? String(Math.round(parseFloat(r.dosage) * multiplier * 10) / 10) : '' })));
    showToast && showToast(`已調整為 ${multiplier}x 劑量`);
  };

  const handleSaveBlend = () => {
    if (!blendName.trim()) return showToast && showToast('請輸入配方名稱');
    const validHerbs = herbs.filter(h => h.name);
    if (!validHerbs.length) return showToast && showToast('請至少加入一味藥材');
    const blend = { id: uid(), name: blendName.trim(), herbs: validHerbs, mode, days, patientType, markup, createdAt: new Date().toISOString().slice(0, 10), doctor: user?.name || '' };
    const updated = [...savedBlends, blend];
    setSavedBlends(updated);
    save(BLEND_KEY, updated);
    setBlendName('');
    showToast && showToast('配方已儲存');
  };

  const loadBlend = (blend) => {
    setHerbs(blend.herbs.map(h => ({ ...h, id: uid() })));
    setMode(blend.mode || 'raw');
    setDays(blend.days || 1);
    setMarkup(blend.markup || 30);
    setShowSaved(false);
    showToast && showToast(`已載入「${blend.name}」`);
  };

  const deleteBlend = (id) => {
    const updated = savedBlends.filter(b => b.id !== id);
    setSavedBlends(updated);
    save(BLEND_KEY, updated);
    showToast && showToast('已刪除配方');
  };

  // persist current state
  const persistCalc = () => {
    save(CALC_KEY, { herbs, mode, days, markup, patientType, childAge, childWeight });
  };

  const printLabel = () => {
    const clinic = getClinicName();
    const date = new Date().toISOString().slice(0, 10);
    const modeLabel = mode === 'raw' ? '飲片' : '濃縮顆粒';
    const herbRows = calc.rows.map(r =>
      `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.role)}</td><td>${mode === 'raw' ? r.rawAdj + 'g' : r.granule + 'g'}</td></tr>`
    ).join('');
    const adj = patientType === 'adult' ? '' : patientType === 'child' ? `（兒童劑量 x${factor}）` : '（妊娠減量 x0.7）';
    const decoction = mode === 'raw' ? `<p><b>煎煮說明：</b>加水 ${calc.waterAmount}ml，大火煮沸後轉小火煎煮30分鐘，濾渣取汁，分2-3次溫服。</p>` : '<p><b>服用說明：</b>溫水沖服，每日2-3次。</p>';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>處方標籤</title>
<style>body{margin:0;font-family:'Microsoft YaHei','PingFang TC',sans-serif;color:#333}
.page{padding:30px 40px;max-width:600px;margin:0 auto}
.header{text-align:center;border-bottom:3px double ${A};padding-bottom:10px;margin-bottom:14px}
.header h1{font-size:18px;color:${A};margin:0}
.header p{font-size:11px;color:#888;margin:2px 0}
.meta{display:flex;justify-content:space-between;font-size:12px;margin-bottom:10px}
table{width:100%;border-collapse:collapse;margin:10px 0}
th{background:${A};color:#fff;padding:5px 10px;font-size:12px;text-align:left}
td{padding:5px 10px;border-bottom:1px solid #eee;font-size:12px}
.totals{background:#f0fdfa;border-left:3px solid ${A};padding:10px;border-radius:4px;margin:12px 0;font-size:12px}
.instructions{border:1px dashed #999;padding:10px;border-radius:4px;font-size:12px;margin:10px 0}
.footer{text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:8px;margin-top:20px}
@media print{body{margin:0}.page{padding:20px 30px}}</style></head><body>
<div class="page"><div class="header"><h1>${escapeHtml(clinic)}</h1><p>${escapeHtml(modeLabel)}處方</p></div>
<div class="meta"><span>日期：${escapeHtml(date)}</span><span>醫師：${escapeHtml(user?.name || '-')}</span><span>帖數：${days} 帖${escapeHtml(adj)}</span></div>
<table><thead><tr><th>藥材</th><th>角色</th><th>劑量</th></tr></thead><tbody>${herbRows}</tbody></table>
<div class="totals"><b>合計：</b>${mode === 'raw' ? calc.totalRaw + 'g' : calc.totalGranule + 'g'}
${mode === 'raw' ? `　｜　<b>水量：</b>${calc.waterAmount}ml` : ''}
　｜　<b>帖數：</b>${days} 帖${calc.totalDaysCost > 0 ? `　｜　<b>費用：</b>$${calc.sellingPrice}` : ''}</div>
<div class="instructions">${decoction}</div>
${patientType === 'pregnant' ? '<p style="color:#c00;font-weight:700;font-size:12px">&#9888; 妊娠用藥，請遵醫囑</p>' : ''}
<div class="footer"><p>${escapeHtml(clinic)} - 處方標籤　列印時間：${escapeHtml(new Date().toLocaleString('zh-TW'))}</p></div></div>
<script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  };

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, color: A }}>&#x2697; 藥材配方計算器</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={btn(showSaved ? A : '#e5e7eb', showSaved ? '#fff' : '#374151')} onClick={() => setShowSaved(!showSaved)}>&#128218; 已存配方 ({savedBlends.length})</button>
          <button style={btn('#f0fdfa', A)} onClick={() => setShowRef(!showRef)}>&#9878; 君臣佐使</button>
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>模式：</span>
        {[['raw', '飲片計算'], ['granule', '濃縮顆粒計算']].map(([k, label]) => (
          <button key={k} onClick={() => setMode(k)} style={{ ...btn(mode === k ? A : '#e5e7eb', mode === k ? '#fff' : '#374151'), borderRadius: 20 }}>{label}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{mode === 'raw' ? '飲片煎劑 - 按克計算' : '濃縮顆粒 - 自動換算比例'}</span>
      </div>

      {/* Patient type */}
      <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>患者：</span>
        {[['adult', '成人'], ['child', '兒童'], ['pregnant', '孕婦']].map(([k, label]) => (
          <button key={k} onClick={() => setPatientType(k)} style={{ ...btn(patientType === k ? A : '#e5e7eb', patientType === k ? '#fff' : '#374151'), fontSize: 12, padding: '4px 12px' }}>{label}</button>
        ))}
        {patientType === 'child' && (
          <>
            <input type="number" placeholder="年齡(歲)" value={childAge} onChange={e => setChildAge(e.target.value)} style={{ ...inp, width: 80 }} />
            <input type="number" placeholder="體重(kg)" value={childWeight} onChange={e => setChildWeight(e.target.value)} style={{ ...inp, width: 80 }} />
          </>
        )}
        <span style={{ fontSize: 12, color: patientType === 'pregnant' ? '#dc2626' : '#6b7280', fontWeight: patientType === 'pregnant' ? 700 : 400 }}>
          {patientType === 'adult' ? '標準劑量 (x1.0)' : patientType === 'child' ? `兒童劑量 (x${factor})` : '&#9888; 妊娠減量 (x0.7)'}
        </span>
      </div>

      {/* Jun-Chen-Zuo-Shi reference */}
      {showRef && (
        <div style={{ ...card, background: '#f0fdfa', border: `1px solid ${A}20` }}>
          <h4 style={{ margin: '0 0 8px', color: A }}>君臣佐使 用藥比例參考</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            {ROLE_INFO.map(r => (
              <div key={r.role} style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e5e7eb' }}>
                <div style={{ fontWeight: 700, color: A, marginBottom: 4 }}>{r.role} ({r.pct})</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{r.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved blends panel */}
      {showSaved && (
        <div style={{ ...card, border: `1px solid ${A}30` }}>
          <h4 style={{ margin: '0 0 8px', color: A }}>已儲存配方</h4>
          {savedBlends.length === 0 ? <p style={{ color: '#9ca3af', fontSize: 13 }}>尚無已存配方</p> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {savedBlends.map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#f9fafb', borderRadius: 6 }}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{b.name}</span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{b.herbs.length} 味 | {b.mode === 'raw' ? '飲片' : '顆粒'} | {b.createdAt}</span>
                  <button style={btn(A)} onClick={() => loadBlend(b)}>載入</button>
                  <button style={btn('#ef4444')} onClick={() => deleteBlend(b.id)}>刪除</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Herb table */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h4 style={{ margin: 0, color: A }}>藥材列表</h4>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ ...btn('#f0fdf4', '#16a34a'), fontSize: 11 }} onClick={addRow}>+ 加藥</button>
            <button style={{ ...btn('#fef2f2', '#dc2626'), fontSize: 11 }} onClick={() => setHerbs([{ id: uid(), name: '', dosage: '', ratio: 5, cost: '', role: '臣藥' }])}>清空</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f0fdfa' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: A, width: 140 }}>藥材名稱</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: A, width: 70 }}>原方(g)</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: A, width: 70 }}>角色</th>
                {mode === 'granule' && <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: A, width: 60 }}>換算比</th>}
                <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: A, width: 80 }}>調整後(g)</th>
                {mode === 'granule' && <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: A, width: 80 }}>顆粒(g)</th>}
                <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: A, width: 70 }}>單價($)</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, color: A, width: 40 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {herbs.map(h => {
                const matched = calc.rows.find(r => r.id === h.id);
                return (
                  <tr key={h.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 4 }}>
                      <input style={inp} value={h.name} placeholder="藥材名" onChange={e => { updateRow(h.id, 'name', e.target.value); updateRow(h.id, 'ratio', autoRatio(e.target.value)); }} />
                    </td>
                    <td style={{ padding: 4 }}>
                      <input type="number" style={{ ...inp, width: 60 }} value={h.dosage} placeholder="g" onChange={e => updateRow(h.id, 'dosage', e.target.value)} />
                    </td>
                    <td style={{ padding: 4 }}>
                      <select style={{ ...inp, width: 70 }} value={h.role} onChange={e => updateRow(h.id, 'role', e.target.value)}>
                        <option>君藥</option><option>臣藥</option><option>佐藥</option><option>使藥</option>
                      </select>
                    </td>
                    {mode === 'granule' && (
                      <td style={{ padding: 4 }}>
                        <input type="number" style={{ ...inp, width: 50 }} value={h.ratio} onChange={e => updateRow(h.id, 'ratio', e.target.value)} />
                      </td>
                    )}
                    <td style={{ padding: '4px 8px', fontWeight: 600, color: '#374151' }}>{matched ? matched.rawAdj : '-'}</td>
                    {mode === 'granule' && <td style={{ padding: '4px 8px', fontWeight: 600, color: A }}>{matched ? matched.granule : '-'}</td>}
                    <td style={{ padding: 4 }}>
                      <input type="number" style={{ ...inp, width: 60 }} value={h.cost} placeholder="$" onChange={e => updateRow(h.id, 'cost', e.target.value)} />
                    </td>
                    <td style={{ padding: 4, textAlign: 'center' }}>
                      <button onClick={() => removeRow(h.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}>&#10005;</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button style={{ ...btn('#f0fdf4', '#16a34a'), fontSize: 12, marginTop: 8, width: '100%' }} onClick={addRow}>+ 新增藥材</button>
      </div>

      {/* Controls: days, scale, markup */}
      <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>帖數：
          <input type="number" min={1} value={days} onChange={e => setDays(Math.max(1, parseInt(e.target.value) || 1))} style={{ ...inp, width: 60, marginLeft: 4 }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600 }}>加成(%)：
          <input type="number" min={0} value={markup} onChange={e => setMarkup(parseFloat(e.target.value) || 0)} style={{ ...inp, width: 60, marginLeft: 4 }} />
        </label>
        <span style={{ fontSize: 12, color: '#6b7280' }}>|　處方倍量：</span>
        {[0.5, 1, 2, 3].map(m => (
          <button key={m} style={{ ...btn('#f0fdfa', A), fontSize: 11, padding: '3px 10px' }} onClick={() => scaleHerbs(m)}>{m}x</button>
        ))}
        <input type="number" min={0.1} step={0.1} placeholder="自訂" style={{ ...inp, width: 60 }} onKeyDown={e => { if (e.key === 'Enter') { const v = parseFloat(e.target.value); if (v > 0) { scaleHerbs(v); e.target.value = ''; } } }} />
      </div>

      {/* Results */}
      <div style={{ ...card, background: '#f0fdfa', border: `2px solid ${A}30` }}>
        <h4 style={{ margin: '0 0 10px', color: A }}>&#128202; 計算結果</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <div style={{ background: '#fff', padding: 12, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#6b7280' }}>飲片總重</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: A }}>{calc.totalRaw}g</div>
          </div>
          {mode === 'granule' && (
            <div style={{ background: '#fff', padding: 12, borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6b7280' }}>顆粒總重</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: A }}>{calc.totalGranule}g</div>
            </div>
          )}
          {mode === 'raw' && (
            <div style={{ background: '#fff', padding: 12, borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6b7280' }}>建議加水量</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0369a1' }}>{calc.waterAmount}ml</div>
            </div>
          )}
          <div style={{ background: '#fff', padding: 12, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#6b7280' }}>單帖成本</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#b45309' }}>${calc.totalCost}</div>
          </div>
          <div style={{ background: '#fff', padding: 12, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{days} 帖總成本</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#b45309' }}>${calc.totalDaysCost}</div>
          </div>
          <div style={{ background: '#fff', padding: 12, borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#6b7280' }}>售價 (+{markup}%)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>${calc.sellingPrice}</div>
          </div>
        </div>

        {/* Decoction instructions */}
        {mode === 'raw' && calc.totalRaw > 0 && (
          <div style={{ marginTop: 12, padding: 10, background: '#fff', borderRadius: 6, border: '1px dashed #0e749050', fontSize: 13 }}>
            <b>煎煮方法：</b>將藥材用清水浸泡30分鐘，加水約 {calc.waterAmount}ml（約為藥材重量的10倍），大火煮沸後轉小火煎煮30分鐘。濾渣取汁約300-400ml，分早晚2次溫服。如需二煎，加水量減半，煎煮20分鐘。
          </div>
        )}
        {mode === 'granule' && calc.totalGranule > 0 && (
          <div style={{ marginTop: 12, padding: 10, background: '#fff', borderRadius: 6, border: '1px dashed #0e749050', fontSize: 13 }}>
            <b>服用方法：</b>取顆粒 {calc.totalGranule}g，以約150-200ml溫水沖服，每日2-3次，飯後30分鐘服用。
          </div>
        )}
      </div>

      {/* Role distribution chart */}
      {calc.rows.length > 0 && (
        <div style={card}>
          <h4 style={{ margin: '0 0 8px', color: A }}>君臣佐使分佈</h4>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['君藥', '臣藥', '佐藥', '使藥'].map(role => {
              const roleWeight = calc.rows.filter(r => r.role === role).reduce((s, r) => s + r.rawAdj, 0);
              const pct = calc.totalRaw > 0 ? Math.round(roleWeight / calc.totalRaw * 100) : 0;
              const colors = { '君藥': '#dc2626', '臣藥': A, '佐藥': '#ca8a04', '使藥': '#6b7280' };
              return (
                <div key={role} style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: colors[role], marginBottom: 4 }}>{role}</div>
                  <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: colors[role], borderRadius: 4, transition: 'width .3s' }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{pct}% ({roleWeight}g)</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save & print actions */}
      <div style={{ ...card, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input style={{ ...inp, flex: 1, minWidth: 160 }} placeholder="配方名稱（儲存用）" value={blendName} onChange={e => setBlendName(e.target.value)} />
        <button style={btn(A)} onClick={handleSaveBlend}>&#128190; 儲存配方</button>
        <button style={btn('#7c3aed')} onClick={printLabel}>&#128424; 列印處方</button>
        <button style={btn('#0369a1')} onClick={() => { persistCalc(); showToast && showToast('計算數據已暫存'); }}>&#128190; 暫存數據</button>
      </div>
    </div>
  );
}
