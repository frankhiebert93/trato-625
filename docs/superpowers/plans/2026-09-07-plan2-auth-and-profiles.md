# Plan 2 — Auth & Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let bidders and sellers sign in with a phone one-time code, auto-create
their profile, let them set their notification channel, and gate the admin area by
role — all client-side, consistent with the existing app.

**Architecture:** Auth is **client-side** using the existing browser Supabase
client (`lib/supabase.ts`); the session lives in the browser (localStorage) and
travels to Postgres as a JWT. All authorization is enforced in the database (RLS +
the `place_bid` RPC from Plan 1) — route guards are a UX convenience, not the
security boundary. A `handle_new_user` trigger creates a `profiles` row on signup.
Profile self-service is column-scoped so a user can change `display_name` /
`notify_channel` but never their own `role` / `is_banned`. Bidders and sellers use
**phone OTP**; the admin keeps the existing **email/password** login and is gated by
`profiles.role = 'admin'`.

**Tech Stack:** Next.js 16.2 / React 19 (client components), Supabase Auth (phone
OTP + email/password), Supabase Postgres (trigger + RLS), pgTAP, Vitest. Local
phone OTP uses Supabase's **test OTP** config (no real SMS provider needed for dev).

## Global Constraints

_Every task's requirements implicitly include this section._

- **Modified Next.js — verify APIs before writing app code:** _"This is NOT the
  Next.js you know. This version has breaking changes — APIs, conventions, and file
  structure may all differ from your training data. Read the relevant guide in
  `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."_
  (from `AGENTS.md`). For every UI task, mirror the existing client-component
  patterns already in the repo (`app/admin/page.tsx`, `app/page.tsx`) rather than
  recalling APIs from memory.
- **Auth is client-side** via `lib/supabase.ts`. Do NOT add `@supabase/ssr`,
  middleware, or server components for auth — the app has none and Capacitor loads
  the live site. The DB (RLS + `place_bid`) is the security boundary.
- **A user must never change their own `role` or `is_banned`** — enforce with
  column-scoped UPDATE privileges, not a blanket update policy.
- **Bidders/sellers → phone OTP. Admin → email/password + `role='admin'` gate.**
- **Spanish UI.** User-facing copy is Spanish.
- **The full existing test suite must stay green** (43 pgTAP + the Vitest
  concurrency test from Plan 1). Introducing the signup trigger requires updating
  the existing profile-seeding in tests/helpers — do it in Task 1.
- **Commit after each task** with a conventional-commit message.

---

## Phase 1 Roadmap position

This is **Plan 2 of 7**. Depends on Plan 1 (schema/RLS/engine, merged/branch
`feat/vehicle-auction-foundation`). Later plans (3 Seller+Stripe, 4 Admin+Settings,
5 Public UI, 6 Close+Notifications, 7 Cutover) build on the auth established here.

---

## File Structure (this plan)

- Create: `supabase/migrations/<ts>_profile_lifecycle.sql` — `handle_new_user`
  trigger, `profiles_self_update` policy, column-scoped UPDATE grant.
- Create: `supabase/tests/06_profiles_auth.test.sql` — pgTAP for the trigger + self-update rules.
- Modify: `supabase/tests/02_security.test.sql`, `04_place_bid.test.sql`,
  `05_reserve_behavior.test.sql` — make profile seeds upsert (trigger now pre-creates the row).
- Modify: `tests/helpers/supabase.ts` — drop the now-redundant manual profile insert.
- Modify: `supabase/config.toml` — enable local phone auth + test OTP.
- Create: `lib/auth.ts` — client auth/profile helpers.
- Create: `tests/auth.test.ts` — Vitest integration for the OTP flow + profile rules.
- Create: `lib/useUser.ts` — client hook exposing `{ user, profile, loading }`.
- Create: `app/entrar/page.tsx` — phone-OTP sign-in page (Spanish).
- Create: `app/perfil/page.tsx` — profile page: display name, notify channel, sign out.
- Modify: `app/admin/dashboard/page.tsx` — gate by `profiles.role = 'admin'`.

---

## Task 1: Profile lifecycle & self-service write access (DB)

**Files:**
- Create: `supabase/migrations/<ts>_profile_lifecycle.sql`
- Create: `supabase/tests/06_profiles_auth.test.sql`
- Modify: `supabase/tests/02_security.test.sql`, `supabase/tests/04_place_bid.test.sql`, `supabase/tests/05_reserve_behavior.test.sql`
- Modify: `tests/helpers/supabase.ts`

**Interfaces:**
- Produces:
  - Trigger `on_auth_user_created` → `public.handle_new_user()` inserts
    `public.profiles(id, phone)` on every `auth.users` insert (idempotent).
  - Policy `profiles_self_update` (UPDATE, authenticated, `id = auth.uid()`).
  - Column-scoped grant: `authenticated` may UPDATE only `display_name`,
    `notify_channel` on `public.profiles`.

- [ ] **Step 1: Create the migration**

```bash
supabase migration new profile_lifecycle
```

- [ ] **Step 2: Write the migration**

```sql
-- Auto-create a profile row whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Let a signed-in user edit ONLY their own display_name / notify_channel.
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Column-scoped: role and is_banned are NOT grantable to clients, so a user
-- can never self-promote or self-unban even under the policy above.
grant update (display_name, notify_channel) on public.profiles to authenticated;
```

- [ ] **Step 3: Make existing test seeds upsert (the trigger now pre-creates the row)**

Every existing test that does `insert into auth.users (...)` followed by
`insert into public.profiles (id, ...)` will now hit a duplicate-key error, because
the trigger already inserted that profile. In `02_security.test.sql`,
`04_place_bid.test.sql`, and `05_reserve_behavior.test.sql`, change each
`insert into public.profiles (id, role) values (...);` to set the fields on the
trigger-created row instead, e.g.:

```sql
-- was: insert into public.profiles (id, role) values ('...','seller');
insert into public.profiles (id, role) values ('...','seller')
  on conflict (id) do update set role = excluded.role;
```

For the banned bidder in `04_place_bid.test.sql`, also carry `is_banned`:

```sql
insert into public.profiles (id, role, is_banned) values ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0','bidder', true)
  on conflict (id) do update set role = excluded.role, is_banned = excluded.is_banned;
```

Apply the same `on conflict (id) do update set <the columns you set> = excluded.<col>`
to every profile-seeding insert in those three files. Do not change any assertions
or plan counts.

- [ ] **Step 4: Drop the redundant manual profile insert in the Vitest helper**

In `tests/helpers/supabase.ts`, `createTestUser` currently does
`await admin.from('profiles').insert({ id: userId })`. The trigger now creates that
row synchronously when the auth user is created, so **delete those two lines** (the
insert and its error check). The subsequent `admin.from('profiles').update(...)` in
the concurrency test still works because the row exists.

- [ ] **Step 5: Write the pgTAP test for the trigger + self-update rules**

Create `supabase/tests/06_profiles_auth.test.sql`:

```sql
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public;

begin;
select plan(7);

-- Trigger auto-creates a profile with matching id/phone and safe defaults.
insert into auth.users (id, aud, role, phone)
  values ('c0000000-0000-0000-0000-000000000001','authenticated','authenticated','+525500000001');
select is((select count(*) from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'),
          1::bigint, 'trigger created exactly one profile');
select is((select phone from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'),
          '+525500000001', 'trigger copied the phone');
select is((select role from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'),
          'bidder', 'new profile defaults to bidder');
select is((select is_banned from public.profiles where id = 'c0000000-0000-0000-0000-000000000001'),
          false, 'new profile is not banned');

-- A signed-in user can update their own notify_channel...
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok(
  $$ update public.profiles set notify_channel = 'sms' where id = 'c0000000-0000-0000-0000-000000000001' $$,
  'user can update their own notify_channel');
-- ...but NOT their role (column not granted → permission denied).
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'c0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'user cannot change their own role');
-- ...nor their is_banned flag.
select throws_ok(
  $$ update public.profiles set is_banned = false where id = 'c0000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'user cannot change their own is_banned');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 6: Reset and run the full DB suite — expect all green**

```bash
supabase db reset && supabase test db
```

Expected: every file passes — `01_schema` 12, `02_security` 5, `03_increment` 6,
`04_place_bid` 16, `05_reserve_behavior` 4, `06_profiles_auth` 7. If any existing
file errors with a duplicate-key on profiles, a seed in Step 3 was missed — fix it.

- [ ] **Step 7: Confirm the Vitest concurrency test still passes**

Ensure the local stack is up, then:

```bash
npm test
```

Expected: `concurrency.test.ts` still passes (the helper no longer inserts a
profile; the trigger does).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations supabase/tests tests/helpers/supabase.ts
git commit -m "feat(db): auto-create profiles on signup + column-scoped self-update"
```

---

## Task 2: Client auth helpers + local phone OTP

**Files:**
- Modify: `supabase/config.toml`
- Create: `lib/auth.ts`
- Create: `tests/auth.test.ts`

**Interfaces:**
- Consumes: `supabase` from `lib/supabase.ts`; the `handle_new_user` trigger (Task 1).
- Produces (`lib/auth.ts`):
  - `requestOtp(phone: string): Promise<{ error: string | null }>`
  - `verifyOtp(phone: string, token: string): Promise<{ error: string | null }>`
  - `signOut(): Promise<void>`
  - `getMyProfile(): Promise<Profile | null>` where
    `Profile = { id: string; phone: string | null; display_name: string | null; role: 'bidder'|'seller'|'admin'; notify_channel: 'whatsapp'|'sms' }`
  - `updateMyProfile(fields: { display_name?: string; notify_channel?: 'whatsapp'|'sms' }): Promise<{ error: string | null }>`

- [ ] **Step 1: Enable local phone auth + test OTP in `supabase/config.toml`**

Add (or uncomment/adjust) a phone-auth section so local dev issues a fixed code
without a real SMS provider. Place near the other `[auth.*]` blocks:

```toml
[auth.sms]
enable_signup = true
enable_confirmations = false

# Local/dev only: fixed codes for these numbers (no SMS is actually sent).
[auth.sms.test_otp]
"+525500000001" = "123456"
"+525500000002" = "123456"
```

> Verify the exact key format your CLI expects (run `supabase stop && supabase start`
> after editing, then test with `requestOtp`/`verifyOtp`). If GoTrue rejects the
> phone format, adjust the numbers to a format it accepts and mirror that in
> `tests/auth.test.ts`. Production SMS (Twilio et al.) is configured in the Supabase
> dashboard and is out of scope for this plan (carry-forward).

Also make the app's browser client reachable from the Vitest test. `tests/auth.test.ts`
imports `lib/supabase.ts`, which reads `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (the unprefixed `SUPABASE_*` in `.env.test` are only
read by `tests/helpers/supabase.ts`). Add the `NEXT_PUBLIC_`-prefixed pair to the
gitignored `.env.test`, pointing at the SAME local stack:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from `supabase status`>
```

(The Vitest setup already loads `.env.test`, so these reach `lib/supabase.ts` at test
time. Do not commit `.env.test`.)

- [ ] **Step 2: Write the failing Vitest test**

Create `tests/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { supabase } from '../lib/supabase';
import { requestOtp, verifyOtp, getMyProfile, updateMyProfile, signOut } from '../lib/auth';

const PHONE = '+525500000001';
const CODE = '123456';

describe('phone OTP auth + profile self-service', () => {
  it('signs in via test OTP, auto-creates a profile, and updates notify_channel', async () => {
    expect((await requestOtp(PHONE)).error).toBeNull();
    expect((await verifyOtp(PHONE, CODE)).error).toBeNull();

    const profile = await getMyProfile();
    expect(profile).not.toBeNull();
    expect(profile!.role).toBe('bidder');            // trigger default
    expect(profile!.phone).toBe(PHONE);

    expect((await updateMyProfile({ notify_channel: 'sms' })).error).toBeNull();
    expect((await getMyProfile())!.notify_channel).toBe('sms');

    await signOut();
    expect(await getMyProfile()).toBeNull();          // no session → no profile
  });
});
```

- [ ] **Step 3: Run it — expect FAIL**

```bash
npm test -- auth
```

Expected: FAIL — `lib/auth.ts` does not exist yet.

- [ ] **Step 4: Implement `lib/auth.ts`**

```ts
import { supabase } from './supabase';

export type Profile = {
  id: string;
  phone: string | null;
  display_name: string | null;
  role: 'bidder' | 'seller' | 'admin';
  notify_channel: 'whatsapp' | 'sms';
};

export async function requestOtp(phone: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  return { error: error?.message ?? null };
}

export async function verifyOtp(phone: string, token: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getMyProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, phone, display_name, role, notify_channel')
    .eq('id', auth.user.id)
    .single();
  if (error) return null;
  return data as Profile;
}

export async function updateMyProfile(
  fields: { display_name?: string; notify_channel?: 'whatsapp' | 'sms' },
): Promise<{ error: string | null }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'not signed in' };
  const { error } = await supabase.from('profiles').update(fields).eq('id', auth.user.id);
  return { error: error?.message ?? null };
}
```

- [ ] **Step 5: Run it — expect PASS**

```bash
npm test -- auth
```

Expected: PASS. (If it fails on the OTP format, revisit Step 1's `test_otp` config.)

- [ ] **Step 6: Commit**

```bash
git add supabase/config.toml lib/auth.ts tests/auth.test.ts
git commit -m "feat(auth): client phone-OTP helpers + profile self-service + local test OTP"
```

---

## Task 3: `useUser` hook + sign-in and profile pages (UI)

**Files:**
- Create: `lib/useUser.ts`
- Create: `app/entrar/page.tsx`
- Create: `app/perfil/page.tsx`

**Interfaces:**
- Consumes: `lib/auth.ts` (Task 2); `supabase` from `lib/supabase.ts`.
- Produces: `useUser(): { user, profile, loading }` — a client hook.

> **Before writing:** read `app/admin/page.tsx` and `app/page.tsx` to copy this
> repo's client-component conventions (`'use client'`, `useState`/`useEffect`,
> `useRouter` from `next/navigation`), and skim the relevant guide under
> `node_modules/next/dist/docs/01-app/` for anything that differs from your training.

- [ ] **Step 1: Implement `lib/useUser.ts`**

A client hook that tracks the session and the current profile. Requirements:
- `'use client'` at the top.
- On mount: call `supabase.auth.getUser()`, and if there is a user, load the
  profile via `getMyProfile()`.
- Subscribe with `supabase.auth.onAuthStateChange(...)` and update state on
  sign-in/sign-out; unsubscribe on unmount.
- Return `{ user, profile, loading }` where `user` is the Supabase user (or null),
  `profile` is the `Profile` (or null), `loading` is true until the first resolve.

- [ ] **Step 2: Implement `app/entrar/page.tsx` (Spanish phone-OTP sign-in)**

Client page with two phases in local state (`'phone' | 'code'`):
- Phase `phone`: a phone input + "Enviar código" button → calls `requestOtp(phone)`;
  on success switch to phase `code`; on error show the message.
- Phase `code`: a code input + "Verificar" button → calls `verifyOtp(phone, code)`;
  on success `router.push('/')` (or `/perfil`); on error show the message.
- Mirror the loading/error state handling in `app/admin/page.tsx`. Spanish labels
  (e.g. "Número de teléfono", "Enviar código", "Código", "Verificar").

- [ ] **Step 3: Implement `app/perfil/page.tsx` (profile)**

Client page using `useUser()`:
- If `loading`, show a simple loading state; if no `user`, `router.push('/entrar')`.
- Show/edit `display_name` (text input) and `notify_channel` (a WhatsApp/SMS
  toggle or select), saved via `updateMyProfile(...)`; show a saved/err indicator.
- A "Cerrar sesión" (sign out) button → `signOut()` then `router.push('/')`.
- Spanish labels (e.g. "Tu perfil", "Nombre", "Cómo quieres recibir avisos",
  "WhatsApp" / "SMS", "Guardar", "Cerrar sesión").

- [ ] **Step 4: Verify in the browser (logic is already unit-tested in Task 2)**

Start the dev server and the local Supabase stack. In the browser preview:
1. Go to `/entrar`, enter `+525500000001`, send code, enter `123456`, verify →
   should redirect and establish a session.
2. Go to `/perfil` → shows the profile; change notify channel to SMS, save →
   reload confirms it persisted; sign out → redirected and session cleared.

Capture a screenshot of `/perfil` signed in. Report any console/network errors.
(There is no unit test for the pages themselves — the auth/profile logic they call
is covered by `tests/auth.test.ts`; these pages are thin wiring over it.)

- [ ] **Step 5: Commit**

```bash
git add lib/useUser.ts app/entrar/page.tsx app/perfil/page.tsx
git commit -m "feat(auth): useUser hook, phone-OTP sign-in page, and profile page"
```

---

## Task 4: Admin-role guard

**Files:**
- Modify: `app/admin/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useUser()` (Task 3).

> **Before writing:** read the current `app/admin/dashboard/page.tsx` to see how it
> loads and what it renders, and `app/admin/page.tsx` for the existing
> email/password login + `useRouter` redirect pattern. Do not convert admin to
> phone OTP — it stays email/password.

- [ ] **Step 1: Add the role guard to the dashboard**

At the top of the dashboard component, use `useUser()`:
- While `loading`, render a loading state.
- If there is no `user`, `router.push('/admin')` (the existing admin login).
- If there is a `user` but `profile?.role !== 'admin'`, render an "acceso
  denegado" (access denied) message and do not render the dashboard body.
- Only when `profile?.role === 'admin'` render the existing dashboard content.

Keep all existing dashboard functionality; only wrap it with the guard.

- [ ] **Step 2: Document promoting a user to admin**

The signup trigger gives every new user `role = 'bidder'`, including the
email/password admin account. Add a short comment block at the top of
`app/admin/dashboard/page.tsx` (or a note in the repo's admin docs if one exists)
recording the one-time promotion, run against the project DB by an operator:

```sql
-- Promote the operator account to admin (run once, server-side):
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = '<admin-email>');
```

(This is an operator action, not app code. The `add-user` skill can also do it.)

- [ ] **Step 3: Verify in the browser**

1. Signed in as a non-admin (phone OTP user), visit `/admin/dashboard` → access
   denied, dashboard body not rendered.
2. Sign in as the admin (email/password) whose profile role is `admin` → dashboard
   renders. (Locally: create an email user, then run the promotion SQL against the
   local DB.)

Capture a screenshot of the access-denied state. Report console/network errors.

- [ ] **Step 4: Commit**

```bash
git add app/admin/dashboard/page.tsx
git commit -m "feat(auth): gate the admin dashboard by profiles.role = 'admin'"
```

---

## Self-Review

**Spec coverage (Plan 2 scope):**
- Phone-OTP sign-in for bidders/sellers → Task 2 (`requestOtp`/`verifyOtp`) + Task 3 (`/entrar`). ✅
- Auto-create profile on signup → Task 1 (`handle_new_user` trigger). ✅
- `notify_channel` (WhatsApp/SMS) self-service → Task 2 (`updateMyProfile`) + Task 3 (`/perfil`). ✅
- Admin-role guard → Task 4; admin stays email/password. ✅
- Security: a user cannot self-promote or self-unban → Task 1 (column-scoped UPDATE grant + pgTAP). ✅
- Full existing suite stays green → Task 1 Steps 3–7 (seed upserts + helper change + reruns). ✅

**Placeholder scan:** none — every DB and TS artifact is given in full; the UI tasks
give exact files, interfaces, behavior, the existing patterns to mirror, and browser
verification steps (the underlying logic is unit-tested in Task 2). `<admin-email>`
in Task 4 Step 2 is an operator-supplied value in a documented one-off SQL snippet,
not app code.

**Type consistency:** `Profile` (id, phone, display_name, role, notify_channel) is
defined once in `lib/auth.ts` and consumed by `useUser`, `/perfil`, and the admin
guard. `requestOtp`/`verifyOtp`/`getMyProfile`/`updateMyProfile`/`signOut`
signatures match between Task 2's definition and Tasks 3–4's usage.

**Ambiguity check:** phone OTP uses `type: 'sms'` in `verifyOtp` (matches the
`[auth.sms]` provider). Test OTP format is flagged as verify-and-adjust in Task 2.

**Carry-forwards / notes:**
- Production SMS provider (Twilio) config is done in the Supabase dashboard — out of
  scope here; note it before real bidders sign in.
- Later plans reuse `useUser`/`getMyProfile` for gating seller submission (Plan 3)
  and admin ops (Plan 4).
- Plan 1's deferred items still stand (enforce `ends_at NOT NULL` at publish, etc.).
