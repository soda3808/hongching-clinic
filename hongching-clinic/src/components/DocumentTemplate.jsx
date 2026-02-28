import { useState, useMemo } from 'react';
import { uid } from '../data';
import { getClinicName } from '../tenant';

const TPL_KEY = 'hcmc_doc_templates';
const USE_KEY = 'hcmc_template_usage';
const ACCENT = '#0e7490';
const CATS = ['全部', '行政文件', '醫療文件', '財務文件', '人事文件', '合規文件'];
const today = () => new Date().toISOString().split('T')[0];
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const DEFAULT_TEMPLATES = [
  { id: 'dt01', name: '僱傭合約', category: '人事文件', builtin: true, vars: ['日期','姓名','身份證號碼','職位','薪金','診所','地址','試用期','生效日期'],
    body: '僱傭合約書\n\n日期：{{日期}}\n\n甲方（僱主）：{{診所}}\n地址：{{地址}}\n\n乙方（僱員）：{{姓名}}\n身份證號碼：{{身份證號碼}}\n\n一、職位：{{職位}}\n二、薪金：每月港幣 {{薪金}} 元正\n三、試用期：{{試用期}}\n四、生效日期：{{生效日期}}\n五、工作時間：按診所安排之輪班制度\n六、假期：按《僱傭條例》規定\n七、終止合約：試用期內任何一方可給予七日書面通知終止本合約；試用期後須給予一個月書面通知。\n\n甲方簽署：_______________\n乙方簽署：_______________' },
  { id: 'dt02', name: '保密協議', category: '合規文件', builtin: true, vars: ['日期','姓名','診所','職位'],
    body: '保密協議書\n\n日期：{{日期}}\n\n本人 {{姓名}}，擔任 {{診所}} {{職位}} 一職，茲同意以下條款：\n\n一、本人承諾對在職期間所接觸之病人個人資料、診所營運資料、財務資料及一切商業機密嚴格保密。\n二、未經診所書面同意，不得向任何第三方披露上述資料。\n三、離職後仍須遵守本保密協議，為期兩年。\n四、如違反本協議，診所有權追究法律責任。\n\n簽署：_______________\n日期：{{日期}}' },
  { id: 'dt03', name: '醫療同意書', category: '醫療文件', builtin: true, vars: ['日期','姓名','治療項目','醫師','診所'],
    body: '醫療同意書\n\n日期：{{日期}}\n診所：{{診所}}\n\n病人姓名：{{姓名}}\n\n本人同意接受以下治療：\n治療項目：{{治療項目}}\n主診醫師：{{醫師}}\n\n本人確認：\n1. 醫師已向本人解釋治療的目的、方法及預期效果。\n2. 醫師已告知可能出現的風險及副作用。\n3. 本人已有充足時間提問並獲得滿意答覆。\n4. 本人自願同意接受上述治療。\n\n病人簽署：_______________\n日期：{{日期}}' },
  { id: 'dt04', name: '收據範本', category: '財務文件', builtin: true, vars: ['日期','姓名','收據編號','項目','金額','付款方式','診所','地址'],
    body: '正式收據\n\n{{診所}}\n地址：{{地址}}\n\n收據編號：{{收據編號}}\n日期：{{日期}}\n\n病人姓名：{{姓名}}\n\n服務項目：{{項目}}\n金額：港幣 {{金額}} 元正\n付款方式：{{付款方式}}\n\n此據。\n\n經手人簽署：_______________' },
  { id: 'dt05', name: '請假申請表', category: '人事文件', builtin: true, vars: ['日期','姓名','職位','請假類型','開始日期','結束日期','原因','診所'],
    body: '請假申請表\n\n{{診所}}\n\n申請日期：{{日期}}\n申請人：{{姓名}}\n職位：{{職位}}\n\n請假類型：{{請假類型}}\n開始日期：{{開始日期}}\n結束日期：{{結束日期}}\n\n請假原因：\n{{原因}}\n\n申請人簽署：_______________\n主管批核：_______________\n批核日期：_______________' },
  { id: 'dt06', name: '投訴處理表', category: '行政文件', builtin: true, vars: ['日期','投訴人','聯絡電話','投訴內容','處理人','診所'],
    body: '投訴處理記錄表\n\n{{診所}}\n\n日期：{{日期}}\n投訴人：{{投訴人}}\n聯絡電話：{{聯絡電話}}\n\n投訴內容：\n{{投訴內容}}\n\n處理人：{{處理人}}\n處理結果：\n_______________________________________________\n\n跟進措施：\n_______________________________________________\n\n投訴人確認簽署：_______________\n處理人簽署：_______________' },
  { id: 'dt07', name: '設備維修申請', category: '行政文件', builtin: true, vars: ['日期','申請人','設備名稱','設備編號','故障描述','診所'],
    body: '設備維修申請表\n\n{{診所}}\n\n申請日期：{{日期}}\n申請人：{{申請人}}\n\n設備名稱：{{設備名稱}}\n設備編號：{{設備編號}}\n\n故障描述：\n{{故障描述}}\n\n緊急程度：☐ 緊急　☐ 一般　☐ 低\n\n維修記錄：\n維修日期：_______________\n維修人員：_______________\n維修內容：_______________\n費用：_______________\n\n主管簽署：_______________' },
  { id: 'dt08', name: '培訓記錄表', category: '人事文件', builtin: true, vars: ['日期','培訓主題','講師','參加人員','時數','診所'],
    body: '培訓記錄表\n\n{{診所}}\n\n培訓日期：{{日期}}\n培訓主題：{{培訓主題}}\n講師/導師：{{講師}}\n培訓時數：{{時數}} 小時\n\n參加人員：\n{{參加人員}}\n\n培訓內容摘要：\n_______________________________________________\n\n考核結果：☐ 合格　☐ 需重修\n\n講師簽署：_______________\n主管簽署：_______________' },
  { id: 'dt09', name: '盤點表', category: '財務文件', builtin: true, vars: ['日期','盤點人','覆核人','診所','分店'],
    body: '庫存盤點表\n\n{{診所}} — {{分店}}\n\n盤點日期：{{日期}}\n盤點人：{{盤點人}}\n覆核人：{{覆核人}}\n\n┌──────┬──────┬──────┬──────┬──────┐\n│ 項目名稱 │ 單位 │ 系統數量 │ 實際數量 │ 差異 │\n├──────┼──────┼──────┼──────┼──────┤\n│　　　　　│　　　│　　　　　│　　　　　│　　　│\n│　　　　　│　　　│　　　　　│　　　　　│　　　│\n│　　　　　│　　　│　　　　　│　　　　　│　　　│\n│　　　　　│　　　│　　　　　│　　　　　│　　　│\n│　　　　　│　　　│　　　　　│　　　　　│　　　│\n└──────┴──────┴──────┴──────┴──────┘\n\n盤點人簽署：_______________\n覆核人簽署：_______________' },
  { id: 'dt10', name: '會議記錄', category: '行政文件', builtin: true, vars: ['日期','會議主題','主持人','出席人員','地點','診所'],
    body: '會議記錄\n\n{{診所}}\n\n會議日期：{{日期}}\n會議主題：{{會議主題}}\n主持人：{{主持人}}\n地點：{{地點}}\n\n出席人員：\n{{出席人員}}\n\n議程及討論內容：\n1. _______________________________________________\n2. _______________________________________________\n3. _______________________________________________\n\n決議事項：\n1. _______________________________________________\n2. _______________________________________________\n\n下次會議日期：_______________\n\n記錄人簽署：_______________' },
];

const cardS = { background: '#fff', borderRadius: 10, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,.08)', marginBottom: 14 };
const btnS = { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnOutS = { ...btnS, background: '#fff', color: ACCENT, border: `1.5px solid ${ACCENT}` };
const inputS = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const tabBtnS = (a) => ({ padding: '8px 16px', border: 'none', borderBottom: a ? `3px solid ${ACCENT}` : '3px solid transparent', background: 'none', cursor: 'pointer', fontWeight: a ? 700 : 400, color: a ? ACCENT : '#6b7280', fontSize: 14 });
const badgeS = (bg, c) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: bg, color: c });

export default function DocumentTemplate({ showToast, user }) {
  const [customs, setCustoms] = useState(() => load(TPL_KEY, []));
  const [usage, setUsage] = useState(() => load(USE_KEY, {}));
  const [tab, setTab] = useState('list');
  const [catFilter, setCatFilter] = useState('全部');
  const [search, setSearch] = useState('');
  const [editTpl, setEditTpl] = useState(null);
  const [fillTpl, setFillTpl] = useState(null);
  const [fillVals, setFillVals] = useState({});
  const [form, setForm] = useState({ name: '', category: '行政文件', body: '', vars: '' });

  const allTemplates = useMemo(() => [...DEFAULT_TEMPLATES, ...customs], [customs]);

  const filtered = useMemo(() => {
    let list = allTemplates;
    if (catFilter !== '全部') list = list.filter(t => t.category === catFilter);
    if (search) list = list.filter(t => t.name.includes(search) || t.body.includes(search));
    return list;
  }, [allTemplates, catFilter, search]);

  const persistCustoms = (list) => { setCustoms(list); save(TPL_KEY, list); };
  const persistUsage = (u) => { setUsage(u); save(USE_KEY, u); };

  const extractVars = (text) => { const m = text.match(/\{\{([^}]+)\}\}/g); return m ? [...new Set(m.map(v => v.replace(/[{}]/g, '')))] : []; };

  const handleSaveNew = () => {
    if (!form.name || !form.body) { showToast('請填寫範本名稱及內容', 'error'); return; }
    const vars = extractVars(form.body);
    const tpl = { id: uid(), name: form.name, category: form.category, builtin: false, vars, body: form.body, createdAt: today(), createdBy: user?.name || '' };
    persistCustoms([...customs, tpl]);
    setForm({ name: '', category: '行政文件', body: '', vars: '' });
    setTab('list');
    showToast('範本已新增');
  };

  const handleSaveEdit = () => {
    if (!editTpl || !editTpl.name || !editTpl.body) { showToast('請填寫範本名稱及內容', 'error'); return; }
    const vars = extractVars(editTpl.body);
    if (editTpl.builtin) {
      const exists = customs.find(c => c.id === editTpl.id + '_custom');
      const custom = { ...editTpl, id: editTpl.id + '_custom', builtin: false, vars, editedAt: today() };
      if (exists) { persistCustoms(customs.map(c => c.id === custom.id ? custom : c)); }
      else { persistCustoms([...customs, custom]); }
    } else {
      persistCustoms(customs.map(c => c.id === editTpl.id ? { ...c, ...editTpl, vars, editedAt: today() } : c));
    }
    setEditTpl(null);
    showToast('範本已儲存');
  };

  const handleDelete = (id) => {
    if (!confirm('確定刪除此範本？')) return;
    persistCustoms(customs.filter(c => c.id !== id));
    showToast('已刪除');
  };

  const startFill = (tpl) => {
    const clinic = getClinicName();
    const defaults = { '日期': today(), '診所': clinic };
    const vals = {};
    tpl.vars.forEach(v => { vals[v] = defaults[v] || ''; });
    setFillVals(vals);
    setFillTpl(tpl);
    setTab('fill');
  };

  const renderFilled = () => {
    if (!fillTpl) return '';
    let text = fillTpl.body;
    Object.entries(fillVals).forEach(([k, v]) => { text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v || `[${k}]`); });
    return text;
  };

  const handlePrint = () => {
    const content = renderFilled();
    const clinic = getClinicName();
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${fillTpl.name} — ${clinic}</title><style>body{font-family:"Microsoft JhengHei","PingFang TC",sans-serif;padding:40px 60px;font-size:15px;line-height:1.8;white-space:pre-wrap;color:#1a1a1a}h1{text-align:center;font-size:20px;margin-bottom:24px}@media print{body{padding:20px 40px}}</style></head><body>${content.replace(/\n/g, '<br>')}</body></html>`);
    w.document.close();
    w.print();
    const u = { ...usage, [fillTpl.id]: (usage[fillTpl.id] || 0) + 1 };
    persistUsage(u);
  };

  /* ── List view ── */
  const renderList = () => (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {CATS.map(c => <button key={c} style={tabBtnS(catFilter === c)} onClick={() => setCatFilter(c)}>{c}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input style={{ ...inputS, maxWidth: 260 }} placeholder="搜尋範本..." value={search} onChange={e => setSearch(e.target.value)} />
        <button style={btnS} onClick={() => setTab('new')}>+ 新增範本</button>
      </div>
      {filtered.length === 0 && <p style={{ color: '#9ca3af', textAlign: 'center', marginTop: 30 }}>找不到範本</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {filtered.map(t => (
          <div key={t.id} style={cardS}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <strong style={{ fontSize: 15 }}>{t.name}</strong>
              <span style={badgeS(ACCENT + '18', ACCENT)}>{t.category}</span>
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>
              變數：{t.vars.length > 0 ? t.vars.map(v => `{{${v}}}`).join(' ') : '無'}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>使用次數：{usage[t.id] || 0}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...btnS, padding: '5px 12px', fontSize: 12 }} onClick={() => startFill(t)}>填寫列印</button>
              <button style={{ ...btnOutS, padding: '5px 12px', fontSize: 12 }} onClick={() => { setEditTpl({ ...t }); setTab('edit'); }}>編輯</button>
              {!t.builtin && <button style={{ ...btnOutS, padding: '5px 12px', fontSize: 12, color: '#dc2626', borderColor: '#dc2626' }} onClick={() => handleDelete(t.id)}>刪除</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  /* ── New template form ── */
  const renderNew = () => (
    <div style={cardS}>
      <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>新增文件範本</h3>
      <label style={{ fontSize: 13, fontWeight: 600 }}>範本名稱</label>
      <input style={{ ...inputS, marginBottom: 10 }} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <label style={{ fontSize: 13, fontWeight: 600 }}>分類</label>
      <select style={{ ...inputS, marginBottom: 10 }} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
        {CATS.filter(c => c !== '全部').map(c => <option key={c}>{c}</option>)}
      </select>
      <label style={{ fontSize: 13, fontWeight: 600 }}>範本內容（使用 {'{{變數名}}'} 作為佔位符）</label>
      <textarea style={{ ...inputS, minHeight: 220, fontFamily: 'monospace', marginBottom: 10, whiteSpace: 'pre-wrap' }} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
      {form.body && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>偵測到變數：{extractVars(form.body).map(v => `{{${v}}}`).join(' ') || '無'}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={btnS} onClick={handleSaveNew}>儲存範本</button>
        <button style={btnOutS} onClick={() => setTab('list')}>取消</button>
      </div>
    </div>
  );

  /* ── Edit template ── */
  const renderEdit = () => editTpl && (
    <div style={cardS}>
      <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>編輯範本：{editTpl.name}{editTpl.builtin ? '（內建 — 將另存副本）' : ''}</h3>
      <label style={{ fontSize: 13, fontWeight: 600 }}>範本名稱</label>
      <input style={{ ...inputS, marginBottom: 10 }} value={editTpl.name} onChange={e => setEditTpl({ ...editTpl, name: e.target.value })} />
      <label style={{ fontSize: 13, fontWeight: 600 }}>分類</label>
      <select style={{ ...inputS, marginBottom: 10 }} value={editTpl.category} onChange={e => setEditTpl({ ...editTpl, category: e.target.value })}>
        {CATS.filter(c => c !== '全部').map(c => <option key={c}>{c}</option>)}
      </select>
      <label style={{ fontSize: 13, fontWeight: 600 }}>範本內容</label>
      <textarea style={{ ...inputS, minHeight: 240, fontFamily: 'monospace', marginBottom: 10, whiteSpace: 'pre-wrap' }} value={editTpl.body} onChange={e => setEditTpl({ ...editTpl, body: e.target.value })} />
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>偵測到變數：{extractVars(editTpl.body).map(v => `{{${v}}}`).join(' ') || '無'}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={btnS} onClick={handleSaveEdit}>儲存</button>
        <button style={btnOutS} onClick={() => { setEditTpl(null); setTab('list'); }}>取消</button>
      </div>
    </div>
  );

  /* ── Fill & print ── */
  const renderFill = () => fillTpl && (
    <div>
      <div style={cardS}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>填寫：{fillTpl.name}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10, marginBottom: 14 }}>
          {fillTpl.vars.map(v => (
            <div key={v}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>{v}</label>
              <input style={inputS} value={fillVals[v] || ''} onChange={e => setFillVals({ ...fillVals, [v]: e.target.value })} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnS} onClick={handlePrint}>列印</button>
          <button style={btnOutS} onClick={() => { setFillTpl(null); setTab('list'); }}>返回</button>
        </div>
      </div>
      <div style={{ ...cardS, background: '#fafafa', fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8 }}>
        <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#6b7280' }}>預覽</h4>
        {renderFilled()}
      </div>
    </div>
  );

  /* ── Stats ── */
  const renderStats = () => {
    const ranked = allTemplates.map(t => ({ ...t, count: usage[t.id] || 0 })).sort((a, b) => b.count - a.count);
    const total = ranked.reduce((s, t) => s + t.count, 0);
    return (
      <div style={cardS}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>使用統計</h3>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 12 }}>總使用次數：<strong style={{ color: ACCENT }}>{total}</strong></p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 13, color: '#6b7280' }}>範本</th>
            <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 13, color: '#6b7280' }}>分類</th>
            <th style={{ textAlign: 'right', padding: '6px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 13, color: '#6b7280' }}>使用次數</th>
          </tr></thead>
          <tbody>{ranked.map(t => (
            <tr key={t.id}>
              <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 14 }}>{t.name}</td>
              <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}><span style={badgeS(ACCENT + '18', ACCENT)}>{t.category}</span></td>
              <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 14, textAlign: 'right', fontWeight: 600 }}>{t.count}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  };

  const TABS = [['list', '範本列表'], ['new', '新增範本'], ['stats', '使用統計']];
  const activeTab = (tab === 'edit' || tab === 'fill') ? tab : tab;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, marginBottom: 4 }}>文件範本管理</h2>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 14 }}>管理診所常用文件範本，填寫變數後即可列印</p>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        {TABS.map(([k, l]) => <button key={k} style={tabBtnS(tab === k || (k === 'list' && (tab === 'edit' || tab === 'fill')))} onClick={() => { setTab(k); setEditTpl(null); setFillTpl(null); }}>{l}</button>)}
      </div>
      {(tab === 'list') && renderList()}
      {(tab === 'new') && renderNew()}
      {(tab === 'edit') && renderEdit()}
      {(tab === 'fill') && renderFill()}
      {(tab === 'stats') && renderStats()}
    </div>
  );
}
