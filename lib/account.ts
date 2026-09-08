import { supabase } from './supabase';

// Safe vehicle column set — mirrors AuctionFeed / vehicles_public_select.
// `reserve_cents` is NEVER selected (it is hidden from clients by the RLS grants).
export type AccountVehicle = {
  id: string;
  title: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  photos: string[] | null;
  currency: string;
  opening_bid_cents: number;
  current_bid_cents: number | null;
  bid_count: number;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  has_reserve: boolean;
  reserve_met: boolean;
};

// A lot the signed-in user has bid on, as returned by the `my_bid_lots` RPC.
export type BidLot = AccountVehicle & {
  winner_id: string | null;
  my_max_bid_cents: number;
  is_leading: boolean;
  i_won: boolean;
};

const VEHICLE_COLUMNS =
  'id, title, make, model, year, photos, currency, opening_bid_cents, ' +
  'current_bid_cents, bid_count, status, starts_at, ends_at, has_reserve, reserve_met';

async function myId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// Lots the caller has bid on (server computes highest bid + leading/won flags).
export async function fetchMyBidLots(): Promise<BidLot[]> {
  const { data, error } = await supabase.rpc('my_bid_lots');
  if (error || !data) return [];
  return data as BidLot[];
}

// Lots the caller watches that are still publicly visible.
export async function fetchWatchedLots(): Promise<AccountVehicle[]> {
  const { data, error } = await supabase.rpc('my_watched_lots');
  if (error || !data) return [];
  return data as AccountVehicle[];
}

// Lots the caller won (sold lots where they are the winner). Sold lots are public,
// so this is a direct select under existing RLS.
export async function fetchMyWonLots(): Promise<AccountVehicle[]> {
  const id = await myId();
  if (!id) return [];
  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_COLUMNS)
    .eq('winner_id', id)
    .eq('status', 'sold')
    .order('ends_at', { ascending: false });
  if (error || !data) return [];
  return data as unknown as AccountVehicle[];
}

// The caller's own listings across every status (vehicles_owner_select).
export async function fetchMyListings(): Promise<AccountVehicle[]> {
  const id = await myId();
  if (!id) return [];
  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_COLUMNS)
    .eq('seller_id', id)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data as unknown as AccountVehicle[];
}

// Scheduled (not-yet-live) lots — public, useful as an "upcoming" list.
export async function fetchUpcomingLots(): Promise<AccountVehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select(VEHICLE_COLUMNS)
    .eq('status', 'scheduled')
    .order('starts_at', { ascending: true });
  if (error || !data) return [];
  return data as unknown as AccountVehicle[];
}

// The set of vehicle ids the caller is watching (for the follow toggle).
export async function fetchWatchedIds(): Promise<Set<string>> {
  const id = await myId();
  if (!id) return new Set();
  const { data, error } = await supabase
    .from('watches')
    .select('vehicle_id')
    .eq('user_id', id);
  if (error || !data) return new Set();
  return new Set((data as { vehicle_id: string }[]).map((r) => r.vehicle_id));
}

export async function isWatching(vehicleId: string): Promise<boolean> {
  const id = await myId();
  if (!id) return false;
  const { data, error } = await supabase
    .from('watches')
    .select('vehicle_id')
    .eq('user_id', id)
    .eq('vehicle_id', vehicleId)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

export async function addWatch(vehicleId: string): Promise<{ error: string | null }> {
  const id = await myId();
  if (!id) return { error: 'not signed in' };
  // Idempotent: ON CONFLICT DO NOTHING (needs only the INSERT privilege we grant).
  const { error } = await supabase
    .from('watches')
    .upsert({ user_id: id, vehicle_id: vehicleId }, { onConflict: 'user_id,vehicle_id', ignoreDuplicates: true });
  return { error: error?.message ?? null };
}

export async function removeWatch(vehicleId: string): Promise<{ error: string | null }> {
  const id = await myId();
  if (!id) return { error: 'not signed in' };
  const { error } = await supabase
    .from('watches')
    .delete()
    .eq('user_id', id)
    .eq('vehicle_id', vehicleId);
  return { error: error?.message ?? null };
}
