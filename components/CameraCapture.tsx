'use client';
import { useState, useEffect } from 'react';
import { compressImage } from '../lib/imageUtils';
import { supabase } from '../lib/supabase';
import { hashPin } from '../lib/pinUtils';
import { T, CATEGORIES, ZONES, type Lang } from '../lib/i18n';
import { isNative, takeNativePhoto, tapHaptic } from '../lib/native';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// Category values are stored in Spanish; 'Todos' is a filter-only value.
const POST_CATEGORIES = CATEGORIES.filter(c => c.val !== 'Todos');

const inputClass =
    'w-full box-border border-2 border-ink rounded-[10px] p-[11px] bg-cream outline-none font-semibold text-ink placeholder:text-faint focus:bg-card';
const labelClass = 'block mb-[5px] text-[13px] font-black uppercase tracking-[.05em] text-ink';

export default function PostForm({ lang }: { lang: Lang }) {
    const t = T[lang];

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [title, setTitle] = useState('');
    const [price, setPrice] = useState('');
    const [phone, setPhone] = useState('');
    const [category, setCategory] = useState(POST_CATEGORIES[0].val);
    const [location, setLocation] = useState(ZONES[0]);
    const [description, setDescription] = useState('');
    const [pin, setPin] = useState(''); // NEW: Secret PIN state
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [onNative, setOnNative] = useState(false);

    // Capacitor only exists in the iOS shell; check after mount so SSR matches.
    useEffect(() => { setOnNative(isNative()); }, []);

    useEffect(() => {
        const lastPostTime = localStorage.getItem('lastPostTime');
        if (lastPostTime) {
            const timePassed = Math.floor((Date.now() - parseInt(lastPostTime)) / 1000);
            if (timePassed < 60) {
                setCooldown(60 - timePassed);
            }
        }
    }, []);

    useEffect(() => {
        if (cooldown > 0) {
            const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [cooldown]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selected = Array.from(e.target.files);
            const invalid = selected.filter(f => !ALLOWED_MIME_TYPES.includes(f.type));
            if (invalid.length > 0) {
                alert(t.alertOnlyImages);
                return;
            }
            if (selected.length > 5) {
                alert(t.alertMaxPhotos);
                setFiles(selected.slice(0, 5));
            } else {
                setFiles(selected);
            }
        }
    };

    // Native camera capture. The resulting File joins the same compression and
    // upload path as a file-picker photo, so nothing downstream changes.
    const handleNativeCamera = async () => {
        void tapHaptic();
        const photo = await takeNativePhoto();
        if (!photo) return;
        if (files.length >= 5) {
            alert(t.alertMaxPhotos);
            return;
        }
        setFiles([...files, photo]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (cooldown > 0) {
            alert(`${t.alertCooldownPrefix} ${cooldown} ${t.alertCooldownSuffix}`);
            return;
        }

        if (!firstName.trim() || !lastName.trim()) {
            alert(t.alertNameRequired);
            return;
        }

        if (title.trim().length < 4) {
            alert(t.alertTitleShort);
            return;
        }

        const cleanPhone = phone.replace(/\D/g, '');
        if (cleanPhone.length !== 10) {
            alert(t.alertPhone10);
            return;
        }

        if (pin.length !== 4) {
            alert(t.alertPinCreate);
            return;
        }

        if (!agreed) {
            alert(t.alertAgree);
            return;
        }

        if (files.length === 0 || !title || !price || !phone) {
            alert(t.alertRequired);
            return;
        }

        setUploading(true);

        try {
            const hashedPin = await hashPin(pin);
            const uploadedUrls: string[] = [];

            for (const file of files) {
                const compressedImage = await compressImage(file);
                const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

                const { error: uploadError } = await supabase.storage.from('listings').upload(fileName, compressedImage);
                if (uploadError) throw uploadError;

                const { data: publicUrlData } = supabase.storage.from('listings').getPublicUrl(fileName);
                uploadedUrls.push(publicUrlData.publicUrl);
            }

            const { data: insertedData, error: dbError } = await supabase.from('listings').insert([{
                seller_name: `${firstName} ${lastName}`.trim(),
                title,
                price: parseFloat(price),
                description,
                location,
                image_url: uploadedUrls[0],
                image_urls: uploadedUrls,
                seller_phone: cleanPhone,
                category,
                secret_pin: hashedPin
            }]).select().single();

            if (dbError) throw dbError;

            if (insertedData) {
                const savedPins = JSON.parse(localStorage.getItem('my_listing_pins') || '{}');
                savedPins[insertedData.id] = pin;
                localStorage.setItem('my_listing_pins', JSON.stringify(savedPins));
            }

            localStorage.setItem('lastPostTime', Date.now().toString());
            setCooldown(60);

            alert(t.alertPosted);
            setFirstName(''); setLastName(''); setTitle(''); setPrice(''); setPhone('');
            setLocation(ZONES[0]); setDescription(''); setPin(''); setCategory(POST_CATEGORIES[0].val); setFiles([]); setAgreed(false);
        } catch (error: any) {
            alert('Error: ' + (error.message || 'Failed to post item.'));
        } finally {
            setUploading(false);
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="mb-8 flex w-full flex-col gap-4 rounded-2xl border-2 border-ink bg-card p-5 text-ink shadow-hard-lg"
        >
            <div className="border-b-2 border-dashed border-muted-border pb-3.5 text-center">
                <h2 className="font-display text-[22px] text-ink">{t.sellTitle}</h2>
                <p className="mt-1 text-xs font-extrabold tracking-[.14em] text-green uppercase">{t.sellSub}</p>
            </div>

            <div className="rounded-xl border-2 border-ink bg-cream p-3">
                <p className="mb-2 text-center text-[10px] font-black tracking-[.1em] text-muted uppercase">
                    {t.privateData}
                </p>
                <div className="flex gap-2.5">
                    <input
                        type="text"
                        placeholder={t.firstName}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="min-w-0 flex-1 box-border rounded-[10px] border-2 border-ink bg-card p-2.5 text-sm font-semibold text-ink outline-none placeholder:text-faint"
                        required
                    />
                    <input
                        type="text"
                        placeholder={t.lastName}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="min-w-0 flex-1 box-border rounded-[10px] border-2 border-ink bg-card p-2.5 text-sm font-semibold text-ink outline-none placeholder:text-faint"
                        required
                    />
                </div>
            </div>

            <div>
                <label className={labelClass}>{t.whatSelling}</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required />
            </div>

            <div className="flex gap-2.5">
                <div className="min-w-0 flex-1">
                    <label className={labelClass}>{t.price}</label>
                    <input type="number" placeholder="$" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} required />
                </div>
                <div className="min-w-0 flex-1">
                    <label className={labelClass}>WhatsApp</label>
                    <input type="tel" placeholder="625..." value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} required />
                </div>
            </div>

            <div className="flex gap-2.5">
                <div className="min-w-0 flex-1">
                    <label className={labelClass}>{t.category}</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                        {POST_CATEGORIES.map(cat => (
                            <option key={cat.val} value={cat.val}>{lang === 'es' ? cat.es : cat.en}</option>
                        ))}
                    </select>
                </div>
                <div className="min-w-0 flex-1">
                    <label className={labelClass}>{t.zoneLabel}</label>
                    <select value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass}>
                        {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                </div>
            </div>

            <div className="rounded-xl border-2 border-ink bg-pin p-3.5">
                <p className="m-0 text-center text-[13px] font-black tracking-[.05em] uppercase">🔒 {t.pinTitle}</p>
                <p className="mt-1 mb-2.5 text-center text-[11px] leading-[1.4] font-semibold text-muted">{t.pinHelp}</p>
                <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className="box-border w-full rounded-[10px] border-2 border-ink bg-card p-3 text-center text-2xl font-black tracking-[.5em] text-ink outline-none"
                    placeholder="••••"
                    required
                />
            </div>

            <div>
                <label className={labelClass}>{t.detailsOptional}</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} rows={2} />
            </div>

            {onNative && (
                <button
                    type="button"
                    onClick={handleNativeCamera}
                    className="press w-full rounded-xl border-2 border-ink bg-ink p-3.5 font-display text-[15px] text-yellow shadow-hard active:shadow-hard-xs"
                >
                    {t.takePhoto}
                </button>
            )}

            <div className="relative box-border flex h-[120px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-ink bg-cream">
                <div className="pointer-events-none px-4 text-center">
                    <p className="m-0 text-[13px] font-black tracking-[.05em] text-terracotta uppercase">
                        {files.length > 0 ? `${files.length} ${t.photosReady}` : t.addPhotos}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-muted">{t.maxPhotos}</p>
                </div>
                <input type="file" accept="image/*" multiple onChange={handleFileChange} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </div>

            <label className="flex cursor-pointer items-start gap-2.5">
                <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-terracotta"
                />
                <span className="text-[13px] leading-[1.35] font-bold">{t.agree}</span>
            </label>

            <button
                type="submit"
                disabled={uploading || cooldown > 0}
                className={`press w-full rounded-xl border-2 border-ink p-[15px] font-display text-base tracking-[.04em] text-card shadow-hard active:shadow-hard-xs ${cooldown > 0 || uploading ? 'bg-faint' : 'bg-terracotta'}`}
            >
                {cooldown > 0 ? `${t.waitSeconds} ${cooldown}s` : uploading ? t.publishing : t.publish}
            </button>
        </form>
    );
}
