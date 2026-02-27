import { useState, useMemo } from 'react';
import { uid, getEmployees } from '../data';
import { getClinicName } from '../tenant';

const CRS_KEY = 'hcmc_training_courses';
const REC_KEY = 'hcmc_training_records';
const CRT_KEY = 'hcmc_certificates';
const ACCENT = '#0e7490';
const CATS = ['臨床', '行政', '安全', '合規'];
const CAT_COLOR = { '臨床': '#0e7490', '行政': '#7c3aed', '安全': '#dc2626', '合規': '#d97706' };
const COMP_STATUS = ['已完成', '進行中', '未開始', '缺席'];
const MANDATORY = ['心肺復甦術(CPR)', '感染控制', '消防安全', '個人資料私隱'];

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const today = () => new Date().toISOString().split('T')[0];

const S = {
  page: { padding: 16, maxWidth: 960, margin: '0 auto' },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 12, color: ACCENT },
  tabs: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  tab: (a) => ({ padding: '7px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: a ? ACCENT : '#e5e7eb', color: a ? '#fff' : '#333' }),
  card: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0002', padding: 16, marginBottom: 16 },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 },
  stat: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0002', padding: 14, textAlign: 'center' },
  statN: { fontSize: 24, fontWeight: 700, color: ACCENT },
  statL: { fontSize: 12, color: '#64748b', marginTop: 2 },
  btn: { padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: ACCENT, color: '#fff' },
  btnDanger: { padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#dc2626', color: '#fff' },
  btnSm: { padding: '4px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: ACCENT, color: '#fff' },
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  select: { padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' },
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '8px 6px', background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', textAlign: 'left', fontWeight: 700, fontSize: 12, color: '#475569', whiteSpace: 'nowrap' },
  td: { padding: '8px 6px', borderBottom: '1px solid #f1f5f9', fontSize: 13 },
  badge: (c) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#fff', background: c || '#94a3b8' }),
  label: { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0005', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 540, maxHeight: '85vh', overflowY: 'auto' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  mand: { display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fef2f2', marginLeft: 4 },
};

export default function StaffTraining({ data, showToast, user }) {
  const [tab, setTab] = useState('courses');
  const [courses, setCourses] = useState(() => load(CRS_KEY, []));
  const [records, setRecords] = useState(() => load(REC_KEY, []));
  const [certs, setCerts] = useState(() => load(CRT_KEY, []));
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [filterCat, setFilterCat] = useState('');
  const [filterStaff, setFilterStaff] = useState('');

  const employees = useMemo(() => (getEmployees() || []).map(e => e.name).filter(Boolean), []);
  const emptyCourse = { title: '', category: '臨床', instructor: '', date: today(), duration: 1, maxCapacity: 20, location: getClinicName(), mandatory: false };
  const emptyRecord = { staffName: '', courseId: '', status: '未開始', date: today(), hours: 0, notes: '' };
  const emptyCert = { staffName: '', certName: '', issuer: '', issueDate: today(), expiryDate: '', notes: '' };
  const [form, setForm] = useState(emptyCourse);

  const saveCourses = (n) => { setCourses(n); save(CRS_KEY, n); };
  const saveRecords = (n) => { setRecords(n); save(REC_KEY, n); };
  const saveCerts = (n) => { setCerts(n); save(CRT_KEY, n); };

  const stats = useMemo(() => {
    const total = courses.length;
    const completed = records.filter(r => r.status === '已完成').length;
    const rate = records.length ? Math.round(completed / records.length * 100) : 0;
    const totalHrs = records.reduce((s, r) => s + (Number(r.hours) || 0), 0);
    const upcoming = courses.filter(c => c.date >= today()).length;
    return { total, rate, totalHrs, upcoming };
  }, [courses, records]);

  const filteredCourses = useMemo(() => {
    let r = courses;
    if (filterCat) r = r.filter(c => c.category === filterCat);
    return r.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [courses, filterCat]);

  const filteredRecords = useMemo(() => {
    let r = records;
    if (filterStaff) r = r.filter(rc => rc.staffName === filterStaff);
    return r.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [records, filterStaff]);

  const openCourseForm = (c) => { setEditItem(c || null); setForm(c ? { ...c } : emptyCourse); setShowForm('course'); };
  const openRecordForm = (r) => { setEditItem(r || null); setForm(r ? { ...r } : emptyRecord); setShowForm('record'); };
  const openCertForm = (c) => { setEditItem(c || null); setForm(c ? { ...c } : emptyCert); setShowForm('cert'); };

  const handleSaveCourse = () => {
    if (!form.title) return showToast?.('請填寫課程名稱');
    if (editItem) saveCourses(courses.map(c => c.id === editItem.id ? { ...editItem, ...form } : c));
    else saveCourses([...courses, { ...form, id: uid() }]);
    setShowForm(false); showToast?.('已儲存課程');
  };

  const handleSaveRecord = () => {
    if (!form.staffName || !form.courseId) return showToast?.('請選擇員工和課程');
    const course = courses.find(c => c.id === form.courseId);
    const rec = { ...form, hours: Number(course?.duration || form.hours) || 0 };
    if (editItem) saveRecords(records.map(r => r.id === editItem.id ? { ...editItem, ...rec } : r));
    else saveRecords([...records, { ...rec, id: uid() }]);
    setShowForm(false); showToast?.('已儲存培訓記錄');
  };

  const handleSaveCert = () => {
    if (!form.staffName || !form.certName) return showToast?.('請填寫員工和證書名稱');
    if (editItem) saveCerts(certs.map(c => c.id === editItem.id ? { ...editItem, ...form } : c));
    else saveCerts([...certs, { ...form, id: uid() }]);
    setShowForm(false); showToast?.('已儲存證書');
  };

  const delCourse = (id) => saveCourses(courses.filter(c => c.id !== id));
  const delRecord = (id) => saveRecords(records.filter(r => r.id !== id));
  const delCert = (id) => saveCerts(certs.filter(c => c.id !== id));

  const enrollStaff = (courseId) => {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;
    const enrolled = records.filter(r => r.courseId === courseId).length;
    if (enrolled >= (course.maxCapacity || 999)) return showToast?.('課程已滿');
    const staffName = user?.name || employees[0] || '';
    if (!staffName) return showToast?.('未找到員工');
    if (records.some(r => r.courseId === courseId && r.staffName === staffName)) return showToast?.('已報名此課程');
    saveRecords([...records, { id: uid(), staffName, courseId, status: '未開始', date: today(), hours: Number(course.duration) || 0, notes: '' }]);
    showToast?.('報名成功');
  };

  const printCert = (cert) => {
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>培訓證書</title></head><body style="font-family:'Microsoft YaHei',sans-serif;padding:60px;text-align:center">
      <div style="border:3px double ${ACCENT};padding:50px;max-width:600px;margin:0 auto">
        <h2 style="color:${ACCENT};margin-bottom:6px">${getClinicName()}</h2>
        <h1 style="font-size:28px;margin:20px 0">培訓完成證書</h1>
        <p style="font-size:18px;margin:30px 0">茲證明 <strong style="font-size:22px;color:${ACCENT}">${cert.staffName}</strong></p>
        <p style="font-size:16px">已完成以下培訓課程：</p>
        <p style="font-size:20px;font-weight:700;margin:16px 0">${cert.certName}</p>
        <p>頒發機構：${cert.issuer || getClinicName()}</p>
        <p>頒發日期：${cert.issueDate || '-'}</p>
        ${cert.expiryDate ? `<p>有效期至：${cert.expiryDate}</p>` : ''}
        <div style="margin-top:50px;display:flex;justify-content:space-around">
          <div><div style="border-top:1px solid #333;width:160px;margin-bottom:4px"></div><span style="font-size:12px">負責人簽署</span></div>
          <div><div style="border-top:1px solid #333;width:160px;margin-bottom:4px"></div><span style="font-size:12px">機構蓋章</span></div>
        </div>
      </div>
      <script>setTimeout(()=>{window.print();},300)<\/script></body></html>`);
    w.document.close();
  };

  const TABS = [['courses', '培訓課程'], ['records', '培訓記錄'], ['certs', '證書管理'], ['required', '必修培訓']];

  return (
    <div style={S.page}>
      <h2 style={S.title}>員工培訓管理</h2>

      {/* Stats */}
      <div style={S.stats}>
        {[['總課程', stats.total], ['完成率', stats.rate + '%'], ['培訓總時數', stats.totalHrs + 'h'], ['即將開課', stats.upcoming]].map(([l, v]) => (
          <div key={l} style={S.stat}><div style={S.statN}>{v}</div><div style={S.statL}>{l}</div></div>
        ))}
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {TABS.map(([k, l]) => <button key={k} style={S.tab(tab === k)} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {/* Courses */}
      {tab === 'courses' && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <select style={S.select} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">全部分類</option>
              {CATS.map(c => <option key={c}>{c}</option>)}
            </select>
            <button style={S.btn} onClick={() => openCourseForm()}>+ 新增課程</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tbl}>
              <thead><tr>{['課程名稱', '分類', '講師', '日期', '時數', '容量', '操作'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filteredCourses.map(c => {
                  const enrolled = records.filter(r => r.courseId === c.id).length;
                  return (
                    <tr key={c.id}>
                      <td style={S.td}>{c.title}{c.mandatory && <span style={S.mand}>必修</span>}</td>
                      <td style={S.td}><span style={S.badge(CAT_COLOR[c.category])}>{c.category}</span></td>
                      <td style={S.td}>{c.instructor}</td>
                      <td style={S.td}>{c.date}</td>
                      <td style={S.td}>{c.duration}h</td>
                      <td style={S.td}>{enrolled}/{c.maxCapacity}</td>
                      <td style={S.td}>
                        <button style={{ ...S.btnSm, marginRight: 4 }} onClick={() => enrollStaff(c.id)}>報名</button>
                        <button style={{ ...S.btnSm, background: '#64748b', marginRight: 4 }} onClick={() => openCourseForm(c)}>編輯</button>
                        <button style={{ ...S.btnSm, background: '#dc2626' }} onClick={() => delCourse(c.id)}>刪除</button>
                      </td>
                    </tr>
                  );
                })}
                {!filteredCourses.length && <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#94a3b8' }}>暫無課程</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Records */}
      {tab === 'records' && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <select style={S.select} value={filterStaff} onChange={e => setFilterStaff(e.target.value)}>
              <option value="">全部員工</option>
              {employees.map(e => <option key={e}>{e}</option>)}
            </select>
            <button style={S.btn} onClick={() => openRecordForm()}>+ 新增記錄</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tbl}>
              <thead><tr>{['員工', '課程', '狀態', '日期', '時數', '操作'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {filteredRecords.map(r => {
                  const course = courses.find(c => c.id === r.courseId);
                  const sc = { '已完成': '#16a34a', '進行中': '#0e7490', '未開始': '#94a3b8', '缺席': '#dc2626' };
                  return (
                    <tr key={r.id}>
                      <td style={S.td}>{r.staffName}</td>
                      <td style={S.td}>{course?.title || '-'}</td>
                      <td style={S.td}><span style={S.badge(sc[r.status])}>{r.status}</span></td>
                      <td style={S.td}>{r.date}</td>
                      <td style={S.td}>{r.hours}h</td>
                      <td style={S.td}>
                        <button style={{ ...S.btnSm, background: '#64748b', marginRight: 4 }} onClick={() => openRecordForm(r)}>編輯</button>
                        <button style={{ ...S.btnSm, background: '#dc2626' }} onClick={() => delRecord(r.id)}>刪除</button>
                      </td>
                    </tr>
                  );
                })}
                {!filteredRecords.length && <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#94a3b8' }}>暫無記錄</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Certificates */}
      {tab === 'certs' && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button style={S.btn} onClick={() => openCertForm()}>+ 新增證書</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.tbl}>
              <thead><tr>{['員工', '證書名稱', '頒發機構', '頒發日期', '到期日', '操作'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {certs.map(c => {
                  const expired = c.expiryDate && c.expiryDate < today();
                  return (
                    <tr key={c.id}>
                      <td style={S.td}>{c.staffName}</td>
                      <td style={S.td}>{c.certName}</td>
                      <td style={S.td}>{c.issuer}</td>
                      <td style={S.td}>{c.issueDate}</td>
                      <td style={S.td}>{c.expiryDate || '-'}{expired && <span style={{ ...S.mand, marginLeft: 6 }}>已過期</span>}</td>
                      <td style={S.td}>
                        <button style={{ ...S.btnSm, marginRight: 4 }} onClick={() => printCert(c)}>列印</button>
                        <button style={{ ...S.btnSm, background: '#64748b', marginRight: 4 }} onClick={() => openCertForm(c)}>編輯</button>
                        <button style={{ ...S.btnSm, background: '#dc2626' }} onClick={() => delCert(c.id)}>刪除</button>
                      </td>
                    </tr>
                  );
                })}
                {!certs.length && <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#94a3b8' }}>暫無證書</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Required / Mandatory */}
      {tab === 'required' && (
        <div style={S.card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: '#475569' }}>必修培訓一覽</h3>
          <table style={S.tbl}>
            <thead><tr>{['必修項目', '已設課程', '完成人數', '狀態'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {MANDATORY.map(m => {
                const mc = courses.find(c => c.title === m && c.mandatory);
                const done = mc ? records.filter(r => r.courseId === mc.id && r.status === '已完成').length : 0;
                return (
                  <tr key={m}>
                    <td style={S.td}><strong>{m}</strong></td>
                    <td style={S.td}>{mc ? <span style={S.badge('#16a34a')}>已設立</span> : <span style={S.badge('#dc2626')}>未設立</span>}</td>
                    <td style={S.td}>{done}/{employees.length}</td>
                    <td style={S.td}>{done >= employees.length && employees.length > 0 ? <span style={S.badge('#16a34a')}>全員完成</span> : <span style={S.badge('#f59e0b')}>未完成</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>提示：在「培訓課程」中新增課程時勾選「必修」即可與此頁關聯。</p>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div style={S.overlay} onClick={() => setShowForm(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: ACCENT }}>
              {showForm === 'course' ? (editItem ? '編輯課程' : '新增課程') : showForm === 'record' ? (editItem ? '編輯記錄' : '新增培訓記錄') : (editItem ? '編輯證書' : '新增證書')}
            </h3>

            {showForm === 'course' && (
              <div style={S.formGrid}>
                <div style={{ gridColumn: '1/-1' }}><label style={S.label}>課程名稱</label><input style={S.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
                <div><label style={S.label}>分類</label><select style={{ ...S.select, width: '100%' }} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
                <div><label style={S.label}>講師</label><input style={S.input} value={form.instructor} onChange={e => setForm({ ...form, instructor: e.target.value })} /></div>
                <div><label style={S.label}>日期</label><input type="date" style={S.input} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <div><label style={S.label}>時數(小時)</label><input type="number" style={S.input} value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} /></div>
                <div><label style={S.label}>最大容量</label><input type="number" style={S.input} value={form.maxCapacity} onChange={e => setForm({ ...form, maxCapacity: e.target.value })} /></div>
                <div><label style={S.label}>地點</label><input style={S.input} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
                <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={!!form.mandatory} onChange={e => setForm({ ...form, mandatory: e.target.checked })} id="mand-chk" />
                  <label htmlFor="mand-chk" style={{ fontSize: 13, fontWeight: 600 }}>必修課程</label>
                </div>
              </div>
            )}

            {showForm === 'record' && (
              <div style={S.formGrid}>
                <div><label style={S.label}>員工</label><select style={{ ...S.select, width: '100%' }} value={form.staffName} onChange={e => setForm({ ...form, staffName: e.target.value })}><option value="">選擇員工</option>{employees.map(e => <option key={e}>{e}</option>)}</select></div>
                <div><label style={S.label}>課程</label><select style={{ ...S.select, width: '100%' }} value={form.courseId} onChange={e => setForm({ ...form, courseId: e.target.value })}><option value="">選擇課程</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
                <div><label style={S.label}>狀態</label><select style={{ ...S.select, width: '100%' }} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{COMP_STATUS.map(s => <option key={s}>{s}</option>)}</select></div>
                <div><label style={S.label}>日期</label><input type="date" style={S.input} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <div style={{ gridColumn: '1/-1' }}><label style={S.label}>備註</label><input style={S.input} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
            )}

            {showForm === 'cert' && (
              <div style={S.formGrid}>
                <div><label style={S.label}>員工</label><select style={{ ...S.select, width: '100%' }} value={form.staffName} onChange={e => setForm({ ...form, staffName: e.target.value })}><option value="">選擇員工</option>{employees.map(e => <option key={e}>{e}</option>)}</select></div>
                <div><label style={S.label}>證書名稱</label><input style={S.input} value={form.certName} onChange={e => setForm({ ...form, certName: e.target.value })} /></div>
                <div><label style={S.label}>頒發機構</label><input style={S.input} value={form.issuer} onChange={e => setForm({ ...form, issuer: e.target.value })} /></div>
                <div><label style={S.label}>頒發日期</label><input type="date" style={S.input} value={form.issueDate} onChange={e => setForm({ ...form, issueDate: e.target.value })} /></div>
                <div><label style={S.label}>到期日</label><input type="date" style={S.input} value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} /></div>
                <div style={{ gridColumn: '1/-1' }}><label style={S.label}>備註</label><input style={S.input} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button style={{ ...S.btn, background: '#94a3b8' }} onClick={() => setShowForm(false)}>取消</button>
              <button style={S.btn} onClick={showForm === 'course' ? handleSaveCourse : showForm === 'record' ? handleSaveRecord : handleSaveCert}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
