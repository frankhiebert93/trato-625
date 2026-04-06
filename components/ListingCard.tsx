export default function ListingCard({ item }: { item: any }) {
    // Format the price to look like real currency (MXN)
    const formattedPrice = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
    }).format(item.price);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col w-full">
            {/* Image Section */}
            <div className="w-full h-48 bg-gray-200 relative">
                {/* Using a standard img tag for Phase 1 to avoid config headaches */}
                <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-full object-cover"
                />
            </div>

            {/* Details Section */}
            <div className="p-4 flex flex-col flex-grow">
                <h3 className="font-bold text-lg text-slate-900 truncate">{item.title}</h3>
                <p className="text-blue-600 font-extrabold text-xl mt-1">{formattedPrice}</p>

                {item.description && (
                    <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                        {item.description}
                    </p>
                )}

                {/* WhatsApp Button Placeholder for Phase 3 */}
                <button className="mt-4 w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-lg text-sm transition-colors">
                    Contactar
                </button>
            </div>
        </div>
    );
}