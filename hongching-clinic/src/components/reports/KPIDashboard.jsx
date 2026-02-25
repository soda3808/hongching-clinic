import { useMemo } from 'react';
import { fmtM, getMonth } from '../../data';

export default function KPIDashboard({ data }) {
  const thisMonth = new Date().toISOString().substring(0, 7);

  const kpis = useMemo(() => {
    const revenue = data.revenue || [];
    const expenses = data.expenses || [];
    const patients = data.patients || [];
    const consultations = data.consultations || [];
    const queue = data.queue || [];
    const inventory = data.inventory || [];
    const bookings = data.bookings || [];
    const enrollments = data.enrollments || [];

    const totalRev = revenue.reduce((s, r) => s + Number(r.amount || 0), 0);
    const totalExp = expenses.reduce((s, r) => s + Number(r.amount || 0), 0);
    const monthRev = revenue.filter(r => getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount || 0), 0);
    const monthConsult = consultations.filter(c => getMonth(c.date) === thisMonth).length;
    const newPatients = patients.filter(p => getMonth(p.createdAt || p.firstVisit) === thisMonth).length;
    const invValue = inventory.reduce((s, i) => s + (Number(i.stock || 0) * Number(i.costPerUnit || 0)), 0);
    const lowStock = inventory.filter(i => Number(i.stock) < Number(i.minStock)).length;
    const pendingBookings = bookings.filter(b => b.status === 'pending').length;
    const avgPerConsult = monthConsult > 0 ? monthRev / monthConsult : 0;
    const utilRate = (() => {
      const active = enrollments.filter(e => e.totalSessions > 0);
      if (!active.length) return 0;
      return active.reduce((s, e) => s + (e.usedSessions / e.totalSessions * 100), 0) / active.length;
    })();

    return [
      { label: '總營業額', value: fmtM(totalRev), color: 'gold' },
      { label: '總開支', value: fmtM(totalExp), color: 'red' },
      { label: '淨利潤', value: fmtM(totalRev - totalExp), color: totalRev - totalExp >= 0 ? 'green' : 'red' },
      { label: '本月營業額', value: fmtM(monthRev), color: 'teal' },
      { label: '總病人數', value: patients.length, color: 'teal' },
      { label: '本月新病人', value: newPatients, color: 'gold' },
      { label: '本月診症數', value: monthConsult, color: 'green' },
      { label: '平均每診費用', value: fmtM(avgPerConsult), color: 'gold' },
      { label: '庫存總值', value: fmtM(invValue), color: 'teal' },
      { label: '低庫存項目', value: lowStock, color: lowStock > 0 ? 'red' : 'green' },
      { label: '待確認預約', value: pendingBookings, color: pendingBookings > 0 ? 'gold' : 'green' },
      { label: '套餐使用率', value: `${utilRate.toFixed(0)}%`, color: 'teal' },
    ];
  }, [data, thisMonth]);

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>🎯 系統KPI報表</h3>
      <div className="stats-grid">
        {kpis.map(kpi => (
          <div key={kpi.label} className={`stat-card ${kpi.color}`}>
            <div className="stat-label">{kpi.label}</div>
            <div className={`stat-value ${kpi.color}`}>{kpi.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
