-- =====================================================================
-- OilTrack Pro: Customer discount pricing (retail minus discount)
-- Paste this whole file into Supabase > SQL Editor > New query > Run
--
-- Safe: only ADDS columns. Does not change or delete any existing data.
-- Safe to run more than once. All-or-nothing.
-- =====================================================================

begin;

-- Every customer gets a discount % off retail. Existing customers start at 6%.
alter table public.customers
  add column if not exists discount_pct numeric(5,2) not null default 6;

-- Default discount for NEW customers (editable in Settings)
alter table public.company_settings
  add column if not exists default_customer_discount_pct numeric(5,2) not null default 6;

-- Checkmark: has the real retail price been confirmed for this part?
-- All parts start unchecked.
alter table public.parts_catalog
  add column if not exists retail_verified boolean not null default false;

-- Filter order lines: save retail and discount at the time the line is added
alter table public.filter_order_items
  add column if not exists retail_price numeric not null default 0,
  add column if not exists discount_pct numeric(5,2) not null default 0;

notify pgrst, 'reload schema';

commit;

-- =====================================================================
-- CHECK: you should see 5 rows
-- =====================================================================
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'customers'          and column_name = 'discount_pct')
    or (table_name = 'company_settings'   and column_name = 'default_customer_discount_pct')
    or (table_name = 'parts_catalog'      and column_name = 'retail_verified')
    or (table_name = 'filter_order_items' and column_name in ('retail_price','discount_pct')))
order by 1, 2;
