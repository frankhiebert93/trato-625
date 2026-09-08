# Plan 7 — Cutover & Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. `- [ ]` checkboxes.

**Goal:** Make trato625 *be* the vehicle auction — the home page becomes the live
auction feed with real navigation, a terms/how-it-works page and auction metadata
ship, and every reference to the legacy yard-sale `listings` table is removed from the
code so the old table can be dropped safely at cutover.

**Architecture:** Pure front-end + metadata cutover. No new backend. `app/page.tsx`
becomes the auction home (reusing the `/subastas` feed). Legacy marketplace code
(the old home feed, the listings admin sections, the cron listings-cleanup block, and
the listings-only components) is removed so that `grep listings` over `app/`, `lib/`,
`components/` is clean — which makes dropping the `listings` table a safe, operator-run
cutover step (a ship gate, NOT an automatic migration here).

**Tech Stack:** Next.js 16 client pages + `layout.tsx` metadata. No DB migration
(dropping legacy tables is a documented manual step).

## Global Constraints

- **Modified Next.js:** read `node_modules/next/dist/docs/` for the metadata /
  `layout` conventions before editing; mirror existing patterns. (`AGENTS.md`.)
- **Do NOT auto-drop the `listings` table or any production data.** Removing that data
  is a deliberate operator step at cutover (ship gate). This plan only removes *code*
  that references it.
- **After this plan, `grep -rn "listings" app/ lib/ components/` finds no live
  `from('listings')` / storage `'listings'` usage** (comments/docs aside), so the app
  runs with the legacy table absent.
- **`next build` must succeed** and `tsc`/`lint` stay clean.
- Spanish UI. Preserve the auction features from Plans 1–6. Commit per task.

## Roadmap position

**Plan 7 of 7 — the final plan.** After it, the branch stack is the complete auction
platform. Production ship remains gated on: Stripe live keys, an SMS/WhatsApp provider,
and the operator's go-ahead to deploy + drop the legacy data.

## File Structure

- Modify: `app/page.tsx` — becomes the auction home + site nav.
- Modify: `app/layout.tsx` — auction title/description/metadata.
- Create: `app/terminos/page.tsx` — terms / how-it-works (Spanish, venue-only/as-is).
- Modify: `app/api/cron/route.ts` — remove the legacy listings-cleanup block.
- Modify/Remove: legacy marketplace code that queries `listings` (admin dashboard
  sections; `components/CameraCapture.tsx` / `components/ListingCard.tsx` if unused
  after; old home feed logic).

---

## Task 1: Auction home + site navigation

**Files:**
- Modify: `app/page.tsx`

> **Before writing:** read the current `app/page.tsx` (the legacy marketplace home) and
> `app/subastas/page.tsx` (the auction feed built in Plan 5). You are REPLACING the
> home's content with the auction feed + a simple nav. Reuse the feed's query/cards.

- [ ] **Step 1: Replace the home with the auction feed + nav**

Rewrite `app/page.tsx` (`'use client'`) to:
- Render the same live-auction feed as `/subastas` (reuse the exact query — live lots,
  safe columns only, never `reserve_cents` — cards linking to `/subastas/${id}`,
  countdown, reserve badges). It is fine to import a shared feed component or duplicate
  the feed markup; if you extract a shared component, put it in `components/` and have
  both `/` and `/subastas/page.tsx` use it.
- Add a simple top **nav** (Spanish): "Subastas" (home), "Vender" (`/vender`), and an
  auth-aware slot using `useUser()` — "Entrar" (`/entrar`) when signed out, else
  "Perfil" (`/perfil`); show "Admin" (`/admin/dashboard`) only when `profile?.role ===
  'admin'`. A footer link to "Términos" (`/terminos`).
- Remove ALL legacy marketplace logic from this file (the yard-sale listings query,
  PostForm/CameraCapture usage, categories/zones, raffle/ad code). None of it remains.
- Keep the safe-area / styling conventions the file already uses where sensible.

- [ ] **Step 2: Verify + commit**

`npx tsc --noEmit` and `npm run lint` clean (ignore `.vercel/output`). Confirm the file
no longer references `from('listings')` or the `'listings'` storage bucket. Then:
```bash
git add app/page.tsx components/
git commit -m "feat(cutover): home page becomes the live auction feed with site nav"
```

---

## Task 2: Terms / how-it-works page + auction metadata

**Files:**
- Create: `app/terminos/page.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Terms / how-it-works (`app/terminos/page.tsx`)**

A Spanish page (can be a server or client component — match the repo; a static page is
fine) covering: how the auction works (puja, reserva oculta, anti-francotirador,
cierre), and clear **"venue-only / as-is"** disclaimers — Trato 625 es solo el lugar
de la subasta; los vehículos se venden **como están**, sin garantía; el pago y la
entrega se acuerdan directamente entre comprador y vendedor; Trato 625 no es parte de
la transacción. Include a short privacy line and link back to home. (You may fold in or
link the existing `app/privacidad/page.tsx`.)

- [ ] **Step 2: Auction metadata (`app/layout.tsx`)**

Update the exported `metadata` (title, description, OpenGraph/Twitter) to describe the
vehicle auction in Spanish (e.g. title "Trato 625 — Subastas de vehículos",
description about bidding on cars/trucks). Keep the existing OG image wiring
(`app/opengraph-image.png`) — only change the text unless a new image is provided.
Verify against `node_modules/next/dist/docs/` that the metadata API shape is unchanged.

- [ ] **Step 3: Verify + commit**

`npx tsc --noEmit` and `npm run lint` clean. Then:
```bash
git add app/terminos/page.tsx app/layout.tsx
git commit -m "feat(cutover): terms/how-it-works page and auction site metadata"
```

---

## Task 3: Purge legacy `listings` code

**Files:**
- Modify: `app/api/cron/route.ts`
- Modify: `app/admin/dashboard/page.tsx`
- Remove/Modify: `components/CameraCapture.tsx`, `components/ListingCard.tsx`, and any
  other file that still queries `listings` after Tasks 1–2.

> **Goal:** no live code references the legacy `listings` table/bucket, so the operator
> can drop it at cutover with zero code impact. Do NOT drop the table here.

- [ ] **Step 1: Find every reference**

```bash
grep -rn "from('listings')\|from(\"listings\")\|storage.from('listings')\|\.from('listings')" app/ lib/ components/
grep -rn "listings" app/admin lib components | grep -vi "vehicle\|auction"
```

- [ ] **Step 2: Remove the cron listings-cleanup block**

In `app/api/cron/route.ts`, delete the legacy listings cleanup (the block Plan 6
demoted to best-effort). The cron now only closes auctions + dispatches notifications.

- [ ] **Step 3: Remove the marketplace sections from the admin dashboard**

In `app/admin/dashboard/page.tsx`, remove the legacy yard-sale sections that query
`listings` (and any ads/reports/events tied to the old marketplace) so the dashboard
shows ONLY the auction review queue, settings, ban control, and live-lot management
from Plan 4. Keep the Plan 2 role guard and all Plan 4 auction functionality intact.

- [ ] **Step 4: Remove now-unused legacy components/routes**

Delete `components/CameraCapture.tsx` and `components/ListingCard.tsx` (and any other
listings-only file) if nothing references them after Steps 1–3. If the seller form
(`app/vender/page.tsx`, Plan 3) reused `compressImage` from `lib/imageUtils.ts`, KEEP
`lib/imageUtils.ts` (it's shared). Remove the raffle/ad admin pages only if they query
`listings` and are part of the old marketplace.

- [ ] **Step 5: Verify no `listings` code remains + the app builds**

```bash
grep -rn "listings" app/ lib/ components/ | grep -vi "// \|docs\|comment" || echo "clean"
npx tsc --noEmit
npm run lint
npm run build
```
`grep` should find no live `from('listings')`/storage usage; `tsc`/`lint` clean;
**`npm run build` succeeds** (this is the key gate — it proves the whole app compiles
after the purge).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(cutover): remove legacy marketplace listings code (table now droppable)"
```

---

## Self-Review

**Spec coverage:** home is the auction feed + nav → Task 1; terms/how-it-works
(venue-only/as-is, Spanish) → Task 2; auction metadata/OG → Task 2; remove marketplace
`listings` code so the table can be dropped safely → Task 3 (verified by grep + a
successful `npm run build`). ✅

**Placeholder scan:** Tasks are behavior + exact greps/build gate; no DB migration
(dropping legacy data is a documented operator step, not automated). The metadata and
Next conventions are to be confirmed against the bundled docs.

**Type/interface consistency:** the home reuses the Plan 5 feed query (safe columns,
no `reserve_cents`); nav uses `useUser()`; no new backend contracts. `lib/imageUtils.ts`
is retained (shared with the seller form).

**Cutover checklist (operator, at ship — the ship gates):**
1. Set **Stripe live keys** + a webhook endpoint (`/api/stripe/webhook`) in Vercel/Stripe.
2. Configure an **SMS/WhatsApp provider** (Supabase phone auth + the notify adapter's
   `NOTIFY_PROVIDER_KEY`) and harden the per-item send loop (Plan 6 note).
3. **Apply all migrations** to the production Supabase project and promote the operator
   account to `role='admin'` (Plan 2 SQL).
4. **Deploy** to Vercel.
5. Only after verifying the auction works in production: **drop the legacy `listings`
   table** (and its storage bucket) — irreversible; take a backup first.
6. Address the recommended admin-UX follow-up (reserve is hidden from the admin UI too;
   add an admin-only service-role GET for full lot detail) before heavy use.
