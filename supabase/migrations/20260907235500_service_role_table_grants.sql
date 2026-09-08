-- Bug fix (found while writing Task C4's concurrency test): `service_role`
-- has BYPASSRLS (see pg_roles), but Postgres still requires a base table
-- GRANT before RLS is even consulted. The local Postgres default ACL for
-- tables owned by role `postgres` only extends TRUNCATE/REFERENCES/TRIGGER
-- to anon/authenticated/service_role — none of the earlier migrations
-- granted service_role SELECT/INSERT/UPDATE/DELETE on any app table, so
-- every service-role write (admin scripts, seed/test fixtures, and any
-- future backend code such as the signup flow that creates a profiles row)
-- failed with "permission denied for table ...". This does not change what
-- anon/authenticated/RLS expose to clients — service_role is a trusted,
-- server-only key that already bypasses RLS by design; it only restores the
-- base table access that role is supposed to have.
grant select, insert, update, delete on
  public.profiles, public.vehicles, public.bids, public.app_settings
to service_role;
