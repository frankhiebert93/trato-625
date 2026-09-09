import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  handleInboundMessage,
  type BotDeps,
  type Contact,
  type ContactState,
  type Lot,
  type BidResult,
  type PlaceBidOutcome,
} from '../../../lib/whatsappBot';
import { validateTwilioSignature } from '../../../lib/twilioSignature';

export const runtime = 'nodejs';

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const LOT_COLUMNS =
  'id, public_code, title, make, model, year, currency, status, current_bid_cents, opening_bid_cents, bid_count, ends_at';

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// A TwiML reply. The inbound message opens a 24h session window, so a free-form
// reply is allowed here (no template needed).
function twiml(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(message)}</Message></Response>`;
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

function stripWhatsapp(addr: string): string {
  return (addr ?? '').replace(/^whatsapp:/i, '').trim();
}

function makeDeps(admin: SupabaseClient): BotDeps {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const termsUrl = site ? `${site.replace(/\/$/, '')}/terminos` : '';

  async function findProfileIdByPhone(phone: string): Promise<string | null> {
    const { data } = await admin.from('profiles').select('id').eq('phone', phone).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  }

  return {
    termsUrl,
    findProfileIdByPhone,

    async getContact(phone) {
      const { data } = await admin.from('whatsapp_contacts').select('*').eq('phone', phone).maybeSingle();
      return (data as Contact | null) ?? null;
    },

    async createContact(phone, init) {
      const row = {
        phone,
        state: init.state as ContactState,
        profile_id: init.profile_id ?? null,
        accepted_terms_at: init.accepted_terms_at ?? null,
        opted_out: false,
      };
      const { data, error } = await admin.from('whatsapp_contacts').insert(row).select('*').single();
      if (error) {
        // Lost an insert race — read the row that won.
        const { data: existing } = await admin.from('whatsapp_contacts').select('*').eq('phone', phone).maybeSingle();
        if (existing) return existing as Contact;
        throw error;
      }
      return data as Contact;
    },

    async updateContact(phone, patch) {
      await admin
        .from('whatsapp_contacts')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('phone', phone);
    },

    async setOptedOut(phone, value) {
      await admin
        .from('whatsapp_contacts')
        .update({ opted_out: value, updated_at: new Date().toISOString() })
        .eq('phone', phone);
      // Also steer auction notifications off/on WhatsApp for this member.
      const profileId = await findProfileIdByPhone(phone);
      if (profileId) {
        await admin.from('profiles').update({ notify_channel: value ? 'sms' : 'whatsapp' }).eq('id', profileId);
      }
    },

    async setCurrentLot(phone, lotId) {
      await admin
        .from('whatsapp_contacts')
        .update({ current_lot_id: lotId, updated_at: new Date().toISOString() })
        .eq('phone', phone);
    },

    async provisionBidder(phone, name) {
      const { data, error } = await admin.auth.admin.createUser({ phone, phone_confirm: true });
      let userId = data?.user?.id ?? null;
      if (error || !userId) {
        // Number may already have an account (race / prior signup) — reuse it.
        userId = await findProfileIdByPhone(phone);
        if (!userId) throw error ?? new Error('PROVISION_FAILED');
      }
      // The on_auth_user_created trigger created the profile from the phone;
      // stamp the name and record consent.
      await admin
        .from('profiles')
        .update({ display_name: name, full_name: name, accepted_terms_at: new Date().toISOString() })
        .eq('id', userId);
      return userId;
    },

    async findLotByCode(code) {
      const { data } = await admin.from('vehicles').select(LOT_COLUMNS).eq('public_code', code).maybeSingle();
      return (data as Lot | null) ?? null;
    },

    async placeBidFor(vehicleId, amountCents, bidderId): Promise<PlaceBidOutcome> {
      const { data, error } = await admin.rpc('place_bid_for', {
        p_vehicle_id: vehicleId,
        p_amount_cents: amountCents,
        p_bidder_id: bidderId,
      });
      if (error) return { ok: false, errorMessage: error.message };
      return { ok: true, result: data as unknown as BidResult };
    },
  };
}

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('[whatsapp] TWILIO_AUTH_TOKEN not set; rejecting inbound');
    return new Response('forbidden', { status: 403 });
  }

  const raw = await request.text();
  const form = new URLSearchParams(raw);
  const params: Record<string, string> = {};
  form.forEach((value, key) => { params[key] = value; });

  // Verify the request genuinely came from Twilio before doing anything.
  const signature = request.headers.get('x-twilio-signature') ?? '';
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = request.headers.get('host') ?? '';
  const { pathname } = new URL(request.url);
  const url = process.env.TWILIO_WEBHOOK_URL || `${proto}://${host}${pathname}`;
  if (!validateTwilioSignature(authToken, signature, url, params)) {
    console.error('[whatsapp] invalid Twilio signature');
    return new Response('forbidden', { status: 403 });
  }

  const fromPhone = stripWhatsapp(params['From'] ?? '');
  const body = params['Body'] ?? '';
  if (!fromPhone) return twiml('No pude leer tu número. Intenta de nuevo.');

  const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
  const deps = makeDeps(admin);

  let reply: string;
  try {
    reply = await handleInboundMessage(deps, fromPhone, body);
  } catch (err) {
    console.error('[whatsapp] handler error:', err);
    reply = 'Ocurrió un error. Intenta de nuevo en un momento o puja en la app.';
  }
  return twiml(reply);
}
