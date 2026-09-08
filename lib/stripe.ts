import Stripe from 'stripe';

// Server-only. Never import this into a client component.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-08-26.dahlia',
});
