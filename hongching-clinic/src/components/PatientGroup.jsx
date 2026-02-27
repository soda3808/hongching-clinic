import { useState, useMemo } from 'react';
import { uid } from '../data';
import { getClinicName } from '../tenant';

const ACCENT = '#0e7490';
const LS_GROUPS = 'hcmc_patient_groups';
const LS_MEMBERS = 'hcmc_group_members';

const DEFAULT_GROUPS = [
  { id: 'g_chronic', name: '長期病患', color: '#e74c3c', desc: '需定期覆診的慢性病患者', rule: null },
  { id: 'g_elderly', name: '長者', color: '#8e44ad', desc: '65歲或以上長者', rule: 'age>=65' },
  { id: 'g_vip', name: 'VIP', color: '#f39c12', desc: '累計到診10次以上的忠實客戶', rule: 'visits>=10' },
  { id: 'g_new', name: '新症', color: '#27ae60', desc: '首次到診患者', rule: 'visits<=1' },
  { id: 'g_followup', name: '覆診', color: '#2980b9', desc: '有待覆診的患者', rule: null },
  { id: 'g_acu', name: '針灸療程', color: '#16a085', desc: '正進行針灸療程的患者', rule: null },
  { id: 'g_corp', name: '企業客戶', color: '#34495e', desc: '透過企業合約就診的患者', rule: null },
];

const loadJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
const saveJSON = (key, val) => localStorage.setItem(key, JSON.stringify(val));

function getAge(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / 31557600000);
}

function visitCount(patientId, consultations) {
  return consultations.filter(c => c.patientId === patientId || c.patientName === patientId).length;
}

export default function PatientGroup({ data, showToast, user }) {
  const patients = data.patients || [];
  const consultations = data.consultations || [];
  const [groups, setGroups] = useState(() => loadJSON(LS_GROUPS, DEFAULT_GROUPS));
  const [members, setMembers] = useState(() => loadJSON(LS_MEMBERS, {}));
  const [selGroup, setSelGroup] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#0e7490', desc: '', rule: '' });
  const [search, setSearch] = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [tab, setTab] = useState('groups');
  const [waMsg, setWaMsg] = useState('');

  const persist = (g, m) => { saveJSON(LS_GROUPS, g); saveJSON(LS_MEMBERS, m); };

  /* smart auto-categorisation */
  const smartMembers = useMemo(() => {
    const auto = {};
    groups.forEach(g => {
      if (!g.rule) return;
      const ids = [];
      patients.forEach(p => {
        if (g.rule === 'age>=65' && getAge(p.dob) >= 65) ids.push(p.id);
        else if (g.rule === 'visits>=10' && visitCount(p.id, consultations) >= 10) ids.push(p.id);
        else if (g.rule === 'visits<=1' && visitCount(p.id, consultations) <= 1) ids.push(p.id);
      });
      auto[g.id] = ids;
    });
    return auto;
  }, [groups, patients, consultations]);

  const getMembers = (gid) => {
    const manual = members[gid] || [];
    const auto = smartMembers[gid] || [];
    return [...new Set([...manual, ...auto])];
  };

  const groupPatients = (gid) => {
    const ids = getMembers(gid);
    return patients.filter(p => ids.includes(p.id));
  };

  const filtered = useMemo(() => {
    if (!selGroup) return [];
    const list = groupPatients(selGroup.id);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q));
  }, [selGroup, patients, members, smartMembers, search]);

  const addPatientSearch = useMemo(() => {
    if (!addSearch || !selGroup) return [];
    const existing = getMembers(selGroup.id);
    const q = addSearch.toLowerCase();
    return patients.filter(p => !existing.includes(p.id) && ((p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q))).slice(0, 8);
  }, [addSearch, selGroup, patients, members, smartMembers]);

  /* CRUD */
  const saveGroup = () => {
    if (!form.name.trim()) return showToast('請輸入組名');
    let next;
    if (editing) {
      next = groups.map(g => g.id === editing.id ? { ...g, ...form } : g);
    } else {
      next = [...groups, { id: uid(), ...form }];
    }
    setGroups(next); persist(next, members); setEditing(null); setForm({ name: '', color: '#0e7490', desc: '', rule: '' });
    showToast(editing ? '已更新分組' : '已新增分組');
  };
  const deleteGroup = (g) => {
    if (!confirm(`確定刪除「${g.name}」？`)) return;
    const next = groups.filter(x => x.id !== g.id);
    const nm = { ...members }; delete nm[g.id];
    setGroups(next); setMembers(nm); persist(next, nm);
    if (selGroup?.id === g.id) setSelGroup(null);
    showToast('已刪除');
  };
  const addMember = (pid) => {
    const nm = { ...members, [selGroup.id]: [...(members[selGroup.id] || []), pid] };
    setMembers(nm); persist(groups, nm); setAddSearch(''); showToast('已加入分組');
  };
  const removeMember = (pid) => {
    const nm = { ...members, [selGroup.id]: (members[selGroup.id] || []).filter(x => x !== pid) };
    setMembers(nm); persist(groups, nm);
  };

  /* actions */
  const sendWhatsApp = () => {
    if (!waMsg.trim()) return showToast('請輸入訊息');
    const pts = groupPatients(selGroup.id).filter(p => p.phone);
    if (!pts.length) return showToast('此分組無可發送的聯絡電話');
    pts.forEach(p => { const ph = p.phone.replace(/\D/g, ''); window.open(`https://wa.me/852${ph}?text=${encodeURIComponent(waMsg)}`, '_blank'); });
    showToast(`已開啟 ${pts.length} 個WhatsApp視窗`); setWaMsg('');
  };

  const exportCSV = () => {
    const pts = groupPatients(selGroup.id);
    const rows = [['姓名', '電話', '性別', '出生日期'].join(','), ...pts.map(p => [p.name, p.phone || '', p.gender || '', p.dob || ''].join(','))];
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${selGroup.name}_成員.csv`; a.click();
    showToast('已匯出CSV');
  };

  const printGroup = () => {
    const pts = groupPatients(selGroup.id);
    const clinic = getClinicName();
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${selGroup.name} - 成員列表</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f5f5f5}.hdr{color:${ACCENT}}</style></head><body><h2 class="hdr">${clinic} — ${selGroup.name} 成員列表</h2><p>列印日期：${new Date().toLocaleDateString('zh-HK')}　共 ${pts.length} 人</p><table><tr><th>#</th><th>姓名</th><th>電話</th><th>性別</th><th>出生日期</th></tr>${pts.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.phone || '-'}</td><td>${p.gender || '-'}</td><td>${p.dob || '-'}</td></tr>`).join('')}</table></body></html>`);
    w.document.close(); w.print();
  };

  /* styles */
  const card = { background: '#fff', borderRadius: 10, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.08)', marginBottom: 12 };
  const btn = (bg = ACCENT) => ({ background: bg, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 });
  const inp = { border: '1px solid #ddd', borderRadius: 6, padding: '7px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  const tag = (c) => ({ display: 'inline-block', background: c + '22', color: c, borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600, marginRight: 4 });

  /* stats */
  const stats = groups.map(g => ({ ...g, count: getMembers(g.id).length }));
  const totalTagged = new Set(groups.flatMap(g => getMembers(g.id))).size;

  if (tab === 'groups' && selGroup) {
    return (
      <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
        <button onClick={() => { setSelGroup(null); setSearch(''); setAddSearch(''); }} style={{ ...btn('#666'), marginBottom: 12 }}>← 返回分組列表</button>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ ...tag(selGroup.color), fontSize: 16, padding: '4px 14px' }}>{selGroup.name}</span>
            <span style={{ color: '#888', fontSize: 13 }}>{selGroup.desc}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 600, color: ACCENT }}>{filtered.length} 人</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋成員..." style={{ ...inp, width: 200 }} />
            <button onClick={exportCSV} style={btn('#27ae60')}>匯出CSV</button>
            <button onClick={printGroup} style={btn('#8e44ad')}>列印</button>
          </div>
          {/* Add patient */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="搜尋病人加入此分組..." style={inp} />
            {addPatientSearch.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: 6, zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
                {addPatientSearch.map(p => (
                  <div key={p.id} onClick={() => addMember(p.id)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                    {p.name} {p.phone && <span style={{ color: '#999' }}>({p.phone})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* WhatsApp */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input value={waMsg} onChange={e => setWaMsg(e.target.value)} placeholder="輸入WhatsApp群發訊息..." style={{ ...inp, flex: 1 }} />
            <button onClick={sendWhatsApp} style={btn('#25d366')}>WhatsApp群發</button>
          </div>
          {/* Member list */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f7f7f7' }}>{['姓名', '電話', '性別', '年齡', '操作'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #eee' }}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 10px' }}>{p.name}</td>
                  <td style={{ padding: '8px 10px' }}>{p.phone || '-'}</td>
                  <td style={{ padding: '8px 10px' }}>{p.gender || '-'}</td>
                  <td style={{ padding: '8px 10px' }}>{getAge(p.dob) ?? '-'}</td>
                  <td style={{ padding: '8px 10px' }}><button onClick={() => removeMember(p.id)} style={{ ...btn('#e74c3c'), padding: '3px 10px', fontSize: 12 }}>移除</button></td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#aaa' }}>此分組暫無成員</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: '0 auto' }}>
      <h2 style={{ color: ACCENT, marginBottom: 4 }}>病人分組管理</h2>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>建立分組、標記病人、智能分類、群發訊息</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[{ k: 'groups', l: '分組列表' }, { k: 'stats', l: '統計' }, { k: 'new', l: '新增/編輯分組' }].map(t => (
          <button key={t.k} onClick={() => { setTab(t.k); if (t.k !== 'new') setEditing(null); }} style={{ ...btn(tab === t.k ? ACCENT : '#ccc'), color: tab === t.k ? '#fff' : '#333' }}>{t.l}</button>
        ))}
      </div>

      {/* Stats Tab */}
      {tab === 'stats' && (
        <div style={card}>
          <h3 style={{ margin: '0 0 12px', color: ACCENT }}>分組統計</h3>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>已標記病人：{totalTagged} / {patients.length} ({patients.length ? Math.round(totalTagged / patients.length * 100) : 0}%)</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {stats.map(s => (
              <div key={s.id} style={{ border: `2px solid ${s.color}`, borderRadius: 10, padding: '12px 18px', minWidth: 120, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: 13, color: '#555' }}>{s.name}</div>
              </div>
            ))}
          </div>
          {/* simple bar chart */}
          <div style={{ marginTop: 20 }}>
            {stats.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 80, fontSize: 12, textAlign: 'right', color: '#555' }}>{s.name}</span>
                <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 4, height: 18 }}>
                  <div style={{ width: `${patients.length ? Math.min(s.count / patients.length * 100, 100) : 0}%`, background: s.color, height: '100%', borderRadius: 4, transition: 'width .3s' }} />
                </div>
                <span style={{ width: 30, fontSize: 12, color: '#888' }}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New / Edit Group */}
      {tab === 'new' && (
        <div style={card}>
          <h3 style={{ margin: '0 0 12px', color: ACCENT }}>{editing ? '編輯分組' : '新增分組'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><label style={{ fontSize: 12, color: '#666' }}>組名</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp} /></div>
            <div><label style={{ fontSize: 12, color: '#666' }}>顏色</label><input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} style={{ ...inp, height: 36, padding: 2 }} /></div>
          </div>
          <div style={{ marginBottom: 10 }}><label style={{ fontSize: 12, color: '#666' }}>描述</label><input value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} style={inp} /></div>
          <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, color: '#666' }}>智能規則（可選：age&gt;=65, visits&gt;=10, visits&lt;=1）</label><input value={form.rule} onChange={e => setForm({ ...form, rule: e.target.value })} placeholder="例：age>=65" style={inp} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveGroup} style={btn()}>{editing ? '更新' : '新增'}</button>
            {editing && <button onClick={() => { setEditing(null); setForm({ name: '', color: '#0e7490', desc: '', rule: '' }); }} style={btn('#999')}>取消</button>}
          </div>
        </div>
      )}

      {/* Group list */}
      {tab === 'groups' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260,1fr))', gap: 12 }}>
          {groups.map(g => {
            const cnt = getMembers(g.id).length;
            return (
              <div key={g.id} style={{ ...card, borderLeft: `4px solid ${g.color}`, cursor: 'pointer' }} onClick={() => setSelGroup(g)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{g.name}</span>
                  <span style={tag(g.color)}>{cnt} 人</span>
                </div>
                <p style={{ fontSize: 12, color: '#888', margin: '6px 0' }}>{g.desc}</p>
                {g.rule && <span style={{ fontSize: 11, color: ACCENT, background: ACCENT + '15', borderRadius: 4, padding: '1px 6px' }}>智能：{g.rule}</span>}
                <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                  <button onClick={e => { e.stopPropagation(); setEditing(g); setForm({ name: g.name, color: g.color, desc: g.desc, rule: g.rule || '' }); setTab('new'); }} style={{ ...btn('#f39c12'), padding: '3px 10px', fontSize: 12 }}>編輯</button>
                  <button onClick={e => { e.stopPropagation(); deleteGroup(g); }} style={{ ...btn('#e74c3c'), padding: '3px 10px', fontSize: 12 }}>刪除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
