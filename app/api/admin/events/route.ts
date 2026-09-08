import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';

type Body = { action?: string; event_id?: string; [k: string]: unknown };

function badGap(v: unknown): boolean {
  const g = Number(v);
  return !Number.isFinite(g) || g <= 0;
}

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });
  const admin = gate.admin;
  const body = (await request.json()) as Body;
  const action = body.action;

  // --- Create a new event (starts as 'upcoming') ---
  if (action === 'create') {
    const name = String(body.name ?? '').trim();
    const capacity = Number(body.capacity);
    const startsAt = body.starts_at ? String(body.starts_at) : null;
    if (!name) return NextResponse.json({ error: 'NAME_REQUIRED' }, { status: 400 });
    if (!Number.isFinite(capacity) || capacity <= 0) return NextResponse.json({ error: 'BAD_CAPACITY' }, { status: 400 });
    if (!startsAt || Number.isNaN(Date.parse(startsAt))) return NextResponse.json({ error: 'BAD_START' }, { status: 400 });

    const row: Record<string, unknown> = { name, capacity, starts_at: startsAt, status: 'upcoming' };
    if (body.intake_opens_at) row.intake_opens_at = String(body.intake_opens_at);
    if (body.intake_cutoff_at) row.intake_cutoff_at = String(body.intake_cutoff_at);
    if (body.lot_close_gap_seconds != null) {
      if (badGap(body.lot_close_gap_seconds)) return NextResponse.json({ error: 'BAD_GAP' }, { status: 400 });
      row.lot_close_gap_seconds = Number(body.lot_close_gap_seconds);
    }
    if (body.viewing_location != null) row.viewing_location = String(body.viewing_location);
    if (body.viewing_notes != null) row.viewing_notes = String(body.viewing_notes);

    const { data, error } = await admin.from('auction_events').insert(row).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data!.id });
  }

  const id = body.event_id ? String(body.event_id) : '';
  if (!id) return NextResponse.json({ error: 'EVENT_ID_REQUIRED' }, { status: 400 });

  // --- Update editable fields ---
  if (action === 'update') {
    const patch: Record<string, unknown> = {};
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.capacity != null) {
      const c = Number(body.capacity);
      if (!Number.isFinite(c) || c <= 0) return NextResponse.json({ error: 'BAD_CAPACITY' }, { status: 400 });
      patch.capacity = c;
    }
    if (body.starts_at != null) {
      if (Number.isNaN(Date.parse(String(body.starts_at)))) return NextResponse.json({ error: 'BAD_START' }, { status: 400 });
      patch.starts_at = String(body.starts_at);
    }
    if (body.intake_opens_at !== undefined) patch.intake_opens_at = body.intake_opens_at ? String(body.intake_opens_at) : null;
    if (body.intake_cutoff_at !== undefined) patch.intake_cutoff_at = body.intake_cutoff_at ? String(body.intake_cutoff_at) : null;
    if (body.lot_close_gap_seconds != null) {
      if (badGap(body.lot_close_gap_seconds)) return NextResponse.json({ error: 'BAD_GAP' }, { status: 400 });
      patch.lot_close_gap_seconds = Number(body.lot_close_gap_seconds);
    }
    if (body.viewing_location !== undefined) patch.viewing_location = body.viewing_location != null ? String(body.viewing_location) : null;
    if (body.viewing_notes !== undefined) patch.viewing_notes = body.viewing_notes != null ? String(body.viewing_notes) : null;

    const { error } = await admin.from('auction_events').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // --- Open intake on an 'upcoming' event (only one intake at a time) ---
  if (action === 'open_intake') {
    const { count } = await admin.from('auction_events')
      .select('id', { count: 'exact', head: true }).eq('status', 'intake');
    if ((count ?? 0) > 0) return NextResponse.json({ error: 'INTAKE_ALREADY_OPEN' }, { status: 409 });
    const { error } = await admin.from('auction_events')
      .update({ status: 'intake' }).eq('id', id).eq('status', 'upcoming');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // --- Close intake manually → scheduled (publishes the date) ---
  if (action === 'close_intake') {
    const { error } = await admin.from('auction_events')
      .update({ status: 'scheduled', published_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'intake');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // --- Launch a scheduled event now (stamps its lots live, staggered) ---
  if (action === 'launch') {
    const { error } = await admin.rpc('_go_live_event', { p_event: id });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // --- Cancel a not-yet-live event ---
  if (action === 'cancel') {
    const { error } = await admin.from('auction_events')
      .update({ status: 'cancelled' }).eq('id', id).in('status', ['upcoming', 'intake', 'scheduled']);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
