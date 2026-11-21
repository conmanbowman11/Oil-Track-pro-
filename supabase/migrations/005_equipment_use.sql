-- =====================================================================
-- OilTrack Pro: Equipment can be "for servicing" or "filters only"
-- Paste this whole file into Supabase > SQL Editor > New query > Run
--
-- Safe: adds one column. Every existing piece of equipment stays
-- "servicing" (exactly as it works today). Safe to run more than once.
-- =====================================================================

begin;

alter table public.fleet_units
  add column if not exists equipment_use text not null default 'service';

do $$ begin
  alter table public.fleet_units add constraint fleet_units_equipment_use_chk
    check (equipment_use in ('service', 'filters'));
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';

commit;

-- CHECK: should show 1 row: fleet_units | equipment_use
select table_name, column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'fleet_units' and column_name = 'equipment_use';
