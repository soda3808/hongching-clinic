import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { fmtM, getMonth, monthLabel } from '../../data';

const COLORS = ['#16a34a', '#0e7490', '#d97706', '#dc2626', '#7C3AED'];

export default function AgingReport({ data }) {
  const arap = data.arap || [];
  const today = new Date().toISOString().substring(0, 10);

  // ── Aging buckets ──
  const agingAnalysis = useMemo(() => {
    const analyze = (items) => {
      const buckets = { current: [], days30: [], days60: [], days90: [], days90plus: [] };
      items.forEach(item => {
        if (!item.dueDate) { buckets.current.push(item); return; }
        const daysPast = Math.ceil((new Date(today) - new Date(item.dueDate)) / 86400000);
        if (daysPast <= 0) buckets.current.push(item);
        else if (daysPast <= 30) buckets.days30.push(item);
        else if (daysPast <= 60) buckets.days60.push(item);
        else if (daysPast <= 90) buckets.days90.push(item);
        else buckets.days90plus.push(item);
      });
      return buckets;
    };

    const receivables = arap.filter(r => r.type === 'receivable' && r.status !== '已收');
    const payables = arap.filter(r => r.type === 'payable' && r.status !== '已付');
    const arBuckets = analyze(receivables);
    const apBuckets = analyze(payables);

    const bucketSum = (b) => ({
      current: { count: b.current.length, total: b.current.reduce((s, i) => s + Number(i.amount), 0) },
      days30: { count: b.days30.length, total: b.days30.reduce((s, i) => s + Number(i.amount), 0) },
      days60: { count: b.days60.length, total: b.days60.reduce((s, i) => s + Number(i.amount), 0) },
      days90: { count: b.days90.length, total: b.days90.reduce((s, i) => s + Number(i.amount), 0) },
      days90plus: { count: b.days90plus.length, total: b.days90plus.reduce((s, i) => s + Number(i.amount), 0) },
    });

    return {
      ar: { items: receivables, buckets: arBuckets, summary: bucketSum(arBuckets), total: receivables.reduce((s, i) => s + Number(i.amount), 0) },
      ap: { items: payables, buckets: apBuckets, summary: bucketSum(apBuckets), total: payables.reduce((s, i) => s + Number(i.amount), 0) },
    };
  }, [arap, today]);

  // ── Chart data ──
  const agingChartData = [
    { name: '未到期', 應收: agingAnalysis.ar.summary.current.total, 應付: agingAnalysis.ap.summary.current.total },
    { name: '1-30天', 應收: agingAnalysis.ar.summary.days30.total, 應付: agingAnalysis.ap.summary.days30.total },
    { name: '31-60天', 應收: agingAnalysis.ar.summary.days60.total, 應付: agingAnalysis.ap.summary.days60.total },
    { name: '61-90天', 應收: agingAnalysis.ar.summary.days90.total, 應付: agingAnalysis.ap.summary.days90.total },
    { name: '90天+', 應收: agingAnalysis.ar.summary.days90plus.total, 應付: agingAnalysis.ap.summary.days90plus.total },
  ];

  // ── AR pie data ──
  const arPieData = agingChartData.filter(d => d.應收 > 0).map(d => ({ name: d.name, value: d.應收 }));

  // ── Top debtors ──
  const topDebtors = useMemo(() => {
    const debtors = {};
    agingAnalysis.ar.items.forEach(item => {
      const key = item.name || item.contact || '未知';
      if (!debtors[key]) debtors[key] = { name: key, total: 0, count: 0, oldest: item.dueDate };
      debtors[key].total += Number(item.amount);
      debtors[key].count += 1;
      if (item.dueDate && (!debtors[key].oldest || item.dueDate < debtors[key].oldest)) debtors[key].oldest = item.dueDate;
    });
    return Object.values(debtors).sort((a, b) => b.total - a.total).slice(0, 15);
  }, [agingAnalysis]);

  // ── Collection rate trend ──
  const collectionTrend = useMemo(() => {
    const byMonth = {};
    arap.filter(r => r.type === 'receivable').forEach(r => {
      const m = getMonth(r.createdAt || r.date || r.dueDate);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { month: m, total: 0, collected: 0 };
      byMonth[m].total += Number(r.amount);
      if (r.status === '已收') byMonth[m].collected += Number(r.amount);
    });
    return Object.values(byMonth)
      .map(m => ({ ...m, label: monthLabel(m.month), 回收率: m.total > 0 ? Number(((m.collected / m.total) * 100).toFixed(0)) : 0 }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  }, [arap]);

  const totalAR = agingAnalysis.ar.total;
  const totalAP = agingAnalysis.ap.total;
  const overdueAR = totalAR - agingAnalysis.ar.summary.current.total;
  const collectionRate = arap.filter(r => r.type === 'receivable').length > 0
    ? ((arap.filter(r => r.type === 'receivable' && r.status === '已收').length / arap.filter(r => r.type === 'receivable').length) * 100).toFixed(0)
    : 0;

  const daysSinceStr = (dueDate) => {
    if (!dueDate) return '-';
    const days = Math.ceil((new Date(today) - new Date(dueDate)) / 86400000);
    if (days <= 0) return '未到期';
    return `${days} 天`;
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>📑 應收應付帳齡分析</h3>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'var(--teal-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>待收總額</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{fmtM(totalAR)}</div>
          <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{agingAnalysis.ar.items.length} 筆</div>
        </div>
        <div style={{ padding: 12, background: 'var(--red-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>逾期應收</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red-600)' }}>{fmtM(overdueAR)}</div>
          <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{agingAnalysis.ar.items.length - agingAnalysis.ar.summary.current.count} 筆</div>
        </div>
        <div style={{ padding: 12, background: 'var(--gold-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>待付總額</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-700)' }}>{fmtM(totalAP)}</div>
          <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{agingAnalysis.ap.items.length} 筆</div>
        </div>
        <div style={{ padding: 12, background: 'var(--green-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--green-600)', fontWeight: 600 }}>回收率</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-700)' }}>{collectionRate}%</div>
        </div>
      </div>

      {/* Aging Chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>帳齡分佈</div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={agingChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={v => fmtM(v)} />
                <Legend />
                <Bar dataKey="應收" fill="#0e7490" radius={[4, 4, 0, 0]} />
                <Bar dataKey="應付" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>應收帳齡佔比</div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={arPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {arPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmtM(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Aging Detail Tables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* AR Aging */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>應收帳齡明細</div>
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead><tr style={{ background: 'var(--gray-50)' }}><th style={{ padding: '6px 8px', textAlign: 'left' }}>帳齡</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>筆數</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>金額</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>佔比</th></tr></thead>
            <tbody>
              {[
                { label: '未到期', ...agingAnalysis.ar.summary.current, color: '#16a34a' },
                { label: '1-30天', ...agingAnalysis.ar.summary.days30, color: '#0e7490' },
                { label: '31-60天', ...agingAnalysis.ar.summary.days60, color: '#d97706' },
                { label: '61-90天', ...agingAnalysis.ar.summary.days90, color: '#dc2626' },
                { label: '90天+', ...agingAnalysis.ar.summary.days90plus, color: '#7C3AED' },
              ].map(b => (
                <tr key={b.label}>
                  <td style={{ padding: '4px 8px', fontWeight: 600, color: b.color }}>{b.label}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{b.count}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtM(b.total)}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{totalAR > 0 ? (b.total / totalAR * 100).toFixed(0) : 0}%</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--gray-300)', fontWeight: 800 }}>
                <td style={{ padding: '6px 8px' }}>合計</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{agingAnalysis.ar.items.length}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--teal-700)' }}>{fmtM(totalAR)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* AP Aging */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>應付帳齡明細</div>
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead><tr style={{ background: 'var(--gray-50)' }}><th style={{ padding: '6px 8px', textAlign: 'left' }}>帳齡</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>筆數</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>金額</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>佔比</th></tr></thead>
            <tbody>
              {[
                { label: '未到期', ...agingAnalysis.ap.summary.current, color: '#16a34a' },
                { label: '1-30天', ...agingAnalysis.ap.summary.days30, color: '#0e7490' },
                { label: '31-60天', ...agingAnalysis.ap.summary.days60, color: '#d97706' },
                { label: '61-90天', ...agingAnalysis.ap.summary.days90, color: '#dc2626' },
                { label: '90天+', ...agingAnalysis.ap.summary.days90plus, color: '#7C3AED' },
              ].map(b => (
                <tr key={b.label}>
                  <td style={{ padding: '4px 8px', fontWeight: 600, color: b.color }}>{b.label}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{b.count}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtM(b.total)}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{totalAP > 0 ? (b.total / totalAP * 100).toFixed(0) : 0}%</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--gray-300)', fontWeight: 800 }}>
                <td style={{ padding: '6px 8px' }}>合計</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{agingAnalysis.ap.items.length}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--red-600)' }}>{fmtM(totalAP)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Collection Rate Trend */}
      {collectionTrend.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>月度回收率趨勢</div>
          <div style={{ width: '100%', height: 220, marginBottom: 16 }}>
            <ResponsiveContainer>
              <BarChart data={collectionTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={11} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={v => `${v}%`} />
                <Bar dataKey="回收率" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Top Debtors */}
      {topDebtors.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>主要欠款方（Top 15）</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>名稱</th><th style={{ textAlign: 'right' }}>未收金額</th><th style={{ textAlign: 'right' }}>筆數</th><th style={{ textAlign: 'right' }}>最早逾期</th><th style={{ textAlign: 'right' }}>逾期天數</th></tr></thead>
              <tbody>
                {topDebtors.map(d => (
                  <tr key={d.name} style={{ background: d.total > 10000 ? '#fef2f2' : '' }}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td className="money" style={{ fontWeight: 700, color: 'var(--red-600)' }}>{fmtM(d.total)}</td>
                    <td className="money">{d.count}</td>
                    <td className="money">{d.oldest || '-'}</td>
                    <td className="money" style={{ color: 'var(--red-600)' }}>{daysSinceStr(d.oldest)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {arap.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無應收應付數據</div>
      )}
    </div>
  );
}
