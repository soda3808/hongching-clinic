import { useState, useMemo } from 'react';
import { getStoreNames, TCM_HERBS_DB } from '../data';
import { getClinicName } from '../tenant';

const ACCENT = '#0e7490';
const ACCENT_LIGHT = '#e0f2fe';
const NATURES = ['寒','熱','溫','涼','平'];
const TASTES = ['酸','苦','甘','辛','咸','淡'];
const MERIDIANS = ['心','肝','脾','肺','腎','胃','膽','大腸','小腸','膀胱','三焦','心包'];
const PROCESSES = ['先煎','後下','打碎','沖服','包煎','另煎','烊化'];
const LOG_KEY = 'hcmc_medicine_logs';

function loadLogs() { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } }
function saveLogs(arr) { localStorage.setItem(LOG_KEY, JSON.stringify(arr.slice(0, 2000))); }
function fmtDate(d) { return d ? String(d).substring(0, 10) : '-'; }
function fmtNum(n) { const v = Number(n); return isNaN(v) ? '0' : v.toLocaleString('en-HK'); }

const TABS = ['基本資料','入庫價格分析','藥物分析','藥物使用記錄','藥物修改記錄','藥物入庫記錄','藥物日誌'];

const s = {
  page: { padding: 16, fontFamily: '-apple-system, sans-serif', color: '#1e293b', maxWidth: 1100, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 700, color: ACCENT },
  tabs: { display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 16, overflowX: 'auto' },
  tab: (a) => ({ padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: a ? 700 : 400, color: a ? ACCENT : '#64748b', borderBottom: a ? `3px solid ${ACCENT}` : '3px solid transparent', background: 'none', border: 'none', whiteSpace: 'nowrap' }),
  card: { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  label: { fontSize: 12, color: '#64748b', marginBottom: 2 },
  value: { fontSize: 14, fontWeight: 600, color: '#1e293b' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 },
  input: { width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' },
  select: { padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, background: '#fff' },
  th: { padding: '8px 10px', textAlign: 'left', fontSize: 12, color: '#64748b', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' },
  td: { padding: '7px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9' },
  badge: (c, bg) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: c, background: bg }),
  btn: { padding: '6px 16px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, color: '#fff', background: ACCENT, cursor: 'pointer' },
  textarea: { width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, minHeight: 50, boxSizing: 'border-box', resize: 'vertical' },
  bar: (pct, color) => ({ height: 18, width: `${Math.min(pct, 100)}%`, background: color || ACCENT, borderRadius: 4, minWidth: pct > 0 ? 4 : 0, transition: 'width .3s' }),
  barBg: { height: 18, background: '#f1f5f9', borderRadius: 4, flex: 1 },
};

export default function MedicineDetail({ data, showToast, user }) {
  const [tab, setTab] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [logs] = useState(loadLogs);

  const inventory = data.inventory || [];
  const consultations = data.consultations || [];
  const clinicName = getClinicName();
  const stores = getStoreNames();

  // Search / select medicine
  const filtered = useMemo(() => {
    if (!search) return inventory;
    const q = search.toLowerCase();
    return inventory.filter(i => i.name?.toLowerCase().includes(q) || i.barcode?.toLowerCase().includes(q) || i.supplier?.toLowerCase().includes(q));
  }, [inventory, search]);

  const med = useMemo(() => inventory.find(i => i.id === selectedId) || null, [inventory, selectedId]);

  // TCM_HERBS_DB metadata for selected medicine
  const herbMeta = useMemo(() => {
    if (!med) return null;
    return TCM_HERBS_DB.find(h => h.n === med.name) || null;
  }, [med]);

  // Usage records from consultations
  const usageRecords = useMemo(() => {
    if (!med) return [];
    return consultations.filter(c => (c.prescription || []).some(rx => rx.herb === med.name))
      .map(c => {
        const rx = (c.prescription || []).find(r => r.herb === med.name);
        return { date: c.date, patient: c.patientName || '-', doctor: c.doctor || '-', formula: c.formulaName || '-', dosage: rx?.dosage || '-', days: c.formulaDays || '-' };
      }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [med, consultations]);

  // Medicine logs filtered for this medicine
  const medicineLogs = useMemo(() => {
    if (!med) return [];
    return logs.filter(l => l.medicineId === med.id || l.medicineName === med.name).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [med, logs]);

  const modLogs = useMemo(() => medicineLogs.filter(l => l.type === 'modify'), [medicineLogs]);
  const stockInLogs = useMemo(() => medicineLogs.filter(l => l.type === 'stockin'), [medicineLogs]);
  const dailyLogs = useMemo(() => {
    if (!med) return [];
    const dayMap = {};
    medicineLogs.forEach(l => {
      const d = fmtDate(l.date);
      if (!dayMap[d]) dayMap[d] = { date: d, inQty: 0, outQty: 0, entries: [] };
      if (l.type === 'stockin') dayMap[d].inQty += Number(l.qty) || 0;
      if (l.type === 'usage') dayMap[d].outQty += Number(l.qty) || 0;
      dayMap[d].entries.push(l);
    });
    // Also add usage from consultations
    usageRecords.forEach(u => {
      const d = fmtDate(u.date);
      if (!dayMap[d]) dayMap[d] = { date: d, inQty: 0, outQty: 0, entries: [] };
      dayMap[d].outQty += parseFloat(u.dosage) || 0;
      dayMap[d].entries.push({ type: 'usage', date: u.date, detail: `${u.patient} - ${u.doctor} - ${u.dosage}${med.unit || 'g'}` });
    });
    return Object.values(dayMap).sort((a, b) => b.date.localeCompare(a.date));
  }, [med, medicineLogs, usageRecords]);

  // Analysis: usage frequency, top doctors, common paired herbs
  const analysis = useMemo(() => {
    if (!med) return { monthCount: 0, quarterCount: 0, yearCount: 0, topDoctors: [], pairedHerbs: [] };
    const now = new Date();
    const thisMonth = now.toISOString().substring(0, 7);
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().substring(0, 10);
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().substring(0, 10);

    let monthCount = 0, quarterCount = 0, yearCount = 0;
    const doctorMap = {}, pairMap = {};

    consultations.forEach(c => {
      const rxList = c.prescription || [];
      const hasHerb = rxList.some(rx => rx.herb === med.name);
      if (!hasHerb) return;

      if (c.date?.substring(0, 7) === thisMonth) monthCount++;
      if (c.date >= threeMonthsAgo) quarterCount++;
      if (c.date >= oneYearAgo) yearCount++;

      if (c.doctor) doctorMap[c.doctor] = (doctorMap[c.doctor] || 0) + 1;
      rxList.forEach(rx => { if (rx.herb && rx.herb !== med.name) pairMap[rx.herb] = (pairMap[rx.herb] || 0) + 1; });
    });

    const topDoctors = Object.entries(doctorMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
    const pairedHerbs = Object.entries(pairMap).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count }));
    return { monthCount, quarterCount, yearCount, topDoctors, pairedHerbs };
  }, [med, consultations]);

  // Purchase price analysis
  const priceAnalysis = useMemo(() => {
    if (!med) return { records: [], avgPrice: 0, supplierPrices: [] };
    const records = stockInLogs.map(l => ({
      date: fmtDate(l.date), supplier: l.supplier || '-', qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0, total: (Number(l.qty) || 0) * (Number(l.unitPrice) || 0),
    }));
    const totalCost = records.reduce((s, r) => s + r.total, 0);
    const totalQty = records.reduce((s, r) => s + r.qty, 0);
    const avgPrice = totalQty > 0 ? totalCost / totalQty : (Number(med.cost) || 0);
    const supplierMap = {};
    records.forEach(r => {
      if (!supplierMap[r.supplier]) supplierMap[r.supplier] = { supplier: r.supplier, totalCost: 0, totalQty: 0, count: 0 };
      supplierMap[r.supplier].totalCost += r.total;
      supplierMap[r.supplier].totalQty += r.qty;
      supplierMap[r.supplier].count++;
    });
    const supplierPrices = Object.values(supplierMap).map(sp => ({ ...sp, avg: sp.totalQty > 0 ? sp.totalCost / sp.totalQty : 0 })).sort((a, b) => a.avg - b.avg);
    return { records, avgPrice, supplierPrices };
  }, [med, stockInLogs]);

  const Field = ({ label, value }) => (
    <div><div style={s.label}>{label}</div><div style={s.value}>{value ?? '-'}</div></div>
  );

  // ═══ Selector ═══
  const renderSelector = () => (
    <div style={{ ...s.card, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <input style={s.input} placeholder="搜尋藥物名稱 / 條碼 / 供應商..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <select style={{ ...s.select, minWidth: 220 }} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
        <option value="">— 選擇藥物 —</option>
        {filtered.map(i => <option key={i.id} value={i.id}>{i.name} ({i.stock}{i.unit || 'g'}) [{i.store || ''}]</option>)}
      </select>
      {med && <span style={s.badge(ACCENT, ACCENT_LIGHT)}>{med.category || '中藥'}</span>}
    </div>
  );

  // ═══ Tab 1: Basic Info ═══
  const renderBasicInfo = () => {
    if (!med) return <div style={{ ...s.card, textAlign: 'center', color: '#94a3b8', padding: 40 }}>請先選擇藥物</div>;
    const frozenQty = usageRecords.filter(u => u.date >= new Date().toISOString().substring(0, 10)).reduce((s, u) => s + (parseFloat(u.dosage) || 0), 0);
    const remaining = (Number(med.stock) || 0) - frozenQty;
    const stockValue = (Number(med.stock) || 0) * (Number(med.cost) || 0);
    return (
      <div>
        <div style={{ ...s.card }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: ACCENT }}>藥物基本資料</div>
          <div style={s.grid}>
            <Field label="藥物名稱" value={med.name} />
            <Field label="藥物編號" value={med.id?.slice(-8) || med.barcode || '-'} />
            <Field label="現有份量(克)" value={`${fmtNum(med.stock)} ${med.unit || 'g'}`} />
            <Field label="凍結量" value={`${fmtNum(frozenQty)} ${med.unit || 'g'}`} />
            <Field label="剩餘量" value={<span style={{ color: remaining < (med.minStock || 0) ? '#ef4444' : '#10b981', fontWeight: 700 }}>{fmtNum(remaining)} {med.unit || 'g'}</span>} />
            <Field label="平均價格(HK$/克)" value={`$${(priceAnalysis.avgPrice || Number(med.cost) || 0).toFixed(2)}`} />
            <Field label="藥物庫存金額" value={`$${fmtNum(Math.round(stockValue))}`} />
            <Field label="安全量" value={`${fmtNum(med.minStock || 0)} ${med.unit || 'g'}`} />
            <Field label="供應商" value={med.supplier || '-'} />
            <Field label="BarCode" value={med.barcode || '-'} />
            <Field label="所屬分店" value={med.store || '-'} />
          </div>
        </div>
        <div style={{ ...s.card }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: ACCENT }}>中藥屬性</div>
          <div style={s.grid}>
            <Field label="所屬藥物類別" value={herbMeta?.cat || med.category || '-'} />
            <Field label="藥性" value={herbMeta?.prop || med.nature || '-'} />
            <Field label="藥味" value={herbMeta?.taste || med.taste || '-'} />
            <Field label="歸經" value={herbMeta?.mer || med.meridian || '-'} />
            <Field label="藥材處理方法" value={med.process || '-'} />
            <Field label="劑量範圍" value={herbMeta ? `${herbMeta.dMin}–${herbMeta.dMax}g` : '-'} />
            <Field label="毒性" value={herbMeta ? ['無毒','小毒','有毒','大毒'][herbMeta.tox] || '無毒' : '-'} />
            <Field label="孕婦禁忌" value={herbMeta ? ['安全','慎用','不宜','禁用'][herbMeta.preg] || '安全' : '-'} />
          </div>
        </div>
        <div style={{ ...s.card }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: ACCENT }}>詳細說明</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[['功效主治', med.efficacy], ['使用注意', med.caution], ['配伍應用', med.compatibility], ['備註', med.notes]].map(([lbl, val]) => (
              <div key={lbl}><div style={s.label}>{lbl}</div><div style={{ ...s.value, fontSize: 13, fontWeight: 400, whiteSpace: 'pre-wrap' }}>{val || '未填寫'}</div></div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ═══ Tab 2: Purchase Price Analysis ═══
  const renderPriceAnalysis = () => {
    if (!med) return <div style={{ ...s.card, textAlign: 'center', color: '#94a3b8', padding: 40 }}>請先選擇藥物</div>;
    const { records, avgPrice, supplierPrices } = priceAnalysis;
    const maxPrice = Math.max(...records.map(r => r.unitPrice), 1);
    return (
      <div>
        <div style={s.card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: ACCENT }}>入庫價格記錄</div>
          <div style={{ marginBottom: 12, fontSize: 13 }}>平均單價：<b>HK${avgPrice.toFixed(2)}/{med.unit || 'g'}</b></div>
          {records.length === 0 ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>暫無入庫記錄</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['日期','供應商','數量','單價','總價'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
                <tbody>{records.map((r, i) => (
                  <tr key={i}><td style={s.td}>{r.date}</td><td style={s.td}>{r.supplier}</td><td style={s.td}>{fmtNum(r.qty)}{med.unit || 'g'}</td><td style={s.td}>${r.unitPrice.toFixed(2)}</td><td style={s.td}>${fmtNum(Math.round(r.total))}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
        {records.length > 0 && (
          <div style={s.card}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: ACCENT }}>單價趨勢</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 120 }}>
              {records.slice().reverse().map((r, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ fontSize: 10, color: '#64748b' }}>${r.unitPrice.toFixed(1)}</div>
                  <div style={{ width: '100%', maxWidth: 40, background: ACCENT, borderRadius: '4px 4px 0 0', height: `${(r.unitPrice / maxPrice) * 90}px`, minHeight: 4 }} />
                  <div style={{ fontSize: 9, color: '#94a3b8' }}>{r.date.slice(5)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {supplierPrices.length > 0 && (
          <div style={s.card}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: ACCENT }}>供應商價格比較</div>
            {supplierPrices.map((sp, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ minWidth: 100, fontSize: 13, fontWeight: 600 }}>{sp.supplier}</div>
                <div style={s.barBg}><div style={s.bar(supplierPrices.length > 0 ? (sp.avg / (supplierPrices[supplierPrices.length - 1].avg || 1)) * 100 : 0, i === 0 ? '#10b981' : ACCENT)} /></div>
                <div style={{ fontSize: 13, fontWeight: 700, minWidth: 80 }}>HK${sp.avg.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{sp.count}次</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ═══ Tab 3: Medicine Analysis ═══
  const renderAnalysis = () => {
    if (!med) return <div style={{ ...s.card, textAlign: 'center', color: '#94a3b8', padding: 40 }}>請先選擇藥物</div>;
    const { monthCount, quarterCount, yearCount, topDoctors, pairedHerbs } = analysis;
    const maxDoc = topDoctors[0]?.count || 1;
    const maxPair = pairedHerbs[0]?.count || 1;
    return (
      <div>
        <div style={s.card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: ACCENT }}>使用頻率</div>
          <div style={{ display: 'flex', gap: 24 }}>
            {[['本月', monthCount], ['本季', quarterCount], ['全年', yearCount]].map(([label, count]) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: ACCENT }}>{count}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{label}處方次數</div>
              </div>
            ))}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b' }}>{usageRecords.length}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>總使用次數</div>
            </div>
          </div>
        </div>
        <div style={s.card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: ACCENT }}>處方醫師排行</div>
          {topDoctors.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13 }}>暫無數據</div> : topDoctors.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ minWidth: 80, fontSize: 13, fontWeight: 600 }}>{d.name}</div>
              <div style={s.barBg}><div style={s.bar((d.count / maxDoc) * 100)} /></div>
              <div style={{ fontSize: 13, fontWeight: 700, minWidth: 40 }}>{d.count}次</div>
            </div>
          ))}
        </div>
        <div style={s.card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: ACCENT }}>常見配伍藥材</div>
          {pairedHerbs.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13 }}>暫無數據</div> : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {pairedHerbs.map((h, i) => (
                <span key={i} style={{ ...s.badge(i < 3 ? '#fff' : ACCENT, i < 3 ? ACCENT : ACCENT_LIGHT), fontSize: 12, padding: '4px 10px' }}>{h.name} ({h.count})</span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ═══ Tab 4: Usage History ═══
  const renderUsageHistory = () => {
    if (!med) return <div style={{ ...s.card, textAlign: 'center', color: '#94a3b8', padding: 40 }}>請先選擇藥物</div>;
    return (
      <div style={s.card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: ACCENT }}>藥物使用記錄（共 {usageRecords.length} 筆）</div>
        {usageRecords.length === 0 ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>暫無使用記錄</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['日期','病人','醫師','處方名','用量','天數'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{usageRecords.slice(0, 200).map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={s.td}>{fmtDate(r.date)}</td><td style={s.td}>{r.patient}</td><td style={s.td}>{r.doctor}</td>
                  <td style={s.td}>{r.formula}</td><td style={s.td}>{r.dosage}{typeof r.dosage === 'number' || !isNaN(r.dosage) ? (med.unit || 'g') : ''}</td><td style={s.td}>{r.days}{r.days !== '-' ? '天' : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ═══ Tab 5: Modification History ═══
  const renderModHistory = () => {
    if (!med) return <div style={{ ...s.card, textAlign: 'center', color: '#94a3b8', padding: 40 }}>請先選擇藥物</div>;
    return (
      <div style={s.card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: ACCENT }}>藥物修改記錄（共 {modLogs.length} 筆）</div>
        {modLogs.length === 0 ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>暫無修改記錄</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['日期','修改項目','修改前','修改後','操作人','備註'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{modLogs.map((l, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={s.td}>{fmtDate(l.date)}</td><td style={s.td}>{l.field || '-'}</td>
                  <td style={s.td}><span style={{ color: '#ef4444' }}>{l.oldValue ?? '-'}</span></td>
                  <td style={s.td}><span style={{ color: '#10b981' }}>{l.newValue ?? '-'}</span></td>
                  <td style={s.td}>{l.operator || user?.name || '-'}</td><td style={s.td}>{l.remark || '-'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ═══ Tab 6: Stock-in History ═══
  const renderStockInHistory = () => {
    if (!med) return <div style={{ ...s.card, textAlign: 'center', color: '#94a3b8', padding: 40 }}>請先選擇藥物</div>;
    return (
      <div style={s.card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: ACCENT }}>藥物入庫記錄（共 {stockInLogs.length} 筆）</div>
        {stockInLogs.length === 0 ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>暫無入庫記錄</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['日期','供應商','入庫量','單價','發票號','操作人'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{stockInLogs.map((l, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={s.td}>{fmtDate(l.date)}</td><td style={s.td}>{l.supplier || '-'}</td>
                  <td style={s.td}>{fmtNum(l.qty)}{med.unit || 'g'}</td><td style={s.td}>${Number(l.unitPrice || 0).toFixed(2)}</td>
                  <td style={s.td}>{l.invoiceNo || '-'}</td><td style={s.td}>{l.operator || user?.name || '-'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ═══ Tab 7: Daily Log ═══
  const renderDailyLog = () => {
    if (!med) return <div style={{ ...s.card, textAlign: 'center', color: '#94a3b8', padding: 40 }}>請先選擇藥物</div>;
    return (
      <div style={s.card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: ACCENT }}>藥物日誌（逐日庫存變動）</div>
        {dailyLogs.length === 0 ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>暫無日誌</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['日期','入庫量','出庫量','淨變動','明細'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>{dailyLogs.slice(0, 200).map((d, i) => {
                const net = d.inQty - d.outQty;
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{d.date}</td>
                    <td style={{ ...s.td, color: '#10b981' }}>+{fmtNum(d.inQty)}{med.unit || 'g'}</td>
                    <td style={{ ...s.td, color: '#ef4444' }}>-{fmtNum(d.outQty)}{med.unit || 'g'}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: net >= 0 ? '#10b981' : '#ef4444' }}>{net >= 0 ? '+' : ''}{fmtNum(net)}{med.unit || 'g'}</td>
                    <td style={{ ...s.td, fontSize: 11, color: '#64748b' }}>{d.entries.slice(0, 3).map(e => e.detail || e.field || e.type).join('; ')}{d.entries.length > 3 ? ` ...+${d.entries.length - 3}` : ''}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const tabContent = [renderBasicInfo, renderPriceAnalysis, renderAnalysis, renderUsageHistory, renderModHistory, renderStockInHistory, renderDailyLog];

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.title}>{clinicName} — 藥物詳情</div>
        {med && <span style={{ fontSize: 13, color: '#64748b' }}>{med.name} | 庫存: {fmtNum(med.stock)}{med.unit || 'g'}</span>}
      </div>
      {renderSelector()}
      <div style={s.tabs}>
        {TABS.map((t, i) => <button key={i} style={s.tab(tab === i)} onClick={() => setTab(i)}>{t}</button>)}
      </div>
      {tabContent[tab]()}
    </div>
  );
}
