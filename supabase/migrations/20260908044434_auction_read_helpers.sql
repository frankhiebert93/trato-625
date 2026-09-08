-- Minimum acceptable next bid for a lot (mirrors place_bid's rule).
create or replace function public.next_min_bid(p_vehicle_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare v public.vehicles;
begin
  select * into v from public.vehicles where id = p_vehicle_id;
  if not found then return null; end if;
  if not (v.status in ('scheduled','live','sold','unsold')
          or v.seller_id = auth.uid()
          or public.is_admin()) then
    return null;
  end if;
  if v.current_bid_cents is null then
    return v.opening_bid_cents;
  end if;
  return v.current_bid_cents
       + coalesce(v.min_increment_cents, public.bid_increment_for(v.current_bid_cents, v.currency));
end;
$$;
revoke all on function public.next_min_bid(uuid) from public;
grant execute on function public.next_min_bid(uuid) to anon, authenticated;

-- Masked bid history for a lot (no identities, no reserve).
create or replace function public.public_bid_history(p_vehicle_id uuid)
returns table (amount_cents int, created_at timestamptz, bidder_label text)
language sql
stable
security definer
set search_path = public
as $$
  select b.amount_cents, b.created_at,
         case when p.display_name is not null and length(btrim(p.display_name)) > 0
              then left(btrim(p.display_name), 1) || '.'
              else 'Postor' end as bidder_label
  from public.bids b
  join public.profiles p on p.id = b.bidder_id
  join public.vehicles v on v.id = b.vehicle_id
  where b.vehicle_id = p_vehicle_id
    and (v.status in ('scheduled','live','sold','unsold')
         or v.seller_id = auth.uid()
         or public.is_admin())
  order by b.created_at desc
  limit 50;
$$;
revoke all on function public.public_bid_history(uuid) from public;
grant execute on function public.public_bid_history(uuid) to anon, authenticated;
