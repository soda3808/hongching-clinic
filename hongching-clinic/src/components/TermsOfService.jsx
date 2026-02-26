import { useState, useRef } from 'react';

const EFFECTIVE_DATE = '2026-02-27';

const sections_zh = [
  { id: 'desc', title: '1. 服務描述' },
  { id: 'account', title: '2. 帳戶與安全' },
  { id: 'subscription', title: '3. 訂閱與付款' },
  { id: 'data', title: '4. 數據所有權' },
  { id: 'sla', title: '5. 服務級別' },
  { id: 'restrictions', title: '6. 限制與禁止' },
  { id: 'disclaimer', title: '7. 免責聲明' },
  { id: 'liability', title: '8. 賠償限額' },
  { id: 'termination', title: '9. 終止' },
  { id: 'law', title: '10. 適用法律' },
  { id: 'contact', title: '11. 聯繫方式' },
];

const sections_en = [
  { id: 'desc', title: '1. Service Description' },
  { id: 'account', title: '2. Account & Security' },
  { id: 'subscription', title: '3. Subscription & Payment' },
  { id: 'data', title: '4. Data Ownership' },
  { id: 'sla', title: '5. Service Level' },
  { id: 'restrictions', title: '6. Restrictions' },
  { id: 'disclaimer', title: '7. Disclaimers' },
  { id: 'liability', title: '8. Limitation of Liability' },
  { id: 'termination', title: '9. Termination' },
  { id: 'law', title: '10. Governing Law' },
  { id: 'contact', title: '11. Contact' },
];

const styles = {
  wrapper: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f0fdfa 0%, #f8fafc 100%)',
    display: 'flex',
    justifyContent: 'center',
    padding: '24px 16px',
  },
  container: {
    display: 'flex',
    gap: 24,
    maxWidth: 1100,
    width: '100%',
    alignItems: 'flex-start',
  },
  sidebar: {
    position: 'sticky',
    top: 24,
    width: 240,
    minWidth: 200,
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
    padding: '16px 0',
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#0d9488',
    padding: '0 16px 12px',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: 8,
  },
  sidebarItem: {
    display: 'block',
    padding: '6px 16px',
    fontSize: 12,
    color: '#374151',
    cursor: 'pointer',
    textDecoration: 'none',
    borderRadius: 0,
    transition: 'background 0.15s, color 0.15s',
  },
  sidebarItemHover: {
    background: '#f0fdfa',
    color: '#0d9488',
  },
  main: {
    flex: 1,
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
    padding: '32px 40px',
    minWidth: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  backBtn: {
    background: 'none',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '6px 16px',
    fontSize: 13,
    color: '#374151',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  },
  langToggle: {
    background: '#0d9488',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '6px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  printBtn: {
    background: 'none',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 13,
    color: '#374151',
    cursor: 'pointer',
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#0d9488',
    marginTop: 36,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: '2px solid #ccfbf1',
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 1.8,
    color: '#374151',
    marginBottom: 12,
  },
  list: {
    paddingLeft: 24,
    marginBottom: 12,
  },
  listItem: {
    fontSize: 14,
    lineHeight: 1.8,
    color: '#374151',
    marginBottom: 4,
  },
  divider: {
    border: 'none',
    borderTop: '1px solid #e5e7eb',
    margin: '32px 0',
  },
};

// Print-friendly CSS injected once
const printCSS = `
@media print {
  .tos-sidebar, .tos-topbar { display: none !important; }
  .tos-wrapper { background: #fff !important; padding: 0 !important; }
  .tos-main { box-shadow: none !important; padding: 20px !important; }
}
`;

export default function TermsOfService({ onBack }) {
  const [lang, setLang] = useState('zh');
  const contentRef = useRef(null);
  const [hoveredItem, setHoveredItem] = useState(null);

  const toc = lang === 'zh' ? sections_zh : sections_en;

  const scrollTo = (id) => {
    const el = document.getElementById(`tos-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePrint = () => window.print();

  return (
    <div className="tos-wrapper" style={styles.wrapper}>
      <style>{printCSS}</style>
      <div style={styles.container}>
        {/* Table of Contents Sidebar */}
        <div className="tos-sidebar" style={styles.sidebar}>
          <div style={styles.sidebarTitle}>
            {lang === 'zh' ? '目錄' : 'Table of Contents'}
          </div>
          {toc.map((s) => (
            <div
              key={s.id}
              style={{
                ...styles.sidebarItem,
                ...(hoveredItem === s.id ? styles.sidebarItemHover : {}),
              }}
              onClick={() => scrollTo(s.id)}
              onMouseEnter={() => setHoveredItem(s.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              {s.title}
            </div>
          ))}
        </div>

        {/* Main Content */}
        <div className="tos-main" style={styles.main} ref={contentRef}>
          {/* Top Bar */}
          <div className="tos-topbar" style={styles.header}>
            <div style={{ display: 'flex', gap: 8 }}>
              {onBack && (
                <button style={styles.backBtn} onClick={onBack}>
                  ← {lang === 'zh' ? '返回' : 'Back'}
                </button>
              )}
              <button style={styles.printBtn} onClick={handlePrint}>
                🖨 {lang === 'zh' ? '列印' : 'Print'}
              </button>
            </div>
            <button
              style={styles.langToggle}
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            >
              {lang === 'zh' ? 'EN / English' : '中文 / Chinese'}
            </button>
          </div>

          {/* ── Chinese Version ── */}
          {lang === 'zh' ? (
            <>
              <h1 style={styles.title}>服務條款</h1>
              <p style={styles.subtitle}>
                生效日期：{EFFECTIVE_DATE} &nbsp;|&nbsp; 康晴綜合醫療中心（Hong Ching Integrated Medical Centre）
              </p>

              <p style={styles.paragraph}>
                歡迎使用康晴綜合醫療中心提供的診所管理軟件即服務平台（「本平台」或「服務」）。使用本服務即表示閣下同意受以下條款約束。如閣下不同意本條款，請勿使用本服務。
              </p>

              <hr style={styles.divider} />

              {/* 1. 服務描述 */}
              <h2 id="tos-desc" style={styles.sectionTitle}>1. 服務描述</h2>
              <p style={styles.paragraph}>
                本平台是一個多租戶軟件即服務（SaaS）診所管理系統，專為中醫診所及綜合醫療機構設計，提供以下功能：
              </p>
              <ul style={styles.list}>
                <li style={styles.listItem}>病人管理與電子病歷（EMR）</li>
                <li style={styles.listItem}>預約排期與掛號系統</li>
                <li style={styles.listItem}>配藥、收費與庫存管理</li>
                <li style={styles.listItem}>財務記錄（營業、開支、應收應付）</li>
                <li style={styles.listItem}>員工管理（糧單、排班、假期）</li>
                <li style={styles.listItem}>WhatsApp CRM 客戶關係管理</li>
                <li style={styles.listItem}>AI 輔助分析與報表</li>
                <li style={styles.listItem}>滿意度調查及公開預約頁面</li>
              </ul>
              <p style={styles.paragraph}>
                本平台以雲端方式運作，數據儲存於 Supabase 託管資料庫，前端託管於 Vercel，並使用 Anthropic 提供的人工智能功能。
              </p>

              {/* 2. 帳戶與安全 */}
              <h2 id="tos-account" style={styles.sectionTitle}>2. 帳戶與安全</h2>
              <p style={styles.paragraph}>
                2.1 &nbsp; 閣下須提供準確、完整的帳戶資料，並負責維護帳戶登入憑證的安全。
              </p>
              <p style={styles.paragraph}>
                2.2 &nbsp; 閣下不得將帳戶與他人共用。每位用戶應擁有獨立帳戶。系統設有基於角色的存取控制（管理員、醫師、員工等），閣下須按照機構政策分配適當權限。
              </p>
              <p style={styles.paragraph}>
                2.3 &nbsp; 如發現任何未經授權使用帳戶的情況，閣下應立即通知我們。
              </p>
              <p style={styles.paragraph}>
                2.4 &nbsp; 系統設有自動登出機制（閒置30分鐘後自動登出），以保障帳戶安全。
              </p>

              {/* 3. 訂閱與付款 */}
              <h2 id="tos-subscription" style={styles.sectionTitle}>3. 訂閱與付款</h2>
              <p style={styles.paragraph}>
                3.1 &nbsp; 本服務以訂閱方式提供，按月或按年計費。所有費用以港幣（HKD）計算。
              </p>
              <p style={styles.paragraph}>
                3.2 &nbsp; 訂閱費用於每個計費週期開始時預先收取。如未能按時繳費，我們保留暫停或限制服務的權利。
              </p>
              <p style={styles.paragraph}>
                3.3 &nbsp; 閣下可隨時取消訂閱。取消後，服務將持續至當前計費週期結束。已繳付的費用一般不予退還，除非法律另有規定。
              </p>
              <p style={styles.paragraph}>
                3.4 &nbsp; 我們保留在合理通知（至少30天）後調整定價的權利。
              </p>

              {/* 4. 數據所有權 */}
              <h2 id="tos-data" style={styles.sectionTitle}>4. 數據所有權</h2>
              <p style={styles.paragraph}>
                4.1 &nbsp; 閣下（即租戶）擁有並保留在本平台上輸入或產生的所有數據的所有權，包括但不限於：病人資料、醫療記錄、財務數據、員工資料及通訊記錄。
              </p>
              <p style={styles.paragraph}>
                4.2 &nbsp; 我們不會將閣下的數據出售或分享予第三方作營銷用途。
              </p>
              <p style={styles.paragraph}>
                4.3 &nbsp; 我們僅在提供、維護及改善服務所必需的範圍內存取閣下的數據。
              </p>
              <p style={styles.paragraph}>
                4.4 &nbsp; 閣下有權隨時匯出其數據（JSON / CSV 格式）。
              </p>

              {/* 5. 服務級別 */}
              <h2 id="tos-sla" style={styles.sectionTitle}>5. 服務級別</h2>
              <p style={styles.paragraph}>
                5.1 &nbsp; 我們致力維持本平台 99.9% 的正常運行時間（不包括計劃維護時間）。
              </p>
              <p style={styles.paragraph}>
                5.2 &nbsp; 計劃維護將盡量安排於非繁忙時段進行，並會提前通知閣下。
              </p>
              <p style={styles.paragraph}>
                5.3 &nbsp; 技術支援於辦公時間（星期一至五，上午9時至下午6時，香港時間）內提供。緊急支援將酌情安排。
              </p>
              <p style={styles.paragraph}>
                5.4 &nbsp; 如服務因我方原因出現長時間中斷（連續超過24小時），閣下可按比例獲得服務時間補償。
              </p>

              {/* 6. 限制與禁止 */}
              <h2 id="tos-restrictions" style={styles.sectionTitle}>6. 限制與禁止</h2>
              <p style={styles.paragraph}>閣下同意不會：</p>
              <ul style={styles.list}>
                <li style={styles.listItem}>將本服務用於任何違法目的或違反香港特別行政區法律的活動</li>
                <li style={styles.listItem}>嘗試反向工程、反編譯或以其他方式嘗試取得本平台的原始碼</li>
                <li style={styles.listItem}>未經授權存取其他租戶的數據</li>
                <li style={styles.listItem}>轉售、轉授權或將本服務提供予第三方使用</li>
                <li style={styles.listItem}>上傳包含惡意軟件、病毒或有害內容的檔案</li>
                <li style={styles.listItem}>對本平台進行壓力測試、滲透測試或安全掃描（除非事先獲得書面同意）</li>
                <li style={styles.listItem}>規避或嘗試規避任何安全措施或存取控制</li>
              </ul>

              {/* 7. 免責聲明 */}
              <h2 id="tos-disclaimer" style={styles.sectionTitle}>7. 免責聲明</h2>
              <p style={styles.paragraph}>
                7.1 &nbsp; 本平台為診所管理工具，並非醫療設備或醫療建議平台。本平台不提供醫療診斷、治療建議或處方。所有醫療決策應由具資格的醫療專業人員作出。
              </p>
              <p style={styles.paragraph}>
                7.2 &nbsp; AI 輔助功能（由 Anthropic 提供）僅作參考之用，不構成醫療建議。使用者應獨立核實 AI 產生的任何資訊。
              </p>
              <p style={styles.paragraph}>
                7.3 &nbsp; 本服務按「現狀」及「可用」基礎提供。在法律允許的最大範圍內，我們不就服務的適銷性、特定用途的適合性或不侵權作出任何明示或暗示的保證。
              </p>

              {/* 8. 賠償限額 */}
              <h2 id="tos-liability" style={styles.sectionTitle}>8. 賠償限額</h2>
              <p style={styles.paragraph}>
                8.1 &nbsp; 在法律允許的最大範圍內，我們就因使用或無法使用本服務而產生的任何直接、間接、附帶、特殊、衍生性或懲罰性損害賠償的總責任，不會超過閣下在引起索賠事件發生前十二（12）個月內已支付的服務費用總額。
              </p>
              <p style={styles.paragraph}>
                8.2 &nbsp; 我們對以下情況概不負責：因第三方服務（包括但不限於 Supabase、Vercel、Stripe、Anthropic）故障而導致的服務中斷或數據損失；因閣下未能妥善保管登入憑證而導致的未經授權存取；以及不可抗力事件。
              </p>

              {/* 9. 終止 */}
              <h2 id="tos-termination" style={styles.sectionTitle}>9. 終止</h2>
              <p style={styles.paragraph}>
                9.1 &nbsp; 任何一方均可提前三十（30）天書面通知對方終止本協議。
              </p>
              <p style={styles.paragraph}>
                9.2 &nbsp; 如閣下嚴重違反本條款，我們保留立即終止服務的權利。
              </p>
              <p style={styles.paragraph}>
                9.3 &nbsp; 服務終止後，閣下將有三十（30）天的寬限期匯出所有數據。寬限期屆滿後，我們將永久刪除閣下的所有數據。
              </p>
              <p style={styles.paragraph}>
                9.4 &nbsp; 終止後仍然有效的條款（包括數據所有權、免責聲明及賠償限額）將繼續有效。
              </p>

              {/* 10. 適用法律 */}
              <h2 id="tos-law" style={styles.sectionTitle}>10. 適用法律</h2>
              <p style={styles.paragraph}>
                10.1 &nbsp; 本條款受香港特別行政區法律管轄，並按其法律解釋。
              </p>
              <p style={styles.paragraph}>
                10.2 &nbsp; 因本條款引起的任何爭議，雙方應首先嘗試通過友好協商解決。如協商未果，應提交香港特別行政區法院管轄。
              </p>

              {/* 11. 聯繫方式 */}
              <h2 id="tos-contact" style={styles.sectionTitle}>11. 聯繫方式</h2>
              <p style={styles.paragraph}>
                如對本服務條款有任何疑問，請聯繫：
              </p>
              <ul style={styles.list}>
                <li style={styles.listItem}><strong>機構名稱：</strong>康晴綜合醫療中心</li>
                <li style={styles.listItem}><strong>英文名稱：</strong>Hong Ching Integrated Medical Centre</li>
                <li style={styles.listItem}><strong>電郵：</strong>info@hongching.com</li>
                <li style={styles.listItem}><strong>地區：</strong>香港特別行政區</li>
              </ul>

              <hr style={styles.divider} />
              <p style={{ ...styles.paragraph, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                &copy; {new Date().getFullYear()} 康晴綜合醫療中心。保留所有權利。
              </p>
            </>
          ) : (
            /* ── English Version ── */
            <>
              <h1 style={styles.title}>Terms of Service</h1>
              <p style={styles.subtitle}>
                Effective Date: {EFFECTIVE_DATE} &nbsp;|&nbsp; Hong Ching Integrated Medical Centre (康晴綜合醫療中心)
              </p>

              <p style={styles.paragraph}>
                Welcome to the clinic management software-as-a-service platform ("Platform" or "Service") provided by Hong Ching Integrated Medical Centre. By using this Service, you agree to be bound by the following terms. If you do not agree, please do not use the Service.
              </p>

              <hr style={styles.divider} />

              {/* 1. Service Description */}
              <h2 id="tos-desc" style={styles.sectionTitle}>1. Service Description</h2>
              <p style={styles.paragraph}>
                The Platform is a multi-tenant Software-as-a-Service (SaaS) clinic management system designed for Traditional Chinese Medicine (TCM) clinics and integrated medical practices, offering the following features:
              </p>
              <ul style={styles.list}>
                <li style={styles.listItem}>Patient management and Electronic Medical Records (EMR)</li>
                <li style={styles.listItem}>Appointment scheduling and queue management</li>
                <li style={styles.listItem}>Dispensing, billing, and inventory management</li>
                <li style={styles.listItem}>Financial records (revenue, expenses, accounts receivable/payable)</li>
                <li style={styles.listItem}>Staff management (payroll, scheduling, leave)</li>
                <li style={styles.listItem}>WhatsApp CRM for customer relationship management</li>
                <li style={styles.listItem}>AI-assisted analytics and reporting</li>
                <li style={styles.listItem}>Patient satisfaction surveys and public booking pages</li>
              </ul>
              <p style={styles.paragraph}>
                The Platform operates as a cloud service, with data stored in Supabase-hosted databases, frontend hosted on Vercel, and AI features powered by Anthropic.
              </p>

              {/* 2. Account & Security */}
              <h2 id="tos-account" style={styles.sectionTitle}>2. Account &amp; Security</h2>
              <p style={styles.paragraph}>
                2.1 &nbsp; You must provide accurate and complete account information and are responsible for maintaining the security of your login credentials.
              </p>
              <p style={styles.paragraph}>
                2.2 &nbsp; Account sharing is not permitted. Each user should have an individual account. The system implements role-based access control (admin, doctor, staff, etc.), and you must assign appropriate permissions according to your organization's policies.
              </p>
              <p style={styles.paragraph}>
                2.3 &nbsp; You must notify us immediately if you discover any unauthorized use of your account.
              </p>
              <p style={styles.paragraph}>
                2.4 &nbsp; The system includes automatic session timeout (30 minutes of inactivity) to protect account security.
              </p>

              {/* 3. Subscription & Payment */}
              <h2 id="tos-subscription" style={styles.sectionTitle}>3. Subscription &amp; Payment</h2>
              <p style={styles.paragraph}>
                3.1 &nbsp; The Service is offered on a subscription basis, billed monthly or annually. All fees are denominated in Hong Kong Dollars (HKD).
              </p>
              <p style={styles.paragraph}>
                3.2 &nbsp; Subscription fees are charged in advance at the beginning of each billing cycle. We reserve the right to suspend or restrict the Service if payment is not received on time.
              </p>
              <p style={styles.paragraph}>
                3.3 &nbsp; You may cancel your subscription at any time. Upon cancellation, the Service will continue until the end of the current billing cycle. Fees already paid are generally non-refundable, unless otherwise required by law.
              </p>
              <p style={styles.paragraph}>
                3.4 &nbsp; We reserve the right to adjust pricing with reasonable notice (at least 30 days).
              </p>

              {/* 4. Data Ownership */}
              <h2 id="tos-data" style={styles.sectionTitle}>4. Data Ownership</h2>
              <p style={styles.paragraph}>
                4.1 &nbsp; You (the tenant) own and retain all rights to all data entered into or generated on the Platform, including but not limited to: patient information, medical records, financial data, staff records, and communication logs.
              </p>
              <p style={styles.paragraph}>
                4.2 &nbsp; We will not sell or share your data with third parties for marketing purposes.
              </p>
              <p style={styles.paragraph}>
                4.3 &nbsp; We access your data only to the extent necessary to provide, maintain, and improve the Service.
              </p>
              <p style={styles.paragraph}>
                4.4 &nbsp; You have the right to export your data at any time (in JSON/CSV format).
              </p>

              {/* 5. Service Level */}
              <h2 id="tos-sla" style={styles.sectionTitle}>5. Service Level</h2>
              <p style={styles.paragraph}>
                5.1 &nbsp; We strive to maintain 99.9% uptime for the Platform, excluding scheduled maintenance windows.
              </p>
              <p style={styles.paragraph}>
                5.2 &nbsp; Scheduled maintenance will be performed during off-peak hours whenever possible, and you will be notified in advance.
              </p>
              <p style={styles.paragraph}>
                5.3 &nbsp; Technical support is available during business hours (Monday to Friday, 9:00 AM to 6:00 PM, Hong Kong Time). Emergency support will be arranged on a case-by-case basis.
              </p>
              <p style={styles.paragraph}>
                5.4 &nbsp; If the Service experiences extended downtime (more than 24 consecutive hours) due to our fault, you may receive pro-rata service credit.
              </p>

              {/* 6. Restrictions */}
              <h2 id="tos-restrictions" style={styles.sectionTitle}>6. Restrictions</h2>
              <p style={styles.paragraph}>You agree not to:</p>
              <ul style={styles.list}>
                <li style={styles.listItem}>Use the Service for any unlawful purpose or in violation of the laws of the Hong Kong SAR</li>
                <li style={styles.listItem}>Attempt to reverse engineer, decompile, or otherwise attempt to obtain the source code of the Platform</li>
                <li style={styles.listItem}>Access data belonging to other tenants without authorization</li>
                <li style={styles.listItem}>Resell, sublicense, or make the Service available to third parties</li>
                <li style={styles.listItem}>Upload files containing malware, viruses, or harmful content</li>
                <li style={styles.listItem}>Conduct stress tests, penetration tests, or security scans without prior written consent</li>
                <li style={styles.listItem}>Circumvent or attempt to circumvent any security measures or access controls</li>
              </ul>

              {/* 7. Disclaimers */}
              <h2 id="tos-disclaimer" style={styles.sectionTitle}>7. Disclaimers</h2>
              <p style={styles.paragraph}>
                7.1 &nbsp; The Platform is a clinic management tool and is not a medical device or a medical advice platform. The Platform does not provide medical diagnosis, treatment recommendations, or prescriptions. All medical decisions should be made by qualified healthcare professionals.
              </p>
              <p style={styles.paragraph}>
                7.2 &nbsp; AI-assisted features (powered by Anthropic) are for reference only and do not constitute medical advice. Users should independently verify any information generated by AI.
              </p>
              <p style={styles.paragraph}>
                7.3 &nbsp; The Service is provided on an "as is" and "as available" basis. To the maximum extent permitted by law, we make no warranties, express or implied, regarding merchantability, fitness for a particular purpose, or non-infringement.
              </p>

              {/* 8. Limitation of Liability */}
              <h2 id="tos-liability" style={styles.sectionTitle}>8. Limitation of Liability</h2>
              <p style={styles.paragraph}>
                8.1 &nbsp; To the maximum extent permitted by law, our total liability for any direct, indirect, incidental, special, consequential, or punitive damages arising from or related to the use or inability to use the Service shall not exceed the total service fees paid by you in the twelve (12) months preceding the event giving rise to the claim.
              </p>
              <p style={styles.paragraph}>
                8.2 &nbsp; We shall not be liable for: service interruptions or data loss caused by failures of third-party services (including but not limited to Supabase, Vercel, Stripe, Anthropic); unauthorized access resulting from your failure to secure login credentials; or force majeure events.
              </p>

              {/* 9. Termination */}
              <h2 id="tos-termination" style={styles.sectionTitle}>9. Termination</h2>
              <p style={styles.paragraph}>
                9.1 &nbsp; Either party may terminate this agreement by providing thirty (30) days' written notice.
              </p>
              <p style={styles.paragraph}>
                9.2 &nbsp; We reserve the right to immediately terminate the Service if you materially breach these Terms.
              </p>
              <p style={styles.paragraph}>
                9.3 &nbsp; Upon termination, you will have a thirty (30) day grace period to export all your data. After this period, we will permanently delete all your data.
              </p>
              <p style={styles.paragraph}>
                9.4 &nbsp; Provisions that by their nature survive termination (including Data Ownership, Disclaimers, and Limitation of Liability) shall remain in effect.
              </p>

              {/* 10. Governing Law */}
              <h2 id="tos-law" style={styles.sectionTitle}>10. Governing Law</h2>
              <p style={styles.paragraph}>
                10.1 &nbsp; These Terms shall be governed by and construed in accordance with the laws of the Hong Kong Special Administrative Region.
              </p>
              <p style={styles.paragraph}>
                10.2 &nbsp; Any disputes arising from these Terms shall first be resolved through good faith negotiation. Failing that, the disputes shall be submitted to the courts of the Hong Kong Special Administrative Region.
              </p>

              {/* 11. Contact */}
              <h2 id="tos-contact" style={styles.sectionTitle}>11. Contact</h2>
              <p style={styles.paragraph}>
                For any questions about these Terms of Service, please contact:
              </p>
              <ul style={styles.list}>
                <li style={styles.listItem}><strong>Organization:</strong> Hong Ching Integrated Medical Centre</li>
                <li style={styles.listItem}><strong>Chinese Name:</strong> 康晴綜合醫療中心</li>
                <li style={styles.listItem}><strong>Email:</strong> info@hongching.com</li>
                <li style={styles.listItem}><strong>Location:</strong> Hong Kong SAR</li>
              </ul>

              <hr style={styles.divider} />
              <p style={{ ...styles.paragraph, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                &copy; {new Date().getFullYear()} Hong Ching Integrated Medical Centre. All rights reserved.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
