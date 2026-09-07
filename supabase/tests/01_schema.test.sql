create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(12);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'app_settings', 'app_settings table exists');
select col_is_pk('public', 'profiles', 'id', 'profiles.id is PK');
select is(
  (select count(*) from public.app_settings), 1::bigint,
  'app_settings is seeded with exactly one row');
select is(
  (select listing_fee_currency from public.app_settings where id = 1), 'MXN',
  'listing fee currency is MXN');
select is(
  (select jsonb_array_length(increment_tiers -> 'MXN') from public.app_settings where id = 1),
  4, 'four default MXN increment tiers');
select is(
  (select jsonb_array_length(increment_tiers -> 'USD') from public.app_settings where id = 1),
  4, 'four default USD increment tiers');

select has_table('public', 'vehicles', 'vehicles table exists');
select has_table('public', 'bids', 'bids table exists');
select has_column('public', 'vehicles', 'reserve_met', 'reserve_met generated column exists');
select has_column('public', 'vehicles', 'has_reserve', 'has_reserve generated column exists');
select has_index('public', 'bids', 'bids_vehicle_amount_idx', 'bid index exists');

select * from finish();
rollback;
