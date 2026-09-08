import { supabase } from './supabase';

export type Profile = {
  id: string;
  phone: string | null;
  display_name: string | null;
  role: 'bidder' | 'seller' | 'admin';
  notify_channel: 'whatsapp' | 'sms';
};

export async function requestOtp(phone: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  return { error: error?.message ?? null };
}

export async function verifyOtp(phone: string, token: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getMyProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, phone, display_name, role, notify_channel')
    .eq('id', auth.user.id)
    .single();
  if (error) return null;
  return data as Profile;
}

export async function updateMyProfile(
  fields: { display_name?: string; notify_channel?: 'whatsapp' | 'sms' },
): Promise<{ error: string | null }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'not signed in' };
  const { error } = await supabase.from('profiles').update(fields).eq('id', auth.user.id);
  return { error: error?.message ?? null };
}
