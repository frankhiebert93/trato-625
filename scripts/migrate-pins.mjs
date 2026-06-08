/**
 * ONE-TIME PIN MIGRATION SCRIPT
 * ─────────────────────────────
 * Finds every listing with a plain-text 4-digit PIN and replaces it
 * with the SHA-256 hash used by the new app code.
 *
 * Run once with:
 *   SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/migrate-pins.mjs
 *
 * Safe to re-run — already-hashed PINs (64-char hex) are skipped.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SALT = 'trato625-cuauhtemoc'; // Must match lib/pinUtils.ts

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  Missing env vars. Run as:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-pins.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(SALT + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function migrate() {
  console.log('🔍  Fetching all listings with a secret_pin...\n');

  const { data: listings, error } = await supabase
    .from('listings')
    .select('id, secret_pin')
    .not('secret_pin', 'is', null);

  if (error) {
    console.error('❌  Failed to fetch listings:', error.message);
    process.exit(1);
  }

  if (!listings.length) {
    console.log('✅  No listings found with a PIN. Nothing to do.');
    return;
  }

  // A SHA-256 hash is always 64 hex characters — skip those already migrated
  const toMigrate = listings.filter(l => l.secret_pin.length !== 64);
  const alreadyDone = listings.length - toMigrate.length;

  console.log(`📋  Total listings with PIN : ${listings.length}`);
  console.log(`⏭️   Already hashed (skip)   : ${alreadyDone}`);
  console.log(`🔄  Need migration           : ${toMigrate.length}\n`);

  if (!toMigrate.length) {
    console.log('✅  All PINs are already hashed. Nothing to do.');
    return;
  }

  let success = 0;
  let failed = 0;

  for (const listing of toMigrate) {
    const hashed = await hashPin(listing.secret_pin);
    const { error: updateError } = await supabase
      .from('listings')
      .update({ secret_pin: hashed })
      .eq('id', listing.id);

    if (updateError) {
      console.error(`  ❌  Failed [${listing.id}]: ${updateError.message}`);
      failed++;
    } else {
      console.log(`  ✅  Migrated [${listing.id}]`);
      success++;
    }
  }

  console.log('\n─────────────────────────────');
  console.log(`✅  Migrated : ${success}`);
  if (failed > 0) console.log(`❌  Failed   : ${failed}`);
  console.log('Done. All PINs are now hashed.\n');
}

migrate();
