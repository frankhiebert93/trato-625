# WhatsApp-First Launch Runbook — trato625

**Strategy (decided 2026-09-29):** run the auction on **WhatsApp** for a few months to
build trust with buyers/sellers, while the **app runs headless in the background as the
system of record**. Once trust is established, merge everyone into the full app — which is
nearly free, because every WhatsApp bidder already has an app account keyed to their phone
number.

This doc is the ordered go-to-market checklist. It consolidates the three slice guides:
[WHATSAPP_NOTIFICATIONS_SETUP.md](WHATSAPP_NOTIFICATIONS_SETUP.md) (Slice 1),
[WHATSAPP_BIDDING_SETUP.md](WHATSAPP_BIDDING_SETUP.md) (Slice 2),
[WHATSAPP_CHANNEL_SETUP.md](WHATSAPP_CHANNEL_SETUP.md) (Slice 3), plus
[SMS_AUTH_SETUP.md](SMS_AUTH_SETUP.md) and [STRIPE_SETUP.md](STRIPE_SETUP.md).

---

## Verified current state (as of 2026-09-29)

| Thing | State |
| --- | --- |
| **Production** | ✅ Live at **https://www.trato625.com**, deployed from `master` @ `519a697` (the current trunk — WhatsApp trust hybrid #18). App + all WhatsApp features are in prod. |
| **Hosting** | Vercel project `trato-625`, team *Forge ERP's projects*, Next.js, Node 24.x, **Vercel Pro**. |
| **Cron** | Runs **every minute** (`/api/cron`): intake rotation, go-live, staggered closings, event close, notification dispatch, channel-post queueing. |
| **Domains** | `www.trato625.com` (primary, verified); apex `trato625.com` 308-redirects to www; `trato-625.vercel.app`. |
| **Deployment Protection** | ⚠️ **SSO ON for all deployments EXCEPT custom domains.** Public traffic and webhooks must use the custom domain; `*.vercel.app` preview URLs require a Vercel login. |
| **Supabase schema** | ✅ **Verified applied** (2026-09-29, project `rrktmtdncmlqukixpcdm`): every auction + WhatsApp + commission + Plan 9 object exists — `place_bid_for(uuid,int,uuid)` RPC, `vehicles.public_code`, `vehicles.event_id`, `profiles.accepted_terms_at`, `whatsapp_contacts` (1 test row), `channel_posts`, `sale_commissions`. The WhatsApp bot's DB dependencies are all present. |
| **Migration ledger** | ✅ **Reconciled 2026-09-29.** The 16 repo migrations had been applied under *different* version stamps (via MCP/dashboard), so none of the repo versions were in the ledger. Added all 16 repo `(version, name)` rows as applied (additive, tagged `created_by='claude-reconcile-20260929'`) so `supabase db push`/`migration list` treat them as done. Legacy/test/`freqtrade_*` rows untouched. See "Gotchas". |
| **Env vars in prod** | ❓ Could not read (Vercel token lacks env-list permission). Check **Vercel → trato-625 → Settings → Environment Variables** directly against the reference table below. |

> Note: a preview branch `claude/user-accounts-bidding-mntrob` has an unmerged
> `docs(whatsapp): add go-live checklist` commit (a narrower Twilio-sender checklist). This
> runbook supersedes it; cherry-pick from it only if useful.

---

## The operating model

| Surface | Role | Automation |
| --- | --- | --- |
| **WhatsApp Channel** (Canal) | Storefront / megaphone — post new lots + "VENDIDO" for social proof | App **generates** the post; you **copy-paste** it. Channels have no compliant post API. |
| **1:1 bidding bot** | Where bids happen: `PUJA <código> <monto>` → runs the same bidding engine as the app | ✅ Fully automated + recorded |
| **App / admin dashboard** | Your cockpit — every bid, bidder, sale, event lands here | ✅ This is the "background tracking" |

⚠️ **WhatsApp Groups cannot be wired to the app** — the WhatsApp Business API has no group
support (no reading, no posting). A Group can be a human community space, but bidding and
tracking must run through the **Channel (broadcast) + 1:1 bot (bidding)** pair.

Because WhatsApp bids go through `place_bid_for` (the same RPC the app uses), **the app and
WhatsApp can never disagree about who's winning.** Open `/admin/dashboard` to see the review
queue, live lots + current bids, the Channel post queue (Copiar buttons), scheduled auction
events, member accounts, commissions, and settings.

---

## Phase 1 — turn on the WhatsApp channel (do these in order)

### A. Infrastructure
- [ ] **New Twilio account created and upgraded out of trial** (trial only sends to verified numbers).
- [ ] **Twilio Geo Permissions:** Mexico (+52) enabled for the relevant channels.
- [x] **Supabase schema verified applied + ledger reconciled** (2026-09-29) —
      `whatsapp_bidding`/`channel_posts` objects all present (`place_bid_for`,
      `vehicles.public_code`, `profiles.accepted_terms_at`, `whatsapp_contacts`,
      `channel_posts`); the 16 repo migrations are now recorded in the ledger as applied, so
      `supabase db push` is safe. No action needed to go live.
- [ ] **Your account promoted to `role='admin'`** in `profiles`.

### B. WhatsApp sender (the critical path — replaces SMS-OTP as the blocker)
- [ ] **Test on the Twilio WhatsApp sandbox first** (no approval needed) to prove wiring end-to-end.
- [ ] **Production sender:** register a WhatsApp Business sender in Twilio → requires a
      **Meta Business account + display-name review**. Follow Twilio's "WhatsApp Senders" onboarding.

### C. Bidding bot (Slice 2 — the core)
- [ ] Env in Vercel:
  - [ ] `TWILIO_AUTH_TOKEN` — **required**; the webhook rejects everything if unset.
  - [ ] `NEXT_PUBLIC_WHATSAPP_BOT_NUMBER` — enables the "Pujar por WhatsApp" `wa.me` links.
  - [ ] `NEXT_PUBLIC_SITE_URL` = `https://www.trato625.com`.
- [ ] **Wire the inbound webhook** on the WhatsApp sender ("When a message comes in"):
      `POST https://www.trato625.com/api/whatsapp`
      ⚠️ Use the **custom domain** exactly (not apex `trato625.com`, which 308-redirects and
      can drop the POST body/signature; not a `*.vercel.app` URL, which SSO blocks).
- [ ] Sandbox test: join the sandbox, ensure a lot is `live`, send `PUJA <código> <monto>`,
      confirm the bid appears in `/admin/dashboard` and you get the "puja registrada" reply.

### D. Channel megaphone (Slice 3)
- [ ] `NEXT_PUBLIC_WHATSAPP_BOT_NUMBER` + `NEXT_PUBLIC_SITE_URL` set (same as above).
- [ ] **Create the WhatsApp Channel** (manual, one-time); share/pin it.
- [ ] Confirm the admin dashboard **📢 Canal de WhatsApp** section lists pending posts with
      Copiar / Marcar publicado / Descartar. (Posts only generate going forward — nothing backfills.)

### E. Outbound notifications (Slice 1 — optional at first)
- [ ] `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_WHATSAPP_FROM` (flips `lib/notify.ts` from stub to live).
- [ ] The 4 **utility templates** (outbid/won/sold/unsold, Spanish), Meta-approved → set
      `TWILIO_WA_TEMPLATE_OUTBID/_WON/_SOLD/_UNSOLD` (`HX…`). Business-initiated WhatsApp
      **requires** approved templates (24-hour-window rule); plain text outside the window is
      silently dropped.
- [ ] Alternative: point alerts at **SMS** (no template rule) while templates are in review.

### F. Curate lots & run
- [ ] Add lots via the admin flow; each gets a public code (e.g. `T1042`) and an end time /
      scheduled event.
- [ ] Post the generated Channel announcement; bidders tap the `wa.me` link → bid in the bot.

---

## What Phase 1 lets you DEFER (and why)

- **SMS-OTP sign-in ([SMS_AUTH_SETUP.md](SMS_AUTH_SETUP.md)) is NOT required now.** People bid
  via WhatsApp; nobody logs into the app. The bot auto-provisions an account by verified phone
  number. OTP only matters in Phase 2 when people sign in directly.
- **Stripe live keys ([STRIPE_SETUP.md](STRIPE_SETUP.md)) can wait.** The listing fee only
  fires when *sellers self-submit*. While you curate lots yourself, defer live Stripe. (The
  build no longer breaks without `STRIPE_SECRET_KEY` — the client lazy-initializes.)

---

## Phase 2 — merge everyone into the app (later, nearly free)

Every WhatsApp bidder already has an account keyed to their phone number, with full bid
history. When you turn on OTP sign-in, they log in with the **same number and inherit that
account** — no data migration, no "merge" step.

- [ ] Configure Supabase → Auth → Providers → **Phone** (Twilio) — Account SID, Auth Token,
      Message Service SID. See [SMS_AUTH_SETUP.md](SMS_AUTH_SETUP.md).
- [ ] Verify a real +52 OTP sign-in end-to-end, then confirm a WhatsApp bidder's history
      appears after they log in.
- [ ] If sellers will self-submit: complete live Stripe ([STRIPE_SETUP.md](STRIPE_SETUP.md)).

---

## Daily operating loop (once live)

1. Open `/admin/dashboard`.
2. Approve/curate lots; set/adjust scheduled events and end times.
3. When a lot goes live or sells, copy the generated **Canal de WhatsApp** post → paste into
   the Channel → Marcar publicado.
4. Watch live lots + current bids; the cron closes lots and dispatches alerts each minute.
5. Handle settlement/contact reveal on sold lots; record commissions.

---

## Env var reference (Vercel → Settings → Environment Variables)

| Variable | Phase 1? | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ (set) | App + webhook DB access |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ (set) | Client Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ required | Webhook/cron writes, `place_bid_for` |
| `TWILIO_AUTH_TOKEN` | ✅ required | **Webhook signature** (bot) + notifications |
| `NEXT_PUBLIC_WHATSAPP_BOT_NUMBER` | ✅ required | `wa.me` bid links (bot + channel posts) |
| `NEXT_PUBLIC_SITE_URL` | ✅ `https://www.trato625.com` | Links in bot replies + channel posts |
| `TWILIO_ACCOUNT_SID` | ▲ notifications | Flips `notify.ts` to live |
| `TWILIO_WHATSAPP_FROM` | ▲ notifications | WhatsApp sender E.164 |
| `TWILIO_WA_TEMPLATE_OUTBID/_WON/_SOLD/_UNSOLD` | ▲ notifications | Approved template `HX…` SIDs |
| `TWILIO_MESSAGING_SERVICE_SID` | ▲ SMS | `MG…`, preferred for MX SMS deliverability |
| `TWILIO_SMS_FROM` | ▲ SMS | From-number if no Messaging Service |
| `TWILIO_WEBHOOK_URL` | optional | Force signature-validation URL behind a proxy |
| `STRIPE_SECRET_KEY` | ⏸ deferred | Seller listing fee (self-submit only) |
| `STRIPE_WEBHOOK_SECRET` | ⏸ deferred | Stripe webhook verification |

Legend: ✅ needed for Phase 1 · ▲ needed only for that channel · ⏸ deferred to Phase 2.

---

## Gotchas

- **Webhook URL:** custom domain only (`https://www.trato625.com/api/whatsapp`). SSO blocks
  preview URLs; the apex redirect can drop POST bodies.
- **WhatsApp 24-hour window:** business-initiated messages need approved templates; bot
  replies (within 24h of the user's message) do not.
- **No group automation:** Channel + 1:1 bot only.
- **Channel posts don't backfill:** only generated from the next go-live/sale onward.
- **Domain drift:** the Channel doc's examples say `trato625.mx`; the live domain is
  `trato625.com` — use `.com`.
- **Migration ledger (reconciled 2026-09-29):** the 16 repo migrations were applied under
  different version stamps, so the repo versions were missing from the ledger. Fixed additively
  by inserting the 16 repo `(version, name)` rows as applied — undo with
  `delete from supabase_migrations.schema_migrations where created_by='claude-reconcile-20260929';`.
  `migration list` still shows the original re-stamped rows plus legacy/test/`freqtrade_*` as
  remote-only history — harmless. Note this DB is **shared** with an unrelated `freqtrade_*` app.
- **Shared database:** project `rrktmtdncmlqukixpcdm` also contains unrelated `freqtrade_*`
  objects (a different app). RLS is on, so it's isolated, but be aware this Supabase project
  isn't dedicated to trato625.
- **DB ref caveat:** `rrktmtdncmlqukixpcdm` is the ref in local env; Vercel's production
  `NEXT_PUBLIC_SUPABASE_URL` wasn't readable here. Confirm prod points at the same project (it
  almost certainly does — this DB holds the live auction + legacy yard-sale schema).
