alter table public.profiles    enable row level security;
alter table public.vehicles    enable row level security;
alter table public.bids        enable row level security;
alter table public.app_settings enable row level security;

-- profiles: self + admin
create policy profiles_self_select on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_admin_select on public.profiles
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- vehicles: public sees active lots; sellers see own; admin sees all
create policy vehicles_public_select on public.vehicles
  for select to anon, authenticated
  using (status in ('scheduled','live','sold','unsold'));
create policy vehicles_owner_select on public.vehicles
  for select to authenticated using (seller_id = auth.uid());
create policy vehicles_admin_select on public.vehicles
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- bids: bidder sees own; admin sees all (public masked history added in Plan 5)
create policy bids_owner_select on public.bids
  for select to authenticated using (bidder_id = auth.uid());
create policy bids_admin_select on public.bids
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- app_settings: readable by all (no secrets); writes via admin UI use service role
create policy app_settings_read on public.app_settings
  for select to anon, authenticated using (true);

-- Column privileges: hide reserve_cents from clients. Base grant is table-wide,
-- so revoke all then grant SELECT only on the public columns.
revoke all on public.vehicles from anon, authenticated;
grant select (
  id, seller_id, title, make, model, year, mileage_km, condition, vin,
  description, location, photos, opening_bid_cents, min_increment_cents,
  current_bid_cents, current_leader_id, bid_count, status, starts_at, ends_at,
  listing_fee_status, winner_id, created_at, published_at, has_reserve, reserve_met
) on public.vehicles to anon, authenticated;   -- note: reserve_cents intentionally omitted

revoke all on public.bids from anon, authenticated;
grant select on public.bids to authenticated;  -- rows still filtered by RLS above
