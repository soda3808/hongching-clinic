-- ══════════════════════════════════
-- Hong Ching Medical Centre — Supabase Schema
-- Run this in Supabase SQL Editor
-- ══════════════════════════════════

-- Revenue
CREATE TABLE IF NOT EXISTS revenue (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  name TEXT,
  item TEXT,
  amount NUMERIC DEFAULT 0,
  payment TEXT,
  store TEXT,
  doctor TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  merchant TEXT,
  amount NUMERIC DEFAULT 0,
  category TEXT,
  store TEXT,
  payment TEXT,
  "desc" TEXT,
  receipt TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ARAP (Accounts Receivable / Payable)
CREATE TABLE IF NOT EXISTS arap (
  id TEXT PRIMARY KEY,
  type TEXT, -- 'receivable' | 'payable'
  party TEXT,
  amount NUMERIC DEFAULT 0,
  "dueDate" TEXT,
  status TEXT DEFAULT 'pending',
  store TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Patients
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  gender TEXT,
  dob TEXT,
  address TEXT,
  allergies TEXT,
  notes TEXT,
  store TEXT,
  doctor TEXT,
  status TEXT DEFAULT 'active',
  "firstVisit" TEXT,
  "lastVisit" TEXT,
  "totalVisits" INTEGER DEFAULT 0,
  "totalSpent" NUMERIC DEFAULT 0,
  "createdAt" TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  "patientName" TEXT,
  "patientPhone" TEXT,
  date TEXT NOT NULL,
  time TEXT,
  duration INTEGER DEFAULT 30,
  doctor TEXT,
  store TEXT,
  type TEXT,
  status TEXT DEFAULT 'confirmed',
  notes TEXT,
  "createdAt" TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payslips
CREATE TABLE IF NOT EXISTS payslips (
  id TEXT PRIMARY KEY,
  employee TEXT,
  month TEXT,
  base NUMERIC DEFAULT 0,
  commission NUMERIC DEFAULT 0,
  deductions NUMERIC DEFAULT 0,
  net NUMERIC DEFAULT 0,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Consultations (EMR)
CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  "patientId" TEXT,
  "patientName" TEXT,
  "patientPhone" TEXT,
  date TEXT NOT NULL,
  doctor TEXT,
  store TEXT,
  subjective TEXT,
  objective TEXT,
  assessment TEXT,
  plan TEXT,
  "tcmDiagnosis" TEXT,
  "tcmPattern" TEXT,
  tongue TEXT,
  pulse TEXT,
  prescription JSONB DEFAULT '[]',
  "formulaName" TEXT,
  "formulaDays" INTEGER,
  "formulaInstructions" TEXT,
  treatments JSONB DEFAULT '[]',
  "acupuncturePoints" TEXT,
  "followUpDate" TEXT,
  "followUpNotes" TEXT,
  fee NUMERIC DEFAULT 0,
  "createdAt" TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Packages
CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'session',
  sessions INTEGER DEFAULT 1,
  price NUMERIC DEFAULT 0,
  "validDays" INTEGER DEFAULT 180,
  treatments JSONB DEFAULT '[]',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enrollments
CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  "packageId" TEXT,
  "patientId" TEXT,
  "patientName" TEXT,
  "patientPhone" TEXT,
  "purchaseDate" TEXT,
  "expiryDate" TEXT,
  "totalSessions" INTEGER DEFAULT 0,
  "usedSessions" INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  store TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Conversations (CRM)
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  "patientId" TEXT,
  "patientName" TEXT,
  "patientPhone" TEXT,
  store TEXT,
  messages JSONB DEFAULT '[]',
  "lastMessage" TEXT,
  "lastTimestamp" TEXT,
  unread INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inventory (Herb stock)
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT '中藥',
  unit TEXT DEFAULT 'g',
  stock NUMERIC DEFAULT 0,
  "minStock" NUMERIC DEFAULT 100,
  "costPerUnit" NUMERIC DEFAULT 0,
  supplier TEXT,
  store TEXT,
  "lastRestocked" TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Queue/Registration
CREATE TABLE IF NOT EXISTS queue (
  id TEXT PRIMARY KEY,
  "queueNo" TEXT,
  "patientName" TEXT,
  "patientPhone" TEXT,
  date TEXT NOT NULL,
  "registeredAt" TEXT,
  "arrivedAt" TEXT,
  "completedAt" TEXT,
  doctor TEXT,
  store TEXT,
  services TEXT,
  "serviceFee" NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'waiting',
  "dispensingStatus" TEXT DEFAULT 'not-needed',
  "paymentStatus" TEXT DEFAULT 'pending',
  "consultationId" TEXT,
  "createdAt" TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add medicineCode to inventory
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS "medicineCode" TEXT;

-- Enable Row Level Security (optional, can be configured later)
-- ALTER TABLE revenue ENABLE ROW LEVEL SECURITY;
-- etc.

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE consultations;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE queue;
