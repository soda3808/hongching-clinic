import { useState, useMemo } from 'react';
import { fmtM } from '../data';

const A = '#0e7490';
const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 14, border: '1px solid #e5e7eb' };
const hdr = { fontSize: 15, fontWeight: 700, color: A, marginBottom: 10 };
const btn = (c = A) => ({ padding: '7px 16px', borderRadius: 6, border: 'none', background: c, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 });
const btnO = { ...btn('#fff'), border: `1px solid ${A}`, color: A, background: '#fff' };
const smBtn = (c = A) => ({ ...btn(c), padding: '4px 10px', fontSize: 12 });
const tag = (c) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c + '18', color: c });

const CATEGORIES = [
  { key: 'revenue', label: '營業紀錄', dated: true, fields: ['id','date','name','item','amount','payment','store','doctor','note'] },
  { key: 'expenses', label: '開支紀錄', dated: true, fields: ['id','date','merchant','amount','category','store','payment','desc'] },
  { key: 'patients', label: '病人名單', dated: false, fields: ['id','name','phone','dob','gender','store','address','allergy','notes','createdAt'] },
  { key: 'bookings', label: '預約紀錄', dated: true, fields: ['id','date','time','name','phone','doctor','store','service','status','notes'] },
  { key: 'consultations', label: '診療紀錄', dated: true, fields: ['id','date','patientName','doctor','diagnosis','prescription','treatment','followUpDate','notes'] },
  { key: 'inventory', label: '藥材庫存', dated: false, fields: ['id','name','category','stock','minStock','unit','cost','store','supplier','expiryDate'] },
  { key: 'arap', label: '應收應付', dated: true, fields: ['id','type','date','party','amount','desc','dueDate','status'] },
  { key: 'sickleaves', label: '假紙紀錄', dated: true, fields: ['id','patientName','patientPhone','doctor','store','diagnosis','startDate','endDate','days','notes'] },
  { key: 'leaves', label: '請假紀錄', dated: true, fields: ['id','staffName','type','startDate','endDate','reason','status','approvedBy'] },
  { key: 'payslips', label: '糧單紀錄', dated: true, fields: ['id','date','staffName','baseSalary','commission','allowance','deduction','mpf','net'] },
  { key: 'products', label: '商品紀錄', dated: false, fields: ['id','name','category','price','cost','stock','minStock','unit','store','barcode','active'] },
  { key: 'queue', label: '排隊紀錄', dated: true, fields: ['id','date','ticketNo','patientName','phone','doctor','store','status','service','createdAt'] },
];

function dl(blob, name) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = u; a.download = name; a.click();
  URL.revokeObjectURL(u);
}
function fmtDate(d) { return d ? new Date(d).toLocaleString('zh-HK') : '-'; }
function today() { return new Date().toISOString().substring(0, 10); }

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('hcmc_export_history')) || []; } catch { return []; }
}
function saveHistory(h) { localStorage.setItem('hcmc_export_history', JSON.stringify(h.slice(0, 100))); }

function toCSV(rows, fields) {
  if (!rows.length) return '';
  const header = fields.join(',');
  const body = rows.map(r => fields.map(f => {
    let v = r[f] ?? '';
    v = String(v).replace(/"/g, '""');
    return /[,"\n]/.test(v) ? `"${v}"` : v;
  }).join(',')).join('\n');
  return '\uFEFF' + header + '\n' + body;
}

export default function ExcelExport({ data, showToast, user }) {
  const [selected, setSelected] = useState(new Set(['revenue']));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState(today());
  const [format, setFormat] = useState('csv');
  const [fieldSel, setFieldSel] = useState({});
  const [previewCat, setPreviewCat] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(loadHistory);

  const toggle = (key) => setSelected(prev => {
    const s = new Set(prev);
    s.has(key) ? s.delete(key) : s.add(key);
    return s;
  });

  const selectAll = () => setSelected(new Set(CATEGORIES.map(c => c.key)));
  const selectNone = () => setSelected(new Set());

  const getFields = (cat) => {
    const sel = fieldSel[cat.key];
    return sel ? cat.fields.filter(f => sel[f] !== false) : cat.fields;
  };

  const toggleField = (catKey, field) => {
    setFieldSel(prev => {
      const cur = prev[catKey] || {};
      const cat = CATEGORIES.find(c => c.key === catKey);
      const base = {};
      cat.fields.forEach(f => { base[f] = cur[f] !== false; });
      base[field] = !base[field];
      return { ...prev, [catKey]: base };
    });
  };

  const filterByDate = (rows, cat) => {
    if (!cat.dated) return rows;
    return rows.filter(r => {
      const d = r.date || r.startDate || r.createdAt || '';
      if (!d) return true;
      const ds = d.substring(0, 10);
      if (dateFrom && ds < dateFrom) return false;
      if (dateTo && ds > dateTo) return false;
      return true;
    });
  };

  const getRows = (cat) => {
    const raw = data[cat.key] || [];
    return filterByDate(raw, cat);
  };

  const previewData = useMemo(() => {
    if (!previewCat) return [];
    const cat = CATEGORIES.find(c => c.key === previewCat);
    if (!cat) return [];
    const rows = getRows(cat);
    const fields = getFields(cat);
    return rows.slice(0, 5).map(r => {
      const o = {};
      fields.forEach(f => { o[f] = r[f] ?? ''; });
      return o;
    });
  }, [previewCat, data, dateFrom, dateTo, fieldSel]);

  const doExport = (catKey) => {
    const cat = CATEGORIES.find(c => c.key === catKey);
    if (!cat) return;
    const rows = getRows(cat);
    const fields = getFields(cat);
    if (!rows.length) { showToast?.(`${cat.label}：沒有數據可匯出`); return; }

    const stamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 15);
    let blob, fileName;
    if (format === 'csv') {
      const csv = toCSV(rows, fields);
      blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      fileName = `${cat.label}_${stamp}.csv`;
    } else {
      const jsonRows = rows.map(r => { const o = {}; fields.forEach(f => { o[f] = r[f] ?? ''; }); return o; });
      blob = new Blob([JSON.stringify(jsonRows, null, 2)], { type: 'application/json' });
      fileName = `${cat.label}_${stamp}.json`;
    }
    dl(blob, fileName);

    const entry = { id: Date.now(), date: new Date().toISOString(), user: user?.name || user?.userId || '系統', category: cat.label, format, rows: rows.length, fields: fields.length };
    const next = [entry, ...history].slice(0, 100);
    setHistory(next);
    saveHistory(next);
    showToast?.(`已匯出 ${cat.label}（${rows.length} 筆）`);
  };

  const bulkExport = () => {
    const cats = CATEGORIES.filter(c => selected.has(c.key));
    if (!cats.length) { showToast?.('請先選擇匯出項目'); return; }
    cats.forEach(c => doExport(c.key));
  };

  const stats = useMemo(() => CATEGORIES.map(c => ({ ...c, count: getRows(c).length })), [data, dateFrom, dateTo]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: A, marginBottom: 4 }}>數據匯出中心</h2>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>選擇類別、日期範圍及格式，預覽後匯出 CSV / JSON</p>

      {/* Date + Format */}
      <div style={card}>
        <div style={hdr}>篩選條件</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <label style={{ fontSize: 13 }}>開始日期
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ marginLeft: 6, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
          </label>
          <label style={{ fontSize: 13 }}>結束日期
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ marginLeft: 6, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
          </label>
          <label style={{ fontSize: 13 }}>格式
            <select value={format} onChange={e => setFormat(e.target.value)} style={{ marginLeft: 6, padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </label>
        </div>
      </div>

      {/* Category Selection */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={hdr}>匯出類別</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={selectAll} style={smBtn()}>全選</button>
            <button onClick={selectNone} style={smBtn('#6b7280')}>清除</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {stats.map(c => (
            <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: selected.has(c.key) ? `2px solid ${A}` : '2px solid #e5e7eb', background: selected.has(c.key) ? '#f0fdfa' : '#fff', cursor: 'pointer', fontSize: 13, transition: 'all .15s' }}>
              <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} style={{ accentColor: A }} />
              <span style={{ fontWeight: 600 }}>{c.label}</span>
              <span style={{ ...tag(c.count ? '#059669' : '#9ca3af'), marginLeft: 'auto' }}>{c.count} 筆</span>
            </label>
          ))}
        </div>
      </div>

      {/* Field Selection */}
      {selected.size > 0 && (
        <div style={card}>
          <div style={hdr}>欄位選擇</div>
          {CATEGORIES.filter(c => selected.has(c.key)).map(cat => (
            <div key={cat.key} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>{cat.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cat.fields.map(f => {
                  const checked = !fieldSel[cat.key] || fieldSel[cat.key][f] !== false;
                  return (
                    <label key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, padding: '2px 8px', borderRadius: 12, background: checked ? '#ecfdf5' : '#f3f4f6', color: checked ? '#065f46' : '#9ca3af', cursor: 'pointer', border: `1px solid ${checked ? '#a7f3d0' : '#e5e7eb'}` }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleField(cat.key, f)} style={{ accentColor: A, width: 12, height: 12 }} />
                      {f}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={hdr}>預覽（前 5 筆）</div>
          <select value={previewCat || ''} onChange={e => setPreviewCat(e.target.value || null)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
            <option value="">— 選擇類別 —</option>
            {CATEGORIES.filter(c => selected.has(c.key)).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        {previewCat && previewData.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>{Object.keys(previewData[0]).map(k => <th key={k} style={{ padding: '6px 8px', background: '#f0fdfa', color: A, fontWeight: 700, textAlign: 'left', borderBottom: `2px solid ${A}`, whiteSpace: 'nowrap' }}>{k}</th>)}</tr>
              </thead>
              <tbody>
                {previewData.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 ? '#fafafa' : '#fff' }}>
                    {Object.values(r).map((v, j) => <td key={j} style={{ padding: '5px 8px', borderBottom: '1px solid #e5e7eb', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(v)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : previewCat ? (
          <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 16 }}>沒有數據</p>
        ) : (
          <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 16 }}>請選擇類別以預覽</p>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={bulkExport} style={btn()} disabled={!selected.size}>批量匯出（{selected.size} 項）</button>
        {CATEGORIES.filter(c => selected.has(c.key)).map(c => (
          <button key={c.key} onClick={() => doExport(c.key)} style={btnO}>{c.label}</button>
        ))}
        <button onClick={() => setShowHistory(!showHistory)} style={{ ...smBtn('#6b7280'), marginLeft: 'auto' }}>{showHistory ? '隱藏紀錄' : '匯出紀錄'}</button>
      </div>

      {/* Export History */}
      {showHistory && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={hdr}>匯出紀錄</div>
            {history.length > 0 && <button onClick={() => { setHistory([]); saveHistory([]); showToast?.('已清除匯出紀錄'); }} style={smBtn('#dc2626')}>清除紀錄</button>}
          </div>
          {history.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 16 }}>暫無匯出紀錄</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['時間', '操作員', '類別', '格式', '筆數', '欄位數'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', background: '#f9fafb', fontWeight: 700, textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#374151' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 20).map(h => (
                    <tr key={h.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>{fmtDate(h.date)}</td>
                      <td style={{ padding: '5px 8px' }}>{h.user}</td>
                      <td style={{ padding: '5px 8px' }}><span style={tag(A)}>{h.category}</span></td>
                      <td style={{ padding: '5px 8px' }}><span style={tag(h.format === 'csv' ? '#059669' : '#7c3aed')}>{h.format.toUpperCase()}</span></td>
                      <td style={{ padding: '5px 8px' }}>{h.rows}</td>
                      <td style={{ padding: '5px 8px' }}>{h.fields}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
