create or replace function public.bid_increment_for(p_amount_cents int, p_currency text)
returns int
language sql
stable
as $$
  select (tier->>'increment_cents')::int
  from public.app_settings s,
       jsonb_array_elements(s.increment_tiers -> p_currency) as tier
  where s.id = 1
    and ((tier->>'up_to_cents') is null
         or p_amount_cents < (tier->>'up_to_cents')::int)
  order by ((tier->>'up_to_cents') is null),          -- non-null tiers first
           nullif((tier->>'up_to_cents'), 'null')::int asc nulls last
  limit 1;
$$;

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
