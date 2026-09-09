-- Seller's commission on a SOLD lot: a flat % of the hammer price, clamped to a
-- per-currency floor/cap. Snapshotted at close so later rate changes never
-- rewrite a debt already owed. Tracked, not enforced; the seller settles it by
-- Stripe / bank transfer / cash and an admin (or the Stripe webhook) marks it paid.

-- ── 1) Config on app_settings (single row, id = 1) ─────────────────────────
-- Posture B: 6% flat, USD floor $250 / cap $2,500. MXN floor/cap are left NULL
-- (uncapped) for the admin to set from the dashboard.
alter table public.app_settings
  add column if not exists sale_commission_pct numeric(5,2) not null default 6.00
    check (sale_commission_pct >= 0 and sale_commission_pct <= 100),
  add column if not exists sale_commission_min_cents_usd int
    check (sale_commission_min_cents_usd is null or sale_commission_min_cents_usd >= 0),
  add column if not exists sale_commission_max_cents_usd int
    check (sale_commission_max_cents_usd is null or sale_commission_max_cents_usd >= 0),
  add column if not exists sale_commission_min_cents_mxn int
    check (sale_commission_min_cents_mxn is null or sale_commission_min_cents_mxn >= 0),
  add column if not exists sale_commission_max_cents_mxn int
    check (sale_commission_max_cents_mxn is null or sale_commission_max_cents_mxn >= 0);

-- Seed the USD floor/cap once (coalesce keeps any value an admin already set).
update public.app_settings
   set sale_commission_min_cents_usd = coalesce(sale_commission_min_cents_usd, 25000),   -- $250.00
       sale_commission_max_cents_usd = coalesce(sale_commission_max_cents_usd, 250000)   -- $2,500.00
 where id = 1;

-- app_settings is already granted SELECT to anon/authenticated table-wide with a
-- `using (true)` read policy, so the new columns are automatically public config.

-- ── 2) Per-sale commission ledger (one row per sold lot) ───────────────────
create table if not exists public.sale_commissions (
  vehicle_id       uuid primary key references public.vehicles(id) on delete cascade,
  seller_id        uuid not null references public.profiles(id),
  currency         text not null check (currency in ('USD','MXN')),
  sale_price_cents int  not null check (sale_price_cents >= 0),
  commission_cents int  not null check (commission_cents >= 0),
  status           text not null default 'owed' check (status in ('owed','paid','waived')),
  method           text check (method in ('stripe','transfer','cash')),
  paid_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists sale_commissions_status_idx on public.sale_commissions (status, created_at);
create index if not exists sale_commissions_seller_idx on public.sale_commissions (seller_id);

alter table public.sale_commissions enable row level security;

-- Seller reads only their own rows; admin reads all. No client writes — every
-- insert/update is done by the service role (the close sweep, the admin API,
-- and the Stripe webhook).
drop policy if exists sale_commissions_owner_select on public.sale_commissions;
create policy sale_commissions_owner_select on public.sale_commissions
  for select to authenticated using (seller_id = auth.uid());
drop policy if exists sale_commissions_admin_select on public.sale_commissions;
create policy sale_commissions_admin_select on public.sale_commissions
  for select to authenticated using (public.is_admin());

grant select on public.sale_commissions to authenticated;   -- rows still filtered by RLS
grant select, insert, update on public.sale_commissions to service_role;

-- ── 3) Fee calculator: flat % clamped to the currency's floor/cap ──────────
create or replace function public.compute_sale_fee(p_price_cents int, p_currency text)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s   public.app_settings;
  v_fee int;
  v_min int;
  v_max int;
begin
  select * into s from public.app_settings where id = 1;
  if s is null or p_price_cents is null or p_price_cents <= 0 then
    return 0;
  end if;

  v_fee := round(p_price_cents::numeric * s.sale_commission_pct / 100.0)::int;

  if p_currency = 'USD' then
    v_min := s.sale_commission_min_cents_usd;
    v_max := s.sale_commission_max_cents_usd;
  else
    v_min := s.sale_commission_min_cents_mxn;
    v_max := s.sale_commission_max_cents_mxn;
  end if;

  if v_min is not null and v_fee < v_min then v_fee := v_min; end if;
  if v_max is not null and v_fee > v_max then v_fee := v_max; end if;
  if v_fee > p_price_cents then v_fee := p_price_cents; end if;  -- a floor can't exceed the sale
  return v_fee;
end;
$$;
revoke all on function public.compute_sale_fee(int, text) from public;
grant execute on function public.compute_sale_fee(int, text) to anon, authenticated, service_role;

-- ── 4) Create the owed commission when a lot sells ─────────────────────────
-- Same body as 20260908051958_close_and_notify.sql, with one added insert in the
-- sold branch. Everything else is unchanged.
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
      -- Snapshot the seller's commission owed on this sale.
      insert into public.sale_commissions (vehicle_id, seller_id, currency, sale_price_cents, commission_cents)
        values (r.id, r.seller_id, r.currency, r.current_bid_cents,
                public.compute_sale_fee(r.current_bid_cents, r.currency))
        on conflict (vehicle_id) do nothing;
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
