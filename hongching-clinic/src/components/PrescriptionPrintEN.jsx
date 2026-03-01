import { useState, useMemo } from 'react';
import { getDoctors, getStoreNames } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const today = () => new Date().toISOString().substring(0, 10);
const clinicMeta = () => { try { return JSON.parse(localStorage.getItem('hcmc_clinic') || '{}'); } catch { return {}; } };

/* ── TCM instruction translation map ── */
const INSTR_MAP = {
  '每日一劑': '1 dose daily',
  '每日兩劑': '2 doses daily',
  '水煎服': 'decoct in water',
  '溫服': 'take warm',
  '分兩次溫服': 'take twice warm',
  '分三次溫服': 'take three times warm',
  '飯前服': 'take before meals',
  '飯後服': 'take after meals',
  '空腹服': 'take on empty stomach',
  '睡前服': 'take before sleep',
  '頓服': 'take in a single dose',
  '沖服': 'dissolve and take',
  '外用': 'for external use only',
  '忌生冷': 'avoid cold/raw food',
  '忌辛辣': 'avoid spicy food',
  '忌油膩': 'avoid greasy food',
};

function translateInstr(cn) {
  if (!cn) return '1 dose daily, decoct in water, take twice warm';
  let en = cn;
  Object.entries(INSTR_MAP).forEach(([k, v]) => { en = en.replace(new RegExp(k, 'g'), v); });
  // Clean up residual Chinese punctuation
  en = en.replace(/[，、；。]/g, ', ').replace(/\s+/g, ' ').trim();
  return en;
}

/* ── Pinyin lookup (common herbs) ── */
const PINYIN = {
  '黃芪': 'Huang Qi', '當歸': 'Dang Gui', '白朮': 'Bai Zhu', '茯苓': 'Fu Ling',
  '甘草': 'Gan Cao', '人參': 'Ren Shen', '川芎': 'Chuan Xiong', '白芍': 'Bai Shao',
  '熟地黃': 'Shu Di Huang', '生地黃': 'Sheng Di Huang', '陳皮': 'Chen Pi',
  '半夏': 'Ban Xia', '柴胡': 'Chai Hu', '黃芩': 'Huang Qin', '大棗': 'Da Zao',
  '生薑': 'Sheng Jiang', '桂枝': 'Gui Zhi', '麻黃': 'Ma Huang', '杏仁': 'Xing Ren',
  '防風': 'Fang Feng', '荊芥': 'Jing Jie', '薄荷': 'Bo He', '連翹': 'Lian Qiao',
  '金銀花': 'Jin Yin Hua', '板藍根': 'Ban Lan Gen', '黃連': 'Huang Lian',
  '知母': 'Zhi Mu', '石膏': 'Shi Gao', '山藥': 'Shan Yao', '枸杞': 'Gou Qi Zi',
  '菊花': 'Ju Hua', '丹參': 'Dan Shen', '紅花': 'Hong Hua', '桃仁': 'Tao Ren',
  '延胡索': 'Yan Hu Suo', '三七': 'San Qi', '天麻': 'Tian Ma', '鉤藤': 'Gou Teng',
  '酸棗仁': 'Suan Zao Ren', '龍骨': 'Long Gu', '牡蠣': 'Mu Li', '附子': 'Fu Zi',
  '乾薑': 'Gan Jiang', '肉桂': 'Rou Gui', '砂仁': 'Sha Ren', '木香': 'Mu Xiang',
  '厚朴': 'Hou Po', '蒼朮': 'Cang Zhu', '薏苡仁': 'Yi Yi Ren', '澤瀉': 'Ze Xie',
};
const pinyin = (herb) => PINYIN[herb] || '';

/* ── Print styles ── */
const enStyles = `
  body{margin:0;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#333}
  .page{padding:40px 50px;max-width:700px;margin:0 auto;page-break-after:always}
  .page:last-child{page-break-after:auto}
  .header{text-align:center;border-bottom:3px double #0e7490;padding-bottom:14px;margin-bottom:12px}
  .header h1{font-size:18px;color:#0e7490;margin:0;letter-spacing:1px}
  .header .sub{font-size:12px;color:#0e7490;margin:2px 0;font-weight:600}
  .header p{font-size:11px;color:#888;margin:3px 0}
  .title{text-align:center;font-size:17px;font-weight:800;color:#0e7490;margin:14px 0 18px;letter-spacing:3px;text-transform:uppercase}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:13px;margin-bottom:16px}
  .info-grid .lbl{font-weight:700;color:#555}
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

const a5Over = `
  .page{padding:20px 24px;max-width:500px}
  .header h1{font-size:15px}
  .title{font-size:14px;margin:10px 0 12px}
  .info-grid{font-size:11px;gap:4px 16px}
  table.rx th,table.rx td{padding:4px 8px;font-size:11px}
  .section{padding:6px 10px;font-size:11px}
  .sig-row{margin-top:30px}
  .sig-line{margin-top:40px;font-size:10px}
  @page{size:A5;margin:10mm}
`;

const labelCSS = `
  body{margin:0;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif}
  .label{width:90mm;min-height:50mm;padding:6mm;box-sizing:border-box;font-size:11px;line-height:1.5;page-break-after:always}
  .label:last-child{page-break-after:auto}
  .lbl-header{text-align:center;border-bottom:1px solid #333;padding-bottom:4px;margin-bottom:6px}
  .lbl-header .name{font-size:13px;font-weight:800}
  .lbl-row{display:flex;justify-content:space-between;margin-bottom:2px}
  .lbl-inst{margin-top:6px;padding:4px;border:1px dashed #999;border-radius:2px;font-weight:700}
  .lbl-note{color:#c00;font-weight:700;font-size:10px;margin-top:4px}
  .lbl-foot{margin-top:6px;font-size:8px;color:#888;text-align:center;border-top:1px solid #ccc;padding-top:4px}
  @page{size:90mm 60mm;margin:0}
  @media print{body{margin:0}}
`;

const bilingualCSS = `
  body{margin:0;font-family:'Segoe UI','Microsoft YaHei','PingFang TC',sans-serif;color:#333}
  .page{padding:40px 50px;max-width:700px;margin:0 auto;page-break-after:always}
  .page:last-child{page-break-after:auto}
  .header{text-align:center;border-bottom:3px double #0e7490;padding-bottom:14px;margin-bottom:12px}
  .header h1{font-size:18px;color:#0e7490;margin:0}
  .header .cn{font-size:14px;color:#0e7490;margin:2px 0}
  .header p{font-size:11px;color:#888;margin:3px 0}
  .title{text-align:center;font-size:16px;font-weight:800;color:#0e7490;margin:14px 0 18px}
  .bi-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:12px;margin-bottom:14px}
  .bi-grid .lbl{font-weight:700;color:#555}
  .bi-grid .cn-val{font-size:11px;color:#888}
  table.rx{width:100%;border-collapse:collapse;margin:12px 0}
  table.rx th{background:#0e7490;color:#fff;padding:5px 8px;font-size:11px;text-align:left}
  table.rx td{padding:5px 8px;border-bottom:1px solid #eee;font-size:12px}
  table.rx tr:nth-child(even){background:#f9fafb}
  .section{margin:12px 0;padding:8px 12px;background:#f9fafb;border-left:3px solid #0e7490;border-radius:4px;font-size:12px}
  .sig-row{display:flex;justify-content:space-between;margin-top:40px}
  .sig-box{text-align:center;width:200px}
  .sig-line{border-top:1px solid #333;margin-top:50px;padding-top:6px;font-size:10px}
  .footer{text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:10px;margin-top:30px}
  @media print{body{margin:0}.page{padding:20px 30px}}
  @page{size:A4;margin:15mm}
`;

/* ── HTML builders ── */
function rxEnHtml(c, clinic, clinicName, storeName) {
  const rx = c.prescription || [];
  const rows = rx.map((r, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.herb)}${pinyin(r.herb) ? ` <span style="color:#888;font-size:11px">(${escapeHtml(pinyin(r.herb))})</span>` : ''}</td><td>${escapeHtml(r.dosage)}</td></tr>`).join('');
  const enInstr = translateInstr(c.formulaInstructions);
  return `<div class="header">
      <h1>Hong Ching Integrated Medical Centre</h1>
      <div class="sub">${escapeHtml(clinic.name || clinicName)}</div>
      <p>${escapeHtml(storeName)}</p>
      <p>Tel: ${escapeHtml(clinic.tel || '')}</p>
    </div>
    <div class="title">Prescription</div>
    <div class="info-grid">
      <div><span class="lbl">Patient Name: </span>${escapeHtml(c.patientName)}</div>
      <div><span class="lbl">Date: </span>${escapeHtml(c.date)}</div>
      <div><span class="lbl">Attending Doctor: </span>${escapeHtml(c.doctor)}</div>
      <div><span class="lbl">Days / Doses: </span>${c.formulaDays || '-'}</div>
      ${c.formulaName ? `<div><span class="lbl">Formula: </span>${escapeHtml(c.formulaName)}</div>` : '<div></div>'}
      <div><span class="lbl">Branch: </span>${escapeHtml(c.store || storeName)}</div>
    </div>
    ${rx.length > 0 ? `<table class="rx"><thead><tr><th>No.</th><th>Herb (Chinese / Pinyin)</th><th>Dosage</th></tr></thead><tbody>${rows}</tbody></table>` : '<p style="color:#999;text-align:center">(No prescription items)</p>'}
    ${enInstr ? `<div class="section"><b>Instructions: </b>${escapeHtml(enInstr)}</div>` : ''}
    ${c.specialNotes ? `<div class="section" style="border-left-color:#e67e22"><b>Special Notes: </b>${escapeHtml(c.specialNotes)}</div>` : ''}
    <div class="sig-row">
      <div class="sig-box"><div class="sig-line">Doctor Signature<br/>${escapeHtml(c.doctor)}</div></div>
      <div class="sig-box"><div class="sig-line">Clinic Stamp</div></div>
    </div>
    <div class="footer">Ref: ${escapeHtml((c.id || '').substring(0, 8))} | Hong Ching Integrated Medical Centre</div>`;
}

function labelEnHtml(c, clinic, clinicName, idx, total) {
  const rx = c.prescription || [];
  const herbs = rx.map(r => `${escapeHtml(r.herb)}${pinyin(r.herb) ? ` (${escapeHtml(pinyin(r.herb))})` : ''} ${escapeHtml(r.dosage)}`).join(', ');
  const enInstr = translateInstr(c.formulaInstructions);
  return `<div class="label">
      <div class="lbl-header"><div class="name">Hong Ching Integrated Medical Centre</div></div>
      <div class="lbl-row"><span><b>Patient: </b>${escapeHtml(c.patientName)}</span><span><b>Date: </b>${escapeHtml(c.date)}</span></div>
      <div class="lbl-row"><span><b>Doctor: </b>${escapeHtml(c.doctor)}</span><span><b>Doses: </b>${c.formulaDays || '-'}</span></div>
      ${c.formulaName ? `<div style="font-size:12px;font-weight:700;margin-top:4px">Formula: ${escapeHtml(c.formulaName)}</div>` : ''}
      ${herbs ? `<div style="font-size:10px;margin-top:4px;padding:4px;background:#f9f9f9;border-radius:2px">${herbs}</div>` : ''}
      <div class="lbl-inst">Directions: ${escapeHtml(enInstr)}</div>
      ${c.specialNotes ? `<div class="lbl-note">Warning: ${escapeHtml(c.specialNotes)}</div>` : ''}
      <div class="lbl-foot">If any discomfort, stop medication and contact the clinic immediately | ${idx}/${total}</div>
    </div>`;
}

function bilingualHtml(c, clinic, clinicName, storeName) {
  const rx = c.prescription || [];
  const rows = rx.map((r, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.herb)}</td><td>${escapeHtml(pinyin(r.herb) || '-')}</td><td>${escapeHtml(r.dosage)}</td></tr>`).join('');
  const enInstr = translateInstr(c.formulaInstructions);
  return `<div class="header">
      <h1>Hong Ching Integrated Medical Centre</h1>
      <div class="cn">${escapeHtml(clinic.name || clinicName)}</div>
      <p>${escapeHtml(storeName)}</p><p>Tel: ${escapeHtml(clinic.tel || '')}</p>
    </div>
    <div class="title">PRESCRIPTION / 中藥處方箋</div>
    <div class="bi-grid">
      <div><span class="lbl">Patient 病人: </span>${escapeHtml(c.patientName)}</div>
      <div><span class="lbl">Date 日期: </span>${escapeHtml(c.date)}</div>
      <div><span class="lbl">Doctor 醫師: </span>${escapeHtml(c.doctor)}</div>
      <div><span class="lbl">Days 帖數: </span>${c.formulaDays || '-'}</div>
      ${c.formulaName ? `<div><span class="lbl">Formula 處方: </span>${escapeHtml(c.formulaName)}</div>` : '<div></div>'}
      <div><span class="lbl">Branch 分店: </span>${escapeHtml(c.store || storeName)}</div>
    </div>
    ${rx.length > 0 ? `<table class="rx"><thead><tr><th>#</th><th>Herb 藥材</th><th>Pinyin 拼音</th><th>Dosage 劑量</th></tr></thead><tbody>${rows}</tbody></table>` : '<p style="color:#999;text-align:center">(No items / 無藥材記錄)</p>'}
    ${c.formulaInstructions || enInstr ? `<div class="section"><b>Instructions 服藥方法: </b><br/>${escapeHtml(c.formulaInstructions || '')}<br/>${escapeHtml(enInstr)}</div>` : ''}
    ${c.specialNotes ? `<div class="section" style="border-left-color:#e67e22"><b>Special Notes 特別注意: </b>${escapeHtml(c.specialNotes)}</div>` : ''}
    <div class="sig-row">
      <div class="sig-box"><div class="sig-line">Doctor Signature 醫師簽署<br/>${escapeHtml(c.doctor)}</div></div>
      <div class="sig-box"><div class="sig-line">Clinic Stamp 診所蓋章</div></div>
    </div>
    <div class="footer">Ref: ${escapeHtml((c.id || '').substring(0, 8))} | Hong Ching Integrated Medical Centre | ${escapeHtml(clinic.name || clinicName)}</div>`;
}

/* ── Component ── */
export default function PrescriptionPrintEN({ data, showToast, user }) {
  const [filterDate, setFilterDate] = useState(today());
  const [filterDoctor, setFilterDoctor] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({});

  const consultations = data.consultations || [];
  const doctors = getDoctors();
  const storeNames = getStoreNames();
  const clinicName = getClinicName();

  const withRx = useMemo(() => {
    return consultations
      .filter(c => (c.prescription || []).length > 0)
      .filter(c => {
        if (filterDate && c.date !== filterDate) return false;
        if (filterDoctor !== 'all' && c.doctor !== filterDoctor) return false;
        if (search) {
          const q = search.toLowerCase();
          return (c.patientName || '').toLowerCase().includes(q) || (c.formulaName || '').toLowerCase().includes(q) || (c.doctor || '').toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''));
  }, [consultations, filterDate, filterDoctor, search]);

  const selectedIds = Object.keys(selected).filter(k => selected[k]);
  const allChecked = withRx.length > 0 && selectedIds.length === withRx.length;

  const toggleAll = () => {
    if (allChecked) { setSelected({}); return; }
    const n = {}; withRx.forEach(c => { n[c.id] = true; }); setSelected(n);
  };

  const openPrint = (items, mode) => {
    if (!items.length) return showToast?.('Please select prescriptions first');
    const clinic = clinicMeta();
    const storeName = storeNames[0] || '';
    const w = window.open('', '_blank');
    if (!w) return showToast?.('Please allow pop-up windows');

    if (mode === 'label') {
      const total = items.length;
      const body = items.map((c, i) => labelEnHtml(c, clinic, clinicName, i + 1, total)).join('');
      w.document.write(`<!DOCTYPE html><html><head><title>Prescription Labels</title><style>${labelCSS}</style></head><body>${body}</body></html>`);
    } else if (mode === 'bilingual') {
      const body = items.map(c => `<div class="page">${bilingualHtml(c, clinic, clinicName, storeName)}</div>`).join('');
      w.document.write(`<!DOCTYPE html><html><head><title>Bilingual Prescription</title><style>${bilingualCSS}</style></head><body>${body}</body></html>`);
    } else {
      const isA5 = mode === 'a5';
      const body = items.map(c => `<div class="page">${rxEnHtml(c, clinic, clinicName, storeName)}</div>`).join('');
      w.document.write(`<!DOCTYPE html><html><head><title>Prescription Print</title><style>${enStyles}${isA5 ? a5Over : '@page{size:A4;margin:15mm}'}</style></head><body>${body}</body></html>`);
    }
    w.document.close();
    setTimeout(() => w.print(), 300);
    showToast?.(`Printing ${items.length} prescription(s)`);
  };

  const printSingle = (c, mode) => openPrint([c], mode);
  const printBatch = (mode) => openPrint(withRx.filter(c => selected[c.id]), mode);

  const stats = useMemo(() => ({
    total: withRx.length,
    doctors: [...new Set(withRx.map(c => c.doctor))].length,
    herbs: withRx.reduce((s, c) => s + (c.prescription || []).length, 0),
  }), [withRx]);

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">Prescriptions</div><div className="stat-value teal">{stats.total}</div></div>
        <div className="stat-card gold"><div className="stat-label">Doctors</div><div className="stat-value gold">{stats.doctors}</div></div>
        <div className="stat-card green"><div className="stat-label">Total Herbs</div><div className="stat-value green">{stats.herbs}</div></div>
        <div className="stat-card blue"><div className="stat-label">Selected</div><div className="stat-value blue">{selectedIds.length}</div></div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ width: 150 }} />
        <select value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">All Doctors</option>
          {doctors.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <input placeholder="Search patient / formula..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        <button className="btn btn-outline btn-sm" onClick={() => { setFilterDate(today()); setFilterDoctor('all'); setSearch(''); setSelected({}); }}>Reset</button>
      </div>

      {/* Batch Actions */}
      {selectedIds.length > 0 && (
        <div className="card" style={{ padding: 10, display: 'flex', gap: 8, alignItems: 'center', background: '#ecfdf5', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0e7490' }}>{selectedIds.length} selected</span>
          <button className="btn btn-teal btn-sm" onClick={() => printBatch('a4')}>A4 English</button>
          <button className="btn btn-outline btn-sm" onClick={() => printBatch('a5')}>A5 English</button>
          <button className="btn btn-outline btn-sm" onClick={() => printBatch('label')}>Label EN</button>
          <button className="btn btn-outline btn-sm" onClick={() => printBatch('bilingual')}>Bilingual</button>
          <button className="btn btn-outline btn-sm" onClick={() => setSelected({})}>Deselect All</button>
        </div>
      )}

      {/* Consultation List */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header"><h3>English Prescription List ({withRx.length})</h3></div>
        <div className="table-wrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allChecked} onChange={toggleAll} /></th>
                <th>Patient</th><th>Doctor</th><th>Formula</th><th>Days</th><th>Herbs</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {withRx.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 24 }}>No prescriptions found for this date</td></tr>
              )}
              {withRx.map(c => (
                <tr key={c.id} style={{ background: selected[c.id] ? '#ecfdf5' : undefined }}>
                  <td><input type="checkbox" checked={!!selected[c.id]} onChange={() => setSelected(s => ({ ...s, [c.id]: !s[c.id] }))} /></td>
                  <td style={{ fontWeight: 600 }}>{c.patientName}</td>
                  <td>{c.doctor}</td>
                  <td>{c.formulaName || '-'}</td>
                  <td>{c.formulaDays || '-'}</td>
                  <td>{(c.prescription || []).length}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-teal btn-sm" onClick={() => printSingle(c, 'a4')} style={{ marginRight: 4 }}>A4</button>
                    <button className="btn btn-outline btn-sm" onClick={() => printSingle(c, 'a5')} style={{ marginRight: 4 }}>A5</button>
                    <button className="btn btn-outline btn-sm" onClick={() => printSingle(c, 'label')} style={{ marginRight: 4 }}>Label</button>
                    <button className="btn btn-outline btn-sm" onClick={() => printSingle(c, 'bilingual')}>Bi</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
