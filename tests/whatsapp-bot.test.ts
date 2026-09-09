import { describe, it, expect } from 'vitest';
import {
  interpretCommand,
  parseAmountToCents,
  normalizeCode,
  handleInboundMessage,
  type BotDeps,
  type Contact,
  type Lot,
  type PlaceBidOutcome,
} from '../lib/whatsappBot';

// ─────────────────────────── pure parsing ───────────────────────────
describe('parseAmountToCents', () => {
  it('parses plain and formatted pesos into cents', () => {
    expect(parseAmountToCents('180000')).toBe(18_000_000);
    expect(parseAmountToCents('180,000')).toBe(18_000_000);
    expect(parseAmountToCents('$180,000')).toBe(18_000_000);
    expect(parseAmountToCents('180000 MXN')).toBe(18_000_000);
    expect(parseAmountToCents('180.000')).toBe(18_000_000); // EU thousands
  });
  it('handles decimals', () => {
    expect(parseAmountToCents('1800.50')).toBe(180_050);
    expect(parseAmountToCents('180,000.50')).toBe(18_000_050); // US
    expect(parseAmountToCents('180.000,50')).toBe(18_000_050); // EU
  });
  it('rejects junk and non-positive', () => {
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('0')).toBeNull();
  });
});

describe('interpretCommand', () => {
  it('recognizes ACEPTO', () => {
    expect(interpretCommand('acepto').kind).toBe('accept');
    expect(interpretCommand('ACEPTO los términos').kind).toBe('accept');
  });
  it('parses a bid with code + amount', () => {
    expect(interpretCommand('PUJA T1042 180000')).toEqual({ kind: 'bid', code: 'T1042', amountCents: 18_000_000 });
    expect(interpretCommand('puja t-1042 180,000')).toEqual({ kind: 'bid', code: 'T1042', amountCents: 18_000_000 });
    expect(interpretCommand('BID T1042 180000').kind).toBe('bid');
  });
  it('parses status, help, stop, resubscribe', () => {
    expect(interpretCommand('ESTADO T1042')).toEqual({ kind: 'status', code: 'T1042' });
    expect(interpretCommand('ayuda').kind).toBe('help');
    expect(interpretCommand('BAJA').kind).toBe('stop');
    expect(interpretCommand('ALTA').kind).toBe('resubscribe');
  });
  it('falls back to text', () => {
    expect(interpretCommand('Juan Pérez')).toEqual({ kind: 'text', raw: 'Juan Pérez' });
  });
});

describe('normalizeCode', () => {
  it('uppercases and strips spaces/dashes', () => {
    expect(normalizeCode('t-1042')).toBe('T1042');
    expect(normalizeCode('T 1042')).toBe('T1042');
  });
});

// ─────────────────── state machine with in-memory deps ───────────────────
function makeFakeDeps(overrides: Partial<BotDeps> = {}): {
  deps: BotDeps;
  contacts: Map<string, Contact>;
  bids: Array<{ vehicleId: string; amountCents: number; bidderId: string }>;
} {
  const contacts = new Map<string, Contact>();
  const bids: Array<{ vehicleId: string; amountCents: number; bidderId: string }> = [];
  const lot: Lot = {
    id: 'lot-1', public_code: 'T1042', title: 'Toyota Tacoma', make: null, model: null, year: null,
    currency: 'MXN', status: 'live', current_bid_cents: null, opening_bid_cents: 10_000_000, bid_count: 0, ends_at: null,
  };

  const deps: BotDeps = {
    termsUrl: 'https://trato625.example/terminos',
    async getContact(phone) { return contacts.get(phone) ?? null; },
    async createContact(phone, init) {
      const c: Contact = {
        phone, profile_id: init.profile_id ?? null, state: init.state,
        display_name: null, accepted_terms_at: init.accepted_terms_at ?? null,
        current_lot_id: null, opted_out: false,
      };
      contacts.set(phone, c);
      return c;
    },
    async updateContact(phone, patch) {
      const c = contacts.get(phone); if (c) contacts.set(phone, { ...c, ...patch });
    },
    async setOptedOut(phone, value) {
      const c = contacts.get(phone); if (c) contacts.set(phone, { ...c, opted_out: value });
    },
    async setCurrentLot(phone, lotId) {
      const c = contacts.get(phone); if (c) contacts.set(phone, { ...c, current_lot_id: lotId });
    },
    async findProfileIdByPhone() { return null; },
    async provisionBidder(phone) { return `profile-${phone}`; },
    async findLotByCode(code) { return code === lot.public_code ? lot : null; },
    async placeBidFor(vehicleId, amountCents, bidderId): Promise<PlaceBidOutcome> {
      bids.push({ vehicleId, amountCents, bidderId });
      return { ok: true, result: { currency: 'MXN', current_bid_cents: amountCents, bid_count: 1, ends_at: null, extended: false, reserve_met: true } };
    },
    ...overrides,
  };
  return { deps, contacts, bids };
}

describe('handleInboundMessage — onboarding + bidding', () => {
  it('walks a new number through terms → name → ready → bid', async () => {
    const { deps, contacts, bids } = makeFakeDeps();
    const phone = '+5215500000001';

    const r1 = await handleInboundMessage(deps, phone, 'hola');
    expect(r1).toMatch(/ACEPTO/);
    expect(contacts.get(phone)?.state).toBe('awaiting_terms');

    const r2 = await handleInboundMessage(deps, phone, 'ACEPTO');
    expect(r2).toMatch(/nombre/i);
    expect(contacts.get(phone)?.state).toBe('awaiting_name');
    expect(contacts.get(phone)?.accepted_terms_at).toBeTruthy();

    const r3 = await handleInboundMessage(deps, phone, 'Juan Pérez');
    expect(r3).toMatch(/Juan/);
    expect(contacts.get(phone)?.state).toBe('ready');
    expect(contacts.get(phone)?.profile_id).toBe(`profile-${phone}`);

    const r4 = await handleInboundMessage(deps, phone, 'PUJA T1042 180000');
    expect(r4).toMatch(/registrada/i);
    expect(bids).toHaveLength(1);
    expect(bids[0]).toMatchObject({ vehicleId: 'lot-1', amountCents: 18_000_000, bidderId: `profile-${phone}` });
  });

  it('re-prompts terms until ACEPTO', async () => {
    const { deps } = makeFakeDeps();
    const phone = '+5215500000002';
    await handleInboundMessage(deps, phone, 'hola');
    const r = await handleInboundMessage(deps, phone, 'no gracias');
    expect(r).toMatch(/ACEPTO/);
  });

  it('short-circuits onboarding for an existing app user', async () => {
    const { deps, bids } = makeFakeDeps({ async findProfileIdByPhone() { return 'existing-profile'; } });
    const phone = '+5215500000003';
    const r = await handleInboundMessage(deps, phone, 'PUJA T1042 200000');
    expect(r).toMatch(/registrada/i);
    expect(bids[0]).toMatchObject({ bidderId: 'existing-profile' });
  });

  it('maps a too-low bid error to a helpful Spanish reply', async () => {
    const { deps } = makeFakeDeps({
      async findProfileIdByPhone() { return 'existing-profile'; },
      async placeBidFor(): Promise<PlaceBidOutcome> {
        return { ok: false, errorMessage: 'BID_TOO_LOW min=10500000' };
      },
    });
    const phone = '+5215500000004';
    const r = await handleInboundMessage(deps, phone, 'PUJA T1042 100');
    expect(r).toMatch(/muy baja/i);
    expect(r).toMatch(/PUJA T1042/);
  });

  it('reports an unknown lot code', async () => {
    const { deps } = makeFakeDeps({ async findProfileIdByPhone() { return 'p'; } });
    const phone = '+5215500000005';
    const r = await handleInboundMessage(deps, phone, 'PUJA T9999 100000');
    expect(r).toMatch(/no encontré/i);
  });

  it('honors STOP and reactivation', async () => {
    const { deps, contacts } = makeFakeDeps({ async findProfileIdByPhone() { return 'p'; } });
    const phone = '+5215500000006';
    await handleInboundMessage(deps, phone, 'AYUDA');          // creates ready contact
    await handleInboundMessage(deps, phone, 'BAJA');
    expect(contacts.get(phone)?.opted_out).toBe(true);
    const blocked = await handleInboundMessage(deps, phone, 'PUJA T1042 180000');
    expect(blocked).toMatch(/baja/i);
    const back = await handleInboundMessage(deps, phone, 'ALTA');
    expect(back).toMatch(/reactiv/i);
    expect(contacts.get(phone)?.opted_out).toBe(false);
  });
});
