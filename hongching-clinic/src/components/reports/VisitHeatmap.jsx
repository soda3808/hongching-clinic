import { useMemo } from 'react';

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const HOUR_LABELS = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];

function getHeatColor(val, max) {
  if (!val || max === 0) return '#f9fafb';
  const ratio = val / max;
  if (ratio > 0.8) return '#0e7490';
  if (ratio > 0.6) return '#14b8a6';
  if (ratio > 0.4) return '#5eead4';
  if (ratio > 0.2) return '#99f6e4';
  return '#ccfbf1';
}

export default function VisitHeatmap({ data }) {
  const bookings = data.bookings || [];
  const consultations = data.consultations || [];

  // Build heatmap: day of week x hour
  const heatmap = useMemo(() => {
    const grid = {};
    let maxVal = 0;
    // From bookings
    bookings.filter(b => b.status !== 'cancelled').forEach(b => {
      if (!b.date || !b.time) return;
      const dow = new Date(b.date).getDay();
      const adjDow = dow === 0 ? 6 : dow - 1; // Mon=0, Sun=6
      const hour = b.time.substring(0, 2);
      const key = `${adjDow}_${hour}`;
      grid[key] = (grid[key] || 0) + 1;
      if (grid[key] > maxVal) maxVal = grid[key];
    });
    // From consultations (as backup)
    consultations.forEach(c => {
      if (!c.date) return;
      const dow = new Date(c.date).getDay();
      const adjDow = dow === 0 ? 6 : dow - 1;
      // Most consultations don't have time, use bookings primarily
      if (c.time) {
        const hour = c.time.substring(0, 2);
        const key = `${adjDow}_${hour}`;
        grid[key] = (grid[key] || 0) + 1;
        if (grid[key] > maxVal) maxVal = grid[key];
      }
    });
    return { grid, maxVal };
  }, [bookings, consultations]);

  // Busiest day and hour
  const busyStats = useMemo(() => {
    const dayTotals = Array(7).fill(0);
    const hourTotals = {};
    Object.entries(heatmap.grid).forEach(([key, val]) => {
      const [d, h] = key.split('_');
      dayTotals[Number(d)] += val;
      hourTotals[h] = (hourTotals[h] || 0) + val;
    });
    const busiestDay = dayTotals.indexOf(Math.max(...dayTotals));
    const busiestHour = Object.entries(hourTotals).sort((a, b) => b[1] - a[1])[0];
    const quietestDay = dayTotals.indexOf(Math.min(...dayTotals.filter(v => v > 0)));
    return {
      busiestDay: DAY_LABELS[busiestDay] || '-',
      busiestHour: busiestHour ? `${busiestHour[0]}:00` : '-',
      quietestDay: DAY_LABELS[quietestDay] || '-',
      totalVisits: Object.values(heatmap.grid).reduce((s, v) => s + v, 0),
      dayTotals,
      hourTotals,
    };
  }, [heatmap]);

  if (busyStats.totalVisits === 0) {
    return (
      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>🗓️ 就診熱度圖</h3>
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無預約/就診時間數據</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>🗓️ 就診熱度圖</h3>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 10, background: 'var(--teal-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>總就診次數</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{busyStats.totalVisits}</div>
        </div>
        <div style={{ padding: 10, background: 'var(--red-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>最繁忙日</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red-600)' }}>星期{busyStats.busiestDay}</div>
        </div>
        <div style={{ padding: 10, background: 'var(--gold-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>最繁忙時段</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-700)' }}>{busyStats.busiestHour}</div>
        </div>
        <div style={{ padding: 10, background: 'var(--green-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--green-600)', fontWeight: 600 }}>最空閒日</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-700)' }}>星期{busyStats.quietestDay}</div>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>時段熱度分佈</div>
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 8px', fontSize: 11, textAlign: 'left', color: 'var(--gray-500)' }}>時間</th>
              {DAY_LABELS.map(d => (
                <th key={d} style={{ padding: '6px 8px', fontSize: 11, textAlign: 'center', color: 'var(--gray-500)' }}>星期{d}</th>
              ))}
              <th style={{ padding: '6px 8px', fontSize: 11, textAlign: 'right', color: 'var(--gray-500)' }}>合計</th>
            </tr>
          </thead>
          <tbody>
            {HOUR_LABELS.map(h => {
              const rowTotal = DAY_LABELS.map((_, di) => heatmap.grid[`${di}_${h}`] || 0).reduce((s, v) => s + v, 0);
              return (
                <tr key={h}>
                  <td style={{ padding: '4px 8px', fontSize: 11, fontWeight: 600 }}>{h}:00</td>
                  {DAY_LABELS.map((_, di) => {
                    const val = heatmap.grid[`${di}_${h}`] || 0;
                    return (
                      <td key={di} style={{
                        padding: '4px 8px', textAlign: 'center', fontSize: 11,
                        background: getHeatColor(val, heatmap.maxVal),
                        color: val > heatmap.maxVal * 0.5 ? '#fff' : '#333',
                        fontWeight: val > 0 ? 700 : 400, borderRadius: 2,
                      }}>
                        {val || ''}
                      </td>
                    );
                  })}
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--teal-700)' }}>{rowTotal || ''}</td>
                </tr>
              );
            })}
            {/* Column totals */}
            <tr style={{ borderTop: '2px solid var(--gray-300)' }}>
              <td style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700 }}>合計</td>
              {DAY_LABELS.map((_, di) => (
                <td key={di} style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--teal-700)' }}>
                  {busyStats.dayTotals[di] || ''}
                </td>
              ))}
              <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, fontWeight: 800, color: 'var(--teal-700)' }}>{busyStats.totalVisits}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 10, color: 'var(--gray-500)' }}>
        <span>低</span>
        {['#f9fafb', '#ccfbf1', '#99f6e4', '#5eead4', '#14b8a6', '#0e7490'].map(c => (
          <div key={c} style={{ width: 20, height: 12, background: c, borderRadius: 2, border: '1px solid #ddd' }} />
        ))}
        <span>高</span>
        <span style={{ marginLeft: 8 }}>— 可用於優化人手安排和營業時間</span>
      </div>
    </div>
  );
}
