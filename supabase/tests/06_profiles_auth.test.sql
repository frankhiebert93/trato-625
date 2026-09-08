create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(9);

-- Trigger auto-creates a profile with matching id/phone and safe defaults.
insert into auth.users (id, aud, role, phone)
  values ('c0000000-0000-0000-0000-000000000001','authenticated','authenticated','+525500000001');
select is((select count(*) from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'),
          1::bigint, 'trigger created exactly one profile');
select is((select phone from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'),
          '+525500000001', 'trigger copied the phone');
select is((select role from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'),
          'bidder', 'new profile defaults to bidder');
select is((select is_banned from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'),
          false, 'new profile is not banned');

-- A signed-in user can update their own notify_channel...
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ update public.profiles set notify_channel = 'sms' where id = 'c0000000-0000-0000-0000-000000000001' $$,
  'user can update their own notify_channel');
-- ...but NOT their role (column not granted → permission denied).
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'c0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'user cannot change their own role');
-- ...nor their is_banned flag.
select throws_ok(
  $$ update public.profiles set is_banned = false where id = 'c0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'user cannot change their own is_banned');
reset role;

-- The self-update actually wrote (read back as owner).
select is(
  (select notify_channel from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'),
  'sms', 'self notify_channel update persisted');

-- A user cannot change ANOTHER user's row (RLS scopes writes to id = auth.uid()).
insert into auth.users (id, aud, role, phone)
  values ('c0000000-0000-0000-0000-000000000002','authenticated','authenticated','+525500000002');
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
update public.profiles set notify_channel = 'sms' where id = 'c0000000-0000-0000-0000-000000000002';
reset role;
select is(
  (select notify_channel from public.profiles where id = 'c0000000-0000-0000-0000-000000000002'),
  'whatsapp', 'a user cannot change another user''s notify_channel (RLS blocks it)');

select * from finish();
rollback;
