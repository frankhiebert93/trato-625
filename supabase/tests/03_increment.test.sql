create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(6);

-- MXN tiers
select is(public.bid_increment_for(100000,   'MXN'), 50000,  'MXN $1,000 → +$500 (tier 1)');
select is(public.bid_increment_for(5000000,  'MXN'), 100000, 'MXN $50,000 boundary → +$1,000 (tier 2)');
select is(public.bid_increment_for(20000000, 'MXN'), 250000, 'MXN $200,000 → +$2,500 (tier 3)');
select is(public.bid_increment_for(50000000, 'MXN'), 500000, 'MXN $500,000 → +$5,000 (top tier)');
-- USD tiers
select is(public.bid_increment_for(100000,   'USD'), 5000,   'USD $1,000 → +$50 (tier 1)');
select is(public.bid_increment_for(10000000, 'USD'), 50000,  'USD $100,000 → +$500 (top tier)');

select * from finish();
rollback;
