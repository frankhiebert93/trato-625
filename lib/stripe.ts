import Stripe from 'stripe';

// Server-only. Never import this into a client component.
//
// The client is created lazily: constructing `new Stripe(...)` eagerly at module
// load throws ("Neither apiKey nor config.authenticator provided") whenever
// STRIPE_SECRET_KEY is absent — which happens during `next build` page-data
// collection in any environment that doesn't expose the key (e.g. a Vercel
// Preview without it). Deferring construction until first use keeps importing
// this module side-effect-free, so the build never fails on a missing key; a
// key is only required when a request actually calls Stripe at runtime.

const API_VERSION = '2026-08-26.dahlia';

let client: Stripe | null = null;

function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    client = new Stripe(key, { apiVersion: API_VERSION });
  }
  return client;
}

// A lazy proxy so existing call sites keep using `stripe.checkout.sessions…`,
// `stripe.webhooks.…`, `stripe.paymentIntents.…` unchanged. Property access is
// what triggers construction, not the import.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getStripe() as object, prop, receiver);
    return typeof value === 'function' ? value.bind(getStripe()) : value;
  },
});
