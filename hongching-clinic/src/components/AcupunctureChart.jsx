import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const REC_KEY = 'hcmc_acu_records';
const FAV_KEY = 'hcmc_acu_favorites';

function loadJSON(k, fb) { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(fb)); } catch { return fb; } }
function saveJSON(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

const MERIDIANS = ['全部','手太陰肺經','手陽明大腸經','足陽明胃經','足太陰脾經','手少陰心經','足少陰腎經','足太陽膀胱經','手太陽小腸經','督脈','任脈','足厥陰肝經','足少陽膽經'];

const ACUPOINTS = [
  { id:1, zh:'合谷',py:'hegu',en:'Hegu (LI4)',mer:'手陽明大腸經',loc:'手背第1、2掌骨間，第2掌骨橈側中點',ind:'頭痛、牙痛、咽喉痛、感冒、面癱',depth:'0.5-1寸' },
  { id:2, zh:'太衝',py:'taichong',en:'Taichong (LR3)',mer:'足厥陰肝經',loc:'足背第1、2蹠骨結合部前方凹陷中',ind:'頭痛、眩暈、高血壓、失眠、月經不調',depth:'0.5-0.8寸' },
  { id:3, zh:'足三里',py:'zusanli',en:'Zusanli (ST36)',mer:'足陽明胃經',loc:'犢鼻穴下3寸，脛骨前嵴外1橫指',ind:'胃痛、腹脹、嘔吐、泄瀉、膝痛、虛勞',depth:'1-2寸' },
  { id:4, zh:'三陰交',py:'sanyinjiao',en:'Sanyinjiao (SP6)',mer:'足太陰脾經',loc:'內踝尖上3寸，脛骨內側面後緣',ind:'月經不調、痛經、失眠、腹脹、泄瀉',depth:'1-1.5寸' },
  { id:5, zh:'百會',py:'baihui',en:'Baihui (GV20)',mer:'督脈',loc:'頭頂正中線與兩耳尖連線的交叉點',ind:'頭痛、眩暈、中風、脫肛、失眠',depth:'0.5-0.8寸（平刺）' },
  { id:6, zh:'內關',py:'neiguan',en:'Neiguan (PC6)',mer:'手少陰心經',loc:'腕橫紋上2寸，掌長肌腱與橈側腕屈肌腱之間',ind:'心痛、心悸、胸悶、胃痛、嘔吐、失眠',depth:'0.5-1寸' },
  { id:7, zh:'曲池',py:'quchi',en:'Quchi (LI11)',mer:'手陽明大腸經',loc:'肘橫紋外側端，屈肘時肘橫紋與肱骨外上髁連線中點',ind:'感冒發熱、咽喉痛、高血壓、上肢痹痛',depth:'1-1.5寸' },
  { id:8, zh:'風池',py:'fengchi',en:'Fengchi (GB20)',mer:'足少陽膽經',loc:'胸鎖乳突肌與斜方肌上端之間凹陷中',ind:'頭痛、眩暈、頸痛、感冒、目赤腫痛',depth:'0.8-1.2寸' },
  { id:9, zh:'太溪',py:'taixi',en:'Taixi (KI3)',mer:'足少陰腎經',loc:'內踝高點與跟腱之間凹陷中',ind:'腰痛、耳鳴、失眠、遺精、月經不調',depth:'0.5-0.8寸' },
  { id:10, zh:'肺俞',py:'feishu',en:'Feishu (BL13)',mer:'足太陽膀胱經',loc:'第3胸椎棘突下旁開1.5寸',ind:'咳嗽、哮喘、鼻塞、盜汗、皮膚病',depth:'0.5-0.8寸（斜刺）' },
  { id:11, zh:'腎俞',py:'shenshu',en:'Shenshu (BL23)',mer:'足太陽膀胱經',loc:'第2腰椎棘突下旁開1.5寸',ind:'腰痛、遺精、陽痿、月經不調、耳鳴',depth:'0.5-1寸' },
  { id:12, zh:'氣海',py:'qihai',en:'Qihai (CV6)',mer:'任脈',loc:'前正中線上，臍下1.5寸',ind:'虛脫、腹痛、泄瀉、月經不調、遺尿',depth:'1-1.5寸' },
  { id:13, zh:'關元',py:'guanyuan',en:'Guanyuan (CV4)',mer:'任脈',loc:'前正中線上，臍下3寸',ind:'虛勞、遺精、陽痿、月經不調、痛經、泄瀉',depth:'1-1.5寸' },
  { id:14, zh:'中脘',py:'zhongwan',en:'Zhongwan (CV12)',mer:'任脈',loc:'前正中線上，臍上4寸',ind:'胃痛、腹脹、嘔吐、泄瀉、黃疸',depth:'1-1.5寸' },
  { id:15, zh:'天樞',py:'tianshu',en:'Tianshu (ST25)',mer:'足陽明胃經',loc:'臍旁2寸',ind:'腹痛、腹脹、便秘、泄瀉、月經不調',depth:'1-1.5寸' },
  { id:16, zh:'列缺',py:'lieque',en:'Lieque (LU7)',mer:'手太陰肺經',loc:'橈骨莖突上方，腕橫紋上1.5寸',ind:'咳嗽、哮喘、咽喉痛、頭痛、頸項強痛',depth:'0.3-0.5寸（斜刺）' },
  { id:17, zh:'後溪',py:'houxi',en:'Houxi (SI3)',mer:'手太陽小腸經',loc:'第5掌指關節尺側近端赤白肉際凹陷中',ind:'頸項強痛、腰背痛、頭痛、耳聾、瘧疾',depth:'0.5-0.8寸' },
  { id:18, zh:'大椎',py:'dazhui',en:'Dazhui (GV14)',mer:'督脈',loc:'第7頸椎棘突下凹陷中',ind:'感冒、發熱、咳嗽、頸項強痛、瘧疾',depth:'0.5-1寸' },
  { id:19, zh:'委中',py:'weizhong',en:'Weizhong (BL40)',mer:'足太陽膀胱經',loc:'膕橫紋中點',ind:'腰痛、下肢痿痹、腹痛、嘔吐、小便不利',depth:'1-1.5寸' },
  { id:20, zh:'陽陵泉',py:'yanglingquan',en:'Yanglingquan (GB34)',mer:'足少陽膽經',loc:'腓骨小頭前下方凹陷中',ind:'脅痛、口苦、嘔吐、膝痛、下肢痿痹',depth:'1-1.5寸' },
  { id:21, zh:'神門',py:'shenmen',en:'Shenmen (HT7)',mer:'手少陰心經',loc:'腕橫紋尺側端，尺側腕屈肌腱橈側凹陷中',ind:'心痛、心悸、失眠、健忘、焦慮',depth:'0.3-0.5寸' },
  { id:22, zh:'太白',py:'taibai',en:'Taibai (SP3)',mer:'足太陰脾經',loc:'第1蹠骨小頭後下方凹陷中',ind:'胃痛、腹脹、嘔吐、泄瀉、便秘',depth:'0.5-0.8寸' },
  { id:23, zh:'湧泉',py:'yongquan',en:'Yongquan (KI1)',mer:'足少陰腎經',loc:'足底前1/3與後2/3交界處凹陷中',ind:'頭痛、眩暈、昏厥、失眠、小便不利',depth:'0.5-0.8寸' },
  { id:24, zh:'肩井',py:'jianjing',en:'Jianjing (GB21)',mer:'足少陽膽經',loc:'大椎穴與肩峰端連線中點',ind:'頸痛、肩背痛、上肢不遂、乳癰、難產',depth:'0.5-0.8寸' },
  { id:25, zh:'印堂',py:'yintang',en:'Yintang (EX-HN3)',mer:'督脈',loc:'兩眉頭連線中點',ind:'頭痛、眩暈、失眠、鼻淵、鼻衄',depth:'0.3-0.5寸（平刺）' },
  { id:26, zh:'膻中',py:'danzhong',en:'Danzhong (CV17)',mer:'任脈',loc:'前正中線上，兩乳頭連線中點',ind:'咳嗽、氣喘、胸悶、乳汁少、嘔吐',depth:'0.3-0.5寸（平刺）' },
  { id:27, zh:'血海',py:'xuehai',en:'Xuehai (SP10)',mer:'足太陰脾經',loc:'髕底內側端上2寸，股四頭肌內側頭隆起處',ind:'月經不調、痛經、崩漏、濕疹、皮膚瘙癢',depth:'1-1.5寸' },
  { id:28, zh:'豐隆',py:'fenglong',en:'Fenglong (ST40)',mer:'足陽明胃經',loc:'外踝尖上8寸，條口穴外1橫指',ind:'咳嗽、痰多、頭痛、眩暈、下肢痿痹',depth:'1-1.5寸' },
  { id:29, zh:'迎香',py:'yingxiang',en:'Yingxiang (LI20)',mer:'手陽明大腸經',loc:'鼻翼外緣中點旁鼻唇溝中',ind:'鼻塞、鼻衄、口歪、面癢',depth:'0.3-0.5寸（斜刺）' },
  { id:30, zh:'睛明',py:'jingming',en:'Jingming (BL1)',mer:'足太陽膀胱經',loc:'目內眥角稍上方凹陷中',ind:'目赤腫痛、迎風流淚、近視、夜盲',depth:'0.5-1寸（沿眶壁慢推）' },
  { id:31, zh:'環跳',py:'huantiao',en:'Huantiao (GB30)',mer:'足少陽膽經',loc:'股骨大轉子高點與骶管裂孔連線外1/3與內2/3交點',ind:'腰腿痛、下肢痿痹、半身不遂',depth:'2-3寸' },
  { id:32, zh:'承山',py:'chengshan',en:'Chengshan (BL57)',mer:'足太陽膀胱經',loc:'小腿後面正中，腓腸肌兩肌腹之間凹陷中',ind:'腰腿痛、痔疾、便秘、小腿抽筋',depth:'1-2寸' },
];

const COMBOS = [
  { name:'頭痛',points:['百會','風池','合谷','太衝','印堂'],note:'頭痛取百會通督，風池祛風，合谷、太衝鎮痛（四關穴）' },
  { name:'失眠',points:['神門','三陰交','百會','內關','太溪'],note:'養心安神，調和陰陽' },
  { name:'腰痛',points:['委中','腎俞','環跳','承山','大椎'],note:'舒筋活絡，補腎強腰' },
  { name:'感冒',points:['大椎','合谷','曲池','風池','列缺'],note:'疏風解表，宣肺利氣' },
  { name:'胃痛',points:['中脘','足三里','內關','天樞','太白'],note:'健脾和胃，理氣止痛' },
  { name:'頸痛',points:['風池','肩井','後溪','大椎','曲池'],note:'疏經通絡，活血止痛' },
  { name:'月經不調',points:['三陰交','關元','血海','太衝','氣海'],note:'調經養血，理氣活血' },
  { name:'焦慮',points:['神門','內關','百會','太衝','三陰交'],note:'寧心安神，疏肝解鬱' },
];

const TECHNIQUES = ['毫針','電針','溫針灸','艾灸','拔罐','刮痧','耳穴','皮膚針'];

const s = {
  wrap:{ fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',padding:16,maxWidth:1100,margin:'0 auto' },
  h1:{ fontSize:22,fontWeight:700,color:ACCENT,marginBottom:16 },
  row:{ display:'flex',gap:12,flexWrap:'wrap',marginBottom:12 },
  input:{ flex:1,minWidth:180,padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:6,fontSize:14 },
  sel:{ padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:6,fontSize:14,background:'#fff' },
  tabs:{ display:'flex',gap:4,marginBottom:16,flexWrap:'wrap' },
  tab:(a)=>({ padding:'6px 16px',borderRadius:20,border:'none',cursor:'pointer',fontSize:13,fontWeight:a?600:400,background:a?ACCENT:'#e5e7eb',color:a?'#fff':'#374151' }),
  card:{ border:'1px solid #e5e7eb',borderRadius:8,padding:14,marginBottom:10,background:'#fff',position:'relative' },
  badge:{ display:'inline-block',padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:600,background:'#e0f2fe',color:ACCENT,marginRight:6 },
  btn:(bg)=>({ padding:'6px 14px',borderRadius:6,border:'none',cursor:'pointer',fontSize:13,fontWeight:600,background:bg||ACCENT,color:'#fff',marginRight:6 }),
  btnO:{ padding:'6px 14px',borderRadius:6,border:`1px solid ${ACCENT}`,cursor:'pointer',fontSize:13,fontWeight:600,background:'#fff',color:ACCENT,marginRight:6 },
  star:(on)=>({ position:'absolute',top:10,right:10,cursor:'pointer',fontSize:20,color:on?'#f59e0b':'#d1d5db',background:'none',border:'none' }),
  grid:{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 },
  label:{ fontSize:13,fontWeight:600,color:'#374151',marginBottom:4,display:'block' },
  textarea:{ width:'100%',padding:8,border:'1px solid #d1d5db',borderRadius:6,fontSize:14,resize:'vertical',minHeight:60,boxSizing:'border-box' },
  chip:(on)=>({ padding:'4px 12px',borderRadius:16,border:on?`2px solid ${ACCENT}`:'1px solid #d1d5db',cursor:'pointer',fontSize:12,background:on?'#e0f2fe':'#fff',color:on?ACCENT:'#6b7280',fontWeight:on?600:400 }),
  empty:{ textAlign:'center',padding:40,color:'#9ca3af',fontSize:15 },
  table:{ width:'100%',borderCollapse:'collapse',fontSize:13 },
  th:{ textAlign:'left',padding:'8px 10px',borderBottom:`2px solid ${ACCENT}`,color:ACCENT,fontWeight:600 },
  td:{ padding:'8px 10px',borderBottom:'1px solid #e5e7eb' },
};

export default function AcupunctureChart({ data, showToast, user }) {
  const [tab, setTab] = useState('browse');
  const [q, setQ] = useState('');
  const [meridian, setMeridian] = useState('全部');
  const [favs, setFavs] = useState(() => loadJSON(FAV_KEY, []));
  const [records, setRecords] = useState(() => loadJSON(REC_KEY, []));
  const [selPts, setSelPts] = useState([]);
  const [recForm, setRecForm] = useState({ date: new Date().toISOString().slice(0, 10), patient: '', technique: '毫針', notes: '' });
  const [expand, setExpand] = useState(null);
  const [comboIdx, setComboIdx] = useState(null);

  const filtered = useMemo(() => {
    let list = ACUPOINTS;
    if (tab === 'favorites') list = list.filter(p => favs.includes(p.id));
    if (meridian !== '全部') list = list.filter(p => p.mer === meridian);
    if (q.trim()) {
      const lq = q.trim().toLowerCase();
      list = list.filter(p => p.zh.includes(lq) || p.py.includes(lq) || p.en.toLowerCase().includes(lq) || p.ind.includes(lq) || p.mer.includes(lq));
    }
    return list;
  }, [q, meridian, tab, favs]);

  const toggleFav = (id) => {
    const next = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id];
    setFavs(next); saveJSON(FAV_KEY, next);
  };

  const toggleSel = (zh) => setSelPts(prev => prev.includes(zh) ? prev.filter(x => x !== zh) : [...prev, zh]);

  const applyCombo = (idx) => {
    setComboIdx(idx);
    setSelPts(COMBOS[idx].points);
    if (showToast) showToast(`已載入「${COMBOS[idx].name}」常用穴位組合`);
  };

  const saveRecord = () => {
    if (!recForm.patient.trim()) { if (showToast) showToast('請輸入患者姓名'); return; }
    if (!selPts.length) { if (showToast) showToast('請選擇穴位'); return; }
    const rec = { id: Date.now(), ...recForm, points: [...selPts], createdBy: user?.name || '未知' };
    const next = [rec, ...records];
    setRecords(next); saveJSON(REC_KEY, next);
    setSelPts([]); setRecForm({ date: new Date().toISOString().slice(0, 10), patient: '', technique: '毫針', notes: '' }); setComboIdx(null);
    if (showToast) showToast('治療記錄已儲存');
    setTab('records');
  };

  const delRecord = (id) => {
    const next = records.filter(r => r.id !== id);
    setRecords(next); saveJSON(REC_KEY, next);
    if (showToast) showToast('記錄已刪除');
  };

  const printChart = (pts) => {
    const clinic = getClinicName();
    const rows = pts.map(zh => ACUPOINTS.find(p => p.zh === zh)).filter(Boolean);
    const html = `<html><head><meta charset="utf-8"><title>${escapeHtml(clinic)} - 穴位處方</title>
<style>body{font-family:-apple-system,sans-serif;padding:30px;max-width:800px;margin:0 auto}
h1{color:${ACCENT};font-size:22px;border-bottom:2px solid ${ACCENT};padding-bottom:8px}
table{width:100%;border-collapse:collapse;margin-top:16px}th{background:${ACCENT};color:#fff;padding:8px 10px;text-align:left;font-size:13px}
td{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px}.foot{margin-top:24px;font-size:12px;color:#888;border-top:1px solid #ccc;padding-top:8px}
@media print{body{padding:10px}}</style></head><body>
<h1>${escapeHtml(clinic)} - 穴位處方</h1><p>日期：${new Date().toLocaleDateString('zh-TW')}</p>
<table><tr><th>穴位</th><th>拼音</th><th>經絡</th><th>位置</th><th>針刺深度</th></tr>
${rows.map(p => `<tr><td><b>${escapeHtml(p.zh)}</b><br><small>${escapeHtml(p.en)}</small></td><td>${escapeHtml(p.py)}</td><td>${escapeHtml(p.mer)}</td><td>${escapeHtml(p.loc)}</td><td>${escapeHtml(p.depth)}</td></tr>`).join('')}
</table><div class="foot">* 此處方僅供參考，實際治療請遵醫囑。<br>${escapeHtml(clinic)} | 列印時間：${new Date().toLocaleString('zh-TW')}</div>
<script>window.onload=function(){window.print()}<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const TABS = [
    { key:'browse',label:'穴位瀏覽' },
    { key:'combos',label:'常用組合' },
    { key:'treatment',label:'治療記錄' },
    { key:'records',label:'歷史記錄' },
    { key:'favorites',label:`收藏 (${favs.length})` },
  ];

  return (
    <div style={s.wrap}>
      <h2 style={s.h1}>穴位圖譜</h2>

      <div style={s.tabs}>
        {TABS.map(t => <button key={t.key} style={s.tab(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {/* ===== Browse / Favorites ===== */}
      {(tab === 'browse' || tab === 'favorites') && <>
        <div style={s.row}>
          <input style={s.input} placeholder="搜尋穴位（名稱、拼音、主治）" value={q} onChange={e => setQ(e.target.value)} />
          <select style={s.sel} value={meridian} onChange={e => setMeridian(e.target.value)}>
            {MERIDIANS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        {!filtered.length && <div style={s.empty}>沒有找到穴位</div>}
        {filtered.map(p => (
          <div key={p.id} style={s.card}>
            <button style={s.star(favs.includes(p.id))} onClick={() => toggleFav(p.id)} title="收藏">{favs.includes(p.id) ? '\u2605' : '\u2606'}</button>
            <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:6 }}>
              <span style={{ fontSize:17,fontWeight:700,color:'#111' }}>{p.zh}</span>
              <span style={{ fontSize:13,color:'#6b7280' }}>{p.py}</span>
              <span style={s.badge}>{p.mer}</span>
            </div>
            <div style={{ fontSize:13,color:'#374151',marginBottom:4 }}><b>英文：</b>{p.en}</div>
            <div style={{ fontSize:13,color:'#374151',marginBottom:4 }}><b>位置：</b>{p.loc}</div>
            {expand === p.id && <>
              <div style={{ fontSize:13,color:'#374151',marginBottom:4 }}><b>主治：</b>{p.ind}</div>
              <div style={{ fontSize:13,color:'#374151',marginBottom:4 }}><b>針刺深度：</b>{p.depth}</div>
            </>}
            <div style={{ display:'flex',gap:6,marginTop:8 }}>
              <button style={s.btnO} onClick={() => setExpand(expand === p.id ? null : p.id)}>{expand === p.id ? '收起' : '詳細'}</button>
              <button style={s.btn(selPts.includes(p.zh) ? '#dc2626' : ACCENT)} onClick={() => toggleSel(p.zh)}>
                {selPts.includes(p.zh) ? '取消選取' : '選取'}
              </button>
            </div>
          </div>
        ))}
        {selPts.length > 0 && (
          <div style={{ position:'sticky',bottom:0,background:'#f0fdfa',border:`1px solid ${ACCENT}`,borderRadius:8,padding:12,marginTop:12,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8 }}>
            <div><b>已選穴位 ({selPts.length})：</b>{selPts.join('、')}</div>
            <div style={{ display:'flex',gap:6 }}>
              <button style={s.btn(ACCENT)} onClick={() => { setTab('treatment'); }}>建立治療記錄</button>
              <button style={s.btn('#059669')} onClick={() => printChart(selPts)}>列印穴位表</button>
              <button style={s.btn('#dc2626')} onClick={() => setSelPts([])}>清除</button>
            </div>
          </div>
        )}
      </>}

      {/* ===== Combos ===== */}
      {tab === 'combos' && (
        <div>
          {COMBOS.map((c, i) => (
            <div key={i} style={{ ...s.card, borderLeft: comboIdx === i ? `4px solid ${ACCENT}` : '4px solid transparent' }}>
              <div style={{ fontSize:16,fontWeight:700,color:'#111',marginBottom:6 }}>{c.name}</div>
              <div style={{ display:'flex',gap:6,flexWrap:'wrap',marginBottom:8 }}>
                {c.points.map(p => <span key={p} style={s.chip(true)}>{p}</span>)}
              </div>
              <div style={{ fontSize:13,color:'#6b7280',marginBottom:8 }}>{c.note}</div>
              <div style={{ display:'flex',gap:6 }}>
                <button style={s.btn(ACCENT)} onClick={() => applyCombo(i)}>使用此組合</button>
                <button style={s.btn('#059669')} onClick={() => printChart(c.points)}>列印</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Treatment Record ===== */}
      {tab === 'treatment' && (
        <div style={s.card}>
          <div style={{ fontSize:16,fontWeight:700,marginBottom:12,color:'#111' }}>新增治療記錄</div>
          <div style={s.grid}>
            <div>
              <label style={s.label}>日期</label>
              <input type="date" style={{ ...s.input, flex:'none',width:'100%',boxSizing:'border-box' }} value={recForm.date} onChange={e => setRecForm({ ...recForm, date: e.target.value })} />
            </div>
            <div>
              <label style={s.label}>患者姓名</label>
              <input style={{ ...s.input, flex:'none',width:'100%',boxSizing:'border-box' }} placeholder="輸入患者姓名" value={recForm.patient} onChange={e => setRecForm({ ...recForm, patient: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop:10 }}>
            <label style={s.label}>手法</label>
            <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
              {TECHNIQUES.map(t => <button key={t} style={s.chip(recForm.technique === t)} onClick={() => setRecForm({ ...recForm, technique: t })}>{t}</button>)}
            </div>
          </div>
          <div style={{ marginTop:10 }}>
            <label style={s.label}>選取穴位 ({selPts.length})</label>
            <div style={{ display:'flex',gap:6,flexWrap:'wrap',marginBottom:8 }}>
              {ACUPOINTS.map(p => <button key={p.id} style={s.chip(selPts.includes(p.zh))} onClick={() => toggleSel(p.zh)}>{p.zh}</button>)}
            </div>
            {comboIdx !== null && <div style={{ fontSize:12,color:ACCENT }}>已套用組合：{COMBOS[comboIdx].name}</div>}
            <div style={{ display:'flex',gap:6,marginTop:6,flexWrap:'wrap' }}>
              {COMBOS.map((c, i) => <button key={i} style={s.btn('#6b7280')} onClick={() => applyCombo(i)}>+ {c.name}</button>)}
            </div>
          </div>
          <div style={{ marginTop:10 }}>
            <label style={s.label}>備註</label>
            <textarea style={s.textarea} placeholder="治療備註、患者反應等" value={recForm.notes} onChange={e => setRecForm({ ...recForm, notes: e.target.value })} />
          </div>
          <div style={{ marginTop:14,display:'flex',gap:8 }}>
            <button style={s.btn(ACCENT)} onClick={saveRecord}>儲存記錄</button>
            <button style={s.btn('#059669')} onClick={() => selPts.length ? printChart(selPts) : (showToast && showToast('請先選擇穴位'))}>列印穴位表</button>
          </div>
        </div>
      )}

      {/* ===== Records History ===== */}
      {tab === 'records' && (
        <div>
          {!records.length && <div style={s.empty}>暫無治療記錄</div>}
          {records.length > 0 && (
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>日期</th><th style={s.th}>患者</th><th style={s.th}>穴位</th><th style={s.th}>手法</th><th style={s.th}>備註</th><th style={s.th}>操作</th>
              </tr></thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td style={s.td}>{r.date}</td>
                    <td style={s.td}>{r.patient}</td>
                    <td style={s.td}><div style={{ display:'flex',gap:4,flexWrap:'wrap' }}>{r.points.map(p => <span key={p} style={s.badge}>{p}</span>)}</div></td>
                    <td style={s.td}>{r.technique}</td>
                    <td style={{ ...s.td,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.notes || '-'}</td>
                    <td style={s.td}>
                      <button style={s.btn('#059669')} onClick={() => printChart(r.points)}>列印</button>
                      <button style={s.btn('#dc2626')} onClick={() => delRecord(r.id)}>刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
