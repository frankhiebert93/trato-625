create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,
  display_name text,
  role text not null default 'bidder' check (role in ('bidder','seller','admin')),
  notify_channel text not null default 'whatsapp' check (notify_channel in ('whatsapp','sms')),
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  id int primary key default 1 check (id = 1),
  listing_fee_currency text not null default 'MXN' check (listing_fee_currency = 'MXN'),
  listing_fee_cents int not null default 50000,       -- $500.00 MXN (illustrative)
  -- Increment tiers per auction currency; the last tier per currency uses up_to_cents null.
  increment_tiers jsonb not null default '{
    "MXN": [
      {"up_to_cents": 5000000,  "increment_cents": 50000},
      {"up_to_cents": 15000000, "increment_cents": 100000},
      {"up_to_cents": 30000000, "increment_cents": 250000},
      {"up_to_cents": null,     "increment_cents": 500000}
    ],
    "USD": [
      {"up_to_cents": 500000,   "increment_cents": 5000},
      {"up_to_cents": 2500000,  "increment_cents": 10000},
      {"up_to_cents": 7500000,  "increment_cents": 25000},
      {"up_to_cents": null,     "increment_cents": 50000}
    ]
  }'::jsonb,
  default_duration_minutes int not null default 10080, -- 7 days
  publish_lead_minutes int not null default 0,
  antisnipe_window_seconds int not null default 120,
  antisnipe_extend_seconds int not null default 120,
  default_notify_channel text not null default 'whatsapp'
    check (default_notify_channel in ('whatsapp','sms')),
  terms_text text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;
