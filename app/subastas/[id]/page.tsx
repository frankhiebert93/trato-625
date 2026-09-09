'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import BackButton from '../../../components/BackButton';
import { useUser } from '../../../lib/useUser';
import { waNumber } from '../../../lib/i18n';
import { isWatching, addWatch, removeWatch } from '../../../lib/account';

type Vehicle = {
  id: string;
  title: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage_km: number | null;
  condition: string | null;
  vin: string | null;
  description: string | null;
  location: string | null;
  photos: string[] | null;
  currency: string;
  opening_bid_cents: number;
  current_bid_cents: number | null;
  current_leader_id: string | null;
  bid_count: number;
  status: string;
  ends_at: string | null;
  has_reserve: boolean;
  reserve_met: boolean;
  event_id: string | null;
};

type BidHistoryRow = {
  amount_cents: number;
  created_at: string;
  bidder_label: string;
};

// `get_settlement_contact` returns a row only to the winner or seller of a
// sold lot — 'seller' means the viewer won and should contact the seller,
// 'winner' means the viewer sold and should contact the winner.
type SettlementContact = {
  counterparty: 'seller' | 'winner';
  name: string | null;
  phone: string | null;
};

// The seller's commission on this lot (RLS returns a row only to the seller).
type SaleCommission = {
  currency: string;
  commission_cents: number;
  status: 'owed' | 'paid' | 'waived';
  method: string | null;
};

// Columns the detail page needs — the same public set the feed uses, plus
// specs. `reserve_cents` is deliberately never selected; the badge below is
// derived only from `has_reserve` / `reserve_met`.
const VEHICLE_COLUMNS =
  'id, title, make, model, year, mileage_km, condition, vin, description, location, ' +
  'photos, currency, opening_bid_cents, current_bid_cents, current_leader_id, bid_count, ' +
  'status, ends_at, has_reserve, reserve_met, event_id';

const POLL_MS = 3000;

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

function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '—';
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

function relativeTime(iso: string, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (diffSec < 5) return 'justo ahora';
  if (diffSec < 60) return `hace ${diffSec} s`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  return `hace ${day} d`;
}

/** Maps a `place_bid` RPC error message to a Spanish, user-facing string. */
function mapBidError(message: string, currency: string): string {
  const tooLow = message.match(/BID_TOO_LOW min=(\d+)/);
  if (tooLow) {
    return `Tu puja debe ser al menos ${fmtCents(Number(tooLow[1]), currency)}`;
  }
  if (message.includes('ENDED')) return 'La subasta terminó.';
  if (message.includes('NOT_LIVE')) return 'Esta subasta no está activa.';
  if (message.includes('SELLER_CANNOT_BID')) return 'No puedes pujar en tu propio vehículo.';
  if (message.includes('ALREADY_LEADING')) return 'Ya vas ganando esta subasta.';
  if (message.includes('BANNED')) return 'Tu cuenta no puede pujar en este momento.';
  if (message.includes('AUTH_REQUIRED')) return 'Inicia sesión para pujar.';
  if (message.includes('NOT_FOUND')) return 'Este vehículo ya no está disponible.';
  return 'No se pudo registrar tu puja. Intenta de nuevo.';
}

/** "2d 04:15:33" / "04:15:33" countdown to `endsAt`, driven by the shared clock. */
function Countdown({ endsAt, now }: { endsAt: string | null; now: number }) {
  if (!endsAt) return <span className="font-display text-lg text-ink">—</span>;

  const diffMs = new Date(endsAt).getTime() - now;
  if (diffMs <= 0) {
    return <span className="font-display text-lg text-terracotta">Finalizada</span>;
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

  return <span className="font-display text-lg text-ink">{text}</span>;
}

async function fetchVehicle(id: string): Promise<Vehicle | null> {
  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as Vehicle;
}

async function fetchHistory(id: string): Promise<BidHistoryRow[]> {
  const { data, error } = await supabase.rpc('public_bid_history', { p_vehicle_id: id });
  if (error || !data) return [];
  return data as BidHistoryRow[];
}

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useUser();

  // `undefined` = still loading, `null` = confirmed not found.
  const [vehicle, setVehicle] = useState<Vehicle | null | undefined>(undefined);
  const [history, setHistory] = useState<BidHistoryRow[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [eventInfo, setEventInfo] = useState<{ starts_at: string; viewing_location: string | null } | null>(null);
  const [commission, setCommission] = useState<SaleCommission | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState('');

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Initial load + polling of the lot (safe columns only) and bid history.
  useEffect(() => {
    if (!id) return;
    let active = true;

    async function refresh() {
      const [v, h] = await Promise.all([fetchVehicle(id), fetchHistory(id)]);
      if (!active) return;
      setVehicle(v);
      setHistory(h);
    }

    refresh();
    const poll = setInterval(refresh, POLL_MS);
    return () => {
      active = false;
      clearInterval(poll);
    };
  }, [id]);

  // Current minimum bid, refreshed whenever the signed-in bidder or the
  // polled lot's price state changes. Only meaningful while signed in — the
  // bid box that reads it isn't rendered otherwise.
  const [minBidCentsRaw, setMinBidCentsRaw] = useState<number | null>(null);
  useEffect(() => {
    if (!id || !user) return;
    let active = true;
    supabase.rpc('next_min_bid', { p_vehicle_id: id }).then(({ data, error }) => {
      if (!active) return;
      if (!error && typeof data === 'number') setMinBidCentsRaw(data);
    });
    return () => { active = false; };
  }, [id, user, vehicle?.current_bid_cents, vehicle?.bid_count]);
  const minBidCents = user ? minBidCentsRaw : null;

  // Settlement contact reveal — only meaningful once the lot is sold, and
  // only returns a row to the actual winner or seller (RLS-equivalent check
  // inside the RPC; an uninvolved viewer gets an empty result). Fetched once
  // per (lot, user) pair rather than on every poll tick.
  const [contact, setContact] = useState<SettlementContact | null>(null);
  const contactFetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!id || !user || vehicle?.status !== 'sold') return;
    const key = `${id}:${user.id}`;
    if (contactFetchedFor.current === key) return;
    contactFetchedFor.current = key;
    let active = true;
    supabase.rpc('get_settlement_contact', { p_vehicle_id: id }).then(({ data, error }) => {
      if (!active) return;
      if (!error && Array.isArray(data) && data.length > 0) {
        setContact(data[0] as SettlementContact);
      }
    });
    return () => { active = false; };
  }, [id, user, vehicle?.status]);

  // Watch (follow) state — `null` while unknown or signed out.
  const [watching, setWatching] = useState<boolean | null>(null);
  const [watchBusy, setWatchBusy] = useState(false);
  useEffect(() => {
    // While signed out the render shows the sign-in prompt regardless of this
    // state, so there is no need to reset it here (keeps the effect side-effect
    // free until the async check resolves).
    if (!id || !user) return;
    let active = true;
    isWatching(id).then((w) => { if (active) setWatching(w); });
    return () => { active = false; };
  }, [id, user]);

  // Load the lot's event (preview state: viewing location + start date).
  useEffect(() => {
    const eid = vehicle?.event_id;
    if (!eid) return;
    let active = true;
    supabase.from('auction_events').select('starts_at, viewing_location').eq('id', eid).maybeSingle()
      .then(({ data }) => {
        if (active && data) setEventInfo(data as { starts_at: string; viewing_location: string | null });
      });
    return () => { active = false; };
  }, [vehicle?.event_id]);

  // The seller's commission on a sold lot. RLS returns a row only to the seller,
  // so a non-seller viewer simply gets nothing and the block never renders.
  useEffect(() => {
    if (!id || !user || vehicle?.status !== 'sold') return;
    let active = true;
    supabase.from('sale_commissions')
      .select('currency, commission_cents, status, method')
      .eq('vehicle_id', id)
      .maybeSingle()
      .then(({ data }) => { if (active && data) setCommission(data as SaleCommission); });
    return () => { active = false; };
  }, [id, user, vehicle?.status]);

  async function payCommission() {
    setPayError('');
    setPayBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s.session?.access_token;
      if (!token) throw new Error('Inicia sesión de nuevo.');
      const res = await fetch('/api/commissions/pay', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ vehicle_id: id }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? 'No se pudo iniciar el pago.');
      window.location.href = json.url;
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'No se pudo iniciar el pago.');
      setPayBusy(false);
    }
  }

  async function toggleWatch() {
    if (!user || watching === null) return;
    const next = !watching;
    setWatchBusy(true);
    setWatching(next); // optimistic
    const { error } = next ? await addWatch(id) : await removeWatch(id);
    if (error) setWatching(!next); // rollback
    setWatchBusy(false);
  }

  // Prefill the bid input from the current minimum, but only until the
  // bidder edits it by hand. Adjusting state while rendering (rather than in
  // an effect) avoids an extra commit — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [bidInput, setBidInput] = useState('');
  const [bidDirty, setBidDirty] = useState(false);
  const [seededMin, setSeededMin] = useState<number | null>(null);
  if (minBidCents !== null && minBidCents !== seededMin && !bidDirty) {
    setSeededMin(minBidCents);
    setBidInput(String(minBidCents / 100));
  }

  const [bidding, setBidding] = useState(false);
  const [bidError, setBidError] = useState('');
  const [bidNotice, setBidNotice] = useState('');

  async function handleBid(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicle) return;
    setBidError('');
    setBidNotice('');

    const pesos = Number(bidInput);
    if (!Number.isFinite(pesos) || pesos <= 0) {
      setBidError('Ingresa un monto válido.');
      return;
    }

    setBidding(true);
    const { error } = await supabase.rpc('place_bid', {
      p_vehicle_id: id,
      p_amount_cents: Math.round(pesos * 100),
    });
    setBidding(false);

    if (error) {
      setBidError(mapBidError(error.message, vehicle.currency));
      return;
    }

    setBidNotice('¡Puja registrada!');
    setBidDirty(false);
    const [v, h] = await Promise.all([fetchVehicle(id), fetchHistory(id)]);
    setVehicle(v);
    setHistory(h);
  }

  if (vehicle === undefined) {
    return (
      <main className="min-h-screen bg-cream pb-16">
        <div className="mx-auto max-w-md p-4">
          <div className="animate-pulse overflow-hidden rounded-[14px] border-2 border-ink bg-card shadow-hard">
            <div className="h-[240px] w-full border-b-2 border-ink bg-well" />
            <div className="p-3.5">
              <div className="mb-2 h-5 w-3/4 rounded bg-well" />
              <div className="h-4 w-1/2 rounded bg-well" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (vehicle === null) {
    return (
      <main className="min-h-screen bg-cream pb-16">
        <div className="mx-auto max-w-md p-4">
          <div className="mt-10 rounded-[14px] border-2 border-dashed border-muted-border bg-card px-4 py-10 text-center">
            <p className="font-display text-[17px] text-ink">Vehículo no encontrado</p>
            <p className="mt-1.5 text-[13px] font-semibold text-muted">
              Puede que ya no esté disponible o que la subasta no sea pública.
            </p>
            <Link
              href="/subastas"
              className="press mt-4 inline-block rounded-lg border-2 border-ink bg-terracotta px-4 py-2 text-[13px] font-black text-card shadow-hard-sm uppercase"
            >
              Ver subastas
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const label = vehicleLabel(vehicle);
  const hasBids = vehicle.bid_count > 0 && vehicle.current_bid_cents != null;
  const priceLabel = hasBids ? 'Puja actual' : 'Puja inicial';
  const priceAmount = hasBids ? (vehicle.current_bid_cents as number) : vehicle.opening_bid_cents;
  const badge = reserveBadge(vehicle);
  const photos = vehicle.photos && vehicle.photos.length > 0 ? vehicle.photos : [];
  const hasEnded = vehicle.status !== 'live'
    || (vehicle.ends_at ? new Date(vehicle.ends_at).getTime() <= now : false);
  const isLeader = !!user && vehicle.current_leader_id === user.id;
  const isScheduled = vehicle.status === 'scheduled';

  return (
    <main className="min-h-screen bg-cream pb-16">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-cream pt-[max(0.875rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 pb-3.5">
          <BackButton fallback="/subastas" />
        </div>
      </header>

      <div className="mx-auto max-w-md p-4">
        {/* Gallery */}
        <div className="overflow-hidden rounded-[14px] border-2 border-ink bg-card shadow-hard">
          <div className="relative h-[240px] w-full border-b-2 border-ink bg-well">
            {photos.length > 0 ? (
              <img
                src={photos[photoIndex] ?? photos[0]}
                alt={label}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-5xl">🚗</div>
            )}
            <span
              className={`absolute top-2.5 left-2.5 z-10 rotate-[-2deg] rounded-lg border-2 border-ink px-2.5 py-1 text-[11px] font-black tracking-[.04em] whitespace-nowrap uppercase ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>
          {photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto p-2.5">
              {photos.map((p, i) => (
                <button
                  key={p + i}
                  type="button"
                  onClick={() => setPhotoIndex(i)}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${i === photoIndex ? 'border-terracotta' : 'border-ink'}`}
                >
                  <img src={p} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <h1 className="mt-3.5 font-display text-[22px] leading-tight text-ink">{label}</h1>

        {/* Price + countdown */}
        <div className="mt-3 flex items-end justify-between gap-2 border-b-2 border-dashed border-muted-border pb-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black tracking-[.1em] text-muted uppercase">{priceLabel}</p>
            <p className="font-display text-2xl text-terracotta">{fmtCents(priceAmount, vehicle.currency)}</p>
            <p className="mt-1 text-[11px] font-bold text-muted">
              {vehicle.bid_count} {vehicle.bid_count === 1 ? 'puja' : 'pujas'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[9px] font-black tracking-[.12em] text-green uppercase">
              {isScheduled ? 'Subasta' : hasEnded ? 'Estado' : 'Termina en'}
            </p>
            {isScheduled ? (
              <span className="font-display text-lg text-ink">Programada</span>
            ) : hasEnded ? (
              <span className="font-display text-lg text-terracotta">Finalizada</span>
            ) : (
              <Countdown endsAt={vehicle.ends_at} now={now} />
            )}
          </div>
        </div>

        {/* Follow / watch this auction */}
        {user ? (
          watching !== null && (
            <button
              type="button"
              onClick={toggleWatch}
              disabled={watchBusy}
              className={`press mt-3 w-full rounded-lg border-2 border-ink px-4 py-2.5 text-[13px] font-black uppercase shadow-hard-sm disabled:opacity-60 ${
                watching ? 'bg-card text-ink' : 'bg-green text-card'
              }`}
            >
              {watching ? '★ Siguiendo · dejar de seguir' : '☆ Seguir esta subasta'}
            </button>
          )
        ) : (
          <Link
            href="/entrar"
            className="mt-3 block text-center text-[12px] font-semibold text-muted underline"
          >
            Inicia sesión para seguir esta subasta
          </Link>
        )}

        {isLeader && !hasEnded && (
          <p className="mt-3 rounded-lg border-2 border-ink bg-green-tint px-3 py-2 text-center text-[13px] font-black text-green uppercase">
            Vas ganando
          </p>
        )}

        {/* Bid box */}
        <div className="mt-3.5 rounded-[14px] border-2 border-ink bg-card p-3.5 shadow-hard">
          {isScheduled ? (
            <div className="text-center">
              <p className="mb-1 text-[13px] font-semibold text-muted">Esta subasta aún no abre. Podrás pujar cuando inicie.</p>
              {eventInfo?.starts_at && (
                <p className="text-[13px] font-black text-ink">Abre el {fmtDateTime(eventInfo.starts_at)}</p>
              )}
              {eventInfo?.viewing_location && (
                <p className="mt-2 text-[12px] font-semibold text-muted">📍 Puedes verlo en: {eventInfo.viewing_location}</p>
              )}
            </div>
          ) : !user ? (
            <div className="text-center">
              <p className="mb-2 text-[13px] font-semibold text-muted">Inicia sesión para pujar en este vehículo.</p>
              <Link
                href="/entrar"
                className="press inline-block rounded-lg border-2 border-ink bg-terracotta px-4 py-2.5 text-[13px] font-black text-card shadow-hard-sm uppercase"
              >
                Inicia sesión para pujar
              </Link>
            </div>
          ) : hasEnded ? (
            <p className="text-center text-[13px] font-black text-muted uppercase">La subasta terminó</p>
          ) : isLeader ? (
            <p className="text-center text-[13px] font-semibold text-muted">
              Nadie te ha superado todavía. Te avisaremos si alguien puja más alto.
            </p>
          ) : (
            <form onSubmit={handleBid}>
              <label className="mb-1 block text-[10px] font-black tracking-[.1em] text-muted uppercase">
                Tu puja ({vehicle.currency})
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={minBidCents != null ? minBidCents / 100 : undefined}
                  step="1"
                  value={bidInput}
                  onChange={(e) => {
                    setBidDirty(true);
                    setBidInput(e.target.value);
                    setBidError('');
                    setBidNotice('');
                  }}
                  className="w-full rounded-lg border-2 border-ink bg-well px-3 py-2.5 font-display text-lg text-ink"
                />
                <button
                  type="submit"
                  disabled={bidding}
                  className="press shrink-0 rounded-lg border-2 border-ink bg-terracotta px-4 py-2.5 text-[13px] font-black text-card shadow-hard-sm uppercase disabled:opacity-60"
                >
                  {bidding ? 'Enviando...' : 'Pujar'}
                </button>
              </div>
              {minBidCents != null && (
                <p className="mt-1.5 text-[11px] font-bold text-muted">
                  Mínimo: {fmtCents(minBidCents, vehicle.currency)}
                </p>
              )}
              {bidError && <p className="mt-1.5 text-[12px] font-bold text-terracotta">{bidError}</p>}
              {bidNotice && <p className="mt-1.5 text-[12px] font-bold text-green">{bidNotice}</p>}
            </form>
          )}
        </div>

        {/* Settlement contact reveal — only rendered when the RPC returned a row */}
        {contact && (
          <div className="mt-3.5 rounded-[14px] border-2 border-ink bg-green-tint p-3.5 shadow-hard">
            <p className="font-display text-[17px] text-ink">
              {contact.counterparty === 'seller'
                ? '¡Ganaste! Contacta al vendedor'
                : 'Se vendió. Contacta al comprador'}
            </p>
            {contact.name && (
              <p className="mt-1 text-[13px] font-bold text-ink">{contact.name}</p>
            )}
            {contact.phone && (
              <a
                href={`https://wa.me/${waNumber(contact.phone)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="press mt-3 inline-block rounded-lg border-2 border-ink bg-green px-4 py-2.5 text-[13px] font-black text-card shadow-hard-sm uppercase"
              >
                Contactar por WhatsApp
              </a>
            )}
          </div>
        )}

        {/* Seller's commission on this sale (only the seller ever sees this) */}
        {commission && (
          <div className="mt-3.5 rounded-[14px] border-2 border-ink bg-card p-3.5 shadow-hard">
            <p className="text-[10px] font-black tracking-[.1em] text-muted uppercase">Comisión de la plataforma</p>
            <p className="font-display text-2xl text-ink">{fmtCents(commission.commission_cents, commission.currency)}</p>
            {commission.status === 'owed' ? (
              <>
                <p className="mt-1 text-[12px] font-semibold text-muted">
                  Comisión por la venta. Paga con tarjeta, o coordina transferencia o efectivo con el administrador.
                </p>
                {payError && <p className="mt-1.5 text-[12px] font-bold text-terracotta">{payError}</p>}
                <button
                  type="button"
                  onClick={payCommission}
                  disabled={payBusy}
                  className="press mt-3 inline-block rounded-lg border-2 border-ink bg-terracotta px-4 py-2.5 text-[13px] font-black text-card shadow-hard-sm uppercase disabled:opacity-60"
                >
                  {payBusy ? 'Redirigiendo…' : 'Pagar con tarjeta'}
                </button>
              </>
            ) : commission.status === 'paid' ? (
              <p className="mt-1 text-[13px] font-black text-green uppercase">
                Pagada{commission.method ? ` · ${commission.method}` : ''}
              </p>
            ) : (
              <p className="mt-1 text-[13px] font-black text-muted uppercase">Condonada</p>
            )}
          </div>
        )}

        {/* Specs */}
        <div className="mt-3.5 rounded-[14px] border-2 border-ink bg-card p-3.5 shadow-hard">
          <p className="mb-2 text-[10px] font-black tracking-[.1em] text-muted uppercase">Detalles</p>
          <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
            {vehicle.mileage_km != null && (
              <>
                <dt className="font-bold text-muted">Kilometraje</dt>
                <dd className="text-ink">{new Intl.NumberFormat('es-MX').format(vehicle.mileage_km)} km</dd>
              </>
            )}
            {vehicle.condition && (
              <>
                <dt className="font-bold text-muted">Condición</dt>
                <dd className="text-ink">{vehicle.condition}</dd>
              </>
            )}
            {vehicle.location && (
              <>
                <dt className="font-bold text-muted">Ubicación</dt>
                <dd className="text-ink">{vehicle.location}</dd>
              </>
            )}
            {vehicle.vin && (
              <>
                <dt className="font-bold text-muted">VIN</dt>
                <dd className="text-ink">{vehicle.vin}</dd>
              </>
            )}
          </dl>
          {vehicle.description && (
            <p className="mt-3 border-t-2 border-dashed border-muted-border pt-3 text-[13px] text-ink whitespace-pre-wrap">
              {vehicle.description}
            </p>
          )}
        </div>

        {/* Bid history */}
        <div className="mt-3.5 rounded-[14px] border-2 border-ink bg-card p-3.5 shadow-hard">
          <p className="mb-2 text-[10px] font-black tracking-[.1em] text-muted uppercase">Historial de pujas</p>
          {history.length === 0 ? (
            <p className="text-[13px] font-semibold text-muted">Todavía no hay pujas.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((h, i) => (
                <li
                  key={`${h.created_at}-${i}`}
                  className="flex items-center justify-between border-b border-dashed border-muted-border pb-2 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-[13px] font-bold text-ink">{h.bidder_label}</p>
                    <p className="text-[11px] font-semibold text-muted">{relativeTime(h.created_at, now)}</p>
                  </div>
                  <p className="font-display text-sm text-terracotta">{fmtCents(h.amount_cents, vehicle.currency)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
