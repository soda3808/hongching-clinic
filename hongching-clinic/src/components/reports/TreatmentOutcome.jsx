import { useMemo, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fmtM, getMonth, monthLabel } from '../../data';

export default function TreatmentOutcome({ data }) {
  const consultations = data.consultations || [];
  const patients = data.patients || [];
  const [tab, setTab] = useState('overview');

  // ── Group consultations by patient for outcome tracking ──
  const patientJourneys = useMemo(() => {
    const journeys = {};
    consultations.forEach(c => {
      const key = c.patientId || c.patientName;
      if (!key) return;
      if (!journeys[key]) journeys[key] = { name: c.patientName, visits: [] };
      journeys[key].visits.push(c);
    });
    Object.values(journeys).forEach(j => {
      j.visits.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      j.totalVisits = j.visits.length;
      j.firstVisit = j.visits[0]?.date;
      j.lastVisit = j.visits[j.visits.length - 1]?.date;
      // Check if patient returned within 90 days after first visit
      if (j.visits.length >= 2) {
        const gap = Math.ceil((new Date(j.visits[1].date) - new Date(j.visits[0].date)) / 86400000);
        j.returnDays = gap;
      }
      // Unique diagnoses
      j.diagnoses = [...new Set(j.visits.map(v => v.tcmDiagnosis).filter(Boolean))];
      // Unique doctors
      j.doctors = [...new Set(j.visits.map(v => v.doctor).filter(Boolean))];
    });
    return Object.values(journeys);
  }, [consultations]);

  // ── Formula effectiveness: formulas with fewer return visits ──
  const formulaEffectiveness = useMemo(() => {
    const formulas = {};
    consultations.forEach(c => {
      const formulaName = c.formulaName || c.formulaTemplate;
      if (!formulaName) return;
      if (!formulas[formulaName]) formulas[formulaName] = { name: formulaName, patients: new Set(), visits: 0, returnVisits: 0, diagnoses: new Set() };
      const key = c.patientId || c.patientName;
      formulas[formulaName].patients.add(key);
      formulas[formulaName].visits += 1;
      if (c.tcmDiagnosis) formulas[formulaName].diagnoses.add(c.tcmDiagnosis);
    });
    // Calculate return rate: patients who came back after receiving this formula
    Object.values(formulas).forEach(f => {
      f.patientCount = f.patients.size;
      f.diagList = [...f.diagnoses].slice(0, 3).join('、');
      f.avgVisitsPerPatient = f.patientCount > 0 ? (f.visits / f.patientCount).toFixed(1) : 0;
    });
    return Object.values(formulas).sort((a, b) => b.visits - a.visits).slice(0, 20);
  }, [consultations]);

  // ── Diagnosis frequency and outcome ──
  const diagnosisStats = useMemo(() => {
    const diags = {};
    consultations.forEach(c => {
      const d = c.tcmDiagnosis;
      if (!d) return;
      if (!diags[d]) diags[d] = { name: d, count: 0, patients: new Set(), doctors: new Set(), icd10: c.icd10Code || '' };
      diags[d].count += 1;
      diags[d].patients.add(c.patientId || c.patientName);
      if (c.doctor) diags[d].doctors.add(c.doctor);
    });
    return Object.values(diags).map(d => ({
      ...d, patientCount: d.patients.size, doctorCount: d.doctors.size,
      avgVisits: d.patientCount > 0 ? (d.count / d.patientCount).toFixed(1) : 0,
    })).sort((a, b) => b.count - a.count);
  }, [consultations]);

  // ── Doctor outcome comparison ──
  const doctorOutcomes = useMemo(() => {
    const docs = {};
    consultations.forEach(c => {
      if (!c.doctor) return;
      if (!docs[c.doctor]) docs[c.doctor] = { name: c.doctor, totalVisits: 0, patients: new Set(), diagnoses: new Set(), formulas: new Set() };
      docs[c.doctor].totalVisits += 1;
      docs[c.doctor].patients.add(c.patientId || c.patientName);
      if (c.tcmDiagnosis) docs[c.doctor].diagnoses.add(c.tcmDiagnosis);
      if (c.formulaName || c.formulaTemplate) docs[c.doctor].formulas.add(c.formulaName || c.formulaTemplate);
    });
    return Object.values(docs).map(d => ({
      ...d, patientCount: d.patients.size, diagCount: d.diagnoses.size, formulaCount: d.formulas.size,
      avgVisitsPerPatient: d.patientCount > 0 ? (d.totalVisits / d.patientCount).toFixed(1) : 0,
    })).sort((a, b) => b.totalVisits - a.totalVisits);
  }, [consultations]);

  // ── Monthly consultation volume with new vs return ──
  const monthlyTrend = useMemo(() => {
    const byMonth = {};
    const patientFirstVisit = {};
    consultations.forEach(c => {
      const m = getMonth(c.date);
      const key = c.patientId || c.patientName;
      if (!m || !key) return;
      if (!byMonth[m]) byMonth[m] = { month: m, total: 0, newPatient: 0, returning: 0 };
      byMonth[m].total += 1;
      if (!patientFirstVisit[key] || c.date < patientFirstVisit[key]) patientFirstVisit[key] = c.date;
    });
    // Second pass: categorize as new or returning
    consultations.forEach(c => {
      const m = getMonth(c.date);
      const key = c.patientId || c.patientName;
      if (!m || !key) return;
      if (getMonth(patientFirstVisit[key]) === m) byMonth[m].newPatient += 1;
      else byMonth[m].returning += 1;
    });
    return Object.values(byMonth)
      .map(m => ({ ...m, label: monthLabel(m.month) }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [consultations]);

  // ── Visit return rate chart ──
  const returnRateData = useMemo(() => {
    const buckets = { '未覆診': 0, '7天內': 0, '7-14天': 0, '14-30天': 0, '30-60天': 0, '60天+': 0 };
    patientJourneys.forEach(j => {
      if (j.totalVisits <= 1) { buckets['未覆診'] += 1; return; }
      const days = j.returnDays || 999;
      if (days <= 7) buckets['7天內'] += 1;
      else if (days <= 14) buckets['7-14天'] += 1;
      else if (days <= 30) buckets['14-30天'] += 1;
      else if (days <= 60) buckets['30-60天'] += 1;
      else buckets['60天+'] += 1;
    });
    return Object.entries(buckets).map(([name, count]) => ({ name, 人數: count }));
  }, [patientJourneys]);

  const totalPatients = patientJourneys.length;
  const returnRate = totalPatients > 0 ? ((patientJourneys.filter(j => j.totalVisits >= 2).length / totalPatients) * 100).toFixed(0) : 0;
  const avgVisits = totalPatients > 0 ? (consultations.length / totalPatients).toFixed(1) : 0;
  const topDiagnosis = diagnosisStats[0]?.name || '-';

  const tabs = [
    { id: 'overview', label: '總覽' },
    { id: 'diagnosis', label: '診斷分析' },
    { id: 'formula', label: '處方效果' },
    { id: 'doctor', label: '醫師比較' },
  ];

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>🎯 治療成效追蹤</h3>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'var(--teal-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>總病人數</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{totalPatients}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--green-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--green-600)', fontWeight: 600 }}>覆診率</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-700)' }}>{returnRate}%</div>
        </div>
        <div style={{ padding: 12, background: 'var(--gold-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>平均就診次數</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-700)' }}>{avgVisits}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--red-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>最常見診斷</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--red-600)' }}>{topDiagnosis}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Monthly New vs Returning */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>新症 vs 覆診（月度）</div>
              <div style={{ width: '100%', height: 250 }}>
                <ResponsiveContainer>
                  <BarChart data={monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={10} />
                    <YAxis fontSize={11} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="newPatient" name="新症" fill="#0e7490" stackId="a" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="returning" name="覆診" fill="#16a34a" stackId="a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>首次覆診間隔分佈</div>
              <div style={{ width: '100%', height: 250 }}>
                <ResponsiveContainer>
                  <BarChart data={returnRateData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="人數" fill="#DAA520" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top diagnoses quick view */}
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>常見診斷（Top 10）</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>診斷</th><th>ICD-10</th><th style={{ textAlign: 'right' }}>就診次數</th><th style={{ textAlign: 'right' }}>病人數</th><th style={{ textAlign: 'right' }}>平均就診</th><th style={{ textAlign: 'right' }}>醫師數</th></tr></thead>
              <tbody>
                {diagnosisStats.slice(0, 10).map(d => (
                  <tr key={d.name}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td>{d.icd10 && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#0e749018', color: '#0e7490', fontWeight: 600 }}>{d.icd10}</span>}</td>
                    <td className="money">{d.count}</td>
                    <td className="money">{d.patientCount}</td>
                    <td className="money">{d.avgVisits}</td>
                    <td className="money">{d.doctorCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'diagnosis' && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>全部診斷統計</div>
          <div style={{ width: '100%', height: 300, marginBottom: 16 }}>
            <ResponsiveContainer>
              <BarChart data={diagnosisStats.slice(0, 15).map(d => ({ name: d.name, 就診次數: d.count, 病人數: d.patientCount }))} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={11} />
                <YAxis dataKey="name" type="category" fontSize={10} width={100} />
                <Tooltip />
                <Legend />
                <Bar dataKey="就診次數" fill="#0e7490" radius={[0, 4, 4, 0]} />
                <Bar dataKey="病人數" fill="#16a34a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>診斷</th><th>ICD-10</th><th style={{ textAlign: 'right' }}>就診次數</th><th style={{ textAlign: 'right' }}>病人數</th><th style={{ textAlign: 'right' }}>平均就診次數/人</th><th style={{ textAlign: 'right' }}>涉及醫師</th></tr></thead>
              <tbody>
                {diagnosisStats.map(d => (
                  <tr key={d.name}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td>{d.icd10 && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#0e749018', color: '#0e7490', fontWeight: 600 }}>{d.icd10}</span>}</td>
                    <td className="money">{d.count}</td>
                    <td className="money">{d.patientCount}</td>
                    <td className="money">{d.avgVisits}</td>
                    <td className="money">{d.doctorCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'formula' && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>處方效果分析</div>
          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 12 }}>平均就診次數越低，可能代表處方效果越好（病人較少回診）</div>
          {formulaEffectiveness.length > 0 ? (
            <>
              <div style={{ width: '100%', height: 350, marginBottom: 16 }}>
                <ResponsiveContainer>
                  <BarChart data={formulaEffectiveness.slice(0, 12).map(f => ({ name: f.name, 使用次數: f.visits, 病人數: f.patientCount }))} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" fontSize={11} />
                    <YAxis dataKey="name" type="category" fontSize={10} width={120} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="使用次數" fill="#dc2626" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="病人數" fill="#16a34a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>處方名稱</th><th style={{ textAlign: 'right' }}>使用次數</th><th style={{ textAlign: 'right' }}>病人數</th><th style={{ textAlign: 'right' }}>平均就診/人</th><th>常見診斷</th></tr></thead>
                  <tbody>
                    {formulaEffectiveness.map(f => (
                      <tr key={f.name}>
                        <td style={{ fontWeight: 600 }}>{f.name}</td>
                        <td className="money">{f.visits}</td>
                        <td className="money">{f.patientCount}</td>
                        <td className="money" style={{ color: f.avgVisitsPerPatient <= 2 ? 'var(--green-700)' : f.avgVisitsPerPatient >= 5 ? 'var(--red-600)' : '' }}>{f.avgVisitsPerPatient}</td>
                        <td style={{ fontSize: 11, color: 'var(--gray-500)' }}>{f.diagList}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無處方數據</div>
          )}
        </>
      )}

      {tab === 'doctor' && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>醫師治療成效比較</div>
          {doctorOutcomes.length > 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(doctorOutcomes.length, 4)}, 1fr)`, gap: 8, marginBottom: 16 }}>
                {doctorOutcomes.map(d => (
                  <div key={d.name} style={{ padding: 12, border: '2px solid var(--teal-200)', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, color: 'var(--teal-700)', marginBottom: 4 }}>{d.name}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
                      <div><div style={{ color: 'var(--gray-400)' }}>總就診</div><strong>{d.totalVisits}</strong></div>
                      <div><div style={{ color: 'var(--gray-400)' }}>病人數</div><strong>{d.patientCount}</strong></div>
                      <div><div style={{ color: 'var(--gray-400)' }}>平均就診/人</div><strong style={{ color: d.avgVisitsPerPatient <= 2 ? 'var(--green-700)' : '' }}>{d.avgVisitsPerPatient}</strong></div>
                      <div><div style={{ color: 'var(--gray-400)' }}>診斷種類</div><strong>{d.diagCount}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ width: '100%', height: 250 }}>
                <ResponsiveContainer>
                  <BarChart data={doctorOutcomes.map(d => ({ name: d.name, 總就診: d.totalVisits, 病人數: d.patientCount, 處方數: d.formulaCount }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="總就診" fill="#0e7490" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="病人數" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="處方數" fill="#DAA520" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無醫師數據</div>
          )}
        </>
      )}

      {consultations.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無診療數據</div>
      )}
    </div>
  );
}
