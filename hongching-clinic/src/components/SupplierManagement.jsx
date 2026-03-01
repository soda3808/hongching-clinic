import React, { useState, useMemo, useEffect } from 'react';
import { suppliersMgmtOps } from '../api';

const ACCENT = '#0e7490';
const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const CATS = ['中藥材', '西藥', '保健品', '耗材', '設備'];
const TERMS = ['COD', '月結30天', '月結60天'];
const LS_KEY = 'hcmc_suppliers_mgmt';

const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const save = (d) => { localStorage.setItem(LS_KEY, JSON.stringify(d)); suppliersMgmtOps.persistAll(d); };

const Stars = ({ value, onChange }) => (
  <span style={{ cursor: onChange ? 'pointer' : 'default', fontSize: 18 }}>
    {[1, 2, 3, 4, 5].map(i => (
      <span key={i} onClick={() => onChange && onChange(i)} style={{ color: i <= value ? '#f59e0b' : '#d1d5db' }}>★</span>
    ))}
  </span>
);

const avgRating = (r) => r ? +((r.quality + r.delivery + r.price) / 3).toFixed(1) : 0;

const empty = () => ({ id: '', name: '', contact: '', phone: '', email: '', address: '', terms: 'COD', category: '中藥材', notes: '', active: true, rating: { quality: 3, delivery: 3, price: 3 }, createdAt: '' });

export default function SupplierManagement({ data, showToast, user }) {
  const [suppliers, setSuppliers] = useState(load);
  useEffect(() => { suppliersMgmtOps.load().then(d => { if (d) setSuppliers(d); }); }, []);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const persist = (list) => { setSuppliers(list); save(list); };

  const filtered = useMemo(() => suppliers.filter(s => {
    if (search && !s.name.includes(search) && !s.contact.includes(search)) return false;
    if (filterCat && s.category !== filterCat) return false;
    if (filterStatus === 'active' && !s.active) return false;
    if (filterStatus === 'inactive' && s.active) return false;
    return true;
  }), [suppliers, search, filterCat, filterStatus]);

  const stats = useMemo(() => {
    const active = suppliers.filter(s => s.active).length;
    const top = suppliers.length ? suppliers.reduce((a, b) => avgRating(a.rating) >= avgRating(b.rating) ? a : b) : null;
    return { total: suppliers.length, active, top };
  }, [suppliers]);

  const openAdd = () => setEditing({ ...empty(), id: uid(), createdAt: new Date().toISOString() });
  const openEdit = (s) => setEditing({ ...s, rating: { ...s.rating } });

  const handleSave = () => {
    if (!editing.name.trim()) { showToast && showToast('請輸入供應商名稱', 'error'); return; }
    const exists = suppliers.find(s => s.id === editing.id);
    const list = exists ? suppliers.map(s => s.id === editing.id ? editing : s) : [...suppliers, editing];
    persist(list);
    setEditing(null);
    showToast && showToast(exists ? '供應商已更新' : '供應商已新增', 'success');
  };

  const handleDelete = (id) => {
    if (!window.confirm('確定刪除此供應商？')) return;
    persist(suppliers.filter(s => s.id !== id));
    if (expanded === id) setExpanded(null);
    showToast && showToast('供應商已刪除', 'success');
  };

  const toggleStatus = (id) => {
    persist(suppliers.map(s => s.id === id ? { ...s, active: !s.active } : s));
  };

  const btn = (bg, extra) => ({ border: 'none', color: '#fff', background: bg, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, ...extra });
  const input = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: '100%', boxSizing: 'border-box' };
  const card = { background: '#fff', borderRadius: 10, padding: 18, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.08)' };

  // --- Edit / Add Form ---
  if (editing) {
    const f = editing;
    const set = (k, v) => setEditing({ ...f, [k]: v });
    const setR = (k, v) => setEditing({ ...f, rating: { ...f.rating, [k]: v } });
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h3 style={{ color: ACCENT }}>{suppliers.find(s => s.id === f.id) ? '編輯供應商' : '新增供應商'}</h3>
        <div style={card}>
          {[['name', '供應商名稱 *'], ['contact', '聯絡人'], ['phone', '電話'], ['email', 'Email'], ['address', '地址']].map(([k, l]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>{l}</label>
              <input style={input} value={f[k]} onChange={e => set(k, e.target.value)} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>付款條件</label>
              <select style={input} value={f.terms} onChange={e => set('terms', e.target.value)}>
                {TERMS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>類別</label>
              <select style={input} value={f.category} onChange={e => set('category', e.target.value)}>
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>備註</label>
            <textarea style={{ ...input, minHeight: 54 }} value={f.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} /> 啟用中
          </label>
          <h4 style={{ color: ACCENT, margin: '14px 0 8px' }}>供應商評分</h4>
          {[['quality', '品質'], ['delivery', '交貨速度'], ['price', '價格競爭力']].map(([k, l]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 80, fontSize: 13 }}>{l}</span>
              <Stars value={f.rating[k]} onChange={v => setR(k, v)} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button style={btn(ACCENT)} onClick={handleSave}>儲存</button>
            <button style={btn('#6b7280')} onClick={() => setEditing(null)}>取消</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main View ---
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 style={{ color: ACCENT, margin: 0 }}>供應商管理</h2>
        <button style={btn(ACCENT, { fontSize: 14, padding: '8px 18px' })} onClick={openAdd}>＋ 新增供應商</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          ['供應商總數', stats.total],
          ['啟用中', stats.active],
          ['最高評分', stats.top ? `${stats.top.name}（${avgRating(stats.top.rating)}★）` : '-']
        ].map(([l, v], i) => (
          <div key={i} style={{ ...card, flex: '1 1 160px', textAlign: 'center', marginBottom: 0 }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{l}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: ACCENT, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <input style={{ ...input, width: 200 }} placeholder="搜尋名稱/聯絡人…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...input, width: 130 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">所有類別</option>
          {CATS.map(c => <option key={c}>{c}</option>)}
        </select>
        <select style={{ ...input, width: 120 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">全部狀態</option>
          <option value="active">啟用</option>
          <option value="inactive">停用</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: '#9ca3af', padding: 40 }}>尚無供應商資料</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
            <thead>
              <tr style={{ background: ACCENT, color: '#fff', textAlign: 'left' }}>
                {['名稱', '聯絡人', '電話', 'Email', '付款條件', '評分', '狀態', '操作'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <React.Fragment key={s.id}>
                  <tr style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: '10px 12px' }}>{s.contact}</td>
                    <td style={{ padding: '10px 12px' }}>{s.phone}</td>
                    <td style={{ padding: '10px 12px' }}>{s.email}</td>
                    <td style={{ padding: '10px 12px' }}>{s.terms}</td>
                    <td style={{ padding: '10px 12px' }}><Stars value={Math.round(avgRating(s.rating))} /> <span style={{ fontSize: 11, color: '#6b7280' }}>{avgRating(s.rating)}</span></td>
                    <td style={{ padding: '10px 12px' }}>
                      <span onClick={e => { e.stopPropagation(); toggleStatus(s.id); }} style={{ background: s.active ? '#d1fae5' : '#fee2e2', color: s.active ? '#065f46' : '#991b1b', padding: '3px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer' }}>
                        {s.active ? '啟用' : '停用'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                      <button style={btn(ACCENT, { marginRight: 6, padding: '4px 10px' })} onClick={() => openEdit(s)}>編輯</button>
                      <button style={btn('#ef4444', { padding: '4px 10px' })} onClick={() => handleDelete(s.id)}>刪除</button>
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr style={{ background: '#f9fafb' }}>
                      <td colSpan={8} style={{ padding: 16 }}>
                        <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontWeight: 600, marginBottom: 6, color: ACCENT }}>完整聯絡資訊</div>
                            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                              <div>地址：{s.address || '-'}</div>
                              <div>類別：{s.category}</div>
                              <div>建立日期：{s.createdAt ? new Date(s.createdAt).toLocaleDateString('zh-TW') : '-'}</div>
                              {s.notes && <div>備註：{s.notes}</div>}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, marginBottom: 6, color: ACCENT }}>評分明細</div>
                            {[['quality', '品質'], ['delivery', '交貨速度'], ['price', '價格競爭力']].map(([k, l]) => (
                              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 13 }}>
                                <span style={{ width: 75 }}>{l}</span>
                                <Stars value={s.rating[k]} />
                                <span style={{ color: '#6b7280' }}>{s.rating[k]}/5</span>
                              </div>
                            ))}
                            <div style={{ marginTop: 6, fontWeight: 600, fontSize: 13 }}>綜合：{avgRating(s.rating)} / 5</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, marginBottom: 6, color: ACCENT }}>採購摘要</div>
                            <div style={{ fontSize: 13, color: '#6b7280' }}>（採購記錄整合開發中）</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
