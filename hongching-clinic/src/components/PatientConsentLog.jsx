import { useState, useMemo, useRef, useEffect } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_patient_consents';
const ACCENT = '#0e7490';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

const CONSENT_TYPES = [
  { key: 'treatment', label: '治療同意書', template: '本人已了解中醫治療之性質、目的及可能之風險，包括但不限於藥物過敏反應、治療後不適等，並同意接受醫師建議之治療方案。如治療過程中出現任何不適，本人會即時通知醫師。' },
  { key: 'acupuncture', label: '針灸同意書', template: '本人已了解針灸治療之程序、效果及潛在風險（包括暈針、出血、瘀青、氣胸等），並自願接受針灸治療。如有不適會即時通知醫師。本人確認已如實告知醫師本人之健康狀況。' },
  { key: 'cupping', label: '拔罐同意書', template: '本人已了解拔罐治療之程序及潛在風險（包括皮膚瘀斑、水泡、灼傷等），並自願接受拔罐治療。本人確認並無不適合拔罐之皮膚疾病或其他禁忌症。' },
  { key: 'data', label: '個人資料收集同意書', template: '本人同意診所收集、保存及使用本人之個人資料（包括姓名、身份證號碼、聯絡方式、病歷等），以作診症、配藥及行政管理之用途。資料將按《個人資料（私隱）條例》處理。' },
  { key: 'photo', label: '影像紀錄同意書', template: '本人同意診所為診斷及治療記錄之目的，拍攝本人之相片或影像。影像資料僅用於醫療紀錄，不會在未經同意下對外公開。' },
  { key: 'medication', label: '藥物使用同意書', template: '本人已了解醫師處方之中藥藥物成分、用法用量及可能之副作用，並同意按醫囑服用。如服藥後出現不良反應，本人會即時停藥並聯絡診所。' },
];

function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function save(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }
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
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { background: '#f1f5f9', padding: '10px 8px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' },
  td: { padding: '10px 8px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 28, width: '90%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' },
  modalTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#1e293b' },
  field: { marginBottom: 14 },
  label: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#334155' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' },
  select: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, minWidth: 120 },
  badge: (active) => ({ display: 'inline-block', background: active ? '#dcfce7' : '#fee2e2', color: active ? '#16a34a' : '#dc2626', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }),
  card: { background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.08)', marginBottom: 12 },
  filter: { display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' },
  canvas: { width: '100%', height: 150, display: 'block', borderRadius: 6, border: '2px dashed #cbd5e1', cursor: 'crosshair', touchAction: 'none', background: '#fff' },
};

export default function PatientConsentLog({ data, showToast, user }) {
  const patients = data?.patients || [];
  const [records, setRecords] = useState(load);
  const [tab, setTab] = useState('list');
  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState(null);
  const [showRevoke, setShowRevoke] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [patSearch, setPatSearch] = useState('');
  const [form, setForm] = useState({ patientId: '', patientName: '', consentType: 'treatment', date: new Date().toISOString().substring(0, 10), witnessName: user?.name || '', consentText: CONSENT_TYPES[0].template });
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPt = useRef(null);

  const persist = (arr) => { setRecords(arr); save(arr); };

  // Update consent text when type changes
  const updateType = (key) => {
    const t = CONSENT_TYPES.find(c => c.key === key);
    setForm(f => ({ ...f, consentType: key, consentText: t?.template || '' }));
  };

  // Canvas drawing setup
  useEffect(() => {
    if (!showAdd) return;
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2;
    }, 50);
    return () => clearTimeout(timer);
  }, [showAdd]);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const src = e.touches?.[0] || e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };
  const onDown = (e) => { e.preventDefault(); drawingRef.current = true; lastPt.current = getPoint(e); };
  const onMove = (e) => {
    e.preventDefault();
    if (!drawingRef.current) return;
    const pt = getPoint(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && lastPt.current && pt) {
      ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y);
      ctx.lineTo(pt.x, pt.y); ctx.stroke();
    }
    lastPt.current = pt;
  };
  const onUp = (e) => { e.preventDefault(); drawingRef.current = false; lastPt.current = null; };
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  const getSignatureData = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < px.length; i += 4) { if (px[i] > 0) return canvas.toDataURL('image/png'); }
    return null;
  };

  // Patient search results
  const patResults = useMemo(() => {
    if (!patSearch.trim()) return [];
    const q = patSearch.trim().toLowerCase();
    return patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [patSearch, patients]);

  // Filtered records
  const filtered = useMemo(() => {
    let list = [...records];
    if (search.trim()) { const q = search.trim().toLowerCase(); list = list.filter(c => (c.patientName || '').toLowerCase().includes(q) || (c.patientId || '').includes(q)); }
    if (filterType !== 'all') list = list.filter(c => c.consentType === filterType);
    if (filterStatus === 'active') list = list.filter(c => c.status === '有效');
    if (filterStatus === 'revoked') list = list.filter(c => c.status === '已撤回');
    if (dateFrom) list = list.filter(c => c.date >= dateFrom);
    if (dateTo) list = list.filter(c => c.date <= dateTo);
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [records, search, filterType, filterStatus, dateFrom, dateTo]);

  // Statistics
  const stats = useMemo(() => {
    const total = records.length;
    const active = records.filter(c => c.status === '有效').length;
    const revoked = records.filter(c => c.status === '已撤回').length;
    const rate = total ? ((revoked / total) * 100).toFixed(1) : '0.0';
    const byType = {};
    CONSENT_TYPES.forEach(t => { byType[t.key] = records.filter(c => c.consentType === t.key).length; });
    return { total, active, revoked, rate, byType };
  }, [records]);

  // Add consent
  const handleAdd = () => {
    if (!form.patientName) { showToast?.('請選擇病人'); return; }
    const sig = getSignatureData();
    if (!sig) { showToast?.('請在簽名板上簽名'); return; }
    const entry = { id: uid(), patientId: form.patientId, patientName: form.patientName, consentType: form.consentType, date: form.date, witnessName: form.witnessName, consentText: form.consentText, digitalSignature: sig, status: '有效', revokedAt: null, revokeReason: null, createdBy: user?.name || '系統', createdAt: new Date().toISOString() };
    persist([entry, ...records]);
    showToast?.('已新增同意紀錄');
    setShowAdd(false);
    setForm({ patientId: '', patientName: '', consentType: 'treatment', date: new Date().toISOString().substring(0, 10), witnessName: user?.name || '', consentText: CONSENT_TYPES[0].template });
    setPatSearch('');
  };

  // Revoke consent
  const handleRevoke = () => {
    if (!showRevoke) return;
    const updated = records.map(r => r.id === showRevoke.id ? { ...r, status: '已撤回', revokedAt: new Date().toISOString().substring(0, 10), revokeReason: revokeReason || '未提供原因' } : r);
    persist(updated);
    setDetail(updated.find(r => r.id === showRevoke.id) || null);
    showToast?.('已撤回同意');
    setShowRevoke(null);
    setRevokeReason('');
  };

  // Delete record
  const handleDelete = (id) => { persist(records.filter(r => r.id !== id)); setDetail(null); showToast?.('已刪除紀錄'); };

  // Print consent with signature
  const handlePrint = (c) => {
    const typeObj = CONSENT_TYPES.find(t => t.key === c.consentType);
    const clinic = getClinicName();
    const sigHtml = c.digitalSignature ? `<img src="${c.digitalSignature}" style="max-width:220px;max-height:80px;display:block;margin:8px auto 0" />` : '<div style="height:60px"></div>';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(typeObj?.label || '同意書')}</title>
      <style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:40px;max-width:700px;margin:0 auto;color:#1e293b}
      h1{text-align:center;font-size:20px;margin-bottom:4px}h2{text-align:center;font-size:16px;color:#475569;margin-top:0}
      .info{margin:24px 0;font-size:14px;line-height:1.8}.info span{display:inline-block;min-width:100px;font-weight:600}
      .text{border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0;font-size:14px;line-height:1.8}
      .sig{margin-top:36px;display:flex;justify-content:space-between}.sig-box{text-align:center;width:45%}
      .sig-line{border-top:1px solid #1e293b;margin-top:10px;padding-top:6px;font-size:13px}
      .footer{margin-top:40px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}
      .revoked{color:#dc2626;font-weight:700;text-align:center;padding:8px;border:2px solid #dc2626;border-radius:6px;margin:16px 0}
      @media print{body{padding:20px}}</style></head><body>
      <h1>${escapeHtml(clinic)}</h1><h2>${escapeHtml(typeObj?.label || '同意書')}</h2>
      ${c.status === '已撤回' ? '<div class="revoked">*** 此同意書已撤回 ***</div>' : ''}
      <div class="info"><p><span>病人姓名：</span>${escapeHtml(c.patientName || '-')}</p>
      <p><span>簽署日期：</span>${fmt(c.date)}</p>
      <p><span>見證人：</span>${escapeHtml(c.witnessName || '-')}</p>
      <p><span>狀態：</span>${escapeHtml(c.status)}${c.revokedAt ? '（' + fmt(c.revokedAt) + '）' : ''}</p></div>
      <div class="text"><strong>同意書內容：</strong><br><br>${escapeHtml(c.consentText || typeObj?.template || '')}</div>
      <div class="sig"><div class="sig-box">${sigHtml}<div class="sig-line">病人簽署</div></div>
      <div class="sig-box"><div style="height:60px"></div><div class="sig-line">見證人：${escapeHtml(c.witnessName || '')}</div></div></div>
      <div class="footer">${escapeHtml(clinic)} | 列印日期：${new Date().toLocaleDateString('zh-HK')}</div>
      </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html); w.document.close(); w.print();
  };

  const typeLabel = (key) => CONSENT_TYPES.find(t => t.key === key)?.label || key;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h2 style={S.title}>病人同意紀錄</h2>
        <button style={S.btn} onClick={() => setShowAdd(true)}>+ 新增同意紀錄</button>
      </div>

      <div style={S.tabs}>
        {[['list', '同意紀錄'], ['stats', '統計分析']].map(([k, l]) => (
          <span key={k} style={S.tab(tab === k)} onClick={() => setTab(k)}>{l}</span>
        ))}
      </div>

      {/* LIST TAB */}
      {tab === 'list' && (<>
        <div style={S.filter}>
          <input style={{ ...S.input, maxWidth: 180 }} placeholder="搜尋病人..." value={search} onChange={e => setSearch(e.target.value)} />
          <select style={S.select} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">全部類型</option>
            {CONSENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <select style={S.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">全部狀態</option>
            <option value="active">有效</option>
            <option value="revoked">已撤回</option>
          </select>
          <input type="date" style={{ ...S.input, maxWidth: 140 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="開始日期" />
          <input type="date" style={{ ...S.input, maxWidth: 140 }} value={dateTo} onChange={e => setDateTo(e.target.value)} title="結束日期" />
          <span style={{ fontSize: 13, color: '#64748b' }}>共 {filtered.length} 筆</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>病人</th><th style={S.th}>同意書類型</th><th style={S.th}>狀態</th>
              <th style={S.th}>見證人</th><th style={S.th}>日期</th><th style={S.th}>操作</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#94a3b8' }}>暫無紀錄</td></tr>}
              {filtered.map(c => (
                <tr key={c.id}>
                  <td style={S.td}>{c.patientName}</td>
                  <td style={S.td}>{typeLabel(c.consentType)}</td>
                  <td style={S.td}><span style={S.badge(c.status === '有效')}>{c.status}</span></td>
                  <td style={S.td}>{c.witnessName || '-'}</td>
                  <td style={S.td}>{fmt(c.date)}</td>
                  <td style={S.td}>
                    <button style={S.btnSm} onClick={() => setDetail(c)}>詳情</button>
                    <button style={{ ...S.btnSm, background: '#6366f1' }} onClick={() => handlePrint(c)}>列印</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}

      {/* STATS TAB */}
      {tab === 'stats' && (<>
        <div style={S.stats}>
          <div style={S.stat}><div style={S.statNum}>{stats.total}</div><div style={S.statLabel}>總同意紀錄</div></div>
          <div style={S.stat}><div style={S.statNum}>{stats.active}</div><div style={S.statLabel}>有效</div></div>
          <div style={S.stat}><div style={S.statNum}>{stats.revoked}</div><div style={S.statLabel}>已撤回</div></div>
          <div style={S.stat}><div style={S.statNum}>{stats.rate}%</div><div style={S.statLabel}>撤回率</div></div>
        </div>
        <div style={S.card}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>各類同意書數量</h3>
          {CONSENT_TYPES.map(t => {
            const cnt = stats.byType[t.key] || 0;
            const pct = stats.total ? Math.round((cnt / stats.total) * 100) : 0;
            return (
              <div key={t.key} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span>{t.label}</span><span style={{ fontWeight: 600, color: ACCENT }}>{cnt} 份 ({pct}%)</span>
                </div>
                <div style={{ background: '#e2e8f0', borderRadius: 4, height: 8 }}>
                  <div style={{ background: ACCENT, borderRadius: 4, height: 8, width: `${pct}%`, transition: 'width .3s' }} />
                </div>
              </div>
            );
          })}
        </div>
      </>)}

      {/* ADD MODAL */}
      {showAdd && (
        <div style={S.overlay} onClick={() => setShowAdd(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={S.modalTitle}>新增同意紀錄</h3>
            <div style={S.field}>
              <label style={S.label}>搜尋病人</label>
              <input style={S.input} placeholder="輸入姓名或電話..." value={patSearch} onChange={e => setPatSearch(e.target.value)} />
              {patResults.length > 0 && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, maxHeight: 140, overflowY: 'auto', marginTop: 4 }}>
                  {patResults.map(p => (
                    <div key={p.id} onClick={() => { setForm(f => ({ ...f, patientId: p.id, patientName: p.name })); setPatSearch(''); }}
                      style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0fdfa'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                      {p.name} {p.phone ? `(${p.phone})` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {form.patientName && <div style={{ marginBottom: 10, fontSize: 13, color: ACCENT, fontWeight: 600 }}>已選：{form.patientName}</div>}
            <div style={S.field}>
              <label style={S.label}>同意書類型</label>
              <select style={{ ...S.select, width: '100%' }} value={form.consentType} onChange={e => updateType(e.target.value)}>
                {CONSENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div style={S.field}>
              <label style={S.label}>日期</label>
              <input type="date" style={S.input} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div style={S.field}>
              <label style={S.label}>見證人</label>
              <input style={S.input} value={form.witnessName} onChange={e => setForm(f => ({ ...f, witnessName: e.target.value }))} placeholder="見證人姓名" />
            </div>
            <div style={S.field}>
              <label style={S.label}>同意書內容</label>
              <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical' }} value={form.consentText} onChange={e => setForm(f => ({ ...f, consentText: e.target.value }))} />
            </div>
            <div style={S.field}>
              <label style={S.label}>病人簽名</label>
              <canvas ref={canvasRef} style={S.canvas}
                onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} />
              <button style={{ ...S.btnOutline, marginTop: 6, padding: '4px 12px', fontSize: 12 }} onClick={clearCanvas}>清除簽名</button>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={S.btnOutline} onClick={() => setShowAdd(false)}>取消</button>
              <button style={S.btn} onClick={handleAdd}>確認新增</button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detail && (
        <div style={S.overlay} onClick={() => setDetail(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={S.modalTitle}>{typeLabel(detail.consentType)}</h3>
            <div style={{ fontSize: 14, lineHeight: 1.8, marginBottom: 16 }}>
              <p><strong>病人：</strong>{detail.patientName}</p>
              <p><strong>簽署日期：</strong>{fmt(detail.date)}</p>
              <p><strong>見證人：</strong>{detail.witnessName || '-'}</p>
              <p><strong>狀態：</strong><span style={S.badge(detail.status === '有效')}>{detail.status}</span></p>
              {detail.revokedAt && <p><strong>撤回日期：</strong>{fmt(detail.revokedAt)}</p>}
              {detail.revokeReason && <p><strong>撤回原因：</strong>{detail.revokeReason}</p>}
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 14, lineHeight: 1.8, color: '#334155' }}>
              <strong>同意書全文：</strong><br />{detail.consentText || CONSENT_TYPES.find(t => t.key === detail.consentType)?.template}
            </div>
            {detail.digitalSignature && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#334155' }}>病人簽名</div>
                <img src={detail.digitalSignature} alt="簽名" style={{ maxWidth: 240, maxHeight: 90, border: '1px solid #e2e8f0', borderRadius: 6, padding: 6 }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button style={S.btnDanger} onClick={() => handleDelete(detail.id)}>刪除</button>
              {detail.status === '有效' && <button style={{ ...S.btnOutline, color: '#ef4444', borderColor: '#ef4444' }} onClick={() => { setShowRevoke(detail); setRevokeReason(''); }}>撤回同意</button>}
              <button style={{ ...S.btnSm, background: '#6366f1', padding: '7px 16px', fontSize: 13 }} onClick={() => handlePrint(detail)}>列印</button>
              <button style={S.btn} onClick={() => setDetail(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}

      {/* REVOKE MODAL */}
      {showRevoke && (
        <div style={S.overlay} onClick={() => setShowRevoke(null)}>
          <div style={{ ...S.modal, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3 style={S.modalTitle}>撤回同意書</h3>
            <p style={{ fontSize: 14, color: '#475569', marginBottom: 12 }}>確定要撤回 <strong>{showRevoke.patientName}</strong> 的「{typeLabel(showRevoke.consentType)}」？</p>
            <div style={S.field}>
              <label style={S.label}>撤回原因</label>
              <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={revokeReason} onChange={e => setRevokeReason(e.target.value)} placeholder="請輸入撤回原因（選填）" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={S.btnOutline} onClick={() => setShowRevoke(null)}>取消</button>
              <button style={{ ...S.btn, background: '#ef4444' }} onClick={handleRevoke}>確認撤回</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
