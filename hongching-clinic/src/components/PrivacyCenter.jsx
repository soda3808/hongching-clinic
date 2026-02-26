import { useState, useMemo } from 'react';
import { uid } from '../data';
import { getClinicName, getClinicNameEn } from '../tenant';
import SignaturePad, { SignaturePreview } from './SignaturePad';

// PDPO Privacy Center — Consent Management, DSAR, Data Retention
export default function PrivacyCenter({ data, setData, showToast, user }) {
  const [tab, setTab] = useState('consent');
  const [dsarForm, setDsarForm] = useState({ patientName: '', patientPhone: '', requestType: 'access', notes: '' });
  const [showConsentSign, setShowConsentSign] = useState(false);
  const [consentPatient, setConsentPatient] = useState('');
  const [consentPatientPhone, setConsentPatientPhone] = useState('');
  const [consentTypes, setConsentTypes] = useState({ data_collection: true, treatment: true, marketing: false, whatsapp: false });
  const [patientConsentSig, setPatientConsentSig] = useState('');
  const [showSigPad, setShowSigPad] = useState(false);

  const patients = data.patients || [];
  const consents = data.consents || [];
  const dsarRequests = data.dsarRequests || [];

  // ── Consent Stats ──
  const consentStats = useMemo(() => {
    const types = ['data_collection', 'treatment', 'marketing', 'whatsapp'];
    const stats = {};
    types.forEach(t => {
      const relevant = consents.filter(c => c.consent_type === t);
      stats[t] = {
        granted: relevant.filter(c => c.granted && !c.withdrawn_at).length,
        total: patients.length,
      };
    });
    return stats;
  }, [consents, patients]);

  // ── DSAR Stats ──
  const dsarStats = useMemo(() => ({
    pending: dsarRequests.filter(r => r.status === 'pending').length,
    processing: dsarRequests.filter(r => r.status === 'processing').length,
    completed: dsarRequests.filter(r => r.status === 'completed').length,
    overdue: dsarRequests.filter(r => r.status !== 'completed' && r.due_date && r.due_date < new Date().toISOString().substring(0, 10)).length,
  }), [dsarRequests]);

  // ── Submit DSAR ──
  const handleDsarSubmit = () => {
    if (!dsarForm.patientName) return showToast('請填寫病人姓名');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 40); // PDPO: 40 days
    const request = {
      id: uid(),
      ...dsarForm,
      status: 'pending',
      due_date: dueDate.toISOString().substring(0, 10),
      handler_id: user?.userId,
      created_at: new Date().toISOString(),
    };
    setData(prev => ({ ...prev, dsarRequests: [...(prev.dsarRequests || []), request] }));
    setDsarForm({ patientName: '', patientPhone: '', requestType: 'access', notes: '' });
    showToast('已提交數據主體存取申請');
  };

  // ── Update DSAR Status ──
  const updateDsar = (id, status) => {
    setData(prev => ({
      ...prev,
      dsarRequests: (prev.dsarRequests || []).map(r =>
        r.id === id ? { ...r, status, completed_at: status === 'completed' ? new Date().toISOString() : r.completed_at } : r
      ),
    }));
    showToast(`申請狀態已更新為「${status === 'completed' ? '已完成' : status === 'processing' ? '處理中' : status}`);
  };

  // ── Export Patient Data (DSAR Access) ──
  const exportPatientData = (patientName) => {
    const patient = patients.find(p => p.name === patientName);
    if (!patient) return showToast('找不到此病人');
    const patientData = {
      personalInfo: { name: patient.name, phone: patient.phone, dob: patient.dob, address: patient.address },
      consultations: (data.consultations || []).filter(c => c.patientName === patientName),
      bookings: (data.bookings || []).filter(b => b.patientName === patientName),
      revenue: (data.revenue || []).filter(r => r.name === patientName),
      consents: consents.filter(c => c.patient_id === patient.id),
    };
    const blob = new Blob([JSON.stringify(patientData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patient_data_${patientName}_${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已匯出 ${patientName} 的個人數據`);
  };

  // ── Anonymize Patient (DSAR Deletion) ──
  const anonymizePatient = (patientName) => {
    if (!confirm(`確認匿名化 ${patientName} 的所有個人資料？此操作不可逆。`)) return;
    const anon = `匿名病人_${Date.now().toString(36)}`;
    setData(prev => {
      const updated = { ...prev };
      updated.patients = (prev.patients || []).map(p => p.name === patientName ? { ...p, name: anon, phone: '', dob: '', address: '', email: '', allergies: '', notes: '[已匿名化]' } : p);
      updated.consultations = (prev.consultations || []).map(c => c.patientName === patientName ? { ...c, patientName: anon } : c);
      updated.bookings = (prev.bookings || []).map(b => b.patientName === patientName ? { ...b, patientName: anon, patientPhone: '' } : b);
      updated.revenue = (prev.revenue || []).map(r => r.name === patientName ? { ...r, name: anon } : r);
      return updated;
    });
    showToast(`${patientName} 已匿名化`);
  };

  const CONSENT_LABELS = {
    data_collection: '個人資料收集',
    treatment: '治療同意',
    marketing: '推廣訊息',
    whatsapp: 'WhatsApp 通訊',
  };

  const clinicName = getClinicName();
  const clinicNameEn = getClinicNameEn();

  // ── Save Signed Consent ──
  const handleConsentSign = () => {
    if (!consentPatient) return showToast('請填寫病人姓名');
    if (!patientConsentSig) return showToast('請先簽名');
    const now = new Date().toISOString();
    const newConsents = Object.entries(consentTypes)
      .filter(([, v]) => v)
      .map(([type]) => ({
        id: uid(),
        patient_id: (patients.find(p => p.name === consentPatient) || {}).id || '',
        patientName: consentPatient,
        consent_type: type,
        granted: true,
        version: '1.0',
        granted_at: now,
        method: 'digital',
        signature: patientConsentSig,
      }));
    setData(prev => ({ ...prev, consents: [...(prev.consents || []), ...newConsents] }));
    // Print consent record
    printConsentDoc(consentPatient, consentTypes, patientConsentSig);
    setShowConsentSign(false);
    setConsentPatient('');
    setConsentPatientPhone('');
    setPatientConsentSig('');
    setConsentTypes({ data_collection: true, treatment: true, marketing: false, whatsapp: false });
    showToast(`已記錄 ${consentPatient} 的同意授權（${newConsents.length} 項）`);
  };

  const printConsentDoc = (name, types, sig) => {
    const w = window.open('', '_blank');
    if (!w) return;
    const items = Object.entries(types).filter(([, v]) => v).map(([k]) => CONSENT_LABELS[k] || k);
    w.document.write(`<!DOCTYPE html><html><head><title>個人資料收集聲明</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:40px 50px;max-width:650px;margin:0 auto;color:#333;line-height:1.8}
      h1{text-align:center;font-size:18px;color:#0e7490;margin-bottom:2px}
      .en{text-align:center;font-size:11px;color:#888;margin-bottom:16px}
      h2{text-align:center;font-size:16px;border-bottom:2px solid #0e7490;padding-bottom:8px;color:#0e7490}
      .item{margin:8px 0;padding-left:20px}.check{color:#16a34a;font-weight:700}
      .sig-area{margin-top:30px;text-align:center}
      .sig-line{border-top:1px solid #333;display:inline-block;width:250px;margin-top:8px;padding-top:6px;font-size:11px;color:#888}
      .footer{text-align:center;font-size:9px;color:#aaa;margin-top:30px;border-top:1px solid #eee;padding-top:8px}
    </style></head><body>
      <h1>${clinicName}</h1><div class="en">${clinicNameEn}</div>
      <h2>個人資料收集聲明及同意書</h2>
      <p>本人 <strong>${name}</strong> 已閱讀及明白${clinicName}的個人資料收集聲明，並同意以下用途：</p>
      ${items.map(i => `<div class="item"><span class="check">&#10003;</span> ${i}</div>`).join('')}
      <p style="margin-top:16px;font-size:12px;color:#666">根據香港《個人資料（私隱）條例》（第486章），閣下有權查閱及更正本中心所持有的個人資料。如欲行使此權利，請聯絡本中心。</p>
      <div class="sig-area">
        ${sig ? `<img src="${sig}" style="height:60px;object-fit:contain;display:block;margin:0 auto 4px" />` : ''}
        <div class="sig-line">病人簽名 Patient Signature</div>
        <div style="margin-top:8px;font-size:12px">日期：${new Date().toISOString().substring(0, 10)}</div>
      </div>
      <div class="footer">已電子簽署 Digitally Signed | ${clinicName}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">DSAR 待處理</div><div className="stat-value teal">{dsarStats.pending}</div></div>
        <div className="stat-card gold"><div className="stat-label">處理中</div><div className="stat-value gold">{dsarStats.processing}</div></div>
        <div className="stat-card green"><div className="stat-label">已完成</div><div className="stat-value green">{dsarStats.completed}</div></div>
        <div className="stat-card red"><div className="stat-label">逾期</div><div className="stat-value red">{dsarStats.overdue}</div></div>
      </div>

      {/* Tabs */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 6 }}>
        {[
          { id: 'consent', label: '同意管理' },
          { id: 'dsar', label: '數據存取申請 (DSAR)' },
          { id: 'retention', label: '數據保留政策' },
          { id: 'policy', label: '私隱政策' },
        ].map(t => (
          <button key={t.id} className={`preset-chip ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* ── Consent Management ── */}
      {tab === 'consent' && (
        <div className="card">
          <div className="card-header"><h3>同意管理 — 病人授權追蹤</h3></div>
          <div className="stats-grid" style={{ marginBottom: 12 }}>
            {Object.entries(consentStats).map(([type, s]) => (
              <div key={type} className="stat-card teal" style={{ textAlign: 'center' }}>
                <div className="stat-label">{CONSENT_LABELS[type]}</div>
                <div className="stat-value teal">{s.granted}/{s.total}</div>
                <div className="stat-sub">{s.total > 0 ? Math.round(s.granted / s.total * 100) : 0}% 已授權</div>
              </div>
            ))}
          </div>
          <div style={{ padding: 12, background: 'var(--gray-50)', borderRadius: 8, fontSize: 12, color: 'var(--gray-600)', marginBottom: 12 }}>
            <strong>PDPO 要求：</strong>收集個人資料前必須取得明確同意。新病人登記時系統會自動顯示同意書。
            病人可隨時撤回同意。撤回後相關功能（如 WhatsApp 推廣）將自動停用。
          </div>

          {/* Quick Consent Signing */}
          {!showConsentSign ? (
            <button className="btn btn-teal" onClick={() => setShowConsentSign(true)}>
              + 簽署新同意書
            </button>
          ) : (
            <div style={{ padding: 16, border: '1px solid var(--teal-200)', borderRadius: 8, background: 'var(--teal-50)' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>簽署個人資料收集同意書</h4>
              <div className="grid-2" style={{ marginBottom: 12 }}>
                <div>
                  <label>病人姓名 *</label>
                  <input value={consentPatient} onChange={e => {
                    setConsentPatient(e.target.value);
                    const p = patients.find(pt => pt.name === e.target.value);
                    if (p) setConsentPatientPhone(p.phone || '');
                  }} placeholder="姓名" list="consent-patients" />
                  <datalist id="consent-patients">
                    {patients.slice(0, 20).map(p => <option key={p.id} value={p.name} />)}
                  </datalist>
                </div>
                <div><label>電話</label><input value={consentPatientPhone} readOnly style={{ background: 'var(--gray-100)' }} /></div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>同意項目</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                  {Object.entries(CONSENT_LABELS).map(([key, label]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={consentTypes[key] || false} onChange={e => setConsentTypes(prev => ({ ...prev, [key]: e.target.checked }))} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>病人簽名</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  {patientConsentSig ? (
                    <>
                      <SignaturePreview src={patientConsentSig} label={consentPatient} height={50} />
                      <button className="btn btn-outline btn-sm" onClick={() => setShowSigPad(true)}>重新簽名</button>
                      <button className="btn btn-outline btn-sm" onClick={() => setPatientConsentSig('')}>清除</button>
                    </>
                  ) : (
                    <button className="btn btn-outline btn-sm" onClick={() => setShowSigPad(true)} style={{ padding: '8px 16px' }}>簽名 Sign</button>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-teal" onClick={handleConsentSign}>確認並列印同意書</button>
                <button className="btn btn-outline" onClick={() => { setShowConsentSign(false); setPatientConsentSig(''); }}>取消</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DSAR ── */}
      {tab === 'dsar' && (
        <>
          <div className="card">
            <div className="card-header"><h3>新增數據存取申請</h3></div>
            <div className="grid-4" style={{ marginBottom: 12 }}>
              <div><label>病人姓名 *</label><input value={dsarForm.patientName} onChange={e => setDsarForm(f => ({ ...f, patientName: e.target.value }))} placeholder="病人姓名" /></div>
              <div><label>電話</label><input value={dsarForm.patientPhone} onChange={e => setDsarForm(f => ({ ...f, patientPhone: e.target.value }))} placeholder="聯絡電話" /></div>
              <div><label>申請類型</label>
                <select value={dsarForm.requestType} onChange={e => setDsarForm(f => ({ ...f, requestType: e.target.value }))}>
                  <option value="access">查閱個人資料</option>
                  <option value="correction">更正個人資料</option>
                  <option value="deletion">刪除/匿名化</option>
                  <option value="portability">資料轉移</option>
                </select>
              </div>
              <div><label>備註</label><input value={dsarForm.notes} onChange={e => setDsarForm(f => ({ ...f, notes: e.target.value }))} placeholder="申請詳情" /></div>
            </div>
            <button className="btn btn-teal" onClick={handleDsarSubmit}>提交申請</button>
            <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 8 }}>PDPO 要求：40 天內回覆</span>
          </div>

          {dsarRequests.length > 0 && (
            <div className="card" style={{ padding: 0 }}>
              <div className="card-header"><h3>申請紀錄 ({dsarRequests.length})</h3></div>
              <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>日期</th><th>病人</th><th>類型</th><th>截止日</th><th>狀態</th><th>操作</th></tr></thead>
                  <tbody>
                    {dsarRequests.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).map(r => {
                      const overdue = r.status !== 'completed' && r.due_date && r.due_date < new Date().toISOString().substring(0, 10);
                      return (
                        <tr key={r.id}>
                          <td style={{ fontSize: 11 }}>{(r.created_at || '').substring(0, 10)}</td>
                          <td style={{ fontWeight: 600 }}>{r.patientName}</td>
                          <td><span className="tag tag-pending">{r.requestType === 'access' ? '查閱' : r.requestType === 'correction' ? '更正' : r.requestType === 'deletion' ? '刪除' : '轉移'}</span></td>
                          <td style={{ color: overdue ? '#dc2626' : 'inherit', fontWeight: overdue ? 700 : 400 }}>{r.due_date}{overdue && ' (逾期!)'}</td>
                          <td><span className={`tag ${r.status === 'completed' ? 'tag-paid' : r.status === 'processing' ? 'tag-fps' : 'tag-pending'}`}>{r.status === 'completed' ? '已完成' : r.status === 'processing' ? '處理中' : '待處理'}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {r.status === 'pending' && <button className="btn btn-teal btn-sm" onClick={() => updateDsar(r.id, 'processing')}>開始處理</button>}
                              {r.status === 'processing' && <button className="btn btn-green btn-sm" onClick={() => updateDsar(r.id, 'completed')}>完成</button>}
                              {r.requestType === 'access' && <button className="btn btn-outline btn-sm" onClick={() => exportPatientData(r.patientName)}>匯出數據</button>}
                              {r.requestType === 'deletion' && r.status !== 'completed' && <button className="btn btn-red btn-sm" onClick={() => anonymizePatient(r.patientName)}>匿名化</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Data Retention Policy ── */}
      {tab === 'retention' && (
        <div className="card">
          <div className="card-header"><h3>數據保留政策</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>數據類別</th><th>保留期限</th><th>依據</th><th>到期處理</th></tr></thead>
              <tbody>
                <tr><td style={{ fontWeight: 600 }}>診療紀錄</td><td>7 年</td><td>醫療法規</td><td>匿名化</td></tr>
                <tr><td style={{ fontWeight: 600 }}>帳單/收費紀錄</td><td>7 年</td><td>稅務條例</td><td>匿名化</td></tr>
                <tr><td style={{ fontWeight: 600 }}>病人個人資料</td><td>最後診療後 7 年</td><td>PDPO</td><td>刪除或匿名化</td></tr>
                <tr><td style={{ fontWeight: 600 }}>預約紀錄</td><td>2 年</td><td>業務需要</td><td>自動刪除</td></tr>
                <tr><td style={{ fontWeight: 600 }}>WhatsApp 對話</td><td>1 年</td><td>業務需要</td><td>自動刪除</td></tr>
                <tr><td style={{ fontWeight: 600 }}>審計日誌</td><td>3 年</td><td>合規要求</td><td>自動歸檔</td></tr>
                <tr><td style={{ fontWeight: 600 }}>員工薪資紀錄</td><td>7 年</td><td>稅務條例</td><td>匿名化</td></tr>
                <tr><td style={{ fontWeight: 600 }}>庫存變動紀錄</td><td>2 年</td><td>業務需要</td><td>自動刪除</td></tr>
              </tbody>
            </table>
          </div>
          <div style={{ padding: 12, fontSize: 12, color: 'var(--gray-500)' }}>
            系統每月自動執行數據清理。過期數據將按照上述政策自動匿名化或刪除。診療紀錄因法規要求不會完全刪除，只會匿名化處理。
          </div>
        </div>
      )}

      {/* Signature Pad */}
      {showSigPad && (
        <SignaturePad
          title="病人簽名 — PDPO 同意書"
          label={`${consentPatient || '病人'} — 請簽名確認同意`}
          onConfirm={(sig) => { setPatientConsentSig(sig); setShowSigPad(false); showToast('簽名已記錄'); }}
          onCancel={() => setShowSigPad(false)}
        />
      )}

      {/* ── Privacy Policy ── */}
      {tab === 'policy' && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 16 }}>私隱政策聲明</h3>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <h4 style={{ color: 'var(--teal-700)', marginTop: 16 }}>1. 資料收集</h4>
            <p>{clinicName}（「本中心」）根據香港《個人資料（私隱）條例》（第486章）收集和處理個人資料。本中心收集的資料包括：姓名、電話、出生日期、地址、病歷、過敏史等。</p>

            <h4 style={{ color: 'var(--teal-700)', marginTop: 16 }}>2. 資料用途</h4>
            <p>收集的個人資料僅用於：(a) 提供醫療服務；(b) 預約管理；(c) 帳單及收費；(d) 經同意的推廣通訊。</p>

            <h4 style={{ color: 'var(--teal-700)', marginTop: 16 }}>3. 第三方服務</h4>
            <p>本中心使用以下第三方服務處理數據：Supabase（數據存儲）、WhatsApp Business（通訊）、Google AI（輔助分析）。所有第三方均受適當的數據處理協議約束。</p>

            <h4 style={{ color: 'var(--teal-700)', marginTop: 16 }}>4. 數據主體權利</h4>
            <p>根據 PDPO，你有權：(a) 查閱本中心持有的個人資料；(b) 要求更正不準確的資料；(c) 要求刪除或匿名化個人資料；(d) 撤回同意。</p>

            <h4 style={{ color: 'var(--teal-700)', marginTop: 16 }}>5. 數據安全</h4>
            <p>本中心採用行業標準安全措施保護個人資料，包括：傳輸加密 (TLS)、靜態加密 (AES-256)、存取控制、審計日誌。</p>

            <h4 style={{ color: 'var(--teal-700)', marginTop: 16 }}>6. 數據保留</h4>
            <p>個人資料將按照本中心的數據保留政策保存。診療紀錄保留 7 年，預約紀錄保留 2 年。過期資料將自動匿名化或刪除。</p>

            <h4 style={{ color: 'var(--teal-700)', marginTop: 16 }}>7. 聯絡方式</h4>
            <p>如有任何關於私隱的查詢或投訴，請聯絡本中心的個人資料主任。</p>
          </div>
        </div>
      )}
    </>
  );
}
