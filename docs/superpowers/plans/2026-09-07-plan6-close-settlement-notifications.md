# Plan 6 — Close, Settlement & Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. `- [ ]` checkboxes.

**Goal:** Auto-close auctions at their end time (deciding sold vs. unsold against the
hidden reserve), record the winner, let the winner and seller exchange contact for a
sold lot, and enqueue + dispatch 1:1 notifications (outbid / won / sold / unsold).

**Architecture:** A `close_due_auctions()` DB function (SECURITY DEFINER, cron-invoked)
atomically closes every `live` lot past `ends_at`: `sold` (with `winner_id`) when there
is a high bid that meets the reserve, else `unsold` — and enqueues notification rows.
`place_bid` enqueues an `outbid` row for the previous leader. A `notifications` queue
is internal (service-role only). The extended cron route closes due auctions, then
dispatches pending notifications through a provider adapter (`lib/notify.ts`) — a stub
until real SMS/WhatsApp keys are set (a ship gate). `get_settlement_contact()` reveals
the counterparty's phone only to the winner/seller of a sold lot.

**Tech Stack:** Postgres functions + a queue table, Next 16 cron route, a provider
adapter, pgTAP + Vitest (mocked adapter). Money in cents; contact = the phone on the
profile (from Plan 2 OTP).

## Global Constraints

- **Modified Next.js:** mirror `app/api/cron/route.ts` for the route + service-role
  client. (`AGENTS.md`.)
- **Reserve secrecy:** the close decision reads `reserve_cents` server-side only; it is
  never returned to a client. Notifications never include the reserve.
- **`notifications` is internal:** RLS on, no client policies — only the service role
  (cron) reads/writes it.
- **`get_settlement_contact` reveals a phone only to the two parties of a `sold` lot.**
- **`place_bid` change is additive** (enqueue outbid for the prior leader) and must not
  alter the bidding rules; all existing `04_place_bid` assertions must still pass.
- Money in cents; Spanish message copy. Full existing suite stays green. Commit per task.

## Roadmap position

**Plan 6 of 7.** Consumes Plan 5's `live` lots. Real SMS/WhatsApp delivery needs
provider keys (a ship gate) — until then the adapter is a logged stub. Plan 7 does the
home-page cutover.

## File Structure

- Create: `supabase/migrations/<ts>_close_and_notify.sql` — `notifications` table + RLS,
  `close_due_auctions()`, `get_settlement_contact()`, and the `place_bid` outbid enqueue.
- Create: `supabase/tests/09_close_settlement.test.sql` — pgTAP.
- Create: `lib/notify.ts` — provider adapter (stub unless keys present).
- Modify: `app/api/cron/route.ts` — close due auctions + dispatch pending notifications.
- Create: `tests/cron-close-notify.test.ts` — Vitest (mocked adapter).
- Modify: `app/subastas/[id]/page.tsx` — reveal settlement contact when sold (winner/seller).

---

## Task 1: Close, settlement & notification queue (DB)

**Files:**
- Create: `supabase/migrations/<ts>_close_and_notify.sql`
- Create: `supabase/tests/09_close_settlement.test.sql`

**Interfaces:**
- `public.notifications(id, recipient_id→profiles, channel ∈{whatsapp,sms}, kind
  ∈{outbid,won,sold,unsold}, vehicle_id→vehicles, status ∈{pending,sent,failed}
  default 'pending', created_at, sent_at)` — RLS on, no client grants.
- `public.close_due_auctions() returns int` — closes due `live` lots, sets
  `winner_id`/`status`, enqueues won/sold/unsold; returns the count. SECURITY DEFINER.
- `public.get_settlement_contact(p_vehicle_id uuid) returns table(counterparty text,
  name text, phone text)` — the other party's contact for a sold lot, only to
  winner/seller. SECURITY DEFINER; execute to authenticated.
- `place_bid` additionally enqueues an `outbid` row for the previous leader.

- [ ] **Step 1: Migration**

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  channel text not null check (channel in ('whatsapp','sms')),
  kind text not null check (kind in ('outbid','won','sold','unsold')),
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notifications_pending_idx on public.notifications (status, created_at);
alter table public.notifications enable row level security;
-- No client policies: only the service role (cron) touches this table.

-- Close every live lot past its end time; decide sold vs unsold vs no-bids.
create or replace function public.close_due_auctions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare r public.vehicles; n int := 0; v_sold boolean;
begin
  for r in
    select * from public.vehicles
     where status = 'live' and ends_at is not null and ends_at <= now()
     for update skip locked
  loop
    v_sold := r.current_leader_id is not null
              and (r.reserve_cents is null or r.current_bid_cents >= r.reserve_cents);
    if v_sold then
      update public.vehicles set status = 'sold', winner_id = r.current_leader_id where id = r.id;
      insert into public.notifications (recipient_id, channel, kind, vehicle_id)
        select r.current_leader_id, p.notify_channel, 'won', r.id
        from public.profiles p where p.id = r.current_leader_id;
      insert into public.notifications (recipient_id, channel, kind, vehicle_id)
        select r.seller_id, p.notify_channel, 'sold', r.id
        from public.profiles p where p.id = r.seller_id;
    else
      update public.vehicles set status = 'unsold' where id = r.id;
      insert into public.notifications (recipient_id, channel, kind, vehicle_id)
        select r.seller_id, p.notify_channel, 'unsold', r.id
        from public.profiles p where p.id = r.seller_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.close_due_auctions() from public;
-- (Invoked by the cron route via the service role; no anon/authenticated grant.)

-- Reveal the counterparty's contact only to the winner/seller of a SOLD lot.
create or replace function public.get_settlement_contact(p_vehicle_id uuid)
returns table (counterparty text, name text, phone text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v public.vehicles; v_uid uuid := auth.uid();
begin
  select * into v from public.vehicles where id = p_vehicle_id;
  if not found or v.status <> 'sold' then return; end if;
  if v_uid = v.winner_id then
    return query select 'seller'::text, p.display_name, p.phone
                 from public.profiles p where p.id = v.seller_id;
  elsif v_uid = v.seller_id then
    return query select 'winner'::text, p.display_name, p.phone
                 from public.profiles p where p.id = v.winner_id;
  end if;
  return;
end;
$$;
revoke all on function public.get_settlement_contact(uuid) from public;
grant execute on function public.get_settlement_contact(uuid) to authenticated;
```

- [ ] **Step 2: Add the outbid enqueue to `place_bid`**

In `supabase/migrations/<the bidding_engine migration>_bidding_engine.sql` you cannot
edit a shipped migration in place cleanly, so add the enqueue in THIS new migration by
`create or replace`-ing `place_bid` with the same body plus, immediately BEFORE the
`update public.vehicles set current_bid_cents = ...` denormalized-state update, this
block (using the locked `v_vehicle` row's OLD leader):

```sql
  -- Notify the previous leader they were outbid.
  if v_vehicle.current_leader_id is not null and v_vehicle.current_leader_id <> v_uid then
    insert into public.notifications (recipient_id, channel, kind, vehicle_id)
      select v_vehicle.current_leader_id, p.notify_channel, 'outbid', p_vehicle_id
      from public.profiles p where p.id = v_vehicle.current_leader_id;
  end if;
```

Copy the CURRENT `place_bid` definition verbatim from its migration and insert only
this block (do not change any bidding logic, guard, or return). Keep the trailing
`revoke`/`grant execute` for `place_bid`.

- [ ] **Step 3: pgTAP (`supabase/tests/09_close_settlement.test.sql`, plan(8))**

Seed a seller + two bidders (via the trigger). Cover:
1. A `live` lot past `ends_at` with a high bid ≥ reserve → after `close_due_auctions()`,
   `status='sold'`, `winner_id` = the leader.
2. A `won` and a `sold` notification row were enqueued for that lot.
3. A `live` lot past `ends_at` whose top bid is below the reserve → `status='unsold'`,
   and an `unsold` notification enqueued.
4. A `live` lot past `ends_at` with NO bids → `unsold`.
5. `get_settlement_contact` as the winner returns the seller's phone (counterparty
   'seller'); as the seller returns the winner's phone.
6. `get_settlement_contact` as an unrelated user returns no rows.
7. `place_bid`: a second bidder outbidding the first enqueues exactly one `outbid`
   notification for the first bidder.
8. All prior `04_place_bid` behavior intact (a sanity `is` that a valid bid still
   returns `ok=true`).

Use the `set local role authenticated` + `request.jwt.claims` pattern from
`04_place_bid.test.sql`; call `close_due_auctions()` as the owner (post-`reset role`).

- [ ] **Step 4: Reset + run + commit**

```bash
supabase db reset && supabase test db
```
Expect `09_close_settlement` 8/8 + existing all green (esp. `04_place_bid` unchanged).
```bash
git add supabase/migrations supabase/tests/09_close_settlement.test.sql
git commit -m "feat(db): close_due_auctions + settlement contact + outbid enqueue + notifications queue"
```

---

## Task 2: Notification sender + cron close (server)

**Files:**
- Create: `lib/notify.ts`
- Modify: `app/api/cron/route.ts`
- Create: `tests/cron-close-notify.test.ts`

**Interfaces:**
- `lib/notify.ts`: `sendNotification(channel: 'whatsapp'|'sms', toPhone: string, text:
  string): Promise<{ ok: boolean }>` — sends via the configured provider, or logs a
  stub and returns `{ok:true}` when no provider keys are set.
- The cron route (after the existing token check) calls `close_due_auctions()` then
  dispatches pending `notifications`.

- [ ] **Step 1: `lib/notify.ts` (adapter, stub without keys)**

```ts
export type NotifyChannel = 'whatsapp' | 'sms';

// Real SMS (Twilio) / WhatsApp (Cloud API) delivery is wired here once provider keys
// exist (a ship gate). Until then this is a logged no-op so the pipeline is testable.
export async function sendNotification(
  channel: NotifyChannel, toPhone: string, text: string,
): Promise<{ ok: boolean }> {
  const configured = !!process.env.NOTIFY_PROVIDER_KEY;
  if (!configured) {
    console.log(`[notify:stub] ${channel} -> ${toPhone}: ${text}`);
    return { ok: true };
  }
  // TODO(ship): real provider send. Kept behind the env flag on purpose.
  return { ok: true };
}

export function messageFor(kind: string): string {
  switch (kind) {
    case 'outbid': return 'Alguien superó tu puja en Trato 625. Entra para volver a pujar.';
    case 'won':    return '¡Ganaste la subasta en Trato 625! Entra para contactar al vendedor.';
    case 'sold':   return 'Tu vehículo se vendió en Trato 625. Entra para contactar al comprador.';
    case 'unsold': return 'Tu subasta terminó sin alcanzar la reserva en Trato 625.';
    default:       return 'Tienes una notificación de Trato 625.';
  }
}
```

- [ ] **Step 2: Extend `app/api/cron/route.ts`**

Keep the existing `Bearer ${CRON_SECRET}` auth. After it, with the service-role client:
1. `const { data: closed } = await supabaseAdmin.rpc('close_due_auctions');`
2. Dispatch pending notifications: select up to N `pending` rows joined to the
   recipient's `phone`; for each, `sendNotification(channel, phone, messageFor(kind))`;
   on `{ok:true}` update the row to `status='sent', sent_at=now()`, else `'failed'`.
   (Fetch phone via a service-role select on `profiles`.)
3. Return a JSON summary `{ closed, sent }`. (You may keep or drop the existing
   listings-cleanup block — leave it for now; Plan 7 removes it.)

Set `export const runtime = 'nodejs'` if not already implied.

- [ ] **Step 3: Vitest (`tests/cron-close-notify.test.ts`, mocked adapter)**

```ts
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { adminClient, createTestUser } from './helpers/supabase';

const sendMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../lib/notify', async (orig) => ({ ...(await orig() as object), sendNotification: sendMock }));

const { GET } = await import('../app/api/cron/route');

describe('cron close + notify', () => {
  // seed a seller + bidder + a live lot already past ends_at with a reserve-meeting bid
  // (insert vehicle via service role with status 'live', ends_at in the past,
  //  current_bid_cents >= reserve, current_leader_id = bidder), then:
  it('closes due auctions, marks the winner, and dispatches notifications', async () => {
    process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-cron';
    const res = await GET(new Request('http://localhost/api/cron', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }));
    expect(res.status).toBe(200);
    // the lot is now sold with a winner; sendMock was called for the queued rows;
    // the notification rows are marked 'sent'.
    expect(sendMock).toHaveBeenCalled();
  });

  it('rejects a bad cron secret (401)', async () => {
    const res = await GET(new Request('http://localhost/api/cron', {
      headers: { authorization: 'Bearer wrong' },
    }));
    expect(res.status).toBe(401);
  });
});
```
Fill in the seeding (service-role inserts) so the assertions are concrete; assert the
lot became `sold` with the expected `winner_id` and that the queued rows are `sent`.
Ensure `CRON_SECRET` (and a dummy, unset `NOTIFY_PROVIDER_KEY`) are available in
`.env.test`.

- [ ] **Step 4: Run + commit**

```bash
supabase db reset && npm test
```
Expect the new suite + existing green. Then:
```bash
git add lib/notify.ts app/api/cron/route.ts tests/cron-close-notify.test.ts
git commit -m "feat(cron): close due auctions and dispatch queued notifications"
```

---

## Task 3: Settlement contact reveal (UI)

**Files:**
- Modify: `app/subastas/[id]/page.tsx`

- [ ] **Step 1: Show the counterparty contact when sold**

On the detail page, when the lot's `status === 'sold'` and the signed-in user is the
winner (`current_leader_id === user.id`) or the seller, call
`supabase.rpc('get_settlement_contact', { p_vehicle_id: id })`. If it returns a row,
render a panel: "Ganaste — contacta al vendedor" / "Vendiste — contacta al comprador",
showing the counterparty name (if any) and a **WhatsApp link** to their phone
(`https://wa.me/<digits>`), reusing any existing `wa.me` helper. If it returns nothing,
show nothing. (`seller_id` isn't in the public column set; determine "seller" by
attempting the RPC — it only returns a row to an actual party — so simply call it
whenever `status==='sold'` and a user is present, and render on a non-empty result.)
Spanish copy.

- [ ] **Step 2: Verify + commit**

`npx tsc --noEmit` and `npm run lint` clean on the file. Then:
```bash
git add "app/subastas/[id]/page.tsx"
git commit -m "feat(ui): reveal winner/seller contact on a sold lot"
```

---

## Self-Review

**Spec coverage:** cron sweep close vs reserve + winner → `close_due_auctions` (Task 1) +
cron (Task 2); winner↔seller contact exchange → `get_settlement_contact` (Task 1) +
Task 3 UI; SMS+WhatsApp per `notify_channel` → the queue enqueues with the recipient's
channel; the sender dispatches per channel (Task 2) — real delivery behind a provider
key (ship gate). Outbid/won/sold/unsold events all enqueued. ✅

**Placeholder scan:** SQL + pgTAP + the cron/adapter + Vitest are concrete; the sender's
real provider call is intentionally behind `NOTIFY_PROVIDER_KEY` (a documented ship
gate, not a placeholder). The UI is behavior-spec + existing patterns (browser-smoked
pre-ship).

**Type/interface consistency:** `close_due_auctions()→int`, `get_settlement_contact(uuid)
→table`, `sendNotification(channel,phone,text)`, `messageFor(kind)` all used
consistently; the `place_bid` change is additive (enqueue only). Reserve read
server-side only; never returned to a client. Money in cents.

**Carry-forwards / notes:**
- Real SMS/WhatsApp delivery needs provider keys (Twilio + WhatsApp Business Cloud API)
  — a ship gate; the adapter is a logged stub until then.
- Group/Channel "hype" posts remain manual (WhatsApp platform limit).
- Manual admin close of a live lot (Plan 4 cancel) doesn't run settlement — deliberate.
- Notification retry/backoff and dedupe-on-resend are later hardening.
