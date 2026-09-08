create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  channel text not null check (channel in ('whatsapp','sms')),
  kind text not null check (kind in ('outbid','won','sold','unsold')),
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notifications_pending_idx on public.notifications (status, created_at);
alter table public.notifications enable row level security;
-- No client policies: only the service role (cron) touches this table.

-- Close every live lot past its end time; decide sold vs unsold vs no-bids.
create or replace function public.close_due_auctions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare r public.vehicles; n int := 0; v_sold boolean;
begin
  for r in
    select * from public.vehicles
     where status = 'live' and ends_at is not null and ends_at <= now()
     for update skip locked
  loop
    v_sold := r.current_leader_id is not null
              and (r.reserve_cents is null or r.current_bid_cents >= r.reserve_cents);
    if v_sold then
      update public.vehicles set status = 'sold', winner_id = r.current_leader_id where id = r.id;
      insert into public.notifications (recipient_id, channel, kind, vehicle_id)
        select r.current_leader_id, p.notify_channel, 'won', r.id
        from public.profiles p where p.id = r.current_leader_id;
      insert into public.notifications (recipient_id, channel, kind, vehicle_id)
        select r.seller_id, p.notify_channel, 'sold', r.id
        from public.profiles p where p.id = r.seller_id;
    else
      update public.vehicles set status = 'unsold' where id = r.id;
      insert into public.notifications (recipient_id, channel, kind, vehicle_id)
        select r.seller_id, p.notify_channel, 'unsold', r.id
        from public.profiles p where p.id = r.seller_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.close_due_auctions() from public;
grant execute on function public.close_due_auctions() to service_role;
grant select, update on public.notifications to service_role;
-- (Invoked by the cron route via the service role; no anon/authenticated grant.)

-- Reveal the counterparty's contact only to the winner/seller of a SOLD lot.
create or replace function public.get_settlement_contact(p_vehicle_id uuid)
returns table (counterparty text, name text, phone text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v public.vehicles; v_uid uuid := auth.uid();
begin
  select * into v from public.vehicles where id = p_vehicle_id;
  if not found or v.status <> 'sold' then return; end if;
  if v_uid = v.winner_id then
    return query select 'seller'::text, p.display_name, p.phone
                 from public.profiles p where p.id = v.seller_id;
  elsif v_uid = v.seller_id then
    return query select 'winner'::text, p.display_name, p.phone
                 from public.profiles p where p.id = v.winner_id;
  end if;
  return;
end;
$$;
revoke all on function public.get_settlement_contact(uuid) from public;
grant execute on function public.get_settlement_contact(uuid) to authenticated;

-- create or replace place_bid: identical body to the bidding_engine migration,
-- with ONE additive block inserted immediately before the denormalized-state
-- update, to enqueue an outbid notification for the previous leader.
create or replace function public.place_bid(p_vehicle_id uuid, p_amount_cents int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
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

  -- Anti-snipe extension (Task C3 adds the settings-driven window).
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

revoke all on function public.place_bid(uuid, int) from public;
grant execute on function public.place_bid(uuid, int) to authenticated;
