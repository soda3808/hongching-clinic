import { useState, useMemo } from 'react';

const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_interaction_checks';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const loadJSON = (k, fb = []) => { try { return JSON.parse(localStorage.getItem(k)) || fb; } catch { return fb; } };
const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const SEV = {
  contraindicated: { label: '禁忌', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  warning:         { label: '警告', color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
  caution:         { label: '注意', color: '#ca8a04', bg: '#fefce8', border: '#fde047' },
};

/* ─── TCM interaction rules database ─── */
const RULES = [
  // 十八反 — 甘草組
  { a: '甘草', b: '甘遂',  severity: 'contraindicated', category: '十八反', desc: '甘草反甘遂，同用可致中毒', advice: '嚴禁同用，須更換處方' },
  { a: '甘草', b: '大戟',  severity: 'contraindicated', category: '十八反', desc: '甘草反大戟，合用增毒性',   advice: '嚴禁同用' },
  { a: '甘草', b: '海藻',  severity: 'contraindicated', category: '十八反', desc: '甘草反海藻，藥性相反',     advice: '嚴禁同用' },
  { a: '甘草', b: '芫花',  severity: 'contraindicated', category: '十八反', desc: '甘草反芫花，毒性增強',     advice: '嚴禁同用' },
  // 十八反 — 烏頭組
  { a: '烏頭', b: '半夏',  severity: 'contraindicated', category: '十八反', desc: '烏頭反半夏，合用增毒',     advice: '嚴禁同用，附子同屬烏頭類亦須注意' },
  { a: '烏頭', b: '瓜蔞',  severity: 'contraindicated', category: '十八反', desc: '烏頭反瓜蔞',             advice: '嚴禁同用' },
  { a: '烏頭', b: '貝母',  severity: 'contraindicated', category: '十八反', desc: '烏頭反貝母（含川貝母、浙貝母）', advice: '嚴禁同用' },
  { a: '烏頭', b: '白蘞',  severity: 'contraindicated', category: '十八反', desc: '烏頭反白蘞',             advice: '嚴禁同用' },
  { a: '烏頭', b: '白及',  severity: 'contraindicated', category: '十八反', desc: '烏頭反白及',             advice: '嚴禁同用' },
  // 十八反 — 藜蘆組
  { a: '藜蘆', b: '人參',  severity: 'contraindicated', category: '十八反', desc: '藜蘆反人參',             advice: '嚴禁同用' },
  { a: '藜蘆', b: '沙參',  severity: 'contraindicated', category: '十八反', desc: '藜蘆反沙參',             advice: '嚴禁同用' },
  { a: '藜蘆', b: '丹參',  severity: 'contraindicated', category: '十八反', desc: '藜蘆反丹參',             advice: '嚴禁同用' },
  { a: '藜蘆', b: '玄參',  severity: 'contraindicated', category: '十八反', desc: '藜蘆反玄參',             advice: '嚴禁同用' },
  { a: '藜蘆', b: '細辛',  severity: 'contraindicated', category: '十八反', desc: '藜蘆反細辛',             advice: '嚴禁同用' },
  { a: '藜蘆', b: '芍藥',  severity: 'contraindicated', category: '十八反', desc: '藜蘆反芍藥（含白芍、赤芍）', advice: '嚴禁同用' },
  // 十九畏
  { a: '硫黃', b: '朴硝',   severity: 'warning', category: '十九畏', desc: '硫黃畏朴硝，同用恐生不良反應', advice: '避免同用，如需合用須醫師評估' },
  { a: '水銀', b: '砒霜',   severity: 'warning', category: '十九畏', desc: '水銀畏砒霜，毒性疊加',         advice: '避免同用' },
  { a: '狼毒', b: '密陀僧', severity: 'warning', category: '十九畏', desc: '狼毒畏密陀僧',               advice: '避免同用' },
  { a: '巴豆', b: '牽牛子', severity: 'warning', category: '十九畏', desc: '巴豆畏牽牛子，峻瀉傷正',       advice: '避免同用' },
  { a: '丁香', b: '鬱金',   severity: 'warning', category: '十九畏', desc: '丁香畏鬱金，藥性相畏',         advice: '避免同用' },
  { a: '牙硝', b: '三稜',   severity: 'warning', category: '十九畏', desc: '牙硝畏三稜',                 advice: '避免同用' },
  { a: '川烏', b: '犀角',   severity: 'warning', category: '十九畏', desc: '川烏畏犀角',                 advice: '避免同用' },
  { a: '人參', b: '五靈脂', severity: 'warning', category: '十九畏', desc: '人參畏五靈脂，降低補氣效果',     advice: '避免同用' },
  { a: '官桂', b: '赤石脂', severity: 'warning', category: '十九畏', desc: '官桂畏赤石脂',               advice: '避免同用' },
  // 附子屬烏頭類補充
  { a: '附子', b: '半夏',  severity: 'contraindicated', category: '十八反', desc: '附子屬烏頭類，反半夏',   advice: '嚴禁同用' },
  { a: '附子', b: '瓜蔞',  severity: 'contraindicated', category: '十八反', desc: '附子屬烏頭類，反瓜蔞',   advice: '嚴禁同用' },
  { a: '附子', b: '貝母',  severity: 'contraindicated', category: '十八反', desc: '附子屬烏頭類，反貝母',   advice: '嚴禁同用' },
  { a: '附子', b: '白蘞',  severity: 'contraindicated', category: '十八反', desc: '附子屬烏頭類，反白蘞',   advice: '嚴禁同用' },
  { a: '附子', b: '白及',  severity: 'contraindicated', category: '十八反', desc: '附子屬烏頭類，反白及',   advice: '嚴禁同用' },
  // 中西藥交互作用
  { a: '人參',   b: 'warfarin',      severity: 'warning', category: '中西藥', desc: '人參可降低華法林抗凝效果',             advice: '服用抗凝血藥期間避免人參' },
  { a: '人參',   b: '華法林',         severity: 'warning', category: '中西藥', desc: '人參可降低華法林抗凝效果',             advice: '服用抗凝血藥期間避免人參' },
  { a: '甘草',   b: '降壓藥',         severity: 'caution', category: '中西藥', desc: '甘草有升壓作用，可能減弱降壓藥效果',     advice: '高血壓患者慎用甘草，需監測血壓' },
  { a: '甘草',   b: 'antihypertensive', severity: 'caution', category: '中西藥', desc: '甘草有升壓作用，可能減弱降壓藥效果', advice: '高血壓患者慎用甘草' },
  { a: '當歸',   b: 'warfarin',      severity: 'caution', category: '中西藥', desc: '當歸活血，可增強抗凝血藥效果',          advice: '合用時需監測凝血功能' },
  { a: '丹參',   b: 'warfarin',      severity: 'warning', category: '中西藥', desc: '丹參活血化瘀，顯著增強華法林藥效',       advice: '禁止與抗凝血藥同用或需嚴密監測' },
  { a: '麻黃',   b: '降壓藥',         severity: 'warning', category: '中西藥', desc: '麻黃有升壓及興奮交感神經作用',           advice: '高血壓、心臟病患者禁用麻黃' },
  { a: '甘草',   b: 'digoxin',       severity: 'warning', category: '中西藥', desc: '甘草致低鉀血症，增加地高辛毒性風險',     advice: '服用強心苷類藥物時避免甘草' },
  { a: '甘草',   b: '地高辛',         severity: 'warning', category: '中西藥', desc: '甘草致低鉀血症，增加地高辛毒性風險',     advice: '服用強心苷類藥物時避免甘草' },
];

function checkInteractions(herbs) {
  const names = herbs.map(h => h.trim()).filter(Boolean);
  const found = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      RULES.forEach(r => {
        if ((a.includes(r.a) && b.includes(r.b)) || (a.includes(r.b) && b.includes(r.a))) {
          found.push({ ...r, herbA: a, herbB: b });
        }
      });
    }
  }
  found.sort((x, y) => { const o = { contraindicated: 0, warning: 1, caution: 2 }; return (o[x.severity] ?? 3) - (o[y.severity] ?? 3); });
  return found;
}

const S = {
  page: { padding: 16, fontFamily: "'Microsoft YaHei',sans-serif", maxWidth: 960, margin: '0 auto' },
  h1: { fontSize: 20, fontWeight: 700, color: ACCENT, margin: '0 0 14px' },
  card: { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  input: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', flex: 1, minWidth: 180 },
  btn: (c = ACCENT) => ({ padding: '7px 16px', background: c, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  btnSm: (c = ACCENT) => ({ padding: '3px 10px', background: c, color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12 }),
  th: { padding: '8px 6px', textAlign: 'left', fontSize: 12, fontWeight: 700, borderBottom: '2px solid #e5e7eb', background: '#f8fafc', whiteSpace: 'nowrap' },
  td: { padding: '6px', fontSize: 13, borderBottom: '1px solid #f0f0f0' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', borderRadius: 10, padding: 20, width: '90%', maxWidth: 600, maxHeight: '85vh', overflowY: 'auto' },
};

export default function DrugInteraction({ data, showToast, user }) {
  const [tab, setTab] = useState('check');
  const [input, setInput] = useState('');
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState(() => loadJSON(LS_KEY));
  const [histSearch, setHistSearch] = useState('');
  const [showRx, setShowRx] = useState(false);

  const consultations = data?.consultations || [];

  const recentRx = useMemo(() =>
    consultations.filter(c => c.prescription?.length).slice(-30).reverse(),
  [consultations]);

  const filteredHistory = useMemo(() => {
    if (!histSearch) return history;
    const q = histSearch.toLowerCase();
    return history.filter(h => h.herbs.toLowerCase().includes(q) || h.resultSummary?.toLowerCase().includes(q));
  }, [history, histSearch]);

  const doCheck = (herbs) => {
    const list = (herbs || input).split(/[,，、\s\n]+/).map(s => s.trim()).filter(Boolean);
    if (list.length < 2) { showToast('請輸入至少兩種藥物（以逗號分隔）'); return; }
    const found = checkInteractions(list);
    setResults(found);
    const record = {
      id: uid(), date: new Date().toISOString(), user: user?.name || '系統',
      herbs: list.join('、'), count: list.length,
      interactions: found.length,
      resultSummary: found.length ? found.map(f => `${f.herbA}↔${f.herbB}(${SEV[f.severity].label})`).join('; ') : '無交互作用',
      severity: found.length ? found[0].severity : null,
    };
    const updated = [record, ...history].slice(0, 200);
    setHistory(updated);
    saveJSON(LS_KEY, updated);
    if (found.length === 0) showToast('未發現已知交互作用');
    setTab('check');
  };

  const loadFromRx = (c) => {
    const herbs = (c.prescription || []).map(r => r.herb).filter(Boolean).join('、');
    setInput(herbs);
    setShowRx(false);
    showToast(`已載入 ${c.patientName} 的處方（${c.prescription.length} 味藥）`);
  };

  const clearHistory = () => { setHistory([]); saveJSON(LS_KEY, []); showToast('歷史記錄已清除'); };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={S.h1}>藥物相互作用檢查</h2>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#999' }}>資料庫：十八反 / 十九畏 / 中西藥交互</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 16 }}>
        {[['check', '藥物檢查'], ['history', '歷史記錄']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 20px', cursor: 'pointer', fontWeight: tab === k ? 700 : 400, color: tab === k ? ACCENT : '#666', borderBottom: tab === k ? `2px solid ${ACCENT}` : '2px solid transparent', marginBottom: -2, background: 'none', border: 'none', fontSize: 14 }}>{label}</button>
        ))}
      </div>

      {tab === 'check' && (
        <>
          {/* Input area */}
          <div style={S.card}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>輸入藥物名稱（以逗號、頓號或空格分隔）</div>
            <div style={S.row}>
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="例：甘草、海藻、半夏、附子" style={S.input} onKeyDown={e => e.key === 'Enter' && doCheck()} />
              <button onClick={() => doCheck()} style={S.btn()}>檢查交互作用</button>
              <button onClick={() => setShowRx(true)} style={S.btn('#6366f1')}>從處方載入</button>
              <button onClick={() => { setInput(''); setResults([]); }} style={S.btn('#6b7280')}>清除</button>
            </div>
            {input && <div style={{ fontSize: 11, color: '#888' }}>已輸入：{input.split(/[,，、\s\n]+/).filter(Boolean).length} 種藥物</div>}
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#dc2626' }}>發現 {results.length} 項交互作用</div>
              {results.map((r, i) => {
                const sev = SEV[r.severity];
                return (
                  <div key={i} style={{ background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 8, padding: 14, marginBottom: 10, borderLeft: `4px solid ${sev.color}` }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{r.herbA} ↔ {r.herbB}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: '#fff', background: sev.color }}>{sev.label}</span>
                      <span style={{ fontSize: 11, color: '#666', marginLeft: 'auto' }}>{r.category}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#333', marginBottom: 4 }}>{r.desc}</div>
                    <div style={{ fontSize: 12, color: sev.color, fontWeight: 600 }}>建議：{r.advice}</div>
                  </div>
                );
              })}
            </div>
          )}
          {results.length === 0 && input && input.split(/[,，、\s\n]+/).filter(Boolean).length >= 2 && (
            <div style={{ ...S.card, textAlign: 'center', color: '#10b981', fontWeight: 600, padding: 30 }}>
              未發現已知交互作用，處方安全
            </div>
          )}

          {/* Quick reference */}
          <div style={S.card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: ACCENT }}>常見配伍禁忌速查</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 10 }}>
              <div style={{ padding: 10, background: '#fef2f2', borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>十八反</div>
                <div>甘草反甘遂、大戟、海藻、芫花</div>
                <div>烏頭反半夏、瓜蔞、貝母、白蘞、白及</div>
                <div>藜蘆反人參、沙參、丹參、玄參、細辛、芍藥</div>
              </div>
              <div style={{ padding: 10, background: '#fff7ed', borderRadius: 6, fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: '#ea580c', marginBottom: 4 }}>十九畏</div>
                <div>硫黃畏朴硝、水銀畏砒霜、狼毒畏密陀僧</div>
                <div>巴豆畏牽牛子、丁香畏鬱金、牙硝畏三稜</div>
                <div>川烏畏犀角、人參畏五靈脂、官桂畏赤石脂</div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'history' && (
        <div>
          <div style={S.row}>
            <input value={histSearch} onChange={e => setHistSearch(e.target.value)} placeholder="搜尋歷史記錄..." style={{ ...S.input, maxWidth: 300 }} />
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: '#888' }}>共 {history.length} 條記錄</span>
            <button onClick={clearHistory} style={S.btn('#ef4444')}>清除全部</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>{['時間', '操作人', '藥物', '數量', '結果', ''].map((h, i) => <th key={i} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filteredHistory.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#999' }}>暫無檢查記錄</td></tr>}
                {filteredHistory.map(h => {
                  const sev = h.severity ? SEV[h.severity] : null;
                  return (
                    <tr key={h.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={S.td}>{new Date(h.date).toLocaleString('zh-HK', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={S.td}>{h.user}</td>
                      <td style={{ ...S.td, maxWidth: 220, wordBreak: 'break-all' }}>{h.herbs}</td>
                      <td style={{ ...S.td, textAlign: 'center' }}>{h.count}</td>
                      <td style={S.td}>
                        {h.interactions > 0
                          ? <span style={{ color: sev?.color || '#dc2626', fontWeight: 600 }}>{h.interactions} 項{sev?.label || '交互'}</span>
                          : <span style={{ color: '#10b981' }}>安全</span>}
                      </td>
                      <td style={S.td}>
                        <button onClick={() => { setInput(h.herbs.replace(/、/g, '、')); setTab('check'); doCheck(h.herbs.replace(/、/g, '、')); }} style={S.btnSm()}>重查</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Load from prescription modal */}
      {showRx && (
        <div style={S.overlay} onClick={() => setShowRx(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>從處方載入藥物</h3>
            {recentRx.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#999' }}>暫無處方記錄</div>}
            <div style={{ display: 'grid', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
              {recentRx.map(c => (
                <div key={c.id} onClick={() => loadFromRx(c)} style={{ padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 13, transition: 'background .15s' }} onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <strong>{c.patientName}</strong>
                    <span style={{ fontSize: 11, color: '#888' }}>{c.date}</span>
                    <span style={{ fontSize: 11, color: '#888' }}>{c.doctor}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: ACCENT }}>{c.prescription.length} 味藥</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                    {c.prescription.slice(0, 6).map(r => r.herb).join('、')}{c.prescription.length > 6 ? `...+${c.prescription.length - 6}` : ''}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setShowRx(false)} style={S.btn('#6b7280')}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
