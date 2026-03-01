import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { fmtM } from '../data';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';

const EVENT_TYPES = [
  { key: 'booking',      label: '預約', icon: '📅', color: '#2563eb', bg: '#dbeafe' },
  { key: 'queue',        label: '掛號', icon: '🔢', color: '#d97706', bg: '#fef9c3' },
  { key: 'consultation', label: '診症', icon: '🩺', color: '#7c3aed', bg: '#ede9fe' },
  { key: 'revenue',      label: '收費', icon: '💰', color: '#16a34a', bg: '#dcfce7' },
  { key: 'sickleave',    label: '假紙', icon: '📋', color: '#dc2626', bg: '#fee2e2' },
  { key: 'prescription', label: '處方', icon: '💊', color: '#0891b2', bg: '#cffafe' },
];

const typeMap = Object.fromEntries(EVENT_TYPES.map(t => [t.key, t]));

function buildTimeline(patient, data) {
  if (!patient) return [];
  const events = [];
  const pid = patient.id;
  const pname = patient.name;

  (data.bookings || []).forEach(b => {
    if (b.patientName === pname || b.patientPhone === patient.phone) {
      events.push({ type: 'booking', date: b.date, time: b.time || '', title: `${b.type || '覆診'} — ${b.doctor || ''}`, detail: `${b.time || ''} ${b.store || ''} ${b.notes || ''}`.trim(), status: b.status, raw: b });
    }
  });

  (data.queue || []).forEach(q => {
    if (q.patientName === pname || q.patientId === pid) {
      events.push({ type: 'queue', date: q.date, time: q.time || q.checkInTime || '', title: `掛號 ${q.queueNo || ''}`, detail: `${q.doctor || ''} ${q.store || ''} 狀態：${q.status || ''}`.trim(), status: q.status, raw: q });
    }
  });

  (data.consultations || []).forEach(c => {
    if (c.patientName === pname || c.patientId === pid) {
      events.push({ type: 'consultation', date: c.date, time: '', title: `診症 — ${c.doctor || ''}`, detail: `${c.tcmDiagnosis || ''} ${c.assessment || ''}`.trim() || c.subjective || '', raw: c });
      if ((c.prescription || []).some(r => r.herb)) {
        const herbs = c.prescription.filter(r => r.herb).map(r => `${r.herb} ${r.dosage || ''}`).join('、');
        events.push({ type: 'prescription', date: c.date, time: '', title: `處方 ${c.formulaName || ''}`, detail: herbs.substring(0, 120), raw: c });
      }
    }
  });

  (data.revenue || []).forEach(r => {
    if (r.name === pname) {
      events.push({ type: 'revenue', date: r.date, time: '', title: `收費 ${fmtM(r.amount)}`, detail: `${r.item || ''} ${r.payment || ''} ${r.doctor || ''}`.trim(), raw: r });
    }
  });

  (data.sickleaves || []).forEach(s => {
    if (s.patientName === pname) {
      events.push({ type: 'sickleave', date: s.startDate || s.issuedAt, time: '', title: `假紙 ${s.days || 1}天`, detail: `${s.diagnosis || ''} ${s.doctor || ''} ${s.startDate}~${s.endDate}`.trim(), raw: s });
    }
  });

  events.sort((a, b) => {
    const dc = (b.date || '').localeCompare(a.date || '');
    if (dc !== 0) return dc;
    return (b.time || '').localeCompare(a.time || '');
  });
  return events;
}

export default function PatientTimeline({ data, showToast, user }) {
  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const patients = data.patients || [];

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return patients.filter(p => p.name.toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 10);
  }, [search, patients]);

  const timeline = useMemo(() => {
    let evts = buildTimeline(selectedPatient, data);
    if (typeFilter !== 'all') evts = evts.filter(e => e.type === typeFilter);
    if (dateFrom) evts = evts.filter(e => (e.date || '') >= dateFrom);
    if (dateTo) evts = evts.filter(e => (e.date || '') <= dateTo);
    return evts;
  }, [selectedPatient, data, typeFilter, dateFrom, dateTo]);

  const summary = useMemo(() => {
    if (!selectedPatient) return null;
    const consults = (data.consultations || []).filter(c => c.patientName === selectedPatient.name || c.patientId === selectedPatient.id);
    const revs = (data.revenue || []).filter(r => r.name === selectedPatient.name);
    const totalSpent = revs.reduce((s, r) => s + Number(r.amount || 0), 0);
    const dates = consults.map(c => c.date).filter(Boolean).sort();
    const firstVisit = dates[0] || '-';
    const lastVisit = dates[dates.length - 1] || '-';
    const daysSince = lastVisit !== '-' ? Math.floor((Date.now() - new Date(lastVisit)) / 86400000) : null;
    return { visits: consults.length, totalSpent, firstVisit, lastVisit, daysSince };
  }, [selectedPatient, data]);

  const handlePrint = () => {
    if (!selectedPatient) return;
    const clinic = getClinicName();
    const rows = timeline.map(e => {
      const t = typeMap[e.type] || {};
      return `<tr><td>${e.date || ''}</td><td style="color:${t.color}">${escapeHtml(t.label)}</td><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.detail || '')}</td></tr>`;
    }).join('');
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>病人時間軸 - ${selectedPatient.name}</title><style>
      body{font-family:'Microsoft JhengHei',sans-serif;padding:24px;color:#222}
      h2{margin:0 0 4px;font-size:18px} .sub{color:#666;font-size:13px;margin-bottom:16px}
      .summary{display:flex;gap:24px;margin-bottom:18px;flex-wrap:wrap}
      .stat{background:#f0fdfa;padding:8px 14px;border-radius:6px;font-size:13px}
      .stat b{display:block;font-size:16px;color:${ACCENT}}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{text-align:left;background:#f0f0f0;padding:6px 8px;border-bottom:2px solid #ccc}
      td{padding:5px 8px;border-bottom:1px solid #eee}
      @media print{body{padding:0}}
    </style></head><body>
      <h2>${escapeHtml(clinic)} — 病人綜合時間軸</h2>
      <div class="sub">病人：${escapeHtml(selectedPatient.name)}　電話：${escapeHtml(selectedPatient.phone || '-')}　列印日期：${new Date().toISOString().substring(0, 10)}</div>
      ${summary ? `<div class="summary">
        <div class="stat"><b>${summary.visits}</b>總診症次數</div>
        <div class="stat"><b>${fmtM(summary.totalSpent)}</b>總消費</div>
        <div class="stat"><b>${summary.firstVisit}</b>首次就診</div>
        <div class="stat"><b>${summary.lastVisit}</b>最近就診</div>
      </div>` : ''}
      <table><thead><tr><th>日期</th><th>類型</th><th>事項</th><th>詳情</th></tr></thead><tbody>${rows || '<tr><td colspan="4">暫無記錄</td></tr>'}</tbody></table>
    </body></html>`);
    w.document.close();
    w.print();
  };

  const sCard = { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)', marginBottom: 14 };
  const sInput = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: '100%', boxSizing: 'border-box' };
  const sBtn = { padding: '7px 16px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ color: ACCENT, marginBottom: 4 }}>病人綜合時間軸</h2>
      <p style={{ color: '#666', fontSize: 13, marginTop: 0 }}>搜尋病人，查看所有預約、掛號、診症、收費、假紙及處方記錄</p>

      {/* Search */}
      <div style={{ ...sCard, position: 'relative' }}>
        <input placeholder="輸入病人姓名或電話搜尋..." value={search} onChange={e => { setSearch(e.target.value); if (!e.target.value) setSelectedPatient(null); }} style={sInput} />
        {searchResults.length > 0 && !selectedPatient && (
          <div style={{ position: 'absolute', top: 52, left: 16, right: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,.12)', zIndex: 10, maxHeight: 260, overflowY: 'auto' }}>
            {searchResults.map(p => (
              <div key={p.id} onClick={() => { setSelectedPatient(p); setSearch(p.name); }} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f0fdfa'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: '#888', fontSize: 13 }}>{p.phone || ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Patient summary */}
      {selectedPatient && summary && (
        <div style={{ ...sCard, background: 'linear-gradient(135deg, #f0fdfa 0%, #ecfeff 100%)', border: `1px solid ${ACCENT}22` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span style={{ fontSize: 18, fontWeight: 700, color: ACCENT }}>{selectedPatient.name}</span>
              <span style={{ marginLeft: 12, color: '#666', fontSize: 13 }}>{selectedPatient.phone || ''}</span>
              {selectedPatient.gender && <span style={{ marginLeft: 8, color: '#888', fontSize: 13 }}>{selectedPatient.gender}</span>}
            </div>
            <button onClick={handlePrint} style={sBtn}>列印報告</button>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            {[
              { label: '總診症', value: summary.visits },
              { label: '總消費', value: fmtM(summary.totalSpent) },
              { label: '首次就診', value: summary.firstVisit },
              { label: '最近就診', value: summary.lastVisit },
              { label: '距上次', value: summary.daysSince != null ? `${summary.daysSince}天` : '-' },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', borderRadius: 8, padding: '8px 14px', minWidth: 80 }}>
                <div style={{ fontSize: 11, color: '#888' }}>{s.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: ACCENT }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      {selectedPatient && (
        <div style={{ ...sCard, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>篩選：</span>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...sInput, width: 'auto', minWidth: 100 }}>
            <option value="all">全部類型</option>
            {EVENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...sInput, width: 'auto' }} title="開始日期" />
          <span style={{ color: '#999' }}>~</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...sInput, width: 'auto' }} title="結束日期" />
          {(typeFilter !== 'all' || dateFrom || dateTo) && (
            <button onClick={() => { setTypeFilter('all'); setDateFrom(''); setDateTo(''); }} style={{ ...sBtn, background: '#e5e7eb', color: '#333' }}>清除</button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#888' }}>共 {timeline.length} 條記錄</span>
        </div>
      )}

      {/* Timeline */}
      {selectedPatient && (
        <div>
          {timeline.length === 0 && (
            <div style={{ ...sCard, textAlign: 'center', color: '#999', padding: 40 }}>暫無記錄</div>
          )}
          {timeline.map((evt, i) => {
            const t = typeMap[evt.type] || {};
            const prevDate = i > 0 ? timeline[i - 1].date : null;
            const showDateHeader = evt.date !== prevDate;
            return (
              <div key={`${evt.type}-${i}`}>
                {showDateHeader && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT, margin: '16px 0 6px', paddingLeft: 4 }}>{evt.date || '未知日期'}</div>
                )}
                <div style={{ ...sCard, display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: `4px solid ${t.color || '#ccc'}`, marginBottom: 8, padding: '12px 14px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.bg || '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    {t.icon || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{evt.title}</span>
                      <span style={{ fontSize: 11, color: t.color, background: t.bg, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap', fontWeight: 600 }}>{t.label}</span>
                    </div>
                    {evt.detail && <div style={{ fontSize: 13, color: '#666', marginTop: 4, wordBreak: 'break-all' }}>{evt.detail}</div>}
                    {evt.time && <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{evt.time}</div>}
                    {evt.status && <div style={{ fontSize: 12, marginTop: 3 }}>
                      <span style={{ padding: '1px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: evt.status === 'completed' ? '#dcfce7' : evt.status === 'cancelled' ? '#fee2e2' : '#fef9c3', color: evt.status === 'completed' ? '#16a34a' : evt.status === 'cancelled' ? '#dc2626' : '#92400e' }}>
                        {evt.status}
                      </span>
                    </div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!selectedPatient && (
        <div style={{ ...sCard, textAlign: 'center', color: '#aaa', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 15 }}>請搜尋並選擇病人以查看時間軸</div>
        </div>
      )}
    </div>
  );
}
