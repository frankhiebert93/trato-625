'use client';

export default function ListingCard({ item, onClick }: { item: any; onClick: () => void }) {
    const formattedPrice = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.price);

    const images = item.image_urls || [item.image_url];
    const photoCount = images.length;

    return (
        <div onClick={onClick} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col w-full cursor-pointer active:scale-[0.98] transition-transform">
            <div className="w-full h-56 bg-gray-200 relative">
                <img src={images[0]} alt={item.title} className="w-full h-full object-cover" loading="lazy" />

                {photoCount > 1 && (
                    <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-sm flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        1/{photoCount}
                    </span>
                )}

                {/* Removed Safe Zone badge from here */}

                {item.category && (
                    <span className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow-sm">
                        {item.category}
                    </span>
                )}
            </div>

            <div className="p-4">
                <div className="flex justify-between items-start">
                    <h3 className="font-bold text-lg text-slate-900 truncate pr-2">{item.title}</h3>
                    {item.is_verified && (
                        <span className="shrink-0 flex items-center gap-1 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md border border-blue-100">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                        </span>
                    )}
                </div>
                <p className="text-blue-600 font-black text-xl mt-0.5">{formattedPrice}</p>
                <p className="text-[12px] text-gray-400 font-bold mt-2">Toca para ver detalles →</p>
            </div>
        </div>
    );
}