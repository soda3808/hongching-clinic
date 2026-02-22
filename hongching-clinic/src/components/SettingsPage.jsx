import { useState } from 'react';
import { saveAllLocal } from '../api';
import { exportJSON, importJSON } from '../utils/export';

const DEFAULT_CLINIC = {
  name: '康晴綜合醫療中心',
  nameEn: 'Hong Ching International Medical Centre',
  addr1: '馬頭涌道97號美誠大廈地下',
  addr2: '長沙灣道28號長康大廈地下',
  phone: '',
  whatsapp: '',
  email: '',
};

export default function SettingsPage({ data, setData, showToast }) {
  const [clinic, setClinic] = useState(() => {
    try { return { ...DEFAULT_CLINIC, ...JSON.parse(localStorage.getItem('hcmc_clinic') || '{}') }; }
    catch { return { ...DEFAULT_CLINIC }; }
  });
  const [gasUrl, setGasUrl] = useState(() => import.meta.env.VITE_GAS_URL || localStorage.getItem('hcmc_gas_url') || '');
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showReset, setShowReset] = useState(false);

  const saveClinic = () => {
    localStorage.setItem('hcmc_clinic', JSON.stringify(clinic));
    showToast('診所資料已儲存');
  };

  const saveGasUrl = () => {
    localStorage.setItem('hcmc_gas_url', gasUrl);
    showToast('API URL 已儲存（需重新載入）');
  };

  const changePw = () => {
    const current = localStorage.getItem('hcmc_password') || 'hcmc2026';
    if (oldPw !== current) { showToast('舊密碼錯誤'); return; }
    if (!newPw || newPw.length < 4) { showToast('新密碼至少4位'); return; }
    localStorage.setItem('hcmc_password', newPw);
    setOldPw(''); setNewPw('');
    showToast('密碼已更改');
  };

  const handleExport = () => {
    exportJSON(data, `hcmc_backup_${new Date().toISOString().substring(0,10)}.json`);
    showToast('數據已匯出');
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      try {
        const imported = await importJSON(e.target.files[0]);
        const merged = {
          revenue: imported.revenue || data.revenue || [],
          expenses: imported.expenses || data.expenses || [],
          arap: imported.arap || data.arap || [],
          patients: imported.patients || data.patients || [],
          bookings: imported.bookings || data.bookings || [],
          payslips: imported.payslips || data.payslips || [],
        };
        setData(merged);
        showToast('數據已匯入');
      } catch (err) {
        showToast('匯入失敗：' + err.message);
      }
    };
    input.click();
  };

  const handleClear = () => {
    localStorage.removeItem('hc_data');
    showToast('本地緩存已清除');
  };

  const handleReset = () => {
    localStorage.removeItem('hc_data');
    localStorage.removeItem('hcmc_clinic');
    localStorage.removeItem('hcmc_password');
    localStorage.removeItem('hcmc_gas_url');
    window.location.reload();
  };

  const counts = {
    rev: (data.revenue || []).length,
    exp: (data.expenses || []).length,
    pt: (data.patients || []).length,
    bk: (data.bookings || []).length,
  };

  return (
    <>
      {/* Clinic Info */}
      <div className="card">
        <div className="card-header"><h3>診所資料</h3></div>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div><label>中文名稱</label><input value={clinic.name} onChange={e => setClinic({...clinic, name: e.target.value})} /></div>
          <div><label>英文名稱</label><input value={clinic.nameEn} onChange={e => setClinic({...clinic, nameEn: e.target.value})} /></div>
        </div>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div><label>宋皇臺地址</label><input value={clinic.addr1} onChange={e => setClinic({...clinic, addr1: e.target.value})} /></div>
          <div><label>太子地址</label><input value={clinic.addr2} onChange={e => setClinic({...clinic, addr2: e.target.value})} /></div>
        </div>
        <div className="grid-3" style={{ marginBottom: 12 }}>
          <div><label>電話</label><input value={clinic.phone} onChange={e => setClinic({...clinic, phone: e.target.value})} placeholder="電話" /></div>
          <div><label>WhatsApp</label><input value={clinic.whatsapp} onChange={e => setClinic({...clinic, whatsapp: e.target.value})} placeholder="WhatsApp" /></div>
          <div><label>Email</label><input value={clinic.email} onChange={e => setClinic({...clinic, email: e.target.value})} placeholder="Email" /></div>
        </div>
        <button className="btn btn-teal" onClick={saveClinic}>儲存診所資料</button>
      </div>

      {/* System Settings */}
      <div className="card">
        <div className="card-header"><h3>系統設定</h3></div>
        <div style={{ marginBottom: 16 }}>
          <label>Google Sheets API URL</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={gasUrl} onChange={e => setGasUrl(e.target.value)} placeholder="https://script.google.com/macros/s/..." style={{ flex: 1 }} />
            <button className="btn btn-teal btn-sm" onClick={saveGasUrl}>儲存</button>
          </div>
          <small style={{ color: 'var(--gray-400)', fontSize: 11 }}>數據同步：{gasUrl ? '已設定 API' : '僅本地儲存'}</small>
        </div>
        <div>
          <label>修改登入密碼</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
            <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} placeholder="舊密碼" style={{ flex: 1 }} />
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="新密碼" style={{ flex: 1 }} />
            <button className="btn btn-gold btn-sm" onClick={changePw}>更改</button>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="card">
        <div className="card-header"><h3>數據管理</h3></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-teal" onClick={handleExport}>📥 匯出所有數據 (JSON)</button>
          <button className="btn btn-gold" onClick={handleImport}>📤 匯入數據 (JSON)</button>
          <button className="btn btn-outline" onClick={handleClear}>🗑️ 清除本地緩存</button>
          <button className="btn btn-red" onClick={() => setShowReset(true)}>⚠️ 重置所有數據</button>
        </div>
      </div>

      {/* About */}
      <div className="card">
        <div className="card-header"><h3>關於</h3></div>
        <p style={{ fontSize: 13, color: 'var(--gray-600)' }}>
          版本 v2.5 — 康晴診所管理系統<br/>
          數據統計：{counts.rev} 筆營業 / {counts.exp} 筆開支 / {counts.pt} 個病人 / {counts.bk} 筆預約
        </p>
      </div>

      {/* Reset Confirmation Modal */}
      {showReset && (
        <div className="modal-overlay" onClick={() => setShowReset(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h3 style={{ color: 'var(--red-600)' }}>⚠️ 確認重置所有數據？</h3>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '16px 0' }}>此操作將清除所有本地數據並重新載入，無法恢復。</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-red" onClick={handleReset}>確認重置</button>
              <button className="btn btn-outline" onClick={() => setShowReset(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
