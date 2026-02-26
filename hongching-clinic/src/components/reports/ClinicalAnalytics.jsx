import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#0e7490', '#16a34a', '#DAA520', '#dc2626', '#7C3AED', '#0284c7', '#059669', '#d97706', '#9333ea', '#e11d48'];

export default function ClinicalAnalytics({ data }) {
  const consultations = data.consultations || [];

  // ── Top Herbs ──
  const herbStats = useMemo(() => {
    const counts = {};
    consultations.forEach(c => {
      (c.prescription || []).forEach(p => {
        if (p.herb) counts[p.herb] = (counts[p.herb] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20)
      .map(([name, count], i) => ({ rank: i + 1, name, count }));
  }, [consultations]);

  // ── Top Formulas ──
  const formulaStats = useMemo(() => {
    const counts = {};
    consultations.forEach(c => {
      if (c.formulaName) counts[c.formulaName] = (counts[c.formulaName] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([name, count], i) => ({ rank: i + 1, name, count }));
  }, [consultations]);

  // ── Diagnosis Patterns ──
  const diagnosisStats = useMemo(() => {
    const counts = {};
    consultations.forEach(c => {
      const diag = c.tcmDiagnosis || c.assessment;
      if (diag) counts[diag] = (counts[diag] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([name, count]) => ({ name, count }));
  }, [consultations]);

  // ── Treatment Distribution ──
  const treatmentDist = useMemo(() => {
    const counts = {};
    consultations.forEach(c => {
      (c.treatments || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [consultations]);

  // ── Prescription Type ──
  const rxTypeDist = useMemo(() => {
    let decoction = 0, granule = 0, none = 0;
    consultations.forEach(c => {
      if (c.prescriptionType === 'granule') granule++;
      else if ((c.prescription || []).length > 0) decoction++;
      else none++;
    });
    return [
      { name: '飲片（煎藥）', value: decoction },
      { name: '顆粒（濃縮）', value: granule },
      { name: '無處方', value: none },
    ].filter(d => d.value > 0);
  }, [consultations]);

  // ── Monthly Trend ──
  const monthlyTrend = useMemo(() => {
    const map = {};
    consultations.forEach(c => {
      const m = (c.date || '').substring(0, 7);
      if (!map[m]) map[m] = { month: m, count: 0, herbCount: 0 };
      map[m].count++;
      map[m].herbCount += (c.prescription || []).filter(p => p.herb).length;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  }, [consultations]);

  // ── Summary Stats ──
  const totalConsults = consultations.length;
  const totalHerbUses = consultations.reduce((s, c) => s + (c.prescription || []).filter(p => p.herb).length, 0);
  const avgHerbsPerRx = totalConsults > 0 ? (totalHerbUses / consultations.filter(c => (c.prescription || []).length > 0).length || 0).toFixed(1) : '0';
  const uniqueHerbs = new Set(consultations.flatMap(c => (c.prescription || []).map(p => p.herb).filter(Boolean))).size;

  if (totalConsults === 0) {
    return <div className="card" style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無診症數據</div>;
  }

  return (
    <>
      {/* Summary */}
      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card teal"><div className="stat-label">總診次</div><div className="stat-value teal">{totalConsults}</div></div>
        <div className="stat-card green"><div className="stat-label">藥材使用</div><div className="stat-value green">{uniqueHerbs} 種</div></div>
        <div className="stat-card gold"><div className="stat-label">平均處方藥味</div><div className="stat-value gold">{avgHerbsPerRx}</div></div>
        <div className="stat-card red"><div className="stat-label">常用方劑</div><div className="stat-value red">{formulaStats.length}</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Top Herbs Chart */}
        <div className="card">
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>常用藥材 Top 10</h4>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={herbStats.slice(0, 10)} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis dataKey="name" type="category" fontSize={11} width={70} />
                <Tooltip />
                <Bar dataKey="count" fill="#0e7490" radius={[0, 4, 4, 0]} name="使用次數" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Formulas Chart */}
        <div className="card">
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>常用方劑 Top 10</h4>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={formulaStats.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis dataKey="name" type="category" fontSize={11} width={80} />
                <Tooltip />
                <Bar dataKey="count" fill="#16a34a" radius={[0, 4, 4, 0]} name="使用次數" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Treatment Distribution */}
        <div className="card">
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>治療方式分佈</h4>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={treatmentDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`}>
                  {treatmentDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Prescription Type */}
        <div className="card">
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>處方類型分佈</h4>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={rxTypeDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`}>
                  {rxTypeDist.map((_, i) => <Cell key={i} fill={['#0e7490', '#7C3AED', '#ccc'][i]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Diagnosis Patterns Table */}
      <div className="card">
        <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>常見診斷/證型</h4>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>診斷/證型</th><th style={{ textAlign: 'right' }}>次數</th><th style={{ width: 200 }}>佔比</th></tr></thead>
            <tbody>
              {diagnosisStats.map((d, i) => (
                <tr key={d.name}>
                  <td style={{ fontWeight: 700, color: '#999' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{d.name}</td>
                  <td style={{ textAlign: 'right' }}>{d.count}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 8, background: '#f0f0f0', borderRadius: 4 }}>
                        <div style={{ width: `${(d.count / totalConsults) * 100}%`, height: '100%', background: '#0e7490', borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#999', minWidth: 36 }}>{((d.count / totalConsults) * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {diagnosisStats.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#aaa' }}>暫無診斷記錄</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Trend */}
      {monthlyTrend.length > 1 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>月度趨勢</h4>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#0e7490" name="診次" radius={[4, 4, 0, 0]} />
                <Bar dataKey="herbCount" fill="#16a34a" name="藥味使用" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}
