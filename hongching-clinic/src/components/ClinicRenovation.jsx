import { useState, useMemo, useEffect } from 'react';
import { getClinicName } from '../tenant';
import { renovationProjectsOps, maintenanceScheduleOps } from '../api';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const STATUS_OPTS = ['計劃中', '進行中', '已完成', '已取消'];
const PRIORITY_OPTS = [{ v: 'high', l: '高' }, { v: 'medium', l: '中' }, { v: 'low', l: '低' }];
const PRIORITY_COLOR = { high: '#dc2626', medium: '#f59e0b', low: '#16a34a' };
const STATUS_COLOR = { '計劃中': '#6366f1', '進行中': '#f59e0b', '已完成': '#16a34a', '已取消': '#9ca3af' };
const AREA_OPTS = ['候診區', '診症室', '藥房', '前台', '洗手間', '走廊', '倉庫', '辦公室', '外牆'];
const blank = { title: '', description: '', contractor: '', contractorPhone: '', startDate: '', endDate: '', budget: '', actualCost: '', status: '計劃中', priority: 'medium', affectedAreas: [], photos: '', notes: '' };
const blankMaint = { title: '', description: '', intervalMonths: 6, lastDone: '', contractor: '', notes: '' };

export default function ClinicRenovation({ data, showToast, user }) {
  const [projects, setProjects] = useState(() => { try { return JSON.parse(localStorage.getItem('hcmc_renovation_projects') || '[]'); } catch { return []; } });
  const [schedule, setSchedule] = useState(() => { try { return JSON.parse(localStorage.getItem('hcmc_maintenance_schedule') || '[]'); } catch { return []; } });
  const [tab, setTab] = useState('list');
  const [form, setForm] = useState({ ...blank });
  const [editId, setEditId] = useState(null);
  const [mForm, setMForm] = useState({ ...blankMaint });
  const [mEditId, setMEditId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const save = (arr) => { setProjects(arr); localStorage.setItem('hcmc_renovation_projects', JSON.stringify(arr)); renovationProjectsOps.persistAll(arr); };
  const saveMaint = (arr) => { setSchedule(arr); localStorage.setItem('hcmc_maintenance_schedule', JSON.stringify(arr)); maintenanceScheduleOps.persistAll(arr); };

  useEffect(() => {
    renovationProjectsOps.load().then(d => { if (d) setProjects(d); });
    maintenanceScheduleOps.load().then(d => { if (d) setSchedule(d); });
  }, []);

  const filtered = useMemo(() => {
    let l = [...projects];
    if (filterStatus) l = l.filter(p => p.status === filterStatus);
    return l.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  }, [projects, filterStatus]);

  const stats = useMemo(() => {
    const total = projects.length;
    const totalBudget = projects.reduce((s, p) => s + Number(p.budget || 0), 0);
    const totalActual = projects.reduce((s, p) => s + Number(p.actualCost || 0), 0);
    const overdue = projects.filter(p => p.status === '進行中' && p.endDate && p.endDate < new Date().toISOString().split('T')[0]).length;
    const inProgress = projects.filter(p => p.status === '進行中').length;
    const completed = projects.filter(p => p.status === '已完成').length;
    return { total, totalBudget, totalActual, overdue, inProgress, completed };
  }, [projects]);

  const handleSubmit = () => {
    if (!form.title) { showToast('請輸入項目名稱'); return; }
    if (editId) {
      save(projects.map(p => p.id === editId ? { ...p, ...form } : p));
      showToast('項目已更新');
    } else {
      save([{ id: uid(), ...form, createdAt: new Date().toISOString() }, ...projects]);
      showToast('項目已新增');
    }
    setForm({ ...blank }); setEditId(null);
  };

  const handleMaintSubmit = () => {
    if (!mForm.title) { showToast('請輸入維護項目名稱'); return; }
    if (mEditId) {
      saveMaint(schedule.map(m => m.id === mEditId ? { ...m, ...mForm } : m));
      showToast('維護排程已更新');
    } else {
      saveMaint([{ id: uid(), ...mForm }, ...schedule]);
      showToast('維護排程已新增');
    }
    setMForm({ ...blankMaint }); setMEditId(null);
  };

  const nextDue = (item) => {
    if (!item.lastDone) return '未設定';
    const d = new Date(item.lastDone);
    d.setMonth(d.getMonth() + Number(item.intervalMonths || 6));
    return d.toISOString().split('T')[0];
  };

  const printReport = () => {
    const w = window.open('', '_blank');
    const rows = projects.map(p => `<tr><td>${p.title}</td><td>${p.status}</td><td>${p.contractor || '-'}</td><td>${p.startDate || '-'} ~ ${p.endDate || '-'}</td><td style="text-align:right">$${Number(p.budget || 0).toLocaleString()}</td><td style="text-align:right">$${Number(p.actualCost || 0).toLocaleString()}</td></tr>`).join('');
    w.document.write(`<html><head><title>裝修報告</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 8px;font-size:13px}th{background:#0e7490;color:#fff}</style></head><body><h2>${getClinicName()} - 裝修／維護項目報告</h2><p>列印日期：${new Date().toLocaleDateString('zh-TW')}</p><table><thead><tr><th>項目</th><th>狀態</th><th>承辦商</th><th>日期</th><th>預算</th><th>實際費用</th></tr></thead><tbody>${rows}</tbody></table><script>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  };

  const today = new Date().toISOString().split('T')[0];
  const timelineProjects = projects.filter(p => p.startDate && p.endDate && p.status !== '已取消');

  const s = { card: { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,.1)' }, btn: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 }, btnSm: { background: ACCENT, color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }, input: { width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }, label: { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 2, display: 'block' }, grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 8 }, stat: { textAlign: 'center', padding: 12, borderRadius: 8, background: '#f0fdfa' }, tag: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: '#fff', marginRight: 4 } };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: ACCENT }}>裝修及維護管理</h2>
        <button style={s.btn} onClick={printReport}>列印報告</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        {[['總項目', stats.total, ACCENT], ['進行中', stats.inProgress, '#f59e0b'], ['已完成', stats.completed, '#16a34a'], ['逾期', stats.overdue, '#dc2626'], ['總預算', `$${stats.totalBudget.toLocaleString()}`, '#6366f1'], ['實際支出', `$${stats.totalActual.toLocaleString()}`, stats.totalActual > stats.totalBudget ? '#dc2626' : '#16a34a']].map(([label, val, c]) => (
          <div key={label} style={s.stat}><div style={{ fontSize: 22, fontWeight: 700, color: c }}>{val}</div><div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div></div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {[['list', '項目列表'], ['timeline', '時間線'], ['maint', '定期維護']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...s.btn, background: tab === k ? ACCENT : '#e5e7eb', color: tab === k ? '#fff' : '#374151' }}>{l}</button>
        ))}
      </div>

      {/* === Project List Tab === */}
      {tab === 'list' && <>
        <div style={s.card}>
          <h4 style={{ margin: '0 0 10px', color: ACCENT }}>{editId ? '編輯項目' : '新增項目'}</h4>
          <div style={s.grid}>
            <div><label style={s.label}>項目名稱 *</label><input style={s.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div><label style={s.label}>承辦商</label><input style={s.input} value={form.contractor} onChange={e => setForm({ ...form, contractor: e.target.value })} /></div>
            <div><label style={s.label}>承辦商電話</label><input style={s.input} value={form.contractorPhone} onChange={e => setForm({ ...form, contractorPhone: e.target.value })} /></div>
            <div><label style={s.label}>開始日期</label><input type="date" style={s.input} value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
            <div><label style={s.label}>結束日期</label><input type="date" style={s.input} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
            <div><label style={s.label}>預算 ($)</label><input type="number" style={s.input} value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} /></div>
            <div><label style={s.label}>實際費用 ($)</label><input type="number" style={s.input} value={form.actualCost} onChange={e => setForm({ ...form, actualCost: e.target.value })} /></div>
            <div><label style={s.label}>狀態</label><select style={s.input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{STATUS_OPTS.map(o => <option key={o}>{o}</option>)}</select></div>
            <div><label style={s.label}>優先級</label><select style={s.input} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{PRIORITY_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
          </div>
          <div style={{ marginTop: 8 }}>
            <label style={s.label}>受影響區域</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {AREA_OPTS.map(a => (
                <label key={a} style={{ fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.affectedAreas.includes(a)} onChange={() => { const next = form.affectedAreas.includes(a) ? form.affectedAreas.filter(x => x !== a) : [...form.affectedAreas, a]; setForm({ ...form, affectedAreas: next }); }} /> {a}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <div><label style={s.label}>描述</label><textarea style={{ ...s.input, minHeight: 50 }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div><label style={s.label}>備註</label><textarea style={{ ...s.input, minHeight: 50 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
            <button style={s.btn} onClick={handleSubmit}>{editId ? '更新' : '新增'}</button>
            {editId && <button style={{ ...s.btn, background: '#6b7280' }} onClick={() => { setForm({ ...blank }); setEditId(null); }}>取消</button>}
          </div>
        </div>

        <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 13 }}>篩選狀態：</label>
          <select style={{ ...s.input, width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">全部</option>{STATUS_OPTS.map(o => <option key={o}>{o}</option>)}
          </select>
          <span style={{ fontSize: 12, color: '#6b7280' }}>共 {filtered.length} 個項目</span>
        </div>

        {filtered.map(p => {
          const budgetPct = p.budget ? Math.round((Number(p.actualCost || 0) / Number(p.budget)) * 100) : 0;
          const overBudget = budgetPct > 100;
          return (
            <div key={p.id} style={{ ...s.card, borderLeft: `4px solid ${STATUS_COLOR[p.status] || '#ccc'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{p.title}</span>
                  <span style={{ ...s.tag, background: PRIORITY_COLOR[p.priority], marginLeft: 8 }}>{PRIORITY_OPTS.find(o => o.v === p.priority)?.l || '中'}</span>
                  <span style={{ ...s.tag, background: STATUS_COLOR[p.status] }}>{p.status}</span>
                  {p.endDate && p.endDate < today && p.status === '進行中' && <span style={{ ...s.tag, background: '#dc2626' }}>逾期</span>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={s.btnSm} onClick={() => { setForm({ title: p.title, description: p.description || '', contractor: p.contractor || '', contractorPhone: p.contractorPhone || '', startDate: p.startDate || '', endDate: p.endDate || '', budget: p.budget || '', actualCost: p.actualCost || '', status: p.status, priority: p.priority || 'medium', affectedAreas: p.affectedAreas || [], photos: p.photos || '', notes: p.notes || '' }); setEditId(p.id); }}>編輯</button>
                  <button style={{ ...s.btnSm, background: '#dc2626' }} onClick={() => { save(projects.filter(x => x.id !== p.id)); showToast('已刪除'); }}>刪除</button>
                </div>
              </div>
              {p.description && <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}>{p.description}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                {p.contractor && <span>承辦商：{p.contractor}{p.contractorPhone ? ` (${p.contractorPhone})` : ''}</span>}
                {p.startDate && <span>日期：{p.startDate} ~ {p.endDate || '待定'}</span>}
                {p.affectedAreas?.length > 0 && <span>區域：{p.affectedAreas.join('、')}</span>}
              </div>
              {p.budget && <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>預算：${Number(p.budget).toLocaleString()} ｜ 實際：${Number(p.actualCost || 0).toLocaleString()} ({budgetPct}%)</div>
                <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(budgetPct, 100)}%`, height: '100%', background: overBudget ? '#dc2626' : ACCENT, borderRadius: 4, transition: 'width .3s' }} />
                </div>
              </div>}
              {p.notes && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>備註：{p.notes}</div>}
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ textAlign: 'center', color: '#9ca3af', padding: 30 }}>暫無項目</div>}
      </>}

      {/* === Timeline Tab === */}
      {tab === 'timeline' && <div style={s.card}>
        <h4 style={{ margin: '0 0 12px', color: ACCENT }}>項目時間線</h4>
        {timelineProjects.length === 0 && <div style={{ color: '#9ca3af', textAlign: 'center', padding: 20 }}>暫無可顯示的項目（需設定開始及結束日期）</div>}
        {timelineProjects.length > 0 && (() => {
          const allDates = timelineProjects.flatMap(p => [p.startDate, p.endDate]);
          const minD = allDates.reduce((a, b) => a < b ? a : b);
          const maxD = allDates.reduce((a, b) => a > b ? a : b);
          const totalDays = Math.max(1, (new Date(maxD) - new Date(minD)) / 86400000);
          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginBottom: 8 }}><span>{minD}</span><span>{maxD}</span></div>
              {timelineProjects.map(p => {
                const left = ((new Date(p.startDate) - new Date(minD)) / 86400000) / totalDays * 100;
                const width = Math.max(2, ((new Date(p.endDate) - new Date(p.startDate)) / 86400000) / totalDays * 100);
                return (
                  <div key={p.id} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{p.title} <span style={{ ...s.tag, background: STATUS_COLOR[p.status] }}>{p.status}</span></div>
                    <div style={{ position: 'relative', height: 18, background: '#f3f4f6', borderRadius: 4 }}>
                      <div style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, height: '100%', background: STATUS_COLOR[p.status] || ACCENT, borderRadius: 4, opacity: 0.85, minWidth: 4 }} />
                      {/* today marker */}
                      {today >= minD && today <= maxD && <div style={{ position: 'absolute', left: `${((new Date(today) - new Date(minD)) / 86400000) / totalDays * 100}%`, width: 2, height: '100%', background: '#dc2626' }} />}
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ display: 'inline-block', width: 10, height: 10, background: '#dc2626' }} /> 今天</div>
            </div>
          );
        })()}
      </div>}

      {/* === Maintenance Tab === */}
      {tab === 'maint' && <>
        <div style={s.card}>
          <h4 style={{ margin: '0 0 10px', color: ACCENT }}>{mEditId ? '編輯維護排程' : '新增定期維護'}</h4>
          <div style={s.grid}>
            <div><label style={s.label}>項目名稱 *</label><input style={s.input} value={mForm.title} onChange={e => setMForm({ ...mForm, title: e.target.value })} /></div>
            <div><label style={s.label}>週期（月）</label><input type="number" style={s.input} value={mForm.intervalMonths} onChange={e => setMForm({ ...mForm, intervalMonths: e.target.value })} /></div>
            <div><label style={s.label}>上次完成日期</label><input type="date" style={s.input} value={mForm.lastDone} onChange={e => setMForm({ ...mForm, lastDone: e.target.value })} /></div>
            <div><label style={s.label}>承辦商</label><input style={s.input} value={mForm.contractor} onChange={e => setMForm({ ...mForm, contractor: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 8 }}><label style={s.label}>描述</label><textarea style={{ ...s.input, minHeight: 40 }} value={mForm.description} onChange={e => setMForm({ ...mForm, description: e.target.value })} /></div>
          <div style={{ marginTop: 8 }}><label style={s.label}>備註</label><input style={s.input} value={mForm.notes} onChange={e => setMForm({ ...mForm, notes: e.target.value })} /></div>
          <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
            <button style={s.btn} onClick={handleMaintSubmit}>{mEditId ? '更新' : '新增'}</button>
            {mEditId && <button style={{ ...s.btn, background: '#6b7280' }} onClick={() => { setMForm({ ...blankMaint }); setMEditId(null); }}>取消</button>}
          </div>
        </div>

        {schedule.map(m => {
          const due = nextDue(m);
          const overdue = due !== '未設定' && due < today;
          return (
            <div key={m.id} style={{ ...s.card, borderLeft: `4px solid ${overdue ? '#dc2626' : ACCENT}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{m.title}</span>
                  {overdue && <span style={{ ...s.tag, background: '#dc2626', marginLeft: 6 }}>已逾期</span>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={s.btnSm} onClick={() => { const updated = schedule.map(x => x.id === m.id ? { ...x, lastDone: today } : x); saveMaint(updated); showToast('已標記完成'); }}>標記完成</button>
                  <button style={s.btnSm} onClick={() => { setMForm({ title: m.title, description: m.description || '', intervalMonths: m.intervalMonths || 6, lastDone: m.lastDone || '', contractor: m.contractor || '', notes: m.notes || '' }); setMEditId(m.id); }}>編輯</button>
                  <button style={{ ...s.btnSm, background: '#dc2626' }} onClick={() => { saveMaint(schedule.filter(x => x.id !== m.id)); showToast('已刪除'); }}>刪除</button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                週期：每 {m.intervalMonths} 個月 ｜ 上次完成：{m.lastDone || '未記錄'} ｜ 下次到期：<span style={{ color: overdue ? '#dc2626' : '#374151', fontWeight: overdue ? 700 : 400 }}>{due}</span>
                {m.contractor && <span> ｜ 承辦商：{m.contractor}</span>}
              </div>
              {m.description && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{m.description}</div>}
            </div>
          );
        })}
        {schedule.length === 0 && <div style={{ textAlign: 'center', color: '#9ca3af', padding: 30 }}>暫無定期維護排程</div>}
      </>}
    </div>
  );
}