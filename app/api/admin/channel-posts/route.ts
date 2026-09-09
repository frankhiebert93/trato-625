import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';

// Admin actions on a queued Channel post. Reads happen client-side via the
// admin's own session (channel_posts_admin_select); only the state changes below
// go through the service role. Marking a post 'published' or 'dismissed' just
// removes it from the pending queue — the actual posting is done by hand in the
// WhatsApp Channel (Channels have no compliant post API).
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: 'FORBIDDEN' }, { status: gate.status });

  const body = await request.json();
  const action = body.action as string;
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: 'ID_REQUIRED' }, { status: 400 });

  let patch: Record<string, unknown>;
  if (action === 'publish') {
    patch = { status: 'published', published_at: new Date().toISOString() };
  } else if (action === 'dismiss') {
    patch = { status: 'dismissed', published_at: null };
  } else if (action === 'reopen') {
    patch = { status: 'pending', published_at: null };
  } else {
    return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
  }

  const { error } = await gate.admin.from('channel_posts').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
