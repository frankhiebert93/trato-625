# WhatsApp Inbound Bidding Bot — trato625 (Slice 2)

Lets people bid **from WhatsApp** without the app. A person messages the business
number, the bot onboards them (accept terms + name), and their bids go through the
**same** bidding engine the app uses — so the app and WhatsApp can never disagree
about who's winning.

> Depends on Slice 1 (`WHATSAPP_NOTIFICATIONS_SETUP.md`) for the Twilio account and
> an approved WhatsApp sender. For testing you can use the Twilio WhatsApp sandbox.

---

## How it works

- Each lot has a short public code (e.g. **T1042**), shown on the lot page and
  prefilled into a `wa.me` "Pujar por WhatsApp" link.
- A bidder sends `PUJA T1042 180000`. The webhook (`/api/whatsapp`) verifies the
  request is really from Twilio (X-Twilio-Signature), runs the conversation state
  machine, and places the bid via the `place_bid_for` RPC (service role, explicit
  bidder). The bot replies in the same chat.
- **Identity = the phone number.** WhatsApp proves the sender owns the number, so a
  first-time bidder is auto-provisioned an account keyed to it — no app install, no
  OTP. Existing app users are recognized by their number and skip onboarding.

### Onboarding (first-time, app-less bidder)
1. Unknown number sends anything → bot: welcome + Términos link, "responde ACEPTO".
2. `ACEPTO` → consent recorded (`profiles.accepted_terms_at`), bot asks for a name.
3. Name → account created by their verified number, name stored, bot: "ya puedes pujar".

### Commands
| Message | Effect |
| --- | --- |
| `PUJA <código> <monto>` | Place a bid (e.g. `PUJA T1042 180000`). Amount is in pesos/dollars. |
| `ESTADO <código>` | Current price + bid count for a lot. |
| `AYUDA` | List commands. |
| `BAJA` | Opt out of WhatsApp messages (also moves auction alerts to SMS). |
| `ALTA` | Re-subscribe. |

---

## Prerequisites
1. **Apply the migration** `supabase/migrations/20260909120000_whatsapp_bidding.sql`
   (adds `vehicles.public_code`, `profiles.accepted_terms_at`, the
   `whatsapp_contacts` table, and the `place_bid_for` RPC). Paste it into the
   Supabase SQL editor for the trato625 project.
2. A Twilio WhatsApp sender (sandbox for testing, or your approved production
   number).

## Environment variables (Vercel → Settings → Environment Variables)
| Variable | Purpose |
| --- | --- |
| `TWILIO_AUTH_TOKEN` | Validates the inbound webhook signature (same token as Slice 1). **Required** — the webhook rejects everything if it's unset. |
| `NEXT_PUBLIC_WHATSAPP_BOT_NUMBER` | The bot's WhatsApp number for the `wa.me` links on lot pages (digits or E.164). If unset, the "Pujar por WhatsApp" button just isn't shown. |
| `NEXT_PUBLIC_SITE_URL` | Used to build the Términos link the bot sends (`<site>/terminos`). Optional. |
| `TWILIO_WEBHOOK_URL` | Optional. Force the exact public URL used for signature validation, if the auto-detected `https://<host>/api/whatsapp` is ever wrong behind a proxy. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Already set — the webhook uses the service role to read/write contacts, provision bidders, and call `place_bid_for`. |

## Wire the webhook in Twilio
Point the WhatsApp sender's inbound webhook ("When a message comes in") to:

```
POST  https://<your-domain>/api/whatsapp
```

- **Sandbox:** Messaging → Try it out → WhatsApp sandbox → "When a message comes
  in" = that URL, method POST.
- **Production:** set it on your WhatsApp sender's messaging configuration.

The bot's replies are sent as TwiML in the webhook response. Because the user just
messaged you, the reply is inside the 24-hour window, so it needs **no** template
(unlike the Slice 1 business-initiated alerts).

## Test (sandbox)
1. Join the sandbox from your test phone (`join <code>` — see Slice 1 doc).
2. Set the webhook URL + `TWILIO_AUTH_TOKEN`, deploy.
3. Make sure at least one lot is `live` (note its code from the lot page).
4. From WhatsApp: send anything → get the terms prompt → `ACEPTO` → send your name
   → `PUJA <código> <monto>`. Confirm the bid shows in the app and you get the
   "puja registrada" reply.

---

## Security notes
- Every inbound request is signature-verified against `TWILIO_AUTH_TOKEN`; invalid
  or unsigned requests get 403 before any work.
- Auto-provisioning trusts WhatsApp's phone verification + Twilio's signature. A
  banned profile still can't bid (`place_bid_for` enforces it), and sellers can't
  bid on their own lots — same as the app.

## Not included (future slices)
- Interactive quick-reply buttons (+increment). Free-form text works today; buttons
  are a session-message enhancement that can be added later.
- The broadcast **Channel** (auto-posting new lots / "VENDIDO") — Slice 3.
