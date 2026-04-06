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
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [title, setTitle] = useState('');
    const [price, setPrice] = useState('');
    const [phone, setPhone] = useState('');
    const [category, setCategory] = useState(CATEGORIES[0].val);
    const [description, setDescription] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selected = Array.from(e.target.files);
            if (selected.length > 5) {
                alert('Máximo 5 fotos permitidas. / Max 5 photos allowed.');
                setFiles(selected.slice(0, 5));
            } else {
                setFiles(selected);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // STRICT NAME CHECK
        if (!firstName.trim() || !lastName.trim()) {
            alert('El nombre y apellido son obligatorios. / First and last name are mandatory.');
            return;
        }

        if (files.length === 0 || !title || !price || !phone) {
            alert('Por favor llena los campos requeridos y toma al menos 1 foto.');
            return;
        }

        setUploading(true);

        try {
            const uploadedUrls: string[] = [];

            for (const file of files) {
                const compressedImage = await compressImage(file);
                const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

                const { error: uploadError } = await supabase.storage.from('listings').upload(fileName, compressedImage);
                if (uploadError) throw uploadError;

                const { data: publicUrlData } = supabase.storage.from('listings').getPublicUrl(fileName);
                uploadedUrls.push(publicUrlData.publicUrl);
            }

            const { error: dbError } = await supabase.from('listings').insert([{
                seller_name: `${firstName} ${lastName}`.trim(),
                title,
                price: parseFloat(price),
                description,
                image_url: uploadedUrls[0],
                image_urls: uploadedUrls,
                seller_phone: phone,
                category
            }]);

            if (dbError) throw dbError;

            alert('¡Artículo publicado! / Item successfully posted!');
            setFirstName(''); setLastName(''); setTitle(''); setPrice(''); setPhone('');
            setDescription(''); setCategory(CATEGORIES[0].val); setFiles([]);
        } catch (error: any) {
            alert('Error: ' + (error.message || 'Failed to post item.'));
        } finally {
            setUploading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-md bg-white rounded-xl shadow-lg p-6 space-y-5 text-slate-800">
            <div className="text-center border-b border-gray-100 pb-4 mb-2">
                <h2 className="text-xl font-black text-slate-900">Vender un Artículo</h2>
                <p className="text-sm text-slate-400 font-medium -mt-1">Sell an Item</p>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">Datos Privados / Private Data (Solo Admin)</p>
                <div className="flex gap-3">
                    <div className="flex-1">
                        <input type="text" placeholder="Nombre (Obligatorio)" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full border rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" required />
                    </div>
                    <div className="flex-1">
                        <input type="text" placeholder="Apellido (Obligatorio)" value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full border rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" required />
                    </div>
                </div>
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
                    </label>
                    <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full border rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all" required />
                </div>
                <div className="flex-1">
                    <label className="block mb-1">
                        <span className="text-sm font-bold text-slate-800">WhatsApp</span>
                    </label>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="625..." required />
                </div>
            </div>

            <div>
                <label className="block mb-1">
                    <span className="text-sm font-bold text-slate-800">Categoría</span>
                </label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                    {CATEGORIES.map(cat => <option key={cat.val} value={cat.val}>{cat.es} / {cat.en}</option>)}
                </select>
            </div>

            <div>
                <label className="block mb-1">
                    <span className="text-sm font-bold text-slate-800">Detalles <span className="font-normal text-gray-400">(Opcional)</span></span>
                </label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full border rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none transition-all" rows={2} />
            </div>

            <div className="pt-2">
                <div className="relative flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors overflow-hidden">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center pointer-events-none">
                        <p className="mb-1 text-sm font-bold text-blue-600">
                            {files.length > 0 ? `${files.length} foto(s) lista(s)` : 'Toca para agregar fotos (Max 5)'}
                        </p>
                        {files.length === 0 && <p className="text-xs text-blue-400/80 font-medium">Tap to add photos</p>}
                    </div>
                    <input type="file" accept="image/*" multiple onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
            </div>

            <button type="submit" disabled={uploading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-lg mt-6 disabled:bg-gray-400 transition-all shadow-md flex flex-col items-center justify-center">
                <span className="font-bold text-base leading-none">{uploading ? 'Publicando...' : 'Publicar Artículo'}</span>
                {!uploading && <span className="text-[11px] font-medium text-blue-200 mt-1 leading-none">Post Item</span>}
            </button>
        </form>
    );
}