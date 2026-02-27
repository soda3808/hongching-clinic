import { useMemo, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fmtM, getMonth, monthLabel } from '../../data';

export default function StaffPerformance({ data }) {
  const revenue = data.revenue || [];
  const consultations = data.consultations || [];
  const bookings = data.bookings || [];
  const queue = data.queue || [];
  const leaves = data.leaves || [];
  const surveys = data.surveys || [];
  const [tab, setTab] = useState('overview');

  // ── Doctor performance metrics ──
  const doctorMetrics = useMemo(() => {
    const docs = {};

    // Revenue per doctor
    revenue.forEach(r => {
      if (!r.doctor) return;
      if (!docs[r.doctor]) docs[r.doctor] = { name: r.doctor, revenue: 0, revenueCount: 0, patients: new Set(), consultCount: 0, avgConsultTime: 0, waitTimes: [], surveyScores: [], leaveDays: 0, months: new Set(), noShows: 0 };
      docs[r.doctor].revenue += Number(r.amount) || 0;
      docs[r.doctor].revenueCount += 1;
      if (r.date) docs[r.doctor].months.add(getMonth(r.date));
    });

    // Consultation metrics
    consultations.forEach(c => {
      if (!c.doctor) return;
      if (!docs[c.doctor]) docs[c.doctor] = { name: c.doctor, revenue: 0, revenueCount: 0, patients: new Set(), consultCount: 0, avgConsultTime: 0, waitTimes: [], surveyScores: [], leaveDays: 0, months: new Set(), noShows: 0 };
      docs[c.doctor].consultCount += 1;
      docs[c.doctor].patients.add(c.patientId || c.patientName);
      if (c.date) docs[c.doctor].months.add(getMonth(c.date));
    });

    // Queue wait times per doctor
    queue.filter(q => q.doctor && q.status === 'completed' && q.registeredAt && q.completedAt).forEach(q => {
      if (!docs[q.doctor]) return;
      const regParts = q.registeredAt.split(':');
      const compParts = q.completedAt.split(':');
      if (regParts.length >= 2 && compParts.length >= 2) {
        const wait = (parseInt(compParts[0]) * 60 + parseInt(compParts[1])) - (parseInt(regParts[0]) * 60 + parseInt(regParts[1]));
        if (wait > 0 && wait < 300) docs[q.doctor].waitTimes.push(wait);
      }
    });

    // No-shows per doctor
    bookings.filter(b => b.status === 'no-show').forEach(b => {
      if (b.doctor && docs[b.doctor]) docs[b.doctor].noShows += 1;
    });

    // Leave days per doctor
    leaves.forEach(l => {
      if (!l.employee || !docs[l.employee]) return;
      docs[l.employee].leaveDays += Number(l.days) || 1;
    });

    // Survey scores
    surveys.forEach(s => {
      if (s.doctor && docs[s.doctor] && s.rating) {
        docs[s.doctor].surveyScores.push(Number(s.rating));
      }
    });

    return Object.values(docs).map(d => {
      const monthCount = Math.max(1, d.months.size);
      const avgWait = d.waitTimes.length > 0 ? Math.round(d.waitTimes.reduce((s, t) => s + t, 0) / d.waitTimes.length) : 0;
      const avgSurvey = d.surveyScores.length > 0 ? (d.surveyScores.reduce((s, r) => s + r, 0) / d.surveyScores.length).toFixed(1) : '-';
      const workDays = monthCount * 22; // approximate
      return {
        ...d,
        patientCount: d.patients.size,
        monthCount,
        monthlyRevenue: d.revenue / monthCount,
        dailyPatients: (d.consultCount / Math.max(workDays - d.leaveDays, 1)).toFixed(1),
        avgWait,
        avgSurvey,
        avgRevenuePerPatient: d.revenueCount > 0 ? d.revenue / d.revenueCount : 0,
        noShowRate: (d.consultCount + d.noShows) > 0 ? ((d.noShows / (d.consultCount + d.noShows)) * 100).toFixed(1) : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [revenue, consultations, queue, bookings, leaves, surveys]);

  // ── Monthly trend per doctor ──
  const monthlyByDoctor = useMemo(() => {
    const months = new Set();
    revenue.forEach(r => { const m = getMonth(r.date); if (m) months.add(m); });
    const sorted = [...months].sort().slice(-12);

    return sorted.map(m => {
      const row = { month: m, label: monthLabel(m) };
      doctorMetrics.forEach(d => {
        row[d.name] = revenue.filter(r => r.doctor === d.name && getMonth(r.date) === m).reduce((s, r) => s + Number(r.amount), 0);
      });
      return row;
    });
  }, [revenue, doctorMetrics]);

  // ── Ranking data for chart ──
  const rankingData = doctorMetrics.map(d => ({
    name: d.name,
    月均營業額: Math.round(d.monthlyRevenue),
    總營業額: d.revenue,
    病人數: d.patientCount,
  }));

  const totalRevenue = doctorMetrics.reduce((s, d) => s + d.revenue, 0);
  const bestDoctor = doctorMetrics[0]?.name || '-';
  const totalConsults = doctorMetrics.reduce((s, d) => s + d.consultCount, 0);

  const tabs = [
    { id: 'overview', label: '總覽' },
    { id: 'ranking', label: '排名' },
    { id: 'trend', label: '月度趨勢' },
    { id: 'efficiency', label: '效率分析' },
  ];

  const DOC_COLORS = ['#0e7490', '#DAA520', '#dc2626', '#16a34a', '#7C3AED', '#d97706'];

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>👥 員工績效儀表板</h3>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'var(--teal-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>醫師數</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{doctorMetrics.length}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--gold-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>總營業額</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-700)' }}>{fmtM(totalRevenue)}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--green-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--green-600)', fontWeight: 600 }}>總診症次數</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-700)' }}>{totalConsults}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--red-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>最高營業</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--red-600)' }}>{bestDoctor}</div>
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
          {/* Doctor Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(doctorMetrics.length, 3)}, 1fr)`, gap: 12, marginBottom: 16 }}>
            {doctorMetrics.map((d, i) => (
              <div key={d.name} style={{ padding: 16, border: `2px solid ${DOC_COLORS[i % DOC_COLORS.length]}20`, borderLeft: `4px solid ${DOC_COLORS[i % DOC_COLORS.length]}`, borderRadius: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: DOC_COLORS[i % DOC_COLORS.length], marginBottom: 8 }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''} {d.name}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                  <div>
                    <div style={{ color: 'var(--gray-400)', fontSize: 10 }}>總營業額</div>
                    <div style={{ fontWeight: 700, color: 'var(--gold-700)' }}>{fmtM(d.revenue)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--gray-400)', fontSize: 10 }}>月均營業</div>
                    <div style={{ fontWeight: 700 }}>{fmtM(d.monthlyRevenue)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--gray-400)', fontSize: 10 }}>病人數</div>
                    <div style={{ fontWeight: 700 }}>{d.patientCount}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--gray-400)', fontSize: 10 }}>診症次數</div>
                    <div style={{ fontWeight: 700 }}>{d.consultCount}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--gray-400)', fontSize: 10 }}>平均等候</div>
                    <div style={{ fontWeight: 700, color: d.avgWait > 45 ? 'var(--red-600)' : 'var(--green-700)' }}>{d.avgWait || '-'} 分鐘</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--gray-400)', fontSize: 10 }}>滿意度</div>
                    <div style={{ fontWeight: 700, color: 'var(--teal-700)' }}>{d.avgSurvey}</div>
                  </div>
                </div>
                {/* Revenue share bar */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--gray-100)', overflow: 'hidden' }}>
                    <div style={{ width: `${totalRevenue > 0 ? (d.revenue / totalRevenue * 100) : 0}%`, height: '100%', background: DOC_COLORS[i % DOC_COLORS.length], borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 2 }}>佔總營業 {totalRevenue > 0 ? (d.revenue / totalRevenue * 100).toFixed(0) : 0}%</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'ranking' && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>醫師營業額排名</div>
          <div style={{ width: '100%', height: 300, marginBottom: 16 }}>
            <ResponsiveContainer>
              <BarChart data={rankingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={v => fmtM(v)} />
                <Legend />
                <Bar dataKey="總營業額" fill="#DAA520" radius={[4, 4, 0, 0]} />
                <Bar dataKey="月均營業額" fill="#0e7490" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detailed ranking table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>排名</th><th>醫師</th><th style={{ textAlign: 'right' }}>總營業額</th><th style={{ textAlign: 'right' }}>月均營業</th>
                  <th style={{ textAlign: 'right' }}>病人數</th><th style={{ textAlign: 'right' }}>診症次數</th><th style={{ textAlign: 'right' }}>人均消費</th><th style={{ textAlign: 'right' }}>佔比</th>
                </tr>
              </thead>
              <tbody>
                {doctorMetrics.map((d, i) => (
                  <tr key={d.name} style={{ background: i === 0 ? '#fefce8' : '' }}>
                    <td style={{ fontWeight: 700, color: DOC_COLORS[i % DOC_COLORS.length] }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
                    <td style={{ fontWeight: 700 }}>{d.name}</td>
                    <td className="money" style={{ fontWeight: 700, color: 'var(--gold-700)' }}>{fmtM(d.revenue)}</td>
                    <td className="money">{fmtM(d.monthlyRevenue)}</td>
                    <td className="money">{d.patientCount}</td>
                    <td className="money">{d.consultCount}</td>
                    <td className="money">{fmtM(d.avgRevenuePerPatient)}</td>
                    <td className="money">{totalRevenue > 0 ? (d.revenue / totalRevenue * 100).toFixed(0) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'trend' && monthlyByDoctor.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>月度營業額趨勢（按醫師）</div>
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer>
              <LineChart data={monthlyByDoctor}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={v => fmtM(v)} />
                <Legend />
                {doctorMetrics.map((d, i) => (
                  <Line key={d.name} type="monotone" dataKey={d.name} stroke={DOC_COLORS[i % DOC_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {tab === 'efficiency' && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>效率與服務質素</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>醫師</th><th style={{ textAlign: 'right' }}>日均病人</th><th style={{ textAlign: 'right' }}>平均等候(分)</th>
                  <th style={{ textAlign: 'right' }}>No-show率</th><th style={{ textAlign: 'right' }}>請假天數</th><th style={{ textAlign: 'right' }}>滿意度</th>
                </tr>
              </thead>
              <tbody>
                {doctorMetrics.map(d => (
                  <tr key={d.name}>
                    <td style={{ fontWeight: 700 }}>{d.name}</td>
                    <td className="money">{d.dailyPatients}</td>
                    <td className="money" style={{ color: d.avgWait > 45 ? 'var(--red-600)' : d.avgWait > 30 ? 'var(--gold-700)' : 'var(--green-700)' }}>{d.avgWait || '-'}</td>
                    <td className="money" style={{ color: d.noShowRate > 10 ? 'var(--red-600)' : '' }}>{d.noShowRate}%</td>
                    <td className="money">{d.leaveDays}</td>
                    <td className="money" style={{ fontWeight: 700, color: 'var(--teal-700)' }}>{d.avgSurvey}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Efficiency comparison chart */}
          <div style={{ width: '100%', height: 250, marginTop: 16 }}>
            <ResponsiveContainer>
              <BarChart data={doctorMetrics.map(d => ({ name: d.name, 日均病人: Number(d.dailyPatients), 平均等候: d.avgWait }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Bar dataKey="日均病人" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="平均等候" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {doctorMetrics.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無員工數據</div>
      )}
    </div>
  );
}
