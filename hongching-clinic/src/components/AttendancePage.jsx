import { useState, useEffect, useCallback, useMemo } from 'react';

// ── Seed Data ──
const SEED_STAFF = [
  { id: 's1', name: '張醫師', role: '醫師', type: 'fulltime', hourlyRate: 0, scheduledStart: '09:00', scheduledEnd: '18:00' },
  { id: 's2', name: '李護士', role: '護士', type: 'fulltime', hourlyRate: 0, scheduledStart: '09:00', scheduledEnd: '18:00' },
  { id: 's3', name: '王助理', role: '前台', type: 'parttime', hourlyRate: 80, scheduledStart: '09:00', scheduledEnd: '18:00' },
];

const generateSeedRecords = () => {
  const records = [];
  const workingDays = [];
  // February 2026 working days (Mon-Fri)
  for (let d = 1; d <= 28; d++) {
    const date = new Date(2026, 1, d);
    const dow = date.getDay();
    if (dow >= 1 && dow <= 5) workingDays.push(`2026-02-${String(d).padStart(2, '0')}`);
  }

  const variations = [
    { clockIn: '08:55', clockOut: '18:05', status: 'normal' },
    { clockIn: '09:00', clockOut: '18:00', status: 'normal' },
    { clockIn: '08:50', clockOut: '18:10', status: 'normal' },
    { clockIn: '09:12', clockOut: '18:00', status: 'late' },
    { clockIn: '08:58', clockOut: '17:30', status: 'early' },
    { clockIn: '09:05', clockOut: '18:02', status: 'late' },
    { clockIn: '08:45', clockOut: '18:15', status: 'normal' },
    { clockIn: '09:00', clockOut: '18:00', status: 'normal' },
    { clockIn: '09:20', clockOut: '18:00', status: 'late' },
    { clockIn: '08:52', clockOut: '18:08', status: 'normal' },
  ];

  let rid = 1;
  SEED_STAFF.forEach(staff => {
    workingDays.forEach((date, idx) => {
      // Give one absent day to each staff on different days
      if (staff.id === 's1' && idx === 15) {
        records.push({ id: `r${rid++}`, staffId: staff.id, date, clockIn: null, clockOut: null, location: null, status: 'absent' });
      } else if (staff.id === 's2' && idx === 10) {
        records.push({ id: `r${rid++}`, staffId: staff.id, date, clockIn: null, clockOut: null, location: null, status: 'absent' });
      } else if (staff.id === 's3' && idx === 5) {
        records.push({ id: `r${rid++}`, staffId: staff.id, date, clockIn: null, clockOut: null, location: null, status: 'absent' });
      } else {
        const v = variations[idx % variations.length];
        // Part-time staff sometimes leaves early
        const clockOut = staff.type === 'parttime' && idx % 4 === 0 ? '14:00' : v.clockOut;
        const status = staff.type === 'parttime' && idx % 4 === 0 ? 'early' : v.status;
        records.push({
          id: `r${rid++}`,
          staffId: staff.id,
          date,
          clockIn: v.clockIn,
          clockOut,
          location: { lat: 22.3193, lng: 114.1694 },
          status,
        });
      }
    });
  });

  return records;
};

const STORAGE_KEY = 'hcmc_attendance';

const loadData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.staff?.length && parsed.records?.length) return parsed;
    }
  } catch { /* ignore */ }
  const seed = { staff: SEED_STAFF, records: generateSeedRecords() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
};

const saveData = (d) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
};

const uid = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const timeToMin = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const minToTime = (m) => {
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
};

const calcHours = (clockIn, clockOut) => {
  if (!clockIn || !clockOut) return 0;
  const diff = timeToMin(clockOut) - timeToMin(clockIn);
  return Math.max(0, +(diff / 60).toFixed(2));
};

const todayStr = () => new Date().toISOString().split('T')[0];

// ── Styles ──
const styles = {
  page: {
    padding: 16, maxWidth: 1200, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', padding: 20, marginBottom: 20,
  },
  header: {
    fontSize: 22, fontWeight: 700, color: '#0e7490', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
  },
  subHeader: {
    fontSize: 16, fontWeight: 700, color: '#334155', marginBottom: 12,
  },
  btn: {
    background: '#0e7490', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px',
    fontWeight: 600, fontSize: 15, cursor: 'pointer', transition: 'background 0.2s',
  },
  btnOutline: {
    background: '#fff', color: '#0e7490', border: '2px solid #0e7490', borderRadius: 10, padding: '8px 18px',
    fontWeight: 600, fontSize: 14, cursor: 'pointer',
  },
  btnDanger: {
    background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 18px',
    fontWeight: 600, fontSize: 14, cursor: 'pointer',
  },
  btnSmall: {
    background: '#0e7490', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px',
    fontWeight: 600, fontSize: 13, cursor: 'pointer',
  },
  input: {
    border: '1.5px solid #d1d5db', borderRadius: 10, padding: '8px 12px', fontSize: 14, width: '100%',
    boxSizing: 'border-box', outline: 'none',
  },
  select: {
    border: '1.5px solid #d1d5db', borderRadius: 10, padding: '8px 12px', fontSize: 14,
    background: '#fff', outline: 'none', cursor: 'pointer',
  },
  table: {
    width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 14,
  },
  th: {
    background: '#0e7490', color: '#fff', padding: '10px 12px', textAlign: 'left', fontWeight: 600,
  },
  td: {
    padding: '10px 12px', borderBottom: '1px solid #e5e7eb',
  },
  badge: (color) => ({
    display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    background: color === 'green' ? '#dcfce7' : color === 'yellow' ? '#fef9c3' : color === 'red' ? '#fee2e2' : '#e0f2fe',
    color: color === 'green' ? '#166534' : color === 'yellow' ? '#854d0e' : color === 'red' ? '#991b1b' : '#0e7490',
  }),
  clockDisplay: {
    fontSize: 48, fontWeight: 700, color: '#0e7490', textAlign: 'center', fontVariantNumeric: 'tabular-nums',
    letterSpacing: 2, lineHeight: 1.2,
  },
  modal: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modalContent: {
    background: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 520,
    maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  },
  tabs: {
    display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap',
  },
  tab: (active) => ({
    padding: '8px 18px', borderRadius: 10, border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer',
    background: active ? '#0e7490' : '#e0f2fe', color: active ? '#fff' : '#0e7490',
    transition: 'background 0.2s',
  }),
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16,
  },
  statCard: (color) => ({
    background: color || '#f0fdfa', borderRadius: 12, padding: '14px 16px', textAlign: 'center',
  }),
  formGroup: {
    marginBottom: 14,
  },
  label: {
    display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 4,
  },
  flexRow: {
    display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
  },
  responsiveTable: {
    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
  },
};


export default function AttendancePage({ showToast, data, user }) {
  const [attendance, setAttendance] = useState(loadData);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState('clock');
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [staffForm, setStaffForm] = useState({ name: '', role: '醫師', type: 'fulltime', hourlyRate: 0, scheduledStart: '09:00', scheduledEnd: '18:00' });
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [clockingStaffId, setClockingStaffId] = useState(() => attendance.staff[0]?.id || '');
  const [locationStatus, setLocationStatus] = useState('');

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Persist data
  const updateAttendance = useCallback((updater) => {
    setAttendance(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveData(next);
      return next;
    });
  }, []);

  // Get today's record for a staff
  const getTodayRecord = useCallback((staffId) => {
    const today = todayStr();
    return attendance.records.find(r => r.staffId === staffId && r.date === today);
  }, [attendance.records]);

  // Clock in
  const handleClockIn = useCallback(() => {
    if (!clockingStaffId) { showToast('請先選擇員工'); return; }
    const existing = getTodayRecord(clockingStaffId);
    if (existing?.clockIn) { showToast('今日已打卡'); return; }

    setLocationStatus('正在獲取位置...');
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const staff = attendance.staff.find(s => s.id === clockingStaffId);
    const status = timeToMin(timeStr) > timeToMin(staff?.scheduledStart || '09:00') ? 'late' : 'normal';

    const doClockIn = (loc) => {
      const record = {
        id: uid(),
        staffId: clockingStaffId,
        date: todayStr(),
        clockIn: timeStr,
        clockOut: null,
        location: loc,
        status,
      };
      updateAttendance(prev => ({ ...prev, records: [...prev.records, record] }));
      setLocationStatus('');
      showToast(`${staff?.name || ''} 已打卡 - ${timeStr}${status === 'late' ? ' (遲到)' : ''}`);
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => doClockIn({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { doClockIn(null); setLocationStatus('無法獲取位置'); },
        { timeout: 5000 }
      );
    } else {
      doClockIn(null);
    }
  }, [clockingStaffId, attendance.staff, getTodayRecord, updateAttendance, showToast]);

  // Clock out
  const handleClockOut = useCallback(() => {
    if (!clockingStaffId) { showToast('請先選擇員工'); return; }
    const existing = getTodayRecord(clockingStaffId);
    if (!existing?.clockIn) { showToast('尚未打卡，請先打卡'); return; }
    if (existing?.clockOut) { showToast('今日已收工打卡'); return; }

    setLocationStatus('正在獲取位置...');
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const staff = attendance.staff.find(s => s.id === clockingStaffId);
    const earlyLeave = timeToMin(timeStr) < timeToMin(staff?.scheduledEnd || '18:00');

    const doClockOut = (loc) => {
      updateAttendance(prev => ({
        ...prev,
        records: prev.records.map(r =>
          r.id === existing.id
            ? { ...r, clockOut: timeStr, status: earlyLeave ? 'early' : r.status, location: loc || r.location }
            : r
        ),
      }));
      setLocationStatus('');
      showToast(`${staff?.name || ''} 收工打卡 - ${timeStr}${earlyLeave ? ' (早退)' : ''}`);
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => doClockOut({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { doClockOut(null); setLocationStatus('無法獲取位置'); },
        { timeout: 5000 }
      );
    } else {
      doClockOut(null);
    }
  }, [clockingStaffId, getTodayRecord, attendance.staff, updateAttendance, showToast]);

  // Today's overview data
  const todayOverview = useMemo(() => {
    const today = todayStr();
    return attendance.staff.map(staff => {
      const record = attendance.records.find(r => r.staffId === staff.id && r.date === today);
      return {
        staff,
        record,
        clockIn: record?.clockIn || null,
        clockOut: record?.clockOut || null,
        hours: record ? calcHours(record.clockIn, record.clockOut) : 0,
        status: record?.status || 'absent',
      };
    });
  }, [attendance]);

  // Monthly report data
  const monthlyReport = useMemo(() => {
    const [year, month] = reportMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const workingDays = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      if (date.getDay() >= 1 && date.getDay() <= 5) {
        workingDays.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }

    return attendance.staff.map(staff => {
      const monthRecords = attendance.records.filter(r =>
        r.staffId === staff.id && r.date.startsWith(reportMonth)
      );

      const present = monthRecords.filter(r => r.clockIn);
      const lateCount = monthRecords.filter(r => r.status === 'late').length;
      const earlyCount = monthRecords.filter(r => r.status === 'early').length;
      const absentCount = workingDays.length - present.length;
      const totalHours = present.reduce((sum, r) => sum + calcHours(r.clockIn, r.clockOut), 0);
      const scheduledHoursPerDay = calcHours(staff.scheduledStart, staff.scheduledEnd);
      const expectedHours = present.length * scheduledHoursPerDay;
      const overtimeHours = Math.max(0, +(totalHours - expectedHours).toFixed(2));
      const payable = staff.type === 'parttime' ? +(totalHours * staff.hourlyRate).toFixed(2) : 0;

      return {
        staff,
        totalDays: present.length,
        lateCount,
        earlyCount,
        absentCount,
        totalHours: +totalHours.toFixed(2),
        overtimeHours,
        payable,
        records: monthRecords,
      };
    });
  }, [attendance, reportMonth]);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    const [year, month] = reportMonth.split('-');
    const bom = '\uFEFF';
    let csv = bom + '員工,職位,類型,出勤天數,遲到次數,早退次數,缺勤天數,總工時,加班時數,應付金額\n';
    monthlyReport.forEach(r => {
      csv += `${r.staff.name},${r.staff.role},${r.staff.type === 'fulltime' ? '全職' : '兼職'},`;
      csv += `${r.totalDays},${r.lateCount},${r.earlyCount},${r.absentCount},`;
      csv += `${r.totalHours},${r.overtimeHours},${r.payable}\n`;
    });

    // Detail rows
    csv += '\n\n詳細記錄\n';
    csv += '日期,員工,上班時間,下班時間,工時,狀態\n';
    const monthRecords = attendance.records
      .filter(r => r.date.startsWith(reportMonth))
      .sort((a, b) => a.date.localeCompare(b.date));
    monthRecords.forEach(r => {
      const staff = attendance.staff.find(s => s.id === r.staffId);
      const statusMap = { normal: '正常', late: '遲到', early: '早退', absent: '缺勤' };
      csv += `${r.date},${staff?.name || ''},${r.clockIn || '-'},${r.clockOut || '-'},`;
      csv += `${calcHours(r.clockIn, r.clockOut)},${statusMap[r.status] || r.status}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `考勤報表_${year}年${month}月.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV 已匯出');
  }, [reportMonth, monthlyReport, attendance, showToast]);

  // Staff CRUD
  const openAddStaff = () => {
    setEditingStaff(null);
    setStaffForm({ name: '', role: '醫師', type: 'fulltime', hourlyRate: 0, scheduledStart: '09:00', scheduledEnd: '18:00' });
    setShowStaffModal(true);
  };

  const openEditStaff = (staff) => {
    setEditingStaff(staff);
    setStaffForm({ name: staff.name, role: staff.role, type: staff.type, hourlyRate: staff.hourlyRate, scheduledStart: staff.scheduledStart, scheduledEnd: staff.scheduledEnd });
    setShowStaffModal(true);
  };

  const handleSaveStaff = () => {
    if (!staffForm.name.trim()) { showToast('請輸入員工姓名'); return; }
    if (editingStaff) {
      updateAttendance(prev => ({
        ...prev,
        staff: prev.staff.map(s => s.id === editingStaff.id ? { ...s, ...staffForm } : s),
      }));
      showToast(`已更新 ${staffForm.name}`);
    } else {
      const newStaff = { id: uid(), ...staffForm };
      updateAttendance(prev => ({ ...prev, staff: [...prev.staff, newStaff] }));
      showToast(`已新增 ${staffForm.name}`);
    }
    setShowStaffModal(false);
  };

  const handleDeleteStaff = (staffId) => {
    const staff = attendance.staff.find(s => s.id === staffId);
    if (!confirm(`確定刪除 ${staff?.name}？相關考勤記錄也會被刪除。`)) return;
    updateAttendance(prev => ({
      staff: prev.staff.filter(s => s.id !== staffId),
      records: prev.records.filter(r => r.staffId !== staffId),
    }));
    showToast(`已刪除 ${staff?.name}`);
  };

  const statusLabel = (s) => {
    const map = { normal: '正常', late: '遲到', early: '早退', absent: '缺勤' };
    return map[s] || s;
  };

  const statusColor = (s) => {
    const map = { normal: 'green', late: 'yellow', early: 'yellow', absent: 'red' };
    return map[s] || 'blue';
  };

  const formatTime = (d) => {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const formatDate = (d) => {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];

  // Current clock-in status for selected staff
  const currentStaffRecord = getTodayRecord(clockingStaffId);
  const currentStaff = attendance.staff.find(s => s.id === clockingStaffId);

  // Available months for report selector
  const availableMonths = useMemo(() => {
    const months = new Set();
    attendance.records.forEach(r => {
      if (r.date) months.add(r.date.substring(0, 7));
    });
    const now = new Date();
    months.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    return [...months].sort().reverse();
  }, [attendance.records]);

  return (
    <div style={styles.page}>
      {/* Page Title */}
      <div style={styles.header}>
        <span style={{ fontSize: 26 }}>&#128197;</span>
        員工考勤系統
      </div>

      {/* Tab Navigation */}
      <div style={styles.tabs}>
        {[
          { key: 'clock', label: '打卡' },
          { key: 'today', label: '今日出勤' },
          { key: 'report', label: '月度報表' },
          { key: 'staff', label: '員工設定' },
        ].map(t => (
          <button key={t.key} style={styles.tab(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Clock-in/Clock-out Panel ── */}
      {activeTab === 'clock' && (
        <div style={styles.card}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 4 }}>
              {formatDate(currentTime)}  星期{weekdayNames[currentTime.getDay()]}
            </div>
            <div style={styles.clockDisplay}>
              {formatTime(currentTime)}
            </div>
          </div>

          {/* Staff selector */}
          <div style={{ maxWidth: 360, margin: '0 auto 20px' }}>
            <label style={styles.label}>選擇員工</label>
            <select
              style={{ ...styles.select, width: '100%' }}
              value={clockingStaffId}
              onChange={e => setClockingStaffId(e.target.value)}
            >
              {attendance.staff.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
              ))}
            </select>
          </div>

          {/* Current status */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            {currentStaffRecord?.clockIn ? (
              <div>
                <span style={styles.badge(currentStaffRecord.clockOut ? 'green' : 'blue')}>
                  {currentStaffRecord.clockOut
                    ? `已收工 ${currentStaffRecord.clockOut}`
                    : `已打卡 ${currentStaffRecord.clockIn}`
                  }
                </span>
                {currentStaffRecord.status === 'late' && (
                  <span style={{ ...styles.badge('yellow'), marginLeft: 8 }}>遲到</span>
                )}
              </div>
            ) : (
              <span style={styles.badge('red')}>未打卡</span>
            )}
            {locationStatus && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{locationStatus}</div>
            )}
          </div>

          {/* Clock buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              style={{
                ...styles.btn,
                padding: '14px 36px',
                fontSize: 18,
                opacity: currentStaffRecord?.clockIn ? 0.5 : 1,
              }}
              onClick={handleClockIn}
              disabled={!!currentStaffRecord?.clockIn}
            >
              返工打卡
            </button>
            <button
              style={{
                ...styles.btn,
                padding: '14px 36px',
                fontSize: 18,
                background: '#ea580c',
                opacity: !currentStaffRecord?.clockIn || currentStaffRecord?.clockOut ? 0.5 : 1,
              }}
              onClick={handleClockOut}
              disabled={!currentStaffRecord?.clockIn || !!currentStaffRecord?.clockOut}
            >
              收工打卡
            </button>
          </div>

          {/* Today quick summary for current staff */}
          {currentStaffRecord?.clockIn && (
            <div style={{ marginTop: 20, padding: 14, background: '#f0fdfa', borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {currentStaff?.name} - 今日工時
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0e7490', marginTop: 4 }}>
                {currentStaffRecord.clockOut
                  ? `${calcHours(currentStaffRecord.clockIn, currentStaffRecord.clockOut)} 小時`
                  : `${calcHours(currentStaffRecord.clockIn, formatTime(currentTime).substring(0, 5))} 小時 (進行中)`
                }
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                {currentStaffRecord.clockIn} - {currentStaffRecord.clockOut || '未收工'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Today's Attendance Overview ── */}
      {activeTab === 'today' && (
        <div style={styles.card}>
          <div style={styles.subHeader}>
            今日出勤總覽 - {formatDate(currentTime)}
          </div>

          {/* Summary stats */}
          <div style={styles.grid}>
            <div style={styles.statCard('#dcfce7')}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#166534' }}>
                {todayOverview.filter(r => r.status === 'normal').length}
              </div>
              <div style={{ fontSize: 12, color: '#166534' }}>正常出勤</div>
            </div>
            <div style={styles.statCard('#fef9c3')}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#854d0e' }}>
                {todayOverview.filter(r => r.status === 'late').length}
              </div>
              <div style={{ fontSize: 12, color: '#854d0e' }}>遲到</div>
            </div>
            <div style={styles.statCard('#fee2e2')}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#991b1b' }}>
                {todayOverview.filter(r => r.status === 'absent' || !r.clockIn).length}
              </div>
              <div style={{ fontSize: 12, color: '#991b1b' }}>缺勤</div>
            </div>
            <div style={styles.statCard('#e0f2fe')}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#0e7490' }}>
                {attendance.staff.length}
              </div>
              <div style={{ fontSize: 12, color: '#0e7490' }}>員工總數</div>
            </div>
          </div>

          {/* Table */}
          <div style={styles.responsiveTable}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, borderRadius: '10px 0 0 0' }}>姓名</th>
                  <th style={styles.th}>職位</th>
                  <th style={styles.th}>上班時間</th>
                  <th style={styles.th}>下班時間</th>
                  <th style={styles.th}>工時</th>
                  <th style={{ ...styles.th, borderRadius: '0 10px 0 0' }}>狀態</th>
                </tr>
              </thead>
              <tbody>
                {todayOverview.map((row, i) => (
                  <tr key={row.staff.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{row.staff.name}</td>
                    <td style={styles.td}>{row.staff.role}</td>
                    <td style={styles.td}>{row.clockIn || '-'}</td>
                    <td style={styles.td}>{row.clockOut || '-'}</td>
                    <td style={styles.td}>{row.hours > 0 ? `${row.hours}h` : '-'}</td>
                    <td style={styles.td}>
                      <span style={styles.badge(statusColor(row.status))}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                  </tr>
                ))}
                {todayOverview.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: '#94a3b8', padding: 30 }}>
                      暫無員工資料
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Monthly Attendance Report ── */}
      {activeTab === 'report' && (
        <div style={styles.card}>
          <div style={{ ...styles.subHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <span>月度考勤報表</span>
            <div style={styles.flexRow}>
              <select
                style={styles.select}
                value={reportMonth}
                onChange={e => setReportMonth(e.target.value)}
              >
                {availableMonths.map(m => {
                  const [y, mo] = m.split('-');
                  return <option key={m} value={m}>{y}年{Number(mo)}月</option>;
                })}
              </select>
              <button style={styles.btnSmall} onClick={handleExportCSV}>
                匯出 CSV
              </button>
            </div>
          </div>

          {/* Summary table */}
          <div style={styles.responsiveTable}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, borderRadius: '10px 0 0 0' }}>員工</th>
                  <th style={styles.th}>職位</th>
                  <th style={styles.th}>類型</th>
                  <th style={styles.th}>出勤日</th>
                  <th style={styles.th}>遲到</th>
                  <th style={styles.th}>早退</th>
                  <th style={styles.th}>缺勤</th>
                  <th style={styles.th}>總工時</th>
                  <th style={styles.th}>加班</th>
                  <th style={{ ...styles.th, borderRadius: '0 10px 0 0' }}>應付金額</th>
                </tr>
              </thead>
              <tbody>
                {monthlyReport.map((row, i) => (
                  <tr key={row.staff.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{row.staff.name}</td>
                    <td style={styles.td}>{row.staff.role}</td>
                    <td style={styles.td}>
                      <span style={styles.badge(row.staff.type === 'fulltime' ? 'blue' : 'green')}>
                        {row.staff.type === 'fulltime' ? '全職' : '兼職'}
                      </span>
                    </td>
                    <td style={styles.td}>{row.totalDays}</td>
                    <td style={styles.td}>
                      {row.lateCount > 0 ? (
                        <span style={styles.badge('yellow')}>{row.lateCount}</span>
                      ) : '0'}
                    </td>
                    <td style={styles.td}>
                      {row.earlyCount > 0 ? (
                        <span style={styles.badge('yellow')}>{row.earlyCount}</span>
                      ) : '0'}
                    </td>
                    <td style={styles.td}>
                      {row.absentCount > 0 ? (
                        <span style={styles.badge('red')}>{row.absentCount}</span>
                      ) : '0'}
                    </td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{row.totalHours}h</td>
                    <td style={styles.td}>
                      {row.overtimeHours > 0 ? (
                        <span style={{ color: '#ea580c', fontWeight: 600 }}>{row.overtimeHours}h</span>
                      ) : '-'}
                    </td>
                    <td style={{ ...styles.td, fontWeight: 600, color: '#0e7490' }}>
                      {row.staff.type === 'parttime'
                        ? `$${row.payable.toLocaleString()}`
                        : '-'
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Part-time calculation breakdown */}
          {monthlyReport.filter(r => r.staff.type === 'parttime').length > 0 && (
            <div style={{ marginTop: 16, padding: 14, background: '#f0fdfa', borderRadius: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0e7490', marginBottom: 8 }}>
                兼職薪酬計算
              </div>
              {monthlyReport.filter(r => r.staff.type === 'parttime').map(r => (
                <div key={r.staff.id} style={{ fontSize: 13, color: '#334155', marginBottom: 4 }}>
                  {r.staff.name}: {r.totalHours}h x ${r.staff.hourlyRate}/h = <strong>${r.payable.toLocaleString()}</strong>
                </div>
              ))}
            </div>
          )}

          {/* Monthly detail records */}
          <div style={{ marginTop: 24 }}>
            <div style={styles.subHeader}>每日明細</div>
            <div style={styles.responsiveTable}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, borderRadius: '10px 0 0 0' }}>日期</th>
                    <th style={styles.th}>員工</th>
                    <th style={styles.th}>上班</th>
                    <th style={styles.th}>下班</th>
                    <th style={styles.th}>工時</th>
                    <th style={{ ...styles.th, borderRadius: '0 10px 0 0' }}>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.records
                    .filter(r => r.date.startsWith(reportMonth))
                    .sort((a, b) => a.date.localeCompare(b.date) || a.staffId.localeCompare(b.staffId))
                    .map((r, i) => {
                      const staff = attendance.staff.find(s => s.id === r.staffId);
                      return (
                        <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          <td style={styles.td}>{r.date}</td>
                          <td style={{ ...styles.td, fontWeight: 600 }}>{staff?.name || '-'}</td>
                          <td style={styles.td}>{r.clockIn || '-'}</td>
                          <td style={styles.td}>{r.clockOut || '-'}</td>
                          <td style={styles.td}>{calcHours(r.clockIn, r.clockOut) > 0 ? `${calcHours(r.clockIn, r.clockOut)}h` : '-'}</td>
                          <td style={styles.td}>
                            <span style={styles.badge(statusColor(r.status))}>
                              {statusLabel(r.status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Staff Settings ── */}
      {activeTab === 'staff' && (
        <div style={styles.card}>
          <div style={{ ...styles.subHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>員工設定</span>
            <button style={styles.btnSmall} onClick={openAddStaff}>+ 新增員工</button>
          </div>

          <div style={styles.responsiveTable}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, borderRadius: '10px 0 0 0' }}>姓名</th>
                  <th style={styles.th}>職位</th>
                  <th style={styles.th}>類型</th>
                  <th style={styles.th}>時薪</th>
                  <th style={styles.th}>上班時間</th>
                  <th style={styles.th}>下班時間</th>
                  <th style={{ ...styles.th, borderRadius: '0 10px 0 0' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {attendance.staff.map((s, i) => (
                  <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{s.name}</td>
                    <td style={styles.td}>{s.role}</td>
                    <td style={styles.td}>
                      <span style={styles.badge(s.type === 'fulltime' ? 'blue' : 'green')}>
                        {s.type === 'fulltime' ? '全職' : '兼職'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {s.type === 'parttime' ? `$${s.hourlyRate}` : '-'}
                    </td>
                    <td style={styles.td}>{s.scheduledStart}</td>
                    <td style={styles.td}>{s.scheduledEnd}</td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          style={{ ...styles.btnSmall, fontSize: 12, padding: '4px 10px' }}
                          onClick={() => openEditStaff(s)}
                        >
                          編輯
                        </button>
                        <button
                          style={{ ...styles.btnDanger, fontSize: 12, padding: '4px 10px' }}
                          onClick={() => handleDeleteStaff(s.id)}
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {attendance.staff.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ ...styles.td, textAlign: 'center', color: '#94a3b8', padding: 30 }}>
                      暫無員工，請新增員工
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Staff Add/Edit Modal ── */}
      {showStaffModal && (
        <div style={styles.modal} onClick={() => setShowStaffModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={{ ...styles.subHeader, marginBottom: 20 }}>
              {editingStaff ? '編輯員工' : '新增員工'}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>姓名</label>
              <input
                style={styles.input}
                value={staffForm.name}
                onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))}
                placeholder="輸入員工姓名"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>職位</label>
              <select
                style={{ ...styles.select, width: '100%' }}
                value={staffForm.role}
                onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}
              >
                <option value="醫師">醫師</option>
                <option value="護士">護士</option>
                <option value="前台">前台</option>
                <option value="兼職">兼職</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>僱傭類型</label>
              <select
                style={{ ...styles.select, width: '100%' }}
                value={staffForm.type}
                onChange={e => setStaffForm(f => ({ ...f, type: e.target.value }))}
              >
                <option value="fulltime">全職</option>
                <option value="parttime">兼職</option>
              </select>
            </div>

            {staffForm.type === 'parttime' && (
              <div style={styles.formGroup}>
                <label style={styles.label}>時薪 (HKD)</label>
                <input
                  style={styles.input}
                  type="number"
                  min="0"
                  value={staffForm.hourlyRate}
                  onChange={e => setStaffForm(f => ({ ...f, hourlyRate: Number(e.target.value) }))}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ ...styles.formGroup, flex: 1 }}>
                <label style={styles.label}>上班時間</label>
                <input
                  style={styles.input}
                  type="time"
                  value={staffForm.scheduledStart}
                  onChange={e => setStaffForm(f => ({ ...f, scheduledStart: e.target.value }))}
                />
              </div>
              <div style={{ ...styles.formGroup, flex: 1 }}>
                <label style={styles.label}>下班時間</label>
                <input
                  style={styles.input}
                  type="time"
                  value={staffForm.scheduledEnd}
                  onChange={e => setStaffForm(f => ({ ...f, scheduledEnd: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button style={styles.btnOutline} onClick={() => setShowStaffModal(false)}>
                取消
              </button>
              <button style={styles.btn} onClick={handleSaveStaff}>
                {editingStaff ? '儲存變更' : '新增員工'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
