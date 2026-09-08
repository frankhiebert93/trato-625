import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser } from './helpers/supabase';

describe('place_bid concurrency', () => {
  const admin = adminClient();
  let vehicleId: string;
  const bidders: Awaited<ReturnType<typeof createTestUser>>[] = [];
  // Amounts spaced 100,000 cents apart — comfortably above the MXN tier-1
  // increment (50,000) — so bids applied in ascending order all clear.
  const amounts = [1_000_000, 1_100_000, 1_200_000, 1_300_000, 1_400_000];

  beforeAll(async () => {
    const seller = await createTestUser('+520000000001');
    await admin.from('profiles').update({ role: 'seller' }).eq('id', seller.userId);

    for (let i = 0; i < amounts.length; i++) {
      bidders.push(await createTestUser(`+52000000${1000 + i}`));
    }

    const { data, error } = await admin
      .from('vehicles')
      .insert({
        seller_id: seller.userId,
        title: 'Concurrency Lot',
        currency: 'MXN',
        opening_bid_cents: 1_000_000,
        status: 'live',
        ends_at: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    vehicleId = data!.id;
  });

  it('serializes parallel bids with no lost updates', async () => {
    const results = await Promise.allSettled(
      bidders.map((b, i) =>
        b.client.rpc('place_bid', {
          p_vehicle_id: vehicleId,
          p_amount_cents: amounts[i],
        }),
      ),
    );

    // A bid "succeeded" iff the RPC returned without a PostgREST error.
    const acceptedAmounts: number[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && !(r.value as any).error) {
        acceptedAmounts.push(amounts[i]);
      }
    });
    const accepted = acceptedAmounts.length;

    const { data: lot } = await admin
      .from('vehicles')
      .select('current_bid_cents, bid_count, current_leader_id')
      .eq('id', vehicleId)
      .single();

    const { count: rows } = await admin
      .from('bids')
      .select('*', { count: 'exact', head: true })
      .eq('vehicle_id', vehicleId);

    // At least the opening bid must have been accepted.
    expect(accepted).toBeGreaterThan(0);
    // No lost updates: the denormalized counter equals the append-only bid rows,
    // and both equal the number of successful RPC calls.
    expect(lot!.bid_count).toBe(accepted);
    expect(rows).toBe(accepted);
    // The leader holds the highest ACCEPTED amount.
    expect(lot!.current_bid_cents).toBe(Math.max(...acceptedAmounts));
  });
});
