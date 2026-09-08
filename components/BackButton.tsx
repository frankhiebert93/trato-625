'use client';
import { useRouter } from 'next/navigation';

/**
 * Consistent "back" control. Goes back in history when there is somewhere to go
 * back to (normal in-app navigation), and falls back to a sensible parent route
 * on a cold/deep-link load where there is no history. Styled to match the
 * design-system chip used elsewhere (e.g. the Terms page header).
 */
export default function BackButton({
  fallback = '/',
  label = 'Atrás',
  className = '',
}: {
  fallback?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  };

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Volver"
      className={`press inline-flex items-center gap-1 rounded-full border-2 border-ink bg-card px-3.5 py-1.5 text-[13px] font-extrabold text-ink shadow-hard-sm active:shadow-hard-xs ${className}`}
    >
      <span aria-hidden>‹</span> {label}
    </button>
  );
}
