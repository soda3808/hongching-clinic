import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getEmployees, uid } from '../data';
import escapeHtml from '../utils/escapeHtml';

const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_evaluations';
const CATS = [
  { key: 'attitude', label: '工作態度' }, { key: 'knowledge', label: '專業知識' },
  { key: 'teamwork', label: '團隊合作' }, { key: 'communication', label: '溝通能力' },
  { key: 'attendance', label: '出勤紀錄' }, { key: 'service', label: '客戶服務' },
  { key: 'initiative', label: '主動性' }, { key: 'efficiency', label: '效率' },
];
function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function save(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); }

function Stars({ value, size = 18, interactive, onChange }) {
  return (<span style={{ display: 'inline-flex', gap: 2 }}>{[1,2,3,4,5].map(n =>
    <span key={n} onClick={() => interactive && onChange?.(n)}
      style={{ cursor: interactive ? 'pointer' : 'default', fontSize: size,
        color: n <= value ? (value >= 4 ? '#16a34a' : value === 3 ? '#d97706' : '#dc2626') : '#d1d5db' }}>★</span>
  )}</span>);
}

const card = { background: '#fff', borderRadius: 10, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)' };
const btn = (bg = ACCENT) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 });
const label = { fontSize: 13, color: '#555', marginBottom: 4, display: 'block' };
const input = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };

export default function StaffEvaluation({ showToast, user }) {
  const EMPS = getEmployees();
  const [evals, setEvals] = useState(load);
  const [tab, setTab] = useState('form');
  const [empId, setEmpId] = useState(EMPS[0]?.id || '');
  const [period, setPeriod] = useState(new Date().toISOString().substring(0, 7));
  const [ratings, setRatings] = useState({});
  const [comment, setComment] = useState('');
  const [goals, setGoals] = useState('');
  const [histEmp, setHistEmp] = useState('all');
  const [cmpA, setCmpA] = useState(EMPS[0]?.id || '');
  const [cmpB, setCmpB] = useState(EMPS[1]?.id || EMPS[0]?.id || '');

  const empName = id => EMPS.find(e => e.id === id)?.name || id;
  const avg = r => { const v = CATS.map(c => r[c.key] || 0).filter(x => x > 0); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length) : 0; };

  const submit = () => {
    if (!empId) return showToast?.('請選擇員工');
    const filled = CATS.filter(c => ratings[c.key]);
    if (filled.length < CATS.length) return showToast?.('請為所有類別評分');
    const rec = { id: uid(), empId, period, ratings: { ...ratings }, comment, goals, avgScore: +(avg(ratings).toFixed(2)),
      evaluator: user?.name || '管理員', date: new Date().toISOString().split('T')[0] };
    const next = [rec, ...evals]; setEvals(next); save(next);
    setRatings({}); setComment(''); setGoals('');
    showToast?.('考核已儲存'); setTab('history');
  };

  const deleteEval = id => { const next = evals.filter(e => e.id !== id); setEvals(next); save(next); showToast?.('已刪除'); };

  const history = useMemo(() => {
    if (histEmp === 'all') return evals;
    return evals.filter(e => e.empId === histEmp);
  }, [evals, histEmp]);

  const cmpData = useMemo(() => {
    const latest = id => evals.find(e => e.empId === id);
    return { a: latest(cmpA), b: latest(cmpB) };
  }, [evals, cmpA, cmpB]);

  const goalList = useMemo(() => evals.filter(e => e.goals?.trim()).map(e => ({
    ...e, empName: empName(e.empId),
  })), [evals]);

  const stats = useMemo(() => {
    if (!evals.length) return null;
    const byEmp = {};
    evals.forEach(e => { if (!byEmp[e.empId]) byEmp[e.empId] = []; byEmp[e.empId].push(e); });
    const empAvgs = Object.entries(byEmp).map(([id, list]) => ({
      id, name: empName(id), avg: +(list.reduce((s, e) => s + e.avgScore, 0) / list.length).toFixed(2),
    })).sort((a, b) => b.avg - a.avg);
    const catAvgs = CATS.map(c => ({ ...c,
      avg: +(evals.reduce((s, e) => s + (e.ratings?.[c.key] || 0), 0) / evals.length).toFixed(2),
    })).sort((a, b) => a.avg - b.avg);
    return { empAvgs, catAvgs, total: evals.length };
  }, [evals]);

  const printEval = ev => {
    const clinic = getClinicName();
    const rows = CATS.map(c => `<tr><td style="padding:6px 10px;border:1px solid #ccc">${c.label}</td>
      <td style="padding:6px 10px;border:1px solid #ccc;color:${(ev.ratings[c.key]||0)>=4?'#16a34a':'#d97706'}">${'★'.repeat(ev.ratings[c.key]||0)}${'☆'.repeat(5-(ev.ratings[c.key]||0))}</td></tr>`).join('');
    const html = `<html><head><title>員工考核</title></head><body style="font-family:sans-serif;padding:30px;max-width:700px;margin:auto">
      <h2 style="color:${ACCENT}">${escapeHtml(clinic)} — 員工考核表</h2>
      <p><b>員工：</b>${escapeHtml(empName(ev.empId))}　<b>考核期間：</b>${escapeHtml(ev.period)}　<b>評核人：</b>${escapeHtml(ev.evaluator)}</p>
      <table style="width:100%;border-collapse:collapse;margin:14px 0">${rows}
      <tr><td style="padding:6px 10px;border:1px solid #ccc;font-weight:bold">平均分</td>
      <td style="padding:6px 10px;border:1px solid #ccc;font-weight:bold">${ev.avgScore} / 5</td></tr></table>
      <p><b>整體評語：</b>${escapeHtml(ev.comment || '—')}</p><p><b>下期目標：</b>${escapeHtml(ev.goals || '—')}</p>
      <p style="margin-top:40px;color:#888;font-size:12px">日期：${escapeHtml(ev.date)}</p></body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close(); w.print();
  };

  const tabs = [['form','新增考核'],['history','考核歷史'],['compare','比較'],['goals','目標追蹤'],['stats','統計']];

  return (<div style={{ maxWidth: 900, margin: '0 auto' }}>
    <h2 style={{ color: ACCENT, marginBottom: 10 }}>員工考核</h2>
    <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
      {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)}
        style={{ ...btn(tab === k ? ACCENT : '#e5e7eb'), color: tab === k ? '#fff' : '#333', fontWeight: tab === k ? 700 : 500 }}>{l}</button>)}
    </div>

    {/* ── Form ── */}
    {tab === 'form' && <div style={card}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div><label style={label}>員工</label>
          <select style={input} value={empId} onChange={e => setEmpId(e.target.value)}>
            {EMPS.map(e => <option key={e.id} value={e.id}>{e.name}（{e.pos}）</option>)}</select></div>
        <div><label style={label}>考核期間</label>
          <input type="month" style={input} value={period} onChange={e => setPeriod(e.target.value)} /></div>
      </div>
      <h4 style={{ margin: '10px 0 8px', color: ACCENT }}>評分（1-5 星）</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {CATS.map(c => <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f9fafb', borderRadius: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{c.label}</span>
          <Stars value={ratings[c.key] || 0} interactive onChange={v => setRatings(r => ({ ...r, [c.key]: v }))} />
        </div>)}
      </div>
      <div style={{ marginTop: 12 }}><label style={label}>整體評語</label>
        <textarea style={{ ...input, height: 60 }} value={comment} onChange={e => setComment(e.target.value)} placeholder="整體表現評語..." /></div>
      <div style={{ marginTop: 10 }}><label style={label}>下期目標</label>
        <textarea style={{ ...input, height: 50 }} value={goals} onChange={e => setGoals(e.target.value)} placeholder="下一考核期的改進目標..." /></div>
      <button style={{ ...btn(), marginTop: 14 }} onClick={submit}>提交考核</button>
    </div>}

    {/* ── History ── */}
    {tab === 'history' && <div>
      <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center' }}>
        <label style={{ fontSize: 13 }}>篩選員工：</label>
        <select style={{ ...input, width: 180 }} value={histEmp} onChange={e => setHistEmp(e.target.value)}>
          <option value="all">全部</option>
          {EMPS.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
      </div>
      {!history.length && <p style={{ color: '#888', textAlign: 'center', marginTop: 30 }}>暫無考核記錄</p>}
      {history.map(ev => <div key={ev.id} style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div><b style={{ color: ACCENT }}>{empName(ev.empId)}</b> <span style={{ fontSize: 12, color: '#888' }}>期間：{ev.period}　評核人：{ev.evaluator}　日期：{ev.date}</span></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ ...btn('#0284c7'), fontSize: 12, padding: '4px 10px' }} onClick={() => printEval(ev)}>列印</button>
            <button style={{ ...btn('#dc2626'), fontSize: 12, padding: '4px 10px' }} onClick={() => deleteEval(ev.id)}>刪除</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, fontSize: 13 }}>
          {CATS.map(c => <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', background: '#f9fafb', borderRadius: 4 }}>
            <span>{c.label}</span><Stars value={ev.ratings?.[c.key] || 0} size={14} /></div>)}
        </div>
        <div style={{ marginTop: 6, fontSize: 13 }}><b>平均：</b>{ev.avgScore}/5　{ev.comment && <span><b>評語：</b>{ev.comment}</span>}</div>
        {ev.goals && <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}><b>目標：</b>{ev.goals}</div>}
      </div>)}
    </div>}

    {/* ── Compare ── */}
    {tab === 'compare' && <div>
      <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13 }}>員工 A：</label>
        <select style={{ ...input, width: 150 }} value={cmpA} onChange={e => setCmpA(e.target.value)}>
          {EMPS.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <span style={{ fontWeight: 700 }}>VS</span>
        <label style={{ fontSize: 13 }}>員工 B：</label>
        <select style={{ ...input, width: 150 }} value={cmpB} onChange={e => setCmpB(e.target.value)}>
          {EMPS.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
      </div>
      {(!cmpData.a && !cmpData.b) ? <p style={{ color: '#888', textAlign: 'center' }}>所選員工暫無考核記錄</p>
      : <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f1f5f9' }}>
            <th style={{ padding: '8px 10px', textAlign: 'left' }}>類別</th>
            <th style={{ padding: '8px 10px', textAlign: 'center' }}>{empName(cmpA)}</th>
            <th style={{ padding: '8px 10px', textAlign: 'center' }}>{empName(cmpB)}</th>
          </tr></thead>
          <tbody>{CATS.map(c => <tr key={c.key}>
            <td style={{ padding: '6px 10px', borderBottom: '1px solid #eee' }}>{c.label}</td>
            <td style={{ textAlign: 'center', borderBottom: '1px solid #eee' }}><Stars value={cmpData.a?.ratings?.[c.key] || 0} size={14} /></td>
            <td style={{ textAlign: 'center', borderBottom: '1px solid #eee' }}><Stars value={cmpData.b?.ratings?.[c.key] || 0} size={14} /></td>
          </tr>)}
          <tr style={{ fontWeight: 700, background: '#f9fafb' }}>
            <td style={{ padding: '8px 10px' }}>平均分</td>
            <td style={{ textAlign: 'center' }}>{cmpData.a?.avgScore ?? '—'}</td>
            <td style={{ textAlign: 'center' }}>{cmpData.b?.avgScore ?? '—'}</td>
          </tr></tbody>
        </table>
      </div>}
    </div>}

    {/* ── Goals ── */}
    {tab === 'goals' && <div>
      <h3 style={{ color: ACCENT, marginBottom: 10 }}>目標追蹤</h3>
      {!goalList.length && <p style={{ color: '#888', textAlign: 'center' }}>暫無目標記錄</p>}
      {goalList.map(g => <div key={g.id} style={{ ...card, borderLeft: `4px solid ${ACCENT}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <b style={{ color: ACCENT }}>{g.empName}</b>
          <span style={{ fontSize: 12, color: '#888' }}>期間：{g.period}　平均：{g.avgScore}/5</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{g.goals}</p>
      </div>)}
    </div>}

    {/* ── Stats ── */}
    {tab === 'stats' && <div>
      {!stats ? <p style={{ color: '#888', textAlign: 'center' }}>暫無數據</p> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          {[['總考核數', stats.total],['最佳員工', stats.empAvgs[0]?.name || '—'],['最需改善', stats.catAvgs[0]?.label || '—']].map(([l, v]) =>
            <div key={l} style={{ ...card, textAlign: 'center' }}><div style={{ fontSize: 12, color: '#888' }}>{l}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: ACCENT }}>{v}</div></div>)}
        </div>
        <div style={card}>
          <h4 style={{ color: ACCENT, marginBottom: 8 }}>員工排名</h4>
          {stats.empAvgs.map((e, i) => <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '6px 10px', background: i === 0 ? '#f0fdf4' : '#f9fafb', borderRadius: 6, marginBottom: 4 }}>
            <span>{i + 1}. {e.name}</span>
            <span style={{ fontWeight: 700, color: ACCENT }}>{e.avg} / 5</span>
          </div>)}
        </div>
        <div style={card}>
          <h4 style={{ color: ACCENT, marginBottom: 8 }}>類別平均（由低至高）</h4>
          {stats.catAvgs.map(c => <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '5px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 13 }}>{c.label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 100, height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${c.avg / 5 * 100}%`, height: '100%', background: c.avg >= 4 ? '#16a34a' : c.avg >= 3 ? '#d97706' : '#dc2626', borderRadius: 4 }} /></div>
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36 }}>{c.avg}</span>
            </div></div>)}
        </div>
      </>}
    </div>}
  </div>);
}
