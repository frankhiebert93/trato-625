'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestOtp, verifyOtp } from '../../lib/auth';
import BackButton from '../../components/BackButton';

type Phase = 'phone' | 'code';

export default function EntrarPage() {
    const [phase, setPhase] = useState<Phase>('phone');
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSendCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const { error } = await requestOtp(phone);

        if (error) {
            setError(error);
            setLoading(false);
        } else {
            setLoading(false);
            setPhase('code');
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const { error } = await verifyOtp(phone, code);

        if (error) {
            setError(error);
            setLoading(false);
        } else {
            router.push('/');
        }
    };

    const handleChangeNumber = () => {
        setPhase('phone');
        setCode('');
        setError('');
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-100">
            <div className="p-4 pt-[max(1rem,env(safe-area-inset-top))]">
                <BackButton />
            </div>
            <div className="flex flex-1 items-center justify-center p-4">
            <form
                onSubmit={phase === 'phone' ? handleSendCode : handleVerify}
                className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md"
            >
                <h1 className="text-2xl font-black text-center mb-6 text-slate-900">Iniciar sesión</h1>

                {error && <p className="text-red-500 text-sm font-bold text-center mb-4">{error}</p>}

                <div className="space-y-4">
                    {phase === 'phone' ? (
                        <div>
                            <label className="block text-sm font-bold mb-1 text-slate-700">Número de teléfono</label>
                            <input
                                type="tel"
                                inputMode="tel"
                                placeholder="+52 555 000 0000"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full border rounded-lg p-2 bg-gray-50 text-slate-900"
                                required
                            />
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-bold mb-1 text-slate-700">Código</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="123456"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                className="w-full border rounded-lg p-2 bg-gray-50 text-slate-900"
                                required
                            />
                            <p className="mt-2 text-xs font-semibold text-slate-500">
                                Enviamos un código por SMS a {phone}.{' '}
                                <button type="button" onClick={handleChangeNumber} className="underline">
                                    Cambiar número
                                </button>
                            </p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-lg transition-colors mt-4"
                    >
                        {loading
                            ? phase === 'phone' ? 'Enviando...' : 'Verificando...'
                            : phase === 'phone' ? 'Enviar código' : 'Verificar'}
                    </button>
                </div>
            </form>
            </div>
        </div>
    );
}
