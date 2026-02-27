import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';

const ACCENT = '#0e7490';
const LS_ART = 'hcmc_edu_articles';
const LS_DIST = 'hcmc_edu_distribution';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

const CATS = ['全部', '養生', '治療須知', '食療', '穴位', '常見疾病'];

const BUILTIN = [
  { id: 'b1', title: '中醫養生基礎', cat: '養生', builtin: true,
    body: '中醫養生強調「治未病」，即在疾病發生之前進行預防。養生的基本原則包括：順應自然、調和陰陽、形神共養。日常應注意起居有常、飲食有節、勞逸結合。保持心情舒暢，避免七情過極（喜、怒、憂、思、悲、恐、驚）。適當運動如太極拳、八段錦有助強身健體。充足睡眠（建議晚上11時前入睡）讓肝膽經得以休養。' },
  { id: 'b2', title: '四季養生', cat: '養生', builtin: true,
    body: '春季：宜養肝，多食綠色蔬菜，早睡早起，舒展筋骨。夏季：宜養心，避免大量冷飲，適當午休，清淡飲食。秋季：宜養肺，注意保濕潤燥，多食白色食物如百合、雪梨、銀耳。冬季：宜養腎，早睡晚起，適當進補，保暖防寒。四季皆應順應天時，配合節氣調整作息及飲食習慣，方能達到最佳養生效果。' },
  { id: 'b3', title: '常見中藥認識', cat: '養生', builtin: true,
    body: '常用補氣藥：黃芪（補氣固表）、黨參（補中益氣）、白朮（健脾燥濕）。常用補血藥：當歸（補血活血）、熟地黃（滋陰補血）、白芍（養血柔肝）。常用清熱藥：金銀花（清熱解毒）、菊花（疏風清熱）、板藍根（清熱涼血）。服藥注意：中藥一般飯後30分鐘溫服，避免與茶、蘿蔔、綠豆同服。如有不適請立即停藥並告知醫師。' },
  { id: 'b4', title: '針灸Q&A', cat: '治療須知', builtin: true,
    body: 'Q：針灸痛嗎？A：大部分穴位僅有輕微酸脹感，屬正常得氣反應。Q：針灸前要注意什麼？A：避免空腹或過飽，穿著寬鬆衣物。Q：針灸後有何反應？A：部分人會感到輕微疲倦或局部瘀青，屬正常現象，通常1-2天消退。Q：多久做一次？A：急性病每週2-3次，慢性病每週1次，具體由醫師建議。Q：哪些人不適合？A：孕婦（部分穴位禁針）、凝血功能障礙、嚴重心臟病患者需告知醫師。' },
  { id: 'b5', title: '拔罐須知', cat: '治療須知', builtin: true,
    body: '拔罐前：避免空腹，告知醫師皮膚狀況及過敏史。拔罐後注意事項：1. 罐印顏色深淺反映身體狀況，深紫色表示氣滯血瘀較重。2. 拔罐後2小時內避免洗澡，防止寒氣入侵。3. 罐印一般5-7天消退，期間避免搔抓。4. 拔罐後多喝溫水，幫助代謝排毒。5. 同一部位間隔至少3天再拔罐。6. 如出現水泡、破皮請及時回診處理。皮膚過敏、孕婦及經期女性需特別注意。' },
  { id: 'b6', title: '中藥煎煮方法', cat: '治療須知', builtin: true,
    body: '煎藥步驟：1. 將藥材放入砂鍋或不鏽鋼鍋（避免鐵鍋），加冷水浸泡30分鐘，水面高出藥材約2厘米。2. 大火煮沸後轉小火，一般藥煎煮20-30分鐘，補藥煎40-60分鐘。3. 濾出藥汁約200-300毫升為一劑。4. 可煎煮兩次，合併藥汁分早晚服用。注意：先煎藥（如礦石類）需提前煎煮15分鐘；後下藥（如薄荷）在最後5分鐘放入；沖服藥（如三七粉）直接用藥汁沖服。藥渣當日丟棄，勿隔夜。' },
  { id: 'b7', title: '食療推薦', cat: '食療', builtin: true,
    body: '補氣食療：黃芪紅棗雞湯（黃芪15g、紅棗6枚、雞肉適量燉煮1小時）。健脾祛濕：四神湯（山藥、蓮子、芡實、茯苓各15g加豬肚燉煮）。養陰潤肺：雪梨銀耳羹（雪梨1個、銀耳10g、冰糖適量燉煮40分鐘）。補血養顏：當歸生薑羊肉湯（當歸10g、生薑3片、羊肉300g慢燉2小時）。安神助眠：酸棗仁蓮子百合湯（酸棗仁10g、蓮子15g、百合15g煲水代茶飲）。以上食療僅供參考，體質不同適合不同方案，建議諮詢醫師。' },
  { id: 'b8', title: '穴位按摩保健', cat: '穴位', builtin: true,
    body: '日常保健穴位：1. 合谷穴（手背虎口處）：緩解頭痛、牙痛、感冒，每次按壓1-2分鐘。2. 足三里（外膝眼下四橫指）：調理脾胃、增強免疫力，每日按揉3-5分鐘。3. 太衝穴（足背第1、2蹠骨間凹陷處）：疏肝解鬱、緩解情緒壓力。4. 內關穴（手腕橫紋上三橫指正中）：止嘔、安神、緩解心悸。5. 百會穴（頭頂正中）：提神醒腦、改善頭暈。按摩方法：用拇指指腹按壓，力度以酸脹為宜，每穴1-3分鐘，每日2-3次。孕婦禁按合谷及三陰交穴。' },
  { id: 'b9', title: '產後調理', cat: '常見疾病', builtin: true,
    body: '產後坐月注意事項：1. 飲食：產後首週以清淡為主，第二週開始適量進補。宜食生化湯（當歸、川芎、桃仁、炙甘草、炮薑）促進惡露排出。避免生冷、辛辣食物。2. 起居：保持室內通風但避免直接吹風，適當活動促進恢復。3. 情緒：注意產後情緒變化，家人多陪伴支持。4. 哺乳：通草、王不留行可助催乳；麥芽、山楂慎用（回乳作用）。5. 常見問題：產後腰痛可艾灸腎俞穴；產後便秘可食用黑芝麻糊。建議產後2週起接受中醫調理，根據體質制定個人方案。' },
  { id: 'b10', title: '失眠調理', cat: '常見疾病', builtin: true,
    body: '中醫看失眠：失眠多與心、肝、脾有關。常見類型：1. 心脾兩虛型：多夢易醒、面色蒼白，宜歸脾湯加減。2. 肝鬱化火型：煩躁難眠、口苦，宜龍膽瀉肝湯加減。3. 心腎不交型：心煩失眠、腰膝酸軟，宜交泰丸加減。日常調理：睡前泡腳（水溫38-42度，15-20分鐘）；按摩安眠穴、神門穴；避免睡前看手機；晚餐不宜過飽。食療：酸棗仁15g、遠志6g、合歡皮10g煎水代茶，睡前1小時飲用。長期失眠請就醫，切勿自行服用安眠藥。' },
  { id: 'b11', title: '感冒預防與調理', cat: '常見疾病', builtin: true,
    body: '中醫將感冒分為風寒及風熱兩大類。風寒感冒：怕冷、鼻塞流清涕、頭痛，宜服薑茶驅寒（生薑3片、紅糖適量、蔥白2段煮水）。風熱感冒：喉痛、黃涕、發熱，宜飲銀翹散或菊花茶清熱。預防要點：保持充足睡眠；適當運動增強正氣；注意保暖，特別是頸部及足部；流感季節可飲板藍根預防茶。按摩迎香穴（鼻翼兩旁）可緩解鼻塞。出現高燒不退、呼吸困難請立即就醫。' },
];

function loadArt() { try { return JSON.parse(localStorage.getItem(LS_ART) || '[]'); } catch { return []; } }
function saveArt(a) { localStorage.setItem(LS_ART, JSON.stringify(a)); }
function loadDist() { try { return JSON.parse(localStorage.getItem(LS_DIST) || '[]'); } catch { return []; } }
function saveDist(d) { localStorage.setItem(LS_DIST, JSON.stringify(d)); }
function fmt(d) { return d ? new Date(d).toLocaleDateString('zh-HK') : '-'; }

const S = {
  page: { padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 },
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 },
  tabs: { display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' },
  tab: (a) => ({ padding: '7px 16px', borderRadius: 6, border: `1px solid ${a ? ACCENT : '#d1d5db'}`, background: a ? ACCENT : '#fff', color: a ? '#fff' : '#475569', cursor: 'pointer', fontSize: 13, fontWeight: 600 }),
  btn: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  btnSm: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, marginRight: 4 },
  btnOutline: { background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  btnDanger: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  stats: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
  stat: { background: '#f0fdfa', border: `1px solid ${ACCENT}33`, borderRadius: 8, padding: '10px 18px', textAlign: 'center', minWidth: 100 },
  statNum: { fontSize: 22, fontWeight: 700, color: ACCENT },
  statLabel: { fontSize: 12, color: '#64748b' },
  card: { background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 12, border: '1px solid #e2e8f0' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 28, width: '90%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#1e293b' },
  field: { marginBottom: 14 },
  label: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#334155' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' },
  select: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, minWidth: 120 },
  textarea: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box', minHeight: 120, resize: 'vertical' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { background: '#f1f5f9', padding: '10px 8px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' },
  td: { padding: '10px 8px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
  badge: (c) => ({ display: 'inline-block', background: c === '養生' ? '#dcfce7' : c === '治療須知' ? '#fef3c7' : c === '食療' ? '#ffe4e6' : c === '穴位' ? '#dbeafe' : '#f3e8ff', color: c === '養生' ? '#16a34a' : c === '治療須知' ? '#d97706' : c === '食療' ? '#e11d48' : c === '穴位' ? '#2563eb' : '#9333ea', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }),
  filter: { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
};

export default function PatientEducation({ data, showToast, user }) {
  const patients = data?.patients || [];
  const [customArticles, setCustomArticles] = useState(loadArt);
  const [distribution, setDistribution] = useState(loadDist);
  const [tab, setTab] = useState('articles');
  const [catFilter, setCatFilter] = useState('全部');
  const [search, setSearch] = useState('');
  const [viewArt, setViewArt] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editArt, setEditArt] = useState(null);
  const [showSend, setShowSend] = useState(null);
  const [sendPhone, setSendPhone] = useState('');
  const [sendPatient, setSendPatient] = useState('');

  const allArticles = useMemo(() => [...BUILTIN, ...customArticles], [customArticles]);

  const filtered = useMemo(() => {
    let list = allArticles;
    if (catFilter !== '全部') list = list.filter(a => a.cat === catFilter);
    if (search) { const s = search.toLowerCase(); list = list.filter(a => a.title.includes(s) || a.body.includes(s)); }
    return list;
  }, [allArticles, catFilter, search]);

  const distByArticle = useMemo(() => {
    const m = {};
    distribution.forEach(d => { m[d.articleId] = (m[d.articleId] || 0) + 1; });
    return m;
  }, [distribution]);

  function saveCustom(art) {
    let next;
    if (editArt && customArticles.find(a => a.id === editArt.id)) {
      next = customArticles.map(a => a.id === editArt.id ? art : a);
    } else {
      next = [...customArticles, art];
    }
    setCustomArticles(next); saveArt(next); setShowEditor(false); setEditArt(null);
    showToast('文章已儲存');
  }

  function deleteCustom(id) {
    if (!confirm('確定刪除此文章？')) return;
    const next = customArticles.filter(a => a.id !== id);
    setCustomArticles(next); saveArt(next); showToast('已刪除');
  }

  function logDistribution(articleId, patientName, method) {
    const rec = { id: uid(), articleId, patientName, method, date: new Date().toISOString(), user: user?.name || '職員' };
    const next = [...distribution, rec];
    setDistribution(next); saveDist(next); showToast('已記錄派發');
  }

  function sendWhatsApp(article) {
    const phone = sendPhone.replace(/\D/g, '');
    if (!phone) { showToast('請輸入電話號碼'); return; }
    const clinic = getClinicName();
    const summary = article.body.length > 200 ? article.body.substring(0, 200) + '...' : article.body;
    const msg = `${clinic} 健康教育資料\n\n【${article.title}】\n\n${summary}\n\n如有疑問，歡迎致電或回覆此訊息查詢。祝您身體健康！`;
    const url = `https://wa.me/${phone.startsWith('852') ? phone : '852' + phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    if (sendPatient) logDistribution(article.id, sendPatient, 'WhatsApp');
    setShowSend(null); setSendPhone(''); setSendPatient('');
  }

  function printArticle(article) {
    const clinic = getClinicName();
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${article.title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#1e293b;line-height:1.8}h1{color:${ACCENT};font-size:22px;border-bottom:2px solid ${ACCENT};padding-bottom:8px}h2{font-size:14px;color:#64748b;margin-bottom:24px}.content{font-size:15px;white-space:pre-wrap}.footer{margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center}@media print{body{margin:20px}}</style></head><body><h1>${article.title}</h1><h2>${clinic} - 健康教育資料 | 分類：${article.cat}</h2><div class="content">${article.body}</div><div class="footer">${clinic} | 此資料僅供參考，如有不適請諮詢註冊中醫師 | 列印日期：${new Date().toLocaleDateString('zh-HK')}</div><script>window.print();<\/script></body></html>`);
    w.document.close();
  }

  // --- Editor Modal ---
  function EditorModal() {
    const [t, setT] = useState(editArt?.title || '');
    const [c, setC] = useState(editArt?.cat || '養生');
    const [b, setB] = useState(editArt?.body || '');
    return (
      <div style={S.overlay} onClick={() => { setShowEditor(false); setEditArt(null); }}>
        <div style={S.modal} onClick={e => e.stopPropagation()}>
          <h3 style={S.modalTitle}>{editArt ? '編輯文章' : '新增文章'}</h3>
          <div style={S.field}><label style={S.label}>標題</label><input style={S.input} value={t} onChange={e => setT(e.target.value)} placeholder="文章標題" /></div>
          <div style={S.field}><label style={S.label}>分類</label>
            <select style={S.select} value={c} onChange={e => setC(e.target.value)}>
              {CATS.filter(x => x !== '全部').map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div style={S.field}><label style={S.label}>內容</label><textarea style={S.textarea} value={b} onChange={e => setB(e.target.value)} placeholder="文章內容..." rows={8} /></div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={S.btnOutline} onClick={() => { setShowEditor(false); setEditArt(null); }}>取消</button>
            <button style={S.btn} onClick={() => { if (!t.trim() || !b.trim()) { showToast('請填寫標題及內容'); return; } saveCustom({ id: editArt?.id || uid(), title: t.trim(), cat: c, body: b.trim(), builtin: false, created: editArt?.created || new Date().toISOString() }); }}>儲存</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Send Modal ---
  function SendModal() {
    const art = showSend;
    return (
      <div style={S.overlay} onClick={() => setShowSend(null)}>
        <div style={{ ...S.modal, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
          <h3 style={S.modalTitle}>傳送給病人</h3>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>文章：{art.title}</p>
          <div style={S.field}><label style={S.label}>病人姓名</label>
            <select style={{ ...S.select, width: '100%' }} value={sendPatient} onChange={e => setSendPatient(e.target.value)}>
              <option value="">-- 選擇病人 --</option>
              {patients.map(p => <option key={p.id} value={p.name}>{p.name}{p.phone ? ` (${p.phone})` : ''}</option>)}
            </select>
          </div>
          <div style={S.field}><label style={S.label}>WhatsApp 電話號碼</label>
            <input style={S.input} value={sendPhone} onChange={e => setSendPhone(e.target.value)} placeholder="例：91234567"
              onFocus={() => { if (!sendPhone && sendPatient) { const p = patients.find(x => x.name === sendPatient); if (p?.phone) setSendPhone(p.phone); } }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={S.btnOutline} onClick={() => setShowSend(null)}>取消</button>
            <button style={S.btn} onClick={() => sendWhatsApp(art)}>傳送 WhatsApp</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Article Detail View ---
  function ArticleView() {
    const art = viewArt;
    const distCount = distByArticle[art.id] || 0;
    const artDist = distribution.filter(d => d.articleId === art.id);
    return (
      <div style={S.page}>
        <div style={S.header}>
          <button style={S.btnOutline} onClick={() => setViewArt(null)}>← 返回列表</button>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={S.btn} onClick={() => printArticle(art)}>列印</button>
            <button style={S.btn} onClick={() => { setShowSend(art); }}>WhatsApp 傳送</button>
            {!art.builtin && <button style={S.btnOutline} onClick={() => { setEditArt(art); setShowEditor(true); }}>編輯</button>}
          </div>
        </div>
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, color: '#1e293b' }}>{art.title}</h2>
            <span style={S.badge(art.cat)}>{art.cat}</span>
          </div>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>已派發 {distCount} 次 {art.builtin ? '| 預設文章' : `| 建立日期：${fmt(art.created)}`}</p>
          <div style={{ fontSize: 15, lineHeight: 1.9, color: '#334155', whiteSpace: 'pre-wrap' }}>{art.body}</div>
        </div>
        {artDist.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10, color: '#1e293b' }}>派發記錄</h3>
            <table style={S.table}><thead><tr><th style={S.th}>日期</th><th style={S.th}>病人</th><th style={S.th}>方式</th><th style={S.th}>操作人</th></tr></thead>
              <tbody>{artDist.map(d => <tr key={d.id}><td style={S.td}>{fmt(d.date)}</td><td style={S.td}>{d.patientName}</td><td style={S.td}>{d.method}</td><td style={S.td}>{d.user}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {showSend && <SendModal />}
        {showEditor && <EditorModal />}
      </div>
    );
  }

  if (viewArt) return <ArticleView />;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>健康教育資料</h1>
        <button style={S.btn} onClick={() => { setEditArt(null); setShowEditor(true); }}>+ 新增文章</button>
      </div>

      <div style={S.stats}>
        <div style={S.stat}><div style={S.statNum}>{allArticles.length}</div><div style={S.statLabel}>文章總數</div></div>
        <div style={S.stat}><div style={S.statNum}>{customArticles.length}</div><div style={S.statLabel}>自訂文章</div></div>
        <div style={S.stat}><div style={S.statNum}>{distribution.length}</div><div style={S.statLabel}>派發次數</div></div>
        <div style={S.stat}><div style={S.statNum}>{new Set(distribution.map(d => d.patientName)).size}</div><div style={S.statLabel}>受惠病人</div></div>
      </div>

      <div style={S.tabs}>
        {['articles', 'distribution'].map(t => (
          <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>{t === 'articles' ? '文章庫' : '派發記錄'}</button>
        ))}
      </div>

      {tab === 'articles' && <>
        <div style={S.filter}>
          {CATS.map(c => (
            <button key={c} style={{ ...S.tab(catFilter === c), fontSize: 12, padding: '5px 12px' }} onClick={() => setCatFilter(c)}>{c}</button>
          ))}
          <input style={{ ...S.input, maxWidth: 200 }} placeholder="搜尋文章..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {filtered.length === 0 && <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>沒有符合的文章</p>}
        {filtered.map(art => (
          <div key={art.id} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setViewArt(art)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: '#1e293b' }}>{art.title}</span>
                  <span style={S.badge(art.cat)}>{art.cat}</span>
                  {art.builtin && <span style={{ fontSize: 10, color: '#94a3b8', background: '#f1f5f9', borderRadius: 3, padding: '1px 6px' }}>預設</span>}
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{art.body.length > 80 ? art.body.substring(0, 80) + '...' : art.body}</p>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button style={S.btnSm} onClick={() => setViewArt(art)}>閱讀</button>
                <button style={S.btnSm} onClick={() => printArticle(art)}>列印</button>
                <button style={S.btnSm} onClick={() => setShowSend(art)}>傳送</button>
                {!art.builtin && <button style={S.btnDanger} onClick={() => deleteCustom(art.id)}>刪除</button>}
              </div>
            </div>
            {distByArticle[art.id] > 0 && <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>已派發 {distByArticle[art.id]} 次</div>}
          </div>
        ))}
      </>}

      {tab === 'distribution' && <>
        {distribution.length === 0 && <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>尚無派發記錄</p>}
        {distribution.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead><tr><th style={S.th}>日期</th><th style={S.th}>文章</th><th style={S.th}>病人</th><th style={S.th}>方式</th><th style={S.th}>操作人</th></tr></thead>
              <tbody>
                {[...distribution].reverse().map(d => {
                  const art = allArticles.find(a => a.id === d.articleId);
                  return (<tr key={d.id}><td style={S.td}>{fmt(d.date)}</td><td style={S.td}>{art?.title || d.articleId}</td><td style={S.td}>{d.patientName}</td><td style={S.td}>{d.method}</td><td style={S.td}>{d.user}</td></tr>);
                })}
              </tbody>
            </table>
          </div>
        )}
      </>}

      {showEditor && <EditorModal />}
      {showSend && <SendModal />}
    </div>
  );
}
