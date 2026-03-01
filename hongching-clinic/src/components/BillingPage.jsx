import { useState, useMemo, useCallback } from 'react';
import { saveQueue, saveRevenue, saveInventory } from '../api';
import { uid, fmtM } from '../data';
import { getDoctors } from '../data';
import { getTenantStoreNames, getClinicName, getClinicNameEn, getTenantStores, getTenantSettings } from '../tenant';
import { exportCSV } from '../utils/export';
import escapeHtml from '../utils/escapeHtml';

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
  partial: '部分收費',
  paid: '已收費',
  refunded: '已退款',
};

const STATUS_LABELS = {
  waiting: '等候中',
  'in-consultation': '診症中',
  dispensing: '配藥中',
  billing: '收費中',
  completed: '已完成',
};

const STORES = getTenantStoreNames();

function getToday() {
  return new Date().toISOString().substring(0, 10);
}

export default function BillingPage({ data, setData, showToast, allData, user }) {
  const [filterDate, setFilterDate] = useState(getToday());
  const [filterDoctor, setFilterDoctor] = useState('all');
  const [search, setSearch] = useState('');
  const [receiptItem, setReceiptItem] = useState(null);
  const [partialItem, setPartialItem] = useState(null);
  const [partialAmt, setPartialAmt] = useState('');
  const [partialMethod, setPartialMethod] = useState('FPS');
  const [refundItem, setRefundItem] = useState(null);
  const [refundAmt, setRefundAmt] = useState('');
  const [refundReason, setRefundReason] = useState('');

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

  // ── Revenue Reconciliation (#83) ──
  const reconciliation = useMemo(() => {
    const dayQueue = queue.filter(r => r.date === filterDate);
    const dayRevenue = (data.revenue || []).filter(r => r.date === filterDate);
    // Queue-based billing
    const billedFromQueue = dayQueue.filter(r => r.paymentStatus === 'paid').reduce((s, r) => s + Number(r.serviceFee || 0), 0);
    // Revenue records for this day
    const revenueTotal = dayRevenue.reduce((s, r) => s + Number(r.amount || 0), 0);
    // Discrepancy
    const discrepancy = revenueTotal - billedFromQueue;
    // Payment method breakdown from revenue
    const payBreak = {};
    dayRevenue.forEach(r => {
      const m = r.payment || '其他';
      payBreak[m] = (payBreak[m] || 0) + Number(r.amount || 0);
    });
    // Outstanding (partial + pending)
    const outstanding = dayQueue.filter(r => r.paymentStatus === 'pending' || r.paymentStatus === 'partial');
    const outstandingTotal = outstanding.reduce((s, r) => {
      const fee = Number(r.serviceFee || 0);
      const paid = Number(r.paidAmount || 0);
      return s + (fee - paid);
    }, 0);
    // Refunds
    const refundTotal = dayQueue.filter(r => r.totalRefunded > 0).reduce((s, r) => s + Number(r.totalRefunded || 0), 0);
    return { billedFromQueue, revenueTotal, discrepancy, payBreak, outstanding, outstandingTotal, refundTotal };
  }, [queue, data.revenue, filterDate]);

  // Update dispensing status
  const updateDispensing = useCallback(async (item, newStatus) => {
    const updated = { ...item, dispensingStatus: newStatus };
    await saveQueue(updated);
    setData({ ...data, queue: queue.map(q => q.id === item.id ? updated : q) });
    showToast(`${item.queueNo} ${DISPENSING_LABELS[newStatus]}`);
  }, [data, queue, setData, showToast]);

  // ── Auto-deduct inventory stock ──
  const deductStock = useCallback(async (item) => {
    const rx = item.prescription || [];
    if (!rx.length) return;
    const inventory = data.inventory || [];
    const days = Number(item.formulaDays) || 1;
    let deducted = 0;
    let warnings = [];
    const updatedInventory = [...inventory];

    for (const herb of rx) {
      if (!herb.herb) continue;
      const dosagePerDay = parseFloat(herb.dosage) || 0;
      const totalQty = dosagePerDay * days;
      if (totalQty <= 0) continue;

      const idx = updatedInventory.findIndex(inv => inv.name === herb.herb && inv.store === (item.store || getTenantStoreNames()[0]));
      if (idx < 0) {
        // Try any store
        const anyIdx = updatedInventory.findIndex(inv => inv.name === herb.herb);
        if (anyIdx < 0) continue; // Not in inventory
        const inv = updatedInventory[anyIdx];
        if (Number(inv.stock) < totalQty) {
          warnings.push(`${herb.herb} 庫存不足 (現有 ${inv.stock}${inv.unit}，需 ${totalQty}${inv.unit})`);
        }
        updatedInventory[anyIdx] = { ...inv, stock: Math.max(0, Number(inv.stock) - totalQty) };
        await saveInventory(updatedInventory[anyIdx]);
        deducted++;
      } else {
        const inv = updatedInventory[idx];
        if (Number(inv.stock) < totalQty) {
          warnings.push(`${herb.herb} 庫存不足 (現有 ${inv.stock}${inv.unit}，需 ${totalQty}${inv.unit})`);
        }
        updatedInventory[idx] = { ...inv, stock: Math.max(0, Number(inv.stock) - totalQty) };
        await saveInventory(updatedInventory[idx]);
        deducted++;
      }
    }

    if (deducted > 0) {
      setData(prev => ({ ...prev, inventory: updatedInventory }));
    }
    if (warnings.length) {
      showToast(`庫存警告：${warnings[0]}${warnings.length > 1 ? ` 等 ${warnings.length} 項` : ''}`);
    }
    return deducted;
  }, [data, setData, showToast]);

  // ── Partial Payment (#47) ──
  const handlePartialPay = useCallback(async () => {
    if (!partialItem) return;
    const amt = Number(partialAmt);
    if (!amt || amt <= 0) return showToast('請輸入有效金額');
    const totalFee = Number(partialItem.serviceFee || 0);
    const prevPaid = Number(partialItem.paidAmount || 0);
    const newPaid = prevPaid + amt;
    const isFullyPaid = newPaid >= totalFee;

    const payments = [...(partialItem.payments || []), { amount: amt, method: partialMethod, date: getToday(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }];
    const updated = {
      ...partialItem,
      paidAmount: newPaid,
      payments,
      paymentStatus: isFullyPaid ? 'paid' : 'partial',
      status: isFullyPaid ? 'completed' : partialItem.status,
      completedAt: isFullyPaid ? new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : partialItem.completedAt,
    };
    await saveQueue(updated);

    // Create revenue record for partial payment
    const revRecord = {
      id: uid(), date: partialItem.date, name: partialItem.patientName,
      item: partialItem.services, amount: amt, payment: partialMethod,
      store: partialItem.store, doctor: partialItem.doctor,
      note: `掛號 ${partialItem.queueNo}（部分收費 ${newPaid}/${totalFee}）`,
    };
    await saveRevenue(revRecord);
    const updatedRevenue = [...(data.revenue || []), revRecord];
    setData({ ...data, queue: queue.map(q => q.id === partialItem.id ? updated : q), revenue: updatedRevenue });
    if (isFullyPaid) await deductStock(partialItem);
    setPartialItem(null);
    setPartialAmt('');
    showToast(`已收取部分款項 ${fmtM(amt)}${isFullyPaid ? '（已全額收費）' : ''}`);
  }, [partialItem, partialAmt, partialMethod, data, queue, setData, showToast, deductStock]);

  // ── Refund (#47) ──
  const handleRefund = useCallback(async () => {
    if (!refundItem) return;
    const amt = Number(refundAmt);
    if (!amt || amt <= 0) return showToast('請輸入退款金額');
    const maxRefund = Number(refundItem.paidAmount || refundItem.serviceFee || 0);
    if (amt > maxRefund) return showToast(`退款金額不能超過已收金額 ${fmtM(maxRefund)}`);

    const refunds = [...(refundItem.refunds || []), { amount: amt, reason: refundReason, date: getToday(), time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), by: user?.name || 'admin' }];
    const totalRefunded = refunds.reduce((s, r) => s + r.amount, 0);
    const updated = { ...refundItem, refunds, totalRefunded, paymentStatus: totalRefunded >= maxRefund ? 'refunded' : 'paid' };
    await saveQueue(updated);

    // Create negative revenue record
    const revRecord = {
      id: uid(), date: getToday(), name: refundItem.patientName,
      item: `退款 - ${refundReason || refundItem.services}`, amount: -amt, payment: 'refund',
      store: refundItem.store, doctor: refundItem.doctor,
      note: `退款：${refundReason || '無'}（掛號 ${refundItem.queueNo}）`,
    };
    await saveRevenue(revRecord);
    const updatedRevenue = [...(data.revenue || []), revRecord];
    setData({ ...data, queue: queue.map(q => q.id === refundItem.id ? updated : q), revenue: updatedRevenue });
    setRefundItem(null);
    setRefundAmt('');
    setRefundReason('');
    showToast(`已退款 ${fmtM(amt)}`);
  }, [refundItem, refundAmt, refundReason, data, queue, setData, showToast, user]);

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
    // Auto-deduct inventory
    await deductStock(item);
    showToast(`${item.queueNo} 已收費 ${fmtM(item.serviceFee)}`);
  }, [data, queue, setData, showToast, deductStock]);

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
    // Auto-deduct inventory
    await deductStock(item);
    showToast(`${item.queueNo} 快捷收費完成`);
  }, [data, queue, setData, showToast, deductStock]);

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

  // ── Daily Closing Report (#54) ──
  const printDailyClose = useCallback(() => {
    const dayItems = queue.filter(r => r.date === filterDate);
    const paidItems = dayItems.filter(r => r.paymentStatus === 'paid');
    const refundedItems = dayItems.filter(r => r.totalRefunded > 0);
    const totalRevenue = paidItems.reduce((s, r) => s + Number(r.serviceFee || 0), 0);
    const totalRefunds = refundedItems.reduce((s, r) => s + Number(r.totalRefunded || 0), 0);
    const netRevenue = totalRevenue - totalRefunds;

    // Payment method breakdown
    const payMethods = {};
    paidItems.forEach(r => {
      const method = r.paymentMethod || 'FPS';
      payMethods[method] = (payMethods[method] || 0) + Number(r.serviceFee || 0);
    });

    // Doctor breakdown
    const docBreak = {};
    paidItems.forEach(r => {
      if (!docBreak[r.doctor]) docBreak[r.doctor] = { count: 0, amount: 0 };
      docBreak[r.doctor].count++;
      docBreak[r.doctor].amount += Number(r.serviceFee || 0);
    });

    // Store breakdown
    const storeBreak = {};
    paidItems.forEach(r => {
      if (!storeBreak[r.store]) storeBreak[r.store] = { count: 0, amount: 0 };
      storeBreak[r.store].count++;
      storeBreak[r.store].amount += Number(r.serviceFee || 0);
    });

    // Dispensing stats
    const dispStats = { pending: 0, dispensed: 0, collected: 0, notNeeded: 0 };
    dayItems.forEach(r => {
      if (r.dispensingStatus === 'pending') dispStats.pending++;
      else if (r.dispensingStatus === 'dispensed') dispStats.dispensed++;
      else if (r.dispensingStatus === 'collected') dispStats.collected++;
      else dispStats.notNeeded++;
    });

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>日結報告 ${filterDate}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: 'Microsoft YaHei', 'PingFang TC', sans-serif; font-size: 13px; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; }
        h1 { font-size: 18px; text-align: center; margin-bottom: 4px; }
        .subtitle { text-align: center; color: #888; font-size: 11px; margin-bottom: 20px; }
        h2 { font-size: 14px; border-bottom: 2px solid #0e7490; padding-bottom: 4px; margin-top: 20px; color: #0e7490; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f8f8f8; font-weight: 700; font-size: 12px; }
        .right { text-align: right; }
        .total-row { font-weight: 800; background: #f0fdfa; font-size: 14px; }
        .sign { margin-top: 40px; display: flex; justify-content: space-between; }
        .sign-box { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 6px; font-size: 11px; color: #888; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
        .summary-box { border: 1px solid #ddd; border-radius: 8px; padding: 12px; text-align: center; }
        .summary-box .num { font-size: 22px; font-weight: 800; }
        .summary-box .lbl { font-size: 10px; color: #888; }
        @media print { body { margin: 0; padding: 10mm; } }
      </style>
    </head><body>
      <h1>${escapeHtml(getClinicName())} — 日結報告</h1>
      <div class="subtitle">DAILY CLOSING REPORT | ${filterDate} | 列印時間：${new Date().toLocaleString('zh-HK')}</div>

      <div class="summary-grid">
        <div class="summary-box"><div class="num" style="color:#0e7490">${dayItems.length}</div><div class="lbl">總帳單</div></div>
        <div class="summary-box"><div class="num" style="color:#16a34a">${paidItems.length}</div><div class="lbl">已收費</div></div>
        <div class="summary-box"><div class="num" style="color:#0e7490">$${totalRevenue.toLocaleString()}</div><div class="lbl">總收入</div></div>
        <div class="summary-box"><div class="num" style="color:#dc2626">$${netRevenue.toLocaleString()}</div><div class="lbl">淨收入</div></div>
      </div>

      <h2>付款方式明細</h2>
      <table>
        <thead><tr><th>付款方式</th><th class="right">金額</th><th class="right">筆數</th></tr></thead>
        <tbody>
          ${Object.entries(payMethods).map(([m, amt]) => `<tr><td>${escapeHtml(m)}</td><td class="right">$${amt.toLocaleString()}</td><td class="right">${paidItems.filter(r => (r.paymentMethod || 'FPS') === m).length}</td></tr>`).join('')}
          <tr class="total-row"><td>合計</td><td class="right">$${totalRevenue.toLocaleString()}</td><td class="right">${paidItems.length}</td></tr>
          ${totalRefunds > 0 ? `<tr style="color:#dc2626"><td>退款</td><td class="right">-$${totalRefunds.toLocaleString()}</td><td class="right">${refundedItems.length}</td></tr>` : ''}
        </tbody>
      </table>

      <h2>醫師業績</h2>
      <table>
        <thead><tr><th>醫師</th><th class="right">帳單數</th><th class="right">金額</th></tr></thead>
        <tbody>
          ${Object.entries(docBreak).map(([d, v]) => `<tr><td>${escapeHtml(d)}</td><td class="right">${v.count}</td><td class="right">$${v.amount.toLocaleString()}</td></tr>`).join('')}
        </tbody>
      </table>

      <h2>分店收入</h2>
      <table>
        <thead><tr><th>分店</th><th class="right">帳單數</th><th class="right">金額</th></tr></thead>
        <tbody>
          ${Object.entries(storeBreak).map(([s, v]) => `<tr><td>${escapeHtml(s)}</td><td class="right">${v.count}</td><td class="right">$${v.amount.toLocaleString()}</td></tr>`).join('')}
        </tbody>
      </table>

      <h2>配藥統計</h2>
      <table>
        <thead><tr><th>狀態</th><th class="right">數量</th></tr></thead>
        <tbody>
          <tr><td>已取藥</td><td class="right">${dispStats.collected}</td></tr>
          <tr><td>已配藥</td><td class="right">${dispStats.dispensed}</td></tr>
          <tr><td>配藥中</td><td class="right">${dispStats.pending}</td></tr>
          <tr><td>不需配藥</td><td class="right">${dispStats.notNeeded}</td></tr>
        </tbody>
      </table>

      <div class="sign">
        <div class="sign-box">收銀員簽名</div>
        <div class="sign-box">店長確認</div>
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }, [queue, filterDate]);

  // Generate sequential receipt number
  const getReceiptNo = (item) => {
    const dateStr = (item.date || '').replace(/-/g, '');
    const storeNames = getTenantStoreNames();
    const storeIdx = storeNames.indexOf(item.store);
    const storeCode = storeIdx >= 0 ? `S${storeIdx + 1}` : 'S1';
    // Use queue position for sequential number
    const dayItems = queue.filter(q => q.date === item.date && q.store === item.store && q.paymentStatus === 'paid');
    const idx = dayItems.findIndex(q => q.id === item.id);
    const seq = String(idx >= 0 ? idx + 1 : dayItems.length + 1).padStart(3, '0');
    return `HC-${storeCode}-${dateStr}-${seq}`;
  };

  // Print professional receipt in new window
  const printReceipt = (item) => {
    setReceiptItem(item);
    const clinicInfo = (() => { try { return JSON.parse(localStorage.getItem('hcmc_clinic') || '{}'); } catch { return {}; } })();
    const brNo = clinicInfo?.brNo || '________';
    const receiptNo = getReceiptNo(item);
    const tenantStores = getTenantStores();
    const matchedStore = tenantStores.find(s => s.name === item.store);
    const storeAddr = matchedStore?.address || clinicInfo?.addr1 || '';

    // Parse services into itemized list
    const services = (item.services || '').split(/[,、+]/).map(s => s.trim()).filter(Boolean);
    const consultFee = Number(item.consultFee || 0);
    const medFee = Number(item.medicineFee || 0);
    const totalFee = Number(item.serviceFee || 0);
    // If not itemized, treat total as single item
    const hasBreakdown = consultFee > 0 || medFee > 0;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>收據 ${receiptNo}</title>
      <style>
        @page { size: 80mm auto; margin: 2mm; }
        body { font-family: 'Microsoft YaHei', 'PingFang TC', monospace; margin: 0; padding: 8mm; max-width: 76mm; font-size: 11px; color: #000; }
        .center { text-align: center; }
        .bold { font-weight: 800; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .double-divider { border-top: 2px solid #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        .row-label { min-width: 55px; }
        .right { text-align: right; }
        .total { font-size: 14px; font-weight: 800; }
        .small { font-size: 9px; color: #666; }
        table { width: 100%; border-collapse: collapse; }
        table td { padding: 2px 0; font-size: 11px; }
        table .amt { text-align: right; }
        @media print { body { margin: 0; padding: 4mm; } }
      </style>
    </head><body>
      <div class="center">
        <div class="bold" style="font-size:14px">${escapeHtml(getClinicName())}</div>
        <div class="small">${escapeHtml(getClinicNameEn().toUpperCase())}</div>
        <div class="small">${escapeHtml(storeAddr)}</div>
      </div>
      <div class="double-divider"></div>
      <div class="center bold" style="font-size:12px">正式收據 RECEIPT</div>
      <div class="divider"></div>
      <div class="row"><span>收據編號：</span><span class="bold">${escapeHtml(receiptNo)}</span></div>
      <div class="row"><span>日期：</span><span>${escapeHtml(item.date)}</span></div>
      <div class="row"><span>時間：</span><span>${escapeHtml(item.completedAt || item.registeredAt || '-')}</span></div>
      <div class="row"><span>商業登記：</span><span>${escapeHtml(brNo)}</span></div>
      <div class="divider"></div>
      <div class="row"><span class="row-label">病人姓名：</span><span>${escapeHtml(item.patientName)}</span></div>
      <div class="row"><span class="row-label">主診醫師：</span><span>${escapeHtml(item.doctor)}</span></div>
      <div class="row"><span class="row-label">掛號編號：</span><span>${escapeHtml(item.queueNo || '-')}</span></div>
      <div class="divider"></div>
      <div class="bold" style="margin-bottom:4px">收費項目：</div>
      <table>
        ${hasBreakdown ? `
          ${consultFee > 0 ? `<tr><td>診金 Consultation Fee</td><td class="amt">$${consultFee.toLocaleString()}</td></tr>` : ''}
          ${medFee > 0 ? `<tr><td>藥費 Medicine Fee</td><td class="amt">$${medFee.toLocaleString()}</td></tr>` : ''}
          ${totalFee - consultFee - medFee > 0 ? `<tr><td>其他 Others</td><td class="amt">$${(totalFee - consultFee - medFee).toLocaleString()}</td></tr>` : ''}
        ` : `
          ${services.map(s => `<tr><td>${escapeHtml(s)}</td><td class="amt"></td></tr>`).join('')}
          <tr><td>費用 Fee</td><td class="amt">$${totalFee.toLocaleString()}</td></tr>
        `}
      </table>
      <div class="double-divider"></div>
      <div class="row total"><span>合計 TOTAL：</span><span>HK$ ${totalFee.toLocaleString()}</span></div>
      <div class="row"><span>付款方式：</span><span>${escapeHtml(item.paymentMethod || 'FPS')}</span></div>
      <div class="divider"></div>
      <div class="center small" style="margin-top:8px">
        <div>此收據可用作醫療費用扣稅憑證</div>
        <div>This receipt is valid for tax deduction purposes</div>
        <div style="margin-top:6px">多謝惠顧 Thank You</div>
        <div style="margin-top:4px">${escapeHtml(getTenantSettings()?.website || '')}</div>
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid" role="status" aria-live="polite" aria-label="收費統計摘要">
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
          {getDoctors().map(d => <option key={d}>{d}</option>)}
        </select>
        <button className="btn btn-outline" onClick={handleExport}>匯出Excel</button>
        <button className="btn btn-gold" onClick={() => printDailyClose()}>日結報告</button>
      </div>

      {/* Revenue Reconciliation (#83) */}
      <div className="grid-2" style={{ marginBottom: 0 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 600, marginBottom: 8 }}>收入核對 ({filterDate})</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 10, color: 'var(--gray-400)' }}>帳單收費</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal-700)' }}>{fmtM(reconciliation.billedFromQueue)}</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--gray-400)' }}>營業紀錄</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green-600)' }}>{fmtM(reconciliation.revenueTotal)}</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--gray-400)' }}>差異</div><div style={{ fontSize: 18, fontWeight: 800, color: Math.abs(reconciliation.discrepancy) > 1 ? '#dc2626' : 'var(--green-600)' }}>{reconciliation.discrepancy > 0 ? '+' : ''}{fmtM(reconciliation.discrepancy)}</div></div>
            {reconciliation.refundTotal > 0 && <div><div style={{ fontSize: 10, color: 'var(--gray-400)' }}>退款</div><div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626' }}>-{fmtM(reconciliation.refundTotal)}</div></div>}
          </div>
          {Math.abs(reconciliation.discrepancy) > 1 && (
            <div style={{ marginTop: 8, padding: 6, background: '#fef2f2', borderRadius: 6, fontSize: 11, color: '#dc2626' }}>
              帳單收費與營業紀錄不一致，請核實
            </div>
          )}
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 600, marginBottom: 8 }}>付款方式明細</div>
          {Object.keys(reconciliation.payBreak).length > 0 ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {Object.entries(reconciliation.payBreak).sort((a, b) => b[1] - a[1]).map(([m, amt]) => (
                <div key={m} style={{ textAlign: 'center', padding: '4px 8px', background: 'var(--gray-50)', borderRadius: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--teal-700)' }}>{fmtM(amt)}</div>
                  <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{m}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#aaa', fontSize: 12 }}>今日暫無收入紀錄</div>
          )}
          {reconciliation.outstandingTotal > 0 && (
            <div style={{ marginTop: 8, padding: 6, background: '#fffbeb', borderRadius: 6, fontSize: 11, color: '#d97706' }}>
              未收費餘額：{fmtM(reconciliation.outstandingTotal)}（{reconciliation.outstanding.length} 筆）
            </div>
          )}
        </div>
      </div>

      {/* Billing Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header">
          <h3>配藥/收費列表</h3>
        </div>
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table aria-label="配藥及收費列表">
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
                    <span className={`tag ${r.paymentStatus === 'paid' ? 'tag-paid' : r.paymentStatus === 'partial' ? 'tag-pending-orange' : r.paymentStatus === 'refunded' ? 'tag-other' : 'tag-overdue'}`}>
                      {PAYMENT_LABELS[r.paymentStatus] || r.paymentStatus}
                    </span>
                    {r.paidAmount > 0 && r.paymentStatus === 'partial' && (
                      <div style={{ fontSize: 10, color: 'var(--gray-500)', marginTop: 2 }}>{fmtM(r.paidAmount)}/{fmtM(r.serviceFee)}</div>
                    )}
                    {r.totalRefunded > 0 && (
                      <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>退 {fmtM(r.totalRefunded)}</div>
                    )}
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
                      {(r.paymentStatus === 'pending' || r.paymentStatus === 'partial') && (
                        <button className="btn btn-teal btn-sm" onClick={() => markPaid(r)}>收費</button>
                      )}
                      {(r.paymentStatus === 'pending' || r.paymentStatus === 'partial') && (
                        <button className="btn btn-gold btn-sm" onClick={() => { setPartialItem(r); setPartialAmt(''); setPartialMethod('FPS'); }}>部分</button>
                      )}
                      {r.paymentStatus === 'pending' && (
                        <button className="btn btn-outline btn-sm" onClick={() => quickProcess(r)}>快捷</button>
                      )}
                      {r.paymentStatus === 'paid' && (
                        <button className="btn btn-red btn-sm" onClick={() => { setRefundItem(r); setRefundAmt(''); setRefundReason(''); }}>退款</button>
                      )}
                      <button className="btn btn-outline btn-sm" onClick={() => printReceipt(r)}>收據</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {list.length > 0 && (
              <tfoot role="status" aria-live="polite">
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

      {/* Partial Payment Modal (#47) */}
      {partialItem && (
        <div className="modal-overlay" onClick={() => setPartialItem(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3>部分收費</h3>
            <div style={{ fontSize: 13, marginBottom: 12, color: 'var(--gray-600)' }}>
              <strong>{partialItem.patientName}</strong> ({partialItem.queueNo})<br />
              總費用：<strong>{fmtM(partialItem.serviceFee)}</strong>
              {partialItem.paidAmount > 0 && <> ・已收：<strong>{fmtM(partialItem.paidAmount)}</strong> ・餘額：<strong>{fmtM(Number(partialItem.serviceFee) - Number(partialItem.paidAmount || 0))}</strong></>}
            </div>
            {(partialItem.payments || []).length > 0 && (
              <div style={{ marginBottom: 12, fontSize: 11, background: 'var(--gray-50)', padding: 8, borderRadius: 6 }}>
                <strong>付款紀錄：</strong>
                {partialItem.payments.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span>{p.date} {p.time}</span>
                    <span>{fmtM(p.amount)} ({p.method})</span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label>收取金額 *</label>
                <input type="number" value={partialAmt} onChange={e => setPartialAmt(e.target.value)} placeholder="金額" autoFocus />
              </div>
              <div>
                <label>付款方式</label>
                <select value={partialMethod} onChange={e => setPartialMethod(e.target.value)}>
                  <option>FPS</option><option>現金</option><option>信用卡</option><option>八達通</option><option>微信</option><option>支付寶</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-teal" onClick={handlePartialPay}>確認收費</button>
              <button className="btn btn-outline" onClick={() => setPartialItem(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal (#47) */}
      {refundItem && (
        <div className="modal-overlay" onClick={() => setRefundItem(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <h3 style={{ color: '#dc2626' }}>退款處理</h3>
            <div style={{ fontSize: 13, marginBottom: 12, color: 'var(--gray-600)' }}>
              <strong>{refundItem.patientName}</strong> ({refundItem.queueNo})<br />
              已收費：<strong>{fmtM(refundItem.paidAmount || refundItem.serviceFee)}</strong>
              {refundItem.totalRefunded > 0 && <> ・已退：<strong style={{ color: '#dc2626' }}>{fmtM(refundItem.totalRefunded)}</strong></>}
            </div>
            {(refundItem.refunds || []).length > 0 && (
              <div style={{ marginBottom: 12, fontSize: 11, background: '#fef2f2', padding: 8, borderRadius: 6 }}>
                <strong>退款紀錄：</strong>
                {refundItem.refunds.map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span>{r.date} {r.time} - {r.reason || '無原因'}</span>
                    <span style={{ color: '#dc2626' }}>-{fmtM(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label>退款金額 *</label>
              <input type="number" value={refundAmt} onChange={e => setRefundAmt(e.target.value)} placeholder="退款金額" autoFocus />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>退款原因</label>
              <input value={refundReason} onChange={e => setRefundReason(e.target.value)} placeholder="退款原因（選填）" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-red" onClick={handleRefund}>確認退款</button>
              <button className="btn btn-outline" onClick={() => setRefundItem(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Print-only receipt (fallback) */}
      {receiptItem && (
        <div className="print-only" style={{ padding: 24, maxWidth: 280, margin: '0 auto', fontFamily: "'Microsoft YaHei', monospace" }}>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{getClinicName()}</div>
            <div style={{ fontSize: 9, color: '#666' }}>{getClinicNameEn().toUpperCase()}</div>
          </div>
          <div style={{ borderTop: '2px solid #000', margin: '6px 0' }} />
          <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 12 }}>正式收據 RECEIPT</div>
          <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ padding: '2px 0' }}>收據編號：</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{getReceiptNo(receiptItem)}</td></tr>
              <tr><td style={{ padding: '2px 0' }}>日期：</td><td style={{ textAlign: 'right' }}>{receiptItem.date}</td></tr>
              <tr><td style={{ padding: '2px 0' }}>病人：</td><td style={{ textAlign: 'right' }}>{receiptItem.patientName}</td></tr>
              <tr><td style={{ padding: '2px 0' }}>醫師：</td><td style={{ textAlign: 'right' }}>{receiptItem.doctor}</td></tr>
              <tr><td style={{ padding: '2px 0' }}>掛號：</td><td style={{ textAlign: 'right' }}>{receiptItem.queueNo}</td></tr>
            </tbody>
          </table>
          <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
          <div style={{ fontSize: 11, marginBottom: 4, fontWeight: 700 }}>收費項目：</div>
          <div style={{ fontSize: 11 }}>{receiptItem.services}</div>
          <div style={{ borderTop: '2px solid #000', marginTop: 8, paddingTop: 6, fontSize: 14, fontWeight: 800, display: 'flex', justifyContent: 'space-between' }}>
            <span>合計 TOTAL：</span><span>HK$ {Number(receiptItem.serviceFee).toLocaleString()}</span>
          </div>
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 9, color: '#888' }}>
            <div>此收據可用作醫療費用扣稅憑證</div>
            <div style={{ marginTop: 4 }}>多謝惠顧 Thank You</div>
          </div>
        </div>
      )}
    </>
  );
}
