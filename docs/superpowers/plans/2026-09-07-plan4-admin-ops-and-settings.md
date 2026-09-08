# Plan 4 — Admin Operations & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the admin a review queue that approves a listing (capture the fee,
publish the lot with a real end time) or rejects it (cancel the fee), plus an
app-settings editor and a ban control — all gated by `role = 'admin'`.

**Architecture:** Admin actions are **server routes** (Stripe secret + privileged DB
writes) gated by verifying the caller is an admin (`is_admin()` via their token),
then using the service role for DB writes and Stripe for capture/cancel — the same
privilege split as Plan 3's submit route. Approving publishes the lot to `live` and
**always sets `ends_at`** (closing Plan 1's carry-forward). The admin UI (client,
behind Plan 2's role guard) drives these routes.

**Tech Stack:** Next.js 16 route handlers (Node runtime), `stripe`, Supabase
service-role + `is_admin()`, client React, pgTAP not needed here (logic is in routes)
+ Vitest for the routes.

## Global Constraints

- **Modified Next.js:** read `node_modules/next/dist/docs/` before app code; mirror
  `app/api/cron/route.ts` (route handlers) and `app/admin/dashboard/page.tsx` /
  `app/perfil/page.tsx` (client). (`AGENTS.md`.)
- **Admin authority is server-verified:** every admin route checks `is_admin()` for
  the caller's token and returns 403 otherwise. Never trust a client role claim.
- **Stripe secret server-only.** Capture on approve (`paymentIntents.capture`),
  cancel on reject (`paymentIntents.cancel`). Guards must prevent double-capture.
- **Publishing always sets `ends_at`** (non-null) — `now() + duration`
  (admin-provided or `app_settings.default_duration_minutes`). This closes the Plan 1
  invariant that `place_bid` depends on.
- **A user can never change their own role/is_banned** (Plan 2) — the ban route runs
  as the service role after an admin check; it is the only ban path.
- Money in cents; listing fee MXN. Spanish UI. Client-side app + admin server routes.
- **Full existing suite stays green.** Commit after each task.

## Roadmap position

**Plan 4 of 7.** Consumes Plan 3's `pending_review` lots with an `authorized` fee.
Produces `live` lots for Plan 5 (public UI) and Plan 6 (close/settlement).

## File Structure

- Create: `lib/adminAuth.ts` — `requireAdmin(request)` helper (verify Bearer → is_admin).
- Create: `app/api/admin/listings/approve/route.ts` — capture + publish (+ optional overrides).
- Create: `app/api/admin/listings/reject/route.ts` — cancel + reject.
- Create: `app/api/admin/listings/cancel/route.ts` — cancel a live lot.
- Create: `app/api/admin/settings/route.ts` — update `app_settings`.
- Create: `app/api/admin/ban/route.ts` — set `profiles.is_banned`.
- Create: `tests/admin-listings.test.ts`, `tests/admin-settings-ban.test.ts` — Vitest (mocked Stripe).
- Modify: `app/admin/dashboard/page.tsx` — review queue + settings form + ban control.

---

## Task 1: Admin listing actions — approve / reject / cancel (server)

**Files:**
- Create: `lib/adminAuth.ts`
- Create: `app/api/admin/listings/approve/route.ts`, `.../reject/route.ts`, `.../cancel/route.ts`
- Create: `tests/admin-listings.test.ts`

**Interfaces:**
- Produces: `requireAdmin(request): Promise<{ ok: true, admin: SupabaseClient } | { ok: false, status: number }>`
  — builds a user client from the Bearer header, calls `rpc('is_admin')`; on true
  returns a service-role client, else `{ ok:false, status:401|403 }`.
- Produces the three POST routes.

- [ ] **Step 1: `lib/adminAuth.ts`**

```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function requireAdmin(
  request: Request,
): Promise<{ ok: true; admin: SupabaseClient } | { ok: false; status: number }> {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { ok: false, status: 401 };
  const userClient = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error } = await userClient.rpc('is_admin');
  if (error || !isAdmin) return { ok: false, status: 403 };
  return { ok: true, admin: createClient(URL, SERVICE, { auth: { persistSession: false } }) };
}
```

- [ ] **Step 2: approve route (`app/api/admin/listings/approve/route.ts`)**

Captures the fee and publishes with a real end time. Optional overrides let the admin
adjust the lot at approval. Guard against double-capture (only a `pending_review` +
`authorized` lot advances).

```ts
import { NextResponse } from 'next/server';
import { stripe } from '../../../../../lib/stripe';
import { requireAdmin } from '../../../../../lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });
  const admin = gate.admin;
  const body = await request.json();
  const vehicleId: string = body.vehicle_id;

  const { data: lot } = await admin.from('vehicles')
    .select('id, status, listing_fee_status, stripe_payment_intent_id')
    .eq('id', vehicleId).single();
  if (!lot) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (lot.status !== 'pending_review' || lot.listing_fee_status !== 'authorized') {
    return NextResponse.json({ error: 'NOT_APPROVABLE' }, { status: 409 });
  }

  // Capture the authorized listing fee.
  if (lot.stripe_payment_intent_id) {
    await stripe.paymentIntents.capture(lot.stripe_payment_intent_id);
  }

  // Duration → end time (always set ends_at).
  const { data: settings } = await admin.from('app_settings')
    .select('default_duration_minutes').eq('id', 1).single();
  const minutes: number = body.duration_minutes ?? settings!.default_duration_minutes;
  const now = new Date();
  const endsAt = new Date(now.getTime() + minutes * 60_000);

  // Optional admin overrides applied at publish.
  const patch: Record<string, unknown> = {
    listing_fee_status: 'captured',
    status: 'live',
    starts_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
    published_at: now.toISOString(),
  };
  if (typeof body.opening_bid_cents === 'number') patch.opening_bid_cents = body.opening_bid_cents;
  if ('reserve_cents' in body) patch.reserve_cents = body.reserve_cents; // may be null
  if ('min_increment_cents' in body) patch.min_increment_cents = body.min_increment_cents;

  const { error: updErr } = await admin.from('vehicles').update(patch)
    .eq('id', vehicleId).eq('status', 'pending_review'); // idempotent
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, ends_at: endsAt.toISOString() });
}
```

- [ ] **Step 3: reject route (`.../reject/route.ts`)**

```ts
import { NextResponse } from 'next/server';
import { stripe } from '../../../../../lib/stripe';
import { requireAdmin } from '../../../../../lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });
  const admin = gate.admin;
  const { vehicle_id } = await request.json();

  const { data: lot } = await admin.from('vehicles')
    .select('id, status, stripe_payment_intent_id').eq('id', vehicle_id).single();
  if (!lot) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (lot.status !== 'pending_review') {
    return NextResponse.json({ error: 'NOT_REJECTABLE' }, { status: 409 });
  }
  if (lot.stripe_payment_intent_id) {
    await stripe.paymentIntents.cancel(lot.stripe_payment_intent_id);
  }
  await admin.from('vehicles')
    .update({ listing_fee_status: 'released', status: 'cancelled' })
    .eq('id', vehicle_id).eq('status', 'pending_review');
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: cancel route (`.../cancel/route.ts`)**

Cancels a `live` (or `scheduled`) lot. MVP: no refunds/bidder notifications (note as
carry-forward). Only cancels a lot that hasn't ended.

```ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });
  const { vehicle_id } = await request.json();
  const { error } = await gate.admin.from('vehicles')
    .update({ status: 'cancelled' })
    .eq('id', vehicle_id).in('status', ['scheduled', 'live']);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Tests (`tests/admin-listings.test.ts`, mocked Stripe)**

```ts
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { adminClient, createTestUser } from './helpers/supabase';

const captureMock = vi.fn().mockResolvedValue({ id: 'pi_1', status: 'succeeded' });
const cancelMock = vi.fn().mockResolvedValue({ id: 'pi_1', status: 'canceled' });
vi.mock('../lib/stripe', () => ({
  stripe: { paymentIntents: { capture: captureMock, cancel: cancelMock } },
}));

const approve = (await import('../app/api/admin/listings/approve/route')).POST;
const reject = (await import('../app/api/admin/listings/reject/route')).POST;

async function makeAdmin() {
  const u = await createTestUser('+525577770001');
  await adminClient().from('profiles').update({ role: 'admin' }).eq('id', u.userId);
  return u;
}
async function seedPendingLot(sellerId: string) {
  const { data } = await adminClient().from('vehicles').insert({
    seller_id: sellerId, title: 'Lot', currency: 'MXN', opening_bid_cents: 1000000,
    status: 'pending_review', listing_fee_status: 'authorized', stripe_payment_intent_id: 'pi_1',
  }).select('id').single();
  return data!.id as string;
}

describe('admin listing actions', () => {
  let adminUser: Awaited<ReturnType<typeof createTestUser>>;
  let seller: Awaited<ReturnType<typeof createTestUser>>;
  beforeAll(async () => { adminUser = await makeAdmin(); seller = await createTestUser('+525577770002'); });

  it('approve captures the fee and publishes with an end time', async () => {
    const id = await seedPendingLot(seller.userId);
    const res = await approve(new Request('http://localhost/api/admin/listings/approve', {
      method: 'POST', headers: { authorization: `Bearer ${adminUser.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ vehicle_id: id, duration_minutes: 60 }),
    }));
    expect(res.status).toBe(200);
    expect(captureMock).toHaveBeenCalledWith('pi_1');
    const { data: lot } = await adminClient().from('vehicles')
      .select('status, listing_fee_status, ends_at').eq('id', id).single();
    expect(lot!.status).toBe('live');
    expect(lot!.listing_fee_status).toBe('captured');
    expect(lot!.ends_at).not.toBeNull();
  });

  it('rejects a non-admin caller', async () => {
    const id = await seedPendingLot(seller.userId);
    const res = await approve(new Request('http://localhost/api/admin/listings/approve', {
      method: 'POST', headers: { authorization: `Bearer ${seller.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ vehicle_id: id }),
    }));
    expect(res.status).toBe(403);
  });

  it('reject cancels the fee and cancels the lot', async () => {
    const id = await seedPendingLot(seller.userId);
    const res = await reject(new Request('http://localhost/api/admin/listings/reject', {
      method: 'POST', headers: { authorization: `Bearer ${adminUser.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ vehicle_id: id }),
    }));
    expect(res.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledWith('pi_1');
    const { data: lot } = await adminClient().from('vehicles')
      .select('status, listing_fee_status').eq('id', id).single();
    expect(lot!.status).toBe('cancelled');
    expect(lot!.listing_fee_status).toBe('released');
  });
});
```

- [ ] **Step 6: Run + commit**

```bash
npm test
```
Expect the new suite green plus existing. Then:
```bash
git add lib/adminAuth.ts app/api/admin/listings tests/admin-listings.test.ts
git commit -m "feat(admin): approve/reject/cancel routes (capture/cancel fee, publish with end time)"
```

---

## Task 2: Admin settings + ban routes (server)

**Files:**
- Create: `app/api/admin/settings/route.ts`, `app/api/admin/ban/route.ts`
- Create: `tests/admin-settings-ban.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 1).
- `POST /api/admin/settings` — body: any of `listing_fee_cents`, `increment_tiers`,
  `default_duration_minutes`, `antisnipe_window_seconds`, `antisnipe_extend_seconds`,
  `default_notify_channel`, `terms_text`; validates then updates `app_settings` (id=1).
- `POST /api/admin/ban` — body `{ profile_id, banned }`; sets `profiles.is_banned`.

- [ ] **Step 1: settings route**

Validate a whitelist of fields (reject unknown keys / bad types); update id=1.

```ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });
  const body = await request.json();
  const patch: Record<string, unknown> = {};
  if (typeof body.listing_fee_cents === 'number' && body.listing_fee_cents >= 0) patch.listing_fee_cents = body.listing_fee_cents;
  if (body.increment_tiers && typeof body.increment_tiers === 'object' && body.increment_tiers.MXN && body.increment_tiers.USD) patch.increment_tiers = body.increment_tiers;
  if (typeof body.default_duration_minutes === 'number' && body.default_duration_minutes > 0) patch.default_duration_minutes = body.default_duration_minutes;
  if (typeof body.antisnipe_window_seconds === 'number' && body.antisnipe_window_seconds >= 0) patch.antisnipe_window_seconds = body.antisnipe_window_seconds;
  if (typeof body.antisnipe_extend_seconds === 'number' && body.antisnipe_extend_seconds >= 0) patch.antisnipe_extend_seconds = body.antisnipe_extend_seconds;
  if (body.default_notify_channel === 'whatsapp' || body.default_notify_channel === 'sms') patch.default_notify_channel = body.default_notify_channel;
  if (typeof body.terms_text === 'string') patch.terms_text = body.terms_text;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'NO_VALID_FIELDS' }, { status: 400 });
  patch.updated_at = new Date().toISOString();
  const { error } = await gate.admin.from('app_settings').update(patch).eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, updated: Object.keys(patch) });
}
```

- [ ] **Step 2: ban route**

```ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });
  const { profile_id, banned } = await request.json();
  if (typeof profile_id !== 'string' || typeof banned !== 'boolean') {
    return NextResponse.json({ error: 'BAD_INPUT' }, { status: 400 });
  }
  const { error } = await gate.admin.from('profiles').update({ is_banned: banned }).eq('id', profile_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Tests (`tests/admin-settings-ban.test.ts`)** — reuse the `makeAdmin`
  pattern; verify: admin updates `listing_fee_cents` (persists); non-admin → 403;
  invalid body (no valid fields) → 400; ban sets `is_banned=true` on a target profile;
  a banned user's next `place_bid` raises `BANNED` (end-to-end tie-in). Run `npm test`.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/settings app/api/admin/ban tests/admin-settings-ban.test.ts
git commit -m "feat(admin): settings + ban routes (admin-gated, service-role writes)"
```

---

## Task 3: Admin UI — review queue, settings form, ban control

**Files:**
- Modify: `app/admin/dashboard/page.tsx`

> **Before writing:** read the current `app/admin/dashboard/page.tsx` (it already has
> the role guard from Plan 2 and fetches lists) and `app/perfil/page.tsx` (form
> patterns + lint rules). Reuse `useUser()` for the admin's token.

- [ ] **Step 1: Add a review queue to the dashboard**

Inside the admin-only content:
- Query `vehicles` where `status = 'pending_review'` (the admin RLS select policy
  allows it). For each, show title/specs/photos + the seller, editable fields
  (opening bid, reserve on/off + amount, optional min-increment override) pre-filled
  from the submission, and a **duration** input (default from settings). Two buttons:
  **Aprobar** → `POST /api/admin/listings/approve` with the token + `{vehicle_id,
  duration_minutes, opening_bid_cents?, reserve_cents?, min_increment_cents?}`;
  **Rechazar** → `POST /api/admin/listings/reject`. Refresh the queue on success.
- Show a small list of `live` lots with a **Cancelar** button → `.../cancel`.
- Get the token via `(await supabase.auth.getSession()).data.session?.access_token`.

- [ ] **Step 2: Add a settings form**

A form bound to the current `app_settings` (fetch id=1), with fields for listing fee
(pesos → cents), default duration, anti-snipe window/extend, default notify channel,
and terms text. Save → `POST /api/admin/settings`. Show a saved/error indicator.
(Increment-tier editing can be a raw JSON textarea for MVP — validate it parses to
`{MXN:[...],USD:[...]}` before sending.)

- [ ] **Step 3: Add a minimal ban control**

An input for a profile id + a Ban/Unban toggle → `POST /api/admin/ban`. (A richer
user browser is a later polish.)

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit
npm run lint
```
Clean (no new errors) on `app/admin/dashboard/page.tsx` (ignore `.vercel/output`
noise). Browser smoke is done in the pre-ship pass. Then:
```bash
git add app/admin/dashboard/page.tsx
git commit -m "feat(admin): review queue, settings form, and ban control in the dashboard"
```

---

## Self-Review

**Spec coverage:** review queue approve/reject → Task 1 + Task 3; capture on approve /
cancel on reject → Task 1 (mocked-Stripe tested); publish always sets `ends_at`
(closes Plan 1 carry-forward) → Task 1 approve; per-lot overrides + timing → approve
params + Task 3 UI; settings editor → Task 2 + Task 3; ban path (admin-only, closes
Plan 2 note) → Task 2 + Task 3; cancel live lot → Task 1. ✅

**Placeholder scan:** routes + tests are complete; the UI is behavior-spec + existing
patterns (verified in the pre-ship browser smoke), since the privileged logic is
route-tested. `stripe.paymentIntents.capture/cancel` and the Stripe apiVersion should
match the installed SDK (already pinned in Plan 3's `lib/stripe.ts`).

**Type/interface consistency:** `requireAdmin` returns `{ok, admin}` used by all five
routes; approve/reject/cancel/ban/settings bodies match what the Task 3 UI sends;
`is_admin()` (Plan 1) is the single admin check. Money in cents; publish sets `ends_at`.

**Carry-forwards / notes:**
- Cancelling a `live` lot with existing bids does not refund the fee or notify bidders
  (out of MVP scope) — note for later.
- Manual-capture authorizations expire (~7 days); the queue should be worked promptly.
- Refunds and a richer user-management UI are later polish.
- Plan 3's route-hardening minors (guard missing app_settings, check PI-id write) can
  be folded in when touching those routes.
