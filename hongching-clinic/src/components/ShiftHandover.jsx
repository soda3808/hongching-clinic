import { useState, useMemo } from 'react';
import { getClinicName } from '../tenant';
import { getStoreNames, getDoctors } from '../data';

const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
const ACCENT = '#0e7490';
const LS_KEY = 'hcmc_handovers';
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const save = (arr) => localStorage.setItem(LS_KEY, JSON.stringify(arr));
const SHIFTS = [{ v: 'morning', l: '早班' }, { v: 'afternoon', l: '午班' }, { v: 'evening', l: '晚班' }];
const shiftLabel = (v) => SHIFTS.find(s => s.v === v)?.l || v;
const CHECKLIST_ITEMS = ['現金核對', '藥材補充', '設備狀態', '清潔消毒', '預約確認', '急診事項'];

const S = {
  page: { padding: 16, maxWidth: 960, margin: '0 auto' },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 12, color: ACCENT },
  tabs: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  tab: (a) => ({ padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: a ? ACCENT : '#e5e7eb', color: a ? '#fff' : '#333' }),
  card: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0002', padding: 16, marginBottom: 16 },
  row: { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: 600, color: '#374151', minWidth: 80 },
  inp: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, flex: 1, minWidth: 120 },
  sel: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 },
  ta: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: '100%', minHeight: 60, resize: 'vertical', boxSizing: 'border-box' },
  btn: { padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: ACCENT, color: '#fff' },
  btnDanger: { padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#dc2626', color: '#fff' },
  btnOutline: { padding: '7px 16px', borderRadius: 6, border: `1px solid ${ACCENT}`, cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#fff', color: ACCENT },
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '8px 6px', borderBottom: '2px solid #e5e7eb', color: ACCENT, fontWeight: 600 },
  td: { padding: '7px 6px', borderBottom: '1px solid #f3f4f6' },
  badge: (c) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#fff', background: c }),
  alert: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 16, color: '#991b1b', fontSize: 13, fontWeight: 600 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 6 },
  sub: { fontSize: 15, fontWeight: 600, color: '#1f2937', marginBottom: 8, marginTop: 12 },
};

const emptyForm = () => ({
  date: new Date().toISOString().substring(0, 10),
  shift: 'morning', outgoingStaff: '', incomingStaff: '', patientCount: '',
  pendingTasks: '', urgentMatters: '', cashBalance: '', inventoryNotes: '',
  equipmentIssues: '', generalNotes: '', checklist: {},
});

export default function ShiftHandover({ data, showToast, user }) {
  const [records, setRecords] = useState(load);
  const [tab, setTab] = useState('create');
  const [form, setForm] = useState(emptyForm);
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo] = useState('');
  const [fShift, setFShift] = useState('');
  const [ackComment, setAckComment] = useState('');
  const [ackTarget, setAckTarget] = useState(null);

  const STORES = getStoreNames();
  const STAFF = useMemo(() => {
    const all = [...getDoctors(), ...(data?.employees || []).map(e => e.name).filter(Boolean)];
    return [...new Set(all)];
  }, [data]);

  const unacked = useMemo(() => records.filter(r => !r.acknowledged), [records]);

  const filtered = useMemo(() => {
    let list = [...records].sort((a, b) => b.createdAt - a.createdAt);
    if (fDateFrom) list = list.filter(r => r.date >= fDateFrom);
    if (fDateTo) list = list.filter(r => r.date <= fDateTo);
    if (fShift) list = list.filter(r => r.shift === fShift);
    return list;
  }, [records, fDateFrom, fDateTo, fShift]);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleCheck = (item) => setForm(f => ({ ...f, checklist: { ...f.checklist, [item]: !f.checklist[item] } }));

  const handleSubmit = () => {
    if (!form.outgoingStaff || !form.incomingStaff) { showToast('請填寫交班及接班人員'); return; }
    const rec = { ...form, id: uid(), createdAt: Date.now(), createdBy: user?.name || form.outgoingStaff, acknowledged: false, ackBy: '', ackAt: null, ackComment: '' };
    const next = [rec, ...records];
    setRecords(next); save(next);
    setForm(emptyForm());
    showToast('交更記錄已建立');
    setTab('history');
  };

  const handleAck = (id) => {
    const next = records.map(r => r.id === id ? { ...r, acknowledged: true, ackBy: user?.name || '接班人員', ackAt: Date.now(), ackComment } : r);
    setRecords(next); save(next);
    setAckTarget(null); setAckComment('');
    showToast('已確認接收交更');
  };

  const handleDelete = (id) => {
    if (!window.confirm('確定刪除此交更記錄？')) return;
    const next = records.filter(r => r.id !== id);
    setRecords(next); save(next);
    showToast('已刪除');
  };

  const handlePrint = (rec) => {
    const clinic = getClinicName();
    const checkHtml = CHECKLIST_ITEMS.map(c => `<tr><td style="padding:4px 8px;border:1px solid #ddd">${c}</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:center">${rec.checklist?.[c] ? '&#10003;' : '&#10007;'}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>交更報告</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;max-width:700px;margin:0 auto}h2{color:${ACCENT};margin-bottom:4px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{padding:6px 8px;border:1px solid #ddd;text-align:left;font-size:13px}th{background:#f0fdfa;color:${ACCENT}}.section{margin-top:16px;font-weight:700;font-size:14px;color:#1f2937;border-bottom:2px solid ${ACCENT};padding-bottom:4px}.footer{margin-top:30px;font-size:11px;color:#888;text-align:center}@media print{body{padding:0}}</style>
    </head><body>
      <h2>${clinic} - 交更報告</h2>
      <p style="color:#666;font-size:13px">日期：${rec.date} ｜ 班次：${shiftLabel(rec.shift)}</p>
      <table><tr><th>交班人員</th><td>${rec.outgoingStaff}</td><th>接班人員</th><td>${rec.incomingStaff}</td></tr>
      <tr><th>當日診症人數</th><td>${rec.patientCount || '-'}</td><th>現金結餘</th><td>${rec.cashBalance ? '$' + rec.cashBalance : '-'}</td></tr></table>
      <div class="section">交更核對清單</div>
      <table><tr><th>項目</th><th style="width:60px">狀態</th></tr>${checkHtml}</table>
      ${rec.pendingTasks ? `<div class="section">待辦事項</div><p style="font-size:13px;white-space:pre-wrap">${rec.pendingTasks}</p>` : ''}
      ${rec.urgentMatters ? `<div class="section">緊急事項</div><p style="font-size:13px;white-space:pre-wrap;color:#dc2626">${rec.urgentMatters}</p>` : ''}
      ${rec.inventoryNotes ? `<div class="section">藥材/庫存備註</div><p style="font-size:13px;white-space:pre-wrap">${rec.inventoryNotes}</p>` : ''}
      ${rec.equipmentIssues ? `<div class="section">設備問題</div><p style="font-size:13px;white-space:pre-wrap">${rec.equipmentIssues}</p>` : ''}
      ${rec.generalNotes ? `<div class="section">一般備註</div><p style="font-size:13px;white-space:pre-wrap">${rec.generalNotes}</p>` : ''}
      <div class="section">確認狀態</div>
      <p style="font-size:13px">${rec.acknowledged ? `已確認 - ${rec.ackBy}（${new Date(rec.ackAt).toLocaleString('zh-HK')}）` : '尚未確認'}</p>
      ${rec.ackComment ? `<p style="font-size:13px">接班備註：${rec.ackComment}</p>` : ''}
      <div class="footer">列印時間：${new Date().toLocaleString('zh-HK')} ｜ ${clinic}</div>
    </body></html>`;
    const w = window.open('', '_blank', 'width=800,height=600');
    w.document.write(html); w.document.close(); w.print();
  };

  return (
    <div style={S.page}>
      <h2 style={S.title}>交更管理</h2>

      {unacked.length > 0 && (
        <div style={S.alert}>
          &#9888; 有 {unacked.length} 筆交更記錄尚未確認接收！
          <button style={{ ...S.btnOutline, marginLeft: 10, fontSize: 12, padding: '4px 12px' }} onClick={() => setTab('history')}>查看</button>
        </div>
      )}

      <div style={S.tabs}>
        {[['create', '建立交更'], ['history', '交更記錄']].map(([k, l]) => (
          <button key={k} style={S.tab(tab === k)} onClick={() => setTab(k)}>{l}{k === 'history' && unacked.length > 0 ? ` (${unacked.length})` : ''}</button>
        ))}
      </div>

      {tab === 'create' && (
        <div style={S.card}>
          <div style={S.sub}>交更資料</div>
          <div style={S.row}>
            <span style={S.label}>日期</span>
            <input type="date" style={S.inp} value={form.date} onChange={e => upd('date', e.target.value)} />
            <span style={S.label}>班次</span>
            <select style={S.sel} value={form.shift} onChange={e => upd('shift', e.target.value)}>
              {SHIFTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </div>
          <div style={S.row}>
            <span style={S.label}>交班人員</span>
            <select style={{ ...S.sel, flex: 1 }} value={form.outgoingStaff} onChange={e => upd('outgoingStaff', e.target.value)}>
              <option value="">請選擇</option>
              {STAFF.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span style={S.label}>接班人員</span>
            <select style={{ ...S.sel, flex: 1 }} value={form.incomingStaff} onChange={e => upd('incomingStaff', e.target.value)}>
              <option value="">請選擇</option>
              {STAFF.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={S.row}>
            <span style={S.label}>診症人數</span>
            <input type="number" style={{ ...S.inp, maxWidth: 120 }} value={form.patientCount} onChange={e => upd('patientCount', e.target.value)} placeholder="0" />
            <span style={S.label}>現金結餘</span>
            <input type="number" style={{ ...S.inp, maxWidth: 140 }} value={form.cashBalance} onChange={e => upd('cashBalance', e.target.value)} placeholder="$0" />
          </div>

          <div style={S.sub}>交更核對清單</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            {CHECKLIST_ITEMS.map(item => (
              <label key={item} style={{ ...S.check, minWidth: 140 }}>
                <input type="checkbox" checked={!!form.checklist[item]} onChange={() => toggleCheck(item)} />
                {item}
              </label>
            ))}
          </div>

          <div style={S.sub}>詳細內容</div>
          <div style={{ marginBottom: 10 }}>
            <span style={S.label}>待辦事項</span>
            <textarea style={S.ta} value={form.pendingTasks} onChange={e => upd('pendingTasks', e.target.value)} placeholder="需要接班人員跟進的事項..." />
          </div>
          <div style={{ marginBottom: 10 }}>
            <span style={{ ...S.label, color: '#dc2626' }}>緊急事項</span>
            <textarea style={{ ...S.ta, borderColor: '#fecaca' }} value={form.urgentMatters} onChange={e => upd('urgentMatters', e.target.value)} placeholder="需要立即處理的緊急事項..." />
          </div>
          <div style={{ marginBottom: 10 }}>
            <span style={S.label}>藥材/庫存備註</span>
            <textarea style={S.ta} value={form.inventoryNotes} onChange={e => upd('inventoryNotes', e.target.value)} placeholder="藥材庫存變動、需補充項目..." />
          </div>
          <div style={{ marginBottom: 10 }}>
            <span style={S.label}>設備問題</span>
            <textarea style={S.ta} value={form.equipmentIssues} onChange={e => upd('equipmentIssues', e.target.value)} placeholder="設備異常或故障情況..." />
          </div>
          <div style={{ marginBottom: 10 }}>
            <span style={S.label}>一般備註</span>
            <textarea style={S.ta} value={form.generalNotes} onChange={e => upd('generalNotes', e.target.value)} placeholder="其他需要交代的事項..." />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={S.btn} onClick={handleSubmit}>提交交更記錄</button>
            <button style={S.btnOutline} onClick={() => setForm(emptyForm())}>重置</button>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div>
          <div style={{ ...S.card, paddingBottom: 12 }}>
            <div style={S.row}>
              <span style={S.label}>從</span>
              <input type="date" style={S.inp} value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} />
              <span style={S.label}>至</span>
              <input type="date" style={S.inp} value={fDateTo} onChange={e => setFDateTo(e.target.value)} />
              <span style={S.label}>班次</span>
              <select style={S.sel} value={fShift} onChange={e => setFShift(e.target.value)}>
                <option value="">全部</option>
                {SHIFTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>共 {filtered.length} 筆記錄</div>
          </div>

          {filtered.length === 0 && <div style={{ ...S.card, textAlign: 'center', color: '#9ca3af' }}>暫無交更記錄</div>}

          {filtered.map(rec => (
            <div key={rec.id} style={{ ...S.card, borderLeft: rec.acknowledged ? `4px solid #16a34a` : `4px solid #f59e0b` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <div>
                  <strong>{rec.date}</strong>
                  <span style={S.badge(ACCENT)}>{shiftLabel(rec.shift)}</span>
                  <span style={{ marginLeft: 8, fontSize: 13, color: '#6b7280' }}>{rec.outgoingStaff} → {rec.incomingStaff}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {rec.acknowledged
                    ? <span style={S.badge('#16a34a')}>已確認</span>
                    : <span style={S.badge('#f59e0b')}>待確認</span>}
                  <button style={{ ...S.btnOutline, padding: '4px 10px', fontSize: 12 }} onClick={() => handlePrint(rec)}>列印</button>
                  <button style={{ ...S.btnDanger, padding: '4px 10px', fontSize: 12 }} onClick={() => handleDelete(rec.id)}>刪除</button>
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap', color: '#374151' }}>
                <span>診症人數：<strong>{rec.patientCount || '-'}</strong></span>
                <span>現金結餘：<strong>{rec.cashBalance ? `$${rec.cashBalance}` : '-'}</strong></span>
              </div>

              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CHECKLIST_ITEMS.map(c => (
                  <span key={c} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: rec.checklist?.[c] ? '#dcfce7' : '#fee2e2', color: rec.checklist?.[c] ? '#166534' : '#991b1b' }}>
                    {rec.checklist?.[c] ? '\u2713' : '\u2717'} {c}
                  </span>
                ))}
              </div>

              {rec.urgentMatters && <div style={{ marginTop: 8, padding: 8, background: '#fef2f2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}><strong>緊急事項：</strong>{rec.urgentMatters}</div>}
              {rec.pendingTasks && <div style={{ marginTop: 6, fontSize: 13, color: '#374151' }}><strong>待辦：</strong>{rec.pendingTasks}</div>}
              {rec.inventoryNotes && <div style={{ marginTop: 4, fontSize: 13, color: '#374151' }}><strong>庫存：</strong>{rec.inventoryNotes}</div>}
              {rec.equipmentIssues && <div style={{ marginTop: 4, fontSize: 13, color: '#374151' }}><strong>設備：</strong>{rec.equipmentIssues}</div>}
              {rec.generalNotes && <div style={{ marginTop: 4, fontSize: 13, color: '#374151' }}><strong>備註：</strong>{rec.generalNotes}</div>}

              {rec.acknowledged && (
                <div style={{ marginTop: 8, padding: 8, background: '#f0fdf4', borderRadius: 6, fontSize: 12, color: '#166534' }}>
                  <strong>{rec.ackBy}</strong> 已於 {new Date(rec.ackAt).toLocaleString('zh-HK')} 確認接收
                  {rec.ackComment && <div style={{ marginTop: 4 }}>接班備註：{rec.ackComment}</div>}
                </div>
              )}

              {!rec.acknowledged && (
                <div style={{ marginTop: 10, padding: 10, background: '#fffbeb', borderRadius: 6 }}>
                  {ackTarget === rec.id ? (
                    <div>
                      <textarea style={{ ...S.ta, minHeight: 40, marginBottom: 6 }} value={ackComment} onChange={e => setAckComment(e.target.value)} placeholder="接班備註（選填）..." />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={{ ...S.btn, background: '#16a34a' }} onClick={() => handleAck(rec.id)}>確認接收</button>
                        <button style={S.btnOutline} onClick={() => { setAckTarget(null); setAckComment(''); }}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <button style={{ ...S.btn, background: '#f59e0b' }} onClick={() => setAckTarget(rec.id)}>確認接收此交更</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
