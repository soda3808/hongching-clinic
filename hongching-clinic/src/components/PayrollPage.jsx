import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { uid, fmtM, fmt } from '../data';

// ── Constants ──
const STORAGE_KEY = 'hcmc_payroll';
const ATTENDANCE_KEY = 'hcmc_attendance';

const STATUS_LABELS = { pending: '待確認', confirmed: '已確認', paid: '已發放' };
const STATUS_COLORS = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  confirmed: { bg: '#dbeafe', color: '#1e40af' },
  paid: { bg: '#d1fae5', color: '#065f46' },
};

const DEFAULT_SETTINGS = {
  mpfEmployeeRate: 0.05,
  mpfEmployerRate: 0.05,
  mpfCap: 1500,
  overtimeMultiplier: 1.5,
  payDay: 5,
  defaultSalaries: { '醫師': 45000, '護士': 22000, '前台': 18000 },
};

const SEED_PAYROLLS = [
  {
    id: 'seed_pr_001', month: '2026-02', staffId: 'staff_zhang', staffName: '張醫師',
    role: '醫師', type: 'fulltime', basePay: 45000, overtimePay: 0, allowances: 0,
    deductions: 0, grossPay: 45000, mpfEmployee: 1500, mpfEmployer: 1500,
    netPay: 43500, workingDays: 20, workingHours: 160, status: 'pending',
    confirmedAt: null, paidAt: null,
  },
  {
    id: 'seed_pr_002', month: '2026-02', staffId: 'staff_li', staffName: '李護士',
    role: '護士', type: 'fulltime', basePay: 22000, overtimePay: 0, allowances: 0,
    deductions: 0, grossPay: 22000, mpfEmployee: 1100, mpfEmployer: 1100,
    netPay: 20900, workingDays: 20, workingHours: 160, status: 'pending',
    confirmedAt: null, paidAt: null,
  },
  {
    id: 'seed_pr_003', month: '2026-02', staffId: 'staff_wang', staffName: '王助理',
    role: '前台', type: 'parttime', basePay: 80, overtimePay: 0, allowances: 0,
    deductions: 0, grossPay: 9600, mpfEmployee: 480, mpfEmployer: 480,
    netPay: 9120, workingDays: 15, workingHours: 120, status: 'pending',
    confirmedAt: null, paidAt: null,
  },
];

// ── Helpers ──
function loadPayrollData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        payrolls: parsed.payrolls || [],
      };
    }
  } catch { /* ignore */ }
  return { settings: { ...DEFAULT_SETTINGS }, payrolls: [...SEED_PAYROLLS] };
}

function savePayrollData(payrollData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payrollData));
}

function loadAttendanceData() {
  try {
    const raw = localStorage.getItem(ATTENDANCE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function calcMPF(gross, rate, cap) {
  if (gross < 7100) return 0;
  return Math.min(gross * rate, cap);
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return `${y}年${parseInt(mo, 10)}月`;
}

function getDaysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// ── Styles ──
const styles = {
  container: { maxWidth: 1200, margin: '0 auto', padding: '0 8px' },
  card: {
    background: '#fff', borderRadius: 16,
    boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
    padding: 20, marginBottom: 16,
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16, flexWrap: 'wrap', gap: 8,
  },
  h3: { margin: 0, fontSize: 17, color: '#0e7490', fontWeight: 700 },
  summaryRow: {
    display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16,
  },
  summaryCard: {
    flex: '1 1 140px', background: '#f0fdfa', borderRadius: 12,
    padding: '14px 16px', textAlign: 'center', minWidth: 130,
  },
  summaryLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  summaryValue: { fontSize: 22, fontWeight: 700, color: '#0e7490' },
  tabBar: {
    display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e5e7eb',
  },
  tab: (active) => ({
    padding: '10px 20px', cursor: 'pointer', fontWeight: active ? 700 : 400,
    color: active ? '#0e7490' : '#6b7280', borderBottom: active ? '3px solid #0e7490' : '3px solid transparent',
    background: 'none', border: 'none', fontSize: 14, transition: 'all .2s',
  }),
  btn: {
    background: '#0e7490', color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    transition: 'opacity .2s',
  },
  btnOutline: {
    background: '#fff', color: '#0e7490', border: '1.5px solid #0e7490',
    borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  },
  btnSmall: {
    background: '#0e7490', color: '#fff', border: 'none', borderRadius: 6,
    padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 500,
  },
  btnDanger: {
    background: '#fff', color: '#dc2626', border: '1.5px solid #dc2626',
    borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 500,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #e5e7eb',
    color: '#374151', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px 8px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle',
  },
  badge: (status) => ({
    display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 11,
    fontWeight: 600, background: STATUS_COLORS[status]?.bg || '#f3f4f6',
    color: STATUS_COLORS[status]?.color || '#374151',
  }),
  input: {
    border: '1.5px solid #d1d5db', borderRadius: 8, padding: '8px 12px',
    fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  select: {
    border: '1.5px solid #d1d5db', borderRadius: 8, padding: '8px 12px',
    fontSize: 14, outline: 'none', background: '#fff', cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.45)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    padding: 16,
  },
  modal: {
    background: '#fff', borderRadius: 16, padding: 24, width: '100%',
    maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
  },
  expandRow: {
    background: '#f9fafb', padding: '12px 16px', borderBottom: '1px solid #e5e7eb',
  },
  label: { fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 4, display: 'block' },
  fieldRow: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 },
  fieldGroup: { flex: '1 1 200px', minWidth: 160 },
  mobileHide: { },
};

// ── Component ──
export default function PayrollPage({ showToast, data, user }) {
  const [payrollData, setPayrollData] = useState(loadPayrollData);
  const [activeTab, setActiveTab] = useState('payroll');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [expandedRow, setExpandedRow] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [settingsForm, setSettingsForm] = useState({ ...payrollData.settings });
  const modalRef = useRef(null);

  const { settings, payrolls } = payrollData;

  // Persist changes
  useEffect(() => {
    savePayrollData(payrollData);
  }, [payrollData]);

  // Read attendance for part-time auto-calc
  const attendanceData = useMemo(() => loadAttendanceData(), []);

  // Filter payrolls for selected month
  const monthPayrolls = useMemo(() => {
    return payrolls.filter(p => p.month === selectedMonth);
  }, [payrolls, selectedMonth]);

  // Summary stats
  const summary = useMemo(() => {
    const total = monthPayrolls.reduce((s, p) => s + p.grossPay, 0);
    const fulltime = monthPayrolls.filter(p => p.type === 'fulltime').length;
    const parttime = monthPayrolls.filter(p => p.type === 'parttime').length;
    const mpfTotal = monthPayrolls.reduce((s, p) => s + p.mpfEmployer, 0);
    const netTotal = monthPayrolls.reduce((s, p) => s + p.netPay, 0);
    return { total, fulltime, parttime, mpfTotal, netTotal };
  }, [monthPayrolls]);

  // Available months
  const availableMonths = useMemo(() => {
    const set = new Set(payrolls.map(p => p.month));
    set.add(getCurrentMonth());
    return [...set].sort().reverse();
  }, [payrolls]);

  // ── Actions ──
  const updatePayroll = useCallback((id, updates) => {
    setPayrollData(prev => ({
      ...prev,
      payrolls: prev.payrolls.map(p => p.id === id ? { ...p, ...updates } : p),
    }));
  }, []);

  const confirmPayroll = useCallback((id) => {
    updatePayroll(id, { status: 'confirmed', confirmedAt: new Date().toISOString() });
    if (showToast) showToast('已確認糧單');
  }, [updatePayroll, showToast]);

  const markPaid = useCallback((id) => {
    updatePayroll(id, { status: 'paid', paidAt: new Date().toISOString() });
    if (showToast) showToast('已標記為已發放');
  }, [updatePayroll, showToast]);

  const generatePayslips = useCallback(() => {
    // Check if payrolls already exist for the month
    const existing = payrolls.filter(p => p.month === selectedMonth);
    if (existing.length > 0) {
      if (showToast) showToast('本月糧單已存在，如需重新生成請先刪除');
      return;
    }

    // Read attendance data for part-time hours
    const attendance = loadAttendanceData();
    const daysInMonth = getDaysInMonth(selectedMonth);
    const workingDaysDefault = Math.round(daysInMonth * 5 / 7);

    // Default staff list
    const staffList = [
      { staffId: 'staff_zhang', staffName: '張醫師', role: '醫師', type: 'fulltime' },
      { staffId: 'staff_li', staffName: '李護士', role: '護士', type: 'fulltime' },
      { staffId: 'staff_wang', staffName: '王助理', role: '前台', type: 'parttime', hourlyRate: 80 },
    ];

    const newPayrolls = staffList.map(staff => {
      let basePay, grossPay, workingDays, workingHours;

      if (staff.type === 'fulltime') {
        basePay = settings.defaultSalaries[staff.role] || 0;
        grossPay = basePay;
        workingDays = workingDaysDefault;
        workingHours = workingDays * 8;
      } else {
        // Try to get hours from attendance data
        let hours = 0;
        if (attendance && Array.isArray(attendance)) {
          const staffAttendance = attendance.filter(a =>
            a.staffName === staff.staffName && a.month === selectedMonth
          );
          hours = staffAttendance.reduce((sum, a) => sum + (a.hours || 0), 0);
        }
        if (!hours) hours = 120; // default fallback
        basePay = staff.hourlyRate || 80;
        grossPay = basePay * hours;
        workingHours = hours;
        workingDays = Math.round(hours / 8);
      }

      const mpfEmployee = calcMPF(grossPay, settings.mpfEmployeeRate, settings.mpfCap);
      const mpfEmployer = calcMPF(grossPay, settings.mpfEmployerRate, settings.mpfCap);
      const netPay = grossPay - mpfEmployee;

      return {
        id: uid(), month: selectedMonth, staffId: staff.staffId,
        staffName: staff.staffName, role: staff.role, type: staff.type,
        basePay, overtimePay: 0, allowances: 0, deductions: 0,
        grossPay, mpfEmployee, mpfEmployer, netPay,
        workingDays, workingHours,
        status: 'pending', confirmedAt: null, paidAt: null,
      };
    });

    setPayrollData(prev => ({
      ...prev,
      payrolls: [...prev.payrolls, ...newPayrolls],
    }));
    if (showToast) showToast(`已生成 ${newPayrolls.length} 份糧單`);
  }, [selectedMonth, payrolls, settings, showToast]);

  const exportCSV = useCallback(() => {
    if (monthPayrolls.length === 0) {
      if (showToast) showToast('本月無糧單可匯出');
      return;
    }
    const headers = ['員工姓名', '職位', '類型', '底薪/時薪', '工作日數', '工作時數', '總薪酬', 'MPF僱員', 'MPF僱主', '淨薪酬', '狀態'];
    const rows = monthPayrolls.map(p => [
      p.staffName, p.role, p.type === 'fulltime' ? '全職' : '兼職',
      p.type === 'fulltime' ? p.basePay : p.basePay,
      p.workingDays, p.workingHours, p.grossPay,
      p.mpfEmployee, p.mpfEmployer, p.netPay,
      STATUS_LABELS[p.status],
    ]);
    const bom = '\uFEFF';
    const csv = bom + [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    if (showToast) showToast('CSV 已匯出');
  }, [monthPayrolls, selectedMonth, showToast]);

  const saveSettings = useCallback(() => {
    setPayrollData(prev => ({ ...prev, settings: { ...settingsForm } }));
    if (showToast) showToast('設定已儲存');
  }, [settingsForm, showToast]);

  // ── Print Payslip ──
  const printPayslip = useCallback((p) => {
    const w = window.open('', '_blank');
    if (!w) return;
    const typeLabel = p.type === 'fulltime' ? '全職' : '兼職';
    const baseLabel = p.type === 'fulltime' ? '基本薪金' : `時薪 ($${fmt(p.basePay)}/hr x ${p.workingHours}hrs)`;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{font-family:Arial,sans-serif;padding:40px;color:#333;max-width:700px;margin:0 auto}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      th,td{padding:8px 12px;border-bottom:1px solid #eee;text-align:left}
      th{background:#0e7490;color:#fff}
      .total{background:#f3f4f6;font-weight:700;border-top:2px solid #ccc}
      .header{border-bottom:3px solid #0e7490;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between}
      .sig{display:flex;justify-content:space-between;margin-top:60px;padding:0 40px}
      .sig-box{text-align:center;width:35%}.sig-box div{border-bottom:1px solid #999;height:30px;margin-bottom:6px}
      @media print{body{padding:20px}}
    </style></head><body>
    <div class="header"><div><b style="font-size:17px">康正中醫診所</b></div><div style="text-align:right"><b style="font-size:20px">PAYSLIP 糧單</b></div></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:14px">
      <div><b>員工:</b> ${p.staffName}<br><b>職位:</b> ${p.role} (${typeLabel})</div>
      <div style="text-align:right"><b>月份:</b> ${getMonthLabel(p.month)}<br><b>發薪日:</b> ${new Date().toISOString().split('T')[0]}</div>
    </div>
    <table><thead><tr><th>項目</th><th style="text-align:right">金額 (HK$)</th></tr></thead><tbody>
    <tr><td>${baseLabel}</td><td style="text-align:right">${fmtM(p.grossPay)}</td></tr>
    ${p.overtimePay ? `<tr><td>加班費</td><td style="text-align:right">${fmtM(p.overtimePay)}</td></tr>` : ''}
    ${p.allowances ? `<tr><td>津貼</td><td style="text-align:right">${fmtM(p.allowances)}</td></tr>` : ''}
    <tr><td style="color:#888">MPF僱員供款 (5%)</td><td style="text-align:right;color:#dc2626">-${fmtM(p.mpfEmployee)}</td></tr>
    ${p.deductions ? `<tr><td style="color:#888">其他扣款</td><td style="text-align:right;color:#dc2626">-${fmtM(p.deductions)}</td></tr>` : ''}
    <tr class="total"><td style="text-align:right">淨發薪額 NET PAY</td><td style="text-align:right;font-size:18px;color:#0e7490">${fmtM(p.netPay)}</td></tr>
    </tbody></table>
    <div style="font-size:11px;color:#888;margin-top:8px">僱主MPF供款: ${fmtM(p.mpfEmployer)}</div>
    <div class="sig"><div class="sig-box"><div></div><b>僱主簽署</b></div><div class="sig-box"><div></div><b>僱員簽署</b></div></div>
    </body></html>`);
    w.document.close();
    w.print();
  }, []);

  // ── Responsive media query check ──
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ── Render: Settings Tab ──
  const renderSettings = () => (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h3 style={styles.h3}>薪酬設定</h3>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 12px', color: '#374151', fontSize: 15 }}>MPF 強積金設定</h4>
        <div style={styles.fieldRow}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>僱員供款比率 (%)</label>
            <input type="number" style={styles.input} value={settingsForm.mpfEmployeeRate * 100}
              onChange={e => setSettingsForm(f => ({ ...f, mpfEmployeeRate: Number(e.target.value) / 100 }))} />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>僱主供款比率 (%)</label>
            <input type="number" style={styles.input} value={settingsForm.mpfEmployerRate * 100}
              onChange={e => setSettingsForm(f => ({ ...f, mpfEmployerRate: Number(e.target.value) / 100 }))} />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>每月供款上限 (HK$)</label>
            <input type="number" style={styles.input} value={settingsForm.mpfCap}
              onChange={e => setSettingsForm(f => ({ ...f, mpfCap: Number(e.target.value) }))} />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 12px', color: '#374151', fontSize: 15 }}>加班及發薪設定</h4>
        <div style={styles.fieldRow}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>加班倍率</label>
            <input type="number" step="0.1" style={styles.input} value={settingsForm.overtimeMultiplier}
              onChange={e => setSettingsForm(f => ({ ...f, overtimeMultiplier: Number(e.target.value) }))} />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>發薪日 (每月第幾日)</label>
            <input type="number" min="1" max="31" style={styles.input} value={settingsForm.payDay}
              onChange={e => setSettingsForm(f => ({ ...f, payDay: Number(e.target.value) }))} />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h4 style={{ margin: '0 0 12px', color: '#374151', fontSize: 15 }}>各職位預設月薪</h4>
        {Object.entries(settingsForm.defaultSalaries).map(([role, salary]) => (
          <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ minWidth: 60, fontWeight: 600, color: '#374151', fontSize: 14 }}>{role}</span>
            <input type="number" style={{ ...styles.input, maxWidth: 200 }} value={salary}
              onChange={e => setSettingsForm(f => ({
                ...f,
                defaultSalaries: { ...f.defaultSalaries, [role]: Number(e.target.value) },
              }))} />
            <span style={{ color: '#9ca3af', fontSize: 12 }}>HK$/月</span>
          </div>
        ))}
        <button
          style={{ ...styles.btnOutline, marginTop: 8, fontSize: 12, padding: '5px 12px' }}
          onClick={() => {
            const role = prompt('輸入新職位名稱：');
            if (role && !settingsForm.defaultSalaries[role]) {
              setSettingsForm(f => ({
                ...f,
                defaultSalaries: { ...f.defaultSalaries, [role]: 0 },
              }));
            }
          }}
        >
          + 新增職位
        </button>
      </div>

      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, textAlign: 'right' }}>
        <button style={styles.btn} onClick={saveSettings}>儲存設定</button>
      </div>
    </div>
  );

  // ── Render: Payroll Table ──
  const renderPayrollTable = () => (
    <>
      {/* Summary Cards */}
      <div style={styles.summaryRow}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>總薪酬支出</div>
          <div style={styles.summaryValue}>{fmtM(summary.total)}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>全職員工</div>
          <div style={styles.summaryValue}>{summary.fulltime} 人</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>兼職員工</div>
          <div style={styles.summaryValue}>{summary.parttime} 人</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>MPF僱主供款</div>
          <div style={styles.summaryValue}>{fmtM(summary.mpfTotal)}</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button style={styles.btn} onClick={generatePayslips}>
          生成糧單
        </button>
        <button style={styles.btnOutline} onClick={exportCSV}>
          匯出 CSV
        </button>
      </div>

      {/* Table */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <h3 style={styles.h3}>
            {getMonthLabel(selectedMonth)} 薪酬明細
          </h3>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>
            共 {monthPayrolls.length} 位員工
          </span>
        </div>

        {monthPayrolls.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
            <div>本月尚無糧單紀錄</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>點擊「生成糧單」以建立本月薪酬資料</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>員工姓名</th>
                  <th style={styles.th}>職位</th>
                  <th style={styles.th}>類型</th>
                  {!isMobile && <th style={{ ...styles.th, textAlign: 'right' }}>底薪/時薪</th>}
                  {!isMobile && <th style={{ ...styles.th, textAlign: 'right' }}>日數/時數</th>}
                  <th style={{ ...styles.th, textAlign: 'right' }}>總薪酬</th>
                  {!isMobile && <th style={{ ...styles.th, textAlign: 'right' }}>MPF (5%)</th>}
                  <th style={{ ...styles.th, textAlign: 'right' }}>淨薪酬</th>
                  <th style={styles.th}>狀態</th>
                  <th style={styles.th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {monthPayrolls.map(p => (
                  <PayrollRow
                    key={p.id}
                    p={p}
                    isMobile={isMobile}
                    expanded={expandedRow === p.id}
                    onToggle={() => setExpandedRow(expandedRow === p.id ? null : p.id)}
                    onConfirm={() => confirmPayroll(p.id)}
                    onPaid={() => markPaid(p.id)}
                    onDetail={() => setDetailModal(p)}
                    settings={settings}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f0fdfa', fontWeight: 700 }}>
                  <td style={{ ...styles.td, fontWeight: 700 }} colSpan={isMobile ? 3 : 5}>合計</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700, color: '#0e7490' }}>{fmtM(summary.total)}</td>
                  {!isMobile && <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>{fmtM(summary.mpfTotal)}</td>}
                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700, color: '#0e7490' }}>{fmtM(summary.netTotal)}</td>
                  <td style={styles.td} colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );

  // ── Render: Detail Modal ──
  const renderDetailModal = () => {
    if (!detailModal) return null;
    const p = detailModal;
    const typeLabel = p.type === 'fulltime' ? '全職' : '兼職';

    return (
      <div style={styles.modalOverlay} onClick={() => setDetailModal(null)}>
        <div ref={modalRef} style={styles.modal} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0, color: '#0e7490', fontSize: 18 }}>糧單詳情</h3>
            <button
              style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af', padding: '0 4px' }}
              onClick={() => setDetailModal(null)}
            >
              &times;
            </button>
          </div>

          {/* Header info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{p.staffName}</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>{p.role} ({typeLabel})</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{getMonthLabel(p.month)}</div>
              <div style={styles.badge(p.status)}>{STATUS_LABELS[p.status]}</div>
            </div>
          </div>

          {/* Breakdown table */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            <table style={{ ...styles.table, margin: 0 }}>
              <tbody>
                <tr>
                  <td style={{ ...styles.td, fontWeight: 600 }}>
                    {p.type === 'fulltime' ? '基本薪金' : `時薪 ($${fmt(p.basePay)}/hr)`}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>{fmtM(p.grossPay)}</td>
                </tr>
                {p.type === 'parttime' && (
                  <tr>
                    <td style={{ ...styles.td, color: '#6b7280', fontSize: 12 }}>
                      工作時數: {p.workingHours} 小時
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', color: '#6b7280', fontSize: 12 }}>
                      {p.workingDays} 天
                    </td>
                  </tr>
                )}
                {p.type === 'fulltime' && (
                  <tr>
                    <td style={{ ...styles.td, color: '#6b7280', fontSize: 12 }}>
                      工作日數: {p.workingDays} 天
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', color: '#6b7280', fontSize: 12 }}>
                      {p.workingHours} 小時
                    </td>
                  </tr>
                )}
                {p.overtimePay > 0 && (
                  <tr>
                    <td style={{ ...styles.td, fontWeight: 600 }}>加班費 (x{settings.overtimeMultiplier})</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{fmtM(p.overtimePay)}</td>
                  </tr>
                )}
                {p.allowances > 0 && (
                  <tr>
                    <td style={{ ...styles.td, fontWeight: 600 }}>津貼</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{fmtM(p.allowances)}</td>
                  </tr>
                )}
                <tr style={{ background: '#fef2f2' }}>
                  <td style={{ ...styles.td, color: '#dc2626' }}>MPF僱員供款 (5%)</td>
                  <td style={{ ...styles.td, textAlign: 'right', color: '#dc2626' }}>-{fmtM(p.mpfEmployee)}</td>
                </tr>
                {p.deductions > 0 && (
                  <tr style={{ background: '#fef2f2' }}>
                    <td style={{ ...styles.td, color: '#dc2626' }}>其他扣款</td>
                    <td style={{ ...styles.td, textAlign: 'right', color: '#dc2626' }}>-{fmtM(p.deductions)}</td>
                  </tr>
                )}
                <tr style={{ background: '#f0fdfa' }}>
                  <td style={{ ...styles.td, fontWeight: 700, fontSize: 15 }}>淨發薪額</td>
                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700, fontSize: 18, color: '#0e7490' }}>
                    {fmtM(p.netPay)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* MPF employer note */}
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>
            僱主MPF供款: {fmtM(p.mpfEmployer)}
          </div>

          {/* Timestamps */}
          {p.confirmedAt && (
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
              確認時間: {new Date(p.confirmedAt).toLocaleString('zh-HK')}
            </div>
          )}
          {p.paidAt && (
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
              發放時間: {new Date(p.paidAt).toLocaleString('zh-HK')}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {p.status === 'pending' && (
              <button style={styles.btn} onClick={() => { confirmPayroll(p.id); setDetailModal({ ...p, status: 'confirmed', confirmedAt: new Date().toISOString() }); }}>
                確認糧單
              </button>
            )}
            {p.status === 'confirmed' && (
              <button style={{ ...styles.btn, background: '#059669' }} onClick={() => { markPaid(p.id); setDetailModal({ ...p, status: 'paid', paidAt: new Date().toISOString() }); }}>
                標記已發放
              </button>
            )}
            <button style={styles.btnOutline} onClick={() => printPayslip(p)}>
              列印糧單
            </button>
            <button
              style={{ ...styles.btnOutline, color: '#6b7280', borderColor: '#d1d5db' }}
              onClick={() => setDetailModal(null)}
            >
              關閉
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {/* Tab Bar */}
      <div style={styles.tabBar}>
        <button style={styles.tab(activeTab === 'payroll')} onClick={() => setActiveTab('payroll')}>
          薪酬總覽
        </button>
        <button style={styles.tab(activeTab === 'settings')} onClick={() => setActiveTab('settings')}>
          薪酬設定
        </button>
      </div>

      {/* Month Selector (only on payroll tab) */}
      {activeTab === 'payroll' && (
        <div style={{ ...styles.card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 20px' }}>
          <label style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>薪酬月份：</label>
          <input
            type="month"
            style={{ ...styles.select, minWidth: 160 }}
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {availableMonths.slice(0, 4).map(m => (
              <button
                key={m}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  border: selectedMonth === m ? '1.5px solid #0e7490' : '1px solid #d1d5db',
                  background: selectedMonth === m ? '#f0fdfa' : '#fff',
                  color: selectedMonth === m ? '#0e7490' : '#6b7280',
                  fontWeight: selectedMonth === m ? 600 : 400,
                }}
                onClick={() => setSelectedMonth(m)}
              >
                {getMonthLabel(m)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {activeTab === 'payroll' ? renderPayrollTable() : renderSettings()}

      {/* Detail Modal */}
      {renderDetailModal()}
    </div>
  );
}

// ── PayrollRow Sub-component ──
function PayrollRow({ p, isMobile, expanded, onToggle, onConfirm, onPaid, onDetail, settings }) {
  const typeLabel = p.type === 'fulltime' ? '全職' : '兼職';
  const baseDisplay = p.type === 'fulltime'
    ? fmtM(p.basePay)
    : `$${fmt(p.basePay)}/hr`;
  const daysHoursDisplay = p.type === 'fulltime'
    ? `${p.workingDays} 天`
    : `${p.workingHours} 小時`;

  return (
    <>
      <tr
        style={{ cursor: 'pointer', transition: 'background .15s' }}
        onClick={onToggle}
        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
      >
        <td style={{ ...styles.td, fontWeight: 600 }}>{p.staffName}</td>
        <td style={styles.td}>{p.role}</td>
        <td style={styles.td}>
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 11,
            background: p.type === 'fulltime' ? '#dbeafe' : '#fef3c7',
            color: p.type === 'fulltime' ? '#1e40af' : '#92400e',
          }}>
            {typeLabel}
          </span>
        </td>
        {!isMobile && <td style={{ ...styles.td, textAlign: 'right' }}>{baseDisplay}</td>}
        {!isMobile && <td style={{ ...styles.td, textAlign: 'right' }}>{daysHoursDisplay}</td>}
        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>{fmtM(p.grossPay)}</td>
        {!isMobile && <td style={{ ...styles.td, textAlign: 'right', color: '#dc2626' }}>-{fmtM(p.mpfEmployee)}</td>}
        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700, color: '#0e7490' }}>{fmtM(p.netPay)}</td>
        <td style={styles.td}>
          <span style={styles.badge(p.status)}>{STATUS_LABELS[p.status]}</span>
        </td>
        <td style={styles.td} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {p.status === 'pending' && (
              <button style={styles.btnSmall} onClick={onConfirm} title="確認">確認</button>
            )}
            {p.status === 'confirmed' && (
              <button style={{ ...styles.btnSmall, background: '#059669' }} onClick={onPaid} title="標記已發放">發放</button>
            )}
            <button
              style={{ ...styles.btnSmall, background: '#fff', color: '#0e7490', border: '1px solid #0e7490' }}
              onClick={onDetail}
              title="查看詳情"
            >
              詳情
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={isMobile ? 7 : 10} style={{ padding: 0 }}>
            <div style={styles.expandRow}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                {p.staffName} — {getMonthLabel(p.month)} 薪酬詳情
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
                <div>
                  <span style={{ color: '#6b7280' }}>總薪酬：</span>
                  <span style={{ fontWeight: 600 }}>{fmtM(p.grossPay)}</span>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>工作{p.type === 'fulltime' ? '日數' : '時數'}：</span>
                  <span style={{ fontWeight: 600 }}>
                    {p.type === 'fulltime' ? `${p.workingDays} 天 (${p.workingHours}hr)` : `${p.workingHours} 小時 (${p.workingDays} 天)`}
                  </span>
                </div>
                {p.overtimePay > 0 && (
                  <div>
                    <span style={{ color: '#6b7280' }}>加班費：</span>
                    <span style={{ fontWeight: 600 }}>{fmtM(p.overtimePay)}</span>
                  </div>
                )}
                {p.allowances > 0 && (
                  <div>
                    <span style={{ color: '#6b7280' }}>津貼：</span>
                    <span style={{ fontWeight: 600 }}>{fmtM(p.allowances)}</span>
                  </div>
                )}
                <div>
                  <span style={{ color: '#6b7280' }}>MPF僱員：</span>
                  <span style={{ color: '#dc2626' }}>-{fmtM(p.mpfEmployee)}</span>
                </div>
                <div>
                  <span style={{ color: '#6b7280' }}>MPF僱主：</span>
                  <span>{fmtM(p.mpfEmployer)}</span>
                </div>
                {p.deductions > 0 && (
                  <div>
                    <span style={{ color: '#6b7280' }}>扣款：</span>
                    <span style={{ color: '#dc2626' }}>-{fmtM(p.deductions)}</span>
                  </div>
                )}
                <div>
                  <span style={{ color: '#6b7280' }}>淨薪酬：</span>
                  <span style={{ fontWeight: 700, color: '#0e7490' }}>{fmtM(p.netPay)}</span>
                </div>
              </div>
              {p.confirmedAt && (
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
                  確認於 {new Date(p.confirmedAt).toLocaleString('zh-HK')}
                </div>
              )}
              {p.paidAt && (
                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                  發放於 {new Date(p.paidAt).toLocaleString('zh-HK')}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
