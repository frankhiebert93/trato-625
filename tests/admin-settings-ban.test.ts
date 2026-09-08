import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createTestUser } from './helpers/supabase';

const settings = (await import('../app/api/admin/settings/route')).POST;
const ban = (await import('../app/api/admin/ban/route')).POST;

async function makeAdmin() {
  const u = await createTestUser('+525577780001');
  await adminClient().from('profiles').update({ role: 'admin' }).eq('id', u.userId);
  return u;
}

describe('admin settings + ban routes', () => {
  let adminUser: Awaited<ReturnType<typeof createTestUser>>;
  let nonAdmin: Awaited<ReturnType<typeof createTestUser>>;
  beforeAll(async () => {
    adminUser = await makeAdmin();
    nonAdmin = await createTestUser('+525577780002');
  });

  it('admin updates listing_fee_cents and it persists', async () => {
    const res = await settings(new Request('http://localhost/api/admin/settings', {
      method: 'POST',
      headers: { authorization: `Bearer ${adminUser.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ listing_fee_cents: 75000 }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toContain('listing_fee_cents');
    const { data: row } = await adminClient().from('app_settings').select('listing_fee_cents').eq('id', 1).single();
    expect(row!.listing_fee_cents).toBe(75000);
  });

  it('rejects a non-admin caller with 403', async () => {
    const res = await settings(new Request('http://localhost/api/admin/settings', {
      method: 'POST',
      headers: { authorization: `Bearer ${nonAdmin.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ listing_fee_cents: 99999 }),
    }));
    expect(res.status).toBe(403);
  });

  it('rejects a body with no valid fields with 400', async () => {
    const res = await settings(new Request('http://localhost/api/admin/settings', {
      method: 'POST',
      headers: { authorization: `Bearer ${adminUser.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ not_a_real_field: 1, listing_fee_cents: -5 }),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('NO_VALID_FIELDS');
  });

  it('ban sets is_banned=true on the target profile', async () => {
    const target = await createTestUser('+525577780003');
    const res = await ban(new Request('http://localhost/api/admin/ban', {
      method: 'POST',
      headers: { authorization: `Bearer ${adminUser.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ profile_id: target.userId, banned: true }),
    }));
    expect(res.status).toBe(200);
    const { data: profile } = await adminClient().from('profiles').select('is_banned').eq('id', target.userId).single();
    expect(profile!.is_banned).toBe(true);
  });

  it('a banned user cannot place a bid (BANNED)', async () => {
    const seller = await createTestUser('+525577780004');
    await adminClient().from('profiles').update({ role: 'seller' }).eq('id', seller.userId);
    const bidder = await createTestUser('+525577780005');

    const { data: lot, error: lotErr } = await adminClient().from('vehicles').insert({
      seller_id: seller.userId,
      title: 'Ban Test Lot',
      currency: 'MXN',
      opening_bid_cents: 1_000_000,
      status: 'live',
      ends_at: new Date(Date.now() + 3600_000).toISOString(),
    }).select('id').single();
    if (lotErr) throw lotErr;

    const banRes = await ban(new Request('http://localhost/api/admin/ban', {
      method: 'POST',
      headers: { authorization: `Bearer ${adminUser.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ profile_id: bidder.userId, banned: true }),
    }));
    expect(banRes.status).toBe(200);

    const { error } = await bidder.client.rpc('place_bid', {
      p_vehicle_id: lot!.id,
      p_amount_cents: 1_000_000,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/BANNED/);
  });
});
