import { describe, it, expect, vi, beforeAll } from 'vitest';
import { adminClient, createTestUser } from './helpers/supabase';

const captureMock = vi.fn().mockResolvedValue({ id: 'pi_1', status: 'succeeded' });
const cancelMock = vi.fn().mockResolvedValue({ id: 'pi_1', status: 'canceled' });
vi.mock('../lib/stripe', () => ({
  stripe: { paymentIntents: { capture: captureMock, cancel: cancelMock } },
}));

const approve = (await import('../app/api/admin/listings/approve/route')).POST;
const reject = (await import('../app/api/admin/listings/reject/route')).POST;

async function makeAdmin() {
  const u = await createTestUser('+525577770001');
  await adminClient().from('profiles').update({ role: 'admin' }).eq('id', u.userId);
  return u;
}
async function seedPendingLot(sellerId: string) {
  const { data } = await adminClient().from('vehicles').insert({
    seller_id: sellerId, title: 'Lot', currency: 'MXN', opening_bid_cents: 1000000,
    status: 'pending_review', listing_fee_status: 'authorized', stripe_payment_intent_id: 'pi_1',
  }).select('id').single();
  return data!.id as string;
}

describe('admin listing actions', () => {
  let adminUser: Awaited<ReturnType<typeof createTestUser>>;
  let seller: Awaited<ReturnType<typeof createTestUser>>;
  beforeAll(async () => { adminUser = await makeAdmin(); seller = await createTestUser('+525577770002'); });

  it('approve captures the fee and publishes with an end time', async () => {
    const id = await seedPendingLot(seller.userId);
    const res = await approve(new Request('http://localhost/api/admin/listings/approve', {
      method: 'POST', headers: { authorization: `Bearer ${adminUser.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ vehicle_id: id, duration_minutes: 60 }),
    }));
    expect(res.status).toBe(200);
    expect(captureMock).toHaveBeenCalledWith('pi_1');
    const { data: lot } = await adminClient().from('vehicles')
      .select('status, listing_fee_status, ends_at').eq('id', id).single();
    expect(lot!.status).toBe('live');
    expect(lot!.listing_fee_status).toBe('captured');
    expect(lot!.ends_at).not.toBeNull();
  });

  it('rejects a non-admin caller', async () => {
    const id = await seedPendingLot(seller.userId);
    const res = await approve(new Request('http://localhost/api/admin/listings/approve', {
      method: 'POST', headers: { authorization: `Bearer ${seller.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ vehicle_id: id }),
    }));
    expect(res.status).toBe(403);
  });

  it('reject cancels the fee and cancels the lot', async () => {
    const id = await seedPendingLot(seller.userId);
    const res = await reject(new Request('http://localhost/api/admin/listings/reject', {
      method: 'POST', headers: { authorization: `Bearer ${adminUser.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ vehicle_id: id }),
    }));
    expect(res.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledWith('pi_1');
    const { data: lot } = await adminClient().from('vehicles')
      .select('status, listing_fee_status').eq('id', id).single();
    expect(lot!.status).toBe('cancelled');
    expect(lot!.listing_fee_status).toBe('released');
  });

  it('bad override is rejected BEFORE capture', async () => {
    const id = await seedPendingLot(seller.userId);
    captureMock.mockClear();
    const callsBefore = captureMock.mock.calls.length;
    const res = await approve(new Request('http://localhost/api/admin/listings/approve', {
      method: 'POST', headers: { authorization: `Bearer ${adminUser.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ vehicle_id: id, reserve_cents: 1, opening_bid_cents: 1000000 }),
    }));
    expect(res.status).toBe(400);
    expect(captureMock.mock.calls.length).toBe(callsBefore);
  });

  it('approve is retry-safe when PI already captured', async () => {
    const id = await seedPendingLot(seller.userId);
    captureMock.mockRejectedValueOnce({ code: 'payment_intent_unexpected_state' });
    const res = await approve(new Request('http://localhost/api/admin/listings/approve', {
      method: 'POST', headers: { authorization: `Bearer ${adminUser.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ vehicle_id: id, duration_minutes: 60 }),
    }));
    expect(res.status).toBe(200);
    const { data: lot } = await adminClient().from('vehicles')
      .select('status, listing_fee_status').eq('id', id).single();
    expect(lot!.status).toBe('live');
    expect(lot!.listing_fee_status).toBe('captured');
  });
});
