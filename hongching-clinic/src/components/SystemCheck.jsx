import { useState } from 'react';

const C = '#0e7490';
const LS_KEY = 'hcmc_system_check';

function bytes(str) { return new Blob([str]).size; }
function fmtBytes(b) { return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB'; }

export default function SystemCheck({ data, showToast, user }) {
  const [results, setResults] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; }
  });
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(LS_KEY)); return s?.timestamp || null; } catch { return null; }
  });

  const runChecks = () => {
    setRunning(true);
    setTimeout(() => {
      const checks = [];

      // 1. 數據完整性
      const tables = ['patients', 'bookings', 'consultations', 'revenue', 'expenses'];
      const missing = tables.filter(t => !data[t] || !Array.isArray(data[t]));
      const empty = tables.filter(t => Array.isArray(data[t]) && data[t].length === 0);
      checks.push({
        name: '數據完整性', status: missing.length > 0 ? 'error' : empty.length > 0 ? 'warn' : 'ok',
        detail: missing.length > 0 ? `缺少: ${missing.join(', ')}` : empty.length > 0 ? `空表: ${empty.join(', ')}` : `${tables.length} 個資料表正常`,
        suggestion: missing.length > 0 ? '請重新同步或匯入數據備份' : empty.length > 0 ? '部分資料表無數據，可能需要初始化' : null,
      });

      // 2. 本地儲存
      let totalBytes = 0; const keyDetails = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || '';
        const sz = bytes(k) + bytes(v);
        totalBytes += sz;
        if (k.startsWith('hcmc_')) keyDetails.push({ key: k, size: sz });
      }
      keyDetails.sort((a, b) => b.size - a.size);
      const limit = 5 * 1024 * 1024;
      const pct = ((totalBytes / limit) * 100).toFixed(1);
      checks.push({
        name: '本地儲存', status: totalBytes > limit * 0.9 ? 'error' : totalBytes > limit * 0.7 ? 'warn' : 'ok',
        detail: `${fmtBytes(totalBytes)} / 5 MB (${pct}%)，共 ${keyDetails.length} 個 hcmc_* 鍵`,
        suggestion: totalBytes > limit * 0.7 ? '儲存空間即將滿，建議清理舊數據或匯出備份' : null,
        keys: keyDetails,
      });

      // 3. 瀏覽器兼容性
      const apis = [
        { name: 'localStorage', ok: typeof localStorage !== 'undefined' },
        { name: 'fetch', ok: typeof fetch === 'function' },
        { name: 'Intl', ok: typeof Intl !== 'undefined' },
        { name: 'crypto', ok: typeof crypto !== 'undefined' && !!crypto.subtle },
      ];
      const failApis = apis.filter(a => !a.ok);
      checks.push({
        name: '瀏覽器兼容性', status: failApis.length > 0 ? 'error' : 'ok',
        detail: failApis.length > 0 ? `不支援: ${failApis.map(a => a.name).join(', ')}` : '所有必要 API 均支援',
        suggestion: failApis.length > 0 ? '請使用最新版 Chrome / Safari / Edge' : null,
      });

      // 4. 最後同步
      const syncTs = localStorage.getItem('hcmc_last_sync') || localStorage.getItem('hcmc_last_backup');
      checks.push({
        name: '最後同步', status: !syncTs ? 'warn' : (Date.now() - new Date(syncTs).getTime() > 7 * 86400000) ? 'warn' : 'ok',
        detail: syncTs ? `上次同步: ${new Date(syncTs).toLocaleString('zh-HK')}` : '無同步紀錄',
        suggestion: !syncTs ? '建議定期備份數據' : (Date.now() - new Date(syncTs).getTime() > 7 * 86400000) ? '超過 7 天未同步，建議備份' : null,
      });

      // 5. 用戶數量
      let users = [];
      try { users = JSON.parse(localStorage.getItem('hc_users') || '[]'); } catch {}
      const activeUsers = users.filter(u => u.active !== false);
      checks.push({
        name: '用戶數量', status: 'ok',
        detail: `${activeUsers.length} 個活躍用戶` + (users.length > activeUsers.length ? `（${users.length - activeUsers.length} 個已停用）` : ''),
        suggestion: null,
      });

      // 6. 藥材庫存
      const inv = data.inventory || [];
      const lowStock = inv.filter(i => i.active !== false && Number(i.stock) <= Number(i.minStock || 10));
      checks.push({
        name: '藥材庫存', status: lowStock.length > 5 ? 'error' : lowStock.length > 0 ? 'warn' : 'ok',
        detail: lowStock.length > 0 ? `${lowStock.length} 項低於安全庫存：${lowStock.slice(0, 5).map(i => i.name).join('、')}${lowStock.length > 5 ? '…' : ''}` : `${inv.length} 項庫存正常`,
        suggestion: lowStock.length > 0 ? '請儘快補貨以避免缺藥' : null,
      });

      // 7. 過期預約
      const today = new Date().toISOString().substring(0, 10);
      const bk = data.bookings || [];
      const expired = bk.filter(b => b.date < today && b.status !== 'completed' && b.status !== 'cancelled' && b.status !== 'no_show');
      checks.push({
        name: '過期預約', status: expired.length > 10 ? 'error' : expired.length > 0 ? 'warn' : 'ok',
        detail: expired.length > 0 ? `${expired.length} 筆過期未完成預約` : '無過期預約',
        suggestion: expired.length > 0 ? '建議標記為「已完成」或「爽約」' : null,
        fixable: expired.length > 0 ? 'expiredBookings' : null,
      });

      // 8. 數據異常
      const anomalies = [];
      (data.revenue || []).forEach(r => { if (!r.amount && r.amount !== 0) anomalies.push(`營業紀錄 ${r.id || '?'} 缺少金額`); });
      (data.patients || []).forEach(p => { if (!p.name) anomalies.push(`病人 ${p.id || '?'} 缺少姓名`); });
      (data.expenses || []).forEach(e => { if (!e.amount && e.amount !== 0) anomalies.push(`開支 ${e.id || '?'} 缺少金額`); });
      (data.consultations || []).forEach(c => { if (!c.patientId && !c.patientName) anomalies.push(`診症 ${c.id || '?'} 缺少病人`); });
      checks.push({
        name: '數據異常', status: anomalies.length > 5 ? 'error' : anomalies.length > 0 ? 'warn' : 'ok',
        detail: anomalies.length > 0 ? `${anomalies.length} 項異常：${anomalies.slice(0, 3).join('；')}${anomalies.length > 3 ? '…' : ''}` : '無數據異常',
        suggestion: anomalies.length > 0 ? '請檢查並補充缺失欄位' : null,
      });

      // Storage breakdown for chart
      const categories = {};
      keyDetails.forEach(({ key, size }) => {
        const cat = key.replace('hcmc_', '').replace(/_.*/, '').substring(0, 12);
        categories[cat] = (categories[cat] || 0) + size;
      });
      const storageChart = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 8);

      const overall = checks.some(c => c.status === 'error') ? 'error' : checks.some(c => c.status === 'warn') ? 'warn' : 'ok';
      const ts = new Date().toISOString();
      const payload = { checks, overall, storageChart, totalBytes, timestamp: ts };
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
      setResults(payload);
      setLastRun(ts);
      setRunning(false);
    }, 600);
  };

  const handleFix = (type) => {
    if (type === 'expiredBookings') {
      showToast('請到預約系統逐筆處理過期預約');
    }
  };

  const cleanOrphanKeys = () => {
    const known = ['hcmc_system_check', 'hcmc_clinic', 'hcmc_checklist', 'hcmc_briefing', 'hcmc_rev_goal',
      'hcmc_backups', 'hcmc_budgets', 'hcmc_recurring_expenses', 'hcmc_suppliers', 'hcmc_stock_movements',
      'hcmc_custom_formulas', 'hcmc_fav_herbs', 'hcmc_discount_rules', 'hcmc_discount_history',
      'hcmc_reminder_settings', 'hcmc_reminders_sent', 'hcmc_settlement_locks', 'hcmc_daily_closings',
      'hcmc_doc_targets', 'hcmc_doc_schedule', 'hcmc_telegram_config', 'hcmc_rev_templates',
      'hcmc_ai_chat', 'hcmc_dispensing_log', 'hcmc_registration_queue', 'hcmc_vital_signs',
      'hcmc_calendar_events', 'hcmc_month_close', 'hcmc_services', 'hcmc_doctor_schedule',
      'hcmc_last_backup', 'hcmc_theme', 'hcmc_gas_url', 'hcmc_audit_log', 'hcmc_loyalty_points',
      'hcmc_queue_notified', 'hcmc_leave_balance', 'hcmc_consultation_status', 'hcmc_purchase_orders',
      'hcmc_doctor_advice', 'hcmc_company_advice', 'hcmc_install_dismissed', 'hcmc_tenant_slug',
      'hcmc_tenant', 'hcmc_sb_token', 'hcmc_last_sync', 'hcmc_employees', 'hcmc_doctor_targets',
      'hcmc_tenant_config'];
    let removed = 0;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('hcmc_') && !known.includes(k) && !k.startsWith('hcmc_backup_') && !k.startsWith('hcmc_sig_')) {
        localStorage.removeItem(k);
        removed++;
      }
    }
    showToast(removed > 0 ? `已清除 ${removed} 個無用鍵` : '沒有需要清理的項目');
    if (results) runChecks();
  };

  const exportDiagnostics = () => {
    if (!results) { showToast('請先執行檢查', 'error'); return; }
    const lines = [`康晴診所 - 系統診斷報告`, `時間: ${new Date(results.timestamp).toLocaleString('zh-HK')}`,
      `整體狀態: ${results.overall === 'ok' ? '健康' : results.overall === 'warn' ? '警告' : '異常'}`, '',
      ...results.checks.map(c => `[${c.status === 'ok' ? '正常' : c.status === 'warn' ? '警告' : '異常'}] ${c.name}: ${c.detail}${c.suggestion ? `\n  建議: ${c.suggestion}` : ''}`),
      '', `儲存用量: ${fmtBytes(results.totalBytes)} / 5 MB`,
      `用戶: ${user?.name || '未知'} (${user?.role || '?'})`,
      `瀏覽器: ${navigator.userAgent.substring(0, 80)}`];
    navigator.clipboard.writeText(lines.join('\n')).then(() => showToast('診斷報告已複製到剪貼板'));
  };

  const statusIcon = { ok: '✅', warn: '⚠️', error: '❌' };
  const statusLabel = { ok: '健康', warn: '警告', error: '異常' };
  const statusColor = { ok: '#16a34a', warn: '#d97706', error: '#dc2626' };
  const maxBar = results?.storageChart?.length ? Math.max(...results.storageChart.map(s => s[1])) : 1;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: C }}>系統健康檢查</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {results && <button onClick={exportDiagnostics} style={btnStyle('outline')}>匯出報告</button>}
          <button onClick={runChecks} disabled={running} style={btnStyle('primary')}>
            {running ? '檢查中…' : results ? '重新檢查' : '開始檢查'}
          </button>
        </div>
      </div>

      {/* Overall Status */}
      {results && (
        <div style={{ textAlign: 'center', padding: 24, background: statusColor[results.overall] + '10', borderRadius: 12, marginBottom: 20, border: `2px solid ${statusColor[results.overall]}30` }}>
          <div style={{ fontSize: 48 }}>{statusIcon[results.overall]}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: statusColor[results.overall], marginTop: 4 }}>系統狀態：{statusLabel[results.overall]}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            {results.checks.filter(c => c.status === 'ok').length} 正常 · {results.checks.filter(c => c.status === 'warn').length} 警告 · {results.checks.filter(c => c.status === 'error').length} 異常
          </div>
        </div>
      )}

      {/* Last check time */}
      {lastRun && (
        <div style={{ fontSize: 12, color: '#888', marginBottom: 12, textAlign: 'right' }}>
          上次檢查: {new Date(lastRun).toLocaleString('zh-HK')}
        </div>
      )}

      {/* Check Results */}
      {results && results.checks.map((c, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 10, borderLeft: `4px solid ${statusColor[c.status]}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600 }}>{statusIcon[c.status]} {c.name}</div>
            <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: statusColor[c.status] + '18', color: statusColor[c.status], fontWeight: 600 }}>
              {statusLabel[c.status]}
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#555', marginTop: 6 }}>{c.detail}</div>
          {c.suggestion && <div style={{ fontSize: 12, color: C, marginTop: 4 }}>💡 {c.suggestion}</div>}
          {c.fixable && <button onClick={() => handleFix(c.fixable)} style={{ ...btnStyle('small'), marginTop: 6 }}>修復</button>}
          {c.keys && c.keys.length > 0 && (
            <details style={{ marginTop: 8, fontSize: 12 }}>
              <summary style={{ cursor: 'pointer', color: C }}>查看 {c.keys.length} 個鍵明細</summary>
              <div style={{ marginTop: 4, maxHeight: 150, overflow: 'auto' }}>
                {c.keys.map((k, j) => (
                  <div key={j} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ color: '#333', fontFamily: 'monospace', fontSize: 11 }}>{k.key}</span>
                    <span style={{ color: '#888', whiteSpace: 'nowrap' }}>{fmtBytes(k.size)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ))}

      {/* Storage Chart */}
      {results && results.storageChart?.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, color: C }}>儲存空間分析</div>
          {results.storageChart.map(([cat, sz], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 90, fontSize: 12, textAlign: 'right', color: '#555', fontFamily: 'monospace' }}>{cat}</span>
              <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 4, height: 18, overflow: 'hidden' }}>
                <div style={{ width: `${(sz / maxBar) * 100}%`, height: '100%', background: C, borderRadius: 4, minWidth: 2, transition: 'width .3s' }} />
              </div>
              <span style={{ fontSize: 11, color: '#888', width: 70, textAlign: 'right' }}>{fmtBytes(sz)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 12, color: '#888' }}>總用量: {fmtBytes(results.totalBytes)}</span>
            <button onClick={cleanOrphanKeys} style={btnStyle('small')}>清理無用鍵</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!results && !running && (
        <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>
          <div style={{ fontSize: 48 }}>🔍</div>
          <div style={{ marginTop: 12 }}>點擊「開始檢查」執行系統診斷</div>
        </div>
      )}

      {/* Running */}
      {running && (
        <div style={{ textAlign: 'center', padding: 60, color: C }}>
          <div style={{ fontSize: 36, animation: 'spin 1s linear infinite' }}>⚙️</div>
          <div style={{ marginTop: 12 }}>正在檢查系統…</div>
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
    </div>
  );
}

function btnStyle(type) {
  const base = { border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'opacity .2s' };
  if (type === 'primary') return { ...base, background: C, color: '#fff', padding: '8px 18px' };
  if (type === 'outline') return { ...base, background: '#fff', color: C, padding: '8px 14px', border: `1px solid ${C}` };
  return { ...base, background: C + '15', color: C, padding: '4px 12px', fontSize: 12 };
}
