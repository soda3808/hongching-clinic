import { useState, useMemo, useEffect } from 'react';
import { getClinicName } from '../tenant';
import { bdaySettingsOps, bdayLogOps } from '../api';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const SK = 'hcmc_bday_settings', LK = 'hcmc_bday_log';
const load = (k, fb) => { try { const d = JSON.parse(localStorage.getItem(k)); return d || fb; } catch { return fb; } };
const persist = (k, v) => {
  localStorage.setItem(k, JSON.stringify(v));
  if (k === SK) bdaySettingsOps.persist(v);
  if (k === LK) bdayLogOps.persistAll(v);
};
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = new Date();
const todayStr = fmt(today);
const mm = today.getMonth(), yyyy = today.getFullYear();
const nextMm = (mm + 1) % 12, nextYyyy = mm === 11 ? yyyy + 1 : yyyy;

const DEF_SETTINGS = { discount: 20, freeService: '', gift: '', msgTemplate: '【{clinic}】{name}你好！祝你生日快樂！🎂\n\n感謝你一直以來嘅支持，特別送上生日優惠：\n🎁 診金{discount}折優惠（本月有效）\n{extra}\n歡迎預約：📞 致電或WhatsApp\n祝身體健康，萬事如意！🙏' };

const S = {
  page: { padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 },
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 },
  tabs: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e2e8f0', overflowX: 'auto' },
  tab: { padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14, border: 'none', background: 'none', color: '#64748b', borderBottom: '2px solid transparent', marginBottom: -2, whiteSpace: 'nowrap' },
  tabOn: { color: ACCENT, borderBottomColor: ACCENT },
  btn: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  btnSm: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 },
  btnDanger: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 },
  btnGray: { background: '#94a3b8', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 12 },
  stat: { background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: 16, textAlign: 'center', flex: '1 1 140px' },
  statNum: { fontSize: 28, fontWeight: 700, color: ACCENT },
  statLabel: { fontSize: 13, color: '#64748b', marginTop: 4 },
  field: { marginBottom: 12 },
  label: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#334155' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, minHeight: 80, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', fontWeight: 600, color: '#475569', fontSize: 12 },
  td: { padding: '8px 10px', borderBottom: '1px solid #f1f5f9' },
  badge: { display: 'inline-block', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 },
};

function getBirthMonth(dob) {
  if (!dob) return -1;
  const parts = dob.split('-');
  return parseInt(parts[1], 10) - 1;
}
function getBirthDay(dob) {
  if (!dob) return -1;
  return parseInt(dob.split('-')[2], 10);
}
function isBirthdayToday(dob) {
  return getBirthMonth(dob) === mm && getBirthDay(dob) === today.getDate();
}
function daysUntilBirthday(dob) {
  if (!dob) return 999;
  const bm = getBirthMonth(dob), bd = getBirthDay(dob);
  const thisYear = new Date(yyyy, bm, bd);
  const nextYear = new Date(yyyy + 1, bm, bd);
  const diff1 = Math.ceil((thisYear - today) / 86400000);
  return diff1 >= 0 ? diff1 : Math.ceil((nextYear - today) / 86400000);
}

export default function BirthdayCampaign({ data, showToast, user }) {
  const clinicName = useMemo(() => getClinicName(), []);
  const [tab, setTab] = useState(0);
  const [settings, setSettings] = useState(() => load(SK, DEF_SETTINGS));
  const [log, setLog] = useState(() => { const d = load(LK, []); return Array.isArray(d) ? d : []; });

  useEffect(() => {
    bdaySettingsOps.load().then(d => { if (d) setSettings(prev => ({ ...prev, ...d })); });
    bdayLogOps.load().then(d => { if (d) setLog(d); });
  }, []);

  const patients = data.patients || [];

  const thisMonthBdays = useMemo(() => patients.filter(p => getBirthMonth(p.dob) === mm).sort((a, b) => getBirthDay(a.dob) - getBirthDay(b.dob)), [patients]);
  const nextMonthBdays = useMemo(() => patients.filter(p => getBirthMonth(p.dob) === nextMm).sort((a, b) => getBirthDay(a.dob) - getBirthDay(b.dob)), [patients]);
  const todayBdays = useMemo(() => patients.filter(p => isBirthdayToday(p.dob)), [patients]);
  const upcoming7 = useMemo(() => patients.filter(p => { const d = daysUntilBirthday(p.dob); return d >= 0 && d <= 7; }).sort((a, b) => daysUntilBirthday(a.dob) - daysUntilBirthday(b.dob)), [patients]);

  const sentThisMonth = useMemo(() => log.filter(l => l.date && l.date.startsWith(`${yyyy}-${String(mm + 1).padStart(2, '0')}`)).length, [log]);
  const redeemed = useMemo(() => log.filter(l => l.redeemed).length, [log]);
  const rate = log.length ? Math.round((redeemed / log.length) * 100) : 0;

  const saveSt = s => { setSettings(s); persist(SK, s); };
  const saveLog = l => { setLog(l); persist(LK, l); };

  function buildMsg(p) {
    let extra = '';
    if (settings.freeService) extra += `免費服務：${settings.freeService}\n`;
    if (settings.gift) extra += `贈品：${settings.gift}\n`;
    const discountVal = 10 - (settings.discount || 20) / 10;
    return (settings.msgTemplate || DEF_SETTINGS.msgTemplate)
      .replace('{clinic}', clinicName).replace('{name}', p.name || '')
      .replace('{discount}', String(discountVal)).replace('{extra}', extra.trim());
  }

  function sendWhatsApp(p) {
    const phone = (p.phone || '').replace(/\D/g, '');
    if (!phone) { showToast && showToast('此病人無電話號碼'); return; }
    const msg = encodeURIComponent(buildMsg(p));
    window.open(`https://wa.me/852${phone}?text=${msg}`, '_blank');
    const exists = log.find(l => l.patientId === (p.id || p.name) && l.date === todayStr);
    if (!exists) {
      const entry = { id: uid(), patientId: p.id || p.name, name: p.name, phone: p.phone, date: todayStr, sentBy: user?.name || '系統', redeemed: false };
      saveLog([entry, ...log]);
    }
    showToast && showToast('已開啟 WhatsApp');
  }

  function toggleRedeem(id) {
    const next = log.map(l => l.id === id ? { ...l, redeemed: !l.redeemed } : l);
    saveLog(next);
  }
  function deleteLog(id) {
    saveLog(log.filter(l => l.id !== id));
  }

  function printList() {
    const rows = thisMonthBdays.map(p => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${p.name}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${p.dob || '-'}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${p.phone || '-'}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${isBirthdayToday(p.dob) ? '今日' : `${getBirthDay(p.dob)}日`}</td></tr>`).join('');
    const html = `<html><head><title>${clinicName} - ${mm + 1}月生日名單</title><style>body{font-family:-apple-system,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 10px;border-bottom:2px solid #0e7490;font-size:13px}h2{color:#0e7490}</style></head><body><h2>${clinicName} - ${yyyy}年${mm + 1}月 生日病人名單</h2><p>列印日期：${todayStr}　共 ${thisMonthBdays.length} 位</p><table><tr><th>姓名</th><th>出生日期</th><th>電話</th><th>生日日期</th></tr>${rows}</table><script>window.print()<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  const TABS = ['本月生日', '提醒名單', '營銷設定', '發送記錄', '統計'];

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h2 style={S.title}>生日營銷管理</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.btn} onClick={printList}>列印本月名單</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={S.row}>
        <div style={S.stat}><div style={S.statNum}>{thisMonthBdays.length}</div><div style={S.statLabel}>本月生日</div></div>
        <div style={S.stat}><div style={S.statNum}>{todayBdays.length}</div><div style={S.statLabel}>今日生日</div></div>
        <div style={S.stat}><div style={S.statNum}>{sentThisMonth}</div><div style={S.statLabel}>已發送訊息</div></div>
        <div style={S.stat}><div style={S.statNum}>{rate}%</div><div style={S.statLabel}>兌換率</div></div>
        <div style={S.stat}><div style={S.statNum}>{nextMonthBdays.length}</div><div style={S.statLabel}>下月生日</div></div>
      </div>

      {/* Today's birthdays highlight */}
      {todayBdays.length > 0 && (
        <div style={{ ...S.card, border: '2px solid #f59e0b', background: '#fffbeb', marginBottom: 18 }}>
          <div style={{ fontWeight: 700, color: '#d97706', marginBottom: 8, fontSize: 15 }}>今日生日病人 ({todayBdays.length}位)</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {todayBdays.map(p => (
              <div key={p.id || p.name} style={{ background: '#fff', borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #fde68a' }}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: '#64748b', fontSize: 12 }}>{p.phone || ''}</span>
                <button style={S.btnSm} onClick={() => sendWhatsApp(p)}>WhatsApp 祝賀</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        {TABS.map((t, i) => (
          <button key={t} style={{ ...S.tab, ...(tab === i ? S.tabOn : {}) }} onClick={() => setTab(i)}>
            {t}{i === 1 && upcoming7.length > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700, marginLeft: 6 }}>{upcoming7.length}</span>}
          </button>
        ))}
      </div>

      {/* Tab 0: This month */}
      {tab === 0 && (
        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>{yyyy}年{mm + 1}月 生日病人 ({thisMonthBdays.length}位)</div>
          {thisMonthBdays.length === 0 ? <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>本月無生日病人</div> : (
            <table style={S.table}><thead><tr><th style={S.th}>姓名</th><th style={S.th}>出生日期</th><th style={S.th}>電話</th><th style={S.th}>生日</th><th style={S.th}>狀態</th><th style={S.th}>操作</th></tr></thead><tbody>
              {thisMonthBdays.map(p => {
                const sent = log.some(l => l.patientId === (p.id || p.name) && l.date && l.date.startsWith(`${yyyy}-${String(mm + 1).padStart(2, '0')}`));
                return (
                  <tr key={p.id || p.name} style={isBirthdayToday(p.dob) ? { background: '#fffbeb' } : {}}>
                    <td style={S.td}>{p.name}</td><td style={S.td}>{p.dob || '-'}</td><td style={S.td}>{p.phone || '-'}</td>
                    <td style={S.td}>{getBirthDay(p.dob)}日{isBirthdayToday(p.dob) && <span style={{ ...S.badge, background: '#fef3c7', color: '#d97706', marginLeft: 4 }}>今日</span>}</td>
                    <td style={S.td}>{sent ? <span style={{ ...S.badge, background: '#dcfce7', color: '#16a34a' }}>已發送</span> : <span style={{ ...S.badge, background: '#f1f5f9', color: '#64748b' }}>未發送</span>}</td>
                    <td style={S.td}><button style={S.btnSm} onClick={() => sendWhatsApp(p)}>WhatsApp</button></td>
                  </tr>
                );
              })}
            </tbody></table>
          )}
          {nextMonthBdays.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>{nextYyyy}年{nextMm + 1}月 生日病人 ({nextMonthBdays.length}位)</div>
              <table style={S.table}><thead><tr><th style={S.th}>姓名</th><th style={S.th}>出生日期</th><th style={S.th}>電話</th><th style={S.th}>生日</th></tr></thead><tbody>
                {nextMonthBdays.map(p => (
                  <tr key={p.id || p.name}><td style={S.td}>{p.name}</td><td style={S.td}>{p.dob || '-'}</td><td style={S.td}>{p.phone || '-'}</td><td style={S.td}>{getBirthDay(p.dob)}日</td></tr>
                ))}
              </tbody></table>
            </div>
          )}
        </div>
      )}

      {/* Tab 1: Upcoming 7 days reminders */}
      {tab === 1 && (
        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>未來7日生日提醒 ({upcoming7.length}位)</div>
          {upcoming7.length === 0 ? <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>未來7日無生日病人</div> : (
            <table style={S.table}><thead><tr><th style={S.th}>姓名</th><th style={S.th}>出生日期</th><th style={S.th}>電話</th><th style={S.th}>倒數</th><th style={S.th}>狀態</th><th style={S.th}>操作</th></tr></thead><tbody>
              {upcoming7.map(p => {
                const days = daysUntilBirthday(p.dob);
                const sent = log.some(l => l.patientId === (p.id || p.name) && l.date === todayStr);
                return (
                  <tr key={p.id || p.name} style={days === 0 ? { background: '#fffbeb' } : {}}>
                    <td style={S.td}>{p.name}</td><td style={S.td}>{p.dob || '-'}</td><td style={S.td}>{p.phone || '-'}</td>
                    <td style={S.td}><span style={{ ...S.badge, background: days === 0 ? '#fef3c7' : '#e0f2fe', color: days === 0 ? '#d97706' : '#0369a1' }}>{days === 0 ? '今日' : `${days}日後`}</span></td>
                    <td style={S.td}>{sent ? <span style={{ ...S.badge, background: '#dcfce7', color: '#16a34a' }}>已發送</span> : <span style={{ ...S.badge, background: '#fef2f2', color: '#ef4444' }}>待發送</span>}</td>
                    <td style={S.td}><button style={S.btnSm} onClick={() => sendWhatsApp(p)}>WhatsApp</button></td>
                  </tr>
                );
              })}
            </tbody></table>
          )}
        </div>
      )}

      {/* Tab 2: Campaign settings */}
      {tab === 2 && (
        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>生日營銷設定</div>
          <div style={S.field}><label style={S.label}>折扣 (%)</label><input style={S.input} type="number" min="0" max="100" value={settings.discount} onChange={e => saveSt({ ...settings, discount: +e.target.value })} /></div>
          <div style={S.field}><label style={S.label}>免費服務</label><input style={S.input} placeholder="如：針灸一次" value={settings.freeService} onChange={e => saveSt({ ...settings, freeService: e.target.value })} /></div>
          <div style={S.field}><label style={S.label}>贈品</label><input style={S.input} placeholder="如：養生茶包一盒" value={settings.gift} onChange={e => saveSt({ ...settings, gift: e.target.value })} /></div>
          <div style={S.field}><label style={S.label}>訊息模板</label><textarea style={S.textarea} rows={6} value={settings.msgTemplate} onChange={e => saveSt({ ...settings, msgTemplate: e.target.value })} /></div>
          <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>可用變數：{'{clinic}'} 診所名、{'{name}'} 病人姓名、{'{discount}'} 折數、{'{extra}'} 額外優惠</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btn} onClick={() => { saveSt(settings); showToast && showToast('設定已儲存'); }}>儲存設定</button>
            <button style={S.btnGray} onClick={() => { saveSt(DEF_SETTINGS); showToast && showToast('已重設為預設值'); }}>重設預設</button>
          </div>
          <div style={{ marginTop: 20, padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>訊息預覽</div>
            <pre style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: '#334155', margin: 0 }}>{buildMsg({ name: '陳大文', phone: '91234567' })}</pre>
          </div>
        </div>
      )}

      {/* Tab 3: Campaign history */}
      {tab === 3 && (
        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>發送記錄 ({log.length}筆)</div>
          {log.length === 0 ? <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>暫無發送記錄</div> : (
            <table style={S.table}><thead><tr><th style={S.th}>日期</th><th style={S.th}>病人</th><th style={S.th}>電話</th><th style={S.th}>發送人</th><th style={S.th}>兌換</th><th style={S.th}>操作</th></tr></thead><tbody>
              {log.map(l => (
                <tr key={l.id}>
                  <td style={S.td}>{l.date}</td><td style={S.td}>{l.name}</td><td style={S.td}>{l.phone || '-'}</td><td style={S.td}>{l.sentBy}</td>
                  <td style={S.td}><span style={{ ...S.badge, background: l.redeemed ? '#dcfce7' : '#f1f5f9', color: l.redeemed ? '#16a34a' : '#64748b', cursor: 'pointer' }} onClick={() => toggleRedeem(l.id)}>{l.redeemed ? '已兌換' : '未兌換'}</span></td>
                  <td style={S.td}><button style={S.btnDanger} onClick={() => { deleteLog(l.id); showToast && showToast('已刪除'); }}>刪除</button></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      )}

      {/* Tab 4: Stats */}
      {tab === 4 && (
        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 15 }}>生日營銷統計</div>
          <div style={S.row}>
            <div style={{ ...S.stat, background: '#f0fdfa' }}><div style={S.statNum}>{thisMonthBdays.length}</div><div style={S.statLabel}>本月生日人數</div></div>
            <div style={{ ...S.stat, background: '#eff6ff' }}><div style={{ ...S.statNum, color: '#2563eb' }}>{log.length}</div><div style={S.statLabel}>總發送次數</div></div>
            <div style={{ ...S.stat, background: '#f0fdf4' }}><div style={{ ...S.statNum, color: '#16a34a' }}>{redeemed}</div><div style={S.statLabel}>已兌換次數</div></div>
            <div style={{ ...S.stat, background: '#fefce8' }}><div style={{ ...S.statNum, color: '#ca8a04' }}>{rate}%</div><div style={S.statLabel}>兌換率</div></div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>每月分佈</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 120 }}>
              {Array.from({ length: 12 }, (_, i) => {
                const count = patients.filter(p => getBirthMonth(p.dob) === i).length;
                const max = Math.max(1, ...Array.from({ length: 12 }, (_, j) => patients.filter(p => getBirthMonth(p.dob) === j).length));
                const h = Math.max(4, (count / max) * 100);
                return (
                  <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ background: i === mm ? ACCENT : '#cbd5e1', height: h, borderRadius: '4px 4px 0 0', margin: '0 auto', minWidth: 18, transition: 'height .3s' }} />
                    <div style={{ fontSize: 11, color: i === mm ? ACCENT : '#64748b', marginTop: 4, fontWeight: i === mm ? 700 : 400 }}>{i + 1}月</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}