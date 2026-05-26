'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
    const router = useRouter();

    // --- LISTINGS STATE ---
    const [listings, setListings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // --- ADS STATE ---
    const [ads, setAds] = useState<any[]>([]);
    const [adTitle, setAdTitle] = useState('');
    const [adDescription, setAdDescription] = useState('');
    const [adLinkUrl, setAdLinkUrl] = useState('');
    const [adPosition, setAdPosition] = useState(3);
    const [adExpiresAt, setAdExpiresAt] = useState(''); // NEW: Expiration date
    const [adFile, setAdFile] = useState<File | null>(null);
    const [adLoading, setAdLoading] = useState(false);

    useEffect(() => {
        checkUser();
        fetchListings();
        fetchAds();
    }, []);

    async function checkUser() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) router.push('/admin');
    }

    // --- ADS FUNCTIONS ---
    async function fetchAds() {
        const { data, error } = await supabase.from('sponsored_ads').select('*').order('created_at', { ascending: false });
        if (!error && data) setAds(data);
    }

    const handleSaveAd = async (e: React.FormEvent) => {
        e.preventDefault();
        setAdLoading(true);

        try {
            let formattedUrl = adLinkUrl.trim();
            if (formattedUrl && !formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
                formattedUrl = 'https://' + formattedUrl;
            }

            let uploadedImageUrl = '';
            if (adFile) {
                const fileName = `ad-${Date.now()}-${adFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
                const { error: uploadError } = await supabase.storage.from('listings').upload(fileName, adFile);
                if (uploadError) throw uploadError;

                const { data: publicUrlData } = supabase.storage.from('listings').getPublicUrl(fileName);
                uploadedImageUrl = publicUrlData.publicUrl;
            }

            // Deactivate old ads if you only want 1 active at a time
            await supabase.from('sponsored_ads').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000');

            const { error: dbError } = await supabase.from('sponsored_ads').insert([{
                title: adTitle,
                description: adDescription,
                link_url: formattedUrl, 
                position: Number(adPosition),
                image_url: uploadedImageUrl || undefined,
                expires_at: adExpiresAt ? new Date(adExpiresAt).toISOString() : null, // NEW: Saves expiration
                is_active: true
            }]);

            if (dbError) throw dbError;
            alert('¡Anuncio activado con éxito! / Ad successfully activated!');
            setAdTitle(''); setAdDescription(''); setAdLinkUrl(''); setAdExpiresAt(''); setAdFile(null);
            fetchAds(); // Refresh the list
            
        } catch (error: any) {
            alert('Error: ' + error.message);
        } finally {
            setAdLoading(false);
        }
    };

    async function toggleAdActive(id: string, currentStatus: boolean) {
        const { error } = await supabase.from('sponsored_ads').update({ is_active: !currentStatus }).eq('id', id);
        if (error) alert("Error: " + error.message);
        else setAds(ads.map(ad => ad.id === id ? { ...ad, is_active: !currentStatus } : ad));
    }

    async function handleDeleteAd(id: string, imageUrl: string) {
        if (!window.confirm("¿Seguro que quieres eliminar este anuncio? / Delete this ad?")) return;

        const { error } = await supabase.from('sponsored_ads').delete().eq('id', id);
        if (error) { alert("Error: " + error.message); return; }

        setAds(ads.filter(ad => ad.id !== id));

        if (imageUrl) {
            const fileName = imageUrl.split('/').pop();
            if (fileName) await supabase.storage.from('listings').remove([fileName]);
        }
    }

    // --- LISTINGS FUNCTIONS ---
    async function fetchListings() {
        const { data, error } = await supabase.from('listings').select('*').order('created_at', { ascending: false });
        if (!error && data) setListings(data);
        setLoading(false);
    }

    async function toggleSold(id: string, currentStatus: boolean) {
        const { error } = await supabase.from('listings').update({ is_sold: !currentStatus }).eq('id', id);
        if (error) alert("Error: " + error.message);
        else setListings(listings.map(item => item.id === id ? { ...item, is_sold: !currentStatus } : item));
    }

    async function handleDeleteListing(id: string, item: any) {
        if (!window.confirm("¿Eliminar este artículo? / Delete this listing?")) return;

        const { error: dbError } = await supabase.from('listings').delete().eq('id', id);
        if (dbError) { alert("Error deleting: " + dbError.message); return; }

        setListings(listings.filter(listing => listing.id !== id));

        const imagesToDelete = item.image_urls || (item.image_url ? [item.image_url] : []);
        const fileNames = imagesToDelete.map((url: string) => url.split('/').pop()).filter(Boolean);

        if (fileNames.length > 0) {
            await supabase.storage.from('listings').remove(fileNames);
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 pb-20">
            <div className="max-w-4xl mx-auto">
                <header className="flex justify-between items-center py-6 border-b border-gray-200 mb-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900">Panel de Control</h1>
                        <p className="text-sm text-slate-500 font-bold">Admin Dashboard</p>
                    </div>
                    <button onClick={() => { supabase.auth.signOut(); router.push('/admin'); }} className="bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg hover:bg-slate-300 transition-colors">
                        Logout
                    </button>
                </header>

                {/* --- SECTION 1: CREATE AD --- */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
                    <h2 className="text-xl font-black text-slate-900 mb-4 flex items-center gap-2">⭐ Nuevo Patrocinador</h2>
                    <form onSubmit={handleSaveAd} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold mb-1">Negocio (Título)</label>
                                <input type="text" value={adTitle} onChange={(e) => setAdTitle(e.target.value)} placeholder="Ej. Fine Edge Machines" className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-1">Mensaje Corto</label>
                                <input type="text" value={adDescription} onChange={(e) => setAdDescription(e.target.value)} placeholder="Ej. Todo para tu taller." className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-1">Link (WhatsApp o Sitio Web)</label>
                            <input type="text" value={adLinkUrl} onChange={(e) => setAdLinkUrl(e.target.value)} placeholder="Ej. www.empresa.com o wa.me/52..." className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" required />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-bold mb-1 text-blue-600">Posición en Feed</label>
                                <input type="number" min="1" max="20" value={adPosition} onChange={(e) => setAdPosition(Number(e.target.value))} className="w-full border-2 border-blue-200 rounded-lg p-2.5 bg-blue-50 outline-none font-black text-center" required />
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-1 text-red-600">Fecha de Expiración</label>
                                <input type="date" value={adExpiresAt} onChange={(e) => setAdExpiresAt(e.target.value)} className="w-full border-2 border-red-100 rounded-lg p-2.5 bg-red-50 outline-none font-bold text-gray-700" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-1">Logo / Banner</label>
                                <input type="file" accept="image/*" onChange={(e) => setAdFile(e.target.files?.[0] || null)} className="w-full border rounded-lg p-1.5 bg-gray-50" required />
                            </div>
                        </div>

                        <button type="submit" disabled={adLoading} className="w-full bg-slate-900 text-white font-black py-3 rounded-lg mt-2 hover:bg-slate-800 transition-all">
                            {adLoading ? 'Subiendo...' : 'Crear y Activar Anuncio'}
                        </button>
                    </form>
                </div>

                {/* --- SECTION 2: MANAGE ADS --- */}
                <h2 className="text-xl font-black text-slate-900 mb-4">Gestión de Anuncios</h2>
                <div className="space-y-4 mb-12">
                    {ads.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No hay anuncios creados todavía.</p>
                    ) : (
                        ads.map((ad) => {
                            const isExpired = ad.expires_at && new Date(ad.expires_at) < new Date();
                            return (
                                <div key={ad.id} className={`bg-white p-4 rounded-xl shadow-sm flex items-center gap-4 border ${ad.is_active && !isExpired ? 'border-amber-400' : 'border-gray-200 opacity-75'}`}>
                                    <img src={ad.image_url} alt="Ad" className="w-24 h-16 object-cover rounded border border-gray-100" />
                                    <div className="flex-grow">
                                        <h3 className="font-bold text-slate-900 leading-tight">{ad.title}</h3>
                                        <p className="text-xs text-gray-500">{ad.link_url}</p>
                                        <p className="text-xs font-bold mt-1">
                                            <span className="text-blue-600">Pos: {ad.position}</span>
                                            {ad.expires_at && <span className={`ml-3 ${isExpired ? 'text-red-500' : 'text-orange-500'}`}>Expira: {new Date(ad.expires_at).toLocaleDateString()}</span>}
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-2 shrink-0">
                                        <button onClick={() => toggleAdActive(ad.id, ad.is_active)} className={`font-bold px-3 py-1.5 rounded-lg text-xs transition-colors ${ad.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                                            {ad.is_active ? 'Activo (Apagar)' : 'Apagado (Encender)'}
                                        </button>
                                        <button onClick={() => handleDeleteAd(ad.id, ad.image_url)} className="bg-red-50 text-red-600 font-bold px-3 py-1.5 rounded-lg text-xs">
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* --- SECTION 3: LISTINGS MANAGEMENT --- */}
                <h2 className="text-xl font-black text-slate-900 mb-4">Moderación de Artículos</h2>
                {loading ? (
                    <p className="text-center font-bold text-gray-500">Cargando artículos...</p>
                ) : (
                    <div className="space-y-4">
                        {listings.map((item) => (
                            <div key={item.id} className={`bg-white p-4 rounded-xl shadow-sm flex flex-col sm:flex-row items-center gap-4 border ${item.is_sold ? 'border-red-200 bg-red-50/50' : 'border-gray-100'}`}>
                                <div className="relative shrink-0">
                                    <img src={item.image_urls?.[0] || item.image_url} alt="thumbnail" className={`w-20 h-20 object-cover rounded-md bg-gray-100 ${item.is_sold ? 'grayscale opacity-50' : ''}`} />
                                </div>
                                <div className="flex-grow w-full text-center sm:text-left">
                                    <h3 className={`font-bold ${item.is_sold ? 'text-gray-500 line-through' : 'text-slate-900'}`}>{item.title}</h3>
                                    <p className="text-xs text-slate-500 bg-slate-100 inline-block px-2 py-1 rounded mt-1 border border-slate-200"><span className="font-bold">Vendedor:</span> {item.seller_name}</p>
                                </div>
                                <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
                                    <button onClick={() => toggleSold(item.id, item.is_sold)} className={`font-bold px-3 py-2 rounded-lg text-xs transition-colors ${item.is_sold ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-700'}`}>
                                        {item.is_sold ? 'Revive (Unsold)' : 'Mark Sold'}
                                    </button>
                                    <button onClick={() => handleDeleteListing(item.id, item)} className="bg-red-50 text-red-600 font-bold px-3 py-2 rounded-lg text-xs">Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}