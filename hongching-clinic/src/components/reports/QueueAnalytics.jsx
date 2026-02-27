import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { fmtM, getMonth, monthLabel } from '../../data';

const HOUR_LABELS = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export default function QueueAnalytics({ data }) {
  const queue = data.queue || [];

  // ── Wait time analysis ──
  const waitStats = useMemo(() => {
    const withWait = queue.filter(q => q.registeredAt && q.completedAt && q.status === 'completed');
    if (!withWait.length) return null;

    const waitTimes = withWait.map(q => {
      const regParts = q.registeredAt.split(':');
      const compParts = q.completedAt.split(':');
      if (regParts.length < 2 || compParts.length < 2) return null;
      const regMin = parseInt(regParts[0]) * 60 + parseInt(regParts[1]);
      const compMin = parseInt(compParts[0]) * 60 + parseInt(compParts[1]);
      return compMin > regMin ? compMin - regMin : null;
    }).filter(Boolean);

    if (!waitTimes.length) return null;
    const avg = waitTimes.reduce((s, t) => s + t, 0) / waitTimes.length;
    const sorted = [...waitTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const max = Math.max(...waitTimes);
    const min = Math.min(...waitTimes);
    const under30 = waitTimes.filter(t => t <= 30).length;
    const under60 = waitTimes.filter(t => t <= 60).length;

    return { avg: Math.round(avg), median, max, min, total: waitTimes.length, under30Pct: ((under30 / waitTimes.length) * 100).toFixed(0), under60Pct: ((under60 / waitTimes.length) * 100).toFixed(0) };
  }, [queue]);

  // ── Hourly heatmap ──
  const hourlyData = useMemo(() => {
    const byHour = {};
    HOUR_LABELS.forEach(h => { byHour[h] = 0; });
    queue.forEach(q => {
      if (!q.registeredAt) return;
      const hour = q.registeredAt.substring(0, 2);
      if (byHour[hour] !== undefined) byHour[hour] += 1;
    });
    return HOUR_LABELS.map(h => ({ hour: `${h}:00`, 掛號數: byHour[h] }));
  }, [queue]);

  // ── Day of week distribution ──
  const dayData = useMemo(() => {
    const byDay = [0, 0, 0, 0, 0, 0, 0];
    queue.forEach(q => {
      if (!q.date) return;
      const d = new Date(q.date).getDay();
      const idx = d === 0 ? 6 : d - 1; // Mon=0, Sun=6
      byDay[idx] += 1;
    });
    return DAY_LABELS.map((label, i) => ({ day: `星期${label}`, 掛號數: byDay[i] }));
  }, [queue]);

  // ── Doctor efficiency ──
  const doctorEfficiency = useMemo(() => {
    const docs = {};
    queue.filter(q => q.doctor && q.status === 'completed').forEach(q => {
      if (!docs[q.doctor]) docs[q.doctor] = { name: q.doctor, total: 0, completed: 0, waitTimes: [] };
      docs[q.doctor].total += 1;
      docs[q.doctor].completed += 1;
      if (q.registeredAt && q.completedAt) {
        const regParts = q.registeredAt.split(':');
        const compParts = q.completedAt.split(':');
        if (regParts.length >= 2 && compParts.length >= 2) {
          const wait = (parseInt(compParts[0]) * 60 + parseInt(compParts[1])) - (parseInt(regParts[0]) * 60 + parseInt(regParts[1]));
          if (wait > 0 && wait < 300) docs[q.doctor].waitTimes.push(wait);
        }
      }
    });
    return Object.values(docs).map(d => ({
      ...d,
      avgWait: d.waitTimes.length > 0 ? Math.round(d.waitTimes.reduce((s, t) => s + t, 0) / d.waitTimes.length) : 0,
      patientsPerDay: d.total > 0 ? (d.total / new Set(queue.filter(q => q.doctor === d.name).map(q => q.date)).size).toFixed(1) : 0,
    })).sort((a, b) => b.total - a.total);
  }, [queue]);

  // ── Monthly queue volume ──
  const monthlyVolume = useMemo(() => {
    const byMonth = {};
    queue.forEach(q => {
      const m = getMonth(q.date);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { month: m, total: 0, completed: 0, noShow: 0 };
      byMonth[m].total += 1;
      if (q.status === 'completed') byMonth[m].completed += 1;
      if (q.status === 'no-show' || q.status === 'cancelled') byMonth[m].noShow += 1;
    });
    return Object.values(byMonth)
      .map(m => ({ ...m, label: monthLabel(m.month), completionRate: m.total > 0 ? ((m.completed / m.total) * 100).toFixed(0) : 0 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [queue]);

  // ── Status breakdown ──
  const statusBreakdown = useMemo(() => {
    const counts = {};
    queue.forEach(q => { counts[q.status || 'unknown'] = (counts[q.status || 'unknown'] || 0) + 1; });
    const statusLabels = { waiting: '等候中', 'in-consultation': '診症中', dispensing: '配藥中', billing: '收費中', completed: '已完成', cancelled: '已取消', 'no-show': '未到' };
    return Object.entries(counts).map(([status, count]) => ({ status, label: statusLabels[status] || status, count })).sort((a, b) => b.count - a.count);
  }, [queue]);

  const totalToday = queue.filter(q => q.date === new Date().toISOString().substring(0, 10)).length;
  const completedToday = queue.filter(q => q.date === new Date().toISOString().substring(0, 10) && q.status === 'completed').length;

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>🎫 掛號排隊分析</h3>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'var(--teal-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>總掛號數</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{queue.length}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--green-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--green-600)', fontWeight: 600 }}>今日掛號</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-700)' }}>{totalToday}</div>
          <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>已完成 {completedToday}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--gold-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>平均等候</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-700)' }}>{waitStats?.avg || '-'} 分鐘</div>
        </div>
        <div style={{ padding: 12, background: 'var(--red-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>30分鐘內完成率</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red-600)' }}>{waitStats?.under30Pct || '-'}%</div>
        </div>
      </div>

      {/* Wait Time Details */}
      {waitStats && (
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--gray-50)', borderRadius: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>等候時間分析</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, fontSize: 12, textAlign: 'center' }}>
            <div><div style={{ color: 'var(--gray-400)' }}>中位數</div><strong>{waitStats.median} 分鐘</strong></div>
            <div><div style={{ color: 'var(--gray-400)' }}>最長</div><strong>{waitStats.max} 分鐘</strong></div>
            <div><div style={{ color: 'var(--gray-400)' }}>最短</div><strong>{waitStats.min} 分鐘</strong></div>
            <div><div style={{ color: 'var(--gray-400)' }}>30分內</div><strong>{waitStats.under30Pct}%</strong></div>
            <div><div style={{ color: 'var(--gray-400)' }}>60分內</div><strong>{waitStats.under60Pct}%</strong></div>
          </div>
        </div>
      )}

      {/* Hourly Distribution */}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>每小時掛號分佈</div>
      <div style={{ width: '100%', height: 250, marginBottom: 16 }}>
        <ResponsiveContainer>
          <BarChart data={hourlyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="hour" fontSize={11} />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="掛號數" fill="#0e7490" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Day of Week */}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>星期分佈</div>
      <div style={{ width: '100%', height: 200, marginBottom: 16 }}>
        <ResponsiveContainer>
          <BarChart data={dayData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" fontSize={11} />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="掛號數" fill="#16a34a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Doctor Efficiency */}
      {doctorEfficiency.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>醫師效率</div>
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>醫師</th><th style={{ textAlign: 'right' }}>掛號數</th><th style={{ textAlign: 'right' }}>日均病人</th><th style={{ textAlign: 'right' }}>平均等候(分)</th></tr></thead>
              <tbody>
                {doctorEfficiency.map(d => (
                  <tr key={d.name}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td className="money">{d.total}</td>
                    <td className="money">{d.patientsPerDay}</td>
                    <td className="money" style={{ color: d.avgWait > 45 ? 'var(--red-600)' : d.avgWait > 30 ? 'var(--gold-700)' : 'var(--green-700)' }}>{d.avgWait || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Monthly Trend */}
      {monthlyVolume.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>月度掛號趨勢</div>
          <div style={{ width: '100%', height: 250, marginBottom: 16 }}>
            <ResponsiveContainer>
              <BarChart data={monthlyVolume}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="completed" name="完成" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="noShow" name="未到/取消" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Status Breakdown */}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>狀態分佈</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {statusBreakdown.map(s => (
          <div key={s.status} style={{ padding: '6px 12px', background: 'var(--gray-50)', borderRadius: 6, fontSize: 12 }}>
            <strong>{s.label}</strong> <span style={{ color: 'var(--gray-400)' }}>{s.count}</span>
          </div>
        ))}
      </div>

      {queue.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無掛號紀錄</div>
      )}
    </div>
  );
}
