import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

const LS_KEY = 'hcmc_floor_plan';
const ACCENT = '#0e7490';
const CANVAS_W = 800;
const CANVAS_H = 500;

/* ── Pre-defined TCM clinic room types ── */
const ROOM_TYPES = [
  '候診區', '登記處', '診療室', '針灸房', '推拿房',
  '藥房', '洗手間', '儲物室', '辦公室',
];

/* ── Room status indicators ── */
const STATUS_MAP = {
  'in-use':      { label: '使用中', color: '#16a34a' },
  'available':   { label: '空置',   color: '#9ca3af' },
  'maintenance': { label: '維修中', color: '#dc2626' },
};

/* ── Distinct fill colours per room type ── */
const ROOM_COLORS = {
  '候診區': '#fde68a', '登記處': '#bfdbfe', '診療室': '#bbf7d0',
  '針灸房': '#c4b5fd', '推拿房': '#fbcfe8', '藥房':   '#fca5a1',
  '洗手間': '#e5e7eb', '儲物室': '#d1d5db', '辦公室': '#a5f3fc',
};

function load() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } }
function save(rooms) { localStorage.setItem(LS_KEY, JSON.stringify(rooms)); }

export default function ClinicFloorPlan({ data, showToast, user }) {
  const [rooms, setRooms] = useState(load);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null);
  const [drag, setDrag] = useState(null);
  const [tab, setTab] = useState('plan');
  const persist = (next) => { setRooms(next); save(next); };

  /* ── Derived statistics for KPI & reports ── */
  const stats = useMemo(() => {
    const inUse = rooms.filter(r => r.status === 'in-use').length;
    const avail = rooms.filter(r => r.status === 'available').length;
    const maint = rooms.filter(r => r.status === 'maintenance').length;
    const totalArea = rooms.reduce((s, r) => s + (r.size || 0), 0);
    const byType = {};
    ROOM_TYPES.forEach(t => { byType[t] = rooms.filter(r => r.type === t).length; });
    return { total: rooms.length, inUse, avail, maint, totalArea, byType };
  }, [rooms]);

  /* ── Add new room with defaults ── */
  const addRoom = () => {
    const r = {
      id: uid(), name: '新房間', type: '診療室', status: 'available',
      x: 50 + Math.random() * 300, y: 50 + Math.random() * 200,
      w: 120, h: 90, size: 100, capacity: 2, equipment: '', doctor: '',
    };
    persist([...rooms, r]); setSel(r.id); setForm({ ...r });
    showToast && showToast('已新增房間');
  };

  /* ── Select room and populate detail panel ── */
  const selectRoom = (id) => {
    setSel(id);
    const r = rooms.find(rm => rm.id === id);
    if (r) setForm({ ...r });
  };

  const saveForm = () => {
    if (!form) return;
    persist(rooms.map(r => r.id === form.id ? { ...form, size: Number(form.size) || 0, capacity: Number(form.capacity) || 0 } : r));
    showToast && showToast('已儲存');
  };

  const deleteRoom = () => {
    if (!sel) return;
    persist(rooms.filter(r => r.id !== sel)); setSel(null); setForm(null);
    showToast && showToast('已刪除房間');
  };

  const toggleStatus = (id) => {
    const order = ['available', 'in-use', 'maintenance'];
    const next = rooms.map(r => {
      if (r.id !== id) return r;
      return { ...r, status: order[(order.indexOf(r.status) + 1) % order.length] };
    });
    persist(next);
    const updated = next.find(r => r.id === id);
    if (updated && sel === id) setForm({ ...updated });
  };

  /* ── SVG drag-to-position handlers ── */
  const onMouseDown = (e, id) => {
    e.preventDefault();
    const svg = e.currentTarget.closest('svg');
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const cp = pt.matrixTransform(svg.getScreenCTM().inverse());
    const r = rooms.find(rm => rm.id === id);
    setDrag({ id, ox: cp.x - r.x, oy: cp.y - r.y });
  };

  const onMouseMove = (e) => {
    if (!drag) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const cp = pt.matrixTransform(svg.getScreenCTM().inverse());
    const nx = Math.max(0, Math.min(CANVAS_W - 60, cp.x - drag.ox));
    const ny = Math.max(0, Math.min(CANVAS_H - 40, cp.y - drag.oy));
    const next = rooms.map(r => r.id === drag.id ? { ...r, x: nx, y: ny } : r);
    setRooms(next);
    if (sel === drag.id) setForm(f => f ? { ...f, x: nx, y: ny } : f);
  };

  const onMouseUp = () => { if (drag) { save(rooms); setDrag(null); } };

  /* ── Print floor plan via window.open + document.write ── */
  const printPlan = () => {
    const clinic = getClinicName();
    const rects = rooms.map(r => {
      const sc = STATUS_MAP[r.status] || STATUS_MAP['available'];
      const fill = ROOM_COLORS[r.type] || '#e5e7eb';
      return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="6" fill="${fill}" stroke="${sc.color}" stroke-width="2.5"/>
        <text x="${r.x+r.w/2}" y="${r.y+r.h/2-6}" text-anchor="middle" font-size="13" font-weight="600">${escapeHtml(r.name)}</text>
        <text x="${r.x+r.w/2}" y="${r.y+r.h/2+12}" text-anchor="middle" font-size="10" fill="#555">${escapeHtml(r.type)} · ${escapeHtml(sc.label)}</text>`;
    }).join('');
    const html = `<html><head><title>${escapeHtml(clinic)} 平面圖</title><style>body{font-family:sans-serif;padding:24px}h2{color:${ACCENT}}svg{border:1px solid #ddd;border-radius:8px}</style></head>
      <body><h2>${escapeHtml(clinic)} — 診所平面圖</h2><p>列印日期：${new Date().toLocaleDateString('zh-HK')}</p>
      <svg viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="100%" style="max-width:${CANVAS_W}px;background:#f9fafb">${rects}</svg>
      <script>window.onload=()=>window.print()<\/script></body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  };

  /* ── Inline styles ── */
  const S = {
    page: { padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
    h2: { margin: 0, fontSize: 22, color: ACCENT },
    tabs: { display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 18 },
    tab: (a) => ({
      padding: '8px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
      border: 'none', background: 'none',
      borderBottom: a ? `3px solid ${ACCENT}` : '3px solid transparent',
      color: a ? ACCENT : '#6b7280',
    }),
    btn: { padding: '7px 16px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
    btnSec: { padding: '7px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
    btnDel: { padding: '7px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
    row: { display: 'flex', gap: 18, flexWrap: 'wrap' },
    svgWrap: { flex: '1 1 520px', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden', background: '#f9fafb' },
    panel: { flex: '0 0 280px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, fontSize: 13, maxHeight: 520, overflowY: 'auto' },
    field: { marginBottom: 10 },
    lbl: { display: 'block', fontWeight: 600, marginBottom: 3, color: '#374151', fontSize: 12 },
    inp: { width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, boxSizing: 'border-box' },
    sel: { width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, boxSizing: 'border-box' },
    kpi: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' },
    kpiC: (c) => ({ flex: '1 1 110px', background: '#fff', border: `1px solid ${c}33`, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }),
    kpiN: (c) => ({ fontSize: 26, fontWeight: 700, color: c }),
    kpiL: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff' },
    th: { textAlign: 'left', padding: '8px 10px', background: '#f3f4f6', fontWeight: 600, borderBottom: '1px solid #e5e7eb' },
    td: { padding: '7px 10px', borderBottom: '1px solid #f3f4f6' },
    bar: (p, c) => ({ height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${c} ${p}%, #e5e7eb ${p}%)`, marginTop: 4 }),
    dot: (c) => ({ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c, marginRight: 6 }),
    card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 },
  };

  const KPI = [
    [ACCENT, stats.total, '總房間數'], ['#16a34a', stats.inUse, '使用中'],
    ['#9ca3af', stats.avail, '空置'], ['#dc2626', stats.maint, '維修中'],
  ];

  /* ════════════════════════════════════ */
  /* ══            RENDER             ══ */
  /* ════════════════════════════════════ */
  return (
    <div style={S.page}>
      {/* ── Header ── */}
      <div style={S.header}>
        <h2 style={S.h2}>診所平面圖管理</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.btn} onClick={addRoom}>＋ 新增房間</button>
          <button style={S.btnSec} onClick={printPlan}>列印平面圖</button>
        </div>
      </div>

      {/* ── Occupancy KPI cards ── */}
      <div style={S.kpi}>
        {KPI.map(([c, v, l]) => (
          <div key={l} style={S.kpiC(c)}><div style={S.kpiN(c)}>{v}</div><div style={S.kpiL}>{l}</div></div>
        ))}
        <div style={S.kpiC(ACCENT)}>
          <div style={S.kpiN(ACCENT)}>{stats.totalArea}<span style={{ fontSize: 13 }}> ft²</span></div>
          <div style={S.kpiL}>總面積</div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={S.tabs}>
        <button style={S.tab(tab === 'plan')} onClick={() => setTab('plan')}>平面圖</button>
        <button style={S.tab(tab === 'report')} onClick={() => setTab('report')}>空間使用報告</button>
      </div>

      {/* ════ Tab: Floor Plan ════ */}
      {tab === 'plan' && (
        <div style={S.row}>
          <div style={S.svgWrap}>
            <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} width="100%" style={{ display: 'block', cursor: drag ? 'grabbing' : 'default' }}
              onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width={CANVAS_W} height={CANVAS_H} fill="url(#grid)" />
              {rooms.map(r => {
                const sc = STATUS_MAP[r.status] || STATUS_MAP['available'];
                const fill = ROOM_COLORS[r.type] || '#e5e7eb';
                const isSel = sel === r.id;
                return (
                  <g key={r.id} style={{ cursor: 'grab' }} onMouseDown={e => onMouseDown(e, r.id)} onClick={() => selectRoom(r.id)}>
                    <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={6} fill={fill}
                      stroke={isSel ? ACCENT : sc.color} strokeWidth={isSel ? 3 : 2}
                      strokeDasharray={isSel ? '6 3' : 'none'} opacity={0.92} />
                    <text x={r.x+r.w/2} y={r.y+r.h/2-6} textAnchor="middle" fontSize={12} fontWeight={600} fill="#1f2937">{r.name}</text>
                    <text x={r.x+r.w/2} y={r.y+r.h/2+10} textAnchor="middle" fontSize={9} fill="#6b7280">{r.type}</text>
                    <circle cx={r.x+r.w-10} cy={r.y+10} r={5} fill={sc.color} />
                  </g>
                );
              })}
              {rooms.length === 0 && (
                <text x={CANVAS_W/2} y={CANVAS_H/2} textAnchor="middle" fill="#9ca3af" fontSize={15}>點擊「＋ 新增房間」開始規劃</text>
              )}
            </svg>
          </div>

          <div style={S.panel}>
            {form ? (<>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: ACCENT }}>房間詳情</div>
              <div style={S.field}><label style={S.lbl}>名稱</label>
                <input style={S.inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div style={S.field}><label style={S.lbl}>類型</label>
                <select style={S.sel} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div style={S.field}><label style={S.lbl}>狀態</label>
                <select style={S.sel} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(STATUS_MAP).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ ...S.field, flex: 1 }}><label style={S.lbl}>面積 (ft²)</label>
                  <input style={S.inp} type="number" value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} /></div>
                <div style={{ ...S.field, flex: 1 }}><label style={S.lbl}>容量 (人)</label>
                  <input style={S.inp} type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ ...S.field, flex: 1 }}><label style={S.lbl}>寬度 (px)</label>
                  <input style={S.inp} type="number" value={form.w} onChange={e => setForm({ ...form, w: Number(e.target.value)||60 })} /></div>
                <div style={{ ...S.field, flex: 1 }}><label style={S.lbl}>高度 (px)</label>
                  <input style={S.inp} type="number" value={form.h} onChange={e => setForm({ ...form, h: Number(e.target.value)||40 })} /></div>
              </div>
              <div style={S.field}><label style={S.lbl}>設備</label>
                <input style={S.inp} placeholder="例：診療床, 電腦, 藥櫃" value={form.equipment} onChange={e => setForm({ ...form, equipment: e.target.value })} /></div>
              <div style={S.field}><label style={S.lbl}>指定醫師</label>
                <input style={S.inp} placeholder="醫師姓名" value={form.doctor} onChange={e => setForm({ ...form, doctor: e.target.value })} /></div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button style={S.btn} onClick={saveForm}>儲存</button>
                <button style={S.btnSec} onClick={() => toggleStatus(form.id)}>切換狀態</button>
                <button style={S.btnDel} onClick={deleteRoom}>刪除</button>
              </div>
            </>) : (
              <div style={{ color: '#9ca3af', textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>&#x1F3E5;</div>
                <div>點選房間以查看詳情</div>
                <div style={{ fontSize: 11, marginTop: 6 }}>可拖曳房間調整位置</div>
              </div>
            )}
            <div style={{ marginTop: 18, padding: '10px 0', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: '#374151' }}>狀態圖例</div>
              {Object.entries(STATUS_MAP).map(([k,v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
                  <span style={S.dot(v.color)} /><span style={{ fontSize: 12 }}>{v.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════ Tab: Space Utilisation Report ════ */}
      {tab === 'report' && (<div>
        <div style={S.card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: ACCENT }}>房間類型分佈</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {ROOM_TYPES.map(t => {
              const cnt = stats.byType[t] || 0;
              const pct = rooms.length ? Math.round((cnt / rooms.length) * 100) : 0;
              return (
                <div key={t} style={{ flex: '1 1 140px', background: '#f9fafb', borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ ...S.dot(ROOM_COLORS[t]||'#d1d5db'), width: 12, height: 12 }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{t}</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: ACCENT, marginTop: 4 }}>{cnt}</div>
                  <div style={S.bar(pct, ACCENT)} />
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{pct}% 佔比</div>
                </div>);
            })}
          </div>
        </div>

        <div style={S.card}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: ACCENT }}>各房間使用情況</div>
          {rooms.length === 0 ? <div style={{ color: '#9ca3af', textAlign: 'center', padding: 24 }}>尚未建立任何房間</div> : (
            <table style={S.tbl}><thead><tr>
              {['房間','類型','面積','容量','狀態','醫師','使用率'].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead><tbody>
              {rooms.map(r => {
                const sc = STATUS_MAP[r.status] || STATUS_MAP['available'];
                const pct = r.status === 'in-use' ? 100 : 0;
                return (<tr key={r.id}>
                  <td style={S.td}><strong>{r.name}</strong></td><td style={S.td}>{r.type}</td>
                  <td style={S.td}>{r.size} ft²</td><td style={S.td}>{r.capacity} 人</td>
                  <td style={S.td}><span style={S.dot(sc.color)} />{sc.label}</td>
                  <td style={S.td}>{r.doctor || '—'}</td>
                  <td style={{ ...S.td, minWidth: 90 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{pct}%</div>
                    <div style={S.bar(pct, pct === 100 ? '#16a34a' : '#9ca3af')} />
                  </td>
                </tr>);
              })}
            </tbody></table>
          )}
        </div>

        {rooms.length > 0 && (
          <div style={S.card}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: ACCENT }}>面積分配摘要</div>
            <table style={S.tbl}><thead><tr>
              {['類型','數量','總面積 (ft²)','面積佔比'].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead><tbody>
              {ROOM_TYPES.filter(t => stats.byType[t] > 0).map(t => {
                const cnt = stats.byType[t];
                const area = rooms.filter(r => r.type === t).reduce((s, r) => s + (r.size || 0), 0);
                const pct = stats.totalArea ? Math.round((area / stats.totalArea) * 100) : 0;
                return (<tr key={t}>
                  <td style={S.td}><span style={S.dot(ROOM_COLORS[t])} />{t}</td>
                  <td style={S.td}>{cnt}</td><td style={S.td}>{area}</td>
                  <td style={{ ...S.td, minWidth: 100 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{pct}%</div>
                    <div style={S.bar(pct, ACCENT)} />
                  </td>
                </tr>);
              })}
              <tr style={{ fontWeight: 700 }}>
                <td style={S.td}>合計</td><td style={S.td}>{rooms.length}</td>
                <td style={S.td}>{stats.totalArea}</td><td style={S.td}>100%</td>
              </tr>
            </tbody></table>
          </div>
        )}
      </div>)}
    </div>
  );
}
