create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(5);

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

-- Behavioral: authenticated reads must succeed (guards base grants + no RLS recursion).
insert into auth.users (id, aud, role)
  values ('66666666-6666-6666-6666-666666666666','authenticated','authenticated');
insert into public.profiles (id, role) values ('66666666-6666-6666-6666-666666666666','bidder');
insert into auth.users (id, aud, role)
  values ('77777777-7777-7777-7777-777777777777','authenticated','authenticated');
insert into public.profiles (id, role) values ('77777777-7777-7777-7777-777777777777','seller');
insert into public.vehicles (id, seller_id, title, opening_bid_cents, currency, status, ends_at)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','77777777-7777-7777-7777-777777777777',
        'Active Lot',1000000,'MXN','live', now() + interval '1 hour');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select lives_ok(
  $$ select listing_fee_cents from public.app_settings where id = 1 $$,
  'authenticated can read app_settings (base grant present, no recursion)');
select lives_ok(
  $$ select currency, current_bid_cents from public.vehicles where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
  'authenticated can read an active lot (no RLS recursion)');
reset role;

select * from finish();
rollback;
