# 康晴診所 SEO + Google Review 管理系統 — 實施計劃

## 📋 系統概覽

喺現有嘅康晴診所管理系統（React + Vite + Supabase）入面加入 **4 個新模組**，放喺 `客戶` 同 `分析` section：

### 新模組
| 模組 | Page ID | Section | 描述 |
|------|---------|---------|------|
| 🌐 Google 評價管理 | `googlereview` | 客戶 | WhatsApp 自動邀請病人留 Google Review、追蹤評價、AI 回覆建議 |
| 📈 SEO 儀表板 | `seodash` | 分析 | 網站 SEO 分數、關鍵字排名追蹤、競爭對手分析、本地 SEO 狀態 |
| ✍️ AI 內容生成 | `seocontent` | 客戶 | AI 生成 SEO 友好嘅健康文章、Blog 內容、Meta Description |
| 📊 廣告管理 | `admanager` | 分析 | Google Ads / Facebook Ads 表現追蹤、預算管理、ROI 分析 |

---

## 🏗️ 技術架構

### 遵從現有模式
- **Component 風格**: JSX + inline styles（同現有組件一樣）
- **數據層**: Supabase + localStorage fallback
- **API**: Vercel serverless functions (`/api/` 目錄)
- **UI**: 跟現有 `ACCENT = '#0e7490'` 主題色
- **Lazy loading**: 所有新頁面用 `lazy(() => import(...))`

### 新增外部服務
- **WhatsApp Business API** (via Twilio) — 發送 Review 邀請
- **Google Business Profile API** — 讀取 Google Reviews
- **Google Search Console API** — SEO 數據
- **Google PageSpeed Insights API** — 網站速度分析
- **OpenAI / Claude API** — AI 內容生成（已有 `/api/ai` endpoint）
- **Google Ads API** — 廣告數據（可選）

---

## 📁 新增檔案清單

### Components（`src/components/`）
```
GoogleReviewManager.jsx    — Google 評價管理主頁面
SEODashboard.jsx           — SEO 儀表板
SEOContentGenerator.jsx    — AI 內容生成器
AdManager.jsx              — 廣告管理面板
```

### API Routes（`api/`）
```
api/reviews.js             — Google Review CRUD + WhatsApp 發送
api/seo.js                 — SEO 分析 API（PageSpeed、關鍵字）
api/seo-content.js         — AI 內容生成 API
api/ads.js                 — 廣告數據 API
```

### Database（Supabase 新表）
```
review_requests            — Review 邀請記錄
review_responses           — Google Review 回覆
seo_keywords               — 追蹤關鍵字
seo_audits                 — SEO 審計歷史
seo_content                — AI 生成嘅內容
ad_campaigns               — 廣告活動記錄
ad_spend                   — 廣告花費追蹤
```

---

## 🔧 各模組詳細設計

### 模組 1: Google 評價管理 (`GoogleReviewManager.jsx`)

**Tabs**: 邀請管理 | 評價追蹤 | 回覆管理 | 數據分析

#### 1.1 邀請管理 Tab
- 從病人列表揀選病人（連結 `data.patients`）
- 批量/單個發送 WhatsApp 邀請訊息
- 訊息範本可自定（內建 3 個範本）
- 設定自動發送規則（例：診症後 24 小時自動發）
- 發送記錄 + 狀態追蹤（待發送/已發送/已點擊/已評價）

**WhatsApp 訊息範本（默認）**:
```
{{姓名}}您好！感謝選擇{{診所}}。
如果滿意我們的服務，歡迎留個 Google 評價支持我們 🙏
{{review_link}}
```

#### 1.2 評價追蹤 Tab
- 顯示最新 Google Reviews（星級、內容、日期）
- 篩選：全部 / 正面(4-5星) / 負面(1-3星)
- 統計：平均星級、總評價數、月增長趨勢（Recharts 圖表）

#### 1.3 回覆管理 Tab
- 列出未回覆嘅評價
- AI 建議回覆（調用現有 `/api/ai`）
- 一鍵回覆（需 Google Business Profile API 授權）

#### 1.4 數據分析 Tab
- 評價趨勢圖（月度）
- 星級分佈圓餅圖
- 邀請→評價轉化率
- 與同區診所比較（可選）

---

### 模組 2: SEO 儀表板 (`SEODashboard.jsx`)

**Tabs**: 總覽 | 關鍵字排名 | 網站審計 | 本地SEO | 競爭分析

#### 2.1 總覽 Tab
- SEO 總分（0-100）
- 重要指標卡片：Page Speed、Mobile Score、Core Web Vitals
- 自然搜尋流量趨勢（如有 Search Console）
- 待處理問題清單

#### 2.2 關鍵字排名 Tab
- 添加追蹤關鍵字（例：「中醫 宋皇臺」「針灸 太子」）
- 每日排名更新
- 排名趨勢圖
- 搜尋量估算

#### 2.3 網站審計 Tab
- Meta Tags 檢查（Title、Description、H1）
- 圖片 Alt Text 檢查
- 載入速度分析
- Mobile Friendly 測試
- Sitemap 狀態
- 建議改進項目清單

#### 2.4 本地 SEO Tab
- Google Business Profile 完整度
- NAP 一致性（Name、Address、Phone）
- 本地引用列表
- Google Maps 排名

#### 2.5 競爭對手分析 Tab
- 輸入競爭對手網址
- 對比 SEO 指標
- 關鍵字差距分析

---

### 模組 3: AI 內容生成 (`SEOContentGenerator.jsx`)

**Tabs**: 文章生成 | 內容庫 | Meta 優化 | 社交媒體

#### 3.1 文章生成 Tab
- 選擇主題分類（中醫知識 / 健康貼士 / 疾病介紹 / 季節養生）
- 輸入關鍵字
- AI 生成 SEO 優化文章（800-1500字）
- 自動插入內部連結建議
- SEO 分數即時預覽

#### 3.2 內容庫 Tab
- 已生成文章列表
- 狀態管理：草稿/已發佈/已排期
- 搜尋 + 篩選

#### 3.3 Meta 優化 Tab
- 輸入頁面 URL
- AI 建議 Title Tag + Meta Description
- SERP 預覽

#### 3.4 社交媒體 Tab
- 從文章生成 Facebook / Instagram / WhatsApp 推廣文案
- 配合廣告管理模組

---

### 模組 4: 廣告管理 (`AdManager.jsx`)

**Tabs**: 活動總覽 | 預算管理 | ROI 分析 | 排期日曆

#### 4.1 活動總覽 Tab
- 手動記錄廣告活動（平台/名稱/日期/預算/目標）
- 狀態：進行中/已結束/草稿
- 關鍵指標：曝光/點擊/轉化/成本

#### 4.2 預算管理 Tab
- 月度預算設定 + 實際花費追蹤
- 每日花費趨勢
- 預算使用率警報

#### 4.3 ROI 分析 Tab
- 每個活動嘅投資回報計算
- 每次點擊成本 (CPC)
- 每次轉化成本 (CPA)
- 最佳表現活動排名

#### 4.4 排期日曆 Tab
- 日曆視圖顯示所有活動時間
- 拖拉調整日期

---

## 🔄 實施步驟（順序）

### Phase 1: 基礎設施
1. 新增 Supabase database tables（7 個表）
2. 新增 API routes（4 個 endpoint）
3. 更新 `App.jsx`（新增 4 個 lazy import + ALL_PAGES entries + page rendering）
4. 更新 `config.js`（新增 permission entries）

### Phase 2: Google 評價管理
5. 建立 `GoogleReviewManager.jsx`（完整 4 個 tabs）
6. 建立 `api/reviews.js`（WhatsApp + Google Reviews API）

### Phase 3: SEO 儀表板
7. 建立 `SEODashboard.jsx`（完整 5 個 tabs）
8. 建立 `api/seo.js`（PageSpeed + 關鍵字追蹤）

### Phase 4: AI 內容生成
9. 建立 `SEOContentGenerator.jsx`（完整 4 個 tabs）
10. 建立 `api/seo-content.js`（利用現有 AI endpoint）

### Phase 5: 廣告管理
11. 建立 `AdManager.jsx`（完整 4 個 tabs）
12. 建立 `api/ads.js`

### Phase 6: 整合測試
13. 測試各模組數據流
14. 測試 WhatsApp 發送功能
15. 確認 mobile responsive

---

## ⚙️ 環境變量（需要設定）

```env
# WhatsApp Business (Twilio)
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Google Business Profile
GOOGLE_BUSINESS_PROFILE_API_KEY=xxx
GOOGLE_PLACE_ID=xxx

# Google APIs
GOOGLE_SEARCH_CONSOLE_KEY=xxx
GOOGLE_PAGESPEED_API_KEY=xxx

# 已有
VITE_SUPABASE_URL=xxx
VITE_SUPABASE_ANON_KEY=xxx
```

---

## 📝 注意事項
- 所有組件遵從現有 inline style 模式
- 使用 `showToast()` 做通知
- 使用 `data` + `setData` pattern 做數據傳遞
- 所有文字用繁體中文
- 顏色沿用 `ACCENT = '#0e7490'`
- Recharts 用於所有圖表
