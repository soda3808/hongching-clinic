import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fmtM, getMonth, monthLabel } from '../../data';
import { getTenantStoreNames } from '../../tenant';

const COLORS = ['#0e7490', '#16a34a', '#7c3aed', '#d97706', '#dc2626'];

export default function BranchComparison({ data }) {
  const storeNames = getTenantStoreNames();
  const revenue = data.revenue || [];
  const expenses = data.expenses || [];
  const patients = data.patients || [];
  const bookings = data.bookings || [];
  const consultations = data.consultations || [];

  const branchStats = useMemo(() => {
    return storeNames.map((store, idx) => {
      const storeRev = revenue.filter(r => r.store === store);
      const storeExp = expenses.filter(e => e.store === store);
      const storePat = patients.filter(p => p.store === store);
      const storeBook = bookings.filter(b => b.store === store);
      const storeCons = consultations.filter(c => c.store === store);

      const totalRev = storeRev.reduce((s, r) => s + Number(r.amount || 0), 0);
      const totalExp = storeExp.reduce((s, e) => s + Number(e.amount || 0), 0);
      const noShows = storeBook.filter(b => b.status === 'no-show').length;
      const completedBooks = storeBook.filter(b => b.status === 'completed').length;

      // Monthly revenue trend
      const monthlyRev = {};
      storeRev.forEach(r => {
        const m = getMonth(r.date);
        if (m) monthlyRev[m] = (monthlyRev[m] || 0) + Number(r.amount || 0);
      });

      return {
        name: store,
        color: COLORS[idx % COLORS.length],
        totalRev,
        totalExp,
        profit: totalRev - totalExp,
        margin: totalRev > 0 ? ((totalRev - totalExp) / totalRev * 100).toFixed(1) : '0',
        patientCount: storePat.length,
        bookingCount: storeBook.length,
        consultCount: storeCons.length,
        noShowRate: storeBook.length > 0 ? ((noShows / storeBook.length) * 100).toFixed(1) : '0',
        completionRate: storeBook.length > 0 ? ((completedBooks / storeBook.length) * 100).toFixed(1) : '0',
        avgRevPerPatient: storePat.length > 0 ? Math.round(totalRev / storePat.length) : 0,
        monthlyRev,
      };
    });
  }, [storeNames, revenue, expenses, patients, bookings, consultations]);

  // Chart data for side-by-side comparison
  const comparisonChart = useMemo(() => {
    return [
      { name: '營業額', ...Object.fromEntries(branchStats.map(b => [b.name, b.totalRev])) },
      { name: '開支', ...Object.fromEntries(branchStats.map(b => [b.name, b.totalExp])) },
      { name: '利潤', ...Object.fromEntries(branchStats.map(b => [b.name, b.profit])) },
    ];
  }, [branchStats]);

  const patientChart = useMemo(() => {
    return [
      { name: '病人數', ...Object.fromEntries(branchStats.map(b => [b.name, b.patientCount])) },
      { name: '預約數', ...Object.fromEntries(branchStats.map(b => [b.name, b.bookingCount])) },
      { name: '診症數', ...Object.fromEntries(branchStats.map(b => [b.name, b.consultCount])) },
    ];
  }, [branchStats]);

  // Monthly trend for all branches
  const monthlyTrend = useMemo(() => {
    const allMonths = new Set();
    branchStats.forEach(b => Object.keys(b.monthlyRev).forEach(m => allMonths.add(m)));
    return [...allMonths].sort().slice(-12).map(m => {
      const entry = { month: m, label: monthLabel(m) };
      branchStats.forEach(b => { entry[b.name] = b.monthlyRev[m] || 0; });
      return entry;
    });
  }, [branchStats]);

  if (storeNames.length < 2) {
    return (
      <div className="card">
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>🏢 分店比較分析</h3>
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>需要至少 2 間分店才能進行比較</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>🏢 分店比較分析</h3>

      {/* Branch KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${storeNames.length}, 1fr)`, gap: 12, marginBottom: 16 }}>
        {branchStats.map(b => (
          <div key={b.name} style={{ padding: 12, border: `2px solid ${b.color}`, borderRadius: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: b.color, marginBottom: 8 }}>{b.name}</div>
            <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--gray-500)' }}>營業額</span>
                <span style={{ fontWeight: 700, color: 'var(--green-700)' }}>{fmtM(b.totalRev)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--gray-500)' }}>開支</span>
                <span style={{ fontWeight: 700, color: 'var(--red-600)' }}>{fmtM(b.totalExp)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--gray-500)' }}>利潤</span>
                <span style={{ fontWeight: 700, color: b.profit >= 0 ? 'var(--green-700)' : 'var(--red-600)' }}>{fmtM(b.profit)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--gray-500)' }}>利潤率</span>
                <span style={{ fontWeight: 700 }}>{b.margin}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--gray-500)' }}>病人數</span>
                <span style={{ fontWeight: 700 }}>{b.patientCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--gray-500)' }}>平均消費/人</span>
                <span style={{ fontWeight: 700 }}>{fmtM(b.avgRevPerPatient)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--gray-500)' }}>缺席率</span>
                <span style={{ fontWeight: 700, color: Number(b.noShowRate) > 10 ? '#dc2626' : '#16a34a' }}>{b.noShowRate}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comparison Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>財務比較</div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={comparisonChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={v => fmtM(v)} />
                <Tooltip formatter={v => fmtM(v)} />
                <Legend fontSize={10} />
                {storeNames.map((s, i) => (
                  <Bar key={s} dataKey={s} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>營運比較</div>
          <div style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={patientChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend fontSize={10} />
                {storeNames.map((s, i) => (
                  <Bar key={s} dataKey={s} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Monthly trend */}
      {monthlyTrend.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>月度營業額趨勢</div>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={11} tickFormatter={v => fmtM(v)} />
                <Tooltip formatter={v => fmtM(v)} />
                <Legend fontSize={10} />
                {storeNames.map((s, i) => (
                  <Bar key={s} dataKey={s} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Summary Table */}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>分店績效總表</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>分店</th>
              <th style={{ textAlign: 'right' }}>營業額</th>
              <th style={{ textAlign: 'right' }}>開支</th>
              <th style={{ textAlign: 'right' }}>利潤</th>
              <th style={{ textAlign: 'right' }}>利潤率</th>
              <th style={{ textAlign: 'right' }}>病人</th>
              <th style={{ textAlign: 'right' }}>預約</th>
              <th style={{ textAlign: 'right' }}>缺席率</th>
              <th style={{ textAlign: 'right' }}>人均消費</th>
            </tr>
          </thead>
          <tbody>
            {branchStats.map(b => (
              <tr key={b.name}>
                <td style={{ fontWeight: 700, color: b.color }}>{b.name}</td>
                <td className="money" style={{ color: 'var(--green-700)', fontWeight: 700 }}>{fmtM(b.totalRev)}</td>
                <td className="money" style={{ color: 'var(--red-600)' }}>{fmtM(b.totalExp)}</td>
                <td className="money" style={{ fontWeight: 700, color: b.profit >= 0 ? 'var(--green-700)' : 'var(--red-600)' }}>{fmtM(b.profit)}</td>
                <td className="money">{b.margin}%</td>
                <td className="money">{b.patientCount}</td>
                <td className="money">{b.bookingCount}</td>
                <td className="money" style={{ color: Number(b.noShowRate) > 10 ? '#dc2626' : '#16a34a' }}>{b.noShowRate}%</td>
                <td className="money">{fmtM(b.avgRevPerPatient)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
