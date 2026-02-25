import { useState, useMemo } from 'react';
import { uid, DOCTORS } from '../data';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const QUESTIONS = [
  { id: 'q1', label: '整體滿意度', desc: '對今次診症的整體滿意程度' },
  { id: 'q2', label: '醫師專業度', desc: '醫師的專業知識和態度' },
  { id: 'q3', label: '候診時間', desc: '等候時間是否合理' },
  { id: 'q4', label: '環境整潔', desc: '診所環境和衛生' },
  { id: 'q5', label: '推薦意願', desc: '會否推薦給朋友' },
];

const STAR_LABELS = ['', '非常差', '差', '一般', '好', '非常好'];

function getSurveys() {
  try { return JSON.parse(localStorage.getItem('hcmc_surveys')) || []; } catch { return []; }
}
function saveSurveys(list) { localStorage.setItem('hcmc_surveys', JSON.stringify(list)); }

export default function SurveyPage({ data, showToast, user }) {
  const [surveys, setSurveys] = useState(getSurveys);
  const [tab, setTab] = useState('results');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ patientName: '', doctor: DOCTORS[0], store: '宋皇臺', ratings: {}, comment: '' });

  const thisMonth = new Date().toISOString().substring(0, 7);

  const stats = useMemo(() => {
    const total = surveys.length;
    const monthSurveys = surveys.filter(s => (s.date || '').substring(0, 7) === thisMonth);
    const avgOverall = total ? (surveys.reduce((s, sv) => s + (sv.ratings?.q1 || 0), 0) / total).toFixed(1) : '0';
    const nps = total ? (surveys.filter(s => (s.ratings?.q5 || 0) >= 4).length / total * 100).toFixed(0) : '0';
    return { total, thisMonth: monthSurveys.length, avgOverall, nps };
  }, [surveys, thisMonth]);

  // Average by question
  const questionAvg = useMemo(() => {
    if (!surveys.length) return QUESTIONS.map(q => ({ ...q, avg: 0 }));
    return QUESTIONS.map(q => ({
      ...q,
      avg: (surveys.reduce((s, sv) => s + (sv.ratings?.[q.id] || 0), 0) / surveys.length).toFixed(1),
    }));
  }, [surveys]);

  // Average by doctor
  const doctorAvg = useMemo(() => {
    return DOCTORS.map(doc => {
      const docSurveys = surveys.filter(s => s.doctor === doc);
      const avg = docSurveys.length ? (docSurveys.reduce((s, sv) => s + (sv.ratings?.q1 || 0), 0) / docSurveys.length).toFixed(1) : 0;
      return { doctor: doc, avg: Number(avg), count: docSurveys.length };
    });
  }, [surveys]);

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.patientName) return showToast('請填寫病人姓名');
    const hasRating = Object.values(form.ratings).some(v => v > 0);
    if (!hasRating) return showToast('請至少評分一項');

    const record = {
      id: uid(),
      ...form,
      date: new Date().toISOString().substring(0, 10),
      createdAt: new Date().toISOString(),
    };
    const updated = [...surveys, record];
    setSurveys(updated);
    saveSurveys(updated);
    setShowAdd(false);
    setForm({ patientName: '', doctor: DOCTORS[0], store: '宋皇臺', ratings: {}, comment: '' });
    showToast('問卷已儲存');
  };

  const handleDelete = (id) => {
    const updated = surveys.filter(s => s.id !== id);
    setSurveys(updated);
    saveSurveys(updated);
    showToast('已刪除');
  };

  const renderStars = (qId) => {
    const val = form.ratings[qId] || 0;
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {[1,2,3,4,5].map(n => (
          <span
            key={n}
            onClick={() => setForm(f => ({ ...f, ratings: { ...f.ratings, [qId]: n } }))}
            style={{ cursor: 'pointer', fontSize: 22, color: n <= val ? '#f59e0b' : 'var(--gray-200)' }}
          >
            ★
          </span>
        ))}
        <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 4 }}>{STAR_LABELS[val] || ''}</span>
      </div>
    );
  };

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card teal"><div className="stat-label">總問卷數</div><div className="stat-value teal">{stats.total}</div></div>
        <div className="stat-card gold"><div className="stat-label">本月收集</div><div className="stat-value gold">{stats.thisMonth}</div></div>
        <div className="stat-card green"><div className="stat-label">平均滿意度</div><div className="stat-value green">{stats.avgOverall}/5</div></div>
        <div className="stat-card red"><div className="stat-label">NPS 推薦率</div><div className="stat-value red">{stats.nps}%</div></div>
      </div>

      {/* Tabs + Actions */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          <button className={`tab-btn ${tab === 'results' ? 'active' : ''}`} onClick={() => setTab('results')}>分析結果</button>
          <button className={`tab-btn ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>問卷列表</button>
        </div>
        <button className="btn btn-teal" style={{ marginLeft: 'auto' }} onClick={() => setShowAdd(true)}>+ 新增問卷</button>
      </div>

      {/* Results Tab */}
      {tab === 'results' && (
        <>
          <div className="grid-2">
            {/* Question Averages */}
            <div className="card">
              <div className="card-header"><h3>各項評分</h3></div>
              <div style={{ padding: 16 }}>
                {questionAvg.map(q => (
                  <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 90, fontSize: 12, fontWeight: 600 }}>{q.label}</div>
                    <div style={{ flex: 1, background: 'var(--gray-100)', borderRadius: 10, height: 20, overflow: 'hidden' }}>
                      <div style={{ width: `${q.avg / 5 * 100}%`, height: '100%', background: q.avg >= 4 ? 'var(--green-500)' : q.avg >= 3 ? '#f59e0b' : 'var(--red-500)', borderRadius: 10, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ width: 40, fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{q.avg}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Doctor Comparison */}
            <div className="card">
              <div className="card-header"><h3>醫師滿意度對比</h3></div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={doctorAvg} layout="vertical">
                  <XAxis type="number" domain={[0, 5]} fontSize={11} />
                  <YAxis type="category" dataKey="doctor" fontSize={12} width={60} />
                  <Tooltip formatter={v => `${v}/5`} />
                  <Bar dataKey="avg" fill="#0e7490" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* List Tab */}
      {tab === 'list' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header"><h3>問卷記錄 ({surveys.length})</h3></div>
          <div className="table-wrap" style={{ maxHeight: 500, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr><th>日期</th><th>病人</th><th>醫師</th><th>店舖</th><th>滿意度</th><th>意見</th><th>操作</th></tr>
              </thead>
              <tbody>
                {!surveys.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>暫無問卷記錄</td></tr>}
                {[...surveys].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(s => (
                  <tr key={s.id}>
                    <td style={{ fontSize: 12 }}>{s.date}</td>
                    <td style={{ fontWeight: 600 }}>{s.patientName}</td>
                    <td>{s.doctor}</td>
                    <td>{s.store}</td>
                    <td>
                      <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                        {'★'.repeat(s.ratings?.q1 || 0)}{'☆'.repeat(5 - (s.ratings?.q1 || 0))}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.comment || '-'}</td>
                    <td><button className="btn btn-red btn-sm" onClick={() => handleDelete(s.id)}>刪除</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)} role="dialog" aria-modal="true" aria-label="新增問卷">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>病人滿意度問卷</h3>
              <button className="btn btn-outline btn-sm" onClick={() => setShowAdd(false)} aria-label="關閉">✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="grid-3" style={{ marginBottom: 12 }}>
                <div><label>病人姓名 *</label><input value={form.patientName} onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))} placeholder="姓名" /></div>
                <div><label>醫師</label><select value={form.doctor} onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))}>{DOCTORS.map(d => <option key={d}>{d}</option>)}</select></div>
                <div><label>店舖</label><select value={form.store} onChange={e => setForm(f => ({ ...f, store: e.target.value }))}><option>宋皇臺</option><option>太子</option></select></div>
              </div>

              <div style={{ marginBottom: 16 }}>
                {QUESTIONS.map(q => (
                  <div key={q.id} style={{ marginBottom: 12, padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{q.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 6 }}>{q.desc}</div>
                    {renderStars(q.id)}
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label>意見/建議</label>
                <textarea rows={3} value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} placeholder="病人的其他意見（選填）" />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-teal">儲存問卷</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
