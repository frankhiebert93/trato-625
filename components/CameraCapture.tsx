'use client';
import { useState } from 'react';
import { compressImage } from '../lib/imageUtils';
import { supabase } from '../lib/supabase';

export default function PostForm() {
    const [title, setTitle] = useState('');
    const [price, setPrice] = useState('');
    const [description, setDescription] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [debugMsg, setDebugMsg] = useState('Waiting for file...');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // NO ALERTS HERE! We let Safari hand over the file without freezing the thread.
        const selectedFiles = e.target.files;

        if (selectedFiles && selectedFiles.length > 0) {
            setFile(selectedFiles[0]);
            setDebugMsg(`Success: Safari handed over 1 file! (${(selectedFiles[0].size / 1024 / 1024).toFixed(2)} MB)`);
        } else {
            setFile(null);
            setDebugMsg('Error: Safari dropped the file.');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!file || !title || !price) {
            alert('Please fill out the title, price, and take a photo.');
            return;
        }

        setUploading(true);
        setDebugMsg("Step 2: Starting compression...");

        try {
            const compressedImage = await compressImage(file);
            setDebugMsg("Step 3: Uploading to Supabase...");

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
                        image_url: imageUrl
                    }
                ]);

            if (dbError) throw dbError;

            alert('Item successfully posted to Trato 625!');
            setDebugMsg("Done! Item posted.");

            setTitle('');
            setPrice('');
            setDescription('');
            setFile(null);

        } catch (error: any) {
            console.error("Full error:", error);
            alert('Error: ' + (error.message || JSON.stringify(error) || 'Failed to post item.'));
            setDebugMsg("Error occurred. Check alert.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full max-w-md bg-white rounded-xl shadow-lg p-6 space-y-4 text-slate-800">

            {/* --- UGLY TEST SECTION --- */}
            <div className="p-4 border-4 border-red-500 rounded-lg bg-red-50">
                <label className="block font-bold text-red-700 mb-2">
                    Ugly Safari Test Button:
                </label>

                <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full text-black"
                />

                <div className="mt-4 p-3 bg-black text-green-400 font-mono text-sm rounded">
                    <p>State: {file ? file.name : "EMPTY"}</p>
                    <p>Log: {debugMsg}</p>
                </div>
            </div>
            {/* --- END UGLY TEST SECTION --- */}

            <div>
                <label className="block text-sm font-bold mb-1">What are you selling?</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full border rounded-lg p-2 bg-gray-50"
                    required
                />
            </div>

            <div>
                <label className="block text-sm font-bold mb-1">Price (MXN)</label>
                <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full border rounded-lg p-2 bg-gray-50"
                    required
                />
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