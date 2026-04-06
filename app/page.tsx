'use client';
import { useState, useEffect } from 'react';
import PostForm from '../components/CameraCapture';
import ListingCard from '../components/ListingCard';
import { supabase } from '../lib/supabase';

const ITEMS_PER_PAGE = 10;
const CATEGORIES = [
  { val: 'Todos', es: 'Todos', en: 'All' },
  { val: 'Vehículos', es: 'Vehículos', en: 'Vehicles' },
  { val: 'Herramientas', es: 'Herramientas', en: 'Tools' },
  { val: 'Electrónica', es: 'Electrónica', en: 'Electronics' },
  { val: 'Hogar', es: 'Hogar', en: 'Home' },
  { val: 'Materiales', es: 'Materiales', en: 'Materials' },
  { val: 'Otros', es: 'Otros', en: 'Others' }
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<'feed' | 'post'>('feed');
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // NEW: State for the detail modal
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  useEffect(() => {
    if (activeTab === 'feed') {
      setPage(0);
      fetchListings(0, true);
    }
  }, [activeTab, activeCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchListings(0, true);
  };

  async function fetchListings(pageNumber: number, isFreshSearch = false) {
    setLoading(true);
    const from = pageNumber * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    let query = supabase.from('listings').select('*').order('created_at', { ascending: false }).range(from, to);
    if (activeCategory !== 'Todos') query = query.eq('category', activeCategory);
    if (searchQuery.trim() !== '') query = query.ilike('title', `%${searchQuery}%`);

    const { data, error } = await query;
    if (!error && data) {
      if (isFreshSearch || pageNumber === 0) setListings(data);
      else setListings([...listings, ...data]);
      setHasMore(data.length === ITEMS_PER_PAGE);
    }
    setLoading(false);
  }

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchListings(nextPage);
  };

  const handleWhatsAppClick = (item: any) => {
    if (!item.seller_phone) return;
    let cleanPhone = item.seller_phone.replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone;
    const message = encodeURIComponent(`Hola, me interesa tu ${item.title} en Trato 625.`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const handleShare = async (item: any) => {
    const shareData = { title: item.title, text: `Mira este ${item.title} en Trato 625!`, url: window.location.origin };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`); alert("¡Enlace copiado!"); }
    } catch (err) { console.error(err); }
  };

  // The Detail View Overlay Component
  const renderDetailView = () => {
    if (!selectedItem) return null;
    const images = selectedItem.image_urls || [selectedItem.image_url];
    const formattedPrice = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(selectedItem.price);

    return (
      <div className="fixed inset-0 z-50 bg-white overflow-y-auto flex flex-col">
        {/* Sticky Header with Back Button */}
        <div className="sticky top-0 bg-white/90 backdrop-blur-md px-4 py-4 flex items-center shadow-sm z-10">
          <button onClick={() => setSelectedItem(null)} className="p-2 -ml-2 bg-gray-100 rounded-full text-slate-700 font-bold flex items-center gap-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Atrás
          </button>
          <h2 className="ml-4 font-black text-lg text-slate-900 truncate">{selectedItem.title}</h2>
        </div>

        {/* Scrollable Gallery */}
        <div className="w-full flex overflow-x-auto snap-x snap-mandatory hide-scrollbar bg-slate-900">
          {images.map((img: string, i: number) => (
            <img key={i} src={img} className="w-full h-[50vh] object-contain snap-center shrink-0" alt={`img-${i}`} />
          ))}
        </div>

        {images.length > 1 && (
          <p className="text-center text-xs font-bold text-gray-500 mt-2">Desliza para ver más fotos ↔</p>
        )}

        <div className="p-5 pb-32">
          <div className="flex justify-between items-start">
            <h1 className="text-2xl font-black text-slate-900 leading-tight">{selectedItem.title}</h1>
            {selectedItem.is_verified && (
              <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-md border border-blue-100 flex items-center gap-1 text-[10px] font-bold">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                Verificado
              </span>
            )}
          </div>
          <p className="text-blue-600 font-black text-3xl mt-1">{formattedPrice}</p>

          {selectedItem.safe_zone && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
              <span className="text-2xl">📍</span>
              <div>
                <p className="font-bold text-green-800 text-sm">Punto Seguro Disponible</p>
                <p className="text-xs text-green-600">El vendedor acepta entregar en lugares públicos.</p>
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-gray-100 pt-6">
            <h3 className="font-bold text-slate-900 mb-2">Detalles / Details</h3>
            <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{selectedItem.description || 'Sin descripción.'}</p>
          </div>
        </div>

        {/* Sticky Bottom Action Bar */}
        <div className="fixed bottom-0 w-full bg-white border-t border-gray-200 p-4 pb-8 flex gap-3 shadow-[0_-5px_20px_-10px_rgba(0,0,0,0.1)]">
          <button onClick={() => handleWhatsAppClick(selectedItem)} className="flex-[2] bg-[#25D366] hover:bg-[#1DA851] text-white py-3.5 rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2 text-lg">
            WhatsApp
          </button>
          <button onClick={() => handleShare(selectedItem)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-slate-700 py-3.5 rounded-xl font-bold transition-all flex flex-col items-center justify-center">
            <span className="text-sm leading-none">Compartir</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      {/* Conditionally render the modal overlay over EVERYTHING */}
      {renderDetailView()}

      <header className="bg-white shadow-sm pt-6 pb-3 px-4 sticky top-0 z-10">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight text-center mb-4">Trato 625</h1>

        {activeTab === 'feed' && (
          <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Buscar / Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-400"
            />
            <button type="submit" className="bg-slate-900 text-white font-bold px-5 rounded-lg shadow-sm">Ir</button>
          </form>
        )}

        {activeTab === 'feed' && (
          <div className="flex overflow-x-auto pb-1 gap-2 hide-scrollbar">
            {CATEGORIES.map(cat => (
              <button
                key={cat.val}
                onClick={() => setActiveCategory(cat.val)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-1.5 ${activeCategory === cat.val ? 'bg-slate-900 text-white shadow-md' : 'bg-gray-100 text-slate-600 hover:bg-gray-200'
                  }`}
              >
                <span>{cat.es}</span>
                <span className={`text-[10px] font-normal ${activeCategory === cat.val ? 'text-slate-300' : 'text-slate-400'}`}>/ {cat.en}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="p-4 max-w-md mx-auto">
        {activeTab === 'post' ? (
          <PostForm />
        ) : (
          <div className="space-y-4">
            {listings.length === 0 && !loading ? (
              <div className="text-center mt-12">
                <p className="text-slate-500 font-bold text-lg">No se encontraron artículos.</p>
              </div>
            ) : (
              listings.map((item) => (
                <ListingCard key={item.id} item={item} onClick={() => setSelectedItem(item)} />
              ))
            )}

            {hasMore && listings.length > 0 && (
              <button onClick={loadMore} disabled={loading} className="w-full bg-white border border-gray-200 text-blue-600 py-3.5 rounded-xl mt-4 transition-all shadow-sm">
                <span className="font-bold text-base">{loading ? 'Cargando...' : 'Cargar más'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 w-full bg-white border-t border-gray-200 flex justify-around p-2 pb-6 max-w-md left-1/2 -translate-x-1/2 z-20 shadow-[0_-5px_15px_-10px_rgba(0,0,0,0.1)]">
        <button onClick={() => setActiveTab('feed')} className={`flex-1 py-2 rounded-xl transition-all flex flex-col items-center justify-center ${activeTab === 'feed' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-400'}`}>
          <span className="font-black text-sm leading-tight">Mercado</span>
          <span className="text-[10px] font-medium leading-tight">Market</span>
        </button>
        <button onClick={() => setActiveTab('post')} className={`flex-1 py-2 rounded-xl transition-all flex flex-col items-center justify-center ${activeTab === 'post' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-400'}`}>
          <span className="font-black text-sm leading-tight">Vender</span>
          <span className="text-[10px] font-medium leading-tight">Sell</span>
        </button>
      </nav>
    </main>
  );
}