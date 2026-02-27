import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtM } from '../../data';

export default function InventoryForecast({ data }) {
  const inventory = data.inventory || [];
  const consultations = data.consultations || [];
  const [showOrder, setShowOrder] = useState(false);

  // ── Calculate usage rate per herb (last 90 days) ──
  const herbUsage = useMemo(() => {
    const today = new Date();
    const ninetyAgo = new Date(today);
    ninetyAgo.setDate(ninetyAgo.getDate() - 90);
    const cutoff = ninetyAgo.toISOString().substring(0, 10);

    const usage = {};
    consultations.filter(c => c.date >= cutoff).forEach(c => {
      const days = c.formulaDays || 1;
      (c.prescription || []).forEach(rx => {
        if (!rx.herb) return;
        const dose = parseFloat(rx.dosage) || 0;
        if (!usage[rx.herb]) usage[rx.herb] = { name: rx.herb, totalUsed: 0, prescriptions: 0 };
        usage[rx.herb].totalUsed += dose * days;
        usage[rx.herb].prescriptions += 1;
      });
    });

    // Calculate daily usage rate
    const dayCount = Math.max(1, Math.ceil((today - ninetyAgo) / (1000 * 60 * 60 * 24)));
    Object.values(usage).forEach(u => {
      u.dailyRate = u.totalUsed / dayCount;
      u.weeklyRate = u.dailyRate * 7;
      u.monthlyRate = u.dailyRate * 30;
    });

    return usage;
  }, [consultations]);

  // ── Inventory status with depletion forecast ──
  const inventoryStatus = useMemo(() => {
    return inventory.map(item => {
      const stock = Number(item.stock) || 0;
      const minStock = Number(item.minStock) || 0;
      const unitCost = Number(item.unitCost) || Number(item.cost) || 0;
      const usage = herbUsage[item.name] || { dailyRate: 0, weeklyRate: 0, monthlyRate: 0, totalUsed: 0, prescriptions: 0 };
      const daysUntilEmpty = usage.dailyRate > 0 ? Math.ceil(stock / usage.dailyRate) : stock > 0 ? 999 : 0;
      const daysUntilMin = usage.dailyRate > 0 ? Math.ceil(Math.max(0, stock - minStock) / usage.dailyRate) : stock > minStock ? 999 : 0;
      const suggestedOrder = Math.max(0, Math.ceil(usage.monthlyRate * 2 - stock)); // 2-month supply
      const orderCost = suggestedOrder * unitCost;

      let status = 'ok';
      if (stock <= 0) status = 'empty';
      else if (stock < minStock) status = 'critical';
      else if (daysUntilMin <= 7) status = 'warning';
      else if (daysUntilMin <= 14) status = 'low';

      return {
        ...item, stock, minStock, unitCost, usage,
        daysUntilEmpty, daysUntilMin, suggestedOrder, orderCost, status,
      };
    }).sort((a, b) => {
      const order = { empty: 0, critical: 1, warning: 2, low: 3, ok: 4 };
      return (order[a.status] || 5) - (order[b.status] || 5);
    });
  }, [inventory, herbUsage]);

  const statusColors = { empty: '#dc2626', critical: '#dc2626', warning: '#d97706', low: '#0284c7', ok: '#16a34a' };
  const statusLabels = { empty: '缺貨', critical: '嚴重不足', warning: '即將不足', low: '偏低', ok: '正常' };

  const criticalCount = inventoryStatus.filter(i => i.status === 'critical' || i.status === 'empty').length;
  const warningCount = inventoryStatus.filter(i => i.status === 'warning').length;
  const totalOrderCost = inventoryStatus.filter(i => i.suggestedOrder > 0).reduce((s, i) => s + i.orderCost, 0);

  // ── Top usage chart ──
  const topUsageChart = inventoryStatus
    .filter(i => i.usage.totalUsed > 0)
    .sort((a, b) => b.usage.monthlyRate - a.usage.monthlyRate)
    .slice(0, 15)
    .map(i => ({ name: i.name, 月用量: Math.round(i.usage.monthlyRate), 庫存: i.stock }));

  // ── Generate purchase order ──
  const printOrder = () => {
    const items = inventoryStatus.filter(i => i.suggestedOrder > 0).sort((a, b) => b.orderCost - a.orderCost);
    const rows = items.map((i, idx) => `<tr>
      <td>${idx + 1}</td>
      <td style="font-weight:600">${i.name}</td>
      <td class="money">${i.stock}${i.unit || 'g'}</td>
      <td class="money">${Math.round(i.usage.monthlyRate)}${i.unit || 'g'}</td>
      <td class="money" style="font-weight:700">${i.suggestedOrder}${i.unit || 'g'}</td>
      <td class="money">${i.unitCost > 0 ? fmtM(i.unitCost) : '-'}</td>
      <td class="money">${i.orderCost > 0 ? fmtM(i.orderCost) : '-'}</td>
    </tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>採購建議單</title><style>
      body{font-family:'Microsoft YaHei',sans-serif;padding:30px;max-width:800px;margin:0 auto;font-size:12px}
      h1{color:#0e7490;font-size:18px;text-align:center;border-bottom:3px solid #0e7490;padding-bottom:8px}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      th{background:#0e7490;color:#fff;padding:6px 8px;text-align:left}
      td{padding:5px 8px;border-bottom:1px solid #eee}.money{text-align:right}
      .total{font-weight:800;border-top:2px solid #333;font-size:13px}
      .footer{text-align:center;font-size:9px;color:#aaa;margin-top:20px}
    </style></head><body>
      <h1>藥材採購建議單</h1>
      <p style="text-align:center;color:#666">生成日期：${new Date().toISOString().substring(0,10)} | 基於過去 90 天使用數據</p>
      <table>
        <thead><tr><th>#</th><th>藥材</th><th>現有庫存</th><th>月均用量</th><th>建議採購</th><th>單價</th><th>估算金額</th></tr></thead>
        <tbody>${rows}
          <tr class="total"><td colspan="6">採購總額（估算）</td><td class="money">${fmtM(totalOrderCost)}</td></tr>
        </tbody>
      </table>
      <p style="font-size:11px;color:#888">* 建議採購量 = 2 個月預計用量 - 現有庫存。實際採購請根據供應商報價調整。</p>
      <div class="footer">此採購建議由系統基於歷史數據自動生成</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', margin: 0 }}>📦 庫存預測與採購建議</h3>
        <button className="btn btn-teal btn-sm" onClick={printOrder}>列印採購建議單</button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ padding: 12, background: 'var(--teal-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--teal-600)', fontWeight: 600 }}>庫存品項</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>{inventory.length}</div>
        </div>
        <div style={{ padding: 12, background: criticalCount > 0 ? 'var(--red-50)' : 'var(--green-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: criticalCount > 0 ? 'var(--red-600)' : 'var(--green-600)', fontWeight: 600 }}>缺貨/嚴重不足</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: criticalCount > 0 ? 'var(--red-600)' : 'var(--green-700)' }}>{criticalCount}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--gold-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--gold-700)', fontWeight: 600 }}>即將不足</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gold-700)' }}>{warningCount}</div>
        </div>
        <div style={{ padding: 12, background: 'var(--red-50)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--red-600)', fontWeight: 600 }}>建議採購總額</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--red-600)' }}>{fmtM(totalOrderCost)}</div>
        </div>
      </div>

      {/* Top usage chart */}
      {topUsageChart.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--teal-700)' }}>月均用量 vs 庫存（Top 15）</div>
          <div style={{ width: '100%', height: 350, marginBottom: 16 }}>
            <ResponsiveContainer>
              <BarChart data={topUsageChart} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={11} />
                <YAxis dataKey="name" type="category" fontSize={11} width={80} />
                <Tooltip />
                <Bar dataKey="月用量" fill="#dc2626" radius={[0, 4, 4, 0]} />
                <Bar dataKey="庫存" fill="#16a34a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Inventory Table */}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>庫存明細（按緊急程度排序）</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>狀態</th><th>藥材</th><th style={{ textAlign: 'right' }}>庫存</th><th style={{ textAlign: 'right' }}>最低</th>
              <th style={{ textAlign: 'right' }}>月均用量</th><th style={{ textAlign: 'right' }}>耗盡天數</th>
              <th style={{ textAlign: 'right' }}>建議採購</th><th style={{ textAlign: 'right' }}>估算金額</th>
            </tr>
          </thead>
          <tbody>
            {inventoryStatus.map(i => (
              <tr key={i.id || i.name} style={{ background: i.status === 'empty' || i.status === 'critical' ? '#fef2f2' : i.status === 'warning' ? '#fffbeb' : '' }}>
                <td><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: statusColors[i.status] + '18', color: statusColors[i.status], fontWeight: 700 }}>{statusLabels[i.status]}</span></td>
                <td style={{ fontWeight: 600 }}>{i.name}</td>
                <td className="money" style={{ color: i.stock < i.minStock ? 'var(--red-600)' : '' }}>{i.stock}{i.unit || 'g'}</td>
                <td className="money">{i.minStock}{i.unit || 'g'}</td>
                <td className="money">{i.usage.monthlyRate > 0 ? `${Math.round(i.usage.monthlyRate)}${i.unit || 'g'}` : '-'}</td>
                <td className="money" style={{ color: i.daysUntilEmpty <= 7 ? 'var(--red-600)' : i.daysUntilEmpty <= 14 ? 'var(--gold-700)' : '' }}>
                  {i.daysUntilEmpty >= 999 ? '-' : `${i.daysUntilEmpty} 天`}
                </td>
                <td className="money" style={{ fontWeight: i.suggestedOrder > 0 ? 700 : 400 }}>
                  {i.suggestedOrder > 0 ? `${i.suggestedOrder}${i.unit || 'g'}` : '-'}
                </td>
                <td className="money">{i.orderCost > 0 ? fmtM(i.orderCost) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--gray-400)' }}>* 耗盡天數基於過去 90 天平均日用量計算。建議採購量 = 2 個月用量 - 現有庫存。</div>

      {inventory.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--gray-400)' }}>暫無庫存數據</div>
      )}
    </div>
  );
}
