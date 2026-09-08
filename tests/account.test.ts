import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { supabase } from '../lib/supabase';
import { requestOtp, verifyOtp, getMyProfile, updateMyProfile, signOut } from '../lib/auth';
import {
  fetchMyBidLots,
  fetchMyWonLots,
  fetchMyListings,
  fetchWatchedLots,
  fetchWatchedIds,
  fetchUpcomingLots,
  isWatching,
  addWatch,
  removeWatch,
} from '../lib/account';
import { adminClient, createTestUser } from './helpers/supabase';

// Independent of auth.test.ts, which uses +525500000001.
const PHONE = '+525500000002';
const CODE = '123456';

describe('member account dashboard + watchlist', () => {
  const admin = adminClient();
  let userId: string;
  let liveVehicleId: string;
  let scheduledVehicleId: string;

  beforeAll(async () => {
    // Sign the shared client in as the bidder under test (phone OTP).
    expect((await requestOtp(PHONE)).error).toBeNull();
    expect((await verifyOtp(PHONE, CODE)).error).toBeNull();
    const profile = await getMyProfile();
    expect(profile).not.toBeNull();
    userId = profile!.id;
    expect(userId).toBeTruthy();

    // A separate seller owns the lots (a seller cannot bid on their own lot).
    const seller = await createTestUser('+520000000100');
    await admin.from('profiles').update({ role: 'seller' }).eq('id', seller.userId);

    const now = Date.now();
    const { data: live, error: e1 } = await admin
      .from('vehicles')
      .insert({
        seller_id: seller.userId,
        title: 'Account Test Live Lot',
        currency: 'MXN',
        opening_bid_cents: 1_000_000,
        status: 'live',
        ends_at: new Date(now + 3600_000).toISOString(),
      })
      .select('id')
      .single();
    if (e1) throw e1;
    liveVehicleId = live!.id;

    const { data: sched, error: e2 } = await admin
      .from('vehicles')
      .insert({
        seller_id: seller.userId,
        title: 'Account Test Scheduled Lot',
        currency: 'MXN',
        opening_bid_cents: 1_000_000,
        status: 'scheduled',
        starts_at: new Date(now + 86_400_000).toISOString(),
        ends_at: new Date(now + 2 * 86_400_000).toISOString(),
      })
      .select('id')
      .single();
    if (e2) throw e2;
    scheduledVehicleId = sched!.id;

    // The signed-in bidder places the opening bid on the live lot.
    const { error: bidErr } = await supabase.rpc('place_bid', {
      p_vehicle_id: liveVehicleId,
      p_amount_cents: 1_000_000,
    });
    expect(bidErr).toBeNull();
  });

  afterAll(async () => {
    await signOut();
  });

  it('fetchMyBidLots returns the lot the user bid on, marked as leader', async () => {
    const lots = await fetchMyBidLots();
    const lot = lots.find((l) => l.id === liveVehicleId);
    expect(lot).toBeDefined();
    expect(lot!.my_max_bid_cents).toBe(1_000_000);
    expect(lot!.is_leading).toBe(true);
    expect(lot!.i_won).toBe(false);
    // reserve_cents is never exposed by the RPC.
    expect('reserve_cents' in (lot as object)).toBe(false);
  });

  it('watchlist add / remove is reflected by the fetchers', async () => {
    expect((await addWatch(liveVehicleId)).error).toBeNull();
    expect(await isWatching(liveVehicleId)).toBe(true);
    expect((await fetchWatchedIds()).has(liveVehicleId)).toBe(true);
    expect((await fetchWatchedLots()).some((v) => v.id === liveVehicleId)).toBe(true);

    // Re-adding is idempotent.
    expect((await addWatch(liveVehicleId)).error).toBeNull();

    expect((await removeWatch(liveVehicleId)).error).toBeNull();
    expect(await isWatching(liveVehicleId)).toBe(false);
    expect((await fetchWatchedIds()).has(liveVehicleId)).toBe(false);
  });

  it('fetchUpcomingLots includes scheduled lots', async () => {
    const upcoming = await fetchUpcomingLots();
    expect(upcoming.some((v) => v.id === scheduledVehicleId)).toBe(true);
  });

  it('a pure bidder has no listings and no wins', async () => {
    expect((await fetchMyListings()).length).toBe(0);
    expect((await fetchMyWonLots()).length).toBe(0);
  });

  it('updateMyProfile persists full_name and city', async () => {
    expect((await updateMyProfile({ full_name: 'Ana Bidder', city: 'Cuauhtémoc' })).error).toBeNull();
    const p = await getMyProfile();
    expect(p!.full_name).toBe('Ana Bidder');
    expect(p!.city).toBe('Cuauhtémoc');
  });
});
