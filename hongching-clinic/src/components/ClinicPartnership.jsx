import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';

const STORE_KEY = 'hcmc_partnerships';
const TYPES = ['西醫診所', '物理治療', '營養師', '健身中心', '保險公司', '企業客戶', 'NGO/社福機構', '學校'];
const STATUSES = ['active', 'inactive', 'pending'];
const STATUS_LABEL = { active: '合作中', inactive: '已終止', pending: '洽談中' };
const STATUS_COLOR = { active: '#16a34a', inactive: '#94a3b8', pending: '#f59e0b' };
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const today = () => new Date().toISOString().split('T')[0];

const S = {
  page: { padding: 16, maxWidth: 960, margin: '0 auto' },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#0e7490' },
  tabs: { display: 'flex', gap: 6, marginBottom: 16 },
  tab: (a) => ({ padding: '7px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: a ? '#0e7490' : '#e5e7eb', color: a ? '#fff' : '#333' }),
  card: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0002', padding: 16, marginBottom: 16 },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 },
  stat: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0002', padding: 14, textAlign: 'center' },
  statN: { fontSize: 24, fontWeight: 700, color: '#0e7490' },
  statL: { fontSize: 12, color: '#64748b', marginTop: 2 },
  btn: { padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#0e7490', color: '#fff' },
  btnOutline: { padding: '7px 16px', borderRadius: 6, border: '1px solid #0e7490', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#fff', color: '#0e7490' },
  btnDanger: { padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#dc2626', color: '#fff' },
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  select: { padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' },
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '8px 6px', background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', textAlign: 'left', fontWeight: 700, fontSize: 12, color: '#475569', whiteSpace: 'nowrap' },
  td: { padding: '8px 6px', borderBottom: '1px solid #f1f5f9', fontSize: 13 },
  badge: (c) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#fff', background: c }),
  label: { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0005', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 580, maxHeight: '85vh', overflowY: 'auto' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
};

const EMPTY = { name: '', type: '西醫診所', contactPerson: '', phone: '', email: '', address: '', agreementDate: today(), expiryDate: '', terms: '', commissionRate: 10, referralIn: 0, referralOut: 0, status: 'pending' };

export default function ClinicPartnership({ data, showToast, user }) {
  const [tab, setTab] = useState('directory');
  const [partners, setPartners] = useState(() => load(STORE_KEY, []));
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [detail, setDetail] = useState(null);

  const persist = (next) => { setPartners(next); save(STORE_KEY, next); };

  /* ─── Statistics ─── */
  const stats = useMemo(() => {
    const active = partners.filter(p => p.status === 'active');
    const totalRefIn = partners.reduce((s, p) => s + (Number(p.referralIn) || 0), 0);
    const totalRefOut = partners.reduce((s, p) => s + (Number(p.referralOut) || 0), 0);
    const totalCommission = partners.reduce((s, p) => {
      const refs = (Number(p.referralIn) || 0) + (Number(p.referralOut) || 0);
      return s + refs * (Number(p.commissionRate) || 0);
    }, 0);
    const expiringSoon = active.filter(p => {
      if (!p.expiryDate) return false;
      const diff = (new Date(p.expiryDate) - new Date()) / 86400000;
      return diff >= 0 && diff <= 30;
    });
    return { total: partners.length, active: active.length, totalRefIn, totalRefOut, totalCommission, expiringSoon };
  }, [partners]);

  /* ─── Filtered list ─── */
  const filtered = useMemo(() => {
    let list = partners;
    if (filterType) list = list.filter(p => p.type === filterType);
    if (filterStatus) list = list.filter(p => p.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.contactPerson?.toLowerCase().includes(q) || p.type.includes(q));
    }
    return list.sort((a, b) => (b.agreementDate || '').localeCompare(a.agreementDate || ''));
  }, [partners, filterType, filterStatus, search]);

  /* ─── CRUD ─── */
  const handleSave = () => {
    if (!form.name) return showToast?.('請填寫合作夥伴名稱');
    if (editing) { persist(partners.map(p => p.id === editing.id ? { ...editing, ...form } : p)); }
    else { persist([...partners, { ...form, id: uid() }]); }
    setShowForm(false); setEditing(null); setForm(EMPTY); showToast?.('已保存');
  };
  const handleDelete = (id) => { persist(partners.filter(p => p.id !== id)); showToast?.('已刪除'); if (detail?.id === id) setDetail(null); };
  const toggleStatus = (id, status) => {
    persist(partners.map(p => p.id === id ? { ...p, status } : p));
    if (detail?.id === id) setDetail({ ...detail, status });
    showToast?.(`狀態已更新為${STATUS_LABEL[status]}`);
  };
  const updateReferral = (id, field, val) => {
    const v = Math.max(0, Number(val) || 0);
    persist(partners.map(p => p.id === id ? { ...p, [field]: v } : p));
    if (detail?.id === id) setDetail(prev => ({ ...prev, [field]: v }));
  };

  /* ─── Print ─── */
  const printAgreement = (p) => {
    const clinic = getClinicName();
    const refs = (Number(p.referralIn) || 0) + (Number(p.referralOut) || 0);
    const comm = refs * (Number(p.commissionRate) || 0);
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>合作協議 - ${p.name}</title>
      <style>body{font-family:sans-serif;padding:32px;max-width:700px;margin:0 auto;color:#333}
      h1{color:#0e7490;font-size:22px;border-bottom:2px solid #0e7490;padding-bottom:8px}
      h2{color:#0e7490;font-size:16px;margin-top:24px}.row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:14px}
      .lbl{color:#666;min-width:120px}.val{font-weight:600;text-align:right}
      .footer{margin-top:40px;font-size:12px;color:#999;text-align:center}
      @media print{body{padding:0}}</style></head><body>
      <h1>${clinic} - 合作協議摘要</h1>
      <h2>合作夥伴資料</h2>
      <div class="row"><span class="lbl">名稱</span><span class="val">${p.name}</span></div>
      <div class="row"><span class="lbl">類別</span><span class="val">${p.type}</span></div>
      <div class="row"><span class="lbl">聯絡人</span><span class="val">${p.contactPerson || '-'}</span></div>
      <div class="row"><span class="lbl">電話</span><span class="val">${p.phone || '-'}</span></div>
      <div class="row"><span class="lbl">電郵</span><span class="val">${p.email || '-'}</span></div>
      <div class="row"><span class="lbl">地址</span><span class="val">${p.address || '-'}</span></div>
      <h2>協議詳情</h2>
      <div class="row"><span class="lbl">合作開始日期</span><span class="val">${p.agreementDate || '-'}</span></div>
      <div class="row"><span class="lbl">到期日期</span><span class="val">${p.expiryDate || '-'}</span></div>
      <div class="row"><span class="lbl">佣金比率</span><span class="val">$${p.commissionRate} / 轉介</span></div>
      <div class="row"><span class="lbl">狀態</span><span class="val">${STATUS_LABEL[p.status]}</span></div>
      ${p.terms ? `<h2>合作條款</h2><p style="font-size:14px;white-space:pre-wrap">${p.terms}</p>` : ''}
      <h2>轉介統計</h2>
      <div class="row"><span class="lbl">轉介入（來自夥伴）</span><span class="val">${p.referralIn || 0}</span></div>
      <div class="row"><span class="lbl">轉介出（轉至夥伴）</span><span class="val">${p.referralOut || 0}</span></div>
      <div class="row"><span class="lbl">佣金總額</span><span class="val">$${comm.toLocaleString()}</span></div>
      <div class="footer">列印日期：${today()} | ${clinic}</div>
      </body></html>`);
    w.document.close(); w.print();
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <h2 style={{ ...S.title, marginBottom: 0 }}>合作夥伴管理</h2>
        <button style={S.btn} onClick={() => { setForm(EMPTY); setEditing(null); setShowForm(true); }}>+ 新增夥伴</button>
      </div>

      {/* Stats */}
      <div style={S.stats}>
        <div style={S.stat}><div style={S.statN}>{stats.total}</div><div style={S.statL}>總合作夥伴</div></div>
        <div style={S.stat}><div style={S.statN}>{stats.active}</div><div style={S.statL}>合作中</div></div>
        <div style={S.stat}><div style={S.statN}>{stats.totalRefIn + stats.totalRefOut}</div><div style={S.statL}>總轉介數</div></div>
        <div style={S.stat}><div style={S.statN}>${stats.totalCommission.toLocaleString()}</div><div style={S.statL}>佣金總額</div></div>
      </div>

      {/* Renewal alerts */}
      {stats.expiringSoon.length > 0 && (
        <div style={{ ...S.card, background: '#fef3c7', border: '1px solid #f59e0b' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e', marginBottom: 6 }}>協議即將到期提醒</div>
          {stats.expiringSoon.map(p => (
            <div key={p.id} style={{ fontSize: 13, color: '#78350f', marginBottom: 2 }}>
              {p.name}（{p.type}）- 到期日：{p.expiryDate}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        <button style={S.tab(tab === 'directory')} onClick={() => setTab('directory')}>夥伴目錄</button>
        <button style={S.tab(tab === 'referrals')} onClick={() => setTab('referrals')}>轉介追蹤</button>
      </div>

      {/* ═══ Directory Tab ═══ */}
      {tab === 'directory' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input style={{ ...S.input, maxWidth: 200 }} placeholder="搜尋名稱/聯絡人..." value={search} onChange={e => setSearch(e.target.value)} />
            <select style={S.select} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">全部類別</option>{TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <select style={S.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">全部狀態</option>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tbl}>
              <thead><tr>
                <th style={S.th}>名稱</th><th style={S.th}>類別</th><th style={S.th}>聯絡人</th>
                <th style={S.th}>電話</th><th style={S.th}>到期日</th><th style={S.th}>狀態</th><th style={S.th}>操作</th>
              </tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 32 }}>暫無合作夥伴</td></tr>}
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{p.name}</td>
                    <td style={S.td}>{p.type}</td>
                    <td style={S.td}>{p.contactPerson || '-'}</td>
                    <td style={S.td}>{p.phone || '-'}</td>
                    <td style={S.td}>{p.expiryDate || '-'}</td>
                    <td style={S.td}><span style={S.badge(STATUS_COLOR[p.status])}>{STATUS_LABEL[p.status]}</span></td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                      <button style={{ ...S.btnOutline, padding: '4px 10px', fontSize: 12, marginRight: 4 }} onClick={() => setDetail(p)}>詳情</button>
                      <button style={{ ...S.btnOutline, padding: '4px 10px', fontSize: 12, marginRight: 4 }} onClick={() => { setEditing(p); setForm(p); setShowForm(true); }}>編輯</button>
                      <button style={{ ...S.btnDanger, padding: '4px 10px', fontSize: 12 }} onClick={() => handleDelete(p.id)}>刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Referrals Tab ═══ */}
      {tab === 'referrals' && (
        <div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tbl}>
              <thead><tr>
                <th style={S.th}>夥伴名稱</th><th style={S.th}>類別</th><th style={S.th}>轉介入</th>
                <th style={S.th}>轉介出</th><th style={S.th}>佣金率</th><th style={S.th}>佣金總額</th><th style={S.th}>狀態</th>
              </tr></thead>
              <tbody>
                {partners.length === 0 && <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 32 }}>暫無數據</td></tr>}
                {partners.filter(p => p.status === 'active').map(p => {
                  const refs = (Number(p.referralIn) || 0) + (Number(p.referralOut) || 0);
                  const comm = refs * (Number(p.commissionRate) || 0);
                  return (
                    <tr key={p.id}>
                      <td style={{ ...S.td, fontWeight: 600 }}>{p.name}</td>
                      <td style={S.td}>{p.type}</td>
                      <td style={{ ...S.td, color: '#16a34a', fontWeight: 600 }}>{p.referralIn || 0}</td>
                      <td style={{ ...S.td, color: '#0e7490', fontWeight: 600 }}>{p.referralOut || 0}</td>
                      <td style={S.td}>${p.commissionRate}/次</td>
                      <td style={{ ...S.td, fontWeight: 700, color: '#0e7490' }}>${comm.toLocaleString()}</td>
                      <td style={S.td}><span style={S.badge(STATUS_COLOR[p.status])}>{STATUS_LABEL[p.status]}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ ...S.card, marginTop: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div><span style={{ fontSize: 13, color: '#64748b' }}>轉介入總計：</span><strong style={{ color: '#16a34a' }}>{stats.totalRefIn}</strong></div>
            <div><span style={{ fontSize: 13, color: '#64748b' }}>轉介出總計：</span><strong style={{ color: '#0e7490' }}>{stats.totalRefOut}</strong></div>
            <div><span style={{ fontSize: 13, color: '#64748b' }}>佣金總額：</span><strong style={{ color: '#0e7490' }}>${stats.totalCommission.toLocaleString()}</strong></div>
          </div>
        </div>
      )}

      {/* ═══ Partner Form Modal ═══ */}
      {showForm && (
        <div style={S.overlay} onClick={() => setShowForm(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: '#0e7490' }}>{editing ? '編輯合作夥伴' : '新增合作夥伴'}</h3>
            <div style={S.formGrid}>
              <div><label style={S.label}>名稱 *</label><input style={S.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><label style={S.label}>類別</label><select style={{ ...S.select, width: '100%' }} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label style={S.label}>聯絡人</label><input style={S.input} value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} /></div>
              <div><label style={S.label}>電話</label><input style={S.input} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label style={S.label}>電郵</label><input style={S.input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><label style={S.label}>地址</label><input style={S.input} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
              <div><label style={S.label}>合作開始日期</label><input type="date" style={S.input} value={form.agreementDate} onChange={e => setForm({ ...form, agreementDate: e.target.value })} /></div>
              <div><label style={S.label}>到期日期</label><input type="date" style={S.input} value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></div>
              <div><label style={S.label}>佣金率 ($/次)</label><input type="number" style={S.input} value={form.commissionRate} onChange={e => setForm({ ...form, commissionRate: e.target.value })} /></div>
              <div><label style={S.label}>狀態</label><select style={{ ...S.select, width: '100%' }} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></div>
            </div>
            <div style={{ marginTop: 10 }}><label style={S.label}>合作條款</label><textarea style={{ ...S.input, height: 60, resize: 'vertical' }} value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button style={S.btnOutline} onClick={() => setShowForm(false)}>取消</button>
              <button style={S.btn} onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Detail Modal ═══ */}
      {detail && (
        <div style={S.overlay} onClick={() => setDetail(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: '#0e7490' }}>夥伴詳情 - {detail.name}</h3>
            <div style={S.formGrid}>
              <div><span style={S.label}>類別</span><div>{detail.type}</div></div>
              <div><span style={S.label}>聯絡人</span><div>{detail.contactPerson || '-'}</div></div>
              <div><span style={S.label}>電話</span><div>{detail.phone || '-'}</div></div>
              <div><span style={S.label}>電郵</span><div>{detail.email || '-'}</div></div>
              <div style={{ gridColumn: '1/-1' }}><span style={S.label}>地址</span><div>{detail.address || '-'}</div></div>
              <div><span style={S.label}>合作開始日期</span><div>{detail.agreementDate || '-'}</div></div>
              <div><span style={S.label}>到期日期</span><div>{detail.expiryDate || '-'}</div></div>
            </div>
            {detail.terms && <div style={{ marginTop: 12 }}><span style={S.label}>合作條款</span><div style={{ fontSize: 13, whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 10, borderRadius: 6 }}>{detail.terms}</div></div>}
            <div style={{ marginTop: 14 }}>
              <span style={S.label}>目前狀態</span>
              <span style={S.badge(STATUS_COLOR[detail.status])}>{STATUS_LABEL[detail.status]}</span>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#64748b', lineHeight: '30px' }}>更新狀態：</span>
              {STATUSES.filter(s => s !== detail.status).map(s => (
                <button key={s} style={{ ...S.btnOutline, padding: '4px 12px', fontSize: 12 }} onClick={() => toggleStatus(detail.id, s)}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
            <div style={{ ...S.card, marginTop: 14, background: '#f8fafc' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#0e7490' }}>轉介記錄</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <label style={S.label}>轉介入（來自夥伴）</label>
                  <input type="number" min="0" style={{ ...S.input, width: 90 }} value={detail.referralIn || 0} onChange={e => updateReferral(detail.id, 'referralIn', e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>轉介出（轉至夥伴）</label>
                  <input type="number" min="0" style={{ ...S.input, width: 90 }} value={detail.referralOut || 0} onChange={e => updateReferral(detail.id, 'referralOut', e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>佣金總額</label>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0e7490' }}>
                    ${(((Number(detail.referralIn) || 0) + (Number(detail.referralOut) || 0)) * (Number(detail.commissionRate) || 0)).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={S.btnOutline} onClick={() => printAgreement(detail)}>列印協議</button>
              <button style={S.btn} onClick={() => setDetail(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
