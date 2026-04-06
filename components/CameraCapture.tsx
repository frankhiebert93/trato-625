'use client';
import { useState } from 'react';
import { compressImage } from '../lib/imageUtils';
import { supabase } from '../lib/supabase';

export default function PostForm() {
    const [title, setTitle] = useState('');
    const [price, setPrice] = useState('');
    const [description, setDescription] = useState('');
    const [phone, setPhone] = useState(''); // NEW: Phone state
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

        // Check for phone number too now
        if (!file || !title || !price || !phone) {
            alert('Please fill out the title, price, phone number, and take a photo.');
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
                .insert([
                    {
                        title,
                        price: parseFloat(price),
                        description,
                        image_url: imageUrl,
                        seller_phone: phone // NEW: Saving to the column you just created
                    }
                ]);

            if (dbError) throw dbError;

            alert('Item successfully posted to Trato 625!');

            setTitle('');
            setPrice('');
            setDescription('');
            setPhone('');
            setFile(null);

        } catch (error: any) {
            console.error("Full error:", error);
            alert('Error: ' + (error.message || JSON.stringify(error) || 'Failed to post item.'));
        } finally {
            setUploading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-md bg-white rounded-xl shadow-lg p-6 space-y-4 text-slate-800">
            <div>
                <label className="block text-sm font-bold mb-1">What are you selling?</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full border rounded-lg p-2 bg-gray-50"
                    placeholder="e.g. Lincoln Welder 225"
                    required
                />
            </div>

            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="block text-sm font-bold mb-1">Price (MXN)</label>
                    <input
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="w-full border rounded-lg p-2 bg-gray-50"
                        placeholder="0.00"
                        required
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-bold mb-1">WhatsApp</label>
                    <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full border rounded-lg p-2 bg-gray-50"
                        placeholder="625..."
                        required
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-bold mb-1">Details (Optional)</label>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full border rounded-lg p-2 bg-gray-50"
                    placeholder="Condition, location, etc."
                    rows={3}
                />
            </div>

            <div className="pt-2">
                <div className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors overflow-hidden">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center pointer-events-none">
                        <p className="mb-2 text-sm font-bold text-blue-600">
                            {file ? file.name : 'Tap to take a photo'}
                        </p>
                        {!file && (
                            <p className="text-xs text-gray-500">Capture from your camera</p>
                        )}
                    </div>
                    <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={uploading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors mt-4 disabled:bg-gray-400"
            >
                {uploading ? 'Posting to Trato 625...' : 'Post Item'}
            </button>
        </form>
    );
}