'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

type Vehicle = {
  id: string;
  title: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  photos: string[] | null;
  currency: string;
  current_bid_cents: number | null;
  opening_bid_cents: number;
  bid_count: number;
  ends_at: string | null;
  has_reserve: boolean;
  reserve_met: boolean;
};

// Columns the public feed needs. `reserve_cents` is deliberately never
// selected — the badge below is derived only from `has_reserve`/`reserve_met`.
const VEHICLE_COLUMNS =
  'id, title, make, model, year, photos, currency, current_bid_cents, opening_bid_cents, bid_count, ends_at, has_reserve, reserve_met';

function fmtCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency}`;
  }
}

function vehicleLabel(v: Vehicle): string {
  if (v.title && v.title.trim()) return v.title;
  return [v.make, v.model, v.year].filter(Boolean).join(' ') || 'Vehículo';
}

function reserveBadge(v: Vehicle): { label: string; className: string } {
  if (!v.has_reserve) {
    return { label: 'Sin reserva', className: 'bg-green text-card' };
  }
  if (v.reserve_met) {
    return { label: 'Reserva alcanzada', className: 'bg-yellow text-ink' };
  }
  return { label: 'Reserva no alcanzada', className: 'border-2 border-muted-border bg-card text-muted' };
}

/** "2d 04:15:33" / "04:15:33" ticking countdown to `endsAt`, client clock only. */
function Countdown({ endsAt }: { endsAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!endsAt) return <span className="font-display text-sm text-ink">—</span>;

  const diffMs = new Date(endsAt).getTime() - now;
  if (diffMs <= 0) {
    return <span className="font-display text-sm text-terracotta">Finalizada</span>;
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  const text = days > 0
    ? `${days}d ${pad(hours)}h ${pad(minutes)}m`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return <span className="font-display text-sm text-ink">{text}</span>;
}

export default function SubastasPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('vehicles')
        .select(VEHICLE_COLUMNS)
        .eq('status', 'live')
        .order('ends_at', { ascending: true });

      if (!active) return;
      setVehicles(!error && data ? (data as Vehicle[]) : []);
      setLoading(false);
    }

    load();
    return () => { active = false; };
  }, []);

  return (
    <main className="min-h-screen bg-cream pb-16">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-cream pt-[max(0.875rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-md px-4 pb-3.5">
          <h1 className="font-display text-[26px] leading-none tracking-[.01em] text-ink">
            SUBASTAS <span className="text-terracotta">EN VIVO</span>
          </h1>
          <p className="mt-1 text-[9px] font-extrabold tracking-[.22em] text-green uppercase">
            Vehículos a la mejor puja
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-md p-4">
        {loading ? (
          <div className="flex flex-col gap-3.5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse overflow-hidden rounded-[14px] border-2 border-ink bg-card shadow-hard">
                <div className="h-[200px] w-full border-b-2 border-ink bg-well" />
                <div className="p-3.5">
                  <div className="mb-2 h-4 w-3/4 rounded bg-well" />
                  <div className="h-3 w-1/3 rounded bg-well" />
                </div>
              </div>
            ))}
          </div>
        ) : vehicles.length === 0 ? (
          <div className="mt-10 rounded-[14px] border-2 border-dashed border-muted-border bg-card px-4 py-10 text-center">
            <p className="font-display text-[17px] text-ink">No hay subastas activas</p>
            <p className="mt-1.5 text-[13px] font-semibold text-muted">Vuelve pronto para ver nuevos vehículos.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {vehicles.map((v) => {
              const label = vehicleLabel(v);
              const hasBids = v.bid_count > 0 && v.current_bid_cents != null;
              const bidLabel = hasBids ? 'Puja actual' : 'Puja inicial';
              const bidAmount = hasBids ? (v.current_bid_cents as number) : v.opening_bid_cents;
              const badge = reserveBadge(v);
              const photo = v.photos && v.photos.length > 0 ? v.photos[0] : null;

              return (
                <Link
                  key={v.id}
                  href={`/subastas/${v.id}`}
                  className="press flex w-full flex-col overflow-hidden rounded-[14px] border-2 border-ink bg-card shadow-hard active:shadow-hard-xs"
                >
                  <div className="relative h-[200px] w-full overflow-hidden border-b-2 border-ink bg-well">
                    {photo ? (
                      <img src={photo} alt={label} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl">🚗</div>
                    )}
                    <span
                      className={`absolute top-2.5 left-2.5 z-10 rotate-[-2deg] rounded-lg border-2 border-ink px-2.5 py-1 text-[11px] font-black tracking-[.04em] whitespace-nowrap uppercase ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="p-3.5">
                    <h3 className="line-clamp-2 font-display text-[17px] leading-tight text-ink">{label}</h3>

                    <div className="mt-2.5 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black tracking-[.1em] text-muted uppercase">{bidLabel}</p>
                        <p className="font-display text-lg text-terracotta">{fmtCents(bidAmount, v.currency)}</p>
                      </div>
                      <p className="shrink-0 text-[11px] font-bold text-muted">
                        {v.bid_count} {v.bid_count === 1 ? 'puja' : 'pujas'}
                      </p>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between border-t-2 border-dashed border-muted-border pt-2.5">
                      <p className="text-[9px] font-black tracking-[.12em] text-green uppercase">Termina en</p>
                      <Countdown endsAt={v.ends_at} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
