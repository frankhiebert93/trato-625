import { describe, it, expect } from 'vitest';
import { buildChannelPost, type ChannelPostVehicle } from '../lib/channelPost';

const base: ChannelPostVehicle = {
  public_code: 'T1042',
  title: 'Toyota Tacoma 2019',
  make: null, model: null, year: null,
  currency: 'MXN',
  current_bid_cents: null,
  opening_bid_cents: 15_000_000,
  bid_count: 0,
};

describe('buildChannelPost — new_lot', () => {
  it('includes title, opening price, code, and a prefilled wa.me link', () => {
    const text = buildChannelPost('new_lot', base, { botNumber: '5215512345678', siteUrl: 'https://trato625.mx' });
    expect(text).toContain('NUEVA SUBASTA');
    expect(text).toContain('Toyota Tacoma 2019');
    expect(text).toContain('$150,000');
    expect(text).toContain('T1042');
    expect(text).toContain('https://wa.me/5215512345678?text=PUJA%20T1042%20');
  });

  it('falls back to the site link when no bot number is set', () => {
    const text = buildChannelPost('new_lot', base, { siteUrl: 'https://trato625.mx' });
    expect(text).not.toContain('wa.me');
    expect(text).toContain('https://trato625.mx/subastas');
  });

  it('derives a label from make/model/year when there is no title', () => {
    const v: ChannelPostVehicle = { ...base, title: null, make: 'Ford', model: 'Lobo', year: 2020 };
    const text = buildChannelPost('new_lot', v, { botNumber: '52155' });
    expect(text).toContain('Ford Lobo 2020');
  });
});

describe('buildChannelPost — sold', () => {
  it('shows the final price and bid count, no bid link', () => {
    const v: ChannelPostVehicle = { ...base, current_bid_cents: 18_050_000, bid_count: 7 };
    const text = buildChannelPost('sold', v, { botNumber: '5215512345678', siteUrl: 'https://trato625.mx' });
    expect(text).toContain('VENDIDO');
    expect(text).toContain('Toyota Tacoma 2019');
    expect(text).toContain('$180,500');
    expect(text).toContain('7 pujas');
    expect(text).not.toContain('wa.me');
    expect(text).toContain('https://trato625.mx/subastas');
  });

  it('uses singular "puja" for a single bid', () => {
    const v: ChannelPostVehicle = { ...base, current_bid_cents: 15_000_000, bid_count: 1 };
    const text = buildChannelPost('sold', v);
    expect(text).toContain('1 puja');
    expect(text).not.toContain('1 pujas');
  });
});
