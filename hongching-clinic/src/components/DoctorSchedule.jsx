import { useState } from 'react';
import { getDoctorSchedule, saveDoctorSchedule } from '../config';
import { DOCTORS } from '../data';

const DAYS = [
  { id: 'mon', label: '星期一' },
  { id: 'tue', label: '星期二' },
  { id: 'wed', label: '星期三' },
  { id: 'thu', label: '星期四' },
  { id: 'fri', label: '星期五' },
  { id: 'sat', label: '星期六' },
];
const SLOTS = ['上午', '下午', '晚上'];
const STORE_OPTIONS = ['宋皇臺', '太子', '休息'];
const STORE_COLORS = { '宋皇臺': { bg: 'var(--teal-50)', color: 'var(--teal-700)', border: 'var(--teal-200)' }, '太子': { bg: '#FFF8E1', color: '#92400e', border: '#F5D790' }, '休息': { bg: 'var(--gray-100)', color: 'var(--gray-400)', border: 'var(--gray-200)' } };

export default function DoctorSchedule({ data, setData, showToast, user }) {
  const [schedule, setSchedule] = useState(getDoctorSchedule);
  const [selectedDoctor, setSelectedDoctor] = useState('all');
  const [editing, setEditing] = useState(false);
  const [editCell, setEditCell] = useState(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiTip, setAiTip] = useState(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const doctors = selectedDoctor === 'all' ? DOCTORS : [selectedDoctor];

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
    const style = STORE_COLORS[display] || STORE_COLORS['休息'];
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
          {STORE_OPTIONS.map(o => <option key={o}>{o}</option>)}
        </select>
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
    <>
      {/* Filter + Actions */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ width: 'auto' }} value={selectedDoctor} onChange={e => setSelectedDoctor(e.target.value)}>
          <option value="all">所有醫師</option>
          {DOCTORS.map(d => <option key={d}>{d}</option>)}
        </select>
        {isAdmin && !editing && <button className="btn btn-teal" onClick={() => setEditing(true)}>編輯排班</button>}
        {isAdmin && !editing && (
          <button className="btn btn-outline" onClick={async () => {
            setAiLoading(true); setAiTip(null);
            try {
              const scheduleStr = JSON.stringify(schedule);
              const res = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: `分析以下醫師排班表，提供優化建議（例如：是否平均分配、有無時段無人值班、建議調整等）：\n${scheduleStr}`,
                  context: { schedule, doctors: DOCTORS },
                  history: [],
                }),
              });
              const result = await res.json();
              setAiTip(result.success ? result.reply : '無法取得建議');
            } catch { setAiTip('網絡錯誤'); }
            setAiLoading(false);
          }} disabled={aiLoading} style={{ fontSize: 12 }}>
            {aiLoading ? '分析中...' : '🤖 AI 排班建議'}
          </button>
        )}
        {editing && (
          <>
            <button className="btn btn-green" onClick={handleSave}>儲存</button>
            <button className="btn btn-outline" onClick={handleCancel}>取消</button>
          </>
        )}
      </div>

      {/* AI Suggestion */}
      {aiTip && (
        <div className="card" style={{ padding: 12, background: 'var(--teal-50)', border: '1px solid var(--teal-200)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 13, color: 'var(--teal-700)' }}>🤖 AI 排班建議</strong>
            <button className="btn btn-outline btn-sm" style={{ fontSize: 11 }} onClick={() => setAiTip(null)}>關閉</button>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--gray-700)' }}>{aiTip}</div>
        </div>
      )}

      {/* Legend */}
      <div className="card" style={{ padding: '8px 16px', display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
        <span style={{ fontWeight: 600, color: 'var(--gray-500)' }}>圖例：</span>
        {['宋皇臺', '太子', '休息'].map(s => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: STORE_COLORS[s].bg, border: `1px solid ${STORE_COLORS[s].border}`, display: 'inline-block' }} />
            <span style={{ color: STORE_COLORS[s].color, fontWeight: 600 }}>{s}</span>
          </span>
        ))}
        {editing && <span style={{ color: 'var(--teal-600)', fontWeight: 600, marginLeft: 'auto' }}>點擊格子可修改</span>}
      </div>

      {/* Schedule Grid */}
      {doctors.map(doctor => (
        <div key={doctor} className="card" style={{ padding: 0 }}>
          <div className="card-header">
            <h3>
              <span role="img" aria-label="doctor">👨‍⚕️</span> {doctor}
            </h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 80 }}>時段</th>
                  {DAYS.map(d => <th key={d.id} style={{ textAlign: 'center' }}>{d.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map(slot => (
                  <tr key={slot}>
                    <td style={{ fontWeight: 700, color: 'var(--gray-600)', fontSize: 13 }}>{slot}</td>
                    {DAYS.map(day => (
                      <td key={day.id} style={{ padding: 4 }}>
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
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 12 }}>每週工作統計</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>醫師</th><th style={{ textAlign: 'right' }}>宋皇臺</th><th style={{ textAlign: 'right' }}>太子</th><th style={{ textAlign: 'right' }}>總時段</th><th style={{ textAlign: 'right' }}>休息</th></tr>
            </thead>
            <tbody>
              {DOCTORS.map(doc => {
                let tkw = 0, pe = 0, off = 0;
                DAYS.forEach(d => {
                  SLOTS.forEach(s => {
                    const v = getSlot(doc, d.id, s);
                    if (v === '宋皇臺') tkw++;
                    else if (v === '太子') pe++;
                    else off++;
                  });
                });
                return (
                  <tr key={doc}>
                    <td style={{ fontWeight: 600 }}>{doc}</td>
                    <td className="money" style={{ color: 'var(--teal-700)' }}>{tkw}</td>
                    <td className="money" style={{ color: '#92400e' }}>{pe}</td>
                    <td className="money" style={{ fontWeight: 700 }}>{tkw + pe}</td>
                    <td className="money" style={{ color: 'var(--gray-400)' }}>{off}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
