import { useMemo } from 'react';
import { fmtM } from '../../data';

export default function DrugSafetyReport({ data }) {
  const inventory = data.inventory || [];

  const { items, stats } = useMemo(() => {
    const classified = inventory.map(i => {
      const stock = Number(i.stock || 0);
      const min = Number(i.minStock || 0);
      let status, statusTag;
      if (stock < min) { status = '不足'; statusTag = 'tag-overdue'; }
      else if (stock < min * 2) { status = '注意'; statusTag = 'tag-pending-orange'; }
      else { status = '正常'; statusTag = 'tag-paid'; }
      return { ...i, stockNum: stock, minNum: min, status, statusTag, sortOrder: status === '不足' ? 0 : status === '注意' ? 1 : 2 };
    }).sort((a, b) => a.sortOrder - b.sortOrder);

    const stats = {
      total: classified.length,
      normal: classified.filter(i => i.status === '正常').length,
      warning: classified.filter(i => i.status === '注意').length,
      danger: classified.filter(i => i.status === '不足').length,
      totalValue: classified.reduce((s, i) => s + i.stockNum * Number(i.costPerUnit || 0), 0),
    };

    return { items: classified, stats };
  }, [inventory]);

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal-700)', marginBottom: 16 }}>⚠️ 藥物安全量報表</h3>
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card teal"><div className="stat-label">總品項</div><div className="stat-value teal">{stats.total}</div></div>
        <div className="stat-card green"><div className="stat-label">正常</div><div className="stat-value green">{stats.normal}</div></div>
        <div className="stat-card gold"><div className="stat-label">注意</div><div className="stat-value gold">{stats.warning}</div></div>
        <div className="stat-card red"><div className="stat-label">不足</div><div className="stat-value red">{stats.danger}</div></div>
      </div>
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無庫存記錄</div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table>
            <thead><tr><th>藥材名稱</th><th>類別</th><th style={{textAlign:'right'}}>現有庫存</th><th style={{textAlign:'right'}}>安全庫存</th><th>狀態</th><th>供應商</th><th>店舖</th></tr></thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} style={i.status === '不足' ? { background: 'rgba(220,38,38,0.05)' } : {}}>
                  <td style={{ fontWeight: 600 }}>{i.name}</td>
                  <td><span className="tag tag-other">{i.category}</span></td>
                  <td className="money">{i.stockNum} {i.unit}</td>
                  <td className="money">{i.minNum} {i.unit}</td>
                  <td><span className={`tag ${i.statusTag}`}>{i.status}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--gray-500)' }}>{i.supplier || '-'}</td>
                  <td style={{ fontSize: 11 }}>{i.store || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
