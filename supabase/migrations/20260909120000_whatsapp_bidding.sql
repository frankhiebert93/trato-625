-- WhatsApp inbound bidding (Slice 2).
--
-- 1. vehicles.public_code — a short, human, unique handle (e.g. T1042) for
--    referencing a lot over WhatsApp, shown in the app and prefilled in wa.me links.
-- 2. profiles.accepted_terms_at — records a WhatsApp-provisioned bidder's consent.
-- 3. whatsapp_contacts — per-number onboarding/bidding state for the bot.
-- 4. Bidding is refactored into a shared _place_bid_core so the app (place_bid,
--    auth.uid()) and the bot (place_bid_for, explicit bidder, service_role) run the
--    exact same rules. place_bid's behaviour is unchanged (04_place_bid still passes).

-- ─────────────────────────── 1. public_code ───────────────────────────
create sequence if not exists public.vehicle_public_code_seq start 1000;

alter table public.vehicles add column if not exists public_code text unique;

create or replace function public.assign_vehicle_public_code()
returns trigger
language plpgsql
as $$
begin
  if new.public_code is null then
    new.public_code := 'T' || nextval('public.vehicle_public_code_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_assign_public_code on public.vehicles;
create trigger vehicles_assign_public_code
  before insert on public.vehicles
  for each row execute function public.assign_vehicle_public_code();

-- Backfill existing rows (each nextval() call is per-row, so codes stay unique).
update public.vehicles
   set public_code = 'T' || nextval('public.vehicle_public_code_seq')
 where public_code is null;

-- vehicles uses column-scoped SELECT grants, so the new column must be granted
-- explicitly or clients cannot read it.
grant select (public_code) on public.vehicles to anon, authenticated;

-- ──────────────────────── 2. consent on profiles ───────────────────────
alter table public.profiles add column if not exists accepted_terms_at timestamptz;
-- Set only by the service role during WhatsApp provisioning; intentionally NOT
-- added to the authenticated column-update grant.

-- ─────────────────────── 3. whatsapp_contacts ──────────────────────────
create table if not exists public.whatsapp_contacts (
  phone text primary key,                         -- E.164, e.g. +5215512345678
  profile_id uuid references public.profiles(id) on delete set null,
  state text not null default 'awaiting_terms'
    check (state in ('awaiting_terms','awaiting_name','ready')),
  display_name text,
  accepted_terms_at timestamptz,
  current_lot_id uuid references public.vehicles(id) on delete set null,
  opted_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_contacts enable row level security;
-- No client policies: only the service role (the webhook) touches this table.
grant select, insert, update on public.whatsapp_contacts to service_role;

-- ─────────────────── 4. shared bidding core + wrappers ──────────────────
-- The single source of truth for bid rules. Identical to the previous place_bid
-- body, but the bidder is a parameter instead of auth.uid(). SECURITY DEFINER so
-- it can write regardless of the caller's RLS; not granted to clients directly.
create or replace function public._place_bid_core(
  p_vehicle_id uuid, p_amount_cents int, p_bidder_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := p_bidder_id;
  v_banned boolean;
  v_vehicle public.vehicles;
  v_min int;
  v_now timestamptz := now();
  v_window int;
  v_extend int;
  v_new_ends timestamptz;
  v_extended boolean := false;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select is_banned into v_banned from public.profiles where id = v_uid;
  if coalesce(v_banned, true) then raise exception 'BANNED'; end if;

  -- Serialize concurrent bids on this lot.
  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_vehicle.status <> 'live' then raise exception 'NOT_LIVE'; end if;
  if v_vehicle.ends_at is null then raise exception 'NOT_LIVE'; end if;
  if v_now >= v_vehicle.ends_at then raise exception 'ENDED'; end if;
  if v_vehicle.seller_id = v_uid then raise exception 'SELLER_CANNOT_BID'; end if;
  if v_vehicle.current_leader_id = v_uid then raise exception 'ALREADY_LEADING'; end if;

  -- Required minimum bid.
  if v_vehicle.current_bid_cents is null then
    v_min := v_vehicle.opening_bid_cents;
  else
    v_min := v_vehicle.current_bid_cents
             + coalesce(v_vehicle.min_increment_cents,
                        public.bid_increment_for(v_vehicle.current_bid_cents, v_vehicle.currency));
  end if;
  if p_amount_cents < v_min then
    raise exception 'BID_TOO_LOW min=%', v_min;
  end if;

  -- Append-only bid record.
  insert into public.bids (vehicle_id, bidder_id, amount_cents)
  values (p_vehicle_id, v_uid, p_amount_cents);

  -- Anti-snipe extension.
  select antisnipe_window_seconds, antisnipe_extend_seconds
    into v_window, v_extend from public.app_settings where id = 1;
  if v_vehicle.ends_at - v_now <= make_interval(secs => v_window) then
    v_new_ends := greatest(v_vehicle.ends_at, v_now + make_interval(secs => v_extend));
    v_extended := (v_new_ends <> v_vehicle.ends_at);
  else
    v_new_ends := v_vehicle.ends_at;
  end if;

  -- Notify the previous leader they were outbid.
  if v_vehicle.current_leader_id is not null and v_vehicle.current_leader_id <> v_uid then
    insert into public.notifications (recipient_id, channel, kind, vehicle_id)
      select v_vehicle.current_leader_id, p.notify_channel, 'outbid', p_vehicle_id
      from public.profiles p where p.id = v_vehicle.current_leader_id;
  end if;

  -- Update denormalized live state.
  update public.vehicles
     set current_bid_cents = p_amount_cents,
         current_leader_id = v_uid,
         bid_count = bid_count + 1,
         ends_at = v_new_ends
   where id = p_vehicle_id
   returning * into v_vehicle;

  return jsonb_build_object(
    'ok', true,
    'currency', v_vehicle.currency,
    'current_bid_cents', v_vehicle.current_bid_cents,
    'bid_count', v_vehicle.bid_count,
    'ends_at', v_vehicle.ends_at,
    'extended', v_extended,
    'reserve_met', v_vehicle.reserve_met
  );
end;
$$;
revoke all on function public._place_bid_core(uuid, int, uuid) from public;

-- App path: authenticated user bids as themselves.
create or replace function public.place_bid(p_vehicle_id uuid, p_amount_cents int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  return public._place_bid_core(p_vehicle_id, p_amount_cents, auth.uid());
end;
$$;
revoke all on function public.place_bid(uuid, int) from public;
grant execute on function public.place_bid(uuid, int) to authenticated;

-- Bot path: the WhatsApp webhook (service role) bids on behalf of an explicit,
-- already phone-verified bidder. Same core, same rules.
create or replace function public.place_bid_for(
  p_vehicle_id uuid, p_amount_cents int, p_bidder_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_bidder_id is null then raise exception 'AUTH_REQUIRED'; end if;
  return public._place_bid_core(p_vehicle_id, p_amount_cents, p_bidder_id);
end;
$$;
revoke all on function public.place_bid_for(uuid, int, uuid) from public;
grant execute on function public.place_bid_for(uuid, int, uuid) to service_role;
