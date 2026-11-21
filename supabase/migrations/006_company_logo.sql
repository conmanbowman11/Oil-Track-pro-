-- =====================================================================
-- OilTrack Pro: company logo (shown on filter quotes)
-- Paste this whole file into Supabase > SQL Editor > New query > Run
--
-- Safe: makes sure the settings table has a place to store your logo.
-- If it's already there, nothing changes. Safe to run more than once.
-- =====================================================================

begin;

alter table public.company_settings
  add column if not exists logo_url text;

notify pgrst, 'reload schema';

commit;

-- CHECK: should show 1 row: company_settings | logo_url
select table_name, column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'company_settings' and column_name = 'logo_url';
