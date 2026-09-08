-- Auto-create a profile row whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Let a signed-in user edit ONLY their own display_name / notify_channel.
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Column-scoped: role and is_banned are NOT grantable to clients, so a user
-- can never self-promote or self-unban even under the policy above.
grant update (display_name, notify_channel) on public.profiles to authenticated;
