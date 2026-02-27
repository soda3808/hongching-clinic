import { useState, useMemo } from 'react';
import { getDoctors, getStoreNames, getDefaultStore } from '../data';
import { getClinicName } from '../tenant';

const today = () => new Date().toISOString().substring(0, 10);
const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const STATUS_LABELS = { waiting: '等候中', 'in-consultation': '診症中', dispensing: '配藥中', billing: '收費中', completed: '已完成' };
const STATUS_COLORS = { waiting: '#d97706', 'in-consultation': '#7c3aed', dispensing: '#0e7490', billing: '#2563eb', completed: '#16a34a' };

/* ── Auto-assign queue numbers ── */
function assignQueueNumbers(items) {
  let counter = 0;
  return items.map(r => {
    counter++;
    return { ...r, _queueNum: r.queueNo || ('A' + String(counter).padStart(3, '0')) };
  });
}

/* ── Print: Waiting Slip (80mm thermal) ── */
const slipCSS = `
  @page{size:80mm auto;margin:0}
  body{margin:0;font-family:'Microsoft YaHei','PingFang TC',sans-serif;width:80mm;color:#333}
  .slip{padding:6mm 4mm;text-align:center}
  .slip-logo{font-size:14px;font-weight:800;color:#0e7490;margin-bottom:2px}
  .slip-sub{font-size:8px;color:#888;margin-bottom:6px;border-bottom:1px dashed #ccc;padding-bottom:6px}
  .slip-num{font-size:48px;font-weight:900;color:#0e7490;margin:10px 0;letter-spacing:4px;line-height:1}
  .slip-label{font-size:10px;color:#888;margin-bottom:8px}
  .slip-info{font-size:12px;text-align:left;margin:8px 0;line-height:1.8}
  .slip-info b{display:inline-block;min-width:55px;color:#555}
  .slip-wait{margin:10px 0;padding:6px;border:1px dashed #0e7490;border-radius:4px;font-size:11px;color:#0e7490;font-weight:700}
  .slip-time{font-size:10px;color:#888;margin:8px 0}
  .slip-footer{border-top:1px dashed #ccc;padding-top:6px;margin-top:10px;font-size:10px;color:#666;font-weight:700}
  .slip-foot2{font-size:8px;color:#aaa;margin-top:4px}
  @media print{body{margin:0}}
`;

/* ── Print: Doctor Registration Table (A4) ── */
const tableCSS = `
  @page{size:A4 landscape;margin:15mm}
  body{margin:0;font-family:'Microsoft YaHei','PingFang TC',sans-serif;color:#333;padding:20px 30px}
  h1{font-size:18px;color:#0e7490;text-align:center;margin:0 0 4px}
  .sub{text-align:center;font-size:12px;color:#888;margin-bottom:16px}
  table{width:100%;border-collapse:collapse}
  th{background:#0e7490;color:#fff;padding:8px 12px;font-size:12px;text-align:left}
  td{padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:13px}
  tr:nth-child(even){background:#f9fafb}
  .tag{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;color:#fff}
  .footer{text-align:center;font-size:9px;color:#aaa;margin-top:20px;border-top:1px solid #eee;padding-top:8px}
  @media print{body{margin:0;padding:10mm}}
`;

export default function QueueSlip({ data, showToast, user }) {
  const [filterDoctor, setFilterDoctor] = useState('all');

  const doctors = getDoctors();
  const storeNames = getStoreNames();
  const defaultStore = getDefaultStore();
  const clinicName = getClinicName();
  const todayStr = today();

  const queue = data.queue || [];

  /* ── Today's queue with auto-numbering ── */
  const todayQueue = useMemo(() => {
    let q = queue.filter(r => r.date === todayStr);
    if (filterDoctor !== 'all') q = q.filter(r => r.doctor === filterDoctor);
    q = q.sort((a, b) => (a.queueNo || '').localeCompare(b.queueNo || '') || (a.registeredAt || '').localeCompare(b.registeredAt || ''));
    return assignQueueNumbers(q);
  }, [queue, todayStr, filterDoctor]);

  const stats = useMemo(() => ({
    total: todayQueue.length,
    waiting: todayQueue.filter(r => r.status === 'waiting').length,
    inConsult: todayQueue.filter(r => r.status === 'in-consultation').length,
    completed: todayQueue.filter(r => r.status === 'completed').length,
  }), [todayQueue]);

  const avgWait = useMemo(() => {
    const waitCount = todayQueue.filter(r => r.status === 'waiting').length;
    return waitCount * 15; // default 15 min per patient
  }, [todayQueue]);

  /* ── Print waiting slip ── */
  const printSlip = (item) => {
    const estWait = todayQueue.filter(r => r.status === 'waiting' && (r._queueNum || '') < (item._queueNum || '')).length * 15;
    const w = window.open('', '_blank');
    if (!w) return showToast?.('請允許彈出視窗');
    w.document.write(`<!DOCTYPE html><html><head><title>候診號碼</title><style>${slipCSS}</style></head><body>
      <div class="slip">
        <div class="slip-logo">${clinicName}</div>
        <div class="slip-sub">${item.store || defaultStore}</div>
        <div class="slip-label">候診號碼 Queue Number</div>
        <div class="slip-num">${item._queueNum}</div>
        <div class="slip-info">
          <div><b>姓名：</b>${item.patientName}</div>
          <div><b>醫師：</b>${item.doctor}</div>
          <div><b>服務：</b>${item.services || '-'}</div>
        </div>
        <div class="slip-wait">預計等候時間：約 ${Math.max(5, estWait)} 分鐘</div>
        <div class="slip-time">${todayStr}　${item.registeredAt || nowTime()}</div>
        <div class="slip-footer">請保留此號碼紙</div>
        <div class="slip-foot2">Please keep this slip for your reference</div>
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
    showToast?.(`已列印 ${item._queueNum} 候診票`);
  };

  /* ── Print doctor registration table ── */
  const printDoctorTable = (docName) => {
    const items = todayQueue.filter(r => docName === 'all' || r.doctor === docName);
    if (!items.length) return showToast?.('該醫師今日無病人');
    const w = window.open('', '_blank');
    if (!w) return showToast?.('請允許彈出視窗');

    const rows = items.map((r, i) => {
      const age = r.patientAge || r.age || '-';
      const gender = r.patientGender || r.gender || '-';
      const statusColor = STATUS_COLORS[r.status] || '#888';
      return `<tr>
        <td style="font-weight:800;color:#0e7490">${r._queueNum}</td>
        <td>${r.registeredAt || '-'}</td>
        <td style="font-weight:600">${r.patientName}</td>
        <td>${gender}</td>
        <td>${age}</td>
        <td style="font-size:11px">${r.services || '-'}</td>
        <td><span class="tag" style="background:${statusColor}">${STATUS_LABELS[r.status] || r.status}</span></td>
      </tr>`;
    }).join('');

    const doctorLabel = docName === 'all' ? '全部醫師' : docName;
    w.document.write(`<!DOCTYPE html><html><head><title>醫師登記表</title><style>${tableCSS}</style></head><body>
      <h1>${clinicName} — 醫師登記表</h1>
      <div class="sub">${doctorLabel}　|　${todayStr}　|　${storeNames[0] || defaultStore}　|　共 ${items.length} 人</div>
      <table>
        <thead><tr><th>排號</th><th>時間</th><th>姓名</th><th>性別</th><th>年齡</th><th>服務</th><th>狀態</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">列印時間：${todayStr} ${nowTime()} | ${clinicName}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
    showToast?.(`已列印 ${doctorLabel} 登記表 (${items.length} 人)`);
  };

  /* ── Batch print slips ── */
  const printAllSlips = () => {
    const waiting = todayQueue.filter(r => r.status === 'waiting');
    if (!waiting.length) return showToast?.('沒有等候中的病人');
    const w = window.open('', '_blank');
    if (!w) return showToast?.('請允許彈出視窗');
    const body = waiting.map(item => {
      const estWait = todayQueue.filter(r => r.status === 'waiting' && (r._queueNum || '') < (item._queueNum || '')).length * 15;
      return `<div class="slip" style="page-break-after:always">
        <div class="slip-logo">${clinicName}</div>
        <div class="slip-sub">${item.store || defaultStore}</div>
        <div class="slip-label">候診號碼 Queue Number</div>
        <div class="slip-num">${item._queueNum}</div>
        <div class="slip-info">
          <div><b>姓名：</b>${item.patientName}</div>
          <div><b>醫師：</b>${item.doctor}</div>
          <div><b>服務：</b>${item.services || '-'}</div>
        </div>
        <div class="slip-wait">預計等候時間：約 ${Math.max(5, estWait)} 分鐘</div>
        <div class="slip-time">${todayStr}　${item.registeredAt || nowTime()}</div>
        <div class="slip-footer">請保留此號碼紙</div>
        <div class="slip-foot2">Please keep this slip for your reference</div>
      </div>`;
    }).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>批量候診票</title><style>${slipCSS} .slip{page-break-after:always} .slip:last-child{page-break-after:auto}</style></head><body>${body}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
    showToast?.(`已列印 ${waiting.length} 張候診票`);
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">今日排隊</div><div className="stat-value teal">{stats.total}</div></div>
        <div className="stat-card gold"><div className="stat-label">等候中</div><div className="stat-value gold">{stats.waiting}</div></div>
        <div className="stat-card green"><div className="stat-label">診症中</div><div className="stat-value green">{stats.inConsult}</div></div>
        <div className="stat-card blue"><div className="stat-label">已完成</div><div className="stat-value blue">{stats.completed}</div></div>
      </div>

      {/* Filters + Actions */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterDoctor} onChange={e => setFilterDoctor(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">全部醫師</option>
          {doctors.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-teal btn-sm" onClick={printAllSlips}>批量列印候診票</button>
        <button className="btn btn-outline btn-sm" onClick={() => printDoctorTable(filterDoctor)}>列印登記表</button>
      </div>

      {/* Queue List */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header"><h3>今日候診列表 ({todayQueue.length})</h3></div>
        <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>排號</th>
                <th>病人</th>
                <th>醫師</th>
                <th>服務</th>
                <th>掛號時間</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {todayQueue.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 30 }}>今日暫無候診紀錄</td></tr>
              )}
              {todayQueue.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 800, fontSize: 15, color: '#0e7490' }}>{r._queueNum}</td>
                  <td style={{ fontWeight: 600 }}>{r.patientName}</td>
                  <td>{r.doctor}</td>
                  <td style={{ fontSize: 11 }}>{r.services || '-'}</td>
                  <td style={{ fontSize: 12, color: '#666' }}>{r.registeredAt || '-'}</td>
                  <td>
                    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, color: '#fff', background: STATUS_COLORS[r.status] || '#888' }}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-teal btn-sm" onClick={() => printSlip(r)}>列印候診票</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
