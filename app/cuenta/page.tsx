'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '../../lib/useUser';
import VehicleCard, { fmtCents, type Badge } from '../../components/VehicleCard';
import BackButton from '../../components/BackButton';
import {
  fetchMyBidLots,
  fetchMyWonLots,
  fetchMyListings,
  fetchWatchedLots,
  fetchUpcomingLots,
  type AccountVehicle,
  type BidLot,
} from '../../lib/account';

type TabKey = 'pujas' | 'ganados' | 'vehiculos' | 'siguiendo' | 'proximas';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pujas', label: 'Mis pujas' },
  { key: 'ganados', label: 'Ganados' },
  { key: 'vehiculos', label: 'Mis vehículos' },
  { key: 'siguiendo', label: 'Siguiendo' },
  { key: 'proximas', label: 'Próximas' },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

// Badge for a bidder's relationship to a lot they bid on.
function bidBadge(v: BidLot): Badge {
  if (v.i_won) return { label: 'Ganaste', className: 'bg-green text-card' };
  if (v.status === 'live') {
    return v.is_leading
      ? { label: 'Vas ganando', className: 'bg-green text-card' }
      : { label: 'Te superaron', className: 'bg-terracotta text-card' };
  }
  if (v.status === 'sold') return { label: 'No ganada', className: 'border-2 border-muted-border bg-card text-muted' };
  if (v.status === 'unsold') return { label: 'Sin venta', className: 'border-2 border-muted-border bg-card text-muted' };
  return { label: 'Finalizada', className: 'border-2 border-muted-border bg-card text-muted' };
}

// Badge for one of the seller's own listings, by status.
function listingBadge(status: string): Badge {
  switch (status) {
    case 'draft': return { label: 'Borrador', className: 'border-2 border-muted-border bg-card text-muted' };
    case 'pending_review': return { label: 'En revisión', className: 'bg-yellow text-ink' };
    case 'scheduled': return { label: 'Programada', className: 'border-2 border-ink bg-card text-ink' };
    case 'live': return { label: 'En vivo', className: 'bg-green text-card' };
    case 'sold': return { label: 'Vendido', className: 'bg-green text-card' };
    case 'unsold': return { label: 'No vendido', className: 'border-2 border-muted-border bg-card text-muted' };
    case 'cancelled': return { label: 'Cancelada', className: 'bg-terracotta text-card' };
    default: return { label: status, className: 'border-2 border-muted-border bg-card text-muted' };
  }
}

function EmptyState({ text, cta }: { text: string; cta?: { href: string; label: string } }) {
  return (
    <div className="mt-6 rounded-[14px] border-2 border-dashed border-muted-border bg-card px-4 py-10 text-center">
      <p className="text-[13px] font-semibold text-muted">{text}</p>
      {cta && (
        <Link
          href={cta.href}
          className="press mt-4 inline-block rounded-lg border-2 border-ink bg-terracotta px-4 py-2 text-[13px] font-black text-card shadow-hard-sm uppercase"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3.5">{children}</div>;
}

export default function CuentaPage() {
  const { user, profile, loading } = useUser();
  const router = useRouter();

  const [tab, setTab] = useState<TabKey>('pujas');

  const [bidLots, setBidLots] = useState<BidLot[]>([]);
  const [won, setWon] = useState<AccountVehicle[]>([]);
  const [listings, setListings] = useState<AccountVehicle[]>([]);
  const [watched, setWatched] = useState<AccountVehicle[]>([]);
  const [upcoming, setUpcoming] = useState<AccountVehicle[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Redirect guests to sign in once the first auth resolve is in.
  useEffect(() => {
    if (!loading && !user) router.push('/entrar');
  }, [loading, user, router]);

  // Load every section once a session exists.
  useEffect(() => {
    if (!user) return;
    let active = true;

    async function load() {
      setDataLoading(true);
      const [b, w, l, s, u] = await Promise.all([
        fetchMyBidLots(),
        fetchMyWonLots(),
        fetchMyListings(),
        fetchWatchedLots(),
        fetchUpcomingLots(),
      ]);
      if (!active) return;
      setBidLots(b);
      setWon(w);
      setListings(l);
      setWatched(s);
      setUpcoming(u);
      setDataLoading(false);
    }

    load();
    return () => { active = false; };
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream p-4">
        <p className="font-display text-muted">Cargando...</p>
      </div>
    );
  }

  const greeting = profile?.display_name?.trim() || profile?.full_name?.trim() || 'tu cuenta';

  return (
    <main className="min-h-screen bg-cream pb-16">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-cream pt-[max(0.875rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-md px-4 pb-3.5">
          <BackButton className="mb-2.5" />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="font-display text-[26px] leading-none tracking-[.01em] text-ink">MI CUENTA</h1>
              <p className="mt-1 truncate text-[9px] font-extrabold tracking-[.22em] text-green uppercase">
                Hola, {greeting}
              </p>
            </div>
            <Link
              href="/perfil"
              className="press shrink-0 rounded-full border-2 border-ink bg-card px-3.5 py-1.5 text-[13px] font-extrabold whitespace-nowrap text-ink uppercase"
            >
              Editar perfil
            </Link>
          </div>

          <nav className="hide-scrollbar mt-3.5 flex items-center gap-2 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-full border-2 border-ink px-3.5 py-1.5 text-[13px] font-extrabold whitespace-nowrap uppercase ${
                  tab === t.key ? 'bg-terracotta text-card shadow-hard-sm' : 'bg-card text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-md p-4">
        {dataLoading ? (
          <p className="mt-6 text-center font-display text-muted">Cargando...</p>
        ) : (
          <>
            {tab === 'pujas' && (
              bidLots.length === 0 ? (
                <EmptyState text="Todavía no has pujado en ninguna subasta." cta={{ href: '/subastas', label: 'Ver subastas' }} />
              ) : (
                <Grid>
                  {bidLots.map((v) => (
                    <VehicleCard
                      key={v.id}
                      vehicle={v}
                      badge={bidBadge(v)}
                      extra={
                        <p className="mt-1 text-[11px] font-bold text-muted">
                          Tu puja máxima: {fmtCents(v.my_max_bid_cents, v.currency)}
                        </p>
                      }
                    />
                  ))}
                </Grid>
              )
            )}

            {tab === 'ganados' && (
              won.length === 0 ? (
                <EmptyState text="Aún no has ganado ninguna subasta." />
              ) : (
                <Grid>
                  {won.map((v) => (
                    <VehicleCard
                      key={v.id}
                      vehicle={v}
                      badge={{ label: 'Ganado', className: 'bg-green text-card' }}
                      footer={
                        <>
                          <p className="text-[9px] font-black tracking-[.12em] text-green uppercase">Ganaste</p>
                          <span className="font-display text-sm text-green">Ver contacto →</span>
                        </>
                      }
                    />
                  ))}
                </Grid>
              )
            )}

            {tab === 'vehiculos' && (
              listings.length === 0 ? (
                <EmptyState text="No has publicado ningún vehículo." cta={{ href: '/vender', label: 'Publicar vehículo' }} />
              ) : (
                <>
                  <Link
                    href="/vender"
                    className="press mb-3.5 block rounded-lg border-2 border-ink bg-terracotta px-4 py-2.5 text-center text-[13px] font-black text-card shadow-hard-sm uppercase"
                  >
                    Publicar vehículo
                  </Link>
                  <Grid>
                    {listings.map((v) => (
                      <VehicleCard
                        key={v.id}
                        vehicle={v}
                        badge={listingBadge(v.status)}
                      />
                    ))}
                  </Grid>
                </>
              )
            )}

            {tab === 'siguiendo' && (
              watched.length === 0 ? (
                <EmptyState text="No sigues ninguna subasta todavía." cta={{ href: '/subastas', label: 'Ver subastas' }} />
              ) : (
                <Grid>
                  {watched.map((v) => (
                    <VehicleCard key={v.id} vehicle={v} />
                  ))}
                </Grid>
              )
            )}

            {tab === 'proximas' && (
              upcoming.length === 0 ? (
                <EmptyState text="No hay subastas próximas por ahora." />
              ) : (
                <Grid>
                  {upcoming.map((v) => (
                    <VehicleCard
                      key={v.id}
                      vehicle={v}
                      badge={{ label: 'Próxima', className: 'border-2 border-ink bg-card text-ink' }}
                      footer={
                        <>
                          <p className="text-[9px] font-black tracking-[.12em] text-green uppercase">Comienza</p>
                          <span className="font-display text-sm text-ink">{fmtDate(v.starts_at)}</span>
                        </>
                      }
                    />
                  ))}
                </Grid>
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}
