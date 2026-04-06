'use client';
import { useState, useEffect } from 'react';
import PostForm from '../components/CameraCapture';
import ListingCard from '../components/ListingCard';
import { supabase } from '../lib/supabase';

const ITEMS_PER_PAGE = 10;
const CATEGORIES = ['Todos', 'Vehículos', 'Herramientas', 'Electrónica', 'Hogar', 'Materiales', 'Otros'];

export default function Home() {
  const [activeTab, setActiveTab] = useState<'feed' | 'post'>('feed');
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');

  // Pagination State
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Re-fetch whenever tab, category, or search changes
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

    // Start building the query
    let query = supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    // Apply category filter
    if (activeCategory !== 'Todos') {
      query = query.eq('category', activeCategory);
    }

    // Apply search text filter
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
    <main className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white shadow-sm pt-6 pb-4 px-4 sticky top-0 z-10">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight text-center mb-4">Trato 625</h1>

        {/* Search Bar */}
        {activeTab === 'feed' && (
          <form onSubmit={handleSearchSubmit} className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg p-2 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button type="submit" className="bg-slate-900 text-white font-bold px-4 py-2 rounded-lg">
              Ir
            </button>
          </form>
        )}

        {/* Categories Scroller */}
        {activeTab === 'feed' && (
          <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${activeCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {cat}
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
              <p className="text-center text-gray-500 font-bold mt-10">No se encontraron artículos.</p>
            ) : (
              listings.map((item) => (
                <ListingCard key={item.id} item={item} />
              ))
            )}

            {hasMore && listings.length > 0 && (
              <button onClick={loadMore} disabled={loading} className="w-full bg-blue-100 text-blue-800 font-bold py-3 rounded-lg mt-4 transition-colors">
                {loading ? 'Cargando...' : 'Cargar más'}
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 w-full bg-white border-t border-gray-200 flex justify-around p-3 pb-6 max-w-md left-1/2 -translate-x-1/2 z-20">
        <button onClick={() => setActiveTab('feed')} className={`flex-1 font-bold text-center py-2 rounded-lg transition-colors ${activeTab === 'feed' ? 'text-blue-600 bg-blue-50' : 'text-gray-500'}`}>
          Mercado
        </button>
        <button onClick={() => setActiveTab('post')} className={`flex-1 font-bold text-center py-2 rounded-lg transition-colors ${activeTab === 'post' ? 'text-blue-600 bg-blue-50' : 'text-gray-500'}`}>
          Vender
        </button>
      </nav>
    </main>
  );
}