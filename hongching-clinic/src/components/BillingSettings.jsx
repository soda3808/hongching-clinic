import { useState } from 'react';
import { getAuthHeader, getTenantConfig } from '../auth';

const PLANS = [
  {
    id: 'basic',
    name: '基本版',
    nameEn: 'Basic',
    price: 29,
    features: [
      '1 間分店',
      '2 位用戶',
      '核心診所管理功能',
      '病人紀錄管理',
      '預約系統',
      '基本報表',
    ],
    color: '#0e7490',
    tag: '入門',
  },
  {
    id: 'pro',
    name: '專業版',
    nameEn: 'Pro',
    price: 79,
    popular: true,
    features: [
      '3 間分店',
      '10 位用戶',
      '所有基本版功能',
      'AI 智能處方助手',
      'AI 聊天分析',
      '進階報表 & 分析',
      '藥材庫存管理',
      '優先客服支援',
    ],
    color: '#7c3aed',
    tag: '最受歡迎',
  },
  {
    id: 'enterprise',
    name: '企業版',
    nameEn: 'Enterprise',
    price: 199,
    features: [
      '無限分店',
      '無限用戶',
      '所有專業版功能',
      '自訂品牌 & Logo',
      '專屬客服經理',
      'API 整合',
      '數據匯出 & 備份',
      'SLA 服務保證',
    ],
    color: '#d97706',
    tag: '全方位',
  },
];

const STATUS_LABELS = {
  active: { label: '啟用中', color: '#16a34a', bg: '#dcfce7' },
  trialing: { label: '試用中', color: '#7c3aed', bg: '#f3e8ff' },
  past_due: { label: '逾期未付', color: '#dc2626', bg: '#fef2f2' },
  canceled: { label: '已取消', color: '#6b7280', bg: '#f3f4f6' },
  incomplete: { label: '處理中', color: '#d97706', bg: '#fffbeb' },
  unpaid: { label: '未付款', color: '#dc2626', bg: '#fef2f2' },
};

export default function BillingSettings({ showToast, user }) {
  const [loading, setLoading] = useState(null); // planId being loaded
  const [portalLoading, setPortalLoading] = useState(false);

  const tenant = getTenantConfig();
  const currentPlan = tenant?.plan || 'basic';
  const subscriptionStatus = tenant?.subscription_status || tenant?.subscriptionStatus || 'active';
  const statusInfo = STATUS_LABELS[subscriptionStatus] || STATUS_LABELS.active;

  const handleUpgrade = async (planId) => {
    if (planId === currentPlan) return;
    setLoading(planId);
    try {
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        showToast(data.error || '建立付款頁面失敗');
      }
    } catch (err) {
      showToast('網絡錯誤：' + err.message);
    }
    setLoading(null);
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        showToast(data.error || '開啟帳單管理失敗');
      }
    } catch (err) {
      showToast('網絡錯誤：' + err.message);
    }
    setPortalLoading(false);
  };

  return (
    <>
      {/* Current Plan Status */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>訂閱方案 Subscription</h3>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 700,
              color: statusInfo.color,
              background: statusInfo.bg,
            }}
          >
            {statusInfo.label}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>目前方案</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal-700)' }}>
              {PLANS.find(p => p.id === currentPlan)?.name || '基本版'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>月費</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-600)' }}>
              HK${PLANS.find(p => p.id === currentPlan)?.price || 29}/月
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button
              className="btn btn-outline"
              onClick={handlePortal}
              disabled={portalLoading}
              style={{ fontSize: 13 }}
            >
              {portalLoading ? '載入中...' : '管理帳單 Manage Billing'}
            </button>
          </div>
        </div>
        {subscriptionStatus === 'past_due' && (
          <div style={{
            marginTop: 12,
            padding: '8px 12px',
            background: '#fef2f2',
            borderRadius: 8,
            fontSize: 12,
            color: '#dc2626',
            border: '1px solid #fecaca',
          }}>
            付款逾期，請更新付款方式以避免服務中斷。
          </div>
        )}
        {subscriptionStatus === 'canceled' && (
          <div style={{
            marginTop: 12,
            padding: '8px 12px',
            background: '#f3f4f6',
            borderRadius: 8,
            fontSize: 12,
            color: '#6b7280',
            border: '1px solid #e5e7eb',
          }}>
            訂閱已取消。目前方案將在本期結束後降級為基本版。
          </div>
        )}
      </div>

      {/* Pricing Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
        marginBottom: 16,
      }}>
        {PLANS.map(plan => {
          const isCurrent = plan.id === currentPlan;
          const isDowngrade = PLANS.findIndex(p => p.id === plan.id) < PLANS.findIndex(p => p.id === currentPlan);

          return (
            <div
              key={plan.id}
              className="card"
              style={{
                position: 'relative',
                border: plan.popular ? `2px solid ${plan.color}` : isCurrent ? '2px solid var(--teal-500)' : '1px solid var(--gray-200)',
                padding: 24,
                textAlign: 'center',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
            >
              {/* Popular / Current Badge */}
              {(plan.popular || isCurrent) && (
                <div style={{
                  position: 'absolute',
                  top: -12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '3px 16px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fff',
                  background: isCurrent ? 'var(--teal-600)' : plan.color,
                  whiteSpace: 'nowrap',
                }}>
                  {isCurrent ? '目前方案' : plan.tag}
                </div>
              )}

              {/* Plan Name */}
              <div style={{ marginTop: plan.popular || isCurrent ? 8 : 0 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: plan.color }}>
                  {plan.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 12 }}>
                  {plan.nameEn}
                </div>
              </div>

              {/* Price */}
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 14, color: 'var(--gray-500)', verticalAlign: 'top' }}>HK$</span>
                <span style={{ fontSize: 40, fontWeight: 900, color: 'var(--gray-800)', lineHeight: 1 }}>
                  {plan.price}
                </span>
                <span style={{ fontSize: 14, color: 'var(--gray-400)' }}>/月</span>
              </div>

              {/* Features */}
              <div style={{ textAlign: 'left', marginBottom: 20 }}>
                {plan.features.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 0',
                      fontSize: 13,
                      color: 'var(--gray-600)',
                      borderBottom: i < plan.features.length - 1 ? '1px solid var(--gray-100)' : 'none',
                    }}
                  >
                    <span style={{ color: plan.color, fontWeight: 700, fontSize: 14 }}>&#10003;</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>

              {/* Action Button */}
              {isCurrent ? (
                <button
                  className="btn"
                  disabled
                  style={{
                    width: '100%',
                    background: 'var(--gray-100)',
                    color: 'var(--gray-400)',
                    border: '1px solid var(--gray-200)',
                    cursor: 'default',
                  }}
                >
                  目前方案 Current Plan
                </button>
              ) : (
                <button
                  className="btn"
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={loading === plan.id}
                  style={{
                    width: '100%',
                    background: plan.color,
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    opacity: loading === plan.id ? 0.7 : 1,
                  }}
                >
                  {loading === plan.id
                    ? '載入中...'
                    : isDowngrade
                    ? '降級 Downgrade'
                    : '升級 Upgrade'
                  }
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* FAQ / Info */}
      <div className="card" style={{ background: 'var(--gray-50)' }}>
        <div className="card-header"><h3>常見問題 FAQ</h3></div>
        <div style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.8 }}>
          <div style={{ marginBottom: 12 }}>
            <strong>如何升級方案？</strong><br />
            點擊上方的「升級 Upgrade」按鈕，系統會帶您到安全的 Stripe 付款頁面完成訂閱。
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>如何取消訂閱？</strong><br />
            點擊「管理帳單 Manage Billing」按鈕，在 Stripe 帳單頁面可以取消或變更訂閱。
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong>支援哪些付款方式？</strong><br />
            支援 Visa、Mastercard、American Express 等主要信用卡及扣帳卡。
          </div>
          <div>
            <strong>可以隨時更改方案嗎？</strong><br />
            可以。升級即時生效，費用按比例計算。降級將在本期帳單結束後生效。
          </div>
        </div>
      </div>
    </>
  );
}
