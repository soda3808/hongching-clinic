import { useState, useMemo } from 'react';
import { getDoctors, getStoreNames, getDefaultStore } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const today = () => new Date().toISOString().substring(0, 10);

const clinicMeta = () => {
  try { return JSON.parse(localStorage.getItem('hcmc_clinic') || '{}'); } catch { return {}; }
};

const printStyles = `
  body{margin:0;font-family:'Microsoft YaHei','PingFang TC',sans-serif;color:#333}
  .page{padding:40px 50px;max-width:700px;margin:0 auto;page-break-after:always}
  .page:last-child{page-break-after:auto}
  .header{text-align:center;border-bottom:3px double #0e7490;padding-bottom:14px;margin-bottom:12px}
  .header h1{font-size:20px;color:#0e7490;margin:0;letter-spacing:2px}
  .header p{font-size:11px;color:#888;margin:3px 0}
  .title{text-align:center;font-size:18px;font-weight:800;color:#0e7490;margin:14px 0 18px;letter-spacing:4px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:13px;margin-bottom:16px}
  .info-grid .lbl{font-weight:700;color:#555;display:inline}
  table.rx{width:100%;border-collapse:collapse;margin:12px 0}
  table.rx th{background:#0e7490;color:#fff;padding:6px 10px;font-size:12px;text-align:left}
  table.rx td{padding:6px 10px;border-bottom:1px solid #eee;font-size:13px}
  table.rx tr:nth-child(even){background:#f9fafb}
  .section{margin:14px 0;padding:10px 14px;background:#f9fafb;border-left:3px solid #0e7490;border-radius:4px;font-size:13px}
  .sig-row{display:flex;justify-content:space-between;margin-top:50px}
  .sig-box{text-align:center;width:200px}
  .sig-line{border-top:1px solid #333;margin-top:60px;padding-top:6px;font-size:11px}
  .footer{text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:10px;margin-top:30px}
  @media print{body{margin:0}.page{padding:20px 30px}}
`;

const a5Overrides = `
  .page{padding:20px 24px;max-width:500px}
  .header h1{font-size:16px}
  .title{font-size:15px;margin:10px 0 12px}
  .info-grid{font-size:11px;gap:4px 16px}
  table.rx th,table.rx td{padding:4px 8px;font-size:11px}
  .section{padding:6px 10px;font-size:11px}
  .sig-row{margin-top:30px}
  .sig-line{margin-top:40px;font-size:10px}
  @page{size:A5;margin:10mm}
`;

const labelStyles = `
  body{margin:0;font-family:'Microsoft YaHei','PingFang TC',sans-serif}
  .label{width:90mm;min-height:50mm;padding:6mm;box-sizing:border-box;font-size:11px;line-height:1.5;page-break-after:always}
  .label:last-child{page-break-after:auto}
  .lbl-header{text-align:center;border-bottom:1px solid #333;padding-bottom:4px;margin-bottom:6px}
  .lbl-header .name{font-size:14px;font-weight:800}
  .lbl-row{display:flex;justify-content:space-between;margin-bottom:2px}
  .lbl-row b{font-size:11px}
  .lbl-inst{margin-top:6px;padding:4px;border:1px dashed #999;border-radius:2px;font-weight:700}
  .lbl-note{color:#c00;font-weight:700;font-size:10px;margin-top:4px}
  .lbl-foot{margin-top:6px;font-size:8px;color:#888;text-align:center;border-top:1px solid #ccc;padding-top:4px}
  @page{size:90mm 60mm;margin:0}
  @media print{body{margin:0}}
`;

function rxHtml(c, clinic, clinicName, storeName) {
  const rx = c.prescription || [];
  const rows = rx.map((r, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.herb)}</td><td>${escapeHtml(r.dosage)}</td></tr>`).join('');
  return `
    <div class="header">
      <h1>${escapeHtml(clinic.name || clinicName)}</h1>
      <p>${escapeHtml(storeName)}</p>
      <p>Tel: ${escapeHtml(clinic.tel || '')}</p>
    </div>
    <div class="title">中 藥 處 方 箋</div>
    <div class="info-grid">
      <div><span class="lbl">病人姓名：</span>${escapeHtml(c.patientName)}</div>
      <div><span class="lbl">就診日期：</span>${escapeHtml(c.date)}</div>
      <div><span class="lbl">主診醫師：</span>${escapeHtml(c.doctor)}</div>
      <div><span class="lbl">帖數：</span>${c.formulaDays || '-'} 帖</div>
      ${c.formulaName ? `<div><span class="lbl">處方名稱：</span>${escapeHtml(c.formulaName)}</div>` : '<div></div>'}
      <div><span class="lbl">分店：</span>${escapeHtml(c.store || storeName)}</div>
    </div>
    ${rx.length > 0 ? `<table class="rx"><thead><tr><th>#</th><th>藥材名稱</th><th>劑量</th></tr></thead><tbody>${rows}</tbody></table>` : '<p style="color:#999;text-align:center">（無藥材記錄）</p>'}
    ${c.formulaInstructions ? `<div class="section"><b>服藥方法：</b>${escapeHtml(c.formulaInstructions)}</div>` : ''}
    ${c.specialNotes ? `<div class="section" style="border-left-color:#e67e22"><b>特別注意：</b>${escapeHtml(c.specialNotes)}</div>` : ''}
    <div class="sig-row">
      <div class="sig-box"><div class="sig-line">主診醫師簽署<br/>${escapeHtml(c.doctor)}</div></div>
      <div class="sig-box"><div class="sig-line">診所蓋章</div></div>
    </div>
    <div class="footer">Ref: ${escapeHtml((c.id || '').substring(0, 8))} | ${escapeHtml(clinic.name || clinicName)}</div>`;
}

function labelHtml(c, clinic, clinicName, idx, total) {
  const rx = c.prescription || [];
  const herbs = rx.map(r => `${escapeHtml(r.herb)} ${escapeHtml(r.dosage)}`).join('、');
  return `
    <div class="label">
      <div class="lbl-header"><div class="name">${escapeHtml(clinic.name || clinicName)}</div></div>
      <div class="lbl-row"><span><b>病人：</b>${escapeHtml(c.patientName)}</span><span><b>日期：</b>${escapeHtml(c.date)}</span></div>
      <div class="lbl-row"><span><b>醫師：</b>${escapeHtml(c.doctor)}</span><span><b>帖數：</b>${c.formulaDays || '-'} 帖</span></div>
      ${c.formulaName ? `<div style="font-size:12px;font-weight:700;margin-top:4px">處方：${escapeHtml(c.formulaName)}</div>` : ''}
      ${herbs ? `<div style="font-size:10px;margin-top:4px;padding:4px;background:#f9f9f9;border-radius:2px">${herbs}</div>` : ''}
      <div class="lbl-inst">服法：${escapeHtml(c.formulaInstructions || '每日一劑，水煎服')}</div>
      ${c.specialNotes ? `<div class="lbl-note">注意：${escapeHtml(c.specialNotes)}</div>` : ''}
      <div class="lbl-foot">如有不適請立即停藥並聯絡本中心 | ${idx}/${total}</div>
    </div>`;
}

export default function PrescriptionPrint({ data, showToast, user }) {
  const [filterDate, setFilterDate] = useState(today());
  const [filterDoctor, setFilterDoctor] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({});
  const [previewId, setPreviewId] = useState(null);

  const consultations = data.consultations || [];
  const doctors = getDoctors();
  const storeNames = getStoreNames();
  const defaultStore = getDefaultStore();
  const clinicName = getClinicName();

  const withRx = useMemo(() => {
    return consultations
      .filter(c => (c.prescription || []).length > 0)
      .filter(c => {
        if (filterDate && c.date !== filterDate) return false;
        if (filterDoctor !== 'all' && c.doctor !== filterDoctor) return false;
        if (search) {
          const q = search.toLowerCase();
          return (c.patientName || '').toLowerCase().includes(q)
            || (c.formulaName || '').toLowerCase().includes(q)
            || (c.doctor || '').toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''));
  }, [consultations, filterDate, filterDoctor, search]);

  const selectedIds = Object.keys(selected).filter(k => selected[k]);
  const allChecked = withRx.length > 0 && selectedIds.length === withRx.length;
  const previewItem = consultations.find(c => c.id === previewId);

  const toggleAll = () => {
    if (allChecked) { setSelected({}); return; }
    const next = {};
    withRx.forEach(c => { next[c.id] = true; });
    setSelected(next);
  };

  const openPrint = (items, mode) => {
    if (!items.length) return showToast?.('請先選擇處方');
    const clinic = clinicMeta();
    const storeName = storeNames[0] || '';
    const w = window.open('', '_blank');
    if (!w) return showToast?.('請允許彈出視窗');

    if (mode === 'label') {
      const total = items.length;
      const body = items.map((c, i) => labelHtml(c, clinic, clinicName, i + 1, total)).join('');
      w.document.write(`<!DOCTYPE html><html><head><title>處方標籤</title><style>${labelStyles}</style></head><body>${body}</body></html>`);
    } else {
      const isA5 = mode === 'a5';
      const body = items.map(c => `<div class="page">${rxHtml(c, clinic, clinicName, storeName)}</div>`).join('');
      w.document.write(`<!DOCTYPE html><html><head><title>處方箋列印</title><style>${printStyles}${isA5 ? a5Overrides : '@page{size:A4;margin:15mm}'}</style></head><body>${body}</body></html>`);
    }
    w.document.close();
    setTimeout(() => w.print(), 300);
    showToast?.(`正在列印 ${items.length} 張處方`);
  };

  const printSingle = (c, mode) => openPrint([c], mode);

  const printBatch = (mode) => {
    const items = withRx.filter(c => selected[c.id]);
    openPrint(items, mode);
  };

  const stats = useMemo(() => ({
    total: withRx.length,
    doctors: [...new Set(withRx.map(c => c.doctor))].length,
    herbs: withRx.reduce((s, c) => s + (c.prescription || []).length, 0),
  }), [withRx]);

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">今日處方數</div><div className="stat-value teal">{stats.total}</div></div>
        <div className="stat-card gold"><div className="stat-label">涉及醫師</div><div className="stat-value gold">{stats.doctors}</div></div>
        <div className="stat-card green"><div className="stat-label">藥材總項</div><div className="stat-value green">{stats.herbs}</div></div>
        <div className="stat-card blue"><div className="stat-label">已選列印</div><div className="stat-value blue">{selectedIds.length}</div></div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ width: 150 }} />
        <select value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">全部醫師</option>
          {doctors.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <input placeholder="搜尋病人/處方..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <button className="btn btn-outline btn-sm" onClick={() => { setFilterDate(today()); setFilterDoctor('all'); setSearch(''); setSelected({}); }}>重置</button>
      </div>

      {/* Batch Actions */}
      {selectedIds.length > 0 && (
        <div className="card" style={{ padding: 10, display: 'flex', gap: 8, alignItems: 'center', background: '#ecfdf5', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0e7490' }}>已選 {selectedIds.length} 張</span>
          <button className="btn btn-teal btn-sm" onClick={() => printBatch('a4')}>A4 列印</button>
          <button className="btn btn-outline btn-sm" onClick={() => printBatch('a5')}>A5 列印</button>
          <button className="btn btn-outline btn-sm" onClick={() => printBatch('label')}>標籤列印</button>
          <button className="btn btn-outline btn-sm" onClick={() => setSelected({})}>取消選擇</button>
        </div>
      )}

      {/* Consultation List */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header"><h3>處方列表 ({withRx.length})</h3></div>
        <div className="table-wrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                <th>病人</th><th>醫師</th><th>處方</th><th>帖數</th><th>藥味</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {withRx.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 24 }}>此日期無處方記錄</td></tr>
              )}
              {withRx.map(c => (
                <tr key={c.id} style={{ background: selected[c.id] ? '#ecfdf5' : undefined }}>
                  <td><input type="checkbox" checked={!!selected[c.id]} onChange={() => setSelected(s => ({ ...s, [c.id]: !s[c.id] }))} /></td>
                  <td style={{ fontWeight: 600 }}>{c.patientName}</td>
                  <td>{c.doctor}</td>
                  <td>{c.formulaName || '-'}</td>
                  <td>{c.formulaDays || '-'}</td>
                  <td>{(c.prescription || []).length} 味</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-teal btn-sm" onClick={() => setPreviewId(c.id)} style={{ marginRight: 4 }}>預覽</button>
                    <button className="btn btn-outline btn-sm" onClick={() => printSingle(c, 'a4')} style={{ marginRight: 4 }}>A4</button>
                    <button className="btn btn-outline btn-sm" onClick={() => printSingle(c, 'a5')} style={{ marginRight: 4 }}>A5</button>
                    <button className="btn btn-outline btn-sm" onClick={() => printSingle(c, 'label')}>標籤</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Modal */}
      {previewItem && (
        <div className="modal-overlay" onClick={() => setPreviewId(null)} role="dialog" aria-modal="true" aria-label="處方預覽">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: '#0e7490' }}>處方預覽</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setPreviewId(null)}>✕</button>
            </div>

            {/* Preview Content */}
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, background: '#fff', marginBottom: 16 }}>
              <div style={{ textAlign: 'center', borderBottom: '3px double #0e7490', paddingBottom: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0e7490', letterSpacing: 2 }}>{clinicMeta().name || clinicName}</div>
                <div style={{ fontSize: 10, color: '#888' }}>{storeNames[0] || ''}</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, textAlign: 'center', color: '#0e7490', margin: '12px 0', letterSpacing: 4 }}>中 藥 處 方 箋</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px', fontSize: 13, marginBottom: 12 }}>
                <div><b>病人姓名：</b>{previewItem.patientName}</div>
                <div><b>就診日期：</b>{previewItem.date}</div>
                <div><b>主診醫師：</b>{previewItem.doctor}</div>
                <div><b>帖數：</b>{previewItem.formulaDays || '-'} 帖</div>
                {previewItem.formulaName && <div><b>處方名稱：</b>{previewItem.formulaName}</div>}
                <div><b>分店：</b>{previewItem.store || defaultStore}</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', margin: '8px 0' }}>
                <thead>
                  <tr style={{ background: '#0e7490' }}>
                    <th style={{ color: '#fff', padding: '5px 8px', fontSize: 12, textAlign: 'left' }}>#</th>
                    <th style={{ color: '#fff', padding: '5px 8px', fontSize: 12, textAlign: 'left' }}>藥材名稱</th>
                    <th style={{ color: '#fff', padding: '5px 8px', fontSize: 12, textAlign: 'left' }}>劑量</th>
                  </tr>
                </thead>
                <tbody>
                  {(previewItem.prescription || []).map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <td style={{ padding: '5px 8px', fontSize: 13, borderBottom: '1px solid #eee' }}>{i + 1}</td>
                      <td style={{ padding: '5px 8px', fontSize: 13, borderBottom: '1px solid #eee' }}>{r.herb}</td>
                      <td style={{ padding: '5px 8px', fontSize: 13, borderBottom: '1px solid #eee' }}>{r.dosage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewItem.formulaInstructions && (
                <div style={{ margin: '10px 0', padding: '8px 12px', background: '#f9fafb', borderLeft: '3px solid #0e7490', borderRadius: 4, fontSize: 13 }}>
                  <b>服藥方法：</b>{previewItem.formulaInstructions}
                </div>
              )}
              {previewItem.specialNotes && (
                <div style={{ margin: '10px 0', padding: '8px 12px', background: '#fef9ee', borderLeft: '3px solid #e67e22', borderRadius: 4, fontSize: 13 }}>
                  <b>特別注意：</b>{previewItem.specialNotes}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36 }}>
                <div style={{ textAlign: 'center', width: 180 }}>
                  <div style={{ borderTop: '1px solid #333', marginTop: 48, paddingTop: 6, fontSize: 11 }}>主診醫師簽署<br />{previewItem.doctor}</div>
                </div>
                <div style={{ textAlign: 'center', width: 180 }}>
                  <div style={{ borderTop: '1px solid #333', marginTop: 48, paddingTop: 6, fontSize: 11 }}>診所蓋章</div>
                </div>
              </div>
            </div>

            {/* Preview Actions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-teal" onClick={() => { printSingle(previewItem, 'a4'); setPreviewId(null); }}>A4 列印</button>
              <button className="btn btn-outline" onClick={() => { printSingle(previewItem, 'a5'); setPreviewId(null); }}>A5 列印</button>
              <button className="btn btn-outline" onClick={() => { printSingle(previewItem, 'label'); setPreviewId(null); }}>標籤列印</button>
              <button className="btn btn-outline" onClick={() => setPreviewId(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
