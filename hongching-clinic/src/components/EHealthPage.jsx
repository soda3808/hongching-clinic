// ══════════════════════════════════
// eHealth 醫健通 Integration Page
// FHIR export, sharing dashboard, consent management
// ══════════════════════════════════

import { useState, useMemo } from 'react';
import { toFHIRBundle, toFHIRPatient, exportFHIRJSON } from '../utils/fhir';
import { CM_DIAGNOSES, DIAGNOSIS_CATEGORIES, searchDiagnoses } from '../data/hkctt';
import { getClinicName, getClinicNameEn } from '../tenant';

const TABS = ['dashboard', 'export', 'codes', 'guide'];
const TAB_LABELS = { dashboard: '分享總覽', export: 'FHIR 匯出', codes: '診斷編碼表', guide: '接入指南' };

export default function EHealthPage({ data = {}, user }) {
  const [tab, setTab] = useState('dashboard');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [diagSearch, setDiagSearch] = useState('');
  const [diagCat, setDiagCat] = useState('');
  const [exportResult, setExportResult] = useState(null);
  const [showFHIR, setShowFHIR] = useState(false);

  const patients = data.patients || [];
  const consultations = data.consultations || [];

  // Stats
  const stats = useMemo(() => {
    const patientsWithConsent = patients.filter(p => p.ehrConsent);
    const consultWithDiag = consultations.filter(c => c.cmDiagnosisCode || c.icd10);
    const consultTotal = consultations.length;
    return {
      totalPatients: patients.length,
      consentedPatients: patientsWithConsent.length,
      codedConsults: consultWithDiag.length,
      totalConsults: consultTotal,
      codingRate: consultTotal > 0 ? Math.round(consultWithDiag.length / consultTotal * 100) : 0,
    };
  }, [patients, consultations]);

  // FHIR Export
  function handleExport() {
    if (!selectedPatient) return;
    const patient = patients.find(p => p.id === selectedPatient);
    if (!patient) return;
    const patientConsults = consultations.filter(c =>
      c.patientId === patient.id || c.patientName === patient.name
    );
    const bundle = toFHIRBundle(patient, patientConsults);
    const json = exportFHIRJSON(bundle);
    setExportResult({ bundle, json, patient, consultCount: patientConsults.length });
  }

  function downloadFHIR() {
    if (!exportResult) return;
    const blob = new Blob([exportResult.json], { type: 'application/fhir+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ehealth-${exportResult.patient.name}-${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Diagnosis code search
  const diagResults = useMemo(() => {
    if (diagSearch) return searchDiagnoses(diagSearch);
    if (diagCat) return CM_DIAGNOSES.filter(d => d.cat === diagCat);
    return CM_DIAGNOSES.slice(0, 15);
  }, [diagSearch, diagCat]);

  // Filter patients
  const filteredPatients = useMemo(() => {
    if (!searchQ) return patients.slice(0, 50);
    const q = searchQ.toLowerCase();
    return patients.filter(p =>
      p.name?.includes(searchQ) || p.phone?.includes(searchQ)
    ).slice(0, 50);
  }, [patients, searchQ]);

  return (
    <div>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 22 }}>eHealth</span>
        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 400 }}>醫健通對接</span>
      </h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : ''}`}
            style={{ fontSize: 13, padding: '6px 14px' }}
            onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* ── Dashboard Tab ── */}
      {tab === 'dashboard' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard label="病人總數" value={stats.totalPatients} />
            <StatCard label="已授權 eHR 分享" value={stats.consentedPatients} sub={`${stats.totalPatients > 0 ? Math.round(stats.consentedPatients / stats.totalPatients * 100) : 0}%`} color="#10b981" />
            <StatCard label="已編碼診症" value={stats.codedConsults} sub={`${stats.codingRate}%`} color="#6366f1" />
            <StatCard label="FHIR 資源可用" value={stats.codedConsults > 0 ? 'Ready' : 'Pending'} color={stats.codedConsults > 0 ? '#10b981' : '#f59e0b'} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>eHRSS 對接狀態</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <StatusRow label="FHIR R4 資源轉換" status="ready" />
              <StatusRow label="HKCTT 診斷編碼" status="ready" />
              <StatusRow label="ICD-10 編碼映射" status="ready" />
              <StatusRow label="CM 證型編碼" status="ready" />
              <StatusRow label="eHR 病人同意書" status="partial" note="已有 PDPO 同意，需加 eHR 同意" />
              <StatusRow label="HL7 v2 訊息格式" status="pending" note="需待 eHR 註冊後取得規格" />
              <StatusRow label="eSC 數碼證書" status="pending" note="需向 eHR 辦事處申請" />
              <StatusRow label="VPN / ELSA 連接" status="pending" note="Mode A/B 需專線/VPN" />
            </div>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>下一步行動</h3>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8, color: '#374151' }}>
              <li>到 <a href="https://www.ehealth.gov.hk" target="_blank" rel="noopener noreferrer">ehealth.gov.hk</a> 註冊為醫療服務提供者</li>
              <li>安裝 eSC (eHealth Secure Connect) 數碼證書</li>
              <li>申請 Service Provider Training Scheme 取得 HL7 介面規格</li>
              <li>選擇連接模式（Mode A: VPN / Mode B: ELSA / Mode C: 網頁）</li>
              <li>在 EMR 診症時使用標準診斷編碼（HKCTT + ICD-10）</li>
              <li>匯出 FHIR Bundle 測試數據格式</li>
            </ol>
          </div>
        </div>
      )}

      {/* ── Export Tab ── */}
      {tab === 'export' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>FHIR Bundle 匯出</h3>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
              將病人記錄轉換為 HL7 FHIR R4 格式，可用於 eHRSS 數據提交
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input className="input" placeholder="搜尋病人..." value={searchQ}
                onChange={e => setSearchQ(e.target.value)} style={{ flex: 1, minWidth: 150 }} />
            </div>

            <select className="input" value={selectedPatient}
              onChange={e => { setSelectedPatient(e.target.value); setExportResult(null); }}
              style={{ marginBottom: 12, width: '100%' }}>
              <option value="">-- 選擇病人 --</option>
              {filteredPatients.map(p => (
                <option key={p.id} value={p.id}>{p.name} {p.phone ? `(${p.phone})` : ''}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleExport} disabled={!selectedPatient}>
                生成 FHIR Bundle
              </button>
              {exportResult && (
                <>
                  <button className="btn" onClick={downloadFHIR}>下載 JSON</button>
                  <button className="btn" onClick={() => setShowFHIR(!showFHIR)}>
                    {showFHIR ? '隱藏' : '檢視'} FHIR
                  </button>
                </>
              )}
            </div>

            {exportResult && (
              <div style={{ marginTop: 12, padding: 12, background: '#f0fdf4', borderRadius: 8, fontSize: 12 }}>
                <div><strong>病人:</strong> {exportResult.patient.name}</div>
                <div><strong>診症記錄:</strong> {exportResult.consultCount} 次</div>
                <div><strong>FHIR 資源數:</strong> {exportResult.bundle.total}</div>
                <div><strong>Bundle Type:</strong> collection</div>
              </div>
            )}

            {showFHIR && exportResult && (
              <pre style={{
                marginTop: 12, padding: 12, background: '#1e293b', color: '#e2e8f0',
                borderRadius: 8, fontSize: 11, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap',
              }}>
                {exportResult.json}
              </pre>
            )}
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>匯出格式說明</h3>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>FHIR Resource</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>對應數據</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>編碼標準</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Patient', '病人基本資料', 'HKID, demographics'],
                  ['Encounter', '診症記錄', 'Visit type, date, provider'],
                  ['Condition', '中醫診斷 + 證型', 'HKCTT, ICD-10, GB/T 15657'],
                  ['MedicationRequest', '中藥處方', 'Herb names, dosages'],
                  ['Procedure', '治療方式', 'Acupuncture, Tui Na, etc.'],
                  ['AllergyIntolerance', '過敏記錄', 'Free text + HKCTT'],
                ].map(([res, data, code]) => (
                  <tr key={res} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#6366f1' }}>{res}</td>
                    <td style={{ padding: '6px 8px' }}>{data}</td>
                    <td style={{ padding: '6px 8px', color: '#6b7280' }}>{code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Codes Tab ── */}
      {tab === 'codes' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>HKCTT 中醫診斷編碼表</h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <input className="input" placeholder="搜尋病名/ICD-10..." value={diagSearch}
                onChange={e => { setDiagSearch(e.target.value); setDiagCat(''); }}
                style={{ flex: 1, minWidth: 150 }} />
              <select className="input" value={diagCat}
                onChange={e => { setDiagCat(e.target.value); setDiagSearch(''); }}
                style={{ width: 'auto' }}>
                <option value="">全部科別</option>
                {DIAGNOSIS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ maxHeight: 500, overflow: 'auto' }}>
              {diagResults.map(d => (
                <div key={d.code} style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</span>
                      <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 8 }}>{d.nameEn}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontSize: 11, padding: '2px 6px', background: '#ede9fe', color: '#6366f1', borderRadius: 4 }}>
                        {d.code}
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 6px', background: '#fef3c7', color: '#d97706', borderRadius: 4 }}>
                        ICD-10: {d.icd10}
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 6px', background: '#f3f4f6', color: '#6b7280', borderRadius: 4 }}>
                        {d.cat}
                      </span>
                    </div>
                  </div>
                  {d.zheng?.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {d.zheng.map(z => (
                        <span key={z.code} style={{
                          fontSize: 11, padding: '2px 8px', background: '#ecfdf5', color: '#059669',
                          borderRadius: 12, border: '1px solid #d1fae5',
                        }}>
                          {z.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {diagResults.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>無搜尋結果</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Guide Tab ── */}
      {tab === 'guide' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>eHRSS 接入指南</h3>
            <div style={{ fontSize: 13, lineHeight: 1.8, color: '#374151' }}>
              <h4 style={{ margin: '16px 0 8px', fontSize: 14 }}>連接模式</h4>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 16 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>模式</th>
                    <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>連接方式</th>
                    <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>功能</th>
                    <th style={{ padding: 8, textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>建議</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>Mode A</td>
                    <td style={{ padding: 8 }}>VPN / 專線 + 數碼證書</td>
                    <td style={{ padding: 8 }}>完整雙向整合，單一登入</td>
                    <td style={{ padding: 8 }}><span style={{ color: '#10b981' }}>推薦</span> — 最佳體驗</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>Mode B</td>
                    <td style={{ padding: 8 }}>固定 IP / ELSA</td>
                    <td style={{ padding: 8 }}>雙向整合，雙重認證</td>
                    <td style={{ padding: 8 }}>適合中型診所</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>Mode C</td>
                    <td style={{ padding: 8 }}>eSC 瀏覽器</td>
                    <td style={{ padding: 8 }}>只讀存取</td>
                    <td style={{ padding: 8 }}>最簡單，適合小型診所</td>
                  </tr>
                </tbody>
              </table>

              <h4 style={{ margin: '16px 0 8px', fontSize: 14 }}>數據標準</h4>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li><strong>HL7 v2</strong> — 現行 eHRSS 訊息格式</li>
                <li><strong>HL7 FHIR R4</strong> — 未來方向（本系統已支援）</li>
                <li><strong>HKCTT</strong> — 香港臨床術語表（含中醫術語）</li>
                <li><strong>ICD-10</strong> — 國際疾病分類第十版</li>
                <li><strong>GB/T 15657</strong> — 中醫病證分類與代碼</li>
                <li><strong>SNOMED CT</strong> — 系統化醫學命名法</li>
                <li><strong>LOINC</strong> — 化驗結果編碼</li>
              </ul>

              <h4 style={{ margin: '16px 0 8px', fontSize: 14 }}>2025 法規更新</h4>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
                《電子健康紀錄互通系統（修訂）條例》2025 年 12 月 1 日生效。
                衞生局可要求指定醫療服務提供者<strong>強制上傳</strong>指定健康數據至市民個人醫健通戶口。
                建議盡早完成 eHRSS 對接準備。
              </p>

              <h4 style={{ margin: '16px 0 8px', fontSize: 14 }}>聯絡方式</h4>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
                <li>eHealth 24 小時熱線: <strong>(852) 3467 6230</strong></li>
                <li>eHR 註冊: <a href="mailto:ehr@ehealth.gov.hk">ehr@ehealth.gov.hk</a></li>
                <li>技術查詢: <a href="mailto:enquiry@ehealth.gov.hk">enquiry@ehealth.gov.hk</a> / (852) 3428 2869</li>
                <li>EC Connect: <a href="mailto:ec-connect@ehealth.gov.hk">ec-connect@ehealth.gov.hk</a></li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──
function StatCard({ label, value, sub, color = '#111' }) {
  return (
    <div className="card" style={{ padding: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function StatusRow({ label, status, note }) {
  const colors = { ready: '#10b981', partial: '#f59e0b', pending: '#9ca3af' };
  const labels = { ready: '已就緒', partial: '部分完成', pending: '待處理' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: colors[status],
        display: 'inline-block', flexShrink: 0,
      }} />
      <span style={{ fontWeight: 500, minWidth: 140 }}>{label}</span>
      <span style={{ fontSize: 11, color: colors[status], fontWeight: 600 }}>{labels[status]}</span>
      {note && <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>— {note}</span>}
    </div>
  );
}
