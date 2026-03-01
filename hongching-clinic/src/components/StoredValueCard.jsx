import { useState, useMemo } from 'react';
import { uid, getStoreNames } from '../data';
import { getClinicName } from '../tenant';
import escapeHtml from '../utils/escapeHtml';

const LS_CARDS = 'hcmc_stored_cards';
const LS_TXN = 'hcmc_card_transactions';
const PAYMENTS = ['現金', 'FPS', 'PayMe', 'AlipayHK', '信用卡', '其他'];
const ACC = '#0e7490';
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const today = () => new Date().toISOString().substring(0, 10);
const thisMonth = () => new Date().toISOString().substring(0, 7);
const fmtD = (d) => d || '';
const fmtA = (n) => `$${Math.round(Number(n || 0)).toLocaleString('en-HK')}`;

const overlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modal = { background: '#fff', borderRadius: 10, padding: 24, width: '95%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' };
const btnP = { background: ACC, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnS = { background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 14 };
const inp = { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const label = { fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block', color: '#334155' };
const badge = (bg, color) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: bg, color });

export default function StoredValueCard({ data, showToast, user }) {
  const clinicName = getClinicName();
  const [tab, setTab] = useState('cards');
  const [cards, setCards] = useState(() => load(LS_CARDS));
  const [txns, setTxns] = useState(() => load(LS_TXN));
  const [showIssue, setShowIssue] = useState(false);
  const [showTopup, setShowTopup] = useState(null);
  const [showDeduct, setShowDeduct] = useState(null);
  const [showPrint, setShowPrint] = useState(null);
  const [search, setSearch] = useState('');
  const [issueForm, setIssueForm] = useState({ patientName: '', amount: '', payment: '現金', note: '' });
  const [topupForm, setTopupForm] = useState({ amount: '', payment: '現金', note: '' });
  const [deductForm, setDeductForm] = useState({ amount: '', item: '', note: '' });
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDrop, setShowPatientDrop] = useState(false);

  const patients = data.patients || [];
  const month = thisMonth();

  const persist = (c, t) => { save(LS_CARDS, c); save(LS_TXN, t); setCards(c); setTxns(t); };

  // Stats
  const stats = useMemo(() => {
    const active = cards.filter(c => c.active);
    return {
      total: cards.length,
      totalBalance: active.reduce((s, c) => s + Number(c.balance || 0), 0),
      monthTopup: txns.filter(t => t.type === '充值' && t.date?.startsWith(month)).reduce((s, t) => s + Number(t.amount || 0), 0),
      monthSpend: txns.filter(t => t.type === '消費' && t.date?.startsWith(month)).reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0),
    };
  }, [cards, txns, month]);

  // Filtered cards
  const filtered = useMemo(() => {
    let list = [...cards];
    if (search) { const q = search.toLowerCase(); list = list.filter(c => c.cardNo.toLowerCase().includes(q) || c.patientName.toLowerCase().includes(q)); }
    return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [cards, search]);

  // Patient dropdown filter
  const patientOpts = useMemo(() => {
    if (!patientSearch) return [];
    const q = patientSearch.toLowerCase();
    return patients.filter(p => p.name.toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 8);
  }, [patients, patientSearch]);

  const genCardNo = () => 'SVC-' + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 4).toUpperCase();

  // Issue card
  const handleIssue = () => {
    const amt = Number(issueForm.amount);
    if (!issueForm.patientName || amt <= 0) { showToast('請填寫顧客名及充值金額', 'error'); return; }
    const cardNo = genCardNo();
    const card = { id: uid(), cardNo, patientName: issueForm.patientName, balance: amt, totalTopup: amt, totalSpend: 0, active: true, createdAt: today() };
    const txn = { id: uid(), cardNo, patientName: issueForm.patientName, type: '充值', amount: amt, balance: amt, date: today(), operator: user?.name || '系統', payment: issueForm.payment, note: issueForm.note || '開卡充值' };
    const nc = [card, ...cards], nt = [txn, ...txns];
    persist(nc, nt);
    setShowIssue(false); setIssueForm({ patientName: '', amount: '', payment: '現金', note: '' }); setPatientSearch('');
    showToast(`已發卡 ${cardNo}，充值 ${fmtA(amt)}`);
  };

  // Top-up
  const handleTopup = () => {
    const amt = Number(topupForm.amount);
    if (!showTopup || amt <= 0) { showToast('請輸入充值金額', 'error'); return; }
    const nc = cards.map(c => c.id === showTopup.id ? { ...c, balance: Number(c.balance) + amt, totalTopup: Number(c.totalTopup) + amt } : c);
    const newBal = Number(showTopup.balance) + amt;
    const txn = { id: uid(), cardNo: showTopup.cardNo, patientName: showTopup.patientName, type: '充值', amount: amt, balance: newBal, date: today(), operator: user?.name || '系統', payment: topupForm.payment, note: topupForm.note || '充值' };
    persist(nc, [txn, ...txns]);
    setShowTopup(null); setTopupForm({ amount: '', payment: '現金', note: '' });
    showToast(`已充值 ${fmtA(amt)}，餘額 ${fmtA(newBal)}`);
  };

  // Deduct
  const handleDeduct = () => {
    const amt = Number(deductForm.amount);
    if (!showDeduct || amt <= 0) { showToast('請輸入消費金額', 'error'); return; }
    if (amt > Number(showDeduct.balance)) { showToast('餘額不足', 'error'); return; }
    const nc = cards.map(c => c.id === showDeduct.id ? { ...c, balance: Number(c.balance) - amt, totalSpend: Number(c.totalSpend) + amt } : c);
    const newBal = Number(showDeduct.balance) - amt;
    const txn = { id: uid(), cardNo: showDeduct.cardNo, patientName: showDeduct.patientName, type: '消費', amount: -amt, balance: newBal, date: today(), operator: user?.name || '系統', item: deductForm.item, note: deductForm.note || '消費扣款' };
    persist(nc, [txn, ...txns]);
    setShowDeduct(null); setDeductForm({ amount: '', item: '', note: '' });
    showToast(`已扣款 ${fmtA(amt)}，餘額 ${fmtA(newBal)}`);
  };

  // Toggle active
  const toggleActive = (card) => {
    const nc = cards.map(c => c.id === card.id ? { ...c, active: !c.active } : c);
    persist(nc, txns);
    showToast(card.active ? '已停用' : '已啟用');
  };

  // Print statement
  const printStatement = (card) => {
    const cardTxns = txns.filter(t => t.cardNo === card.cardNo).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>充值卡對賬單</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px}th{background:#f1f5f9}.hd{color:${ACC};margin-bottom:4px}</style></head><body>`);
    w.document.write(`<h2 class="hd">${escapeHtml(clinicName)} - 充值卡對賬單</h2>`);
    w.document.write(`<p>卡號: <b>${escapeHtml(card.cardNo)}</b> | 顧客: <b>${escapeHtml(card.patientName)}</b> | 餘額: <b>${fmtA(card.balance)}</b> | 列印日期: ${today()}</p>`);
    w.document.write('<table><tr><th>日期</th><th>類型</th><th>金額</th><th>餘額</th><th>操作人</th><th>備註</th></tr>');
    cardTxns.forEach(t => { w.document.write(`<tr><td>${fmtD(t.date)}</td><td>${escapeHtml(t.type)}</td><td>${fmtA(t.amount)}</td><td>${fmtA(t.balance)}</td><td>${escapeHtml(t.operator || '')}</td><td>${escapeHtml(t.note || t.item || '')}</td></tr>`); });
    w.document.write('</table></body></html>');
    w.document.close(); w.print();
  };

  // Stat card helper
  const StatCard = ({ title, value, color }) => (
    <div style={{ flex: '1 1 140px', background: '#fff', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', borderTop: `3px solid ${color || ACC}` }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || ACC, marginTop: 4 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ color: ACC, margin: '0 0 16px' }}>充值卡管理</h2>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <StatCard title="總發卡數" value={stats.total} />
        <StatCard title="總餘額" value={fmtA(stats.totalBalance)} />
        <StatCard title="本月充值" value={fmtA(stats.monthTopup)} color="#16a34a" />
        <StatCard title="本月消費" value={fmtA(stats.monthSpend)} color="#dc2626" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
        {[['cards', '充值卡管理'], ['history', '交易記錄']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '10px 22px', fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer', borderBottom: tab === k ? `3px solid ${ACC}` : '3px solid transparent', background: 'transparent', color: tab === k ? ACC : '#64748b' }}>{l}</button>
        ))}
      </div>

      {/* ════ Cards Tab ════ */}
      {tab === 'cards' && <>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="搜索卡號/顧客..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, maxWidth: 260 }} />
          <button onClick={() => setShowIssue(true)} style={btnP}>+ 發卡</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f1f5f9' }}>
              {['卡號', '顧客姓名', '餘額', '累計充值', '累計消費', '狀態', '建立日期', '操作'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>暫無充值卡</td></tr>}
              {filtered.map(c => {
                const lowBal = c.active && Number(c.balance) < 100;
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0', background: lowBal ? '#fef2f2' : '#fff' }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{c.cardNo}</td>
                    <td style={{ padding: '8px 10px' }}>{c.patientName}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: lowBal ? '#dc2626' : ACC }}>{fmtA(c.balance)}{lowBal && <span style={{ fontSize: 10, color: '#dc2626', marginLeft: 4 }}>低餘額</span>}</td>
                    <td style={{ padding: '8px 10px' }}>{fmtA(c.totalTopup)}</td>
                    <td style={{ padding: '8px 10px' }}>{fmtA(c.totalSpend)}</td>
                    <td style={{ padding: '8px 10px' }}><span style={badge(c.active ? '#ecfeff' : '#fef2f2', c.active ? ACC : '#dc2626')}>{c.active ? '啟用' : '停用'}</span></td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtD(c.createdAt)}</td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => { setShowTopup(c); setTopupForm({ amount: '', payment: '現金', note: '' }); }} style={{ ...btnS, marginRight: 4, fontSize: 12, padding: '4px 10px' }} disabled={!c.active}>充值</button>
                      <button onClick={() => { setShowDeduct(c); setDeductForm({ amount: '', item: '', note: '' }); }} style={{ ...btnS, marginRight: 4, fontSize: 12, padding: '4px 10px' }} disabled={!c.active}>扣款</button>
                      <button onClick={() => printStatement(c)} style={{ ...btnS, marginRight: 4, fontSize: 12, padding: '4px 10px' }}>列印</button>
                      <button onClick={() => toggleActive(c)} style={{ ...btnS, fontSize: 12, padding: '4px 10px', color: c.active ? '#dc2626' : '#16a34a' }}>{c.active ? '停用' : '啟用'}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}

      {/* ════ Transaction History Tab ════ */}
      {tab === 'history' && <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f1f5f9' }}>
            {['日期', '卡號', '顧客', '類型', '金額', '餘額', '操作人', '備註'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {txns.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>暫無交易記錄</td></tr>}
            {txns.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtD(t.date)}</td>
                <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{t.cardNo}</td>
                <td style={{ padding: '8px 10px' }}>{t.patientName}</td>
                <td style={{ padding: '8px 10px' }}><span style={badge(t.type === '充值' ? '#ecfeff' : t.type === '消費' ? '#fef2f2' : '#fefce8', t.type === '充值' ? '#0e7490' : t.type === '消費' ? '#dc2626' : '#a16207')}>{t.type}</span></td>
                <td style={{ padding: '8px 10px', fontWeight: 600, color: Number(t.amount) >= 0 ? '#16a34a' : '#dc2626' }}>{fmtA(t.amount)}</td>
                <td style={{ padding: '8px 10px' }}>{fmtA(t.balance)}</td>
                <td style={{ padding: '8px 10px' }}>{t.operator || ''}</td>
                <td style={{ padding: '8px 10px', color: '#64748b' }}>{t.note || t.item || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      {/* ════ Issue Card Modal ════ */}
      {showIssue && <div style={overlay} onClick={() => setShowIssue(false)}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <h3 style={{ color: ACC, marginTop: 0 }}>發行充值卡</h3>
          <div style={{ marginBottom: 12, position: 'relative' }}>
            <label style={label}>顧客名稱</label>
            <input placeholder="輸入搜索顧客..." value={patientSearch} onChange={e => { setPatientSearch(e.target.value); setShowPatientDrop(true); }} style={inp} />
            {showPatientDrop && patientOpts.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, maxHeight: 160, overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                {patientOpts.map(p => <div key={p.id} onClick={() => { setIssueForm({ ...issueForm, patientName: p.name }); setPatientSearch(p.name); setShowPatientDrop(false); }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => e.target.style.background = '#f0fdfa'} onMouseLeave={e => e.target.style.background = '#fff'}>{p.name}{p.phone ? ` (${p.phone})` : ''}</div>)}
              </div>
            )}
          </div>
          <div style={{ marginBottom: 12 }}><label style={label}>初始充值金額 ($)</label><input type="number" min="1" value={issueForm.amount} onChange={e => setIssueForm({ ...issueForm, amount: e.target.value })} style={inp} /></div>
          <div style={{ marginBottom: 12 }}><label style={label}>付款方式</label><select value={issueForm.payment} onChange={e => setIssueForm({ ...issueForm, payment: e.target.value })} style={inp}>{PAYMENTS.map(p => <option key={p}>{p}</option>)}</select></div>
          <div style={{ marginBottom: 16 }}><label style={label}>備註</label><input value={issueForm.note} onChange={e => setIssueForm({ ...issueForm, note: e.target.value })} style={inp} /></div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowIssue(false)} style={btnS}>取消</button>
            <button onClick={handleIssue} style={btnP}>確認發卡</button>
          </div>
        </div>
      </div>}

      {/* ════ Top-up Modal ════ */}
      {showTopup && <div style={overlay} onClick={() => setShowTopup(null)}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <h3 style={{ color: ACC, marginTop: 0 }}>充值 - {showTopup.patientName} ({showTopup.cardNo})</h3>
          <p style={{ fontSize: 13, color: '#64748b' }}>目前餘額: <b style={{ color: ACC }}>{fmtA(showTopup.balance)}</b></p>
          <div style={{ marginBottom: 12 }}><label style={label}>充值金額 ($)</label><input type="number" min="1" value={topupForm.amount} onChange={e => setTopupForm({ ...topupForm, amount: e.target.value })} style={inp} /></div>
          <div style={{ marginBottom: 12 }}><label style={label}>付款方式</label><select value={topupForm.payment} onChange={e => setTopupForm({ ...topupForm, payment: e.target.value })} style={inp}>{PAYMENTS.map(p => <option key={p}>{p}</option>)}</select></div>
          <div style={{ marginBottom: 16 }}><label style={label}>備註</label><input value={topupForm.note} onChange={e => setTopupForm({ ...topupForm, note: e.target.value })} style={inp} /></div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowTopup(null)} style={btnS}>取消</button>
            <button onClick={handleTopup} style={btnP}>確認充值</button>
          </div>
        </div>
      </div>}

      {/* ════ Deduct Modal ════ */}
      {showDeduct && <div style={overlay} onClick={() => setShowDeduct(null)}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <h3 style={{ color: '#dc2626', marginTop: 0 }}>扣款 - {showDeduct.patientName} ({showDeduct.cardNo})</h3>
          <p style={{ fontSize: 13, color: '#64748b' }}>目前餘額: <b style={{ color: ACC }}>{fmtA(showDeduct.balance)}</b></p>
          <div style={{ marginBottom: 12 }}><label style={label}>消費金額 ($)</label><input type="number" min="1" value={deductForm.amount} onChange={e => setDeductForm({ ...deductForm, amount: e.target.value })} style={inp} /></div>
          <div style={{ marginBottom: 12 }}><label style={label}>項目</label><input placeholder="例: 診金、針灸..." value={deductForm.item} onChange={e => setDeductForm({ ...deductForm, item: e.target.value })} style={inp} /></div>
          <div style={{ marginBottom: 16 }}><label style={label}>備註</label><input value={deductForm.note} onChange={e => setDeductForm({ ...deductForm, note: e.target.value })} style={inp} /></div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowDeduct(null)} style={btnS}>取消</button>
            <button onClick={handleDeduct} style={{ ...btnP, background: '#dc2626' }}>確認扣款</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
