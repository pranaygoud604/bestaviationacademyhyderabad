-- Run this in your Supabase SQL editor to create the required tables.

create extension if not exists "uuid-ossp";

-- ── Employees ──────────────────────────────────────────────────────────────────
create table if not exists employees (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  email            text unique not null,
  password         text not null default '',
  role             text not null default 'Sales Executive',
  avatar           text not null default '👨‍💼',
  status           text not null default 'active'
                     check (status in ('active', 'inactive', 'busy')),
  conversions      integer not null default 0,
  revenue          numeric not null default 0,
  commission       numeric not null default 0,
  performance      integer not null default 0
                     check (performance >= 0 and performance <= 100),
  max_active_leads integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Leads ──────────────────────────────────────────────────────────────────────
create table if not exists leads (
  id                   uuid primary key default uuid_generate_v4(),
  name                 text not null,
  phone                text not null,
  email                text not null default '',
  course               text not null default '',
  source               text not null default 'Meta Lead Ad'
                         check (source in ('Facebook Ad', 'Instagram Ad', 'WhatsApp Direct', 'Meta Lead Ad', 'Manual')),
  ad_id                text not null default '',
  ad_name              text not null default '',
  form_id              text not null default '',
  campaign             text not null default '',
  whatsapp_message_id  text not null default '',
  first_message        text not null default '',
  status               text not null default 'new'
                         check (status in ('new', 'assigned', 'contacted', 'interested', 'demo', 'converted', 'lost')),
  priority             text not null default 'medium'
                         check (priority in ('high', 'medium', 'low')),
  assigned_to          uuid references employees(id) on delete set null,
  assigned_at          timestamptz,
  notes                jsonb not null default '[]',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── Auto-update updated_at ─────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger employees_updated_at
  before update on employees
  for each row execute function update_updated_at();

create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at();

-- Disable RLS so the anon key can read/write without policies
-- (run these two lines in Supabase SQL editor if tables already exist)
alter table employees disable row level security;
alter table leads disable row level security;

-- ── Upgrade existing tables (safe to re-run) ──────────────────────────────────
alter table employees add column if not exists password         text    not null default '';
alter table employees add column if not exists commission       numeric not null default 0;
alter table employees add column if not exists conversions      integer not null default 0;
alter table employees add column if not exists revenue          numeric not null default 0;
alter table employees add column if not exists performance      integer not null default 0;
alter table employees add column if not exists max_active_leads integer not null default 0;

-- Drop the source CHECK constraint so webhook values like 'Meta Ads' don't
-- block UPDATE operations (PostgreSQL re-checks ALL constraints on every UPDATE)
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'leads'::regclass and contype = 'c' and conname like '%source%'
  loop
    execute 'alter table leads drop constraint ' || quote_ident(r.conname);
  end loop;
end$$;

-- Reload PostgREST schema cache so new columns are visible immediately
notify pgrst, 'reload schema';
