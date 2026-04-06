'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
    const [listings, setListings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        checkUser();
        fetchListings();
    }, []);

    async function checkUser() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) router.push('/admin');
    }

    async function fetchListings() {
        const { data, error } = await supabase.from('listings').select('*').order('created_at', { ascending: false });
        if (!error && data) setListings(data);
        setLoading(false);
    }

    async function toggleVerify(id: string, currentStatus: boolean) {
        const { error } = await supabase.from('listings').update({ is_verified: !currentStatus }).eq('id', id);
        if (error) alert("Error: " + error.message);
        else {
            // Update UI instantly
            setListings(listings.map(item => item.id === id ? { ...item, is_verified: !currentStatus } : item));
        }
    }

    async function handleDelete(id: string, item: any) {
        if (!window.confirm("¿Estás seguro de que quieres eliminar este artículo? / Are you sure you want to delete this listing?")) return;

        // 1. Delete from database
        const { error: dbError } = await supabase.from('listings').delete().eq('id', id);
        if (dbError) {
            alert("Error deleting: " + dbError.message);
            return;
        }

        // 2. Remove from the screen instantly
        setListings(listings.filter(listing => listing.id !== id));

        // 3. Delete all associated images from storage to save space
        const imagesToDelete = item.image_urls || (item.image_url ? [item.image_url] : []);
        const fileNames = imagesToDelete.map((url: string) => url.split('/').pop()).filter(Boolean);

        if (fileNames.length > 0) {
            await supabase.storage.from('listings').remove(fileNames);
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-3xl mx-auto">
                <header className="flex justify-between items-center py-6 border-b border-gray-200 mb-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900">Panel de Control</h1>
                        <p className="text-sm text-slate-500 font-bold">Admin Dashboard</p>
                    </div>
                    <button onClick={() => { supabase.auth.signOut(); router.push('/admin'); }} className="bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg hover:bg-slate-300 transition-colors">
                        Logout
                    </button>
                </header>

                {loading ? (
                    <p className="text-center font-bold text-gray-500">Cargando / Loading listings...</p>
                ) : (
                    <div className="space-y-4">
                        {listings.map((item) => {
                            // Ensure we show a thumbnail whether they used the new multi-photo or the old single-photo method
                            const thumbnail = item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : item.image_url;

                            return (
                                <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 border border-gray-100">
                                    <img src={thumbnail} alt="thumbnail" className="w-16 h-16 object-cover rounded-md bg-gray-100" />

                                    <div className="flex-grow">
                                        <h3 className="font-bold text-slate-900 flex flex-wrap items-center gap-2">
                                            {item.title}
                                            {item.is_verified && <span className="text-blue-600 text-[10px] font-bold bg-blue-50 px-2 py-0.5 rounded">Verif</span>}
                                        </h3>

                                        <p className="text-xs text-slate-500 bg-slate-100 inline-block px-2 py-1 rounded mt-1 mb-1 border border-slate-200">
                                            <span className="font-bold">Vendedor:</span> {item.seller_name || 'Desconocido'}
                                        </p>

                                        <p className="text-sm text-gray-500">${item.price} • Ph: {item.seller_phone}</p>
                                    </div>

                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <button
                                            onClick={() => toggleVerify(item.id, item.is_verified)}
                                            className={`font-bold px-4 py-2 rounded-lg text-sm transition-colors ${item.is_verified ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                        >
                                            {item.is_verified ? 'Unverify' : 'Verify'}
                                        </button>
                                        <button onClick={() => handleDelete(item.id, item)} className="bg-red-50 text-red-600 hover:bg-red-100 font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}