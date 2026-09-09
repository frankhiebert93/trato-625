// Builds the ready-to-paste WhatsApp Channel post text for a lot event.
//
// WhatsApp Channels have no compliant post API, so we generate the copy and the
// admin pastes it into the Channel. Pure and unit-tested; used by the admin
// dashboard (client) which supplies the bot number and site URL from env.

export type ChannelPostKind = 'new_lot' | 'sold';

export interface ChannelPostVehicle {
  public_code: string | null;
  title: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  currency: string;
  current_bid_cents: number | null;
  opening_bid_cents: number;
  bid_count: number;
}

export interface ChannelPostOpts {
  botNumber?: string; // digits only, e.g. "5215512345678"
  siteUrl?: string;   // e.g. "https://trato625.mx"
}

function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${Math.round(cents / 100)} ${currency}`;
  }
}

function lotLabel(v: ChannelPostVehicle): string {
  if (v.title && v.title.trim()) return v.title.trim();
  return [v.make, v.model, v.year].filter(Boolean).join(' ') || 'Vehículo';
}

function siteLink(siteUrl?: string): string {
  return siteUrl ? siteUrl.replace(/\/$/, '') : '';
}

export function buildChannelPost(
  kind: ChannelPostKind,
  v: ChannelPostVehicle,
  opts: ChannelPostOpts = {},
): string {
  const label = lotLabel(v);
  const code = v.public_code ?? '';
  const site = siteLink(opts.siteUrl);

  if (kind === 'sold') {
    const price = v.current_bid_cents ?? v.opening_bid_cents;
    const bids = `${v.bid_count} ${v.bid_count === 1 ? 'puja' : 'pujas'}`;
    const lines = [
      `✅ VENDIDO — ${label}`,
      `Precio final: ${fmtMoney(price, v.currency)} · ${bids}`,
      '',
      '¡Gracias por participar! Muy pronto más subastas. 🔥',
    ];
    if (site) lines.push(`Ver subastas activas: ${site}/subastas`);
    return lines.join('\n');
  }

  // new_lot
  const lines = [
    `🚗 NUEVA SUBASTA — ${label}`,
    `Puja inicial: ${fmtMoney(v.opening_bid_cents, v.currency)}${code ? ` · código ${code}` : ''}`,
  ];
  if (opts.botNumber && code) {
    const prefill = encodeURIComponent(`PUJA ${code} `);
    lines.push('', 'Puja por WhatsApp 👇', `https://wa.me/${opts.botNumber}?text=${prefill}`);
  } else if (site) {
    lines.push('', `Puja aquí: ${site}/subastas`);
  }
  return lines.join('\n');
}
