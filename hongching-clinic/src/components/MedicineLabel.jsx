// Medicine Label Printing Component
// Generates printable labels for dispensed prescriptions

import { useState } from 'react';
import { getClinicName, getClinicNameEn, getTenantStores, getTenantStoreNames } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LABEL_STYLES = {
  container: {
    width: '90mm', minHeight: '60mm', padding: '6mm', border: '1px solid #333',
    fontFamily: "'Microsoft YaHei', 'PingFang TC', sans-serif", fontSize: 11,
    background: '#fff', color: '#000', lineHeight: 1.5, boxSizing: 'border-box',
  },
  header: { textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: 4, marginBottom: 6 },
  clinicName: { fontSize: 14, fontWeight: 800, margin: 0 },
  clinicNameEn: { fontSize: 8, color: '#666', margin: 0 },
  row: { display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: 11 },
  label: { fontWeight: 700, minWidth: 50 },
  herbList: { fontSize: 10, marginTop: 4, padding: 4, background: '#f9f9f9', borderRadius: 2 },
  instructions: { marginTop: 6, padding: 4, border: '1px dashed #999', borderRadius: 2, fontSize: 11, fontWeight: 700 },
  footer: { marginTop: 6, fontSize: 8, color: '#888', textAlign: 'center', borderTop: '1px solid #ccc', paddingTop: 4 },
  warning: { color: '#c00', fontWeight: 700, fontSize: 10, marginTop: 4 },
};

function LabelPreview({ consultation, clinicInfo, labelCount = 1 }) {
  const clinicName = getClinicName();
  const clinicNameEn = getClinicNameEn();
  const tenantStores = getTenantStores();
  const defaultStoreName = getTenantStoreNames()[0] || '';

  const rx = consultation.prescription || [];
  const herbList = rx.map(r => `${r.herb} ${r.dosage}`).join('、');
  const days = consultation.formulaDays || 3;
  const store = consultation.store || defaultStoreName;
  const matchedStore = tenantStores.find(s => s.name === store) || tenantStores[0] || {};
  const storeAddr = matchedStore.address || '';

  return (
    <div style={LABEL_STYLES.container} className="medicine-label">
      <div style={LABEL_STYLES.header}>
        <p style={LABEL_STYLES.clinicName}>{clinicInfo?.name || clinicName}</p>
        <p style={LABEL_STYLES.clinicNameEn}>{clinicInfo?.nameEn || clinicNameEn}</p>
        <p style={{ fontSize: 8, margin: 0 }}>{storeAddr}</p>
      </div>

      <div style={LABEL_STYLES.row}>
        <span><span style={LABEL_STYLES.label}>病人：</span>{consultation.patientName}</span>
        <span><span style={LABEL_STYLES.label}>日期：</span>{consultation.date}</span>
      </div>
      <div style={LABEL_STYLES.row}>
        <span><span style={LABEL_STYLES.label}>醫師：</span>{consultation.doctor}</span>
        <span><span style={LABEL_STYLES.label}>帖數：</span>{days} 帖</span>
      </div>
      {consultation.formulaName && (
        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>
          處方：{consultation.formulaName}
        </div>
      )}
      {rx.length > 0 && (
        <div style={LABEL_STYLES.herbList}>
          <span style={{ fontWeight: 600, fontSize: 9 }}>藥材組成：</span>
          <span style={{ fontSize: 10 }}>{herbList}</span>
        </div>
      )}
      <div style={LABEL_STYLES.instructions}>
        服法：{consultation.formulaInstructions || '每日一劑，水煎服'}
        {consultation.prescriptionType === 'granule' && (
          <div style={{ fontSize: 10, fontWeight: 400 }}>
            每日 {consultation.granuleDosesPerDay || 2} 次，每次以溫水沖服
          </div>
        )}
      </div>
      {consultation.specialNotes && (
        <div style={LABEL_STYLES.warning}>
          注意：{consultation.specialNotes}
        </div>
      )}
      <div style={LABEL_STYLES.footer}>
        <div>如有不適請立即停藥並聯絡本中心</div>
        <div>Label {labelCount} | Ref: {consultation.id?.substring(0, 8) || '-'}</div>
      </div>
    </div>
  );
}

export default function MedicineLabel({ consultation, onClose, showToast }) {
  const [copies, setCopies] = useState(1);
  const clinicName = getClinicName();
  const clinicNameEn = getClinicNameEn();
  const tenantStores = getTenantStores();
  const defaultStoreName = getTenantStoreNames()[0] || '';

  const clinicInfo = (() => {
    try { return JSON.parse(localStorage.getItem('hcmc_clinic') || '{}'); } catch { return {}; }
  })();

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) { showToast?.('請允許彈出視窗'); return; }

    const rx = consultation.prescription || [];
    const herbList = rx.map(r => `${r.herb} ${r.dosage}`).join('、');
    const days = consultation.formulaDays || 3;
    const store = consultation.store || defaultStoreName;
    const matchedStore = tenantStores.find(s => s.name === store) || tenantStores[0] || {};
    const storeAddr = matchedStore.address || '';

    const safeHerbList = rx.map(r => `${escapeHtml(r.herb)} ${escapeHtml(r.dosage)}`).join('、');

    const labelHtml = (num) => `
      <div class="label">
        <div class="header">
          <div class="clinic-name">${escapeHtml(clinicInfo?.name || clinicName)}</div>
          <div class="clinic-en">${escapeHtml(clinicInfo?.nameEn || clinicNameEn)}</div>
          <div class="clinic-addr">${escapeHtml(storeAddr)}</div>
        </div>
        <div class="row">
          <span><b>病人：</b>${escapeHtml(consultation.patientName)}</span>
          <span><b>日期：</b>${escapeHtml(consultation.date)}</span>
        </div>
        <div class="row">
          <span><b>醫師：</b>${escapeHtml(consultation.doctor)}</span>
          <span><b>帖數：</b>${days} 帖</span>
        </div>
        ${consultation.formulaName ? `<div class="formula"><b>處方：</b>${escapeHtml(consultation.formulaName)}</div>` : ''}
        ${rx.length > 0 ? `<div class="herbs"><span class="herbs-label">藥材組成：</span>${safeHerbList}</div>` : ''}
        <div class="instructions">
          <b>服法：</b>${escapeHtml(consultation.formulaInstructions || '每日一劑，水煎服')}
          ${consultation.prescriptionType === 'granule' ? `<div>每日 ${consultation.granuleDosesPerDay || 2} 次，每次以溫水沖服</div>` : ''}
        </div>
        ${consultation.specialNotes ? `<div class="warning">注意：${escapeHtml(consultation.specialNotes)}</div>` : ''}
        <div class="footer">
          <div>如有不適請立即停藥並聯絡本中心</div>
          <div>Label ${num}/${copies} | Ref: ${escapeHtml(consultation.id?.substring(0, 8) || '-')}</div>
        </div>
      </div>`;

    const labels = Array.from({ length: copies }, (_, i) => labelHtml(i + 1)).join('<div class="page-break"></div>');

    w.document.write(`<!DOCTYPE html><html><head><title>藥袋標籤</title>
      <style>
        @page { size: 90mm 60mm; margin: 0; }
        body { margin: 0; font-family: 'Microsoft YaHei', 'PingFang TC', sans-serif; }
        .label { width: 90mm; min-height: 56mm; padding: 6mm; box-sizing: border-box; font-size: 11px; line-height: 1.5; }
        .header { text-align: center; border-bottom: 1px solid #333; padding-bottom: 4px; margin-bottom: 6px; }
        .clinic-name { font-size: 14px; font-weight: 800; }
        .clinic-en { font-size: 8px; color: #666; }
        .clinic-addr { font-size: 8px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .row b { font-size: 11px; }
        .formula { font-size: 12px; font-weight: 700; margin-top: 4px; }
        .herbs { font-size: 10px; margin-top: 4px; padding: 4px; background: #f9f9f9; border-radius: 2px; }
        .herbs-label { font-weight: 600; font-size: 9px; }
        .instructions { margin-top: 6px; padding: 4px; border: 1px dashed #999; border-radius: 2px; font-weight: 700; }
        .warning { color: #c00; font-weight: 700; font-size: 10px; margin-top: 4px; }
        .footer { margin-top: 6px; font-size: 8px; color: #888; text-align: center; border-top: 1px solid #ccc; padding-top: 4px; }
        .page-break { page-break-after: always; }
        @media print { body { margin: 0; } }
      </style>
    </head><body>${labels}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
    showToast?.('正在列印藥袋標籤');
  };

  if (!consultation) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="藥袋標籤">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>藥袋標籤預覽</h3>
          <button className="btn btn-outline btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Preview */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
          <LabelPreview consultation={consultation} clinicInfo={clinicInfo} labelCount={1} />
        </div>

        {/* Options */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>列印份數：</label>
          <input type="number" min="1" max="10" value={copies} onChange={e => setCopies(Math.max(1, Number(e.target.value)))}
            style={{ width: 60 }} />
          <span style={{ fontSize: 12, color: '#888' }}>
            (每帖藥 1 個標籤，共 {consultation.formulaDays || 3} 帖 = 建議 {consultation.formulaDays || 3} 份)
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-teal" onClick={handlePrint}>
            🖨️ 列印標籤 ({copies} 份)
          </button>
          <button className="btn btn-outline" onClick={() => setCopies(consultation.formulaDays || 3)}>
            自動設定份數
          </button>
          <button className="btn btn-outline" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

export { LabelPreview };
