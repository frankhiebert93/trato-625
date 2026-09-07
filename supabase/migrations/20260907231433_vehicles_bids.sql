create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id),
  title text not null,
  make text, model text, year int,
  mileage_km int, condition text, vin text,
  description text, location text,
  photos text[] not null default '{}',
  currency text not null default 'MXN' check (currency in ('USD','MXN')),
  opening_bid_cents int not null check (opening_bid_cents >= 0),
  reserve_cents int check (reserve_cents is null or reserve_cents >= opening_bid_cents),
  min_increment_cents int check (min_increment_cents is null or min_increment_cents > 0),
  current_bid_cents int,
  current_leader_id uuid references public.profiles(id),
  bid_count int not null default 0,
  status text not null default 'draft'
    check (status in ('draft','pending_review','scheduled','live','sold','unsold','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  listing_fee_status text not null default 'unpaid'
    check (listing_fee_status in ('unpaid','authorized','captured','released')),
  stripe_payment_intent_id text,
  winner_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  has_reserve boolean generated always as (reserve_cents is not null) stored,
  reserve_met boolean generated always as (
    reserve_cents is not null
    and current_bid_cents is not null
    and current_bid_cents >= reserve_cents
  ) stored
);
create index vehicles_status_ends_idx on public.vehicles (status, ends_at);

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id),
  amount_cents int not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);
create index bids_vehicle_amount_idx on public.bids (vehicle_id, amount_cents desc);
