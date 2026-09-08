create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(5);

-- Seed a seller + a live lot (opening 1,000,000 MXN, no bids) and a bidder.
insert into auth.users (id, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated');
insert into public.profiles (id, role, is_banned, phone, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'seller', false, null, null),
  ('22222222-2222-2222-2222-222222222222', 'bidder', false, '+525512345678', 'Maria'),
  ('33333333-3333-3333-3333-333333333333', 'seller', false, null, null)
  on conflict (id) do update set role = excluded.role, is_banned = excluded.is_banned,
    phone = excluded.phone, display_name = excluded.display_name;

insert into public.vehicles (id, seller_id, title, opening_bid_cents, currency, status, ends_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        'Test Truck', 1000000, 'MXN', 'live', now() + interval '1 hour');

-- Second seller's draft lot (not yet publicly viewable).
insert into public.vehicles (id, seller_id, title, opening_bid_cents, currency, status, ends_at)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '33333333-3333-3333-3333-333333333333',
        'Draft Truck', 5000000, 'MXN', 'draft', now() + interval '1 hour');

-- 1. next_min_bid = opening bid when there are no bids yet.
select is(
  public.next_min_bid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1000000, 'next_min_bid = opening bid with no bids');

-- Place a bid at opening as the bidder (impersonation pattern from 04_place_bid).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select (public.place_bid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1000000)->>'ok')::boolean;
reset role;

-- 2. next_min_bid = current + MXN tier-1 increment (50,000) after that bid.
select is(
  public.next_min_bid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1050000, 'next_min_bid = current + increment after a bid');

-- 3. public_bid_history returns the bid.
select is(
  (select count(*) from public.public_bid_history('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
     where amount_cents = 1000000),
  1::bigint, 'public_bid_history returns one row with amount_cents = 1,000,000');

-- 4. bidder_label is masked: not the phone, and either 'Postor' or a single initial + '.'.
select ok(
  (select bidder_label from public.public_bid_history('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') limit 1)
    <> '+525512345678'
  and (select bidder_label from public.public_bid_history('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') limit 1)
    ~ '^([A-Za-z]\.|Postor)$',
  'bidder_label is masked (not the phone; single initial + ''.'' or ''Postor'')');

-- 5. next_min_bid hides a draft lot from a user who is neither its seller nor admin.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is(
  public.next_min_bid('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  null, 'next_min_bid hides a draft lot');
reset role;

select * from finish();
rollback;
