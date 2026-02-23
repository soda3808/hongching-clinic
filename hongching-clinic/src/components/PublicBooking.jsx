import { useState } from 'react';
import { saveBooking } from '../api';
import { uid, DOCTORS } from '../data';

const STORES = [
  { name: '宋皇臺', address: '九龍馬頭涌道97號美誠大廈地下', mapUrl: 'https://maps.google.com/?q=九龍馬頭涌道97號美誠大廈地下' },
  { name: '太子', address: '九龍長沙灣道28號長康大廈地下', mapUrl: 'https://maps.google.com/?q=九龍長沙灣道28號長康大廈地下' },
];

const PHONE = ''; // fill when available
const WHATSAPP = '85291234567'; // placeholder

const TIME_SLOTS = [
  { label: '上午 (10:00-13:00)', value: '10:00' },
  { label: '下午 (14:00-17:00)', value: '14:00' },
  { label: '晚上 (18:00-20:00)', value: '18:00' },
];

export default function PublicBooking() {
  const [form, setForm] = useState({ name: '', phone: '', store: '宋皇臺', date: '', timeSlot: '10:00', doctor: '', symptoms: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const minDate = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();

  const isValidPhone = (phone) => /^[2-9]\d{7}$/.test(phone.replace(/[\s\-]/g, ''));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.date) return;
    if (!isValidPhone(form.phone)) { alert('請輸入有效的8位香港電話號碼'); return; }
    setSubmitting(true);
    const record = {
      id: uid(),
      patientName: form.name,
      patientPhone: form.phone,
      store: form.store,
      date: form.date,
      time: form.timeSlot,
      duration: 30,
      doctor: form.doctor || DOCTORS[0],
      type: '初診',
      status: 'pending',
      notes: form.symptoms,
      source: 'online',
      createdAt: new Date().toISOString().substring(0, 10),
    };
    await saveBooking(record);
    setDone(record);
    setSubmitting(false);
  };

  // Success page
  if (done) {
    return (
      <div className="pb-page">
        <div className="pb-container">
          <div className="pb-header">
            <h1>康晴綜合醫療中心</h1>
            <p>HONG CHING MEDICAL CENTRE</p>
          </div>
          <div className="pb-success-card">
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <h2>預約成功！</h2>
            <p style={{ color: 'var(--gray-500)', marginBottom: 20 }}>我們會在24小時內透過 WhatsApp 確認您的預約</p>
            <div className="pb-detail-grid">
              <div className="pb-detail"><span>姓名</span><strong>{done.patientName}</strong></div>
              <div className="pb-detail"><span>電話</span><strong>{done.patientPhone}</strong></div>
              <div className="pb-detail"><span>分店</span><strong>{done.store}</strong></div>
              <div className="pb-detail"><span>日期</span><strong>{done.date}</strong></div>
              <div className="pb-detail"><span>時段</span><strong>{TIME_SLOTS.find(t => t.value === done.time)?.label || done.time}</strong></div>
              <div className="pb-detail"><span>醫師</span><strong>{done.doctor || '不指定'}</strong></div>
            </div>
            {done.notes && <div className="pb-detail" style={{ marginTop: 8 }}><span>症狀</span><strong>{done.notes}</strong></div>}
            <a href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`您好，我剛預約了 ${done.date} ${done.store} 的門診，姓名：${done.patientName}`)}`}
              className="pb-btn pb-btn-green" target="_blank" rel="noopener" style={{ marginTop: 20 }}>
              📱 WhatsApp 聯繫我們
            </a>
            <button className="pb-btn pb-btn-outline" onClick={() => { setDone(null); setForm({ name:'', phone:'', store:'宋皇臺', date:'', timeSlot:'10:00', doctor:'', symptoms:'' }); }} style={{ marginTop: 8 }}>
              再預約一次
            </button>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-page">
      <div className="pb-container">
        {/* Header */}
        <div className="pb-header">
          <h1>康晴綜合醫療中心</h1>
          <p>HONG CHING MEDICAL CENTRE</p>
          <div className="pb-subtitle">專業中醫診療服務</div>
        </div>

        {/* Clinic Info */}
        <div className="pb-card">
          <h3 style={{ marginBottom: 12 }}>📍 診所地址</h3>
          {STORES.map(s => (
            <div key={s.name} className="pb-store-row">
              <div>
                <strong>{s.name}店</strong>
                <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>{s.address}</div>
              </div>
              <a href={s.mapUrl} target="_blank" rel="noopener" className="pb-map-link">📍 地圖</a>
            </div>
          ))}
          <div className="pb-info-row">
            <span>🕐</span>
            <div>
              <div>星期一至六 10:00 - 20:00</div>
              <div style={{ color: 'var(--gray-400)', fontSize: 12 }}>星期日休息</div>
            </div>
          </div>
          <div className="pb-info-row">
            <span>📞</span>
            <a href={`tel:${PHONE || '#'}`} style={{ color: 'var(--teal-700)', fontWeight: 600, textDecoration: 'none' }}>{PHONE || '致電查詢'}</a>
          </div>
          <div className="pb-info-row">
            <span>💬</span>
            <a href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener" style={{ color: '#25d366', fontWeight: 600, textDecoration: 'none' }}>WhatsApp 預約</a>
          </div>
        </div>

        {/* Promo Banner */}
        <div className="pb-promo">
          🎉 新客優惠：首次免診金 + 療程套餐9折
        </div>

        {/* Booking Form */}
        <div className="pb-card">
          <h3 style={{ marginBottom: 16 }}>📅 線上預約</h3>
          <form onSubmit={handleSubmit}>
            <div className="pb-field">
              <label htmlFor="pb-name">姓名 *</label>
              <input id="pb-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="請輸入姓名" required />
            </div>
            <div className="pb-field">
              <label htmlFor="pb-phone">電話 *</label>
              <input id="pb-phone" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="請輸入電話號碼" required />
            </div>
            <div className="pb-field">
              <label>選擇分店</label>
              <select value={form.store} onChange={e => setForm({ ...form, store: e.target.value })}>
                {STORES.map(s => <option key={s.name} value={s.name}>{s.name}店 — {s.address}</option>)}
              </select>
            </div>
            <div className="pb-field">
              <label htmlFor="pb-date">選擇日期 *</label>
              <input id="pb-date" type="date" value={form.date} min={minDate} onChange={e => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="pb-field">
              <label>選擇時段</label>
              <select value={form.timeSlot} onChange={e => setForm({ ...form, timeSlot: e.target.value })}>
                {TIME_SLOTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="pb-field">
              <label>選擇醫師</label>
              <select value={form.doctor} onChange={e => setForm({ ...form, doctor: e.target.value })}>
                <option value="">不指定</option>
                {DOCTORS.map(d => <option key={d} value={d}>{d} 醫師</option>)}
              </select>
            </div>
            <div className="pb-field">
              <label>症狀簡述（選填）</label>
              <textarea value={form.symptoms} onChange={e => setForm({ ...form, symptoms: e.target.value })} placeholder="請簡述您的症狀或需要的服務" rows={3} />
            </div>
            <button type="submit" className="pb-btn pb-btn-teal" disabled={submitting}>
              {submitting ? '提交中...' : '📅 確認預約'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <Footer />
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div className="pb-footer">
      <h3>關於康晴</h3>
      <p>康晴綜合醫療中心提供專業中醫診療服務，涵蓋內科、針灸、推拿、天灸等多項療程，致力為患者提供全面的中醫治療方案。</p>
      <h4 style={{ marginTop: 16, marginBottom: 8 }}>醫師團隊</h4>
      <div className="pb-team">
        <div className="pb-doc">
          <strong>常凱晴 醫師</strong>
          <span>註冊中醫師 · 內科/針灸</span>
        </div>
        <div className="pb-doc">
          <strong>許植輝 醫師</strong>
          <span>註冊中醫師 · 內科/骨傷</span>
        </div>
        <div className="pb-doc">
          <strong>曾其方 醫師</strong>
          <span>註冊中醫師 · 內科/推拿</span>
        </div>
      </div>
      <div className="pb-copyright">
        &copy; {new Date().getFullYear()} 康晴綜合醫療中心 Hong Ching Medical Centre. All rights reserved.
      </div>
    </div>
  );
}
