import { useState, useMemo, useCallback } from 'react';
import { saveQueue, saveRevenue } from '../api';
import { uid, fmtM, DOCTORS } from '../data';
import { exportCSV } from '../utils/export';

const DISPENSING_LABELS = {
  'not-needed': '不需配藥',
  pending: '配藥中',
  dispensed: '配藥完畢',
  collected: '已取藥',
};

const DISPENSING_TAGS = {
  'not-needed': '',
  pending: 'tag-pending-orange',
  dispensed: 'tag-fps',
  collected: 'tag-paid',
};

const PAYMENT_LABELS = {
  pending: '未收費',
  paid: '已收費',
};

const STATUS_LABELS = {
  waiting: '等候中',
  'in-consultation': '診症中',
  dispensing: '配藥中',
  billing: '收費中',
  completed: '已完成',
};

const STORES = ['宋皇臺', '太子'];

function getToday() {
  return new Date().toISOString().substring(0, 10);
}

export default function BillingPage({ data, setData, showToast, allData, user }) {
  const [filterDate, setFilterDate] = useState(getToday());
  const [filterDoctor, setFilterDoctor] = useState('all');
  const [search, setSearch] = useState('');
  const [receiptItem, setReceiptItem] = useState(null);

  const queue = data.queue || [];

  // Filtered list for the selected date
  const list = useMemo(() => {
    let l = queue.filter(r => r.date === filterDate);
    if (filterDoctor !== 'all') l = l.filter(r => r.doctor === filterDoctor);
    if (search) {
      const q = search.toLowerCase();
      l = l.filter(r => r.patientName.toLowerCase().includes(q) || (r.queueNo || '').toLowerCase().includes(q));
    }
    return l.sort((a, b) => (a.queueNo || '').localeCompare(b.queueNo || ''));
  }, [queue, filterDate, filterDoctor, search]);

  // Summary
  const summary = useMemo(() => ({
    total: list.length,
    totalFee: list.reduce((s, r) => s + Number(r.serviceFee || 0), 0),
    paid: list.filter(r => r.paymentStatus === 'paid').length,
    paidAmount: list.filter(r => r.paymentStatus === 'paid').reduce((s, r) => s + Number(r.serviceFee || 0), 0),
    unpaid: list.filter(r => r.paymentStatus === 'pending').length,
    unpaidAmount: list.filter(r => r.paymentStatus === 'pending').reduce((s, r) => s + Number(r.serviceFee || 0), 0),
    dispensePending: list.filter(r => r.dispensingStatus === 'pending').length,
  }), [list]);

  // Update dispensing status
  const updateDispensing = useCallback(async (item, newStatus) => {
    const updated = { ...item, dispensingStatus: newStatus };
    await saveQueue(updated);
    setData({ ...data, queue: queue.map(q => q.id === item.id ? updated : q) });
    showToast(`${item.queueNo} ${DISPENSING_LABELS[newStatus]}`);
  }, [data, queue, setData, showToast]);

  // Mark as paid + auto-create revenue record
  const markPaid = useCallback(async (item) => {
    const updated = { ...item, paymentStatus: 'paid', status: 'completed', completedAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) };
    await saveQueue(updated);

    // Auto-create revenue record
    const revRecord = {
      id: uid(),
      date: item.date,
      name: item.patientName,
      item: item.services,
      amount: Number(item.serviceFee || 0),
      payment: 'FPS',
      store: item.store,
      doctor: item.doctor,
      note: `掛號 ${item.queueNo}`,
    };
    await saveRevenue(revRecord);

    const updatedRevenue = [...(data.revenue || []), revRecord];
    setData({ ...data, queue: queue.map(q => q.id === item.id ? updated : q), revenue: updatedRevenue });
    showToast(`${item.queueNo} 已收費 ${fmtM(item.serviceFee)}`);
  }, [data, queue, setData, showToast]);

  // Quick dispense + charge
  const quickProcess = useCallback(async (item) => {
    const updated = {
      ...item,
      dispensingStatus: item.dispensingStatus === 'not-needed' ? 'not-needed' : 'collected',
      paymentStatus: 'paid',
      status: 'completed',
      completedAt: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    };
    await saveQueue(updated);

    const revRecord = {
      id: uid(),
      date: item.date,
      name: item.patientName,
      item: item.services,
      amount: Number(item.serviceFee || 0),
      payment: 'FPS',
      store: item.store,
      doctor: item.doctor,
      note: `掛號 ${item.queueNo}`,
    };
    await saveRevenue(revRecord);

    const updatedRevenue = [...(data.revenue || []), revRecord];
    setData({ ...data, queue: queue.map(q => q.id === item.id ? updated : q), revenue: updatedRevenue });
    showToast(`${item.queueNo} 快捷收費完成`);
  }, [data, queue, setData, showToast]);

  // Export to Excel (CSV)
  const handleExport = () => {
    const cols = [
      { key: 'queueNo', label: '號碼' },
      { key: 'patientName', label: '病人' },
      { key: 'patientPhone', label: '電話' },
      { key: 'doctor', label: '醫師' },
      { key: 'store', label: '店舖' },
      { key: 'services', label: '服務' },
      { key: 'serviceFee', label: '費用' },
      { key: 'dispensingStatus', label: '配藥狀態' },
      { key: 'paymentStatus', label: '收費狀態' },
      { key: 'registeredAt', label: '掛號時間' },
    ];
    const rows = list.map(r => ({
      ...r,
      dispensingStatus: DISPENSING_LABELS[r.dispensingStatus] || r.dispensingStatus,
      paymentStatus: PAYMENT_LABELS[r.paymentStatus] || r.paymentStatus,
    }));
    exportCSV(rows, cols, `billing_${filterDate}.csv`);
    showToast('已匯出帳單');
  };

  // Print receipt
  const printReceipt = (item) => {
    setReceiptItem(item);
    setTimeout(() => window.print(), 300);
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">今日帳單</div><div className="stat-value teal">{summary.total}</div></div>
        <div className="stat-card green"><div className="stat-label">已收費</div><div className="stat-value green">{fmtM(summary.paidAmount)}</div><div className="stat-sub">{summary.paid} 筆</div></div>
        <div className="stat-card gold"><div className="stat-label">未收費</div><div className="stat-value gold">{fmtM(summary.unpaidAmount)}</div><div className="stat-sub">{summary.unpaid} 筆</div></div>
        <div className="stat-card red"><div className="stat-label">費用合計</div><div className="stat-value red">{fmtM(summary.totalFee)}</div></div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" style={{ width: 'auto' }} value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        <input style={{ flex: 1, minWidth: 160 }} placeholder="搜尋病人/號碼..." value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ width: 'auto' }} value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)}>
          <option value="all">全部醫師</option>
          {DOCTORS.map(d => <option key={d}>{d}</option>)}
        </select>
        <button className="btn btn-outline" onClick={handleExport}>匯出Excel</button>
      </div>

      {/* Billing Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header">
          <h3>配藥/收費列表</h3>
        </div>
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>號碼</th>
                <th>病人</th>
                <th>醫師</th>
                <th>店舖</th>
                <th>服務</th>
                <th style={{ textAlign: 'right' }}>費用</th>
                <th>狀態</th>
                <th>配藥</th>
                <th>收費</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {!list.length && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無帳單紀錄</td></tr>
              )}
              {list.map(r => (
                <tr key={r.id} style={r.paymentStatus === 'paid' ? { opacity: 0.6 } : {}}>
                  <td style={{ fontWeight: 800, color: 'var(--teal-700)' }}>{r.queueNo}</td>
                  <td style={{ fontWeight: 600 }}>{r.patientName}</td>
                  <td>{r.doctor}</td>
                  <td>{r.store}</td>
                  <td style={{ fontSize: 11 }}>{r.services}</td>
                  <td className="money">{fmtM(r.serviceFee)}</td>
                  <td><span className={`tag ${r.status === 'completed' ? 'tag-paid' : 'tag-pending'}`}>{STATUS_LABELS[r.status]}</span></td>
                  <td>
                    <span className={`tag ${DISPENSING_TAGS[r.dispensingStatus] || ''}`}>
                      {DISPENSING_LABELS[r.dispensingStatus]}
                    </span>
                  </td>
                  <td>
                    <span className={`tag ${r.paymentStatus === 'paid' ? 'tag-paid' : 'tag-overdue'}`}>
                      {PAYMENT_LABELS[r.paymentStatus]}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {r.dispensingStatus === 'not-needed' && r.paymentStatus === 'pending' && (
                        <button className="btn btn-teal btn-sm" onClick={() => updateDispensing(r, 'pending')}>需配藥</button>
                      )}
                      {r.dispensingStatus === 'pending' && (
                        <button className="btn btn-gold btn-sm" onClick={() => updateDispensing(r, 'dispensed')}>已配藥</button>
                      )}
                      {r.dispensingStatus === 'dispensed' && (
                        <button className="btn btn-green btn-sm" onClick={() => updateDispensing(r, 'collected')}>已取藥</button>
                      )}
                      {r.paymentStatus === 'pending' && (
                        <button className="btn btn-teal btn-sm" onClick={() => markPaid(r)}>收費</button>
                      )}
                      {r.paymentStatus === 'pending' && (
                        <button className="btn btn-outline btn-sm" onClick={() => quickProcess(r)}>快捷</button>
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => printReceipt(r)}>收據</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {list.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--gray-50)', fontWeight: 700 }}>
                  <td colSpan={5} style={{ textAlign: 'right' }}>合計</td>
                  <td className="money">{fmtM(summary.totalFee)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Print-only receipt */}
      {receiptItem && (
        <div className="print-only" style={{ padding: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <img src="/logo.jpg" alt="康晴綜合醫療中心" style={{ height: 48 }} />
            <h2 style={{ fontSize: 18, marginTop: 8 }}>收據 Receipt</h2>
            <p style={{ fontSize: 11, color: '#888' }}>康晴綜合醫療中心 HONG CHING MEDICAL CENTRE</p>
          </div>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ padding: '4px 0', fontWeight: 600 }}>號碼</td><td>{receiptItem.queueNo}</td></tr>
              <tr><td style={{ padding: '4px 0', fontWeight: 600 }}>日期</td><td>{receiptItem.date}</td></tr>
              <tr><td style={{ padding: '4px 0', fontWeight: 600 }}>病人</td><td>{receiptItem.patientName}</td></tr>
              <tr><td style={{ padding: '4px 0', fontWeight: 600 }}>醫師</td><td>{receiptItem.doctor}</td></tr>
              <tr><td style={{ padding: '4px 0', fontWeight: 600 }}>店舖</td><td>{receiptItem.store}</td></tr>
              <tr><td style={{ padding: '4px 0', fontWeight: 600 }}>服務</td><td>{receiptItem.services}</td></tr>
            </tbody>
          </table>
          <div style={{ borderTop: '2px solid #333', marginTop: 12, paddingTop: 8, fontSize: 16, fontWeight: 800, textAlign: 'right' }}>
            合計：{fmtM(receiptItem.serviceFee)}
          </div>
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#888' }}>
            <p>多謝惠顧 Thank you</p>
          </div>
        </div>
      )}
    </>
  );
}
