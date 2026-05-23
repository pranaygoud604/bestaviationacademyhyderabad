-- ============================================================
-- SkyHost CRM — Enterprise Aviation Admissions OS
-- Run this in: Supabase → SQL Editor → New Query
-- Safe to re-run (uses IF NOT EXISTS / IF NOT EXISTS guards)
-- ============================================================

-- ── 1. Extend existing leads table ───────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 50;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_probability DECIMAL(5,2) DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS course_interest TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS total_fees DECIMAL(12,2) DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS medical_status TEXT DEFAULT 'pending';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS dgca_stage TEXT DEFAULT 'not_started';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interview_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS duplicate_of UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS state TEXT;

-- ── 2. Extend existing employees table ───────────────────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS target_monthly DECIMAL(12,2) DEFAULT 500000;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT 5.0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS sla_hours INTEGER DEFAULT 4;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(12,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS password TEXT;

-- ── 3. follow_up_tasks ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id     UUID REFERENCES leads(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES employees(id),
  title       TEXT NOT NULL,
  description TEXT,
  due_date    TIMESTAMPTZ NOT NULL,
  status      TEXT DEFAULT 'pending'
              CHECK (status IN ('pending','completed','overdue','escalated','cancelled')),
  priority    TEXT DEFAULT 'medium'
              CHECK (priority IN ('low','medium','high','urgent')),
  type        TEXT DEFAULT 'call'
              CHECK (type IN ('call','meeting','email','whatsapp','demo','follow_up')),
  completed_at  TIMESTAMPTZ,
  escalated_to  UUID REFERENCES employees(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. employee_targets ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_targets (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id         UUID REFERENCES employees(id) ON DELETE CASCADE,
  month               INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                INTEGER NOT NULL,
  revenue_target      DECIMAL(12,2) DEFAULT 0,
  conversion_target   INTEGER DEFAULT 0,
  leads_target        INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, month, year)
);

-- ── 5. revenue_records ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revenue_records (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID REFERENCES leads(id),
  employee_id   UUID REFERENCES employees(id),
  amount        DECIMAL(12,2) NOT NULL,
  type          TEXT DEFAULT 'enrollment'
                CHECK (type IN ('enrollment','installment','refund','partial','scholarship')),
  course        TEXT,
  description   TEXT,
  payment_date  DATE DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. interviews ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interviews (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE,
  conducted_by  UUID REFERENCES employees(id),
  scheduled_at  TIMESTAMPTZ NOT NULL,
  completed_at  TIMESTAMPTZ,
  status        TEXT DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','completed','cancelled','no_show','rescheduled')),
  outcome       TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 7. aviation_documents ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS aviation_documents (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE,
  type          TEXT NOT NULL
                CHECK (type IN (
                  'medical_class1','medical_class2','id_proof','education',
                  'dgca_student','dgca_exam','logbook','passport','others'
                )),
  name          TEXT NOT NULL,
  url           TEXT,
  status        TEXT DEFAULT 'pending'
                CHECK (status IN ('pending','submitted','verified','rejected','expired')),
  verified_by   UUID REFERENCES employees(id),
  verified_at   TIMESTAMPTZ,
  expiry_date   DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. batches ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS batches (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  course      TEXT NOT NULL
              CHECK (course IN ('PPL','CPL','ATPL','IR','ME','Diploma','Ground School')),
  start_date  DATE,
  end_date    DATE,
  capacity    INTEGER DEFAULT 20,
  enrolled    INTEGER DEFAULT 0,
  instructor  TEXT,
  location    TEXT DEFAULT 'Hyderabad',
  status      TEXT DEFAULT 'upcoming'
              CHECK (status IN ('upcoming','active','completed','cancelled')),
  fees        DECIMAL(12,2),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 9. pipeline_history ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_history (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id               UUID REFERENCES leads(id) ON DELETE CASCADE,
  from_stage            TEXT,
  to_stage              TEXT NOT NULL,
  changed_by            UUID REFERENCES employees(id),
  changed_at            TIMESTAMPTZ DEFAULT NOW(),
  time_in_stage_hours   DECIMAL(10,2),
  notes                 TEXT
);

-- ── 10. Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage    ON leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_score             ON leads(score);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to       ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_date    ON leads(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_assigned ON follow_up_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_due     ON follow_up_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_status  ON follow_up_tasks(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_lead    ON follow_up_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_revenue_records_emp     ON revenue_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_revenue_records_date    ON revenue_records(payment_date);
CREATE INDEX IF NOT EXISTS idx_aviation_docs_lead      ON aviation_documents(lead_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_history_lead   ON pipeline_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_interviews_lead         ON interviews(lead_id);

-- ── 11. RPC helper: mark overdue tasks ───────────────────────
CREATE OR REPLACE FUNCTION mark_overdue_tasks()
RETURNS void LANGUAGE sql AS $$
  UPDATE follow_up_tasks
  SET status = 'overdue', updated_at = NOW()
  WHERE status = 'pending'
    AND due_date < NOW();
$$;

-- ── 12. Seed pipeline_stage from existing status ──────────────
UPDATE leads
SET pipeline_stage = CASE
  WHEN status = 'converted' THEN 'enrolled'
  WHEN status = 'lost'      THEN 'lost'
  WHEN status = 'contacted' THEN 'contacted'
  WHEN status = 'assigned'  THEN 'contacted'
  ELSE 'new'
END
WHERE pipeline_stage IS NULL OR pipeline_stage = 'new';

-- ── Done ─────────────────────────────────────────────────────
-- Tables created: follow_up_tasks, employee_targets, revenue_records,
--                 interviews, aviation_documents, batches, pipeline_history
-- Columns added:  leads (score, conversion_probability, pipeline_stage, ...),
--                 employees (target_monthly, commission_rate, sla_hours, ...)
