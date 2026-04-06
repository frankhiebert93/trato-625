'use client';

export default function ListingCard({ item }: { item: any }) {
    const formattedPrice = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
    }).format(item.price);

    const handleWhatsAppClick = () => {
        if (!item.seller_phone) {
            alert("El vendedor no proporcionó un número para este artículo.");
            return;
        }

        // Strip out any dashes, spaces, or parentheses they typed
        let cleanPhone = item.seller_phone.replace(/\D/g, '');

        // Automatically add Mexico country code if it's a standard 10 digit number
        if (cleanPhone.length === 10) {
            cleanPhone = '52' + cleanPhone;
        }

        // Format the pre-filled text message
        const message = encodeURIComponent(`Hola, me interesa tu ${item.title} en Trato 625.`);

        // Open the WhatsApp app directly
        window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col w-full">
            <div className="w-full h-48 bg-gray-200 relative">
                <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-full object-cover"
                />
            </div>

            <div className="p-4 flex flex-col flex-grow">
                <h3 className="font-bold text-lg text-slate-900 truncate">{item.title}</h3>
                <p className="text-blue-600 font-extrabold text-xl mt-1">{formattedPrice}</p>

                {item.description && (
                    <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                        {item.description}
                    </p>
                )}

                <button
                    onClick={handleWhatsAppClick}
                    className="mt-4 w-full bg-[#25D366] hover:bg-[#1DA851] text-white font-bold py-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                >
                    Contactar por WhatsApp
                </button>
            </div>
        </div>
    );
}