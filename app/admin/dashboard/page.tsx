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

    async function handleDelete(id: string, imageUrl: string) {
        if (!window.confirm("Are you sure you want to delete this listing?")) return;
        const { error: dbError } = await supabase.from('listings').delete().eq('id', id);
        if (dbError) { alert("Error deleting: " + dbError.message); return; }
        setListings(listings.filter(item => item.id !== id));
        if (imageUrl) {
            const fileName = imageUrl.split('/').pop();
            if (fileName) await supabase.storage.from('listings').remove([fileName]);
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
                    <button onClick={() => { supabase.auth.signOut(); router.push('/admin'); }} className="bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg hover:bg-slate-300">
                        Logout
                    </button>
                </header>

                {loading ? (
                    <p className="text-center font-bold text-gray-500">Loading listings...</p>
                ) : (
                    <div className="space-y-4">
                        {listings.map((item) => (
                            <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 border border-gray-100">
                                <img src={item.image_url} alt="thumbnail" className="w-16 h-16 object-cover rounded-md" />
                                <div className="flex-grow">
                                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                        {item.title}
                                        {item.is_verified && <span className="text-blue-600 text-xs font-bold bg-blue-50 px-2 py-0.5 rounded">Verified</span>}
                                    </h3>
                                    <p className="text-sm text-gray-500">${item.price} • Ph: {item.seller_phone}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => toggleVerify(item.id, item.is_verified)}
                                        className={`font-bold px-4 py-2 rounded-lg text-sm ${item.is_verified ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                    >
                                        {item.is_verified ? 'Unverify' : 'Verify'}
                                    </button>
                                    <button onClick={() => handleDelete(item.id, item.image_url)} className="bg-red-50 text-red-600 hover:bg-red-100 font-bold px-4 py-2 rounded-lg text-sm">
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}