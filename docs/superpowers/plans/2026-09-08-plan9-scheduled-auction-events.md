# Plan 9 — Scheduled Auction Events (timed "sales" with staggered lot closings)

> **Status:** Design / plan — no code yet. Confirm the "Open decisions" before implementing Phase A.
> **For agentic workers:** implement phase-by-phase; each phase ends green (typecheck + build) and is its own PR off `master`.

**Goal:** Replace the always-on, per-vehicle continuous auction with **admin-scheduled auction events**. Sellers submit vehicles into the currently-open **intake** event; when that event fills (capacity) or its intake cutoff passes, intake rotates to the next admin-preset event. Each event has a published **date**; before it, buyers browse the lots and arrange **viewings** directly (seller contact and/or the physical lot). At the event's start time, **bidding opens** and lots **close one-by-one in a running order** (staggered), each with anti-snipe, until the sale is done.

**Architecture:** Additive to the existing engine. The bidding core (`place_bid`) and the close sweep (`close_due_auctions`) are already **per-vehicle on `ends_at`** — so staggered closings are produced simply by stamping each lot's `ends_at = event.starts_at + lot_number × gap` when the event goes live; the existing per-lot sweep then closes them in order. New work is the **event model**, **intake routing**, **scheduling/go-live**, **preview + viewing surfacing**, and a **frequent cron**. All reads stay client-side via `lib/supabase.ts`; DB (RLS + `SECURITY DEFINER` RPCs) stays the security boundary; `reserve_cents` stays hidden.

**Tech stack (unchanged):** Next.js 16 App Router (client components), Supabase Postgres (RLS + PL/pgSQL), Stripe, Capacitor, Tailwind v4, pgTAP, Vitest.

---

## Global constraints

- **Modified Next.js — read `node_modules/next/dist/docs/` before app code**; mirror existing client-component patterns.
- Reads client-side; **writes via `apply_migration`** on the hosted DB (`execute_sql` is read-only); DB is the security boundary; **never expose `reserve_cents`**.
- **Spanish UI**; match the auction design system (cream/ink/terracotta, `font-display`, `shadow-hard`, `press`, `VehicleCard`, `BackButton`).
- Full existing test suite stays green; new pgTAP files are additive.
- Commit per task; each phase is its own PR off `master`.

---

## Current engine (grounding — reuse, don't rebuild)

- `place_bid(vehicle_id, amount_cents)` — gates on `vehicles.status='live'` + `now < ends_at`; row-locks; anti-snipe extends `ends_at`; enqueues `outbid`. **No change needed for staggered closes** beyond ensuring each lot's `status='live'` + `ends_at` are set at go-live.
- `close_due_auctions()` — sweeps `status='live' and ends_at <= now()` → `sold`/`unsold` (+ `won`/`sold`/`unsold` notifications). **Per-lot, so staggered closes already work** — provided the cron runs often enough.
- `create_draft_listing(...)` → `vehicles(status='draft', listing_fee_status='unpaid')`; `/api/listings/submit` then authorizes the Stripe listing fee → `pending_review`; admin approve → `scheduled`/`live`.
- **Cron** (`app/api/cron/route.ts`, `CRON_SECRET`-guarded) closes lots + dispatches notifications. **Scheduled daily (`0 3 * * *`) — must become frequent (≈ every minute) for timed closes and anti-snipe.** This is a hard requirement (see Phase E / Open decisions).
- `vehicles.status` enum today: `draft, pending_review, scheduled, live, sold, unsold, cancelled` — reused as-is (meanings refined below).

---

## Data model

### New table: `auction_events`
```
id                 uuid pk
name               text not null                 -- "Subasta — Sábado 24 Ene"
status             text not null default 'upcoming'
                     check (status in ('upcoming','intake','scheduled','live','closed','cancelled'))
capacity           int  not null check (capacity > 0)   -- target vehicle count that closes intake
intake_opens_at    timestamptz                    -- when this becomes the intake event (admin preset)
intake_cutoff_at   timestamptz                    -- intake closes at the earlier of: capacity reached OR this
starts_at          timestamptz not null           -- bidding opens (event date/time)
lot_close_gap_seconds int not null default 120    -- stagger between consecutive lot closings
viewing_location   text                           -- the physical lot address / info (optional)
viewing_notes      text                           -- e.g. "Contacta al vendedor para verlo" (optional)
created_at         timestamptz not null default now()
published_at       timestamptz                    -- when the date went public (intake→scheduled)
```
**Status lifecycle:** `upcoming` → `intake` (the single active submission window) → `scheduled` (intake closed, date public, **preview + viewings**) → `live` (bidding, staggered closes) → `closed`; `cancelled` from any pre-live state. **Invariant: at most one event in `intake` at a time.**

### `vehicles` additions
```
event_id     uuid references public.auction_events(id)   -- the event this lot belongs to
lot_number   int                                         -- running order within the event (1..n); drives close time
```
`starts_at` / `ends_at` become **derived at go-live**: for each approved lot, `ends_at = event.starts_at + lot_number × gap`, `starts_at = event.starts_at`. Reserve, opening bid, increment, currency, photos, seller — unchanged.

### `app_settings` addition (optional)
`default_lot_close_gap_seconds int not null default 120` — default gap seeded into new events (per-event override lives on `auction_events`).

---

## Lifecycle & who triggers each transition

| Transition | Trigger | What happens |
|---|---|---|
| create event | **admin** | Row in `auction_events` (`upcoming`), with capacity, dates, gap, viewing location. |
| `upcoming → intake` | cron/admin at `intake_opens_at` | Becomes the active intake window (only one at a time). New submissions attach here. |
| seller submits | seller | `create_draft_listing` sets `event_id` = current intake event; pays fee → `pending_review`. |
| admin approves lot | admin | Lot `status='scheduled'`, assigned a `lot_number` (auto-next or admin-set). Fee captured. |
| `intake → scheduled` | cron/admin when **approved-lot count ≥ capacity** OR `now ≥ intake_cutoff_at` | Intake closes; `published_at` set; the next `upcoming` event (by `intake_opens_at`) flips to `intake`. Date is now public; **preview + viewings** begin. |
| `scheduled → live` | cron/admin at `starts_at` | Every approved lot → `status='live'`, `ends_at = starts_at + lot_number×gap`. Bidding opens. |
| lot closes | cron (`close_due_auctions`) | Each lot closes at its staggered `ends_at` → `sold`/`unsold` (+ notifications). |
| `live → closed` | cron when no `live` lots remain in the event | Event marked `closed`. |

---

## Viewings (per your model — no booking system)

During `scheduled` (preview), each lot's detail page shows **how to view it**, drawn from:
- the **event's `viewing_location`** (your physical lot where cars can be brought), and/or
- a **direct-contact affordance** so the buyer can reach the seller to arrange a look.

Direct seller contact pre-sale is a change from today (contact is revealed only to the winner/seller of a **sold** lot via `get_settlement_contact`). Because the platform takes a flat listing fee and never touches the sale, disintermediation isn't a revenue risk — but exposing a phone publicly is a privacy choice. **Proposed:** a per-lot `viewing_contact_opt_in boolean` (seller chooses at submit); when on, the preview shows a "Contactar para ver" WhatsApp affordance via a `SECURITY DEFINER` `get_viewing_contact(vehicle_id)` RPC (only returns while the lot's event is `scheduled`), else the page just shows the event's lot location. (See Open decisions #1.)

---

## Screens

- **Home → events list** (replaces the flat live feed): cards per event — name, date, status badge (*Recibiendo autos / Programada / En vivo / Finalizada*), lot count, "ver lotes". Sorted upcoming/live first.
- **Event detail** (`/subastas/evento/[id]`): header (date, status, viewing location, countdown — to go-live when `scheduled`, else "en vivo"); the running order **grid of lots** (reuse `VehicleCard`), each showing its own close time / status when live.
- **Vehicle (lot) detail** (existing `/subastas/[id]`, extended): **preview** state (event `scheduled`) shows specs + viewing info + "la subasta abre el …"; **live** shows the bid box + countdown to *this lot's* close; **closed** shows result / settlement reveal (unchanged).
- **Sell / submit** (`/vender`): shows which event you're submitting into and its date ("Este auto entra a la subasta del …; el registro cierra en … o al llenarse"); the `viewing_contact_opt_in` toggle.
- **Admin — events**: create/list events (capacity, intake window, date, gap, viewing location), see the review queue per event, assign/reorder `lot_number`, publish/advance status, live monitor. Extends the existing `/admin/dashboard`.

---

## New / changed DB functions (Phase A)

- `current_intake_event()` → the single `intake` event (or null). `SECURITY DEFINER`, readable by anon/authenticated (public: name + date + capacity + count).
- `create_draft_listing(...)` → **+ set `event_id` = current intake event** (raise `NO_OPEN_INTAKE` if none). Signature grows by nothing else.
- `open_next_intake()` — flips the earliest `upcoming` event to `intake` when there's none active; called by cron.
- `close_intake_if_full(event_id)` / a sweep `close_full_or_expired_intakes()` — intake→scheduled on capacity/cutoff; then `open_next_intake()`.
- `go_live_due_events()` — for each `scheduled` event with `now ≥ starts_at`: stamp its approved lots `live` + `ends_at` from `lot_number`; event → `live`.
- `close_finished_events()` — event → `closed` once it has no `live` lots left (run after `close_due_auctions`).
- `get_viewing_contact(vehicle_id)` — (Open decision #1) seller contact during preview, opt-in only.
- `place_bid` — **unchanged** (per-lot gating already correct). Optional hardening: also assert the lot's event is `live`.

**RLS:** `auction_events` readable by anon/authenticated for non-`upcoming` rows (public sees intake/scheduled/live/closed); admin sees all and writes (via service role / admin API, mirroring listings). `vehicles` policies unchanged (public sees `scheduled/live/sold/unsold`; that now includes preview lots).

---

## Phasing (each phase = one PR)

- **Phase A — DB foundation:** `auction_events` + `vehicles.event_id/lot_number` + RLS + the functions above + pgTAP (intake rotation, go-live stamping w/ staggered `ends_at`, capacity/cutoff close, event close). No UI yet.
- **Phase B — Cron & automation:** extend `app/api/cron/route.ts` to call `open_next_intake` → `close_full_or_expired_intakes` → `go_live_due_events` → `close_due_auctions` → `close_finished_events` → dispatch notifications; **raise cron frequency** (Open decision #3). Add `scheduled`/`live` event notifications if desired.
- **Phase C — Seller submit:** route submissions into the intake event; show event/date context + `viewing_contact_opt_in`; `NO_OPEN_INTAKE` handling.
- **Phase D — Admin events UI:** event CRUD, capacity/date/gap/location, lot_number assignment/reorder, publish/advance, per-event monitor.
- **Phase E — Public UI:** events list (home), event detail (lot grid), lot detail preview/live/closed states + viewing info.

Recommended build order: A → B → D → C → E (engine + automation + the admin controls to drive it, then the seller and public surfaces).

---

## Cutover

The `vehicles` table has ~no real rows and there are no live events, so this is low-risk: add the event model, keep `place_bid`/`close_due_auctions`. The current "continuous live feed" home is replaced by the events list in Phase E; until then the existing pages keep working (a lot with `event_id = null` simply isn't part of any event).

---

## Open decisions (confirm before Phase A)

1. **Pre-sale viewing contact.** Show the seller's WhatsApp during preview (opt-in per lot), or show only your physical **lot location** and keep seller contact private until sale? (Affects `get_viewing_contact` + submit toggle.)
2. **"One upload per window" meaning.** Is it purely the **time-boxed intake window** (all submissions in the window go to that event — my reading), or also a **per-seller cap** (e.g. one vehicle per event)? Any max lots per seller?
3. **Cron frequency / infra.** Timed closings + anti-snipe need the cron ≈ every minute. Vercel Hobby crons run at most **daily**; per-minute needs **Vercel Pro** (or an external pinger like a 3rd-party scheduler hitting `/api/cron`). Which route? (This gates Phase B being actually functional in production.)
4. **Unfilled event at its date.** If an event doesn't reach capacity by `starts_at`, does it still go live with the lots it has, slip to a new date, or merge into the next event?
5. **Lot ordering.** Auto by submission/approval order, or fully admin-arranged? Any grouping (e.g. by make)?
6. **Currency.** Keep per-lot USD/MXN as today, or force one currency per event?
7. **Reserve at close** stays as-is (unsold if reserve unmet) — confirm no change.

---

## Self-review

Covers your model: multiple admin-dated events (§Data model, Lifecycle), fill-to-capacity-or-cutoff intake rotation (`open_next_intake`/`close_full_or_expired_intakes`), published date + preview + direct/lot viewing (§Viewings, Screens), go-live opening bidding, **staggered lot closings** (derived `ends_at`, reusing the per-lot sweep), and "uploads go to one auction for a window then the next" (single-`intake` invariant). Reuses `place_bid`, `close_due_auctions`, `VehicleCard`, `BackButton`, the admin/API patterns, and the Stripe listing-fee flow unchanged. Biggest external dependency called out: **cron frequency** (#3).
