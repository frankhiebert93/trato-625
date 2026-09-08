create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(7);

insert into auth.users (id, aud, role) values
  ('d0000000-0000-0000-0000-000000000001','authenticated','authenticated'),
  ('d0000000-0000-0000-0000-000000000002','authenticated','authenticated');
-- (handle_new_user trigger from Plan 2 creates their profiles; promote one to banned)
update public.profiles set is_banned = true where id = 'd0000000-0000-0000-0000-000000000002';

select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- Happy path: creates a draft owned by the caller.
select lives_ok(
  $$ select public.create_draft_listing('Camioneta','Ford','F-150',2015,90000,'good',null,'desc','zone','MXN',1000000,2000000,array['vehicle-photos/x.jpg']) $$,
  'valid submission creates a draft');
select is(
  (select count(*) from public.vehicles
     where seller_id = 'd0000000-0000-0000-0000-000000000001'
       and status = 'draft' and listing_fee_status = 'unpaid'),
  1::bigint, 'exactly one draft, unpaid, owned by the caller');

-- Validation errors.
select throws_like(
  $$ select public.create_draft_listing('X',null,null,null,null,null,null,null,null,'EUR',1000,null,null) $$,
  '%BAD_CURRENCY%', 'currency must be USD or MXN');
select throws_like(
  $$ select public.create_draft_listing('X',null,null,null,null,null,null,null,null,'MXN',1000000,500000,null) $$,
  '%RESERVE_BELOW_OPENING%', 'reserve below opening is rejected');
select throws_like(
  $$ select public.create_draft_listing('   ',null,null,null,null,null,null,null,null,'MXN',1000,null,null) $$,
  '%TITLE_REQUIRED%', 'blank title is rejected');
reset role;

-- Banned seller cannot submit.
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_like(
  $$ select public.create_draft_listing('X',null,null,null,null,null,null,null,null,'MXN',1000,null,null) $$,
  '%BANNED%', 'banned user cannot submit');
reset role;

-- No identity → AUTH_REQUIRED.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_like(
  $$ select public.create_draft_listing('X',null,null,null,null,null,null,null,null,'MXN',1000,null,null) $$,
  '%AUTH_REQUIRED%', 'no user identity is rejected');
reset role;

select * from finish();
rollback;
