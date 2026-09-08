'use client';
import EventsFeed from '../../components/EventsFeed';
import BackButton from '../../components/BackButton';

export default function SubastasPage() {
  return (
    <main className="min-h-screen bg-cream pb-16">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-cream pt-[max(0.875rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-md px-4 pb-3.5">
          <BackButton className="mb-2.5" />
          <h1 className="font-display text-[26px] leading-none tracking-[.01em] text-ink">
            SUBASTAS <span className="text-terracotta">625</span>
          </h1>
          <p className="mt-1 text-[9px] font-extrabold tracking-[.22em] text-green uppercase">
            Próximas fechas y en vivo
          </p>
        </div>
      </header>

      <EventsFeed />
    </main>
  );
}
