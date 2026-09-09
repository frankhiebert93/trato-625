// Pure logic for the inbound WhatsApp bidding bot: command parsing, amount
// parsing, the onboarding/bidding state machine, and the Spanish reply copy.
//
// All I/O (database, Supabase admin auth, the place_bid_for RPC) is injected via
// BotDeps so this module is fully unit-testable without a database or network.
// The webhook route (app/api/whatsapp/route.ts) supplies the real deps.

export type ContactState = 'awaiting_terms' | 'awaiting_name' | 'ready';

export interface Contact {
  phone: string;
  profile_id: string | null;
  state: ContactState;
  display_name: string | null;
  accepted_terms_at: string | null;
  current_lot_id: string | null;
  opted_out: boolean;
}

export interface Lot {
  id: string;
  public_code: string;
  title: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  currency: string;
  status: string;
  current_bid_cents: number | null;
  opening_bid_cents: number;
  bid_count: number;
  ends_at: string | null;
}

export interface BidResult {
  currency: string;
  current_bid_cents: number;
  bid_count: number;
  ends_at: string | null;
  extended: boolean;
  reserve_met: boolean;
}

export type PlaceBidOutcome =
  | { ok: true; result: BidResult }
  | { ok: false; errorMessage: string };

export interface BotDeps {
  termsUrl: string;
  getContact(phone: string): Promise<Contact | null>;
  createContact(
    phone: string,
    init: { state: ContactState; profile_id?: string | null; accepted_terms_at?: string | null },
  ): Promise<Contact>;
  updateContact(phone: string, patch: Partial<Contact>): Promise<void>;
  setOptedOut(phone: string, value: boolean): Promise<void>;
  setCurrentLot(phone: string, lotId: string): Promise<void>;
  findProfileIdByPhone(phone: string): Promise<string | null>;
  provisionBidder(phone: string, name: string): Promise<string>;
  findLotByCode(code: string): Promise<Lot | null>;
  placeBidFor(vehicleId: string, amountCents: number, bidderId: string): Promise<PlaceBidOutcome>;
}

// vehicles.amount columns are int4; a bid above this would overflow in Postgres.
export const MAX_BID_CENTS = 2_000_000_000;

export type Command =
  | { kind: 'accept' }
  | { kind: 'bid'; code: string; amountCents: number | null }
  | { kind: 'status'; code: string }
  | { kind: 'help' }
  | { kind: 'stop' }
  | { kind: 'resubscribe' }
  | { kind: 'text'; raw: string };

const KEYWORDS = /^(ACEPTO|AYUDA|HELP|MENU|MENÚ|BAJA|STOP|CANCELAR|DETENER|ALTA|SUSCRIBIR|PUJA|PUJAR|BID|OFERTA|OFERTAR|ESTADO|STATUS|INFO)$/;

export function normalizeCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[\s-]+/g, '');
}

// Parse a human-typed money amount (pesos/dollars) into integer cents.
// Handles "$180,000", "180000", "180,000.50", "180.000" (EU thousands), "180.50".
export function parseAmountToCents(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().toUpperCase()
    .replace(/MXN|USD|PESOS?|DÓLARES?|DOLARES?|DLLS?|\$/g, '')
    .replace(/\s+/g, '');
  if (!s) return null;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // comma is the decimal (EU)
    } else {
      s = s.replace(/,/g, ''); // comma is the thousands sep (US)
    }
  } else if (hasComma) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (hasDot) {
    // A trailing group of exactly 3 digits is a thousands sep (e.g. 180.000).
    if (/\.\d{3}$/.test(s) && !/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  }

  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const value = parseFloat(s);
  if (!isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  return cents > 0 ? cents : null;
}

export function interpretCommand(body: string): Command {
  const raw = (body ?? '').trim();
  const upper = raw.toUpperCase();

  if (/^ACEPTO\b/.test(upper)) return { kind: 'accept' };
  if (/^(AYUDA|HELP|MENU|MENÚ)\b/.test(upper)) return { kind: 'help' };
  if (/^(BAJA|STOP|CANCELAR|DETENER)\b/.test(upper)) return { kind: 'stop' };
  if (/^(ALTA|SUSCRIBIR)\b/.test(upper)) return { kind: 'resubscribe' };

  const bid = upper.match(/^(?:PUJA|PUJAR|BID|OFERTA|OFERTAR)\s+(\S+)\s+(.+)$/);
  if (bid) return { kind: 'bid', code: normalizeCode(bid[1]), amountCents: parseAmountToCents(bid[2]) };

  const status = upper.match(/^(?:ESTADO|STATUS|INFO)\s+(\S+)$/);
  if (status) return { kind: 'status', code: normalizeCode(status[1]) };

  return { kind: 'text', raw };
}

function cleanName(body: string): string | null {
  const name = (body ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!name) return null;
  if (KEYWORDS.test(name.toUpperCase())) return null; // a keyword isn't a name
  return name;
}

// ---- Reply copy (Spanish) ----

function fmtMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${Math.round(cents / 100)} ${currency}`;
  }
}

function lotLabel(lot: Lot): string {
  if (lot.title && lot.title.trim()) return lot.title.trim();
  return [lot.make, lot.model, lot.year].filter(Boolean).join(' ') || 'el vehículo';
}

function welcomeTerms(termsUrl: string): string {
  const link = termsUrl ? `\nTérminos: ${termsUrl}` : '\nRevisa los Términos y Condiciones en la app.';
  return `¡Bienvenido a Trato 625! 🚗\n\nAquí puedes pujar por WhatsApp. Antes de tu primera puja necesitas aceptar los Términos y Condiciones (las pujas son compromisos en firme).${link}\n\nResponde ACEPTO para continuar.`;
}

function askName(): string {
  return '¿Cuál es tu nombre completo? Lo usamos para el trato si ganas una subasta.';
}

function readyGreeting(name: string): string {
  return `¡Gracias, ${name}! Ya puedes pujar. ✅\n\nPara pujar envía:\nPUJA <código> <monto>\nEjemplo: PUJA T1042 180000\n\nEnvía AYUDA para ver los comandos.`;
}

function helpText(): string {
  return [
    'Comandos de Trato 625:',
    '• PUJA <código> <monto> — pujar (ej. PUJA T1042 180000)',
    '• ESTADO <código> — ver la puja actual',
    '• AYUDA — ver esto',
    '• BAJA — dejar de recibir mensajes',
    '',
    'El código aparece en cada subasta (empieza con T).',
  ].join('\n');
}

function helpHint(): string {
  return 'No entendí tu mensaje. Envía AYUDA para ver los comandos, o PUJA <código> <monto> para pujar.';
}

function lotNotFound(code: string): string {
  return `No encontré una subasta con el código ${code}. Revisa el código (aparece en la publicación de cada vehículo) e intenta de nuevo.`;
}

function statusText(lot: Lot): string {
  const price = lot.current_bid_cents ?? lot.opening_bid_cents;
  const priceLabel = (lot.bid_count > 0 && lot.current_bid_cents != null) ? 'Puja actual' : 'Puja inicial';
  const lines = [
    `${lotLabel(lot)} (${lot.public_code})`,
    `${priceLabel}: ${fmtMoney(price, lot.currency)}`,
    `Pujas: ${lot.bid_count}`,
  ];
  if (lot.status !== 'live') lines.push('Estado: no está activa para pujar.');
  else lines.push(`Para pujar: PUJA ${lot.public_code} <monto>`);
  return lines.join('\n');
}

function bidConfirmed(lot: Lot, r: BidResult): string {
  const parts = [
    `✅ ¡Puja registrada en ${lot.public_code}!`,
    `Vas ganando con ${fmtMoney(r.current_bid_cents, r.currency)}.`,
  ];
  if (r.reserve_met === false) parts.push('(Aún no se alcanza la reserva.)');
  if (r.extended) parts.push('⏱️ La subasta se extendió por una puja de último minuto.');
  parts.push('Te avisamos si alguien te supera.');
  return parts.join('\n');
}

function parseBidErrorCode(message: string): { kind: string; min?: number } {
  const m = message.match(/BID_TOO_LOW\s*min=(\d+)/);
  if (m) return { kind: 'too_low', min: parseInt(m[1], 10) };
  if (message.includes('ALREADY_LEADING')) return { kind: 'already_leading' };
  if (message.includes('SELLER_CANNOT_BID')) return { kind: 'seller' };
  if (message.includes('NOT_LIVE')) return { kind: 'not_live' };
  if (message.includes('ENDED')) return { kind: 'ended' };
  if (message.includes('BANNED')) return { kind: 'banned' };
  if (message.includes('NOT_FOUND')) return { kind: 'not_found' };
  if (message.includes('AUTH_REQUIRED')) return { kind: 'auth' };
  return { kind: 'unknown' };
}

function bidError(message: string, lot: Lot): string {
  const e = parseBidErrorCode(message);
  switch (e.kind) {
    case 'too_low': {
      const min = e.min ?? 0;
      return `Tu puja es muy baja para ${lot.public_code}. La puja mínima ahora es ${fmtMoney(min, lot.currency)}.\nEnvía: PUJA ${lot.public_code} ${Math.ceil(min / 100)}`;
    }
    case 'already_leading':
      return `Ya vas ganando ${lot.public_code} 🎉 Espera a que alguien te supere para volver a pujar.`;
    case 'seller':
      return `No puedes pujar en tu propio vehículo (${lot.public_code}).`;
    case 'not_live':
      return `La subasta ${lot.public_code} no está activa para pujar en este momento.`;
    case 'ended':
      return `La subasta ${lot.public_code} ya terminó.`;
    case 'banned':
      return 'Tu cuenta no puede pujar. Escríbenos si crees que es un error.';
    case 'not_found':
      return lotNotFound(lot.public_code);
    default:
      return 'No pude registrar tu puja. Intenta de nuevo o puja en la app.';
  }
}

async function handleReady(deps: BotDeps, contact: Contact, cmd: Command, phone: string): Promise<string> {
  switch (cmd.kind) {
    case 'help':
      return helpText();
    case 'accept':
      return 'Ya estás registrado. Envía PUJA <código> <monto> para pujar, o AYUDA para ver los comandos.';
    case 'resubscribe':
      return 'Ya estás activo. Envía AYUDA para ver los comandos.';
    case 'stop':
      await deps.setOptedOut(phone, true);
      return 'Listo, no te enviaremos más mensajes por WhatsApp. Envía ALTA para reactivar.';
    case 'status': {
      const lot = await deps.findLotByCode(cmd.code);
      return lot ? statusText(lot) : lotNotFound(cmd.code);
    }
    case 'bid': {
      const lot = await deps.findLotByCode(cmd.code);
      if (!lot) return lotNotFound(cmd.code);
      if (cmd.amountCents == null) {
        return `No entendí el monto. Envía: PUJA ${lot.public_code} <monto>\nEjemplo: PUJA ${lot.public_code} 180000`;
      }
      if (cmd.amountCents > MAX_BID_CENTS) {
        return 'Ese monto es demasiado grande. Verifica la cantidad e intenta de nuevo.';
      }
      if (!contact.profile_id) {
        return 'No pude identificar tu cuenta. Envía AYUDA.';
      }
      await deps.setCurrentLot(phone, lot.id);
      const outcome = await deps.placeBidFor(lot.id, cmd.amountCents, contact.profile_id);
      return outcome.ok ? bidConfirmed(lot, outcome.result) : bidError(outcome.errorMessage, lot);
    }
    case 'text':
    default:
      return helpHint();
  }
}

// Entry point: given the sender's phone and message body, run the state machine
// and return the reply text the webhook should send back.
export async function handleInboundMessage(deps: BotDeps, phone: string, body: string): Promise<string> {
  const cmd = interpretCommand(body);
  let contact = await deps.getContact(phone);

  if (!contact) {
    const existingProfileId = await deps.findProfileIdByPhone(phone);
    if (existingProfileId) {
      // Known app user: their number is their account, so skip onboarding.
      contact = await deps.createContact(phone, { state: 'ready', profile_id: existingProfileId });
    } else {
      await deps.createContact(phone, { state: 'awaiting_terms' });
      return welcomeTerms(deps.termsUrl);
    }
  }

  if (contact.opted_out) {
    if (cmd.kind === 'resubscribe') {
      await deps.setOptedOut(phone, false);
      return '¡Listo! Reactivaste tus mensajes de Trato 625. Envía AYUDA para ver los comandos.';
    }
    return 'Diste de baja tus mensajes. Envía ALTA para reactivar.';
  }

  switch (contact.state) {
    case 'awaiting_terms':
      if (cmd.kind === 'accept') {
        await deps.updateContact(phone, { state: 'awaiting_name', accepted_terms_at: new Date().toISOString() });
        return askName();
      }
      return welcomeTerms(deps.termsUrl);

    case 'awaiting_name': {
      const name = cleanName(body);
      if (!name) return askName();
      const profileId = await deps.provisionBidder(phone, name);
      await deps.updateContact(phone, { state: 'ready', profile_id: profileId, display_name: name });
      return readyGreeting(name);
    }

    case 'ready':
    default:
      return handleReady(deps, contact, cmd, phone);
  }
}
