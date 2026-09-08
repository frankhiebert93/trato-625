create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(5);

-- The signup trigger (20260908021735_profile_lifecycle.sql) creates the profile row.
insert into auth.users (id, aud, role, phone)
  values ('d0000000-0000-0000-0000-000000000001','authenticated','authenticated','+525500000010');

-- 1-2. The new columns exist.
select has_column('public'::name, 'profiles'::name, 'full_name'::name, 'profiles has full_name');
select has_column('public'::name, 'profiles'::name, 'city'::name, 'profiles has city');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- 3. A signed-in user can update their own full_name / city.
select lives_ok(
  $$ update public.profiles set full_name = 'Juan Pérez', city = 'Cuauhtémoc'
     where id = 'd0000000-0000-0000-0000-000000000001' $$,
  'user can update their own full_name / city');

-- 4-5. ...but still cannot change their own role or is_banned (columns not granted).
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'user cannot change their own role');
select throws_ok(
  $$ update public.profiles set is_banned = false where id = 'd0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'user cannot change their own is_banned');

reset role;
select * from finish();
rollback;
