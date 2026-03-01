import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { fmtM } from '../data';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_promotions';
const ACCENT = '#0e7490';
const TYPES = ['折扣', '套餐', '買送', '體驗價'];
const STATUSES = ['草稿', '進行中', '已結束'];
const AUDIENCES = ['全部顧客', '長者(65+)', '會員', 'VIP顧客', '新客戶', '回頭客'];
const SERVICES = ['全部', '針灸', '推拿', '拔罐', '中藥處方', '天灸', '診金', '養生套餐'];

function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function save(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function today() { return new Date().toISOString().substring(0, 10); }
function statusOf(p) {
  const t = today();
  if (!p.startDate || !p.endDate || p.draft) return '草稿';
  if (t < p.startDate) return '草稿';
  if (t > p.endDate) return '已結束';
  return '進行中';
}
function daysLeft(p) {
  if (statusOf(p) !== '進行中') return null;
  const diff = Math.ceil((new Date(p.endDate) - new Date()) / 86400000);
  return diff >= 0 ? diff : 0;
}
const statusColor = s => s === '進行中' ? '#16a34a' : s === '已結束' ? '#9ca3af' : '#d97706';
const typeIcon = t => t === '折扣' ? '%' : t === '套餐' ? '📦' : t === '買送' ? '🎁' : '💰';

const TEMPLATES = [
  { name: '春季養肝推廣', desc: '春季養肝護肝療程優惠，疏肝理氣、調理脾胃', type: '套餐', discount: 15, services: ['中藥處方', '針灸'], audience: '全部顧客', terms: '每人限用一次，不可與其他優惠同時使用' },
  { name: '夏季清熱推廣', desc: '夏日消暑清熱，涼茶＋針灸套餐', type: '套餐', discount: 20, services: ['中藥處方', '拔罐'], audience: '全部顧客', terms: '適用於6-8月，須預約' },
  { name: '秋季潤肺推廣', desc: '秋燥潤肺養陰療程，川貝燉雪梨＋推拿', type: '折扣', discount: 10, services: ['中藥處方', '推拿'], audience: '全部顧客', terms: '每人限用一次' },
  { name: '冬季補腎推廣', desc: '冬季進補養腎壯陽，溫補療程優惠', type: '套餐', discount: 15, services: ['中藥處方', '針灸', '推拿'], audience: '全部顧客', terms: '須預約，療程為4週' },
  { name: '天灸療程推廣', desc: '三伏天灸／三九天灸療程早鳥優惠', type: '體驗價', discount: 25, services: ['天灸'], audience: '全部顧客', terms: '需提前一週預約，共3次療程' },
  { name: '新年優惠推廣', desc: '農曆新年限定優惠，全線服務折扣', type: '折扣', discount: 12, services: ['全部'], audience: '全部顧客', terms: '農曆新年期間適用，不可與其他折扣同時使用' },
];

const btn = (bg = ACCENT) => ({ padding: '6px 16px', background: bg, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 });
const input = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' };
const label = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 2, display: 'block' };
const card = { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)' };
const badge = (bg, fg) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: bg, color: fg });

const EMPTY = { name: '', desc: '', startDate: '', endDate: '', type: '折扣', discount: '', services: ['全部'], audience: '全部顧客', terms: '', draft: true, revenue: 0, redemptions: 0 };

export default function SeasonalPromo({ data, showToast, user }) {
  const [promos, setPromos] = useState(load);
  const [tab, setTab] = useState('list');
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const saveAll = (list) => { setPromos(list); save(list); };

  const filtered = useMemo(() => {
    let list = promos.map(p => ({ ...p, _status: statusOf(p) }));
    if (filterStatus !== 'all') list = list.filter(p => p._status === filterStatus);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(p => (p.name || '').toLowerCase().includes(q)); }
    return list.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  }, [promos, filterStatus, search]);

  const stats = useMemo(() => {
    const active = promos.filter(p => statusOf(p) === '進行中').length;
    const draft = promos.filter(p => statusOf(p) === '草稿').length;
    const ended = promos.filter(p => statusOf(p) === '已結束').length;
    const totalRev = promos.reduce((s, p) => s + (p.revenue || 0), 0);
    const totalRed = promos.reduce((s, p) => s + (p.redemptions || 0), 0);
    const avgRev = totalRed > 0 ? Math.round(totalRev / totalRed) : 0;
    return { active, draft, ended, totalRev, totalRed, avgRev };
  }, [promos]);

  const handleSave = () => {
    if (!form.name) { showToast('請輸入推廣名稱', 'error'); return; }
    if (!form.startDate || !form.endDate) { showToast('請選擇推廣期間', 'error'); return; }
    if (form.endDate < form.startDate) { showToast('結束日期不可早於開始日期', 'error'); return; }
    if (editId) {
      saveAll(promos.map(p => p.id === editId ? { ...form, id: editId } : p));
      showToast('推廣已更新');
    } else {
      saveAll([...promos, { ...form, id: uid(), revenue: 0, redemptions: 0 }]);
      showToast('推廣已新增');
    }
    setTab('list'); setEditId(null); setForm({ ...EMPTY });
  };

  const handleEdit = (p) => { setForm({ ...p }); setEditId(p.id); setTab('form'); };
  const handleDelete = (id) => { if (window.confirm('確定刪除此推廣？')) { saveAll(promos.filter(p => p.id !== id)); showToast('已刪除'); } };
  const handleDuplicate = (p) => {
    const copy = { ...p, id: uid(), name: p.name + '（副本）', draft: true, revenue: 0, redemptions: 0 };
    saveAll([...promos, copy]);
    showToast('已複製推廣');
  };

  const applyTemplate = (t) => {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const endM = m + 2 > 12 ? 1 : m + 2;
    const endY = m + 2 > 12 ? y + 1 : y;
    const end = `${endY}-${String(endM).padStart(2, '0')}-${new Date(endY, endM, 0).getDate()}`;
    setForm({ ...EMPTY, ...t, startDate: start, endDate: end, draft: false });
    setEditId(null); setTab('form');
    showToast(`已套用「${t.name}」模板`);
  };

  const genWhatsApp = (p) => {
    const clinic = getClinicName();
    const disc = p.type === '折扣' ? `${p.discount}% OFF` : p.type === '體驗價' ? `體驗價低至${p.discount}折` : `優惠${p.discount}%`;
    const svcList = (p.services || []).join('、');
    const msg = `${clinic}\n\n${p.name}\n${p.desc || ''}\n\n推廣期：${p.startDate} 至 ${p.endDate}\n${disc}\n適用服務：${svcList}\n\n立即預約，名額有限！\n條款：${p.terms || '詳情請向診所查詢'}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    showToast('已開啟 WhatsApp 分享');
  };

  const printFlyer = (p) => {
    const clinic = getClinicName();
    const discLabel = p.type === '折扣' ? p.discount + '% OFF' : p.type === '體驗價' ? '體驗價 ' + p.discount + '折' : '優惠 ' + p.discount + '%';
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${escapeHtml(p.name)}</title><style>
      body{font-family:"Microsoft JhengHei",sans-serif;padding:40px;max-width:600px;margin:auto}
      h1{color:${ACCENT};margin-bottom:4px;font-size:24px}h2{font-size:22px;margin-top:24px}
      .period{color:#6b7280;font-size:14px}.box{border:2px solid ${ACCENT};border-radius:12px;padding:24px;margin:20px 0;text-align:center}
      .disc{font-size:36px;font-weight:700;color:${ACCENT}}.desc{font-size:14px;color:#374151;margin-top:8px}
      .info{font-size:13px;margin:6px 0}.terms{font-size:11px;color:#9ca3af;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:10px}
      @media print{body{padding:20px}}</style></head><body>`);
    w.document.write(`<h1>${escapeHtml(clinic)}</h1><h2>${escapeHtml(p.name)}</h2><p class="period">推廣期間：${p.startDate} 至 ${p.endDate}</p>`);
    w.document.write(`<div class="box"><div class="disc">${escapeHtml(discLabel)}</div><p class="desc">${escapeHtml(p.desc || '')}</p></div>`);
    w.document.write(`<p class="info"><b>適用服務：</b>${escapeHtml((p.services || []).join('、'))}</p>`);
    w.document.write(`<p class="info"><b>對象：</b>${escapeHtml(p.audience || '全部顧客')}</p>`);
    w.document.write(`<p class="terms">條款及細則：${escapeHtml(p.terms || '詳情請向診所查詢')}<br/>列印日期：${new Date().toLocaleDateString('zh-HK')}</p></body></html>`);
    w.document.close();
    w.print();
  };

  const tabBtn = (key, lbl) => (
    <button key={key} onClick={() => { setTab(key); if (key === 'form' && !editId) { setForm({ ...EMPTY }); setEditId(null); } }}
      style={{ ...btn(tab === key ? ACCENT : '#e5e7eb'), color: tab === key ? '#fff' : '#374151' }}>{lbl}</button>
  );

  return (
    <div style={{ padding: 16, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: '#111827' }}>季節推廣管理</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['list', '推廣列表'], ['form', '新增推廣'], ['templates', '季節模板'], ['tracking', '追蹤分析']].map(([k, l]) => tabBtn(k, l))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          ['進行中', stats.active, ACCENT], ['草稿', stats.draft, '#d97706'],
          ['已結束', stats.ended, '#9ca3af'], ['總收入', fmtM(stats.totalRev), '#16a34a'],
          ['兌換次數', stats.totalRed, '#6366f1'], ['平均客單', fmtM(stats.avgRev), '#0284c7'],
        ].map(([l, v, c]) => (
          <div key={l} style={{ ...card, borderLeft: `4px solid ${c}`, padding: 12 }}>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* --- LIST TAB --- */}
      {tab === 'list' && (<div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder="搜尋推廣名稱..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...input, maxWidth: 240 }} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...input, maxWidth: 140 }}>
            <option value="all">全部狀態</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: 12, color: '#9ca3af', alignSelf: 'center' }}>共 {filtered.length} 項</span>
        </div>
        {filtered.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#9ca3af', padding: 40 }}>暫無推廣記錄，請新增或套用模板</div>}
        {filtered.map(p => {
          const dl = daysLeft(p);
          const expanded = expandedId === p.id;
          return (
            <div key={p.id} style={{ ...card, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, cursor: 'pointer' }}
                onClick={() => setExpandedId(expanded ? null : p.id)}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{typeIcon(p.type)} {p.name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {p.startDate} ~ {p.endDate} ｜ {p.type} ｜ {p.discount}%
                    {dl !== null && <span style={{ marginLeft: 8, color: dl <= 7 ? '#dc2626' : '#16a34a' }}>（餘 {dl} 天）</span>}
                  </div>
                </div>
                <span style={badge(statusColor(p._status) + '22', statusColor(p._status))}>{p._status}</span>
              </div>
              {expanded && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f3f4f6', fontSize: 13 }}>
                  <div style={{ color: '#374151', marginBottom: 4 }}>{p.desc || '（無描述）'}</div>
                  <div style={{ color: '#6b7280', fontSize: 12 }}>服務：{(p.services || []).join('、')} ｜ 對象：{p.audience || '—'}</div>
                  <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>條款：{p.terms || '—'}</div>
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>收入：{fmtM(p.revenue || 0)} ｜ 兌換：{p.redemptions || 0} 次</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                    <button style={btn(ACCENT)} onClick={() => handleEdit(p)}>編輯</button>
                    <button style={btn('#8b5cf6')} onClick={() => handleDuplicate(p)}>複製</button>
                    <button style={btn('#6366f1')} onClick={() => genWhatsApp(p)}>WhatsApp</button>
                    <button style={btn('#0284c7')} onClick={() => printFlyer(p)}>列印</button>
                    <button style={btn('#dc2626')} onClick={() => handleDelete(p.id)}>刪除</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>)}

      {/* --- FORM TAB --- */}
      {tab === 'form' && (<div style={card}>
        <h3 style={{ margin: '0 0 12px', color: ACCENT }}>{editId ? '編輯推廣' : '新增推廣'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ gridColumn: '1/3' }}><label style={label}>推廣名稱</label>
            <input style={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例：春季養肝套餐優惠" /></div>
          <div style={{ gridColumn: '1/3' }}><label style={label}>描述</label>
            <textarea style={{ ...input, minHeight: 56 }} value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} placeholder="推廣詳情..." /></div>
          <div><label style={label}>開始日期</label><input type="date" style={input} value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
          <div><label style={label}>結束日期</label><input type="date" style={input} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
          <div><label style={label}>推廣類型</label>
            <select style={input} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label style={label}>折扣值 (%)</label>
            <input type="number" min="0" max="100" style={input} value={form.discount} onChange={e => setForm({ ...form, discount: +e.target.value })} /></div>
          <div><label style={label}>適用服務</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{SERVICES.map(s => (
              <label key={s} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                <input type="checkbox" checked={(form.services || []).includes(s)} onChange={e => {
                  const arr = form.services || [];
                  setForm({ ...form, services: e.target.checked ? [...arr, s] : arr.filter(x => x !== s) });
                }} />{s}</label>
            ))}</div>
          </div>
          <div><label style={label}>目標對象</label>
            <select style={input} value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })}>{AUDIENCES.map(a => <option key={a}>{a}</option>)}</select></div>
          <div style={{ gridColumn: '1/3' }}><label style={label}>條款及細則</label>
            <textarea style={{ ...input, minHeight: 48 }} value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} placeholder="每人限用一次..." /></div>
          <div style={{ gridColumn: '1/3' }}>
            <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={!form.draft} onChange={e => setForm({ ...form, draft: !e.target.checked })} /> 立即發佈（非草稿）
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button style={btn(ACCENT)} onClick={handleSave}>{editId ? '更新推廣' : '儲存推廣'}</button>
          <button style={btn('#6b7280')} onClick={() => { setTab('list'); setEditId(null); setForm({ ...EMPTY }); }}>取消</button>
        </div>
      </div>)}

      {/* --- TEMPLATES TAB --- */}
      {tab === 'templates' && (<div>
        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>選擇季節模板快速建立推廣活動，日期會自動填入當月：</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
          {TEMPLATES.map((t, i) => (
            <div key={i} style={{ ...card, borderTop: `3px solid ${ACCENT}` }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: ACCENT }}>{t.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{t.desc}</div>
              <div style={{ fontSize: 12 }}>類型：{t.type} ｜ 折扣：{t.discount}%</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>服務：{t.services.join('、')}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>條款：{t.terms}</div>
              <button style={{ ...btn(ACCENT), marginTop: 10, width: '100%' }} onClick={() => applyTemplate(t)}>套用此模板</button>
            </div>
          ))}
        </div>
      </div>)}

      {/* --- TRACKING TAB --- */}
      {tab === 'tracking' && (<div>
        <h3 style={{ margin: '0 0 12px', color: ACCENT }}>推廣追蹤分析</h3>
        {promos.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#9ca3af', padding: 40 }}>暫無推廣數據</div>}
        {promos.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
              <thead><tr style={{ background: '#f3f4f6' }}>
                {['推廣名稱', '期間', '狀態', '類型', '折扣', '收入', '兌換', '平均', '操作'].map(h =>
                  <th key={h} style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                )}
              </tr></thead>
              <tbody>{promos.map(p => {
                const st = statusOf(p);
                const avg = (p.redemptions || 0) > 0 ? Math.round((p.revenue || 0) / p.redemptions) : 0;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{p.name}</td>
                    <td style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>{p.startDate}<br/>{p.endDate}</td>
                    <td><span style={{ color: statusColor(st), fontWeight: 600 }}>{st}</span></td>
                    <td>{p.type}</td>
                    <td>{p.discount}%</td>
                    <td style={{ color: '#16a34a', fontWeight: 600 }}>{fmtM(p.revenue || 0)}</td>
                    <td>{p.redemptions || 0}</td>
                    <td style={{ color: '#0284c7' }}>{fmtM(avg)}</td>
                    <td>
                      <button style={{ ...btn('#6366f1'), padding: '3px 10px', fontSize: 12 }} onClick={() => {
                        const rev = prompt('輸入收入金額：', p.revenue || 0);
                        if (rev === null) return;
                        const red = prompt('輸入兌換次數：', p.redemptions || 0);
                        if (red === null) return;
                        saveAll(promos.map(x => x.id === p.id ? { ...x, revenue: +rev, redemptions: +red } : x));
                        showToast('數據已更新');
                      }}>更新數據</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>)}
    </div>
  );
}
