create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(7);

-- Seed: one seller, two bidders (Ana, Beto).
insert into auth.users (id, aud, role) values
  ('11111111-1111-1111-1111-111111111111','authenticated','authenticated'),
  ('22222222-2222-2222-2222-222222222222','authenticated','authenticated'),
  ('33333333-3333-3333-3333-333333333333','authenticated','authenticated');
insert into public.profiles (id, role, is_banned, phone, display_name) values
  ('11111111-1111-1111-1111-111111111111','seller', false, null, null),
  ('22222222-2222-2222-2222-222222222222','bidder', false, '+525512340002','Ana'),
  ('33333333-3333-3333-3333-333333333333','bidder', false, '+525512340003','Beto')
  on conflict (id) do update set role = excluded.role, is_banned = excluded.is_banned,
    phone = excluded.phone, display_name = excluded.display_name;

-- A live lot, a scheduled lot, and a draft lot (all by the seller).
insert into public.vehicles (id, seller_id, title, opening_bid_cents, currency, status, starts_at, ends_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Live Lot',  1000000,'MXN','live',      now() - interval '1 hour', now() + interval '1 hour'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','Sched Lot', 1000000,'MXN','scheduled', now() + interval '1 day',  now() + interval '2 day'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111','Draft Lot', 1000000,'MXN','draft',     null,                      now() + interval '1 hour');

-- Ana bids on the live lot (place_bid sets current_leader_id / current_bid_cents).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select (public.place_bid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1000000)->>'ok')::boolean;
reset role;

-- Act as Ana for the watch + dashboard assertions.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

-- 1. Ana can watch lots as herself (including a draft, via FK — RLS on vehicles does
--    not apply to a foreign-key reference).
select lives_ok(
  $$ insert into public.watches (user_id, vehicle_id) values
       ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
       ('22222222-2222-2222-2222-222222222222','cccccccc-cccc-cccc-cccc-cccccccccccc') $$,
  'user can insert their own watches');

-- 2. Ana cannot watch on behalf of someone else (RLS with check).
select throws_ok(
  $$ insert into public.watches (user_id, vehicle_id) values
       ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  '42501', null, 'user cannot insert a watch for another user');

-- 3-5. my_bid_lots returns exactly the lot Ana bid on, with her max bid + leading flag.
select is((select count(*) from public.my_bid_lots()),
  1::bigint, 'my_bid_lots returns exactly the lots the caller bid on');
select is((select my_max_bid_cents from public.my_bid_lots() where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1000000, 'my_bid_lots reports the caller''s highest bid');
select is((select is_leading from public.my_bid_lots() where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  true, 'my_bid_lots marks the caller as leading');

-- 6. my_watched_lots returns only publicly-visible watched lots (the live one),
--    hiding the watched draft.
select results_eq(
  $$ select id from public.my_watched_lots() order by id $$,
  $$ values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'my_watched_lots returns the live watched lot but hides the draft');

-- 7. Neither RPC exposes reserve_cents (selecting it is an undefined column).
select throws_ok(
  $$ select reserve_cents from public.my_bid_lots() $$,
  '42703', null, 'my_bid_lots does not expose reserve_cents');

reset role;
select * from finish();
rollback;
