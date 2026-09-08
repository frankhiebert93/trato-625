'use client';
/*
 * One-time admin promotion (operator action, run once against the project DB —
 * not app code; the `add-user` skill can also do this):
 *
 * The signup trigger sets role = 'bidder' for every new user, including the
 * email/password admin account, so it must be promoted manually before it can
 * pass the role guard below:
 *
 *   update public.profiles set role = 'admin'
 *   where id = (select id from auth.users where email = '<admin-email>');
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { useUser } from '../../../lib/useUser';
import { fmtPrice } from '../../../lib/i18n';
import BackButton from '../../../components/BackButton';

// --- Vehicle auction (Plan 4) ---
type ReviewDraft = {
    openingBid: string;
    reserveEnabled: boolean;
    reserveAmount: string;
    minIncrement: string;
    duration: string;
};

// Loose row shapes for the two vehicles queries below (pending-review cards
// carry seller/spec fields the live-lot list doesn't fetch, so most fields
// stay optional rather than modeling two separate row types).
type VehicleRow = {
    id: string;
    // Optional: the live-lots query below doesn't select it (only the
    // pending-review query, which shows the seller, does).
    seller_id?: string;
    title: string;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    mileage_km?: number | null;
    condition?: string | null;
    vin?: string | null;
    description?: string | null;
    location?: string | null;
    photos?: string[];
    currency: string;
    opening_bid_cents: number;
    min_increment_cents?: number | null;
    has_reserve?: boolean;
    status: string;
    current_bid_cents?: number | null;
    bid_count?: number;
    ends_at?: string | null;
};

type SellerRow = { id: string; display_name: string | null; phone: string | null };

type AppSettingsRow = {
    id: number;
    listing_fee_currency: string;
    listing_fee_cents: number;
    increment_tiers: Record<string, unknown>;
    default_duration_minutes: number;
    antisnipe_window_seconds: number;
    antisnipe_extend_seconds: number;
    default_notify_channel: 'whatsapp' | 'sms';
    terms_text: string;
};

// vehicles.reserve_cents is intentionally hidden from every client — see the
// column-privilege revoke in 20260907232436_rls_grants.sql. That applies to
// the admin's browser session too: the admin authenticates as a normal
// Supabase user and only gets extra *rows* via is_admin(), not extra
// *columns*. So the reserve amount below can never be pre-filled from a
// fetch; leaving the amount box blank while the checkbox stays on means
// "keep whatever the seller already set" (the approve API only overwrites
// reserve_cents when the key is present in the request body).
function fmtMXN(pesos: number | null | undefined): string {
    if (pesos == null) return '';
    return fmtPrice(pesos);
}

// Gates the dashboard on profiles.role === 'admin'. Admin sign-in stays
// email/password (lib/useUser reads the same Supabase session either way);
// only who is allowed past this guard changes.
export default function AdminDashboard() {
    const { user, profile, loading } = useUser();
    const router = useRouter();

    // No session once the first resolve is in: send the visitor to the admin
    // login. Mirrors the redirect-in-effect pattern in app/perfil/page.tsx.
    useEffect(() => {
        if (!loading && !user) {
            router.push('/admin');
        }
    }, [loading, user, router]);

    if (loading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <p className="text-slate-500 font-bold">Loading...</p>
            </div>
        );
    }

    if (profile?.role !== 'admin') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-100 p-4">
                <p className="text-slate-500 font-bold">Access denied.</p>
                <BackButton />
            </div>
        );
    }

    return <AdminDashboardContent />;
}

// Existing dashboard, unchanged — only reachable once the role guard above
// confirms profile.role === 'admin'.
function AdminDashboardContent() {
    const router = useRouter();

    // --- VEHICLE AUCTION STATE (Plan 4) ---
    const [pendingVehicles, setPendingVehicles] = useState<VehicleRow[]>([]);
    const [liveVehicles, setLiveVehicles] = useState<VehicleRow[]>([]);
    const [vehicleSellers, setVehicleSellers] = useState<Record<string, SellerRow>>({});
    const [vehiclesLoading, setVehiclesLoading] = useState(true);
    const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
    const [reviewBusy, setReviewBusy] = useState<Record<string, boolean>>({});
    const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
    const [cancelBusy, setCancelBusy] = useState<Record<string, boolean>>({});

    // app_settings — fetched once; the form below seeds from it via the
    // render-phase seed-once pattern (see `settingsSeeded` near the return),
    // same as app/perfil/page.tsx, so a later re-render never clobbers edits.
    const [appSettings, setAppSettings] = useState<AppSettingsRow | null>(null);
    const [settingsSeeded, setSettingsSeeded] = useState(false);
    const [listingFeePesos, setListingFeePesos] = useState('');
    const [defaultDurationMinutes, setDefaultDurationMinutes] = useState('');
    const [antisnipeWindowSeconds, setAntisnipeWindowSeconds] = useState('');
    const [antisnipeExtendSeconds, setAntisnipeExtendSeconds] = useState('');
    const [defaultNotifyChannel, setDefaultNotifyChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
    const [termsText, setTermsText] = useState('');
    const [incrementTiersText, setIncrementTiersText] = useState('');
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settingsStatus, setSettingsStatus] = useState<'idle' | 'saved' | 'error'>('idle');
    const [settingsError, setSettingsError] = useState('');

    const [banProfileId, setBanProfileId] = useState('');
    const [banBusy, setBanBusy] = useState(false);
    const [banStatus, setBanStatus] = useState<'idle' | 'ok' | 'error'>('idle');
    const [banMessage, setBanMessage] = useState('');

    useEffect(() => {
        checkUser();
        initVehicleAuction();
    }, []);

    async function checkUser() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) router.push('/admin');
    }

    // --- VEHICLE AUCTION FUNCTIONS (Plan 4) ---

    // Columns requested below exclude reserve_cents on purpose — the
    // column-privilege revoke means selecting it here would fail for the
    // whole query, not just that field.
    async function initVehicleAuction() {
        setVehiclesLoading(true);

        const [settingsRes, pendingRes, liveRes] = await Promise.all([
            supabase.from('app_settings').select('*').eq('id', 1).single(),
            supabase.from('vehicles')
                .select('id, seller_id, title, make, model, year, mileage_km, condition, vin, description, location, photos, currency, opening_bid_cents, min_increment_cents, has_reserve, status, created_at')
                .eq('status', 'pending_review')
                .order('created_at', { ascending: true }),
            supabase.from('vehicles')
                .select('id, title, make, model, year, currency, opening_bid_cents, current_bid_cents, bid_count, status, ends_at')
                .eq('status', 'live')
                .order('ends_at', { ascending: true }),
        ]);

        if (settingsRes.data) setAppSettings(settingsRes.data);
        const defaultDuration = settingsRes.data?.default_duration_minutes ?? 10080;

        if (pendingRes.data) {
            setPendingVehicles(pendingRes.data);

            const drafts: Record<string, ReviewDraft> = {};
            for (const v of pendingRes.data) {
                drafts[v.id] = {
                    openingBid: String((v.opening_bid_cents ?? 0) / 100),
                    reserveEnabled: !!v.has_reserve,
                    reserveAmount: '',
                    minIncrement: v.min_increment_cents != null ? String(v.min_increment_cents / 100) : '',
                    duration: String(defaultDuration),
                };
            }
            setReviewDrafts(drafts);

            const sellerIds = Array.from(new Set(pendingRes.data.map((v) => v.seller_id).filter(Boolean)));
            if (sellerIds.length > 0) {
                const { data: sellers } = await supabase.from('profiles').select('id, display_name, phone').in('id', sellerIds);
                if (sellers) {
                    const map: Record<string, SellerRow> = {};
                    for (const s of sellers) map[s.id] = s;
                    setVehicleSellers(map);
                }
            }
        }

        if (liveRes.data) setLiveVehicles(liveRes.data);
        setVehiclesLoading(false);
    }

    function updateDraft(vehicleId: string, patch: Partial<ReviewDraft>) {
        setReviewDrafts(prev => ({ ...prev, [vehicleId]: { ...prev[vehicleId], ...patch } }));
    }

    async function getAdminToken(): Promise<string> {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error('Your session expired. Please sign in again.');
        return token;
    }

    async function handleApproveVehicle(vehicleId: string) {
        const draft = reviewDrafts[vehicleId];
        if (!draft) return;
        setReviewErrors(prev => ({ ...prev, [vehicleId]: '' }));

        const durationMinutes = Number(draft.duration);
        if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
            setReviewErrors(prev => ({ ...prev, [vehicleId]: 'Invalid duration.' }));
            return;
        }

        const openingBidCents = Math.round(parseFloat(draft.openingBid || '0') * 100);
        if (!Number.isFinite(openingBidCents) || openingBidCents < 0) {
            setReviewErrors(prev => ({ ...prev, [vehicleId]: 'Invalid opening bid.' }));
            return;
        }

        // undefined = don't touch (approve route preserves the existing,
        // client-invisible reserve_cents when the key is absent).
        let reserveCents: number | null | undefined;
        if (!draft.reserveEnabled) {
            reserveCents = null;
        } else if (draft.reserveAmount.trim() !== '') {
            const parsed = Math.round(parseFloat(draft.reserveAmount) * 100);
            if (!Number.isFinite(parsed) || parsed < openingBidCents) {
                setReviewErrors(prev => ({ ...prev, [vehicleId]: 'The reserve must be greater than or equal to the opening bid.' }));
                return;
            }
            reserveCents = parsed;
        }

        let minIncrementCents: number | undefined;
        if (draft.minIncrement.trim() !== '') {
            const parsed = Math.round(parseFloat(draft.minIncrement) * 100);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                setReviewErrors(prev => ({ ...prev, [vehicleId]: 'The minimum increment is not valid.' }));
                return;
            }
            minIncrementCents = parsed;
        }

        setReviewBusy(prev => ({ ...prev, [vehicleId]: true }));
        try {
            const token = await getAdminToken();
            const body: Record<string, unknown> = {
                vehicle_id: vehicleId,
                duration_minutes: durationMinutes,
                opening_bid_cents: openingBidCents,
            };
            if (reserveCents !== undefined) body.reserve_cents = reserveCents;
            if (minIncrementCents !== undefined) body.min_increment_cents = minIncrementCents;

            const res = await fetch('/api/admin/listings/approve', {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok || json.error) throw new Error(json.error ?? 'Could not approve.');
            await initVehicleAuction();
        } catch (err) {
            setReviewErrors(prev => ({ ...prev, [vehicleId]: err instanceof Error ? err.message : 'Unexpected error.' }));
        } finally {
            setReviewBusy(prev => ({ ...prev, [vehicleId]: false }));
        }
    }

    async function handleRejectVehicle(vehicleId: string) {
        if (!window.confirm('Reject this listing? The listing fee will be released.')) return;
        setReviewErrors(prev => ({ ...prev, [vehicleId]: '' }));
        setReviewBusy(prev => ({ ...prev, [vehicleId]: true }));
        try {
            const token = await getAdminToken();
            const res = await fetch('/api/admin/listings/reject', {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ vehicle_id: vehicleId }),
            });
            const json = await res.json();
            if (!res.ok || json.error) throw new Error(json.error ?? 'Could not reject.');
            await initVehicleAuction();
        } catch (err) {
            setReviewErrors(prev => ({ ...prev, [vehicleId]: err instanceof Error ? err.message : 'Unexpected error.' }));
        } finally {
            setReviewBusy(prev => ({ ...prev, [vehicleId]: false }));
        }
    }

    async function handleCancelVehicle(vehicleId: string) {
        if (!window.confirm('Cancel this live auction?')) return;
        setCancelBusy(prev => ({ ...prev, [vehicleId]: true }));
        try {
            const token = await getAdminToken();
            const res = await fetch('/api/admin/listings/cancel', {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ vehicle_id: vehicleId }),
            });
            const json = await res.json();
            if (!res.ok || json.error) throw new Error(json.error ?? 'Could not cancel.');
            await initVehicleAuction();
        } catch (err) {
            alert('Error: ' + (err instanceof Error ? err.message : 'unexpected'));
        } finally {
            setCancelBusy(prev => ({ ...prev, [vehicleId]: false }));
        }
    }

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSettingsSaving(true);
        setSettingsStatus('idle');
        setSettingsError('');

        // Left untyped (no `: any`) so a valid JSON.parse result narrows
        // naturally through the shape checks just below.
        let incrementTiers;
        try {
            incrementTiers = JSON.parse(incrementTiersText);
        } catch {
            setSettingsSaving(false);
            setSettingsStatus('error');
            setSettingsError('The increment tiers are not valid JSON.');
            return;
        }
        if (
            !incrementTiers || typeof incrementTiers !== 'object' ||
            !Array.isArray(incrementTiers.MXN) || incrementTiers.MXN.length === 0 ||
            !Array.isArray(incrementTiers.USD) || incrementTiers.USD.length === 0
        ) {
            setSettingsSaving(false);
            setSettingsStatus('error');
            setSettingsError('The tiers must have the form {MXN:[...], USD:[...]} with both arrays non-empty.');
            return;
        }

        const listingFeeCents = Math.round(parseFloat(listingFeePesos || '0') * 100);
        const durationMinutes = Number(defaultDurationMinutes);
        const windowSeconds = Number(antisnipeWindowSeconds);
        const extendSeconds = Number(antisnipeExtendSeconds);

        if (
            !Number.isFinite(listingFeeCents) || listingFeeCents < 0 ||
            !Number.isFinite(durationMinutes) || durationMinutes <= 0 ||
            !Number.isFinite(windowSeconds) || windowSeconds < 0 ||
            !Number.isFinite(extendSeconds) || extendSeconds < 0
        ) {
            setSettingsSaving(false);
            setSettingsStatus('error');
            setSettingsError('Check the numeric values.');
            return;
        }

        try {
            const token = await getAdminToken();
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    listing_fee_cents: listingFeeCents,
                    default_duration_minutes: durationMinutes,
                    antisnipe_window_seconds: windowSeconds,
                    antisnipe_extend_seconds: extendSeconds,
                    default_notify_channel: defaultNotifyChannel,
                    terms_text: termsText,
                    increment_tiers: incrementTiers,
                }),
            });
            const json = await res.json();
            if (!res.ok || json.error) throw new Error(json.error ?? 'Could not save.');
            setSettingsStatus('saved');
        } catch (err) {
            setSettingsStatus('error');
            setSettingsError(err instanceof Error ? err.message : 'Unexpected error.');
        } finally {
            setSettingsSaving(false);
        }
    };

    async function handleBanToggle(banned: boolean) {
        if (!banProfileId.trim()) {
            setBanStatus('error');
            setBanMessage('Enter a profile ID.');
            return;
        }
        setBanBusy(true);
        setBanStatus('idle');
        setBanMessage('');
        try {
            const token = await getAdminToken();
            const res = await fetch('/api/admin/ban', {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ profile_id: banProfileId.trim(), banned }),
            });
            const json = await res.json();
            if (!res.ok || json.error) throw new Error(json.error ?? 'Could not update.');
            setBanStatus('ok');
            setBanMessage(banned ? 'User banned.' : 'User reactivated.');
        } catch (err) {
            setBanStatus('error');
            setBanMessage(err instanceof Error ? err.message : 'Unexpected error.');
        } finally {
            setBanBusy(false);
        }
    }

    // Seed the settings form once app_settings first arrives, and never
    // again — same render-phase seed-once pattern as app/perfil/page.tsx
    // (adjusting state while rendering, not in an effect), so a later
    // refetch never clobbers an admin's unsaved edits.
    if (appSettings && !settingsSeeded) {
        setSettingsSeeded(true);
        setListingFeePesos(String(appSettings.listing_fee_cents / 100));
        setDefaultDurationMinutes(String(appSettings.default_duration_minutes));
        setAntisnipeWindowSeconds(String(appSettings.antisnipe_window_seconds));
        setAntisnipeExtendSeconds(String(appSettings.antisnipe_extend_seconds));
        setDefaultNotifyChannel(appSettings.default_notify_channel);
        setTermsText(appSettings.terms_text ?? '');
        setIncrementTiersText(JSON.stringify(appSettings.increment_tiers ?? {}, null, 2));
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 pb-20">
            <div className="max-w-4xl mx-auto">
                <div className="pt-2 pb-4"><BackButton /></div>
                <header className="flex justify-between items-center py-6 border-b border-gray-200 mb-6">
                    <div>
                        <h1 className="text-3xl font-black text-slate-900">Control Panel</h1>
                        <p className="text-sm text-slate-500 font-bold">Admin Dashboard</p>
                    </div>
                    <button onClick={() => { supabase.auth.signOut(); router.push('/admin'); }} className="bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg hover:bg-slate-300 transition-colors">
                        Logout
                    </button>
                </header>

                {/* --- SECTION 1: SUBASTAS — COLA DE REVISIÓN --- */}
                <h2 className="text-xl font-black text-slate-900 mb-1 flex items-center gap-2 mt-12">
                    🚗 Review Queue
                    {pendingVehicles.length > 0 && (
                        <span className="bg-blue-600 text-white text-xs font-black px-2.5 py-1 rounded-full">
                            {pendingVehicles.length} pending
                        </span>
                    )}
                </h2>
                <p className="text-sm text-slate-500 font-medium mb-4">
                    Vehicle listings awaiting approval. The reserve amount is not shown here
                    (it is never sent to the browser); leave the field blank to keep what the seller set.
                </p>
                <div className="space-y-4 mb-12">
                    {vehiclesLoading ? (
                        <p className="text-center font-bold text-gray-500">Loading queue...</p>
                    ) : pendingVehicles.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No pending listings.</p>
                    ) : (
                        pendingVehicles.map((v) => {
                            const draft = reviewDrafts[v.id];
                            const seller = v.seller_id ? vehicleSellers[v.seller_id] : undefined;
                            const busy = !!reviewBusy[v.id];
                            const err = reviewErrors[v.id];
                            if (!draft) return null;
                            return (
                                <div key={v.id} className="bg-white p-4 rounded-xl shadow-sm border border-blue-200">
                                    <div className="flex flex-col sm:flex-row items-start gap-4">
                                        <img
                                            src={v.photos?.[0]}
                                            alt=""
                                            className="w-24 h-24 object-cover rounded-md bg-gray-100 shrink-0"
                                        />
                                        <div className="flex-grow min-w-0">
                                            <h3 className="font-bold text-slate-900 leading-tight">{v.title}</h3>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {[v.make, v.model, v.year].filter(Boolean).join(' ')}
                                                {v.mileage_km != null && ` · ${v.mileage_km} km`}
                                                {v.condition && ` · ${v.condition}`}
                                            </p>
                                            <p className="text-xs text-slate-500">{v.location}{v.vin && ` · VIN ${v.vin}`}</p>
                                            <p className="text-xs text-slate-500 bg-slate-100 inline-block px-2 py-1 rounded mt-1 border border-slate-200">
                                                <span className="font-bold">Seller:</span>{' '}
                                                {seller ? `${seller.display_name || '(no name)'} · ${seller.phone || ''}` : v.seller_id}
                                            </p>
                                            {v.description && (
                                                <p className="text-sm text-slate-700 mt-1.5 line-clamp-3">{v.description}</p>
                                            )}
                                            {v.photos && v.photos.length > 1 && (
                                                <div className="flex gap-1 mt-2 flex-wrap">
                                                    {v.photos.slice(1, 6).map((p) => (
                                                        <img key={p} src={p} alt="" className="w-10 h-10 object-cover rounded bg-gray-100" />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {err && <p className="text-red-500 text-xs font-bold mt-3">{err}</p>}

                                    <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                                                Opening bid ({v.currency})
                                            </label>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                step="0.01"
                                                value={draft.openingBid}
                                                onChange={(e) => updateDraft(v.id, { openingBid: e.target.value })}
                                                className="w-full border rounded-lg p-2 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                                                Minimum increment (optional)
                                            </label>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                min={0}
                                                step="0.01"
                                                placeholder="Auto (tiers)"
                                                value={draft.minIncrement}
                                                onChange={(e) => updateDraft(v.id, { minIncrement: e.target.value })}
                                                className="w-full border rounded-lg p-2 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                                                Duration (minutes)
                                            </label>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                min={1}
                                                value={draft.duration}
                                                onChange={(e) => updateDraft(v.id, { duration: e.target.value })}
                                                className="w-full border rounded-lg p-2 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-2 mt-5 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={draft.reserveEnabled}
                                                    onChange={(e) => updateDraft(v.id, { reserveEnabled: e.target.checked })}
                                                    className="h-4 w-4"
                                                />
                                                <span className="text-xs font-bold text-slate-700">Has reserve</span>
                                            </label>
                                            {draft.reserveEnabled && (
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    min={0}
                                                    step="0.01"
                                                    placeholder="Blank = no change"
                                                    value={draft.reserveAmount}
                                                    onChange={(e) => updateDraft(v.id, { reserveAmount: e.target.value })}
                                                    className="w-full border rounded-lg p-2 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 mt-1"
                                                />
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex gap-2 mt-3">
                                        <button
                                            onClick={() => handleApproveVehicle(v.id)}
                                            disabled={busy}
                                            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black py-2.5 rounded-lg text-sm transition-colors disabled:bg-gray-400"
                                        >
                                            {busy ? 'Processing...' : 'Approve'}
                                        </button>
                                        <button
                                            onClick={() => handleRejectVehicle(v.id)}
                                            disabled={busy}
                                            className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 font-black py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* --- SECTION 2: SUBASTAS EN VIVO --- */}
                <h2 className="text-xl font-black text-slate-900 mb-4">Live Auctions</h2>
                <div className="space-y-3 mb-12">
                    {vehiclesLoading ? (
                        <p className="text-center font-bold text-gray-500">Loading...</p>
                    ) : liveVehicles.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No live auctions.</p>
                    ) : (
                        liveVehicles.map((v) => (
                            <div key={v.id} className="bg-white p-4 rounded-xl shadow-sm border border-green-300 flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="flex-grow min-w-0">
                                    <h3 className="font-bold text-slate-900 leading-tight">{v.title}</h3>
                                    <p className="text-xs text-slate-500">
                                        {[v.make, v.model, v.year].filter(Boolean).join(' ')} ·{' '}
                                        Current bid: {v.current_bid_cents != null ? fmtMXN(v.current_bid_cents / 100) : fmtMXN(v.opening_bid_cents / 100)}
                                        {' '}({v.bid_count} bid(s))
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        Ends: {v.ends_at ? new Date(v.ends_at).toLocaleString('es-MX') : '—'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleCancelVehicle(v.id)}
                                    disabled={!!cancelBusy[v.id]}
                                    className="bg-red-50 text-red-600 font-bold px-3 py-2 rounded-lg text-xs shrink-0 disabled:opacity-50"
                                >
                                    {cancelBusy[v.id] ? 'Cancelling...' : 'Cancel'}
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* --- SECTION 3: CONFIGURACIÓN DE SUBASTAS --- */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
                    <h2 className="text-xl font-black text-slate-900 mb-1 flex items-center gap-2">⚙️ Auction Settings</h2>
                    <p className="text-sm text-slate-500 font-medium mb-4">
                        Applies to future listings; does not change auctions already underway.
                    </p>
                    <form onSubmit={handleSaveSettings} className="space-y-4">
                        {settingsStatus === 'error' && settingsError && (
                            <p className="text-red-500 text-sm font-bold">{settingsError}</p>
                        )}
                        {settingsStatus === 'saved' && (
                            <p className="text-green-600 text-sm font-bold">Saved.</p>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold mb-1">Listing fee (MXN)</label>
                                <input
                                    type="number" inputMode="decimal" min={0} step="0.01"
                                    value={listingFeePesos}
                                    onChange={(e) => { setListingFeePesos(e.target.value); setSettingsStatus('idle'); }}
                                    className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-1">Default duration (minutes)</label>
                                <input
                                    type="number" inputMode="numeric" min={1}
                                    value={defaultDurationMinutes}
                                    onChange={(e) => { setDefaultDurationMinutes(e.target.value); setSettingsStatus('idle'); }}
                                    className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold mb-1">Anti-snipe window (seconds)</label>
                                <input
                                    type="number" inputMode="numeric" min={0}
                                    value={antisnipeWindowSeconds}
                                    onChange={(e) => { setAntisnipeWindowSeconds(e.target.value); setSettingsStatus('idle'); }}
                                    className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold mb-1">Anti-snipe extension (seconds)</label>
                                <input
                                    type="number" inputMode="numeric" min={0}
                                    value={antisnipeExtendSeconds}
                                    onChange={(e) => { setAntisnipeExtendSeconds(e.target.value); setSettingsStatus('idle'); }}
                                    className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-1">Default notification channel</label>
                            <select
                                value={defaultNotifyChannel}
                                onChange={(e) => { setDefaultNotifyChannel(e.target.value as 'whatsapp' | 'sms'); setSettingsStatus('idle'); }}
                                className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="whatsapp">WhatsApp</option>
                                <option value="sms">SMS</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-1">Terms and conditions</label>
                            <textarea
                                rows={4}
                                value={termsText}
                                onChange={(e) => { setTermsText(e.target.value); setSettingsStatus('idle'); }}
                                className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-1">
                                Increment tiers — JSON with MXN and USD arrays
                            </label>
                            <textarea
                                rows={10}
                                value={incrementTiersText}
                                onChange={(e) => { setIncrementTiersText(e.target.value); setSettingsStatus('idle'); }}
                                className="w-full border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={settingsSaving}
                            className="w-full bg-slate-900 text-white font-black py-3 rounded-lg mt-2 hover:bg-slate-800 transition-all disabled:bg-gray-400"
                        >
                            {settingsSaving ? 'Saving...' : 'Save Settings'}
                        </button>
                    </form>
                </div>

                {/* --- SECTION 4: BANEAR USUARIO --- */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-12">
                    <h2 className="text-xl font-black text-slate-900 mb-1 flex items-center gap-2">🚫 Ban User</h2>
                    <p className="text-sm text-slate-500 font-medium mb-4">
                        A banned user cannot bid or list vehicles. Paste the profile ID (the <code>id</code> column in <code>profiles</code>).
                    </p>
                    {banStatus === 'error' && banMessage && (
                        <p className="text-red-500 text-sm font-bold mb-3">{banMessage}</p>
                    )}
                    {banStatus === 'ok' && banMessage && (
                        <p className="text-green-600 text-sm font-bold mb-3">{banMessage}</p>
                    )}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            value={banProfileId}
                            onChange={(e) => { setBanProfileId(e.target.value); setBanStatus('idle'); }}
                            placeholder="Profile ID (uuid)"
                            className="flex-grow border rounded-lg p-2.5 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                        />
                        <div className="flex gap-2 shrink-0">
                            <button
                                onClick={() => handleBanToggle(true)}
                                disabled={banBusy}
                                className="bg-red-600 hover:bg-red-700 text-white font-black px-4 py-2.5 rounded-lg text-sm transition-colors disabled:bg-gray-400"
                            >
                                Ban
                            </button>
                            <button
                                onClick={() => handleBanToggle(false)}
                                disabled={banBusy}
                                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-black px-4 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                            >
                                Unban
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}