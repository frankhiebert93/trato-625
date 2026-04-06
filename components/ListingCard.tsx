'use client';

export default function ListingCard({ item }: { item: any }) {
    const formattedPrice = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
    }).format(item.price);

    const handleWhatsAppClick = () => {
        if (!item.seller_phone) return;
        let cleanPhone = item.seller_phone.replace(/\D/g, '');
        if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone;
        const message = encodeURIComponent(`Hola, me interesa tu ${item.title} en Trato 625.`);
        window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
    };

    const handleShare = async () => {
        const shareData = {
            title: item.title,
            text: `Mira este ${item.title} por ${formattedPrice} en Trato 625!`,
            url: window.location.origin, // Sends them to your main app URL
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                // Fallback for PC browsers
                await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
                alert("Enlace copiado al portapapeles!");
            }
        } catch (err) {
            console.error("Error sharing:", err);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col w-full">
            <div className="w-full h-48 bg-gray-200 relative">
                <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                {/* Category Badge */}
                {item.category && (
                    <span className="absolute top-2 right-2 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded-md">
                        {item.category}
                    </span>
                )}
            </div>

            <div className="p-4 flex flex-col flex-grow">
                <h3 className="font-bold text-lg text-slate-900 truncate">{item.title}</h3>
                <p className="text-blue-600 font-extrabold text-xl mt-1">{formattedPrice}</p>
                {item.description && <p className="text-sm text-gray-500 mt-2 line-clamp-2">{item.description}</p>}

                <div className="flex gap-2 mt-4">
                    <button onClick={handleWhatsAppClick} className="flex-1 bg-[#25D366] hover:bg-[#1DA851] text-white font-bold py-2 rounded-lg text-sm transition-colors">
                        WhatsApp
                    </button>
                    <button onClick={handleShare} className="bg-gray-100 hover:bg-gray-200 text-slate-700 font-bold py-2 px-4 rounded-lg text-sm transition-colors">
                        Compartir
                    </button>
                </div>
            </div>
        </div>
    );
}