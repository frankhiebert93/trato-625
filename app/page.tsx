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

    let query = supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (activeCategory !== 'Todos') {
      query = query.eq('category', activeCategory);
    }

    if (searchQuery.trim() !== '') {
      query = query.ilike('title', `%${searchQuery}%`);
    }

    const { data, error } = await query;

    if (!error && data) {
      if (isFreshSearch || pageNumber === 0) {
        setListings(data);
      } else {
        setListings([...listings, ...data]);
      }
      setHasMore(data.length === ITEMS_PER_PAGE);
    }
    setLoading(false);
  }

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchListings(nextPage);
  };

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
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
            <button type="submit" className="bg-slate-900 text-white font-bold px-5 rounded-lg shadow-sm">
              Ir
            </button>
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
          <div className="space-y-5">
            {listings.length === 0 && !loading ? (
              <div className="text-center mt-12">
                <p className="text-slate-500 font-bold text-lg">No se encontraron artículos.</p>
                <p className="text-slate-400 text-sm mt-1">No items found.</p>
              </div>
            ) : (
              listings.map((item) => (
                <ListingCard key={item.id} item={item} />
              ))
            )}

            {hasMore && listings.length > 0 && (
              <button onClick={loadMore} disabled={loading} className="w-full bg-white border border-gray-200 text-blue-600 py-3.5 rounded-xl mt-4 transition-all shadow-sm flex flex-col items-center justify-center">
                <span className="font-bold text-base leading-none">{loading ? 'Cargando...' : 'Cargar más'}</span>
                {!loading && <span className="text-[11px] font-medium text-slate-400 mt-1 leading-none">Load More</span>}
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