# Plan 8 — Member Account Dashboard, Expanded Profile & Watchlist

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Plan / design — no code yet. Awaiting confirmation on the "Open decisions" section before implementation.

**Goal:** Give a signed-in buyer/seller a single account hub (`/cuenta`) where they
can see **their bids** (leading / outbid / won / lost), **items they won** (with the
seller contact to settle), **vehicles they posted** (across every listing state), a
**watchlist** of auctions they follow without bidding, and **upcoming auctions** — plus
expand the editable profile so they can save more of their own info. Guests keep full
read access to auctions and vehicles and keep being blocked from bidding until they
have an SMS-verified account (already the case today — see "What already exists").

**Architecture:** Reads are **client-side** through the existing browser Supabase
client (`lib/supabase.ts`), exactly like `AuctionFeed` and the vehicle detail page.
The database stays the security boundary (RLS + `SECURITY DEFINER` RPCs); no
server components, no `@supabase/ssr`, no middleware — the app has none and Capacitor
loads the live site. Three of the four personal views (**won**, **my listings**,
**watchlist**) are expressible as direct table selects that existing RLS already
permits; the **"my bids" roll-up** (one row per lot with my highest bid + a leading
flag) is served by a new `SECURITY DEFINER` RPC so the client never has to join/group
`bids`×`vehicles` itself and `reserve_cents` is never exposed. The watchlist adds one
small table (`watches`) with owner-scoped RLS. Expanded profile fields reuse the
existing column-scoped self-update pattern from Plan 2.

**Tech Stack:** Next.js 16.2 / React 19 (client components), Supabase Postgres
(RLS + PL/pgSQL RPCs + one new table), Supabase Auth (existing phone OTP — unchanged),
Tailwind v4, pgTAP, Vitest. No new dependencies.

---

## Global Constraints

_Every task's requirements implicitly include this section._

- **Modified Next.js — verify APIs before writing app code:** _"This is NOT the
  Next.js you know. … Read the relevant guide in `node_modules/next/dist/docs/`
  before writing any code. Heed deprecation notices."_ (from `AGENTS.md`). For every
  UI task, mirror the client-component patterns already in the repo
  (`app/page.tsx`, `components/AuctionFeed.tsx`, `app/subastas/[id]/page.tsx`,
  `app/perfil/page.tsx`) rather than recalling APIs from memory.
- **Reads are client-side** via `lib/supabase.ts`. Do NOT add `@supabase/ssr`,
  middleware, or server components. The DB (RLS + RPCs) is the security boundary;
  route guards (`useUser()` → redirect to `/entrar`) are UX only.
- **`reserve_cents` must never reach a client.** Every new query and RPC selects only
  the safe column set already used by `AuctionFeed`/`vehicles_public_select`. New RPCs
  are `SECURITY DEFINER` and must not select or return `reserve_cents` — only the
  derived `has_reserve` / `reserve_met` booleans.
- **A user must never change their own `role` / `is_banned`** — new profile columns
  are added to the column-scoped UPDATE grant; `role`/`is_banned` stay ungranted.
- **No new verification step.** An account only exists after phone + SMS OTP
  (`/entrar`), so "SMS-verified before bidding" is already satisfied. Do not add a
  second verification gate. `/cuenta`, the watch toggle, and bidding all simply
  require a session.
- **Spanish UI.** All user-facing copy is Spanish (`es-MX`), matching existing pages.
- **Match the auction design system**, not the plain-Tailwind look of the current
  `/perfil`, `/entrar`, `/vender`. New surfaces use the cream/ink/terracotta/green
  tokens, `font-display`, `shadow-hard`, `press`, and 2px `border-ink` cards seen in
  `AuctionFeed`/`app/subastas/[id]`. (The `premium-app-ui` skill is relevant.)
- **The full existing test suite must stay green** (pgTAP `01`–`09`, Vitest suites).
  New pgTAP files are additive; do not renumber or change existing plan counts.
- **Commit after each task** with a conventional-commit message.

---

## Phase position

Phase 1 (Plans 1–7) shipped the auction platform: schema + bidding engine, phone-OTP
auth + profiles, seller submission + Stripe, admin ops + settings, public auction UI,
close/settlement/notifications, cutover. This is a **Phase 2** plan (the design brief
§14 lists *watchlists* and *bidder-facing history* under Phase 2). It depends only on
merged Phase 1 and introduces no breaking changes to the engine.

---

## What already exists (do NOT rebuild)

Confirmed by reading the code — the executor should reuse, not re-create, these:

- **Accounts + SMS verification:** `lib/auth.ts` (`requestOtp`/`verifyOtp` →
  Supabase Phone OTP), `lib/useUser.ts` (`{ user, profile, loading }`),
  `app/entrar/page.tsx`. A session only exists post-OTP, so every account is
  SMS-verified.
- **Guest browsing + bid gate:** RLS `vehicles_public_select` grants `anon` read on
  `status in ('scheduled','live','sold','unsold')`; the detail page shows
  *"Inicia sesión para pujar"* to guests and `place_bid` rejects `anon`
  (`AUTH_REQUIRED`).
- **Profiles:** `profiles(id, phone, display_name, role, notify_channel, is_banned)`;
  self-update is column-scoped to `display_name, notify_channel`
  (`20260908021735_profile_lifecycle.sql`).
- **Vehicles/bids + ownership RLS:** `vehicles_owner_select` (seller sees own lots,
  all statuses), `bids_owner_select` (bidder sees own bids), `winner_id` is a granted
  column, sold lots are public. This is why won/listings/bids are queryable **without
  new RLS**.
- **Reusable UI + helpers:** `components/AuctionFeed.tsx` holds the card markup and
  `fmtCents` / `vehicleLabel` / `reserveBadge` / `Countdown`. The detail page already
  renders the winner↔seller contact via the `get_settlement_contact` RPC.
- **Settings form:** `app/perfil/page.tsx` (name + notify channel + sign out).

The gap this plan fills: there is **no personal activity hub**, **no watchlist**, and
the profile captures only two fields.

---

## File Structure (this plan)

- Create: `supabase/migrations/<ts>_profile_extra_fields.sql` — add `full_name`,
  `city` columns + extend the column-scoped UPDATE grant.
- Create: `supabase/migrations/<ts>_watches_and_dashboard_rpcs.sql` — `watches` table
  + RLS/grants; `my_bid_lots()` and `my_watched_lots()` RPCs.
- Create: `supabase/tests/10_profile_extra_fields.test.sql` — pgTAP for new columns +
  self-update rules.
- Create: `supabase/tests/11_watches_and_dashboard.test.sql` — pgTAP for `watches`
  RLS and the two RPCs.
- Modify: `lib/auth.ts` — extend `Profile` type + `getMyProfile` select +
  `updateMyProfile` fields.
- Create: `lib/account.ts` — client fetchers for the dashboard + watch add/remove.
- Create: `tests/account.test.ts` — Vitest integration for the fetchers/RPCs/watches.
- Create: `components/VehicleCard.tsx` — presentational card extracted from
  `AuctionFeed`; Modify: `components/AuctionFeed.tsx` to use it.
- Create: `app/cuenta/page.tsx` — the member dashboard.
- Modify: `app/page.tsx` — nav: add/rename a **"Mi cuenta"** pill → `/cuenta`.
- Modify: `app/perfil/page.tsx` — add the new profile fields (and restyle to the
  design system).
- Modify: `app/subastas/[id]/page.tsx` — add a **"Seguir" / "Dejar de seguir"** toggle.

---

## Task 1: Expanded profile fields (DB)

**Files:**
- Create: `supabase/migrations/<ts>_profile_extra_fields.sql`
- Create: `supabase/tests/10_profile_extra_fields.test.sql`

**Interfaces:**
- Produces columns `public.profiles.full_name text`, `public.profiles.city text`
  (both nullable); extends the `authenticated` column-scoped UPDATE grant to include
  them. `role`/`is_banned` remain ungranted.

> **Confirm before running:** the exact field set (`full_name`, `city`) is a decision —
> see "Open decisions". Adjust the column list consistently across this task, Task 3,
> and Task 5 if it changes. `full_name` is intended as **private** info (self + admin,
> and available for settlement), distinct from the **public** `display_name`.

- [ ] **Step 1: Create the migration**

```bash
supabase migration new profile_extra_fields
```

- [ ] **Step 2: Write the migration**

```sql
-- Optional, user-editable profile info. Private by default: readable only to the
-- owner (profiles_self_select) and admin (profiles_admin_select) under existing RLS.
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists city text;

-- Extend the column-scoped self-update grant from Plan 2. role/is_banned stay OUT,
-- so a user still cannot self-promote or self-unban.
grant update (display_name, notify_channel, full_name, city)
  on public.profiles to authenticated;
```

- [ ] **Step 3: Write the pgTAP test**

Create `supabase/tests/10_profile_extra_fields.test.sql` mirroring
`06_profiles_auth.test.sql`: assert a signed-in user can `update` their own
`full_name`/`city` (`lives_ok`), and still cannot `update` `role` or `is_banned`
(`throws_ok` `42501`). Use a fresh auth user id; keep `select plan(n)`/`finish()`.

- [ ] **Step 4: Reset and run the DB suite — expect all green**

```bash
supabase db reset && supabase test db
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/10_profile_extra_fields.test.sql
git commit -m "feat(db): add optional full_name/city profile fields (self-editable)"
```

---

## Task 2: Watchlist table + dashboard RPCs (DB)

**Files:**
- Create: `supabase/migrations/<ts>_watches_and_dashboard_rpcs.sql`
- Create: `supabase/tests/11_watches_and_dashboard.test.sql`

**Interfaces:**
- Produces table `public.watches(user_id, vehicle_id, created_at)` with owner-scoped
  RLS; RPC `public.my_bid_lots()` (lots the caller has bid on) and
  `public.my_watched_lots()` (public lots the caller watches). Neither returns
  `reserve_cents`.

- [ ] **Step 1: Create the migration**

```bash
supabase migration new watches_and_dashboard_rpcs
```

- [ ] **Step 2: Write the migration**

```sql
-- Follow an auction without bidding. Composite PK makes watch/unwatch idempotent.
create table public.watches (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, vehicle_id)
);
create index watches_user_idx on public.watches (user_id);

alter table public.watches enable row level security;

-- A user only ever sees/sets their own watches.
create policy watches_owner_all on public.watches
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.watches from anon, authenticated;
grant select, insert, delete on public.watches to authenticated;

-- "My bids" roll-up: one row per lot the caller has bid on, with their highest bid
-- and whether they currently lead / won. SECURITY DEFINER so it can read vehicles
-- regardless of RLS, but it only returns lots the caller actually bid on, and it
-- NEVER selects reserve_cents (only the derived has_reserve/reserve_met).
create or replace function public.my_bid_lots()
returns table (
  id uuid, title text, make text, model text, year int, photos text[],
  currency text, opening_bid_cents int, current_bid_cents int, bid_count int,
  status text, starts_at timestamptz, ends_at timestamptz,
  has_reserve boolean, reserve_met boolean, winner_id uuid,
  my_max_bid_cents int, is_leading boolean, i_won boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.title, v.make, v.model, v.year, v.photos,
         v.currency, v.opening_bid_cents, v.current_bid_cents, v.bid_count,
         v.status, v.starts_at, v.ends_at, v.has_reserve, v.reserve_met, v.winner_id,
         mb.my_max_bid_cents,
         (v.current_leader_id = auth.uid())                    as is_leading,
         (v.status = 'sold' and v.winner_id = auth.uid())      as i_won
  from (
    select vehicle_id, max(amount_cents) as my_max_bid_cents
    from public.bids
    where bidder_id = auth.uid()
    group by vehicle_id
  ) mb
  join public.vehicles v on v.id = mb.vehicle_id
  order by (v.status = 'live') desc, v.ends_at asc nulls last;
$$;
revoke all on function public.my_bid_lots() from public;
grant execute on function public.my_bid_lots() to authenticated;

-- Lots the caller watches that are still publicly visible (same status set as
-- vehicles_public_select). Also excludes reserve_cents.
create or replace function public.my_watched_lots()
returns table (
  id uuid, title text, make text, model text, year int, photos text[],
  currency text, opening_bid_cents int, current_bid_cents int, bid_count int,
  status text, starts_at timestamptz, ends_at timestamptz,
  has_reserve boolean, reserve_met boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.title, v.make, v.model, v.year, v.photos,
         v.currency, v.opening_bid_cents, v.current_bid_cents, v.bid_count,
         v.status, v.starts_at, v.ends_at, v.has_reserve, v.reserve_met
  from public.watches w
  join public.vehicles v on v.id = w.vehicle_id
  where w.user_id = auth.uid()
    and v.status in ('scheduled','live','sold','unsold')
  order by (v.status = 'live') desc, v.ends_at asc nulls last;
$$;
revoke all on function public.my_watched_lots() from public;
grant execute on function public.my_watched_lots() to authenticated;
```

- [ ] **Step 3: Write the pgTAP test**

Create `supabase/tests/11_watches_and_dashboard.test.sql`. Seed (via
`on conflict do update`, since the signup trigger pre-creates profiles — see Plan 2
Task 1) a seller, two bidders, and a `live` vehicle with bids. Assert, under a
bidder's JWT (`set_config('request.jwt.claims', …)` + `set local role authenticated`):
- `insert`/`delete` into `watches` for **their own** `user_id` succeeds; inserting a
  row with someone else's `user_id` is rejected (RLS `with check`).
- `my_bid_lots()` returns exactly the lots that bidder bid on, with the right
  `my_max_bid_cents`, `is_leading`, and `i_won`.
- `my_watched_lots()` returns only watched lots in a public status.
- Neither RPC's result includes a `reserve_cents` column (assert via
  `has_column`/`hasnt_column` on a `create temp table … as select * from …`, or check
  the returned column set).

- [ ] **Step 4: Reset and run the DB suite — expect all green**

```bash
supabase db reset && supabase test db
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/11_watches_and_dashboard.test.sql
git commit -m "feat(db): watches table + my_bid_lots/my_watched_lots dashboard RPCs"
```

---

## Task 3: Client data layer (`lib/auth.ts` + `lib/account.ts`)

**Files:**
- Modify: `lib/auth.ts`
- Create: `lib/account.ts`
- Create: `tests/account.test.ts`

**Interfaces:**
- Extend `Profile` in `lib/auth.ts` with `full_name: string | null; city: string | null`;
  add them to the `getMyProfile` `.select(...)` and the `updateMyProfile` field type.
- `lib/account.ts` produces (all return typed rows or `{ error }`):
  - `fetchMyBidLots(): Promise<BidLot[]>` → `supabase.rpc('my_bid_lots')`
  - `fetchMyWonLots(): Promise<Vehicle[]>` → `vehicles` where `winner_id = me` and
    `status = 'sold'` (direct select, safe columns)
  - `fetchMyListings(): Promise<Vehicle[]>` → `vehicles` where `seller_id = me`
    (direct select, all statuses via `vehicles_owner_select`)
  - `fetchWatchedLots(): Promise<Vehicle[]>` → `supabase.rpc('my_watched_lots')`
  - `fetchUpcomingLots(): Promise<Vehicle[]>` → `vehicles` where `status = 'scheduled'`
    (public), ordered by `starts_at`
  - `fetchWatchedIds(): Promise<Set<string>>` → `watches.vehicle_id` for me (used by
    the detail-page toggle)
  - `addWatch(vehicleId)`, `removeWatch(vehicleId)` → insert/delete on `watches`

> Define a shared `Vehicle`/`BidLot` type in `lib/account.ts` using the **same safe
> column set** as `AuctionFeed`. Never select `reserve_cents`. Get the current user id
> via `supabase.auth.getUser()` (as `getMyProfile` does) before the owner-filtered
> selects.

- [ ] **Step 1: Extend `lib/auth.ts`**

Add `full_name`/`city` to the `Profile` type, to the `.select('id, phone, display_name, role, notify_channel, full_name, city')` in `getMyProfile`, and to the `updateMyProfile` `fields` param type.

- [ ] **Step 2: Implement `lib/account.ts`** per the interfaces above (mirror the
  error-handling shape of `lib/auth.ts`; `.rpc(...)` returns arrays already shaped by
  the SQL functions).

- [ ] **Step 3: Write the Vitest integration test**

Create `tests/account.test.ts` mirroring `tests/auth.test.ts` (sign in via local test
OTP). Because bidding/listing go through the engine, prefer the existing
`tests/helpers/supabase.ts` service-role helper to seed a seller, a `live` vehicle,
and place a bid, then assert as the signed-in bidder:
- `fetchMyBidLots()` returns that lot with correct `my_max_bid_cents`/`is_leading`.
- `addWatch(id)` then `fetchWatchedLots()`/`fetchWatchedIds()` include it;
  `removeWatch(id)` clears it.
- `updateMyProfile({ full_name, city })` persists (re-`getMyProfile`).

Follow the seeding conventions already in `tests/helpers/` and `tests/concurrency.test.ts`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- account
```

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/account.ts tests/account.test.ts
git commit -m "feat(account): profile fields + dashboard/watchlist client data layer"
```

---

## Task 4: Reusable `VehicleCard` + the `/cuenta` dashboard (UI)

**Files:**
- Create: `components/VehicleCard.tsx`
- Modify: `components/AuctionFeed.tsx`
- Create: `app/cuenta/page.tsx`
- Modify: `app/page.tsx`

> **Before writing:** re-read `components/AuctionFeed.tsx` and `app/subastas/[id]/page.tsx`
> to copy the exact card markup, tokens, and the `fmtCents`/`reserveBadge`/`Countdown`
> helpers; skim `node_modules/next/dist/docs/` for anything that differs from memory.

- [ ] **Step 1: Extract `components/VehicleCard.tsx`**

Move the presentational card (the `<Link href={/subastas/${v.id}}>…</Link>` block)
out of `AuctionFeed` into a `VehicleCard` component that takes a vehicle plus an
optional `badge`/`statusSlot` override (so the dashboard can show a listing-state
badge — e.g. *En revisión*, *Vendido* — instead of the reserve badge). Keep
`AuctionFeed`'s rendered output identical (it has no test; verify visually in Step 5).

- [ ] **Step 2: Implement `app/cuenta/page.tsx`**

A `'use client'` page using `useUser()`; while `loading` show a loading state; if no
`user`, `router.push('/entrar')`. Sticky header in the design system (like
`/subastas`) titled **"Mi cuenta"** with a link to `/perfil` ("Editar perfil"). Render
sections, each backed by a `lib/account.ts` fetcher and a `VehicleCard` grid, with an
empty-state card (reuse the "No hay…" pattern) when a section is empty:

1. **Mis pujas** (`fetchMyBidLots`) — per lot show a status chip derived on the
   client: `i_won` → *Ganaste*; `status==='live' && is_leading` → *Vas ganando*;
   `status==='live' && !is_leading` → *Te superaron*; ended & not won → *No ganada*.
   Show `my_max_bid_cents` as "Tu puja máxima".
2. **Ganados** (`fetchMyWonLots`) — won lots; card links to `/subastas/[id]` where the
   existing `get_settlement_contact` reveal shows the seller's WhatsApp (do **not**
   duplicate that RPC here).
3. **Mis vehículos** (`fetchMyListings`) — seller's lots across all statuses; map
   `status` (+ `listing_fee_status`) to a Spanish badge (*Borrador, En revisión,
   Programada, En vivo, Vendido, No vendido, Cancelada*). Include a "Publicar vehículo"
   link to `/vender`.
4. **Siguiendo** (`fetchWatchedLots`) — watched lots.
5. **Próximas** (`fetchUpcomingLots`) — scheduled lots; the card shows *Comienza*
   (`starts_at`) rather than a countdown to `ends_at`.

Consider a lightweight tab/segmented control (client state) over the five sections for
the narrow mobile layout, matching the pill styling in `app/page.tsx`. Poll or refetch
on mount is enough — no realtime needed (the rest of the app polls; see the detail
page's `POLL_MS`).

- [ ] **Step 3: Update the nav in `app/page.tsx`**

Rename the signed-in **"Perfil"** pill to **"Mi cuenta"** pointing at `/cuenta`
(keep the **"Entrar"** pill for signed-out users, and the Admin pill). `/perfil`
remains reachable from inside `/cuenta`.

- [ ] **Step 4: Build + lint**

```bash
npm run lint && npm run build
```

- [ ] **Step 5: Verify in the browser**

Sign in as a local test-OTP user that has bid on / won / posted / watched lots (seed
via the service-role helper if needed). Confirm each section renders and links
correctly, guests are redirected to `/entrar`, and the public feed (`/`, `/subastas`)
still looks identical after the `VehicleCard` extraction. Screenshot `/cuenta`.

- [ ] **Step 6: Commit**

```bash
git add components/VehicleCard.tsx components/AuctionFeed.tsx app/cuenta/page.tsx app/page.tsx
git commit -m "feat(account): member dashboard at /cuenta (bids, won, listings, watchlist, upcoming)"
```

---

## Task 5: Expanded profile form (UI)

**Files:**
- Modify: `app/perfil/page.tsx`

- [ ] **Step 1: Add the new fields** (`full_name`, `city`) to the form, seeded from
  `profile` the same way `display_name`/`notify_channel` are, saved through
  `updateMyProfile`. Label `display_name` as the **public** name (shown to others) and
  `full_name` as **private** (for settlement) so the distinction is clear.

- [ ] **Step 2: Restyle to the design system** (cream/ink/terracotta, `font-display`,
  `shadow-hard`, 2px borders) so `/perfil` matches `/cuenta` and the auction pages,
  replacing the current `bg-gray-100 / bg-white / slate-*` styling. (Optional but
  recommended for consistency; keep it a self-contained change.)

- [ ] **Step 3: Verify** save + reload persistence in the browser; `npm run lint && npm run build`.

- [ ] **Step 4: Commit**

```bash
git add app/perfil/page.tsx
git commit -m "feat(account): expanded, restyled profile settings (full_name, city)"
```

---

## Task 6: "Seguir" (watch) toggle on the vehicle detail page (UI)

**Files:**
- Modify: `app/subastas/[id]/page.tsx`

- [ ] **Step 1: Add a follow toggle.** When signed in, show a **"Seguir" / "Dejar de
  seguir"** button near the bid box; initial state from `fetchWatchedIds()` (or a
  single-lot check); clicking calls `addWatch(id)` / `removeWatch(id)` and flips local
  state optimistically with rollback on error. When signed out, show a subtle
  "Inicia sesión para seguir esta subasta" prompt linking to `/entrar` (do not block
  viewing). Keep it visually consistent with the existing buttons.

- [ ] **Step 2: Verify** toggling persists across reload, and that a watched lot then
  appears under **Siguiendo** in `/cuenta`; `npm run lint && npm run build`.

- [ ] **Step 3: Commit**

```bash
git add app/subastas/[id]/page.tsx
git commit -m "feat(account): follow/unfollow (watch) toggle on vehicle detail"
```

---

## Self-Review

**Scope coverage (all four requested items):**
- *My bids + won items* → `my_bid_lots()` RPC (Task 2) + `fetchMyWonLots` + dashboard
  sections 1–2 (Task 4). ✅
- *My posted items (seller)* → `fetchMyListings` over `vehicles_owner_select` +
  dashboard section 3 (Task 4). ✅
- *Expanded profile info* → `full_name`/`city` columns + grant (Task 1), type/data
  layer (Task 3), form (Task 5). ✅
- *Watchlist* → `watches` table + `my_watched_lots()` (Task 2), fetchers (Task 3),
  dashboard section 4 (Task 4), detail-page toggle (Task 6). ✅
- *See upcoming auctions* → `fetchUpcomingLots` (scheduled) + dashboard section 5. ✅
- *Guest read + SMS-gated bidding* → unchanged; already satisfied (see "What already
  exists"); `/cuenta`/watch/bid require a session, which requires SMS OTP. ✅

**Security:** no new client can read `reserve_cents` — direct selects use the safe
column set, and both RPCs are `SECURITY DEFINER` returning explicit safe columns only
(asserted in pgTAP `11`). `watches` is owner-scoped (RLS `with check`). `role`/
`is_banned` stay out of the UPDATE grant (asserted in pgTAP `10`).

**Consistency:** `Profile` is extended in one place (`lib/auth.ts`) and reused by
`useUser`/`/perfil`/`/cuenta`. `VehicleCard` is the single card renderer for the feed
and every dashboard section. The safe `Vehicle` column set matches `AuctionFeed`.

**No realtime added** — matches the app's existing polling/one-shot fetch model.

---

## Open decisions (confirm before implementing)

1. **Profile fields to add.** Proposed: `full_name` (private, for settlement) and
   `city`. Add/remove any (e.g. a public bio)? Keep phone as-is — it's the WhatsApp
   contact by design.
2. **Route/nav naming.** Proposed hub route `/cuenta` labeled **"Mi cuenta"**, with
   `/perfil` kept as the settings sub-page. Alternative: fold settings into `/cuenta`
   and retire `/perfil`.
3. **Restyle `/perfil` (and later `/entrar`, `/vender`)** to the auction design system
   now (Task 5 Step 2), or leave styling for a separate pass?
4. **Watchlist notifications.** This plan lets users *save & view* watched lots.
   Sending "ending soon" alerts to watchers would extend the close/cron +
   `lib/notify.ts` pipeline (whose delivery is itself an unfinished, documented setup
   item) — recommend deferring to a follow-up. Confirm that's acceptable.
5. **Settlement name source.** Optionally feed the new `full_name` into
   `get_settlement_contact` (currently uses `display_name`). Out of scope unless wanted.
