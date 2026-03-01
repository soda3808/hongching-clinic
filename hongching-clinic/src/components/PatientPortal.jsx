import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_portal_settings';

const FEATURES = [
  { key: 'booking', label: '網上預約', desc: '病人可透過連結自助預約' },
  { key: 'queue', label: '查看候診狀態', desc: '即時顯示候診號碼及等候人數' },
  { key: 'summary', label: '查看病歷摘要', desc: '病人可查閱過往診斷摘要' },
  { key: 'prescription', label: '查看處方記錄', desc: '病人可查閱過往處方及用藥' },
  { key: 'payment', label: '網上付款', desc: '支援線上繳費（模擬）' },
  { key: 'survey', label: '滿意度調查', desc: '診後自動發送滿意度問卷' },
  { key: 'education', label: '健康資訊', desc: '推送中醫養生文章及建議' },
];

const ACCESS_LEVELS = [
  { key: 'basic', label: '基本資料', desc: '姓名、電話、出生日期' },
  { key: 'visits', label: '就診記錄', desc: '過往就診日期及醫師' },
  { key: 'diagnosis', label: '診斷資訊', desc: '中醫辨證及西醫診斷' },
  { key: 'herbs', label: '處方用藥', desc: '中藥處方及劑量' },
  { key: 'billing', label: '收費記錄', desc: '帳單及付款紀錄' },
];

const loadSettings = () => {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
};

export default function PatientPortal({ showToast, user }) {
  const [tab, setTab] = useState('features');
  const [settings, setSettings] = useState(() => {
    const s = loadSettings();
    return {
      features: s.features || { booking: true, queue: true, survey: true },
      bookingRules: s.bookingRules || { maxDays: 14, slotMinutes: 30, maxPerDay: 3 },
      access: s.access || { basic: true, visits: true },
      branding: s.branding || { welcome: '', info: '', logoUrl: '' },
    };
  });

  const save = (next) => {
    setSettings(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    showToast('設定已儲存');
  };

  const toggleFeature = (key) => {
    const next = { ...settings, features: { ...settings.features, [key]: !settings.features[key] } };
    save(next);
  };

  const toggleAccess = (key) => {
    const next = { ...settings, access: { ...settings.access, [key]: !settings.access[key] } };
    save(next);
  };

  const baseUrl = window.location.origin;
  const qrLinks = useMemo(() => ([
    { label: '預約連結', url: `${baseUrl}/booking` },
    { label: '到店登記', url: `${baseUrl}/checkin` },
    { label: '滿意度調查', url: `${baseUrl}/survey` },
  ]), [baseUrl]);

  // Simulated usage stats
  const stats = useMemo(() => ({
    pageViews: Math.floor(Math.random() * 500) + 200,
    bookingConversion: Math.floor(Math.random() * 40) + 30,
    surveyCompletion: Math.floor(Math.random() * 30) + 40,
    avgSessionSec: Math.floor(Math.random() * 120) + 60,
  }), []);

  const printQRCards = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>QR Code 卡片</title>
      <style>body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:800px;margin:0 auto}
      h1{font-size:18px;text-align:center;margin-bottom:20px}
      .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
      .card{border:2px solid ${ACCENT};border-radius:12px;padding:20px;text-align:center}
      .qr{width:120px;height:120px;border:2px dashed #ccc;margin:12px auto;display:flex;align-items:center;justify-content:center;font-size:10px;color:#999;word-break:break-all;padding:6px}
      .label{font-size:14px;font-weight:700;color:${ACCENT};margin-bottom:4px}
      .clinic{font-size:11px;color:#888}
      @media print{body{margin:0;padding:10mm}.cards{page-break-inside:avoid}}
      </style></head><body>
      <h1>${escapeHtml(getClinicName())} - 病人自助服務 QR Code</h1>
      <div class="cards">${qrLinks.map(q => `<div class="card">
        <div class="label">${escapeHtml(q.label)}</div>
        <div class="qr">[QR]<br/>${escapeHtml(q.url)}</div>
        <div class="clinic">${escapeHtml(getClinicName())}</div>
      </div>`).join('')}</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const tabs = [
    { id: 'features', label: '功能設定' },
    { id: 'access', label: '存取控制' },
    { id: 'branding', label: '品牌設定' },
    { id: 'qr', label: 'QR Code' },
    { id: 'stats', label: '使用統計' },
  ];

  return (
    <>
      {/* Stats overview */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">已啟用功能</div><div className="stat-value teal">{Object.values(settings.features).filter(Boolean).length}/{FEATURES.length}</div></div>
        <div className="stat-card green"><div className="stat-label">頁面瀏覽</div><div className="stat-value green">{stats.pageViews}</div></div>
        <div className="stat-card gold"><div className="stat-label">預約轉換率</div><div className="stat-value gold">{stats.bookingConversion}%</div></div>
        <div className="stat-card red"><div className="stat-label">問卷完成率</div><div className="stat-value red">{stats.surveyCompletion}%</div></div>
      </div>

      {/* Tab bar */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          {tabs.map(t => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Features tab */}
      {tab === 'features' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header"><h3>病人自助服務功能</h3></div>
          <div style={{ padding: 16 }}>
            {FEATURES.map(f => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{f.desc}</div>
                </div>
                <div style={{ cursor: 'pointer', width: 44, height: 24, borderRadius: 12, background: settings.features[f.key] ? ACCENT : '#d1d5db', position: 'relative', transition: 'background 0.2s' }}
                  onClick={() => toggleFeature(f.key)}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 2, left: settings.features[f.key] ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
              </div>
            ))}
            {/* Booking rules (shown when booking is on) */}
            {settings.features.booking && (
              <div style={{ marginTop: 16, padding: 16, background: '#f0fdfa', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: ACCENT, marginBottom: 12 }}>預約規則設定</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12 }}>可預約天數</label>
                    <input type="number" value={settings.bookingRules.maxDays} min={1} max={90}
                      onChange={e => save({ ...settings, bookingRules: { ...settings.bookingRules, maxDays: +e.target.value } })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12 }}>時段間隔(分鐘)</label>
                    <input type="number" value={settings.bookingRules.slotMinutes} min={10} max={120} step={5}
                      onChange={e => save({ ...settings, bookingRules: { ...settings.bookingRules, slotMinutes: +e.target.value } })} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12 }}>每日上限</label>
                    <input type="number" value={settings.bookingRules.maxPerDay} min={1} max={50}
                      onChange={e => save({ ...settings, bookingRules: { ...settings.bookingRules, maxPerDay: +e.target.value } })} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Access control tab */}
      {tab === 'access' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header"><h3>病人可查閱資料範圍</h3></div>
          <div style={{ padding: 16 }}>
            {ACCESS_LEVELS.map(a => (
              <div key={a.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.label}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{a.desc}</div>
                </div>
                <div style={{ cursor: 'pointer', width: 44, height: 24, borderRadius: 12, background: settings.access[a.key] ? ACCENT : '#d1d5db', position: 'relative', transition: 'background 0.2s' }}
                  onClick={() => toggleAccess(a.key)}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 2, left: settings.access[a.key] ? 22 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 16, padding: 12, background: '#fef3c7', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
              注意：啟用「診斷資訊」或「處方用藥」需確保符合個人資料私隱條例要求。
            </div>
          </div>
        </div>
      )}

      {/* Branding tab */}
      {tab === 'branding' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header"><h3>病人入口品牌設定</h3></div>
          <div style={{ padding: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>歡迎訊息</label>
              <textarea rows={3} value={settings.branding.welcome} placeholder={`歡迎使用${getClinicName()}自助服務`}
                onChange={e => setSettings(s => ({ ...s, branding: { ...s.branding, welcome: e.target.value } }))} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>診所簡介</label>
              <textarea rows={3} value={settings.branding.info} placeholder="診所地址、電話、營業時間等資訊"
                onChange={e => setSettings(s => ({ ...s, branding: { ...s.branding, info: e.target.value } }))} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Logo 網址</label>
              <input value={settings.branding.logoUrl} placeholder="https://example.com/logo.png"
                onChange={e => setSettings(s => ({ ...s, branding: { ...s.branding, logoUrl: e.target.value } }))} />
            </div>
            <button className="btn btn-teal" onClick={() => { localStorage.setItem(LS_KEY, JSON.stringify(settings)); showToast('品牌設定已儲存'); }}>儲存品牌設定</button>
            {/* Preview */}
            <div style={{ marginTop: 20, border: `2px solid ${ACCENT}`, borderRadius: 12, padding: 24, textAlign: 'center', background: '#f0fdfa' }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>預覽</div>
              {settings.branding.logoUrl && <img src={settings.branding.logoUrl} alt="logo" style={{ height: 48, marginBottom: 8 }} onError={e => { e.target.style.display = 'none'; }} />}
              <div style={{ fontSize: 18, fontWeight: 700, color: ACCENT }}>{settings.branding.welcome || `歡迎使用${getClinicName()}自助服務`}</div>
              <div style={{ fontSize: 13, color: '#555', marginTop: 8, whiteSpace: 'pre-wrap' }}>{settings.branding.info || '診所資訊'}</div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code tab */}
      {tab === 'qr' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>QR Code 產生器</h3>
            <button className="btn btn-gold btn-sm" onClick={printQRCards}>列印 QR 卡片</button>
          </div>
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
            {qrLinks.map(q => (
              <div key={q.label} style={{ border: `2px solid ${ACCENT}`, borderRadius: 12, padding: 20, textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: ACCENT, marginBottom: 8, fontSize: 14 }}>{q.label}</div>
                <div style={{ width: 120, height: 120, border: '2px dashed #ccc', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, fontSize: 10, color: '#999', wordBreak: 'break-all', padding: 8 }}>
                  [QR Code]{'\n'}{q.url}
                </div>
                <div style={{ fontSize: 11, color: '#666', wordBreak: 'break-all' }}>{q.url}</div>
                <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard?.writeText(q.url); showToast('已複製連結'); }}>複製連結</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats tab */}
      {tab === 'stats' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header"><h3>使用統計（模擬數據）</h3></div>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16, marginBottom: 24 }}>
              {[
                { label: '頁面瀏覽量', value: stats.pageViews, color: ACCENT, unit: '次' },
                { label: '預約轉換率', value: stats.bookingConversion, color: '#16a34a', unit: '%' },
                { label: '問卷完成率', value: stats.surveyCompletion, color: '#d97706', unit: '%' },
                { label: '平均瀏覽時間', value: stats.avgSessionSec, color: '#7c3aed', unit: '秒' },
              ].map(s => (
                <div key={s.label} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}<span style={{ fontSize: 13, fontWeight: 400 }}>{s.unit}</span></div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Simulated bar chart */}
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: ACCENT }}>近7日頁面瀏覽</div>
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date(); d.setDate(d.getDate() - 6 + i);
              const v = Math.floor(Math.random() * 80) + 20;
              return { day: `${d.getMonth() + 1}/${d.getDate()}`, v };
            }).map(d => (
              <div key={d.day} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 40, fontSize: 12, fontWeight: 600 }}>{d.day}</div>
                <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 4, height: 18, overflow: 'hidden' }}>
                  <div style={{ width: `${d.v}%`, height: '100%', background: ACCENT, borderRadius: 4, transition: 'width 0.4s' }} />
                </div>
                <div style={{ width: 30, fontSize: 12, textAlign: 'right' }}>{d.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
