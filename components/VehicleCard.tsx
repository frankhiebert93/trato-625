'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

// The safe fields a card needs — never includes reserve_cents. Callers may pass a
// wider row (e.g. a dashboard BidLot); the extra fields are ignored.
export type CardVehicle = {
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

export type Badge = { label: string; className: string };

export function fmtCents(cents: number, currency: string): string {
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

export function vehicleLabel(v: {
  title: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
}): string {
  if (v.title && v.title.trim()) return v.title;
  return [v.make, v.model, v.year].filter(Boolean).join(' ') || 'Vehículo';
}

export function reserveBadge(v: { has_reserve: boolean; reserve_met: boolean }): Badge {
  if (!v.has_reserve) {
    return { label: 'Sin reserva', className: 'bg-green text-card' };
  }
  if (v.reserve_met) {
    return { label: 'Reserva alcanzada', className: 'bg-yellow text-ink' };
  }
  return { label: 'Reserva no alcanzada', className: 'border-2 border-muted-border bg-card text-muted' };
}

/** "2d 04h 15m" / "04:15:33" ticking countdown to `endsAt`, client clock only. */
export function Countdown({ endsAt }: { endsAt: string | null }) {
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

/**
 * Presentational auction card linking to `/subastas/[id]`. Extracted from
 * AuctionFeed so the public feed and the member dashboard render lots identically.
 * `badge` overrides the reserve badge; `footer` overrides the "Termina en" row;
 * `extra` inserts a line under the price.
 */
export default function VehicleCard({
  vehicle,
  badge,
  footer,
  extra,
}: {
  vehicle: CardVehicle;
  badge?: Badge;
  footer?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const label = vehicleLabel(vehicle);
  const hasBids = vehicle.bid_count > 0 && vehicle.current_bid_cents != null;
  const bidLabel = hasBids ? 'Puja actual' : 'Puja inicial';
  const bidAmount = hasBids ? (vehicle.current_bid_cents as number) : vehicle.opening_bid_cents;
  const shownBadge = badge ?? reserveBadge(vehicle);
  const photo = vehicle.photos && vehicle.photos.length > 0 ? vehicle.photos[0] : null;

  return (
    <Link
      href={`/subastas/${vehicle.id}`}
      className="press flex w-full flex-col overflow-hidden rounded-[14px] border-2 border-ink bg-card shadow-hard active:shadow-hard-xs"
    >
      <div className="relative h-[200px] w-full overflow-hidden border-b-2 border-ink bg-well">
        {photo ? (
          <img src={photo} alt={label} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">🚗</div>
        )}
        <span
          className={`absolute top-2.5 left-2.5 z-10 rotate-[-2deg] rounded-lg border-2 border-ink px-2.5 py-1 text-[11px] font-black tracking-[.04em] whitespace-nowrap uppercase ${shownBadge.className}`}
        >
          {shownBadge.label}
        </span>
      </div>

      <div className="p-3.5">
        <h3 className="line-clamp-2 font-display text-[17px] leading-tight text-ink">{label}</h3>

        <div className="mt-2.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black tracking-[.1em] text-muted uppercase">{bidLabel}</p>
            <p className="font-display text-lg text-terracotta">{fmtCents(bidAmount, vehicle.currency)}</p>
          </div>
          <p className="shrink-0 text-[11px] font-bold text-muted">
            {vehicle.bid_count} {vehicle.bid_count === 1 ? 'puja' : 'pujas'}
          </p>
        </div>

        {extra}

        <div className="mt-2.5 flex items-center justify-between border-t-2 border-dashed border-muted-border pt-2.5">
          {footer ?? (
            <>
              <p className="text-[9px] font-black tracking-[.12em] text-green uppercase">Termina en</p>
              <Countdown endsAt={vehicle.ends_at} />
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
