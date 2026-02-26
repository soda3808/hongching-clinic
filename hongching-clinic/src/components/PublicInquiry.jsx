import { useState } from 'react';
import { uid } from '../data';
import { getClinicName, getClinicNameEn, getTenantStores, getTenantSettings } from '../tenant';

const INQUIRY_TYPES = ['一般查詢', '預約查詢', '收費查詢', '診症查詢', '其他'];

export default function PublicInquiry() {
  const clinicName = getClinicName();
  const clinicNameEn = getClinicNameEn();
  const stores = getTenantStores();

  const [form, setForm] = useState({ name: '', phone: '', type: '一般查詢', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.message) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: uid(), ...form }),
      });
      const result = await res.json();
      if (result.success) {
        setDone(true);
      } else {
        setError('提交失敗，請直接致電診所查詢。');
      }
    } catch {
      setError('提交失敗，請直接致電診所查詢。');
    }
    setSubmitting(false);
  };

  if (done) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: '#0e7490', marginBottom: 8 }}>查詢已提交！</h2>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
            {form.name}，我哋會盡快透過 WhatsApp 回覆你。
          </p>
          <div style={{ background: '#f0fdfa', borderRadius: 8, padding: 12, fontSize: 13, textAlign: 'left', marginBottom: 16 }}>
            <div><strong>查詢類型：</strong>{form.type}</div>
            <div><strong>聯絡電話：</strong>{form.phone}</div>
          </div>
          <p style={{ fontSize: 12, color: '#999' }}>一般會在營業時間內 1 小時內回覆</p>
          <button onClick={() => { setDone(false); setForm({ name: '', phone: '', type: '一般查詢', message: '' }); }}
            style={{ marginTop: 16, padding: '10px 24px', background: '#0e7490', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            提交新查詢
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
          <h2 style={{ color: '#0e7490', margin: 0 }}>客人查詢</h2>
          <p style={{ fontSize: 12, color: '#999', margin: '4px 0' }}>填寫以下資料，我哋會透過 WhatsApp 回覆你</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>姓名 *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="請輸入姓名" required
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>WhatsApp 電話 *</label>
            <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="例：5791 5762" required
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>查詢類型</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }}>
              {INQUIRY_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>查詢內容 *</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="請描述你嘅問題或查詢..." required rows={4}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} />
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: 12, textAlign: 'center', marginBottom: 8 }}>{error}</p>}
          <button type="submit" disabled={submitting}
            style={{ width: '100%', padding: '12px', background: '#0e7490', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            {submitting ? '提交中...' : '提交查詢'}
          </button>
        </form>

        <div style={{ marginTop: 20, padding: 12, background: '#f9fafb', borderRadius: 8, fontSize: 12, color: '#666' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>其他聯絡方式：</div>
          {stores.map(s => (
            <div key={s.name}>{s.name}店{s.address ? `：${s.address}` : ''}</div>
          ))}
          <div style={{ marginTop: 4 }}>營業時間：{getTenantSettings()?.businessHours || '請聯繫診所查詢'}</div>
          {(() => {
            const settings = getTenantSettings();
            const website = settings?.website;
            const instagram = settings?.instagram;
            if (!website && !instagram) return null;
            return (
              <div style={{ marginTop: 8, display: 'flex', gap: 12 }}>
                {website && <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noopener noreferrer" style={{ color: '#0e7490', textDecoration: 'none' }}>🌐 官網</a>}
                {instagram && <a href={instagram.startsWith('http') ? instagram : `https://www.instagram.com/${instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#0e7490', textDecoration: 'none' }}>📸 Instagram</a>}
              </div>
            );
          })()}
        </div>

        <p style={{ fontSize: 10, color: '#999', textAlign: 'center', marginTop: 16 }}>
          {clinicName} | {clinicNameEn}
        </p>
      </div>
    </div>
  );
}
