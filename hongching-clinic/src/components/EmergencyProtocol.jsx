import { useState, useMemo, useEffect } from 'react';
import { getClinicName } from '../tenant';
import { uid, getEmployees } from '../data';
import { emergencyContactsOps, emergencyEquipmentOps, drillLogOps } from '../api';
import escapeHtml from '../utils/escapeHtml';

const A = '#0e7490', BG = '#f0fdfa', BDR = '#cffafe', DANGER = '#dc2626', WARN = '#f59e0b';
const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 14, border: '1px solid #e5e7eb' };
const hdr = { fontSize: 15, fontWeight: 700, color: A, marginBottom: 10 };
const btn = (c = A) => ({ padding: '7px 16px', borderRadius: 6, border: 'none', background: c, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 });
const btnO = { ...btn('#fff'), border: `1px solid ${A}`, color: A, background: '#fff' };
const smBtn = (c = A) => ({ ...btn(c), padding: '4px 10px', fontSize: 12 });
const tag = (c) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c + '18', color: c });
const inp = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: '100%', boxSizing: 'border-box' };

const PROTOCOLS = [
  { id: 'faint', icon: '🚑', name: '病人暈倒', color: DANGER, steps: [
    '立即通知醫師到場評估', '讓病人平躺，雙腿略為抬高', '檢查呼吸及脈搏', '鬆開衣領、腰帶等束縛物',
    '保持空氣流通', '如無呼吸脈搏，立即進行CPR並致電999', '持續監測生命體徵直至恢復意識', '記錄事件詳情於病歷'
  ]},
  { id: 'needle', icon: '📌', name: '針灸暈針', color: WARN, steps: [
    '立即停止針灸，拔除所有針具', '讓病人平躺，頭部略低', '鬆開衣物，保持空氣流通', '按壓人中穴（水溝穴）',
    '給予溫糖水飲用', '監測血壓、脈搏及面色', '待病人完全恢復後方可離開', '記錄暈針經過及處理方式於病歷'
  ]},
  { id: 'allergy', icon: '⚠️', name: '過敏反應', color: DANGER, steps: [
    '立即停止所有治療及用藥', '評估過敏嚴重程度（皮疹/呼吸困難/休克）', '輕度：給予抗過敏藥物並觀察',
    '嚴重過敏（呼吸困難、血壓下降）：立即致電999', '如有腎上腺素自動注射器，按需使用',
    '讓病人保持舒適體位', '持續監測生命體徵', '詳細記錄過敏原及反應於病歷，更新過敏史'
  ]},
  { id: 'fire', icon: '🔥', name: '火警', color: DANGER, steps: [
    '啟動火警警報系統', '致電999報警', '引導所有病人及訪客按疏散路線撤離', '關閉電源及煤氣',
    '使用滅火器嘗試撲滅初期火警（安全情況下）', '確認所有人員已撤離（清點人數）',
    '在安全集合點等待消防人員到場', '協助消防員了解現場情況'
  ]},
  { id: 'power', icon: '💡', name: '停電', color: WARN, steps: [
    '啟動緊急照明設備', '安撫病人及訪客，保持冷靜', '檢查正在進行的治療，確保病人安全',
    '聯絡大廈管理處了解停電原因及預計恢復時間', '如短時間內無法恢復，安排病人改期',
    '確保冷藏藥材及疫苗的安全', '記錄停電時間及影響範圍', '電力恢復後檢查所有設備運作正常'
  ]},
  { id: 'flood', icon: '🌊', name: '水浸', color: '#2563eb', steps: [
    '立即切斷電源，防止觸電', '將重要文件及藥材移至高處', '聯絡大廈管理處報告情況',
    '如水位持續上升，引導人員撤離', '放置沙包或防水擋板阻擋水源', '致電水務署（2824 5000）報告',
    '記錄受損物品及範圍', '水退後進行全面清潔消毒'
  ]},
  { id: 'violence', icon: '🛡️', name: '暴力事件', color: DANGER, steps: [
    '保持冷靜，避免激化衝突', '嘗試以言語安撫當事人', '其他員工悄悄致電999報警',
    '引導其他病人及訪客遠離現場', '不要嘗試以武力制服對方', '記住施暴者外貌特徵',
    '事後配合警方調查', '安排受影響員工及病人接受心理輔導'
  ]},
  { id: 'outbreak', icon: '🦠', name: '傳染病爆發', color: DANGER, steps: [
    '立即隔離疑似感染者', '所有人員佩戴適當防護裝備（口罩、手套、護目鏡）', '致電衞生防護中心（2125 2323）報告',
    '對接觸者進行登記及追蹤', '加強診所消毒（特別是接觸面）', '暫停接收新病人直至評估完成',
    '配合衞生署指示進行隔離及檢疫', '通知所有近期到診病人注意症狀'
  ]},
];

const DEFAULT_CONTACTS = [
  { id: 'c1', name: '緊急服務（警察/救護車/消防）', phone: '999', note: '全天候' },
  { id: 'c2', name: '醫院急症室', phone: '待填寫', note: '' },
  { id: 'c3', name: '大廈管理處', phone: '待填寫', note: '' },
  { id: 'c4', name: '消防處（非緊急）', phone: '2723 2233', note: '' },
  { id: 'c5', name: '毒物諮詢中心', phone: '2635 1111', note: '24小時' },
];

const DEFAULT_EQUIPMENT = [
  { id: 'e1', name: 'AED 自動體外除顫器', status: 'ok', lastCheck: '', location: '大堂' },
  { id: 'e2', name: '急救箱', status: 'ok', lastCheck: '', location: '診症室' },
  { id: 'e3', name: '滅火器', status: 'ok', lastCheck: '', location: '走廊' },
  { id: 'e4', name: '緊急照明燈', status: 'ok', lastCheck: '', location: '各房間' },
  { id: 'e5', name: '疏散路線圖', status: 'ok', lastCheck: '', location: '門口' },
];

const STATUS_MAP = { ok: { label: '正常', color: '#16a34a' }, warn: { label: '需檢查', color: WARN }, error: { label: '異常', color: DANGER } };

export default function EmergencyProtocol({ showToast, user }) {
  const [tab, setTab] = useState('protocols');
  const [expandedId, setExpandedId] = useState(null);
  const [contacts, setContacts] = useState(() => { try { return JSON.parse(localStorage.getItem('hcmc_emergency_contacts')) || DEFAULT_CONTACTS; } catch { return DEFAULT_CONTACTS; } });
  const [equipment, setEquipment] = useState(() => { try { return JSON.parse(localStorage.getItem('hcmc_emergency_equipment')) || DEFAULT_EQUIPMENT; } catch { return DEFAULT_EQUIPMENT; } });
  const [drills, setDrills] = useState(() => { try { return JSON.parse(localStorage.getItem('hcmc_drill_log')) || []; } catch { return []; } });
  const [editContact, setEditContact] = useState(null);
  const [drillForm, setDrillForm] = useState({ date: new Date().toISOString().substring(0, 10), type: PROTOCOLS[0].name, participants: '', observations: '', improvements: '' });

  const employees = useMemo(() => getEmployees(), []);
  const tabs = [
    { id: 'protocols', label: '應變方案' }, { id: 'contacts', label: '緊急聯絡' },
    { id: 'equipment', label: '設備檢查' }, { id: 'drills', label: '演習記錄' },
    { id: 'certs', label: '員工認證' }, { id: 'print', label: '快速參考' },
  ];

  const saveContacts = (c) => { setContacts(c); localStorage.setItem('hcmc_emergency_contacts', JSON.stringify(c)); emergencyContactsOps.persistAll(c); };
  const saveEquipment = (e) => { setEquipment(e); localStorage.setItem('hcmc_emergency_equipment', JSON.stringify(e)); emergencyEquipmentOps.persistAll(e); };
  const saveDrills = (d) => { setDrills(d); localStorage.setItem('hcmc_drill_log', JSON.stringify(d)); drillLogOps.persistAll(d); };

  useEffect(() => {
    emergencyContactsOps.load().then(d => { if (d) setContacts(d); });
    emergencyEquipmentOps.load().then(d => { if (d) setEquipment(d); });
    drillLogOps.load().then(d => { if (d) setDrills(d); });
  }, []);

  const addDrill = () => {
    if (!drillForm.date || !drillForm.type) return showToast('請填寫日期及類型');
    const entry = { id: uid(), ...drillForm, createdBy: user?.name || '系統', createdAt: new Date().toISOString() };
    saveDrills([entry, ...drills]);
    setDrillForm({ date: new Date().toISOString().substring(0, 10), type: PROTOCOLS[0].name, participants: '', observations: '', improvements: '' });
    showToast('演習記錄已新增');
  };

  const printQuickRef = () => {
    const clinic = getClinicName();
    const html = `<html><head><meta charset="utf-8"><title>緊急應變快速參考卡</title>
<style>body{font-family:sans-serif;padding:20px;font-size:12px}h1{color:${A};font-size:18px;border-bottom:2px solid ${A};padding-bottom:6px}
h2{color:${A};font-size:14px;margin:12px 0 4px}.steps{margin:0;padding-left:18px}.steps li{margin-bottom:2px}
.contacts{border-collapse:collapse;width:100%;margin:8px 0}.contacts td,.contacts th{border:1px solid #ccc;padding:4px 8px;text-align:left;font-size:11px}
@media print{body{padding:10px}}</style></head><body>
<h1>${escapeHtml(clinic)} — 緊急應變快速參考卡</h1>
<p style="color:#666;font-size:11px">列印日期：${new Date().toLocaleDateString('zh-HK')}</p>
${PROTOCOLS.map(p => `<h2>${p.icon} ${escapeHtml(p.name)}</h2><ol class="steps">${p.steps.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`).join('')}
<h2>緊急聯絡電話</h2>
<table class="contacts"><tr><th>名稱</th><th>電話</th><th>備註</th></tr>
${contacts.map(c => `<tr><td>${escapeHtml(c.name)}</td><td><b>${escapeHtml(c.phone)}</b></td><td>${escapeHtml(c.note || '')}</td></tr>`).join('')}</table>
<p style="margin-top:16px;color:#999;font-size:10px">此卡應張貼於診所當眼處，所有員工必須熟悉內容。</p>
</body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  };

  const updateEquipStatus = (id, status) => {
    const updated = equipment.map(e => e.id === id ? { ...e, status, lastCheck: new Date().toISOString().substring(0, 10) } : e);
    saveEquipment(updated);
    showToast('設備狀態已更新');
  };

  const saveEditContact = () => {
    if (!editContact) return;
    const updated = contacts.map(c => c.id === editContact.id ? editContact : c);
    saveContacts(updated);
    setEditContact(null);
    showToast('聯絡資料已更新');
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${tab === t.id ? A : '#d1d5db'}`, background: tab === t.id ? A : '#fff', color: tab === t.id ? '#fff' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t.label}</button>
        ))}
      </div>

      {/* ── Protocols ── */}
      {tab === 'protocols' && PROTOCOLS.map(p => (
        <div key={p.id} style={{ ...card, borderLeft: `4px solid ${p.color}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
            <div style={{ fontSize: 15, fontWeight: 700, color: p.color }}>{p.icon} {p.name}</div>
            <span style={{ fontSize: 18, color: '#999' }}>{expandedId === p.id ? '▲' : '▼'}</span>
          </div>
          {expandedId === p.id && (
            <ol style={{ margin: '10px 0 0', paddingLeft: 22, fontSize: 13, lineHeight: 1.8 }}>
              {p.steps.map((s, i) => <li key={i} style={{ marginBottom: 2 }}>{s}</li>)}
            </ol>
          )}
        </div>
      ))}

      {/* ── Contacts ── */}
      {tab === 'contacts' && (
        <div style={card}>
          <div style={hdr}>緊急聯絡電話</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: `2px solid ${BDR}` }}>{['名稱', '電話', '備註', '操作'].map(h => <th key={h} style={{ padding: 6, textAlign: 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{contacts.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                {editContact?.id === c.id ? (<>
                  <td style={{ padding: 4 }}><input style={inp} value={editContact.name} onChange={e => setEditContact({ ...editContact, name: e.target.value })} /></td>
                  <td style={{ padding: 4 }}><input style={inp} value={editContact.phone} onChange={e => setEditContact({ ...editContact, phone: e.target.value })} /></td>
                  <td style={{ padding: 4 }}><input style={inp} value={editContact.note} onChange={e => setEditContact({ ...editContact, note: e.target.value })} /></td>
                  <td style={{ padding: 4, display: 'flex', gap: 4 }}><button style={smBtn()} onClick={saveEditContact}>儲存</button><button style={smBtn('#6b7280')} onClick={() => setEditContact(null)}>取消</button></td>
                </>) : (<>
                  <td style={{ padding: 6 }}>{c.name}</td>
                  <td style={{ padding: 6, fontWeight: 700, color: A, fontSize: 15 }}>{c.phone}</td>
                  <td style={{ padding: 6, color: '#666' }}>{c.note || '-'}</td>
                  <td style={{ padding: 6 }}><button style={smBtn()} onClick={() => setEditContact({ ...c })}>編輯</button></td>
                </>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* ── Equipment ── */}
      {tab === 'equipment' && (
        <div style={card}>
          <div style={hdr}>緊急設備檢查清單</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: `2px solid ${BDR}` }}>{['設備', '位置', '狀態', '上次檢查', '操作'].map(h => <th key={h} style={{ padding: 6, textAlign: 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{equipment.map(e => {
              const st = STATUS_MAP[e.status] || STATUS_MAP.ok;
              return (
                <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 6, fontWeight: 600 }}>{e.name}</td>
                  <td style={{ padding: 6, color: '#666' }}>{e.location}</td>
                  <td style={{ padding: 6 }}><span style={tag(st.color)}>{st.label}</span></td>
                  <td style={{ padding: 6, fontSize: 12, color: '#888' }}>{e.lastCheck || '未檢查'}</td>
                  <td style={{ padding: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button style={smBtn('#16a34a')} onClick={() => updateEquipStatus(e.id, 'ok')}>正常</button>
                    <button style={smBtn(WARN)} onClick={() => updateEquipStatus(e.id, 'warn')}>需檢查</button>
                    <button style={smBtn(DANGER)} onClick={() => updateEquipStatus(e.id, 'error')}>異常</button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      {/* ── Drill Log ── */}
      {tab === 'drills' && (<>
        <div style={card}>
          <div style={hdr}>新增演習記錄</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>日期</label>
              <input type="date" style={inp} value={drillForm.date} onChange={e => setDrillForm({ ...drillForm, date: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>演習類型</label>
              <select style={inp} value={drillForm.type} onChange={e => setDrillForm({ ...drillForm, type: e.target.value })}>
                {PROTOCOLS.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>參與人員</label>
            <input style={inp} placeholder="例：全體員工" value={drillForm.participants} onChange={e => setDrillForm({ ...drillForm, participants: e.target.value })} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>觀察及結果</label>
            <textarea style={{ ...inp, height: 50, resize: 'vertical' }} value={drillForm.observations} onChange={e => setDrillForm({ ...drillForm, observations: e.target.value })} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>改善建議</label>
            <textarea style={{ ...inp, height: 50, resize: 'vertical' }} value={drillForm.improvements} onChange={e => setDrillForm({ ...drillForm, improvements: e.target.value })} />
          </div>
          <button style={btn()} onClick={addDrill}>新增記錄</button>
        </div>
        <div style={card}>
          <div style={hdr}>演習歷史（{drills.length}）</div>
          {!drills.length ? <p style={{ color: '#999', fontSize: 13 }}>暫無演習記錄</p> : drills.map(d => (
            <div key={d.id} style={{ padding: 10, borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 700 }}>{d.type}</span>
                <span style={{ color: '#888', fontSize: 12 }}>{d.date}</span>
              </div>
              {d.participants && <div style={{ color: '#555' }}>參與：{d.participants}</div>}
              {d.observations && <div style={{ color: '#555' }}>觀察：{d.observations}</div>}
              {d.improvements && <div style={{ color: WARN }}>改善：{d.improvements}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 11, color: '#aaa' }}>記錄人：{d.createdBy}</span>
                <button style={smBtn(DANGER)} onClick={() => { saveDrills(drills.filter(x => x.id !== d.id)); showToast('已刪除'); }}>刪除</button>
              </div>
            </div>
          ))}
        </div>
      </>)}

      {/* ── Staff Certifications ── */}
      {tab === 'certs' && (
        <div style={card}>
          <div style={hdr}>員工急救 / CPR 認證狀態</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: `2px solid ${BDR}` }}>{['員工', '職位', '急救證書', 'CPR認證', '狀態'].map(h => <th key={h} style={{ padding: 6, textAlign: 'left' }}>{h}</th>)}</tr></thead>
            <tbody>{employees.map(emp => {
              const hasFirstAid = emp.firstAidCert || false;
              const hasCPR = emp.cprCert || false;
              const expired = emp.certExpiry ? new Date(emp.certExpiry) < new Date() : false;
              const statusColor = hasFirstAid && hasCPR && !expired ? '#16a34a' : hasFirstAid || hasCPR ? WARN : '#999';
              const statusText = hasFirstAid && hasCPR && !expired ? '合格' : hasFirstAid || hasCPR ? '部分' : '未認證';
              return (
                <tr key={emp.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 6, fontWeight: 600 }}>{emp.name}</td>
                  <td style={{ padding: 6, color: '#666' }}>{emp.pos || '-'}</td>
                  <td style={{ padding: 6 }}><span style={tag(hasFirstAid ? '#16a34a' : '#999')}>{hasFirstAid ? '已取得' : '未取得'}</span></td>
                  <td style={{ padding: 6 }}><span style={tag(hasCPR ? '#16a34a' : '#999')}>{hasCPR ? '已取得' : '未取得'}</span></td>
                  <td style={{ padding: 6 }}><span style={tag(statusColor)}>{expired ? '已過期' : statusText}</span></td>
                </tr>
              );
            })}</tbody>
          </table>
          <p style={{ fontSize: 12, color: '#888', marginTop: 10 }}>認證資料可於員工管理頁面更新。建議所有員工每兩年更新急救及CPR認證。</p>
        </div>
      )}

      {/* ── Print Quick Reference ── */}
      {tab === 'print' && (
        <div style={card}>
          <div style={hdr}>緊急應變快速參考卡</div>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>一鍵列印所有緊急應變方案及聯絡電話的快速參考卡，建議張貼於診所當眼處。</p>
          <button style={btn()} onClick={printQuickRef}>列印快速參考卡</button>
          <div style={{ marginTop: 16, background: BG, border: `1px solid ${BDR}`, borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: A }}>預覽內容</div>
            {PROTOCOLS.map(p => (
              <div key={p.id} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.icon} {p.name}</div>
                <div style={{ fontSize: 12, color: '#555', paddingLeft: 8 }}>{p.steps[0]}；{p.steps[1]}…（共 {p.steps.length} 步）</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
