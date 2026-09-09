# SMS / Phone-OTP Setup — trato625 (required for launch)

Bidders and sellers sign in with a phone one-time code. On the **hosted** Supabase
project you must configure a real **SMS provider**, or `signInWithOtp({ phone })`
fails and nobody can log in. (The `test_otp` we use locally is in `config.toml` and is
**local-only** — it does nothing on the hosted project.)

This is the one hard blocker for a functional launch.

> **Scope:** this doc covers **Auth SMS** (so sign-in works — required). The separate
> *notification delivery* for outbid/won/sold texts (`lib/notify.ts` +
> `NOTIFY_PROVIDER_KEY`) is **optional** and can be added later; without it those
> notifications just queue unsent, which doesn't block anything.

---

## Recommended: Twilio (Programmable SMS)

Supabase supports Twilio, Twilio Verify, MessageBird, Vonage, and Textlocal. Twilio is
the most common and best documented. (WhatsApp-based OTP is possible via Twilio Verify
— see the note at the end — but plain SMS is the simplest reliable start.)

### Step 1 — Twilio account + credentials
1. Create/sign in at twilio.com. Upgrade out of pure trial if you want to send to any
   number (trial can only send to verified numbers).
2. From the Twilio **Console** copy your **Account SID** and **Auth Token**.
3. Create a **Messaging Service** (Twilio → Messaging → Services → Create) and add a
   **sender** to it (a Twilio phone number capable of SMS). Copy the **Messaging
   Service SID** (starts `MG…`). Supabase uses this to send.

### Step 2 — ⚠️ Enable Mexico sending (the #1 gotcha)
Your users are in Mexico (`+52`). In Twilio → **Messaging → Settings → Geo
permissions**, make sure **Mexico** is enabled for SMS. Also confirm your sender is
allowed to deliver to Mexico — MX has strict rules; a Messaging Service with an
appropriate number/sender is the reliable route. **Test to a real +52 number early.**

### Step 3 — Configure it in Supabase (hosted project)
Supabase Dashboard → your project → **Authentication → Providers → Phone**:
1. **Enable** the Phone provider.
2. Provider = **Twilio**. Paste:
   - **Account SID** (`AC…`)
   - **Auth Token**
   - **Message Service SID** (`MG…`)  *(or a from-number if the UI asks for one)*
3. Save. (Optional: Authentication → **Rate limits** — the default SMS/hour cap is
   fine to start; raise it if you expect volume. Authentication → **Templates** lets
   you customize the OTP message text.)

### Step 4 — Verify
After the site is deployed (the cutover), go to `/entrar`, enter a real Mexican
number, and confirm you receive the code by SMS and can sign in. (You can also test
straight from the Supabase Auth screen.)

---

## Costs & notes
- Twilio charges per SMS (Mexico is a few US cents each) plus a monthly number fee.
  OTP volume = one SMS per sign-in attempt.
- **Trial accounts** only send to numbers you've verified in Twilio — fine for your own
  testing, but upgrade before real users.
- Keep the Twilio Auth Token secret (it lives only in the Supabase provider config).

## Optional later — WhatsApp OTP
Mexico has heavy WhatsApp usage, and it can be cheaper/more reliable than SMS. To use
it you'd switch Supabase to **Twilio Verify** with the **WhatsApp channel** (needs a
WhatsApp-enabled Twilio sender / Meta Business approval). Start with SMS; move to
WhatsApp Verify later if SMS deliverability or cost is a problem.

## Optional later — notification delivery (not required to launch)
`lib/notify.ts` sends outbid/won/sold/unsold alerts via Twilio (SMS and/or
WhatsApp) once Twilio env vars are set; until then it's a logged no-op and those
rows queue in `notifications` unsent — the auction still works end to end. Full
setup (env vars, WhatsApp templates, sandbox testing) is in
**`WHATSAPP_NOTIFICATIONS_SETUP.md`**.
