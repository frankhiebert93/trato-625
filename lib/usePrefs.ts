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
