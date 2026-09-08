import { NextResponse } from 'next/server';
import { stripe } from '../../../../../lib/stripe';
import { requireAdmin } from '../../../../../lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });
  const admin = gate.admin;
  const body = await request.json();
  const vehicleId: string = body.vehicle_id;

  const { data: lot } = await admin.from('vehicles')
    .select('id, status, listing_fee_status, stripe_payment_intent_id')
    .eq('id', vehicleId).single();
  if (!lot) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (lot.status !== 'pending_review' || lot.listing_fee_status !== 'authorized') {
    return NextResponse.json({ error: 'NOT_APPROVABLE' }, { status: 409 });
  }

  // Capture the authorized listing fee.
  if (lot.stripe_payment_intent_id) {
    await stripe.paymentIntents.capture(lot.stripe_payment_intent_id);
  }

  // Duration → end time (always set ends_at).
  const { data: settings } = await admin.from('app_settings')
    .select('default_duration_minutes').eq('id', 1).single();
  const minutes: number = body.duration_minutes ?? settings!.default_duration_minutes;
  const now = new Date();
  const endsAt = new Date(now.getTime() + minutes * 60_000);

  // Optional admin overrides applied at publish.
  const patch: Record<string, unknown> = {
    listing_fee_status: 'captured',
    status: 'live',
    starts_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
    published_at: now.toISOString(),
  };
  if (typeof body.opening_bid_cents === 'number') patch.opening_bid_cents = body.opening_bid_cents;
  if ('reserve_cents' in body) patch.reserve_cents = body.reserve_cents; // may be null
  if ('min_increment_cents' in body) patch.min_increment_cents = body.min_increment_cents;

  const { error: updErr } = await admin.from('vehicles').update(patch)
    .eq('id', vehicleId).eq('status', 'pending_review'); // idempotent
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, ends_at: endsAt.toISOString() });
}
