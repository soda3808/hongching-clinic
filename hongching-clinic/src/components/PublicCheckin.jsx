import { useState } from 'react';
import { saveQueue } from '../api';
import { uid } from '../data';
import { getClinicName, getClinicNameEn, getTenantStoreNames, getTenantDoctors } from '../tenant';

export default function PublicCheckin() {
  const storeNames = getTenantStoreNames();
  const doctors = getTenantDoctors();
  const clinicName = getClinicName();
  const clinicNameEn = getClinicNameEn();

  const [form, setForm] = useState({ name: '', phone: '', store: storeNames[0] || '', doctor: '', symptoms: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) return;
    setSubmitting(true);
    const today = new Date().toISOString().substring(0, 10);
    const now = new Date().toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
    const record = {
      id: uid(),
      patientName: form.name,
      patientPhone: form.phone,
      store: form.store,
      doctor: form.doctor || doctors[0],
      date: today,
      time: now,
      type: '覆診',
      status: 'waiting',
      source: 'qr-checkin',
      notes: form.symptoms,
      createdAt: new Date().toISOString(),
    };
    try {
      await saveQueue(record);
      setDone(record);
    } catch {
      setDone({ error: true });
    }
    setSubmitting(false);
  };

  if (done && !done.error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: 'var(--teal-700)', marginBottom: 8 }}>登記成功！</h2>
          <p style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 16 }}>{done.patientName}，你已成功登記排隊。</p>
          <div style={{ background: 'var(--teal-50)', borderRadius: 8, padding: 12, fontSize: 13, textAlign: 'left' }}>
            <div><strong>店舖：</strong>{done.store}</div>
            <div><strong>醫師：</strong>{done.doctor}</div>
            <div><strong>時間：</strong>{done.time}</div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 16 }}>請在候診區等候叫號，謝謝！</p>
          <button onClick={() => { setDone(null); setForm({ name: '', phone: '', store: storeNames[0] || '', doctor: '', symptoms: '' }); }} style={{ marginTop: 16, padding: '10px 24px', background: 'var(--teal-600)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 420, width: '100%', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo.jpg" alt={clinicName} style={{ height: 48, marginBottom: 8 }} />
          <h2 style={{ color: 'var(--teal-700)', margin: 0 }}>自助登記</h2>
          <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: '4px 0' }}>掃碼即可排隊掛號</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>姓名 *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="請輸入姓名" required style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: 14 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>電話 *</label>
            <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="請輸入電話號碼" required style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: 14 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>店舖</label>
            <select value={form.store} onChange={e => setForm(f => ({ ...f, store: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: 14 }}>
              {storeNames.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>醫師偏好</label>
            <select value={form.doctor} onChange={e => setForm(f => ({ ...f, doctor: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: 14 }}>
              <option value="">無偏好</option>
              {doctors.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>不適症狀（選填）</label>
            <textarea value={form.symptoms} onChange={e => setForm(f => ({ ...f, symptoms: e.target.value }))} placeholder="簡述不適症狀" rows={2} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--gray-200)', borderRadius: 8, fontSize: 14 }} />
          </div>
          <button type="submit" disabled={submitting} style={{ width: '100%', padding: '12px', background: 'var(--teal-600)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            {submitting ? '登記中...' : '確認登記排隊'}
          </button>
          {done?.error && <p style={{ color: 'var(--red-500)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>登記失敗，請重試或到前台登記</p>}
        </form>

        <p style={{ fontSize: 10, color: 'var(--gray-400)', textAlign: 'center', marginTop: 16 }}>
          {clinicName} | {clinicNameEn}
        </p>
      </div>
    </div>
  );
}
