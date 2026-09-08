create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(4);

-- Seed a seller (FK: public.profiles.id -> auth.users.id).
insert into auth.users (id, aud, role)
  values ('55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated');
insert into public.profiles (id, role)
  values ('55555555-5555-5555-5555-555555555555', 'seller')
  on conflict (id) do update set role = excluded.role;

-- No-reserve lot → has_reserve false.
insert into public.vehicles (id, seller_id, title, opening_bid_cents, currency, status)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
        '55555555-5555-5555-5555-555555555555', 'No Reserve', 1000000, 'MXN', 'draft');
select is(
  (select has_reserve from public.vehicles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  false, 'no-reserve lot: has_reserve is false');

-- Reserve lot, no bids yet → reserve_met false.
insert into public.vehicles (id, seller_id, title, opening_bid_cents, reserve_cents, currency, status)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd',
        '55555555-5555-5555-5555-555555555555', 'Reserve', 1000000, 2000000, 'MXN', 'draft');
select is(
  (select reserve_met from public.vehicles where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  false, 'reserve lot, no bids: reserve_met is false');

-- Current bid below reserve → reserve_met false.
update public.vehicles set current_bid_cents = 1500000
  where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
select is(
  (select reserve_met from public.vehicles where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  false, 'current bid below reserve: reserve_met is false');

-- Current bid at/above reserve → reserve_met true.
update public.vehicles set current_bid_cents = 2000000
  where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
select is(
  (select reserve_met from public.vehicles where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  true, 'current bid at/above reserve: reserve_met is true');

select * from finish();
rollback;
