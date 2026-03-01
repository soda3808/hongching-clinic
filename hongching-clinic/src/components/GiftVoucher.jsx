import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_KEY = 'hcmc_gift_vouchers';
const ACC = '#0e7490';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const save = (v) => localStorage.setItem(LS_KEY, JSON.stringify(v));
const today = () => new Date().toISOString().substring(0, 10);
const oneYearLater = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().substring(0, 10); };
const fmtA = (n) => `$${Math.round(Number(n || 0)).toLocaleString('en-HK')}`;
const genCode = () => { const c = () => Math.random().toString(36).substr(2, 4).toUpperCase(); return `HC-${c()}-${c()}`; };

const TYPES = ['現金券', '服務券', '療程券'];
const CASH_VALUES = [100, 200, 500, 1000];
const STATUSES = ['未使用', '已使用', '已過期', '已取消'];
const STATUS_STYLE = { '未使用': { bg: '#ecfeff', color: '#0e7490' }, '已使用': { bg: '#f0fdf4', color: '#16a34a' }, '已過期': { bg: '#fef2f2', color: '#dc2626' }, '已取消': { bg: '#f1f5f9', color: '#64748b' } };

const overlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modal = { background: '#fff', borderRadius: 10, padding: 24, width: '95%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' };
const btnP = { background: ACC, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnS = { background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 14 };
const inp = { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const lbl = { fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block', color: '#334155' };
const badge = (s) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: (STATUS_STYLE[s] || STATUS_STYLE['未使用']).bg, color: (STATUS_STYLE[s] || STATUS_STYLE['未使用']).color });

export default function GiftVoucher({ data, showToast, user }) {
  const clinicName = getClinicName();
  const [vouchers, setVouchers] = useState(load);
  const [tab, setTab] = useState('list');
  const [showCreate, setShowCreate] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemResult, setRedeemResult] = useState(null);
  const [form, setForm] = useState({ type: '現金券', value: 100, serviceName: '', purchaserName: '', purchaserPhone: '', recipientName: '' });
  const [bulkForm, setBulkForm] = useState({ type: '現金券', value: 100, count: 5, prefix: '' });

  const persist = (v) => { save(v); setVouchers(v); };

  // Auto-expire check
  const checkedVouchers = useMemo(() => {
    const td = today();
    let changed = false;
    const updated = vouchers.map(v => {
      if (v.status === '未使用' && v.expiryDate && v.expiryDate < td) { changed = true; return { ...v, status: '已過期' }; }
      return v;
    });
    if (changed) { save(updated); return updated; }
    return vouchers;
  }, [vouchers]);

  // Stats
  const stats = useMemo(() => {
    const issued = checkedVouchers.length;
    const redeemed = checkedVouchers.filter(v => v.status === '已使用').length;
    const outstanding = checkedVouchers.filter(v => v.status === '未使用').reduce((s, v) => s + Number(v.value || 0), 0);
    const expired = checkedVouchers.filter(v => v.status === '已過期').reduce((s, v) => s + Number(v.value || 0), 0);
    return { issued, redeemed, outstanding, expired };
  }, [checkedVouchers]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = [...checkedVouchers];
    if (search) { const q = search.toLowerCase(); list = list.filter(v => v.code.toLowerCase().includes(q) || (v.purchaserName || '').toLowerCase().includes(q) || (v.recipientName || '').toLowerCase().includes(q)); }
    if (filterStatus !== 'all') list = list.filter(v => v.status === filterStatus);
    if (filterType !== 'all') list = list.filter(v => v.type === filterType);
    if (filterFrom) list = list.filter(v => v.issueDate >= filterFrom);
    if (filterTo) list = list.filter(v => v.issueDate <= filterTo);
    return list.sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
  }, [checkedVouchers, search, filterStatus, filterType, filterFrom, filterTo]);

  // Create voucher
  const handleCreate = () => {
    if (!form.purchaserName) { showToast('請填寫購買人姓名', 'error'); return; }
    if (form.type === '服務券' && !form.serviceName) { showToast('請填寫服務名稱', 'error'); return; }
    const v = { id: uid(), code: genCode(), type: form.type, value: Number(form.value) || 0, serviceName: form.serviceName, purchaserName: form.purchaserName, purchaserPhone: form.purchaserPhone, recipientName: form.recipientName || form.purchaserName, issueDate: today(), expiryDate: oneYearLater(), status: '未使用', usedDate: null, usedBy: null, createdBy: user?.name || '系統' };
    const nv = [v, ...vouchers];
    persist(nv);
    showToast(`禮券 ${v.code} 已建立`);
    setShowCreate(false);
    setForm({ type: '現金券', value: 100, serviceName: '', purchaserName: '', purchaserPhone: '', recipientName: '' });
  };

  // Bulk generate
  const handleBulk = () => {
    const count = Math.min(Math.max(Number(bulkForm.count) || 1, 1), 100);
    const newVouchers = Array.from({ length: count }, () => ({
      id: uid(), code: genCode(), type: bulkForm.type, value: Number(bulkForm.value) || 0, serviceName: '', purchaserName: bulkForm.prefix || '推廣活動', purchaserPhone: '', recipientName: '', issueDate: today(), expiryDate: oneYearLater(), status: '未使用', usedDate: null, usedBy: null, createdBy: user?.name || '系統'
    }));
    persist([...newVouchers, ...vouchers]);
    showToast(`已批量生成 ${count} 張禮券`);
    setShowBulk(false);
    setBulkForm({ type: '現金券', value: 100, count: 5, prefix: '' });
  };

  // Redeem
  const handleSearch = () => {
    const found = checkedVouchers.find(v => v.code.toLowerCase() === redeemCode.trim().toLowerCase());
    setRedeemResult(found || 'not_found');
  };
  const handleRedeem = () => {
    if (!redeemResult || redeemResult === 'not_found') return;
    const nv = vouchers.map(v => v.id === redeemResult.id ? { ...v, status: '已使用', usedDate: today(), usedBy: user?.name || '系統' } : v);
    persist(nv);
    showToast(`禮券 ${redeemResult.code} 已兌換`);
    setShowRedeem(false); setRedeemCode(''); setRedeemResult(null);
  };

  // Cancel
  const handleCancel = (v) => {
    if (!window.confirm(`確定取消禮券 ${v.code}？`)) return;
    const nv = vouchers.map(x => x.id === v.id ? { ...x, status: '已取消' } : x);
    persist(nv);
    showToast('禮券已取消');
  };

  // Print voucher
  const handlePrint = (v) => {
    const w = window.open('', '_blank', 'width=600,height=500');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>禮券</title></head><body style="margin:0;padding:40px;font-family:'Helvetica Neue',Arial,sans-serif;background:#f8fafc">
      <div style="max-width:480px;margin:0 auto;border:3px solid ${ACC};border-radius:16px;overflow:hidden;background:#fff">
        <div style="background:${ACC};padding:20px 24px;text-align:center">
          <div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:2px">${escapeHtml(clinicName)}</div>
          <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:4px">GIFT VOUCHER</div>
        </div>
        <div style="padding:28px 24px;text-align:center">
          <div style="font-size:14px;color:#64748b;margin-bottom:8px">${escapeHtml(v.type)}</div>
          <div style="font-size:36px;font-weight:700;color:${ACC};margin-bottom:4px">${v.type === '現金券' ? fmtA(v.value) : escapeHtml(v.serviceName || v.type)}</div>
          <div style="font-size:20px;letter-spacing:4px;color:#334155;margin:16px 0;padding:10px;background:#f1f5f9;border-radius:8px;font-family:monospace;font-weight:600">${escapeHtml(v.code)}</div>
          <div style="display:flex;justify-content:space-between;font-size:13px;color:#64748b;margin-top:16px;padding-top:16px;border-top:1px dashed #e2e8f0">
            <span>受贈人: ${escapeHtml(v.recipientName || '-')}</span>
            <span>有效期至: ${v.expiryDate}</span>
          </div>
        </div>
        <div style="background:#f8fafc;padding:12px 24px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">
          本券不可兌換現金 | 逾期無效 | 每次限用一張
        </div>
      </div>
      <div style="text-align:center;margin-top:20px"><button onclick="window.print()" style="background:${ACC};color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:14px;cursor:pointer">列印</button></div>
    </body></html>`);
    w.document.close();
  };

  const tabBtn = (t, label) => ({ padding: '8px 16px', border: 'none', borderRadius: '6px 6px 0 0', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: tab === t ? ACC : '#f1f5f9', color: tab === t ? '#fff' : '#64748b' });

  return (
    <div style={{ padding: 16, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: '#0f172a' }}>禮券管理</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnP} onClick={() => setShowCreate(true)}>+ 新增禮券</button>
          <button style={btnS} onClick={() => setShowRedeem(true)}>兌換禮券</button>
          <button style={btnS} onClick={() => setShowBulk(true)}>批量生成</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 16 }}>
        {[['已發行', stats.issued, '張', ACC], ['已兌換', stats.redeemed, '張', '#16a34a'], ['未用金額', fmtA(stats.outstanding), '', '#f59e0b'], ['已過期金額', fmtA(stats.expired), '', '#dc2626']].map(([l, v, u, c]) => (
          <div key={l} style={{ background: '#fff', borderRadius: 10, padding: 16, border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c }}>{v}{u}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 0 }}>
        <button style={tabBtn('list', '禮券列表')} onClick={() => setTab('list')}>禮券列表</button>
        <button style={tabBtn('stats', '統計')} onClick={() => setTab('stats')}>統計</button>
      </div>
      <div style={{ background: '#fff', borderRadius: '0 10px 10px 10px', border: '1px solid #e2e8f0', padding: 16 }}>
        {tab === 'list' && <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <input style={{ ...inp, maxWidth: 200 }} placeholder="搜尋編號/姓名" value={search} onChange={e => setSearch(e.target.value)} />
            <select style={{ ...inp, maxWidth: 120 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">全部狀態</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={{ ...inp, maxWidth: 120 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">全部類型</option>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="date" style={{ ...inp, maxWidth: 150 }} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
            <input type="date" style={{ ...inp, maxWidth: 150 }} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                {['編號', '類型', '面值/服務', '購買人', '受贈人', '發行日', '到期日', '狀態', '操作'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>沒有禮券記錄</td></tr>}
                {filtered.map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{v.code}</td>
                    <td style={{ padding: '8px 10px' }}>{v.type}</td>
                    <td style={{ padding: '8px 10px' }}>{v.type === '現金券' ? fmtA(v.value) : (v.serviceName || '-')}</td>
                    <td style={{ padding: '8px 10px' }}>{v.purchaserName}</td>
                    <td style={{ padding: '8px 10px' }}>{v.recipientName || '-'}</td>
                    <td style={{ padding: '8px 10px' }}>{v.issueDate}</td>
                    <td style={{ padding: '8px 10px' }}>{v.expiryDate}</td>
                    <td style={{ padding: '8px 10px' }}><span style={badge(v.status)}>{v.status}</span></td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button style={{ ...btnS, padding: '4px 8px', fontSize: 12 }} onClick={() => handlePrint(v)}>列印</button>
                        {v.status === '未使用' && <button style={{ ...btnS, padding: '4px 8px', fontSize: 12, color: '#dc2626' }} onClick={() => handleCancel(v)}>取消</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>}
        {tab === 'stats' && <div>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#0f172a' }}>禮券統計摘要</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {TYPES.map(t => { const list = checkedVouchers.filter(v => v.type === t); return (
              <div key={t} style={{ background: '#f8fafc', borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 700, color: '#334155', marginBottom: 8 }}>{t}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>已發行: {list.length} 張</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>已兌換: {list.filter(v => v.status === '已使用').length} 張</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>未使用: {list.filter(v => v.status === '未使用').length} 張</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>總面值: {fmtA(list.reduce((s, v) => s + Number(v.value || 0), 0))}</div>
              </div>
            ); })}
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#334155', marginBottom: 8 }}>兌換率</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: ACC }}>{checkedVouchers.length ? Math.round(stats.redeemed / stats.issued * 100) : 0}%</div>
            </div>
          </div>
        </div>}
      </div>

      {/* Create Modal */}
      {showCreate && <div style={overlay} onClick={() => setShowCreate(false)}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 16px', color: '#0f172a' }}>新增禮券</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><label style={lbl}>類型</label><select style={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            {form.type === '現金券' && <div><label style={lbl}>面值</label><select style={inp} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })}>{CASH_VALUES.map(v => <option key={v} value={v}>${v}</option>)}</select></div>}
            {form.type === '服務券' && <div><label style={lbl}>服務名稱</label><input style={inp} value={form.serviceName} onChange={e => setForm({ ...form, serviceName: e.target.value })} placeholder="如: 針灸一次" /></div>}
            {form.type === '療程券' && <div><label style={lbl}>療程名稱</label><input style={inp} value={form.serviceName} onChange={e => setForm({ ...form, serviceName: e.target.value })} placeholder="如: 十次推拿療程" /></div>}
            <div><label style={lbl}>購買人姓名 *</label><input style={inp} value={form.purchaserName} onChange={e => setForm({ ...form, purchaserName: e.target.value })} /></div>
            <div><label style={lbl}>購買人電話</label><input style={inp} value={form.purchaserPhone} onChange={e => setForm({ ...form, purchaserPhone: e.target.value })} /></div>
            <div><label style={lbl}>受贈人姓名</label><input style={inp} value={form.recipientName} onChange={e => setForm({ ...form, recipientName: e.target.value })} placeholder="留空則與購買人相同" /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button style={btnS} onClick={() => setShowCreate(false)}>取消</button>
            <button style={btnP} onClick={handleCreate}>建立禮券</button>
          </div>
        </div>
      </div>}

      {/* Redeem Modal */}
      {showRedeem && <div style={overlay} onClick={() => { setShowRedeem(false); setRedeemCode(''); setRedeemResult(null); }}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 16px', color: '#0f172a' }}>兌換禮券</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="輸入禮券編號 HC-XXXX-XXXX" value={redeemCode} onChange={e => setRedeemCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            <button style={btnP} onClick={handleSearch}>查詢</button>
          </div>
          {redeemResult === 'not_found' && <div style={{ padding: 16, background: '#fef2f2', borderRadius: 8, color: '#dc2626', textAlign: 'center' }}>找不到此禮券編號</div>}
          {redeemResult && redeemResult !== 'not_found' && <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700 }}>{redeemResult.code}</span>
              <span style={badge(redeemResult.status)}>{redeemResult.status}</span>
            </div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.8 }}>
              <div>類型: {redeemResult.type}</div>
              <div>面值/服務: {redeemResult.type === '現金券' ? fmtA(redeemResult.value) : (redeemResult.serviceName || '-')}</div>
              <div>購買人: {redeemResult.purchaserName}</div>
              <div>受贈人: {redeemResult.recipientName || '-'}</div>
              <div>有效期至: {redeemResult.expiryDate}</div>
              {redeemResult.usedDate && <div>使用日期: {redeemResult.usedDate} ({redeemResult.usedBy})</div>}
            </div>
            {redeemResult.status === '未使用' && <button style={{ ...btnP, marginTop: 12, width: '100%' }} onClick={handleRedeem}>確認兌換</button>}
            {redeemResult.status !== '未使用' && <div style={{ marginTop: 12, padding: 10, background: '#fef2f2', borderRadius: 6, textAlign: 'center', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>此禮券{redeemResult.status}，無法兌換</div>}
          </div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button style={btnS} onClick={() => { setShowRedeem(false); setRedeemCode(''); setRedeemResult(null); }}>關閉</button>
          </div>
        </div>
      </div>}

      {/* Bulk Modal */}
      {showBulk && <div style={overlay} onClick={() => setShowBulk(false)}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 16px', color: '#0f172a' }}>批量生成禮券</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><label style={lbl}>類型</label><select style={inp} value={bulkForm.type} onChange={e => setBulkForm({ ...bulkForm, type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label style={lbl}>面值</label><select style={inp} value={bulkForm.value} onChange={e => setBulkForm({ ...bulkForm, value: e.target.value })}>{CASH_VALUES.map(v => <option key={v} value={v}>${v}</option>)}</select></div>
            <div><label style={lbl}>數量（上限100）</label><input type="number" style={inp} min={1} max={100} value={bulkForm.count} onChange={e => setBulkForm({ ...bulkForm, count: e.target.value })} /></div>
            <div><label style={lbl}>活動名稱</label><input style={inp} value={bulkForm.prefix} onChange={e => setBulkForm({ ...bulkForm, prefix: e.target.value })} placeholder="如: 新春推廣" /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button style={btnS} onClick={() => setShowBulk(false)}>取消</button>
            <button style={btnP} onClick={handleBulk}>生成</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
