import { useState, useMemo, useRef, useCallback } from 'react';

const A = '#0e7490', BG = '#f0fdfa', BDR = '#cffafe', DANGER = '#dc2626', WARN = '#f59e0b', SUCCESS = '#16a34a';
const card = { background: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' };
const hdr = { fontSize: 16, fontWeight: 700, color: A, marginBottom: 12 };
const btn = (c = A) => ({ padding: '8px 18px', borderRadius: 8, border: 'none', background: c, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 });
const btnO = { ...btn('#fff'), border: `1px solid ${A}`, color: A, background: '#fff' };
const smBtn = (c = A) => ({ ...btn(c), padding: '5px 12px', fontSize: 12 });
const tag = (c) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: c + '18', color: c });

const SYSTEM_FIELDS = [
  { key: 'patientName', label: '病人姓名', required: true, category: 'patient' },
  { key: 'phone', label: '電話', required: false, category: 'patient' },
  { key: 'idNumber', label: '身份證', required: false, category: 'patient' },
  { key: 'address', label: '地址', required: false, category: 'patient' },
  { key: 'dob', label: '出生日期', required: false, category: 'patient' },
  { key: 'gender', label: '性別', required: false, category: 'patient' },
  { key: 'allergy', label: '過敏史', required: false, category: 'patient' },
  { key: 'appointmentDate', label: '預約日期', required: false, category: 'booking' },
  { key: 'appointmentTime', label: '預約時間', required: false, category: 'booking' },
  { key: 'doctor', label: '醫師', required: false, category: 'booking' },
  { key: 'incomeAmount', label: '收入金額', required: false, category: 'finance' },
  { key: 'expenseAmount', label: '支出金額', required: false, category: 'finance' },
  { key: 'category', label: '類別', required: false, category: 'finance' },
];

const MIGRATION_CHECKLIST = [
  { key: 'patients', label: '病人資料' },
  { key: 'bookings', label: '預約記錄' },
  { key: 'income', label: '收入記錄' },
  { key: 'expenses', label: '支出記錄' },
  { key: 'inventory', label: '庫存資料' },
];

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
  });
  return { headers, rows };
}

function parseTSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split('\t').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const values = line.split('\t').map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
  });
  return { headers, rows };
}

function detectDelimiter(text) {
  const firstLine = text.split('\n')[0] || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  return tabs > commas ? 'tab' : 'comma';
}

function autoMapColumns(headers) {
  const mapping = {};
  const nameMap = {
    '姓名': 'patientName', '病人姓名': 'patientName', '名字': 'patientName', 'name': 'patientName', 'patient': 'patientName', 'patient_name': 'patientName',
    '電話': 'phone', '手機': 'phone', '聯繫電話': 'phone', 'phone': 'phone', 'tel': 'phone', 'mobile': 'phone',
    '身份證': 'idNumber', '身份證號': 'idNumber', 'id': 'idNumber', 'id_number': 'idNumber', 'hkid': 'idNumber',
    '地址': 'address', 'address': 'address',
    '出生日期': 'dob', '生日': 'dob', 'dob': 'dob', 'birthday': 'dob', 'birth_date': 'dob',
    '性別': 'gender', 'gender': 'gender', 'sex': 'gender',
    '過敏': 'allergy', '過敏史': 'allergy', 'allergy': 'allergy', 'allergies': 'allergy',
    '預約日期': 'appointmentDate', 'appointment_date': 'appointmentDate', 'date': 'appointmentDate',
    '預約時間': 'appointmentTime', 'appointment_time': 'appointmentTime', 'time': 'appointmentTime',
    '醫師': 'doctor', '醫生': 'doctor', 'doctor': 'doctor', 'physician': 'doctor',
    '收入': 'incomeAmount', '收入金額': 'incomeAmount', 'income': 'incomeAmount', 'revenue': 'incomeAmount', 'amount': 'incomeAmount',
    '支出': 'expenseAmount', '支出金額': 'expenseAmount', 'expense': 'expenseAmount',
    '類別': 'category', '分類': 'category', 'category': 'category', 'type': 'category',
  };
  headers.forEach(h => {
    const lower = h.toLowerCase().trim();
    if (nameMap[lower]) mapping[h] = nameMap[lower];
    else if (nameMap[h]) mapping[h] = nameMap[h];
    else mapping[h] = '';
  });
  return mapping;
}

function validateRow(row, mapping) {
  const errors = [];
  const reverseMap = {};
  Object.entries(mapping).forEach(([src, target]) => { if (target) reverseMap[target] = src; });

  SYSTEM_FIELDS.forEach(field => {
    if (field.required) {
      const srcCol = reverseMap[field.key];
      if (!srcCol || !row[srcCol]?.trim()) {
        errors.push(`缺少必填欄位：${field.label}`);
      }
    }
  });

  // Validate date formats
  ['appointmentDate', 'dob'].forEach(dateField => {
    const srcCol = reverseMap[dateField];
    if (srcCol && row[srcCol]?.trim()) {
      const v = row[srcCol].trim();
      if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(v) && !/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(v)) {
        errors.push(`日期格式無效：${SYSTEM_FIELDS.find(f => f.key === dateField)?.label || dateField}`);
      }
    }
  });

  // Validate phone
  const phoneSrc = reverseMap['phone'];
  if (phoneSrc && row[phoneSrc]?.trim()) {
    const phone = row[phoneSrc].replace(/[\s\-()]/g, '');
    if (phone && !/^\d{8,}$/.test(phone)) {
      errors.push('電話格式無效');
    }
  }

  return errors;
}

function findDuplicates(rows, mapping) {
  const reverseMap = {};
  Object.entries(mapping).forEach(([src, target]) => { if (target) reverseMap[target] = src; });

  const nameSrc = reverseMap['patientName'];
  const phoneSrc = reverseMap['phone'];
  if (!nameSrc) return [];

  const seen = new Map();
  const duplicates = [];
  rows.forEach((row, idx) => {
    const key = (row[nameSrc] || '').trim() + '|' + (phoneSrc ? (row[phoneSrc] || '').trim() : '');
    if (seen.has(key)) {
      duplicates.push({ row: idx + 2, duplicateOf: seen.get(key) + 2 });
    } else {
      seen.set(key, idx);
    }
  });
  return duplicates;
}

export default function DataImport({ showToast, data, setData, user }) {
  const [mainTab, setMainTab] = useState('csv');
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [rawText, setRawText] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [checklist, setChecklist] = useState(() => {
    const init = {};
    MIGRATION_CHECKLIST.forEach(c => { init[c.key] = false; });
    return init;
  });
  const [manualRows, setManualRows] = useState([createEmptyRow()]);
  const [reconDateFrom, setReconDateFrom] = useState('');
  const [reconDateTo, setReconDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [reconResult, setReconResult] = useState(null);
  const fileInputRef = useRef(null);

  function createEmptyRow() {
    const row = {};
    SYSTEM_FIELDS.forEach(f => { row[f.key] = ''; });
    return row;
  }

  // ── File handling ──
  const handleFile = useCallback((f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'json', 'tsv', 'txt'].includes(ext)) {
      showToast('不支援的檔案格式，請使用 CSV、XLSX 或 JSON');
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      showToast('檔案太大，上限 50MB');
      return;
    }
    setFile(f);
    setFileName(f.name);
    setFileSize(f.size);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      setRawText(text);

      if (ext === 'json') {
        try {
          const json = JSON.parse(text);
          const rows = Array.isArray(json) ? json : json.data || json.records || [];
          if (!rows.length) { showToast('JSON 檔案中找不到資料'); return; }
          const headers = Object.keys(rows[0]);
          setParsedData({ headers, rows });
          setColumnMapping(autoMapColumns(headers));
          showToast(`已解析 ${rows.length} 筆資料`);
        } catch {
          showToast('無效的 JSON 格式');
        }
      } else {
        const delimiter = detectDelimiter(text);
        const result = delimiter === 'tab' ? parseTSV(text) : parseCSV(text);
        if (!result.rows.length) { showToast('檔案中找不到資料'); return; }
        setParsedData(result);
        setColumnMapping(autoMapColumns(result.headers));
        showToast(`已解析 ${result.rows.length} 筆資料（${result.headers.length} 個欄位）`);
      }
    };
    reader.readAsText(f, 'UTF-8');
  }, [showToast]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleFileInput = (e) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const updateMapping = (sourceCol, targetField) => {
    setColumnMapping(prev => ({ ...prev, [sourceCol]: targetField }));
  };

  // ── Validation summary ──
  const validationSummary = useMemo(() => {
    if (!parsedData) return null;
    const allErrors = [];
    const duplicates = findDuplicates(parsedData.rows, columnMapping);
    parsedData.rows.forEach((row, idx) => {
      const errs = validateRow(row, columnMapping);
      if (errs.length) allErrors.push({ row: idx + 2, errors: errs });
    });
    const requiredMapped = SYSTEM_FIELDS.filter(f => f.required).every(f =>
      Object.values(columnMapping).includes(f.key)
    );
    return { errors: allErrors, duplicates, requiredMapped, total: parsedData.rows.length };
  }, [parsedData, columnMapping]);

  // ── Import ──
  const doImport = async (rows) => {
    setImporting(true);
    setImportProgress(0);
    const result = { success: 0, failed: 0, errors: [] };
    const reverseMap = {};
    Object.entries(columnMapping).forEach(([src, target]) => { if (target) reverseMap[target] = src; });

    const batchSize = 50;
    const totalBatches = Math.ceil(rows.length / batchSize);

    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * batchSize;
      const end = Math.min(start + batchSize, rows.length);
      const batchRows = rows.slice(start, end);

      for (let i = 0; i < batchRows.length; i++) {
        const row = batchRows[i];
        const rowIdx = start + i;
        const errors = validateRow(row, columnMapping);

        if (errors.length > 0) {
          result.failed++;
          result.errors.push({ row: rowIdx + 2, errors });
        } else {
          const mapped = {};
          Object.entries(reverseMap).forEach(([target, src]) => {
            if (row[src] !== undefined) mapped[target] = row[src].trim();
          });
          mapped.importedAt = new Date().toISOString();
          mapped.importedBy = user?.name || user?.userId || '系統';
          mapped.source = fileName || '手動輸入';

          // Organize by category
          if (mapped.patientName) {
            setData(prev => ({
              ...prev,
              patients: [...(prev.patients || []), {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                name: mapped.patientName,
                phone: mapped.phone || '',
                idNumber: mapped.idNumber || '',
                address: mapped.address || '',
                dob: mapped.dob || '',
                gender: mapped.gender || '',
                allergy: mapped.allergy || '',
                importedAt: mapped.importedAt,
                importedBy: mapped.importedBy,
                source: mapped.source,
              }]
            }));
          }
          if (mapped.appointmentDate) {
            setData(prev => ({
              ...prev,
              bookings: [...(prev.bookings || []), {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                date: mapped.appointmentDate,
                time: mapped.appointmentTime || '',
                name: mapped.patientName || '',
                phone: mapped.phone || '',
                doctor: mapped.doctor || '',
                importedAt: mapped.importedAt,
                source: mapped.source,
              }]
            }));
          }
          if (mapped.incomeAmount) {
            setData(prev => ({
              ...prev,
              revenue: [...(prev.revenue || []), {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                date: mapped.appointmentDate || new Date().toISOString().split('T')[0],
                name: mapped.patientName || '',
                amount: mapped.incomeAmount,
                category: mapped.category || '診金',
                doctor: mapped.doctor || '',
                importedAt: mapped.importedAt,
                source: mapped.source,
              }]
            }));
          }
          if (mapped.expenseAmount) {
            setData(prev => ({
              ...prev,
              expenses: [...(prev.expenses || []), {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                date: mapped.appointmentDate || new Date().toISOString().split('T')[0],
                amount: mapped.expenseAmount,
                category: mapped.category || '其他',
                importedAt: mapped.importedAt,
                source: mapped.source,
              }]
            }));
          }
          result.success++;
        }
      }
      setImportProgress(Math.round(((batch + 1) / totalBatches) * 100));
      // Allow UI to update
      await new Promise(r => setTimeout(r, 50));
    }

    setImporting(false);
    setImportProgress(100);
    setImportResult(result);
    if (result.success > 0) {
      showToast(`成功匯入 ${result.success} 筆資料`);
    }
    if (result.failed > 0) {
      showToast(`${result.failed} 筆資料匯入失敗`);
    }
  };

  const handleImport = () => {
    if (!parsedData || !parsedData.rows.length) { showToast('沒有可匯入的資料'); return; }
    if (!validationSummary?.requiredMapped) { showToast('請先映射所有必填欄位'); return; }
    doImport(parsedData.rows);
  };

  // ── Manual import ──
  const handleManualImport = () => {
    const validRows = manualRows.filter(r => r.patientName?.trim());
    if (!validRows.length) { showToast('請至少輸入一筆資料'); return; }

    const dummyMapping = {};
    SYSTEM_FIELDS.forEach(f => { dummyMapping[f.key] = f.key; });
    setColumnMapping(dummyMapping);

    const convertedRows = validRows.map(r => {
      const row = {};
      SYSTEM_FIELDS.forEach(f => { row[f.key] = r[f.key] || ''; });
      return row;
    });
    doImport(convertedRows);
  };

  const addManualRow = () => setManualRows(prev => [...prev, createEmptyRow()]);
  const removeManualRow = (idx) => setManualRows(prev => prev.filter((_, i) => i !== idx));
  const updateManualRow = (idx, field, val) => {
    setManualRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };

  // ── Error report download ──
  const downloadErrorReport = () => {
    if (!importResult?.errors?.length) return;
    const lines = ['行號,錯誤詳情'];
    importResult.errors.forEach(e => {
      lines.push(`${e.row},"${e.errors.join('; ')}"`);
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_errors_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Reconciliation ──
  const runReconciliation = () => {
    const imported = (data.patients || []).filter(p => p.source && p.importedAt);
    const existing = (data.patients || []).filter(p => !p.source);

    const importedRevenue = (data.revenue || []).filter(r => r.source && r.importedAt);
    const existingRevenue = (data.revenue || []).filter(r => !r.source);

    // Filter by date range
    const filterDate = (arr) => arr.filter(item => {
      const d = item.date || item.importedAt || '';
      const ds = d.substring(0, 10);
      if (reconDateFrom && ds < reconDateFrom) return false;
      if (reconDateTo && ds > reconDateTo) return false;
      return true;
    });

    const filteredImported = filterDate(imported);
    const filteredExisting = filterDate(existing);
    const filteredImportedRev = filterDate(importedRevenue);
    const filteredExistingRev = filterDate(existingRevenue);

    // Find missing patients (imported but not in existing by name+phone)
    const existingKeys = new Set(existing.map(p => (p.name || '').trim() + '|' + (p.phone || '').trim()));
    const missingPatients = filteredImported.filter(p => !existingKeys.has((p.name || '').trim() + '|' + (p.phone || '').trim()));

    // Amount comparison
    const importedTotal = filteredImportedRev.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const existingTotal = filteredExistingRev.reduce((s, r) => s + (Number(r.amount) || 0), 0);

    setReconResult({
      importedPatients: filteredImported.length,
      existingPatients: filteredExisting.length,
      missingPatients,
      importedRevenue: importedTotal,
      existingRevenue: existingTotal,
      revenueDiff: importedTotal - existingTotal,
      importedRevenueCount: filteredImportedRev.length,
      existingRevenueCount: filteredExistingRev.length,
    });
  };

  // ── Reset ──
  const resetImport = () => {
    setFile(null);
    setFileName('');
    setFileSize(0);
    setRawText('');
    setParsedData(null);
    setColumnMapping({});
    setImportResult(null);
    setImportProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fmtSize = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB';

  const previewRows = parsedData ? parsedData.rows.slice(0, 10) : [];

  // ── Tabs ──
  const TABS = [
    { key: 'csv', label: 'CSV/Excel 匯入' },
    { key: 'manual', label: '手動輸入' },
    { key: 'tcmonline', label: '中醫在線匯出' },
    { key: 'reconciliation', label: '每日對帳' },
  ];

  // ── Responsive styles ──
  const containerStyle = { maxWidth: 1200, margin: '0 auto', padding: '8px 12px' };
  const tabBar = { display: 'flex', gap: 0, borderBottom: `2px solid #e5e7eb`, marginBottom: 20, flexWrap: 'wrap' };
  const tabStyle = (active) => ({
    padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
    color: active ? A : '#6b7280', borderBottom: active ? `3px solid ${A}` : '3px solid transparent',
    background: 'none', border: 'none', borderBottomWidth: 3, borderBottomStyle: 'solid',
    borderBottomColor: active ? A : 'transparent', transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: '#111' }}>資料匯入 / 系統遷移</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>從中醫在線或其他系統匯入資料至 ClinicOS</p>
        </div>
        <button
          style={btnO}
          onClick={() => setShowGuide(!showGuide)}
        >
          {showGuide ? '隱藏遷移指南' : '顯示遷移指南'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Main Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Tab Bar */}
          <div style={tabBar}>
            {TABS.map(t => (
              <button key={t.key} style={tabStyle(mainTab === t.key)} onClick={() => setMainTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ═══════════════════════════ CSV/Excel Tab ═══════════════════════════ */}
          {mainTab === 'csv' && (
            <div>
              {/* Instructions */}
              <div style={{ ...card, background: BG, border: `1px solid ${BDR}` }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: A, marginBottom: 6 }}>匯入說明</div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#374151', lineHeight: 1.8 }}>
                  <li>支援 CSV、TSV、JSON 格式檔案</li>
                  <li>CSV 檔案請使用 UTF-8 編碼，避免亂碼</li>
                  <li>第一行必須為欄位標題（表頭）</li>
                  <li>日期格式建議使用 YYYY-MM-DD（例：2024-01-15）</li>
                  <li>匯入前請先備份現有資料</li>
                </ul>
              </div>

              {/* Import Result (shown after import) */}
              {importResult && (
                <div style={card}>
                  <div style={hdr}>匯入結果</div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div style={{ flex: 1, minWidth: 140, padding: 16, background: '#f0fdf4', borderRadius: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: SUCCESS }}>{importResult.success}</div>
                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>成功匯入</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 140, padding: 16, background: importResult.failed ? '#fef2f2' : '#f9fafb', borderRadius: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: importResult.failed ? DANGER : '#9ca3af' }}>{importResult.failed}</div>
                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>匯入失敗</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 140, padding: 16, background: '#f9fafb', borderRadius: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: '#374151' }}>{importResult.success + importResult.failed}</div>
                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>總筆數</div>
                    </div>
                  </div>

                  {/* Error Log */}
                  {importResult.errors.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: DANGER }}>錯誤記錄（{importResult.errors.length} 筆）</span>
                        <button style={smBtn(DANGER)} onClick={downloadErrorReport}>下載錯誤報告</button>
                      </div>
                      <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#fef2f2' }}>
                              <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #fecaca', fontSize: 12 }}>行號</th>
                              <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #fecaca', fontSize: 12 }}>錯誤詳情</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importResult.errors.slice(0, 50).map((e, i) => (
                              <tr key={i} style={{ background: i % 2 ? '#fff' : '#fff7f7' }}>
                                <td style={{ padding: '5px 10px', borderBottom: '1px solid #fef2f2', fontWeight: 600 }}>第 {e.row} 行</td>
                                <td style={{ padding: '5px 10px', borderBottom: '1px solid #fef2f2', color: DANGER }}>{e.errors.join('；')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {importResult.errors.length > 50 && (
                          <div style={{ padding: 8, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
                            顯示前 50 筆錯誤，請下載完整報告查看全部
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button style={btn()} onClick={resetImport}>匯入其他檔案</button>
                  </div>
                </div>
              )}

              {/* Drag & Drop Zone */}
              {!importResult && (
                <>
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      ...card,
                      border: dragOver ? `2px dashed ${A}` : '2px dashed #d1d5db',
                      background: dragOver ? BG : '#fafafa',
                      textAlign: 'center',
                      padding: '48px 20px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: 40, marginBottom: 12 }}>
                      <span role="img" aria-label="upload">&#128196;</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                      拖放檔案到此處，或點擊選擇檔案
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                      支援 .csv, .tsv, .json 格式（最大 50MB）
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx,.json,.tsv,.txt"
                      onChange={handleFileInput}
                      style={{ display: 'none' }}
                    />
                    {fileName && (
                      <div style={{ marginTop: 16, padding: '8px 16px', background: BG, borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: A }}>{fileName}</span>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>({fmtSize(fileSize)})</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); resetImport(); }}
                          style={{ ...smBtn(DANGER), marginLeft: 8 }}
                        >
                          移除
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Column Mapping */}
                  {parsedData && (
                    <div style={card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                        <div style={hdr}>欄位映射</div>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>
                          偵測到 {parsedData.headers.length} 個欄位，{parsedData.rows.length} 筆資料
                        </span>
                      </div>
                      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
                        請將檔案中的欄位對應到系統欄位。標示 * 為必填欄位。
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                        {parsedData.headers.map(h => {
                          const mappedField = SYSTEM_FIELDS.find(f => f.key === columnMapping[h]);
                          const isMapped = !!columnMapping[h];
                          return (
                            <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: isMapped ? '#f0fdf4' : '#f9fafb', borderRadius: 8, border: `1px solid ${isMapped ? '#bbf7d0' : '#e5e7eb'}` }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{h}</div>
                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                                  範例：{parsedData.rows[0]?.[h] || '(空)'}
                                </div>
                              </div>
                              <select
                                value={columnMapping[h] || ''}
                                onChange={e => updateMapping(h, e.target.value)}
                                style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, minWidth: 100, background: '#fff' }}
                              >
                                <option value="">-- 不匯入 --</option>
                                <optgroup label="病人資料">
                                  {SYSTEM_FIELDS.filter(f => f.category === 'patient').map(f => (
                                    <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                                  ))}
                                </optgroup>
                                <optgroup label="預約資料">
                                  {SYSTEM_FIELDS.filter(f => f.category === 'booking').map(f => (
                                    <option key={f.key} value={f.key}>{f.label}</option>
                                  ))}
                                </optgroup>
                                <optgroup label="財務資料">
                                  {SYSTEM_FIELDS.filter(f => f.category === 'finance').map(f => (
                                    <option key={f.key} value={f.key}>{f.label}</option>
                                  ))}
                                </optgroup>
                              </select>
                            </div>
                          );
                        })}
                      </div>

                      {/* Validation Summary */}
                      {validationSummary && (
                        <div style={{ marginTop: 16, padding: 12, background: validationSummary.requiredMapped ? '#f0fdf4' : '#fffbeb', borderRadius: 8, border: `1px solid ${validationSummary.requiredMapped ? '#bbf7d0' : '#fde68a'}` }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: validationSummary.requiredMapped ? SUCCESS : WARN, marginBottom: 4 }}>
                            {validationSummary.requiredMapped ? '必填欄位已映射' : '請映射所有必填欄位'}
                          </div>
                          {validationSummary.errors.length > 0 && (
                            <div style={{ fontSize: 12, color: WARN }}>
                              {validationSummary.errors.length} 筆資料有驗證問題（可在匯入後查看詳情）
                            </div>
                          )}
                          {validationSummary.duplicates.length > 0 && (
                            <div style={{ fontSize: 12, color: WARN, marginTop: 2 }}>
                              偵測到 {validationSummary.duplicates.length} 筆重複資料
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview Table */}
                  {parsedData && previewRows.length > 0 && (
                    <div style={card}>
                      <div style={hdr}>資料預覽（前 {previewRows.length} 筆）</div>
                      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr>
                              <th style={{ padding: '8px 10px', background: BG, textAlign: 'left', borderBottom: `2px solid ${BDR}`, whiteSpace: 'nowrap', fontSize: 11, color: A, fontWeight: 700 }}>#</th>
                              {parsedData.headers.map(h => {
                                const mapped = SYSTEM_FIELDS.find(f => f.key === columnMapping[h]);
                                return (
                                  <th key={h} style={{ padding: '8px 10px', background: BG, textAlign: 'left', borderBottom: `2px solid ${BDR}`, whiteSpace: 'nowrap', fontSize: 11 }}>
                                    <div style={{ color: '#374151' }}>{h}</div>
                                    {mapped && <div style={{ ...tag(A), marginTop: 2 }}>{mapped.label}</div>}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.map((row, i) => (
                              <tr key={i} style={{ background: i % 2 ? '#f9fafb' : '#fff' }}>
                                <td style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', color: '#9ca3af', fontWeight: 600 }}>{i + 1}</td>
                                {parsedData.headers.map(h => (
                                  <td key={h} style={{ padding: '6px 10px', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {row[h] || <span style={{ color: '#d1d5db' }}>-</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {parsedData.rows.length > 10 && (
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8, textAlign: 'center' }}>
                          共 {parsedData.rows.length} 筆資料，僅顯示前 10 筆
                        </div>
                      )}
                    </div>
                  )}

                  {/* Import Button + Progress */}
                  {parsedData && (
                    <div style={card}>
                      {importing ? (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: A }}>匯入中...</span>
                            <span style={{ fontSize: 13, color: '#6b7280' }}>{importProgress}%</span>
                          </div>
                          <div style={{ background: '#e5e7eb', borderRadius: 999, height: 12, overflow: 'hidden' }}>
                            <div style={{
                              width: `${importProgress}%`,
                              height: '100%',
                              background: `linear-gradient(90deg, ${A}, #14b8a6)`,
                              borderRadius: 999,
                              transition: 'width 0.3s ease',
                              animation: 'pulse 1.5s ease-in-out infinite',
                            }} />
                          </div>
                          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }`}</style>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            style={{
                              ...btn(),
                              opacity: validationSummary?.requiredMapped ? 1 : 0.5,
                              padding: '10px 28px',
                              fontSize: 15,
                            }}
                            onClick={handleImport}
                            disabled={!validationSummary?.requiredMapped}
                          >
                            匯入 {parsedData.rows.length} 筆資料
                          </button>
                          <button style={btnO} onClick={resetImport}>清除</button>
                          {validationSummary && !validationSummary.requiredMapped && (
                            <span style={{ fontSize: 12, color: WARN }}>請先完成必填欄位映射</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ═══════════════════════════ Manual Input Tab ═══════════════════════════ */}
          {mainTab === 'manual' && (
            <div>
              <div style={{ ...card, background: BG, border: `1px solid ${BDR}` }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: A, marginBottom: 6 }}>手動輸入說明</div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#374151', lineHeight: 1.8 }}>
                  <li>適用於少量資料的快速輸入</li>
                  <li>每行代表一筆病人/預約記錄</li>
                  <li>病人姓名為必填欄位</li>
                  <li>可隨時新增或刪除行</li>
                </ul>
              </div>

              {importResult && (
                <div style={card}>
                  <div style={hdr}>匯入結果</div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div style={{ padding: '10px 20px', background: '#f0fdf4', borderRadius: 10 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: SUCCESS }}>{importResult.success}</span>
                      <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 6 }}>成功</span>
                    </div>
                    <div style={{ padding: '10px 20px', background: importResult.failed ? '#fef2f2' : '#f9fafb', borderRadius: 10 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: importResult.failed ? DANGER : '#9ca3af' }}>{importResult.failed}</span>
                      <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 6 }}>失敗</span>
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <button style={smBtn(DANGER)} onClick={downloadErrorReport}>下載錯誤報告</button>
                    </div>
                  )}
                  <button style={btn()} onClick={() => { setImportResult(null); setManualRows([createEmptyRow()]); }}>繼續輸入</button>
                </div>
              )}

              {!importResult && (
                <div style={card}>
                  <div style={hdr}>逐筆輸入</div>
                  <div style={{ overflowX: 'auto' }}>
                    {manualRows.map((row, idx) => (
                      <div key={idx} style={{ padding: 12, marginBottom: 10, background: idx % 2 ? '#f9fafb' : '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: A }}>第 {idx + 1} 筆</span>
                          {manualRows.length > 1 && (
                            <button style={smBtn(DANGER)} onClick={() => removeManualRow(idx)}>刪除</button>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                          {SYSTEM_FIELDS.map(f => (
                            <div key={f.key}>
                              <label style={{ fontSize: 11, color: '#6b7280', marginBottom: 2, display: 'block' }}>
                                {f.label}{f.required ? ' *' : ''}
                              </label>
                              {f.key === 'gender' ? (
                                <select
                                  value={row[f.key]}
                                  onChange={e => updateManualRow(idx, f.key, e.target.value)}
                                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' }}
                                >
                                  <option value="">-- 選擇 --</option>
                                  <option value="男">男</option>
                                  <option value="女">女</option>
                                  <option value="其他">其他</option>
                                </select>
                              ) : (
                                <input
                                  type={f.key.includes('Date') || f.key === 'dob' ? 'date' : f.key.includes('Amount') ? 'number' : f.key.includes('Time') ? 'time' : 'text'}
                                  value={row[f.key]}
                                  onChange={e => updateManualRow(idx, f.key, e.target.value)}
                                  placeholder={f.label}
                                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${f.required && !row[f.key] ? '#fca5a5' : '#d1d5db'}`, fontSize: 13, boxSizing: 'border-box' }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <button style={btnO} onClick={addManualRow}>+ 新增一筆</button>
                    <button style={btn()} onClick={handleManualImport}>
                      匯入 {manualRows.filter(r => r.patientName?.trim()).length} 筆資料
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════ 中醫在線 Tab ═══════════════════════════ */}
          {mainTab === 'tcmonline' && (
            <div>
              <div style={{ ...card, background: BG, border: `1px solid ${BDR}` }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: A, marginBottom: 6 }}>從「中醫在線」匯出資料</div>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.8, margin: 0 }}>
                  請按照以下步驟從中醫在線系統匯出資料，然後使用「CSV/Excel 匯入」功能匯入至本系統。
                </p>
              </div>

              {/* Step by step guide */}
              <div style={card}>
                <div style={hdr}>匯出步驟</div>

                {[
                  { step: 1, title: '登入中醫在線後台', desc: '使用您的管理員帳號登入中醫在線系統後台管理介面。', screenshot: '【截圖位置：中醫在線登入頁面】' },
                  { step: 2, title: '進入「資料管理」', desc: '在左側選單中找到「資料管理」或「系統設定」，點擊進入。', screenshot: '【截圖位置：左側選單 > 資料管理】' },
                  { step: 3, title: '選擇匯出類型', desc: '選擇要匯出的資料類型：病人資料、預約記錄、收支記錄等。建議逐項匯出。', screenshot: '【截圖位置：匯出類型選擇介面】' },
                  { step: 4, title: '設定匯出格式', desc: '選擇匯出格式為 CSV（建議）或 Excel。確保編碼設定為 UTF-8。', screenshot: '【截圖位置：匯出格式設定頁面】' },
                  { step: 5, title: '下載匯出檔案', desc: '點擊「匯出」或「下載」按鈕，等待系統生成檔案後下載。', screenshot: '【截圖位置：下載按鈕位置】' },
                  { step: 6, title: '匯入至 ClinicOS', desc: '切換至「CSV/Excel 匯入」分頁，上傳剛才下載的檔案，完成欄位映射後匯入。', screenshot: '【截圖位置：ClinicOS 匯入介面】' },
                ].map(s => (
                  <div key={s.step} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: s.step < 6 ? '1px solid #f3f4f6' : 'none' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: A, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                      {s.step}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 4 }}>{s.title}</div>
                      <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>{s.desc}</div>
                      <div style={{ marginTop: 8, padding: '20px 16px', background: '#f3f4f6', borderRadius: 8, textAlign: 'center', color: '#9ca3af', fontSize: 12, border: '1px dashed #d1d5db' }}>
                        {s.screenshot}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Common field mapping reference */}
              <div style={card}>
                <div style={hdr}>常見欄位對照表</div>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px' }}>
                  中醫在線匯出的欄位名稱與本系統的對應關係：
                </p>
                <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: BG }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `2px solid ${BDR}`, color: A }}>中醫在線欄位</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `2px solid ${BDR}`, color: A }}>ClinicOS 欄位</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `2px solid ${BDR}`, color: A }}>備註</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['病人姓名 / Name', '病人姓名', '必填'],
                        ['聯絡電話 / Phone', '電話', ''],
                        ['身份證號碼 / HKID', '身份證', ''],
                        ['通訊地址 / Address', '地址', ''],
                        ['出生日期 / DOB', '出生日期', 'YYYY-MM-DD'],
                        ['性別 / Gender', '性別', '男 / 女'],
                        ['藥物過敏 / Allergy', '過敏史', ''],
                        ['預約日期', '預約日期', 'YYYY-MM-DD'],
                        ['預約時間', '預約時間', 'HH:MM'],
                        ['診療醫師', '醫師', ''],
                        ['診金 / 金額', '收入金額', '數字'],
                        ['支出金額', '支出金額', '數字'],
                        ['類型 / 分類', '類別', ''],
                      ].map((r, i) => (
                        <tr key={i} style={{ background: i % 2 ? '#f9fafb' : '#fff' }}>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid #f3f4f6' }}>{r[0]}</td>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid #f3f4f6', fontWeight: 600 }}>{r[1]}</td>
                          <td style={{ padding: '6px 12px', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontSize: 12 }}>{r[2]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <button style={btn()} onClick={() => setMainTab('csv')}>
                  前往 CSV/Excel 匯入
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════ Reconciliation Tab ═══════════════════════════ */}
          {mainTab === 'reconciliation' && (
            <div>
              <div style={{ ...card, background: BG, border: `1px solid ${BDR}` }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: A, marginBottom: 6 }}>每日對帳說明</div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#374151', lineHeight: 1.8 }}>
                  <li>比較匯入資料與現有系統資料</li>
                  <li>找出缺漏的病人記錄、金額差異等</li>
                  <li>建議在遷移期間每日執行對帳</li>
                </ul>
              </div>

              <div style={card}>
                <div style={hdr}>日期範圍</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>起始日期</label>
                    <input
                      type="date"
                      value={reconDateFrom}
                      onChange={e => setReconDateFrom(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>結束日期</label>
                    <input
                      type="date"
                      value={reconDateTo}
                      onChange={e => setReconDateTo(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
                    />
                  </div>
                  <div style={{ alignSelf: 'flex-end' }}>
                    <button style={btn()} onClick={runReconciliation}>執行對帳</button>
                  </div>
                </div>

                {reconResult && (
                  <div>
                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
                      <div style={{ padding: 16, background: BG, borderRadius: 12, border: `1px solid ${BDR}` }}>
                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>匯入病人數</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: A }}>{reconResult.importedPatients}</div>
                      </div>
                      <div style={{ padding: 16, background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>現有病人數</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#374151' }}>{reconResult.existingPatients}</div>
                      </div>
                      <div style={{ padding: 16, background: reconResult.missingPatients.length ? '#fffbeb' : '#f0fdf4', borderRadius: 12, border: `1px solid ${reconResult.missingPatients.length ? '#fde68a' : '#bbf7d0'}` }}>
                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>未匹配病人</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: reconResult.missingPatients.length ? WARN : SUCCESS }}>{reconResult.missingPatients.length}</div>
                      </div>
                      <div style={{ padding: 16, background: Math.abs(reconResult.revenueDiff) > 0.01 ? '#fef2f2' : '#f0fdf4', borderRadius: 12, border: `1px solid ${Math.abs(reconResult.revenueDiff) > 0.01 ? '#fecaca' : '#bbf7d0'}` }}>
                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>金額差異</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: Math.abs(reconResult.revenueDiff) > 0.01 ? DANGER : SUCCESS }}>
                          ${Math.abs(reconResult.revenueDiff).toLocaleString('zh-HK', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    {/* Revenue Comparison */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>收入比較</div>
                      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: BG }}>
                              <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: `2px solid ${BDR}` }}>項目</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: `2px solid ${BDR}` }}>匯入資料</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: `2px solid ${BDR}` }}>系統資料</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: `2px solid ${BDR}` }}>差異</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>記錄筆數</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{reconResult.importedRevenueCount}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>{reconResult.existingRevenueCount}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6', color: reconResult.importedRevenueCount !== reconResult.existingRevenueCount ? WARN : SUCCESS }}>
                                {reconResult.importedRevenueCount - reconResult.existingRevenueCount}
                              </td>
                            </tr>
                            <tr style={{ background: '#f9fafb' }}>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>金額總計</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>${reconResult.importedRevenue.toLocaleString('zh-HK', { minimumFractionDigits: 2 })}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6' }}>${reconResult.existingRevenue.toLocaleString('zh-HK', { minimumFractionDigits: 2 })}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #f3f4f6', fontWeight: 700, color: Math.abs(reconResult.revenueDiff) > 0.01 ? DANGER : SUCCESS }}>
                                {reconResult.revenueDiff >= 0 ? '+' : '-'}${Math.abs(reconResult.revenueDiff).toLocaleString('zh-HK', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Missing Patients */}
                    {reconResult.missingPatients.length > 0 && (
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: WARN, marginBottom: 8 }}>
                          未匹配病人（{reconResult.missingPatients.length} 位）
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 8, border: '1px solid #fde68a' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#fffbeb' }}>
                                <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #fde68a' }}>姓名</th>
                                <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #fde68a' }}>電話</th>
                                <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #fde68a' }}>匯入來源</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reconResult.missingPatients.slice(0, 50).map((p, i) => (
                                <tr key={i} style={{ background: i % 2 ? '#fff' : '#fffef5' }}>
                                  <td style={{ padding: '5px 10px', borderBottom: '1px solid #fef3c7' }}>{p.name || '-'}</td>
                                  <td style={{ padding: '5px 10px', borderBottom: '1px solid #fef3c7' }}>{p.phone || '-'}</td>
                                  <td style={{ padding: '5px 10px', borderBottom: '1px solid #fef3c7' }}>{p.source || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {reconResult.missingPatients.length === 0 && Math.abs(reconResult.revenueDiff) < 0.01 && (
                      <div style={{ padding: 20, textAlign: 'center', background: '#f0fdf4', borderRadius: 12 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: SUCCESS, marginBottom: 4 }}>對帳完成，無差異</div>
                        <div style={{ fontSize: 13, color: '#6b7280' }}>匯入資料與系統資料一致</div>
                      </div>
                    )}
                  </div>
                )}

                {!reconResult && (
                  <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                    選擇日期範圍後點擊「執行對帳」開始比較
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════ Side Panel: Migration Guide ═══════════════════════════ */}
        {showGuide && (
          <div style={{ width: 320, flexShrink: 0 }}>
            <div style={{ ...card, position: 'sticky', top: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={hdr}>遷移指南</div>
                <button
                  onClick={() => setShowGuide(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', padding: 4 }}
                >
                  &#10005;
                </button>
              </div>

              {/* Steps */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>遷移步驟</div>
                {[
                  '在中醫在線後台匯出所有資料',
                  '檢查匯出檔案是否完整',
                  '使用本工具匯入資料',
                  '執行對帳確認資料無誤',
                  '通知團隊完成系統切換',
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', fontSize: 13, color: '#4b5563' }}>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: BG, border: `1px solid ${BDR}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: A, flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>

              {/* Checklist */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>資料遷移清單</div>
                {MIGRATION_CHECKLIST.map(c => (
                  <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                    <input
                      type="checkbox"
                      checked={checklist[c.key]}
                      onChange={() => setChecklist(prev => ({ ...prev, [c.key]: !prev[c.key] }))}
                      style={{ accentColor: A, width: 16, height: 16 }}
                    />
                    <span style={{ textDecoration: checklist[c.key] ? 'line-through' : 'none', color: checklist[c.key] ? '#9ca3af' : '#374151' }}>
                      {c.label}
                    </span>
                  </label>
                ))}
                <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                  已完成：{Object.values(checklist).filter(Boolean).length} / {MIGRATION_CHECKLIST.length}
                </div>
                {/* Progress bar for checklist */}
                <div style={{ background: '#e5e7eb', borderRadius: 999, height: 6, marginTop: 6, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(Object.values(checklist).filter(Boolean).length / MIGRATION_CHECKLIST.length) * 100}%`,
                    height: '100%',
                    background: A,
                    borderRadius: 999,
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>

              {/* Tips */}
              <div style={{ padding: 12, background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: WARN, marginBottom: 4 }}>注意事項</div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: '#92400e', lineHeight: 1.7 }}>
                  <li>匯入前請先備份現有資料</li>
                  <li>建議先用少量資料測試</li>
                  <li>大量資料匯入可能需要較長時間</li>
                  <li>遷移期間建議兩套系統並行使用</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Media query simulation for mobile via inline styles */}
      <style>{`
        @media (max-width: 768px) {
          .data-import-container > div > div:last-child {
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
