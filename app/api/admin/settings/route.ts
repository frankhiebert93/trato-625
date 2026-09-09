import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });
  const body = await request.json();
  const patch: Record<string, unknown> = {};
  if (typeof body.listing_fee_cents === 'number' && body.listing_fee_cents >= 0) patch.listing_fee_cents = body.listing_fee_cents;
  if (
    body.increment_tiers && typeof body.increment_tiers === 'object' &&
    Array.isArray(body.increment_tiers.MXN) && body.increment_tiers.MXN.length > 0 &&
    Array.isArray(body.increment_tiers.USD) && body.increment_tiers.USD.length > 0 &&
    [...body.increment_tiers.MXN, ...body.increment_tiers.USD].every(
      (t: unknown) => t && typeof t === 'object' && typeof (t as { increment_cents?: unknown }).increment_cents === 'number'
    )
  ) patch.increment_tiers = body.increment_tiers;
  if (typeof body.default_duration_minutes === 'number' && body.default_duration_minutes > 0) patch.default_duration_minutes = body.default_duration_minutes;
  if (typeof body.antisnipe_window_seconds === 'number' && body.antisnipe_window_seconds >= 0) patch.antisnipe_window_seconds = body.antisnipe_window_seconds;
  if (typeof body.antisnipe_extend_seconds === 'number' && body.antisnipe_extend_seconds >= 0) patch.antisnipe_extend_seconds = body.antisnipe_extend_seconds;
  if (body.default_notify_channel === 'whatsapp' || body.default_notify_channel === 'sms') patch.default_notify_channel = body.default_notify_channel;
  if (typeof body.terms_text === 'string') patch.terms_text = body.terms_text;

  // Seller commission: a flat percent plus a per-currency floor/cap. A cap sent
  // as null clears it (uncapped); a number sets it. The percent is 0..100.
  if (typeof body.sale_commission_pct === 'number' && body.sale_commission_pct >= 0 && body.sale_commission_pct <= 100) {
    patch.sale_commission_pct = body.sale_commission_pct;
  }
  const capKeys = [
    'sale_commission_min_cents_usd', 'sale_commission_max_cents_usd',
    'sale_commission_min_cents_mxn', 'sale_commission_max_cents_mxn',
  ] as const;
  for (const k of capKeys) {
    if (k in body) {
      const v = body[k];
      if (v === null) patch[k] = null;
      else if (typeof v === 'number' && Number.isFinite(v) && v >= 0) patch[k] = Math.round(v);
    }
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'NO_VALID_FIELDS' }, { status: 400 });
  patch.updated_at = new Date().toISOString();
  const { error } = await gate.admin.from('app_settings').update(patch).eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, updated: Object.keys(patch) });
}
