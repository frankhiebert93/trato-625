import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '../../../../lib/stripe';

export const runtime = 'nodejs';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// The seller pays their own commission by card. We verify the caller is the
// seller and the commission is still owed, then hand back a Stripe Checkout URL.
// The webhook (checkout.session.completed with commission_vehicle_id) marks it paid.
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
  }
  const { vehicle_id: vehicleId } = await request.json();
  if (!vehicleId) return NextResponse.json({ error: 'VEHICLE_ID_REQUIRED' }, { status: 400 });

  // Who is calling?
  const userClient = createClient(URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const uid = userData.user?.id;
  if (userErr || !uid) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });

  // Look up the commission with the service role and check ownership + state.
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { data: row } = await admin
    .from('sale_commissions')
    .select('seller_id, currency, commission_cents, status')
    .eq('vehicle_id', vehicleId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (row.seller_id !== uid) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  if (row.status !== 'owed') return NextResponse.json({ error: 'NOT_OWED' }, { status: 409 });
  if (!row.commission_cents || row.commission_cents <= 0) {
    return NextResponse.json({ error: 'NOTHING_DUE' }, { status: 409 });
  }

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: (row.currency as string).toLowerCase(),
        unit_amount: row.commission_cents as number,
        product_data: { name: 'Comisión de venta — Trato 625' },
      },
    }],
    metadata: { commission_vehicle_id: vehicleId as string },
    success_url: `${origin}/subastas/${vehicleId}?comision=pagada`,
    cancel_url: `${origin}/subastas/${vehicleId}?comision=cancelada`,
  });

  return NextResponse.json({ url: session.url });
}
