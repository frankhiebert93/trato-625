'use client';
import { useState } from 'react';
import { compressImage } from '../lib/imageUtils';
import { supabase } from '../lib/supabase';

const CATEGORIES = [
    { val: 'Vehículos', es: 'Vehículos', en: 'Vehicles' },
    { val: 'Herramientas', es: 'Herramientas', en: 'Tools' },
    { val: 'Electrónica', es: 'Electrónica', en: 'Electronics' },
    { val: 'Hogar', es: 'Hogar', en: 'Home' },
    { val: 'Materiales', es: 'Materiales', en: 'Materials' },
    { val: 'Otros', es: 'Otros', en: 'Others' }
];

export default function PostForm() {
    const [title, setTitle] = useState('');
    const [price, setPrice] = useState('');
    const [phone, setPhone] = useState('');
    const [category, setCategory] = useState(CATEGORIES[0].val);
    const [description, setDescription] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (selectedFiles && selectedFiles.length > 0) {
            setFile(selectedFiles[0]);
        } else {
            setFile(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!file || !title || !price || !phone) {
            alert('Por favor llena todos los campos / Please fill out all fields.');
            return;
        }

        setUploading(true);

        try {
            const compressedImage = await compressImage(file);
            const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

            const { error: uploadError } = await supabase.storage
                .from('listings')
                .upload(fileName, compressedImage);

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
                .from('listings')
                .getPublicUrl(fileName);

            const imageUrl = publicUrlData.publicUrl;

            const { error: dbError } = await supabase
                .from('listings')
                .insert([{
                    title, price: parseFloat(price), description,
                    image_url: imageUrl, seller_phone: phone, category
                }]);

            if (dbError) throw dbError;

            alert('¡Artículo publicado! / Item successfully posted!');

            setTitle(''); setPrice(''); setPhone(''); setDescription('');
            setCategory(CATEGORIES[0].val); setFile(null);

        } catch (error: any) {
            console.error("Full error:", error);
            alert('Error: ' + (error.message || 'Failed to post item.'));
        } finally {
            setUploading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-md bg-white rounded-xl shadow-lg p-6 space-y-5 text-slate-800">

            {/* Dual Language Title */}
            <div className="text-center border-b border-gray-100 pb-4 mb-2">
                <h2 className="text-xl font-black text-slate-900">Vender un Artículo</h2>
                <p className="text-sm text-slate-400 font-medium -mt-1">Sell an Item</p>
            </div>

            <div>
                <label className="block mb-1">
                    <span className="text-sm font-bold text-slate-800">¿Qué estás vendiendo?</span>
                    <span className="block text-xs text-slate-400 font-medium -mt-0.5">What are you selling?</span>
                </label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all" required />
            </div>

            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="block mb-1">
                        <span className="text-sm font-bold text-slate-800">Precio (MXN)</span>
                        <span className="block text-xs text-slate-400 font-medium -mt-0.5">Price</span>
                    </label>
                    <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full border rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all" required />
                </div>
                <div className="flex-1">
                    <label className="block mb-1">
                        <span className="text-sm font-bold text-slate-800">WhatsApp</span>
                        <span className="block text-xs text-slate-400 font-medium -mt-0.5">Phone</span>
                    </label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="625..." required />
                </div>
            </div>

            <div>
                <label className="block mb-1">
                    <span className="text-sm font-bold text-slate-800">Categoría</span>
                    <span className="block text-xs text-slate-400 font-medium -mt-0.5">Category</span>
                </label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                    {CATEGORIES.map(cat => (
                        <option key={cat.val} value={cat.val}>{cat.es} / {cat.en}</option>
                    ))}
                </select>
            </div>

            <div>
                <label className="block mb-1">
                    <span className="text-sm font-bold text-slate-800">Detalles <span className="font-normal text-gray-400">(Opcional)</span></span>
                    <span className="block text-xs text-slate-400 font-medium -mt-0.5">Details <span className="font-normal">(Optional)</span></span>
                </label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all" rows={3} />
            </div>

            <div className="pt-2">
                <div className="relative flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors overflow-hidden">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center pointer-events-none">
                        <p className="mb-1 text-sm font-bold text-blue-600">
                            {file ? file.name : 'Toca para tomar una foto'}
                        </p>
                        {!file && (
                            <p className="text-xs text-blue-400/80 font-medium">Tap to take a photo</p>
                        )}
                    </div>
                    <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
            </div>

            <button type="submit" disabled={uploading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-lg mt-6 disabled:bg-gray-400 transition-all shadow-md flex flex-col items-center justify-center">
                <span className="font-bold text-base leading-none">
                    {uploading ? 'Publicando...' : 'Publicar Artículo'}
                </span>
                {!uploading && <span className="text-[11px] font-medium text-blue-200 mt-1 leading-none">Post Item</span>}
            </button>
        </form>
    );
}