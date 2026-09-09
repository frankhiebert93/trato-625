-- WhatsApp Channel "megaphone" (Slice 3).
--
-- WhatsApp Channels (Canales) have no compliant post API, so instead of posting
-- automatically we QUEUE a post whenever something worth broadcasting happens —
-- a lot goes live ('new_lot') or a lot sells ('sold') — and the admin dashboard
-- renders ready-to-paste text + a wa.me link to drop into the Channel by hand.
--
-- Two existing functions are re-created verbatim from their latest versions with
-- a single added insert each; nothing else about them changes.

-- ── Queue table ────────────────────────────────────────────────────────────
create table if not exists public.channel_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('new_lot','sold')),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','published','dismissed')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (kind, vehicle_id)   -- one post per kind per lot (enqueue is idempotent)
);
create index if not exists channel_posts_status_idx on public.channel_posts (status, created_at);

alter table public.channel_posts enable row level security;
-- Admin reads via their own session; the cron enqueues and the admin API updates
-- status, both through the service role. No client write policy.
drop policy if exists channel_posts_admin_select on public.channel_posts;
create policy channel_posts_admin_select on public.channel_posts
  for select to authenticated using (public.is_admin());
grant select on public.channel_posts to authenticated;   -- rows still filtered by RLS
grant select, insert, update on public.channel_posts to service_role;

-- ── Enqueue a 'sold' post when a lot sells ───────────────────────────────────
-- Verbatim from 20260909030000_sale_commissions.sql, plus one insert in the sold
-- branch. Everything else is unchanged.
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
      -- Queue a "VENDIDO" post for the Channel.
      insert into public.channel_posts (kind, vehicle_id)
        values ('sold', r.id) on conflict (kind, vehicle_id) do nothing;
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

-- ── Enqueue a 'new_lot' post when lots go live ───────────────────────────────
-- Verbatim from 20260908190000_auction_events.sql, plus one insert after the lots
-- are stamped live. Everything else is unchanged.
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

  -- Queue a "NUEVA SUBASTA" post for each lot that just went live.
  insert into public.channel_posts (kind, vehicle_id)
    select 'new_lot', v.id from public.vehicles v
    where v.event_id = p_event and v.status = 'live'
    on conflict (kind, vehicle_id) do nothing;

  update public.auction_events set status = 'live' where id = p_event;
end;
$$;
revoke all on function public._go_live_event(uuid) from public;
grant execute on function public._go_live_event(uuid) to service_role;
