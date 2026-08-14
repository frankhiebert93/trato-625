'use client';
import Link from 'next/link';
import { useLang } from '../../lib/usePrefs';

const ADMIN_WHATSAPP = '526251191400';
const UPDATED = '12 de agosto de 2026';
const UPDATED_EN = 'August 12, 2026';

type Section = { h: string; body: string[] };

const ES: Section[] = [
  {
    h: 'Qué información recogemos',
    body: [
      'Cuando publicas un artículo te pedimos: nombre y apellido, número de WhatsApp (10 dígitos), título, precio, categoría, zona, descripción opcional y hasta 5 fotos.',
      'También creas un PIN de 4 dígitos. El PIN no se guarda tal cual: guardamos únicamente una versión cifrada (hash SHA-256) que sirve para comprobar que eres tú al marcar el artículo como vendido.',
      'No pedimos correo electrónico, no creamos cuentas y no pedimos datos de pago. Trato 625 no procesa pagos: el trato lo cierran el comprador y el vendedor directamente.',
    ],
  },
  {
    h: 'Qué se muestra en público',
    body: [
      'Tu número de WhatsApp es visible para cualquier persona que abra tu anuncio. Así funciona el mercado: los compradores te contactan directamente por WhatsApp. Si no quieres que tu número sea público, no publiques.',
      'También son públicos: el título, el precio, la zona, la descripción y las fotos.',
      'Tu nombre y apellido se guardan para uso administrativo y para mostrar quién publica el artículo.',
      'Las fotos y los textos que publicas siguen siendo tuyos. Al publicar nos das permiso para mostrarlos dentro de Trato 625 (en la app y en el sitio web) mientras tu anuncio esté activo, y para mostrarlos en la vista previa cuando compartes el enlace. No los vendemos ni los damos a nadie más. Si eliminas tu anuncio, dejamos de mostrarlos.',
    ],
  },
  {
    h: 'Para qué usamos la información',
    body: [
      'Para publicar tu anuncio y permitir que los compradores te contacten.',
      'Para que puedas marcar tu artículo como vendido con tu PIN.',
      'Para moderar el mercado: revisar reportes y eliminar publicaciones que violen las reglas de la comunidad.',
    ],
  },
  {
    h: 'Dónde se guarda',
    body: [
      'Los anuncios y las fotos se guardan con Supabase. El sitio se aloja en Vercel. Ambos son proveedores externos con servidores fuera de México.',
      'Usamos Vercel Analytics y Speed Insights para medir el uso del sitio de forma agregada, y Sentry para registrar errores técnicos. Estas herramientas no reciben tu PIN.',
      'Toda la conexión con el sitio va cifrada por HTTPS.',
    ],
  },
  {
    h: 'Cuánto tiempo se conserva',
    body: [
      'Los anuncios marcados como vendidos dejan de mostrarse en el mercado 15 días después.',
      'Los administradores pueden eliminar en cualquier momento una publicación que viole las reglas.',
    ],
  },
  {
    h: 'Cómo borrar tu información',
    body: [
      'Escríbenos por WhatsApp al 625 119 1400 con el título de tu anuncio y lo eliminamos, junto con sus fotos.',
      'También puedes pedir que borremos cualquier dato tuyo que conservemos.',
    ],
  },
  {
    h: 'Reportar contenido',
    body: [
      'Cada anuncio tiene un botón "Reportar". Úsalo si ves algo ilegal, ofensivo, fraudulento o que viole las reglas.',
      'Revisamos los reportes y eliminamos las publicaciones que lo ameriten. También puedes bloquear a un vendedor desde su anuncio para dejar de ver sus artículos en este dispositivo.',
    ],
  },
  {
    h: 'Menores de edad',
    body: ['Trato 625 está dirigido a personas adultas. No está pensado para menores de 18 años.'],
  },
];

const EN: Section[] = [
  {
    h: 'What we collect',
    body: [
      'When you post an item we ask for: first and last name, WhatsApp number (10 digits), title, price, category, zone, an optional description, and up to 5 photos.',
      'You also create a 4-digit PIN. The PIN itself is never stored — we keep only a hashed version (SHA-256), used to confirm it is you when marking an item sold.',
      'We do not ask for an email address, we do not create accounts, and we never ask for payment details. Trato 625 does not process payments: buyer and seller close the deal directly.',
    ],
  },
  {
    h: 'What is shown publicly',
    body: [
      'Your WhatsApp number is visible to anyone who opens your listing. That is how the marketplace works — buyers contact you directly on WhatsApp. If you do not want your number public, do not post.',
      'Also public: title, price, zone, description and photos.',
      'Your first and last name are stored for administrative use and to show who posted the item.',
      'The photos and text you post remain yours. By posting, you give us permission to display them inside Trato 625 (in the app and on the website) for as long as your listing is active, and in the link preview when you share it. We do not sell them or pass them to anyone else. If your listing is removed, we stop displaying them.',
    ],
  },
  {
    h: 'How we use it',
    body: [
      'To publish your listing and let buyers reach you.',
      'So you can mark your item as sold using your PIN.',
      'To moderate the marketplace: review reports and remove listings that break the community rules.',
    ],
  },
  {
    h: 'Where it is stored',
    body: [
      'Listings and photos are stored with Supabase. The site is hosted on Vercel. Both are third-party providers with servers outside Mexico.',
      'We use Vercel Analytics and Speed Insights for aggregate usage measurement, and Sentry for technical error logging. None of these receive your PIN.',
      'All traffic to the site is encrypted over HTTPS.',
    ],
  },
  {
    h: 'How long we keep it',
    body: [
      'Listings marked as sold stop appearing in the marketplace 15 days later.',
      'Admins may remove any listing that breaks the rules at any time.',
    ],
  },
  {
    h: 'Deleting your information',
    body: [
      'Message us on WhatsApp at +52 625 119 1400 with your listing title and we will delete it, along with its photos.',
      'You can also ask us to delete any other data we hold about you.',
    ],
  },
  {
    h: 'Reporting content',
    body: [
      'Every listing has a "Report" button. Use it if you see anything illegal, offensive, fraudulent, or against the rules.',
      'We review reports and take listings down where warranted. You can also block a seller from their listing to stop seeing their items on this device.',
    ],
  },
  {
    h: 'Minors',
    body: ['Trato 625 is intended for adults. It is not directed at anyone under 18.'],
  },
];

export default function PrivacyPage() {
  const [lang, toggleLang] = useLang();
  const es = lang === 'es';
  const sections = es ? ES : EN;

  return (
    <main className="min-h-screen bg-cream pb-20">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-cream pt-[max(0.875rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 pb-2.5">
          <Link
            href="/"
            className="press rounded-full border-2 border-ink bg-card px-3.5 py-1.5 text-[13px] font-extrabold text-ink shadow-hard-sm active:shadow-hard-xs"
          >
            ‹ {es ? 'Volver' : 'Back'}
          </Link>
          <button
            onClick={toggleLang}
            className="press rounded-full border-2 border-ink bg-card px-3 py-[5px] text-xs font-extrabold text-ink shadow-hard-sm active:shadow-hard-xs"
          >
            {es ? 'ES · en' : 'EN · es'}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-md p-4">
        <div className="py-2 text-center">
          <h1 className="font-display text-[22px] text-ink">
            {es ? 'Aviso de Privacidad' : 'Privacy Policy'}
          </h1>
          <p className="mt-1 text-[11px] font-extrabold tracking-[.16em] text-green uppercase">
            {es ? `Actualizado ${UPDATED}` : `Updated ${UPDATED_EN}`}
          </p>
        </div>

        <div className="mt-3 rounded-[14px] border-2 border-ink bg-pin p-4">
          <p className="text-[13px] leading-[1.5] font-semibold text-ink">
            {es
              ? 'Trato 625 es un tablero de anuncios local para Cuauhtémoc, Chihuahua. Publicar es gratis y no requiere cuenta. Lo más importante que debes saber: tu número de WhatsApp se muestra en público para que te contacten.'
              : 'Trato 625 is a local classifieds board for Cuauhtémoc, Chihuahua. Posting is free and requires no account. The most important thing to know: your WhatsApp number is shown publicly so buyers can reach you.'}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {sections.map((s, i) => (
            <section key={s.h} className="rounded-[14px] border-2 border-ink bg-card px-4 py-3.5 shadow-hard">
              <div className="flex items-start gap-3.5">
                <span className="flex h-[30px] w-[30px] shrink-0 rotate-[-3deg] items-center justify-center rounded-lg border-2 border-ink bg-yellow font-display text-[13px] text-ink">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-black tracking-[.03em] text-terracotta uppercase">{s.h}</h2>
                  <div className="mt-1.5 flex flex-col gap-2">
                    {s.body.map((p, j) => (
                      <p key={j} className="text-[13px] leading-[1.5] font-semibold text-body-ink">{p}</p>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-4 rounded-[14px] border-2 border-ink bg-green px-4 py-3.5 shadow-hard">
          <p className="text-center text-[12px] leading-[1.5] font-extrabold text-card">
            {es ? 'Dudas o solicitudes de borrado' : 'Questions or deletion requests'}
          </p>
          <a
            href={`https://wa.me/${ADMIN_WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="press mt-2.5 block w-full rounded-xl border-2 border-ink bg-wa p-3 text-center font-display text-[15px] text-card shadow-hard active:shadow-hard-xs"
          >
            WhatsApp · 625 119 1400
          </a>
        </div>
      </div>
    </main>
  );
}
