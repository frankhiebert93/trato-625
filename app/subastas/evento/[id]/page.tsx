'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import BackButton from '../../../../components/BackButton';
import VehicleCard, { type CardVehicle, type Badge } from '../../../../components/VehicleCard';

type AuctionEvent = {
  id: string;
  name: string;
  status: string;
  starts_at: string;
  viewing_location: string | null;
  viewing_notes: string | null;
};

type Lot = CardVehicle & { status: string; lot_number: number | null };

const LOT_COLUMNS =
  'id, title, make, model, year, photos, currency, opening_bid_cents, current_bid_cents, ' +
  'bid_count, status, ends_at, has_reserve, reserve_met, lot_number';

function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

function eventBadge(status: string): Badge {
  switch (status) {
    case 'intake': return { label: 'Recibiendo autos', className: 'bg-yellow text-ink' };
    case 'scheduled': return { label: 'Próxima', className: 'border-2 border-ink bg-card text-ink' };
    case 'live': return { label: 'En vivo', className: 'bg-terracotta text-card' };
    case 'closed': return { label: 'Finalizada', className: 'border-2 border-muted-border bg-card text-muted' };
    default: return { label: status, className: 'border-2 border-muted-border bg-card text-muted' };
  }
}

// Per-lot badge that reflects the lot's own state within the event.
function lotBadge(lot: Lot): Badge | undefined {
  if (lot.status === 'scheduled') return { label: 'Próxima', className: 'border-2 border-ink bg-card text-ink' };
  if (lot.status === 'sold') return { label: 'Vendido', className: 'bg-green text-card' };
  if (lot.status === 'unsold') return { label: 'No vendido', className: 'border-2 border-muted-border bg-card text-muted' };
  return undefined; // live → let VehicleCard show the reserve badge
}

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [event, setEvent] = useState<AuctionEvent | null | undefined>(undefined);
  const [lots, setLots] = useState<Lot[]>([]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    async function load() {
      const [{ data: ev }, { data: lotRows }] = await Promise.all([
        supabaseSelectEvent(id),
        supabaseSelectLots(id),
      ]);
      if (!active) return;
      setEvent((ev as AuctionEvent) ?? null);
      setLots((lotRows as unknown as Lot[]) ?? []);
    }
    load();
    const poll = setInterval(load, 5000);
    return () => { active = false; clearInterval(poll); };
  }, [id]);

  if (event === undefined) {
    return (
      <main className="min-h-screen bg-cream pb-16">
        <div className="mx-auto max-w-md p-4">
          <div className="animate-pulse rounded-[14px] border-2 border-ink bg-card p-5 shadow-hard">
            <div className="mb-2 h-6 w-2/3 rounded bg-well" />
            <div className="h-4 w-1/2 rounded bg-well" />
          </div>
        </div>
      </main>
    );
  }

  if (event === null) {
    return (
      <main className="min-h-screen bg-cream pb-16">
        <div className="mx-auto max-w-md p-4">
          <div className="mt-10 rounded-[14px] border-2 border-dashed border-muted-border bg-card px-4 py-10 text-center">
            <p className="font-display text-[17px] text-ink">Subasta no encontrada</p>
          </div>
        </div>
      </main>
    );
  }

  const badge = eventBadge(event.status);
  const isPreview = event.status === 'scheduled' || event.status === 'intake';

  return (
    <main className="min-h-screen bg-cream pb-16">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-cream pt-[max(0.875rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-md px-4 pb-3.5">
          <BackButton className="mb-2.5" />
          <div className="flex items-start justify-between gap-2">
            <h1 className="font-display text-[24px] leading-tight text-ink">{event.name}</h1>
            <span className={`shrink-0 rotate-[-2deg] rounded-lg border-2 border-ink px-2.5 py-1 text-[10px] font-black whitespace-nowrap uppercase ${badge.className}`}>
              {badge.label}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md p-4">
        <div className="rounded-[14px] border-2 border-ink bg-card p-3.5 shadow-hard">
          <p className="text-[10px] font-black tracking-[.1em] text-muted uppercase">
            {event.status === 'live' ? 'En vivo desde' : 'Comienza'}
          </p>
          <p className="font-display text-[17px] text-ink">{fmtDateTime(event.starts_at)}</p>
          {event.viewing_location && (
            <p className="mt-2 border-t-2 border-dashed border-muted-border pt-2 text-[13px] font-semibold text-ink">
              📍 Ver en persona: {event.viewing_location}
            </p>
          )}
          {event.viewing_notes && (
            <p className="mt-1 text-[12px] font-semibold text-muted">{event.viewing_notes}</p>
          )}
          {isPreview && (
            <p className="mt-2 text-[12px] font-semibold text-muted">
              Explora los vehículos ahora; las pujas abren cuando inicia la subasta.
            </p>
          )}
        </div>

        <h2 className="mt-4 mb-2.5 text-[10px] font-black tracking-[.1em] text-muted uppercase">
          {lots.length} {lots.length === 1 ? 'vehículo' : 'vehículos'}
        </h2>

        {lots.length === 0 ? (
          <div className="rounded-[14px] border-2 border-dashed border-muted-border bg-card px-4 py-10 text-center">
            <p className="text-[13px] font-semibold text-muted">Aún no hay vehículos en esta subasta.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {lots.map((lot) => (
              <VehicleCard
                key={lot.id}
                vehicle={lot}
                badge={lotBadge(lot)}
                footer={lot.status === 'scheduled' ? (
                  <>
                    <p className="text-[9px] font-black tracking-[.12em] text-green uppercase">Lote</p>
                    <span className="font-display text-sm text-ink">#{lot.lot_number ?? '—'}</span>
                  </>
                ) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

// Small typed wrappers so the effect above stays readable.
function supabaseSelectEvent(id: string) {
  return supabase.from('auction_events')
    .select('id, name, status, starts_at, viewing_location, viewing_notes')
    .eq('id', id).maybeSingle();
}
function supabaseSelectLots(id: string) {
  return supabase.from('vehicles')
    .select(LOT_COLUMNS)
    .eq('event_id', id)
    .in('status', ['scheduled', 'live', 'sold', 'unsold'])
    .order('lot_number', { ascending: true, nullsFirst: false });
}
