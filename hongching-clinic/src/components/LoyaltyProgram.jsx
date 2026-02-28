import { useState, useMemo } from 'react';
import { fmtM } from '../data';
import { getClinicName } from '../tenant';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const LS_SET = 'hcmc_loyalty_settings';
const LS_REW = 'hcmc_loyalty_rewards';
const LS_TXN = 'hcmc_loyalty_transactions';
const ACC = '#0e7490';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const today = () => new Date().toISOString().substring(0, 10);

const DEF_SETTINGS = { rate: 1, expiry: 24, minRedeem: 100, welcomeBonus: 50 };
const DEF_REWARDS = [
  { id: 'r1', name: '免費診金', points: 500, desc: '免除一次診金費用', active: true },
  { id: 'r2', name: '中藥9折', points: 300, desc: '中藥處方享九折優惠', active: true },
  { id: 'r3', name: '免費針灸', points: 800, desc: '免費一次針灸療程', active: true },
  { id: 'r4', name: '養生茶禮盒', points: 200, desc: '精選養生花茶禮盒一份', active: true },
  { id: 'r5', name: '推拿半價', points: 400, desc: '推拿療程享半價優惠', active: true },
];

const overlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modal = { background: '#fff', borderRadius: 10, padding: 24, width: '95%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' };
const btnP = { background: ACC, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
const btnS = { background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 14 };
const btnD = { background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 };
const inp = { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const lbl = { fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'block', color: '#334155' };
const badge = (bg, fg) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: bg, color: fg });
const card = { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)' };
const statBox = (bg) => ({ ...card, textAlign: 'center', background: bg });

export default function LoyaltyProgram({ data, showToast, user }) {
  const patients = data.patients || [];
  const [tab, setTab] = useState('stats');
  const [settings, setSettings] = useState(() => load(LS_SET, DEF_SETTINGS));
  const [rewards, setRewards] = useState(() => { const r = load(LS_REW, null); return r || DEF_REWARDS; });
  const [txns, setTxns] = useState(() => load(LS_TXN, []));
  const [search, setSearch] = useState('');
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [editReward, setEditReward] = useState(null);
  const [rwForm, setRwForm] = useState({ name: '', points: '', desc: '', active: true });
  const [showAdjust, setShowAdjust] = useState(null);
  const [adjForm, setAdjForm] = useState({ points: '', type: 'add', reason: '' });
  const [showRedeem, setShowRedeem] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);

  const persistR = (r) => { save(LS_REW, r); setRewards(r); };
  const persistT = (t) => { save(LS_TXN, t); setTxns(t); };
  const persistS = (s) => { save(LS_SET, s); setSettings(s); };

  // Per-patient balances
  const balances = useMemo(() => {
    const map = {};
    txns.forEach(t => { map[t.patientId] = (map[t.patientId] || 0) + Number(t.points || 0); });
    return map;
  }, [txns]);

  const stats = useMemo(() => {
    const earned = txns.filter(t => t.points > 0).reduce((s, t) => s + t.points, 0);
    const redeemed = Math.abs(txns.filter(t => t.points < 0).reduce((s, t) => s + t.points, 0));
    const members = new Set(txns.map(t => t.patientId)).size;
    return { earned, redeemed, outstanding: earned - redeemed, members };
  }, [txns]);

  const leaderboard = useMemo(() => {
    return Object.entries(balances)
      .map(([pid, pts]) => ({ pid, pts, name: (patients.find(p => p.id === pid) || {}).name || pid }))
      .sort((a, b) => b.pts - a.pts).slice(0, 10);
  }, [balances, patients]);

  const patientTxns = useMemo(() => {
    if (!selectedPatient) return [];
    return txns.filter(t => t.patientId === selectedPatient.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [txns, selectedPatient]);

  const filteredPatients = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)).slice(0, 10);
  }, [search, patients]);

  // Actions
  const saveReward = () => {
    if (!rwForm.name || !rwForm.points) return showToast('請填寫名稱及所需積分');
    const r = editReward
      ? rewards.map(rw => rw.id === editReward.id ? { ...rw, ...rwForm, points: Number(rwForm.points) } : rw)
      : [...rewards, { id: uid(), ...rwForm, points: Number(rwForm.points) }];
    persistR(r); setShowRewardModal(false); setEditReward(null); showToast('獎賞已儲存');
  };

  const deleteReward = (id) => { persistR(rewards.filter(r => r.id !== id)); showToast('已刪除'); };

  const doAdjust = () => {
    const pts = Number(adjForm.points);
    if (!pts || pts <= 0) return showToast('請輸入有效積分');
    if (!adjForm.reason) return showToast('請輸入原因');
    const signed = adjForm.type === 'add' ? pts : -pts;
    const bal = balances[showAdjust.id] || 0;
    if (adjForm.type === 'deduct' && bal < pts) return showToast('積分不足');
    const tx = { id: uid(), patientId: showAdjust.id, patientName: showAdjust.name, points: signed, type: adjForm.type === 'add' ? '手動增加' : '手動扣減', reason: adjForm.reason, date: today(), by: user?.name || 'admin' };
    persistT([...txns, tx]); setShowAdjust(null); showToast(`已${adjForm.type === 'add' ? '增加' : '扣減'} ${pts} 積分`);
  };

  const doRedeem = (rw) => {
    if (!showRedeem) return;
    const bal = balances[showRedeem.id] || 0;
    if (bal < rw.points) return showToast('積分不足');
    const tx = { id: uid(), patientId: showRedeem.id, patientName: showRedeem.name, points: -rw.points, type: '兌換獎賞', reason: rw.name, date: today(), by: user?.name || 'admin' };
    persistT([...txns, tx]); showToast(`已兌換「${rw.name}」`);
  };

  const printCard = (p) => {
    const bal = balances[p.id] || 0;
    const clinic = getClinicName();
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>會員積分卡</title><style>body{font-family:sans-serif;padding:40px;text-align:center}
.card{border:2px solid ${ACC};border-radius:16px;padding:32px;max-width:400px;margin:auto}
h2{color:${ACC};margin:0 0 8px}h3{margin:4px 0 16px;color:#64748b;font-size:14px}
.pts{font-size:48px;color:${ACC};font-weight:700;margin:16px 0}.lbl{color:#94a3b8;font-size:13px}
.name{font-size:20px;font-weight:600;margin-bottom:4px}.footer{margin-top:16px;font-size:11px;color:#94a3b8}
@media print{body{padding:20px}}</style></head><body onload="window.print()">
<div class="card"><h2>${clinic}</h2><h3>積分獎賞會員卡</h3><div class="name">${p.name}</div>
<div class="lbl">會員電話：${p.phone || '-'}</div><div class="pts">${bal.toLocaleString()}</div>
<div class="lbl">目前積分餘額</div><div class="footer">列印日期：${today()} | ${clinic}</div></div></body></html>`);
    w.document.close();
  };

  const tabs = [
    { key: 'stats', label: '統計總覽' }, { key: 'members', label: '會員積分' },
    { key: 'rewards', label: '獎賞目錄' }, { key: 'leaderboard', label: '排行榜' }, { key: 'settings', label: '設定' },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: 'auto' }}>
      <h2 style={{ color: ACC, marginBottom: 16 }}>積分獎賞計劃</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} style={{ ...btnS, ...(tab === t.key ? { background: ACC, color: '#fff', borderColor: ACC } : {}) }}>{t.label}</button>)}
      </div>

      {/* Stats */}
      {tab === 'stats' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
          <div style={statBox('#f0fdfa')}><div style={{ fontSize: 13, color: '#64748b' }}>總發出積分</div><div style={{ fontSize: 28, fontWeight: 700, color: ACC }}>{stats.earned.toLocaleString()}</div></div>
          <div style={statBox('#fef9c3')}><div style={{ fontSize: 13, color: '#64748b' }}>已兌換積分</div><div style={{ fontSize: 28, fontWeight: 700, color: '#d97706' }}>{stats.redeemed.toLocaleString()}</div></div>
          <div style={statBox('#ede9fe')}><div style={{ fontSize: 13, color: '#64748b' }}>流通積分</div><div style={{ fontSize: 28, fontWeight: 700, color: '#7c3aed' }}>{stats.outstanding.toLocaleString()}</div></div>
          <div style={statBox('#e0f2fe')}><div style={{ fontSize: 13, color: '#64748b' }}>活躍會員</div><div style={{ fontSize: 28, fontWeight: 700, color: '#0284c7' }}>{stats.members}</div></div>
        </div>
      )}

      {/* Members */}
      {tab === 'members' && (<div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input placeholder="搜尋病人姓名/電話..." value={search} onChange={e => { setSearch(e.target.value); setSelectedPatient(null); }} style={{ ...inp, maxWidth: 300 }} />
        </div>
        {search && !selectedPatient && filteredPatients.length > 0 && (
          <div style={{ ...card, marginBottom: 12 }}>
            {filteredPatients.map(p => (
              <div key={p.id} onClick={() => { setSelectedPatient(p); setSearch(''); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: '#64748b', fontSize: 13 }}>{p.phone || ''} | 積分：{(balances[p.id] || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        {selectedPatient && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div><span style={{ fontSize: 18, fontWeight: 700 }}>{selectedPatient.name}</span><span style={{ marginLeft: 12, ...badge('#f0fdfa', ACC) }}>積分：{(balances[selectedPatient.id] || 0).toLocaleString()}</span></div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={btnP} onClick={() => { setShowAdjust(selectedPatient); setAdjForm({ points: '', type: 'add', reason: '' }); }}>調整積分</button>
                <button style={btnS} onClick={() => setShowRedeem(selectedPatient)}>兌換獎賞</button>
                <button style={btnS} onClick={() => printCard(selectedPatient)}>列印會員卡</button>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f8fafc' }}><th style={{ padding: 8, textAlign: 'left' }}>日期</th><th style={{ padding: 8, textAlign: 'left' }}>類型</th><th style={{ padding: 8, textAlign: 'left' }}>原因</th><th style={{ padding: 8, textAlign: 'right' }}>積分</th><th style={{ padding: 8 }}>操作人</th></tr></thead>
              <tbody>{patientTxns.length === 0 ? <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>暫無紀錄</td></tr> : patientTxns.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: 8 }}>{t.date}</td><td style={{ padding: 8 }}>{t.type}</td><td style={{ padding: 8 }}>{t.reason || '-'}</td>
                  <td style={{ padding: 8, textAlign: 'right', color: t.points > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{t.points > 0 ? '+' : ''}{t.points}</td>
                  <td style={{ padding: 8, textAlign: 'center', color: '#64748b' }}>{t.by}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {!selectedPatient && !search && <div style={{ ...card, textAlign: 'center', color: '#94a3b8', padding: 40 }}>請搜尋病人以查看積分紀錄</div>}
      </div>)}

      {/* Rewards Catalog */}
      {tab === 'rewards' && (<div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontWeight: 600, color: '#334155' }}>獎賞目錄（{rewards.length}項）</span>
          <button style={btnP} onClick={() => { setEditReward(null); setRwForm({ name: '', points: '', desc: '', active: true }); setShowRewardModal(true); }}>新增獎賞</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
          {rewards.map(r => (
            <div key={r.id} style={{ ...card, opacity: r.active ? 1 : 0.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{r.name}</span>
                <span style={badge(r.active ? '#dcfce7' : '#fee2e2', r.active ? '#16a34a' : '#dc2626')}>{r.active ? '啟用' : '停用'}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: ACC, margin: '8px 0' }}>{r.points.toLocaleString()} 分</div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{r.desc}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={btnS} onClick={() => { setEditReward(r); setRwForm({ name: r.name, points: r.points, desc: r.desc, active: r.active }); setShowRewardModal(true); }}>編輯</button>
                <button style={btnD} onClick={() => deleteReward(r.id)}>刪除</button>
              </div>
            </div>
          ))}
        </div>
      </div>)}

      {/* Leaderboard */}
      {tab === 'leaderboard' && (<div style={card}>
        <h3 style={{ margin: '0 0 12px', color: '#334155' }}>積分排行榜 — Top 10</h3>
        {leaderboard.length === 0 ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>暫無數據</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr style={{ background: '#f8fafc' }}><th style={{ padding: 8, textAlign: 'center', width: 40 }}>排名</th><th style={{ padding: 8, textAlign: 'left' }}>病人</th><th style={{ padding: 8, textAlign: 'right' }}>積分</th></tr></thead>
            <tbody>{leaderboard.map((l, i) => (
              <tr key={l.pid} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: 8, textAlign: 'center', fontWeight: 700, color: i < 3 ? ['#d97706', '#64748b', '#b45309'][i] : '#334155', fontSize: i < 3 ? 18 : 14 }}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                <td style={{ padding: 8, fontWeight: 600 }}>{l.name}</td>
                <td style={{ padding: 8, textAlign: 'right', fontWeight: 700, color: ACC }}>{l.pts.toLocaleString()}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>)}

      {/* Settings */}
      {tab === 'settings' && (<div style={{ ...card, maxWidth: 480 }}>
        <h3 style={{ margin: '0 0 16px', color: '#334155' }}>積分計劃設定</h3>
        {[
          { key: 'rate', label: '消費積分比率（每 $1 = ? 分）', type: 'number' },
          { key: 'expiry', label: '積分有效期（月）', type: 'number' },
          { key: 'minRedeem', label: '最低兌換門檻（分）', type: 'number' },
          { key: 'welcomeBonus', label: '新會員迎新積分', type: 'number' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 14 }}>
            <label style={lbl}>{f.label}</label>
            <input type={f.type} value={settings[f.key]} onChange={e => setSettings(prev => ({ ...prev, [f.key]: Number(e.target.value) }))} style={inp} />
          </div>
        ))}
        <button style={btnP} onClick={() => { persistS(settings); showToast('設定已儲存'); }}>儲存設定</button>
      </div>)}

      {/* Reward Modal */}
      {showRewardModal && (<div style={overlay} onClick={() => setShowRewardModal(false)}><div style={modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', color: '#334155' }}>{editReward ? '編輯獎賞' : '新增獎賞'}</h3>
        <div style={{ marginBottom: 12 }}><label style={lbl}>獎賞名稱</label><input value={rwForm.name} onChange={e => setRwForm(p => ({ ...p, name: e.target.value }))} style={inp} /></div>
        <div style={{ marginBottom: 12 }}><label style={lbl}>所需積分</label><input type="number" value={rwForm.points} onChange={e => setRwForm(p => ({ ...p, points: e.target.value }))} style={inp} /></div>
        <div style={{ marginBottom: 12 }}><label style={lbl}>描述</label><input value={rwForm.desc} onChange={e => setRwForm(p => ({ ...p, desc: e.target.value }))} style={inp} /></div>
        <div style={{ marginBottom: 16 }}><label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={rwForm.active} onChange={e => setRwForm(p => ({ ...p, active: e.target.checked }))} /> 啟用</label></div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={btnS} onClick={() => setShowRewardModal(false)}>取消</button>
          <button style={btnP} onClick={saveReward}>儲存</button>
        </div>
      </div></div>)}

      {/* Adjust Points Modal */}
      {showAdjust && (<div style={overlay} onClick={() => setShowAdjust(null)}><div style={modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', color: '#334155' }}>調整積分 — {showAdjust.name}</h3>
        <div style={{ marginBottom: 12, fontSize: 13, color: '#64748b' }}>目前積分：<b style={{ color: ACC }}>{(balances[showAdjust.id] || 0).toLocaleString()}</b></div>
        <div style={{ marginBottom: 12 }}><label style={lbl}>操作類型</label>
          <select value={adjForm.type} onChange={e => setAdjForm(p => ({ ...p, type: e.target.value }))} style={inp}>
            <option value="add">增加積分</option><option value="deduct">扣減積分</option>
          </select></div>
        <div style={{ marginBottom: 12 }}><label style={lbl}>積分數量</label><input type="number" value={adjForm.points} onChange={e => setAdjForm(p => ({ ...p, points: e.target.value }))} style={inp} /></div>
        <div style={{ marginBottom: 16 }}><label style={lbl}>原因</label><input value={adjForm.reason} onChange={e => setAdjForm(p => ({ ...p, reason: e.target.value }))} style={inp} placeholder="例：消費獎賞 / 活動獎勵 / 積分修正" /></div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={btnS} onClick={() => setShowAdjust(null)}>取消</button>
          <button style={btnP} onClick={doAdjust}>確認</button>
        </div>
      </div></div>)}

      {/* Redeem Modal */}
      {showRedeem && (<div style={overlay} onClick={() => setShowRedeem(null)}><div style={modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', color: '#334155' }}>兌換獎賞 — {showRedeem.name}</h3>
        <div style={{ marginBottom: 16, fontSize: 13, color: '#64748b' }}>目前積分：<b style={{ color: ACC }}>{(balances[showRedeem.id] || 0).toLocaleString()}</b></div>
        {rewards.filter(r => r.active).map(r => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div><div style={{ fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 12, color: '#64748b' }}>{r.desc}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 700, color: ACC }}>{r.points}分</span>
              <button style={(balances[showRedeem.id] || 0) >= r.points ? btnP : { ...btnS, opacity: 0.5, cursor: 'not-allowed' }} onClick={() => doRedeem(r)} disabled={(balances[showRedeem.id] || 0) < r.points}>兌換</button>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 16, textAlign: 'right' }}><button style={btnS} onClick={() => setShowRedeem(null)}>關閉</button></div>
      </div></div>)}
    </div>
  );
}
