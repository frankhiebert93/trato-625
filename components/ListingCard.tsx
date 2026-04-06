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
            url: window.location.origin,
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
                alert("¡Enlace copiado! / Link copied!");
            }
        } catch (err) {
            console.error("Error sharing:", err);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col w-full">
            <div className="w-full h-56 bg-gray-200 relative">
                <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                {item.category && (
                    <span className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
                        {item.category}
                    </span>
                )}
            </div>

            <div className="p-4 flex flex-col flex-grow">
                <h3 className="font-bold text-xl text-slate-900 truncate leading-tight">{item.title}</h3>
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