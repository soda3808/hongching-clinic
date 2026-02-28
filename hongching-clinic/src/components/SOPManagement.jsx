import { useState, useMemo } from 'react';
import { uid } from '../data';
import { getClinicName } from '../tenant';

const SOP_KEY = 'hcmc_sops';
const ACK_KEY = 'hcmc_sop_acks';
const ACCENT = '#0e7490';
const CATS = ['臨床', '行政', '安全', '品質', '營運'];
const CAT_COLOR = { '臨床': '#0e7490', '行政': '#7c3aed', '安全': '#dc2626', '品質': '#d97706', '營運': '#059669' };

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const today = () => new Date().toISOString().split('T')[0];

const DEFAULT_SOPS = [
  { id: 'def1', title: '病人掛號流程', category: '行政', version: '1.0', approvedBy: '診所主管', effectiveDate: '2024-01-01', steps: [
    { text: '病人到達前台，接待員主動問候', responsible: '接待員' },
    { text: '詢問是否初診或覆診，初診需填寫個人資料表', responsible: '接待員' },
    { text: '核對身份證明文件及聯絡資料', responsible: '接待員' },
    { text: '輸入或更新病人資料至系統', responsible: '接待員' },
    { text: '分配候診號碼，告知預計等候時間', responsible: '接待員' },
    { text: '引導病人到候診區就座', responsible: '接待員' },
  ] },
  { id: 'def2', title: '診症標準流程', category: '臨床', version: '1.0', approvedBy: '主診醫師', effectiveDate: '2024-01-01', steps: [
    { text: '呼叫病人進入診室，核對姓名', responsible: '護士' },
    { text: '量度基本生命徵象（血壓、脈搏、體溫）', responsible: '護士' },
    { text: '醫師進行望聞問切四診', responsible: '醫師' },
    { text: '記錄病歷及辨證分型', responsible: '醫師' },
    { text: '開立處方或治療方案', responsible: '醫師' },
    { text: '向病人解釋病情及治療計劃', responsible: '醫師' },
    { text: '列印處方並交予配藥處', responsible: '醫師' },
  ] },
  { id: 'def3', title: '配藥流程', category: '臨床', version: '1.0', approvedBy: '主診醫師', effectiveDate: '2024-01-01', steps: [
    { text: '接收處方單，核對病人姓名及藥物', responsible: '配藥員' },
    { text: '按處方逐一稱量藥材', responsible: '配藥員' },
    { text: '雙人核對藥材品種及劑量', responsible: '配藥員/覆核員' },
    { text: '包裝藥材並標示服用方法', responsible: '配藥員' },
    { text: '向病人講解煎煮方法及服藥注意事項', responsible: '配藥員' },
    { text: '記錄配藥紀錄於系統', responsible: '配藥員' },
  ] },
  { id: 'def4', title: '收費流程', category: '行政', version: '1.0', approvedBy: '診所主管', effectiveDate: '2024-01-01', steps: [
    { text: '接收醫師處方/治療項目清單', responsible: '收費員' },
    { text: '核算診金、藥費及治療費用', responsible: '收費員' },
    { text: '告知病人費用明細', responsible: '收費員' },
    { text: '接受付款（現金/信用卡/電子支付）', responsible: '收費員' },
    { text: '開立收據並交予病人', responsible: '收費員' },
    { text: '將收費記錄輸入系統', responsible: '收費員' },
  ] },
  { id: 'def5', title: '針灸操作規範', category: '臨床', version: '1.0', approvedBy: '主診醫師', effectiveDate: '2024-01-01', steps: [
    { text: '確認病人同意書已簽署', responsible: '護士' },
    { text: '核對穴位處方，評估禁忌症', responsible: '醫師' },
    { text: '清潔消毒施針部位', responsible: '醫師' },
    { text: '使用一次性無菌針具進行施針', responsible: '醫師' },
    { text: '留針期間每10分鐘巡視病人狀況', responsible: '護士' },
    { text: '起針後檢查針數，消毒針孔', responsible: '醫師' },
    { text: '將使用過的針具放入利器箱處理', responsible: '護士' },
    { text: '記錄治療穴位及病人反應', responsible: '醫師' },
  ] },
  { id: 'def6', title: '感染控制指引', category: '安全', version: '1.0', approvedBy: '診所主管', effectiveDate: '2024-01-01', steps: [
    { text: '全體員工每日上班前量度體溫', responsible: '全體員工' },
    { text: '診室每位病人使用後進行表面消毒', responsible: '護士' },
    { text: '醫護人員診症前後使用酒精搓手液', responsible: '醫護人員' },
    { text: '一次性用品用後即棄，不得重複使用', responsible: '全體員工' },
    { text: '醫療廢物按規定分類處理', responsible: '護士' },
    { text: '每日結束營業後全面消毒診所', responsible: '清潔人員' },
  ] },
  { id: 'def7', title: '藥材倉管理', category: '營運', version: '1.0', approvedBy: '診所主管', effectiveDate: '2024-01-01', steps: [
    { text: '每日檢查藥材倉溫濕度並記錄', responsible: '倉務員' },
    { text: '新到貨藥材需核對品名、數量及有效期', responsible: '倉務員' },
    { text: '按先進先出原則存放藥材', responsible: '倉務員' },
    { text: '每週檢查庫存量，低於安全存量及時訂購', responsible: '倉務員' },
    { text: '每月進行一次盤點並與系統核對', responsible: '倉務員/主管' },
    { text: '過期或變質藥材立即隔離並記錄銷毀', responsible: '倉務員' },
  ] },
  { id: 'def8', title: '緊急情況處理', category: '安全', version: '1.0', approvedBy: '診所主管', effectiveDate: '2024-01-01', steps: [
    { text: '發現緊急情況立即通知當值醫師', responsible: '發現者' },
    { text: '醫師評估病人狀況，進行初步急救', responsible: '醫師' },
    { text: '如需送院，立即致電999召喚救護車', responsible: '接待員' },
    { text: '準備病人基本資料及用藥記錄供急救人員參考', responsible: '護士' },
    { text: '通知病人家屬', responsible: '接待員' },
    { text: '事後填寫意外事故報告表', responsible: '當值醫師' },
  ] },
  { id: 'def9', title: '開業/閉店檢查', category: '營運', version: '1.0', approvedBy: '診所主管', effectiveDate: '2024-01-01', steps: [
    { text: '【開業】開啓燈光、空調及醫療設備', responsible: '當值員工' },
    { text: '【開業】檢查候診區及診室整潔', responsible: '當值員工' },
    { text: '【開業】啓動電腦系統，確認預約清單', responsible: '接待員' },
    { text: '【開業】確認藥材及消耗品備量充足', responsible: '配藥員' },
    { text: '【閉店】核對當日收入並完成日結', responsible: '收費員' },
    { text: '【閉店】清潔消毒診室及公共區域', responsible: '清潔人員' },
    { text: '【閉店】關閉醫療設備、電腦及空調', responsible: '當值員工' },
    { text: '【閉店】鎖門並啓動保安系統', responsible: '當值員工' },
  ] },
  { id: 'def10', title: '投訴處理流程', category: '品質', version: '1.0', approvedBy: '診所主管', effectiveDate: '2024-01-01', steps: [
    { text: '耐心聆聽病人投訴內容，表示理解', responsible: '接待員' },
    { text: '記錄投訴詳情（日期、內容、涉及人員）', responsible: '接待員' },
    { text: '即時可處理的問題當場解決', responsible: '接待員/主管' },
    { text: '需調查的事件於3個工作天內回覆', responsible: '診所主管' },
    { text: '制定改善措施並跟進執行', responsible: '診所主管' },
    { text: '將投訴記錄歸檔並於月會中檢討', responsible: '診所主管' },
  ] },
];

const S = {
  page: { padding: 16, maxWidth: 960, margin: '0 auto' },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 12, color: ACCENT },
  tabs: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  tab: (a) => ({ padding: '7px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: a ? ACCENT : '#e5e7eb', color: a ? '#fff' : '#333' }),
  card: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0002', padding: 16, marginBottom: 16 },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 },
  stat: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0002', padding: 14, textAlign: 'center' },
  statN: { fontSize: 24, fontWeight: 700, color: ACCENT },
  statL: { fontSize: 12, color: '#64748b', marginTop: 2 },
  btn: { padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: ACCENT, color: '#fff' },
  btnSm: { padding: '4px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: ACCENT, color: '#fff' },
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  select: { padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' },
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '8px 6px', background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', textAlign: 'left', fontWeight: 700, fontSize: 12, color: '#475569', whiteSpace: 'nowrap' },
  td: { padding: '8px 6px', borderBottom: '1px solid #f1f5f9', fontSize: 13 },
  badge: (c) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#fff', background: c || '#94a3b8' }),
  label: { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0005', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 600, maxHeight: '85vh', overflowY: 'auto' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  stepRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 },
  stepNum: { minWidth: 24, height: 24, borderRadius: '50%', background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 },
};

export default function SOPManagement({ showToast, user }) {
  const [sops, setSops] = useState(() => { const saved = load(SOP_KEY, null); return saved || [...DEFAULT_SOPS]; });
  const [acks, setAcks] = useState(() => load(ACK_KEY, []));
  const [tab, setTab] = useState('list');
  const [filterCat, setFilterCat] = useState('');
  const [search, setSearch] = useState('');
  const [viewSop, setViewSop] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const emptyForm = { title: '', category: '臨床', version: '1.0', approvedBy: '', effectiveDate: today(), steps: [{ text: '', responsible: '' }] };
  const [form, setForm] = useState(emptyForm);

  const saveSops = (n) => { setSops(n); save(SOP_KEY, n); };
  const saveAcks = (n) => { setAcks(n); save(ACK_KEY, n); };

  const stats = useMemo(() => {
    const total = sops.length;
    const byCat = CATS.map(c => ({ cat: c, count: sops.filter(s => s.category === c).length }));
    const myAcks = acks.filter(a => a.user === (user?.name || user?.username));
    const ackRate = total ? Math.round(myAcks.length / total * 100) : 0;
    const versions = sops.reduce((s, p) => s + (p.history?.length || 0), 0);
    return { total, byCat, ackRate, myAcks: myAcks.length, versions };
  }, [sops, acks, user]);

  const filtered = useMemo(() => {
    let r = sops;
    if (filterCat) r = r.filter(s => s.category === filterCat);
    if (search) r = r.filter(s => s.title.includes(search));
    return r;
  }, [sops, filterCat, search]);

  const openForm = (sop) => {
    setEditItem(sop || null);
    setForm(sop ? { title: sop.title, category: sop.category, version: sop.version, approvedBy: sop.approvedBy, effectiveDate: sop.effectiveDate, steps: [...sop.steps.map(s => ({ ...s }))] } : { ...emptyForm, steps: [{ text: '', responsible: '' }] });
    setShowForm(true);
  };

  const addStep = () => setForm({ ...form, steps: [...form.steps, { text: '', responsible: '' }] });
  const removeStep = (i) => setForm({ ...form, steps: form.steps.filter((_, idx) => idx !== i) });
  const updateStep = (i, field, val) => { const ns = [...form.steps]; ns[i] = { ...ns[i], [field]: val }; setForm({ ...form, steps: ns }); };

  const handleSave = () => {
    if (!form.title) return showToast?.('請填寫SOP標題');
    if (!form.steps.some(s => s.text.trim())) return showToast?.('請至少填寫一個步驟');
    const cleanSteps = form.steps.filter(s => s.text.trim());
    if (editItem) {
      const history = editItem.history || [];
      history.push({ version: editItem.version, date: today(), changedBy: user?.name || '系統' });
      saveSops(sops.map(s => s.id === editItem.id ? { ...editItem, ...form, steps: cleanSteps, history } : s));
    } else {
      saveSops([...sops, { ...form, steps: cleanSteps, id: uid(), history: [] }]);
    }
    setShowForm(false);
    showToast?.('已儲存SOP');
  };

  const delSop = (id) => { saveSops(sops.filter(s => s.id !== id)); showToast?.('已刪除'); };

  const acknowledge = (sopId) => {
    const userName = user?.name || user?.username || '未知用戶';
    if (acks.some(a => a.sopId === sopId && a.user === userName)) return showToast?.('您已確認過此SOP');
    saveAcks([...acks, { id: uid(), sopId, user: userName, date: today() }]);
    showToast?.('已確認閱讀');
  };

  const getSopAcks = (sopId) => acks.filter(a => a.sopId === sopId);

  const printSop = (sop) => {
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    const stepsHtml = sop.steps.map((s, i) => `<tr><td style="padding:8px;border:1px solid #ddd;text-align:center;font-weight:700;color:${ACCENT}">${i + 1}</td><td style="padding:8px;border:1px solid #ddd">${s.text}</td><td style="padding:8px;border:1px solid #ddd">${s.responsible}</td></tr>`).join('');
    const ackList = getSopAcks(sop.id);
    const ackHtml = ackList.length ? `<h3 style="margin-top:24px">確認閱讀記錄</h3><table style="width:100%;border-collapse:collapse">${ackList.map(a => `<tr><td style="padding:6px;border:1px solid #ddd">${a.user}</td><td style="padding:6px;border:1px solid #ddd">${a.date}</td></tr>`).join('')}</table>` : '';
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${sop.title}</title></head><body style="font-family:'Microsoft YaHei',sans-serif;padding:40px;max-width:700px;margin:0 auto">
      <h2 style="color:${ACCENT};margin-bottom:4px">${getClinicName()}</h2>
      <h1 style="font-size:22px;margin:12px 0">${sop.title}</h1>
      <p style="color:#64748b;font-size:13px">分類：${sop.category} | 版本：${sop.version} | 生效日期：${sop.effectiveDate} | 批准人：${sop.approvedBy || '-'}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <thead><tr><th style="padding:8px;border:1px solid #ddd;background:#f1f5f9;width:40px">步驟</th><th style="padding:8px;border:1px solid #ddd;background:#f1f5f9">內容</th><th style="padding:8px;border:1px solid #ddd;background:#f1f5f9;width:100px">負責人</th></tr></thead>
        <tbody>${stepsHtml}</tbody>
      </table>
      ${ackHtml}
      <p style="margin-top:30px;font-size:11px;color:#94a3b8;text-align:center">列印日期：${today()} | ${getClinicName()} SOP管理系統</p>
      <script>setTimeout(()=>{window.print();},300)<\/script></body></html>`);
    w.document.close();
  };

  const TABS = [['list', 'SOP列表'], ['acks', '確認記錄'], ['versions', '版本歷史']];

  return (
    <div style={S.page}>
      <h2 style={S.title}>SOP管理</h2>

      <div style={S.stats}>
        {[['總SOP數', stats.total], ['我的確認', stats.myAcks + '/' + stats.total], ['確認率', stats.ackRate + '%'], ['版本更新', stats.versions]].map(([l, v]) => (
          <div key={l} style={S.stat}><div style={S.statN}>{v}</div><div style={S.statL}>{l}</div></div>
        ))}
      </div>

      <div style={S.tabs}>
        {TABS.map(([k, l]) => <button key={k} style={S.tab(tab === k)} onClick={() => { setTab(k); setViewSop(null); }}>{l}</button>)}
      </div>

      {/* SOP List */}
      {tab === 'list' && !viewSop && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select style={S.select} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                <option value="">全部分類</option>
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
              <input style={{ ...S.input, width: 180 }} placeholder="搜尋SOP..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button style={S.btn} onClick={() => openForm()}>+ 新增SOP</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tbl}>
              <thead><tr>{['標題', '分類', '版本', '生效日期', '已確認', '操作'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(s => {
                  const ackCount = getSopAcks(s.id).length;
                  const myAcked = acks.some(a => a.sopId === s.id && a.user === (user?.name || user?.username));
                  return (
                    <tr key={s.id}>
                      <td style={{ ...S.td, cursor: 'pointer', color: ACCENT, fontWeight: 600 }} onClick={() => setViewSop(s)}>{s.title}</td>
                      <td style={S.td}><span style={S.badge(CAT_COLOR[s.category])}>{s.category}</span></td>
                      <td style={S.td}>v{s.version}</td>
                      <td style={S.td}>{s.effectiveDate}</td>
                      <td style={S.td}>{ackCount}人</td>
                      <td style={S.td}>
                        {!myAcked && <button style={{ ...S.btnSm, background: '#16a34a', marginRight: 4 }} onClick={() => acknowledge(s.id)}>確認</button>}
                        <button style={{ ...S.btnSm, marginRight: 4 }} onClick={() => setViewSop(s)}>查看</button>
                        <button style={{ ...S.btnSm, background: '#64748b', marginRight: 4 }} onClick={() => openForm(s)}>編輯</button>
                        <button style={{ ...S.btnSm, background: '#7c3aed', marginRight: 4 }} onClick={() => printSop(s)}>列印</button>
                        {!s.id.startsWith('def') && <button style={{ ...S.btnSm, background: '#dc2626' }} onClick={() => delSop(s.id)}>刪除</button>}
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#94a3b8' }}>暫無SOP</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SOP Detail View */}
      {tab === 'list' && viewSop && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <button style={{ ...S.btnSm, background: '#64748b' }} onClick={() => setViewSop(null)}>← 返回列表</button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...S.btnSm, background: '#16a34a' }} onClick={() => acknowledge(viewSop.id)}>確認閱讀</button>
              <button style={{ ...S.btnSm, background: '#7c3aed' }} onClick={() => printSop(viewSop)}>列印</button>
              <button style={S.btnSm} onClick={() => openForm(viewSop)}>編輯</button>
            </div>
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: ACCENT, marginBottom: 4 }}>{viewSop.title}</h3>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            <span style={S.badge(CAT_COLOR[viewSop.category])}>{viewSop.category}</span>
            <span style={{ marginLeft: 12 }}>版本：v{viewSop.version}</span>
            <span style={{ marginLeft: 12 }}>生效日期：{viewSop.effectiveDate}</span>
            <span style={{ marginLeft: 12 }}>批准人：{viewSop.approvedBy || '-'}</span>
          </p>
          <div style={{ marginBottom: 16 }}>
            {viewSop.steps.map((step, i) => (
              <div key={i} style={{ ...S.stepRow, padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={S.stepNum}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14 }}>{step.text}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>負責人：{step.responsible}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8 }}>確認閱讀記錄 ({getSopAcks(viewSop.id).length}人)</h4>
            {getSopAcks(viewSop.id).length ? getSopAcks(viewSop.id).map(a => (
              <div key={a.id} style={{ fontSize: 13, padding: '3px 0' }}>{a.user} - {a.date}</div>
            )) : <div style={{ fontSize: 13, color: '#94a3b8' }}>暫無確認記錄</div>}
          </div>
        </div>
      )}

      {/* Acknowledgement Records */}
      {tab === 'acks' && (
        <div style={S.card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#475569' }}>全部確認記錄</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tbl}>
              <thead><tr>{['SOP名稱', '確認人', '確認日期'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {acks.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(a => {
                  const sop = sops.find(s => s.id === a.sopId);
                  return (
                    <tr key={a.id}>
                      <td style={S.td}>{sop?.title || '-'}</td>
                      <td style={S.td}>{a.user}</td>
                      <td style={S.td}>{a.date}</td>
                    </tr>
                  );
                })}
                {!acks.length && <tr><td colSpan={3} style={{ ...S.td, textAlign: 'center', color: '#94a3b8' }}>暫無確認記錄</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Version History */}
      {tab === 'versions' && (
        <div style={S.card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#475569' }}>版本歷史</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tbl}>
              <thead><tr>{['SOP名稱', '當前版本', '舊版本', '修改日期', '修改人'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {sops.filter(s => s.history?.length).flatMap(s => s.history.map((h, i) => (
                  <tr key={s.id + '-' + i}>
                    <td style={S.td}>{s.title}</td>
                    <td style={S.td}>v{s.version}</td>
                    <td style={S.td}>v{h.version}</td>
                    <td style={S.td}>{h.date}</td>
                    <td style={S.td}>{h.changedBy}</td>
                  </tr>
                ))).sort((a, b) => 0)}
                {!sops.some(s => s.history?.length) && <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: '#94a3b8' }}>暫無版本歷史</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div style={S.overlay} onClick={() => setShowForm(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: ACCENT }}>{editItem ? '編輯SOP' : '新增SOP'}</h3>
            <div style={S.formGrid}>
              <div style={{ gridColumn: '1/-1' }}><label style={S.label}>SOP標題</label><input style={S.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div><label style={S.label}>分類</label><select style={{ ...S.select, width: '100%' }} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
              <div><label style={S.label}>版本</label><input style={S.input} value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} /></div>
              <div><label style={S.label}>生效日期</label><input type="date" style={S.input} value={form.effectiveDate} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} /></div>
              <div><label style={S.label}>批准人</label><input style={S.input} value={form.approvedBy} onChange={e => setForm({ ...form, approvedBy: e.target.value })} /></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={S.label}>步驟</label>
              {form.steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ ...S.stepNum, fontSize: 11, minWidth: 22, height: 22 }}>{i + 1}</span>
                  <input style={{ ...S.input, flex: 1 }} placeholder="步驟內容" value={step.text} onChange={e => updateStep(i, 'text', e.target.value)} />
                  <input style={{ ...S.input, width: 100 }} placeholder="負責人" value={step.responsible} onChange={e => updateStep(i, 'responsible', e.target.value)} />
                  {form.steps.length > 1 && <button style={{ ...S.btnSm, background: '#dc2626', padding: '4px 8px' }} onClick={() => removeStep(i)}>x</button>}
                </div>
              ))}
              <button style={{ ...S.btnSm, background: '#64748b', marginTop: 4 }} onClick={addStep}>+ 新增步驟</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button style={{ ...S.btn, background: '#94a3b8' }} onClick={() => setShowForm(false)}>取消</button>
              <button style={S.btn} onClick={handleSave}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
