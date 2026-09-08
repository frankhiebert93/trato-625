'use client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getMyProfile, type Profile } from './auth';

export function useUser(): { user: User | null; profile: Profile | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function resolve(nextUser: User | null) {
      const nextProfile = nextUser ? await getMyProfile() : null;
      if (!active) return;
      setUser(nextUser);
      setProfile(nextProfile);
      setLoading(false);
    }

    supabase.auth.getUser().then(({ data }) => resolve(data.user));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      resolve(session?.user ?? null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { user, profile, loading };
}
