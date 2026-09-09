'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../../lib/useUser';
import { supabase } from '../../lib/supabase';
import { compressImage } from '../../lib/imageUtils';
import BackButton from '../../components/BackButton';

type Currency = 'MXN' | 'USD';
type FeeInfo = { cents: number; currency: string };
type CommissionInfo = {
    pct: number;
    minUsd: number | null; maxUsd: number | null;
    minMxn: number | null; maxMxn: number | null;
};
type IntakeEvent = {
    id: string; name: string; starts_at: string; capacity: number;
    committed_count: number; intake_cutoff_at: string | null; viewing_location: string | null;
};

const CONDITIONS = ['Nuevo', 'Seminuevo', 'Usado', 'Para piezas'];

const inputClass = 'w-full border rounded-lg p-2 bg-gray-50 text-slate-900';
const labelClass = 'block text-sm font-bold mb-1 text-slate-700';

export default function VenderPage() {
    const { user, loading } = useUser();
    const router = useRouter();

    const [title, setTitle] = useState('');
    const [make, setMake] = useState('');
    const [model, setModel] = useState('');
    const [year, setYear] = useState('');
    const [mileageKm, setMileageKm] = useState('');
    const [condition, setCondition] = useState(CONDITIONS[0]);
    const [vin, setVin] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [currency, setCurrency] = useState<Currency>('MXN');
    const [openingBid, setOpeningBid] = useState('');
    const [reserveEnabled, setReserveEnabled] = useState(false);
    const [reserveAmount, setReserveAmount] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [fee, setFee] = useState<FeeInfo | null>(null);
    const [commission, setCommission] = useState<CommissionInfo | null>(null);
    const [intake, setIntake] = useState<IntakeEvent | null | undefined>(undefined);

    // No session once the first resolve is in: send the visitor to sign in.
    useEffect(() => {
        if (!loading && !user) {
            router.push('/entrar');
        }
    }, [loading, user, router]);

    // Public config, readable without auth — fetched once on mount.
    useEffect(() => {
        let active = true;

        async function loadFee() {
            const { data } = await supabase
                .from('app_settings')
                .select('listing_fee_cents, listing_fee_currency, sale_commission_pct, sale_commission_min_cents_usd, sale_commission_max_cents_usd, sale_commission_min_cents_mxn, sale_commission_max_cents_mxn')
                .eq('id', 1)
                .single();
            if (active && data) {
                setFee({ cents: data.listing_fee_cents as number, currency: data.listing_fee_currency as string });
                setCommission({
                    pct: Number(data.sale_commission_pct),
                    minUsd: data.sale_commission_min_cents_usd as number | null,
                    maxUsd: data.sale_commission_max_cents_usd as number | null,
                    minMxn: data.sale_commission_min_cents_mxn as number | null,
                    maxMxn: data.sale_commission_max_cents_mxn as number | null,
                });
            }
        }

        loadFee();
        return () => { active = false; };
    }, []);

    // Which event this submission will join (the open intake event, if any).
    useEffect(() => {
        let active = true;
        supabase.rpc('current_intake_event').then(({ data }) => {
            if (!active) return;
            const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
            setIntake(row as IntakeEvent | null);
        });
        return () => { active = false; };
    }, []);

    if (loading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <p className="text-slate-500 font-bold">Cargando...</p>
            </div>
        );
    }

    const feeText = fee
        ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: fee.currency, maximumFractionDigits: 2 }).format(fee.cents / 100)
        : null;

    // Commission estimate for the currently-selected currency (reactive).
    const commissionText = (() => {
        if (!commission) return null;
        const isUsd = currency === 'USD';
        const min = isUsd ? commission.minUsd : commission.minMxn;
        const max = isUsd ? commission.maxUsd : commission.maxMxn;
        const fmt = (cents: number) =>
            new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
        const clauses: string[] = [];
        if (min != null) clauses.push(`mín ${fmt(min)}`);
        if (max != null) clauses.push(`máx ${fmt(max)}`);
        return `${commission.pct}%${clauses.length ? ` (${clauses.join(' · ')})` : ''}`;
    })();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!title.trim() || !make.trim() || !model.trim() || !year || !mileageKm ||
            !condition || !description.trim() || !location.trim() || !openingBid) {
            setError('Completa todos los campos requeridos.');
            return;
        }

        if (files.length === 0) {
            setError('Agrega al menos una foto.');
            return;
        }

        const openingBidCents = Math.round(parseFloat(openingBid) * 100);
        if (!Number.isFinite(openingBidCents) || openingBidCents < 0) {
            setError('La puja inicial no es válida.');
            return;
        }

        let reserveCents: number | null = null;
        if (reserveEnabled) {
            const parsed = Math.round(parseFloat(reserveAmount || '0') * 100);
            if (!Number.isFinite(parsed) || parsed < openingBidCents) {
                setError('La reserva debe ser mayor o igual a la puja inicial.');
                return;
            }
            reserveCents = parsed;
        }

        setSubmitting(true);
        try {
            const photos: string[] = [];
            for (const file of files) {
                const compressed = await compressImage(file);
                const path = `${user.id}/${crypto.randomUUID()}.jpg`;
                const { error: uploadError } = await supabase.storage.from('vehicle-photos').upload(path, compressed);
                if (uploadError) throw uploadError;
                const { data: publicUrlData } = supabase.storage.from('vehicle-photos').getPublicUrl(path);
                photos.push(publicUrlData.publicUrl);
            }

            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;
            if (!token) {
                throw new Error('Tu sesión expiró. Inicia sesión de nuevo.');
            }

            const res = await fetch('/api/listings/submit', {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    title: title.trim(),
                    make: make.trim(),
                    model: model.trim(),
                    year: Number(year),
                    mileage_km: Number(mileageKm),
                    condition,
                    vin: vin.trim() || null,
                    description: description.trim(),
                    location: location.trim(),
                    currency,
                    opening_bid_cents: openingBidCents,
                    reserve_cents: reserveCents,
                    photos,
                }),
            });

            const json = await res.json();
            if (!res.ok || json.error) {
                throw new Error(json.error ?? 'No se pudo crear la publicación.');
            }
            if (!json.url) {
                throw new Error('No se recibió la URL de pago.');
            }
            window.location.href = json.url;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ocurrió un error inesperado.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4 py-10">
            <div className="max-w-2xl mx-auto mb-4">
                <BackButton />
            </div>
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl shadow-lg w-full max-w-2xl mx-auto">
                <h1 className="text-2xl font-black text-center mb-2 text-slate-900">Publica tu vehículo</h1>
                <p className="text-sm text-slate-500 text-center mb-1">
                    {feeText ? `Cuota de publicación: ${feeText}` : 'Cargando cuota de publicación…'}
                </p>
                {commissionText && (
                    <p className="text-xs text-slate-400 text-center mb-6">
                        Si se vende, cobramos una comisión de {commissionText} sobre el precio final.
                    </p>
                )}

                {intake === null && (
                    <p className="text-center text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
                        No hay una subasta abierta para registro ahora mismo. Puedes enviar tu auto y lo asignaremos a la próxima subasta.
                    </p>
                )}
                {intake && (
                    <div className="text-center text-sm text-slate-700 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
                        <p className="font-bold">Tu auto entra a: {intake.name}</p>
                        <p className="text-xs mt-0.5">
                            Subasta: {new Date(intake.starts_at).toLocaleString('es-MX')} · Registro {intake.committed_count}/{intake.capacity}
                            {intake.intake_cutoff_at && ` · cierra ${new Date(intake.intake_cutoff_at).toLocaleString('es-MX')}`}
                        </p>
                    </div>
                )}

                {error && <p className="text-red-500 text-sm font-bold text-center mb-4">{error}</p>}

                <div className="space-y-4">
                    <div>
                        <label className={labelClass}>Título</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className={inputClass}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Marca</label>
                            <input
                                type="text"
                                value={make}
                                onChange={(e) => setMake(e.target.value)}
                                className={inputClass}
                                required
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Modelo</label>
                            <input
                                type="text"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className={inputClass}
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Año</label>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={1900}
                                max={new Date().getFullYear() + 1}
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                className={inputClass}
                                required
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Kilómetros</label>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={mileageKm}
                                onChange={(e) => setMileageKm(e.target.value)}
                                className={inputClass}
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Condición</label>
                            <select
                                value={condition}
                                onChange={(e) => setCondition(e.target.value)}
                                className={inputClass}
                            >
                                {CONDITIONS.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>VIN (opcional)</label>
                            <input
                                type="text"
                                value={vin}
                                onChange={(e) => setVin(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Descripción</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className={inputClass}
                            rows={4}
                            required
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Ubicación</label>
                        <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className={inputClass}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Moneda</label>
                            <select
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value as Currency)}
                                className={inputClass}
                            >
                                <option value="MXN">MXN (pesos)</option>
                                <option value="USD">USD (dólares)</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Puja inicial</label>
                            <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.01"
                                value={openingBid}
                                onChange={(e) => setOpeningBid(e.target.value)}
                                className={inputClass}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={reserveEnabled}
                                onChange={(e) => setReserveEnabled(e.target.checked)}
                                className="h-4 w-4"
                            />
                            <span className="text-sm font-bold text-slate-700">Agregar precio de reserva (oculto)</span>
                        </label>
                        {reserveEnabled && (
                            <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.01"
                                value={reserveAmount}
                                onChange={(e) => setReserveAmount(e.target.value)}
                                className={`${inputClass} mt-2`}
                                placeholder="Monto de la reserva"
                            />
                        )}
                    </div>

                    <div>
                        <label className={labelClass}>Fotos</label>
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleFileChange}
                            className={inputClass}
                        />
                        {files.length > 0 && (
                            <p className="text-xs text-slate-500 mt-1">{files.length} foto(s) seleccionada(s)</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-lg transition-colors mt-4"
                    >
                        {submitting ? 'Enviando...' : 'Continuar al pago'}
                    </button>
                </div>
            </form>
        </div>
    );
}
