create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(3);

-- reserve_cents is not selectable by authenticated
select ok(
  not has_column_privilege('authenticated', 'public.vehicles', 'reserve_cents', 'SELECT'),
  'authenticated cannot SELECT reserve_cents');

-- reserve_met IS selectable by authenticated
select ok(
  has_column_privilege('authenticated', 'public.vehicles', 'reserve_met', 'SELECT'),
  'authenticated can SELECT reserve_met');

-- authenticated has no direct INSERT on bids (writes go through place_bid)
select ok(
  not has_table_privilege('authenticated', 'public.bids', 'INSERT'),
  'authenticated cannot INSERT bids directly');

select * from finish();
rollback;
