import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });
  const { vehicle_id } = await request.json();
  const { error } = await gate.admin.from('vehicles')
    .update({ status: 'cancelled' })
    .eq('id', vehicle_id).in('status', ['scheduled', 'live']);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
