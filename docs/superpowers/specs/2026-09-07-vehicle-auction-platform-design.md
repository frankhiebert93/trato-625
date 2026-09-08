# trato625 → Vehicle Auction Platform — Design Brief

**Date:** 2026-09-07
**Status:** Design / brainstorm (no code yet)
**Author:** Frank + Claude

---

## 1. Summary

Retire the existing trato625 yard-sale marketplace and rebuild the same domain
(trato625.com) as an **admin-curated, timed vehicle auction** tied to a WhatsApp
community.

- **Sellers** submit a vehicle, pay **one flat listing fee** (Stripe), and — after
  admin review — their car goes to auction.
- **Buyers** verify their phone and place bids on the live site (timed auction,
  per-lot reserve, anti-snipe).
- **At close**, the high bidder wins if the hidden reserve is met; the platform
  then **connects winner and seller directly** and they settle the car
  themselves.
- The platform **never touches the sale money**. Its only revenue is the flat
  listing fee, collected up front — win or lose.

**Positioning / seller pitch:** *One flat fee to list. No commission. Keep 100%
of your sale.*

---

## 2. Business model

| Item | Decision |
|---|---|
| Listing fee | Flat, per vehicle, paid online at submission. Admin-configurable amount (MXN). |
| Success fee / commission | **None.** Deliberately dropped — simpler, and a marketing hook. |
| Payment processor | **Stripe** (already in use). |
| Fee timing | Authorize at submission; **capture on approval**. A rejected listing is never charged, so no manual refunds. |
| Who settles the car | Buyer and seller, **directly and off-platform**. Platform is only the venue. |

Because no revenue is tied to the sale completing, the platform does not need to
know whether or when a car actually changes hands — this removes the
"disintermediation" risk entirely (nobody can dodge a fee that was already paid
to list).

---

## 3. Roles

- **Admin (Frank):** reviews and publishes submissions, sets/adjusts auction
  parameters, monitors live auctions, can cancel/close, manages a bidder/seller
  ban list.
- **Seller:** phone-verified. Submits a vehicle, pays the listing fee, provides
  their WhatsApp for the eventual winner. Receives the winner's contact when the
  car sells.
- **Bidder:** phone-verified. Places bids. Gets notified when outbid / when they
  win. A single person can be both a seller and a bidder.

---

## 4. Core flows

### 4.1 Seller submission → publish
1. Seller signs in (phone + one-time code).
2. Fills the submit form: make, model, year, mileage, condition, VIN (optional),
   description, location/zone, photos, **opening bid**, **hidden reserve**,
   auction duration/preferred end time, WhatsApp contact.
3. Pays the flat listing fee via Stripe (**authorized**, not yet captured).
4. Listing enters **pending review**.
5. Admin reviews. On **approve** → fee is **captured**, listing is scheduled/goes
   live. On **reject** → authorization released (never charged), seller notified.

### 4.2 Bidding
1. Buyer browses the auction home feed; opens a vehicle.
2. To bid, verifies phone (one-time code) if not already.
3. Places a bid ≥ current price + increment (or ≥ opening bid if first).
4. Server validates and applies the bid atomically; price, leader, bid count, and
   countdown update in real time for everyone watching.
5. Outbid bidders get a 1:1 notification.

### 4.3 Close & connect
1. When the clock reaches zero (with any anti-snipe extensions applied), the lot
   closes automatically.
2. **Did it sell?**
   - **No-reserve (absolute) lot:** any bid wins → **sold**.
   - **Reserve lot:** **sold** only if the highest bid ≥ the hidden reserve;
     otherwise **unsold**.
3. On **sold** → winner recorded; winner and seller notified and each given the
   other's contact (winner sees seller's WhatsApp; seller sees winner's number).
   On **unsold** (reserve not met, or no bids) → seller notified, no exchange.
4. Buyer and seller arrange payment and pickup themselves.

---

## 5. Auction mechanics

- **Currency — per-lot:** each vehicle runs in **USD or MXN**; all of its bids,
  opening bid, reserve, and increments are in that currency. The **listing fee is
  always MXN** regardless of the lot's currency.
- **Opening bid:** public, set low to attract a crowd.
- **Reserve — per-lot choice:** each vehicle is either **no-reserve (absolute)** —
  guaranteed to sell to the highest bidder (Purple-Wave style) — or carries a
  **hidden reserve** (the seller's real minimum, never shown). Bidders see a badge:
  **"No reserve"** on absolute lots, or **"Reserve not met → Reserve met"** on
  reserve lots.
- **Bid increments:** a **global tiered-by-price default** with an **optional
  per-vehicle override**. Proposed default tiers (MXN — final values TBD):
  - < $50,000 → +$500
  - $50,000–$150,000 → +$1,000
  - $150,000–$300,000 → +$2,500
  - > $300,000 → +$5,000
- **Anti-snipe:** a bid within the final 2 minutes extends the end time by
  2 minutes (both configurable). Applied atomically with the bid.
- **Concurrency:** all bid validation/application happens server-side in a single
  locked transaction (see §7). The browser is never trusted for price or time.
- **Timing authority:** the countdown is derived from a server-held `ends_at`;
  clients render from server time, not local clocks.

---

## 6. Identity & auth

- **Supabase Phone OTP** for both bidders and sellers (built-in). One verified
  phone = one identity, and the number doubles as the WhatsApp contact.
- **Admin** is a flagged role on the profile.
- **Notification preference:** each profile stores a preferred channel (WhatsApp
  or SMS) for transactional alerts (§10).
- **Ban list:** admin can block a phone/profile from bidding or submitting.

---

## 7. The bidding engine (technical heart)

This is where correctness matters most — two people bidding the same instant on a
high-value vehicle at the buzzer.

- A single **`place_bid` database function (RPC)** does everything in one
  transaction:
  1. Auth + not-banned check.
  2. Lot is **live** and not past `ends_at`.
  3. Amount ≥ required next bid (current + increment, or opening bid if first).
  4. `SELECT ... FOR UPDATE` on the lot row to **serialize** concurrent bids.
  5. Insert an **append-only** bid record (audit trail / dispute source of truth).
  6. Update denormalized `current_bid`, `current_leader`, `bid_count`.
  7. If within the anti-snipe window, **extend `ends_at`**.
  8. Return the new authoritative state.
- **Realtime:** clients subscribe (Supabase Realtime) to the lot; price, leader,
  bid count, and `ends_at` push to all watchers instantly.
- **Auto-close:** the existing **cron route** (`app/api/cron/route.ts`) is
  extended to sweep lots past `ends_at`, mark sold/unsold against the reserve,
  and fire close notifications.

---

## 8. Data model (conceptual)

- **profiles** — `id`, `phone` (verified), `display_name`, `role`
  (bidder/seller/admin), `notify_channel` (whatsapp / sms), `is_banned`,
  `created_at`.
- **vehicles (lots)** — `id`, `seller_id`, spec fields (make, model, year,
  mileage_km, condition, vin?, description, location), `photos[]`,
  `currency` (USD / MXN), `opening_bid`, `reserve_price` (hidden; **null = no-reserve/absolute**),
  `min_increment` (**null = use global default**), `current_bid`,
  `current_leader_id`, `bid_count`, `status` (draft / pending_review / scheduled /
  live / sold / unsold / cancelled), `starts_at`, `ends_at` (mutable via
  anti-snipe), `listing_fee_status` (authorized / captured / released),
  `stripe_payment_intent_id`, `published_at`.
- **app_settings** — global config edited from the admin settings page (§11.1):
  listing fee amount (**always MXN**); **per-currency** bid-increment tiers (MXN +
  USD, thresholds + amounts); default auction duration and scheduling defaults;
  anti-snipe window + extension length; default notification channel; template/terms
  text. Admin-editable.
- **bids** — `id`, `vehicle_id`, `bidder_id`, `amount`, `created_at`.
  Append-only; indexed on `(vehicle_id, amount desc)`.
- **notifications** (log, optional) — record of outbid/won/sold messages sent.
- **watches** (Phase 2) — `user_id`, `vehicle_id` for "notify me" without bidding.

**RLS:** bidders can read public lot fields and their own bids; `reserve_price`
is never exposed to non-admins; writes go only through the `place_bid` RPC and
admin policies.

---

## 9. Payments (Stripe)

- One fixed charge per submission (the listing fee). No card-on-file, no escrow,
  no refund-on-sale logic.
- **Authorize at submit → capture on approve → release on reject.**
- A Stripe **webhook** confirms capture before a listing is treated as paid.
- Admin can configure the fee amount.

---

## 10. Notifications (SMS + WhatsApp, user's choice)

**1:1 transactional notifications** — "you've been outbid", "you won", "your
vehicle sold", "reserve not met", "auction ending soon".

- **Two channels, user picks:** each person sets a preferred channel — **WhatsApp**
  or **SMS** — on their profile (default WhatsApp, since it's a WhatsApp-group
  community; fall back to SMS if a WhatsApp send fails).
  - **SMS** via the OTP provider (e.g. Twilio) — simple, reliable, works day one.
  - **WhatsApp** via the **Business Cloud API** with pre-approved message templates
    (recipients opted in by giving their number). *Setup dependency: a Meta
    Business account, a WhatsApp Business number, and template approval — the
    heaviest external setup item. Ship SMS first; light up WhatsApp as templates
    clear.*
- **Group / Channel "hype" posts** ("auction starting", "ending soon", "SOLD!"):
  WhatsApp has **no** clean server-side API to auto-post into a normal group or a
  Channel, so these stay **one-tap manual** — the site generates a ready-to-send
  message and the admin/mod posts it (reusing `nativeShare` / `wa.me`).

---

## 11. Screens

1. **Auction home** — live grid of vehicles: photo, title, current bid, countdown,
   bid count, reserve badge.
2. **Vehicle detail** — gallery, full specs, current price + reserve/no-reserve
   badge, live countdown, bid box, live bid history, "notify me".
3. **Bid flow** — phone verification (first time) → one-tap bidding thereafter.
4. **Sell / submit** — vehicle form + photo upload + Stripe listing-fee payment.
5. **Admin — operations** — review queue (approve/reject), lot editor (opening bid,
   reserve on/off + amount, per-lot increment override, timing), live monitor,
   close/cancel, winner + contact readout, ban list.
6. **Admin — settings** — see §11.1.
7. **Terms / how it works** — extends the existing `privacidad` page with
   "as-is / no warranty / platform is only a venue" language.

### 11.1 Admin settings page

A single settings screen where you control the auction's global knobs (stored in
`app_settings`, applied as defaults; most are overridable per-lot):

- **Listing fee** — amount + currency (MXN).
- **Bid-increment tiers** — editable table of price threshold → increment amount
  (add/remove rows). Global default; any lot can override.
- **Auction timing** — default auction duration; optional scheduling defaults
  (e.g. a standard end day/time); lead time before a lot goes live.
- **Anti-snipe** — trigger window (a bid within the last N minutes) + extension
  length.
- **Notifications** — default channel (WhatsApp/SMS) and message-template text.
- **Terms text** — the as-is / venue-only copy shown to users.

Changes take effect for new/live lots without a redeploy.

---

## 12. Reuse vs. build-new

**Reuse (large head start):**
- Stack: Next.js 16, React 19, Tailwind, Vercel, Sentry, analytics.
- `lib/supabase.ts`; Supabase **Realtime** + **Phone OTP** (both built in).
- Photo pipeline: `CameraCapture`, `imageUtils`, `browser-image-compression`.
- `lib/native.ts` (share, haptics), `lib/i18n.ts` (Spanish strings — extend).
- **`app/api/cron/route.ts`** → extended to auto-close auctions.
- Admin pattern under `app/admin/*`; `components/ListingCard.tsx` → `VehicleCard`.
- Capacitor iOS/Android wrappers → stays an installable app.
- Stripe (already integrated).

**Build new:**
- Phone-OTP gate before bidding/submitting.
- Vehicle lot model + auction lifecycle.
- `place_bid` RPC + RLS + realtime wiring (the engine).
- Vehicle detail + bidding UI; seller submit + Stripe listing fee.
- Close/settlement logic + winner↔seller contact exchange.
- Transactional notification sender — **SMS + WhatsApp, per-user choice**.
- **Admin settings page** driving `app_settings` (fee, tiers, timing, anti-snipe,
  notifications, terms).

---

## 13. Risks & mitigations

1. **Bid correctness under load** → atomic `place_bid` RPC with row locking;
   append-only bid log.
2. **Server time authority** → countdown and anti-snipe driven by server `ends_at`.
3. **OTP/SMS cost & deliverability (Mexico)** → pick a provider with good MX
   coverage; consider WhatsApp OTP later.
4. **WhatsApp Cloud API setup** → WhatsApp notifications need a Meta Business
   account, a WhatsApp Business number, and approved templates — the heaviest
   external dependency. SMS works day one, so ship SMS first and enable WhatsApp as
   templates clear. Group/channel auto-posting stays manual (§10).
5. **Ghost winners** (settlement is off-platform) → verified phones + ban list;
   lower stakes now that no fee rides on the sale, but reputation still matters.
6. **Fraudulent / stolen-car listings** → admin review is the gate; VIN capture;
   clear terms.
7. **Stripe webhook reliability** → confirm capture via webhook before treating a
   listing as paid/published.
8. **Load spike at close** → Realtime handles fan-out; load-test the final-minute
   surge.
9. **Legal** → "as-is / venue-only / no warranty" terms; platform is not a party
   to the sale.

---

## Purple Wave parity (reference)

We mimic Purple Wave's **bidder experience**, not its **auction-house business**.

- **Mimic (experience/mechanics):** timed auction events with staggered lot
  closings; soft-close anti-snipe; tiered increments; proxy/max autobid (Phase 2);
  rich lot pages (many photos, video, condition notes, VIN, mileage/hours, title
  status, pickup location); watchlist + "closing soon" (Phase 2); email/SMS alerts;
  bidder registration; vehicles-only categories.
- **Differ by design:** Purple Wave is all no-reserve with a ~10% buyer's premium
  and sits in the money flow (collects payment, remits to sellers, handles title &
  logistics). We use a flat listing fee, no commission, **per-lot** reserve choice,
  and never touch the sale money.
- **Out of scope (their staff/cost structure, not software):** payment
  collection/escrow/remittance, title & DMV paperwork, shipping/logistics, physical
  inspections, yard storage.

## 14. Phasing

- **Phase 0** — remove marketplace code, keep infrastructure.
- **Phase 1 (MVP)** — seller submit + Stripe listing fee + admin review; phone-OTP
  bidders; server-authoritative timed bids with **per-lot reserve (no-reserve or
  hidden)** + tiered increments (global default + per-lot override) + anti-snipe;
  live price/timer; cron auto-close; winner↔seller connect; **admin settings page**;
  1:1 outbid/won/sold notifications by **SMS + WhatsApp (user's choice)**; one-tap
  WhatsApp share. *(SMS ships first; WhatsApp switches on once templates clear.)*
- **Phase 2** — proxy/max auto-bidding, watchlists, bidder reputation, visible bid
  history polish, WhatsApp Cloud API templates, channel automation if feasible.
- **Phase 3** — refundable bidder deposits, ratings, multi-admin, analytics.

---

## 15. Non-goals (Phase 1, YAGNI)

- No success fee / commission, no on-platform payment for the vehicle, no escrow.
- No proxy bidding, no deposits, no ratings.
- No automated WhatsApp group/channel posting.
- No multi-currency (MXN only).

---

## 16. Open decisions

- **Now controlled from the admin settings page (§11.1), not hard-coded:** listing
  fee amount, bid-increment tiers, auction timing, anti-snipe window/extension,
  default notification channel. Only their *initial* values need picking.
- OTP + SMS provider (e.g. Twilio) and the WhatsApp Business Cloud API setup (Meta
  Business account, WhatsApp Business number, template approval).
- Refund/authorization edge cases (e.g. seller cancels before review).
- Whether sellers may bid on their own lots (recommended: no).
