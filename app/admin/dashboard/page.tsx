'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { ZONES, REPORT_REASONS, fmtPrice, fmtTime, dropPercent } from '../../../lib/i18n';

const EMPTY_EVENT = {
    family_name: '',
    zone: ZONES[0],
    address: '',
    event_date: '',
    start_time: '08:00',
    end_time: '14:00',
    description: '',
    whatsapp: '',
};

export default function AdminDashboard() {
    const router = useRouter();

    // --- LISTINGS STATE ---
    const [listings, setListings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

    // --- ADS STATE ---
    const [ads, setAds] = useState<any[]>([]);
    const [adTitle, setAdTitle] = useState('');
    const [adDescription, setAdDescription] = useState('');
    const [adLinkUrl, setAdLinkUrl] = useState('');
    const [adPosition, setAdPosition] = useState(3);
    const [adExpiresAt, setAdExpiresAt] = useState(''); // NEW: Expiration date
    const [adFile, setAdFile] = useState<File | null>(null);
    const [adLoading, setAdLoading] = useState(false);

    // --- YARD SALE EVENTS STATE ---
    const [reports, setReports] = useState<any[]>([]);

    const [events, setEvents] = useState<any[]>([]);
    const [eventForm, setEventForm] = useState({ ...EMPTY_EVENT });
    const [eventLoading, setEventLoading] = useState(false);

    useEffect(() => {
        checkUser();
        fetchListings();
        fetchAds();
        fetchEvents();
        fetchReports();
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

    // --- REPORTS ---
    async function fetchReports() {
        const { data, error } = await supabase
            .from('reports')
            .select('*, listings(id, title, image_url, image_urls, seller_name, seller_phone, is_sold)')
            .order('created_at', { ascending: false })
            .limit(100);
        if (!error && data) setReports(data);
    }

    async function setReportStatus(id: string, status: string) {
        const { error } = await supabase.from('reports').update({ status }).eq('id', id);
        if (error) alert('Error: ' + error.message);
        else setReports(reports.map(r => r.id === id ? { ...r, status } : r));
    }

    // Removing the listing resolves every report filed against it.
    async function removeReportedListing(report: any) {
        const item = report.listings;
        if (!item) return;
        if (!window.confirm(`¿Eliminar "${item.title}"? Se borrará el artículo y sus fotos.`)) return;

        const { error } = await supabase.from('listings').delete().eq('id', item.id);
        if (error) { alert('Error: ' + error.message); return; }

        const files = (item.image_urls || (item.image_url ? [item.image_url] : []))
            .map((url: string) => url.split('/').pop()).filter(Boolean);
        if (files.length) await supabase.storage.from('listings').remove(files);

        setListings(listings.filter(l => l.id !== item.id));
        setReports(reports.map(r => r.listings?.id === item.id ? { ...r, status: 'actioned', listings: null } : r));
    }

    // --- YARD SALE EVENT FUNCTIONS ---
    async function fetchEvents() {
        const { data, error } = await supabase
            .from('yard_sale_events')
            .select('*')
            .order('event_date', { ascending: false });
        if (!error && data) setEvents(data);
    }

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!eventForm.family_name.trim() || !eventForm.event_date) {
            alert('La familia y la fecha son obligatorias. / Family and date are required.');
            return;
        }

        const cleanPhone = eventForm.whatsapp.replace(/\D/g, '');
        if (cleanPhone && cleanPhone.length !== 10) {
            alert('El WhatsApp debe tener 10 dígitos. / WhatsApp must be 10 digits.');
            return;
        }

        setEventLoading(true);
        try {
            const { error } = await supabase.from('yard_sale_events').insert([{
                family_name: eventForm.family_name.trim(),
                zone: eventForm.zone.trim() || null,
                address: eventForm.address.trim() || null,
                event_date: eventForm.event_date,
                start_time: eventForm.start_time || null,
                end_time: eventForm.end_time || null,
                description: eventForm.description.trim() || null,
                whatsapp: cleanPhone || null,
                is_active: true,
            }]);

            if (error) throw error;

            alert('¡Venta de yarda creada! / Yard sale created!');
            setEventForm({ ...EMPTY_EVENT });
            fetchEvents();
        } catch (error: any) {
            alert('Error: ' + error.message);
        } finally {
            setEventLoading(false);
        }
    };

    async function toggleEventActive(id: string, currentStatus: boolean) {
        const { error } = await supabase.from('yard_sale_events').update({ is_active: !currentStatus }).eq('id', id);
        if (error) alert('Error: ' + error.message);
        else setEvents(events.map(ev => ev.id === id ? { ...ev, is_active: !currentStatus } : ev));
    }

    async function handleDeleteEvent(id: string, familyName: string) {
        const attached = listings.filter(l => l.event_id === id).length;
        const warning = attached > 0
            ? `\n\n${attached} artículo(s) quedarán sin evento (no se borran).`
            : '';
        if (!window.confirm(`¿Eliminar la venta de yarda "${familyName}"?${warning}`)) return;

        const { error } = await supabase.from('yard_sale_events').delete().eq('id', id);
        if (error) { alert('Error: ' + error.message); return; }

        setEvents(events.filter(ev => ev.id !== id));
        // The FK is ON DELETE SET NULL, so mirror that in local state.
        setListings(listings.map(l => l.event_id === id ? { ...l, event_id: null } : l));
    }

    async function assignListingToEvent(listingId: string, eventId: string) {
        const value = eventId || null;
        const { error } = await supabase.from('listings').update({ event_id: value }).eq('id', listingId);
        if (error) alert('Error: ' + error.message);
        else setListings(listings.map(l => l.id === listingId ? { ...l, event_id: value } : l));
    }

    // --- LISTINGS FUNCTIONS ---
    async function fetchListings() {
        const { data, error } = await supabase.from('listings').select('*').order('created_at', { ascending: false });
        if (!error && data) setListings(data);
        setLoading(false);
    }

    // Lowering a price stashes the previous one in `old_price`, which is what
    // drives the "¡Bajó X%!" sticker in the feed. Keep the highest price ever
    // seen so repeated drops show the total markdown, not just the last step.
    async function handleLowerPrice(item: any) {
        const raw = priceDrafts[item.id];
        const newPrice = parseFloat(raw);
        const currentPrice = Number(item.price);

        if (!raw || Number.isNaN(newPrice) || newPrice <= 0) {
            alert('Escribe un precio válido. / Enter a valid price.');
            return;
        }
        if (newPrice >= currentPrice) {
            alert(`El precio nuevo debe ser menor que ${fmtPrice(currentPrice)}. / New price must be lower.`);
            return;
        }

        const oldPrice = Math.max(currentPrice, Number(item.old_price) || 0);

        const { error } = await supabase
            .from('listings')
            .update({ price: newPrice, old_price: oldPrice })
            .eq('id', item.id);

        if (error) { alert('Error: ' + error.message); return; }

        setListings(listings.map(l => l.id === item.id ? { ...l, price: newPrice, old_price: oldPrice } : l));
        setPriceDrafts({ ...priceDrafts, [item.id]: '' });
    }

    async function handleClearOldPrice(id: string) {
        const { error } = await supabase.from('listings').update({ old_price: null }).eq('id', id);
        if (error) alert('Error: ' + error.message);
        else setListings(listings.map(l => l.id === id ? { ...l, old_price: null } : l));
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
                    <button onClick={() => router.push('/admin/raffle')} className="bg-amber-400 hover:bg-amber-500 text-amber-900 font-bold px-4 py-2 rounded-lg transition-colors">
                        🎰 Rifa
                    </button>
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

                {/* --- SECTION 2b: REPORTED LISTINGS --- */}
                {(() => {
                    const pending = reports.filter(r => r.status === 'pending');
                    return (
                        <>
                            <h2 className="text-xl font-black text-slate-900 mb-1 flex items-center gap-2">
                                🚩 Reportes
                                {pending.length > 0 && (
                                    <span className="bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded-full">
                                        {pending.length} sin revisar
                                    </span>
                                )}
                            </h2>
                            <p className="text-sm text-slate-500 font-medium mb-4">
                                Los usuarios reportan anuncios desde la app. Revísalos pronto: las tiendas exigen que actúes rápido.
                            </p>
                            <div className="space-y-4 mb-12">
                                {reports.length === 0 ? (
                                    <p className="text-sm text-gray-500 italic">No hay reportes. 🎉</p>
                                ) : (
                                    reports.map((r) => {
                                        const item = r.listings;
                                        const reason = REPORT_REASONS.find(x => x.val === r.reason);
                                        const isPending = r.status === 'pending';
                                        return (
                                            <div key={r.id} className={`bg-white p-4 rounded-xl shadow-sm border ${isPending ? 'border-red-400' : 'border-gray-200 opacity-75'}`}>
                                                <div className="flex flex-col sm:flex-row items-start gap-4">
                                                    {item ? (
                                                        <img src={item.image_urls?.[0] || item.image_url} alt="" className="w-20 h-20 object-cover rounded-md bg-gray-100 shrink-0" />
                                                    ) : (
                                                        <div className="w-20 h-20 rounded-md bg-gray-100 shrink-0 flex items-center justify-center text-xs text-gray-400 font-bold text-center">Eliminado</div>
                                                    )}
                                                    <div className="flex-grow min-w-0">
                                                        <p className="text-xs font-black text-red-700 uppercase tracking-wide">
                                                            {reason ? reason.es : r.reason}
                                                        </p>
                                                        <h3 className="font-bold text-slate-900 leading-tight">
                                                            {item ? item.title : '(artículo ya eliminado)'}
                                                        </h3>
                                                        {item && (
                                                            <p className="text-xs text-slate-500 mt-0.5">
                                                                {item.seller_name} · {item.seller_phone}
                                                            </p>
                                                        )}
                                                        {r.details && (
                                                            <p className="text-sm text-slate-700 mt-1.5 bg-slate-50 border border-slate-200 rounded p-2 break-words">
                                                                “{r.details}”
                                                            </p>
                                                        )}
                                                        <p className="text-[11px] text-gray-400 mt-1">
                                                            {new Date(r.created_at).toLocaleString('es-MX')} · {r.status}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
                                                        {item && (
                                                            <button onClick={() => removeReportedListing(r)} className="bg-red-600 text-white font-bold px-3 py-2 rounded-lg text-xs">
                                                                Eliminar artículo
                                                            </button>
                                                        )}
                                                        {isPending ? (
                                                            <button onClick={() => setReportStatus(r.id, 'reviewed')} className="bg-gray-100 text-gray-700 font-bold px-3 py-2 rounded-lg text-xs">
                                                                Marcar revisado
                                                            </button>
                                                        ) : (
                                                            <button onClick={() => setReportStatus(r.id, 'pending')} className="bg-gray-100 text-gray-500 font-bold px-3 py-2 rounded-lg text-xs">
                                                                Reabrir
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </>
                    );
                })()}

                {/* --- SECTION 3: CREATE YARD SALE EVENT --- */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
                    <h2 className="text-xl font-black text-slate-900 mb-1 flex items-center gap-2">🏡 Nueva Venta de Yarda</h2>
                    <p className="text-sm text-slate-500 font-medium mb-4">
                        Aparece como banner verde arriba del feed. Se oculta sola cuando pasa la fecha.
                    </p>
                    <form onSubmit={handleSaveEvent} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold mb-1">Familia</label>
                                <input type="text" value={eventForm.family_name} onChange={(e) => setEventForm({ ...eventForm, family_name: e.target.value })} placeholder="Ej. Familia Wiebe" className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" required />
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-1">Zona</label>
                                <input type="text" list="zone-options" value={eventForm.zone} onChange={(e) => setEventForm({ ...eventForm, zone: e.target.value })} placeholder="Ej. Campo 6½" className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" />
                                <datalist id="zone-options">
                                    {ZONES.map(z => <option key={z} value={z} />)}
                                </datalist>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold mb-1">Dirección</label>
                                <input type="text" value={eventForm.address} onChange={(e) => setEventForm({ ...eventForm, address: e.target.value })} placeholder="Ej. Km 4" className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-1">WhatsApp (10 Dígitos)</label>
                                <input type="tel" value={eventForm.whatsapp} onChange={(e) => setEventForm({ ...eventForm, whatsapp: e.target.value })} placeholder="625..." className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-bold mb-1 text-green-700">Fecha</label>
                                <input type="date" value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} className="w-full border-2 border-green-200 rounded-lg p-2.5 bg-green-50 outline-none font-bold text-gray-700" required />
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-1">Empieza</label>
                                <input type="time" value={eventForm.start_time} onChange={(e) => setEventForm({ ...eventForm, start_time: e.target.value })} className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-1">Termina</label>
                                <input type="time" value={eventForm.end_time} onChange={(e) => setEventForm({ ...eventForm, end_time: e.target.value })} className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-1">Descripción</label>
                            <textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} rows={2} placeholder="Vendemos de todo antes de la mudanza..." className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>

                        <button type="submit" disabled={eventLoading} className="w-full bg-green-700 text-white font-black py-3 rounded-lg mt-2 hover:bg-green-800 transition-all disabled:bg-gray-400">
                            {eventLoading ? 'Guardando...' : 'Crear Venta de Yarda'}
                        </button>
                    </form>
                </div>

                {/* --- SECTION 4: MANAGE YARD SALE EVENTS --- */}
                <h2 className="text-xl font-black text-slate-900 mb-4">Gestión de Ventas de Yarda</h2>
                <div className="space-y-4 mb-12">
                    {events.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No hay ventas de yarda creadas todavía.</p>
                    ) : (
                        events.map((ev) => {
                            const isPast = new Date(`${ev.event_date}T23:59:59`) < new Date();
                            const attached = listings.filter(l => l.event_id === ev.id).length;
                            const hours = [ev.start_time, ev.end_time].map(fmtTime).filter(Boolean).join('–');
                            return (
                                <div key={ev.id} className={`bg-white p-4 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center gap-4 border ${ev.is_active && !isPast ? 'border-green-500' : 'border-gray-200 opacity-75'}`}>
                                    <div className="w-16 h-16 shrink-0 rounded-lg bg-amber-300 border-2 border-slate-900 flex flex-col items-center justify-center">
                                        <span className="font-black text-lg leading-none text-slate-900">
                                            {new Date(`${ev.event_date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '').toUpperCase()}
                                        </span>
                                        <span className="text-xs font-black text-red-700 leading-none mt-0.5">
                                            {new Date(`${ev.event_date}T12:00:00`).getDate()}
                                        </span>
                                    </div>
                                    <div className="flex-grow min-w-0">
                                        <h3 className="font-bold text-slate-900 leading-tight">
                                            {ev.family_name}{ev.zone ? ` — ${ev.zone}` : ''}
                                        </h3>
                                        <p className="text-xs text-gray-500">
                                            {new Date(`${ev.event_date}T12:00:00`).toLocaleDateString('es-MX')}
                                            {hours && ` · ${hours}`}
                                            {ev.address && ` · ${ev.address}`}
                                        </p>
                                        <p className="text-xs font-bold mt-1">
                                            <span className="text-green-700">{attached} artículo(s)</span>
                                            {isPast && <span className="ml-3 text-red-500">Ya pasó</span>}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
                                        <button onClick={() => toggleEventActive(ev.id, ev.is_active)} className={`font-bold px-3 py-1.5 rounded-lg text-xs transition-colors ${ev.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                                            {ev.is_active ? 'Activo (Apagar)' : 'Apagado (Encender)'}
                                        </button>
                                        <button onClick={() => handleDeleteEvent(ev.id, ev.family_name)} className="bg-red-50 text-red-600 font-bold px-3 py-1.5 rounded-lg text-xs">
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* --- SECTION 5: LISTINGS MANAGEMENT --- */}
                <h2 className="text-xl font-black text-slate-900 mb-1">Moderación de Artículos</h2>
                <p className="text-sm text-slate-500 font-medium mb-4">
                    Baja el precio para mostrar el sticker "¡Bajó X%!" en el feed, o asigna el artículo a una venta de yarda.
                </p>
                {loading ? (
                    <p className="text-center font-bold text-gray-500">Cargando artículos...</p>
                ) : (
                    <div className="space-y-4">
                        {listings.map((item) => {
                            const drop = dropPercent(Number(item.price), item.old_price);
                            return (
                            <div key={item.id} className={`bg-white p-4 rounded-xl shadow-sm border ${item.is_sold ? 'border-red-200 bg-red-50/50' : 'border-gray-100'}`}>
                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <div className="relative shrink-0">
                                        <img src={item.image_urls?.[0] || item.image_url} alt="thumbnail" className={`w-20 h-20 object-cover rounded-md bg-gray-100 ${item.is_sold ? 'grayscale opacity-50' : ''}`} />
                                    </div>
                                    <div className="flex-grow w-full text-center sm:text-left">
                                        <h3 className={`font-bold ${item.is_sold ? 'text-gray-500 line-through' : 'text-slate-900'}`}>{item.title}</h3>
                                        <p className="text-xs text-slate-500 bg-slate-100 inline-block px-2 py-1 rounded mt-1 border border-slate-200"><span className="font-bold">Vendedor:</span> {item.seller_name}</p>
                                        <p className="text-sm font-black text-slate-900 mt-1">
                                            {fmtPrice(item.price)}
                                            {drop !== null && (
                                                <>
                                                    <span className="ml-2 text-xs font-bold text-gray-400 line-through">{fmtPrice(item.old_price)}</span>
                                                    <span className="ml-2 text-xs font-black text-white bg-red-600 px-2 py-0.5 rounded">↓ {drop}%</span>
                                                </>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
                                        <button onClick={() => toggleSold(item.id, item.is_sold)} className={`font-bold px-3 py-2 rounded-lg text-xs transition-colors ${item.is_sold ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-700'}`}>
                                            {item.is_sold ? 'Revive (Unsold)' : 'Mark Sold'}
                                        </button>
                                        <button onClick={() => handleDeleteListing(item.id, item)} className="bg-red-50 text-red-600 font-bold px-3 py-2 rounded-lg text-xs">Delete</button>
                                    </div>
                                </div>

                                <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Bajar precio</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                min="1"
                                                value={priceDrafts[item.id] ?? ''}
                                                onChange={(e) => setPriceDrafts({ ...priceDrafts, [item.id]: e.target.value })}
                                                placeholder="Precio nuevo"
                                                className="flex-1 min-w-0 border rounded-lg p-2 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <button onClick={() => handleLowerPrice(item)} className="bg-slate-900 text-white font-bold px-3 rounded-lg text-xs hover:bg-slate-800 transition-colors shrink-0">
                                                Bajar
                                            </button>
                                            {drop !== null && (
                                                <button onClick={() => handleClearOldPrice(item.id)} title="Quitar el sticker de rebaja" className="bg-gray-100 text-gray-600 font-bold px-3 rounded-lg text-xs shrink-0">
                                                    Quitar
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Venta de yarda</label>
                                        <select
                                            value={item.event_id || ''}
                                            onChange={(e) => assignListingToEvent(item.id, e.target.value)}
                                            className="w-full border rounded-lg p-2 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="">— Sin evento —</option>
                                            {events.map(ev => (
                                                <option key={ev.id} value={ev.id}>
                                                    {ev.family_name}{ev.zone ? ` — ${ev.zone}` : ''} ({new Date(`${ev.event_date}T12:00:00`).toLocaleDateString('es-MX')})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
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