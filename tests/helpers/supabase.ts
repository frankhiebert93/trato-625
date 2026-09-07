import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

// Creates a confirmed phone user and returns an authenticated client for them.
export async function createTestUser(phone: string) {
  const admin = adminClient();
  const password = 'Test-passw0rd!';
  const { data, error } = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  });
  if (error) throw error;
  const userId = data.user!.id;

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: session, error: signErr } =
    await anon.auth.signInWithPassword({ phone, password });
  if (signErr) throw signErr;

  return { userId, client: anon, accessToken: session.session!.access_token };
}
