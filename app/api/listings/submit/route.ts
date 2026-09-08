import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '../../../../lib/stripe';

export const runtime = 'nodejs';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  }
  const body = await request.json();

  // 1) Create the draft AS THE USER (RPC forces seller_id/status/fee_status).
  const userClient = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: vehicleId, error: rpcErr } = await userClient.rpc('create_draft_listing', {
    p_title: body.title, p_make: body.make ?? null, p_model: body.model ?? null,
    p_year: body.year ?? null, p_mileage_km: body.mileage_km ?? null,
    p_condition: body.condition ?? null, p_vin: body.vin ?? null,
    p_description: body.description ?? null, p_location: body.location ?? null,
    p_currency: body.currency, p_opening_bid_cents: body.opening_bid_cents,
    p_reserve_cents: body.reserve_cents ?? null, p_photos: body.photos ?? [],
  });
  if (rpcErr || !vehicleId) {
    return NextResponse.json({ error: rpcErr?.message ?? 'CREATE_FAILED' }, { status: 400 });
  }

  // 2) Look up the listing fee (public config).
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { data: settings } = await admin
    .from('app_settings')
    .select('listing_fee_cents, listing_fee_currency')
    .eq('id', 1).single();
  const feeCents = settings!.listing_fee_cents as number;

  // 3) Stripe Checkout Session, manual capture (authorize now, capture on approve).
  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_intent_data: { capture_method: 'manual' },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'mxn',
        unit_amount: feeCents,
        product_data: { name: 'Cuota de publicación de vehículo' },
      },
    }],
    metadata: { vehicle_id: vehicleId as string },
    success_url: `${origin}/perfil?enviado=1`,
    cancel_url: `${origin}/vender?cancelado=1`,
  });

  // 4) Store the PaymentIntent id (service role — clients can't write vehicles).
  await admin.from('vehicles')
    .update({ stripe_payment_intent_id: session.payment_intent as string })
    .eq('id', vehicleId);

  return NextResponse.json({ url: session.url });
}
