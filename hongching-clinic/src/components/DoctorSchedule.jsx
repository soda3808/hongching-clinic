import { useState } from 'react';
import { getDoctorSchedule, saveDoctorSchedule } from '../config';
import { getTenantDoctors, getTenantStoreNames, getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';
import { S, ECTCM, rowStyle } from '../styles/ectcm';

const DAYS = [
  { id: 'mon', label: '星期一' },
  { id: 'tue', label: '星期二' },
  { id: 'wed', label: '星期三' },
  { id: 'thu', label: '星期四' },
  { id: 'fri', label: '星期五' },
  { id: 'sat', label: '星期六' },
];
const SLOTS = ['上午', '下午', '晚上'];
const STORE_COLOR_PALETTE = [
  { bg: 'var(--teal-50)', color: 'var(--teal-700)', border: 'var(--teal-200)' },
  { bg: '#FFF8E1', color: '#92400e', border: '#F5D790' },
  { bg: '#EDE9FE', color: '#5B21B6', border: '#C4B5FD' },
  { bg: '#FFF1F2', color: '#9F1239', border: '#FDA4AF' },
  { bg: '#ECFDF5', color: '#065F46', border: '#6EE7B7' },
  { bg: '#FFF7ED', color: '#9A3412', border: '#FDBA74' },
];
function getStoreOptions() { return [...getTenantStoreNames(), '休息']; }
function getStoreColors() {
  const storeNames = getTenantStoreNames();
  const colors = {};
  storeNames.forEach((name, i) => { colors[name] = STORE_COLOR_PALETTE[i % STORE_COLOR_PALETTE.length]; });
  colors['休息'] = { bg: 'var(--gray-100)', color: 'var(--gray-400)', border: 'var(--gray-200)' };
  return colors;
}

export default function DoctorSchedule({ data, showToast, user }) {
  const [schedule, setSchedule] = useState(getDoctorSchedule);
  const [selectedDoctor, setSelectedDoctor] = useState('all');
  const [editing, setEditing] = useState(false);
  const [editCell, setEditCell] = useState(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiTip, setAiTip] = useState(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const allDoctors = getTenantDoctors();
  const doctors = selectedDoctor === 'all' ? allDoctors : [selectedDoctor];

  // ── Leave Integration (#45) ──
  const leaves = data?.leaves || [];
  const approvedLeaves = leaves.filter(l => l.status === 'approved');

  const getDoctorLeave = (doctor, dayId) => {
    // Map dayId to actual date for this week
    const today = new Date();
    const dayOfWeek = today.getDay() || 7; // 1=Mon, 7=Sun
    const dayMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const targetDay = dayMap[dayId];
    if (!targetDay) return null;
    const diff = targetDay - dayOfWeek;
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + diff);
    const dateStr = targetDate.toISOString().substring(0, 10);
    return approvedLeaves.find(l => l.doctor === doctor && l.startDate <= dateStr && l.endDate >= dateStr);
  };

  const getSlot = (doctor, day, slot) => {
    return schedule[doctor]?.[day]?.[slot] || null;
  };

  const setSlot = (doctor, day, slot, value) => {
    const updated = { ...schedule };
    if (!updated[doctor]) updated[doctor] = {};
    if (!updated[doctor][day]) updated[doctor][day] = {};
    updated[doctor][day][slot] = value === '休息' ? null : value;
    setSchedule(updated);
  };

  const handleSave = () => {
    saveDoctorSchedule(schedule);
    setEditing(false);
    setEditCell(null);
    showToast('排班表已儲存');
  };

  const handleCancel = () => {
    setSchedule(getDoctorSchedule());
    setEditing(false);
    setEditCell(null);
  };

  const renderCell = (doctor, day, slot) => {
    const val = getSlot(doctor, day.id, slot);
    const display = val || '休息';
    const storeColors = getStoreColors();
    const style = storeColors[display] || storeColors['休息'];
    const cellKey = `${doctor}-${day.id}-${slot}`;
    const isEditing = editing && editCell === cellKey;

    if (isEditing) {
      return (
        <select
          value={val || '休息'}
          onChange={e => { setSlot(doctor, day.id, slot, e.target.value); setEditCell(null); }}
          onBlur={() => setEditCell(null)}
          autoFocus
          style={{ width: '100%', padding: '4px 6px', fontSize: 11, border: '2px solid var(--teal-500)', borderRadius: 4 }}
        >
          {getStoreOptions().map(o => <option key={o}>{o}</option>)}
        </select>
      );
    }

    // Check for leave on this day
    const leave = getDoctorLeave(doctor, day.id);
    if (leave && !editing) {
      const LEAVE_TYPES = { annual: '年假', sick: '病假', personal: '事假' };
      return (
        <div style={{ padding: '6px 8px', borderRadius: 6, textAlign: 'center', fontSize: 10, fontWeight: 600, background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          🏖️ {LEAVE_TYPES[leave.type] || '請假'}
        </div>
      );
    }

    return (
      <div
        onClick={() => { if (editing) setEditCell(cellKey); }}
        style={{
          padding: '6px 8px', borderRadius: 6, textAlign: 'center', fontSize: 11, fontWeight: 600,
          background: style.bg, color: style.color, border: `1px solid ${style.border}`,
          cursor: editing ? 'pointer' : 'default', minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {display}
      </div>
    );
  };

  return (
    <div style={S.page}>
      {/* Title Bar */}
      <div style={S.titleBar}>公司運作管理 &gt; 醫師上班時間列表</div>

      {/* Filter + Actions */}
      <div style={S.filterBar}>
        <span style={S.filterLabel}>醫師：</span>
        <select style={S.filterSelect} value={selectedDoctor} onChange={e => setSelectedDoctor(e.target.value)}>
          <option value="all">所有醫師</option>
          {allDoctors.map(d => <option key={d}>{d}</option>)}
        </select>
        {isAdmin && !editing && <button style={S.actionBtn} onClick={() => setEditing(true)}>編輯排班</button>}
        {!editing && (
          <>
            <button style={S.actionBtn} onClick={() => {
              const headers = ['醫師', ...DAYS.map(d => d.label)];
              const rows = [];
              allDoctors.forEach(doc => {
                SLOTS.forEach(slot => {
                  const row = [`${doc} (${slot})`];
                  DAYS.forEach(d => row.push(getSlot(doc, d.id, slot) || '休息'));
                  rows.push(row);
                });
              });
              const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `doctor_schedule.csv`;
              a.click();
              showToast('已匯出排班表');
            }}>匯出CSV</button>
            <button style={S.actionBtnOrange} onClick={() => {
              const w = window.open('', '_blank');
              if (!w) return;
              const docRows = allDoctors.map(doc => {
                return `<tr><td style="font-weight:700" rowspan="${SLOTS.length}">${escapeHtml(doc)}</td>` +
                  SLOTS.map((slot, si) => {
                    const printStoreColors = getStoreColors();
                    const cells = DAYS.map(d => {
                      const val = getSlot(doc, d.id, slot) || '休息';
                      const sc = printStoreColors[val] || printStoreColors['休息'];
                      return `<td style="background:${sc.bg};color:${sc.color};text-align:center;font-weight:600">${escapeHtml(val)}</td>`;
                    }).join('');
                    return si === 0 ? `<td>${escapeHtml(slot)}</td>${cells}</tr>` : `<tr><td>${escapeHtml(slot)}</td>${cells}</tr>`;
                  }).join('');
              }).join('');
              w.document.write(`<!DOCTYPE html><html><head><title>醫師排班表</title>
                <style>body{font-family:'PingFang TC',sans-serif;padding:20px;max-width:900px;margin:0 auto;font-size:12px}
                h1{font-size:18px;text-align:center}
                .sub{text-align:center;color:#888;font-size:11px;margin-bottom:20px}
                table{width:100%;border-collapse:collapse}
                th,td{padding:6px 8px;border:1px solid #ddd}
                th{background:#f0f0f0;font-weight:700}
                @media print{body{margin:0;padding:10mm}}
                </style></head><body>
                <h1>${escapeHtml(getClinicName())} — 醫師排班表</h1>
                <div class="sub">列印時間：${new Date().toLocaleString('zh-HK')}</div>
                <table><thead><tr><th>醫師</th><th>時段</th>${DAYS.map(d => `<th>${escapeHtml(d.label)}</th>`).join('')}</tr></thead>
                <tbody>${docRows}</tbody></table>
              </body></html>`);
              w.document.close();
              setTimeout(() => w.print(), 300);
            }}>列印排班表</button>
          </>
        )}
        {isAdmin && !editing && (
          <button style={S.actionBtn} onClick={async () => {
            setAiLoading(true); setAiTip(null);
            try {
              const scheduleStr = JSON.stringify(schedule);
              const res = await fetch('/api/ai?action=chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: `分析以下醫師排班表，提供優化建議（例如：是否平均分配、有無時段無人值班、建議調整等）：\n${scheduleStr}`,
                  context: { schedule, doctors: allDoctors },
                  history: [],
                }),
              });
              const result = await res.json();
              setAiTip(result.success ? result.reply : '無法取得建議');
            } catch { setAiTip('網絡錯誤'); }
            setAiLoading(false);
          }} disabled={aiLoading}>
            {aiLoading ? '分析中...' : 'AI 排班建議'}
          </button>
        )}
        {editing && (
          <>
            <button style={S.actionBtnGreen} onClick={handleSave}>儲存</button>
            <button style={S.actionBtn} onClick={handleCancel}>取消</button>
          </>
        )}
      </div>

      {/* AI Suggestion */}
      {aiTip && (
        <div style={{ padding: '8px 12px', background: ECTCM.tagBlue.bg, border: `1px solid ${ECTCM.tagBlue.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontSize: 13, color: ECTCM.headerBg }}>AI 排班建議</strong>
            <button style={{ ...S.actionBtn, padding: '2px 8px', fontSize: 11 }} onClick={() => setAiTip(null)}>關閉</button>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: ECTCM.text }}>{aiTip}</div>
        </div>
      )}

      {/* Legend */}
      <div style={{ ...S.toolbar, gap: 16 }}>
        <span style={S.filterLabel}>圖例：</span>
        {getStoreOptions().map(s => {
          const sc = getStoreColors()[s];
          return (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: sc.bg, border: `1px solid ${sc.border}`, display: 'inline-block' }} />
              <span style={{ color: sc.color, fontWeight: 600, fontSize: 12 }}>{s}</span>
            </span>
          );
        })}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 14, borderRadius: 3, background: '#fee2e2', border: '1px solid #fecaca', display: 'inline-block' }} />
          <span style={{ color: '#991b1b', fontWeight: 600, fontSize: 12 }}>請假</span>
        </span>
        {editing && <span style={{ color: ECTCM.headerBg, fontWeight: 600, marginLeft: 'auto', fontSize: 12 }}>點擊格子可修改</span>}
      </div>

      {/* Schedule Grid */}
      {doctors.map(doctor => (
        <div key={doctor} style={{ background: ECTCM.cardBg, marginBottom: 2 }}>
          <div style={{ ...S.titleBar, background: '#007777', fontSize: 13 }}>
            {doctor}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={{ ...S.th, width: 80 }}>時段</th>
                  {DAYS.map(d => <th key={d.id} style={{ ...S.th, textAlign: 'center' }}>{d.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map((slot, si) => (
                  <tr key={slot} style={rowStyle(si)}>
                    <td style={{ ...S.td, fontWeight: 700, color: ECTCM.text }}>{slot}</td>
                    {DAYS.map(day => (
                      <td key={day.id} style={{ ...S.td, padding: 4 }}>
                        {renderCell(doctor, day, slot)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Summary Stats */}
      <div style={{ background: ECTCM.cardBg }}>
        <div style={S.titleBar}>每週工作統計</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>醫師</th>
                {getTenantStoreNames().map(name => <th key={name} style={{ ...S.th, textAlign: 'right' }}>{name}</th>)}
                <th style={{ ...S.th, textAlign: 'right' }}>總時段</th>
                <th style={{ ...S.th, textAlign: 'right' }}>休息</th>
              </tr>
            </thead>
            <tbody>
              {allDoctors.map((doc, di) => {
                const storeNames = getTenantStoreNames();
                const storeColors = getStoreColors();
                const counts = {};
                storeNames.forEach(name => { counts[name] = 0; });
                let off = 0;
                DAYS.forEach(d => {
                  SLOTS.forEach(s => {
                    const v = getSlot(doc, d.id, s);
                    if (v && counts[v] !== undefined) counts[v]++;
                    else off++;
                  });
                });
                const totalWorking = storeNames.reduce((s, name) => s + counts[name], 0);
                return (
                  <tr key={doc} style={rowStyle(di)}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{doc}</td>
                    {storeNames.map(name => (
                      <td key={name} style={{ ...S.td, textAlign: 'right', color: storeColors[name]?.color || ECTCM.text }}>{counts[name]}</td>
                    ))}
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{totalWorking}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: ECTCM.textMuted }}>{off}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
