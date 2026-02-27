// Insurance Claim Management (保險索償管理)
import { useState, useMemo } from 'react';
import { uid, fmtM } from '../data';
import { getClinicName } from '../tenant';

const ACCENT = '#0e7490';
const LS_CLAIMS = 'hcmc_insurance_claims';
const LS_COMPANIES = 'hcmc_insurance_companies';
const STATUSES = ['草稿','已提交','處理中','已批准','已拒絕','已收款'];
const CLAIM_TYPES = ['門診','住院','意外'];
const DOC_CHECKLIST = ['病歷副本','收據正本','轉介信','化驗報告','醫生證明書','身份證副本'];
const STATUS_COLORS = { '草稿':'#94a3b8','已提交':'#f59e0b','處理中':'#3b82f6','已批准':'#10b981','已拒絕':'#ef4444','已收款':'#8b5cf6' };

const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
const save = (key, val) => localStorage.setItem(key, JSON.stringify(val));
const today = () => new Date().toISOString().split('T')[0];

const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px #0001' };
const btn = (bg = ACCENT) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 });
const inp = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };
const badge = (status) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: '#fff', background: STATUS_COLORS[status] || '#888' });

export default function InsuranceClaim({ data, showToast, user }) {
  const clinicName = getClinicName();
  const patients = data?.patients || [];

  const [claims, setClaims] = useState(() => load(LS_CLAIMS, []));
  const [companies, setCompanies] = useState(() => load(LS_COMPANIES, []));
  const [tab, setTab] = useState('list');
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [patientQ, setPatientQ] = useState('');
  const [form, setForm] = useState({ patientName: '', patientPhone: '', company: '', policyNo: '', claimType: '門診', amount: '', treatmentDate: today(), diagnosis: '', docs: [], notes: '' });
  const [compForm, setCompForm] = useState({ name: '', contact: '', policyTypes: '' });
  const [editComp, setEditComp] = useState(null);

  const persist = (next) => { setClaims(next); save(LS_CLAIMS, next); };
  const persistCo = (next) => { setCompanies(next); save(LS_COMPANIES, next); };

  // Patient search suggestions
  const suggestions = useMemo(() => {
    if (!patientQ || patientQ.length < 1) return [];
    const q = patientQ.toLowerCase();
    return patients.filter(p => p.name.toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 6);
  }, [patientQ, patients]);

  // Filtered claims
  const filtered = useMemo(() => {
    let list = [...claims].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (search) { const q = search.toLowerCase(); list = list.filter(c => c.patientName.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || (c.policyNo || '').toLowerCase().includes(q)); }
    if (filterStatus !== 'all') list = list.filter(c => c.status === filterStatus);
    return list;
  }, [claims, search, filterStatus]);

  // Stats
  const stats = useMemo(() => {
    const total = claims.length;
    const pending = claims.filter(c => !['已批准','已拒絕','已收款'].includes(c.status));
    const pendingAmt = pending.reduce((s, c) => s + Number(c.amount || 0), 0);
    const decided = claims.filter(c => ['已批准','已拒絕','已收款'].includes(c.status));
    const approved = claims.filter(c => c.status === '已批准' || c.status === '已收款');
    const approvedRate = decided.length ? (approved.length / decided.length * 100).toFixed(0) : 0;
    const withDays = claims.filter(c => c.submittedAt && (c.approvedAt || c.rejectedAt));
    const avgDays = withDays.length ? (withDays.reduce((s, c) => { const end = c.approvedAt || c.rejectedAt; return s + Math.max(1, Math.ceil((new Date(end) - new Date(c.submittedAt)) / 86400000)); }, 0) / withDays.length).toFixed(0) : '-';
    return { total, pendingAmt, approvedRate, avgDays };
  }, [claims]);

  // ── Actions ──
  const handleSubmitClaim = () => {
    if (!form.patientName || !form.company || !form.amount) { showToast('請填寫病人、保險公司及金額'); return; }
    const rec = { ...form, id: uid(), amount: parseFloat(form.amount), status: '草稿', createdAt: new Date().toISOString(), createdBy: user?.name || '' };
    persist([rec, ...claims]);
    showToast('已新增索償');
    setForm({ patientName: '', patientPhone: '', company: '', policyNo: '', claimType: '門診', amount: '', treatmentDate: today(), diagnosis: '', docs: [], notes: '' });
    setPatientQ('');
    setTab('list');
  };

  const updateStatus = (id, newStatus) => {
    const ts = new Date().toISOString();
    const next = claims.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, status: newStatus };
      if (newStatus === '已提交') updated.submittedAt = ts;
      if (newStatus === '已批准') updated.approvedAt = ts;
      if (newStatus === '已拒絕') updated.rejectedAt = ts;
      if (newStatus === '已收款') updated.receivedAt = ts;
      return updated;
    });
    persist(next);
    if (detail) setDetail(next.find(c => c.id === detail.id));
    showToast(`狀態已更新為「${newStatus}」`);
  };

  const deleteClaim = (id) => { persist(claims.filter(c => c.id !== id)); setDetail(null); showToast('已刪除索償'); };

  const addCompany = () => {
    if (!compForm.name) { showToast('請填寫公司名稱'); return; }
    if (editComp) {
      const next = companies.map(c => c.id === editComp ? { ...c, ...compForm } : c);
      persistCo(next); setEditComp(null);
    } else {
      persistCo([...companies, { id: uid(), ...compForm }]);
    }
    setCompForm({ name: '', contact: '', policyTypes: '' });
    showToast(editComp ? '已更新保險公司' : '已新增保險公司');
  };

  const deleteCompany = (id) => { persistCo(companies.filter(c => c.id !== id)); showToast('已刪除'); };

  // ── Print ──
  const printClaim = (c) => {
    const w = window.open('', '_blank');
    if (!w) { showToast('請允許彈出視窗'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>保險索償表</title><style>
      body{font-family:'Microsoft YaHei','Arial',sans-serif;padding:40px 50px;max-width:700px;margin:0 auto;color:#333}
      .header{text-align:center;border-bottom:3px double ${ACCENT};padding-bottom:14px;margin-bottom:20px}
      .header h1{font-size:20px;color:${ACCENT};margin:0 0 4px}
      .title{text-align:center;font-size:18px;font-weight:700;margin:18px 0;color:${ACCENT};letter-spacing:2px}
      .field{display:flex;margin:8px 0;font-size:14px}
      .field .lb{width:120px;font-weight:700;color:#555;flex-shrink:0}
      .field .val{flex:1;border-bottom:1px solid #ddd;padding-bottom:3px}
      .section{margin:20px 0 8px;font-size:15px;font-weight:700;color:${ACCENT};border-bottom:1px solid ${ACCENT}44;padding-bottom:4px}
      .docs{margin:8px 0;font-size:13px}
      .docs span{display:inline-block;margin:2px 8px 2px 0;padding:2px 8px;border:1px solid #ddd;border-radius:4px}
      .sig{margin-top:50px;display:flex;justify-content:space-between}
      .sig-box{text-align:center;width:200px}
      .sig-line{border-top:1px solid #333;margin-top:60px;padding-top:4px;font-size:12px}
      .footer{margin-top:30px;text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:10px}
      @media print{body{padding:20px 30px}}
    </style></head><body>
      <div class="header"><h1>${clinicName}</h1><p style="font-size:12px;color:#888">保險索償申請表 Insurance Claim Form</p></div>
      <div class="title">保 險 索 償 表</div>
      <div class="field"><span class="lb">索償編號：</span><span class="val">${c.id}</span></div>
      <div class="field"><span class="lb">病人姓名：</span><span class="val">${c.patientName}</span></div>
      <div class="field"><span class="lb">聯絡電話：</span><span class="val">${c.patientPhone || '-'}</span></div>
      <div class="field"><span class="lb">保險公司：</span><span class="val">${c.company}</span></div>
      <div class="field"><span class="lb">保單號碼：</span><span class="val">${c.policyNo || '-'}</span></div>
      <div class="field"><span class="lb">索償類別：</span><span class="val">${c.claimType}</span></div>
      <div class="section">診療資料</div>
      <div class="field"><span class="lb">就診日期：</span><span class="val">${c.treatmentDate}</span></div>
      <div class="field"><span class="lb">診斷：</span><span class="val">${c.diagnosis || '-'}</span></div>
      <div class="field"><span class="lb">索償金額：</span><span class="val" style="font-weight:700;color:${ACCENT}">${fmtM(c.amount)}</span></div>
      <div class="section">附件文件</div>
      <div class="docs">${(c.docs || []).length ? c.docs.map(d => `<span>✓ ${d}</span>`).join('') : '<span style="color:#aaa">無附件</span>'}</div>
      ${c.notes ? `<div class="section">備註</div><p style="font-size:13px;line-height:1.8">${c.notes}</p>` : ''}
      <div class="sig"><div class="sig-box"><div class="sig-line">病人簽署</div></div><div class="sig-box"><div class="sig-line">診所蓋章</div></div></div>
      <div class="footer">列印日期：${today()} ｜ ${clinicName}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  // ── Next valid statuses ──
  const nextStatuses = (current) => {
    const map = { '草稿': ['已提交'], '已提交': ['處理中'], '處理中': ['已批准','已拒絕'], '已批准': ['已收款'], '已拒絕': [], '已收款': [] };
    return map[current] || [];
  };

  // ── Status timeline ──
  const Timeline = ({ claim }) => (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
      {STATUSES.map((s, i) => {
        const idx = STATUSES.indexOf(claim.status);
        const active = STATUSES.indexOf(s) <= idx;
        const skip = (claim.status === '已拒絕' && s === '已收款') || (claim.status === '已收款' && s === '已拒絕');
        if (skip) return null;
        return <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: active ? (STATUS_COLORS[s] || ACCENT) : '#e2e8f0', color: active ? '#fff' : '#94a3b8' }}>{i + 1}</span>
          <span style={{ fontSize: 12, color: active ? '#334155' : '#94a3b8', fontWeight: active ? 600 : 400 }}>{s}</span>
          {i < STATUSES.length - 1 && !skip && <span style={{ color: '#cbd5e1', margin: '0 2px' }}>→</span>}
        </span>;
      })}
    </div>
  );

  // ══ DETAIL VIEW ══
  if (detail) {
    const c = claims.find(x => x.id === detail.id) || detail;
    return (
      <div>
        <button style={{ ...btn('#64748b'), marginBottom: 12 }} onClick={() => setDetail(null)}>← 返回列表</button>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, color: ACCENT }}>{c.patientName} — {c.company}</h3>
            <span style={badge(c.status)}>{c.status}</span>
          </div>
          <Timeline claim={c} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginTop: 10 }}>
            <div><b>保單號碼：</b>{c.policyNo || '-'}</div>
            <div><b>索償類別：</b>{c.claimType}</div>
            <div><b>就診日期：</b>{c.treatmentDate}</div>
            <div><b>索償金額：</b><span style={{ color: ACCENT, fontWeight: 700 }}>{fmtM(c.amount)}</span></div>
            <div style={{ gridColumn: '1/-1' }}><b>診斷：</b>{c.diagnosis || '-'}</div>
            <div style={{ gridColumn: '1/-1' }}><b>附件：</b>{(c.docs || []).join('、') || '無'}</div>
            {c.notes && <div style={{ gridColumn: '1/-1' }}><b>備註：</b>{c.notes}</div>}
            <div><b>建立日期：</b>{(c.createdAt || '').substring(0, 10)}</div>
            <div><b>建立者：</b>{c.createdBy || '-'}</div>
            {c.submittedAt && <div><b>提交日期：</b>{c.submittedAt.substring(0, 10)}</div>}
            {c.approvedAt && <div><b>批准日期：</b>{c.approvedAt.substring(0, 10)}</div>}
            {c.rejectedAt && <div><b>拒絕日期：</b>{c.rejectedAt.substring(0, 10)}</div>}
            {c.receivedAt && <div><b>收款日期：</b>{c.receivedAt.substring(0, 10)}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {nextStatuses(c.status).map(s => <button key={s} style={btn(STATUS_COLORS[s])} onClick={() => updateStatus(c.id, s)}>更新為「{s}」</button>)}
            <button style={btn('#6366f1')} onClick={() => printClaim(c)}>列印索償表</button>
            {c.status === '草稿' && <button style={btn('#ef4444')} onClick={() => deleteClaim(c.id)}>刪除</button>}
          </div>
        </div>
      </div>
    );
  }

  // ══ TABS ══
  const tabs = [
    { key: 'list', label: '索償列表' },
    { key: 'new', label: '新增索償' },
    { key: 'companies', label: '保險公司' },
    { key: 'stats', label: '統計' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '7px 18px', borderRadius: 6, border: tab === t.key ? `2px solid ${ACCENT}` : '1px solid #d1d5db', background: tab === t.key ? `${ACCENT}11` : '#fff', color: tab === t.key ? ACCENT : '#555', fontWeight: tab === t.key ? 700 : 400, cursor: 'pointer', fontSize: 13 }}>{t.label}</button>
        ))}
      </div>

      {/* ── Stats cards (always visible on list tab) ── */}
      {tab === 'list' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
          {[
            { label: '總索償數', value: stats.total, color: ACCENT },
            { label: '待處理金額', value: fmtM(stats.pendingAmt), color: '#f59e0b' },
            { label: '批准率', value: `${stats.approvedRate}%`, color: '#10b981' },
            { label: '平均處理天數', value: stats.avgDays, color: '#6366f1' },
          ].map(s => (
            <div key={s.label} style={{ ...card, textAlign: 'center', borderTop: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── LIST TAB ── */}
      {tab === 'list' && <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder="搜尋病人/保險公司/保單號..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, maxWidth: 280 }} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: 'auto' }}>
            <option value="all">所有狀態</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {filtered.length === 0 ? <div style={{ ...card, textAlign: 'center', color: '#aaa', padding: 30 }}>暫無索償記錄</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f1f5f9' }}>
                {['病人','保險公司','金額','類別','狀態','日期','操作'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#555', borderBottom: `2px solid ${ACCENT}33` }}>{h}</th>)}
              </tr></thead>
              <tbody>{filtered.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => setDetail(c)}>
                  <td style={{ padding: '8px 10px' }}>{c.patientName}</td>
                  <td>{c.company}</td>
                  <td style={{ fontWeight: 600, color: ACCENT }}>{fmtM(c.amount)}</td>
                  <td>{c.claimType}</td>
                  <td><span style={badge(c.status)}>{c.status}</span></td>
                  <td style={{ color: '#888' }}>{(c.createdAt || '').substring(0, 10)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button style={{ ...btn('#6366f1'), padding: '4px 10px', fontSize: 12 }} onClick={() => printClaim(c)}>列印</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </>}

      {/* ── NEW CLAIM TAB ── */}
      {tab === 'new' && (
        <div style={card}>
          <h3 style={{ margin: '0 0 14px', color: ACCENT }}>新增保險索償</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>病人姓名 *</label>
              <input value={patientQ || form.patientName} onChange={e => { setPatientQ(e.target.value); setForm(f => ({ ...f, patientName: e.target.value })); }} placeholder="搜尋病人..." style={inp} />
              {suggestions.length > 0 && <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: 6, zIndex: 10, maxHeight: 180, overflow: 'auto', boxShadow: '0 4px 12px #0002' }}>
                {suggestions.map(p => <div key={p.id || p.name} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f5f5f5' }} onClick={() => { setForm(f => ({ ...f, patientName: p.name, patientPhone: p.phone || '' })); setPatientQ(''); }}>{p.name} {p.phone && <span style={{ color: '#aaa' }}>({p.phone})</span>}</div>)}
              </div>}
            </div>
            <div><label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>聯絡電話</label><input value={form.patientPhone} onChange={e => setForm(f => ({ ...f, patientPhone: e.target.value }))} style={inp} /></div>
            <div><label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>保險公司 *</label>
              <input list="comp-list" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} style={inp} placeholder="輸入或選擇..." />
              <datalist id="comp-list">{companies.map(c => <option key={c.id} value={c.name} />)}</datalist>
            </div>
            <div><label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>保單號碼</label><input value={form.policyNo} onChange={e => setForm(f => ({ ...f, policyNo: e.target.value }))} style={inp} /></div>
            <div><label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>索償類別 *</label>
              <select value={form.claimType} onChange={e => setForm(f => ({ ...f, claimType: e.target.value }))} style={inp}>{CLAIM_TYPES.map(t => <option key={t}>{t}</option>)}</select>
            </div>
            <div><label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>索償金額 ($) *</label><input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={inp} /></div>
            <div><label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>就診日期</label><input type="date" value={form.treatmentDate} onChange={e => setForm(f => ({ ...f, treatmentDate: e.target.value }))} style={inp} /></div>
            <div><label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>診斷</label><input value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))} style={inp} placeholder="例：腰痛、感冒..." /></div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>附件文件</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {DOC_CHECKLIST.map(d => (
                  <label key={d} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '3px 8px', borderRadius: 4, background: form.docs.includes(d) ? `${ACCENT}18` : '#f5f5f5', border: `1px solid ${form.docs.includes(d) ? ACCENT : '#e5e7eb'}` }}>
                    <input type="checkbox" checked={form.docs.includes(d)} onChange={() => setForm(f => ({ ...f, docs: f.docs.includes(d) ? f.docs.filter(x => x !== d) : [...f.docs, d] }))} style={{ accentColor: ACCENT }} />{d}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ gridColumn: '1/-1' }}><label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>備註</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} /></div>
          </div>
          <button style={{ ...btn(), marginTop: 12 }} onClick={handleSubmitClaim}>新增索償</button>
        </div>
      )}

      {/* ── COMPANIES TAB ── */}
      {tab === 'companies' && (
        <div>
          <div style={card}>
            <h3 style={{ margin: '0 0 10px', color: ACCENT }}>{editComp ? '編輯保險公司' : '新增保險公司'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div><label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>公司名稱 *</label><input value={compForm.name} onChange={e => setCompForm(f => ({ ...f, name: e.target.value }))} style={inp} /></div>
              <div><label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>聯絡方式</label><input value={compForm.contact} onChange={e => setCompForm(f => ({ ...f, contact: e.target.value }))} style={inp} placeholder="電話/電郵" /></div>
              <div><label style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>常見保單類型</label><input value={compForm.policyTypes} onChange={e => setCompForm(f => ({ ...f, policyTypes: e.target.value }))} style={inp} placeholder="門診,住院,意外" /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button style={btn()} onClick={addCompany}>{editComp ? '更新' : '新增'}</button>
              {editComp && <button style={btn('#94a3b8')} onClick={() => { setEditComp(null); setCompForm({ name: '', contact: '', policyTypes: '' }); }}>取消</button>}
            </div>
          </div>
          {companies.length === 0 ? <div style={{ ...card, textAlign: 'center', color: '#aaa' }}>未有保險公司記錄</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f1f5f9' }}>
                {['公司名稱','聯絡方式','常見保單類型','操作'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#555', borderBottom: `2px solid ${ACCENT}33` }}>{h}</th>)}
              </tr></thead>
              <tbody>{companies.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{c.name}</td>
                  <td>{c.contact || '-'}</td>
                  <td>{c.policyTypes || '-'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button style={{ ...btn('#f59e0b'), padding: '3px 10px', fontSize: 12 }} onClick={() => { setEditComp(c.id); setCompForm({ name: c.name, contact: c.contact || '', policyTypes: c.policyTypes || '' }); }}>編輯</button>
                    <button style={{ ...btn('#ef4444'), padding: '3px 10px', fontSize: 12 }} onClick={() => deleteCompany(c.id)}>刪除</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {/* ── STATS TAB ── */}
      {tab === 'stats' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
            {[
              { label: '總索償數', value: stats.total, color: ACCENT },
              { label: '待處理金額', value: fmtM(stats.pendingAmt), color: '#f59e0b' },
              { label: '批准率', value: `${stats.approvedRate}%`, color: '#10b981' },
              { label: '平均處理天數', value: stats.avgDays, color: '#6366f1' },
            ].map(s => (
              <div key={s.label} style={{ ...card, textAlign: 'center', borderTop: `3px solid ${s.color}` }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {/* Breakdown by status */}
          <div style={card}>
            <h4 style={{ margin: '0 0 10px', color: ACCENT }}>按狀態分佈</h4>
            {STATUSES.map(s => {
              const count = claims.filter(c => c.status === s).length;
              const pct = claims.length ? (count / claims.length * 100) : 0;
              return <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ ...badge(s), width: 56, textAlign: 'center' }}>{s}</span>
                <div style={{ flex: 1, height: 18, background: '#f1f5f9', borderRadius: 9, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: STATUS_COLORS[s], borderRadius: 9, transition: 'width .3s' }} />
                </div>
                <span style={{ fontSize: 12, color: '#555', width: 60, textAlign: 'right' }}>{count} ({pct.toFixed(0)}%)</span>
              </div>;
            })}
          </div>
          {/* Top insurance companies */}
          <div style={card}>
            <h4 style={{ margin: '0 0 10px', color: ACCENT }}>按保險公司</h4>
            {(() => {
              const byComp = {};
              claims.forEach(c => { byComp[c.company] = (byComp[c.company] || 0) + Number(c.amount || 0); });
              const sorted = Object.entries(byComp).sort((a, b) => b[1] - a[1]);
              return sorted.length ? sorted.map(([name, amt]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
                  <span>{name}</span><span style={{ fontWeight: 600, color: ACCENT }}>{fmtM(amt)}</span>
                </div>
              )) : <div style={{ color: '#aaa', fontSize: 13 }}>暫無數據</div>;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
