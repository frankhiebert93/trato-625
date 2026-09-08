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

  insert into public.vehicles (
    seller_id, title, make, model, year, mileage_km, condition, vin,
    description, location, currency, opening_bid_cents, reserve_cents,
    photos, status, listing_fee_status
  ) values (
    v_uid, p_title, p_make, p_model, p_year, p_mileage_km, p_condition, p_vin,
    p_description, p_location, p_currency, p_opening_bid_cents, p_reserve_cents,
    coalesce(p_photos, '{}'), 'draft', 'unpaid'
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_draft_listing(text,text,text,int,int,text,text,text,text,text,int,int,text[]) from public;
grant execute on function public.create_draft_listing(text,text,text,int,int,text,text,text,text,text,int,int,text[]) to authenticated;

-- Public bucket for vehicle photos (mirrors the existing 'listings' bucket usage).
insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', true)
on conflict (id) do nothing;

-- Authenticated users may upload into their own folder (path prefix = their uid).
create policy vehicle_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
-- (Public read is provided by the bucket's public = true flag.)
