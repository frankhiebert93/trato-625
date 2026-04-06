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
        if (!session) {
            // Kick them back to login if they aren't authenticated
            router.push('/admin');
        }
    }

    async function fetchListings() {
        const { data, error } = await supabase
            .from('listings')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setListings(data);
        }
        setLoading(false);
    }

    async function handleDelete(id: string, imageUrl: string) {
        if (!window.confirm("Are you sure you want to delete this listing?")) return;

        // 1. Delete from database
        const { error: dbError } = await supabase
            .from('listings')
            .delete()
            .eq('id', id);

        if (dbError) {
            alert("Error deleting listing: " + dbError.message);
            return;
        }

        // 2. Refresh the list so it disappears from the screen
        setListings(listings.filter(item => item.id !== id));

        // 3. (Optional) Delete the image from storage to save space
        if (imageUrl) {
            const fileName = imageUrl.split('/').pop();
            if (fileName) {
                await supabase.storage.from('listings').remove([fileName]);
            }
        }
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        router.push('/admin');
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-3xl mx-auto">
                <header className="flex justify-between items-center py-6">
                    <h1 className="text-3xl font-black text-slate-900">Admin Panel</h1>
                    <button
                        onClick={handleLogout}
                        className="bg-red-100 text-red-600 font-bold px-4 py-2 rounded-lg hover:bg-red-200"
                    >
                        Logout
                    </button>
                </header>

                {loading ? (
                    <p className="text-center font-bold text-gray-500">Loading...</p>
                ) : (
                    <div className="space-y-4">
                        {listings.map((item) => (
                            <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 border border-gray-100">
                                <img src={item.image_url} alt="thumbnail" className="w-16 h-16 object-cover rounded-md" />
                                <div className="flex-grow">
                                    <h3 className="font-bold text-slate-900">{item.title}</h3>
                                    <p className="text-sm text-gray-500">${item.price} - Ph: {item.seller_phone}</p>
                                </div>
                                <button
                                    onClick={() => handleDelete(item.id, item.image_url)}
                                    className="bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg"
                                >
                                    Delete
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}