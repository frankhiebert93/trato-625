'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

type EventRow = {
  id: string;
  name: string;
  status: string;
  starts_at: string;
  viewing_location: string | null;
  capacity: number;
};

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'intake': return { label: 'Recibiendo autos', className: 'bg-yellow text-ink' };
    case 'scheduled': return { label: 'Próxima', className: 'border-2 border-ink bg-card text-ink' };
    case 'live': return { label: 'En vivo', className: 'bg-terracotta text-card' };
    case 'closed': return { label: 'Finalizada', className: 'border-2 border-muted-border bg-card text-muted' };
    default: return { label: status, className: 'border-2 border-muted-border bg-card text-muted' };
  }
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

/** Public list of auction events (replaces the old flat live-lot feed). */
export default function EventsFeed() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('auction_events')
        .select('id, name, status, starts_at, viewing_location, capacity')
        .in('status', ['live', 'scheduled', 'intake', 'closed'])
        .order('starts_at', { ascending: true });
      const rows = (data as EventRow[]) ?? [];
      if (!active) return;
      setEvents(rows);

      if (rows.length > 0) {
        const { data: lots } = await supabase
          .from('vehicles')
          .select('event_id')
          .in('event_id', rows.map((r) => r.id))
          .in('status', ['scheduled', 'live', 'sold', 'unsold']);
        if (!active) return;
        const c: Record<string, number> = {};
        for (const l of (lots as { event_id: string }[]) ?? []) {
          c[l.event_id] = (c[l.event_id] ?? 0) + 1;
        }
        setCounts(c);
      }
      setLoading(false);
    }

    load();
    return () => { active = false; };
  }, []);

  return (
    <div className="mx-auto max-w-md p-4">
      {loading ? (
        <div className="flex flex-col gap-3.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse rounded-[14px] border-2 border-ink bg-card p-4 shadow-hard">
              <div className="mb-2 h-5 w-2/3 rounded bg-well" />
              <div className="h-3 w-1/2 rounded bg-well" />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="mt-10 rounded-[14px] border-2 border-dashed border-muted-border bg-card px-4 py-10 text-center">
          <p className="font-display text-[17px] text-ink">No hay subastas por ahora</p>
          <p className="mt-1.5 text-[13px] font-semibold text-muted">Vuelve pronto para ver las próximas fechas.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {events.map((ev) => {
            const badge = statusBadge(ev.status);
            const n = counts[ev.id] ?? 0;
            return (
              <Link
                key={ev.id}
                href={`/subastas/evento/${ev.id}`}
                className="press flex flex-col overflow-hidden rounded-[14px] border-2 border-ink bg-card p-4 shadow-hard active:shadow-hard-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-[18px] leading-tight text-ink">{ev.name}</h3>
                  <span className={`shrink-0 rotate-[-2deg] rounded-lg border-2 border-ink px-2.5 py-1 text-[10px] font-black whitespace-nowrap uppercase ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                <p className="mt-2 text-[13px] font-bold text-muted">{fmtDate(ev.starts_at)}</p>
                {ev.viewing_location && (
                  <p className="mt-0.5 text-[11px] font-semibold text-muted">📍 {ev.viewing_location}</p>
                )}
                <div className="mt-2.5 flex items-center justify-between border-t-2 border-dashed border-muted-border pt-2.5">
                  <p className="text-[11px] font-bold text-muted">{n} {n === 1 ? 'vehículo' : 'vehículos'}</p>
                  <span className="text-[12px] font-black text-green uppercase">Ver lotes →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
