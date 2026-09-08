create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(9);

-- Seller (trigger creates the profile).
insert into auth.users (id, aud, role) values
  ('11111111-1111-1111-1111-111111111111','authenticated','authenticated');
insert into public.profiles (id, role) values
  ('11111111-1111-1111-1111-111111111111','seller')
  on conflict (id) do update set role = excluded.role;

-- One open intake event and one upcoming event to rotate into.
insert into public.auction_events (id, name, status, capacity, starts_at, lot_close_gap_seconds) values
  ('e1111111-1111-1111-1111-111111111111','Sale One','intake',   2, now() + interval '1 day', 120),
  ('e2222222-2222-2222-2222-222222222222','Sale Two','upcoming', 2, now() + interval '2 day', 120);

-- 1. current_intake_event() returns the open one.
select is(
  (select name from public.current_intake_event()),
  'Sale One', 'current_intake_event returns the open intake event');

-- 2. create_draft_listing (as the seller) attaches to that intake event.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(
  (select event_id from public.vehicles where id = public.create_draft_listing(
     'Draft Car', 'Ford', 'F150', 2018, 1000, 'Usado', null, 'desc', 'loc',
     'MXN', 1000000, null, '{}')),
  'e1111111-1111-1111-1111-111111111111'::uuid,
  'create_draft_listing attaches the current intake event');
reset role;

-- Two committed (approved) lots fill the intake event to capacity (2).
insert into public.vehicles (id, seller_id, event_id, title, opening_bid_cents, currency, status, lot_number) values
  ('c1111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111','e1111111-1111-1111-1111-111111111111','Lot 1',1000000,'MXN','scheduled',1),
  ('c2222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','e1111111-1111-1111-1111-111111111111','Lot 2',1000000,'MXN','scheduled',2);

-- 3-4. Filling to capacity closes intake and rotates to the next event.
select public.close_full_or_expired_intakes();
select is((select status from public.auction_events where id='e1111111-1111-1111-1111-111111111111'),
  'scheduled', 'a full intake event becomes scheduled');
select is((select status from public.auction_events where id='e2222222-2222-2222-2222-222222222222'),
  'intake', 'the next upcoming event opens for intake');

-- 5-8. Go-live stamps the lots live with staggered ends_at from lot_number.
select public._go_live_event('e1111111-1111-1111-1111-111111111111');
select is((select status from public.vehicles where id='c1111111-1111-1111-1111-111111111111'),
  'live', 'lot 1 is live after go-live');
select is(
  (select ends_at from public.vehicles where id='c1111111-1111-1111-1111-111111111111'),
  (select starts_at + interval '120 seconds' from public.auction_events where id='e1111111-1111-1111-1111-111111111111'),
  'lot 1 closes at start + 1 × gap');
select is(
  (select ends_at from public.vehicles where id='c2222222-2222-2222-2222-222222222222'),
  (select starts_at + interval '240 seconds' from public.auction_events where id='e1111111-1111-1111-1111-111111111111'),
  'lot 2 closes at start + 2 × gap (staggered)');
select is((select status from public.auction_events where id='e1111111-1111-1111-1111-111111111111'),
  'live', 'the event is live after go-live');

-- 9. Once no lots are live, the event closes.
update public.vehicles set status='sold', winner_id=null
  where id in ('c1111111-1111-1111-1111-111111111111','c2222222-2222-2222-2222-222222222222');
select public.close_finished_events();
select is((select status from public.auction_events where id='e1111111-1111-1111-1111-111111111111'),
  'closed', 'the event closes once no lots remain live');

select * from finish();
rollback;
