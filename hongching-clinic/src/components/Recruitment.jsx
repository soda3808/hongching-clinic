import { useState, useMemo } from 'react';
import { uid } from '../data';
import { getClinicName } from '../tenant';

const JOB_KEY = 'hcmc_jobs';
const APP_KEY = 'hcmc_applications';
const DEPTS = ['醫師', '護士', '配藥', '前台', '行政', '其他'];
const JOB_STATUS = ['招聘中', '已關閉'];
const APP_STATUS = ['待審', '面試中', '已錄取', '已拒絕'];
const STATUS_COLOR = { '待審': '#f59e0b', '面試中': '#0e7490', '已錄取': '#16a34a', '已拒絕': '#dc2626', '招聘中': '#0e7490', '已關閉': '#94a3b8' };

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const today = () => new Date().toISOString().split('T')[0];
const thisMonth = () => new Date().toISOString().substring(0, 7);

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
  modal: { background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 540, maxHeight: '85vh', overflowY: 'auto' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
};

export default function Recruitment({ showToast, user }) {
  const [tab, setTab] = useState('jobs');
  const [jobs, setJobs] = useState(() => load(JOB_KEY, []));
  const [apps, setApps] = useState(() => load(APP_KEY, []));
  const [showJobForm, setShowJobForm] = useState(false);
  const [editJob, setEditJob] = useState(null);
  const [showAppForm, setShowAppForm] = useState(false);
  const [editApp, setEditApp] = useState(null);
  const [detailApp, setDetailApp] = useState(null);
  const [filterDept, setFilterDept] = useState('');
  const [filterAppStatus, setFilterAppStatus] = useState('');

  const emptyJob = { title: '', dept: '醫師', location: getClinicName(), salaryMin: '', salaryMax: '', requirements: '', status: '招聘中', date: today() };
  const emptyApp = { name: '', phone: '', email: '', jobId: '', education: '', experience: '', status: '待審', date: today(), notes: '' };
  const [jobForm, setJobForm] = useState(emptyJob);
  const [appForm, setAppForm] = useState(emptyApp);

  const saveJobs = (next) => { setJobs(next); save(JOB_KEY, next); };
  const saveApps = (next) => { setApps(next); save(APP_KEY, next); };

  const openJobs = useMemo(() => jobs.filter(j => j.status === '招聘中'), [jobs]);
  const stats = useMemo(() => ({
    openPos: openJobs.length,
    totalApps: apps.length,
    pending: apps.filter(a => a.status === '待審').length,
    interviews: apps.filter(a => a.status === '面試中' && a.date?.substring(0, 7) === thisMonth()).length,
  }), [openJobs, apps]);

  const filteredJobs = useMemo(() => filterDept ? jobs.filter(j => j.dept === filterDept) : jobs, [jobs, filterDept]);
  const filteredApps = useMemo(() => {
    let r = apps;
    if (filterAppStatus) r = r.filter(a => a.status === filterAppStatus);
    return r.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [apps, filterAppStatus]);

  const handleSaveJob = () => {
    if (!jobForm.title) return showToast?.('請填寫職位名稱');
    if (editJob) { saveJobs(jobs.map(j => j.id === editJob.id ? { ...editJob, ...jobForm } : j)); }
    else { saveJobs([...jobs, { ...jobForm, id: uid() }]); }
    setShowJobForm(false); setEditJob(null); setJobForm(emptyJob); showToast?.('已保存');
  };
  const deleteJob = (id) => { saveJobs(jobs.filter(j => j.id !== id)); showToast?.('已刪除'); };

  const handleSaveApp = () => {
    if (!appForm.name) return showToast?.('請填寫應聘者姓名');
    if (editApp) { saveApps(apps.map(a => a.id === editApp.id ? { ...editApp, ...appForm } : a)); }
    else { saveApps([...apps, { ...appForm, id: uid() }]); }
    setShowAppForm(false); setEditApp(null); setAppForm(emptyApp); showToast?.('已保存');
  };
  const updateAppStatus = (id, status) => {
    saveApps(apps.map(a => a.id === id ? { ...a, status } : a));
    if (detailApp?.id === id) setDetailApp({ ...detailApp, status });
    showToast?.(`狀態已更新為 ${status}`);
  };
  const saveNotes = (id, notes) => {
    saveApps(apps.map(a => a.id === id ? { ...a, notes } : a));
    if (detailApp?.id === id) setDetailApp({ ...detailApp, notes });
  };

  const jobMap = Object.fromEntries(jobs.map(j => [j.id, j]));

  const printJobListing = () => {
    const w = window.open('', '_blank');
    const active = openJobs;
    w.document.write(`<html><head><title>招聘職位列表 - ${getClinicName()}</title>
      <style>body{font-family:sans-serif;padding:24px;max-width:800px;margin:0 auto}h1{color:#0e7490;font-size:22px}
      .job{border:1px solid #ddd;border-radius:8px;padding:14px;margin-bottom:12px}
      .job h3{margin:0 0 6px;color:#0e7490}.meta{font-size:13px;color:#555}
      @media print{body{padding:0}}</style></head><body>
      <h1>${getClinicName()} - 招聘職位</h1><p style="color:#666;font-size:13px">列印日期：${today()}</p>
      ${active.map(j => `<div class="job"><h3>${j.title}</h3>
        <div class="meta">部門：${j.dept} | 地點：${j.location || '-'} | 薪資：${j.salaryMin || '?'} - ${j.salaryMax || '?'}</div>
        ${j.requirements ? `<p style="font-size:13px;margin:8px 0 0">${j.requirements}</p>` : ''}
      </div>`).join('')}
      ${active.length === 0 ? '<p style="color:#999">目前沒有招聘中的職位</p>' : ''}
      </body></html>`);
    w.document.close(); w.print();
  };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <h2 style={{ ...S.title, marginBottom: 0 }}>招聘管理</h2>
        <button style={S.btnOutline} onClick={printJobListing}>列印職位</button>
      </div>

      {/* Stats */}
      <div style={S.stats}>
        <div style={S.stat}><div style={S.statN}>{stats.openPos}</div><div style={S.statL}>進行中職位</div></div>
        <div style={S.stat}><div style={S.statN}>{stats.totalApps}</div><div style={S.statL}>總申請數</div></div>
        <div style={S.stat}><div style={S.statN}>{stats.pending}</div><div style={S.statL}>待處理</div></div>
        <div style={S.stat}><div style={S.statN}>{stats.interviews}</div><div style={S.statL}>本月面試數</div></div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        <button style={S.tab(tab === 'jobs')} onClick={() => setTab('jobs')}>職位管理</button>
        <button style={S.tab(tab === 'apps')} onClick={() => setTab('apps')}>應聘記錄</button>
      </div>

      {/* ═══ Jobs Tab ═══ */}
      {tab === 'jobs' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={S.select} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
              <option value="">全部部門</option>{DEPTS.map(d => <option key={d}>{d}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            <button style={S.btn} onClick={() => { setJobForm(emptyJob); setEditJob(null); setShowJobForm(true); }}>+ 新增職位</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tbl}>
              <thead><tr>
                <th style={S.th}>職位名稱</th><th style={S.th}>部門</th><th style={S.th}>地點</th>
                <th style={S.th}>薪資範圍</th><th style={S.th}>狀態</th><th style={S.th}>發布日期</th><th style={S.th}>操作</th>
              </tr></thead>
              <tbody>
                {filteredJobs.length === 0 && <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 32 }}>暫無職位</td></tr>}
                {filteredJobs.map(j => (
                  <tr key={j.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{j.title}</td>
                    <td style={S.td}>{j.dept}</td>
                    <td style={S.td}>{j.location}</td>
                    <td style={S.td}>{j.salaryMin || '?'} - {j.salaryMax || '?'}</td>
                    <td style={S.td}><span style={S.badge(STATUS_COLOR[j.status] || '#94a3b8')}>{j.status}</span></td>
                    <td style={S.td}>{j.date}</td>
                    <td style={S.td}>
                      <button style={{ ...S.btnOutline, padding: '4px 10px', fontSize: 12, marginRight: 4 }} onClick={() => { setEditJob(j); setJobForm(j); setShowJobForm(true); }}>編輯</button>
                      <button style={{ ...S.btnDanger, padding: '4px 10px', fontSize: 12 }} onClick={() => deleteJob(j.id)}>刪除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Applications Tab ═══ */}
      {tab === 'apps' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={S.select} value={filterAppStatus} onChange={e => setFilterAppStatus(e.target.value)}>
              <option value="">全部狀態</option>{APP_STATUS.map(s => <option key={s}>{s}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            <button style={S.btn} onClick={() => { setAppForm(emptyApp); setEditApp(null); setShowAppForm(true); }}>+ 新增申請</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tbl}>
              <thead><tr>
                <th style={S.th}>姓名</th><th style={S.th}>電話</th><th style={S.th}>申請職位</th>
                <th style={S.th}>學歷</th><th style={S.th}>狀態</th><th style={S.th}>申請日期</th><th style={S.th}>操作</th>
              </tr></thead>
              <tbody>
                {filteredApps.length === 0 && <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 32 }}>暫無申請記錄</td></tr>}
                {filteredApps.map(a => (
                  <tr key={a.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{a.name}</td>
                    <td style={S.td}>{a.phone}</td>
                    <td style={S.td}>{jobMap[a.jobId]?.title || a.jobId || '-'}</td>
                    <td style={S.td}>{a.education || '-'}</td>
                    <td style={S.td}><span style={S.badge(STATUS_COLOR[a.status] || '#94a3b8')}>{a.status}</span></td>
                    <td style={S.td}>{a.date}</td>
                    <td style={S.td}>
                      <button style={{ ...S.btnOutline, padding: '4px 10px', fontSize: 12, marginRight: 4 }} onClick={() => setDetailApp(a)}>詳情</button>
                      <button style={{ ...S.btnOutline, padding: '4px 10px', fontSize: 12 }} onClick={() => { setEditApp(a); setAppForm(a); setShowAppForm(true); }}>編輯</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Job Form Modal ═══ */}
      {showJobForm && (
        <div style={S.overlay} onClick={() => setShowJobForm(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: '#0e7490' }}>{editJob ? '編輯職位' : '新增職位'}</h3>
            <div style={S.formGrid}>
              <div><label style={S.label}>職位名稱 *</label><input style={S.input} value={jobForm.title} onChange={e => setJobForm({ ...jobForm, title: e.target.value })} /></div>
              <div><label style={S.label}>部門</label><select style={{ ...S.select, width: '100%' }} value={jobForm.dept} onChange={e => setJobForm({ ...jobForm, dept: e.target.value })}>{DEPTS.map(d => <option key={d}>{d}</option>)}</select></div>
              <div><label style={S.label}>工作地點</label><input style={S.input} value={jobForm.location} onChange={e => setJobForm({ ...jobForm, location: e.target.value })} /></div>
              <div><label style={S.label}>發布日期</label><input type="date" style={S.input} value={jobForm.date} onChange={e => setJobForm({ ...jobForm, date: e.target.value })} /></div>
              <div><label style={S.label}>最低薪資</label><input style={S.input} type="number" value={jobForm.salaryMin} onChange={e => setJobForm({ ...jobForm, salaryMin: e.target.value })} /></div>
              <div><label style={S.label}>最高薪資</label><input style={S.input} type="number" value={jobForm.salaryMax} onChange={e => setJobForm({ ...jobForm, salaryMax: e.target.value })} /></div>
              <div><label style={S.label}>狀態</label><select style={{ ...S.select, width: '100%' }} value={jobForm.status} onChange={e => setJobForm({ ...jobForm, status: e.target.value })}>{JOB_STATUS.map(s => <option key={s}>{s}</option>)}</select></div>
            </div>
            <div style={{ marginTop: 10 }}><label style={S.label}>要求描述</label><textarea style={{ ...S.input, height: 60, resize: 'vertical' }} value={jobForm.requirements} onChange={e => setJobForm({ ...jobForm, requirements: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button style={S.btnOutline} onClick={() => setShowJobForm(false)}>取消</button>
              <button style={S.btn} onClick={handleSaveJob}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Application Form Modal ═══ */}
      {showAppForm && (
        <div style={S.overlay} onClick={() => setShowAppForm(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: '#0e7490' }}>{editApp ? '編輯申請' : '新增申請'}</h3>
            <div style={S.formGrid}>
              <div><label style={S.label}>應聘者姓名 *</label><input style={S.input} value={appForm.name} onChange={e => setAppForm({ ...appForm, name: e.target.value })} /></div>
              <div><label style={S.label}>電話</label><input style={S.input} value={appForm.phone} onChange={e => setAppForm({ ...appForm, phone: e.target.value })} /></div>
              <div><label style={S.label}>Email</label><input style={S.input} value={appForm.email} onChange={e => setAppForm({ ...appForm, email: e.target.value })} /></div>
              <div><label style={S.label}>申請職位</label>
                <select style={{ ...S.select, width: '100%' }} value={appForm.jobId} onChange={e => setAppForm({ ...appForm, jobId: e.target.value })}>
                  <option value="">-- 選擇 --</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.title} ({j.dept})</option>)}
                </select>
              </div>
              <div><label style={S.label}>學歷</label><input style={S.input} value={appForm.education} onChange={e => setAppForm({ ...appForm, education: e.target.value })} /></div>
              <div><label style={S.label}>工作經驗</label><input style={S.input} value={appForm.experience} onChange={e => setAppForm({ ...appForm, experience: e.target.value })} /></div>
              <div><label style={S.label}>狀態</label><select style={{ ...S.select, width: '100%' }} value={appForm.status} onChange={e => setAppForm({ ...appForm, status: e.target.value })}>{APP_STATUS.map(s => <option key={s}>{s}</option>)}</select></div>
              <div><label style={S.label}>申請日期</label><input type="date" style={S.input} value={appForm.date} onChange={e => setAppForm({ ...appForm, date: e.target.value })} /></div>
            </div>
            <div style={{ marginTop: 10 }}><label style={S.label}>備註</label><textarea style={{ ...S.input, height: 50, resize: 'vertical' }} value={appForm.notes} onChange={e => setAppForm({ ...appForm, notes: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button style={S.btnOutline} onClick={() => setShowAppForm(false)}>取消</button>
              <button style={S.btn} onClick={handleSaveApp}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Application Detail Modal ═══ */}
      {detailApp && (
        <div style={S.overlay} onClick={() => setDetailApp(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', color: '#0e7490' }}>應聘詳情 - {detailApp.name}</h3>
            <div style={S.formGrid}>
              <div><span style={S.label}>電話</span><div>{detailApp.phone || '-'}</div></div>
              <div><span style={S.label}>Email</span><div>{detailApp.email || '-'}</div></div>
              <div><span style={S.label}>申請職位</span><div>{jobMap[detailApp.jobId]?.title || '-'}</div></div>
              <div><span style={S.label}>學歷</span><div>{detailApp.education || '-'}</div></div>
              <div><span style={S.label}>工作經驗</span><div>{detailApp.experience || '-'}</div></div>
              <div><span style={S.label}>申請日期</span><div>{detailApp.date}</div></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <span style={S.label}>目前狀態</span>
              <span style={S.badge(STATUS_COLOR[detailApp.status])}>{detailApp.status}</span>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#64748b', lineHeight: '30px' }}>更新狀態：</span>
              {APP_STATUS.filter(s => s !== detailApp.status).map(s => (
                <button key={s} style={{ ...S.btnOutline, padding: '4px 12px', fontSize: 12 }} onClick={() => updateAppStatus(detailApp.id, s)}>{s}</button>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={S.label}>面試備註</label>
              <textarea style={{ ...S.input, height: 70, resize: 'vertical' }} value={detailApp.notes || ''} onChange={e => { saveNotes(detailApp.id, e.target.value); }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={S.btn} onClick={() => setDetailApp(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
