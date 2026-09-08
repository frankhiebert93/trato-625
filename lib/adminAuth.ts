import { createClient, SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function requireAdmin(
  request: Request,
): Promise<{ ok: true; admin: SupabaseClient } | { ok: false; status: number }> {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { ok: false, status: 401 };
  const userClient = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error } = await userClient.rpc('is_admin');
  if (error || !isAdmin) return { ok: false, status: 403 };
  return { ok: true, admin: createClient(URL, SERVICE, { auth: { persistSession: false } }) };
}
