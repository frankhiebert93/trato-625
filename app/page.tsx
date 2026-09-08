'use client';
import Link from 'next/link';
import { useUser } from '../lib/useUser';
import EventsFeed from '../components/EventsFeed';

const navLinkClass =
  'shrink-0 rounded-full border-2 border-ink px-3.5 py-1.5 text-[13px] font-extrabold whitespace-nowrap uppercase';

export default function Home() {
  const { user, profile } = useUser();

  return (
    <main className="min-h-screen bg-cream pb-16">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-cream pt-[max(0.875rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-md px-4 pb-3.5">
          <h1 className="font-display text-[26px] leading-none tracking-[.01em] text-ink">
            TRATO <span className="text-terracotta">625</span>
          </h1>
          <p className="mt-1 text-[9px] font-extrabold tracking-[.22em] text-green uppercase">
            Subastas de vehículos en vivo
          </p>

          <nav className="hide-scrollbar mt-3.5 flex items-center gap-2 overflow-x-auto">
            <Link href="/" className={`${navLinkClass} bg-terracotta text-card shadow-hard-sm`}>
              Subastas
            </Link>
            <Link href="/vender" className={`${navLinkClass} bg-card text-ink`}>
              Vender
            </Link>
            {user ? (
              <Link href="/cuenta" className={`${navLinkClass} bg-card text-ink`}>
                Mi cuenta
              </Link>
            ) : (
              <Link href="/entrar" className={`${navLinkClass} bg-card text-ink`}>
                Entrar
              </Link>
            )}
            {profile?.role === 'admin' && (
              <Link href="/admin/dashboard" className={`${navLinkClass} bg-ink text-cream`}>
                Admin
              </Link>
            )}
          </nav>
        </div>
      </header>

      <EventsFeed />

      <footer className="mx-auto max-w-md px-4 pt-2 pb-10 text-center">
        <Link href="/terminos" className="text-[11px] font-bold text-muted underline">
          Términos
        </Link>
      </footer>
    </main>
  );
}
