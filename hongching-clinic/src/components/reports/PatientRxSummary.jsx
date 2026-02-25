import { useMemo, useState } from 'react';

export default function PatientRxSummary({ data }) {
  const consultations = data.consultations || [];
  const patients = data.patients || [];
  const [selectedPatient, setSelectedPatient] = useState('');

  const patientsWithRx = useMemo(() => {
    const ids = new Set();
    consultations.forEach(c => { if (c.prescription?.length > 0 && c.patientId) ids.add(c.patientId); });
    return patients.filter(p => ids.has(p.id));
  }, [consultations, patients]);

  const patientRx = useMemo(() => {
    if (!selectedPatient) return [];
    return consultations
      .filter(c => c.patientId === selectedPatient && c.prescription?.length > 0)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map(c => ({
        date: c.date,
        doctor: c.doctor,
        formula: c.formulaName || '-',
        herbs: (c.prescription || []).map(p => `${p.herb} ${p.dosage || ''}`).join('、'),
        diagnosis: c.tcmDiagnosis || c.assessment || '-',
      }));
  }, [consultations, selectedPatient]);

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>📜 顧客處方報表</h3>
      <div style={{ marginBottom: 16 }}>
        <label>選擇病人</label>
        <select value={selectedPatient} onChange={e => setSelectedPatient(e.target.value)} style={{ maxWidth: 300 }}>
          <option value="">-- 請選擇 --</option>
          {patientsWithRx.map(p => <option key={p.id} value={p.id}>{p.name} — {p.phone}</option>)}
        </select>
      </div>
      {selectedPatient && patientRx.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>此病人暫無處方記錄</div>
      )}
      {patientRx.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>日期</th><th>醫師</th><th>診斷</th><th>方劑</th><th>藥材</th></tr></thead>
            <tbody>
              {patientRx.map((rx, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{rx.date}</td>
                  <td>{rx.doctor}</td>
                  <td style={{ fontSize: 11 }}>{rx.diagnosis}</td>
                  <td style={{ fontWeight: 600, color: 'var(--teal-700)' }}>{rx.formula}</td>
                  <td style={{ fontSize: 11, maxWidth: 300 }}>{rx.herbs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!selectedPatient && (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>請選擇病人以查看處方記錄</div>
      )}
    </div>
  );
}
