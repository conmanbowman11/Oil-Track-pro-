-- =============================================
-- OilTrack Pro Database Schema
-- Run this in your Supabase SQL Editor
-- =============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Customers ──
create table customers (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  contact text default '',
  phone text default '',
  email text default '',
  address text default '',
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Engines (spec templates) ──
create table engines (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  manufacturer text default '',
  displacement text default '',
  oil_type text default '15W-40',
  oil_capacity text default '',
  notes text default '',
  created_at timestamptz default now()
);

-- ── Fleet Units (equipment) ──
create table fleet_units (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  engine_id uuid references engines(id) on delete set null,
  unit_number text not null,
  nickname text default '',
  type text default '',
  make text default '',
  model text default '',
  year text default '',
  engine_hours integer default 0,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Service Specs (per engine per tier) ──
create table service_specs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  engine_id uuid references engines(id) on delete cascade,
  tier text not null, -- '250hr', '500hr', '1000hr', 'DEF', 'Hydraulic'
  created_at timestamptz default now()
);

-- ── Service Spec Parts ──
create table spec_parts (
  id uuid primary key default uuid_generate_v4(),
  spec_id uuid references service_specs(id) on delete cascade,
  part_number text not null,
  description text default '',
  supplier text default 'CAT',
  qty integer default 1,
  unit_cost decimal(10,2) default 0,
  sort_order integer default 0
);

-- ── Work Orders ──
create table work_orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  unit_id uuid references fleet_units(id) on delete cascade,
  status text default 'open', -- 'open', 'complete'
  tier text not null,
  date date default current_date,
  engine_hours integer default 0,
  technician text default '',
  customer_filters boolean default false,
  invoice_number text default '',
  notes text default '',
  -- Cost breakdown
  cost_labor decimal(10,2) default 0,
  cost_trip decimal(10,2) default 40,
  cost_supplies decimal(10,2) default 18.50,
  cost_enviro decimal(10,2) default 40,
  cost_parts decimal(10,2) default 0,
  cost_oil_sample decimal(10,2) default 58.55,
  cost_other decimal(10,2) default 0,
  total decimal(10,2) default 0,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- ── Work Order Checklist Items ──
create table work_order_items (
  id uuid primary key default uuid_generate_v4(),
  work_order_id uuid references work_orders(id) on delete cascade,
  text text not null,
  done boolean default false,
  sort_order integer default 0
);

-- ── Row Level Security (RLS) ──
-- This ensures each user can only see their own data

alter table customers enable row level security;
alter table engines enable row level security;
alter table fleet_units enable row level security;
alter table service_specs enable row level security;
alter table spec_parts enable row level security;
alter table work_orders enable row level security;
alter table work_order_items enable row level security;

-- Policies: users can only access their own rows
create policy "Users see own customers" on customers for all using (auth.uid() = user_id);
create policy "Users see own engines" on engines for all using (auth.uid() = user_id);
create policy "Users see own units" on fleet_units for all using (auth.uid() = user_id);
create policy "Users see own specs" on service_specs for all using (auth.uid() = user_id);
create policy "Users see own spec parts" on spec_parts for all using (
  spec_id in (select id from service_specs where user_id = auth.uid())
);
create policy "Users see own work orders" on work_orders for all using (auth.uid() = user_id);
create policy "Users see own WO items" on work_order_items for all using (
  work_order_id in (select id from work_orders where user_id = auth.uid())
);

-- ── Indexes for performance ──
create index idx_units_customer on fleet_units(customer_id);
create index idx_units_engine on fleet_units(engine_id);
create index idx_specs_engine on service_specs(engine_id);
create index idx_wo_customer on work_orders(customer_id);
create index idx_wo_unit on work_orders(unit_id);
create index idx_wo_status on work_orders(status);
create index idx_wo_items_wo on work_order_items(work_order_id);
