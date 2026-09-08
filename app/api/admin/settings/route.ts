import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });
  const body = await request.json();
  const patch: Record<string, unknown> = {};
  if (typeof body.listing_fee_cents === 'number' && body.listing_fee_cents >= 0) patch.listing_fee_cents = body.listing_fee_cents;
  if (body.increment_tiers && typeof body.increment_tiers === 'object' && body.increment_tiers.MXN && body.increment_tiers.USD) patch.increment_tiers = body.increment_tiers;
  if (typeof body.default_duration_minutes === 'number' && body.default_duration_minutes > 0) patch.default_duration_minutes = body.default_duration_minutes;
  if (typeof body.antisnipe_window_seconds === 'number' && body.antisnipe_window_seconds >= 0) patch.antisnipe_window_seconds = body.antisnipe_window_seconds;
  if (typeof body.antisnipe_extend_seconds === 'number' && body.antisnipe_extend_seconds >= 0) patch.antisnipe_extend_seconds = body.antisnipe_extend_seconds;
  if (body.default_notify_channel === 'whatsapp' || body.default_notify_channel === 'sms') patch.default_notify_channel = body.default_notify_channel;
  if (typeof body.terms_text === 'string') patch.terms_text = body.terms_text;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'NO_VALID_FIELDS' }, { status: 400 });
  patch.updated_at = new Date().toISOString();
  const { error } = await gate.admin.from('app_settings').update(patch).eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, updated: Object.keys(patch) });
}
