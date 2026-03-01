import { useState, useMemo } from 'react';
import { getDoctors } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_allergies';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const save = (arr) => localStorage.setItem(LS_KEY, JSON.stringify(arr));

const ACCENT = '#0e7490';
const RED = '#dc2626';
const ORANGE = '#ea580c';
const GRAY = '#6b7280';
const card = { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.1)' };
const btn = { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: 500 };
const btnOut = { ...btn, background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}` };
const inp = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };

const TYPES = ['藥物', '食物', '環境', '接觸'];
const SEVERITIES = ['輕微', '中度', '嚴重', '致命'];
const sevColor = { '輕微': '#16a34a', '中度': ORANGE, '嚴重': RED, '致命': '#7c2d12' };
const EMPTY = { allergen: '', type: '藥物', severity: '中度', reaction: '', onsetDate: '', doctor: '' };

export default function AllergyAlert({ data, showToast, user }) {
  const [records, setRecords] = useState(load);
  const [search, setSearch] = useState('');
  const [selPatient, setSelPatient] = useState(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [showForm, setShowForm] = useState(false);
  const [showDD, setShowDD] = useState(false);
  const [checkHerb, setCheckHerb] = useState('');
  const [checkResult, setCheckResult] = useState(null);

  const clinicName = getClinicName();
  const doctors = getDoctors();
  const patients = data?.patients || [];

  const matched = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 10);
  }, [search, patients]);

  const patientAllergies = useMemo(() => {
    if (!selPatient) return [];
    return records.filter(r => r.patientId === selPatient.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [selPatient, records]);

  // Stats
  const stats = useMemo(() => {
    const patientIds = new Set(records.map(r => r.patientId));
    const allergenMap = {};
    const sevMap = { '輕微': 0, '中度': 0, '嚴重': 0, '致命': 0 };
    records.forEach(r => {
      allergenMap[r.allergen] = (allergenMap[r.allergen] || 0) + 1;
      if (sevMap[r.severity] !== undefined) sevMap[r.severity]++;
    });
    const sorted = Object.entries(allergenMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { totalPatients: patientIds.size, totalRecords: records.length, topAllergens: sorted, severity: sevMap };
  }, [records]);

  function selectPatient(p) {
    setSelPatient(p); setSearch(p.name); setShowDD(false); setShowForm(false); setCheckResult(null);
  }

  function handleSave() {
    if (!form.allergen.trim()) { showToast && showToast('請輸入過敏原名稱'); return; }
    const rec = {
      id: uid(), patientId: selPatient.id, patientName: selPatient.name,
      allergen: form.allergen.trim(), type: form.type, severity: form.severity,
      reaction: form.reaction, onsetDate: form.onsetDate, doctor: form.doctor,
      createdAt: new Date().toISOString(), recordedBy: user?.name || 'staff',
    };
    const updated = [rec, ...records];
    setRecords(updated); save(updated); setShowForm(false); setForm({ ...EMPTY });
    showToast && showToast('已新增過敏記錄');
  }

  function handleDelete(id) {
    const updated = records.filter(r => r.id !== id);
    setRecords(updated); save(updated); showToast && showToast('已刪除過敏記錄');
  }

  function handleCheck() {
    if (!checkHerb.trim() || !selPatient) return;
    const q = checkHerb.trim().toLowerCase();
    const hits = patientAllergies.filter(r => r.allergen.toLowerCase().includes(q) || (r.reaction || '').toLowerCase().includes(q));
    setCheckResult(hits);
  }

  function handlePrint() {
    if (!selPatient || patientAllergies.length === 0) return;
    const rows = patientAllergies.map(r =>
      `<tr><td>${escapeHtml(r.allergen)}</td><td>${escapeHtml(r.type)}</td><td style="color:${sevColor[r.severity] || RED};font-weight:700">${escapeHtml(r.severity)}</td><td>${escapeHtml(r.reaction || '-')}</td><td>${escapeHtml(r.onsetDate || '-')}</td><td>${escapeHtml(r.doctor || '-')}</td></tr>`
    ).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>過敏卡</title>
      <style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 10px;font-size:13px;text-align:left}th{background:#f3f4f6}.alert{background:#fef2f2;border:2px solid ${RED};border-radius:8px;padding:12px;margin-bottom:16px;color:${RED};font-weight:700;font-size:16px;text-align:center}</style></head>
      <body><h2 style="margin:0 0 4px">${escapeHtml(clinicName)} — 病人過敏卡</h2>
      <div class="alert">!! 此病人有 ${patientAllergies.length} 項過敏記錄 !!</div>
      <p><b>姓名：</b>${escapeHtml(selPatient.name)}　<b>電話：</b>${escapeHtml(selPatient.phone || '-')}　<b>列印日期：</b>${new Date().toISOString().substring(0, 10)}</p>
      <table><thead><tr><th>過敏原</th><th>類型</th><th>嚴重度</th><th>反應描述</th><th>發現日期</th><th>確認醫師</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="margin-top:20px;font-size:12px;color:#999">此卡由系統自動產生，僅供醫療參考。</p></body></html>`;
    const w = window.open('', '_blank', 'width=800,height=600');
    w.document.write(html); w.document.close(); w.print();
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: ACCENT, marginBottom: 16 }}>過敏管理</h2>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card teal"><div className="stat-label">過敏病人數</div><div className="stat-value teal">{stats.totalPatients}</div></div>
        <div className="stat-card gold"><div className="stat-label">過敏記錄數</div><div className="stat-value gold">{stats.totalRecords}</div></div>
        <div className="stat-card red"><div className="stat-label">嚴重/致命</div><div className="stat-value red">{stats.severity['嚴重'] + stats.severity['致命']}</div></div>
        <div className="stat-card green"><div className="stat-label">常見過敏原</div><div className="stat-value green">{stats.topAllergens[0]?.[0] || '-'}</div></div>
      </div>

      {/* Severity Distribution */}
      {stats.totalRecords > 0 && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>嚴重度分佈</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {SEVERITIES.map(s => (
              <span key={s} style={{ padding: '4px 12px', borderRadius: 12, fontSize: 13, background: `${sevColor[s]}18`, color: sevColor[s], fontWeight: 600 }}>
                {s}：{stats.severity[s]}
              </span>
            ))}
          </div>
          {stats.topAllergens.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: 13, color: GRAY }}>最常見過敏原：</span>
              {stats.topAllergens.map(([name, count]) => (
                <span key={name} style={{ display: 'inline-block', margin: '2px 4px', padding: '2px 10px', borderRadius: 10, background: '#f3f4f6', fontSize: 13 }}>{name} ({count})</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Patient Search */}
      <div style={card}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>搜尋病人</label>
        <div style={{ position: 'relative' }}>
          <input style={inp} placeholder="輸入姓名或電話..." value={search}
            onChange={e => { setSearch(e.target.value); setShowDD(true); if (!e.target.value) { setSelPatient(null); setCheckResult(null); } }}
            onFocus={() => setShowDD(true)} />
          {showDD && matched.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, zIndex: 50, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
              {matched.map(p => (
                <div key={p.id} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f3f4f6' }}
                  onClick={() => selectPatient(p)}
                  onMouseEnter={e => e.currentTarget.style.background = '#f0fdfa'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <b>{p.name}</b> <span style={{ color: GRAY, fontSize: 12 }}>{p.phone || ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alert Card */}
      {selPatient && patientAllergies.length > 0 && (
        <div style={{ background: '#fef2f2', border: `2px solid ${RED}`, borderRadius: 10, padding: 16, marginBottom: 12, animation: 'pulse 2s infinite' }}>
          <div style={{ color: RED, fontWeight: 800, fontSize: 18, marginBottom: 6, textAlign: 'center' }}>
            !! 過敏警示 !!
          </div>
          <div style={{ textAlign: 'center', fontSize: 14, color: '#991b1b', marginBottom: 8 }}>
            {selPatient.name} 共有 <b>{patientAllergies.length}</b> 項已知過敏
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {patientAllergies.map(r => (
              <span key={r.id} style={{ padding: '3px 10px', borderRadius: 12, fontSize: 13, fontWeight: 600, background: `${sevColor[r.severity]}20`, color: sevColor[r.severity], border: `1px solid ${sevColor[r.severity]}50` }}>
                {r.allergen}（{r.severity}）
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {selPatient && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button style={btn} onClick={() => { setForm({ ...EMPTY, doctor: doctors[0] || '' }); setShowForm(true); }}>+ 新增過敏</button>
          <button style={btnOut} onClick={handlePrint} disabled={patientAllergies.length === 0}>列印過敏卡</button>
        </div>
      )}

      {/* Add Form */}
      {showForm && selPatient && (
        <div style={{ ...card, border: `2px solid ${ACCENT}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: ACCENT }}>新增過敏記錄 — {selPatient.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ flex: '1 1 48%' }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 3 }}>過敏原名稱 *</label>
              <input style={inp} value={form.allergen} onChange={e => setForm({ ...form, allergen: e.target.value })} placeholder="例：青霉素、花生..." />
            </div>
            <div style={{ flex: '1 1 24%' }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 3 }}>類型</label>
              <select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 24%' }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 3 }}>嚴重度</label>
              <select style={inp} value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                {SEVERITIES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 100%' }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 3 }}>反應描述</label>
              <textarea style={{ ...inp, minHeight: 50 }} value={form.reaction} onChange={e => setForm({ ...form, reaction: e.target.value })} placeholder="描述過敏反應症狀..." />
            </div>
            <div style={{ flex: '1 1 48%' }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 3 }}>發現日期</label>
              <input type="date" style={inp} value={form.onsetDate} onChange={e => setForm({ ...form, onsetDate: e.target.value })} />
            </div>
            <div style={{ flex: '1 1 48%' }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 3 }}>確認醫師</label>
              <select style={inp} value={form.doctor} onChange={e => setForm({ ...form, doctor: e.target.value })}>
                <option value="">-- 選擇醫師 --</option>
                {doctors.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button style={btn} onClick={handleSave}>儲存</button>
            <button style={btnOut} onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      {/* Drug-Allergy Cross Check */}
      {selPatient && patientAllergies.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: ACCENT }}>處方交叉檢查</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="輸入擬開藥材名稱..." value={checkHerb} onChange={e => { setCheckHerb(e.target.value); setCheckResult(null); }} />
            <button style={btn} onClick={handleCheck}>檢查</button>
          </div>
          {checkResult !== null && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: checkResult.length > 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${checkResult.length > 0 ? RED : '#16a34a'}` }}>
              {checkResult.length > 0 ? (
                <div>
                  <div style={{ color: RED, fontWeight: 700, marginBottom: 4 }}>!! 發現過敏風險 !!</div>
                  {checkResult.map(r => (
                    <div key={r.id} style={{ fontSize: 13, marginBottom: 2 }}>
                      <b>{r.allergen}</b>（{r.severity}）— {r.reaction || '無描述'}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#16a34a', fontWeight: 600, fontSize: 14 }}>未發現過敏匹配，可安全使用。</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Allergy List */}
      {selPatient && (
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>過敏記錄（{patientAllergies.length}）</div>
          {patientAllergies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#aaa' }}>此病人暫無過敏記錄</div>
          ) : (
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>過敏原</th><th>類型</th><th>嚴重度</th><th>反應描述</th><th>發現日期</th><th>確認醫師</th><th>記錄者</th><th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {patientAllergies.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.allergen}</td>
                      <td><span className="tag tag-other">{r.type}</span></td>
                      <td><span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: `${sevColor[r.severity]}18`, color: sevColor[r.severity] }}>{r.severity}</span></td>
                      <td style={{ fontSize: 13, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reaction || '-'}</td>
                      <td>{r.onsetDate || '-'}</td>
                      <td>{r.doctor || '-'}</td>
                      <td style={{ fontSize: 12, color: GRAY }}>{r.recordedBy || '-'}</td>
                      <td><button style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 13 }} onClick={() => handleDelete(r.id)}>刪除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!selPatient && <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>請先搜尋並選擇病人以查看過敏記錄</div>}
    </div>
  );
}
