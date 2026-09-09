import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';

// Admin actions on a seller's sale commission. Reads happen client-side via the
// admin's own session (see the sale_commissions_admin_select policy); only the
// state changes below go through the service role.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });

  const body = await request.json();
  const action = body.action as string;
  const vehicleId = body.vehicle_id as string;
  if (!vehicleId) return NextResponse.json({ error: 'VEHICLE_ID_REQUIRED' }, { status: 400 });

  let patch: Record<string, unknown>;
  if (action === 'mark_paid') {
    const method = body.method;
    if (method !== 'transfer' && method !== 'cash' && method !== 'stripe') {
      return NextResponse.json({ error: 'INVALID_METHOD' }, { status: 400 });
    }
    patch = { status: 'paid', method, paid_at: new Date().toISOString() };
  } else if (action === 'waive') {
    patch = { status: 'waived', method: null, paid_at: null };
  } else if (action === 'reopen') {
    patch = { status: 'owed', method: null, paid_at: null };
  } else {
    return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
  }

  const { error } = await gate.admin.from('sale_commissions').update(patch).eq('vehicle_id', vehicleId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
