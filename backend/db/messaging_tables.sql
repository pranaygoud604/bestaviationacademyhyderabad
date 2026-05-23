-- ============================================================================
-- SkyHost CRM — Messaging & Activity Tables
-- Run once in the Supabase SQL Editor (safe to re-run — all use IF NOT EXISTS)
-- ============================================================================

-- ── conversations ─────────────────────────────────────────────────────────────
-- One row per lead; tracks the latest message preview and unread badge count.
create table if not exists conversations (
  id               uuid        primary key default uuid_generate_v4(),
  lead_id          uuid        not null references leads(id) on delete cascade,
  last_message     text        not null default '',
  last_message_at  timestamptz not null default now(),
  unread_count     integer     not null default 0,
  status           text        not null default 'open'
                                 check (status in ('open', 'closed', 'pending')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (lead_id)
);

create trigger conversations_updated_at
  before update on conversations
  for each row execute function update_updated_at();

-- ── whatsapp_messages ────────────────────────────────────────────────────────
-- Every inbound and outbound WhatsApp message for a lead.
create table if not exists whatsapp_messages (
  id             uuid        primary key default uuid_generate_v4(),
  lead_id        uuid        not null references leads(id) on delete cascade,
  wa_message_id  text        unique,            -- Meta message wamid (nullable for outbound before ACK)
  direction      text        not null check (direction in ('inbound', 'outbound')),
  type           text        not null default 'text',
  content        text        not null default '',
  media_id       text,                          -- Meta media object ID for images/audio/video/docs
  status         text        not null default 'sent'
                               check (status in ('sent', 'delivered', 'read', 'failed')),
  error_code     text,
  sender_type    text        not null default 'lead'
                               check (sender_type in ('lead', 'employee')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger whatsapp_messages_updated_at
  before update on whatsapp_messages
  for each row execute function update_updated_at();

-- ── lead_activities ──────────────────────────────────────────────────────────
-- Append-only audit log for every meaningful event on a lead.
create table if not exists lead_activities (
  id          uuid        primary key default uuid_generate_v4(),
  lead_id     uuid        not null references leads(id) on delete cascade,
  type        text        not null,   -- 'lead_created', 'message_received', 'message_sent', 'status_changed', etc.
  description text        not null default '',
  metadata    jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

-- ── lead_assignments ─────────────────────────────────────────────────────────
-- History of every assignment (auto round-robin or manual reassignment).
create table if not exists lead_assignments (
  id              uuid        primary key default uuid_generate_v4(),
  lead_id         uuid        not null references leads(id) on delete cascade,
  employee_id     uuid        not null references employees(id) on delete cascade,
  assignment_type text        not null default 'auto'
                                check (assignment_type in ('auto', 'manual')),
  created_at      timestamptz not null default now()
);

-- ── message_templates ────────────────────────────────────────────────────────
-- Approved WhatsApp message templates available for employee use.
create table if not exists message_templates (
  id           uuid        primary key default uuid_generate_v4(),
  name         text        not null,          -- template name in Meta namespace
  display_name text        not null,
  content      text        not null,
  status       text        not null default 'active'
                             check (status in ('active', 'inactive')),
  created_at   timestamptz not null default now()
);

-- ── followups ────────────────────────────────────────────────────────────────
-- Scheduled follow-up reminders for leads.
create table if not exists followups (
  id           uuid        primary key default uuid_generate_v4(),
  lead_id      uuid        not null references leads(id) on delete cascade,
  assigned_to  uuid        references employees(id) on delete set null,
  scheduled_at timestamptz not null,
  type         text        not null default 'whatsapp'
                             check (type in ('whatsapp', 'call', 'email')),
  message      text,
  status       text        not null default 'pending'
                             check (status in ('pending', 'done', 'cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger followups_updated_at
  before update on followups
  for each row execute function update_updated_at();

-- ── increment_unread RPC ─────────────────────────────────────────────────────
-- Called from the webhook each time an inbound message is received.
create or replace function increment_unread(p_lead_id uuid)
returns void as $$
begin
  update conversations
  set    unread_count = unread_count + 1,
         updated_at   = now()
  where  lead_id = p_lead_id;
end;
$$ language plpgsql security definer;

-- ── Disable RLS (service-role key bypasses anyway, but explicit is clearer) ──
alter table conversations      disable row level security;
alter table whatsapp_messages  disable row level security;
alter table lead_activities    disable row level security;
alter table lead_assignments   disable row level security;
alter table message_templates  disable row level security;
alter table followups          disable row level security;

-- ── Enable Supabase Realtime on the tables the frontend subscribes to ────────
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table whatsapp_messages;

-- Reload PostgREST schema cache so all new columns/tables are visible
notify pgrst, 'reload schema';
