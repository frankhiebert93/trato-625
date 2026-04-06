import PostForm from '../components/CameraCapture';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-6 bg-gray-100">
      <div className="text-center mb-8 mt-4">
        <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Trato 625</h1>
        <p className="text-slate-600 font-medium">Mercado Local Cuauhtémoc</p>
      </div>

      <PostForm />
    </main>
  );
}