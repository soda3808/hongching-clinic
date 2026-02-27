import { useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { getMonth, monthLabel, DOCTORS } from '../../data';

const COLORS = ['#0e7490', '#16a34a', '#7c3aed', '#d97706', '#dc2626', '#0284c7'];
const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export default function NoShowAnalytics({ data }) {
  const bookings = data.bookings || [];
  const patients = data.patients || [];

  // ── Overall stats ──
  const stats = useMemo(() => {
    const total = bookings.length;
    const noShows = bookings.filter(b => b.status === 'no-show');
    const completed = bookings.filter(b => b.status === 'completed');
    const cancelled = bookings.filter(b => b.status === 'cancelled');
    return {
      total,
      noShowCount: noShows.length,
      noShowRate: total > 0 ? ((noShows.length / total) * 100).toFixed(1) : '0',
      completedRate: total > 0 ? ((completed.length / total) * 100).toFixed(1) : '0',
      cancelRate: total > 0 ? ((cancelled.length / total) * 100).toFixed(1) : '0',
    };
  }, [bookings]);

  // ── By day of week ──
  const byDayOfWeek = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => ({ name: DAY_LABELS[i], total: 0, noShow: 0 }));
    bookings.forEach(b => {
      if (!b.date) return;
      const dow = new Date(b.date).getDay();
      days[dow].total += 1;
      if (b.status === 'no-show') days[dow].noShow += 1;
    });
    return days.map(d => ({ ...d, 缺席率: d.total > 0 ? Number(((d.noShow / d.total) * 100).toFixed(1)) : 0 }));
  }, [bookings]);

  // ── By time slot ──
  const byTimeSlot = useMemo(() => {
    const slots = {};
    bookings.forEach(b => {
      if (!b.time) return;
      const hour = b.time.substring(0, 2) + ':00';
      if (!slots[hour]) slots[hour] = { name: hour, total: 0, noShow: 0 };
      slots[hour].total += 1;
      if (b.status === 'no-show') slots[hour].noShow += 1;
    });
    return Object.values(slots)
      .map(s => ({ ...s, 缺席率: s.total > 0 ? Number(((s.noShow / s.total) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [bookings]);

  // ── By doctor ──
  const byDoctor = useMemo(() => {
    const docs = {};
    bookings.forEach(b => {
      if (!b.doctor) return;
      if (!docs[b.doctor]) docs[b.doctor] = { name: b.doctor, total: 0, noShow: 0 };
      docs[b.doctor].total += 1;
      if (b.status === 'no-show') docs[b.doctor].noShow += 1;
    });
    return Object.values(docs)
      .map(d => ({ ...d, rate: d.total > 0 ? ((d.noShow / d.total) * 100).toFixed(1) : '0' }))
      .sort((a, b) => Number(b.rate) - Number(a.rate));
  }, [bookings]);

  // ── Monthly trend ──
  const monthlyTrend = useMemo(() => {
    const byMonth = {};
    bookings.forEach(b => {
      const m = getMonth(b.date);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { month: m, total: 0, noShow: 0 };
      byMonth[m].total += 1;
      if (b.status === 'no-show') byMonth[m].noShow += 1;
    });
    return Object.values(byMonth)
      .map(m => ({ ...m, label: monthLabel(m.month), 缺席率: m.total > 0 ? Number(((m.noShow / m.total) * 100).toFixed(1)) : 0, 缺席數: m.noShow }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [bookings]);

  // ── High-risk patients ──
  const highRiskPatients = useMemo(() => {
    const byPatient = {};
    bookings.forEach(b => {
      const key = b.patientName || b.patientPhone;
      if (!key) return;
      if (!byPatient[key]) byPatient[key] = { name: key, phone: b.patientPhone, total: 0, noShow: 0 };
      byPatient[key].total += 1;
      if (b.status === 'no-show') byPatient[key].noShow += 1;
    });
    return Object.values(byPatient)
      .filter(p => p.noShow >= 2)
      .map(p => ({
        ...p,
        rate: p.total > 0 ? ((p.noShow / p.total) * 100).toFixed(0) : '0',
        riskScore: p.noShow >= 5 ? '極高' : p.noShow >= 3 ? '高' : '中',
        riskColor: p.noShow >= 5 ? '#dc2626' : p.noShow >= 3 ? '#d97706' : '#0e7490',
      }))
      .sort((a, b) => b.noShow - a.noShow)
      .slice(0, 20);
  }, [bookings]);

  if (bookings.length === 0) {
    return (
      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>📊 預約缺席分析</h3>
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無預約數據</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>📊 預約缺席分析</h3>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'var(--teal-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>總預約</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal-700)' }}>{stats.total}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--red-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>缺席次數</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red-600)' }}>{stats.noShowCount}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--gold-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>缺席率</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: Number(stats.noShowRate) > 10 ? '#dc2626' : Number(stats.noShowRate) > 5 ? '#d97706' : '#16a34a' }}>{stats.noShowRate}%</div>
        </div>
        <div style={{ padding: 12, background: 'var(--green-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--green-600)', fontWeight: 600 }}>完成率</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-700)' }}>{stats.completedRate}%</div>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>按星期缺席率</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={byDayOfWeek}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} unit="%" />
                <Tooltip formatter={v => `${v}%`} />
                <Bar dataKey="缺席率" radius={[4, 4, 0, 0]}>
                  {byDayOfWeek.map((d, i) => <Cell key={i} fill={d.缺席率 > 15 ? '#dc2626' : d.缺席率 > 8 ? '#d97706' : '#0e7490'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        {byTimeSlot.length > 0 && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>按時段缺席率</div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={byTimeSlot}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={10} />
                  <YAxis fontSize={11} unit="%" />
                  <Tooltip formatter={v => `${v}%`} />
                  <Bar dataKey="缺席率" radius={[4, 4, 0, 0]}>
                    {byTimeSlot.map((d, i) => <Cell key={i} fill={d.缺席率 > 15 ? '#dc2626' : d.缺席率 > 8 ? '#d97706' : '#0e7490'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Monthly trend */}
      {monthlyTrend.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>月度缺席趨勢</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={11} unit="%" />
                <Tooltip formatter={(v, name) => name === '缺席率' ? `${v}%` : v} />
                <Legend fontSize={10} />
                <Line type="monotone" dataKey="缺席率" stroke="#dc2626" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* By doctor table */}
      {byDoctor.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>醫師缺席率</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>醫師</th><th style={{ textAlign: 'right' }}>預約數</th><th style={{ textAlign: 'right' }}>缺席數</th><th style={{ textAlign: 'right' }}>缺席率</th></tr></thead>
                <tbody>
                  {byDoctor.map(d => (
                    <tr key={d.name}>
                      <td style={{ fontWeight: 600 }}>{d.name}</td>
                      <td className="money">{d.total}</td>
                      <td className="money" style={{ color: '#dc2626' }}>{d.noShow}</td>
                      <td className="money" style={{ fontWeight: 700, color: Number(d.rate) > 10 ? '#dc2626' : Number(d.rate) > 5 ? '#d97706' : '#16a34a' }}>{d.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* High risk patients */}
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#dc2626' }}>高風險病人 (缺席≥2次)</div>
            {highRiskPatients.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--green-600)', fontSize: 13 }}>沒有高風險病人</div>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>病人</th><th style={{ textAlign: 'right' }}>缺席</th><th style={{ textAlign: 'right' }}>總預約</th><th>風險</th></tr></thead>
                  <tbody>
                    {highRiskPatients.map(p => (
                      <tr key={p.name}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td className="money" style={{ color: '#dc2626', fontWeight: 700 }}>{p.noShow}</td>
                        <td className="money">{p.total}</td>
                        <td><span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: p.riskColor + '18', color: p.riskColor, fontWeight: 700 }}>{p.riskScore}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
