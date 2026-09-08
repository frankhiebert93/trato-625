import Link from 'next/link';

const ADMIN_WHATSAPP = '526251191400';
const UPDATED = '7 de septiembre de 2026';

type Section = { h: string; body: string[] };

const SECTIONS: Section[] = [
  {
    h: 'Cómo funciona la subasta',
    body: [
      'Cada vehículo se publica con una hora de cierre y una puja mínima. Para pujar, ofrece al menos el incremento mínimo indicado en la subasta sobre la puja actual — tu puja queda registrada de inmediato y se actualiza en vivo para todos.',
      'El vendedor puede fijar una reserva oculta: un precio mínimo que nadie ve, ni siquiera los demás postores. Mientras la subasta esté abierta solo verás si la reserva ya se alcanzó o no, nunca el monto.',
      'Protección anti-francotirador: si alguien puja en los últimos minutos antes del cierre, la subasta se extiende automáticamente para dar tiempo a que otros respondan. Esto puede repetirse varias veces — la subasta cierra hasta que pase ese periodo sin pujas nuevas.',
      'Al cierre, gana la puja más alta, siempre que iguale o supere la reserva (si el vehículo tiene una). Si no se alcanzó la reserva, la subasta cierra sin ganador.',
    ],
  },
  {
    h: 'Trato 625 es solo el lugar de la subasta',
    body: [
      'Trato 625 pone la plataforma para que compradores y vendedores se encuentren y pujen. No somos dueños de los vehículos, no los inspeccionamos y no somos parte del trato de compraventa.',
      'No procesamos pagos ni garantizamos que el vendedor entregue el vehículo o que el comprador pague. Cualquier disputa se resuelve directamente entre comprador y vendedor.',
    ],
  },
  {
    h: 'Los vehículos se venden como están',
    body: [
      'Todos los vehículos se venden como están, sin garantía de ningún tipo — ni sobre su estado mecánico, kilometraje, historial, papeles o cualquier otra característica descrita en el anuncio.',
      'Es responsabilidad del comprador revisar el vehículo (y sus documentos) antes de pujar. Una vez que ganas una subasta, se considera una compra en firme.',
    ],
  },
  {
    h: 'Pago y entrega',
    body: [
      'Cuando una subasta cierra con ganador, mostramos el contacto del comprador y del vendedor para que se pongan de acuerdo directamente.',
      'El pago, el lugar de entrega y cualquier trámite de traspaso se acuerdan entre las dos partes. Trato 625 no interviene en esa negociación ni es responsable de que se complete.',
    ],
  },
  {
    h: 'Privacidad',
    body: [
      'Para pujar o publicar guardamos solo lo necesario para operar la subasta y ponerte en contacto con la otra parte al cerrar el trato. No vendemos tus datos.',
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-cream pb-20">
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-cream pt-[max(0.875rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-md items-center px-4 pb-2.5">
          <Link
            href="/"
            className="press rounded-full border-2 border-ink bg-card px-3.5 py-1.5 text-[13px] font-extrabold text-ink shadow-hard-sm active:shadow-hard-xs"
          >
            ‹ Volver
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-md p-4">
        <div className="py-2 text-center">
          <h1 className="font-display text-[22px] text-ink">Términos y cómo funciona</h1>
          <p className="mt-1 text-[11px] font-extrabold tracking-[.16em] text-green uppercase">
            Actualizado {UPDATED}
          </p>
        </div>

        <div className="mt-3 rounded-[14px] border-2 border-ink bg-pin p-4">
          <p className="text-[13px] leading-[1.5] font-semibold text-ink">
            Trato 625 es solo el lugar de la subasta. Los vehículos se venden{' '}
            <strong>como están, sin garantía</strong>. El pago y la entrega se acuerdan
            directamente entre comprador y vendedor — Trato 625 no es parte de esa transacción.
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {SECTIONS.map((s, i) => (
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

        <p className="mt-4 text-center text-[12px] font-semibold text-muted">
          Para el detalle completo de qué datos guardamos, consulta el{' '}
          <Link href="/privacidad" className="font-extrabold text-ink underline">
            Aviso de Privacidad
          </Link>
          .
        </p>

        <div className="mt-4 rounded-[14px] border-2 border-ink bg-green px-4 py-3.5 shadow-hard">
          <p className="text-center text-[12px] leading-[1.5] font-extrabold text-card">
            Dudas sobre una subasta
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

        <Link
          href="/"
          className="press mt-4 block w-full rounded-xl border-2 border-ink bg-card p-3 text-center text-[13px] font-extrabold text-ink shadow-hard-sm active:shadow-hard-xs"
        >
          Volver a las subastas
        </Link>
      </div>
    </main>
  );
}
