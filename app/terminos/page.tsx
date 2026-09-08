'use client';
import Link from 'next/link';
import { useState } from 'react';

type Lang = 'es' | 'en';
type Section = { h: string; body: string[] };

const EFFECTIVE_ES = 'Vigente a partir de: [fecha]';
const EFFECTIVE_EN = 'Effective: [date]';

const SECTIONS_ES: Section[] = [
  {
    h: 'Aceptación',
    body: [
      'Trato 625 es una plataforma en línea de subastas de vehículos por tiempo determinado. Al usar el sitio o la aplicación — para pujar, publicar un vehículo o simplemente navegar — aceptas estos Términos y Condiciones en su totalidad. Si no estás de acuerdo, no debes usar la plataforma.',
    ],
  },
  {
    h: 'Elegibilidad y cuenta',
    body: [
      'Debes ser mayor de edad para pujar o publicar un vehículo. Para participar verificamos tu número de teléfono; debes proporcionar información veraz y actualizada al crear tu cuenta y al publicar o pujar.',
      'Eres responsable de mantener la confidencialidad de tu cuenta y de toda la actividad que ocurra en ella.',
    ],
  },
  {
    h: 'Naturaleza de la plataforma',
    body: [
      'Trato 625 únicamente provee el espacio virtual que conecta a compradores y vendedores de vehículos. No somos el vendedor, el comprador, un agente, un corredor ni parte del contrato de compraventa entre los usuarios.',
      'Trato 625 nunca toma posesión de los vehículos ni de los fondos de la venta.',
    ],
  },
  {
    h: 'Anuncios y vendedores',
    body: [
      'Los vendedores publican sus vehículos en la plataforma y, al hacerlo, declaran y garantizan que son los dueños del vehículo o que cuentan con autorización legal para venderlo, y que toda la información del anuncio (descripción, fotos, kilometraje, documentación) es veraz y precisa.',
      'Trato 625 revisa los anuncios y puede, a su entera discreción, rechazar, eliminar o cancelar cualquier publicación. Publicar tiene un costo de listado no reembolsable, que se cobra cuando el anuncio es aprobado y publicado.',
    ],
  },
  {
    h: 'Pujas',
    body: [
      'Cada puja es una oferta vinculante e irrevocable de comprar el vehículo por ese monto. Una vez realizada, una puja no puede retirarse.',
      'Cada subasta tiene un incremento mínimo de puja que debes respetar. Al cierre de la subasta, gana la puja más alta, siempre que se haya alcanzado el precio de reserva (si el vehículo tiene uno).',
    ],
  },
  {
    h: 'Precio de reserva',
    body: [
      'Algunos vehículos se publican con un precio de reserva oculto: un monto mínimo que el vendedor está dispuesto a aceptar y que no se muestra a los postores.',
      'Si la puja más alta al cierre de la subasta no alcanza la reserva, el vendedor no está obligado a vender el vehículo.',
    ],
  },
  {
    h: 'Cierre dinámico (anti-francotirador)',
    body: [
      'Para dar a todos los postores una oportunidad justa de responder, una puja realizada en los últimos minutos antes del cierre extiende automáticamente la hora de cierre de la subasta. Esto puede repetirse varias veces; la subasta termina hasta que transcurra ese periodo sin pujas nuevas.',
    ],
  },
  {
    h: 'Cómo se completa la venta',
    body: [
      'Cuando un vehículo se vende, ponemos en contacto al comprador y al vendedor para que acuerden directamente entre ellos el pago, la inspección, la documentación y el traspaso de propiedad, y la recolección o entrega del vehículo.',
      'Trato 625 no participa en esa negociación y no es responsable de garantizar el pago, el título de propiedad, el estado del vehículo ni su entrega.',
    ],
  },
  {
    h: 'Vehículos "tal cual"',
    body: [
      'Todos los vehículos se venden tal cual, en el lugar donde se encuentran y con todas sus fallas ("as-is, where-is"). Las descripciones y fotografías son proporcionadas por los vendedores y Trato 625 no las verifica ni las garantiza.',
      'Es responsabilidad del comprador inspeccionar el vehículo antes de pujar. La plataforma no ofrece garantía de ningún tipo, expresa o implícita, sobre el estado, la calidad o la idoneidad de ningún vehículo.',
    ],
  },
  {
    h: 'Tarifas',
    body: [
      'Los vendedores pagan la tarifa de listado indicada al momento de publicar, procesada a través de Stripe; esta tarifa no es reembolsable una vez que el anuncio está publicado.',
      'Trato 625 no cobra comisión ni prima de comprador a los compradores.',
    ],
  },
  {
    h: 'Conducta prohibida',
    body: [
      'Está prohibido: realizar pujas fraudulentas o ficticias (pujas de "comparsa" para inflar el precio), proporcionar información falsa o engañosa sobre un vehículo o tu identidad, y publicar vehículos robados o con gravámenes o adeudos no revelados.',
      'Cualquier violación puede resultar en la suspensión o cancelación permanente de tu cuenta.',
    ],
  },
  {
    h: 'Limitación de responsabilidad',
    body: [
      'La plataforma se ofrece "tal cual" y "según disponibilidad". En la máxima medida permitida por la ley, Trato 625 no será responsable por disputas, pérdidas, el estado de los vehículos, la falta de pago o la falta de entrega entre usuarios.',
      'Al usar la plataforma, aceptas indemnizar y sacar en paz y a salvo a Trato 625 frente a cualquier reclamo que surja de tus transacciones con otros usuarios.',
    ],
  },
  {
    h: 'Privacidad',
    body: [
      'Recopilamos los datos necesarios para operar la subasta: tu nombre, número de teléfono, y tu actividad de publicaciones y pujas. Usamos esta información para operar la plataforma y para poner en contacto a compradores y vendedores.',
      'Cuando una subasta cierra con ganador, compartimos los datos de contacto del comprador y del vendedor entre sí para que puedan completar la venta. No vendemos tu información a terceros.',
    ],
  },
  {
    h: 'Cambios',
    body: [
      'Podemos actualizar estos Términos y Condiciones en cualquier momento. El uso continuo de la plataforma después de una actualización implica tu aceptación de los términos revisados.',
    ],
  },
  {
    h: 'Ley aplicable',
    body: ['Estos Términos y Condiciones se rigen por las leyes de México.'],
  },
  {
    h: 'Contacto',
    body: ['Si tienes dudas sobre estos Términos y Condiciones, puedes contactarnos a través de Trato 625.'],
  },
];

const SECTIONS_EN: Section[] = [
  {
    h: 'Acceptance',
    body: [
      'Trato 625 is an online, timed vehicle-auction platform. By using the site or app — to bid, list a vehicle, or simply browse — you accept these Terms and Conditions in full. If you do not agree, you should not use the platform.',
    ],
  },
  {
    h: 'Eligibility & account',
    body: [
      'You must be of legal age to bid or list a vehicle. Participation requires phone number verification; you must provide accurate, current information when creating your account and when listing or bidding.',
      'You are responsible for keeping your account secure and for all activity that occurs under it.',
    ],
  },
  {
    h: 'Nature of the platform',
    body: [
      'Trato 625 only provides the venue that connects vehicle buyers and sellers. We are not the seller, the buyer, an agent, a broker, or a party to any sale between users.',
      'Trato 625 never takes possession of the vehicles or of the sale funds.',
    ],
  },
  {
    h: 'Listings & sellers',
    body: [
      'Sellers submit their vehicles to the platform and, in doing so, represent and warrant that they own the vehicle or have legal authority to sell it, and that all information in the listing (description, photos, mileage, documentation) is accurate and truthful.',
      'Trato 625 reviews listings and may, at its sole discretion, reject, remove, or cancel any listing. Listing carries a non-refundable fee, charged when the listing is approved and published.',
    ],
  },
  {
    h: 'Bidding',
    body: [
      "Every bid is a binding, irrevocable offer to purchase the vehicle at that amount. Once placed, a bid cannot be retracted.",
      'Each auction has a minimum bid increment that must be respected. When the auction closes, the highest bid wins, provided the reserve price (if any) has been met.',
    ],
  },
  {
    h: 'Reserve price',
    body: [
      'Some lots are listed with a hidden reserve price: a minimum amount the seller is willing to accept, which is not shown to bidders.',
      'If the highest bid at the close of the auction does not meet the reserve, the seller is not obligated to sell the vehicle.',
    ],
  },
  {
    h: 'Anti-sniping (soft close)',
    body: [
      "To give every bidder a fair chance to respond, a bid placed in the final minutes before closing automatically extends the auction's end time. This can repeat multiple times; the auction ends once that window passes without a new bid.",
    ],
  },
  {
    h: 'Completing the sale',
    body: [
      'When a lot sells, we connect the buyer and seller so they can arrange payment, inspection, documentation and title transfer, and pickup or delivery of the vehicle directly between themselves.',
      'Trato 625 does not take part in that arrangement and is not responsible for, and does not guarantee, payment, title, vehicle condition, or delivery.',
    ],
  },
  {
    h: 'Vehicles sold AS-IS',
    body: [
      'All vehicles are sold AS-IS, WHERE-IS, with all faults. Descriptions and photographs are provided by sellers and are not verified or guaranteed by Trato 625.',
      'Buyers are responsible for inspecting a vehicle before bidding. The platform makes no warranties of any kind, express or implied, regarding the condition, quality, or fitness of any vehicle.',
    ],
  },
  {
    h: 'Fees',
    body: [
      'Sellers pay the listing fee shown at submission, processed through Stripe; this fee is non-refundable once the listing is live.',
      "Trato 625 charges buyers no commission or buyer's premium.",
    ],
  },
  {
    h: 'Prohibited conduct',
    body: [
      'The following is prohibited: fraudulent or fake (shill) bidding, providing false or misleading information about a vehicle or your identity, and listing stolen vehicles or vehicles with undisclosed liens or debts.',
      'Violations may result in suspension or permanent removal from the platform.',
    ],
  },
  {
    h: 'Limitation of liability',
    body: [
      'The platform is provided "as is" and "as available." To the maximum extent permitted by law, Trato 625 is not liable for disputes, losses, vehicle condition, or non-payment or non-delivery between users.',
      'By using the platform, you agree to indemnify and hold Trato 625 harmless against any claim arising from your transactions with other users.',
    ],
  },
  {
    h: 'Privacy',
    body: [
      'We collect the data needed to run the auction: your name, phone number, and your listing and bidding activity. We use this information to operate the platform and to connect buyers and sellers.',
      'When an auction closes with a winner, we share the winning bidder\'s and the seller\'s contact details with each other so they can complete the sale. We do not sell your information to third parties.',
    ],
  },
  {
    h: 'Changes',
    body: [
      'We may update these Terms and Conditions at any time. Continued use of the platform after an update constitutes your acceptance of the revised terms.',
    ],
  },
  {
    h: 'Governing law',
    body: ['These Terms and Conditions are governed by the laws of Mexico.'],
  },
  {
    h: 'Contact',
    body: ['If you have questions about these Terms and Conditions, you can reach us through Trato 625.'],
  },
];

export default function TermsPage() {
  const [lang, setLang] = useState<Lang>('es');
  const es = lang === 'es';
  const sections = es ? SECTIONS_ES : SECTIONS_EN;

  return (
    <main className="min-h-screen bg-cream pb-20">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-cream pt-[max(0.875rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 pb-2.5">
          <Link
            href="/"
            className="press rounded-full border-2 border-ink bg-card px-3.5 py-1.5 text-[13px] font-extrabold text-ink shadow-hard-sm active:shadow-hard-xs"
          >
            ‹ {es ? 'Inicio' : 'Home'}
          </Link>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setLang('es')}
              aria-pressed={es}
              className={`press rounded-full border-2 border-ink px-3 py-[5px] text-xs font-extrabold shadow-hard-sm active:shadow-hard-xs ${
                es ? 'bg-terracotta text-card' : 'bg-card text-ink'
              }`}
            >
              Español
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              aria-pressed={!es}
              className={`press rounded-full border-2 border-ink px-3 py-[5px] text-xs font-extrabold shadow-hard-sm active:shadow-hard-xs ${
                !es ? 'bg-terracotta text-card' : 'bg-card text-ink'
              }`}
            >
              English
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md p-4">
        <div className="py-2 text-center">
          <h1 className="font-display text-[22px] text-ink">
            {es ? 'Términos y Condiciones' : 'Terms & Conditions'}
          </h1>
          <p className="mt-1 text-[11px] font-extrabold tracking-[.16em] text-green uppercase">
            {es ? EFFECTIVE_ES : EFFECTIVE_EN}
          </p>
        </div>

        <div className="mt-3 rounded-[14px] border-2 border-ink bg-pin p-4">
          <p className="text-[13px] leading-[1.5] font-semibold text-ink">
            {es
              ? 'Trato 625 es solo el lugar de la subasta: conectamos compradores y vendedores, pero no somos parte del contrato de compraventa. Las pujas son vinculantes y los vehículos se venden como están.'
              : 'Trato 625 is only the venue for the auction: we connect buyers and sellers, but we are not a party to the sale contract. Bids are binding and vehicles are sold as-is.'}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {sections.map((s, i) => (
            <section
              key={s.h}
              className="rounded-[14px] border-2 border-ink bg-card px-4 py-3.5 shadow-hard"
            >
              <div className="flex items-start gap-3.5">
                <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-yellow font-display text-[12px] text-ink">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-black tracking-[.03em] text-terracotta uppercase">
                    {s.h}
                  </h2>
                  <div className="mt-1.5 flex flex-col gap-2">
                    {s.body.map((p, j) => (
                      <p key={j} className="text-[13px] leading-[1.5] font-semibold text-body-ink">
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        <Link
          href="/"
          className="press mt-4 block w-full rounded-xl border-2 border-ink bg-card p-3 text-center text-[13px] font-extrabold text-ink shadow-hard-sm active:shadow-hard-xs"
        >
          {es ? 'Inicio' : 'Home'}
        </Link>
      </div>
    </main>
  );
}
