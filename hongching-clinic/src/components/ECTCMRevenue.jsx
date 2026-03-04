import { useState, useMemo, useCallback } from 'react';
import { fmtM, getEmployees } from '../data';

const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_ectcm_monthly';
const STORES = ['太子店', '宋皇臺店'];

/* ── helpers ─────────────────────────────────── */
function load() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } }
function save(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); }

function getDoctorEmployees() {
  return getEmployees().filter(e => e.pos?.includes('醫師'));
}

function monthLabel(m) {
  const [y, mo] = m.split('-');
  return `${y}年${parseInt(mo)}月`;
}

function allMonths() {
  const out = [];
  const start = new Date(2025, 9, 1); // Oct 2025
  const now = new Date();
  let cur = new Date(start);
  while (cur <= now) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

/* pre-seed data from eCTCM exploration */
const SEED_DATA = {
  '2026-02': {
    '太子店': {
      '常凱晴': { sales: 71299, regTotal: 70386, serviceTotal: 70386, collected: 69589, visits: 132, patients: 70 },
      '許植輝': { sales: 3810, regTotal: 4270, serviceTotal: 4270, collected: 3810, visits: 9, patients: 9 },
      '曾其方': { sales: 270, regTotal: 820, serviceTotal: 820, collected: 270, visits: 4, patients: 4 },
    },
    '宋皇臺店': {
      '常凱晴': { sales: 45068, regTotal: 44980, serviceTotal: 44980, collected: 44068, visits: 102, patients: 79 },
      '許植輝': { sales: 0, regTotal: 0, serviceTotal: 0, collected: 0, visits: 0, patients: 0 },
    },
  },
  '2026-03': {
    '太子店': {
      '常凱晴': { sales: 3590, regTotal: 4270, serviceTotal: 4270, collected: 3360, visits: 7, patients: 4 },
      '許植輝': { sales: 0, regTotal: 0, serviceTotal: 0, collected: 0, visits: 0, patients: 0 },
      '曾其方': { sales: 3090, regTotal: 4090, serviceTotal: 4090, collected: 3090, visits: 13, patients: 8 },
    },
    '宋皇臺店': {
      '常凱晴': { sales: 254, regTotal: 3930, serviceTotal: 3930, collected: 254, visits: 8, patients: 8 },
    },
  },
};

const emptyRow = () => ({ sales: 0, regTotal: 0, serviceTotal: 0, collected: 0, visits: 0, patients: 0 });

/* ── styles ──────────────────────────────────── */
const S = {
  page: { padding: 24, fontFamily: 'system-ui, sans-serif', color: '#1e293b', maxWidth: 1200 },
  h1: { fontSize: 22, fontWeight: 700, color: ACCENT, marginBottom: 4, borderBottom: `3px solid ${ACCENT}`, paddingBottom: 8 },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  card: { background: '#fff', borderRadius: 10, padding: 18, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)', border: '1px solid #e2e8f0' },
  tabs: { display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' },
  tab: (a) => ({ padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: a ? ACCENT : '#f1f5f9', color: a ? '#fff' : '#64748b' }),
  input: { padding: '6px 8px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 13, width: 100, textAlign: 'right', fontFamily: 'monospace' },
  inputSm: { padding: '5px 6px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 12, width: 70, textAlign: 'right', fontFamily: 'monospace' },
  btn: (c) => ({ padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: c || ACCENT, color: '#fff' }),
  th: { padding: '8px 10px', background: '#f8fafc', borderBottom: `2px solid ${ACCENT}`, textAlign: 'right', fontSize: 11, color: '#475569', fontWeight: 700, whiteSpace: 'nowrap' },
  thL: { padding: '8px 10px', background: '#f8fafc', borderBottom: `2px solid ${ACCENT}`, textAlign: 'left', fontSize: 11, color: '#475569', fontWeight: 700 },
  td: { padding: '7px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13, textAlign: 'right', fontFamily: 'monospace' },
  tdL: { padding: '7px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 },
  stat: { textAlign: 'center', padding: 14, background: '#f0fdfa', borderRadius: 8, border: `1px solid ${ACCENT}22` },
  statN: { fontSize: 22, fontWeight: 700, color: ACCENT },
  statL: { fontSize: 11, color: '#64748b', marginTop: 2 },
  storeBadge: (s) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
    background: s === '太子店' ? '#dbeafe' : '#fef3c7', color: s === '太子店' ? '#1d4ed8' : '#92400e' }),
};

/* ══════════════════════════════════════════════ */
export default function ECTCMRevenue({ showToast }) {
  const [data, setData] = useState(load);
  const [tab, setTab] = useState('entry');
  const [selMonth, setSelMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const doctors = useMemo(() => getDoctorEmployees(), []);
  const months = useMemo(allMonths, []);

  /* ── seed data on first load ─── */
  useMemo(() => {
    const existing = load();
    let changed = false;
    for (const [month, stores] of Object.entries(SEED_DATA)) {
      if (!existing[month]) {
        existing[month] = stores;
        changed = true;
      }
    }
    if (changed) { save(existing); setData(existing); }
  }, []);

  const getValue = useCallback((month, store, docName, field) => {
    return data[month]?.[store]?.[docName]?.[field] ?? 0;
  }, [data]);

  const setValue = useCallback((month, store, docName, field, val) => {
    setData(prev => {
      const next = { ...prev };
      if (!next[month]) next[month] = {};
      if (!next[month][store]) next[month][store] = {};
      if (!next[month][store][docName]) next[month][store][docName] = { ...emptyRow() };
      next[month][store][docName][field] = Number(val) || 0;
      save(next);
      return next;
    });
  }, []);

  /* ── aggregation helpers ─── */
  const getMonthTotal = useCallback((month, field) => {
    let total = 0;
    for (const store of STORES) {
      for (const doc of doctors) {
        total += getValue(month, store, doc.name, field);
      }
    }
    return total;
  }, [data, doctors, getValue]);

  const getDocMonthTotal = useCallback((month, docName, field) => {
    let total = 0;
    for (const store of STORES) {
      total += getValue(month, store, docName, field);
    }
    return total;
  }, [data, getValue]);

  const getStoreMonthTotal = useCallback((month, store, field) => {
    let total = 0;
    for (const doc of doctors) {
      total += getValue(month, store, doc.name, field);
    }
    return total;
  }, [data, doctors, getValue]);

  /* ── commission calc (uses employee tier config) ─── */
  const calcCommission = useCallback((docName, totalRevenue) => {
    const emp = doctors.find(d => d.name === docName);
    if (!emp?.comm?.tiers) return 0;
    let comm = 0;
    let remaining = totalRevenue;
    for (const tier of emp.comm.tiers) {
      const bracket = Math.min(Math.max(remaining - tier.min, 0), tier.max - tier.min);
      if (bracket > 0) comm += bracket * tier.r;
    }
    return comm;
  }, [doctors]);

  const TABS = [
    { key: 'entry', label: '月度入數' },
    { key: 'summary', label: '月度總覽' },
    { key: 'doctor', label: '醫師對比' },
    { key: 'trend', label: '趨勢分析' },
  ];

  return (
    <div style={S.page}>
      <h2 style={S.h1}>eCTCM 營收追蹤</h2>
      <div style={S.sub}>中醫在線系統月度營運數據 — 醫師銷售統計 × Commission 計算</div>

      <div style={S.tabs}>
        {TABS.map(t => <button key={t.key} style={S.tab(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </div>

      {/* ═══ Monthly Data Entry ═══ */}
      {tab === 'entry' && (
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={selMonth} onChange={e => setSelMonth(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 600 }}>
              {months.slice().reverse().map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <button style={S.btn('#16a34a')} onClick={() => { save(data); showToast?.(`${monthLabel(selMonth)} 數據已儲存`); }}>
              💾 儲存
            </button>
          </div>

          {STORES.map(store => (
            <div key={store} style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={S.storeBadge(store)}>{store}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>
                  月總收入：<b style={{ color: ACCENT }}>${getStoreMonthTotal(selMonth, store, 'serviceTotal').toLocaleString()}</b>
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 650 }}>
                  <thead>
                    <tr>
                      <th style={S.thL}>醫師</th>
                      <th style={S.th}>銷售金額</th>
                      <th style={S.th}>掛號總額</th>
                      <th style={S.th}>服務總額</th>
                      <th style={S.th}>已收款</th>
                      <th style={S.th}>掛號次</th>
                      <th style={S.th}>顧客數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctors.filter(d => d.stores?.includes(store)).map(doc => (
                      <tr key={doc.id}>
                        <td style={S.tdL}>
                          <b style={{ color: ACCENT }}>{doc.name}</b>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{doc.pos}</div>
                        </td>
                        {['sales', 'regTotal', 'serviceTotal', 'collected'].map(f => (
                          <td key={f} style={{ ...S.td, padding: '4px 6px' }}>
                            <input type="number" min="0" style={S.input}
                              value={getValue(selMonth, store, doc.name, f) || ''}
                              onChange={e => setValue(selMonth, store, doc.name, f, e.target.value)}
                              placeholder="0" />
                          </td>
                        ))}
                        {['visits', 'patients'].map(f => (
                          <td key={f} style={{ ...S.td, padding: '4px 6px' }}>
                            <input type="number" min="0" style={S.inputSm}
                              value={getValue(selMonth, store, doc.name, f) || ''}
                              onChange={e => setValue(selMonth, store, doc.name, f, e.target.value)}
                              placeholder="0" />
                          </td>
                        ))}
                      </tr>
                    ))}
                    {/* Store total row */}
                    <tr style={{ background: '#f0fdfa', fontWeight: 700 }}>
                      <td style={S.tdL}>小計</td>
                      {['sales', 'regTotal', 'serviceTotal', 'collected'].map(f => (
                        <td key={f} style={S.td}>${getStoreMonthTotal(selMonth, store, f).toLocaleString()}</td>
                      ))}
                      <td style={S.td}>{getStoreMonthTotal(selMonth, store, 'visits')}</td>
                      <td style={S.td}>{getStoreMonthTotal(selMonth, store, 'patients')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Grand total + commission */}
          <div style={{ ...S.card, background: '#f0fdfa' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: ACCENT, marginBottom: 12 }}>
              {monthLabel(selMonth)} 全公司合計
            </div>
            <div style={S.grid}>
              <div style={S.stat}>
                <div style={S.statN}>${getMonthTotal(selMonth, 'serviceTotal').toLocaleString()}</div>
                <div style={S.statL}>服務總額</div>
              </div>
              <div style={S.stat}>
                <div style={S.statN}>${getMonthTotal(selMonth, 'collected').toLocaleString()}</div>
                <div style={S.statL}>已收款</div>
              </div>
              <div style={S.stat}>
                <div style={S.statN}>{getMonthTotal(selMonth, 'visits')}</div>
                <div style={S.statL}>掛號次數</div>
              </div>
              <div style={S.stat}>
                <div style={S.statN}>{getMonthTotal(selMonth, 'patients')}</div>
                <div style={S.statL}>顧客總數</div>
              </div>
            </div>

            {/* Commission per doctor */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>醫師 Commission 預算</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={S.thL}>醫師</th>
                    <th style={S.th}>兩店總營收</th>
                    <th style={S.th}>底薪</th>
                    <th style={S.th}>佣金</th>
                    <th style={S.th}>應發總額</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.map(doc => {
                    const totalRev = getDocMonthTotal(selMonth, doc.name, 'serviceTotal');
                    const comm = calcCommission(doc.name, totalRev);
                    const base = doc.rate || 0;
                    return (
                      <tr key={doc.id}>
                        <td style={S.tdL}><b>{doc.name}</b></td>
                        <td style={S.td}>${totalRev.toLocaleString()}</td>
                        <td style={S.td}>{base ? `$${base.toLocaleString()}` : '-'}</td>
                        <td style={S.td}>{comm ? `$${Math.round(comm).toLocaleString()}` : '-'}</td>
                        <td style={{ ...S.td, fontWeight: 700, color: ACCENT }}>${(base + comm).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Monthly Summary ═══ */}
      {tab === 'summary' && (
        <div style={S.card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={S.thL}>月份</th>
                  {STORES.map(s => (
                    <th key={s} style={S.th} colSpan={1}>
                      <span style={S.storeBadge(s)}>{s}</span>
                    </th>
                  ))}
                  <th style={S.th}>公司總計</th>
                  <th style={S.th}>掛號次</th>
                  <th style={S.th}>顧客數</th>
                  <th style={S.th}>環比</th>
                </tr>
              </thead>
              <tbody>
                {months.slice().reverse().map((m, i, arr) => {
                  const total = getMonthTotal(m, 'serviceTotal');
                  const prevMonth = arr[i + 1];
                  const prevTotal = prevMonth ? getMonthTotal(prevMonth, 'serviceTotal') : 0;
                  const growth = prevTotal ? ((total - prevTotal) / prevTotal * 100) : null;
                  return (
                    <tr key={m} style={{ cursor: 'pointer', background: selMonth === m ? '#f0fdfa' : '' }}
                      onClick={() => { setSelMonth(m); setTab('entry'); }}>
                      <td style={{ ...S.tdL, fontWeight: 600 }}>{monthLabel(m)}</td>
                      {STORES.map(s => (
                        <td key={s} style={S.td}>${getStoreMonthTotal(m, s, 'serviceTotal').toLocaleString()}</td>
                      ))}
                      <td style={{ ...S.td, fontWeight: 700, color: ACCENT }}>${total.toLocaleString()}</td>
                      <td style={S.td}>{getMonthTotal(m, 'visits')}</td>
                      <td style={S.td}>{getMonthTotal(m, 'patients')}</td>
                      <td style={{ ...S.td, color: growth > 0 ? '#16a34a' : growth < 0 ? '#dc2626' : '#94a3b8', fontWeight: 600 }}>
                        {growth !== null ? `${growth > 0 ? '+' : ''}${growth.toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Doctor Comparison ═══ */}
      {tab === 'doctor' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <select value={selMonth} onChange={e => setSelMonth(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 600 }}>
              {months.slice().reverse().map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>

          {doctors.map(doc => {
            const totalRev = getDocMonthTotal(selMonth, doc.name, 'serviceTotal');
            const totalVisits = getDocMonthTotal(selMonth, doc.name, 'visits');
            const totalPatients = getDocMonthTotal(selMonth, doc.name, 'patients');
            const comm = calcCommission(doc.name, totalRev);
            const avgPerVisit = totalVisits ? Math.round(totalRev / totalVisits) : 0;
            return (
              <div key={doc.id} style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <b style={{ fontSize: 16, color: ACCENT }}>{doc.name}</b>
                    <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{doc.pos}</span>
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: ACCENT }}>${totalRev.toLocaleString()}</span>
                </div>
                <div style={S.grid}>
                  {STORES.filter(s => doc.stores?.includes(s)).map(store => (
                    <div key={store} style={{ padding: 10, background: '#f8fafc', borderRadius: 8 }}>
                      <div style={S.storeBadge(store)}>{store}</div>
                      <div style={{ marginTop: 8, fontSize: 13 }}>
                        <div>服務總額：<b>${getValue(selMonth, store, doc.name, 'serviceTotal').toLocaleString()}</b></div>
                        <div>掛號次：<b>{getValue(selMonth, store, doc.name, 'visits')}</b></div>
                        <div>顧客數：<b>{getValue(selMonth, store, doc.name, 'patients')}</b></div>
                      </div>
                    </div>
                  ))}
                  <div style={{ padding: 10, background: '#f0fdfa', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>合計</div>
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      <div>掛號：<b>{totalVisits} 次</b></div>
                      <div>顧客：<b>{totalPatients} 人</b></div>
                      <div>平均單價：<b>${avgPerVisit.toLocaleString()}</b></div>
                      {comm > 0 && <div style={{ color: '#16a34a' }}>佣金：<b>${Math.round(comm).toLocaleString()}</b></div>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ Trend Analysis ═══ */}
      {tab === 'trend' && (
        <div>
          {/* Revenue bars */}
          <div style={S.card}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#475569' }}>月度營收趨勢</h3>
            {(() => {
              const maxRev = Math.max(...months.map(m => getMonthTotal(m, 'serviceTotal')), 1);
              return months.map(m => {
                const total = getMonthTotal(m, 'serviceTotal');
                return (
                  <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 70, fontSize: 12, color: '#64748b', textAlign: 'right', flexShrink: 0 }}>
                      {monthLabel(m).replace('年', '/').replace('月', '')}
                    </div>
                    <div style={{ flex: 1, display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden', background: '#f1f5f9' }}>
                      {STORES.map((store, si) => {
                        const storeVal = getStoreMonthTotal(m, store, 'serviceTotal');
                        return (
                          <div key={store} style={{
                            width: `${(storeVal / maxRev) * 100}%`,
                            background: si === 0 ? ACCENT : '#f59e0b',
                            minWidth: storeVal ? 2 : 0,
                          }} title={`${store}: $${storeVal.toLocaleString()}`} />
                        );
                      })}
                    </div>
                    <div style={{ width: 90, fontSize: 12, fontWeight: 600, textAlign: 'right', flexShrink: 0, fontFamily: 'monospace' }}>
                      ${total.toLocaleString()}
                    </div>
                  </div>
                );
              });
            })()}
            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: '#64748b' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: ACCENT, marginRight: 4 }} />太子店</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#f59e0b', marginRight: 4 }} />宋皇臺店</span>
            </div>
          </div>

          {/* Doctor revenue trend */}
          <div style={S.card}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#475569' }}>醫師月度營收對比</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={S.thL}>醫師</th>
                    {months.map(m => <th key={m} style={S.th}>{m.substring(5)}月</th>)}
                  </tr>
                </thead>
                <tbody>
                  {doctors.map(doc => (
                    <tr key={doc.id}>
                      <td style={S.tdL}><b>{doc.name}</b></td>
                      {months.map(m => {
                        const v = getDocMonthTotal(m, doc.name, 'serviceTotal');
                        return <td key={m} style={{ ...S.td, color: v ? '#1e293b' : '#cbd5e1' }}>{v ? `$${(v / 1000).toFixed(0)}k` : '-'}</td>;
                      })}
                    </tr>
                  ))}
                  <tr style={{ background: '#f0fdfa', fontWeight: 700 }}>
                    <td style={S.tdL}>合計</td>
                    {months.map(m => {
                      const v = getMonthTotal(m, 'serviceTotal');
                      return <td key={m} style={{ ...S.td, color: ACCENT }}>{v ? `$${(v / 1000).toFixed(0)}k` : '-'}</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Visit count trend */}
          <div style={S.card}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#475569' }}>月度掛號次數趨勢</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={S.thL}>醫師</th>
                    {months.map(m => <th key={m} style={S.th}>{m.substring(5)}月</th>)}
                  </tr>
                </thead>
                <tbody>
                  {doctors.map(doc => (
                    <tr key={doc.id}>
                      <td style={S.tdL}><b>{doc.name}</b></td>
                      {months.map(m => {
                        const v = getDocMonthTotal(m, doc.name, 'visits');
                        return <td key={m} style={{ ...S.td, color: v ? '#1e293b' : '#cbd5e1' }}>{v || '-'}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
