# WhatsApp Go-Live Checklist — trato625

One ordered path from "tested in the sandbox" to "live on our own WhatsApp number
with automatic alerts." Tick each box. Detailed background lives in
`WHATSAPP_NOTIFICATIONS_SETUP.md`, `WHATSAPP_BIDDING_SETUP.md`, and
`WHATSAPP_CHANNEL_SETUP.md`.

**What's already done:** the code is merged and deployed; the DB migrations are
applied; the inbound bidding bot works on the Twilio **sandbox**. This checklist is
about graduating off the sandbox onto our own number and turning on the outbound
alerts. Both need the Meta/Twilio setup below.

**Production webhook URL** (used in a couple of steps): `https://trato625.com/api/whatsapp`

---

## Phase 0 — Accounts
- [ ] Upgrade Twilio out of trial (Console top bar → **Upgrade**). Trial can't send to
      arbitrary numbers.
- [ ] Create a **Facebook account** at facebook.com if you don't have one. It's only a
      login for Meta Business — no Page, posts, or public presence; bidders never see
      it. Use the business email you'll use everywhere below.
- [ ] Turn on **two-factor authentication** on that Facebook account (Meta requires it
      for business verification).
- [ ] Have a **phone number for the sender** that is NOT active on any personal/business
      WhatsApp app (delete it from WhatsApp first, or use a fresh number).

## Phase 1 — Register the WhatsApp sender (Twilio → Meta)
- [ ] Twilio Console → **Messaging → Senders → WhatsApp senders → Create new sender**
      ("Sign up with Facebook").
- [ ] In the embedded flow: create/select your **Meta Business Portfolio**, create a
      **WhatsApp Business Account (WABA)**, enter the **sender phone number**, verify by
      **OTP**, set the **display name** (e.g. `Trato 625`).
- [ ] Accept the permissions; confirm the sender appears in Twilio.

## Phase 2 — Meta business verification
- [ ] Meta Business Manager (business.facebook.com) → **Settings / Security Center** →
      complete **Business Verification** (may ask for legal business name + a document
      like a registration or utility bill — start early, it can take a day or two).
- [ ] Confirm 2FA is on. Verification is required to send at real volume.

## Phase 3 — Create the 4 alert templates
Twilio Console → **Messaging → Content Template Builder → Create new**. For EACH:
Content type **Text**, Language **Spanish**, Category **Utility**, and **no
variables/placeholders** (static text — the app sends the template by SID with no
variables, so a `{{1}}` would break delivery).

Create these four with this exact copy, then **Submit for WhatsApp approval** (Utility)
and copy each approved **`HX…` Content SID**:

- [ ] **outbid** — `Alguien superó tu puja en Trato 625. Entra para volver a pujar.`
- [ ] **won** — `¡Ganaste la subasta en Trato 625! Entra para contactar al vendedor.`
- [ ] **sold** — `Tu vehículo se vendió en Trato 625. Entra para contactar al comprador.`
- [ ] **unsold** — `Tu subasta terminó sin alcanzar la reserva en Trato 625.`
- [ ] All four show **Approved** (usually < 1 hour, up to ~24h).

## Phase 4 — Point the number's inbound webhook at the app
- [ ] On the production sender's config, set **"When a message comes in"** to
      `https://trato625.com/api/whatsapp`, method **POST**. (Keeps the bidding bot
      working on the real number.)

## Phase 5 — Set env vars in Vercel (Production) and redeploy
Vercel → **trato-625 → Settings → Environment Variables**:
- [ ] `TWILIO_WHATSAPP_FROM` = the approved sender number, E.164 (e.g. `+52…`)
- [ ] `TWILIO_WA_TEMPLATE_OUTBID` = `HX…` (outbid template)
- [ ] `TWILIO_WA_TEMPLATE_WON` = `HX…` (won)
- [ ] `TWILIO_WA_TEMPLATE_SOLD` = `HX…` (sold)
- [ ] `TWILIO_WA_TEMPLATE_UNSOLD` = `HX…` (unsold)
- [ ] `NEXT_PUBLIC_WHATSAPP_BOT_NUMBER` = the new sender number (updates the "Pujar por
      WhatsApp" links)
- [ ] **Redeploy** (Deployments → ⋯ → Redeploy) so the new vars take effect.
      *(`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` are already set.)*

## Phase 6 — Verify end to end
- [ ] **Bot on the real number:** from a normal phone (not sandbox-joined), message the
      sender → get the Términos prompt → `ACEPTO` → name → `PUJA <código> <monto>` on a
      live lot → bid lands + confirmation.
- [ ] **Outbid alert:** bid from account A, outbid from account B on a live lot →
      account A gets "Alguien superó tu puja…" on WhatsApp within a minute.
- [ ] **Close alerts:** let a lot close → winner gets "won", seller gets "sold" (or
      "unsold" if reserve wasn't met).
- [ ] **Channel posts:** admin dashboard → **📢 Canal de WhatsApp** shows queued
      new-lot / sold posts; copy one into your WhatsApp Channel and mark it published.

---

## Notes & gotchas
- Templates deliver **anytime** — that's why alerts need them and the bot's in-chat
  replies don't (the reply is inside the 24h window).
- Users who sent `BAJA` are moved to SMS, so they won't get WhatsApp alerts. To make
  SMS actually deliver, also set `TWILIO_MESSAGING_SERVICE_SID` (a `MG…`) or
  `TWILIO_SMS_FROM`, and enable Mexico in Twilio Geo permissions.
- Keep the sender on the **same Meta Business Portfolio/WABA** if you ever add more
  senders — Twilio errors otherwise.
- Optional safety rail for binding bids (not built): a first-bid confirmation
  ("responde SÍ para confirmar $X") or a max-bid cap for brand-new numbers.
