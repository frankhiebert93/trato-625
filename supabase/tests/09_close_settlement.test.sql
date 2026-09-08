create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(8);

-- Seed a seller + two bidders + one unrelated user (FK: profiles.id -> auth.users.id).
insert into auth.users (id, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated');
insert into public.profiles (id, role, is_banned, phone, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'seller', false, '+5215500000001', 'Seller One'),
  ('22222222-2222-2222-2222-222222222222', 'bidder', false, '+5215500000002', 'Bidder One'),
  ('33333333-3333-3333-3333-333333333333', 'bidder', false, '+5215500000003', 'Bidder Two'),
  ('44444444-4444-4444-4444-444444444444', 'bidder', false, '+5215500000004', 'Unrelated')
  on conflict (id) do update set role = excluded.role, is_banned = excluded.is_banned,
    phone = excluded.phone, display_name = excluded.display_name;

-- Lot A: live, past ends_at, leader's bid clears the reserve -> should close SOLD.
insert into public.vehicles (
  id, seller_id, title, opening_bid_cents, reserve_cents, currency,
  current_bid_cents, current_leader_id, bid_count, status, ends_at
) values (
  'aaaaaaaa-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111',
  'Sold Lot', 1000000, 2000000, 'MXN',
  2500000, '22222222-2222-2222-2222-222222222222', 1, 'live', now() - interval '1 minute'
);

-- Lot B: live, past ends_at, top bid below reserve -> should close UNSOLD.
insert into public.vehicles (
  id, seller_id, title, opening_bid_cents, reserve_cents, currency,
  current_bid_cents, current_leader_id, bid_count, status, ends_at
) values (
  'aaaaaaaa-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111',
  'Below Reserve Lot', 1000000, 2000000, 'MXN',
  1500000, '33333333-3333-3333-3333-333333333333', 1, 'live', now() - interval '1 minute'
);

-- Lot C: live, past ends_at, no bids at all -> should close UNSOLD.
insert into public.vehicles (
  id, seller_id, title, opening_bid_cents, currency, status, ends_at
) values (
  'aaaaaaaa-0003-0003-0003-000000000003', '11111111-1111-1111-1111-111111111111',
  'No Bids Lot', 1000000, 'MXN', 'live', now() - interval '1 minute'
);

-- Run the closer as the function owner (post reset role, no client role active).
reset role;
select public.close_due_auctions();

-- 1. Lot A (reserve cleared, has a leader) closes to sold with that leader as winner.
select ok(
  (select status = 'sold' and winner_id = '22222222-2222-2222-2222-222222222222'
     from public.vehicles where id = 'aaaaaaaa-0001-0001-0001-000000000001'),
  'lot with reserve met closes to sold with the leader as winner');

-- 2. A won notification (to the winner) and a sold notification (to the seller) enqueued.
select ok(
  (select count(*) filter (
       where kind = 'won' and recipient_id = '22222222-2222-2222-2222-222222222222')
     = 1
   and count(*) filter (
       where kind = 'sold' and recipient_id = '11111111-1111-1111-1111-111111111111')
     = 1
   from public.notifications where vehicle_id = 'aaaaaaaa-0001-0001-0001-000000000001'),
  'won notification for the winner and sold notification for the seller were enqueued');

-- 3. Lot B (top bid below reserve) closes unsold with an unsold notification to the seller.
select ok(
  (select status = 'unsold' from public.vehicles where id = 'aaaaaaaa-0002-0002-0002-000000000002')
  and (select count(*) from public.notifications
        where vehicle_id = 'aaaaaaaa-0002-0002-0002-000000000002'
          and kind = 'unsold' and recipient_id = '11111111-1111-1111-1111-111111111111') = 1,
  'lot below reserve closes to unsold with an unsold notification for the seller');

-- 4. Lot C (no bids) closes unsold.
select is(
  (select status from public.vehicles where id = 'aaaaaaaa-0003-0003-0003-000000000003'),
  'unsold', 'lot with no bids closes to unsold');

-- Capture get_settlement_contact from both sides of the sold lot A.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
create temp table t_winner_view as
  select * from public.get_settlement_contact('aaaaaaaa-0001-0001-0001-000000000001');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table t_seller_view as
  select * from public.get_settlement_contact('aaaaaaaa-0001-0001-0001-000000000001');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
create temp table t_unrelated_view as
  select * from public.get_settlement_contact('aaaaaaaa-0001-0001-0001-000000000001');
reset role;

-- 5. Winner sees the seller's contact; seller sees the winner's contact.
select ok(
  (select counterparty = 'seller' and phone = '+5215500000001' from t_winner_view)
  and (select counterparty = 'winner' and phone = '+5215500000002' from t_seller_view),
  'winner sees the seller contact and seller sees the winner contact');

-- 6. An unrelated user gets no rows from get_settlement_contact.
select is(
  (select count(*) from t_unrelated_view),
  0::bigint, 'an unrelated user gets no rows from get_settlement_contact');

-- Lot D: a fresh live lot (ends far in the future) to exercise place_bid's outbid enqueue.
insert into public.vehicles (id, seller_id, title, opening_bid_cents, currency, status, ends_at)
values ('aaaaaaaa-0004-0004-0004-000000000004', '11111111-1111-1111-1111-111111111111',
        'Outbid Lot', 1000000, 'MXN', 'live', now() + interval '1 day');

-- Bidder One opens the lot.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select (public.place_bid('aaaaaaaa-0004-0004-0004-000000000004', 1000000)->>'ok')::boolean;
reset role;

-- Bidder Two outbids Bidder One; capture the RPC result for the sanity check below.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
create temp table t_bid2 as
  select public.place_bid('aaaaaaaa-0004-0004-0004-000000000004', 1050000) as res;
reset role;

-- 7. Exactly one outbid notification was enqueued for the previous leader (Bidder One).
select is(
  (select count(*) from public.notifications
    where vehicle_id = 'aaaaaaaa-0004-0004-0004-000000000004'
      and kind = 'outbid'
      and recipient_id = '22222222-2222-2222-2222-222222222222')::int,
  1, 'a second bidder outbidding the first enqueues exactly one outbid notification');

-- 8. Prior place_bid behavior intact: a valid raising bid still returns ok=true.
select is(
  (select (res->>'ok')::boolean from t_bid2),
  true, 'a valid bid still returns ok=true (04_place_bid sanity)');

select * from finish();
rollback;
