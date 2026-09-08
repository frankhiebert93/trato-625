import { describe, it, expect, vi, beforeAll } from 'vitest';
import { adminClient, createTestUser } from './helpers/supabase';

// Mock the Stripe client BEFORE importing the route.
vi.mock('../lib/stripe', () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn().mockResolvedValue({
      id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1', payment_intent: 'pi_test_1',
    }) } },
  },
}));

const { POST } = await import('../app/api/listings/submit/route');

describe('POST /api/listings/submit', () => {
  let token: string;
  beforeAll(async () => {
    const seller = await createTestUser('+525599990001');
    token = seller.accessToken;
  });

  it('creates a draft, attaches the PaymentIntent, and returns the Checkout url', async () => {
    const res = await POST(new Request('http://localhost/api/listings/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Camioneta', currency: 'MXN', opening_bid_cents: 1000000,
        reserve_cents: 2000000, photos: ['vehicle-photos/a.jpg'],
      }),
    }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.url).toContain('checkout.stripe.test');

    const admin = adminClient();
    const { data: rows } = await admin.from('vehicles')
      .select('status, listing_fee_status, stripe_payment_intent_id, opening_bid_cents')
      .eq('stripe_payment_intent_id', 'pi_test_1');
    expect(rows!.length).toBe(1);
    expect(rows![0].status).toBe('draft');
    expect(rows![0].listing_fee_status).toBe('unpaid');
    expect(rows![0].opening_bid_cents).toBe(1000000);
  });

  it('rejects a request with no auth', async () => {
    const res = await POST(new Request('http://localhost/api/listings/submit', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x', currency: 'MXN', opening_bid_cents: 1 }),
    }));
    expect(res.status).toBe(401);
  });
});
