-- =====================================================================
-- OilTrack Pro: "No discount" checkmark on parts
-- Paste this whole file into Supabase > SQL Editor > New query > Run
--
-- Adds a checkmark to each part. Checked parts always sell at full
-- retail, no matter what discount the customer has.
--
-- Safe: adds one column and checks the box on John Deere parts.
-- Does not change prices or any other data. Safe to run more than once.
-- =====================================================================

begin;

alter table public.parts_catalog
  add column if not exists no_discount boolean not null default false;

-- Check the box on every John Deere part (by manufacturer or supplier)
update public.parts_catalog
set no_discount = true
where no_discount = false
  and (coalesce(manufacturer, '') ilike '%deere%'
    or coalesce(supplier, '')     ilike '%deere%');

notify pgrst, 'reload schema';

commit;

-- =====================================================================
-- CHECK: shows every part marked "No discount".
-- You should see your John Deere parts listed here.
-- (No rows = column added, but no parts are marked Deere yet;
--  you can check them in the app.)
-- =====================================================================
select part_number, description, manufacturer, retail_price, cost
from public.parts_catalog
where no_discount
order by part_number;
