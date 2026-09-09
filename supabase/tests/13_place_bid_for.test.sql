create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(6);

-- place_bid_for is the service-role sibling of place_bid used by the WhatsApp bot:
-- same rules, but the bidder is passed explicitly instead of read from auth.uid().
insert into auth.users (id, aud, role) values
  ('c1111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated'),
  ('c2222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated'),
  ('c3333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated'),
  ('c4444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated');
insert into public.profiles (id, role, is_banned) values
  ('c1111111-1111-1111-1111-111111111111', 'seller', false),
  ('c2222222-2222-2222-2222-222222222222', 'bidder', false),
  ('c3333333-3333-3333-3333-333333333333', 'bidder', true),
  ('c4444444-4444-4444-4444-444444444444', 'bidder', false)
  on conflict (id) do update set role = excluded.role, is_banned = excluded.is_banned;

insert into public.vehicles (id, seller_id, title, opening_bid_cents, currency, status, ends_at)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
        'c1111111-1111-1111-1111-111111111111',
        'Bot Bid Truck', 1000000, 'MXN', 'live', now() + interval '1 hour');

-- 1. A valid opening bid for an explicit bidder is accepted.
select is(
  (public.place_bid_for('cccccccc-cccc-cccc-cccc-cccccccccccc', 1000000,
                        'c2222222-2222-2222-2222-222222222222')->>'ok')::boolean,
  true, 'place_bid_for records a valid opening bid');

-- 2. The denormalized leader advanced to the explicit bidder.
select is(
  (select current_leader_id from public.vehicles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'c2222222-2222-2222-2222-222222222222'::uuid, 'leader set to the explicit bidder');

-- 3. The seller cannot bid on their own lot.
select throws_like(
  $$ select public.place_bid_for('cccccccc-cccc-cccc-cccc-cccccccccccc', 1100000,
                                 'c1111111-1111-1111-1111-111111111111') $$,
  '%SELLER_CANNOT_BID%', 'seller cannot bid via place_bid_for');

-- 4. A banned bidder is rejected (BANNED fires before lifecycle checks).
select throws_like(
  $$ select public.place_bid_for('cccccccc-cccc-cccc-cccc-cccccccccccc', 1100000,
                                 'c3333333-3333-3333-3333-333333333333') $$,
  '%BANNED%', 'banned bidder cannot bid via place_bid_for');

-- 5. A bid below current + increment is rejected ($10,000 current → +$500 = 1,050,000).
select throws_like(
  $$ select public.place_bid_for('cccccccc-cccc-cccc-cccc-cccccccccccc', 1000001,
                                 'c4444444-4444-4444-4444-444444444444') $$,
  '%BID_TOO_LOW%', 'below current + increment is rejected');

-- 6. A null bidder raises AUTH_REQUIRED.
select throws_like(
  $$ select public.place_bid_for('cccccccc-cccc-cccc-cccc-cccccccccccc', 1050000, null) $$,
  '%AUTH_REQUIRED%', 'a null bidder raises AUTH_REQUIRED');

select * from finish();
rollback;
