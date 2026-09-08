'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '../../lib/useUser';
import { updateMyProfile, signOut } from '../../lib/auth';

type SaveStatus = 'idle' | 'saved' | 'error';

const fieldClass =
  'w-full rounded-lg border-2 border-ink bg-well px-3 py-2.5 font-semibold text-ink';
const labelClass = 'mb-1 block text-[10px] font-black tracking-[.1em] text-muted uppercase';

export default function PerfilPage() {
    const { user, profile, loading } = useUser();
    const router = useRouter();

    const [displayName, setDisplayName] = useState('');
    const [fullName, setFullName] = useState('');
    const [city, setCity] = useState('');
    const [notifyChannel, setNotifyChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<SaveStatus>('idle');
    const [error, setError] = useState('');

    // No session once the first resolve is in: send the visitor to sign in.
    useEffect(() => {
        if (!loading && !user) {
            router.push('/entrar');
        }
    }, [loading, user, router]);

    // Seed the form once the profile first arrives, and never again — profile
    // is a fresh object on every auth refresh (e.g. TOKEN_REFRESHED), and
    // re-seeding on that would clobber unsaved edits. Adjusting state while
    // rendering (rather than in an effect) avoids an extra commit — see
    // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
    const [seeded, setSeeded] = useState(false);
    if (profile && !seeded) {
        setSeeded(true);
        setDisplayName(profile.display_name ?? '');
        setFullName(profile.full_name ?? '');
        setCity(profile.city ?? '');
        setNotifyChannel(profile.notify_channel);
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setStatus('idle');
        setError('');

        const { error } = await updateMyProfile({
            display_name: displayName,
            full_name: fullName,
            city,
            notify_channel: notifyChannel,
        });

        setSaving(false);
        if (error) {
            setError(error);
            setStatus('error');
        } else {
            setStatus('saved');
        }
    };

    const handleSignOut = async () => {
        await signOut();
        router.push('/');
    };

    if (loading || !user) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-cream p-4">
                <p className="font-display text-muted">Cargando...</p>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-cream pb-16">
            <header className="sticky top-0 z-30 border-b-2 border-ink bg-cream pt-[max(0.875rem,env(safe-area-inset-top))]">
                <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 pb-3.5">
                    <Link href="/cuenta" className="text-[13px] font-black text-green uppercase">
                        ← Mi cuenta
                    </Link>
                </div>
            </header>

            <div className="mx-auto max-w-md p-4">
                <form onSubmit={handleSave} className="rounded-[14px] border-2 border-ink bg-card p-5 shadow-hard">
                    <h1 className="mb-4 font-display text-[22px] text-ink">Tu perfil</h1>

                    {status === 'error' && error && (
                        <p className="mb-4 text-center text-[12px] font-bold text-terracotta">{error}</p>
                    )}
                    {status === 'saved' && (
                        <p className="mb-4 text-center text-[12px] font-bold text-green">Guardado.</p>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className={labelClass}>Nombre público</label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => { setDisplayName(e.target.value); setStatus('idle'); }}
                                className={fieldClass}
                                placeholder="Cómo te ven los demás"
                            />
                            <p className="mt-1 text-[11px] font-semibold text-muted">
                                Se muestra abreviado en el historial de pujas.
                            </p>
                        </div>

                        <div>
                            <label className={labelClass}>Nombre completo (privado)</label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => { setFullName(e.target.value); setStatus('idle'); }}
                                className={fieldClass}
                                placeholder="Para coordinar la entrega"
                            />
                            <p className="mt-1 text-[11px] font-semibold text-muted">
                                Solo tú y el administrador lo ven.
                            </p>
                        </div>

                        <div>
                            <label className={labelClass}>Ciudad</label>
                            <input
                                type="text"
                                value={city}
                                onChange={(e) => { setCity(e.target.value); setStatus('idle'); }}
                                className={fieldClass}
                                placeholder="Ej. Cuauhtémoc"
                            />
                        </div>

                        {profile?.phone && (
                            <div>
                                <label className={labelClass}>Teléfono (verificado)</label>
                                <input
                                    type="text"
                                    value={profile.phone}
                                    disabled
                                    className={`${fieldClass} opacity-70`}
                                />
                                <p className="mt-1 text-[11px] font-semibold text-muted">
                                    Es tu contacto de WhatsApp para las ventas.
                                </p>
                            </div>
                        )}

                        <div>
                            <label className={labelClass}>Cómo quieres recibir avisos</label>
                            <select
                                value={notifyChannel}
                                onChange={(e) => { setNotifyChannel(e.target.value as 'whatsapp' | 'sms'); setStatus('idle'); }}
                                className={fieldClass}
                            >
                                <option value="whatsapp">WhatsApp</option>
                                <option value="sms">SMS</option>
                            </select>
                        </div>

                        <button
                            type="submit"
                            disabled={saving}
                            className="press mt-2 w-full rounded-lg border-2 border-ink bg-terracotta px-4 py-3 text-[13px] font-black text-card shadow-hard-sm uppercase disabled:opacity-60"
                        >
                            {saving ? 'Guardando...' : 'Guardar'}
                        </button>

                        <button
                            type="button"
                            onClick={handleSignOut}
                            className="w-full rounded-lg border-2 border-ink bg-card px-4 py-3 text-[13px] font-black text-ink uppercase"
                        >
                            Cerrar sesión
                        </button>
                    </div>
                </form>
            </div>
        </main>
    );
}
