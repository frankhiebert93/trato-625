# Stripe Setup — trato625 vehicle auction

How the listing fee works, and exactly how to configure Stripe + Vercel. Do the
**test-mode** path first (safe, uses a fake card), then repeat the two starred steps
with **live** values to go to production.

---

## 0. How the money flow works (so the config makes sense)

The platform charges the **seller a flat listing fee** — authorized when they submit,
**captured only when you approve** the listing, released if you reject.

1. Seller fills the `/vender` form → the app calls `POST /api/listings/submit`.
2. That route creates a **Stripe Checkout Session** in **manual-capture** mode
   (`payment_intent_data.capture_method = 'manual'`), amount = the listing fee from
   `app_settings.listing_fee_cents`, currency **MXN**, and redirects the seller to
   Stripe's hosted payment page.
3. Seller pays → the card is **authorized (funds held, NOT charged yet)**.
4. Stripe calls your **webhook** (`/api/stripe/webhook`, event
   `checkout.session.completed`) → the app flips the lot to `pending_review`.
5. In the admin dashboard you **Approve** → `stripe.paymentIntents.capture()` charges
   the fee and publishes the auction; or **Reject** → `stripe.paymentIntents.cancel()`
   releases the hold.

> **Manual-capture window:** an authorization is valid ~7 days. Approve/reject
> listings within that window or the hold expires.

The app reads exactly two Stripe env vars: **`STRIPE_SECRET_KEY`** and
**`STRIPE_WEBHOOK_SECRET`**. Nothing else.

---

## 1. Stripe account prerequisites

- A Stripe account that can process **MXN** (a Mexico-based Stripe account is ideal; a
  US account can present MXN but settlement/fees differ — confirm with Stripe).
- **Test mode** works with no activation. **Live mode** requires your Stripe account to
  be activated (business details, bank account).
- The dashboard has a **Test mode** toggle (top of the left nav / a switch near the top
  right). Test and live have **separate keys and separate webhooks**.

---

## 2. ⭐ Get your API keys

Stripe Dashboard → **Developers → API keys**:

- **Test mode ON:** you'll see `pk_test_…` (publishable, not needed) and a **Secret key**
  `sk_test_…` → reveal + copy. This is your `STRIPE_SECRET_KEY` for Preview/testing.
- **Test mode OFF (live):** the **Secret key** is `sk_live_…` → this is your
  `STRIPE_SECRET_KEY` for Production. (You may need "Create restricted key" or to reveal
  the standard secret key.)

You do **not** need the publishable key — this integration uses hosted Checkout, so no
card fields live in our app.

---

## 3. ⭐ Set the env vars in Vercel

Vercel → project **trato-625** → **Settings → Environment Variables**. Add:

| Name | Value | Environments |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` (testing) / `sk_live_…` (prod) | Preview (test), Production (live) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from step 4 | same scoping |
| `NEXT_PUBLIC_SITE_URL` *(optional)* | `https://trato625.com` | Production |

Notes:
- Vercel lets you give a variable **different values per environment** — put `sk_test_…`
  in **Preview** and `sk_live_…` in **Production** so branch previews use test mode and
  the live site uses live mode.
- **Env vars only apply to _new_ deployments** — after adding them you must redeploy
  (a push, or Vercel → Deployments → ⋯ → Redeploy). Setting `STRIPE_SECRET_KEY` is also
  what fixes the current **ERRORed build** (the Stripe client needs it at build time).

---

## 4. ⭐ Create the webhook endpoint (and get `STRIPE_WEBHOOK_SECRET`)

Stripe Dashboard (in the **same mode** — test or live) → **Developers → Webhooks →
Add endpoint**:

- **Endpoint URL:** `https://trato625.com/api/stripe/webhook`
- **Events to send:** add **`checkout.session.completed`** (the only event the code
  handles). You can leave the rest off.
- Create it, then **Reveal signing secret** → copy the `whsec_…` value into
  `STRIPE_WEBHOOK_SECRET` in Vercel (step 3), matching the mode (test webhook secret →
  Preview; live webhook secret → Production).

> **Two separate secrets:** the test-mode and live-mode webhooks each have their own
> `whsec_…`. Don't mix them.

> **Ordering:** the endpoint only *receives* events once the app is deployed to
> `trato625.com` (that's the deploy gate). Create it now, copy the secret now; delivery
> starts after deploy, and you can click **"Send test event"** on the endpoint to
> confirm a `200`.

---

## 5. Verify it works

### Option A — locally with the Stripe CLI (fastest, before any deploy)
1. Install: `brew install stripe/stripe-cli/stripe`, then `stripe login`.
2. Run the dev server (`npm run dev`) pointed at your local Supabase.
3. Forward webhooks to local:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   It prints a `whsec_…` — put that in `.env.local` as `STRIPE_WEBHOOK_SECRET`, and put
   your `sk_test_…` as `STRIPE_SECRET_KEY` there too. Restart `npm run dev`.
4. Sign in, submit a listing at `/vender`, and on the Stripe Checkout page pay with the
   **test card `4242 4242 4242 4242`**, any future expiry, any CVC, any postal code.
5. Watch `stripe listen` show `checkout.session.completed → 200`, then confirm the lot
   moved to `pending_review` (it'll appear in the admin review queue).

### Option B — on the deployed site (test mode)
1. Ensure Preview/Production has `sk_test_…` + the test webhook `whsec_…`, and the app
   is deployed.
2. Submit a listing → pay with `4242 4242 4242 4242` → the Stripe webhook fires → lot
   becomes `pending_review`.
3. In the admin dashboard, **Approve** → the fee is captured (see it in Stripe →
   Payments) and the auction goes live with an end time; **Reject** → the hold is
   canceled.

I can verify from my side too: after `STRIPE_SECRET_KEY` is set I'll confirm the build
goes green, and after deploy I'll check `/api/stripe/webhook` rejects an unsigned
request (`400`) and accepts a Stripe-signed one.

---

## 6. Go live

1. Activate your Stripe account (if not already).
2. Repeat steps 2–4 with **live** values: `sk_live_…` in Production, a **live-mode**
   webhook at `https://trato625.com/api/stripe/webhook` (event
   `checkout.session.completed`), and its live `whsec_…` in Production.
3. Redeploy production. Do one real, small end-to-end listing to confirm, then you're
   live. (Consider setting the real listing fee via the admin **Settings** page —
   `listing_fee_cents`, in centavos: 50000 = MXN $500.00.)

---

## 7. Gotchas / FAQ

- **Amounts are in centavos.** MXN's minor unit is 1/100, so `listing_fee_cents` maps
  directly to Stripe's `unit_amount` (50000 → $500.00 MXN). No conversion needed.
- **Redeploy after changing env vars** — they don't apply to existing deployments.
- **Test vs live are fully separate** — separate keys, separate webhooks, separate
  signing secrets, separate payment data. A test payment never appears in live.
- **The webhook secret is per-endpoint** — if you delete/recreate the endpoint, update
  `STRIPE_WEBHOOK_SECRET`.
- **Currency support** — verify your Stripe account can charge MXN before going live.
- **Refunds** — capturing charges the seller; the app has no refund flow yet
  (cancelling a *live* lot doesn't refund a captured fee). That's a known later
  addition.
