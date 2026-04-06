'use client';
import { useState, useEffect } from 'react';
import PostForm from '../components/CameraCapture';
import ListingCard from '../components/ListingCard';
import { supabase } from '../lib/supabase';

const ITEMS_PER_PAGE = 10;

export default function Home() {
  const [activeTab, setActiveTab] = useState<'feed' | 'post'>('feed');
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New state for Pagination
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (activeTab === 'feed') {
      // Always start fresh at page 0 when opening the feed
      setPage(0);
      fetchListings(0);
    }
  }, [activeTab]);

  async function fetchListings(pageNumber: number) {
    setLoading(true);

    // Calculate which rows to grab
    const from = pageNumber * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Error fetching listings:', error);
    } else if (data) {
      if (pageNumber === 0) {
        setListings(data); // If it's page 0, replace the list
      } else {
        setListings([...listings, ...data]); // If it's page 1+, add to the bottom
      }

      // If Supabase returns less than 10 items, we know we reached the end
      if (data.length < ITEMS_PER_PAGE) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
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
      <header className="bg-white shadow-sm pt-6 pb-4 px-6 sticky top-0 z-10">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight text-center">Trato 625</h1>
      </header>

      <div className="p-4 max-w-md mx-auto">
        {activeTab === 'post' ? (
          <PostForm />
        ) : (
          <div className="space-y-4">
            {listings.length === 0 && !loading ? (
              <p className="text-center text-gray-500 font-bold mt-10">No items yet. Be the first to post!</p>
            ) : (
              listings.map((item) => (
                <ListingCard key={item.id} item={item} />
              ))
            )}

            {/* The Load More Button */}
            {hasMore && listings.length > 0 && (
              <button
                onClick={loadMore}
                disabled={loading}
                className="w-full bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold py-3 rounded-lg mt-4 transition-colors disabled:opacity-50"
              >
                {loading ? 'Cargando...' : 'Cargar más'}
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 w-full bg-white border-t border-gray-200 flex justify-around p-3 pb-6 max-w-md left-1/2 -translate-x-1/2 z-20">
        <button
          onClick={() => setActiveTab('feed')}
          className={`flex-1 font-bold text-center py-2 rounded-lg transition-colors ${activeTab === 'feed' ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          Mercado
        </button>
        <button
          onClick={() => setActiveTab('post')}
          className={`flex-1 font-bold text-center py-2 rounded-lg transition-colors ${activeTab === 'post' ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          Vender
        </button>
      </nav>
    </main>
  );
}