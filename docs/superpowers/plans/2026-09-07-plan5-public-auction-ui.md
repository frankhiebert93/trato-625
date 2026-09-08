# Plan 5 — Public Auction UI & Realtime Bidding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** A public auction experience — a live feed of vehicles and a detail page
where a signed-in bidder places bids through `place_bid`, with a real-time price /
countdown / bid history — built at `/subastas` so the legacy home stays intact until
the Plan 7 cutover.

**Architecture:** Reads go straight through the browser Supabase client under the
existing RLS (public sees active lots; `reserve_cents` stays hidden — the UI uses the
`reserve_met`/`has_reserve` booleans). Bids call the `place_bid` RPC (Plan 1). Two
small SECURITY DEFINER helper RPCs expose the *next minimum bid* and a *masked bid
history* without leaking identities or the reserve. Live updates use Supabase
Realtime `postgres_changes` on `public.vehicles`. The countdown is derived from the
server-held `ends_at`.

**Tech Stack:** Next.js 16 client components, Supabase Realtime + RPC, pgTAP (RPCs)
+ browser smoke (UI). Money in cents.

## Global Constraints

- **Modified Next.js:** read `node_modules/next/dist/docs/` before app code; mirror
  `app/page.tsx` / `app/perfil/page.tsx` client patterns and the repo's
  React-Compiler lint rules (redirect-in-effect; seed-once via render-phase/boolean
  guard, never set-state-in-effect). (`AGENTS.md`.)
- **Do not expose `reserve_cents`** — use `has_reserve` / `reserve_met` only. Do not
  expose bidder identities/phones — bid history is masked server-side.
- **All bids go through `place_bid`** (Plan 1). The UI never writes `vehicles`/`bids`.
- **Countdown is display-only off server `ends_at`;** enforcement stays server-side.
- **Build at `/subastas`** — do NOT modify `app/page.tsx` (that is Plan 7's cutover).
- Client-side app; Spanish UI. Full existing suite stays green. Commit per task.

## Roadmap position

**Plan 5 of 7.** Consumes Plan 4's `live` lots. Plan 6 adds close/settlement +
notifications; Plan 7 repoints the home page to this feed.

## File Structure

- Create: `supabase/migrations/<ts>_auction_read_helpers.sql` — `next_min_bid` +
  `public_bid_history` RPCs + add `vehicles` to the realtime publication.
- Create: `supabase/tests/08_read_helpers.test.sql` — pgTAP.
- Create: `app/subastas/page.tsx` — the live auction feed.
- Create: `app/subastas/[id]/page.tsx` — vehicle detail + bidding + realtime.
- Reuse: `lib/supabase.ts`, `lib/useUser.ts`, `lib/i18n.ts` helpers if useful.

---

## Task 1: Read helpers + realtime (DB)

**Files:**
- Create: `supabase/migrations/<ts>_auction_read_helpers.sql`
- Create: `supabase/tests/08_read_helpers.test.sql`

**Interfaces:**
- `public.next_min_bid(p_vehicle_id uuid) returns int` — the minimum acceptable next
  bid (opening if no bids, else current + per-currency increment). SECURITY DEFINER
  (reads the lot); execute to anon+authenticated.
- `public.public_bid_history(p_vehicle_id uuid) returns table(amount_cents int,
  created_at timestamptz, bidder_label text)` — bids for a viewable lot, newest
  first, with a masked, non-identifying label. SECURITY DEFINER; execute to
  anon+authenticated.
- `public.vehicles` added to the `supabase_realtime` publication.

- [ ] **Step 1: Migration**

```sql
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
  if v.current_bid_cents is null then
    return v.opening_bid_cents;
  end if;
  return v.current_bid_cents
       + coalesce(v.min_increment_cents, public.bid_increment_for(v.current_bid_cents, v.currency));
end;
$$;
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
  where b.vehicle_id = p_vehicle_id
  order by b.created_at desc
  limit 50;
$$;
grant execute on function public.public_bid_history(uuid) to anon, authenticated;

-- Realtime: broadcast row changes on vehicles (RLS still filters what clients see).
alter publication supabase_realtime add table public.vehicles;
```

- [ ] **Step 2: pgTAP (`supabase/tests/08_read_helpers.test.sql`, plan(4))**

Seed a seller + a live lot (opening 1,000,000 MXN, no bids) and a bidder; test:
1. `next_min_bid` = opening (1,000,000) when there are no bids.
2. after a `place_bid` of 1,000,000, `next_min_bid` = 1,050,000 (current + MXN tier-1
   increment 50,000).
3. `public_bid_history` returns one row with `amount_cents = 1,000,000`.
4. `public_bid_history`'s `bidder_label` does NOT equal the bidder's phone and is
   either `'Postor'` or a single initial + '.' (no raw identity leaked).

Use the `set local role authenticated` + `request.jwt.claims` pattern from the
existing `04_place_bid.test.sql` for the `place_bid` call. Verify the realtime
publication includes the table:
`select is((select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='vehicles'), 1::bigint, 'vehicles in realtime publication');`
(That makes plan(5).)

- [ ] **Step 3: Reset + run**

```bash
supabase db reset && supabase test db
```
Expect `08_read_helpers` 5/5 + existing all green.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations supabase/tests/08_read_helpers.test.sql
git commit -m "feat(db): next_min_bid + masked public_bid_history RPCs + realtime on vehicles"
```

---

## Task 2: Auction feed (`/subastas`)

**Files:**
- Create: `app/subastas/page.tsx`

> **Before writing:** read `app/page.tsx` (existing feed/card patterns, `fmtPrice`
> in `lib/i18n.ts`) and `app/perfil/page.tsx` (client conventions + lint rules).

- [ ] **Step 1: Build the feed**

A `'use client'` page:
- Load `live` vehicles: `supabase.from('vehicles').select('id, title, make, model, year, photos, currency, current_bid_cents, opening_bid_cents, bid_count, ends_at, has_reserve, reserve_met').eq('status','live').order('ends_at', { ascending: true })`.
- Render a card grid: first photo, title (or make/model/year), current bid (or
  "Puja inicial" = opening bid if no bids yet) formatted for the lot's currency, a
  live-ish countdown to `ends_at`, bid count, and a reserve badge — **"Sin reserva"**
  when `!has_reserve`, **"Reserva alcanzada"** when `reserve_met`, else **"Reserva no
  alcanzada"**. Each card links to `/subastas/${id}`.
- Countdown: a small component that ticks each second off `ends_at` (client clock).
- Empty state ("No hay subastas activas") + loading state. Spanish throughout.

- [ ] **Step 2: Verify + commit**

`npx tsc --noEmit` and `npm run lint` clean on the new file (ignore `.vercel/output`).
Then:
```bash
git add app/subastas/page.tsx
git commit -m "feat(ui): public live auction feed at /subastas"
```

---

## Task 3: Vehicle detail + bidding + realtime (`/subastas/[id]`)

**Files:**
- Create: `app/subastas/[id]/page.tsx`

> **Before writing:** confirm the Next 16 dynamic-route param convention against
> `node_modules/next/dist/docs/` (client component reading the `[id]` segment — use
> `useParams()` from `next/navigation`, which this repo's client pages use). Reuse
> `useUser()`.

- [ ] **Step 1: Build the detail page**

A `'use client'` page for one lot:
- Read the lot by id (same column set as the feed, plus specs: mileage_km, condition,
  vin, description, location, current_leader_id, seller... only public columns).
- **Gallery** of `photos`; **specs**; **current price** (current_bid or opening) in the
  lot's currency; **reserve badge** (as in the feed); **countdown** to `ends_at`.
- **Bid history:** `supabase.rpc('public_bid_history', { p_vehicle_id: id })` →
  render newest-first (label, amount, relative time).
- **Bid box:** if not signed in (`useUser`), show a "Inicia sesión para pujar" link to
  `/entrar`. If signed in: fetch `next_min_bid` via
  `supabase.rpc('next_min_bid', { p_vehicle_id: id })`, prefill the amount (in pesos),
  and a **Pujar** button → `supabase.rpc('place_bid', { p_vehicle_id: id,
  p_amount_cents: Math.round(pesos*100) })`. Map errors to Spanish
  (`BID_TOO_LOW min=X` → "Tu puja debe ser al menos $Y"; `ENDED` → "La subasta terminó";
  `SELLER_CANNOT_BID`, `ALREADY_LEADING` → friendly messages). Disable while bidding.
- If `current_leader_id === user.id` show **"Vas ganando"**; after being outbid show it
  updates. (Reserve amount is never shown — only the met/not-met badge.)
- **Realtime:** subscribe to
  `supabase.channel('lot:'+id).on('postgres_changes', { event:'UPDATE', schema:'public', table:'vehicles', filter:'id=eq.'+id }, cb)` — on each change update current bid, bid_count, ends_at, reserve_met, current_leader_id, and re-fetch the bid history. Unsubscribe on unmount.
- Loading / not-found / ended states. Spanish.

- [ ] **Step 2: Verify + commit**

`npx tsc --noEmit` and `npm run lint` clean on the new file. Then:
```bash
git add "app/subastas/[id]/page.tsx"
git commit -m "feat(ui): vehicle detail with live bidding, realtime, and masked bid history"
```

---

## Self-Review

**Spec coverage:** live feed + detail → Tasks 2/3; bid box via `place_bid` → Task 3;
next-min prefill → `next_min_bid` (Task 1) + Task 3; masked bid history → `public_bid_history`
(Task 1) + Task 3; realtime price/timer → publication (Task 1) + subscription (Task 3);
reserve/no-reserve badge (no amount leaked) → Tasks 2/3; server-driven countdown →
`ends_at`. ✅ Watchlist/"notify me" is Phase 2 (out of scope). Built at `/subastas`
(home cutover is Plan 7). ✅

**Placeholder scan:** RPCs + pgTAP are complete; the two pages are behavior-spec +
existing patterns, verified in the pre-ship browser smoke (their only privileged
logic is the tested RPCs). Confirm the Next 16 dynamic-param/`useParams` convention
against the bundled docs during Task 3.

**Type/interface consistency:** `next_min_bid(uuid)→int`, `public_bid_history(uuid)→
table`, `place_bid(uuid,int)` all called with matching names; the UI reads only
public columns + `has_reserve`/`reserve_met` (never `reserve_cents`). Money in cents.

**Carry-forwards:** watchlist, "notify me", and richer filtering are Phase 2. Realtime
load at a popular lot's close is worth a look under real traffic. Plan 1/4 carry-forwards
still stand.
