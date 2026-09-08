'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '../../lib/useUser';
import { updateMyProfile, signOut } from '../../lib/auth';

type SaveStatus = 'idle' | 'saved' | 'error';

export default function PerfilPage() {
    const { user, profile, loading } = useUser();
    const router = useRouter();

    const [displayName, setDisplayName] = useState('');
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
        setNotifyChannel(profile.notify_channel);
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setStatus('idle');
        setError('');

        const { error } = await updateMyProfile({
            display_name: displayName,
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
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <p className="text-slate-500 font-bold">Cargando...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <form onSubmit={handleSave} className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
                <h1 className="text-2xl font-black text-center mb-6 text-slate-900">Tu perfil</h1>

                {status === 'error' && error && (
                    <p className="text-red-500 text-sm font-bold text-center mb-4">{error}</p>
                )}
                {status === 'saved' && (
                    <p className="text-green-600 text-sm font-bold text-center mb-4">Guardado.</p>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold mb-1 text-slate-700">Nombre</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => { setDisplayName(e.target.value); setStatus('idle'); }}
                            className="w-full border rounded-lg p-2 bg-gray-50 text-slate-900"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold mb-1 text-slate-700">Cómo quieres recibir avisos</label>
                        <select
                            value={notifyChannel}
                            onChange={(e) => { setNotifyChannel(e.target.value as 'whatsapp' | 'sms'); setStatus('idle'); }}
                            className="w-full border rounded-lg p-2 bg-gray-50 text-slate-900"
                        >
                            <option value="whatsapp">WhatsApp</option>
                            <option value="sms">SMS</option>
                        </select>
                    </div>

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-lg transition-colors mt-4"
                    >
                        {saving ? 'Guardando...' : 'Guardar'}
                    </button>

                    <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full bg-white border border-slate-300 hover:bg-gray-50 text-slate-700 font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                        Cerrar sesión
                    </button>
                </div>
            </form>
        </div>
    );
}
