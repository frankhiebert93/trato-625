'use client';

export default function ListingCard({ item, onClick }: { item: any; onClick: () => void }) {
    const formattedPrice = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.price);

    const images = item.image_urls || [item.image_url];
    const photoCount = images.length;

    return (
        <div onClick={onClick} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col w-full cursor-pointer active:scale-[0.98] transition-transform relative">
            <div className="w-full h-56 bg-gray-200 relative overflow-hidden">
                <img src={images[0]} alt={item.title} className={`w-full h-full object-cover ${item.is_sold ? 'grayscale opacity-80' : ''}`} loading="lazy" />

                {item.is_sold && (
                    <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center pointer-events-none">
                        <div className="bg-red-600 text-white px-8 py-2 transform -rotate-12 border-4 border-red-800 shadow-2xl flex flex-col items-center justify-center">
                            <span className="font-black text-3xl tracking-widest leading-none">VENDIDO</span>
                            <span className="text-[10px] font-bold text-red-200 uppercase tracking-widest leading-none mt-1">Sold</span>
                        </div>
                    </div>
                )}

                {photoCount > 1 && !item.is_sold && (
                    <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold px-2.5 py-1 rounded-md shadow-sm flex items-center gap-1 z-10">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        1/{photoCount}
                    </span>
                )}

                {item.category && !item.is_sold && (
                    <span className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow-sm z-10">
                        {item.category}
                    </span>
                )}
            </div>

            <div className={`p-4 ${item.is_sold ? 'opacity-60 bg-gray-50' : ''}`}>
                <div className="flex justify-between items-start">
                    <h3 className={`font-bold text-lg truncate pr-2 ${item.is_sold ? 'text-gray-500 line-through' : 'text-slate-900'}`}>
                        {item.title}
                    </h3>
                </div>
                <p className={`${item.is_sold ? 'text-gray-400' : 'text-blue-600'} font-black text-xl mt-0.5`}>
                    {formattedPrice}
                </p>

                <div className="mt-2 text-gray-400 flex flex-col">
                    <p className="text-[12px] font-bold leading-tight">
                        {item.is_sold ? 'Ver artículo vendido' : 'Toca para ver detalles →'}
                    </p>
                    <p className="text-[10px] font-medium leading-tight">
                        {item.is_sold ? 'View sold item' : 'Tap to see details →'}
                    </p>
                </div>
            </div>
        </div>
    );
}