import { useState, useRef } from 'react';
import { getClinicName, getClinicNameEn, getTenantSettings } from '../tenant';

const EFFECTIVE_DATE = '2026-02-27';

const sections_zh = [
  { id: 'collection', title: '1. 資料收集' },
  { id: 'purpose', title: '2. 收集目的 (DPP1)' },
  { id: 'use', title: '3. 數據使用 (DPP3)' },
  { id: 'retention', title: '4. 數據保留 (DPP2)' },
  { id: 'security', title: '5. 數據安全 (DPP4)' },
  { id: 'thirdparty', title: '6. 第三方服務' },
  { id: 'rights', title: '7. 數據主體權利' },
  { id: 'cookies', title: '8. Cookies 與追蹤' },
  { id: 'transfer', title: '9. 跨境傳輸' },
  { id: 'children', title: '10. 兒童私隱' },
  { id: 'updates', title: '11. 政策更新' },
  { id: 'contact', title: '12. 聯繫及投訴' },
];

const sections_en = [
  { id: 'collection', title: '1. Data Collection' },
  { id: 'purpose', title: '2. Purpose of Collection (DPP1)' },
  { id: 'use', title: '3. Use of Data (DPP3)' },
  { id: 'retention', title: '4. Data Retention (DPP2)' },
  { id: 'security', title: '5. Data Security (DPP4)' },
  { id: 'thirdparty', title: '6. Third-Party Services' },
  { id: 'rights', title: '7. Data Subject Rights' },
  { id: 'cookies', title: '8. Cookies & Tracking' },
  { id: 'transfer', title: '9. Cross-Border Transfer' },
  { id: 'children', title: '10. Children\'s Privacy' },
  { id: 'updates', title: '11. Policy Updates' },
  { id: 'contact', title: '12. Contact & Complaints' },
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
    width: 260,
    minWidth: 220,
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
  subSectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#115e59',
    marginTop: 20,
    marginBottom: 8,
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
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: 16,
    fontSize: 13,
  },
  th: {
    background: '#f0fdfa',
    padding: '10px 14px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#0d9488',
    border: '1px solid #e5e7eb',
  },
  td: {
    padding: '10px 14px',
    border: '1px solid #e5e7eb',
    color: '#374151',
  },
  callout: {
    background: '#f0fdfa',
    border: '1px solid #99f6e4',
    borderRadius: 8,
    padding: '14px 18px',
    marginBottom: 16,
    fontSize: 13,
    color: '#115e59',
    lineHeight: 1.7,
  },
  divider: {
    border: 'none',
    borderTop: '1px solid #e5e7eb',
    margin: '32px 0',
  },
};

const printCSS = `
@media print {
  .pp-sidebar, .pp-topbar { display: none !important; }
  .pp-wrapper { background: #fff !important; padding: 0 !important; }
  .pp-main { box-shadow: none !important; padding: 20px !important; }
  table { page-break-inside: avoid; }
}
`;

export default function PrivacyPolicy({ onBack }) {
  const [lang, setLang] = useState('zh');
  const contentRef = useRef(null);
  const [hoveredItem, setHoveredItem] = useState(null);
  const clinicName = getClinicName();
  const clinicNameEn = getClinicNameEn();
  const privacyEmail = getTenantSettings()?.privacyEmail || getTenantSettings()?.contactEmail || 'privacy@clinic.com';

  const toc = lang === 'zh' ? sections_zh : sections_en;

  const scrollTo = (id) => {
    const el = document.getElementById(`pp-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePrint = () => window.print();

  return (
    <div className="pp-wrapper" style={styles.wrapper}>
      <style>{printCSS}</style>
      <div style={styles.container}>
        {/* Table of Contents Sidebar */}
        <div className="pp-sidebar" style={styles.sidebar}>
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
        <div className="pp-main" style={styles.main} ref={contentRef}>
          {/* Top Bar */}
          <div className="pp-topbar" style={styles.header}>
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
              <h1 style={styles.title}>私隱政策</h1>
              <p style={styles.subtitle}>
                生效日期：{EFFECTIVE_DATE} &nbsp;|&nbsp; {clinicName}（{clinicNameEn}）
              </p>

              <div style={styles.callout}>
                本私隱政策根據《個人資料（私隱）條例》（香港法例第486章）（「PDPO」）制定，旨在告知閣下我們如何收集、使用、保存、保護和處理閣下的個人資料。我們致力保障閣下的私隱權利。
              </div>

              <hr style={styles.divider} />

              {/* 1. 資料收集 */}
              <h2 id="pp-collection" style={styles.sectionTitle}>1. 資料收集</h2>
              <p style={styles.paragraph}>
                我們在提供服務過程中可能收集以下類別的個人資料：
              </p>

              <h3 style={styles.subSectionTitle}>1.1 病人資料</h3>
              <ul style={styles.list}>
                <li style={styles.listItem}>姓名、性別、出生日期</li>
                <li style={styles.listItem}>聯絡電話、電郵地址、通訊地址</li>
                <li style={styles.listItem}>身份證號碼（如適用，例如長者醫療券核實）</li>
                <li style={styles.listItem}>病歷記錄、過敏資料、主訴症狀</li>
                <li style={styles.listItem}>診斷結果、處方記錄、配藥紀錄</li>
                <li style={styles.listItem}>預約記錄及掛號紀錄</li>
                <li style={styles.listItem}>假紙及病假記錄</li>
              </ul>

              <h3 style={styles.subSectionTitle}>1.2 用戶（員工）資料</h3>
              <ul style={styles.list}>
                <li style={styles.listItem}>登入憑證（用戶名及加密密碼）</li>
                <li style={styles.listItem}>姓名、角色及權限設定</li>
                <li style={styles.listItem}>使用紀錄及審計日誌</li>
                <li style={styles.listItem}>排班及假期記錄</li>
              </ul>

              <h3 style={styles.subSectionTitle}>1.3 帳單及財務資料</h3>
              <ul style={styles.list}>
                <li style={styles.listItem}>收費記錄及付款方式</li>
                <li style={styles.listItem}>訂閱付款資料（由 Stripe 處理，我們不直接儲存完整信用卡號碼）</li>
                <li style={styles.listItem}>營業紀錄、開支紀錄、應收應付帳目</li>
              </ul>

              <h3 style={styles.subSectionTitle}>1.4 通訊資料</h3>
              <ul style={styles.list}>
                <li style={styles.listItem}>WhatsApp 訊息紀錄（CRM 功能）</li>
                <li style={styles.listItem}>電郵通訊記錄</li>
                <li style={styles.listItem}>查詢表單提交記錄</li>
              </ul>

              {/* 2. 收集目的 (DPP1) */}
              <h2 id="pp-purpose" style={styles.sectionTitle}>2. 收集目的（保障資料第1原則）</h2>
              <p style={styles.paragraph}>
                根據 PDPO 保障資料第1原則（DPP1），個人資料只會為直接有關的合法目的而收集。我們收集個人資料的目的包括：
              </p>
              <ul style={styles.list}>
                <li style={styles.listItem}><strong>醫療服務提供：</strong>記錄病歷、管理診斷及治療方案、配藥及處方管理</li>
                <li style={styles.listItem}><strong>預約管理：</strong>安排、確認及管理病人預約，掛號排隊</li>
                <li style={styles.listItem}><strong>帳單及會計：</strong>處理收費、生成收據、管理應收應付帳目</li>
                <li style={styles.listItem}><strong>客戶溝通：</strong>透過 WhatsApp 及電郵發送預約提醒、覆診提醒、促銷訊息（僅限已同意者）</li>
                <li style={styles.listItem}><strong>員工管理：</strong>排班、薪資計算、假期管理及績效分析</li>
                <li style={styles.listItem}><strong>庫存管理：</strong>追蹤藥物及商品庫存</li>
                <li style={styles.listItem}><strong>法規遵從：</strong>遵守香港法例要求，包括醫療紀錄保存義務</li>
                <li style={styles.listItem}><strong>服務改善：</strong>分析使用模式以改善平台功能（使用匿名化數據）</li>
              </ul>

              {/* 3. 數據使用 (DPP3) */}
              <h2 id="pp-use" style={styles.sectionTitle}>3. 數據使用（保障資料第3原則）</h2>
              <p style={styles.paragraph}>
                根據 PDPO 保障資料第3原則（DPP3），個人資料只會用於收集時所述的目的或直接相關的目的，除非獲得資料當事人同意。
              </p>
              <p style={styles.paragraph}>
                3.1 &nbsp; 我們不會在未經閣下同意的情況下，將閣下的個人資料用於與收集目的無關的用途。
              </p>
              <p style={styles.paragraph}>
                3.2 &nbsp; <strong>AI 功能：</strong>本平台使用 Anthropic 提供的人工智能功能。傳送至 AI 的數據將進行匿名化處理。AI 功能僅用於輔助分析，不會用於自動化決策。
              </p>
              <p style={styles.paragraph}>
                3.3 &nbsp; <strong>營銷通訊：</strong>我們僅在病人明確同意（opt-in）的情況下發送推廣訊息。病人可隨時撤回同意。
              </p>

              {/* 4. 數據保留 (DPP2) */}
              <h2 id="pp-retention" style={styles.sectionTitle}>4. 數據保留（保障資料第2原則）</h2>
              <p style={styles.paragraph}>
                根據 PDPO 保障資料第2原則（DPP2），個人資料不會保留超過達成其收集目的所需的期限。我們的資料保留期限如下：
              </p>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>資料類別</th>
                    <th style={styles.th}>保留期限</th>
                    <th style={styles.th}>依據</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={styles.td}>醫療記錄</td>
                    <td style={styles.td}>7 年</td>
                    <td style={styles.td}>香港醫療慣例及時效條例</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>財務記錄</td>
                    <td style={styles.td}>7 年</td>
                    <td style={styles.td}>稅務條例</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>預約記錄</td>
                    <td style={styles.td}>2 年</td>
                    <td style={styles.td}>營運需要</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>通訊記錄</td>
                    <td style={styles.td}>1 年</td>
                    <td style={styles.td}>客戶服務</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>審計日誌</td>
                    <td style={styles.td}>3 年</td>
                    <td style={styles.td}>安全及合規</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>同意記錄</td>
                    <td style={styles.td}>同意撤回後 3 年</td>
                    <td style={styles.td}>合規證明</td>
                  </tr>
                </tbody>
              </table>
              <p style={styles.paragraph}>
                保留期限屆滿後，資料將被安全銷毀或不可逆地匿名化。
              </p>

              {/* 5. 數據安全 (DPP4) */}
              <h2 id="pp-security" style={styles.sectionTitle}>5. 數據安全（保障資料第4原則）</h2>
              <p style={styles.paragraph}>
                根據 PDPO 保障資料第4原則（DPP4），我們採取一切切實可行的步驟，保障個人資料不受未經授權或意外的存取、處理、刪除、遺失或使用。
              </p>
              <ul style={styles.list}>
                <li style={styles.listItem}><strong>傳輸加密：</strong>所有數據傳輸均使用 HTTPS/TLS 加密</li>
                <li style={styles.listItem}><strong>靜態加密：</strong>資料庫中的資料經 AES-256 加密儲存</li>
                <li style={styles.listItem}><strong>存取控制：</strong>基於角色的存取控制（RBAC），確保用戶只能存取其權限範圍內的資料</li>
                <li style={styles.listItem}><strong>審計日誌：</strong>所有敏感操作均有完整的審計記錄</li>
                <li style={styles.listItem}><strong>自動登出：</strong>閒置 30 分鐘後自動登出</li>
                <li style={styles.listItem}><strong>密碼安全：</strong>密碼經雜湊處理儲存，不以明文保存</li>
                <li style={styles.listItem}><strong>定期審查：</strong>定期進行安全性審查及漏洞評估</li>
                <li style={styles.listItem}><strong>數據備份：</strong>自動定期備份，確保數據可恢復性</li>
              </ul>

              {/* 6. 第三方服務 */}
              <h2 id="pp-thirdparty" style={styles.sectionTitle}>6. 第三方服務</h2>
              <p style={styles.paragraph}>
                為提供本服務，我們使用以下第三方服務供應商。這些供應商可能會在其各自的系統中處理閣下的部分資料：
              </p>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>服務供應商</th>
                    <th style={styles.th}>用途</th>
                    <th style={styles.th}>處理的資料</th>
                    <th style={styles.th}>資料位置</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={styles.td}>Supabase</td>
                    <td style={styles.td}>資料庫託管及驗證</td>
                    <td style={styles.td}>所有應用程式數據</td>
                    <td style={styles.td}>新加坡 / 美國</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>Stripe</td>
                    <td style={styles.td}>訂閱付款處理</td>
                    <td style={styles.td}>帳單及付款資料</td>
                    <td style={styles.td}>美國</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>Anthropic</td>
                    <td style={styles.td}>AI 輔助功能</td>
                    <td style={styles.td}>匿名化的查詢數據</td>
                    <td style={styles.td}>美國</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>Vercel</td>
                    <td style={styles.td}>前端應用程式託管</td>
                    <td style={styles.td}>存取日誌</td>
                    <td style={styles.td}>全球 CDN</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>Resend</td>
                    <td style={styles.td}>電郵發送服務</td>
                    <td style={styles.td}>電郵地址及內容</td>
                    <td style={styles.td}>美國</td>
                  </tr>
                </tbody>
              </table>
              <p style={styles.paragraph}>
                我們已審查上述各服務供應商的私隱及安全措施，以確保其符合適當的資料保護標準。
              </p>

              {/* 7. 數據主體權利 */}
              <h2 id="pp-rights" style={styles.sectionTitle}>7. 數據主體權利（PDPO 第18/22條）</h2>
              <p style={styles.paragraph}>
                根據 PDPO 第18條及第22條，閣下享有以下權利：
              </p>
              <ul style={styles.list}>
                <li style={styles.listItem}>
                  <strong>查閱權（第18條）：</strong>閣下有權要求查閱我們所持有的閣下個人資料的副本。我們將於收到書面要求後40天內回覆。
                </li>
                <li style={styles.listItem}>
                  <strong>更正權（第22條）：</strong>閣下有權要求更正我們所持有的不準確個人資料。
                </li>
                <li style={styles.listItem}>
                  <strong>刪除權：</strong>在保留期限屆滿且無其他法律義務需保留的情況下，閣下可要求刪除個人資料。
                </li>
                <li style={styles.listItem}>
                  <strong>撤回同意：</strong>閣下可隨時撤回之前授予的任何同意（例如營銷通訊同意）。
                </li>
              </ul>

              <div style={styles.callout}>
                <strong>如何提出資料查閱/更正要求：</strong><br/>
                1. 登入本平台後，前往「私隱中心」提交資料主體存取要求（DSAR）<br/>
                2. 或以書面形式（電郵或信函）向我們的私隱專員提出要求<br/>
                3. 我們可能需要核實閣下的身份後方能處理要求<br/>
                4. 我們可能會按 PDPO 規定收取合理費用
              </div>

              {/* 8. Cookies 與追蹤 */}
              <h2 id="pp-cookies" style={styles.sectionTitle}>8. Cookies 與追蹤</h2>
              <p style={styles.paragraph}>
                8.1 &nbsp; 本平台僅使用<strong>必要的會話 Cookie</strong>（Session Cookies），用於維持閣下的登入狀態及安全性。
              </p>
              <p style={styles.paragraph}>
                8.2 &nbsp; 我們<strong>不使用</strong>第三方追蹤 Cookie、廣告追蹤器或社交媒體追蹤像素。
              </p>
              <p style={styles.paragraph}>
                8.3 &nbsp; 我們使用本地儲存（localStorage）保存用戶偏好設定（如主題選擇、語言設定），但不會追蹤閣下在其他網站上的活動。
              </p>

              {/* 9. 跨境傳輸 */}
              <h2 id="pp-transfer" style={styles.sectionTitle}>9. 跨境傳輸</h2>
              <p style={styles.paragraph}>
                9.1 &nbsp; 由於我們使用雲端服務，閣下的部分資料可能會傳輸至及儲存於香港以外的地區（主要包括新加坡及美國）。
              </p>
              <p style={styles.paragraph}>
                9.2 &nbsp; 我們確保資料的跨境傳輸符合 PDPO 的要求，並已採取適當措施保護資料安全，包括要求服務供應商遵守相應的資料保護標準。
              </p>
              <p style={styles.paragraph}>
                9.3 &nbsp; PDPO 第33條（雖尚未全面實施）的精神已納入我們的資料傳輸實務中。
              </p>

              {/* 10. 兒童私隱 */}
              <h2 id="pp-children" style={styles.sectionTitle}>10. 兒童私隱</h2>
              <p style={styles.paragraph}>
                10.1 &nbsp; 本平台為診所管理系統，主要由診所員工使用，並非針對兒童設計的服務。
              </p>
              <p style={styles.paragraph}>
                10.2 &nbsp; 如病人為18歲以下的未成年人，其個人資料的收集及處理須獲得其父母或監護人的同意。
              </p>
              <p style={styles.paragraph}>
                10.3 &nbsp; 我們對未成年病人的資料施以與成年病人相同或更高標準的保護措施。
              </p>

              {/* 11. 政策更新 */}
              <h2 id="pp-updates" style={styles.sectionTitle}>11. 政策更新</h2>
              <p style={styles.paragraph}>
                11.1 &nbsp; 我們可能會不時更新本私隱政策。任何重大變更將透過平台內通知或電郵方式告知閣下。
              </p>
              <p style={styles.paragraph}>
                11.2 &nbsp; 更新後繼續使用本服務即表示閣下同意經修訂的政策。
              </p>
              <p style={styles.paragraph}>
                11.3 &nbsp; 本政策的先前版本可應要求提供。
              </p>

              {/* 12. 聯繫及投訴 */}
              <h2 id="pp-contact" style={styles.sectionTitle}>12. 聯繫方式及投訴渠道</h2>
              <p style={styles.paragraph}>
                如閣下對本私隱政策有任何疑問、意見或投訴，或希望行使閣下的資料主體權利，請聯繫：
              </p>
              <ul style={styles.list}>
                <li style={styles.listItem}><strong>機構名稱：</strong>{clinicName}</li>
                <li style={styles.listItem}><strong>私隱專員：</strong>資料保護主任</li>
                <li style={styles.listItem}><strong>電郵：</strong>{privacyEmail}</li>
                <li style={styles.listItem}><strong>地區：</strong>香港特別行政區</li>
              </ul>

              <div style={styles.callout}>
                <strong>向個人資料私隱專員公署投訴：</strong><br/>
                如閣下認為我們未能妥善處理閣下的個人資料，閣下有權向香港個人資料私隱專員公署（PCPD）作出投訴：<br/><br/>
                個人資料私隱專員公署<br/>
                地址：香港灣仔皇后大道東248號陽光中心12樓<br/>
                電話：(852) 2827 2827<br/>
                傳真：(852) 2877 7026<br/>
                電郵：complaints@pcpd.org.hk<br/>
                網址：www.pcpd.org.hk
              </div>

              <hr style={styles.divider} />
              <p style={{ ...styles.paragraph, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                &copy; {new Date().getFullYear()} {clinicName}。保留所有權利。
              </p>
            </>
          ) : (
            /* ── English Version ── */
            <>
              <h1 style={styles.title}>Privacy Policy</h1>
              <p style={styles.subtitle}>
                Effective Date: {EFFECTIVE_DATE} &nbsp;|&nbsp; {clinicNameEn} ({clinicName})
              </p>

              <div style={styles.callout}>
                This Privacy Policy is prepared in accordance with the Personal Data (Privacy) Ordinance (Cap. 486, Laws of Hong Kong) ("PDPO") and is intended to inform you about how we collect, use, retain, protect, and handle your personal data. We are committed to safeguarding your privacy rights.
              </div>

              <hr style={styles.divider} />

              {/* 1. Data Collection */}
              <h2 id="pp-collection" style={styles.sectionTitle}>1. Data Collection</h2>
              <p style={styles.paragraph}>
                We may collect the following categories of personal data in the course of providing our services:
              </p>

              <h3 style={styles.subSectionTitle}>1.1 Patient Data</h3>
              <ul style={styles.list}>
                <li style={styles.listItem}>Name, gender, date of birth</li>
                <li style={styles.listItem}>Phone number, email address, correspondence address</li>
                <li style={styles.listItem}>HKID number (where applicable, e.g., for Elderly Health Care Voucher verification)</li>
                <li style={styles.listItem}>Medical history, allergy information, chief complaints</li>
                <li style={styles.listItem}>Diagnosis results, prescription records, dispensing records</li>
                <li style={styles.listItem}>Appointment and queue registration records</li>
                <li style={styles.listItem}>Sick leave certificates and records</li>
              </ul>

              <h3 style={styles.subSectionTitle}>1.2 User (Staff) Data</h3>
              <ul style={styles.list}>
                <li style={styles.listItem}>Login credentials (username and hashed password)</li>
                <li style={styles.listItem}>Name, role, and permission settings</li>
                <li style={styles.listItem}>Usage records and audit logs</li>
                <li style={styles.listItem}>Schedule and leave records</li>
              </ul>

              <h3 style={styles.subSectionTitle}>1.3 Billing and Financial Data</h3>
              <ul style={styles.list}>
                <li style={styles.listItem}>Billing records and payment methods</li>
                <li style={styles.listItem}>Subscription payment information (processed by Stripe; we do not directly store full credit card numbers)</li>
                <li style={styles.listItem}>Revenue records, expense records, accounts receivable/payable</li>
              </ul>

              <h3 style={styles.subSectionTitle}>1.4 Communication Data</h3>
              <ul style={styles.list}>
                <li style={styles.listItem}>WhatsApp message records (CRM function)</li>
                <li style={styles.listItem}>Email communication records</li>
                <li style={styles.listItem}>Inquiry form submissions</li>
              </ul>

              {/* 2. Purpose of Collection (DPP1) */}
              <h2 id="pp-purpose" style={styles.sectionTitle}>2. Purpose of Collection (Data Protection Principle 1)</h2>
              <p style={styles.paragraph}>
                In accordance with DPP1 of the PDPO, personal data shall only be collected for a lawful purpose directly related to a function or activity. Our purposes for collecting personal data include:
              </p>
              <ul style={styles.list}>
                <li style={styles.listItem}><strong>Healthcare Service Delivery:</strong> Recording medical histories, managing diagnoses and treatment plans, dispensing and prescription management</li>
                <li style={styles.listItem}><strong>Appointment Management:</strong> Scheduling, confirming, and managing patient appointments and queue registration</li>
                <li style={styles.listItem}><strong>Billing and Accounting:</strong> Processing charges, generating receipts, managing accounts receivable/payable</li>
                <li style={styles.listItem}><strong>Customer Communication:</strong> Sending appointment reminders, follow-up reminders, and promotional messages via WhatsApp and email (only to those who have consented)</li>
                <li style={styles.listItem}><strong>Staff Management:</strong> Scheduling, payroll calculation, leave management, and performance analysis</li>
                <li style={styles.listItem}><strong>Inventory Management:</strong> Tracking medicine and product inventory</li>
                <li style={styles.listItem}><strong>Regulatory Compliance:</strong> Complying with Hong Kong legal requirements, including medical record retention obligations</li>
                <li style={styles.listItem}><strong>Service Improvement:</strong> Analyzing usage patterns to improve platform features (using anonymized data)</li>
              </ul>

              {/* 3. Use of Data (DPP3) */}
              <h2 id="pp-use" style={styles.sectionTitle}>3. Use of Data (Data Protection Principle 3)</h2>
              <p style={styles.paragraph}>
                In accordance with DPP3 of the PDPO, personal data shall only be used for the purpose for which it was collected, or a directly related purpose, unless the data subject has given consent.
              </p>
              <p style={styles.paragraph}>
                3.1 &nbsp; We will not use your personal data for purposes unrelated to the collection purpose without your consent.
              </p>
              <p style={styles.paragraph}>
                3.2 &nbsp; <strong>AI Features:</strong> The Platform uses artificial intelligence features provided by Anthropic. Data transmitted to AI is anonymized. AI features are used solely for analytical assistance and are not used for automated decision-making.
              </p>
              <p style={styles.paragraph}>
                3.3 &nbsp; <strong>Marketing Communications:</strong> We only send promotional messages to patients who have explicitly opted in. Patients may withdraw consent at any time.
              </p>

              {/* 4. Data Retention (DPP2) */}
              <h2 id="pp-retention" style={styles.sectionTitle}>4. Data Retention (Data Protection Principle 2)</h2>
              <p style={styles.paragraph}>
                In accordance with DPP2 of the PDPO, personal data shall not be kept longer than is necessary for the fulfillment of its collection purpose. Our data retention periods are as follows:
              </p>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Data Category</th>
                    <th style={styles.th}>Retention Period</th>
                    <th style={styles.th}>Basis</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={styles.td}>Medical Records</td>
                    <td style={styles.td}>7 years</td>
                    <td style={styles.td}>HK medical practice & Limitation Ordinance</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>Financial Records</td>
                    <td style={styles.td}>7 years</td>
                    <td style={styles.td}>Inland Revenue Ordinance</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>Appointment Records</td>
                    <td style={styles.td}>2 years</td>
                    <td style={styles.td}>Operational need</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>Communication Logs</td>
                    <td style={styles.td}>1 year</td>
                    <td style={styles.td}>Customer service</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>Audit Logs</td>
                    <td style={styles.td}>3 years</td>
                    <td style={styles.td}>Security & compliance</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>Consent Records</td>
                    <td style={styles.td}>3 years after withdrawal</td>
                    <td style={styles.td}>Compliance evidence</td>
                  </tr>
                </tbody>
              </table>
              <p style={styles.paragraph}>
                After the retention period expires, data will be securely destroyed or irreversibly anonymized.
              </p>

              {/* 5. Data Security (DPP4) */}
              <h2 id="pp-security" style={styles.sectionTitle}>5. Data Security (Data Protection Principle 4)</h2>
              <p style={styles.paragraph}>
                In accordance with DPP4 of the PDPO, we take all practicable steps to safeguard personal data from unauthorized or accidental access, processing, erasure, loss, or use.
              </p>
              <ul style={styles.list}>
                <li style={styles.listItem}><strong>Encryption in Transit:</strong> All data transmissions are encrypted using HTTPS/TLS</li>
                <li style={styles.listItem}><strong>Encryption at Rest:</strong> Database data is stored with AES-256 encryption</li>
                <li style={styles.listItem}><strong>Access Controls:</strong> Role-Based Access Control (RBAC) ensures users can only access data within their permissions</li>
                <li style={styles.listItem}><strong>Audit Logging:</strong> All sensitive operations have complete audit trails</li>
                <li style={styles.listItem}><strong>Auto Logout:</strong> Automatic session timeout after 30 minutes of inactivity</li>
                <li style={styles.listItem}><strong>Password Security:</strong> Passwords are stored as hashes, never in plain text</li>
                <li style={styles.listItem}><strong>Regular Reviews:</strong> Periodic security reviews and vulnerability assessments</li>
                <li style={styles.listItem}><strong>Data Backups:</strong> Automatic periodic backups to ensure data recoverability</li>
              </ul>

              {/* 6. Third-Party Services */}
              <h2 id="pp-thirdparty" style={styles.sectionTitle}>6. Third-Party Services</h2>
              <p style={styles.paragraph}>
                To deliver our Service, we use the following third-party service providers. These providers may process certain data within their respective systems:
              </p>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Provider</th>
                    <th style={styles.th}>Purpose</th>
                    <th style={styles.th}>Data Processed</th>
                    <th style={styles.th}>Data Location</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={styles.td}>Supabase</td>
                    <td style={styles.td}>Database hosting & auth</td>
                    <td style={styles.td}>All application data</td>
                    <td style={styles.td}>Singapore / US</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>Stripe</td>
                    <td style={styles.td}>Subscription payment processing</td>
                    <td style={styles.td}>Billing & payment data</td>
                    <td style={styles.td}>US</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>Anthropic</td>
                    <td style={styles.td}>AI-assisted features</td>
                    <td style={styles.td}>Anonymized query data</td>
                    <td style={styles.td}>US</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>Vercel</td>
                    <td style={styles.td}>Frontend application hosting</td>
                    <td style={styles.td}>Access logs</td>
                    <td style={styles.td}>Global CDN</td>
                  </tr>
                  <tr>
                    <td style={styles.td}>Resend</td>
                    <td style={styles.td}>Email delivery service</td>
                    <td style={styles.td}>Email addresses & content</td>
                    <td style={styles.td}>US</td>
                  </tr>
                </tbody>
              </table>
              <p style={styles.paragraph}>
                We have reviewed the privacy and security practices of all the above service providers to ensure they meet appropriate data protection standards.
              </p>

              {/* 7. Data Subject Rights */}
              <h2 id="pp-rights" style={styles.sectionTitle}>7. Data Subject Rights (PDPO Sections 18/22)</h2>
              <p style={styles.paragraph}>
                Under Sections 18 and 22 of the PDPO, you have the following rights:
              </p>
              <ul style={styles.list}>
                <li style={styles.listItem}>
                  <strong>Right of Access (Section 18):</strong> You have the right to request a copy of your personal data held by us. We will respond within 40 days of receiving your written request.
                </li>
                <li style={styles.listItem}>
                  <strong>Right of Correction (Section 22):</strong> You have the right to request the correction of inaccurate personal data held by us.
                </li>
                <li style={styles.listItem}>
                  <strong>Right of Deletion:</strong> Where the retention period has expired and there is no other legal obligation to retain the data, you may request its deletion.
                </li>
                <li style={styles.listItem}>
                  <strong>Withdrawal of Consent:</strong> You may withdraw any previously granted consent (e.g., marketing communication consent) at any time.
                </li>
              </ul>

              <div style={styles.callout}>
                <strong>How to Make a Data Access/Correction Request:</strong><br/>
                1. After logging in to the Platform, go to "Privacy Center" to submit a Data Subject Access Request (DSAR)<br/>
                2. Alternatively, submit your request in writing (by email or letter) to our Privacy Officer<br/>
                3. We may need to verify your identity before processing your request<br/>
                4. We may charge a reasonable fee as permitted under the PDPO
              </div>

              {/* 8. Cookies & Tracking */}
              <h2 id="pp-cookies" style={styles.sectionTitle}>8. Cookies &amp; Tracking</h2>
              <p style={styles.paragraph}>
                8.1 &nbsp; The Platform uses only <strong>essential session cookies</strong> to maintain your login status and security.
              </p>
              <p style={styles.paragraph}>
                8.2 &nbsp; We <strong>do not use</strong> third-party tracking cookies, advertising trackers, or social media tracking pixels.
              </p>
              <p style={styles.paragraph}>
                8.3 &nbsp; We use local storage (localStorage) to save user preferences (such as theme selection and language settings) but do not track your activity on other websites.
              </p>

              {/* 9. Cross-Border Transfer */}
              <h2 id="pp-transfer" style={styles.sectionTitle}>9. Cross-Border Transfer</h2>
              <p style={styles.paragraph}>
                9.1 &nbsp; As we use cloud services, some of your data may be transferred to and stored in regions outside Hong Kong (primarily Singapore and the United States).
              </p>
              <p style={styles.paragraph}>
                9.2 &nbsp; We ensure that cross-border data transfers comply with the PDPO and have taken appropriate measures to protect data security, including requiring service providers to adhere to corresponding data protection standards.
              </p>
              <p style={styles.paragraph}>
                9.3 &nbsp; The spirit of Section 33 of the PDPO (although not yet fully implemented) has been incorporated into our data transfer practices.
              </p>

              {/* 10. Children's Privacy */}
              <h2 id="pp-children" style={styles.sectionTitle}>10. Children's Privacy</h2>
              <p style={styles.paragraph}>
                10.1 &nbsp; The Platform is a clinic management system primarily used by clinic staff and is not designed for children.
              </p>
              <p style={styles.paragraph}>
                10.2 &nbsp; Where a patient is a minor under the age of 18, the collection and processing of their personal data requires the consent of a parent or guardian.
              </p>
              <p style={styles.paragraph}>
                10.3 &nbsp; We apply the same or higher level of protection to minor patients' data as we do to adult patients.
              </p>

              {/* 11. Policy Updates */}
              <h2 id="pp-updates" style={styles.sectionTitle}>11. Policy Updates</h2>
              <p style={styles.paragraph}>
                11.1 &nbsp; We may update this Privacy Policy from time to time. Any material changes will be communicated to you through in-app notifications or email.
              </p>
              <p style={styles.paragraph}>
                11.2 &nbsp; Continued use of the Service after an update constitutes your acceptance of the revised policy.
              </p>
              <p style={styles.paragraph}>
                11.3 &nbsp; Previous versions of this policy are available upon request.
              </p>

              {/* 12. Contact & Complaints */}
              <h2 id="pp-contact" style={styles.sectionTitle}>12. Contact &amp; Complaints</h2>
              <p style={styles.paragraph}>
                If you have any questions, comments, or complaints about this Privacy Policy, or wish to exercise your data subject rights, please contact:
              </p>
              <ul style={styles.list}>
                <li style={styles.listItem}><strong>Organization:</strong> {clinicNameEn}</li>
                <li style={styles.listItem}><strong>Privacy Officer:</strong> Data Protection Officer</li>
                <li style={styles.listItem}><strong>Email:</strong> {privacyEmail}</li>
                <li style={styles.listItem}><strong>Location:</strong> Hong Kong SAR</li>
              </ul>

              <div style={styles.callout}>
                <strong>Filing a Complaint with the Privacy Commissioner:</strong><br/>
                If you believe we have not handled your personal data properly, you have the right to lodge a complaint with the Office of the Privacy Commissioner for Personal Data (PCPD):<br/><br/>
                Office of the Privacy Commissioner for Personal Data<br/>
                Address: 12/F, Sunlight Tower, 248 Queen's Road East, Wanchai, Hong Kong<br/>
                Phone: (852) 2827 2827<br/>
                Fax: (852) 2877 7026<br/>
                Email: complaints@pcpd.org.hk<br/>
                Website: www.pcpd.org.hk
              </div>

              <hr style={styles.divider} />
              <p style={{ ...styles.paragraph, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                &copy; {new Date().getFullYear()} {clinicNameEn}. All rights reserved.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
