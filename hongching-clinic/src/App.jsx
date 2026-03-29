import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { loadAllData, saveAllLocal, subscribeToChanges, unsubscribe, flushOfflineQueue } from './api';
import SyncIndicator from './components/SyncIndicator';
import useKeyboardShortcuts, { ShortcutsHelp } from './hooks/useKeyboardShortcuts.jsx';
import useSessionManager, { IdleWarning } from './hooks/useSessionManager.jsx';
import { SEED_DATA, fmtM, getMonth } from './data';
import { exportCSV, exportJSON, importJSON } from './utils/export';
import { PERMISSIONS, PAGE_PERMISSIONS, ROLE_LABELS, ROLE_TAGS } from './config';
import { login, logout, getCurrentUser, hasPermission, filterByPermission, getStores, touchActivity, requestPasswordReset, resetPassword } from './auth';
import { logAction } from './utils/audit';
import ErrorBoundary from './components/ErrorBoundary';
import { getClinicName, getClinicLogo, applyTenantTheme } from './tenant';

// Lazy-loaded page components
const Dashboard = lazy(() => import('./components/Dashboard'));
const Revenue = lazy(() => import('./components/Revenue'));
const Expenses = lazy(() => import('./components/Expenses'));
const Payslip = lazy(() => import('./components/Payslip'));
const DoctorAnalytics = lazy(() => import('./components/DoctorAnalytics'));
const Reports = lazy(() => import('./components/Reports'));
const ARAP = lazy(() => import('./components/ARAP'));
const PatientPage = lazy(() => import('./components/PatientPage'));
const BookingPage = lazy(() => import('./components/BookingPage'));
const EMRPage = lazy(() => import('./components/EMRPage'));
const PackagePage = lazy(() => import('./components/PackagePage'));
const CRMPage = lazy(() => import('./components/CRMPage'));
const InventoryPage = lazy(() => import('./components/InventoryPage'));
const QueuePage = lazy(() => import('./components/QueuePage'));
const BillingPage = lazy(() => import('./components/BillingPage'));
const SickLeavePage = lazy(() => import('./components/SickLeavePage'));
const DoctorSchedule = lazy(() => import('./components/DoctorSchedule'));
const LeavePage = lazy(() => import('./components/LeavePage'));
const ProductPage = lazy(() => import('./components/ProductPage'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const ReceiptScanner = lazy(() => import('./components/ReceiptScanner'));
const AIChatPage = lazy(() => import('./components/AIChatPage'));
const StoreComparePage = lazy(() => import('./components/StoreComparePage'));
const SurveyPage = lazy(() => import('./components/SurveyPage'));
const ElderlyVoucherPage = lazy(() => import('./components/ElderlyVoucherPage'));
const PublicBooking = lazy(() => import('./components/PublicBooking'));
const PublicCheckin = lazy(() => import('./components/PublicCheckin'));
const PublicInquiry = lazy(() => import('./components/PublicInquiry'));
const PrivacyCenter = lazy(() => import('./components/PrivacyCenter'));
const SuperAdmin = lazy(() => import('./components/SuperAdmin'));
const WhatsAppInbox = lazy(() => import('./components/WhatsAppInbox'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const MedicineScanner = lazy(() => import('./components/MedicineScanner'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const BillingSettings = lazy(() => import('./components/BillingSettings'));
const EHealthPage = lazy(() => import('./components/EHealthPage'));
const DailyClosing = lazy(() => import('./components/DailyClosing'));
const MyFormulas = lazy(() => import('./components/MyFormulas'));
const DispensingLog = lazy(() => import('./components/DispensingLog'));
const PurchaseOrders = lazy(() => import('./components/PurchaseOrders'));
const RegistrationQueue = lazy(() => import('./components/RegistrationQueue'));
const PrescriptionPrint = lazy(() => import('./components/PrescriptionPrint'));
const VitalSigns = lazy(() => import('./components/VitalSigns'));
const PrescriptionHistory = lazy(() => import('./components/PrescriptionHistory'));
const MyCalendar = lazy(() => import('./components/MyCalendar'));
const DoctorAdvice = lazy(() => import('./components/DoctorAdvice'));
const ConsultationList = lazy(() => import('./components/ConsultationList'));
const DiscountSettings = lazy(() => import('./components/DiscountSettings'));
const MessageTemplates = lazy(() => import('./components/MessageTemplates'));
const SystemCheck = lazy(() => import('./components/SystemCheck'));
const BackupCenter = lazy(() => import('./components/BackupCenter'));
const PatientFeedback = lazy(() => import('./components/PatientFeedback'));
const StaffAttendance = lazy(() => import('./components/StaffAttendance'));
const ProductOrders = lazy(() => import('./components/ProductOrders'));
const AuditTrail = lazy(() => import('./components/AuditTrail'));
const Stocktaking = lazy(() => import('./components/Stocktaking'));
const TreatmentPlan = lazy(() => import('./components/TreatmentPlan'));
const StoredValueCard = lazy(() => import('./components/StoredValueCard'));
const ClinicBroadcast = lazy(() => import('./components/ClinicBroadcast'));
const QuickMenu = lazy(() => import('./components/QuickMenu'));
const Recruitment = lazy(() => import('./components/Recruitment'));
const MedicineDetail = lazy(() => import('./components/MedicineDetail'));
const DrugPricing = lazy(() => import('./components/DrugPricing'));
const PrescriptionPrintEN = lazy(() => import('./components/PrescriptionPrintEN'));
const QueueSlip = lazy(() => import('./components/QueueSlip'));
const PrescriptionRefill = lazy(() => import('./components/PrescriptionRefill'));
const CustomerAnalytics = lazy(() => import('./components/CustomerAnalytics'));
const InterClinicTransfer = lazy(() => import('./components/InterClinicTransfer'));
const SupplierManagement = lazy(() => import('./components/SupplierManagement'));
const ReferralTracking = lazy(() => import('./components/ReferralTracking'));
const LabResults = lazy(() => import('./components/LabResults'));
const MedicalCertificate = lazy(() => import('./components/MedicalCertificate'));
const DrugInteraction = lazy(() => import('./components/DrugInteraction'));
const AppointmentReminder = lazy(() => import('./components/AppointmentReminder'));
const IncomeStatement = lazy(() => import('./components/IncomeStatement'));
const ConsentForm = lazy(() => import('./components/ConsentForm'));
const InsuranceClaim = lazy(() => import('./components/InsuranceClaim'));
const ClinicExpenseReport = lazy(() => import('./components/ClinicExpenseReport'));
const PatientTimeline = lazy(() => import('./components/PatientTimeline'));
const ExcelExport = lazy(() => import('./components/ExcelExport'));
const WaitingTimeAnalytics = lazy(() => import('./components/WaitingTimeAnalytics'));
const AllergyAlert = lazy(() => import('./components/AllergyAlert'));
const FollowUpManager = lazy(() => import('./components/FollowUpManager'));
const NotificationCenter = lazy(() => import('./components/NotificationCenter'));
const HerbWiki = lazy(() => import('./components/HerbWiki'));
const ClinicKPI = lazy(() => import('./components/ClinicKPI'));
const CompanyServices = lazy(() => import('./components/CompanyServices'));
const AcupunctureChart = lazy(() => import('./components/AcupunctureChart'));
const StaffTraining = lazy(() => import('./components/StaffTraining'));
const EquipmentManagement = lazy(() => import('./components/EquipmentManagement'));
const RevenueGoalTracker = lazy(() => import('./components/RevenueGoalTracker'));
const PatientEducation = lazy(() => import('./components/PatientEducation'));
const CashFlowReport = lazy(() => import('./components/CashFlowReport'));
const DebtCollection = lazy(() => import('./components/DebtCollection'));
const TaxReport = lazy(() => import('./components/TaxReport'));
const ContractManagement = lazy(() => import('./components/ContractManagement'));
const ClinicCalendar = lazy(() => import('./components/ClinicCalendar'));
const InventoryExpiry = lazy(() => import('./components/InventoryExpiry'));
const PatientGroup = lazy(() => import('./components/PatientGroup'));
const MedicalHistory = lazy(() => import('./components/MedicalHistory'));
const MPFCalculator = lazy(() => import('./components/MPFCalculator'));
const CommissionCalculator = lazy(() => import('./components/CommissionCalculator'));
const IncidentReport = lazy(() => import('./components/IncidentReport'));
const QualityAudit = lazy(() => import('./components/QualityAudit'));
const SOPManagement = lazy(() => import('./components/SOPManagement'));
const BirthdayCampaign = lazy(() => import('./components/BirthdayCampaign'));
const DoctorProfile = lazy(() => import('./components/DoctorProfile'));
const SeasonalPromo = lazy(() => import('./components/SeasonalPromo'));
const ClinicMap = lazy(() => import('./components/ClinicMap'));
const PatientPortal = lazy(() => import('./components/PatientPortal'));
const FinancialDashboard = lazy(() => import('./components/FinancialDashboard'));
const ChronicDiseaseTracker = lazy(() => import('./components/ChronicDiseaseTracker'));
const DigitalSignage = lazy(() => import('./components/DigitalSignage'));
const LoyaltyProgram = lazy(() => import('./components/LoyaltyProgram'));
const OperationsDashboard = lazy(() => import('./components/OperationsDashboard'));
const WasteManagement = lazy(() => import('./components/WasteManagement'));
const EmergencyProtocol = lazy(() => import('./components/EmergencyProtocol'));
const PatientSatisfactionReport = lazy(() => import('./components/PatientSatisfactionReport'));
const HealthScreening = lazy(() => import('./components/HealthScreening'));
const DocumentTemplate = lazy(() => import('./components/DocumentTemplate'));
const StaffEvaluation = lazy(() => import('./components/StaffEvaluation'));
const ClinicPolicy = lazy(() => import('./components/ClinicPolicy'));
const MembershipTier = lazy(() => import('./components/MembershipTier'));
const ShiftHandover = lazy(() => import('./components/ShiftHandover'));
const ClinicalPathway = lazy(() => import('./components/ClinicalPathway'));
const ClinicInsurance = lazy(() => import('./components/ClinicInsurance'));
const WorkflowAutomation = lazy(() => import('./components/WorkflowAutomation'));
const TelemedicineConsult = lazy(() => import('./components/TelemedicineConsult'));
const ClinicBenchmark = lazy(() => import('./components/ClinicBenchmark'));
const PatientConsentLog = lazy(() => import('./components/PatientConsentLog'));
const PriceList = lazy(() => import('./components/PriceList'));
const ResourceScheduling = lazy(() => import('./components/ResourceScheduling'));
const ClinicAnnouncement = lazy(() => import('./components/ClinicAnnouncement'));
const PatientRiskScore = lazy(() => import('./components/PatientRiskScore'));
const VendorPayment = lazy(() => import('./components/VendorPayment'));
const StaffRoster = lazy(() => import('./components/StaffRoster'));
const PatientWaitlist = lazy(() => import('./components/PatientWaitlist'));
const ClinicBudget = lazy(() => import('./components/ClinicBudget'));
const PatientDemographics = lazy(() => import('./components/PatientDemographics'));
const TelegramExpense = lazy(() => import('./components/TelegramExpense'));
const PatientCheckIn = lazy(() => import('./components/PatientCheckIn'));
const ClinicRenovation = lazy(() => import('./components/ClinicRenovation'));
const HerbFormulaPrint = lazy(() => import('./components/HerbFormulaPrint'));
const ClinicUtility = lazy(() => import('./components/ClinicUtility'));
const PatientTransport = lazy(() => import('./components/PatientTransport'));
const ClinicCompliance = lazy(() => import('./components/ClinicCompliance'));
const GiftVoucher = lazy(() => import('./components/GiftVoucher'));
const DoctorRating = lazy(() => import('./components/DoctorRating'));
const MedicineReturn = lazy(() => import('./components/MedicineReturn'));
const ClinicPartnership = lazy(() => import('./components/ClinicPartnership'));
const ClinicFeedbackWall = lazy(() => import('./components/ClinicFeedbackWall'));
const InventoryValuation = lazy(() => import('./components/InventoryValuation'));
const ClinicNewsletter = lazy(() => import('./components/ClinicNewsletter'));
const LabOrderTracking = lazy(() => import('./components/LabOrderTracking'));
const DailyRevenueTarget = lazy(() => import('./components/DailyRevenueTarget'));
const PatientDischarge = lazy(() => import('./components/PatientDischarge'));
const ClinicGoalSetting = lazy(() => import('./components/ClinicGoalSetting'));
const HerbBlendCalculator = lazy(() => import('./components/HerbBlendCalculator'));
const ClinicSurveyBuilder = lazy(() => import('./components/ClinicSurveyBuilder'));
const PatientAllergy = lazy(() => import('./components/PatientAllergy'));
const StaffCertification = lazy(() => import('./components/StaffCertification'));
const ClinicSafetyChecklist = lazy(() => import('./components/ClinicSafetyChecklist'));
const MedicalSupplyOrder = lazy(() => import('./components/MedicalSupplyOrder'));
const PatientMedication = lazy(() => import('./components/PatientMedication'));
const ClinicRoomBooking = lazy(() => import('./components/ClinicRoomBooking'));
const PatientInsurance = lazy(() => import('./components/PatientInsurance'));
const ClinicRevenueBreakdown = lazy(() => import('./components/ClinicRevenueBreakdown'));
const HerbSourcingTracker = lazy(() => import('./components/HerbSourcingTracker'));
const ClinicFloorPlan = lazy(() => import('./components/ClinicFloorPlan'));
const PatientCommunity = lazy(() => import('./components/PatientCommunity'));
const MonthEndClosing = lazy(() => import('./components/MonthEndClosing'));
const AttendancePage = lazy(() => import('./components/AttendancePage'));
const PayrollPage = lazy(() => import('./components/PayrollPage'));
const DataImport = lazy(() => import('./components/DataImport'));
const TaskBoard = lazy(() => import('./components/TaskBoard'));
const ECTCMRevenue = lazy(() => import('./components/ECTCMRevenue'));
const DailyCare = lazy(() => import('./components/DailyCare'));

const ALL_PAGES = [
  { id: 'dash', icon: '📊', label: '總覽', section: '總覽', perm: 'viewDashboard' },
  { id: 'rev', icon: '💰', label: '營業紀錄', section: '財務', perm: 'editRevenue' },
  { id: 'exp', icon: '🧾', label: '開支紀錄', section: '財務', perm: 'editExpenses' },
  { id: 'scan', icon: '📷', label: '收據掃描', section: '財務', perm: 'viewReceiptScanner' },
  { id: 'arap', icon: '📑', label: '應收應付', section: '財務', perm: 'editARAP' },
  { id: 'calendar', icon: '📅', label: '我的日曆', section: '總覽', perm: 'viewDashboard' },
  { id: 'quickmenu', icon: '⚡', label: '快捷菜單', section: '總覽', perm: 'viewDashboard' },
  { id: 'broadcast', icon: '📢', label: '診所公告', section: '總覽', perm: 'viewDashboard' },
  { id: 'patient', icon: '👥', label: '病人管理', section: '病人', perm: 'viewPatients' },
  { id: 'feedback', icon: '⭐', label: '顧客評分', section: '病人', perm: 'viewPatients' },
  { id: 'custanalytics', icon: '📊', label: '顧客分析', section: '病人', perm: 'viewPatients' },
  { id: 'booking', icon: '📅', label: '預約系統', section: '病人', perm: 'viewBookings' },
  { id: 'queue', icon: '🎫', label: '掛號排隊', section: '診症', perm: 'viewQueue' },
  { id: 'emr', icon: '🏥', label: '電子病歷', section: '診症', perm: 'viewEMR' },
  { id: 'formulas', icon: '💊', label: '我的處方', section: '病人', perm: 'viewEMR' },
  { id: 'rxhistory', icon: '📜', label: '處方報表', section: '病人', perm: 'viewEMR' },
  { id: 'vitals', icon: '❤️', label: '健康資訊', section: '病人', perm: 'viewEMR' },
  { id: 'txplan', icon: '📋', label: '醫療計劃', section: '病人', perm: 'viewEMR' },
  { id: 'storedcard', icon: '💳', label: '充值卡', section: '病人', perm: 'viewPatients' },
  { id: 'package', icon: '🎫', label: '套餐/會員', section: '病人', perm: 'viewPackages' },
  { id: 'wa-inbox', icon: '📱', label: 'WhatsApp AI', section: '客戶', perm: 'viewEMR' },
  { id: 'crm', icon: '💬', label: 'WhatsApp CRM', section: '客戶', perm: 'viewEMR' },
  { id: 'dailycare', icon: '💝', label: '每日關懷', section: '客戶', perm: 'viewPatients' },
  { id: 'inventory', icon: '💊', label: '藥材庫存', section: '營運', perm: 'editExpenses' },
  { id: 'medscan', icon: '📦', label: '採購掃描', section: '營運', perm: 'editExpenses' },
  { id: 'purchase', icon: '📦', label: '進貨管理', section: '營運', perm: 'editExpenses' },
  { id: 'billing', icon: '💵', label: '配藥/收費', section: '營運', perm: 'viewBilling' },
  { id: 'dispensing', icon: '📋', label: '開藥日誌', section: '營運', perm: 'viewBilling' },
  { id: 'rxprint', icon: '🖨️', label: '處方列印', section: '營運', perm: 'viewBilling' },
  { id: 'rxprinten', icon: '🌐', label: '英文處方', section: '營運', perm: 'viewBilling' },
  { id: 'refill', icon: '🔄', label: '重配處方', section: '營運', perm: 'viewBilling' },
  { id: 'queueslip', icon: '🎫', label: '候診票列印', section: '營運', perm: 'viewQueue' },
  { id: 'regqueue', icon: '🏥', label: '掛號列表', section: '營運', perm: 'viewQueue' },
  { id: 'consultlist', icon: '🩺', label: '診症列表', section: '營運', perm: 'viewBilling' },
  { id: 'products', icon: '🛍️', label: '商品管理', section: '營運', perm: 'editExpenses' },
  { id: 'prodorders', icon: '🛒', label: '商品訂單', section: '營運', perm: 'editExpenses' },
  { id: 'stocktake', icon: '📊', label: '藥物盤點', section: '營運', perm: 'editExpenses' },
  { id: 'meddetail', icon: '🔬', label: '藥材詳情', section: '營運', perm: 'editExpenses' },
  { id: 'drugprice', icon: '💲', label: '藥物定價', section: '營運', perm: 'editExpenses' },
  { id: 'closing', icon: '🧮', label: '日結對賬', section: '營運', perm: 'editRevenue' },
  { id: 'voucher', icon: '🧓', label: '長者醫療券', section: '病人', perm: 'viewPatients' },
  { id: 'sickleave', icon: '📄', label: '假紙記錄', section: '病人', perm: 'viewEMR' },
  { id: 'pay', icon: '📋', label: '糧單', section: '人事', perm: 'viewPayroll' },
  { id: 'schedule', icon: '🕐', label: '醫師排班', section: '人事', perm: 'viewDoctorAnalytics' },
  { id: 'leave', icon: '🏖️', label: '假期管理', section: '人事', perm: 'viewLeave' },
  { id: 'attendance', icon: '⏰', label: '考勤打卡', section: '人事', perm: 'viewLeave' },
  { id: 'recruit', icon: '👔', label: '招聘管理', section: '人事', perm: 'viewSettings' },
  { id: 'doc', icon: '👨‍⚕️', label: '醫師業績', section: '分析', perm: 'viewDoctorAnalytics' },
  { id: 'report', icon: '📈', label: '報表中心', section: '分析', perm: 'viewReports' },
  { id: 'ai', icon: '🤖', label: 'AI 助手', section: '分析', perm: 'viewDashboard' },
  { id: 'compare', icon: '🏢', label: '分店對比', section: '分析', perm: 'viewDashboard' },
  { id: 'survey', icon: '📋', label: '滿意度調查', section: '分析', perm: 'viewDashboard' },
  { id: 'advice', icon: '📝', label: '醫囑管理', section: '營運', perm: 'viewEMR' },
  { id: 'discount', icon: '🏷️', label: '折扣設定', section: '營運', perm: 'editRevenue' },
  { id: 'msgtpl', icon: '✉️', label: '訊息範本', section: '客戶', perm: 'viewEMR' },
  { id: 'ehealth', icon: '🏛️', label: '醫健通', section: '系統', perm: 'viewEMR' },
  { id: 'audit', icon: '📝', label: '修改日誌', section: '系統', perm: 'viewSettings' },
  { id: 'syscheck', icon: '🔧', label: '系統檢查', section: '系統', perm: 'viewSettings' },
  { id: 'backup', icon: '💾', label: '數據備份', section: '系統', perm: 'viewSettings' },
  { id: 'billingsub', icon: '💳', label: '訂閱管理', section: '系統', perm: 'viewSettings' },
  { id: 'privacy', icon: '🔒', label: '私隱中心', section: '系統', perm: 'viewPrivacy' },
  { id: 'superadmin', icon: '🛡️', label: 'Super Admin', section: '系統', perm: 'viewSuperAdmin' },
  { id: 'transfer', icon: '🔄', label: '跨店調撥', section: '營運', perm: 'editExpenses' },
  { id: 'supplier', icon: '🏭', label: '供應商管理', section: '營運', perm: 'editExpenses' },
  { id: 'referral', icon: '🔗', label: '轉介追蹤', section: '病人', perm: 'viewEMR' },
  { id: 'labresult', icon: '🧪', label: '化驗報告', section: '病人', perm: 'viewEMR' },
  { id: 'medcert', icon: '📃', label: '醫療證明', section: '病人', perm: 'viewEMR' },
  { id: 'drugcheck', icon: '⚠️', label: '藥物相互作用', section: '營運', perm: 'viewBilling' },
  { id: 'reminder', icon: '⏰', label: '預約提醒', section: '客戶', perm: 'viewBookings' },
  { id: 'pnl', icon: '📊', label: '損益表', section: '分析', perm: 'viewReports' },
  { id: 'consent', icon: '📋', label: '同意書管理', section: '病人', perm: 'viewPatients' },
  { id: 'insurance', icon: '🏦', label: '保險索償', section: '財務', perm: 'editRevenue' },
  { id: 'expreport', icon: '📉', label: '開支分析', section: '分析', perm: 'viewReports' },
  { id: 'timeline', icon: '⏳', label: '病人時間軸', section: '病人', perm: 'viewPatients' },
  { id: 'dataexport', icon: '📤', label: '數據匯出', section: '系統', perm: 'viewReports' },
  { id: 'waittime', icon: '⏱️', label: '候診分析', section: '分析', perm: 'viewReports' },
  { id: 'allergy', icon: '🚨', label: '過敏管理', section: '病人', perm: 'viewEMR' },
  { id: 'followup', icon: '🔔', label: '覆診管理', section: '病人', perm: 'viewEMR' },
  { id: 'notifcenter', icon: '📬', label: '通知中心', section: '系統', perm: 'viewDashboard' },
  { id: 'herbwiki', icon: '🌿', label: '中藥百科', section: '營運', perm: 'viewBilling' },
  { id: 'kpi', icon: '🎯', label: '診所KPI', section: '分析', perm: 'viewReports' },
  { id: 'corpservice', icon: '🏢', label: '企業服務', section: '客戶', perm: 'editRevenue' },
  { id: 'acuchart', icon: '📍', label: '穴位圖譜', section: '營運', perm: 'viewEMR' },
  { id: 'training', icon: '🎓', label: '員工培訓', section: '人事', perm: 'viewSettings' },
  { id: 'equipment', icon: '🔧', label: '設備管理', section: '營運', perm: 'editExpenses' },
  { id: 'revgoal', icon: '🎯', label: '營業目標', section: '分析', perm: 'viewReports' },
  { id: 'education', icon: '📖', label: '健康教育', section: '病人', perm: 'viewPatients' },
  { id: 'cashflow', icon: '💹', label: '現金流量', section: '分析', perm: 'viewReports' },
  { id: 'debt', icon: '💸', label: '欠款追收', section: '財務', perm: 'editRevenue' },
  { id: 'tax', icon: '🏛️', label: '稅務報告', section: '分析', perm: 'viewReports' },
  { id: 'contract', icon: '📄', label: '合約管理', section: '營運', perm: 'editExpenses' },
  { id: 'cliniccal', icon: '🗓️', label: '診所日曆', section: '總覽', perm: 'viewDashboard' },
  { id: 'expiry', icon: '⏳', label: '有效期管理', section: '營運', perm: 'editExpenses' },
  { id: 'ptgroup', icon: '👥', label: '病人分組', section: '客戶', perm: 'viewPatients' },
  { id: 'medhist', icon: '📋', label: '病歷總覽', section: '病人', perm: 'viewEMR' },
  { id: 'mpf', icon: '🏦', label: '強積金', section: '人事', perm: 'viewPayroll' },
  { id: 'commission', icon: '💰', label: '佣金計算', section: '人事', perm: 'viewPayroll' },
  { id: 'incident', icon: '🚨', label: '事故報告', section: '系統', perm: 'viewSettings' },
  { id: 'qualityaudit', icon: '✅', label: '質量審核', section: '系統', perm: 'viewSettings' },
  { id: 'sop', icon: '📘', label: 'SOP管理', section: '系統', perm: 'viewSettings' },
  { id: 'birthday', icon: '🎂', label: '生日營銷', section: '客戶', perm: 'viewPatients' },
  { id: 'docprofile', icon: '👨‍⚕️', label: '醫師檔案', section: '人事', perm: 'viewDoctorAnalytics' },
  { id: 'promo', icon: '🎉', label: '季節推廣', section: '客戶', perm: 'editRevenue' },
  { id: 'clinicmap', icon: '🏠', label: '空間管理', section: '營運', perm: 'editExpenses' },
  { id: 'portal', icon: '🌐', label: '病人自助', section: '系統', perm: 'viewSettings' },
  { id: 'findash', icon: '💰', label: '財務總覽', section: '分析', perm: 'viewReports' },
  { id: 'chronic', icon: '🩺', label: '慢性病管理', section: '病人', perm: 'viewEMR' },
  { id: 'signage', icon: '📺', label: '候診室顯示', section: '營運', perm: 'viewQueue' },
  { id: 'loyalty', icon: '🏆', label: '積分獎賞', section: '客戶', perm: 'viewPatients' },
  { id: 'opsdash', icon: '📡', label: '即時面板', section: '總覽', perm: 'viewDashboard' },
  { id: 'waste', icon: '🗑️', label: '廢物管理', section: '營運', perm: 'editExpenses' },
  { id: 'emergency', icon: '🆘', label: '緊急應變', section: '系統', perm: 'viewSettings' },
  { id: 'satreport', icon: '📊', label: '滿意度報告', section: '分析', perm: 'viewReports' },
  { id: 'screening', icon: '🏥', label: '健康檢查', section: '病人', perm: 'viewEMR' },
  { id: 'doctpl', icon: '📝', label: '文件範本', section: '系統', perm: 'viewSettings' },
  { id: 'staffeval', icon: '⭐', label: '員工考核', section: '人事', perm: 'viewSettings' },
  { id: 'policy', icon: '📜', label: '診所政策', section: '系統', perm: 'viewSettings' },
  { id: 'memtier', icon: '💎', label: '會員等級', section: '客戶', perm: 'viewPatients' },
  { id: 'handover', icon: '🤝', label: '交更管理', section: '營運', perm: 'editExpenses' },
  { id: 'pathway', icon: '🛤️', label: '臨床路徑', section: '病人', perm: 'viewEMR' },
  { id: 'clinicins', icon: '🛡️', label: '診所保險', section: '營運', perm: 'editExpenses' },
  { id: 'workflow', icon: '⚙️', label: '流程自動化', section: '系統', perm: 'viewSettings' },
  { id: 'telemedicine', icon: '📹', label: '遠程診症', section: '病人', perm: 'viewEMR' },
  { id: 'benchmark', icon: '📏', label: '行業對標', section: '分析', perm: 'viewReports' },
  { id: 'consentlog', icon: '✍️', label: '同意書記錄', section: '病人', perm: 'viewPatients' },
  { id: 'pricelist', icon: '💲', label: '價目表', section: '營運', perm: 'editRevenue' },
  { id: 'resource', icon: '🏠', label: '資源排程', section: '營運', perm: 'editExpenses' },
  { id: 'announce', icon: '📣', label: '內部公告', section: '總覽', perm: 'viewDashboard' },
  { id: 'riskscore', icon: '⚠️', label: '風險評估', section: '病人', perm: 'viewEMR' },
  { id: 'vendorpay', icon: '💳', label: '供應商付款', section: '財務', perm: 'editExpenses' },
  { id: 'roster', icon: '📋', label: '更表排班', section: '人事', perm: 'viewSettings' },
  { id: 'waitlist', icon: '⏳', label: '候補名單', section: '病人', perm: 'viewBookings' },
  { id: 'budget', icon: '📊', label: '預算管理', section: '財務', perm: 'editExpenses' },
  { id: 'demographics', icon: '👥', label: '人口統計', section: '分析', perm: 'viewReports' },
  { id: 'tgexpense', icon: '🧾', label: 'TG收據入數', section: '財務', perm: 'editExpenses' },
  { id: 'checkin', icon: '📱', label: '自助登記', section: '營運', perm: 'viewQueue' },
  { id: 'renovation', icon: '🔨', label: '裝修維護', section: '營運', perm: 'editExpenses' },
  { id: 'herbprint', icon: '🏷️', label: '藥方列印', section: '營運', perm: 'viewBilling' },
  { id: 'utility', icon: '💡', label: '水電雜費', section: '財務', perm: 'editExpenses' },
  { id: 'transport', icon: '🚐', label: '接送服務', section: '營運', perm: 'viewBookings' },
  { id: 'compliance', icon: '📋', label: '法規合規', section: '系統', perm: 'viewSettings' },
  { id: 'giftvoucher', icon: '🎁', label: '禮券管理', section: '客戶', perm: 'editRevenue' },
  { id: 'docrating', icon: '⭐', label: '醫師評分', section: '分析', perm: 'viewDoctorAnalytics' },
  { id: 'medreturn', icon: '↩️', label: '退藥管理', section: '營運', perm: 'viewBilling' },
  { id: 'partnership', icon: '🤝', label: '合作夥伴', section: '客戶', perm: 'editRevenue' },
  { id: 'feedwall', icon: '💬', label: '好評牆', section: '客戶', perm: 'viewPatients' },
  { id: 'invvalue', icon: '📦', label: '庫存估值', section: '分析', perm: 'viewReports' },
  { id: 'newsletter', icon: '📰', label: '電子報', section: '客戶', perm: 'viewPatients' },
  { id: 'laborder', icon: '🧪', label: '化驗跟蹤', section: '病人', perm: 'viewEMR' },
  { id: 'dailytarget', icon: '🎯', label: '每日目標', section: '分析', perm: 'viewReports' },
  { id: 'discharge', icon: '📤', label: '出院管理', section: '病人', perm: 'viewEMR' },
  { id: 'okr', icon: '🏆', label: 'OKR目標', section: '系統', perm: 'viewSettings' },
  { id: 'herbcalc', icon: '⚖️', label: '藥方計算', section: '營運', perm: 'viewBilling' },
  { id: 'surveybuilder', icon: '📝', label: '問卷建構', section: '客戶', perm: 'viewPatients' },
  { id: 'patallergy', icon: '🚨', label: '過敏管理', section: '病人', perm: 'viewEMR' },
  { id: 'staffcert', icon: '📜', label: '員工證照', section: '人事', perm: 'viewSettings' },
  { id: 'safetychk', icon: '🔒', label: '安全檢查', section: '營運', perm: 'viewSettings' },
  { id: 'supplyorder', icon: '🏥', label: '物資採購', section: '營運', perm: 'editExpenses' },
  { id: 'patmed', icon: '💊', label: '用藥管理', section: '病人', perm: 'viewEMR' },
  { id: 'roombooking', icon: '🚪', label: '診室預約', section: '營運', perm: 'editExpenses' },
  { id: 'patinsurance', icon: '🛡️', label: '保險管理', section: '病人', perm: 'viewEMR' },
  { id: 'revbreakdown', icon: '📊', label: '營收細分', section: '分析', perm: 'viewReports' },
  { id: 'herbsource', icon: '🌿', label: '藥材溯源', section: '營運', perm: 'viewBilling' },
  { id: 'floorplan', icon: '🗺️', label: '平面圖', section: '系統', perm: 'viewSettings' },
  { id: 'community', icon: '👥', label: '健康社區', section: '客戶', perm: 'viewPatients' },
  { id: 'monthend', icon: '📅', label: '月結作業', section: '財務', perm: 'viewReports' },
  { id: 'payroll', icon: '💰', label: '計糧', section: '財務', perm: 'viewPayroll' },
  { id: 'dataimport', icon: '📥', label: '資料匯入', section: '系統', perm: 'viewSettings' },
  { id: 'taskboard', icon: '📋', label: '每日任務', section: '總覽', perm: 'viewDashboard' },
  { id: 'ectcm', icon: '🏥', label: 'eCTCM營收', section: '分析', perm: 'viewPayroll' },
];

// Mobile bottom tab config
const MOBILE_TABS = [
  { id: 'dash', icon: '📊', label: 'Dashboard' },
  { id: 'rev', icon: '💰', label: '營業' },
  { id: 'booking', icon: '📅', label: '預約' },
  { id: 'patient', icon: '👥', label: '病人' },
  { id: 'more', icon: '≡', label: '更多' },
];

// ── Login Page ──
function LoginPage({ onLogin, onShowLegal }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetMode, setResetMode] = useState('request'); // 'request' | 'reset'
  const [resetUsername, setResetUsername] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const session = await login(username, password);
      if (session) {
        logAction(session, 'login', 'auth', `${session.name} 登入`);
        onLogin(session);
      } else {
        setError('用戶名或密碼錯誤');
        setPassword('');
      }
    } catch {
      setError('登入失敗，請重試');
    }
    setLoading(false);
  };

  const handleResetRequest = async (e) => {
    e.preventDefault();
    if (!resetUsername.trim()) { setResetError('請輸入用戶名'); return; }
    setResetLoading(true);
    setResetError('');
    setResetMsg('');
    try {
      const data = await requestPasswordReset(resetUsername.trim());
      if (data.success) {
        setResetMsg(data.emailSent
          ? '重設連結已發送至用戶電郵。'
          : '如用戶存在，重設指示已處理。請聯絡用戶查看電郵。');
      } else {
        setResetError(data.error || '請求失敗');
      }
    } catch {
      setResetError('網絡錯誤，請稍後再試');
    }
    setResetLoading(false);
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    if (!resetTokenInput.trim()) { setResetError('請輸入重設令牌'); return; }
    if (!newPassword) { setResetError('請輸入新密碼'); return; }
    if (newPassword.length < 8) { setResetError('密碼最少需要8個字元（需包含大小寫字母及數字）'); return; }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) { setResetError('密碼需包含大小寫字母及數字'); return; }
    if (newPassword !== confirmPassword) { setResetError('兩次密碼不一致'); return; }
    setResetLoading(true);
    setResetError('');
    setResetMsg('');
    try {
      const data = await resetPassword(resetTokenInput.trim(), newPassword);
      if (data.success) {
        setResetMsg('密碼已成功重設，請返回登入。');
        setResetTokenInput('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setResetError(data.error || '重設失敗');
      }
    } catch {
      setResetError('網絡錯誤，請稍後再試');
    }
    setResetLoading(false);
  };

  const clearResetState = () => {
    setShowReset(false);
    setResetMode('request');
    setResetUsername('');
    setResetToken('');
    setResetTokenInput('');
    setNewPassword('');
    setConfirmPassword('');
    setResetMsg('');
    setResetError('');
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={showReset ? (resetMode === 'request' ? handleResetRequest : handlePasswordReset) : handleSubmit}>
        <div className="login-brand">
          <img src={getClinicLogo() || '/logo.jpg'} alt={getClinicName()} className="login-logo" />
        </div>
        <div className="login-divider" />

        {!showReset ? (
          <>
            <label htmlFor="username">用戶名</label>
            <input
              id="username"
              type="text"
              placeholder="請輸入用戶名"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); }}
              autoFocus
            />
            <label htmlFor="password" style={{ marginTop: 4 }}>密碼</label>
            <input
              id="password"
              type="password"
              placeholder="請輸入密碼"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
            />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="btn btn-teal btn-lg login-btn" disabled={loading}>{loading ? '登入中...' : '登入'}</button>
            <p style={{ fontSize: 11, color: 'var(--teal)', marginTop: 12, cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => { setShowReset(true); setResetMode('request'); setError(''); }}>
              忘記密碼?
            </p>
          </>
        ) : resetMode === 'request' ? (
          <>
            <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>忘記密碼 - 申請重設</label>
            <label htmlFor="resetUsername">用戶名</label>
            <input
              id="resetUsername"
              type="text"
              placeholder="請輸入用戶名"
              value={resetUsername}
              onChange={(e) => { setResetUsername(e.target.value); setResetError(''); }}
              autoFocus
            />
            {resetError && <div className="login-error">{resetError}</div>}
            {resetMsg && <div style={{ fontSize: 12, color: 'var(--teal)', marginTop: 8 }}>{resetMsg}</div>}
            {resetToken && (
              <div style={{ fontSize: 12, background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 6, padding: '8px 10px', marginTop: 8, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {resetToken}
              </div>
            )}
            <button type="submit" className="btn btn-teal btn-lg login-btn" disabled={resetLoading} style={{ marginTop: 12 }}>
              {resetLoading ? '處理中...' : '發送重設連結'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--teal)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => { setResetMode('reset'); setResetError(''); setResetMsg(''); }}>
                已有令牌? 重設密碼
              </span>
              <span style={{ fontSize: 11, color: 'var(--gray-400)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={clearResetState}>
                返回登入
              </span>
            </div>
          </>
        ) : (
          <>
            <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>重設密碼</label>
            <label htmlFor="tokenInput">重設令牌</label>
            <input
              id="tokenInput"
              type="text"
              placeholder="請輸入重設令牌"
              value={resetTokenInput}
              onChange={(e) => { setResetTokenInput(e.target.value); setResetError(''); }}
              autoFocus
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <label htmlFor="newPassword" style={{ marginTop: 4 }}>新密碼</label>
            <input
              id="newPassword"
              type="password"
              placeholder="請輸入新密碼 (至少6位)"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setResetError(''); }}
            />
            <label htmlFor="confirmPassword" style={{ marginTop: 4 }}>確認新密碼</label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="再次輸入新密碼"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setResetError(''); }}
            />
            {resetError && <div className="login-error">{resetError}</div>}
            {resetMsg && <div style={{ fontSize: 12, color: 'var(--teal)', marginTop: 8 }}>{resetMsg}</div>}
            <button type="submit" className="btn btn-teal btn-lg login-btn" disabled={resetLoading} style={{ marginTop: 12 }}>
              {resetLoading ? '處理中...' : '重設密碼'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--teal)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => { setResetMode('request'); setResetError(''); setResetMsg(''); }}>
                申請重設令牌
              </span>
              <span style={{ fontSize: 11, color: 'var(--gray-400)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={clearResetState}>
                返回登入
              </span>
            </div>
          </>
        )}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--gray-200)', textAlign: 'center', fontSize: 11, color: 'var(--gray-400)' }}>
          <span style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--gray-500)' }}
            onClick={() => onShowLegal && onShowLegal('terms')}>
            服務條款
          </span>
          <span style={{ margin: '0 6px' }}>|</span>
          <span style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--gray-500)' }}
            onClick={() => onShowLegal && onShowLegal('privacy')}>
            私隱政策
          </span>
        </div>
      </form>
    </div>
  );
}

// ── Notification System ──
function useNotifications(data) {
  return useMemo(() => {
    const notes = [];
    const today = new Date().toISOString().substring(0, 10);
    const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().substring(0, 10); })();
    const thisMonth = new Date().toISOString().substring(0, 7);
    const lastMonth = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().substring(0, 7); })();
    const dayOfMonth = new Date().getDate();

    // Pending online bookings
    const pendingBookings = (data.bookings || []).filter(b => b.status === 'pending');
    if (pendingBookings.length) notes.push({ icon: '🔔', title: `${pendingBookings.length} 個新預約待確認`, time: '待處理', category: '預約', priority: 'high' });

    // New inquiries
    const newInquiries = (data.inquiries || []).filter(i => i.status === 'new');
    if (newInquiries.length) notes.push({ icon: '💬', title: `${newInquiries.length} 個新客人查詢待回覆`, time: '待處理', category: '查詢', priority: 'high' });

    (data.arap || []).filter(a => a.type === 'receivable' && a.status === 'pending' && a.dueDate < today)
      .forEach(a => notes.push({ icon: '🔴', title: `逾期應收：${a.party} ${fmtM(a.amount)}`, time: a.dueDate, category: '財務', priority: 'high' }));

    const tmrBookings = (data.bookings || []).filter(b => b.date === tomorrow && b.status === 'confirmed');
    if (tmrBookings.length) notes.push({ icon: '📅', title: `明日有 ${tmrBookings.length} 個預約`, time: '明天', category: '預約', priority: 'medium' });

    const thisRev = (data.revenue || []).filter(r => getMonth(r.date) === thisMonth).reduce((s, r) => s + Number(r.amount), 0);
    const lastRev = (data.revenue || []).filter(r => getMonth(r.date) === lastMonth).reduce((s, r) => s + Number(r.amount), 0);
    if (lastRev > 0 && thisRev < lastRev) notes.push({ icon: '⚠️', title: `本月營業額 (${fmtM(thisRev)}) 低於上月 (${fmtM(lastRev)})`, time: thisMonth, category: '財務', priority: 'medium' });

    if (dayOfMonth >= 20 && dayOfMonth <= 25) notes.push({ icon: '💼', title: 'MPF 供款提醒：請於25日前完成供款', time: today, category: '行政', priority: 'medium' });

    // Follow-up reminders
    const overdueFollowUps = (data.consultations || []).filter(c => c.followUpDate && c.followUpDate < today);
    if (overdueFollowUps.length) notes.push({ icon: '📋', title: `${overdueFollowUps.length} 位病人覆診已逾期`, time: '覆診', category: '醫療', priority: 'high' });
    const todayFollowUps = (data.consultations || []).filter(c => c.followUpDate === today);
    if (todayFollowUps.length) notes.push({ icon: '🔔', title: `今日有 ${todayFollowUps.length} 位病人需要覆診`, time: '今日', category: '醫療', priority: 'high' });

    // Patient birthdays
    const todayMD = today.substring(5);
    const birthdayPatients = (data.patients || []).filter(p => p.dob && p.dob.substring(5) === todayMD);
    if (birthdayPatients.length) notes.push({ icon: '🎂', title: `${birthdayPatients.map(p => p.name).join('、')} 今日生日`, time: '生日', category: 'CRM', priority: 'low' });

    // Low-stock inventory alerts
    const lowStockItems = (data.inventory || []).filter(i => Number(i.stock) < Number(i.minStock));
    if (lowStockItems.length) {
      notes.push({ icon: '💊', title: `藥物庫存不足：${lowStockItems.length} 項低於安全庫存`, time: '庫存', category: '庫存', priority: 'high' });
      lowStockItems.slice(0, 3).forEach(i => {
        notes.push({ icon: '⚠️', title: `${i.name} — 現有 ${i.stock}${i.unit}（最低 ${i.minStock}${i.unit}）`, time: '低庫存', category: '庫存', priority: 'medium' });
      });
    }

    // Low stock products
    const lowStockProducts = (data.products || []).filter(p => p.active !== false && Number(p.stock) < Number(p.minStock));
    if (lowStockProducts.length) notes.push({ icon: '📦', title: `${lowStockProducts.length} 個商品低庫存`, time: '庫存', category: '庫存', priority: 'medium' });

    // Pending leaves
    const pendingLeaves = (data.leaves || []).filter(l => l.status === 'pending');
    if (pendingLeaves.length) notes.push({ icon: '✈️', title: `${pendingLeaves.length} 個請假申請待審批`, time: '待處理', category: '行政', priority: 'medium' });

    // Queue alerts
    const todayQueue = (data.queue || []).filter(q => q.date === today);
    const waitingCount = todayQueue.filter(q => q.status === 'waiting').length;
    if (waitingCount >= 5) notes.push({ icon: '🏥', title: `目前有 ${waitingCount} 位病人等候中`, time: '候診', category: '營運', priority: 'medium' });

    // Sort by priority (high first)
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    notes.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));

    return notes;
  }, [data]);
}

// ── Global Search (enhanced with fuzzy matching + more categories) ──
function SearchPanel({ data, onNavigate, onClose }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Save recent searches
  const [recents, setRecents] = useState(() => { try { return JSON.parse(localStorage.getItem('hc_recent_searches') || '[]'); } catch { return []; } });
  const saveRecent = (term) => {
    const next = [term, ...recents.filter(r => r !== term)].slice(0, 8);
    setRecents(next);
    try { localStorage.setItem('hc_recent_searches', JSON.stringify(next)); } catch {}
  };

  const results = useMemo(() => {
    if (!q || q.length < 1) return { patients: [], revenue: [], expenses: [], bookings: [], consultations: [] };
    const ql = q.toLowerCase().trim();
    const fz = (text) => {
      if (!text) return 0;
      const t = String(text).toLowerCase();
      if (t === ql) return 100;
      if (t.startsWith(ql)) return 90;
      if (t.includes(ql)) return 70;
      // Character-order fuzzy
      let qi = 0;
      for (let i = 0; i < t.length && qi < ql.length; i++) { if (t[i] === ql[qi]) qi++; }
      return qi === ql.length ? 40 : 0;
    };
    const search = (arr, fields) => {
      const scored = [];
      for (const item of (arr || [])) {
        let best = 0;
        for (const f of fields) { const s = fz(item[f]); if (s > best) best = s; }
        if (best > 0) scored.push({ item, score: best });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, 8).map(s => s.item);
    };
    return {
      patients: search(data.patients, ['name', 'phone', 'email']),
      revenue: search(data.revenue, ['name', 'item', 'doctor']),
      expenses: search(data.expenses, ['merchant', 'category', 'description']),
      bookings: search(data.bookings, ['patientName', 'doctor', 'patientPhone']),
      consultations: search(data.consultations, ['patientName', 'diagnosis', 'tcmDiagnosis']),
    };
  }, [q, data]);

  const totalResults = Object.values(results).reduce((s, arr) => s + arr.length, 0);

  const doNavigate = (page) => { if (q) saveRecent(q); onNavigate(page); onClose(); };

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-panel" onClick={e => e.stopPropagation()}>
        <div style={{ position: 'relative' }}>
          <input ref={inputRef} className="search-input" placeholder="搜尋病人、營業、開支、預約、診症...（支援模糊搜尋）" value={q} onChange={e => setQ(e.target.value)} aria-label="全域搜尋"
            style={{ paddingRight: 60 }} />
          <kbd style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 10, background: '#f3f4f6', padding: '2px 6px', borderRadius: 3, border: '1px solid #d1d5db', color: '#9ca3af' }}>ESC</kbd>
        </div>
        {!q && recents.length > 0 && (
          <div style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: 10, color: 'var(--gray-400)', marginBottom: 6, fontWeight: 600 }}>最近搜尋</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {recents.map(r => <span key={r} onClick={() => setQ(r)} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--gray-100)', borderRadius: 10, cursor: 'pointer', color: 'var(--gray-600)' }}>{r}</span>)}
            </div>
          </div>
        )}
        {q && (
          <div className="search-results">
            {totalResults > 0 && <div style={{ padding: '4px 12px', fontSize: 10, color: 'var(--gray-400)' }}>找到 {totalResults} 個結果</div>}
            {results.patients.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">👤 病人</div>
                {results.patients.map(p => <div key={p.id} className="search-item" onClick={() => doNavigate('patient')}>{p.name} — {p.phone || '無電話'}</div>)}
              </div>
            )}
            {results.bookings.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">📅 預約</div>
                {results.bookings.map(b => <div key={b.id} className="search-item" onClick={() => doNavigate('booking')}>{b.patientName} — {b.date} {b.time} ({b.doctor})</div>)}
              </div>
            )}
            {results.consultations.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">🩺 診症</div>
                {results.consultations.map(c => <div key={c.id} className="search-item" onClick={() => doNavigate('emr')}>{c.patientName} — {c.diagnosis || c.tcmDiagnosis || '未診斷'} ({c.date})</div>)}
              </div>
            )}
            {results.revenue.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">💰 營業</div>
                {results.revenue.map(r => <div key={r.id} className="search-item" onClick={() => doNavigate('rev')}>{r.name} {fmtM(r.amount)} — {String(r.date).substring(0,10)}</div>)}
              </div>
            )}
            {results.expenses.length > 0 && (
              <div className="search-group">
                <div className="search-group-title">🧾 開支</div>
                {results.expenses.map(r => <div key={r.id} className="search-item" onClick={() => doNavigate('exp')}>{r.merchant} {fmtM(r.amount)} — {String(r.date).substring(0,10)}</div>)}
              </div>
            )}
            {totalResults === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>找不到結果 — 試下用其他關鍵字</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Export Menu ──
function ExportMenu({ data, showToast, onClose }) {
  const thisMonth = new Date().toISOString().substring(0, 7);
  const exportMonthlyRev = () => {
    const rows = (data.revenue || []).filter(r => getMonth(r.date) === thisMonth);
    exportCSV(rows, [{ key:'date',label:'日期' },{ key:'name',label:'病人' },{ key:'item',label:'項目' },{ key:'amount',label:'金額' },{ key:'payment',label:'付款方式' },{ key:'store',label:'店舖' },{ key:'doctor',label:'醫師' }], `revenue_${thisMonth}.csv`);
    showToast('營業紀錄已匯出'); onClose();
  };
  const exportMonthlyExp = () => {
    const rows = (data.expenses || []).filter(r => getMonth(r.date) === thisMonth);
    exportCSV(rows, [{ key:'date',label:'日期' },{ key:'merchant',label:'商戶' },{ key:'amount',label:'金額' },{ key:'category',label:'類別' },{ key:'store',label:'店舖' },{ key:'desc',label:'描述' }], `expenses_${thisMonth}.csv`);
    showToast('開支紀錄已匯出'); onClose();
  };
  const exportAll = () => { exportJSON(data, `hcmc_backup_${new Date().toISOString().substring(0,10)}.json`); showToast('全部數據已匯出'); onClose(); };

  return (
    <div className="dropdown-menu">
      <div className="dropdown-item" onClick={exportMonthlyRev}>📊 本月營業紀錄 (CSV)</div>
      <div className="dropdown-item" onClick={exportMonthlyExp}>🧾 本月開支紀錄 (CSV)</div>
      <div className="dropdown-item" onClick={exportAll}>💾 所有數據 (JSON)</div>
    </div>
  );
}

// ── PWA Install Prompt ──
function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    // Check if dismissed recently
    const dismissed = localStorage.getItem('hcmc_install_dismissed');
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('hcmc_install_dismissed', String(Date.now()));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="install-banner">
      <span>📱 安裝{getClinicName().replace('綜合醫療中心','醫療')} App 到主畫面，使用更方便</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-teal btn-sm" onClick={handleInstall}>安裝</button>
        <button className="btn btn-outline btn-sm" onClick={handleDismiss}>稍後</button>
      </div>
    </div>
  );
}

// ── Mobile FAB (Quick Actions) (#65) ──
function MobileFAB({ onAction }) {
  const [open, setOpen] = useState(false);
  const actions = [
    { icon: '💰', label: '新增營業', page: 'rev' },
    { icon: '📅', label: '新增預約', page: 'booking' },
    { icon: '🎫', label: '掛號排隊', page: 'queue' },
    { icon: '👥', label: '新增病人', page: 'patient' },
    { icon: '🧾', label: '新增開支', page: 'exp' },
  ];
  return (
    <>
      {open && <div className="fab-overlay" onClick={() => setOpen(false)} />}
      <div className="fab-container">
        {open && (
          <div className="fab-menu">
            {actions.map(a => (
              <button key={a.page} className="fab-action" onClick={() => { onAction(a.page); setOpen(false); }}>
                <span>{a.icon}</span><span>{a.label}</span>
              </button>
            ))}
          </div>
        )}
        <button className={`fab-btn ${open ? 'fab-open' : ''}`} onClick={() => setOpen(!open)} aria-label="快捷操作">
          {open ? '✕' : '＋'}
        </button>
      </div>
    </>
  );
}

// ── Mobile More Menu ──
function MobileMoreMenu({ pages, page, setPage, onClose, user, onLogout }) {
  return (
    <div className="mobile-more-overlay" onClick={onClose}>
      <div className="mobile-more-panel" onClick={e => e.stopPropagation()}>
        <div className="mobile-more-header">
          <strong>全部功能</strong>
          <span onClick={onClose} style={{ cursor: 'pointer', fontSize: 18 }} role="button" aria-label="關閉">✕</span>
        </div>
        {user && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px 14px', marginBottom: 8, borderBottom: '1px solid var(--gray-200)' }}>
            <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>👤 {user.name} <span className={`tag ${ROLE_TAGS[user.role] || ''}`}>{ROLE_LABELS[user.role]}</span></span>
            <button className="btn btn-outline btn-sm" onClick={onLogout}>登出</button>
          </div>
        )}
        <div className="mobile-more-grid">
          {pages.map(p => (
            <div key={p.id} className={`mobile-more-item ${page === p.id ? 'active' : ''}`} onClick={() => { setPage(p.id); onClose(); }}>
              <span style={{ fontSize: 24 }}>{p.icon}</span>
              <span>{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main App ──
const LazyFallback = <div style={{ padding: 40, textAlign: 'center' }}>載入中...</div>;

export default function App() {
  const path = window.location.pathname;
  if (path === '/booking') return <ErrorBoundary><Suspense fallback={LazyFallback}><PublicBooking /></Suspense></ErrorBoundary>;
  if (path === '/checkin') return <ErrorBoundary><Suspense fallback={LazyFallback}><PublicCheckin /></Suspense></ErrorBoundary>;
  if (path === '/inquiry') return <ErrorBoundary><Suspense fallback={LazyFallback}><PublicInquiry /></Suspense></ErrorBoundary>;

  return <MainApp />;
}

function MainApp() {
  const [user, setUser] = useState(() => getCurrentUser());
  const [page, setPage] = useState('');
  const [data, setData] = useState({ revenue: [], expenses: [], arap: [], patients: [], bookings: [], payslips: [], consultations: [], packages: [], enrollments: [], conversations: [], inventory: [], queue: [], sickleaves: [], leaves: [], products: [], productSales: [], inquiries: [], communications: [], waitlist: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [activeStore, setActiveStore] = useState('all');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMore, setShowMore] = useState(false); // sidebar "更多功能" toggle
  const [openMenu, setOpenMenu] = useState(null); // eCTCM top nav dropdown
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [theme, setTheme] = useState(() => localStorage.getItem('hcmc_theme') || 'light');
  const [showLoginPage, setShowLoginPage] = useState(false);
  const [legalPage, setLegalPage] = useState(null); // 'terms' | 'privacy' | null
  const [readNotifs, setReadNotifs] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('hcmc_read_notifs') || '[]'); } catch { return []; }
  });

  // Toast notification - must be defined before hooks that use it
  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), type === 'error' ? 4000 : 2500);
  }, []);

  // Session management: idle timeout with warning + token refresh
  const handleLogoutSession = useCallback(() => { logout(); setUser(null); }, []);
  const { showIdleWarning, dismissWarning } = useSessionManager({
    user, onLogout: handleLogoutSession, showToast, idleMinutes: 30, warningMinutes: 5,
  });
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  useKeyboardShortcuts({
    onSearch: () => setShowSearch(true),
    onNavigate: setPage,
    onSave: () => showToast('已儲存', 'success'),
    onShowHelp: () => setShowShortcutsHelp(h => !h),
  });

  // Online/offline detection
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  // Dark mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('hcmc_theme', theme);
  }, [theme]);
  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), []);

  // Supabase Realtime — auto-sync across devices
  useEffect(() => {
    if (!user) return;
    const REALTIME_TABLES = ['revenue', 'expenses', 'patients', 'bookings', 'consultations', 'inventory', 'queue', 'inquiries', 'arap', 'leaves', 'products', 'productSales', 'packages', 'enrollments', 'sickleaves', 'payslips', 'surveys'];
    const subs = REALTIME_TABLES.map(table =>
      subscribeToChanges(table, (payload) => {
        const { eventType, new: newRec, old: oldRec } = payload;
        setData(prev => {
          const arr = [...(prev[table] || [])];
          if (eventType === 'INSERT') {
            if (!arr.find(r => r.id === newRec.id)) arr.push(newRec);
          } else if (eventType === 'UPDATE') {
            const idx = arr.findIndex(r => r.id === newRec.id);
            if (idx >= 0) arr[idx] = newRec; else arr.push(newRec);
          } else if (eventType === 'DELETE' && oldRec) {
            return { ...prev, [table]: arr.filter(r => r.id !== oldRec.id) };
          }
          return { ...prev, [table]: arr };
        });
      })
    ).filter(Boolean);
    return () => subs.forEach(s => unsubscribe(s));
  }, [user]);

  // Set default page based on role
  useEffect(() => {
    if (!user) return;
    if (user.role === 'doctor') setPage('doc');
    else if (user.role === 'staff') setPage('rev');
    else setPage('dash');
  }, [user]);

  const perms = user ? (PERMISSIONS[user.role] || {}) : {};
  const visiblePages = ALL_PAGES.filter(p => {
    if (perms[p.perm]) return true;
    // Doctors can view their own payslip
    if (p.id === 'pay' && perms.viewOwnPayslip) return true;
    return false;
  });
  const stores = getStores().filter(s => s.active);

  const filteredData = useMemo(() => filterByPermission(data, activeStore), [data, activeStore, user]);
  const notifications = useNotifications(filteredData);
  const unreadCount = notifications.filter((_, i) => !readNotifs.includes(i)).length;

  const handleLogout = useCallback(() => { logAction(user, 'logout', 'auth', '用戶登出'); logout(); setUser(null); }, [user]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await loadAllData();
      if (d && (d.revenue?.length || d.expenses?.length || d.patients?.length)) {
        setData({ revenue: d.revenue||[], expenses: d.expenses||[], arap: d.arap||[], patients: d.patients||[], bookings: d.bookings||[], payslips: d.payslips||[], consultations: d.consultations||[], packages: d.packages||[], enrollments: d.enrollments||[], conversations: d.conversations||[], inventory: d.inventory||[], queue: d.queue||[], sickleaves: d.sickleaves||[], leaves: d.leaves||[], products: d.products||[], productSales: d.productSales||[], inquiries: d.inquiries||[], communications: d.communications||[], waitlist: d.waitlist||[] });
      } else {
        setData(SEED_DATA);
        saveAllLocal(SEED_DATA);
      }
    } catch (err) {
      console.error('Data load failed:', err);
      showToast('數據加載失敗，使用本地備用數據');
      setData(SEED_DATA);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (user) reload(); }, [user, reload]);

  const updateData = useCallback((newData) => { setData(newData); saveAllLocal(newData); }, []);

  const markAllRead = () => {
    const ids = notifications.map((_, i) => i);
    setReadNotifs(ids);
    sessionStorage.setItem('hcmc_read_notifs', JSON.stringify(ids));
  };

  if (!user) {
    // Show legal pages (Terms / Privacy) from login screen
    if (legalPage === 'terms') {
      return (
        <ErrorBoundary>
        <Suspense fallback={LazyFallback}>
          <TermsOfService onBack={() => setLegalPage(null)} />
        </Suspense>
        </ErrorBoundary>
      );
    }
    if (legalPage === 'privacy') {
      return (
        <ErrorBoundary>
        <Suspense fallback={LazyFallback}>
          <PrivacyPolicy onBack={() => setLegalPage(null)} />
        </Suspense>
        </ErrorBoundary>
      );
    }

    const path = window.location.pathname;
    const isLandingRoute = path === '/' || path === '/landing';
    if (isLandingRoute && !showLoginPage) {
      return (
        <ErrorBoundary>
        <Suspense fallback={LazyFallback}>
          <LandingPage
            onGetStarted={() => setShowLoginPage(true)}
            onLogin={() => setShowLoginPage(true)}
          />
        </Suspense>
        </ErrorBoundary>
      );
    }
    return <LoginPage onLogin={(session) => { applyTenantTheme(); setShowLoginPage(false); setUser(session); }} onShowLegal={setLegalPage} />;
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 32, height: 32 }} />
        <span>載入數據中...</span>
      </div>
    );
  }

  const currentPage = visiblePages.find(p => p.id === page) || visiblePages[0];

  // Core pages: eCTCM-style — only 9 daily essentials in main nav, everything else in "更多"
  const CORE_IDS = new Set([
    'dash',       // 總覽
    'queue',      // 掛號排隊
    'emr',        // 電子病歷
    'billing',    // 配藥/收費
    'patient',    // 病人管理
    'inventory',  // 藥材庫存
    'booking',    // 預約系統
    'rev',        // 營業紀錄
    'report',     // 報表中心
  ]);

  const corePages = visiblePages.filter(p => CORE_IDS.has(p.id));
  const extraPages = visiblePages.filter(p => !CORE_IDS.has(p.id));

  // Build main sections — eCTCM layout: flat nav items, no nested dropdowns for core
  const SECTION_ORDER = ['診症', '營運', '財務'];
  const SECTION_REMAP = {
    'dash': '總覽',
    'queue': '診症', 'emr': '診症', 'patient': '診症', 'booking': '診症',
    'billing': '營運', 'inventory': '營運',
    'rev': '財務', 'report': '財務',
  };

  let sections = {};
  corePages.forEach(p => {
    const sec = SECTION_REMAP[p.id] || p.section;
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(p);
  });

  // Sort sections by defined order
  const orderedSections = {};
  SECTION_ORDER.forEach(s => { if (sections[s]) orderedSections[s] = sections[s]; });
  // Add any remaining
  Object.keys(sections).forEach(s => { if (!orderedSections[s]) orderedSections[s] = sections[s]; });
  sections = orderedSections;

  // Group extra pages by their original sections
  let extraSections = {};
  extraPages.forEach(p => {
    if (!extraSections[p.section]) extraSections[p.section] = [];
    extraSections[p.section].push(p);
  });

  // Mobile tabs filtered by permissions
  const mobileTabs = MOBILE_TABS.filter(t => t.id === 'more' || perms[ALL_PAGES.find(p => p.id === t.id)?.perm]);

  return (
    <>
      {/* eCTCM Top Header Bar */}
      <div className="hide-mobile" style={{ background: 'linear-gradient(180deg, #007777 0%, #006666 100%)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', fontSize: 13, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={getClinicLogo() || '/logo.jpg'} alt={getClinicName()} style={{ height: 36, borderRadius: 6, background: '#fff', padding: '2px 6px' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 1 }}>{getClinicName()}</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>Hong Ching International Medical Centre</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {isOffline && <span style={{ background: '#cc6600', padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>離線模式</span>}
          {perms.viewAllStores && (
            <select style={{ background: '#005555', color: '#fff', border: '1px solid #008888', borderRadius: 3, padding: '2px 6px', fontSize: 12, fontWeight: 600 }} value={activeStore} onChange={e => setActiveStore(e.target.value)}>
              <option value="all">全部分店</option>
              {stores.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          )}
          <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowSearch(true)} title="搜尋">🔍</button>
          <div style={{ position: 'relative' }}>
            <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14 }} onClick={() => setShowNotif(!showNotif)} title="通知">
              🔔{unreadCount > 0 && <span style={{ position: 'absolute', top: -4, right: -6, background: '#dc2626', color: '#fff', borderRadius: '50%', fontSize: 9, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unreadCount}</span>}
            </button>
            {showNotif && (
              <div className="dropdown-menu notif-panel" style={{ right: 0, width: 360, maxHeight: 480, overflowY: 'auto', position: 'absolute', top: '100%', zIndex: 200, background: '#fff', color: '#333', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #eee' }}>
                  <strong style={{ fontSize: 13 }}>通知 ({notifications.length})</strong>
                  <button className="btn btn-outline btn-sm" style={{ fontSize: 10 }} onClick={markAllRead}>全部已讀</button>
                </div>
                {notifications.length > 0 && (
                  <div style={{ padding: '4px 12px', display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid #eee' }}>
                    {(() => {
                      const cats = [...new Set(notifications.map(n => n.category).filter(Boolean))];
                      return cats.map(c => {
                        const count = notifications.filter(n => n.category === c).length;
                        return <span key={c} style={{ fontSize: 10, padding: '2px 6px', background: '#f0f0f0', borderRadius: 10, color: '#666' }}>{c} {count}</span>;
                      });
                    })()}
                  </div>
                )}
                {notifications.map((n, i) => (
                  <div key={i} style={{ padding: '8px 12px', opacity: readNotifs.includes(i) ? 0.5 : 1, fontSize: 12, borderLeft: n.priority === 'high' ? '3px solid #dc2626' : n.priority === 'medium' ? '3px solid #d97706' : '3px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>
                    <span>{n.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div>{n.title}</div>
                      <div style={{ fontSize: 10, color: '#999', display: 'flex', gap: 6, marginTop: 2 }}>
                        {n.category && <span>{n.category}</span>}
                        <span>{n.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {notifications.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: '#999', fontSize: 12 }}>暫無通知</div>}
              </div>
            )}
          </div>
          {perms.viewReports && (
            <div style={{ position: 'relative' }}>
              <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12 }} onClick={() => setShowExport(!showExport)}>📥 匯出</button>
              {showExport && <ExportMenu data={filteredData} showToast={showToast} onClose={() => setShowExport(false)} />}
            </div>
          )}
          <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14 }} onClick={toggleTheme} title={theme === 'dark' ? '淺色模式' : '深色模式'}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14 }} onClick={reload} title="重新整理">🔄</button>
          <SyncIndicator />
          <span style={{ fontSize: 12, color: '#cce6e6', display: 'flex', alignItems: 'center', gap: 4 }}>
            👤 {user.name} <span className={`tag ${ROLE_TAGS[user.role] || ''}`} style={{ fontSize: 10 }}>{ROLE_LABELS[user.role]}</span>
          </span>
          <button style={{ background: '#004d4d', border: '1px solid #008888', color: '#fff', borderRadius: 3, padding: '2px 10px', cursor: 'pointer', fontSize: 12 }} onClick={handleLogout}>登出</button>
        </div>
      </div>

      {/* eCTCM Main Nav Bar (desktop) */}
      <div className="hide-mobile" style={{ background: '#005555', display: 'flex', gap: 0, padding: '0 8px', fontSize: 14, position: 'sticky', top: 56, zIndex: 99, borderBottom: '2px solid #004444' }}>
        {Object.entries(sections).map(([section, items]) => {
          const isActive = items.some(p => p.id === page);
          const isOpen = openMenu === section;
          return (
            <div key={section} style={{ position: 'relative' }}
              onMouseEnter={() => setOpenMenu(section)}
              onMouseLeave={() => setOpenMenu(null)}>
              <div style={{
                padding: '10px 18px', cursor: 'pointer', color: '#fff', fontWeight: isActive ? 700 : 500,
                background: isActive ? '#004444' : isOpen ? '#004d4d' : 'transparent',
                borderBottom: isActive ? '3px solid #ffcc00' : '3px solid transparent',
                whiteSpace: 'nowrap', transition: 'background .15s', fontSize: 14, letterSpacing: 0.5,
              }}>
                {section} {items.length > 1 ? '▼' : ''}
              </div>
              {isOpen && items.length > 1 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, background: '#fff', minWidth: 180,
                  boxShadow: '0 4px 12px rgba(0,0,0,.18)', borderRadius: '0 0 4px 4px', zIndex: 200,
                  border: '1px solid #ddd', borderTop: '2px solid #006666',
                }}>
                  {items.map(p => (
                    <div key={p.id} onClick={() => { setPage(p.id); setOpenMenu(null); }}
                      style={{
                        padding: '8px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
                        background: page === p.id ? '#e6f5f5' : '#fff', color: page === p.id ? '#006666' : '#333',
                        fontWeight: page === p.id ? 700 : 400, borderBottom: '1px solid #f0f0f0',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = page === p.id ? '#e6f5f5' : '#f5fafa'}
                      onMouseLeave={e => e.currentTarget.style.background = page === p.id ? '#e6f5f5' : '#fff'}>
                      <span style={{ fontSize: 14 }}>{p.icon}</span>
                      <span>{p.label}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Single-item sections: click directly */}
              {items.length === 1 && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, cursor: 'pointer' }}
                  onClick={() => { setPage(items[0].id); setOpenMenu(null); }} />
              )}
            </div>
          );
        })}
        {/* Extra pages as "更多" dropdown */}
        {extraPages.length > 0 && (
          <div style={{ position: 'relative' }}
            onMouseEnter={() => setOpenMenu('__extra')}
            onMouseLeave={() => setOpenMenu(null)}>
            <div style={{
              padding: '7px 14px', cursor: 'pointer', color: '#fff',
              fontWeight: extraPages.some(p => p.id === page) ? 700 : 400,
              background: extraPages.some(p => p.id === page) ? '#004444' : openMenu === '__extra' ? '#004d4d' : 'transparent',
              borderBottom: extraPages.some(p => p.id === page) ? '2px solid #ffcc00' : '2px solid transparent',
              whiteSpace: 'nowrap',
            }}>
              更多 ▼
            </div>
            {openMenu === '__extra' && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, background: '#fff', minWidth: 220, maxHeight: 420, overflowY: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,.18)', borderRadius: '0 0 4px 4px', zIndex: 200,
                border: '1px solid #ddd', borderTop: '2px solid #006666',
              }}>
                {Object.entries(extraSections).map(([section, items]) => (
                  <div key={section}>
                    <div style={{ fontSize: 10, color: '#999', padding: '6px 14px 2px', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{section}</div>
                    {items.map(p => (
                      <div key={p.id} onClick={() => { setPage(p.id); setOpenMenu(null); }}
                        style={{
                          padding: '6px 14px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
                          background: page === p.id ? '#e6f5f5' : '#fff', color: page === p.id ? '#006666' : '#333',
                          fontWeight: page === p.id ? 700 : 400,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = page === p.id ? '#e6f5f5' : '#f5fafa'}
                        onMouseLeave={e => e.currentTarget.style.background = page === p.id ? '#e6f5f5' : '#fff'}>
                        <span style={{ fontSize: 13 }}>{p.icon}</span>
                        <span>{p.label}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Settings */}
        {perms.viewSettings && (
          <div style={{ position: 'relative' }}>
            <div onClick={() => { setPage('settings'); setOpenMenu(null); }}
              style={{
                padding: '7px 14px', cursor: 'pointer', color: '#fff',
                fontWeight: page === 'settings' ? 700 : 400,
                background: page === 'settings' ? '#004444' : 'transparent',
                borderBottom: page === 'settings' ? '2px solid #ffcc00' : '2px solid transparent',
                whiteSpace: 'nowrap',
              }}>
              ⚙️ 設定
            </div>
          </div>
        )}
      </div>

      {/* eCTCM Page Title Bar */}
      <div className="hide-mobile" style={{ background: '#006666', color: '#fff', padding: '5px 12px', fontSize: 13, fontWeight: 600 }}>
        {page === 'settings' ? '⚙️ 設定' : `${currentPage?.icon || ''} ${currentPage?.label || ''}`}
      </div>

      {/* MAIN (full width, no sidebar) */}
      <main role="main" aria-label="主要內容" style={{ width: '100%', minHeight: 'calc(100vh - 100px)' }}>
        <div style={{ padding: 0 }}>
          <ErrorBoundary>
          <Suspense fallback={LazyFallback}>
            {page === 'dash' && <Dashboard data={filteredData} onNavigate={setPage} />}
            {page === 'rev' && <Revenue data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'exp' && <Expenses data={filteredData} setData={updateData} showToast={showToast} allData={data} onNavigate={setPage} />}
            {page === 'scan' && <ReceiptScanner data={filteredData} setData={updateData} showToast={showToast} onNavigate={setPage} allData={data} />}
            {page === 'arap' && <ARAP data={filteredData} setData={updateData} showToast={showToast} allData={data} />}
            {page === 'patient' && <PatientPage data={filteredData} setData={updateData} showToast={showToast} allData={data} onNavigate={setPage} />}
            {page === 'booking' && <BookingPage data={filteredData} setData={updateData} showToast={showToast} allData={data} />}
            {page === 'queue' && <QueuePage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} onNavigate={setPage} />}
            {page === 'emr' && <EMRPage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} onNavigate={setPage} />}
            {page === 'package' && <PackagePage data={filteredData} setData={updateData} showToast={showToast} allData={data} />}
            {page === 'wa-inbox' && <WhatsAppInbox data={filteredData} setData={updateData} user={user} showToast={showToast} />}
            {page === 'crm' && <CRMPage data={filteredData} setData={updateData} showToast={showToast} />}
            {page === 'inventory' && <InventoryPage data={filteredData} setData={updateData} showToast={showToast} onNavigate={setPage} />}
            {page === 'medscan' && <MedicineScanner data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} onNavigate={setPage} />}
            {page === 'billing' && <BillingPage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'products' && <ProductPage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'voucher' && <ElderlyVoucherPage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'closing' && <DailyClosing data={filteredData} showToast={showToast} user={user} />}
            {page === 'formulas' && <MyFormulas showToast={showToast} user={user} />}
            {page === 'dispensing' && <DispensingLog data={filteredData} showToast={showToast} user={user} />}
            {page === 'purchase' && <PurchaseOrders data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'regqueue' && <RegistrationQueue data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'rxprint' && <PrescriptionPrint data={filteredData} showToast={showToast} user={user} />}
            {page === 'vitals' && <VitalSigns data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'rxhistory' && <PrescriptionHistory data={filteredData} showToast={showToast} user={user} />}
            {page === 'calendar' && <MyCalendar data={filteredData} showToast={showToast} user={user} />}
            {page === 'advice' && <DoctorAdvice showToast={showToast} user={user} />}
            {page === 'consultlist' && <ConsultationList data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'discount' && <DiscountSettings data={filteredData} showToast={showToast} user={user} />}
            {page === 'msgtpl' && <MessageTemplates showToast={showToast} user={user} />}
            {page === 'syscheck' && <SystemCheck data={filteredData} showToast={showToast} user={user} />}
            {page === 'backup' && <BackupCenter data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'feedback' && <PatientFeedback data={filteredData} showToast={showToast} user={user} />}
            {page === 'attendance' && <AttendancePage showToast={showToast} data={data} user={user} />}
            {page === 'prodorders' && <ProductOrders data={filteredData} showToast={showToast} user={user} />}
            {page === 'audit' && <AuditTrail data={filteredData} showToast={showToast} user={user} />}
            {page === 'stocktake' && <Stocktaking data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'txplan' && <TreatmentPlan data={filteredData} showToast={showToast} user={user} />}
            {page === 'storedcard' && <StoredValueCard data={filteredData} showToast={showToast} user={user} />}
            {page === 'broadcast' && <ClinicBroadcast showToast={showToast} user={user} />}
            {page === 'quickmenu' && <QuickMenu showToast={showToast} user={user} onNavigate={setPage} />}
            {page === 'recruit' && <Recruitment showToast={showToast} user={user} />}
            {page === 'meddetail' && <MedicineDetail data={filteredData} showToast={showToast} user={user} />}
            {page === 'drugprice' && <DrugPricing data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'rxprinten' && <PrescriptionPrintEN data={filteredData} showToast={showToast} user={user} />}
            {page === 'queueslip' && <QueueSlip data={filteredData} showToast={showToast} user={user} />}
            {page === 'refill' && <PrescriptionRefill data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'custanalytics' && <CustomerAnalytics data={filteredData} showToast={showToast} user={user} />}
            {page === 'transfer' && <InterClinicTransfer data={filteredData} showToast={showToast} user={user} />}
            {page === 'supplier' && <SupplierManagement data={filteredData} showToast={showToast} user={user} />}
            {page === 'referral' && <ReferralTracking data={filteredData} showToast={showToast} user={user} />}
            {page === 'labresult' && <LabResults data={filteredData} showToast={showToast} user={user} />}
            {page === 'medcert' && <MedicalCertificate data={filteredData} showToast={showToast} user={user} />}
            {page === 'drugcheck' && <DrugInteraction data={filteredData} showToast={showToast} user={user} />}
            {page === 'reminder' && <AppointmentReminder data={filteredData} showToast={showToast} user={user} />}
            {page === 'pnl' && <IncomeStatement data={filteredData} showToast={showToast} user={user} />}
            {page === 'consent' && <ConsentForm data={filteredData} showToast={showToast} user={user} />}
            {page === 'insurance' && <InsuranceClaim data={filteredData} showToast={showToast} user={user} />}
            {page === 'expreport' && <ClinicExpenseReport data={filteredData} showToast={showToast} user={user} />}
            {page === 'timeline' && <PatientTimeline data={filteredData} showToast={showToast} user={user} />}
            {page === 'dataexport' && <ExcelExport data={filteredData} showToast={showToast} user={user} />}
            {page === 'waittime' && <WaitingTimeAnalytics data={filteredData} showToast={showToast} user={user} />}
            {page === 'allergy' && <AllergyAlert data={filteredData} showToast={showToast} user={user} />}
            {page === 'followup' && <FollowUpManager data={filteredData} showToast={showToast} user={user} />}
            {page === 'notifcenter' && <NotificationCenter data={filteredData} showToast={showToast} user={user} onNavigate={setPage} />}
            {page === 'herbwiki' && <HerbWiki showToast={showToast} user={user} />}
            {page === 'kpi' && <ClinicKPI data={filteredData} showToast={showToast} user={user} />}
            {page === 'corpservice' && <CompanyServices data={filteredData} showToast={showToast} user={user} />}
            {page === 'acuchart' && <AcupunctureChart data={filteredData} showToast={showToast} user={user} />}
            {page === 'training' && <StaffTraining data={filteredData} showToast={showToast} user={user} />}
            {page === 'equipment' && <EquipmentManagement showToast={showToast} user={user} />}
            {page === 'revgoal' && <RevenueGoalTracker data={filteredData} showToast={showToast} user={user} />}
            {page === 'education' && <PatientEducation data={filteredData} showToast={showToast} user={user} />}
            {page === 'cashflow' && <CashFlowReport data={filteredData} showToast={showToast} user={user} />}
            {page === 'debt' && <DebtCollection data={filteredData} showToast={showToast} user={user} />}
            {page === 'tax' && <TaxReport data={filteredData} showToast={showToast} user={user} />}
            {page === 'contract' && <ContractManagement showToast={showToast} user={user} />}
            {page === 'cliniccal' && <ClinicCalendar data={filteredData} showToast={showToast} user={user} />}
            {page === 'expiry' && <InventoryExpiry data={filteredData} showToast={showToast} user={user} />}
            {page === 'ptgroup' && <PatientGroup data={filteredData} showToast={showToast} user={user} />}
            {page === 'medhist' && <MedicalHistory data={filteredData} showToast={showToast} user={user} />}
            {page === 'mpf' && <MPFCalculator data={filteredData} showToast={showToast} user={user} />}
            {page === 'commission' && <CommissionCalculator data={filteredData} showToast={showToast} user={user} />}
            {page === 'incident' && <IncidentReport showToast={showToast} user={user} />}
            {page === 'qualityaudit' && <QualityAudit showToast={showToast} user={user} />}
            {page === 'sop' && <SOPManagement showToast={showToast} user={user} />}
            {page === 'birthday' && <BirthdayCampaign data={filteredData} showToast={showToast} user={user} />}
            {page === 'docprofile' && <DoctorProfile data={filteredData} showToast={showToast} user={user} />}
            {page === 'promo' && <SeasonalPromo data={filteredData} showToast={showToast} user={user} />}
            {page === 'clinicmap' && <ClinicMap showToast={showToast} user={user} />}
            {page === 'portal' && <PatientPortal showToast={showToast} user={user} />}
            {page === 'findash' && <FinancialDashboard data={filteredData} showToast={showToast} user={user} />}
            {page === 'chronic' && <ChronicDiseaseTracker data={filteredData} showToast={showToast} user={user} />}
            {page === 'signage' && <DigitalSignage data={filteredData} showToast={showToast} user={user} />}
            {page === 'loyalty' && <LoyaltyProgram data={filteredData} showToast={showToast} user={user} />}
            {page === 'opsdash' && <OperationsDashboard data={filteredData} showToast={showToast} user={user} />}
            {page === 'waste' && <WasteManagement data={filteredData} showToast={showToast} user={user} />}
            {page === 'emergency' && <EmergencyProtocol data={filteredData} showToast={showToast} user={user} />}
            {page === 'satreport' && <PatientSatisfactionReport data={filteredData} showToast={showToast} user={user} />}
            {page === 'screening' && <HealthScreening data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'doctpl' && <DocumentTemplate data={filteredData} showToast={showToast} user={user} />}
            {page === 'staffeval' && <StaffEvaluation data={filteredData} showToast={showToast} user={user} />}
            {page === 'policy' && <ClinicPolicy data={filteredData} showToast={showToast} user={user} />}
            {page === 'memtier' && <MembershipTier data={filteredData} showToast={showToast} user={user} />}
            {page === 'handover' && <ShiftHandover data={filteredData} showToast={showToast} user={user} />}
            {page === 'pathway' && <ClinicalPathway data={filteredData} showToast={showToast} user={user} />}
            {page === 'clinicins' && <ClinicInsurance data={filteredData} showToast={showToast} user={user} />}
            {page === 'workflow' && <WorkflowAutomation data={filteredData} showToast={showToast} user={user} />}
            {page === 'telemedicine' && <TelemedicineConsult data={filteredData} showToast={showToast} user={user} />}
            {page === 'benchmark' && <ClinicBenchmark data={filteredData} showToast={showToast} user={user} />}
            {page === 'consentlog' && <PatientConsentLog data={filteredData} showToast={showToast} user={user} />}
            {page === 'pricelist' && <PriceList data={filteredData} showToast={showToast} user={user} />}
            {page === 'resource' && <ResourceScheduling data={filteredData} showToast={showToast} user={user} />}
            {page === 'announce' && <ClinicAnnouncement data={filteredData} showToast={showToast} user={user} />}
            {page === 'riskscore' && <PatientRiskScore data={filteredData} showToast={showToast} user={user} />}
            {page === 'vendorpay' && <VendorPayment data={filteredData} showToast={showToast} user={user} />}
            {page === 'roster' && <StaffRoster data={filteredData} showToast={showToast} user={user} />}
            {page === 'waitlist' && <PatientWaitlist data={filteredData} showToast={showToast} user={user} />}
            {page === 'budget' && <ClinicBudget data={filteredData} showToast={showToast} user={user} />}
            {page === 'demographics' && <PatientDemographics data={filteredData} showToast={showToast} user={user} />}
            {page === 'tgexpense' && <TelegramExpense data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'checkin' && <PatientCheckIn data={filteredData} showToast={showToast} user={user} />}
            {page === 'renovation' && <ClinicRenovation data={filteredData} showToast={showToast} user={user} />}
            {page === 'herbprint' && <HerbFormulaPrint data={filteredData} showToast={showToast} user={user} />}
            {page === 'utility' && <ClinicUtility data={filteredData} showToast={showToast} user={user} />}
            {page === 'transport' && <PatientTransport data={filteredData} showToast={showToast} user={user} />}
            {page === 'compliance' && <ClinicCompliance data={filteredData} showToast={showToast} user={user} />}
            {page === 'giftvoucher' && <GiftVoucher data={filteredData} showToast={showToast} user={user} />}
            {page === 'docrating' && <DoctorRating data={filteredData} showToast={showToast} user={user} />}
            {page === 'medreturn' && <MedicineReturn data={filteredData} showToast={showToast} user={user} />}
            {page === 'partnership' && <ClinicPartnership data={filteredData} showToast={showToast} user={user} />}
            {page === 'feedwall' && <ClinicFeedbackWall data={filteredData} showToast={showToast} user={user} />}
            {page === 'invvalue' && <InventoryValuation data={filteredData} showToast={showToast} user={user} />}
            {page === 'newsletter' && <ClinicNewsletter data={filteredData} showToast={showToast} user={user} />}
            {page === 'laborder' && <LabOrderTracking data={filteredData} showToast={showToast} user={user} />}
            {page === 'dailytarget' && <DailyRevenueTarget data={filteredData} showToast={showToast} user={user} />}
            {page === 'discharge' && <PatientDischarge data={filteredData} showToast={showToast} user={user} />}
            {page === 'okr' && <ClinicGoalSetting data={filteredData} showToast={showToast} user={user} />}
            {page === 'herbcalc' && <HerbBlendCalculator data={filteredData} showToast={showToast} user={user} />}
            {page === 'surveybuilder' && <ClinicSurveyBuilder data={filteredData} showToast={showToast} user={user} />}
            {page === 'patallergy' && <PatientAllergy data={filteredData} showToast={showToast} user={user} />}
            {page === 'staffcert' && <StaffCertification data={filteredData} showToast={showToast} user={user} />}
            {page === 'safetychk' && <ClinicSafetyChecklist data={filteredData} showToast={showToast} user={user} />}
            {page === 'supplyorder' && <MedicalSupplyOrder data={filteredData} showToast={showToast} user={user} />}
            {page === 'patmed' && <PatientMedication data={filteredData} showToast={showToast} user={user} />}
            {page === 'roombooking' && <ClinicRoomBooking data={filteredData} showToast={showToast} user={user} />}
            {page === 'patinsurance' && <PatientInsurance data={filteredData} showToast={showToast} user={user} />}
            {page === 'revbreakdown' && <ClinicRevenueBreakdown data={filteredData} showToast={showToast} user={user} />}
            {page === 'herbsource' && <HerbSourcingTracker data={filteredData} showToast={showToast} user={user} />}
            {page === 'floorplan' && <ClinicFloorPlan data={filteredData} showToast={showToast} user={user} />}
            {page === 'community' && <PatientCommunity data={filteredData} showToast={showToast} user={user} />}
            {page === 'sickleave' && <SickLeavePage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'pay' && <Payslip data={filteredData} setData={updateData} showToast={showToast} allData={data} />}
            {page === 'schedule' && <DoctorSchedule data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'leave' && <LeavePage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'doc' && <DoctorAnalytics data={filteredData} user={user} />}
            {page === 'report' && <Reports data={filteredData} />}
            {page === 'ai' && <AIChatPage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'compare' && <StoreComparePage data={filteredData} allData={data} showToast={showToast} />}
            {page === 'survey' && <SurveyPage data={filteredData} setData={setData} showToast={showToast} user={user} />}
            {page === 'ehealth' && <EHealthPage data={filteredData} setData={updateData} showToast={showToast} allData={data} user={user} />}
            {page === 'privacy' && <PrivacyCenter data={filteredData} setData={updateData} showToast={showToast} user={user} />}
            {page === 'superadmin' && <SuperAdmin showToast={showToast} user={user} />}
            {page === 'settings' && <SettingsPage data={data} setData={updateData} showToast={showToast} user={user} />}
            {page === 'tos' && <TermsOfService onBack={() => setPage('dash')} />}
            {page === 'pp' && <PrivacyPolicy onBack={() => setPage('dash')} />}
            {page === 'monthend' && <MonthEndClosing data={filteredData} setData={updateData} showToast={showToast} user={user} onNavigate={setPage} />}
            {page === 'billingsub' && <BillingSettings />}
            {page === 'payroll' && <PayrollPage showToast={showToast} data={data} user={user} />}
            {page === 'dataimport' && <DataImport showToast={showToast} data={data} setData={setData} user={user} />}
            {page === 'taskboard' && <TaskBoard showToast={showToast} data={data} user={user} setPage={setPage} />}
            {page === 'ectcm' && <ECTCMRevenue data={filteredData} showToast={showToast} user={user} />}
            {page === 'dailycare' && <DailyCare data={filteredData} showToast={showToast} user={user} />}
          </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile FAB (#65) */}
      <MobileFAB onAction={setPage} />

      {/* Mobile Bottom Tab Bar */}
      <nav className="mobile-tabbar" role="tablist" aria-label="流動版導覽">
        {mobileTabs.map(t => (
          <div
            key={t.id}
            className={`mobile-tab ${(t.id === 'more' ? false : page === t.id) ? 'active' : ''}`}
            onClick={() => t.id === 'more' ? setShowMoreMenu(true) : setPage(t.id)}
            role="tab" tabIndex={0} aria-selected={page === t.id} aria-label={t.label}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.id === 'more' ? setShowMoreMenu(true) : setPage(t.id); } }}
          >
            <span className="mobile-tab-icon" aria-hidden="true">{t.icon}</span>
            <span className="mobile-tab-label">{t.label}</span>
          </div>
        ))}
      </nav>

      {showMoreMenu && <MobileMoreMenu pages={[...visiblePages, ...(perms.viewSettings ? [{ id:'settings', icon:'⚙️', label:'設定' }] : [])]} page={page} setPage={setPage} onClose={() => setShowMoreMenu(false)} user={user} onLogout={handleLogout} />}
      {showSearch && <SearchPanel data={filteredData} onNavigate={setPage} onClose={() => setShowSearch(false)} />}
      {(showNotif || showExport) && <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => { setShowNotif(false); setShowExport(false); }} />}
      {toast && <div className={`toast ${toast.type === 'error' ? 'toast-error' : toast.type === 'success' ? 'toast-success' : toast.type === 'warning' ? 'toast-warning' : ''}`}>{toast.type === 'error' ? '❌ ' : toast.type === 'success' ? '✅ ' : toast.type === 'warning' ? '⚠️ ' : ''}{toast.msg}</div>}
      {showShortcutsHelp && <ShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />}
      {showIdleWarning && <IdleWarning minutes={25} onDismiss={dismissWarning} onLogout={handleLogoutSession} />}
      <InstallPrompt />
    </>
  );
}
