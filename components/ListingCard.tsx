'use client';

export default function ListingCard({ item }: { item: any }) {
    const formattedPrice = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.price);

    const handleWhatsAppClick = () => {
        if (!item.seller_phone) return;
        let cleanPhone = item.seller_phone.replace(/\D/g, '');
        if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone;
        const message = encodeURIComponent(`Hola, me interesa tu ${item.title} en Trato 625.`);
        window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
    };

    const handleShare = async () => {
        const shareData = { title: item.title, text: `Mira este ${item.title} por ${formattedPrice} en Trato 625!`, url: window.location.origin };
        try {
            if (navigator.share) await navigator.share(shareData);
            else {
                await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
                alert("¡Enlace copiado! / Link copied!");
            }
        } catch (err) { console.error(err); }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col w-full">
            <div className="w-full h-56 bg-gray-200 relative">
                <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" loading="lazy" />

                {/* Safe Zone Badge - Bottom Left */}
                {item.safe_zone && (
                    <span className="absolute bottom-3 left-3 bg-green-500/90 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5">
                        📍 Punto Seguro
                    </span>
                )}

                {/* Category Badge - Top Right */}
                {item.category && (
                    <span className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow-sm">
                        {item.category}
                    </span>
                )}
            </div>

            <div className="p-4 flex flex-col flex-grow">
                <div className="flex justify-between items-start">
                    <h3 className="font-bold text-xl text-slate-900 truncate leading-tight pr-2">{item.title}</h3>

                    {/* Verified Seller Badge */}
                    {item.is_verified && (
                        <span className="shrink-0 flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-1 rounded-md border border-blue-100">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                            <span className="text-[10px] font-bold">Verificado</span>
                        </span>
                    )}
                </div>

                <p className="text-blue-600 font-black text-2xl mt-1">{formattedPrice}</p>
                {item.description && <p className="text-sm text-gray-500 mt-2 line-clamp-2 leading-relaxed">{item.description}</p>}

                <div className="flex gap-2 mt-5">
                    <button onClick={handleWhatsAppClick} className="flex-1 bg-[#25D366] hover:bg-[#1DA851] text-white py-2.5 rounded-lg transition-colors flex flex-col items-center justify-center">
                        <span className="font-bold text-sm leading-none">WhatsApp</span>
                        <span className="text-[10px] font-medium text-green-100 mt-1 leading-none">Contact Seller</span>
                    </button>
                    <button onClick={handleShare} className="bg-gray-100 hover:bg-gray-200 text-slate-700 py-2.5 px-6 rounded-lg transition-colors flex flex-col items-center justify-center">
                        <span className="font-bold text-sm leading-none">Compartir</span>
                        <span className="text-[10px] font-medium text-slate-400 mt-1 leading-none">Share</span>
                    </button>
                </div>
            </div>
        </div>
    );
}