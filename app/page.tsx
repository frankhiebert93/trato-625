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
  const [activeTab, setActiveTab] = useState<'feed' | 'post' | 'guidelines'>('feed');
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [showSoldPrompt, setShowSoldPrompt] = useState(false);
  const [verifyPhone, setVerifyPhone] = useState('');
  const [soldLoading, setSoldLoading] = useState(false);

  // NEW: State to control the full-screen image gallery
  const [showFullscreen, setShowFullscreen] = useState(false);

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

  const handleMarkSoldBySeller = async () => {
    if (!selectedItem) return;

    const cleanInput = verifyPhone.replace(/\D/g, '');
    const cleanDBPhone = selectedItem.seller_phone.replace(/\D/g, '');

    if (cleanInput === cleanDBPhone) {
      setSoldLoading(true);
      const { error } = await supabase.from('listings').update({ is_sold: true }).eq('id', selectedItem.id);

      if (!error) {
        setSelectedItem({ ...selectedItem, is_sold: true });
        setListings(listings.map(item => item.id === selectedItem.id ? { ...item, is_sold: true } : item));
        setShowSoldPrompt(false);
        setVerifyPhone('');
        alert("¡Felicidades por tu venta! El artículo ha sido marcado como vendido. / Item marked as sold!");
      } else {
        alert("Hubo un error de conexión.");
      }
      setSoldLoading(false);
    } else {
      alert("El número no coincide con el que se usó para publicar este artículo. / Number does not match.");
    }
  };

  const renderFullscreenGallery = () => {
    if (!showFullscreen || !selectedItem) return null;
    const images = selectedItem.image_urls || [selectedItem.image_url];

    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-50">
          <button
            onClick={() => setShowFullscreen(false)}
            className="bg-white/20 hover:bg-white/30 text-white rounded-full py-2 px-4 backdrop-blur-md font-bold text-sm flex items-center gap-2 transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            Cerrar
          </button>
        </div>

        <div className="flex-1 w-full flex overflow-x-auto snap-x snap-mandatory hide-scrollbar">
          {images.map((img: string, i: number) => (
            <div key={i} className="w-full h-full shrink-0 snap-center flex flex-col items-center justify-center p-2 relative">
              <img
                src={img}
                className={`max-w-full max-h-full object-contain ${selectedItem.is_sold ? 'opacity-50 grayscale' : ''}`}
                alt={`full-${i}`}
              />
              {images.length > 1 && (
                <div className="absolute bottom-[max(2rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 bg-black/60 text-white font-bold text-xs px-4 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
                  {i + 1} / {images.length}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDetailView = () => {
    if (!selectedItem) return null;
    const images = selectedItem.image_urls || [selectedItem.image_url];
    const formattedPrice = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(selectedItem.price);

    return (
      <div className="fixed inset-0 z-50 bg-white overflow-y-auto overflow-x-hidden w-full flex flex-col">
        <div className="sticky top-0 bg-white/95 backdrop-blur-md px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] flex items-center shadow-sm z-10">
          <button onClick={() => { setSelectedItem(null); setShowSoldPrompt(false); setVerifyPhone(''); setShowFullscreen(false); }} className="p-2 -ml-2 bg-gray-100 rounded-full text-slate-700 font-bold flex items-center gap-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Atrás
          </button>
        </div>

        <div className="w-full flex overflow-x-auto snap-x snap-mandatory hide-scrollbar bg-slate-900 relative">
          {images.map((img: string, i: number) => (
            <div
              key={i}
              onClick={() => setShowFullscreen(true)}
              className="w-full h-[30vh] shrink-0 snap-center flex items-center justify-center p-2 relative cursor-pointer group"
            >
              <img
                src={img}
                className={`max-w-full max-h-full object-contain transition-transform group-active:scale-95 ${selectedItem.is_sold ? 'opacity-50 grayscale' : ''}`}
                alt={`img-${i}`}
              />

              {!selectedItem.is_sold && (
                <div className="absolute bottom-3 right-3 bg-black/60 text-white p-2 rounded-full backdrop-blur-sm shadow-lg pointer-events-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                </div>
              )}
            </div>
          ))}
          {selectedItem.is_sold && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <span className="bg-red-600/90 text-white font-black text-4xl tracking-widest px-8 py-3 transform -rotate-12 border-4 border-red-800 shadow-2xl">
                VENDIDO
              </span>
            </div>
          )}
        </div>

        {images.length > 1 && !selectedItem.is_sold && (
          <div className="text-center mt-3 flex flex-col items-center">
            <p className="text-xs font-bold text-gray-400 leading-tight">Desliza para ver más o toca para ampliar ↔</p>
            <p className="text-[10px] font-medium text-gray-500 leading-tight mt-0.5">Swipe to see more or tap to expand ↔</p>
          </div>
        )}

        {/* FIXED: Removed overflow-hidden from this container so you can scroll vertically! */}
        <div className="p-5 pb-40 w-full">
          <div className="flex justify-between items-start w-full">
            <h1 className={`text-2xl font-black leading-tight break-words break-all ${selectedItem.is_sold ? 'text-gray-400 line-through' : 'text-slate-900'}`}>
              {selectedItem.title}
            </h1>
          </div>
          <p className={`${selectedItem.is_sold ? 'text-gray-400' : 'text-blue-600'} font-black text-3xl mt-1`}>{formattedPrice}</p>

          <div className="mt-6 border-t border-gray-100 pt-6 w-full">
            <h3 className="font-bold text-slate-900 mb-2">Detalles / Details</h3>
            <p className="text-slate-600 leading-relaxed whitespace-pre-wrap break-words break-all">{selectedItem.description || 'Sin descripción.'}</p>
          </div>

          {!selectedItem.is_sold && (
            <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-4 w-full">
              <h4 className="font-bold text-slate-800 text-sm mb-2">¿Eres el vendedor? / Are you the seller?</h4>

              {!showSoldPrompt ? (
                <button onClick={() => setShowSoldPrompt(true)} className="text-red-600 font-bold text-sm bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg border border-red-100 transition-colors">
                  Marcar como Vendido
                </button>
              ) : (
                <div className="space-y-3 mt-3 w-full">
                  <p className="text-xs text-slate-500 font-medium">Ingresa el número de WhatsApp que usaste para publicar este artículo para confirmar que es tuyo.</p>
                  <input
                    type="tel"
                    placeholder="Número de WhatsApp..."
                    value={verifyPhone}
                    onChange={(e) => setVerifyPhone(e.target.value)}
                    className="w-full border rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                  <div className="flex gap-2 w-full">
                    <button onClick={handleMarkSoldBySeller} disabled={soldLoading} className="bg-red-600 text-white font-bold px-4 py-2 rounded-lg text-sm flex-1">
                      {soldLoading ? 'Verificando...' : 'Confirmar Venta'}
                    </button>
                    <button onClick={() => { setShowSoldPrompt(false); setVerifyPhone(''); }} className="bg-gray-200 text-gray-700 font-bold px-4 py-2 rounded-lg text-sm">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="fixed bottom-0 w-full bg-white border-t border-gray-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-3 shadow-[0_-5px_20px_-10px_rgba(0,0,0,0.1)] z-20">
          {selectedItem.is_sold ? (
            <div className="flex-[2] bg-gray-200 text-gray-500 py-3.5 rounded-xl font-bold flex flex-col items-center justify-center cursor-not-allowed">
              <span className="text-sm leading-none">Artículo Vendido</span>
              <span className="text-[10px] font-medium mt-1 leading-none">Item Sold</span>
            </div>
          ) : (
            <button onClick={() => handleWhatsAppClick(selectedItem)} className="flex-[2] bg-[#25D366] hover:bg-[#1DA851] text-white py-3.5 rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2 text-lg">
              WhatsApp
            </button>
          )}

          <button onClick={() => handleShare(selectedItem)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-slate-700 py-3.5 rounded-xl font-bold transition-all flex flex-col items-center justify-center">
            <span className="text-sm leading-none">Compartir</span>
          </button>
        </div>
      </div>
    );
  };

  const renderGuidelinesView = () => (
    <div className="p-4 max-w-md mx-auto space-y-6 bg-white rounded-xl shadow-sm border border-gray-100 my-4 text-slate-800">
      <div className="text-center border-b border-gray-100 pb-4">
        <h2 className="text-2xl font-black text-slate-900">Reglas de la Comunidad</h2>
        <p className="text-sm text-slate-500 font-bold">Community Guidelines</p>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="font-bold text-lg text-blue-600 flex items-center gap-2">
            <span>1.</span> Solo Comercio Local
          </h3>
          <p className="text-sm font-medium mt-1">Trato 625 es estrictamente para artículos en Cuauhtémoc y sus alrededores. Si no estás en la zona local, tu publicación será eliminada.</p>
          <p className="text-xs text-slate-400 mt-1 italic">Local items only. Trato 625 is for Cuauhtémoc and surrounding areas. Non-local listings will be deleted.</p>
        </div>

        <div>
          <h3 className="font-bold text-lg text-blue-600 flex items-center gap-2">
            <span>2.</span> Artículos Prohibidos
          </h3>
          <p className="text-sm font-medium mt-1">Cero tolerancia a la venta de artículos ilegales, armas de fuego, drogas, o contenido explícito. Publicar esto resultará en un bloqueo permanente.</p>
          <p className="text-xs text-slate-400 mt-1 italic">Zero tolerance for illegal items, firearms, drugs, or explicit content. Violators will be permanently banned.</p>
        </div>

        <div>
          <h3 className="font-bold text-lg text-blue-600 flex items-center gap-2">
            <span>3.</span> Respeto Mutuo
          </h3>
          <p className="text-sm font-medium mt-1">Sé honesto con las descripciones de tus artículos y respetuoso al contactar a otros usuarios. Evita el spam.</p>
          <p className="text-xs text-slate-400 mt-1 italic">Be honest with item descriptions and respectful when messaging others. No spamming.</p>
        </div>

        <div>
          <h3 className="font-bold text-lg text-blue-600 flex items-center gap-2">
            <span>4.</span> Marca Tus Ventas
          </h3>
          <p className="text-sm font-medium mt-1">Es tu responsabilidad mantener limpio el mercado. Cuando vendas tu artículo, usa tu número de teléfono para marcarlo como "VENDIDO" para que la gente deje de contactarte.</p>
          <p className="text-xs text-slate-400 mt-1 italic">Keep the market clean. When your item sells, use your phone number to mark it as "SOLD".</p>
        </div>
      </div>

      <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 mt-8">
        <h3 className="font-black text-lg text-slate-900 mb-1">📲 Instalar la App / Install App</h3>
        <p className="text-sm text-slate-600 mb-4 font-medium">Agrega Trato 625 a tu pantalla de inicio para acceso rápido. / Add Trato 625 to your home screen for quick access.</p>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-bold text-slate-800">🍎 iPhone (Safari)</p>
            <p className="text-xs text-slate-600 mt-0.5">Toca el botón de compartir (cuadro con flecha) y selecciona <span className="font-bold text-blue-600">"Agregar a la pantalla de inicio"</span>.</p>
            <p className="text-[10px] text-slate-400 mt-0.5 italic">Tap the share button (square with arrow) and select <span className="font-bold">"Add to Home Screen"</span>.</p>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-800">🤖 Android (Chrome)</p>
            <p className="text-xs text-slate-600 mt-0.5">Toca el letrero de "Instalar aplicación" abajo, o abre el menú (3 puntos) y selecciona <span className="font-bold text-blue-600">"Agregar a la pantalla principal"</span>.</p>
            <p className="text-[10px] text-slate-400 mt-0.5 italic">Tap the "Install App" banner, or open the menu (3 dots) and select <span className="font-bold">"Add to Home screen"</span>.</p>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg text-center mt-6 border border-blue-100">
        <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wide">Los administradores se reservan el derecho de eliminar cualquier publicación que viole estas reglas.</p>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-50 pb-32">
      {renderDetailView()}
      {renderFullscreenGallery()}

      <header className="bg-white/95 backdrop-blur-md shadow-sm px-4 pb-3 pt-[max(1.5rem,env(safe-area-inset-top))] sticky top-0 z-30 border-b border-gray-100">
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
        {activeTab === 'post' && <PostForm />}
        {activeTab === 'guidelines' && renderGuidelinesView()}
        {activeTab === 'feed' && (
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

      <nav className="fixed bottom-0 w-full bg-white border-t border-gray-200 flex justify-around p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-w-md left-1/2 -translate-x-1/2 z-20 shadow-[0_-5px_15px_-10px_rgba(0,0,0,0.1)]">
        <button onClick={() => setActiveTab('feed')} className={`flex-1 py-2 rounded-xl transition-all flex flex-col items-center justify-center ${activeTab === 'feed' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-400'}`}>
          <span className="font-black text-sm leading-tight">Mercado</span>
          <span className="text-[10px] font-medium leading-tight">Market</span>
        </button>
        <button onClick={() => setActiveTab('post')} className={`flex-1 py-2 rounded-xl transition-all flex flex-col items-center justify-center ${activeTab === 'post' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-400'}`}>
          <span className="font-black text-sm leading-tight">Vender</span>
          <span className="text-[10px] font-medium leading-tight">Sell</span>
        </button>
        <button onClick={() => setActiveTab('guidelines')} className={`flex-1 py-2 rounded-xl transition-all flex flex-col items-center justify-center ${activeTab === 'guidelines' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-400'}`}>
          <span className="font-black text-sm leading-tight">Reglas</span>
          <span className="text-[10px] font-medium leading-tight">Rules</span>
        </button>
      </nav>
    </main>
  );
}
