-- Plan 9, Phase A — Scheduled auction events with staggered lot closings.
-- Additive and non-breaking: existing per-vehicle place_bid / close_due_auctions
-- are unchanged; lots simply gain an event_id + lot_number and, at an event's
-- go-live, each lot's ends_at is stamped from its lot_number so the existing
-- per-lot close sweep closes them one-by-one.

-- ── Events ────────────────────────────────────────────────────────────────
create table public.auction_events (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  status                text not null default 'upcoming'
                          check (status in ('upcoming','intake','scheduled','live','closed','cancelled')),
  capacity              int  not null check (capacity > 0),
  intake_opens_at       timestamptz,
  intake_cutoff_at      timestamptz,
  starts_at             timestamptz not null,
  lot_close_gap_seconds int  not null default 120 check (lot_close_gap_seconds > 0),
  viewing_location      text,
  viewing_notes         text,
  created_at            timestamptz not null default now(),
  published_at          timestamptz
);
create index auction_events_status_idx on public.auction_events (status, starts_at);

-- A lot belongs to an event and has a running-order position within it.
alter table public.vehicles
  add column if not exists event_id   uuid references public.auction_events(id),
  add column if not exists lot_number int;
create index vehicles_event_idx on public.vehicles (event_id, lot_number);

-- Default stagger gap for new events (per-event override lives on the row above).
alter table public.app_settings
  add column if not exists default_lot_close_gap_seconds int not null default 120
    check (default_lot_close_gap_seconds > 0);

-- ── RLS / grants ─────────────────────────────────────────────────────────
alter table public.auction_events enable row level security;

-- Public sees any event that has left the admin-only 'upcoming' state.
create policy events_public_select on public.auction_events
  for select to anon, authenticated using (status <> 'upcoming');
-- Admins see everything (writes go through the service role via the admin API).
create policy events_admin_select on public.auction_events
  for select to authenticated using (public.is_admin());

revoke all on public.auction_events from anon, authenticated;
grant select on public.auction_events to anon, authenticated;
grant select, insert, update, delete on public.auction_events to service_role;

-- The vehicles column-privilege set is an explicit allow-list (see rls_grants);
-- extend it so clients can read/filter by the two new columns. reserve_cents
-- stays excluded.
grant select (event_id, lot_number) on public.vehicles to anon, authenticated;

-- ── Read helper: the single open intake event (public) ──────────────────────
create or replace function public.current_intake_event()
returns table (
  id uuid, name text, starts_at timestamptz, capacity int,
  committed_count int, intake_cutoff_at timestamptz, viewing_location text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.name, e.starts_at, e.capacity,
         (select count(*)::int from public.vehicles v
            where v.event_id = e.id and v.status in ('pending_review','scheduled')) as committed_count,
         e.intake_cutoff_at, e.viewing_location
  from public.auction_events e
  where e.status = 'intake'
  order by e.starts_at asc
  limit 1;
$$;
revoke all on function public.current_intake_event() from public;
grant execute on function public.current_intake_event() to anon, authenticated;

-- ── Intake rotation (cron / admin, service role) ───────────────────────────
-- Promote the earliest eligible 'upcoming' event to 'intake' when none is open.
create or replace function public.open_next_intake()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if exists (select 1 from public.auction_events where status = 'intake') then
    return null;
  end if;
  select id into v_id
    from public.auction_events
   where status = 'upcoming'
     and (intake_opens_at is null or intake_opens_at <= now())
   order by starts_at asc
   limit 1;
  if v_id is null then return null; end if;
  update public.auction_events set status = 'intake' where id = v_id;
  return v_id;
end;
$$;
revoke all on function public.open_next_intake() from public;
grant execute on function public.open_next_intake() to service_role;

-- Close the open intake event when it is full (committed lots >= capacity) or
-- past its cutoff, then open the next one.
create or replace function public.close_full_or_expired_intakes()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare e public.auction_events; cnt int; n int := 0;
begin
  for e in select * from public.auction_events where status = 'intake' for update loop
    select count(*) into cnt from public.vehicles v
      where v.event_id = e.id and v.status in ('pending_review','scheduled');
    if cnt >= e.capacity
       or (e.intake_cutoff_at is not null and now() >= e.intake_cutoff_at) then
      update public.auction_events
         set status = 'scheduled', published_at = now()
       where id = e.id;
      n := n + 1;
    end if;
  end loop;
  perform public.open_next_intake();
  return n;
end;
$$;
revoke all on function public.close_full_or_expired_intakes() from public;
grant execute on function public.close_full_or_expired_intakes() to service_role;

-- ── Go-live (stamps staggered ends_at) ─────────────────────────────────────
-- Stamp every APPROVED (scheduled) lot of an event live, assigning any missing
-- lot_number in approval order, and set each lot's ends_at = starts_at + gap ×
-- lot_number so the existing close sweep closes them one-by-one. Called by
-- go_live_due_events (auto, at capacity) and by admin manual launch.
create or replace function public._go_live_event(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare e public.auction_events;
begin
  select * into e from public.auction_events where id = p_event for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if e.status not in ('scheduled') then raise exception 'EVENT_NOT_LAUNCHABLE'; end if;

  -- Normalize lot ordering: keep any admin-set order, fill gaps, number 1..n.
  with ordered as (
    select id,
           row_number() over (order by coalesce(lot_number, 2147483647), created_at) as rn
    from public.vehicles
    where event_id = p_event and status = 'scheduled'
  )
  update public.vehicles v set lot_number = o.rn
    from ordered o where v.id = o.id;

  update public.vehicles v
     set status    = 'live',
         starts_at = e.starts_at,
         ends_at   = e.starts_at + make_interval(secs => e.lot_close_gap_seconds * v.lot_number)
   where v.event_id = p_event and v.status = 'scheduled';

  update public.auction_events set status = 'live' where id = p_event;
end;
$$;
revoke all on function public._go_live_event(uuid) from public;
grant execute on function public._go_live_event(uuid) to service_role;

-- Auto-launch scheduled events that have reached their date AND are at capacity.
-- Under-capacity events are left 'scheduled' for the admin to launch or reschedule.
create or replace function public.go_live_due_events()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare e public.auction_events; cnt int; n int := 0;
begin
  for e in
    select * from public.auction_events
     where status = 'scheduled' and now() >= starts_at
     for update
  loop
    select count(*) into cnt from public.vehicles
      where event_id = e.id and status = 'scheduled';
    if cnt >= e.capacity then
      perform public._go_live_event(e.id);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.go_live_due_events() from public;
grant execute on function public.go_live_due_events() to service_role;

-- Close an event once all its lots have finished (run after close_due_auctions).
create or replace function public.close_finished_events()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.auction_events e
     set status = 'closed'
   where e.status = 'live'
     and not exists (
       select 1 from public.vehicles v where v.event_id = e.id and v.status = 'live'
     );
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.close_finished_events() from public;
grant execute on function public.close_finished_events() to service_role;

-- ── create_draft_listing: attach to the open intake event when one exists ───
-- (Non-breaking: event_id stays NULL when there is no open intake event, so the
-- current /vender flow keeps working through cutover. No per-seller cap.)
create or replace function public.create_draft_listing(
  p_title text, p_make text, p_model text, p_year int,
  p_mileage_km int, p_condition text, p_vin text,
  p_description text, p_location text,
  p_currency text, p_opening_bid_cents int, p_reserve_cents int,
  p_photos text[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_banned boolean;
  v_event uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select is_banned into v_banned from public.profiles where id = v_uid;
  if coalesce(v_banned, true) then raise exception 'BANNED'; end if;
  if p_title is null or length(btrim(p_title)) = 0 then raise exception 'TITLE_REQUIRED'; end if;
  if p_currency is null or p_currency not in ('USD','MXN') then raise exception 'BAD_CURRENCY'; end if;
  if p_opening_bid_cents is null or p_opening_bid_cents < 0 then raise exception 'BAD_OPENING'; end if;
  if p_reserve_cents is not null and p_reserve_cents < p_opening_bid_cents then
    raise exception 'RESERVE_BELOW_OPENING';
  end if;

  -- Route into the currently-open intake event, if any.
  select id into v_event from public.auction_events
   where status = 'intake' order by starts_at asc limit 1;

  insert into public.vehicles (
    seller_id, title, make, model, year, mileage_km, condition, vin,
    description, location, currency, opening_bid_cents, reserve_cents,
    photos, status, listing_fee_status, event_id
  ) values (
    v_uid, p_title, p_make, p_model, p_year, p_mileage_km, p_condition, p_vin,
    p_description, p_location, p_currency, p_opening_bid_cents, p_reserve_cents,
    coalesce(p_photos, '{}'), 'draft', 'unpaid', v_event
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_draft_listing(text,text,text,int,int,text,text,text,text,text,int,int,text[]) from public;
grant execute on function public.create_draft_listing(text,text,text,int,int,text,text,text,text,text,int,int,text[]) to authenticated;
