'use client';
import { useState, useEffect } from 'react';
import React from 'react';
import PostForm from '../components/CameraCapture';
import ListingCard from '../components/ListingCard';
import { supabase } from '../lib/supabase';
import { hashPin } from '../lib/pinUtils';
import Link from 'next/link';
import { useLang, useLayout, useBlockedSellers } from '../lib/usePrefs';
import { nativeShare, tapHaptic } from '../lib/native';
import {
  T,
  RULES,
  REPORT_REASONS,
  CATEGORIES,
  ZONES,
  ALL_ZONES,
  fmtPrice,
  fmtTime,
  timeAgo,
  dropPercent,
  initials,
  waNumber,
  interestMessage,
  offerMessage,
  boostMessage,
  eventMessage,
  sellerStats,
  type Lang,
} from '../lib/i18n';

const ITEMS_PER_PAGE = 10;
const ADMIN_WHATSAPP = '526251191400';

// Columns the public feed needs. `secret_pin` is deliberately never selected.
const LISTING_COLUMNS =
  'id, created_at, seller_name, title, price, old_price, description, location, image_url, image_urls, seller_phone, category, is_sold, is_verified, bumped_at, event_id';

type SellerInfo = { sales: number; since: number | null };

export default function Home() {
  const [lang, toggleLang] = useLang();
  const [layout, toggleLayout] = useLayout();
  const t = T[lang];
  const grid = layout === 'grid';

  const [activeTab, setActiveTab] = useState<'feed' | 'post' | 'guidelines'>('feed');
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // State for the sponsored ad
  const [activeAd, setActiveAd] = useState<any | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [zone, setZone] = useState(ALL_ZONES);
  const [sellerFilter, setSellerFilter] = useState<{ phone: string; name: string } | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // --- NEW FILTERS ---
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sortOrder, setSortOrder] = useState<'recent' | 'price_asc' | 'price_desc'>('recent');

  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [showSoldPrompt, setShowSoldPrompt] = useState(false);
  const [verifyPin, setVerifyPin] = useState('');
  const [soldLoading, setSoldLoading] = useState(false);

  const [showFullscreen, setShowFullscreen] = useState(false);

  // Safety: reporting a listing, and hiding a seller on this device.
  const { blocked, blockSeller, clearBlocked } = useBlockedSellers();
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSending, setReportSending] = useState(false);

  // Yard-sale event
  const [event, setEvent] = useState<any | null>(null);
  const [showEventPage, setShowEventPage] = useState(false);
  const [eventItems, setEventItems] = useState<any[]>([]);

  // Debounce the search box so typing doesn't hammer Supabase.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(id);
  }, [searchQuery]);

  useEffect(() => {
    if (activeTab === 'feed') {
      setPage(0);
      fetchListings(0, true);
      fetchSponsorAd();
      fetchEvent();
    }
  }, [activeTab, activeCategory, zone, sellerFilter, onlyAvailable, sortOrder, debouncedSearch, blocked]);

  useEffect(() => {
    if (selectedItem) {
      try {
        const savedPins = JSON.parse(localStorage.getItem('my_listing_pins') || '{}');
        if (savedPins[selectedItem.id]) {
          setVerifyPin(savedPins[selectedItem.id]);
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
      fetchSellerInfo(selectedItem.seller_phone);
    }
  }, [selectedItem?.id]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(searchQuery);
  };

  // Function to grab the active ad from the database (Respecting Expirations)
  async function fetchSponsorAd() {
    const now = new Date().toISOString();

    const { data } = await supabase
      .from('sponsored_ads')
      .select('*')
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gte.${now}`) // Hides the ad if it is expired!
      .order('created_at', { ascending: false })
      .limit(1)
      // maybeSingle: "no ad running" is a normal state, not an error. `single()`
      // returns PGRST116/406 on zero rows and logs on every page load.
      .maybeSingle();

    // Clear explicitly, so an ad deactivated mid-session stops rendering.
    setActiveAd(data ?? null);
  }

  // Next upcoming active yard sale, plus how many items are attached to it.
  async function fetchEvent() {
    const today = new Date().toISOString().slice(0, 10);

    const { data } = await supabase
      .from('yard_sale_events')
      .select('*')
      .eq('is_active', true)
      .gte('event_date', today)
      .order('event_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!data) {
      setEvent(null);
      return;
    }

    const { count } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', data.id);

    setEvent({ ...data, itemCount: count ?? 0 });
  }

  // "12 ventas · miembro desde 2024", derived from the seller's own listings.
  async function fetchSellerInfo(phone: string | null) {
    if (!phone) {
      setSellerInfo(null);
      return;
    }
    setSellerInfo(null);
    const { data } = await supabase
      .from('listings')
      .select('created_at, is_sold')
      .eq('seller_phone', phone);

    if (!data) return;
    const sales = data.filter(d => d.is_sold).length;
    const years = data.map(d => new Date(d.created_at).getFullYear()).filter(y => !Number.isNaN(y));
    setSellerInfo({ sales, since: years.length ? Math.min(...years) : null });
  }

  // Fetch listings with the 15-day sold filter
  async function fetchListings(pageNumber: number, isFreshSearch = false) {
    setLoading(true);
    const from = pageNumber * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const cutoffDate = fifteenDaysAgo.toISOString();

    let query = supabase.from('listings').select(LISTING_COLUMNS);

    if (onlyAvailable) {
      query = query.eq('is_sold', false);
    } else {
      query = query.or(`is_sold.eq.false,and(is_sold.eq.true,bumped_at.gte.${cutoffDate})`);
    }

    if (sortOrder === 'recent') {
      query = query.order('bumped_at', { ascending: false });
    } else if (sortOrder === 'price_asc') {
      query = query.order('price', { ascending: true });
      // If we order by price, we should still secondary sort by bumped_at
      query = query.order('bumped_at', { ascending: false });
    } else if (sortOrder === 'price_desc') {
      query = query.order('price', { ascending: false });
      query = query.order('bumped_at', { ascending: false });
    }

    query = query.range(from, to);

    if (activeCategory !== 'Todos') query = query.eq('category', activeCategory);
    if (zone !== ALL_ZONES) query = query.eq('location', zone);
    if (sellerFilter) query = query.eq('seller_phone', sellerFilter.phone);
    // Blocked sellers are digits-only, so this interpolation cannot inject.
    if (blocked.length) query = query.not('seller_phone', 'in', `(${blocked.join(',')})`);
    if (debouncedSearch.trim() !== '') query = query.ilike('title', `%${debouncedSearch}%`);

    const { data, error } = await query;
    if (!error && data) {
      if (isFreshSearch || pageNumber === 0) setListings(data);
      else setListings(prev => [...prev, ...data]);
      setHasMore(data.length === ITEMS_PER_PAGE);
    }
    setLoading(false);
  }

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchListings(nextPage);
  };

  const openWhatsApp = (phone: string | null | undefined, message: string) => {
    const number = waNumber(phone);
    if (!number) return;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleWhatsAppClick = (item: any) => {
    openWhatsApp(item.seller_phone, interestMessage(item.title, lang));
  };

  const handleShare = async (item: any) => {
    const shareData = { title: item.title, text: `Mira este ${item.title} en Trato 625!`, url: window.location.origin };
    void tapHaptic();
    try {
      // Native iOS share sheet first; falls through to the web path off-device.
      if (await nativeShare(shareData)) return;
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        alert(t.alertLinkCopied);
      }
    } catch (err) { console.error(err); }
  };

  const handleMarkSoldBySeller = async () => {
    if (!selectedItem) return;

    if (verifyPin.length !== 4) {
      alert(t.alertPin4);
      return;
    }

    setSoldLoading(true);

    const hashedPin = await hashPin(verifyPin);
    const { data, error } = await supabase
      .from('listings')
      .update({ is_sold: true })
      .eq('id', selectedItem.id)
      .eq('secret_pin', hashedPin)
      .select();

    if (error) {
      alert(t.alertConnection);
    } else if (!data || data.length === 0) {
      alert(t.alertPinWrong);
    } else {
      setSelectedItem({ ...selectedItem, is_sold: true });
      setListings(listings.map(item => item.id === selectedItem.id ? { ...item, is_sold: true } : item));
      setShowSoldPrompt(false);
      setVerifyPin('');
      alert(t.alertSoldOk);
    }

    setSoldLoading(false);
  };

  const handleBoostRequest = () => {
    if (!selectedItem) return;
    openWhatsApp(ADMIN_WHATSAPP, boostMessage(selectedItem.title, lang));
  };

  const handleSendReport = async () => {
    if (!selectedItem) return;
    if (!reportReason) {
      alert(t.reportPickReason);
      return;
    }
    setReportSending(true);
    const { error } = await supabase.from('reports').insert([{
      listing_id: selectedItem.id,
      reason: reportReason,
      details: reportDetails.trim() || null,
    }]);
    setReportSending(false);

    if (error) {
      alert(t.reportError);
      return;
    }
    setShowReport(false);
    setReportReason('');
    setReportDetails('');
    alert(t.reportThanks);
  };

  const handleBlockSeller = () => {
    if (!selectedItem?.seller_phone) return;
    if (!window.confirm(t.blockConfirm)) return;
    blockSeller(selectedItem.seller_phone);
    closeDetail();
  };

  const closeDetail = () => {
    setSelectedItem(null);
    setShowReport(false);
    setReportReason('');
    setReportDetails('');
    setShowSoldPrompt(false);
    setVerifyPin('');
    setShowFullscreen(false);
    setSellerInfo(null);
  };

  const openEventPage = async () => {
    if (!event) return;
    setShowEventPage(true);
    const { data } = await supabase
      .from('listings')
      .select('id, title, price, image_url, image_urls, is_sold')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false });
    setEventItems(data || []);
  };

  const showSellerListings = () => {
    if (!selectedItem?.seller_phone) return;
    setSellerFilter({ phone: selectedItem.seller_phone, name: selectedItem.seller_name || '' });
    setActiveTab('feed');
    closeDetail();
    window.scrollTo({ top: 0 });
  };

  // Weekday + day for the rotated yellow date chip.
  const eventDate = (() => {
    if (!event?.event_date) return { weekday: t.sat, day: '' };
    const d = new Date(`${event.event_date}T12:00:00`);
    if (Number.isNaN(d.getTime())) return { weekday: t.sat, day: '' };
    const weekday = d
      .toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { weekday: 'short' })
      .replace(/\./g, '')
      .toUpperCase();
    return { weekday, day: String(d.getDate()) };
  })();

  const eventHours = [event?.start_time, event?.end_time].map(fmtTime).filter(Boolean).join('–');

  const renderFullscreenGallery = () => {
    if (!showFullscreen || !selectedItem) return null;
    const images = selectedItem.image_urls?.length ? selectedItem.image_urls : [selectedItem.image_url];

    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-ink">
        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-50">
          <button
            onClick={() => setShowFullscreen(false)}
            className="rounded-full border-2 border-ink bg-card px-4 py-2 text-sm font-extrabold text-ink shadow-hard-sm"
          >
            ✕ {t.close}
          </button>
        </div>

        <div className="hide-scrollbar flex w-full flex-1 snap-x snap-mandatory overflow-x-auto">
          {images.map((img: string, i: number) => (
            <div key={i} className="relative flex h-full w-full shrink-0 snap-center flex-col items-center justify-center p-2">
              <img src={img} className={`max-h-full max-w-full object-contain ${selectedItem.is_sold ? 'opacity-50 grayscale' : ''}`} alt={`full-${i}`} />
              {images.length > 1 && (
                <div className="absolute bottom-[max(2rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full border-2 border-ink bg-yellow px-4 py-1 text-xs font-black text-ink">
                  {i + 1} / {images.length}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderEventPage = () => {
    if (!showEventPage || !event) return null;

    return (
      <div className="hide-scrollbar fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-cream">
        <div className="mx-auto w-full max-w-md">
          <div className="border-b-2 border-ink bg-green p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <button
              onClick={() => setShowEventPage(false)}
              className="press rounded-full border-2 border-ink bg-card px-3.5 py-1.5 text-[13px] font-extrabold text-ink shadow-hard-sm active:shadow-hard-xs"
            >
              ‹ {t.back}
            </button>

            <div className="mt-3.5 flex items-center gap-3.5">
              <div className="flex h-16 w-16 shrink-0 rotate-[-3deg] flex-col items-center justify-center rounded-xl border-2 border-ink bg-yellow">
                <span className="font-display text-xl leading-none text-ink">{eventDate.weekday}</span>
                <span className="mt-0.5 text-[13px] leading-none font-black text-terracotta-dark">{eventDate.day}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-black tracking-[.18em] text-yellow uppercase">★ {t.eventKicker} ★</p>
                <h2 className="mt-0.5 font-display text-xl leading-[1.1] text-card">{event.family_name}</h2>
                <p className="mt-1 text-xs font-bold text-green-tint">
                  📍 {[event.zone, event.address].filter(Boolean).join(', ')}
                  {eventHours && ` · ${eventHours}`}
                </p>
              </div>
            </div>

            {event.description && (
              <p className="mt-3 text-xs leading-[1.5] font-semibold text-green-soft">{event.description}</p>
            )}
          </div>

          <div className="p-4">
            <p className="mb-3 text-[11px] font-black tracking-[.14em] text-terracotta-dark uppercase">
              {eventItems.length} {t.items} · {t.eventPreview}
            </p>

            {eventItems.length === 0 ? (
              <p className="py-8 text-center text-sm font-bold text-muted">{t.noResults}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {eventItems.map(ei => {
                  const img = ei.image_urls?.length ? ei.image_urls[0] : ei.image_url;
                  return (
                    <div key={ei.id} className="overflow-hidden rounded-xl border-2 border-ink bg-card shadow-hard">
                      <div className="h-[110px] overflow-hidden border-b-2 border-ink bg-well">
                        <img src={img} alt={ei.title} loading="lazy" className={`h-full w-full object-cover ${ei.is_sold ? 'opacity-75 grayscale' : ''}`} />
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-[13px] font-extrabold text-ink">{ei.title}</p>
                        <p className="mt-[3px] font-display text-sm text-terracotta">{fmtPrice(ei.price)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => openWhatsApp(event.whatsapp || ADMIN_WHATSAPP, eventMessage(event.family_name, lang))}
              className="press mt-4 w-full rounded-xl border-2 border-ink bg-wa p-3.5 font-display text-[15px] text-card shadow-hard active:shadow-hard-xs"
            >
              {t.eventAsk}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderDetailView = () => {
    if (!selectedItem) return null;
    const images = selectedItem.image_urls?.length ? selectedItem.image_urls : [selectedItem.image_url];
    const isSold = !!selectedItem.is_sold;
    const price = Number(selectedItem.price);
    const drop = isSold ? null : dropPercent(price, selectedItem.old_price);

    const offers = [
      { amount: fmtPrice(price), label: t.full, color: 'text-green' },
      { amount: fmtPrice(Math.round(price * 0.9)), label: '-10%', color: 'text-terracotta' },
      { amount: fmtPrice(Math.round(price * 0.8)), label: '-20%', color: 'text-terracotta' },
    ];

    return (
      <div className="hide-scrollbar fixed inset-0 z-50 flex flex-col overflow-y-auto bg-cream">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-ink bg-cream px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              onClick={closeDetail}
              className="press rounded-full border-2 border-ink bg-card px-3.5 py-1.5 text-[13px] font-extrabold text-ink shadow-hard-sm active:shadow-hard-xs"
            >
              ‹ {t.back}
            </button>
            {selectedItem.category && (
              <span className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-extrabold tracking-[.06em] text-cream uppercase">
                {selectedItem.category}
              </span>
            )}
          </div>

          <div className="hide-scrollbar relative flex w-full snap-x snap-mandatory overflow-x-auto border-b-2 border-ink bg-well">
            {images.map((img: string, i: number) => (
              <div key={i} onClick={() => setShowFullscreen(true)} className="relative h-[250px] w-full shrink-0 snap-center cursor-pointer">
                <img src={img} className={`h-full w-full object-cover ${isSold ? 'opacity-60 grayscale' : ''}`} alt={`img-${i}`} />
              </div>
            ))}
            {images.length > 1 && (
              <span className="pointer-events-none absolute right-3 bottom-3 z-10 rounded-full border-2 border-ink bg-card px-2.5 py-1 text-[11px] font-black text-ink">
                1/{images.length}
              </span>
            )}
            {isSold && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-cream/50">
                <span className="rotate-[-8deg] border-[3px] border-ink bg-terracotta px-7 py-2.5 font-display text-[32px] tracking-[.12em] text-card">
                  {t.sold}
                </span>
              </div>
            )}
          </div>

          <div className="px-[18px] pt-[18px] pb-[150px]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-[22px] leading-[1.15] wrap-break-word text-ink">{selectedItem.title}</h1>
                <p className="mt-1.5 text-xs font-extrabold tracking-[.05em] text-green uppercase">
                  📍 {selectedItem.location || 'Cuauhtémoc'} · {timeAgo(selectedItem.bumped_at || selectedItem.created_at, lang)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="inline-block rotate-[2deg] rounded-[10px] border-2 border-ink bg-yellow px-3 py-1.5 font-display text-[19px] whitespace-nowrap text-ink">
                  {fmtPrice(price)}
                </span>
                {drop !== null && (
                  <p className="mt-1.5 text-xs font-bold text-faint line-through">{fmtPrice(selectedItem.old_price)}</p>
                )}
              </div>
            </div>

            {/* Seller mini-profile */}
            <div className="mt-4 flex items-center gap-3 rounded-[14px] border-2 border-ink bg-card p-3.5 shadow-hard">
              <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border-2 border-ink bg-green font-display text-base text-card">
                {initials(selectedItem.seller_name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-black text-ink">
                  {selectedItem.seller_name || '—'}
                  {selectedItem.is_verified && (
                    <span className="rounded-full bg-green px-[7px] py-0.5 text-[9px] font-black tracking-[.06em] text-card uppercase">
                      ✓ {t.verified}
                    </span>
                  )}
                </p>
                <p className="mt-[3px] text-[11px] font-bold text-muted">
                  {sellerInfo ? sellerStats(sellerInfo.sales, sellerInfo.since, lang) : '…'}
                </p>
              </div>
              <button
                onClick={showSellerListings}
                className="press shrink-0 rounded-[9px] border-2 border-ink bg-cream px-2.5 py-[7px] text-[11px] font-extrabold whitespace-nowrap text-ink"
              >
                {t.seeMore}
              </button>
            </div>

            <div className="mt-[18px]">
              <h3 className="mb-1.5 text-[13px] font-black tracking-[.08em] text-ink uppercase">{t.details}</h3>
              <p className="text-sm leading-[1.6] font-medium wrap-break-word whitespace-pre-wrap text-body-ink">
                {selectedItem.description || t.noDescription}
              </p>
            </div>

            {!isSold && (
              <>
                <div className="mt-5">
                  <h3 className="mb-2 text-[13px] font-black tracking-[.08em] text-ink uppercase">{t.makeOffer}</h3>
                  <div className="flex gap-2">
                    {offers.map(o => (
                      <button
                        key={o.label}
                        onClick={() => { void tapHaptic(); openWhatsApp(selectedItem.seller_phone, offerMessage(o.amount, selectedItem.title, lang)); }}
                        className="press flex flex-1 flex-col items-center gap-0.5 rounded-[11px] border-2 border-ink bg-card px-1.5 py-2.5 shadow-hard-sm active:shadow-none"
                      >
                        <span className={`font-display text-sm ${o.color}`}>{o.amount}</span>
                        <span className="text-[9px] font-extrabold tracking-[.05em] text-muted uppercase">{o.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-center text-[10px] font-semibold text-faint">{t.offerNote}</p>
                </div>

                <div className="mt-5 rounded-[14px] border-2 border-ink bg-pin p-3.5">
                  <h4 className="mb-2.5 text-xs font-black tracking-[.08em] text-ink uppercase">{t.sellerQ}</h4>
                  <button
                    onClick={handleBoostRequest}
                    className="mb-2 w-full rounded-[10px] bg-ink p-3 font-display text-[13px] text-yellow"
                  >
                    🚀 {t.boost}
                  </button>

                  {!showSoldPrompt ? (
                    <button
                      onClick={() => setShowSoldPrompt(true)}
                      className="w-full rounded-[10px] border-2 border-terracotta bg-card p-3 text-[13px] font-black text-terracotta"
                    >
                      {t.markSold}
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      <p className="text-[11px] font-semibold text-muted">{t.pinConfirm}</p>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="••••"
                        value={verifyPin}
                        onChange={(e) => setVerifyPin(e.target.value.replace(/\D/g, ''))}
                        className="box-border w-full rounded-[10px] border-2 border-ink bg-card p-3 text-center text-2xl font-black tracking-[1em] text-ink outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleMarkSoldBySeller}
                          disabled={soldLoading}
                          className="flex-1 rounded-[10px] border-2 border-ink bg-terracotta p-3 text-[13px] font-black text-card disabled:opacity-70"
                        >
                          {soldLoading ? t.verifying : t.confirmSale}
                        </button>
                        <button
                          onClick={() => { setShowSoldPrompt(false); setVerifyPin(''); }}
                          className="rounded-[10px] border-2 border-ink bg-card px-4 py-3 text-[13px] font-black text-ink"
                        >
                          {t.cancel}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Safety controls. Required by Play's UGC policy and Apple 1.2:
                a user must be able to flag content and block a seller. */}
            <div className="mt-6 border-t-2 border-dashed border-muted-border pt-4">
              {!showReport ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowReport(true)}
                    className="press rounded-[10px] border-2 border-muted-border bg-card px-3 py-2 text-[12px] font-black tracking-[.04em] text-muted uppercase"
                  >
                    ⚑ {t.report}
                  </button>
                  <button
                    onClick={handleBlockSeller}
                    className="press rounded-[10px] border-2 border-muted-border bg-card px-3 py-2 text-[12px] font-black tracking-[.04em] text-muted uppercase"
                  >
                    {t.blockSeller}
                  </button>
                </div>
              ) : (
                <div className="rounded-[14px] border-2 border-ink bg-card p-3.5 shadow-hard">
                  <h4 className="mb-2.5 text-[13px] font-black tracking-[.04em] text-terracotta uppercase">
                    {t.reportTitle}
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {REPORT_REASONS.map(r => (
                      <label key={r.val} className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-ink">
                        <input
                          type="radio"
                          name="report-reason"
                          value={r.val}
                          checked={reportReason === r.val}
                          onChange={() => setReportReason(r.val)}
                          className="h-4 w-4 shrink-0 accent-terracotta"
                        />
                        {lang === 'es' ? r.es : r.en}
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder={t.reportDetails}
                    className="mt-2.5 w-full box-border rounded-[10px] border-2 border-ink bg-cream p-2.5 text-[13px] font-semibold text-ink outline-none placeholder:text-faint"
                  />
                  <div className="mt-2.5 flex gap-2">
                    <button
                      onClick={handleSendReport}
                      disabled={reportSending}
                      className="flex-1 rounded-[10px] border-2 border-ink bg-terracotta p-2.5 text-[13px] font-black text-card disabled:opacity-70"
                    >
                      {reportSending ? t.reportSending : t.reportSend}
                    </button>
                    <button
                      onClick={() => { setShowReport(false); setReportReason(''); setReportDetails(''); }}
                      className="rounded-[10px] border-2 border-ink bg-card px-4 py-2.5 text-[13px] font-black text-ink"
                    >
                      {t.cancel}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] font-semibold text-faint">{t.moderationNote}</p>
                </div>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 z-20 mt-auto flex w-full gap-2.5 border-t-2 border-ink bg-card px-4 pt-3.5 pb-[max(1.375rem,env(safe-area-inset-bottom))]">
            {isSold ? (
              <div className="flex flex-[2] items-center justify-center rounded-xl border-2 border-muted-border bg-well p-3.5 text-sm font-black text-faint">
                {t.itemSold}
              </div>
            ) : (
              <button
                onClick={() => { void tapHaptic(); handleWhatsAppClick(selectedItem); }}
                className="press flex-[2] rounded-xl border-2 border-ink bg-wa p-3.5 font-display text-base text-card shadow-hard active:shadow-hard-xs"
              >
                WhatsApp
              </button>
            )}
            <button
              onClick={() => handleShare(selectedItem)}
              className="press flex-1 rounded-xl border-2 border-ink bg-card p-3.5 text-[13px] font-black text-ink"
            >
              {t.share}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderGuidelinesView = () => (
    <div className="flex flex-col gap-3">
      <div className="py-2 text-center">
        <h2 className="font-display text-[22px] text-ink">{t.rulesTitle}</h2>
        <p className="mt-1 text-[11px] font-extrabold tracking-[.16em] text-green uppercase">{t.rulesSub}</p>
      </div>

      {RULES[lang].map(rule => (
        <div key={rule.num} className="flex items-start gap-3.5 rounded-[14px] border-2 border-ink bg-card px-4 py-3.5 shadow-hard">
          <span className="flex h-[34px] w-[34px] shrink-0 rotate-[-3deg] items-center justify-center rounded-[9px] border-2 border-ink bg-yellow font-display text-base text-ink">
            {rule.num}
          </span>
          <div>
            <h3 className="text-[15px] font-black tracking-[.03em] text-terracotta uppercase">{rule.title}</h3>
            <p className="mt-1 text-[13px] leading-[1.45] font-semibold text-ink">{rule.body}</p>
          </div>
        </div>
      ))}

      <div className="rounded-[14px] border-2 border-ink bg-green px-4 py-3.5 shadow-hard">
        <p className="text-center text-[11px] leading-[1.5] font-extrabold tracking-[.06em] text-card uppercase">
          {t.adminNote}
        </p>
      </div>

      <Link
        href="/privacidad"
        className="press block rounded-[14px] border-2 border-ink bg-card px-4 py-3.5 text-center text-[13px] font-black text-terracotta shadow-hard active:shadow-hard-xs"
      >
        {t.privacyLink} →
      </Link>

      <div className="mt-2 rounded-[14px] border-2 border-ink bg-card p-4 shadow-hard">
        <h3 className="font-display text-base text-ink">{t.installTitle}</h3>
        <p className="mt-1 text-[13px] font-semibold text-muted">{t.installBody}</p>

        <div className="mt-3.5 flex flex-col gap-3">
          <div>
            <p className="text-[13px] font-black text-ink">{t.installIphone}</p>
            <p className="mt-0.5 text-xs leading-[1.45] font-semibold text-muted">{t.installIphoneBody}</p>
          </div>
          <div>
            <p className="text-[13px] font-black text-ink">{t.installAndroid}</p>
            <p className="mt-0.5 text-xs leading-[1.45] font-semibold text-muted">{t.installAndroidBody}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const navButton = (tab: 'feed' | 'post' | 'guidelines', label: string) => {
    const active = activeTab === tab;
    return (
      <button
        onClick={() => setActiveTab(tab)}
        className={`flex-1 rounded-[10px] border-2 p-2.5 text-[13px] font-black tracking-[.04em] uppercase ${
          active ? 'border-ink bg-terracotta text-card' : 'border-muted-border bg-card text-muted'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <main className="min-h-screen bg-cream pb-32">
      {renderDetailView()}
      {renderEventPage()}
      {renderFullscreenGallery()}

      <header className="sticky top-0 z-30 border-b-2 border-ink bg-cream pt-[max(0.875rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center justify-between px-4 pb-2.5">
            <div>
              <h1 className="font-display text-[26px] leading-none tracking-[.01em] text-ink">
                TRATO <span className="text-terracotta">625</span>
              </h1>
              <p className="mt-1 text-[9px] font-extrabold tracking-[.22em] text-green uppercase">{t.tagline}</p>
            </div>
            <button
              onClick={toggleLang}
              className="press rounded-full border-2 border-ink bg-card px-3 py-[5px] text-xs font-extrabold text-ink shadow-hard-sm active:shadow-hard-xs"
            >
              {lang === 'es' ? 'ES · en' : 'EN · es'}
            </button>
          </div>

          {activeTab === 'feed' && (
            <>
              <form onSubmit={handleSearchSubmit} className="flex gap-2 px-4 pb-2.5">
                <input
                  type="text"
                  placeholder={t.search}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="min-w-0 flex-1 rounded-[10px] border-2 border-ink bg-card px-3 py-[9px] text-sm font-semibold text-ink outline-none placeholder:text-faint"
                />
                <button
                  type="button"
                  onClick={toggleLayout}
                  className="shrink-0 rounded-[10px] border-2 border-ink bg-ink px-3.5 text-xs font-extrabold text-cream"
                >
                  {grid ? t.layoutList : t.layoutGrid}
                </button>
              </form>

              <div className="hide-scrollbar flex gap-2 overflow-x-auto px-4 pb-2.5">
                {CATEGORIES.map(cat => {
                  const active = activeCategory === cat.val;
                  return (
                    <button
                      key={cat.val}
                      onClick={() => setActiveCategory(cat.val)}
                      className={`shrink-0 rounded-full border-2 border-ink px-3.5 py-1.5 text-[13px] font-extrabold whitespace-nowrap ${
                        active ? 'bg-terracotta text-card shadow-hard-sm' : 'bg-card text-ink'
                      }`}
                    >
                      {lang === 'es' ? cat.es : cat.en}
                    </button>
                  );
                })}
              </div>

              <div className="hide-scrollbar flex items-center gap-1.5 overflow-x-auto px-4 pb-3">
                <span className="shrink-0 text-[10px] font-black tracking-[.1em] text-terracotta-dark uppercase">
                  {t.zone}
                </span>
                {[ALL_ZONES, ...ZONES].map(z => {
                  const active = zone === z;
                  return (
                    <button
                      key={z}
                      onClick={() => setZone(z)}
                      className={`shrink-0 rounded-md border-[1.5px] border-dashed px-2.5 py-1 text-[11px] font-bold whitespace-nowrap ${
                        active ? 'border-ink bg-green text-card' : 'border-green bg-transparent text-green'
                      }`}
                    >
                      {z === ALL_ZONES ? t.allZones : z}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t-2 border-dashed border-muted-border px-4 py-2">
                <label className="flex cursor-pointer items-center gap-2 text-[11px] font-black tracking-[.04em] text-ink uppercase">
                  <input
                    type="checkbox"
                    checked={onlyAvailable}
                    onChange={(e) => setOnlyAvailable(e.target.checked)}
                    className="h-4 w-4 accent-terracotta"
                  />
                  {t.onlyAvailable}
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="rounded-md border-2 border-ink bg-card px-2 py-1 text-[11px] font-extrabold text-ink outline-none"
                >
                  <option value="recent">{t.sortRecent}</option>
                  <option value="price_asc">{t.sortPriceAsc}</option>
                  <option value="price_desc">{t.sortPriceDesc}</option>
                </select>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-md p-4">
        {activeTab === 'post' && <PostForm lang={lang} />}
        {activeTab === 'guidelines' && renderGuidelinesView()}

        {activeTab === 'feed' && (
          <>
            {sellerFilter && (
              <button
                onClick={() => setSellerFilter(null)}
                className="press mb-4 flex w-full items-center justify-between rounded-xl border-2 border-ink bg-yellow px-3.5 py-2.5 text-[12px] font-black tracking-[.04em] text-ink uppercase shadow-hard-sm active:shadow-hard-xs"
              >
                <span className="truncate">👤 {sellerFilter.name}</span>
                <span className="ml-2 shrink-0">✕</span>
              </button>
            )}

            {blocked.length > 0 && (
              <button
                onClick={clearBlocked}
                className="press mb-4 flex w-full items-center justify-between rounded-xl border-2 border-muted-border bg-card px-3.5 py-2.5 text-[11px] font-black tracking-[.04em] text-muted uppercase"
              >
                <span>
                  {blocked.length} {blocked.length === 1 ? t.blockedOne : t.blockedMany}
                </span>
                <span className="ml-2 shrink-0 text-terracotta">{t.showAll}</span>
              </button>
            )}

            {event && (
              <div
                onClick={openEventPage}
                className="press mb-4 cursor-pointer overflow-hidden rounded-[14px] border-2 border-ink bg-green shadow-hard-lg active:shadow-hard-sm"
              >
                <div className="h-2 bg-[repeating-linear-gradient(90deg,#F2C94C_0_20px,#0F6B4E_20px_40px)]" />
                <div className="flex items-center gap-3.5 px-4 py-3.5">
                  <div className="flex h-[58px] w-[58px] shrink-0 rotate-[-3deg] flex-col items-center justify-center rounded-xl border-2 border-ink bg-yellow">
                    <span className="font-display text-[18px] leading-none text-ink">{eventDate.weekday}</span>
                    <span className="mt-0.5 text-xs leading-none font-black text-terracotta-dark">{eventDate.day}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black tracking-[.18em] text-yellow uppercase">★ {t.eventKicker} ★</p>
                    <h3 className="mt-0.5 truncate font-display text-[17px] leading-[1.1] text-card">
                      {event.family_name}{event.zone ? ` — ${event.zone}` : ''}
                    </h3>
                    <p className="mt-[3px] text-xs font-bold text-green-tint">
                      {eventHours && `${eventHours} · `}{event.itemCount} {t.items} · {t.eventCta} →
                    </p>
                  </div>
                </div>
              </div>
            )}

            {loading && listings.length === 0 ? (
              <div className={`grid gap-3.5 ${grid ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {[...Array(grid ? 4 : 3)].map((_, i) => (
                  <div key={i} className="animate-pulse overflow-hidden rounded-[14px] border-2 border-ink bg-card shadow-hard">
                    <div className={`w-full border-b-2 border-ink bg-well ${grid ? 'h-[120px]' : 'h-[200px]'}`} />
                    <div className="p-3">
                      <div className="mb-2 h-4 w-3/4 rounded bg-well" />
                      <div className="h-3 w-1/3 rounded bg-well" />
                    </div>
                  </div>
                ))}
              </div>
            ) : listings.length === 0 && !loading ? (
              <div className="mt-10 rounded-[14px] border-2 border-dashed border-muted-border bg-card px-4 py-10 text-center">
                <p className="font-display text-[17px] text-ink">{t.noResults}</p>
                <p className="mt-1.5 text-[13px] font-semibold text-muted">{t.noResultsHint}</p>
              </div>
            ) : (
              <div className={`grid gap-3.5 ${grid ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {listings.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {activeAd && (index + 1) === activeAd.position && (
                      <div
                        onClick={() => window.open(activeAd.link_url, '_blank')}
                        className={`press relative cursor-pointer overflow-hidden rounded-[14px] border-2 border-ink bg-card shadow-hard active:shadow-hard-xs ${grid ? 'col-span-2' : ''}`}
                      >
                        <span className="absolute top-2.5 right-2.5 z-10 rotate-[3deg] rounded-md border-2 border-ink bg-yellow px-2 py-1 text-[10px] font-black tracking-[.08em] text-ink uppercase">
                          {t.sponsor}
                        </span>

                        {activeAd.image_url && (
                          <div className="h-40 w-full overflow-hidden border-b-2 border-ink bg-well">
                            <img src={activeAd.image_url} alt="Sponsor" className="h-full w-full object-cover" />
                          </div>
                        )}

                        <div className="p-3.5">
                          <h3 className="font-display text-[17px] leading-tight text-ink">{activeAd.title}</h3>
                          <p className="mt-1 text-[13px] font-semibold text-muted">{activeAd.description}</p>
                          <span className="mt-2.5 inline-block rounded-[9px] border-2 border-ink bg-cream px-3.5 py-1.5 text-xs font-extrabold text-terracotta">
                            {t.sponsorCta}
                          </span>
                        </div>
                      </div>
                    )}

                    <ListingCard item={item} lang={lang} layout={layout} onClick={() => setSelectedItem(item)} />
                  </React.Fragment>
                ))}
              </div>
            )}

            {hasMore && listings.length > 0 && (
              <button
                onClick={loadMore}
                disabled={loading}
                className="press mt-4 w-full rounded-xl border-2 border-ink bg-card p-3.5 text-sm font-black text-ink shadow-hard active:shadow-hard-xs"
              >
                {loading ? t.loading : t.loadMore}
              </button>
            )}
          </>
        )}
      </div>

      <nav className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-md -translate-x-1/2 justify-around gap-2 border-t-2 border-ink bg-card px-3 pt-2.5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {navButton('feed', t.navMarket)}
        {navButton('post', t.navSell)}
        {navButton('guidelines', t.navRules)}
      </nav>
    </main>
  );
}
