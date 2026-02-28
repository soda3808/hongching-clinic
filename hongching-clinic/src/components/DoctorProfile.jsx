import { useState, useMemo } from 'react';
import { uid, fmtM, getDoctors } from '../data';
import { getClinicName } from '../tenant';

const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_doctor_profiles';
const SPECIALTIES = ['內科','婦科','兒科','骨傷','皮膚','針灸','推拿','腫瘤','老年','痛症'];
const TITLES = ['中醫師','註冊中醫師','主治醫師'];

const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const save = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));

const blank = () => ({
  id: uid(), name: '', title: TITLES[1], regNo: '', specialties: [],
  education: '', years: '', bio: '', hours: '10:00-20:00', stores: [], createdAt: new Date().toISOString(),
});

export default function DoctorProfile({ data, showToast, user }) {
  const [profiles, setProfiles] = useState(load);
  const [view, setView] = useState('list');
  const [selId, setSelId] = useState(null);
  const [form, setForm] = useState(blank);
  const doctors = getDoctors();
  const clinicName = getClinicName();

  const persist = (next) => { setProfiles(next); save(next); };

  const sel = profiles.find(p => p.id === selId) || null;

  /* ── Performance stats from revenue data ── */
  const perfMap = useMemo(() => {
    const map = {};
    (data.revenue || []).forEach(r => {
      const d = r.doctor || '';
      if (!map[d]) map[d] = { pts: new Set(), rev: 0, visits: 0 };
      map[d].rev += Number(r.amount) || 0;
      map[d].visits += 1;
      if (r.name) map[d].pts.add(r.name);
    });
    return map;
  }, [data.revenue]);

  /* ── List view ── */
  const openDetail = (p) => { setSelId(p.id); setView('detail'); };
  const openEdit = (p) => { setForm({ ...p }); setView('edit'); };
  const openNew = () => { setForm(blank()); setView('edit'); };

  const saveForm = () => {
    if (!form.name.trim()) { showToast('請輸入醫師姓名'); return; }
    const exists = profiles.find(p => p.id === form.id);
    const next = exists ? profiles.map(p => p.id === form.id ? { ...form } : p) : [...profiles, { ...form }];
    persist(next);
    showToast('已儲存');
    setSelId(form.id);
    setView('detail');
  };

  const delProfile = (id) => { persist(profiles.filter(p => p.id !== id)); setView('list'); showToast('已刪除'); };

  const toggleSpec = (s) => {
    setForm(f => ({ ...f, specialties: f.specialties.includes(s) ? f.specialties.filter(x => x !== s) : [...f.specialties, s] }));
  };

  /* ── Print public card ── */
  const printCard = (p) => {
    const perf = perfMap[p.name] || { pts: new Set(), rev: 0, visits: 0 };
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${p.name} - ${clinicName}</title>
<style>body{font-family:'Microsoft JhengHei',sans-serif;max-width:480px;margin:40px auto;padding:24px;border:2px solid ${ACCENT};border-radius:16px}
h1{color:${ACCENT};margin:0 0 4px}h2{margin:0;font-size:14px;color:#666}.sec{margin-top:16px}.tag{display:inline-block;background:${ACCENT}22;color:${ACCENT};padding:2px 10px;border-radius:12px;font-size:13px;margin:2px}
.stat{display:inline-block;text-align:center;padding:8px 16px}.stat b{font-size:18px;color:${ACCENT}}.bot{margin-top:20px;text-align:center;font-size:12px;color:#999}
@media print{body{border:none}}</style></head><body>
<div style="text-align:center"><div style="width:80px;height:80px;border-radius:50%;background:${ACCENT}22;margin:0 auto 12px;display:flex;align-items:center;justify-content:center">
<span style="font-size:32px;color:${ACCENT}">${p.name.charAt(0)}</span></div>
<h1>${p.name}</h1><h2>${p.title}${p.regNo ? ' | 註冊編號: ' + p.regNo : ''}</h2></div>
${p.specialties.length ? '<div class="sec"><b>專科：</b>' + p.specialties.map(s => '<span class="tag">' + s + '</span>').join('') + '</div>' : ''}
${p.education ? '<div class="sec"><b>學歷：</b>' + p.education + '</div>' : ''}
${p.years ? '<div class="sec"><b>從業年資：</b>' + p.years + ' 年</div>' : ''}
${p.bio ? '<div class="sec"><b>簡介：</b>' + p.bio + '</div>' : ''}
${p.hours ? '<div class="sec"><b>應診時間：</b>' + p.hours + '</div>' : ''}
<div class="sec" style="text-align:center;border-top:1px solid #eee;padding-top:12px">
<div class="stat">累計病人<br><b>${perf.pts.size}</b></div>
<div class="stat">診症次數<br><b>${perf.visits}</b></div></div>
<div class="bot">${clinicName}</div></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html); w.document.close(); w.print();
  };

  /* ── Shared styles ── */
  const card = { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px #0001', marginBottom: 12 };
  const btn = (bg = ACCENT) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 14 });
  const btnO = { background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 14 };
  const inp = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };

  /* ═══════════ EDIT VIEW ═══════════ */
  if (view === 'edit') return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <button style={btnO} onClick={() => setView(selId ? 'detail' : 'list')}>← 返回</button>
      <h2 style={{ color: ACCENT }}>{profiles.find(p => p.id === form.id) ? '編輯醫師檔案' : '新增醫師'}</h2>
      <div style={card}>
        <label>姓名 *</label>
        <input style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="醫師姓名" />

        <label style={{ marginTop: 12, display: 'block' }}>職稱</label>
        <select style={inp} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}>
          {TITLES.map(t => <option key={t}>{t}</option>)}
        </select>

        <label style={{ marginTop: 12, display: 'block' }}>註冊編號</label>
        <input style={inp} value={form.regNo} onChange={e => setForm({ ...form, regNo: e.target.value })} placeholder="CMPxxxxxx" />

        <label style={{ marginTop: 12, display: 'block' }}>專科（可多選）</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {SPECIALTIES.map(s => (
            <span key={s} onClick={() => toggleSpec(s)} style={{
              padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 13,
              background: form.specialties.includes(s) ? ACCENT : '#f3f4f6',
              color: form.specialties.includes(s) ? '#fff' : '#374151',
            }}>{s}</span>
          ))}
        </div>

        <label style={{ marginTop: 12, display: 'block' }}>學歷</label>
        <input style={inp} value={form.education} onChange={e => setForm({ ...form, education: e.target.value })} placeholder="例: 香港大學中醫學碩士" />

        <label style={{ marginTop: 12, display: 'block' }}>從業年資</label>
        <input style={inp} type="number" value={form.years} onChange={e => setForm({ ...form, years: e.target.value })} placeholder="年" />

        <label style={{ marginTop: 12, display: 'block' }}>個人簡介</label>
        <textarea style={{ ...inp, minHeight: 80 }} value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} placeholder="醫師介紹及擅長範疇" />

        <label style={{ marginTop: 12, display: 'block' }}>應診時間</label>
        <input style={inp} value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} placeholder="例: 10:00-20:00" />

        <label style={{ marginTop: 12, display: 'block' }}>分店</label>
        <input style={inp} value={(form.stores || []).join(', ')} onChange={e => setForm({ ...form, stores: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="以逗號分隔" />

        <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
          <button style={btn()} onClick={saveForm}>儲存</button>
          <button style={btnO} onClick={() => setView(selId ? 'detail' : 'list')}>取消</button>
        </div>
      </div>
    </div>
  );

  /* ═══════════ DETAIL VIEW ═══════════ */
  if (view === 'detail' && sel) {
    const perf = perfMap[sel.name] || { pts: new Set(), rev: 0, visits: 0 };
    const avg = perf.visits ? perf.rev / perf.visits : 0;
    return (
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <button style={btnO} onClick={() => { setSelId(null); setView('list'); }}>← 醫師列表</button>
        <div style={{ ...card, marginTop: 12, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: `${ACCENT}22`, margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 28, color: ACCENT, fontWeight: 700 }}>{sel.name.charAt(0)}</span>
          </div>
          <h2 style={{ margin: 0, color: ACCENT }}>{sel.name}</h2>
          <div style={{ color: '#666', fontSize: 14 }}>{sel.title}{sel.regNo ? ` | ${sel.regNo}` : ''}</div>
        </div>

        {sel.specialties.length > 0 && <div style={card}>
          <b>專科</b>
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sel.specialties.map(s => <span key={s} style={{ background: `${ACCENT}18`, color: ACCENT, padding: '2px 12px', borderRadius: 20, fontSize: 13 }}>{s}</span>)}
          </div>
        </div>}

        <div style={card}>
          {sel.education && <div style={{ marginBottom: 6 }}><b>學歷：</b>{sel.education}</div>}
          {sel.years && <div style={{ marginBottom: 6 }}><b>年資：</b>{sel.years} 年</div>}
          {sel.bio && <div style={{ marginBottom: 6 }}><b>簡介：</b>{sel.bio}</div>}
          {sel.hours && <div style={{ marginBottom: 6 }}><b>應診時間：</b>{sel.hours}</div>}
          {sel.stores?.length > 0 && <div><b>駐診分店：</b>{sel.stores.join('、')}</div>}
        </div>

        <div style={card}>
          <b>業績摘要</b>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 10, textAlign: 'center' }}>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: ACCENT }}>{perf.pts.size}</div><div style={{ fontSize: 12, color: '#888' }}>累計病人</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: ACCENT }}>{fmtM(perf.rev)}</div><div style={{ fontSize: 12, color: '#888' }}>總收入</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: ACCENT }}>{fmtM(avg)}</div><div style={{ fontSize: 12, color: '#888' }}>平均每次</div></div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btn()} onClick={() => openEdit(sel)}>編輯</button>
          <button style={btn('#059669')} onClick={() => printCard(sel)}>列印公開卡</button>
          <button style={btn('#dc2626')} onClick={() => delProfile(sel.id)}>刪除</button>
        </div>
      </div>
    );
  }

  /* ═══════════ LIST VIEW ═══════════ */
  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: ACCENT }}>醫師檔案</h2>
        <button style={btn()} onClick={openNew}>+ 新增醫師</button>
      </div>

      {profiles.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#999', padding: 40 }}>尚未建立醫師檔案，請點擊「新增醫師」開始。</div>}

      {profiles.map(p => {
        const perf = perfMap[p.name] || { pts: new Set(), rev: 0, visits: 0 };
        return (
          <div key={p.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }} onClick={() => openDetail(p)}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${ACCENT}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 22, color: ACCENT, fontWeight: 700 }}>{p.name.charAt(0)}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{p.name}</div>
              <div style={{ fontSize: 13, color: '#666' }}>{p.title}{p.years ? ` · ${p.years}年經驗` : ''}</div>
              {p.specialties.length > 0 && <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {p.specialties.slice(0, 4).map(s => <span key={s} style={{ background: `${ACCENT}15`, color: ACCENT, padding: '1px 8px', borderRadius: 12, fontSize: 11 }}>{s}</span>)}
                {p.specialties.length > 4 && <span style={{ fontSize: 11, color: '#999' }}>+{p.specialties.length - 4}</span>}
              </div>}
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: '#888', flexShrink: 0 }}>
              <div>{perf.pts.size} 病人</div>
              <div>{fmtM(perf.rev)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
