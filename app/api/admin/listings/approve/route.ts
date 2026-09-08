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

  // Optional admin overrides — validated BEFORE capture.
  if ('opening_bid_cents' in body) {
    if (typeof body.opening_bid_cents !== 'number' || body.opening_bid_cents < 0) {
      return NextResponse.json({ error: 'BAD_OVERRIDE' }, { status: 400 });
    }
  }
  if ('reserve_cents' in body) {
    if (body.reserve_cents !== null && (typeof body.reserve_cents !== 'number' || body.reserve_cents < 0)) {
      return NextResponse.json({ error: 'BAD_OVERRIDE' }, { status: 400 });
    }
  }
  if ('min_increment_cents' in body) {
    if (body.min_increment_cents !== null && (typeof body.min_increment_cents !== 'number' || body.min_increment_cents <= 0)) {
      return NextResponse.json({ error: 'BAD_OVERRIDE' }, { status: 400 });
    }
  }
  if (
    typeof body.opening_bid_cents === 'number' &&
    typeof body.reserve_cents === 'number' &&
    body.reserve_cents < body.opening_bid_cents
  ) {
    return NextResponse.json({ error: 'BAD_OVERRIDE' }, { status: 400 });
  }

  // Capture the authorized listing fee. Retry-safe: tolerate a PI that is
  // already captured (e.g. a retry after the DB update below failed).
  if (lot.stripe_payment_intent_id) {
    try {
      await stripe.paymentIntents.capture(lot.stripe_payment_intent_id);
    } catch (e: any) {
      if (e?.code !== 'payment_intent_unexpected_state') {
        return NextResponse.json({ error: 'CAPTURE_FAILED' }, { status: 502 });
      }
    }
  }

  // In the event model an approved lot becomes 'scheduled' (part of its event);
  // its starts_at/ends_at are stamped when the event goes live (_go_live_event),
  // staggered by lot_number. No per-lot duration here.
  const now = new Date();
  const patch: Record<string, unknown> = {
    listing_fee_status: 'captured',
    status: 'scheduled',
    published_at: now.toISOString(),
  };
  if (typeof body.opening_bid_cents === 'number') patch.opening_bid_cents = body.opening_bid_cents;
  if ('reserve_cents' in body) patch.reserve_cents = body.reserve_cents; // may be null
  if ('min_increment_cents' in body) patch.min_increment_cents = body.min_increment_cents;

  const { error: updErr } = await admin.from('vehicles').update(patch)
    .eq('id', vehicleId).eq('status', 'pending_review'); // idempotent
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, status: 'scheduled' });
}
