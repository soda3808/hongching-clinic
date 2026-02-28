import { useState, useMemo, useEffect, useCallback } from 'react';
import { getClinicName } from '../tenant';

const ACCENT = '#0e7490';
const SK = 'hcmc_signage_settings';
const load = (k, fb) => { try { const d = JSON.parse(localStorage.getItem(k)); return d && typeof d === 'object' ? d : fb; } catch { return fb; } };
const persist = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const DEFAULT_TIPS = [
  '春季養肝：多食綠色蔬菜，保持心情舒暢，早睡早起以養肝氣。',
  '夏季養心：適量飲用綠豆湯，避免過度出汗，午間小憩養心神。',
  '秋季養肺：多食白色食物如百合、雪梨，保持室內濕度適中。',
  '冬季養腎：適量進補，多食黑色食物如黑芝麻、黑豆，注意腰部保暖。',
  '飲食有節：定時定量進食，細嚼慢嚥，七分飽為宜。',
  '起居有常：順應自然規律，日出而作，日落而息，保證充足睡眠。',
  '情志調養：保持心態平和，避免大喜大悲，適當運動紓解壓力。',
  '穴位保健：常按足三里穴，有助健脾益氣、增強免疫力。',
  '四季茶飲：春飲花茶、夏飲綠茶、秋飲烏龍、冬飲紅茶，順應時節。',
  '艾灸養生：艾灸關元、氣海穴，溫陽散寒，適合體質虛寒者。',
  '藥膳推薦：黨參黃芪燉雞湯，補氣養血，適合氣虛體質人群。',
  '經絡養生：每日梳頭百下，疏通頭部經絡，提神醒腦防脫髮。',
];

const DEFAULTS = { announcements: ['歡迎蒞臨本診所，祝您身體健康！'], tips: [...DEFAULT_TIPS], theme: 'dark', speed: 6 };

const S = {
  page: { padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 },
  tabs: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e2e8f0' },
  tab: { padding: '10px 22px', cursor: 'pointer', fontWeight: 600, fontSize: 14, border: 'none', background: 'none', color: '#64748b', borderBottom: '2px solid transparent', marginBottom: -2 },
  tabOn: { color: ACCENT, borderBottomColor: ACCENT },
  btn: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  btnSm: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  btnDanger: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 12 },
  label: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#334155' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' },
  row: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 },
  select: { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14 },
};

function formatClock(d) {
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0'), ss = String(d.getSeconds()).padStart(2, '0');
  return { date: `${y}年${m}月${day}日 星期${days[d.getDay()]}`, time: `${hh}:${mm}:${ss}` };
}

/* ── Display Screen (full-screen or preview) ── */
function SignageScreen({ cfg, queue, preview, onExit }) {
  const [now, setNow] = useState(new Date());
  const [tipIdx, setTipIdx] = useState(0);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!cfg.tips.length) return; const t = setInterval(() => setTipIdx(i => (i + 1) % cfg.tips.length), cfg.speed * 1000); return () => clearInterval(t); }, [cfg.tips, cfg.speed]);

  const dark = cfg.theme === 'dark';
  const bg = dark ? '#0f172a' : '#f8fafc';
  const fg = dark ? '#f1f5f9' : '#1e293b';
  const cardBg = dark ? '#1e293b' : '#ffffff';
  const muted = dark ? '#94a3b8' : '#64748b';
  const clock = formatClock(now);

  const waiting = queue.filter(q => q.status === 'waiting');
  const inConsult = queue.filter(q => q.status === 'in-consultation');
  const next5 = waiting.slice(0, 5);
  const estWait = waiting.length * 8;

  const wrap = { position: preview ? 'relative' : 'fixed', inset: preview ? undefined : 0, width: preview ? '100%' : '100vw', height: preview ? 420 : '100vh', background: bg, color: fg, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', display: 'flex', flexDirection: 'column', zIndex: preview ? 1 : 9999, overflow: 'hidden', borderRadius: preview ? 10 : 0, border: preview ? '1px solid #e2e8f0' : 'none' };

  const annText = cfg.announcements.join('　　　｜　　　');

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', background: ACCENT }}>
        <span style={{ fontSize: preview ? 18 : 26, fontWeight: 700, color: '#fff' }}>{getClinicName()}</span>
        <div style={{ textAlign: 'right', color: '#fff' }}>
          <div style={{ fontSize: preview ? 13 : 16 }}>{clock.date}</div>
          <div style={{ fontSize: preview ? 22 : 36, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{clock.time}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', gap: 24, padding: 24, overflow: 'hidden' }}>
        {/* Left: Current + Estimated */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: cardBg, borderRadius: 12, padding: 20, textAlign: 'center', border: `2px solid ${ACCENT}` }}>
            <div style={{ fontSize: preview ? 13 : 16, color: muted, marginBottom: 4 }}>目前診症號碼</div>
            <div style={{ fontSize: preview ? 40 : 72, fontWeight: 800, color: ACCENT, lineHeight: 1.1 }}>
              {inConsult.length ? inConsult.map(q => q.queueNo).join(', ') : '--'}
            </div>
          </div>
          <div style={{ background: cardBg, borderRadius: 12, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: preview ? 13 : 16, color: muted, marginBottom: 4 }}>預計等候時間</div>
            <div style={{ fontSize: preview ? 28 : 48, fontWeight: 700, color: fg }}>
              {waiting.length > 0 ? `約 ${estWait} 分鐘` : '無需等候'}
            </div>
            <div style={{ fontSize: preview ? 11 : 14, color: muted, marginTop: 4 }}>等候人數：{waiting.length} 人</div>
          </div>
        </div>

        {/* Right: Next patients + Health tip */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: cardBg, borderRadius: 12, padding: 16, flex: 1 }}>
            <div style={{ fontSize: preview ? 14 : 18, fontWeight: 700, marginBottom: 10, color: fg }}>候診名單</div>
            {next5.length === 0 && <div style={{ color: muted, fontSize: preview ? 13 : 16 }}>目前無候診病人</div>}
            {next5.map((q, i) => (
              <div key={q.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: i === 0 ? (dark ? '#164e63' : '#ecfeff') : 'transparent', borderRadius: 8, marginBottom: 4 }}>
                <span style={{ fontSize: preview ? 11 : 14, color: muted, width: 24 }}>{i + 1}.</span>
                <span style={{ fontSize: preview ? 16 : 24, fontWeight: 700, color: i === 0 ? ACCENT : fg }}>{q.queueNo}</span>
                {i === 0 && <span style={{ fontSize: preview ? 10 : 13, color: ACCENT, marginLeft: 'auto' }}>下一位</span>}
              </div>
            ))}
          </div>
          {cfg.tips.length > 0 && (
            <div style={{ background: cardBg, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: preview ? 12 : 15, fontWeight: 700, color: ACCENT, marginBottom: 6 }}>中醫養生小貼士</div>
              <div style={{ fontSize: preview ? 13 : 18, color: fg, lineHeight: 1.6, minHeight: preview ? 40 : 56 }}>{cfg.tips[tipIdx] || ''}</div>
            </div>
          )}
        </div>
      </div>

      {/* Announcement ticker */}
      {cfg.announcements.length > 0 && (
        <div style={{ background: dark ? '#1e293b' : '#fff', borderTop: `2px solid ${ACCENT}`, padding: '10px 0', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'inline-block', animation: 'hcmc-ticker 24s linear infinite', fontSize: preview ? 14 : 20, color: ACCENT, fontWeight: 600, paddingLeft: '100%' }}>{annText}</div>
          <style>{`@keyframes hcmc-ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-100%); } }`}</style>
        </div>
      )}

      {/* Exit hint */}
      {!preview && <div style={{ position: 'fixed', top: 8, right: 12, background: 'rgba(0,0,0,.5)', color: '#fff', padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', zIndex: 10000 }} onClick={onExit}>按 ESC 或點此退出</div>}
    </div>
  );
}

/* ── Main Component ── */
export default function DigitalSignage({ data, showToast, user }) {
  const clinicName = useMemo(() => getClinicName(), []);
  const [tab, setTab] = useState('preview');
  const [cfg, setCfg] = useState(() => load(SK, DEFAULTS));
  const [fullscreen, setFullscreen] = useState(false);
  const [newAnn, setNewAnn] = useState('');
  const [newTip, setNewTip] = useState('');
  const [editIdx, setEditIdx] = useState(null);
  const [editVal, setEditVal] = useState('');

  const save = useCallback((next) => { setCfg(next); persist(SK, next); }, []);

  const queue = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (data?.queue || []).filter(q => q.date === today && q.status !== 'completed').sort((a, b) => (a.queueNo || '').localeCompare(b.queueNo || ''));
  }, [data]);

  /* Fullscreen exit listener */
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFullscreen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setFullscreen(false); try { if (document.fullscreenElement) document.exitFullscreen(); } catch {} } };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('keydown', onKey); };
  }, []);

  const goFullscreen = () => {
    setFullscreen(true);
    try { document.documentElement.requestFullscreen(); } catch {}
  };

  const exitFullscreen = () => {
    setFullscreen(false);
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
  };

  /* List helpers */
  const addAnn = () => { if (!newAnn.trim()) return; save({ ...cfg, announcements: [...cfg.announcements, newAnn.trim()] }); setNewAnn(''); showToast('公告已新增'); };
  const delAnn = (i) => { const a = cfg.announcements.filter((_, j) => j !== i); save({ ...cfg, announcements: a }); showToast('公告已刪除'); };
  const addTip = () => { if (!newTip.trim()) return; save({ ...cfg, tips: [...cfg.tips, newTip.trim()] }); setNewTip(''); showToast('貼士已新增'); };
  const delTip = (i) => { const t = cfg.tips.filter((_, j) => j !== i); save({ ...cfg, tips: t }); showToast('貼士已刪除'); };
  const startEdit = (type, i) => { setEditIdx({ type, i }); setEditVal(type === 'ann' ? cfg.announcements[i] : cfg.tips[i]); };
  const saveEdit = () => { if (!editIdx || !editVal.trim()) return; if (editIdx.type === 'ann') { const a = [...cfg.announcements]; a[editIdx.i] = editVal.trim(); save({ ...cfg, announcements: a }); } else { const t = [...cfg.tips]; t[editIdx.i] = editVal.trim(); save({ ...cfg, tips: t }); } setEditIdx(null); showToast('已更新'); };
  const resetTips = () => { save({ ...cfg, tips: [...DEFAULT_TIPS] }); showToast('已重置為預設貼士'); };

  if (fullscreen) return <SignageScreen cfg={cfg} queue={queue} preview={false} onExit={exitFullscreen} />;

  const TABS = [['preview', '預覽'], ['announcements', '公告管理'], ['tips', '養生貼士'], ['settings', '顯示設定']];

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h2 style={S.title}>候診室顯示</h2>
        <button style={S.btn} onClick={goFullscreen}>全螢幕啟動</button>
      </div>

      <div style={S.tabs}>
        {TABS.map(([k, l]) => <button key={k} style={{ ...S.tab, ...(tab === k ? S.tabOn : {}) }} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {/* Preview */}
      {tab === 'preview' && <SignageScreen cfg={cfg} queue={queue} preview onExit={() => {}} />}

      {/* Announcements */}
      {tab === 'announcements' && (
        <div>
          <div style={S.row}>
            <input style={{ ...S.input, flex: 1 }} placeholder="輸入公告內容..." value={newAnn} onChange={e => setNewAnn(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAnn()} />
            <button style={S.btn} onClick={addAnn}>新增</button>
          </div>
          {cfg.announcements.map((a, i) => (
            <div key={i} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10 }}>
              {editIdx?.type === 'ann' && editIdx.i === i ? (
                <>
                  <input style={{ ...S.input, flex: 1 }} value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit()} autoFocus />
                  <button style={S.btnSm} onClick={saveEdit}>儲存</button>
                  <button style={{ ...S.btnSm, background: '#94a3b8' }} onClick={() => setEditIdx(null)}>取消</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 14 }}>{a}</span>
                  <button style={S.btnSm} onClick={() => startEdit('ann', i)}>編輯</button>
                  <button style={S.btnDanger} onClick={() => delAnn(i)}>刪除</button>
                </>
              )}
            </div>
          ))}
          {cfg.announcements.length === 0 && <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: 32 }}>尚無公告</p>}
        </div>
      )}

      {/* Health Tips */}
      {tab === 'tips' && (
        <div>
          <div style={{ ...S.row, marginBottom: 12 }}>
            <input style={{ ...S.input, flex: 1 }} placeholder="輸入養生貼士..." value={newTip} onChange={e => setNewTip(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTip()} />
            <button style={S.btn} onClick={addTip}>新增</button>
            <button style={{ ...S.btn, background: '#64748b' }} onClick={resetTips}>重置預設</button>
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>共 {cfg.tips.length} 條貼士，每 {cfg.speed} 秒輪換一次</p>
          {cfg.tips.map((t, i) => (
            <div key={i} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 10 }}>
              {editIdx?.type === 'tip' && editIdx.i === i ? (
                <>
                  <input style={{ ...S.input, flex: 1 }} value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit()} autoFocus />
                  <button style={S.btnSm} onClick={saveEdit}>儲存</button>
                  <button style={{ ...S.btnSm, background: '#94a3b8' }} onClick={() => setEditIdx(null)}>取消</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 14 }}>{t}</span>
                  <button style={S.btnSm} onClick={() => startEdit('tip', i)}>編輯</button>
                  <button style={S.btnDanger} onClick={() => delTip(i)}>刪除</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Settings */}
      {tab === 'settings' && (
        <div style={{ maxWidth: 480 }}>
          <div style={S.card}>
            <label style={S.label}>顯示主題</label>
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              {['dark', 'light'].map(t => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                  <input type="radio" name="theme" checked={cfg.theme === t} onChange={() => save({ ...cfg, theme: t })} />
                  {t === 'dark' ? '深色模式' : '淺色模式'}
                </label>
              ))}
            </div>
          </div>
          <div style={S.card}>
            <label style={S.label}>貼士輪換速度（秒）</label>
            <input type="range" min={3} max={15} value={cfg.speed} onChange={e => save({ ...cfg, speed: Number(e.target.value) })} style={{ width: '100%', accentColor: ACCENT }} />
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>每 {cfg.speed} 秒切換一條養生貼士</div>
          </div>
          <div style={S.card}>
            <label style={S.label}>操作說明</label>
            <ul style={{ fontSize: 13, color: '#64748b', margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
              <li>點擊「全螢幕啟動」將畫面投放到候診室電視</li>
              <li>按 ESC 鍵或點擊右上角按鈕退出全螢幕</li>
              <li>顯示內容會自動同步今日候診隊列</li>
              <li>公告和貼士可隨時編輯，即時生效</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
