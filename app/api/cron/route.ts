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

    // 1. Close every live lot past its end time (decides sold vs unsold and enqueues
    //    the relevant 'won'/'sold'/'unsold' notification rows).
    const { data: closed, error: closeError } = await supabaseAdmin.rpc('close_due_auctions');
    if (closeError) {
        return NextResponse.json({ error: closeError.message }, { status: 500 });
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

    // 3. Legacy listings cleanup (yard-sale carryover; Plan 7 removes this block).
    //    Best-effort: never let a failure here mask the close/notify summary above.
    try {
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        const cutoffDate = fifteenDaysAgo.toISOString();

        const { data: oldListings, error: fetchError } = await supabaseAdmin
            .from('listings')
            .select('*')
            .eq('is_sold', true)
            .lt('created_at', cutoffDate);
        if (fetchError) throw fetchError;

        if (oldListings && oldListings.length > 0) {
            const filesToDelete: string[] = [];
            oldListings.forEach((item) => {
                const images = item.image_urls || (item.image_url ? [item.image_url] : []);
                images.forEach((url: string) => {
                    const fileName = url.split('/').pop();
                    if (fileName) filesToDelete.push(fileName);
                });
            });

            if (filesToDelete.length > 0) {
                const { error: storageError } = await supabaseAdmin.storage.from('listings').remove(filesToDelete);
                if (storageError) console.error('Error al borrar imágenes:', storageError);
            }

            const idsToDelete = oldListings.map((item) => item.id);
            const { error: dbError } = await supabaseAdmin
                .from('listings')
                .delete()
                .in('id', idsToDelete);
            if (dbError) throw dbError;
        }
    } catch (error) {
        console.error('Limpieza de listings falló (no bloquea el cron):', error);
    }

    return NextResponse.json({ closed: closed ?? 0, sent });
}
