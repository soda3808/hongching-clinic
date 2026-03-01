import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS = 'hcmc_incidents';
const ACCENT = '#0e7490';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const load = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
const save = d => localStorage.setItem(LS, JSON.stringify(d));
const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toTimeString().slice(0, 5);

const TYPES = ['藥物事故', '治療不良反應', '跌倒', '針刺事故', '投訴', '設備故障', '其他'];
const SEVS = ['輕微', '中度', '嚴重', '危急'];
const STATUSES = ['已報告', '調查中', '已處理', '已結案'];
const SEV_C = { '輕微': '#16a34a', '中度': '#d97706', '嚴重': '#ea580c', '危急': '#dc2626' };
const STA_C = { '已報告': '#6366f1', '調查中': '#d97706', '已處理': '#0891b2', '已結案': '#16a34a' };

export default function IncidentReport({ showToast, user }) {
  const [rows, setRows] = useState(load);
  const [modal, setModal] = useState(null);          // 'new' | 'inv' | null
  const [sel, setSel] = useState(null);               // selected incident for investigation
  const [fType, setFType] = useState('all');
  const [fSev, setFSev] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  // new-incident form
  const [nDate, setNDate] = useState(today);
  const [nTime, setNTime] = useState(now);
  const [nType, setNType] = useState(TYPES[0]);
  const [nSev, setNSev] = useState(SEVS[0]);
  const [nPatient, setNPatient] = useState('');
  const [nLoc, setNLoc] = useState('');
  const [nDesc, setNDesc] = useState('');
  const [nAction, setNAction] = useState('');
  const [nWitness, setNWitness] = useState('');
  // investigation form
  const [iRoot, setIRoot] = useState('');
  const [iCorrect, setICorrect] = useState('');
  const [iPrevent, setIPrevent] = useState('');
  const [iPerson, setIPerson] = useState('');
  const [iTarget, setITarget] = useState('');

  const filtered = useMemo(() => {
    let list = [...rows];
    if (fType !== 'all') list = list.filter(r => r.type === fType);
    if (fSev !== 'all') list = list.filter(r => r.severity === fSev);
    if (fStatus !== 'all') list = list.filter(r => r.status === fStatus);
    return list.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  }, [rows, fType, fSev, fStatus]);

  const stats = useMemo(() => {
    const total = rows.length;
    const byType = TYPES.map(t => ({ label: t, count: rows.filter(r => r.type === t).length }));
    const bySev = SEVS.map(s => ({ label: s, count: rows.filter(r => r.severity === s).length }));
    const thisM = today().slice(0, 7);
    const lastM = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
    const mCount = rows.filter(r => (r.date || '').startsWith(thisM)).length;
    const lCount = rows.filter(r => (r.date || '').startsWith(lastM)).length;
    const trend = lCount ? Math.round((mCount - lCount) / lCount * 100) : 0;
    return { total, byType, bySev, mCount, trend };
  }, [rows]);

  const resetNew = () => { setNDate(today()); setNTime(now()); setNType(TYPES[0]); setNSev(SEVS[0]); setNPatient(''); setNLoc(''); setNDesc(''); setNAction(''); setNWitness(''); };
  const resetInv = () => { setIRoot(''); setICorrect(''); setIPrevent(''); setIPerson(''); setITarget(''); };

  const handleNew = () => {
    if (!nDesc.trim()) return showToast('請填寫事故描述');
    const rec = { id: uid(), date: nDate, time: nTime, type: nType, severity: nSev, patient: nPatient, location: nLoc, description: nDesc, action: nAction, witnesses: nWitness, reporter: user?.name || '未知', status: '已報告', investigation: null, createdAt: new Date().toISOString() };
    const next = [...rows, rec]; setRows(next); save(next); resetNew(); setModal(null); showToast('事故已報告');
  };

  const handleInv = () => {
    if (!sel) return;
    if (!iRoot.trim()) return showToast('請填寫根本原因');
    const inv = { rootCause: iRoot, corrective: iCorrect, preventive: iPrevent, person: iPerson, targetDate: iTarget, updatedAt: new Date().toISOString() };
    const next = rows.map(r => r.id === sel.id ? { ...r, investigation: inv, status: '調查中' } : r);
    setRows(next); save(next); resetInv(); setSel(null); setModal(null); showToast('調查已記錄');
  };

  const setStatus = (id, st) => { const next = rows.map(r => r.id === id ? { ...r, status: st } : r); setRows(next); save(next); showToast(`狀態已更新為${st}`); };
  const handleDel = id => { const next = rows.filter(r => r.id !== id); setRows(next); save(next); showToast('已刪除'); };

  const openInv = r => { setSel(r); const inv = r.investigation || {}; setIRoot(inv.rootCause || ''); setICorrect(inv.corrective || ''); setIPrevent(inv.preventive || ''); setIPerson(inv.person || ''); setITarget(inv.targetDate || ''); setModal('inv'); };

  const handlePrint = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const trs = filtered.map(r => `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.time||'')}</td><td>${escapeHtml(r.type)}</td><td style="color:${SEV_C[r.severity]};font-weight:700">${escapeHtml(r.severity)}</td><td>${escapeHtml(r.patient||'-')}</td><td style="color:${STA_C[r.status]};font-weight:700">${escapeHtml(r.status)}</td><td>${escapeHtml(r.reporter)}</td></tr>`).join('');
    const typeRows = stats.byType.filter(t => t.count).map(t => `<tr><td>${escapeHtml(t.label)}</td><td style="text-align:right;font-weight:700">${t.count}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>事故報告</title><style>body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:750px;margin:0 auto;font-size:13px}h1{font-size:18px;text-align:center;color:${ACCENT}}h2{font-size:14px;border-bottom:2px solid ${ACCENT};padding-bottom:4px;margin-top:20px;color:${ACCENT}}.sub{text-align:center;color:#888;font-size:11px;margin-bottom:20px}table{width:100%;border-collapse:collapse;margin-bottom:16px}th,td{padding:6px 10px;border-bottom:1px solid #eee;text-align:left}th{background:#f8f8f8;font-weight:700}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}.b{border:1px solid #ddd;border-radius:8px;padding:12px;text-align:center}.b .n{font-size:22px;font-weight:800}.b .l{font-size:10px;color:#888}@media print{body{margin:0;padding:10mm}}</style></head><body>
    <h1>${escapeHtml(getClinicName())} — 事故報告</h1><div class="sub">列印時間：${new Date().toLocaleString('zh-HK')} | 總事故：${stats.total}</div>
    <div class="g"><div class="b"><div class="n" style="color:${ACCENT}">${stats.total}</div><div class="l">總事故</div></div><div class="b"><div class="n" style="color:#d97706">${stats.mCount}</div><div class="l">本月事故</div></div><div class="b"><div class="n" style="color:${stats.trend>0?'#dc2626':'#16a34a'}">${stats.trend>0?'+':''}${stats.trend}%</div><div class="l">月度變化</div></div><div class="b"><div class="n" style="color:#dc2626">${stats.bySev.find(s=>s.label==='嚴重')?.count||0}</div><div class="l">嚴重事故</div></div></div>
    <h2>按類型統計</h2><table><thead><tr><th>類型</th><th style="text-align:right">數量</th></tr></thead><tbody>${typeRows}</tbody></table>
    <h2>事故列表</h2><table><thead><tr><th>日期</th><th>時間</th><th>類型</th><th>嚴重程度</th><th>病人</th><th>狀態</th><th>報告人</th></tr></thead><tbody>${trs||'<tr><td colspan="7" style="text-align:center;color:#aaa">暫無記錄</td></tr>'}</tbody></table></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 300);
  };

  const s = {
    card: { background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', marginBottom: 12 },
    hdr: { padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontWeight: 700, fontSize: 14, color: ACCENT },
    stat: { padding: 12, borderRadius: 8, textAlign: 'center', flex: 1, minWidth: 90 },
    inp: { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' },
    btn: { padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
    th: { padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 11, fontWeight: 700, textAlign: 'left', color: '#6b7280', whiteSpace: 'nowrap' },
    td: { padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 12, whiteSpace: 'nowrap' },
    badge: (c) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, color: '#fff', background: c }),
    lbl: { fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' },
  };

  const Overlay = ({ children, onClose }) => (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: 480, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>{children}</div>
    </div>);

  return (<>
    {/* Stats */}
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      <div style={{ ...s.stat, background: '#ecfeff' }}>
        <div style={{ fontSize: 10, color: ACCENT, fontWeight: 600 }}>總事故</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: ACCENT }}>{stats.total}</div>
      </div>
      <div style={{ ...s.stat, background: '#fef3c7' }}>
        <div style={{ fontSize: 10, color: '#92400e', fontWeight: 600 }}>本月</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}>{stats.mCount}</div>
      </div>
      <div style={{ ...s.stat, background: stats.trend > 0 ? '#fef2f2' : '#f0fdf4' }}>
        <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>月度趨勢</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: stats.trend > 0 ? '#dc2626' : '#16a34a' }}>{stats.trend > 0 ? '+' : ''}{stats.trend}%</div>
      </div>
      {stats.bySev.filter(sv => sv.count > 0).map(sv => (
        <div key={sv.label} style={{ ...s.stat, background: '#fafafa', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{sv.label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: SEV_C[sv.label] }}>{sv.count}</div>
        </div>
      ))}
    </div>

    {/* By type breakdown */}
    <div style={{ ...s.card }}>
      <div style={s.hdr}>按類型統計</div>
      <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {stats.byType.map(t => (
          <div key={t.label} style={{ padding: '6px 14px', borderRadius: 8, background: t.count ? '#ecfeff' : '#f9fafb', border: '1px solid #e5e7eb', fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}>{t.label}</span> <span style={{ fontWeight: 800, color: t.count ? ACCENT : '#aaa', marginLeft: 4 }}>{t.count}</span>
          </div>
        ))}
      </div>
    </div>

    {/* Filters + Actions */}
    <div style={{ ...s.card, padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select style={{ ...s.inp, width: 110 }} value={fType} onChange={e => setFType(e.target.value)}>
        <option value="all">全部類型</option>{TYPES.map(t => <option key={t}>{t}</option>)}
      </select>
      <select style={{ ...s.inp, width: 100 }} value={fSev} onChange={e => setFSev(e.target.value)}>
        <option value="all">全部程度</option>{SEVS.map(sv => <option key={sv}>{sv}</option>)}
      </select>
      <select style={{ ...s.inp, width: 100 }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
        <option value="all">全部狀態</option>{STATUSES.map(st => <option key={st}>{st}</option>)}
      </select>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <button style={{ ...s.btn, background: '#fef3c7', color: '#92400e' }} onClick={handlePrint}>列印報告</button>
        <button style={{ ...s.btn, background: ACCENT, color: '#fff' }} onClick={() => { resetNew(); setModal('new'); }}>+ 新增事故</button>
      </div>
    </div>

    {/* Incident Table */}
    <div style={{ ...s.card, padding: 0 }}>
      <div style={s.hdr}>事故記錄 ({filtered.length})</div>
      <div style={{ overflowX: 'auto', maxHeight: 500 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['日期', '時間', '類型', '嚴重程度', '病人', '地點', '狀態', '報告人', '操作'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
          <tbody>
            {!filtered.length && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無事故記錄</td></tr>}
            {filtered.map(r => (
              <tr key={r.id}>
                <td style={s.td}>{r.date}</td>
                <td style={s.td}>{r.time}</td>
                <td style={s.td}>{r.type}</td>
                <td style={s.td}><span style={s.badge(SEV_C[r.severity] || '#888')}>{r.severity}</span></td>
                <td style={{ ...s.td, fontWeight: 600 }}>{r.patient || '-'}</td>
                <td style={s.td}>{r.location || '-'}</td>
                <td style={s.td}><span style={s.badge(STA_C[r.status] || '#888')}>{r.status}</span></td>
                <td style={s.td}>{r.reporter}</td>
                <td style={s.td}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button style={{ ...s.btn, fontSize: 11, padding: '3px 8px', background: '#ecfeff', color: ACCENT }} onClick={() => openInv(r)}>調查</button>
                    {r.status !== '已結案' && STATUSES.indexOf(r.status) < 3 && (
                      <button style={{ ...s.btn, fontSize: 11, padding: '3px 8px', background: '#f0fdf4', color: '#16a34a' }} onClick={() => setStatus(r.id, STATUSES[STATUSES.indexOf(r.status) + 1])}>推進</button>
                    )}
                    <button style={{ ...s.btn, fontSize: 11, padding: '3px 8px', background: '#fee2e2', color: '#dc2626' }} onClick={() => handleDel(r.id)}>刪除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* New Incident Modal */}
    {modal === 'new' && (
      <Overlay onClose={() => setModal(null)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>新增事故報告</span>
          <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label style={s.lbl}>日期 *</label><input type="date" style={s.inp} value={nDate} onChange={e => setNDate(e.target.value)} /></div>
          <div><label style={s.lbl}>時間</label><input type="time" style={s.inp} value={nTime} onChange={e => setNTime(e.target.value)} /></div>
          <div><label style={s.lbl}>事故類型 *</label><select style={s.inp} value={nType} onChange={e => setNType(e.target.value)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label style={s.lbl}>嚴重程度 *</label><select style={s.inp} value={nSev} onChange={e => setNSev(e.target.value)}>{SEVS.map(sv => <option key={sv}>{sv}</option>)}</select></div>
          <div><label style={s.lbl}>病人姓名</label><input style={s.inp} placeholder="選填" value={nPatient} onChange={e => setNPatient(e.target.value)} /></div>
          <div><label style={s.lbl}>事故地點</label><input style={s.inp} placeholder="例：診療室1" value={nLoc} onChange={e => setNLoc(e.target.value)} /></div>
        </div>
        <div style={{ marginBottom: 10 }}><label style={s.lbl}>事故描述 *</label><textarea rows={3} style={{ ...s.inp, resize: 'vertical' }} placeholder="詳細描述事故經過..." value={nDesc} onChange={e => setNDesc(e.target.value)} /></div>
        <div style={{ marginBottom: 10 }}><label style={s.lbl}>即時處理措施</label><textarea rows={2} style={{ ...s.inp, resize: 'vertical' }} placeholder="已採取的即時行動..." value={nAction} onChange={e => setNAction(e.target.value)} /></div>
        <div style={{ marginBottom: 14 }}><label style={s.lbl}>目擊者</label><input style={s.inp} placeholder="目擊者姓名（選填）" value={nWitness} onChange={e => setNWitness(e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...s.btn, background: ACCENT, color: '#fff', flex: 1 }} onClick={handleNew}>提交報告</button>
          <button style={{ ...s.btn, background: '#f3f4f6', color: '#374151' }} onClick={() => setModal(null)}>取消</button>
        </div>
      </Overlay>
    )}

    {/* Investigation Modal */}
    {modal === 'inv' && sel && (
      <Overlay onClose={() => { setModal(null); setSel(null); }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>事故調查</span>
          <button onClick={() => { setModal(null); setSel(null); }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
        </div>
        <div style={{ background: '#f9fafb', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div><b>日期：</b>{sel.date} {sel.time}</div>
            <div><b>類型：</b>{sel.type}</div>
            <div><b>嚴重程度：</b><span style={{ color: SEV_C[sel.severity], fontWeight: 700 }}>{sel.severity}</span></div>
            <div><b>狀態：</b><span style={{ color: STA_C[sel.status], fontWeight: 700 }}>{sel.status}</span></div>
          </div>
          <div style={{ marginTop: 6 }}><b>描述：</b>{sel.description}</div>
        </div>
        <div style={{ marginBottom: 10 }}><label style={s.lbl}>根本原因分析 *</label><textarea rows={2} style={{ ...s.inp, resize: 'vertical' }} value={iRoot} onChange={e => setIRoot(e.target.value)} /></div>
        <div style={{ marginBottom: 10 }}><label style={s.lbl}>糾正措施</label><textarea rows={2} style={{ ...s.inp, resize: 'vertical' }} value={iCorrect} onChange={e => setICorrect(e.target.value)} /></div>
        <div style={{ marginBottom: 10 }}><label style={s.lbl}>預防措施</label><textarea rows={2} style={{ ...s.inp, resize: 'vertical' }} value={iPrevent} onChange={e => setIPrevent(e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div><label style={s.lbl}>負責人</label><input style={s.inp} value={iPerson} onChange={e => setIPerson(e.target.value)} /></div>
          <div><label style={s.lbl}>目標完成日期</label><input type="date" style={s.inp} value={iTarget} onChange={e => setITarget(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...s.btn, background: ACCENT, color: '#fff', flex: 1 }} onClick={handleInv}>儲存調查</button>
          <button style={{ ...s.btn, background: '#f3f4f6', color: '#374151' }} onClick={() => { setModal(null); setSel(null); }}>取消</button>
        </div>
      </Overlay>
    )}
  </>);
}
