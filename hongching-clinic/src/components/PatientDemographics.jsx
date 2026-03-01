import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getStoreNames } from '../data';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const COLORS = [ACCENT, '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#0284c7', '#db2777', '#65a30d'];
const AGE_GROUPS = ['0-17', '18-30', '31-45', '46-60', '61-75', '75+'];

function calcAge(dob) {
  if (!dob) return null;
  const b = new Date(dob), t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}
function ageBucket(age) {
  if (age === null) return null;
  if (age < 18) return 0;
  if (age <= 30) return 1;
  if (age <= 45) return 2;
  if (age <= 60) return 3;
  if (age <= 75) return 4;
  return 5;
}
function getMonth(d) { return d ? String(d).substring(0, 7) : ''; }
function daysBetween(a, b) { return Math.ceil((new Date(b) - new Date(a)) / 86400000); }

export default function PatientDemographics({ data, showToast, user }) {
  const clinicName = getClinicName();
  const STORES = getStoreNames();
  const patients = data?.patients || [];

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterStore, setFilterStore] = useState('all');

  const today = new Date().toISOString().substring(0, 10);

  // Filter patients
  const filtered = useMemo(() => {
    let list = patients;
    if (filterStore !== 'all') list = list.filter(p => p.store === filterStore);
    if (dateFrom) list = list.filter(p => (p.createdAt || p.firstVisit || '') >= dateFrom);
    if (dateTo) list = list.filter(p => (p.createdAt || p.firstVisit || '') <= dateTo);
    return list;
  }, [patients, filterStore, dateFrom, dateTo]);

  // 1. Age distribution
  const ageDist = useMemo(() => {
    const buckets = AGE_GROUPS.map(() => 0);
    let noAge = 0;
    filtered.forEach(p => {
      const age = calcAge(p.dob) ?? (p.age ? Number(p.age) : null);
      const idx = ageBucket(age);
      if (idx !== null) buckets[idx]++;
      else noAge++;
    });
    return { buckets, noAge };
  }, [filtered]);
  const maxAge = Math.max(...ageDist.buckets, 1);

  // 2. Gender distribution
  const genderDist = useMemo(() => {
    let male = 0, female = 0, other = 0;
    filtered.forEach(p => {
      const g = (p.gender || p.sex || '').trim();
      if (g === '男' || g === 'M') male++;
      else if (g === '女' || g === 'F') female++;
      else other++;
    });
    return { male, female, other, total: male + female + other };
  }, [filtered]);

  // 3. District distribution (from address)
  const districtDist = useMemo(() => {
    const map = {};
    filtered.forEach(p => {
      const addr = (p.address || p.district || '').trim();
      const district = addr ? addr.replace(/[\d\s,，。\.].*/g, '').substring(0, 10) || '其他' : '未填';
      map[district] = (map[district] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [filtered]);
  const maxDistrict = districtDist.length ? districtDist[0][1] : 1;

  // 4. New vs returning by month
  const newVsReturn = useMemo(() => {
    const months = {};
    filtered.forEach(p => {
      const m = getMonth(p.createdAt || p.firstVisit);
      if (!m) return;
      if (!months[m]) months[m] = { month: m, newP: 0, returning: 0 };
      const visits = Number(p.totalVisits) || 0;
      if (visits <= 1) months[m].newP++;
      else months[m].returning++;
    });
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [filtered]);
  const maxNvr = Math.max(...newVsReturn.map(m => m.newP + m.returning), 1);

  // 5. Activity status
  const activityDist = useMemo(() => {
    let active = 0, inactive = 0, dormant = 0, unknown = 0;
    filtered.forEach(p => {
      const last = p.lastVisit;
      if (!last) { unknown++; return; }
      const days = daysBetween(last, today);
      if (days <= 90) active++;
      else if (days <= 365) inactive++;
      else dormant++;
    });
    return { active, inactive, dormant, unknown };
  }, [filtered, today]);

  // 6. Referral source
  const referralDist = useMemo(() => {
    const map = {};
    filtered.forEach(p => {
      const src = p.referralSource || p.referredBy || p.referral || '';
      const key = src.trim() || '未填';
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filtered]);
  const maxRef = referralDist.length ? referralDist[0][1] : 1;

  // Summary metrics
  const avgAge = useMemo(() => {
    const ages = filtered.map(p => calcAge(p.dob) ?? (p.age ? Number(p.age) : null)).filter(a => a !== null);
    return ages.length ? (ages.reduce((s, a) => s + a, 0) / ages.length).toFixed(1) : '-';
  }, [filtered]);

  // Print report
  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const ageRows = AGE_GROUPS.map((g, i) => `<tr><td>${g}</td><td style="text-align:right">${ageDist.buckets[i]}</td><td style="text-align:right">${filtered.length ? (ageDist.buckets[i] / filtered.length * 100).toFixed(1) : 0}%</td></tr>`).join('');
    const distRows = districtDist.map(([d, c]) => `<tr><td>${escapeHtml(d)}</td><td style="text-align:right">${c}</td></tr>`).join('');
    const refRows = referralDist.map(([s, c]) => `<tr><td>${escapeHtml(s)}</td><td style="text-align:right">${c}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>病人統計報告</title><style>@page{size:A4;margin:12mm}body{font-family:'PingFang TC','Microsoft YaHei',sans-serif;font-size:12px;padding:20px;max-width:780px;margin:0 auto}h1{font-size:17px;text-align:center;margin:0 0 4px}p.sub{text-align:center;color:#888;font-size:11px;margin:0 0 16px}.row{display:flex;gap:16px;margin-bottom:14px}.stat{text-align:center;flex:1;padding:10px;border:1px solid #ddd;border-radius:6px}.stat b{font-size:18px;color:${ACCENT}}table{width:100%;border-collapse:collapse;margin-bottom:14px}th,td{padding:5px 8px;border-bottom:1px solid #ddd;font-size:11px}th{background:#f3f4f6;font-weight:700}h3{font-size:14px;margin:16px 0 8px;color:${ACCENT}}@media print{body{padding:8px}}</style></head><body>`);
    w.document.write(`<h1>${escapeHtml(clinicName)} — 病人統計報告</h1><p class="sub">列印：${new Date().toLocaleString('zh-HK')}${dateFrom ? ` | 由 ${dateFrom}` : ''}${dateTo ? ` 至 ${dateTo}` : ''}${filterStore !== 'all' ? ` | 分店: ${escapeHtml(filterStore)}` : ''}</p>`);
    w.document.write(`<div class="row"><div class="stat">總病人<br/><b>${filtered.length}</b></div><div class="stat">平均年齡<br/><b>${avgAge}</b></div><div class="stat">男/女<br/><b>${genderDist.male}/${genderDist.female}</b></div><div class="stat">活躍率<br/><b>${filtered.length ? (activityDist.active / filtered.length * 100).toFixed(0) : 0}%</b></div></div>`);
    w.document.write(`<h3>年齡分布</h3><table><thead><tr><th>年齡段</th><th style="text-align:right">人數</th><th style="text-align:right">佔比</th></tr></thead><tbody>${ageRows}</tbody></table>`);
    w.document.write(`<h3>地區分布</h3><table><thead><tr><th>地區</th><th style="text-align:right">人數</th></tr></thead><tbody>${distRows}</tbody></table>`);
    w.document.write(`<h3>來源分析</h3><table><thead><tr><th>來源</th><th style="text-align:right">人數</th></tr></thead><tbody>${refRows}</tbody></table>`);
    w.document.write(`<h3>活躍度</h3><table><thead><tr><th>狀態</th><th style="text-align:right">人數</th></tr></thead><tbody><tr><td>活躍（3個月內）</td><td style="text-align:right">${activityDist.active}</td></tr><tr><td>不活躍（3-12個月）</td><td style="text-align:right">${activityDist.inactive}</td></tr><tr><td>沉寂（12個月+）</td><td style="text-align:right">${activityDist.dormant}</td></tr></tbody></table>`);
    w.document.write('</body></html>');
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // Export CSV
  const handleExport = () => {
    const header = ['姓名', '性別', '出生日期', '年齡', '地址', '電話', '分店', '來源', '首次到診', '最後到診', '到診次數'].join(',');
    const rows = filtered.map(p => {
      const age = calcAge(p.dob) ?? (p.age || '');
      return [p.name || '', p.gender || '', p.dob || '', age, `"${(p.address || '').replace(/"/g, '""')}"`, p.phone || '', p.store || '', p.referralSource || p.referredBy || '', p.firstVisit || p.createdAt || '', p.lastVisit || '', p.totalVisits || ''].join(',');
    });
    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `病人統計_${today}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast?.('CSV 已匯出');
  };

  const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 };
  const label = { fontSize: 11, color: '#888', marginBottom: 2 };
  const bigNum = { fontSize: 22, fontWeight: 700, color: ACCENT };
  const secTitle = { fontSize: 14, fontWeight: 700, color: ACCENT, marginBottom: 10 };
  const barBg = { background: '#f3f4f6', borderRadius: 6, height: 24, overflow: 'hidden' };

  // Pie-like ring for gender
  const genderRing = () => {
    const { male, female, other, total } = genderDist;
    if (!total) return null;
    const pcts = [
      { label: '男', value: male, color: ACCENT },
      { label: '女', value: female, color: '#db2777' },
      { label: '其他', value: other, color: '#9ca3af' },
    ].filter(g => g.value > 0);
    let offset = 0;
    const segments = pcts.map(g => {
      const pct = (g.value / total) * 100;
      const seg = { ...g, pct, offset };
      offset += pct;
      return seg;
    });
    const gradient = segments.map(s => `${s.color} ${s.offset}% ${s.offset + s.pct}%`).join(', ');
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'center' }}>
        <div style={{ width: 120, height: 120, borderRadius: '50%', background: `conic-gradient(${gradient})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 70, height: 70, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#333' }}>{total}</div>
        </div>
        <div>
          {segments.map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
              <span style={{ fontSize: 12, color: '#888' }}>{s.value} ({s.pct.toFixed(0)}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Activity donut
  const activityRing = () => {
    const { active, inactive, dormant } = activityDist;
    const total = active + inactive + dormant;
    if (!total) return null;
    const items = [
      { label: '活躍', value: active, color: '#16a34a' },
      { label: '不活躍', value: inactive, color: '#d97706' },
      { label: '沉寂', value: dormant, color: '#dc2626' },
    ];
    let offset = 0;
    const segs = items.map(g => {
      const pct = (g.value / total) * 100;
      const s = { ...g, pct, offset };
      offset += pct;
      return s;
    });
    const gradient = segs.map(s => `${s.color} ${s.offset}% ${s.offset + s.pct}%`).join(', ');
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, justifyContent: 'center' }}>
        <div style={{ width: 120, height: 120, borderRadius: '50%', background: `conic-gradient(${gradient})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 70, height: 70, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#333' }}>{total}</div>
        </div>
        <div>
          {segs.map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
              <span style={{ fontSize: 12, color: '#888' }}>{s.value} ({s.pct.toFixed(0)}%)</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!filtered.length) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>病人統計分析</h2>
        <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>暫無病人數據</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>病人統計分析</h2>
        <div style={{ flex: 1 }} />
        {STORES.length > 1 && (
          <select value={filterStore} onChange={e => setFilterStore(e.target.value)} className="input" style={{ width: 120, fontSize: 11 }}>
            <option value="all">全部分店</option>
            {STORES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" style={{ width: 130, fontSize: 11 }} />
        <span style={{ fontSize: 11, color: '#888' }}>至</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" style={{ width: 130, fontSize: 11 }} />
        <button onClick={handlePrint} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer' }}>列印報告</button>
        <button onClick={handleExport} style={{ background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer' }}>匯出 CSV</button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8, marginBottom: 14 }}>
        <div style={card}><div style={label}>總病人</div><div style={bigNum}>{filtered.length}</div></div>
        <div style={card}><div style={label}>平均年齡</div><div style={bigNum}>{avgAge}</div></div>
        <div style={card}><div style={label}>男 / 女</div><div style={bigNum}>{genderDist.male} / {genderDist.female}</div></div>
        <div style={card}><div style={label}>活躍率</div><div style={{ ...bigNum, color: '#16a34a' }}>{filtered.length ? (activityDist.active / filtered.length * 100).toFixed(0) : 0}%</div></div>
        <div style={card}><div style={label}>地區數</div><div style={bigNum}>{districtDist.filter(([d]) => d !== '未填').length}</div></div>
      </div>

      {/* Row 1: Age + Gender */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={card}>
          <div style={secTitle}>年齡分布</div>
          {AGE_GROUPS.map((g, i) => (
            <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 44, fontSize: 12, textAlign: 'right', fontWeight: 600, flexShrink: 0 }}>{g}</div>
              <div style={{ flex: 1, ...barBg }}>
                <div style={{ width: `${(ageDist.buckets[i] / maxAge) * 100}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: 6, transition: 'width .3s', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                  {ageDist.buckets[i] > 0 && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{ageDist.buckets[i]}</span>}
                </div>
              </div>
              <div style={{ width: 50, fontSize: 11, color: '#555' }}>{filtered.length ? (ageDist.buckets[i] / filtered.length * 100).toFixed(0) : 0}%</div>
            </div>
          ))}
          {ageDist.noAge > 0 && <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>未填年齡：{ageDist.noAge} 人</div>}
        </div>
        <div style={card}>
          <div style={secTitle}>性別比例</div>
          {genderRing()}
        </div>
      </div>

      {/* Row 2: District + Referral */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={card}>
          <div style={secTitle}>地區分布</div>
          {districtDist.map(([d, c], i) => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{ width: 64, fontSize: 12, textAlign: 'right', fontWeight: 600, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d}</div>
              <div style={{ flex: 1, ...barBg, height: 20 }}>
                <div style={{ width: `${(c / maxDistrict) * 100}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: 6 }} />
              </div>
              <div style={{ fontSize: 11, color: '#555', width: 36, textAlign: 'right' }}>{c}</div>
            </div>
          ))}
        </div>
        <div style={card}>
          <div style={secTitle}>來源分析</div>
          {referralDist.map(([s, c], i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{ width: 64, fontSize: 12, textAlign: 'right', fontWeight: 600, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</div>
              <div style={{ flex: 1, ...barBg, height: 20 }}>
                <div style={{ width: `${(c / maxRef) * 100}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: 6 }} />
              </div>
              <div style={{ fontSize: 11, color: '#555', width: 36, textAlign: 'right' }}>{c}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: New vs Returning + Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={card}>
          <div style={secTitle}>新舊比例（按月）</div>
          {newVsReturn.length === 0 && <div style={{ textAlign: 'center', color: '#888', padding: 16, fontSize: 12 }}>數據不足</div>}
          {newVsReturn.map(m => {
            const total = m.newP + m.returning;
            const newPct = total ? (m.newP / total) * 100 : 0;
            return (
              <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{ width: 50, fontSize: 11, textAlign: 'right', fontWeight: 600, flexShrink: 0, color: '#555' }}>{m.month.substring(5)}月</div>
                <div style={{ flex: 1, display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden', background: '#f3f4f6' }}>
                  <div style={{ width: `${newPct}%`, height: '100%', background: ACCENT, transition: 'width .3s' }} />
                  <div style={{ width: `${100 - newPct}%`, height: '100%', background: '#16a34a', transition: 'width .3s' }} />
                </div>
                <div style={{ fontSize: 10, color: '#888', width: 70, flexShrink: 0 }}>新{m.newP} 舊{m.returning}</div>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: ACCENT, display: 'inline-block' }} /> 新病人</span>
            <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#16a34a', display: 'inline-block' }} /> 舊病人</span>
          </div>
        </div>
        <div style={card}>
          <div style={secTitle}>活躍度</div>
          {activityRing()}
          <div style={{ marginTop: 12, fontSize: 12, color: '#555', lineHeight: 1.8 }}>
            <div>活躍：最近3個月內到訪</div>
            <div>不活躍：3-12個月未到訪</div>
            <div>沉寂：超過12個月未到訪</div>
          </div>
        </div>
      </div>
    </div>
  );
}
