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
      if (!active) return;
      setUser(nextUser);
      try {
        setProfile(nextUser ? await getMyProfile() : null);
      } catch {
        if (active) setProfile(null);
      } finally {
        if (active) setLoading(false);
      }
    }

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
