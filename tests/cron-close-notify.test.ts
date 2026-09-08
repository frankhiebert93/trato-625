import { describe, it, expect, vi, beforeAll } from 'vitest';
import { adminClient, createTestUser } from './helpers/supabase';

const sendMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../lib/notify', async (orig) => ({ ...(await orig() as object), sendNotification: sendMock }));

const { GET } = await import('../app/api/cron/route');

describe('cron close + notify', () => {
  const admin = adminClient();
  let seller: Awaited<ReturnType<typeof createTestUser>>;
  let bidder: Awaited<ReturnType<typeof createTestUser>>;
  let vehicleId: string;

  beforeAll(async () => {
    process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-cron';

    seller = await createTestUser('+525566660001');
    bidder = await createTestUser('+525566660002');
    // createTestUser signs up via email/password, so auth.users.phone (and thus
    // the profiles.phone the handle_new_user trigger copies from it) is null —
    // set it explicitly so the cron's phone lookup has somewhere to send to.
    await admin.from('profiles').update({ phone: '+525566660001' }).eq('id', seller.userId);
    await admin.from('profiles').update({ phone: '+525566660002' }).eq('id', bidder.userId);

    // A live lot already past ends_at with a reserve-meeting bid — due for closing.
    const { data, error } = await admin.from('vehicles').insert({
      seller_id: seller.userId,
      title: 'Cron Close Lot',
      currency: 'MXN',
      opening_bid_cents: 1_000_000,
      reserve_cents: 1_000_000,
      current_bid_cents: 1_000_000,
      current_leader_id: bidder.userId,
      bid_count: 1,
      status: 'live',
      ends_at: new Date(Date.now() - 60_000).toISOString(),
    }).select('id').single();
    if (error) throw error;
    vehicleId = data!.id;
  });

  it('closes due auctions, marks the winner, and dispatches notifications', async () => {
    const res = await GET(new Request('http://localhost/api/cron', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.closed).toBeGreaterThan(0);
    expect(body.sent).toBeGreaterThan(0);

    // The lot closed as sold, with the reserve-meeting bidder as winner.
    const { data: lot } = await admin.from('vehicles')
      .select('status, winner_id').eq('id', vehicleId).single();
    expect(lot!.status).toBe('sold');
    expect(lot!.winner_id).toBe(bidder.userId);

    // close_due_auctions queues a 'won' notification for the winner and a 'sold'
    // notification for the seller; the cron dispatched and marked both sent.
    const { data: notifs } = await admin.from('notifications')
      .select('status, kind, recipient_id').eq('vehicle_id', vehicleId);
    expect(notifs!.length).toBe(2);
    notifs!.forEach((n) => expect(n.status).toBe('sent'));
    expect(notifs!.map((n) => n.kind).sort()).toEqual(['sold', 'won']);

    expect(sendMock).toHaveBeenCalled();
  });

  it('rejects a bad cron secret (401)', async () => {
    const res = await GET(new Request('http://localhost/api/cron', {
      headers: { authorization: 'Bearer wrong' },
    }));
    expect(res.status).toBe(401);
  });
});
