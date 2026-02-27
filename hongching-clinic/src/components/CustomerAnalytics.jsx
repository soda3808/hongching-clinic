import { useState, useMemo } from 'react';
import { getDoctors, getStoreNames, fmtM } from '../data';
import { getClinicName } from '../tenant';

function daysBetween(a, b) { return Math.ceil((new Date(b) - new Date(a)) / 86400000); }
function getMonth(d) { return d ? String(d).substring(0, 7) : ''; }

export default function CustomerAnalytics({ data, showToast, user }) {
  const clinicName = getClinicName();
  const patients = data.patients || [];
  const consultations = data.consultations || [];
  const revenue = data.revenue || [];

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeSection, setActiveSection] = useState('overview'); // overview|rfm|ltv|freq|demo|revenue|churn|referral

  const today = new Date().toISOString().substring(0, 10);
  const thisMonth = today.substring(0, 7);
  const threeMonthsAgo = new Date(Date.now() - 90 * 86400000).toISOString().substring(0, 10);
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString().substring(0, 10);
  const monthStart = today.substring(0, 8) + '01';

  // Filter revenue by date range
  const filteredRev = useMemo(() => {
    let r = revenue;
    if (dateFrom) r = r.filter(x => x.date >= dateFrom);
    if (dateTo) r = r.filter(x => x.date <= dateTo);
    return r;
  }, [revenue, dateFrom, dateTo]);

  // Customer profile enrichment
  const customerProfiles = useMemo(() => {
    return patients.map(p => {
      const visits = consultations.filter(c => c.patientId === p.id || c.patientName === p.name);
      const revRecs = filteredRev.filter(r => r.name === p.name);
      const totalSpent = revRecs.reduce((s, r) => s + Number(r.amount || 0), 0);
      const visitDates = visits.map(v => v.date).filter(Boolean).sort();
      const lastVisit = visitDates.length ? visitDates[visitDates.length - 1] : p.lastVisit || '';
      const firstVisit = visitDates.length ? visitDates[0] : p.createdAt || p.firstVisit || '';
      const daysSinceLast = lastVisit ? daysBetween(lastVisit, today) : 999;
      const visitCount = visits.length || Number(p.totalVisits) || 0;
      return { ...p, totalSpent, visitCount, lastVisit, firstVisit, daysSinceLast, visitDates };
    });
  }, [patients, consultations, filteredRev, today]);

  // 1. Overview Stats
  const overview = useMemo(() => {
    const total = customerProfiles.length;
    const active = customerProfiles.filter(p => p.daysSinceLast <= 90).length;
    const newThisMonth = customerProfiles.filter(p => p.firstVisit && p.firstVisit >= monthStart).length;
    const churned = customerProfiles.filter(p => p.daysSinceLast > 180 && p.visitCount > 0).length;
    return { total, active, newThisMonth, churned };
  }, [customerProfiles, monthStart]);

  // 2. RFM Segments
  const rfmSegments = useMemo(() => {
    const scored = customerProfiles.filter(p => p.visitCount > 0).map(p => {
      // Recency score (1-5, 5=most recent)
      const r = p.daysSinceLast <= 30 ? 5 : p.daysSinceLast <= 60 ? 4 : p.daysSinceLast <= 90 ? 3 : p.daysSinceLast <= 180 ? 2 : 1;
      // Frequency score
      const f = p.visitCount >= 10 ? 5 : p.visitCount >= 6 ? 4 : p.visitCount >= 3 ? 3 : p.visitCount >= 2 ? 2 : 1;
      // Monetary score
      const m = p.totalSpent >= 10000 ? 5 : p.totalSpent >= 5000 ? 4 : p.totalSpent >= 2000 ? 3 : p.totalSpent >= 500 ? 2 : 1;
      // Segment
      let segment = '已流失';
      if (r >= 4 && f >= 4 && m >= 4) segment = 'VIP顧客';
      else if (r >= 3 && f >= 3) segment = '忠實顧客';
      else if (r <= 2 && f >= 2) segment = '潛在流失';
      else if (r >= 4 && f <= 2) segment = '新顧客';
      return { ...p, rScore: r, fScore: f, mScore: m, segment };
    });
    const segments = { 'VIP顧客': [], '忠實顧客': [], '潛在流失': [], '已流失': [], '新顧客': [] };
    scored.forEach(p => { if (segments[p.segment]) segments[p.segment].push(p); });
    return { scored, segments };
  }, [customerProfiles]);

  const segColors = { 'VIP顧客': '#0e7490', '忠實顧客': '#16a34a', '潛在流失': '#d97706', '已流失': '#dc2626', '新顧客': '#7c3aed' };

  // 3. LTV
  const ltvData = useMemo(() => {
    const withSpend = customerProfiles.filter(p => p.totalSpent > 0);
    const avg = withSpend.length ? withSpend.reduce((s, p) => s + p.totalSpent, 0) / withSpend.length : 0;
    const top10 = [...withSpend].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10);
    return { avg, top10 };
  }, [customerProfiles]);

  // 4. Visit Frequency Distribution
  const freqDist = useMemo(() => {
    const buckets = { '1次': 0, '2-3次': 0, '4-6次': 0, '7+次': 0 };
    customerProfiles.forEach(p => {
      if (p.visitCount <= 0) return;
      if (p.visitCount === 1) buckets['1次']++;
      else if (p.visitCount <= 3) buckets['2-3次']++;
      else if (p.visitCount <= 6) buckets['4-6次']++;
      else buckets['7+次']++;
    });
    return Object.entries(buckets);
  }, [customerProfiles]);
  const maxFreq = Math.max(...freqDist.map(([, v]) => v), 1);

  // 5. Age/Gender
  const demoDist = useMemo(() => {
    const genders = { '男': 0, '女': 0, '未填': 0 };
    const ages = { '0-18': 0, '19-35': 0, '36-50': 0, '51-65': 0, '65+': 0, '未填': 0 };
    patients.forEach(p => {
      const g = (p.gender || p.sex || '').trim();
      if (g === '男' || g === 'M') genders['男']++;
      else if (g === '女' || g === 'F') genders['女']++;
      else genders['未填']++;
      const age = Number(p.age) || (p.dob ? Math.floor(daysBetween(p.dob, today) / 365) : 0);
      if (!age) ages['未填']++;
      else if (age <= 18) ages['0-18']++;
      else if (age <= 35) ages['19-35']++;
      else if (age <= 50) ages['36-50']++;
      else if (age <= 65) ages['51-65']++;
      else ages['65+']++;
    });
    return { genders: Object.entries(genders), ages: Object.entries(ages) };
  }, [patients, today]);

  // 6. Revenue per Customer
  const revPerCustomer = useMemo(() => {
    const withSpend = customerProfiles.filter(p => p.totalSpent > 0).sort((a, b) => b.totalSpent - a.totalSpent);
    const values = withSpend.map(p => p.totalSpent);
    const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    return { avg, median, top5: withSpend.slice(0, 5) };
  }, [customerProfiles]);

  // 7. Churn Analysis (monthly)
  const churnTrend = useMemo(() => {
    const months = new Set();
    consultations.forEach(c => { const m = getMonth(c.date); if (m) months.add(m); });
    const sortedMonths = [...months].sort().slice(-6);
    return sortedMonths.map(m => {
      const mEnd = new Date(m + '-28');
      const sixBefore = new Date(mEnd.getTime() - 180 * 86400000).toISOString().substring(0, 10);
      const activeBeforeMonth = customerProfiles.filter(p => {
        const visitsBefore = (p.visitDates || []).filter(d => d < m + '-01' && d >= sixBefore);
        return visitsBefore.length > 0;
      }).length;
      const visitedThisMonth = customerProfiles.filter(p => (p.visitDates || []).some(d => getMonth(d) === m)).length;
      const churned = Math.max(0, activeBeforeMonth - visitedThisMonth);
      const rate = activeBeforeMonth > 0 ? ((churned / activeBeforeMonth) * 100).toFixed(1) : '0.0';
      return { month: m, activeBeforeMonth, visitedThisMonth, churned, rate: Number(rate) };
    });
  }, [customerProfiles, consultations]);
  const maxChurn = Math.max(...churnTrend.map(c => c.rate), 1);

  // 8. Referral
  const referralData = useMemo(() => {
    const referred = patients.filter(p => p.referral || p.referredBy || p.referralSource);
    const sources = {};
    referred.forEach(p => {
      const src = p.referralSource || p.referredBy || p.referral || '其他';
      sources[src] = (sources[src] || 0) + 1;
    });
    return { total: referred.length, sources: Object.entries(sources).sort((a, b) => b[1] - a[1]) };
  }, [patients]);

  // Print
  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>顧客分析報告</title><style>@page{size:A4;margin:12mm}body{font-family:'PingFang TC','Microsoft YaHei',sans-serif;font-size:12px;padding:20px;max-width:780px;margin:0 auto}h1{font-size:17px;text-align:center;margin:0 0 4px}p.sub{text-align:center;color:#888;font-size:11px;margin:0 0 16px}.row{display:flex;gap:20px;margin-bottom:14px}.stat{text-align:center;flex:1}.stat b{font-size:20px;color:#0e7490}table{width:100%;border-collapse:collapse;margin-bottom:14px}th,td{padding:5px 8px;border-bottom:1px solid #ddd;font-size:11px}th{background:#f3f4f6;font-weight:700}@media print{body{padding:8px}}</style></head><body><h1>${clinicName} — 顧客分析報告</h1><p class="sub">列印：${new Date().toLocaleString('zh-HK')}${dateFrom ? ` | 由 ${dateFrom}` : ''}${dateTo ? ` 至 ${dateTo}` : ''}</p><div class="row"><div class="stat">總顧客<br/><b>${overview.total}</b></div><div class="stat">活躍顧客<br/><b>${overview.active}</b></div><div class="stat">本月新客<br/><b>${overview.newThisMonth}</b></div><div class="stat">流失顧客<br/><b>${overview.churned}</b></div></div><h3>RFM 分群</h3><table><thead><tr><th>分群</th><th>人數</th></tr></thead><tbody>${Object.entries(rfmSegments.segments).map(([k, v]) => `<tr><td>${k}</td><td>${v.length}</td></tr>`).join('')}</tbody></table><h3>顧客終身價值</h3><p>平均 LTV：${fmtM(ltvData.avg)}</p><h3>消費分佈</h3><p>平均：${fmtM(revPerCustomer.avg)} | 中位數：${fmtM(revPerCustomer.median)}</p></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 };
  const labelStyle = { fontSize: 11, color: '#888', marginBottom: 2 };
  const statNum = { fontSize: 22, fontWeight: 700, color: '#0e7490' };
  const navBtn = (key) => ({
    background: activeSection === key ? '#0e7490' : '#fff',
    color: activeSection === key ? '#fff' : '#0e7490',
    border: '1px solid #0e7490', borderRadius: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontWeight: 600,
  });

  const barColor = (i) => ['#0e7490', '#16a34a', '#d97706', '#7c3aed', '#dc2626'][i % 5];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>顧客分析</h2>
        <div style={{ flex: 1 }} />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" style={{ width: 130, fontSize: 11 }} />
        <span style={{ fontSize: 11, color: '#888' }}>至</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" style={{ width: 130, fontSize: 11 }} />
        <button onClick={handlePrint} style={{ background: '#0e7490', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer' }}>列印報告</button>
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['overview', '總覽'], ['rfm', 'RFM分群'], ['ltv', '終身價值'], ['freq', '到訪頻率'], ['demo', '年齡/性別'], ['revenue', '消費分佈'], ['churn', '流失分析'], ['referral', '轉介網絡']].map(([k, l]) => (
          <button key={k} onClick={() => setActiveSection(k)} style={navBtn(k)}>{l}</button>
        ))}
      </div>

      {/* 1. Overview */}
      {activeSection === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginBottom: 12 }}>
            <div style={cardStyle}><div style={labelStyle}>總顧客數</div><div style={statNum}>{overview.total}</div></div>
            <div style={cardStyle}><div style={labelStyle}>活躍顧客（近3月）</div><div style={statNum}>{overview.active}</div></div>
            <div style={cardStyle}><div style={labelStyle}>新顧客（本月）</div><div style={{ ...statNum, color: '#16a34a' }}>{overview.newThisMonth}</div></div>
            <div style={cardStyle}><div style={labelStyle}>流失顧客（&gt;6月未來）</div><div style={{ ...statNum, color: '#dc2626' }}>{overview.churned}</div></div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>活躍率</div>
            <div style={{ background: '#f3f4f6', borderRadius: 8, height: 24, overflow: 'hidden' }}>
              <div style={{ width: `${overview.total ? (overview.active / overview.total * 100) : 0}%`, height: '100%', background: '#0e7490', borderRadius: 8, transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{overview.total ? (overview.active / overview.total * 100).toFixed(1) : 0}% 活躍</div>
          </div>
        </>
      )}

      {/* 2. RFM */}
      {activeSection === 'rfm' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8, marginBottom: 12 }}>
            {Object.entries(rfmSegments.segments).map(([seg, list]) => (
              <div key={seg} style={{ ...cardStyle, borderTop: `4px solid ${segColors[seg] || '#888'}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: segColors[seg] || '#333' }}>{seg}</div>
                <div style={statNum}>{list.length}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{overview.total ? (list.length / overview.total * 100).toFixed(1) : 0}%</div>
              </div>
            ))}
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>RFM 分佈明細（前20名）</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: '#f3f4f6' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>病人</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center' }}>R</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center' }}>F</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center' }}>M</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>分群</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>消費</th>
                </tr></thead>
                <tbody>
                  {rfmSegments.scored.slice(0, 20).map(p => (
                    <tr key={p.id || p.name} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '5px 8px', fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>{p.rScore}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>{p.fScore}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>{p.mScore}</td>
                      <td style={{ padding: '5px 8px', color: segColors[p.segment] || '#333', fontWeight: 600 }}>{p.segment}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtM(p.totalSpent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 3. LTV */}
      {activeSection === 'ltv' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={cardStyle}><div style={labelStyle}>平均顧客終身價值</div><div style={statNum}>{fmtM(ltvData.avg)}</div></div>
            <div style={cardStyle}><div style={labelStyle}>有消費記錄顧客</div><div style={statNum}>{ltvData.top10.length > 0 ? customerProfiles.filter(p => p.totalSpent > 0).length : 0}</div></div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Top 10 最高價值顧客</div>
            {ltvData.top10.map((p, i) => (
              <div key={p.id || p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: i < 3 ? '#0e7490' : '#e5e7eb', color: i < 3 ? '#fff' : '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0e7490' }}>{fmtM(p.totalSpent)}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{p.visitCount}次</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 4. Visit Frequency */}
      {activeSection === 'freq' && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>到訪頻率分佈</div>
          {freqDist.map(([label, count], i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 50, fontSize: 12, textAlign: 'right', flexShrink: 0, fontWeight: 600 }}>{label}</div>
              <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 6, height: 28, overflow: 'hidden' }}>
                <div style={{ width: `${(count / maxFreq) * 100}%`, height: '100%', background: barColor(i), borderRadius: 6, transition: 'width .3s', display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
                  {count > 0 && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{count}</span>}
                </div>
              </div>
              <div style={{ width: 40, fontSize: 12, color: '#555' }}>{count}人</div>
            </div>
          ))}
        </div>
      )}

      {/* 5. Age/Gender */}
      {activeSection === 'demo' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>性別分佈</div>
            {demoDist.genders.map(([g, c], i) => {
              const total = demoDist.genders.reduce((s, [, v]) => s + v, 0) || 1;
              return (
                <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 36, fontSize: 12, textAlign: 'right', fontWeight: 600 }}>{g}</div>
                  <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                    <div style={{ width: `${(c / total) * 100}%`, height: '100%', background: barColor(i), borderRadius: 6 }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#555', width: 50 }}>{c} ({(c / total * 100).toFixed(0)}%)</div>
                </div>
              );
            })}
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>年齡分佈</div>
            {demoDist.ages.map(([a, c], i) => {
              const total = demoDist.ages.reduce((s, [, v]) => s + v, 0) || 1;
              return (
                <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 36, fontSize: 12, textAlign: 'right', fontWeight: 600 }}>{a}</div>
                  <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                    <div style={{ width: `${(c / total) * 100}%`, height: '100%', background: barColor(i + 2), borderRadius: 6 }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#555', width: 50 }}>{c} ({(c / total * 100).toFixed(0)}%)</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Revenue per Customer */}
      {activeSection === 'revenue' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8, marginBottom: 12 }}>
            <div style={cardStyle}><div style={labelStyle}>平均消費</div><div style={statNum}>{fmtM(revPerCustomer.avg)}</div></div>
            <div style={cardStyle}><div style={labelStyle}>中位數消費</div><div style={statNum}>{fmtM(revPerCustomer.median)}</div></div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Top 5 消費顧客</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: '#f3f4f6' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>#</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>病人</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>總消費</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>到訪次數</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>平均單次</th>
                </tr></thead>
                <tbody>
                  {revPerCustomer.top5.map((p, i) => (
                    <tr key={p.id || p.name} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '5px 8px', fontWeight: 700, color: '#0e7490' }}>{i + 1}</td>
                      <td style={{ padding: '5px 8px', fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: '#0e7490', fontWeight: 700 }}>{fmtM(p.totalSpent)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{p.visitCount}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{p.visitCount ? fmtM(p.totalSpent / p.visitCount) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 7. Churn */}
      {activeSection === 'churn' && (
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>月度流失率趨勢（近6個月）</div>
          {churnTrend.length === 0 && <div style={{ textAlign: 'center', color: '#888', fontSize: 13, padding: 20 }}>數據不足，無法計算流失率</div>}
          {churnTrend.map((m, i) => (
            <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 60, fontSize: 12, textAlign: 'right', fontWeight: 600, flexShrink: 0 }}>{m.month}</div>
              <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 6, height: 24, overflow: 'hidden' }}>
                <div style={{ width: `${(m.rate / maxChurn) * 100}%`, height: '100%', background: m.rate > 30 ? '#dc2626' : m.rate > 15 ? '#d97706' : '#16a34a', borderRadius: 6, transition: 'width .3s' }} />
              </div>
              <div style={{ width: 50, fontSize: 12, fontWeight: 600, color: m.rate > 30 ? '#dc2626' : m.rate > 15 ? '#d97706' : '#16a34a' }}>{m.rate}%</div>
              <div style={{ fontSize: 11, color: '#888', width: 70 }}>流失 {m.churned}人</div>
            </div>
          ))}
        </div>
      )}

      {/* 8. Referral */}
      {activeSection === 'referral' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div style={cardStyle}><div style={labelStyle}>轉介顧客總數</div><div style={statNum}>{referralData.total}</div></div>
            <div style={cardStyle}><div style={labelStyle}>轉介佔比</div><div style={statNum}>{patients.length ? (referralData.total / patients.length * 100).toFixed(1) : 0}%</div></div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>轉介來源</div>
            {referralData.sources.length === 0 && <div style={{ textAlign: 'center', color: '#888', fontSize: 13, padding: 20 }}>無轉介記錄</div>}
            {referralData.sources.map(([src, count], i) => (
              <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 100, fontSize: 12, textAlign: 'right', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{src}</div>
                <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                  <div style={{ width: `${referralData.sources.length ? (count / referralData.sources[0][1]) * 100 : 0}%`, height: '100%', background: barColor(i), borderRadius: 6 }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0e7490', width: 30 }}>{count}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
