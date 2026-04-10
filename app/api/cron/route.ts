import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// We use the Master Key here so the robot has permission to delete photos
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    // Security check: Make sure this is Vercel triggering the cron job, not a random hacker
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unauthorized access' }, { status: 401 });
    }

    try {
        // Calculate the date exactly 15 days ago
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        const cutoffDate = fifteenDaysAgo.toISOString();

        // 1. Find all listings that are marked SOLD and were posted more than 15 days ago
        const { data: oldListings, error: fetchError } = await supabaseAdmin
            .from('listings')
            .select('*')
            .eq('is_sold', true)
            .lt('created_at', cutoffDate);

        if (fetchError) throw fetchError;

        if (!oldListings || oldListings.length === 0) {
            return NextResponse.json({ message: 'El feed está limpio. No hay artículos viejos vendidos.' });
        }

        // 2. Gather all the image filenames so we can delete them and save server space
        let filesToDelete: string[] = [];
        oldListings.forEach((item) => {
            const images = item.image_urls || (item.image_url ? [item.image_url] : []);
            images.forEach((url: string) => {
                const fileName = url.split('/').pop();
                if (fileName) filesToDelete.push(fileName);
            });
        });

        // 3. Delete the physical photos from the Supabase Storage Bucket
        if (filesToDelete.length > 0) {
            const { error: storageError } = await supabaseAdmin.storage.from('listings').remove(filesToDelete);
            if (storageError) console.error('Error al borrar imágenes:', storageError);
        }

        // 4. Delete the text data from the Database
        const idsToDelete = oldListings.map(item => item.id);
        const { error: dbError } = await supabaseAdmin
            .from('listings')
            .delete()
            .in('id', idsToDelete);

        if (dbError) throw dbError;

        return NextResponse.json({
            message: `¡Limpieza exitosa! Borramos ${oldListings.length} artículos y ${filesToDelete.length} fotos.`
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}