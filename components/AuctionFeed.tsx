'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import VehicleCard, { type CardVehicle } from './VehicleCard';

// Columns the public feed needs. `reserve_cents` is deliberately never selected —
// the badge is derived only from `has_reserve`/`reserve_met` inside VehicleCard.
const VEHICLE_COLUMNS =
  'id, title, make, model, year, photos, currency, current_bid_cents, opening_bid_cents, bid_count, ends_at, has_reserve, reserve_met';

/**
 * Live-auction grid: fetches live lots (safe columns only) and renders VehicleCard
 * links to `/subastas/[id]`. Shared by `/` (home) and `/subastas`.
 */
export default function AuctionFeed() {
  const [vehicles, setVehicles] = useState<CardVehicle[]>([]);
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
      setVehicles(!error && data ? (data as CardVehicle[]) : []);
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
          {vehicles.map((v) => (
            <VehicleCard key={v.id} vehicle={v} />
          ))}
        </div>
      )}
    </div>
  );
}
