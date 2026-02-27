import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { fmtM } from '../../data';

const SYMPTOM_SCORES = { '無': 0, '輕微': 1, '中等': 2, '明顯': 3, '嚴重': 4 };
const SCORE_COLORS = ['#16a34a', '#84cc16', '#d97706', '#ea580c', '#dc2626'];

export default function TreatmentProgress({ data }) {
  const [selectedPatient, setSelectedPatient] = useState('');
  const [search, setSearch] = useState('');

  const patients = data.patients || [];
  const consultations = data.consultations || [];
  const revenue = data.revenue || [];

  // Patients with consultations
  const activePatients = useMemo(() => {
    const patientIds = new Set(consultations.map(c => c.patientId || c.patientName));
    return patients.filter(p => patientIds.has(p.id) || patientIds.has(p.name))
      .map(p => {
        const visits = consultations.filter(c => c.patientId === p.id || c.patientName === p.name);
        return { ...p, visitCount: visits.length, lastVisit: visits.sort((a, b) => b.date?.localeCompare(a.date))[0]?.date };
      })
      .sort((a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || ''));
  }, [patients, consultations]);

  const filteredPatients = useMemo(() => {
    if (!search) return activePatients.slice(0, 30);
    const q = search.toLowerCase();
    return activePatients.filter(p => p.name?.toLowerCase().includes(q) || p.phone?.includes(q)).slice(0, 30);
  }, [activePatients, search]);

  // Selected patient's data
  const patientData = useMemo(() => {
    if (!selectedPatient) return null;
    const patient = patients.find(p => p.id === selectedPatient);
    if (!patient) return null;

    const visits = consultations
      .filter(c => c.patientId === patient.id || c.patientName === patient.name)
      .sort((a, b) => a.date?.localeCompare(b.date));

    const spending = revenue.filter(r => r.name === patient.name || r.patientId === patient.id);
    const totalSpent = spending.reduce((s, r) => s + Number(r.amount || 0), 0);

    // Treatment timeline
    const timeline = visits.map((v, i) => ({
      date: v.date,
      visit: i + 1,
      diagnosis: v.tcmDiagnosis || v.assessment || '-',
      pattern: v.tcmPattern || '-',
      tongue: v.tongue || '-',
      pulse: v.pulse || '-',
      treatment: (v.treatments || []).join(', ') || '-',
      herbCount: (v.prescription || []).filter(p => p.herb).length,
      followUp: v.followUpDate || '-',
      doctor: v.doctor,
      subjective: v.subjective || '-',
    }));

    // Treatment types used over time
    const treatmentCounts = {};
    visits.forEach(v => {
      (v.treatments || []).forEach(t => {
        treatmentCounts[t] = (treatmentCounts[t] || 0) + 1;
      });
    });

    // Herb frequency
    const herbFreq = {};
    visits.forEach(v => {
      (v.prescription || []).forEach(p => {
        if (p.herb) herbFreq[p.herb] = (herbFreq[p.herb] || 0) + 1;
      });
    });
    const topHerbs = Object.entries(herbFreq).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // Visit frequency chart
    const visitByMonth = {};
    visits.forEach(v => {
      if (v.date) {
        const m = v.date.substring(0, 7);
        visitByMonth[m] = (visitByMonth[m] || 0) + 1;
      }
    });
    const visitTrend = Object.entries(visitByMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([m, c]) => ({ month: m.substring(5), count: c }));

    // Spending trend
    const spendByMonth = {};
    spending.forEach(r => {
      if (r.date) {
        const m = r.date.substring(0, 7);
        spendByMonth[m] = (spendByMonth[m] || 0) + Number(r.amount || 0);
      }
    });
    const spendTrend = Object.entries(spendByMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([m, a]) => ({ month: m.substring(5), amount: a }));

    // Follow-up compliance
    const withFollowUp = visits.filter(v => v.followUpDate);
    const followedUp = withFollowUp.filter(v => {
      return visits.some(next => next.date >= v.followUpDate && next !== v);
    });
    const followUpRate = withFollowUp.length > 0 ? Math.round(followedUp.length / withFollowUp.length * 100) : 0;

    return {
      patient,
      visits,
      timeline,
      treatmentCounts: Object.entries(treatmentCounts).sort((a, b) => b[1] - a[1]),
      topHerbs,
      visitTrend,
      spendTrend,
      totalSpent,
      totalVisits: visits.length,
      firstVisit: visits[0]?.date,
      lastVisit: visits[visits.length - 1]?.date,
      followUpRate,
      avgInterval: visits.length > 1
        ? Math.round((new Date(visits[visits.length - 1].date) - new Date(visits[0].date)) / (visits.length - 1) / 86400000)
        : 0,
    };
  }, [selectedPatient, patients, consultations, revenue]);

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>治療進度追蹤</h3>

      {/* Patient Selector */}
      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            placeholder="搜尋病人姓名或電話..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
        {filteredPatients.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {filteredPatients.map(p => (
              <button
                key={p.id}
                className={`preset-chip ${selectedPatient === p.id ? 'active' : ''}`}
                onClick={() => setSelectedPatient(p.id)}
              >
                {p.name} ({p.visitCount}次)
              </button>
            ))}
          </div>
        )}
      </div>

      {!selectedPatient && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>
          請選擇病人查看治療進度
        </div>
      )}

      {patientData && (
        <>
          {/* Patient Summary */}
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <div className="stat-card teal"><div className="stat-label">總診次</div><div className="stat-value teal">{patientData.totalVisits}</div></div>
            <div className="stat-card green"><div className="stat-label">總消費</div><div className="stat-value green" style={{ fontSize: 18 }}>{fmtM(patientData.totalSpent)}</div></div>
            <div className="stat-card gold"><div className="stat-label">覆診率</div><div className="stat-value gold">{patientData.followUpRate}%</div></div>
            <div className="stat-card"><div className="stat-label">平均間隔</div><div className="stat-value" style={{ color: '#7C3AED' }}>{patientData.avgInterval}天</div></div>
            <div className="stat-card"><div className="stat-label">就診期間</div><div className="stat-value" style={{ color: '#0e7490', fontSize: 12 }}>{patientData.firstVisit || '-'}<br/>~ {patientData.lastVisit || '-'}</div></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Visit Trend */}
            {patientData.visitTrend.length > 1 && (
              <div className="card">
                <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>就診頻率趨勢</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={patientData.visitTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0e7490" name="就診次數" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Spending Trend */}
            {patientData.spendTrend.length > 1 && (
              <div className="card">
                <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>消費趨勢</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={patientData.spendTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => [fmtM(v), '消費']} />
                    <Line type="monotone" dataKey="amount" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} name="消費" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Treatment Timeline */}
          <div className="card" style={{ marginTop: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>診療時間線</h4>
            <div style={{ position: 'relative', paddingLeft: 24 }}>
              {patientData.timeline.map((t, i) => (
                <div key={i} style={{ position: 'relative', paddingBottom: 16, borderLeft: i < patientData.timeline.length - 1 ? '2px solid var(--teal-200)' : 'none', paddingLeft: 20 }}>
                  <div style={{ position: 'absolute', left: -9, top: 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--teal)', border: '2px solid #fff', boxShadow: '0 0 0 2px var(--teal-200)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>第 {t.visit} 次 — {t.date}</div>
                      <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>醫師: {t.doctor}</div>
                    </div>
                    {t.followUp !== '-' && (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#0e749018', color: '#0e7490' }}>覆診: {t.followUp}</span>
                    )}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, display: 'grid', gridTemplateColumns: '80px 1fr', gap: '2px 8px' }}>
                    <span style={{ color: 'var(--gray-500)' }}>主訴:</span><span>{t.subjective}</span>
                    <span style={{ color: 'var(--gray-500)' }}>辨證:</span><span style={{ fontWeight: 600, color: 'var(--teal-700)' }}>{t.diagnosis}</span>
                    {t.pattern !== '-' && <><span style={{ color: 'var(--gray-500)' }}>證型:</span><span>{t.pattern}</span></>}
                    {t.tongue !== '-' && <><span style={{ color: 'var(--gray-500)' }}>舌象:</span><span>{t.tongue}</span></>}
                    {t.pulse !== '-' && <><span style={{ color: 'var(--gray-500)' }}>脈象:</span><span>{t.pulse}</span></>}
                    <span style={{ color: 'var(--gray-500)' }}>治療:</span><span>{t.treatment}</span>
                    {t.herbCount > 0 && <><span style={{ color: 'var(--gray-500)' }}>用藥:</span><span>{t.herbCount} 味藥</span></>}
                  </div>
                </div>
              ))}
              {patientData.timeline.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--gray-400)' }}>暫無診療紀錄</div>
              )}
            </div>
          </div>

          {/* Treatment & Herb Analysis */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div className="card">
              <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>治療方式統計</h4>
              {patientData.treatmentCounts.length > 0 ? (
                <div>
                  {patientData.treatmentCounts.map(([treatment, count]) => (
                    <div key={treatment} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ flex: 1, fontSize: 12 }}>{treatment}</span>
                      <div style={{ width: 120, height: 16, background: 'var(--gray-100)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(count / patientData.totalVisits * 100, 100)}%`, background: 'var(--teal)', borderRadius: 8 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, width: 40, textAlign: 'right' }}>{count}次</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--gray-400)', fontSize: 12 }}>暫無治療紀錄</div>
              )}
            </div>

            <div className="card">
              <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>常用藥材 TOP 10</h4>
              {patientData.topHerbs.length > 0 ? (
                <div>
                  {patientData.topHerbs.map(([herb, count], i) => (
                    <div key={herb} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12 }}>
                      <span style={{ width: 16, textAlign: 'center', fontWeight: 700, color: i < 3 ? '#DAA520' : 'var(--gray-400)' }}>{i + 1}</span>
                      <span style={{ flex: 1 }}>{herb}</span>
                      <span style={{ fontWeight: 600, color: 'var(--teal)' }}>{count}次</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--gray-400)', fontSize: 12 }}>暫無處方紀錄</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
