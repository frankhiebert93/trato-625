'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

const RAFFLE_START = '2026-06-08T00:00:00.000Z';
const RAFFLE_DEADLINE = '2026-07-04T02:00:00.000Z'; // Jul 3 8pm CST (UTC-6)

type Entry = {
  id: string;
  seller_name: string;
  seller_phone: string;
  title: string;
  created_at: string;
};

export default function RafflePage() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [winner, setWinner] = useState<Entry | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/admin'); return; }
    fetchEntries();
  }

  async function fetchEntries() {
    setLoading(true);
    const { data, error } = await supabase
      .from('listings')
      .select('id, seller_name, seller_phone, title, created_at')
      .gte('created_at', RAFFLE_START)
      .lte('created_at', RAFFLE_DEADLINE)
      .not('seller_phone', 'is', null)
      .order('created_at', { ascending: true });

    if (!error && data) setEntries(data);
    setLoading(false);
  }

  function doRaffle() {
    if (entries.length === 0) return;
    setWinner(null);
    setSpinning(true);

    let ticks = 0;
    const totalTicks = 30 + Math.floor(Math.random() * 20);
    let delay = 60;

    const spin = () => {
      const idx = Math.floor(Math.random() * entries.length);
      setHighlightedIndex(idx);
      ticks++;

      if (ticks < totalTicks) {
        delay = Math.min(delay * 1.08, 500);
        setTimeout(spin, delay);
      } else {
        const finalIdx = Math.floor(Math.random() * entries.length);
        setHighlightedIndex(finalIdx);
        setWinner(entries[finalIdx]);
        setSpinning(false);
      }
    };

    setTimeout(spin, delay);
  }

  function formatPhone(phone: string) {
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 10) return `(${clean.slice(0,3)}) ${clean.slice(3,6)}-${clean.slice(6)}`;
    if (clean.length === 12) return `+${clean.slice(0,2)} (${clean.slice(2,5)}) ${clean.slice(5,8)}-${clean.slice(8)}`;
    return phone;
  }

  const uniquePhones = [...new Set(entries.map(e => e.seller_phone))];

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-20">
      <div className="max-w-2xl mx-auto">

        <header className="flex justify-between items-center py-6 border-b border-gray-200 mb-6">
          <div>
            <h1 className="text-3xl font-black text-slate-900">🎰 Rifa</h1>
            <p className="text-sm text-slate-500 font-bold">8 Jun – 3 Jul 2026 (8pm)</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => router.push('/admin/dashboard')} className="bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg hover:bg-slate-300 transition-colors text-sm">
              ← Dashboard
            </button>
            <button onClick={() => { supabase.auth.signOut(); router.push('/admin'); }} className="bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg hover:bg-slate-300 transition-colors text-sm">
              Logout
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 text-center">
            <p className="text-4xl font-black text-blue-600">{entries.length}</p>
            <p className="text-sm font-bold text-slate-500 mt-1">Artículos publicados</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 text-center">
            <p className="text-4xl font-black text-green-600">{uniquePhones.length}</p>
            <p className="text-sm font-bold text-slate-500 mt-1">Números únicos</p>
          </div>
        </div>

        {/* Raffle button */}
        <div className="bg-white rounded-xl border-2 border-amber-300 shadow-sm p-6 mb-6 text-center">
          <p className="text-sm font-bold text-slate-500 mb-1">
            Cada artículo publicado = 1 boleto. Más artículos = más probabilidad.
          </p>
          <p className="text-xs font-bold text-red-500 mb-4">
            Cierre: 3 Jul 2026 a las 8:00pm
          </p>
          <button
            onClick={doRaffle}
            disabled={spinning || entries.length === 0}
            className="bg-amber-400 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-amber-900 font-black text-xl px-10 py-4 rounded-xl shadow-md transition-all active:scale-95"
          >
            {spinning ? '🎲 Girando...' : '🎰 ¡Rifar Ahora!'}
          </button>
        </div>

        {/* Winner */}
        {winner && !spinning && (
          <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-4 border-amber-400 rounded-2xl p-6 mb-6 text-center shadow-lg animate-pulse-once">
            <p className="text-5xl mb-3">🏆</p>
            <p className="text-xs font-black uppercase tracking-widest text-amber-600 mb-2">¡Ganador!</p>
            <p className="text-2xl font-black text-slate-900">{winner.seller_name}</p>
            <p className="text-3xl font-black text-green-600 mt-1 tracking-wider">{formatPhone(winner.seller_phone)}</p>
            <p className="text-sm text-slate-500 font-bold mt-2">"{winner.title}"</p>
            <p className="text-xs text-slate-400 mt-1">{new Date(winner.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>
        )}

        {/* Entries list */}
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-black text-slate-900">Participantes</h2>
          <button onClick={fetchEntries} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">Actualizar</button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-bold text-slate-500">Sin participantes todavía.</p>
            <p className="text-xs text-slate-400 mt-1">Los artículos publicados desde el 8 de Junio aparecerán aquí.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, index) => {
              const isHighlighted = highlightedIndex === index;
              const isWinner = winner?.id === entry.id && !spinning;
              return (
                <div
                  key={entry.id}
                  className={`rounded-xl border p-4 flex items-center gap-4 transition-all duration-75 ${
                    isWinner
                      ? 'bg-amber-50 border-amber-400 shadow-md'
                      : isHighlighted
                      ? 'bg-blue-50 border-blue-400 scale-[1.01]'
                      : 'bg-white border-gray-100'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-black text-slate-500">{index + 1}</span>
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="font-bold text-slate-900 truncate">{entry.seller_name}</p>
                    <p className="text-sm text-green-600 font-bold">{formatPhone(entry.seller_phone)}</p>
                    <p className="text-xs text-slate-400 truncate">{entry.title}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</p>
                    {isWinner && <p className="text-xs font-black text-amber-600">GANADOR 🏆</p>}
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
