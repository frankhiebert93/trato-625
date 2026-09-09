# WhatsApp Channel Megaphone — trato625 (Slice 3)

Turns auction activity into ready-to-paste posts for your public **WhatsApp
Channel** (Canales) — the social-proof surface that builds trust and funnels
people into the 1:1 bidding bot (Slice 2).

## Why it's copy-paste, not automatic
WhatsApp **Channels have no compliant posting API.** The official Cloud API
covers 1:1 messaging only; the only "channel post API" offerings are unofficial
web-protocol libraries that violate WhatsApp's terms and get numbers banned —
exactly the wrong foundation for a trust product. So this feature **generates the
post** and you paste it into the Channel (a few taps, a few times a day). Zero
cost, zero ban risk, purely additive.

## How it works
- When a lot **goes live**, the close/go-live sweep queues a `new_lot` post; when a
  lot **sells**, it queues a `sold` post (`channel_posts` table, idempotent).
- The admin dashboard → **📢 Canal de WhatsApp** lists pending posts with the
  finished Spanish text and a **Copiar** button. `new_lot` posts include a
  `wa.me` link that prefills `PUJA <código>` so a reader lands straight in the bot.
- You paste it into your Channel, then hit **Marcar publicado** (or **Descartar**).

Example `new_lot` post:
```
🚗 NUEVA SUBASTA — Toyota Tacoma 2019
Puja inicial: $150,000 MXN · código T1042

Puja por WhatsApp 👇
https://wa.me/5215512345678?text=PUJA%20T1042%20
```

Example `sold` post:
```
✅ VENDIDO — Toyota Tacoma 2019
Precio final: $180,500 MXN · 7 pujas

¡Gracias por participar! Muy pronto más subastas. 🔥
Ver subastas activas: https://trato625.mx/subastas
```

## Setup
1. **Apply the migration** `supabase/migrations/20260909130000_channel_posts.sql`
   (adds `channel_posts` and adds one enqueue line each to `close_due_auctions`
   and `_go_live_event`). Paste it into the Supabase SQL editor.
2. **Env vars** (client-side, for the generated text):
   - `NEXT_PUBLIC_WHATSAPP_BOT_NUMBER` — the bot's number, so `new_lot` posts carry
     the `wa.me` bid link. Without it the post uses the site link instead.
   - `NEXT_PUBLIC_SITE_URL` — used for the "ver subastas" / "puja aquí" links.
3. **Create the Channel** in WhatsApp (one-time, manual) and share/pin it.

## Notes
- Posts are only generated going forward (from the next go-live / sale). Nothing
  backfills historical lots.
- Marking published/dismissed only clears it from the queue; it does not post
  anything itself.
- This is the manual-paste path you chose. If volume ever grows, the alternative
  is auto-broadcast to opted-in subscribers via Twilio Bulk Messaging + approved
  templates (per-message cost) — not built here.
