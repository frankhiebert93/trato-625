import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });
  const { profile_id, banned } = await request.json();
  if (typeof profile_id !== 'string' || typeof banned !== 'boolean') {
    return NextResponse.json({ error: 'BAD_INPUT' }, { status: 400 });
  }
  const { error } = await gate.admin.from('profiles').update({ is_banned: banned }).eq('id', profile_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
