import { describe, it, expect, beforeAll } from 'vitest';
import Stripe from 'stripe';
import { adminClient, createTestUser } from './helpers/supabase';

const stripe = new Stripe('sk_test_dummy', { apiVersion: '2026-08-26.dahlia' });
const SECRET = process.env.STRIPE_WEBHOOK_SECRET!; // dummy from .env.test

const { POST } = await import('../app/api/stripe/webhook/route');

describe('POST /api/stripe/webhook', () => {
  let vehicleId: string;
  beforeAll(async () => {
    const seller = await createTestUser('+525599990002');
    const admin = adminClient();
    const { data } = await admin.from('vehicles').insert({
      seller_id: seller.userId, title: 'Webhook Lot', currency: 'MXN',
      opening_bid_cents: 1000000, status: 'draft', listing_fee_status: 'unpaid',
    }).select('id').single();
    vehicleId = data!.id;
  });

  it('moves an unpaid draft to authorized/pending_review on checkout.session.completed', async () => {
    const payload = JSON.stringify({
      id: 'evt_1', object: 'event', type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', object: 'checkout.session', metadata: { vehicle_id: vehicleId } } },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

    const res = await POST(new Request('http://localhost/api/stripe/webhook', {
      method: 'POST', headers: { 'stripe-signature': header }, body: payload,
    }));
    expect(res.status).toBe(200);

    const admin = adminClient();
    const { data: row } = await admin.from('vehicles')
      .select('status, listing_fee_status').eq('id', vehicleId).single();
    expect(row!.listing_fee_status).toBe('authorized');
    expect(row!.status).toBe('pending_review');
  });

  it('rejects a bad signature', async () => {
    const res = await POST(new Request('http://localhost/api/stripe/webhook', {
      method: 'POST', headers: { 'stripe-signature': 't=1,v1=bad' }, body: '{}',
    }));
    expect(res.status).toBe(400);
  });
});
