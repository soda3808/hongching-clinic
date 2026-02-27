import { useState, useMemo } from 'react';
import { uid, TCM_HERBS_DB, TCM_FORMULAS_DB } from '../data';

const STORAGE_KEY = 'hcmc_custom_formulas';
const FAV_HERBS_KEY = 'hcmc_fav_herbs';

function loadFormulas() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function saveFormulas(arr) { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }
function loadFavHerbs() { try { return JSON.parse(localStorage.getItem(FAV_HERBS_KEY) || '[]'); } catch { return []; } }
function saveFavHerbs(arr) { localStorage.setItem(FAV_HERBS_KEY, JSON.stringify(arr)); }

export default function MyFormulas({ showToast, user }) {
  const [tab, setTab] = useState('formulas'); // formulas | herbs | library
  const [formulas, setFormulas] = useState(loadFormulas);
  const [favHerbs, setFavHerbs] = useState(loadFavHerbs);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', indication: '', herbs: [{ herb: '', dosage: '' }], instructions: '每日一劑，水煎服', days: 3, notes: '' });
  const [herbSearch, setHerbSearch] = useState('');

  // Filtered formulas
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (tab === 'formulas') return formulas.filter(f => !q || f.name?.toLowerCase().includes(q) || f.indication?.toLowerCase().includes(q));
    if (tab === 'library') return TCM_FORMULAS_DB.filter(f => !q || f.name?.includes(q) || f.src?.includes(q));
    return [];
  }, [formulas, search, tab]);

  // Filtered herb search
  const herbResults = useMemo(() => {
    if (!herbSearch) return TCM_HERBS_DB.slice(0, 50);
    const q = herbSearch.toLowerCase();
    return TCM_HERBS_DB.filter(h => h.name?.includes(q) || h.pinyin?.toLowerCase().includes(q) || h.category?.includes(q)).slice(0, 50);
  }, [herbSearch]);

  const handleSaveFormula = () => {
    if (!form.name) return showToast('請輸入處方名稱');
    const herbs = form.herbs.filter(h => h.herb);
    if (!herbs.length) return showToast('請至少加入一味藥材');
    const entry = { id: editId || uid(), name: form.name, indication: form.indication, herbs, instructions: form.instructions, days: form.days, notes: form.notes, doctor: user?.name || '', createdAt: editId ? formulas.find(f => f.id === editId)?.createdAt : new Date().toISOString().substring(0, 10), updatedAt: new Date().toISOString().substring(0, 10) };
    const updated = editId ? formulas.map(f => f.id === editId ? entry : f) : [...formulas, entry];
    setFormulas(updated);
    saveFormulas(updated);
    showToast(editId ? '已更新處方' : '已儲存新處方');
    setShowAdd(false); setEditId(null);
    setForm({ name: '', indication: '', herbs: [{ herb: '', dosage: '' }], instructions: '每日一劑，水煎服', days: 3, notes: '' });
  };

  const handleDeleteFormula = (id) => {
    const updated = formulas.filter(f => f.id !== id);
    setFormulas(updated);
    saveFormulas(updated);
    showToast('已刪除處方');
  };

  const handleEditFormula = (f) => {
    setForm({ name: f.name, indication: f.indication || '', herbs: f.herbs.length ? f.herbs : [{ herb: '', dosage: '' }], instructions: f.instructions || '每日一劑，水煎服', days: f.days || 3, notes: f.notes || '' });
    setEditId(f.id);
    setShowAdd(true);
  };

  const handleCopyFromLibrary = (libFormula) => {
    const herbs = libFormula.herbs.map(h => ({ herb: h.h || h.herb, dosage: h.d || h.dosage || '' }));
    const entry = { id: uid(), name: libFormula.name, indication: libFormula.indication || libFormula.src || '', herbs, instructions: '每日一劑，水煎服', days: 3, notes: `來源：${libFormula.src || '方劑庫'}`, doctor: user?.name || '', createdAt: new Date().toISOString().substring(0, 10) };
    const updated = [...formulas, entry];
    setFormulas(updated);
    saveFormulas(updated);
    showToast(`已複製「${libFormula.name}」到我的處方`);
  };

  const toggleFavHerb = (herbName) => {
    const idx = favHerbs.indexOf(herbName);
    const updated = idx >= 0 ? favHerbs.filter(h => h !== herbName) : [...favHerbs, herbName];
    setFavHerbs(updated);
    saveFavHerbs(updated);
  };

  const addHerbRow = () => setForm(f => ({ ...f, herbs: [...f.herbs, { herb: '', dosage: '' }] }));
  const removeHerbRow = (i) => setForm(f => ({ ...f, herbs: f.herbs.filter((_, j) => j !== i) }));
  const updateHerb = (i, key, val) => setForm(f => ({ ...f, herbs: f.herbs.map((h, j) => j === i ? { ...h, [key]: val } : h) }));

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>💊 我的常用藥/複方</h2>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4, background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
          {[['formulas', `我的處方 (${formulas.length})`], ['herbs', `常用藥 (${favHerbs.length})`], ['library', `方劑庫 (${TCM_FORMULAS_DB.length})`]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === k ? 700 : 400, background: tab === k ? '#0e7490' : 'transparent', color: tab === k ? '#fff' : '#555' }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Search & Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={tab === 'herbs' ? herbSearch : search} onChange={e => tab === 'herbs' ? setHerbSearch(e.target.value) : setSearch(e.target.value)} placeholder={tab === 'herbs' ? '搜尋藥材（名稱/拼音/分類）...' : '搜尋處方...'} className="input" style={{ flex: 1, minWidth: 200 }} />
        {tab === 'formulas' && <button onClick={() => { setShowAdd(true); setEditId(null); setForm({ name: '', indication: '', herbs: [{ herb: '', dosage: '' }], instructions: '每日一劑，水煎服', days: 3, notes: '' }); }} className="btn btn-primary">+ 新增處方</button>}
      </div>

      {/* Tab: My Formulas */}
      {tab === 'formulas' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>尚未儲存任何自訂處方。點擊「新增處方」或從方劑庫複製。</div>}
          {filtered.map(f => (
            <div key={f.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: 15 }}>{f.name}</strong>
                {f.indication && <span style={{ fontSize: 12, color: '#666', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{f.indication}</span>}
                <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>{f.doctor} · {f.createdAt}</span>
              </div>
              <div style={{ fontSize: 13, color: '#444', marginBottom: 6 }}>
                {f.herbs.map(h => `${h.herb} ${h.dosage}`).join('、')}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
                {f.days}天 · {f.instructions}{f.notes ? ` · ${f.notes}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => handleEditFormula(f)} className="btn btn-outline" style={{ fontSize: 12 }}>編輯</button>
                <button onClick={() => { navigator.clipboard.writeText(f.herbs.map(h => `${h.herb} ${h.dosage}`).join('\n')); showToast('已複製處方'); }} className="btn btn-outline" style={{ fontSize: 12 }}>複製</button>
                <button onClick={() => handleDeleteFormula(f.id)} className="btn btn-outline" style={{ fontSize: 12, color: '#dc2626' }}>刪除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Favorite Herbs */}
      {tab === 'herbs' && (
        <div>
          {favHerbs.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ fontSize: 13, color: '#555', margin: '0 0 6px' }}>我的常用藥 ({favHerbs.length})</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {favHerbs.map(h => (
                  <span key={h} onClick={() => toggleFavHerb(h)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 16, fontSize: 13, cursor: 'pointer' }}>⭐ {h} ×</span>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 6 }}>
            {herbResults.map(h => {
              const isFav = favHerbs.includes(h.name);
              return (
                <div key={h.name} onClick={() => toggleFavHerb(h.name)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: isFav ? '#ecfdf5' : '#fff', border: `1px solid ${isFav ? '#6ee7b7' : '#e5e7eb'}`, borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                  <span style={{ fontSize: 16 }}>{isFav ? '⭐' : '☆'}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{h.name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{h.category || ''}{h.nature ? ` · ${h.nature}` : ''}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Formula Library */}
      {tab === 'library' && (
        <div style={{ display: 'grid', gap: 6 }}>
          {filtered.slice(0, 50).map(f => (
            <div key={f.name} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <strong>{f.name}</strong> <span style={{ fontSize: 11, color: '#888' }}>({f.src})</span>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{f.herbs.map(h => h.h || h.herb).join('、')}</div>
              </div>
              <button onClick={() => handleCopyFromLibrary(f)} className="btn btn-outline" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>+ 複製到我的處方</button>
            </div>
          ))}
          {filtered.length > 50 && <div style={{ textAlign: 'center', color: '#999', fontSize: 13 }}>顯示前 50 項，請搜尋縮窄結果</div>}
        </div>
      )}

      {/* Add/Edit Formula Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '95%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>{editId ? '編輯處方' : '新增自訂處方'}</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="處方名稱 *" className="input" />
              <input value={form.indication} onChange={e => setForm(f => ({ ...f, indication: e.target.value }))} placeholder="適應症（例：風寒感冒、脾虛濕困）" className="input" />
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>藥材組成：</div>
              {form.herbs.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input value={h.herb} onChange={e => updateHerb(i, 'herb', e.target.value)} placeholder="藥材名" className="input" style={{ flex: 2 }} list="herb-list" />
                  <input value={h.dosage} onChange={e => updateHerb(i, 'dosage', e.target.value)} placeholder="劑量 (如 10g)" className="input" style={{ flex: 1 }} />
                  {form.herbs.length > 1 && <button onClick={() => removeHerbRow(i)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 18 }}>×</button>}
                </div>
              ))}
              <datalist id="herb-list">{TCM_HERBS_DB.slice(0, 200).map(h => <option key={h.name} value={h.name} />)}</datalist>
              <button onClick={addHerbRow} className="btn btn-outline" style={{ fontSize: 12 }}>+ 加藥材</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="number" value={form.days} onChange={e => setForm(f => ({ ...f, days: parseInt(e.target.value) || 3 }))} className="input" style={{ width: 80 }} />
                <span style={{ lineHeight: '36px', fontSize: 13 }}>天</span>
                <input value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} placeholder="服法" className="input" style={{ flex: 1 }} />
              </div>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="備註（可選）" className="input" rows={2} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAdd(false); setEditId(null); }} className="btn btn-outline">取消</button>
              <button onClick={handleSaveFormula} className="btn btn-primary">儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
