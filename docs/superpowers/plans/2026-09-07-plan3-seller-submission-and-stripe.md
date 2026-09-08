# Plan 3 — Seller Submission & Stripe Listing Fee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in seller submit a vehicle with photos and pay one flat MXN
listing fee online (Stripe, authorized now / captured on approval), landing the lot
in `pending_review` for the admin.

**Architecture:** Submission is server-authoritative like the rest of the platform.
A `create_draft_listing` RPC (SECURITY DEFINER) is the only way to create a lot — it
forces `seller_id = auth.uid()`, `status = 'draft'`, `listing_fee_status = 'unpaid'`.
Photos upload client-side to a public Storage bucket (reusing the existing
compress→upload pipeline). The listing fee runs through **server route handlers**
(the first server code in the app; Stripe's secret key never touches the client): a
submit route creates the draft (as the user) + a Stripe **Checkout Session with
manual capture** (authorize the fee, don't capture yet) and stores the PaymentIntent
id; a webhook route flips the lot to `authorized` / `pending_review` once Stripe
confirms the authorization. Capture-on-approve and cancel-on-reject are **Plan 4**.

**Tech Stack:** Next.js 16.2 route handlers (Node runtime), `stripe` server SDK,
Supabase Postgres (RPC) + Storage, the existing `browser-image-compression`
pipeline, client React for the form, pgTAP + Vitest. Money is integer cents; the
listing fee is **MXN**.

## Global Constraints

_Every task's requirements implicitly include this section._

- **Modified Next.js — verify APIs before writing app code:** _"This is NOT the
  Next.js you know … Read the relevant guide in `node_modules/next/dist/docs/`
  before writing any code. Heed deprecation notices."_ (`AGENTS.md`). For the route
  handlers, mirror the existing `app/api/cron/route.ts` (it shows this repo's exact
  handler convention: `export async function GET(request: Request)`, `NextResponse`
  from `next/server`, a service-role Supabase client). For the form page, mirror
  `app/admin/page.tsx` / `app/perfil/page.tsx` client patterns.
- **Stripe secret key is SERVER-ONLY.** Never import it into a client component,
  never commit it. Dev uses **Stripe test-mode** keys in server env. The listing-fee
  PaymentIntent uses `capture_method: 'manual'` — authorize on submit, capture on
  admin approve (Plan 4), cancel on reject (Plan 4).
- **Money is integer cents; the listing fee is MXN** (`app_settings.listing_fee_cents`
  / `listing_fee_currency`). Stripe amount = that value, currency `'mxn'`.
- **All vehicle writes go through the RPC or the service role.** `anon`/`authenticated`
  have no direct insert/update on `vehicles` (Plan 1). The seller cannot set
  `status`, `listing_fee_status`, `seller_id`, or timing — the RPC forces them.
- **Client-side app; server route handlers only for Stripe.** No `@supabase/ssr`.
- **Spanish UI.**
- **The full existing suite stays green** (Plan 1 + Plan 2: pgTAP 52 + Vitest 2).
- **Commit after each task** with a conventional-commit message.

---

## Phase 1 Roadmap position

This is **Plan 3 of 7**, depending on Plan 1 (schema/engine) and Plan 2 (auth: a
signed-in, phone-verified user with a profile). Plan 4 (Admin) consumes what this
produces: `pending_review` lots with an authorized fee, which it captures+publishes
or cancels+rejects.

---

## Environment the operator must provide (not committed)

Document these; the plan's tests do NOT need real Stripe keys.

- Server env (Vercel + local `.env.local`): `STRIPE_SECRET_KEY` (test mode),
  `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (already used by cron).
- For the local webhook test only, `.env.test` gets a **dummy** `STRIPE_WEBHOOK_SECRET`
  (e.g. `whsec_test_dummy`) and a dummy `STRIPE_SECRET_KEY` (`sk_test_dummy`) — the
  webhook test signs its own events locally; no network call is made.

---

## File Structure (this plan)

- Create: `supabase/migrations/<ts>_listing_submission.sql` — `create_draft_listing` RPC + `vehicle-photos` bucket + storage policies.
- Create: `supabase/tests/07_create_listing.test.sql` — pgTAP for the RPC.
- Create: `lib/stripe.ts` — server-only Stripe client.
- Create: `app/api/listings/submit/route.ts` — POST: draft + Checkout Session.
- Create: `app/api/stripe/webhook/route.ts` — POST: Stripe webhook → fee/lot status.
- Create: `tests/listing-submit.test.ts` — Vitest, mocked Stripe.
- Create: `tests/stripe-webhook.test.ts` — Vitest, real SDK signing (offline).
- Create: `app/vender/page.tsx` — seller submission form + photo upload.
- Reuse: `lib/imageUtils.ts`, `lib/supabase.ts`, `lib/auth.ts`, `lib/useUser.ts`.

---

## Task 1: `create_draft_listing` RPC + photo storage (DB)

**Files:**
- Create: `supabase/migrations/<ts>_listing_submission.sql`
- Create: `supabase/tests/07_create_listing.test.sql`

**Interfaces:**
- Produces: `public.create_draft_listing(p_title text, p_make text, p_model text,
  p_year int, p_mileage_km int, p_condition text, p_vin text, p_description text,
  p_location text, p_currency text, p_opening_bid_cents int, p_reserve_cents int,
  p_photos text[]) returns uuid` — SECURITY DEFINER; forces `seller_id=auth.uid()`,
  `status='draft'`, `listing_fee_status='unpaid'`; raises `AUTH_REQUIRED`, `BANNED`,
  `BAD_CURRENCY`, `BAD_OPENING`, `RESERVE_BELOW_OPENING`, `TITLE_REQUIRED`.
- Produces: public Storage bucket `vehicle-photos` with an authenticated-write policy.

- [ ] **Step 1: Create the migration**

```bash
supabase migration new listing_submission
```

- [ ] **Step 2: Write the migration**

```sql
create or replace function public.create_draft_listing(
  p_title text, p_make text, p_model text, p_year int,
  p_mileage_km int, p_condition text, p_vin text,
  p_description text, p_location text,
  p_currency text, p_opening_bid_cents int, p_reserve_cents int,
  p_photos text[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_banned boolean;
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select is_banned into v_banned from public.profiles where id = v_uid;
  if coalesce(v_banned, true) then raise exception 'BANNED'; end if;
  if p_title is null or length(btrim(p_title)) = 0 then raise exception 'TITLE_REQUIRED'; end if;
  if p_currency is null or p_currency not in ('USD','MXN') then raise exception 'BAD_CURRENCY'; end if;
  if p_opening_bid_cents is null or p_opening_bid_cents < 0 then raise exception 'BAD_OPENING'; end if;
  if p_reserve_cents is not null and p_reserve_cents < p_opening_bid_cents then
    raise exception 'RESERVE_BELOW_OPENING';
  end if;

  insert into public.vehicles (
    seller_id, title, make, model, year, mileage_km, condition, vin,
    description, location, currency, opening_bid_cents, reserve_cents,
    photos, status, listing_fee_status
  ) values (
    v_uid, p_title, p_make, p_model, p_year, p_mileage_km, p_condition, p_vin,
    p_description, p_location, p_currency, p_opening_bid_cents, p_reserve_cents,
    coalesce(p_photos, '{}'), 'draft', 'unpaid'
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_draft_listing(text,text,text,int,int,text,text,text,text,text,int,int,text[]) from public;
grant execute on function public.create_draft_listing(text,text,text,int,int,text,text,text,text,text,int,int,text[]) to authenticated;

-- Public bucket for vehicle photos (mirrors the existing 'listings' bucket usage).
insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', true)
on conflict (id) do nothing;

-- Authenticated users may upload into their own folder (path prefix = their uid).
create policy vehicle_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
-- (Public read is provided by the bucket's public = true flag.)
```

- [ ] **Step 3: Write the pgTAP test**

Create `supabase/tests/07_create_listing.test.sql`:

```sql
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(7);

insert into auth.users (id, aud, role) values
  ('d0000000-0000-0000-0000-000000000001','authenticated','authenticated'),
  ('d0000000-0000-0000-0000-000000000002','authenticated','authenticated');
-- (handle_new_user trigger from Plan 2 creates their profiles; promote one to banned)
update public.profiles set is_banned = true where id = 'd0000000-0000-0000-0000-000000000002';

select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- Happy path: creates a draft owned by the caller.
select lives_ok(
  $$ select public.create_draft_listing('Camioneta','Ford','F-150',2015,90000,'good',null,'desc','zone','MXN',1000000,2000000,array['vehicle-photos/x.jpg']) $$,
  'valid submission creates a draft');
select is(
  (select count(*) from public.vehicles
     where seller_id = 'd0000000-0000-0000-0000-000000000001'
       and status = 'draft' and listing_fee_status = 'unpaid'),
  1::bigint, 'exactly one draft, unpaid, owned by the caller');

-- Validation errors.
select throws_like(
  $$ select public.create_draft_listing('X',null,null,null,null,null,null,null,null,'EUR',1000,null,null) $$,
  '%BAD_CURRENCY%', 'currency must be USD or MXN');
select throws_like(
  $$ select public.create_draft_listing('X',null,null,null,null,null,null,null,null,'MXN',1000000,500000,null) $$,
  '%RESERVE_BELOW_OPENING%', 'reserve below opening is rejected');
select throws_like(
  $$ select public.create_draft_listing('   ',null,null,null,null,null,null,null,null,'MXN',1000,null,null) $$,
  '%TITLE_REQUIRED%', 'blank title is rejected');
reset role;

-- Banned seller cannot submit.
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_like(
  $$ select public.create_draft_listing('X',null,null,null,null,null,null,null,null,'MXN',1000,null,null) $$,
  '%BANNED%', 'banned user cannot submit');
reset role;

-- No identity → AUTH_REQUIRED.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_like(
  $$ select public.create_draft_listing('X',null,null,null,null,null,null,null,null,'MXN',1000,null,null) $$,
  '%AUTH_REQUIRED%', 'no user identity is rejected');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 4: Reset and run — expect all green**

```bash
supabase db reset && supabase test db
```

Expected: `07_create_listing` 7/7 plus the existing files (01:12, 02:5, 03:6,
04:16, 05:4, 06:9) all green.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/07_create_listing.test.sql
git commit -m "feat(db): create_draft_listing RPC + vehicle-photos storage bucket"
```

---

## Task 2: Stripe listing-fee routes (server)

**Files:**
- Create: `lib/stripe.ts`
- Create: `app/api/listings/submit/route.ts`
- Create: `app/api/stripe/webhook/route.ts`
- Create: `tests/listing-submit.test.ts`
- Create: `tests/stripe-webhook.test.ts`
- Modify: `package.json` (add `stripe`)

**Interfaces:**
- Consumes: `create_draft_listing` (Task 1); `app_settings.listing_fee_cents`;
  the service-role client pattern from `app/api/cron/route.ts`.
- Produces:
  - `POST /api/listings/submit` — body: the listing fields; header `Authorization:
    Bearer <supabase access token>`. Creates the draft (as the user) + a Stripe
    Checkout Session (manual capture, amount = fee, currency mxn, `metadata.vehicle_id`),
    stores `stripe_payment_intent_id`, returns `{ url }` (the Checkout URL).
  - `POST /api/stripe/webhook` — verifies the signature; on the authorization event
    sets the lot `listing_fee_status='authorized'`, `status='pending_review'`.

- [ ] **Step 1: Install the Stripe SDK**

```bash
npm i stripe
```

- [ ] **Step 2: Server Stripe client (`lib/stripe.ts`)**

```ts
import Stripe from 'stripe';

// Server-only. Never import this into a client component.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-06-20',
});
```

- [ ] **Step 3: Write the submit route (`app/api/listings/submit/route.ts`)**

Mirror `app/api/cron/route.ts` for the handler shape and service-role client. Key
points: Node runtime (Stripe SDK is not edge-compatible); call the RPC AS THE USER
(their bearer token); use the service role to store the PaymentIntent id (clients
can't write vehicles).

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '../../../../lib/stripe';

export const runtime = 'nodejs';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  }
  const body = await request.json();

  // 1) Create the draft AS THE USER (RPC forces seller_id/status/fee_status).
  const userClient = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: vehicleId, error: rpcErr } = await userClient.rpc('create_draft_listing', {
    p_title: body.title, p_make: body.make ?? null, p_model: body.model ?? null,
    p_year: body.year ?? null, p_mileage_km: body.mileage_km ?? null,
    p_condition: body.condition ?? null, p_vin: body.vin ?? null,
    p_description: body.description ?? null, p_location: body.location ?? null,
    p_currency: body.currency, p_opening_bid_cents: body.opening_bid_cents,
    p_reserve_cents: body.reserve_cents ?? null, p_photos: body.photos ?? [],
  });
  if (rpcErr || !vehicleId) {
    return NextResponse.json({ error: rpcErr?.message ?? 'CREATE_FAILED' }, { status: 400 });
  }

  // 2) Look up the listing fee (public config).
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { data: settings } = await admin
    .from('app_settings')
    .select('listing_fee_cents, listing_fee_currency')
    .eq('id', 1).single();
  const feeCents = settings!.listing_fee_cents as number;

  // 3) Stripe Checkout Session, manual capture (authorize now, capture on approve).
  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_intent_data: { capture_method: 'manual' },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'mxn',
        unit_amount: feeCents,
        product_data: { name: 'Cuota de publicación de vehículo' },
      },
    }],
    metadata: { vehicle_id: vehicleId as string },
    success_url: `${origin}/perfil?enviado=1`,
    cancel_url: `${origin}/vender?cancelado=1`,
  });

  // 4) Store the PaymentIntent id (service role — clients can't write vehicles).
  await admin.from('vehicles')
    .update({ stripe_payment_intent_id: session.payment_intent as string })
    .eq('id', vehicleId);

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 4: Write the webhook route (`app/api/stripe/webhook/route.ts`)**

Use the RAW body for signature verification; guard idempotently.

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '../../../../lib/stripe';

export const runtime = 'nodejs';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: Request) {
  const raw = await request.text();
  const sig = request.headers.get('stripe-signature') ?? '';
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'BAD_SIGNATURE' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as { metadata?: { vehicle_id?: string } };
    const vehicleId = session.metadata?.vehicle_id;
    if (vehicleId) {
      const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
      // Idempotent: only advance an unpaid draft.
      await admin.from('vehicles')
        .update({ listing_fee_status: 'authorized', status: 'pending_review' })
        .eq('id', vehicleId)
        .eq('listing_fee_status', 'unpaid');
    }
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 5: Write the submit-route test (mocked Stripe)**

Create `tests/listing-submit.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { adminClient, createTestUser } from './helpers/supabase';

// Mock the Stripe client BEFORE importing the route.
vi.mock('../lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn().mockResolvedValue({
      id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1', payment_intent: 'pi_test_1',
    }) } },
  },
}));

const { POST } = await import('../app/api/listings/submit/route');

describe('POST /api/listings/submit', () => {
  let token: string;
  beforeAll(async () => {
    const seller = await createTestUser('+525599990001');
    token = seller.accessToken;
  });

  it('creates a draft, attaches the PaymentIntent, and returns the Checkout url', async () => {
    const res = await POST(new Request('http://localhost/api/listings/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Camioneta', currency: 'MXN', opening_bid_cents: 1000000,
        reserve_cents: 2000000, photos: ['vehicle-photos/a.jpg'],
      }),
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.url).toContain('checkout.stripe.test');

    const admin = adminClient();
    const { data: rows } = await admin.from('vehicles')
      .select('status, listing_fee_status, stripe_payment_intent_id, opening_bid_cents')
      .eq('stripe_payment_intent_id', 'pi_test_1');
    expect(rows!.length).toBe(1);
    expect(rows![0].status).toBe('draft');
    expect(rows![0].listing_fee_status).toBe('unpaid');
    expect(rows![0].opening_bid_cents).toBe(1000000);
  });

  it('rejects a request with no auth', async () => {
    const res = await POST(new Request('http://localhost/api/listings/submit', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x', currency: 'MXN', opening_bid_cents: 1 }),
    }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 6: Write the webhook test (real SDK signing, offline)**

Create `tests/stripe-webhook.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import Stripe from 'stripe';
import { adminClient, createTestUser } from './helpers/supabase';

const stripe = new Stripe('sk_test_dummy', { apiVersion: '2024-06-20' });
const SECRET = process.env.STRIPE_WEBHOOK_SECRET!; // dummy from .env.test

const { POST } = await import('../app/api/stripe/webhook/route');

describe('POST /api/stripe/webhook', () => {
  let vehicleId: string;
  beforeAll(async () => {
    const seller = await createTestUser('+525599990002');
    const admin = adminClient();
    const { data } = await admin.from('vehicles').insert({
      seller_id: seller.userId, title: 'Webhook Lot', currency: 'MXN',
      opening_bid_cents: 1000000, status: 'draft', listing_fee_status: 'unpaid',
    }).select('id').single();
    vehicleId = data!.id;
  });

  it('moves an unpaid draft to authorized/pending_review on checkout.session.completed', async () => {
    const payload = JSON.stringify({
      id: 'evt_1', object: 'event', type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', object: 'checkout.session', metadata: { vehicle_id: vehicleId } } },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

    const res = await POST(new Request('http://localhost/api/stripe/webhook', {
      method: 'POST', headers: { 'stripe-signature': header }, body: payload,
    }));
    expect(res.status).toBe(200);

    const admin = adminClient();
    const { data: row } = await admin.from('vehicles')
      .select('status, listing_fee_status').eq('id', vehicleId).single();
    expect(row!.listing_fee_status).toBe('authorized');
    expect(row!.status).toBe('pending_review');
  });

  it('rejects a bad signature', async () => {
    const res = await POST(new Request('http://localhost/api/stripe/webhook', {
      method: 'POST', headers: { 'stripe-signature': 't=1,v1=bad' }, body: '{}',
    }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 7: Add the dummy Stripe secrets to `.env.test` and run**

Add to the gitignored `.env.test` (dummy values — the tests do no network):

```
STRIPE_SECRET_KEY=sk_test_dummy
STRIPE_WEBHOOK_SECRET=whsec_test_dummy
```

Then:

```bash
npm test
```

Expected: `listing-submit.test.ts` (2) and `stripe-webhook.test.ts` (2) pass, plus
the existing `auth` and `concurrency` tests. Also run `supabase test db` (still 52+7).

- [ ] **Step 8: Commit**

```bash
git add lib/stripe.ts app/api/listings/submit/route.ts app/api/stripe/webhook/route.ts tests/listing-submit.test.ts tests/stripe-webhook.test.ts package.json package-lock.json
git commit -m "feat(listings): Stripe submit + webhook routes (authorize listing fee)"
```

---

## Task 3: Seller submission form (UI)

**Files:**
- Create: `app/vender/page.tsx`

**Interfaces:**
- Consumes: `useUser` (Plan 2), `lib/auth.ts` (session/token), `compressImage`
  (`lib/imageUtils.ts`), the browser client (`lib/supabase.ts`), `POST /api/listings/submit`.

> **Before writing:** read `app/perfil/page.tsx` (auth-gated client page pattern +
> the repo's React-Compiler lint rules — redirect in an effect, no set-state-in-effect
> seeding) and `components/CameraCapture.tsx` (the compress → `supabase.storage
> .from(bucket).upload` → `getPublicUrl` pattern to reuse for `vehicle-photos`).

- [ ] **Step 1: Build `app/vender/page.tsx`**

A `'use client'` page. Behavior:
- Use `useUser()`; while `loading` show a loading state; if no `user`, redirect to
  `/entrar` (in an effect).
- Fetch and display the listing fee from `app_settings` (`listing_fee_cents` /
  `listing_fee_currency`) so the seller sees the cost (format as MXN pesos).
- Form fields (Spanish labels): título, marca, modelo, año, kilómetros, condición,
  VIN (opcional), descripción, ubicación, **moneda** (MXN/USD select),
  **puja inicial** (opening bid), a **reserva** toggle + amount (optional hidden
  reserve), and a **multi-photo** picker.
- Photo upload: for each chosen file, `compressImage(file)` then
  `supabase.storage.from('vehicle-photos').upload(\`${user.id}/${crypto.randomUUID()}.jpg\`, compressed)`
  and collect `getPublicUrl(...)` results into a `photos: string[]`. (Upload to the
  user's own folder — the storage policy requires the path's first segment to equal
  their uid.)
- Submit: get the current access token
  (`(await supabase.auth.getSession()).data.session?.access_token`), then
  `fetch('/api/listings/submit', { method:'POST', headers:{'content-type':'application/json', authorization:\`Bearer ${token}\`}, body: JSON.stringify({...fields, opening_bid_cents, reserve_cents, photos}) })`.
  On `{ url }` → `window.location.href = url` (redirect to Stripe Checkout). On error
  → show the message.
- Convert peso inputs to integer cents before sending (e.g. `Math.round(pesos * 100)`).

- [ ] **Step 2: Verify (automated gate)**

```bash
npx tsc --noEmit
npm run lint
```

Expected: clean (no new errors) on the new file (ignore the pre-existing
`.vercel/output` lint noise).

- [ ] **Step 3: Controller browser smoke (documented scope)**

Full end-to-end payment requires the operator's Stripe **test** keys in server env;
the automated tests already cover the server orchestration offline. The browser smoke
(run by the controller) verifies the parts that don't need Stripe:
1. `/vender` renders the form (redirects to `/entrar` when signed out), shows the fee.
2. Photo upload: a chosen image compresses and uploads to `vehicle-photos` (a public
   URL comes back; the object appears under the user's uid folder).
3. With Stripe test keys present, submit → a draft row is created and the browser
   redirects toward `checkout.stripe.com`. Without keys, verify up to the point the
   submit request is sent (the draft row is created; the Stripe call is what needs
   keys) and note it.

Capture a screenshot of the filled form. Report console/network errors.

- [ ] **Step 4: Commit**

```bash
git add app/vender/page.tsx
git commit -m "feat(listings): seller submission form with photo upload and Stripe redirect"
```

---

## Self-Review

**Spec coverage (Plan 3 scope):**
- Seller submits vehicle + photos → Task 3 form + Task 1 RPC. ✅
- One flat MXN listing fee, paid online, authorized now / captured on approve → Task 2
  (Checkout Session, `capture_method: 'manual'`; capture is Plan 4). ✅
- Lands in `pending_review` after the fee is authorized → Task 2 webhook. ✅
- Server-authoritative + secret-key-safe: RPC forces seller_id/status/fee_status;
  Stripe secret server-only; clients can't write vehicles. ✅
- Photos via the existing compress→upload pipeline into a scoped public bucket → Task 1
  bucket/policy + Task 3 uploader. ✅

**Placeholder scan:** none — the SQL, the Stripe routes, and both Vitest suites are
complete; the form is specified as behavior + the exact existing patterns to reuse
(`app/perfil/page.tsx`, `components/CameraCapture.tsx`) with browser verification,
because its logic (RPC + routes) is already unit-tested. The `apiVersion` string and
the `checkout.session.completed` event should be confirmed against the installed
`stripe` SDK version during Task 2.

**Type/interface consistency:** the submit route sends the RPC params named exactly
as Task 1 defines them (`p_title`…`p_photos`); the webhook keys off
`metadata.vehicle_id` set by the submit route; `stripe_payment_intent_id` is written
by submit and (in Plan 4) captured/cancelled by the admin. Money is cents throughout;
Stripe currency `'mxn'`.

**Carry-forwards / notes:**
- **Plan 4** captures the PaymentIntent on approve (`stripe.paymentIntents.capture`)
  and cancels it on reject (`stripe.paymentIntents.cancel`), then sets
  `listing_fee_status` `captured`/`released` and publishes/cancels the lot. It also
  needs the admin ban/promote path noted in Plan 2.
- Manual-capture authorizations expire (~7 days) — admin should review within that
  window; note for Plan 4.
- **Capacitor caveat:** the iOS shell sets `limitsNavigationsToAppBoundDomains: true`,
  which can block a redirect to `checkout.stripe.com` inside the native WebView. Fine
  on the web build; for the native app, open Checkout in the system browser or relax
  app-bound-domains. Carry-forward for the mobile release.
- A dedicated "submission received" confirmation page (instead of `/perfil?enviado=1`)
  is a nice polish later.
- Plan 1/2 carry-forwards still stand (enforce `ends_at NOT NULL` at publish, etc.).
