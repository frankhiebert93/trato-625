'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Lang } from './i18n';

// Preferences read from localStorage *after* mount so the server-rendered
// markup and the first client render agree.

export function useLang(): [Lang, () => void] {
  const [lang, setLang] = useState<Lang>('es');

  useEffect(() => {
    const saved = localStorage.getItem('trato_lang');
    if (saved === 'es' || saved === 'en') setLang(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleLang = useCallback(() => {
    setLang(prev => {
      const next: Lang = prev === 'es' ? 'en' : 'es';
      try {
        localStorage.setItem('trato_lang', next);
      } catch {
        // Private-mode Safari can refuse writes; the toggle still works in-session.
      }
      return next;
    });
  }, []);

  return [lang, toggleLang];
}

/**
 * Sellers this device has blocked. There are no accounts in Trato 625, so a
 * block is per-device: we keep the phone numbers locally and filter them out of
 * every feed query.
 */
export function useBlockedSellers() {
  const [blocked, setBlocked] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('trato_blocked_sellers') || '[]');
      if (Array.isArray(saved)) setBlocked(saved.filter(p => typeof p === 'string'));
    } catch {
      // Corrupt value: start from an empty list rather than breaking the feed.
    }
  }, []);

  const persist = (next: string[]) => {
    setBlocked(next);
    try {
      localStorage.setItem('trato_blocked_sellers', JSON.stringify(next));
    } catch {
      // Ignore quota/private-mode failures.
    }
  };

  const blockSeller = useCallback((phone: string | null | undefined) => {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return;
    setBlocked(prev => {
      if (prev.includes(digits)) return prev;
      const next = [...prev, digits];
      try {
        localStorage.setItem('trato_blocked_sellers', JSON.stringify(next));
      } catch {
        // Ignore quota/private-mode failures.
      }
      return next;
    });
  }, []);

  const clearBlocked = useCallback(() => persist([]), []);

  return { blocked, blockSeller, clearBlocked };
}

export type Layout = 'grid' | 'list';

export function useLayout(): [Layout, () => void] {
  const [layout, setLayout] = useState<Layout>('grid');

  useEffect(() => {
    const saved = localStorage.getItem('trato_layout');
    if (saved === 'grid' || saved === 'list') setLayout(saved);
  }, []);

  const toggleLayout = useCallback(() => {
    setLayout(prev => {
      const next: Layout = prev === 'grid' ? 'list' : 'grid';
      try {
        localStorage.setItem('trato_layout', next);
      } catch {
        // Ignore quota/private-mode failures.
      }
      return next;
    });
  }, []);

  return [layout, toggleLayout];
}
