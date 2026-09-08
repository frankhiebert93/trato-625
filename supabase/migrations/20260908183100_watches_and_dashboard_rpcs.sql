-- Watchlist: follow an auction without bidding.
-- Composite PK makes watch / unwatch idempotent (one row per user+lot).
create table public.watches (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, vehicle_id)
);
create index watches_user_idx on public.watches (user_id);

alter table public.watches enable row level security;

-- A user only ever sees or changes their own watches.
create policy watches_owner_all on public.watches
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Base table privileges (RLS restricts rows; Postgres still needs the grant first).
revoke all on public.watches from anon, authenticated;
grant select, insert, delete on public.watches to authenticated;
grant select, insert, update, delete on public.watches to service_role;

-- "My bids" roll-up: one row per lot the caller has bid on, with their highest bid
-- and whether they currently lead / won. SECURITY DEFINER so it can read vehicles
-- regardless of RLS, but it only returns lots the caller actually bid on, and it
-- NEVER selects reserve_cents (only the derived has_reserve / reserve_met, exactly
-- like vehicles_public_select).
create or replace function public.my_bid_lots()
returns table (
  id uuid, title text, make text, model text, year int, photos text[],
  currency text, opening_bid_cents int, current_bid_cents int, bid_count int,
  status text, starts_at timestamptz, ends_at timestamptz,
  has_reserve boolean, reserve_met boolean, winner_id uuid,
  my_max_bid_cents int, is_leading boolean, i_won boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.title, v.make, v.model, v.year, v.photos,
         v.currency, v.opening_bid_cents, v.current_bid_cents, v.bid_count,
         v.status, v.starts_at, v.ends_at, v.has_reserve, v.reserve_met, v.winner_id,
         mb.my_max_bid_cents,
         (v.current_leader_id = auth.uid())               as is_leading,
         (v.status = 'sold' and v.winner_id = auth.uid())  as i_won
  from (
    select vehicle_id, max(amount_cents) as my_max_bid_cents
    from public.bids
    where bidder_id = auth.uid()
    group by vehicle_id
  ) mb
  join public.vehicles v on v.id = mb.vehicle_id
  order by (v.status = 'live') desc, v.ends_at asc nulls last;
$$;
revoke all on function public.my_bid_lots() from public;
grant execute on function public.my_bid_lots() to authenticated;

-- Lots the caller watches that are still publicly visible (same status set as
-- vehicles_public_select). Also excludes reserve_cents.
create or replace function public.my_watched_lots()
returns table (
  id uuid, title text, make text, model text, year int, photos text[],
  currency text, opening_bid_cents int, current_bid_cents int, bid_count int,
  status text, starts_at timestamptz, ends_at timestamptz,
  has_reserve boolean, reserve_met boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.title, v.make, v.model, v.year, v.photos,
         v.currency, v.opening_bid_cents, v.current_bid_cents, v.bid_count,
         v.status, v.starts_at, v.ends_at, v.has_reserve, v.reserve_met
  from public.watches w
  join public.vehicles v on v.id = w.vehicle_id
  where w.user_id = auth.uid()
    and v.status in ('scheduled','live','sold','unsold')
  order by (v.status = 'live') desc, v.ends_at asc nulls last;
$$;
revoke all on function public.my_watched_lots() from public;
grant execute on function public.my_watched_lots() to authenticated;
