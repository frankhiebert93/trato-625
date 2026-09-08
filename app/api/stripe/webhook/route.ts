import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '../../../../lib/stripe';

export const runtime = 'nodejs';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: Request) {
  const raw = await request.text();
  const sig = request.headers.get('stripe-signature') ?? '';
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'BAD_SIGNATURE' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as { metadata?: { vehicle_id?: string } };
    const vehicleId = session.metadata?.vehicle_id;
    if (vehicleId) {
      const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
      // Idempotent: only advance an unpaid draft.
      await admin.from('vehicles')
        .update({ listing_fee_status: 'authorized', status: 'pending_review' })
        .eq('id', vehicleId)
        .eq('listing_fee_status', 'unpaid');
    }
  }

  return NextResponse.json({ received: true });
}
