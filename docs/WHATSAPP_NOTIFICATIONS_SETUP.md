# WhatsApp / SMS Notification Delivery — trato625

This wires the **outbound** notifications (outbid / won / sold / unsold) to real
delivery via **Twilio**. It is separate from sign-in OTP (see `SMS_AUTH_SETUP.md`)
and separate from the future two-way WhatsApp *bidding bot* (not built yet).

The pipeline itself already works: the cron closes lots, enqueues rows in the
`notifications` table with each recipient's `notify_channel` (`whatsapp` by
default), and dispatches them through `lib/notify.ts`. Until Twilio env vars are
set, `lib/notify.ts` is a logged no-op (`[notify:stub] ...`) and rows queue unsent
— nothing breaks, they just don't deliver.

---

## The one WhatsApp rule you must know

WhatsApp only lets a business send **free-form** text to a user within **24 hours
of that user's last message** to your number (the "customer-service window").

Our alerts (outbid / won / sold / unsold) are **business-initiated** and go out
whenever an auction event happens — almost always **outside** that window. So on
WhatsApp they **must** use a **pre-approved Message Template**. Free-form text sent
outside the window is silently **not delivered**.

Consequence: WhatsApp delivery is blocked until you create + get approval for the
four templates below (approval is usually minutes-to-hours for the *utility*
category). **SMS has no such rule** and works as soon as Twilio SMS is configured —
so if you want delivery today, you can point recipients at SMS while the WhatsApp
templates are in review.

---

## Environment variables (set in Vercel → Project → Settings → Environment Variables)

| Variable | Needed for | What it is |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | both | Twilio Account SID (`AC…`). This + auth token is what flips `lib/notify.ts` from stub to live. |
| `TWILIO_AUTH_TOKEN` | both | Twilio Auth Token (keep secret). |
| `TWILIO_WHATSAPP_FROM` | WhatsApp | The E.164 number of your WhatsApp sender, e.g. `+14155238886` (the Twilio sandbox number) or your own approved WhatsApp Business number. The code prefixes `whatsapp:` automatically. |
| `TWILIO_WA_TEMPLATE_OUTBID` | WhatsApp | Content SID (`HX…`) of the approved **outbid** template. |
| `TWILIO_WA_TEMPLATE_WON` | WhatsApp | Content SID of the approved **won** template. |
| `TWILIO_WA_TEMPLATE_SOLD` | WhatsApp | Content SID of the approved **sold** template. |
| `TWILIO_WA_TEMPLATE_UNSOLD` | WhatsApp | Content SID of the approved **unsold** template. |
| `TWILIO_MESSAGING_SERVICE_SID` | SMS | Messaging Service SID (`MG…`). Preferred for Mexico deliverability. |
| `TWILIO_SMS_FROM` | SMS | A from-number, used only if no Messaging Service SID is set. |

Notes:
- If only `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` are present but a channel's
  sender is missing, that channel is skipped (logged) and its rows are marked
  `failed` — the other channel still sends.
- If a WhatsApp template SID for a given kind is **not** set, the code sends plain
  `Body` text instead. That only delivers in the **sandbox** or an open 24h session
  — use it for testing, not production.

---

## Fast path to test (Twilio WhatsApp sandbox, no approval needed)

1. Twilio Console → **Messaging → Try it out → Send a WhatsApp message**. Note the
   sandbox number (usually `+1 415 523 8886`) and the join code.
2. From the phone you'll test with, send `join <code>` to that number on WhatsApp.
   (Sandbox only talks to numbers that have joined.)
3. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
   `TWILIO_WHATSAPP_FROM=+14155238886`. Leave the `TWILIO_WA_TEMPLATE_*` unset so
   the code uses plain `Body`.
4. Trigger a notification (e.g. get outbid on a live lot, or let a lot close) and
   confirm the WhatsApp message arrives. This proves the wiring end-to-end before
   you invest in production templates.

---

## Production path (approved templates)

1. **Meta Business verification + WhatsApp sender.** In Twilio, register a WhatsApp
   Business sender (your own number) — this requires a Meta Business account and
   display-name review. Follow Twilio's "WhatsApp Senders" onboarding.
2. **Create the four templates** as Twilio **Content Templates** (category:
   **utility** — these are transactional, not marketing), in **Spanish**. Suggested
   copy (static, no variables — matches `messageFor()` in `lib/notify.ts`):

   - **outbid** — `Alguien superó tu puja en Trato 625. Entra para volver a pujar.`
   - **won** — `¡Ganaste la subasta en Trato 625! Entra para contactar al vendedor.`
   - **sold** — `Tu vehículo se vendió en Trato 625. Entra para contactar al comprador.`
   - **unsold** — `Tu subasta terminó sin alcanzar la reserva en Trato 625.`

   > Tip: templates read better with the lot name. If you want that, add a `{{1}}`
   > variable to each template and extend `lib/notify.ts` to pass `ContentVariables`
   > (the code has a comment marking exactly where). Keeping them static is fine to
   > launch.
3. **Submit for approval** and wait for each to reach **Approved**.
4. Copy each approved template's **Content SID** (`HX…`) into the matching
   `TWILIO_WA_TEMPLATE_*` env var, set `TWILIO_WHATSAPP_FROM` to your production
   sender number, redeploy.
5. Trigger a real notification and confirm delivery.

---

## Costs & notes
- WhatsApp is billed per **conversation** (a 24h window), utility conversations are
  cheap in Mexico; SMS is billed per message. Volume here is one message per
  auction event per recipient — low.
- Keep the Auth Token in Vercel env only; never commit it.
- `notify_channel` is per profile (`whatsapp` by default) and user-editable in the
  app, so each recipient gets whichever channel they chose.
