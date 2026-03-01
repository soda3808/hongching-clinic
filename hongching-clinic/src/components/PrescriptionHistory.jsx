import { useState, useMemo } from 'react';
import { getDoctors, getStoreNames } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

export default function PrescriptionHistory({ data, showToast, user }) {
  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [showCompare, setShowCompare] = useState(false);

  const doctors = getDoctors();
  const clinicName = getClinicName();
  const consultations = data.consultations || [];

  // All unique patient names
  const patientNames = useMemo(() => {
    const set = new Set();
    consultations.forEach(c => { if (c.patientName) set.add(c.patientName); });
    return [...set].sort();
  }, [consultations]);

  // Filtered by search
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return patientNames.filter(n => n.toLowerCase().includes(q));
  }, [search, patientNames]);

  // Prescriptions for selected patient
  const patientRx = useMemo(() => {
    if (!selectedPatient) return [];
    let list = consultations.filter(c => c.patientName === selectedPatient && (c.prescription || []).some(p => p.herb));
    if (doctorFilter !== 'all') list = list.filter(c => c.doctor === doctorFilter);
    if (dateFrom) list = list.filter(c => c.date >= dateFrom);
    if (dateTo) list = list.filter(c => c.date <= dateTo);
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [consultations, selectedPatient, doctorFilter, dateFrom, dateTo]);

  // Summary stats
  const stats = useMemo(() => {
    if (!patientRx.length) return null;
    const formulaCounts = {};
    let totalHerbs = 0;
    patientRx.forEach(c => {
      if (c.formulaName) formulaCounts[c.formulaName] = (formulaCounts[c.formulaName] || 0) + 1;
      totalHerbs += (c.prescription || []).filter(p => p.herb).length;
    });
    const topFormula = Object.entries(formulaCounts).sort((a, b) => b[1] - a[1])[0];
    return {
      totalVisits: patientRx.length,
      avgHerbs: (totalHerbs / patientRx.length).toFixed(1),
      topFormula: topFormula ? `${topFormula[0]}（${topFormula[1]}次）` : '-',
    };
  }, [patientRx]);

  // Herb frequency analysis
  const herbFreq = useMemo(() => {
    const map = {};
    patientRx.forEach(c => {
      (c.prescription || []).forEach(p => {
        if (p.herb) map[p.herb] = (map[p.herb] || 0) + 1;
      });
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 15);
  }, [patientRx]);
  const maxFreq = herbFreq.length ? herbFreq[0][1] : 1;

  // Comparison data
  const rxA = patientRx.find(c => c.id === compareA);
  const rxB = patientRx.find(c => c.id === compareB);
  const comparisonDiff = useMemo(() => {
    if (!rxA || !rxB) return null;
    const herbsA = new Map((rxA.prescription || []).filter(p => p.herb).map(p => [p.herb, p.dosage]));
    const herbsB = new Map((rxB.prescription || []).filter(p => p.herb).map(p => [p.herb, p.dosage]));
    const allHerbs = new Set([...herbsA.keys(), ...herbsB.keys()]);
    const rows = [];
    allHerbs.forEach(herb => {
      const dA = herbsA.get(herb) || '-';
      const dB = herbsB.get(herb) || '-';
      const status = !herbsA.has(herb) ? 'added' : !herbsB.has(herb) ? 'removed' : dA !== dB ? 'changed' : 'same';
      rows.push({ herb, dA, dB, status });
    });
    rows.sort((a, b) => { const ord = { added: 0, removed: 1, changed: 2, same: 3 }; return ord[a.status] - ord[b.status]; });
    return rows;
  }, [rxA, rxB]);

  // Print
  const handlePrint = () => {
    if (!patientRx.length) return;
    const rows = patientRx.map(c =>
      `<tr><td>${c.date}</td><td>${escapeHtml(c.doctor || '-')}</td><td>${escapeHtml(c.formulaName || '-')}</td><td>${c.formulaDays || '-'}天</td><td>${(c.prescription || []).filter(p => p.herb).map(p => `${escapeHtml(p.herb)} ${escapeHtml(p.dosage)}`).join('、')}</td><td>${escapeHtml(c.specialNotes || '-')}</td></tr>`
    ).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>處方歷史 - ${escapeHtml(selectedPatient)}</title><style>@page{size:A4;margin:12mm}body{font-family:'PingFang TC','Microsoft YaHei',sans-serif;font-size:12px;padding:15px;max-width:780px;margin:0 auto;color:#333}h1{font-size:17px;text-align:center;margin:0 0 2px}p.sub{text-align:center;color:#888;font-size:11px;margin:0 0 16px}table{width:100%;border-collapse:collapse;margin-bottom:14px}th,td{padding:5px 8px;border-bottom:1px solid #ddd;text-align:left;font-size:11px}th{background:#f3f4f6;font-weight:700}.stats{display:flex;gap:20px;margin-bottom:14px;font-size:12px}.stats b{color:#0e7490}@media print{body{padding:8px}}</style></head><body><h1>${escapeHtml(clinicName)} — 病人處方歷史</h1><p class="sub">${escapeHtml(selectedPatient)} | 共 ${patientRx.length} 次就診 | 列印：${new Date().toLocaleString('zh-HK')}</p><table><thead><tr><th>日期</th><th>醫師</th><th>處方</th><th>天數</th><th>藥材明細</th><th>備註</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // Copy to clipboard
  const handleCopy = () => {
    if (!patientRx.length) return;
    const lines = patientRx.map(c => {
      const herbs = (c.prescription || []).filter(p => p.herb).map(p => `${p.herb} ${p.dosage}`).join('、');
      return `${c.date} | ${c.doctor || '-'} | ${c.formulaName || '-'} | ${c.formulaDays || '-'}天 | ${herbs}`;
    });
    navigator.clipboard.writeText(`${selectedPatient} — 處方歷史\n${'='.repeat(40)}\n${lines.join('\n')}`);
    showToast('已複製到剪貼簿');
  };

  const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 };
  const labelStyle = { fontSize: 11, color: '#888', marginBottom: 2 };
  const statNum = { fontSize: 22, fontWeight: 700, color: '#0e7490' };
  const STATUS_COLORS = { added: '#16a34a', removed: '#dc2626', changed: '#d97706', same: '#666' };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>📜 病人處方歷史</h2>
        <div style={{ flex: 1 }} />
        {selectedPatient && <>
          <button onClick={handlePrint} className="btn btn-outline" style={{ fontSize: 12 }}>🖨️ 列印</button>
          <button onClick={handleCopy} className="btn btn-outline" style={{ fontSize: 12 }}>📋 複製</button>
          <button onClick={() => setShowCompare(!showCompare)} className="btn btn-outline" style={{ fontSize: 12, background: showCompare ? '#0e7490' : '', color: showCompare ? '#fff' : '' }}>🔀 對比</button>
        </>}
      </div>

      {/* Patient Search */}
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🔍 搜尋病人</div>
        <div style={{ position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="輸入病人姓名..." className="input" style={{ width: '100%', fontSize: 14 }} />
          {searchResults.length > 0 && search && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
              {searchResults.map(name => (
                <div key={name} onClick={() => { setSelectedPatient(name); setSearch(''); setCompareA(''); setCompareB(''); setShowCompare(false); }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6' }}
                  onMouseEnter={e => e.target.style.background = '#f0fdfa'} onMouseLeave={e => e.target.style.background = ''}>
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>
        {selectedPatient && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0e7490' }}>當前病人：{selectedPatient}</span>
            <button onClick={() => { setSelectedPatient(''); setSearch(''); }} style={{ fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>清除</button>
          </div>
        )}
      </div>

      {selectedPatient && <>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select value={doctorFilter} onChange={e => setDoctorFilter(e.target.value)} className="input" style={{ width: 140, fontSize: 12 }}>
            <option value="all">全部醫師</option>
            {doctors.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" style={{ width: 140, fontSize: 12 }} placeholder="開始日期" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" style={{ width: 140, fontSize: 12 }} placeholder="結束日期" />
          {(doctorFilter !== 'all' || dateFrom || dateTo) && (
            <button onClick={() => { setDoctorFilter('all'); setDateFrom(''); setDateTo(''); }} className="btn btn-outline" style={{ fontSize: 11 }}>重置篩選</button>
          )}
        </div>

        {/* Summary Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8, marginBottom: 12 }}>
            <div style={cardStyle}><div style={labelStyle}>總就診次數</div><div style={statNum}>{stats.totalVisits}</div></div>
            <div style={cardStyle}><div style={labelStyle}>常用處方</div><div style={{ fontSize: 14, fontWeight: 600, color: '#0e7490' }}>{stats.topFormula}</div></div>
            <div style={cardStyle}><div style={labelStyle}>平均藥材數</div><div style={statNum}>{stats.avgHerbs}</div></div>
          </div>
        )}

        {/* Herb Frequency Chart */}
        {herbFreq.length > 0 && (
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>📊 藥材使用頻率（前15名）</div>
            {herbFreq.map(([herb, count]) => (
              <div key={herb} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 70, fontSize: 11, textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{herb}</div>
                <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 4, height: 18, overflow: 'hidden' }}>
                  <div style={{ width: `${(count / maxFreq) * 100}%`, height: '100%', background: '#0e7490', borderRadius: 4, transition: 'width .3s' }} />
                </div>
                <div style={{ width: 28, fontSize: 11, fontWeight: 600, color: '#0e7490' }}>{count}</div>
              </div>
            ))}
          </div>
        )}

        {/* Comparison Panel */}
        {showCompare && (
          <div style={{ ...cardStyle, borderLeft: '4px solid #0e7490' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>🔀 處方對比</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <select value={compareA} onChange={e => setCompareA(e.target.value)} className="input" style={{ flex: 1, minWidth: 160, fontSize: 12 }}>
                <option value="">選擇處方 A</option>
                {patientRx.map(c => <option key={c.id} value={c.id}>{c.date} — {c.formulaName || '無名'} ({c.doctor})</option>)}
              </select>
              <select value={compareB} onChange={e => setCompareB(e.target.value)} className="input" style={{ flex: 1, minWidth: 160, fontSize: 12 }}>
                <option value="">選擇處方 B</option>
                {patientRx.map(c => <option key={c.id} value={c.id}>{c.date} — {c.formulaName || '無名'} ({c.doctor})</option>)}
              </select>
            </div>
            {comparisonDiff && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>藥材</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>處方A ({rxA?.date})</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>處方B ({rxB?.date})</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center' }}>變更</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonDiff.map(r => (
                      <tr key={r.herb} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '5px 10px', fontWeight: 600 }}>{r.herb}</td>
                        <td style={{ padding: '5px 10px', color: r.status === 'removed' ? '#dc2626' : '' }}>{r.dA}</td>
                        <td style={{ padding: '5px 10px', color: r.status === 'added' ? '#16a34a' : '' }}>{r.dB}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: STATUS_COLORS[r.status] }}>
                          {{ added: '＋新增', removed: '－移除', changed: '⇄ 調整', same: '不變' }[r.status]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Timeline */}
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📅 處方時間線（{patientRx.length} 筆）</div>
        {patientRx.length === 0 && <div style={{ ...cardStyle, textAlign: 'center', color: '#888', fontSize: 13 }}>找不到符合條件的處方記錄</div>}
        {patientRx.map(c => {
          const herbs = (c.prescription || []).filter(p => p.herb);
          return (
            <div key={c.id} style={{ ...cardStyle, borderLeft: '4px solid #0e7490', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#0e7490' }}>{c.date}</span>
                  <span style={{ marginLeft: 10, fontSize: 12, color: '#555' }}>👨‍⚕️ {c.doctor || '-'}</span>
                  {c.store && <span style={{ marginLeft: 8, fontSize: 11, color: '#888' }}>📍 {c.store}</span>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {c.formulaName && <span style={{ background: '#ecfdf5', color: '#065f46', fontSize: 11, padding: '2px 8px', borderRadius: 10 }}>{c.formulaName}</span>}
                  {c.formulaDays && <span style={{ background: '#eff6ff', color: '#1e40af', fontSize: 11, padding: '2px 8px', borderRadius: 10 }}>{c.formulaDays}天</span>}
                </div>
              </div>
              {c.formulaInstructions && <div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>💊 {c.formulaInstructions}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: c.specialNotes ? 6 : 0 }}>
                {herbs.map((p, i) => (
                  <span key={i} style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', fontSize: 11, padding: '2px 7px', borderRadius: 6 }}>{p.herb} <b>{p.dosage}</b></span>
                ))}
              </div>
              {c.specialNotes && <div style={{ fontSize: 11, color: '#d97706', marginTop: 4 }}>⚠️ {c.specialNotes}</div>}
            </div>
          );
        })}
      </>}

      {!selectedPatient && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: '#888' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 14 }}>請搜尋並選擇病人以查看處方歷史</div>
        </div>
      )}
    </div>
  );
}
