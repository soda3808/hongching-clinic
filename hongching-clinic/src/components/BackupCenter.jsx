import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { bulkImport, saveAllLocal } from '../api';

const A = '#0e7490', BG = '#f0fdfa', BDR = '#cffafe', DANGER = '#dc2626';
const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 14, border: '1px solid #e5e7eb' };
const hdr = { fontSize: 15, fontWeight: 700, color: A, marginBottom: 10 };
const btn = (c = A) => ({ padding: '7px 16px', borderRadius: 6, border: 'none', background: c, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 });
const btnO = { ...btn('#fff'), border: `1px solid ${A}`, color: A, background: '#fff' };
const smBtn = (c = A) => ({ ...btn(c), padding: '4px 10px', fontSize: 12 });
const tag = (c) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c + '18', color: c });

function fmtSize(b) { return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB'; }
function fmtDate(d) { return d ? new Date(d).toLocaleString('zh-HK') : '-'; }
function now() { return new Date().toISOString(); }
function dl(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); }

export default function BackupCenter({ data, setData, showToast, user }) {
  const [tab, setTab] = useState('dashboard');
  const [restoreFile, setRestoreFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [restoreTypes, setRestoreTypes] = useState({});
  const [restoring, setRestoring] = useState(false);
  const [autoSettings, setAutoSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_backup_settings')) || { enabled: false, frequency: 'daily' }; } catch { return { enabled: false, frequency: 'daily' }; }
  });

  const history = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('hcmc_backup_history')) || []; } catch { return []; }
  }, [tab]);

  const DATA_TYPES = [
    { key: 'patients', label: '病人記錄' }, { key: 'bookings', label: '預約記錄' },
    { key: 'consultations', label: '診症記錄' }, { key: 'revenue', label: '收入記錄' },
    { key: 'expenses', label: '支出記錄' }, { key: 'inventory', label: '庫存項目' },
    { key: 'arap', label: '應收應付' }, { key: 'payslips', label: '薪資單' },
    { key: 'packages', label: '套餐' }, { key: 'enrollments', label: '登記' },
    { key: 'conversations', label: 'CRM對話' }, { key: 'queue', label: '候診' },
    { key: 'sickleaves', label: '病假' }, { key: 'leaves', label: '請假' },
    { key: 'products', label: '產品' }, { key: 'productSales', label: '產品銷售' },
    { key: 'inquiries', label: '查詢' }, { key: 'surveys', label: '問卷' },
    { key: 'communications', label: '通訊' }, { key: 'waitlist', label: '候補' },
  ];

  const dataSummary = useMemo(() => DATA_TYPES.map(t => {
    const arr = data[t.key] || [];
    const size = new Blob([JSON.stringify(arr)]).size;
    return { ...t, count: arr.length, size };
  }), [data]);

  const totalSize = useMemo(() => dataSummary.reduce((s, d) => s + d.size, 0), [dataSummary]);
  const totalRecords = useMemo(() => dataSummary.reduce((s, d) => s + d.count, 0), [dataSummary]);
  const lastBackup = history.length ? history[0].date : null;

  // ── Collect localStorage hcmc_* keys (standalone collections) ──
  const collectLocalStorage = () => {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('hcmc_')) result[k] = localStorage.getItem(k);
    }
    return result;
  };

  // ── Create Backup ──
  const createBackup = () => {
    const ts = new Date(); const stamp = ts.toISOString().replace(/[-:T]/g, '').substring(0, 15).replace(/^(\d{8})(\d{6})/, '$1_$2');
    const backup = { version: '2.0', clinic: getClinicName(), created: ts.toISOString(), createdBy: user?.name || user?.userId || '系統',
      data: {}, localStorage: collectLocalStorage() };
    DATA_TYPES.forEach(t => { backup.data[t.key] = data[t.key] || []; });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    dl(blob, `backup_${stamp}.json`);
    const entry = { id: Date.now().toString(36), date: now(), type: '手動', size: blob.size,
      count: totalRecords, user: user?.name || user?.userId || '系統' };
    const updated = [entry, ...history].slice(0, 50);
    localStorage.setItem('hcmc_backup_history', JSON.stringify(updated));
    showToast('備份已下載');
  };

  // ── Restore ──
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setRestoreFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.data) throw new Error('invalid');
        const p = {};
        DATA_TYPES.forEach(t => { const arr = parsed.data[t.key]; p[t.key] = arr ? arr.length : 0; });
        p._raw = parsed;
        setPreview(p);
        const sel = {}; DATA_TYPES.forEach(t => { if ((parsed.data[t.key] || []).length > 0) sel[t.key] = true; }); setRestoreTypes(sel);
      } catch { showToast('無效的備份文件'); setPreview(null); }
    };
    reader.readAsText(file);
  };

  const confirmRestore = async () => {
    if (!preview?._raw) return;
    if (!confirm('確認恢復所選數據？現有數據將被覆蓋。')) return;
    setRestoring(true);
    try {
      const raw = preview._raw;
      // Build new data object by merging selected types into current data
      const newData = { ...data };
      DATA_TYPES.forEach(t => {
        if (restoreTypes[t.key] && raw.data[t.key]) {
          newData[t.key] = raw.data[t.key];
        }
      });
      // Update React state + localStorage hc_data blob
      if (setData) {
        setData(newData);
        saveAllLocal(newData);
      }
      // Push restored data to Supabase
      try { await bulkImport(newData); } catch (e) { console.error('Supabase restore sync:', e); }
      // Restore standalone localStorage keys (hcmc_*) if present
      if (raw.localStorage) {
        Object.entries(raw.localStorage).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch {} });
      }
      showToast('數據已恢復成功');
    } catch (err) {
      console.error('Restore error:', err);
      showToast('恢復失敗：' + err.message, 'error');
    }
    setRestoring(false);
    setPreview(null); setRestoreFile(null);
  };

  // ── Auto-backup settings ──
  const saveAutoSettings = (s) => {
    setAutoSettings(s);
    localStorage.setItem('hcmc_backup_settings', JSON.stringify(s));
    showToast('自動備份設定已儲存');
  };

  // ── Delete history entry ──
  const deleteHistory = (id) => {
    const updated = history.filter(h => h.id !== id);
    localStorage.setItem('hcmc_backup_history', JSON.stringify(updated));
    showToast('備份紀錄已刪除');
    setTab('history');
  };

  // ── Export CSV ──
  const exportCSV = (key, label) => {
    const arr = data[key] || []; if (!arr.length) return showToast('沒有數據可匯出');
    const headers = Object.keys(arr[0]);
    const rows = [headers.join(','), ...arr.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))];
    dl(new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }), `${key}_${new Date().toISOString().substring(0, 10)}.csv`);
    showToast(`已匯出 ${label} CSV`);
  };

  // ── Clear data ──
  const clearData = (key, label) => {
    if (!confirm(`確認清除所有「${label}」？此操作不可逆！`)) return;
    if (!confirm(`再次確認：將刪除所有 ${label} 資料！`)) return;
    // Clear from hc_data blob
    if (setData) {
      const newData = { ...data, [key]: [] };
      setData(newData);
      saveAllLocal(newData);
    }
    showToast(`${label} 已清除`);
  };

  const tabs = [
    { id: 'dashboard', label: '備份總覽' }, { id: 'history', label: '備份歷史' },
    { id: 'restore', label: '恢復數據' }, { id: 'export', label: '匯出 CSV' },
    { id: 'settings', label: '自動備份' }, { id: 'danger', label: '清除數據' },
  ];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
        <div style={{ ...card, textAlign: 'center', background: BG, borderColor: BDR }}>
          <div style={{ fontSize: 11, color: '#666' }}>上次備份</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: A }}>{lastBackup ? fmtDate(lastBackup) : '從未備份'}</div>
        </div>
        <div style={{ ...card, textAlign: 'center', background: BG, borderColor: BDR }}>
          <div style={{ fontSize: 11, color: '#666' }}>備份次數</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: A }}>{history.length}</div>
        </div>
        <div style={{ ...card, textAlign: 'center', background: BG, borderColor: BDR }}>
          <div style={{ fontSize: 11, color: '#666' }}>數據總量</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: A }}>{fmtSize(totalSize)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${tab === t.id ? A : '#d1d5db'}`, background: tab === t.id ? A : '#fff', color: tab === t.id ? '#fff' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t.label}</button>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {tab === 'dashboard' && (<>
        <div style={card}>
          <div style={hdr}>手動備份</div>
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 10px' }}>建立完整 JSON 備份檔案，包含所有 {DATA_TYPES.length} 類數據及本地設定。</p>
          <button style={btn()} onClick={createBackup}>立即備份並下載</button>
        </div>
        <div style={card}>
          <div style={hdr}>數據摘要（{DATA_TYPES.length} 類 / {totalRecords} 筆）</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: `2px solid ${BDR}` }}><th style={{ textAlign: 'left', padding: 6 }}>數據類型</th><th style={{ textAlign: 'right', padding: 6 }}>記錄數</th><th style={{ textAlign: 'right', padding: 6 }}>估計大小</th></tr></thead>
            <tbody>{dataSummary.filter(d => d.count > 0).map(d => (
              <tr key={d.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: 6 }}>{d.label}</td>
                <td style={{ padding: 6, textAlign: 'right', fontWeight: 600 }}>{d.count}</td>
                <td style={{ padding: 6, textAlign: 'right', color: '#888' }}>{fmtSize(d.size)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr style={{ borderTop: `2px solid ${BDR}`, fontWeight: 700 }}><td style={{ padding: 6 }}>合計</td><td style={{ padding: 6, textAlign: 'right' }}>{totalRecords}</td><td style={{ padding: 6, textAlign: 'right' }}>{fmtSize(totalSize)}</td></tr></tfoot>
          </table>
          {dataSummary.filter(d => d.count === 0).length > 0 && (
            <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
              空集合：{dataSummary.filter(d => d.count === 0).map(d => d.label).join('、')}
            </div>
          )}
        </div>
      </>)}

      {/* ── History ── */}
      {tab === 'history' && (
        <div style={card}>
          <div style={hdr}>備份歷史</div>
          {!history.length ? <p style={{ color: '#999', fontSize: 13 }}>暫無備份紀錄</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: `2px solid ${BDR}` }}>{['備份日期', '備份類型', '數據大小', '記錄數量', '備份人', '操作'].map(h => <th key={h} style={{ padding: 6, textAlign: 'left' }}>{h}</th>)}</tr></thead>
                <tbody>{history.map(h => (
                  <tr key={h.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 6, fontSize: 12 }}>{fmtDate(h.date)}</td>
                    <td style={{ padding: 6 }}><span style={tag(h.type === '手動' ? A : '#16a34a')}>{h.type}</span></td>
                    <td style={{ padding: 6 }}>{fmtSize(h.size || 0)}</td>
                    <td style={{ padding: 6, fontWeight: 600 }}>{h.count || 0}</td>
                    <td style={{ padding: 6 }}>{h.user || '-'}</td>
                    <td style={{ padding: 6, display: 'flex', gap: 4 }}>
                      <button style={smBtn(DANGER)} onClick={() => deleteHistory(h.id)}>刪除</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Restore ── */}
      {tab === 'restore' && (
        <div style={card}>
          <div style={hdr}>恢復數據</div>
          <input type="file" accept=".json" onChange={handleFileSelect} style={{ marginBottom: 12 }} />
          {preview && (
            <div style={{ background: BG, border: `1px solid ${BDR}`, borderRadius: 8, padding: 14, marginTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>備份預覽 — {restoreFile?.name}</div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>版本：{preview._raw.version || '1.0'} | 建立時間：{fmtDate(preview._raw.created)} | 診所：{preview._raw.clinic || '-'}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>選擇要恢復的數據：</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 4 }}>
                {DATA_TYPES.filter(t => (preview[t.key] || 0) > 0).map(t => (
                  <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={restoreTypes[t.key] || false} onChange={e => setRestoreTypes(p => ({ ...p, [t.key]: e.target.checked }))} />
                    {t.label}：<strong>{preview[t.key]}</strong> 筆
                  </label>
                ))}
              </div>
              {preview._raw.localStorage && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                  備份包含 {Object.keys(preview._raw.localStorage).length} 項本地設定（將一併恢復）
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button style={btn()} onClick={confirmRestore} disabled={restoring}>{restoring ? '恢復中...' : '確認恢復'}</button>
                <button style={btnO} onClick={() => { setPreview(null); setRestoreFile(null); }}>取消</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Export CSV ── */}
      {tab === 'export' && (
        <div style={card}>
          <div style={hdr}>匯出 CSV</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
            {DATA_TYPES.filter(t => (data[t.key] || []).length > 0).map(t => (
              <button key={t.key} style={btnO} onClick={() => exportCSV(t.key, t.label)}>
                {t.label} ({(data[t.key] || []).length})
              </button>
            ))}
          </div>
          {DATA_TYPES.every(t => !(data[t.key] || []).length) && (
            <p style={{ color: '#999', fontSize: 13 }}>暫無數據可匯出</p>
          )}
        </div>
      )}

      {/* ── Auto Backup Settings ── */}
      {tab === 'settings' && (
        <div style={card}>
          <div style={hdr}>自動備份設定</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoSettings.enabled} onChange={e => saveAutoSettings({ ...autoSettings, enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: A }} />
            <span style={{ fontWeight: 600 }}>啟用自動備份</span>
          </label>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>備份頻率</label>
            <select value={autoSettings.frequency} onChange={e => saveAutoSettings({ ...autoSettings, frequency: e.target.value })} style={{ display: 'block', marginTop: 4, padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
              <option value="daily">每日</option><option value="weekly">每週</option><option value="monthly">每月</option>
            </select>
          </div>
          <div style={{ fontSize: 12, color: '#888', background: '#f9fafb', padding: 10, borderRadius: 6 }}>
            自動備份將在背景執行並儲存於本地。下次開啟系統時會自動檢查是否需要備份。
          </div>
        </div>
      )}

      {/* ── Danger Zone ── */}
      {tab === 'danger' && (
        <div style={{ ...card, border: `1px solid ${DANGER}33` }}>
          <div style={{ ...hdr, color: DANGER }}>危險操作區</div>
          <p style={{ fontSize: 13, color: DANGER, marginBottom: 12 }}>以下操作不可逆，請謹慎使用。</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
            {DATA_TYPES.filter(t => (data[t.key] || []).length > 0).map(t => (
              <button key={t.key} style={smBtn(DANGER)} onClick={() => clearData(t.key, t.label)}>
                清除{t.label} ({(data[t.key] || []).length})
              </button>
            ))}
          </div>
          {DATA_TYPES.every(t => !(data[t.key] || []).length) && (
            <p style={{ color: '#999', fontSize: 13 }}>暫無數據可清除</p>
          )}
        </div>
      )}
    </div>
  );
}
