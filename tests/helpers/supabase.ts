import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.SUPABASE_ANON_KEY!;

export function adminClient(): SupabaseClient {
  return createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

export function userClient(accessToken: string): SupabaseClient {
  return createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

// Creates a confirmed user AND its profiles row (place_bid's BANNED guard
// rejects users without a profile), and returns an authenticated client.
export async function createTestUser(phone: string) {
  const admin = adminClient();
  const password = 'Test-passw0rd!';
  const email = `${phone.replace(/[^0-9]/g, '')}-${randomUUID()}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user!.id;

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: session, error: signErr } =
    await anon.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;

  return { userId, client: anon, accessToken: session.session!.access_token };
}
