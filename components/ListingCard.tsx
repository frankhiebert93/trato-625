'use client';
import { T, fmtPrice, timeAgo, dropPercent, type Lang } from '../lib/i18n';
import type { Layout } from '../lib/usePrefs';

export default function ListingCard({
    item,
    onClick,
    lang,
    layout,
}: {
    item: any;
    onClick: () => void;
    lang: Lang;
    layout: Layout;
}) {
    const t = T[lang];
    const grid = layout === 'grid';

    const images = item.image_urls?.length ? item.image_urls : [item.image_url];
    const drop = item.is_sold ? null : dropPercent(Number(item.price), item.old_price);

    return (
        <div
            onClick={onClick}
            className="press relative flex w-full cursor-pointer flex-col overflow-hidden rounded-[14px] border-2 border-ink bg-card shadow-hard active:shadow-hard-xs"
        >
            <div
                className={`relative w-full overflow-hidden border-b-2 border-ink bg-well ${grid ? 'h-[120px]' : 'h-[200px]'}`}
            >
                <img
                    src={images[0]}
                    alt={item.title}
                    loading="lazy"
                    className={`h-full w-full object-cover ${item.is_sold ? 'opacity-75 grayscale' : ''}`}
                />

                {drop !== null && (
                    <span className="absolute top-2.5 left-2.5 z-10 rotate-[-4deg] rounded-lg border-2 border-ink bg-terracotta px-[9px] py-1 font-display text-[11px] whitespace-nowrap text-card">
                        ↓ {t.dropPrefix} {drop}%{lang === 'es' ? '!' : ''}
                    </span>
                )}

                {item.is_sold && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-cream/55">
                        <span className="rotate-[-8deg] border-[3px] border-ink bg-terracotta px-5 py-1.5 font-display text-[22px] tracking-[.12em] text-card">
                            {t.sold}
                        </span>
                    </div>
                )}
            </div>

            <div className="relative p-3">
                <span
                    className={`absolute -top-4 right-2.5 z-[5] rotate-[2deg] rounded-lg border-2 border-ink bg-yellow px-2.5 py-1 font-display whitespace-nowrap text-ink ${grid ? 'text-xs' : 'text-[15px]'}`}
                >
                    {fmtPrice(item.price)}
                </span>

                <h3
                    className={`mt-1.5 line-clamp-2 leading-[1.2] font-extrabold text-ink ${grid ? 'text-sm' : 'text-[17px]'}`}
                >
                    {item.title}
                </h3>

                {drop !== null && (
                    <p className="mt-0.5 text-xs font-bold text-faint line-through">
                        {fmtPrice(item.old_price)}
                    </p>
                )}

                <p className="mt-[5px] truncate text-[11px] font-bold tracking-[.04em] text-green uppercase">
                    📍 {item.location || 'Cuauhtémoc'} · {timeAgo(item.bumped_at || item.created_at, lang)}
                </p>
            </div>
        </div>
    );
}
