'use client';
import { useState, useEffect } from 'react';
import PostForm from '../components/CameraCapture';
import ListingCard from '../components/ListingCard';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'feed' | 'post'>('feed');
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch items from Supabase whenever the Feed tab is active
  useEffect(() => {
    if (activeTab === 'feed') {
      fetchListings();
    }
  }, [activeTab]);

  async function fetchListings() {
    setLoading(true);
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching listings:', error);
    } else {
      setListings(data || []);
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm pt-6 pb-4 px-6 sticky top-0 z-10">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight text-center">Trato 625</h1>
      </header>

      {/* Content Area */}
      <div className="p-4 max-w-md mx-auto">
        {activeTab === 'post' ? (
          <PostForm />
        ) : (
          <div className="space-y-4">
            {loading ? (
              <p className="text-center text-gray-500 font-bold mt-10">Cargando...</p>
            ) : listings.length === 0 ? (
              <p className="text-center text-gray-500 font-bold mt-10">No items yet. Be the first to post!</p>
            ) : (
              listings.map((item) => (
                <ListingCard key={item.id} item={item} />
              ))
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 w-full bg-white border-t border-gray-200 flex justify-around p-3 pb-6 max-w-md left-1/2 -translate-x-1/2">
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