import { useMemo, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { fmtM, getMonth, monthLabel } from '../../data';

const COLORS = ['#0e7490', '#16a34a', '#DAA520', '#dc2626', '#7C3AED', '#0284c7', '#059669', '#d97706', '#6366f1', '#ec4899'];

export default function HerbAnalytics({ data }) {
  const consultations = data.consultations || [];
  const inventory = data.inventory || [];
  const [viewMode, setViewMode] = useState('overview'); // overview | cost | doctor | trend

  // ── Herb usage stats ──
  const herbStats = useMemo(() => {
    const herbs = {};
    consultations.forEach(c => {
      (c.prescription || []).forEach(rx => {
        if (!rx.herb) return;
        if (!herbs[rx.herb]) herbs[rx.herb] = { name: rx.herb, count: 0, totalDosage: 0, doctors: new Set(), patients: new Set(), months: new Set() };
        herbs[rx.herb].count += 1;
        herbs[rx.herb].totalDosage += parseFloat(rx.dosage) || 0;
        if (c.doctor) herbs[rx.herb].doctors.add(c.doctor);
        if (c.patientName) herbs[rx.herb].patients.add(c.patientName);
        if (c.date) herbs[rx.herb].months.add(getMonth(c.date));
      });
    });
    return Object.values(herbs)
      .map(h => ({ ...h, doctors: h.doctors.size, patients: h.patients.size, months: h.months.size, avgDosage: h.count > 0 ? (h.totalDosage / h.count).toFixed(1) : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [consultations]);

  // ── Inventory cost data ──
  const costStats = useMemo(() => {
    return herbStats.slice(0, 20).map(h => {
      const inv = inventory.find(i => i.name === h.name);
      const unitCost = inv ? (Number(inv.unitCost) || Number(inv.cost) || 0) : 0;
      const totalCost = unitCost * h.totalDosage;
      return { ...h, unitCost, totalCost, stock: inv ? Number(inv.stock) || 0 : 0, unit: inv?.unit || 'g' };
    }).sort((a, b) => b.totalCost - a.totalCost);
  }, [herbStats, inventory]);

  // ── Doctor prescribing patterns ──
  const doctorStats = useMemo(() => {
    const doctors = {};
    consultations.forEach(c => {
      if (!c.doctor) return;
      if (!doctors[c.doctor]) doctors[c.doctor] = { name: c.doctor, totalRx: 0, herbs: {}, uniqueHerbs: new Set(), totalConsults: 0 };
      const d = doctors[c.doctor];
      d.totalConsults += 1;
      (c.prescription || []).forEach(rx => {
        if (!rx.herb) return;
        d.totalRx += 1;
        d.uniqueHerbs.add(rx.herb);
        d.herbs[rx.herb] = (d.herbs[rx.herb] || 0) + 1;
      });
    });
    return Object.values(doctors).map(d => ({
      ...d,
      uniqueHerbs: d.uniqueHerbs.size,
      avgHerbsPerRx: d.totalConsults > 0 ? (d.totalRx / d.totalConsults).toFixed(1) : 0,
      topHerbs: Object.entries(d.herbs).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([herb, count]) => ({ herb, count })),
    }));
  }, [consultations]);

  // ── Monthly trend ──
  const monthlyTrend = useMemo(() => {
    const byMonth = {};
    consultations.forEach(c => {
      const m = getMonth(c.date);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { month: m, prescriptions: 0, totalHerbs: 0, uniqueHerbs: new Set() };
      const rxCount = (c.prescription || []).filter(rx => rx.herb).length;
      byMonth[m].prescriptions += rxCount > 0 ? 1 : 0;
      byMonth[m].totalHerbs += rxCount;
      (c.prescription || []).forEach(rx => { if (rx.herb) byMonth[m].uniqueHerbs.add(rx.herb); });
    });
    return Object.values(byMonth)
      .map(m => ({ ...m, uniqueHerbs: m.uniqueHerbs.size, label: monthLabel(m.month) }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [consultations]);

  // ── Formula stats ──
  const formulaStats = useMemo(() => {
    const formulas = {};
    consultations.forEach(c => {
      if (!c.formulaName) return;
      if (!formulas[c.formulaName]) formulas[c.formulaName] = { name: c.formulaName, count: 0, doctors: new Set() };
      formulas[c.formulaName].count += 1;
      if (c.doctor) formulas[c.formulaName].doctors.add(c.doctor);
    });
    return Object.values(formulas)
      .map(f => ({ ...f, doctors: f.doctors.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [consultations]);

  const totalPrescriptions = consultations.filter(c => (c.prescription || []).some(rx => rx.herb)).length;
  const totalHerbUsages = herbStats.reduce((s, h) => s + h.count, 0);
  const totalCost = costStats.reduce((s, h) => s + h.totalCost, 0);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', margin: 0 }}>💊 藥材使用分析</h3>
        <div className="preset-bar" style={{ marginBottom: 0 }}>
          {[['overview', '總覽'], ['cost', '成本分析'], ['doctor', '醫師處方'], ['trend', '月度趨勢']].map(([k, l]) => (
            <button key={k} className={`preset-chip ${viewMode === k ? 'active' : ''}`} onClick={() => setViewMode(k)}>{l}</button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'var(--teal-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>處方數</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{totalPrescriptions}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--green-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--green-600)', fontWeight: 600 }}>藥材種類</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-700)' }}>{herbStats.length}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--gold-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>總使用次數</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-700)' }}>{totalHerbUsages}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--red-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>估算藥材成本</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red-600)' }}>{fmtM(totalCost)}</div>
        </div>
      </div>

      {viewMode === 'overview' && (
        <>
          {/* Top 15 herbs chart */}
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>Top 15 常用藥材</div>
          <div style={{ width: '100%', height: 400, marginBottom: 16 }}>
            <ResponsiveContainer>
              <BarChart data={herbStats.slice(0, 15).map(h => ({ name: h.name, 次數: h.count, 平均劑量: Number(h.avgDosage) }))} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis dataKey="name" type="category" fontSize={11} width={80} />
                <Tooltip />
                <Bar dataKey="次數" fill="#0e7490" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top formulas */}
          {formulaStats.length > 0 && (
            <>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>常用方劑</div>
              <div className="table-wrap" style={{ marginBottom: 16 }}>
                <table>
                  <thead><tr><th>#</th><th>方劑名</th><th style={{ textAlign: 'right' }}>使用次數</th><th style={{ textAlign: 'right' }}>處方醫師數</th></tr></thead>
                  <tbody>
                    {formulaStats.map((f, i) => (
                      <tr key={f.name}>
                        <td style={{ fontWeight: 700, color: 'var(--gray-400)' }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{f.name}</td>
                        <td className="money">{f.count}</td>
                        <td className="money">{f.doctors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Full herb table */}
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>全部藥材使用明細</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>藥材</th><th style={{ textAlign: 'right' }}>使用次數</th><th style={{ textAlign: 'right' }}>總劑量</th><th style={{ textAlign: 'right' }}>平均劑量</th><th style={{ textAlign: 'right' }}>病人數</th></tr></thead>
              <tbody>
                {herbStats.slice(0, 50).map((h, i) => (
                  <tr key={h.name}>
                    <td style={{ fontWeight: 700, color: 'var(--gray-400)' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{h.name}</td>
                    <td className="money">{h.count}</td>
                    <td className="money">{h.totalDosage.toFixed(0)}g</td>
                    <td className="money">{h.avgDosage}g</td>
                    <td className="money">{h.patients}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {viewMode === 'cost' && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>藥材成本排名（Top 20）</div>
          <div style={{ width: '100%', height: 400, marginBottom: 16 }}>
            <ResponsiveContainer>
              <BarChart data={costStats.filter(h => h.totalCost > 0).slice(0, 15).map(h => ({ name: h.name, 成本: Math.round(h.totalCost) }))} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={11} tickFormatter={v => `$${v}`} />
                <YAxis dataKey="name" type="category" fontSize={11} width={80} />
                <Tooltip formatter={v => fmtM(v)} />
                <Bar dataKey="成本" fill="#dc2626" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>藥材</th><th style={{ textAlign: 'right' }}>使用次數</th><th style={{ textAlign: 'right' }}>總用量</th><th style={{ textAlign: 'right' }}>單價</th><th style={{ textAlign: 'right' }}>估算總成本</th><th style={{ textAlign: 'right' }}>庫存</th></tr></thead>
              <tbody>
                {costStats.map((h, i) => (
                  <tr key={h.name}>
                    <td style={{ fontWeight: 700, color: 'var(--gray-400)' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{h.name}</td>
                    <td className="money">{h.count}</td>
                    <td className="money">{h.totalDosage.toFixed(0)}{h.unit}</td>
                    <td className="money">{h.unitCost > 0 ? fmtM(h.unitCost) : '-'}</td>
                    <td className="money" style={{ color: h.totalCost > 0 ? 'var(--red-600)' : '' }}>{h.totalCost > 0 ? fmtM(h.totalCost) : '-'}</td>
                    <td className="money" style={{ color: h.stock < h.totalDosage * 0.1 ? 'var(--red-600)' : '' }}>{h.stock > 0 ? `${h.stock}${h.unit}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--gray-400)' }}>* 成本按庫存單價 x 總用量估算，實際成本可能因批次不同而異</div>
        </>
      )}

      {viewMode === 'doctor' && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>醫師處方習慣分析</div>
          {doctorStats.map(d => (
            <div key={d.name} className="card" style={{ marginBottom: 12, padding: 12, border: '1px solid var(--gray-200)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>{d.name}</strong>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--gray-500)' }}>
                  <span>診症 {d.totalConsults} 次</span>
                  <span>藥材種類 {d.uniqueHerbs} 種</span>
                  <span>平均每方 {d.avgHerbsPerRx} 味</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {d.topHerbs.map(h => (
                  <span key={h.herb} style={{ fontSize: 11, padding: '3px 8px', background: 'var(--teal-50)', borderRadius: 4, color: 'var(--teal-700)' }}>
                    {h.herb} ({h.count})
                  </span>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {viewMode === 'trend' && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>月度處方趨勢</div>
          <div style={{ width: '100%', height: 300, marginBottom: 16 }}>
            <ResponsiveContainer>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="prescriptions" name="處方數" stroke="#0e7490" strokeWidth={2} />
                <Line type="monotone" dataKey="totalHerbs" name="藥材用量" stroke="#16a34a" strokeWidth={2} />
                <Line type="monotone" dataKey="uniqueHerbs" name="藥材種類" stroke="#DAA520" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>月份</th><th style={{ textAlign: 'right' }}>處方數</th><th style={{ textAlign: 'right' }}>藥材用量</th><th style={{ textAlign: 'right' }}>藥材種類</th></tr></thead>
              <tbody>
                {monthlyTrend.map(m => (
                  <tr key={m.month}>
                    <td style={{ fontWeight: 600 }}>{m.label}</td>
                    <td className="money">{m.prescriptions}</td>
                    <td className="money">{m.totalHerbs}</td>
                    <td className="money">{m.uniqueHerbs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {herbStats.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無處方紀錄</div>
      )}
    </div>
  );
}
