-- Optional, user-editable profile info.
--
-- Private by default: these columns are readable only to the owner
-- (profiles_self_select) and admin (profiles_admin_select) under the RLS added in
-- 20260907232436_rls_grants.sql. They are distinct from the PUBLIC display_name
-- (which appears, masked to a single initial, in public_bid_history): full_name is
-- the member's real name kept for settlement, city is their area.
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists city text;

-- Extend the column-scoped self-update grant from 20260908021735_profile_lifecycle.
-- role / is_banned remain intentionally ungranted, so a user still cannot
-- self-promote or self-unban even under profiles_self_update.
grant update (display_name, notify_channel, full_name, city)
  on public.profiles to authenticated;
