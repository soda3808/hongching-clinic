import { useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getMonth, monthLabel } from '../../data';

export default function SatisfactionReport({ data }) {
  const surveys = data.surveys || [];
  const patients = data.patients || [];

  // ── Overall metrics ──
  const metrics = useMemo(() => {
    if (!surveys.length) return null;
    const ratings = surveys.map(s => Number(s.rating)).filter(r => r > 0);
    const avg = ratings.length > 0 ? (ratings.reduce((s, r) => s + r, 0) / ratings.length) : 0;

    // NPS calculation: rating >= 9 = promoter, 7-8 = passive, <= 6 = detractor (on 1-10 scale)
    // For 1-5 scale: 5 = promoter, 4 = passive, 1-3 = detractor
    const maxRating = Math.max(...ratings, 5);
    const isScale5 = maxRating <= 5;
    const promoters = isScale5 ? ratings.filter(r => r >= 5).length : ratings.filter(r => r >= 9).length;
    const detractors = isScale5 ? ratings.filter(r => r <= 3).length : ratings.filter(r => r <= 6).length;
    const nps = ratings.length > 0 ? Math.round(((promoters - detractors) / ratings.length) * 100) : 0;

    return { avg: avg.toFixed(1), count: surveys.length, nps, promoters, detractors, passives: ratings.length - promoters - detractors, maxRating: isScale5 ? 5 : 10, responseRate: patients.length > 0 ? ((surveys.length / patients.length) * 100).toFixed(0) : 0 };
  }, [surveys, patients]);

  // ── By doctor ──
  const byDoctor = useMemo(() => {
    const docs = {};
    surveys.forEach(s => {
      if (!s.doctor) return;
      if (!docs[s.doctor]) docs[s.doctor] = { name: s.doctor, ratings: [], comments: [] };
      if (s.rating) docs[s.doctor].ratings.push(Number(s.rating));
      if (s.comment || s.feedback) docs[s.doctor].comments.push(s.comment || s.feedback);
    });
    return Object.values(docs).map(d => ({
      ...d,
      avg: d.ratings.length > 0 ? (d.ratings.reduce((s, r) => s + r, 0) / d.ratings.length).toFixed(1) : '-',
      count: d.ratings.length,
    })).sort((a, b) => Number(b.avg) - Number(a.avg));
  }, [surveys]);

  // ── Monthly trend ──
  const monthlyTrend = useMemo(() => {
    const byMonth = {};
    surveys.forEach(s => {
      const m = getMonth(s.date || s.createdAt);
      if (!m || !s.rating) return;
      if (!byMonth[m]) byMonth[m] = { month: m, ratings: [], count: 0 };
      byMonth[m].ratings.push(Number(s.rating));
      byMonth[m].count += 1;
    });
    return Object.values(byMonth)
      .map(m => ({
        ...m, label: monthLabel(m.month),
        平均評分: Number((m.ratings.reduce((s, r) => s + r, 0) / m.ratings.length).toFixed(1)),
        回覆數: m.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [surveys]);

  // ── Rating distribution ──
  const ratingDist = useMemo(() => {
    const max = metrics?.maxRating || 5;
    const buckets = {};
    for (let i = 1; i <= max; i++) buckets[i] = 0;
    surveys.forEach(s => {
      if (s.rating && buckets[Number(s.rating)] !== undefined) buckets[Number(s.rating)] += 1;
    });
    return Object.entries(buckets).map(([rating, count]) => ({ name: `${rating}分`, 人數: count }));
  }, [surveys, metrics]);

  // ── Category ratings (if available) ──
  const categoryData = useMemo(() => {
    const cats = {};
    surveys.forEach(s => {
      if (s.waitTimeRating) { cats['等候時間'] = cats['等候時間'] || []; cats['等候時間'].push(Number(s.waitTimeRating)); }
      if (s.doctorRating) { cats['醫師態度'] = cats['醫師態度'] || []; cats['醫師態度'].push(Number(s.doctorRating)); }
      if (s.staffRating) { cats['員工服務'] = cats['員工服務'] || []; cats['員工服務'].push(Number(s.staffRating)); }
      if (s.environmentRating) { cats['環境衛生'] = cats['環境衛生'] || []; cats['環境衛生'].push(Number(s.environmentRating)); }
      if (s.overallRating) { cats['整體滿意度'] = cats['整體滿意度'] || []; cats['整體滿意度'].push(Number(s.overallRating)); }
    });
    return Object.entries(cats).map(([name, ratings]) => ({
      name, avg: (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1), count: ratings.length,
    }));
  }, [surveys]);

  // ── Recent comments ──
  const recentComments = useMemo(() => {
    return surveys
      .filter(s => s.comment || s.feedback)
      .sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''))
      .slice(0, 15);
  }, [surveys]);

  if (!metrics) {
    return (
      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>😊 病人滿意度分析</h3>
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無問卷數據</div>
      </div>
    );
  }

  const getNPSColor = (nps) => nps >= 50 ? '#16a34a' : nps >= 0 ? '#d97706' : '#dc2626';

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>😊 病人滿意度分析</h3>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'var(--teal-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>平均評分</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal-700)' }}>{metrics.avg}<span style={{ fontSize: 12 }}>/{metrics.maxRating}</span></div>
        </div>
        <div style={{ padding: 12, background: 'var(--green-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--green-600)', fontWeight: 600 }}>NPS 淨推薦值</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: getNPSColor(metrics.nps) }}>{metrics.nps}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--gold-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>回覆數</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--gold-700)' }}>{metrics.count}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--red-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>回覆率</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red-600)' }}>{metrics.responseRate}%</div>
        </div>
      </div>

      {/* NPS Breakdown */}
      <div style={{ marginBottom: 16, padding: 12, background: 'var(--gray-50)', borderRadius: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>NPS 分佈</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#16a34a', fontWeight: 600 }}>推薦者</span>
              <span style={{ fontWeight: 700 }}>{metrics.promoters}</span>
            </div>
            <div style={{ height: 8, background: 'var(--gray-200)', borderRadius: 4 }}>
              <div style={{ width: `${metrics.count > 0 ? (metrics.promoters / metrics.count * 100) : 0}%`, height: '100%', background: '#16a34a', borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#d97706', fontWeight: 600 }}>中立者</span>
              <span style={{ fontWeight: 700 }}>{metrics.passives}</span>
            </div>
            <div style={{ height: 8, background: 'var(--gray-200)', borderRadius: 4 }}>
              <div style={{ width: `${metrics.count > 0 ? (metrics.passives / metrics.count * 100) : 0}%`, height: '100%', background: '#d97706', borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#dc2626', fontWeight: 600 }}>貶損者</span>
              <span style={{ fontWeight: 700 }}>{metrics.detractors}</span>
            </div>
            <div style={{ height: 8, background: 'var(--gray-200)', borderRadius: 4 }}>
              <div style={{ width: `${metrics.count > 0 ? (metrics.detractors / metrics.count * 100) : 0}%`, height: '100%', background: '#dc2626', borderRadius: 4 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>評分分佈</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={ratingDist}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="人數" fill="#0e7490" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        {monthlyTrend.length > 0 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>月度趨勢</div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={10} />
                  <YAxis fontSize={11} domain={[0, metrics.maxRating]} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="平均評分" stroke="#0e7490" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Category ratings */}
      {categoryData.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>分項評分</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(categoryData.length, 5)}, 1fr)`, gap: 8, marginBottom: 16 }}>
            {categoryData.map(c => (
              <div key={c.name} style={{ padding: 10, border: '1px solid var(--gray-200)', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 2 }}>{c.name}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: Number(c.avg) >= 4 ? 'var(--green-700)' : Number(c.avg) >= 3 ? 'var(--gold-700)' : 'var(--red-600)' }}>{c.avg}</div>
                <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{c.count} 份</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* By doctor */}
      {byDoctor.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>醫師評分比較</div>
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>醫師</th><th style={{ textAlign: 'right' }}>平均評分</th><th style={{ textAlign: 'right' }}>回覆數</th></tr></thead>
              <tbody>
                {byDoctor.map(d => (
                  <tr key={d.name}>
                    <td style={{ fontWeight: 700 }}>{d.name}</td>
                    <td className="money" style={{ color: Number(d.avg) >= 4 ? 'var(--green-700)' : Number(d.avg) >= 3 ? 'var(--gold-700)' : 'var(--red-600)', fontWeight: 700 }}>{d.avg}</td>
                    <td className="money">{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Recent comments */}
      {recentComments.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>最新評語</div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {recentComments.map((s, i) => (
              <div key={s.id || i} style={{ padding: '8px 12px', borderBottom: '1px solid var(--gray-100)', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>
                    <strong>{s.patientName || '匿名'}</strong>
                    {s.doctor && <span style={{ color: 'var(--gray-400)', marginLeft: 8 }}>({s.doctor})</span>}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                    {'⭐'.repeat(Math.min(Number(s.rating) || 0, 5))} {s.date || (s.createdAt || '').substring(0, 10)}
                  </span>
                </div>
                <div style={{ color: 'var(--gray-600)', lineHeight: 1.5 }}>{s.comment || s.feedback}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
