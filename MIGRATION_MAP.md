# eCTCM → 康晴 APP 功能遷移對照表

## eCTCM 完整功能（57 個頁面 + 27 個報表）

### 1. 個人管理
| eCTCM 功能 | 路徑 | 康晴 APP | 狀態 |
|-----------|------|---------|------|
| 我的日曆 | /SystemCalendar | ClinicCalendar | ✅ 有 |
| 我的常用藥管理 | /MyMedicinal | MyFormulas | ✅ 有 |
| 我的常用複方管理 | /MyCompound | MyFormulas | ✅ 有 |
| 我的自定義複方管理 | /MyCustomizeCompound | MyFormulas | ✅ 有 |
| 我的邀請 | /MyInvite | — | ❌ 缺 |
| 我的顧客 | /MyClient | PatientPage (filter) | ✅ 有 |
| 我的顧客評分 | /MyClientScore | PatientFeedback | ✅ 有 |
| 我的醫囑 | /DoctorAdvice | DoctorAdvice | ✅ 有 |
| 健康資訊管理 | /News | PatientEducation | ✅ 有 |
| 健康問答管理 | /Ask | — | ❌ 缺 |
| 自定義穴位管理 | /CustomAcupoint | AcupunctureChart | ✅ 有 |

### 2. 診所顧客列表
| eCTCM 功能 | 路徑 | 康晴 APP | 狀態 |
|-----------|------|---------|------|
| 掛號列表 | /ClientRegister | QueuePage | ✅ 有 |
| 網上預約列表 | /ClientOrderRegister | BookingPage | ✅ 有 |
| 顧客列表 | /Client | PatientPage | ✅ 有（+407已匯入）|
| 掛號 | /ClientRegister/ShowAdd | QueuePage (新增) | ✅ 有 |
| 醫師掛號表 | /ClientRegisterArrange | DoctorSchedule | ✅ 有 |

### 3. 診症列表
| eCTCM 功能 | 路徑 | 康晴 APP | 狀態 |
|-----------|------|---------|------|
| 診症列表 | /Consultation | ConsultationList | ✅ 有 |

### 4. 配藥/收費
| eCTCM 功能 | 路徑 | 康晴 APP | 狀態 |
|-----------|------|---------|------|
| 配藥/收費列表 | /DispenseMedicines | BillingPage | ✅ 有 |
| 診症收費賬單 | /InvoicePayment | BillingPage | ✅ 有 |
| 結算鎖定管理 | /ClinicLockDate | DailyClosing | ✅ 有 |
| 病歷資料修改記錄 | /ClientCaseHistoryLog | — | ⚠️ 需加 |
| 假紙記錄 | /SickLeave | MedicalCertificate | ✅ 有 |
| 顧客資料修改記錄 | /ClientDetail/EditHistory | — | ⚠️ 需加 |

### 5. 藥物管理
| eCTCM 功能 | 路徑 | 康晴 APP | 狀態 |
|-----------|------|---------|------|
| 中藥管理 | /ClinicMedicinalManagement | InventoryPage | ✅ 有 |
| 入貨管理 | /ClinicMedicinalPurchaseList | PurchaseOrders | ✅ 有 |
| 開藥日誌 | /PrescriptionLog | DispensingLog | ✅ 有 |

### 6. 商品管理
| eCTCM 功能 | 路徑 | 康晴 APP | 狀態 |
|-----------|------|---------|------|
| 我的商品 | /Product | ProductPage | ✅ 有 |
| 進貨管理 | /ProductStock | ProductOrders | ✅ 有 |
| 訂單管理 | /ProductOrder | ProductOrders | ✅ 有 |
| 收入統計報表 | /OrderRevenue | Reports | ✅ 有 |
| 服務及療程管理 | /ServiceMaster | — | ⚠️ 需加 |

### 7. 公司運作管理
| eCTCM 功能 | 路徑 | 康晴 APP | 狀態 |
|-----------|------|---------|------|
| 公司自訂短信管理 | /SMSTemplate | — | ⚠️ 需加 |
| 藥物收費及安全量設定 | /systemconfig | DrugPricing | ✅ 有 |
| 旗下診所管理 | /ClinicManagement | 設定 | ✅ 有 |
| 醫師上班時間列表 | /UserWorkTimeMaintenance | DoctorSchedule | ✅ 有 |
| 公司自訂醫囑管理 | /DoctorAdvice | DoctorAdvice | ✅ 有 |
| 數據備份中心 | /BackupTaskList | BackupCenter | ✅ 有 |
| 系統檢查 | /SystemCheck | — | ❌ 缺 |
| 招聘管理 | /Job | — | ❌ 缺 |
| 公司購買服務管理 | /CompanyPurchaseServiceMaster | — | ❌ 缺 |

### 8. 帳號管理
| eCTCM 功能 | 路徑 | 康晴 APP | 狀態 |
|-----------|------|---------|------|
| 用戶管理 | /UserManagement | 設定 (Staff) | ✅ 有 |
| 組維護 | /GroupManagement | — | ⚠️ 需加 |
| 假期管理 | /LeaveMainetenace | StaffRoster | ✅ 有 |
| 用戶假期列表 | /UserAway | StaffRoster | ✅ 有 |

### 9. 營運報表（27 個）
| eCTCM 報表 | 康晴 APP | 狀態 |
|-----------|---------|------|
| 醫師日常活動報表 | Reports (DoctorConsultRate) | ✅ 有 |
| 醫師覆診率報表 | Reports (RetentionAnalytics) | ✅ 有 |
| 醫師銷售統計報表 | ECTCMRevenue / Reports | ✅ 有 |
| 醫師處方統計報表 | Reports (PrescriptionStats) | ✅ 有 |
| 醫師反饋報表 | PatientFeedback | ✅ 有 |
| 藥物使用頻率報表 | Reports | ✅ 有 |
| 藥物日常活動報表 | Reports | ✅ 有 |
| 藥物安全量報表 | InventoryPage (低庫存) | ✅ 有 |
| 藥物修改日誌報表 | — | ⚠️ 需加 |
| 診所收入統計報表 | Reports / Dashboard | ✅ 有 |
| 收費總額報表 | Reports | ✅ 有 |
| 收費總額圖形報表 | FinancialDashboard | ✅ 有 |
| 醫療計劃使用報表 | — | ⚠️ 需加 |
| 醫療計劃購買報表 | — | ⚠️ 需加 |
| 服務使用頻率報表 | Reports (ServiceUsageReport) | ✅ 有 |
| 診所付款方式統計報表 | Reports (PaymentMethodReport) | ✅ 有 |
| 系統KPI報表 | Dashboard | ✅ 有 |
| 顧客年齡統計報表 | PatientDemographics | ✅ 有 |
| 顧客掛號信息統計報表 | Reports | ✅ 有 |
| 顧客分析報表 | CRMPage | ✅ 有 |
| 顧客服務卡統計報表 | — | ⚠️ 需加 |
| 顧客治療項目報表 | Reports (TreatmentReport) | ✅ 有 |
| 顧客處方報表 | Reports (PrescriptionStats) | ✅ 有 |

---

## 統計摘要

| 分類 | eCTCM 功能數 | 康晴已有 | 缺少 |
|------|------------|---------|------|
| 個人管理 | 11 | 9 | 2 |
| 顧客/掛號 | 5 | 5 | 0 |
| 診症 | 1 | 1 | 0 |
| 配藥/收費 | 6 | 4 | 2 |
| 藥物管理 | 3 | 3 | 0 |
| 商品管理 | 5 | 4 | 1 |
| 公司運作 | 9 | 5 | 4 |
| 帳號管理 | 4 | 3 | 1 |
| 報表 | 27 | 21 | 6 |
| **合計** | **71** | **55 (77%)** | **16 (23%)** |

## 缺少嘅 16 個功能（按優先級）

### 高優先（影響日常運作）
1. 病歷資料修改記錄 — 審計追蹤
2. 顧客資料修改記錄 — 審計追蹤
3. 服務及療程管理 — 定義服務項目同價格
4. 公司自訂短信管理 — WhatsApp/SMS 模板管理

### 中優先（增強功能）
5. 藥物修改日誌報表 — 庫存審計
6. 醫療計劃使用報表
7. 醫療計劃購買報表
8. 顧客服務卡統計報表
9. 組維護（角色管理）

### 低優先（可後補）
10. 我的邀請
11. 健康問答管理
12. 系統檢查
13. 招聘管理
14. 公司購買服務管理
15-16. 其他

## 康晴 APP 獨有功能（eCTCM 冇嘅）
- ✨ AI 智能簡報（Dashboard）
- ✨ 每日關懷 CRM 自動化
- ✨ WhatsApp Business API 直接發送
- ✨ Telegram 開支機器人
- ✨ 長者醫療券管理
- ✨ 藥物相互作用檢查
- ✨ 損益表 / 現金流報表
- ✨ 糧單 / 薪酬管理
- ✨ RFM 客戶分析
- ✨ 公開預約頁面（PublicBooking）
- ✨ 離線支援
