create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(10);

-- Seed two profiles (ids are arbitrary uuids; FK to auth.users is deferred in
-- local tests by inserting into auth.users first).
insert into auth.users (id, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated');
insert into public.profiles (id, role, is_banned) values
  ('11111111-1111-1111-1111-111111111111', 'seller', false),
  ('22222222-2222-2222-2222-222222222222', 'bidder', false);

insert into public.vehicles (id, seller_id, title, opening_bid_cents, status, ends_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        'Test Truck', 1000000, 'live', now() + interval '1 hour');

-- Impersonate the bidder for RPC calls.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

-- First bid below opening is rejected.
select throws_like(
  $$ select public.place_bid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 999999) $$,
  '%BID_TOO_LOW%', 'below opening bid is rejected');

-- First bid at opening is accepted.
select is(
  (public.place_bid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1000000)->>'ok')::boolean,
  true, 'opening bid accepted');

-- Same leader cannot bid again.
select throws_like(
  $$ select public.place_bid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1100000) $$,
  '%ALREADY_LEADING%', 'current leader cannot re-bid');

reset role;

-- Seller cannot bid on own lot.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select throws_like(
  $$ select public.place_bid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1100000) $$,
  '%SELLER_CANNOT_BID%', 'seller cannot bid on own lot');
reset role;

-- A second bidder must clear current + increment ($10,000 → +$500 = 1,050,000).
insert into auth.users (id, aud, role)
  values ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated');
insert into public.profiles (id, role) values
  ('33333333-3333-3333-3333-333333333333', 'bidder');
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select throws_like(
  $$ select public.place_bid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1000001) $$,
  '%BID_TOO_LOW%', 'must clear current bid + increment');
select is(
  (public.place_bid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1050000)->>'bid_count')::int,
  2, 'valid raising bid recorded, bid_count = 2');
reset role;

-- Anti-snipe: a lot ending in 30s (< 120s window), hidden reserve of $20,000.
insert into public.vehicles (id, seller_id, title, opening_bid_cents, reserve_cents, status, ends_at)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '11111111-1111-1111-1111-111111111111',
        'Ending Soon', 1000000, 2000000, 'live', now() + interval '30 seconds');

-- Bidder 2 opens at $10,000 (below reserve); the bid lands in the final window.
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is(
  (public.place_bid('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1000000)->>'extended')::boolean,
  true, 'bid in the final window extends the auction');
reset role;

-- ends_at is now ~120s out (was 30s).
select ok(
  (select ends_at from public.vehicles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
    > now() + interval '100 seconds',
  'ends_at extended to ~120s from now');

-- Below the hidden reserve → reserve_met false.
select is(
  (select reserve_met from public.vehicles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  false, 'reserve not met below the hidden reserve');

-- Bidder 3 clears the reserve at $20,000 → reserve_met true.
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select public.place_bid('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2000000);
reset role;
select is(
  (select reserve_met from public.vehicles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  true, 'reserve met at/above the hidden reserve');

select * from finish();
rollback;
