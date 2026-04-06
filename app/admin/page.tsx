'use client';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        } else {
            // If login is successful, go to the dashboard
            router.push('/admin/dashboard');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <form onSubmit={handleLogin} className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
                <h1 className="text-2xl font-black text-center mb-6 text-slate-900">Admin Login</h1>

                {error && <p className="text-red-500 text-sm font-bold text-center mb-4">{error}</p>}

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold mb-1 text-slate-700">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full border rounded-lg p-2 bg-gray-50 text-slate-900"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold mb-1 text-slate-700">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full border rounded-lg p-2 bg-gray-50 text-slate-900"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-lg transition-colors mt-4"
                    >
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </div>
            </form>
        </div>
    );
}