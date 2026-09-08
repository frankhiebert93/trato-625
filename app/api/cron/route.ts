import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendNotification, messageFor, type NotifyChannel } from '../../../lib/notify';

export const runtime = 'nodejs';

const NOTIFY_BATCH_SIZE = 50;

export async function GET(request: Request) {
    // Security check: Always require the secret token, regardless of environment
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized access' }, { status: 401 });
    }

    // We use the Master Key here so the robot has permission to close lots and notify
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Event lifecycle sweeps (Plan 9): make sure an intake event is open, close
    //    any intake event that is full or past its cutoff (rotating to the next),
    //    and launch scheduled events that have reached their date at capacity.
    for (const fn of ['open_next_intake', 'close_full_or_expired_intakes', 'go_live_due_events'] as const) {
        const { error } = await supabaseAdmin.rpc(fn);
        if (error) {
            return NextResponse.json({ error: `${fn}: ${error.message}` }, { status: 500 });
        }
    }

    // 2. Close every live lot past its end time (decides sold vs unsold and enqueues
    //    the relevant 'won'/'sold'/'unsold' notification rows), then close any event
    //    whose lots have all finished.
    const { data: closed, error: closeError } = await supabaseAdmin.rpc('close_due_auctions');
    if (closeError) {
        return NextResponse.json({ error: closeError.message }, { status: 500 });
    }
    const { error: eventsClosedError } = await supabaseAdmin.rpc('close_finished_events');
    if (eventsClosedError) {
        return NextResponse.json({ error: eventsClosedError.message }, { status: 500 });
    }

    // 2. Dispatch pending notifications (outbid/won/sold/unsold), oldest first.
    const { data: pending, error: pendingError } = await supabaseAdmin
        .from('notifications')
        .select('id, recipient_id, channel, kind')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(NOTIFY_BATCH_SIZE);
    if (pendingError) {
        return NextResponse.json({ error: pendingError.message }, { status: 500 });
    }

    let sent = 0;
    if (pending && pending.length > 0) {
        const recipientIds = [...new Set(pending.map((n) => n.recipient_id))];
        const { data: recipients } = await supabaseAdmin
            .from('profiles')
            .select('id, phone')
            .in('id', recipientIds);
        const phoneById = new Map((recipients ?? []).map((p) => [p.id, p.phone as string | null]));

        for (const n of pending) {
            const phone = phoneById.get(n.recipient_id);
            let ok = false;
            if (phone) {
                const result = await sendNotification(
                    n.channel as NotifyChannel, phone, messageFor(n.kind),
                );
                ok = result.ok;
            }

            await supabaseAdmin
                .from('notifications')
                .update({ status: ok ? 'sent' : 'failed', sent_at: new Date().toISOString() })
                .eq('id', n.id);

            if (ok) sent++;
        }
    }

    return NextResponse.json({ closed: closed ?? 0, sent });
}
