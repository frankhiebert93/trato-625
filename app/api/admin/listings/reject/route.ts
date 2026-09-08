import { NextResponse } from 'next/server';
import { stripe } from '../../../../../lib/stripe';
import { requireAdmin } from '../../../../../lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });
  const admin = gate.admin;
  const { vehicle_id } = await request.json();

  const { data: lot } = await admin.from('vehicles')
    .select('id, status, stripe_payment_intent_id').eq('id', vehicle_id).single();
  if (!lot) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (lot.status !== 'pending_review') {
    return NextResponse.json({ error: 'NOT_REJECTABLE' }, { status: 409 });
  }
  if (lot.stripe_payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(lot.stripe_payment_intent_id);
    } catch (e: any) {
      // Tolerate a PI that is already canceled (safe retry); fail loudly otherwise.
      if (e?.code !== 'payment_intent_unexpected_state') {
        return NextResponse.json({ error: 'CANCEL_FAILED' }, { status: 502 });
      }
    }
  }
  const { error: updErr } = await admin.from('vehicles')
    .update({ listing_fee_status: 'released', status: 'cancelled' })
    .eq('id', vehicle_id).eq('status', 'pending_review');
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
