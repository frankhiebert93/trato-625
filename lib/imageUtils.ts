import imageCompression from 'browser-image-compression';

export async function compressImage(file: File) {
    const options = {
        maxSizeMB: 0.3, // Compresses to under 300KB
        maxWidthOrHeight: 1080, // Good enough for phone screens
        useWebWorker: true,
    };

    try {
        const compressedFile = await imageCompression(file, options);
        return compressedFile;
    } catch (error) {
        console.error("Compression error:", error);
        throw error;
    }
}