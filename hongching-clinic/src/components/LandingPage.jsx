import { useState } from 'react';

const TEAL = '#0e7490';
const TEAL_DARK = '#0c5f75';
const TEAL_LIGHT = '#67e8f9';
const GRAY_50 = '#f9fafb';
const GRAY_100 = '#f3f4f6';
const GRAY_200 = '#e5e7eb';
const GRAY_400 = '#9ca3af';
const GRAY_500 = '#6b7280';
const GRAY_600 = '#4b5563';
const GRAY_700 = '#374151';
const GRAY_900 = '#111827';
const WHITE = '#ffffff';

const FEATURES = [
  { icon: '📅', title: '預約管理', desc: '線上預約、自動提醒、排隊系統' },
  { icon: '🏥', title: '電子病歷', desc: '中醫 SOAP、處方管理、藥物標籤' },
  { icon: '💰', title: '財務報表', desc: '營收追蹤、開支分析、薪資管理' },
  { icon: '💊', title: '藥材庫存', desc: '進銷存管理、低庫存提醒、供應商管理' },
  { icon: '💬', title: 'WhatsApp CRM', desc: '客戶溝通、生日祝福、覆診提醒' },
  { icon: '🔒', title: '數據安全', desc: 'PDPO 合規、數據加密、審計日誌' },
];

const PRICING = [
  {
    name: 'Basic',
    price: '$899/月',
    highlight: false,
    features: {
      stores: '1 間',
      users: '5 位',
      booking: true,
      emr: true,
      inventory: false,
      crm: false,
      ai: false,
      whitelabel: false,
      support: 'Email',
    },
    cta: '免費試用',
  },
  {
    name: 'Pro',
    price: '$1,899/月',
    highlight: true,
    badge: '最受歡迎',
    features: {
      stores: '最多 3 間',
      users: '15 位',
      booking: true,
      emr: true,
      inventory: true,
      crm: true,
      ai: false,
      whitelabel: false,
      support: '電話',
    },
    cta: '免費試用',
  },
  {
    name: 'Enterprise',
    price: '聯絡我們',
    highlight: false,
    features: {
      stores: '無限',
      users: '無限',
      booking: true,
      emr: true,
      inventory: true,
      crm: true,
      ai: true,
      whitelabel: true,
      support: '24/7',
    },
    cta: '聯絡銷售',
  },
];

const FEATURE_ROWS = [
  { key: 'stores', label: '店舖數量' },
  { key: 'users', label: '用戶數量' },
  { key: 'booking', label: '預約系統' },
  { key: 'emr', label: '電子病歷' },
  { key: 'inventory', label: '庫存管理' },
  { key: 'crm', label: 'WhatsApp CRM' },
  { key: 'ai', label: 'AI 助手' },
  { key: 'whitelabel', label: '白標品牌' },
  { key: 'support', label: '專屬客服' },
];

const STATS = [
  { value: '50+', label: '已服務中醫診所' },
  { value: '99.9%', label: '系統正常運行' },
  { value: 'PDPO', label: '符合香港私隱條例' },
];

export default function LandingPage({ onGetStarted, onLogin }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: GRAY_900, overflowX: 'hidden' }}>
      {/* ── Navbar ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
        borderBottom: `1px solid ${GRAY_200}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 64,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>&#x2695;</span>
          <span style={{ fontWeight: 700, fontSize: 18, color: TEAL }}>ClinicOS</span>
        </div>
        {/* Desktop nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }} className="landing-desktop-nav">
          <span onClick={() => scrollTo('features')} style={navLinkStyle}>功能</span>
          <span onClick={() => scrollTo('pricing')} style={navLinkStyle}>定價</span>
          <span onClick={() => scrollTo('stats')} style={navLinkStyle}>關於</span>
          <button onClick={onLogin} style={navLoginBtnStyle}>登入</button>
        </div>
        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{ display: 'none', background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', padding: 4 }}
          className="landing-mobile-menu-btn"
          aria-label="選單"
        >
          {mobileMenuOpen ? '\u2715' : '\u2630'}
        </button>
      </nav>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed', top: 64, left: 0, right: 0, zIndex: 99,
          background: WHITE, borderBottom: `1px solid ${GRAY_200}`,
          padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          <span onClick={() => scrollTo('features')} style={{ ...navLinkStyle, fontSize: 16 }}>功能</span>
          <span onClick={() => scrollTo('pricing')} style={{ ...navLinkStyle, fontSize: 16 }}>定價</span>
          <span onClick={() => scrollTo('stats')} style={{ ...navLinkStyle, fontSize: 16 }}>關於</span>
          <button onClick={onLogin} style={{ ...navLoginBtnStyle, width: '100%', textAlign: 'center' }}>登入</button>
        </div>
      )}

      {/* ── Hero Section ── */}
      <section style={{
        background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DARK} 60%, #064e3b 100%)`,
        color: WHITE, padding: '140px 24px 100px', textAlign: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />

        <div style={{ maxWidth: 800, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, lineHeight: 1.2, marginBottom: 20 }}>
            智能中醫診所管理系統
          </h1>
          <p style={{ fontSize: 'clamp(16px, 2.5vw, 22px)', opacity: 0.9, marginBottom: 40, lineHeight: 1.6 }}>
            一站式預約、病歷、庫存、財務管理平台
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onGetStarted} style={heroPrimaryBtnStyle}>
              免費試用
            </button>
            <button onClick={() => scrollTo('features')} style={heroSecondaryBtnStyle}>
              了解更多
            </button>
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section id="features" style={{ padding: '80px 24px', background: WHITE }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={sectionTitleStyle}>全方位診所管理功能</h2>
          <p style={sectionSubtitleStyle}>專為中醫診所設計，涵蓋日常營運所需的每一個環節</p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24, marginTop: 48,
          }}>
            {FEATURES.map((f) => (
              <div key={f.title} style={featureCardStyle}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>{f.icon}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: GRAY_900 }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: GRAY_500, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing Section ── */}
      <section id="pricing" style={{ padding: '80px 24px', background: GRAY_50 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={sectionTitleStyle}>簡單透明的定價</h2>
          <p style={sectionSubtitleStyle}>選擇最適合您診所的方案，隨時升級或降級</p>

          {/* Pricing cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24, marginTop: 48, alignItems: 'start',
          }}>
            {PRICING.map((plan) => (
              <div key={plan.name} style={{
                background: WHITE,
                borderRadius: 16,
                border: plan.highlight ? `2px solid ${TEAL}` : `1px solid ${GRAY_200}`,
                padding: '32px 28px',
                position: 'relative',
                boxShadow: plan.highlight ? `0 8px 32px rgba(14,116,144,0.15)` : '0 1px 3px rgba(0,0,0,0.06)',
                transform: plan.highlight ? 'scale(1.03)' : 'none',
              }}>
                {plan.badge && (
                  <div style={{
                    position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)',
                    background: TEAL, color: WHITE, fontSize: 12, fontWeight: 600,
                    padding: '4px 16px', borderRadius: 20,
                  }}>
                    {plan.badge}
                  </div>
                )}
                <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{plan.name}</h3>
                <div style={{ fontSize: 32, fontWeight: 800, color: TEAL, marginBottom: 24 }}>{plan.price}</div>

                {FEATURE_ROWS.map((row) => {
                  const val = plan.features[row.key];
                  let display;
                  if (typeof val === 'boolean') {
                    display = val
                      ? <span style={{ color: TEAL, fontWeight: 700 }}>&#10003;</span>
                      : <span style={{ color: GRAY_400 }}>&mdash;</span>;
                  } else {
                    display = <span style={{ fontWeight: 600, color: GRAY_700 }}>{val}</span>;
                  }
                  return (
                    <div key={row.key} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 0', borderBottom: `1px solid ${GRAY_100}`,
                      fontSize: 14,
                    }}>
                      <span style={{ color: GRAY_600 }}>{row.label}</span>
                      {display}
                    </div>
                  );
                })}

                <button
                  onClick={plan.cta === '聯絡銷售' ? () => scrollTo('footer') : onGetStarted}
                  style={{
                    marginTop: 24, width: '100%', padding: '12px 0',
                    borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer',
                    border: plan.highlight ? 'none' : `1px solid ${TEAL}`,
                    background: plan.highlight ? TEAL : WHITE,
                    color: plan.highlight ? WHITE : TEAL,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (plan.highlight) { e.target.style.background = TEAL_DARK; }
                    else { e.target.style.background = TEAL; e.target.style.color = WHITE; }
                  }}
                  onMouseLeave={(e) => {
                    if (plan.highlight) { e.target.style.background = TEAL; }
                    else { e.target.style.background = WHITE; e.target.style.color = TEAL; }
                  }}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats / Testimonials ── */}
      <section id="stats" style={{
        padding: '80px 24px',
        background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DARK} 100%)`,
        color: WHITE,
      }}>
        <div style={{
          maxWidth: 900, margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 40, textAlign: 'center',
        }}>
          {STATS.map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 800, marginBottom: 8 }}>{s.value}</div>
              <div style={{ fontSize: 16, opacity: 0.9 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section style={{ padding: '80px 24px', textAlign: 'center', background: WHITE }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, marginBottom: 16 }}>
            準備好升級您的診所管理？
          </h2>
          <p style={{ fontSize: 16, color: GRAY_500, marginBottom: 32, lineHeight: 1.6 }}>
            免費試用 14 天，無需信用卡。體驗智能化中醫診所管理的便捷。
          </p>
          <button onClick={onGetStarted} style={{
            ...heroPrimaryBtnStyle,
            fontSize: 18, padding: '16px 48px',
          }}>
            立即開始免費試用
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer id="footer" style={{
        background: GRAY_900, color: GRAY_400, padding: '48px 24px 32px',
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 32, marginBottom: 32,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>&#x2695;</span>
              <span style={{ fontWeight: 700, fontSize: 16, color: WHITE }}>ClinicOS</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
              專為中醫診所打造的智能管理系統，助您提升營運效率。
            </p>
          </div>
          <div>
            <h4 style={{ color: WHITE, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>產品</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span onClick={() => scrollTo('features')} style={footerLinkStyle}>功能介紹</span>
              <span onClick={() => scrollTo('pricing')} style={footerLinkStyle}>定價</span>
            </div>
          </div>
          <div>
            <h4 style={{ color: WHITE, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>公司</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={footerLinkStyle}>私隱政策</span>
              <span style={footerLinkStyle}>聯絡我們</span>
            </div>
          </div>
          <div>
            <h4 style={{ color: WHITE, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>聯絡</h4>
            <p style={{ fontSize: 13, lineHeight: 1.8, margin: 0 }}>
              info@clinicos.hk<br />
              +852 9123 4567
            </p>
          </div>
        </div>
        <div style={{
          borderTop: `1px solid ${GRAY_700}`, paddingTop: 24,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
        }}>
          <span style={{ fontSize: 12 }}>&copy; {new Date().getFullYear()} ClinicOS. All rights reserved.</span>
          <span style={{ fontSize: 12 }}>Powered by ClinicOS</span>
        </div>
      </footer>

      {/* ── Responsive styles injected via <style> ── */}
      <style>{`
        .landing-mobile-menu-btn { display: none !important; }
        @media (max-width: 768px) {
          .landing-desktop-nav { display: none !important; }
          .landing-mobile-menu-btn { display: block !important; }
        }
      `}</style>
    </div>
  );
}

/* ── Style constants ── */

const navLinkStyle = {
  fontSize: 14, fontWeight: 500, color: GRAY_600, cursor: 'pointer',
  transition: 'color 0.2s',
};

const navLoginBtnStyle = {
  padding: '8px 20px', borderRadius: 8, border: `1px solid ${TEAL}`,
  background: WHITE, color: TEAL, fontWeight: 600, fontSize: 14,
  cursor: 'pointer', transition: 'all 0.2s',
};

const heroPrimaryBtnStyle = {
  padding: '14px 36px', borderRadius: 10, border: 'none',
  background: WHITE, color: TEAL, fontWeight: 700, fontSize: 16,
  cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
  transition: 'all 0.2s ease',
};

const heroSecondaryBtnStyle = {
  padding: '14px 36px', borderRadius: 10,
  border: '2px solid rgba(255,255,255,0.6)',
  background: 'transparent', color: WHITE, fontWeight: 700, fontSize: 16,
  cursor: 'pointer', transition: 'all 0.2s ease',
};

const sectionTitleStyle = {
  fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, textAlign: 'center',
  marginBottom: 8, color: GRAY_900,
};

const sectionSubtitleStyle = {
  fontSize: 16, color: GRAY_500, textAlign: 'center', maxWidth: 500,
  margin: '0 auto', lineHeight: 1.6,
};

const featureCardStyle = {
  padding: '28px 24px', borderRadius: 14,
  border: `1px solid ${GRAY_200}`, background: WHITE,
  transition: 'all 0.2s ease',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

const footerLinkStyle = {
  fontSize: 13, color: GRAY_400, cursor: 'pointer',
  transition: 'color 0.2s',
};
