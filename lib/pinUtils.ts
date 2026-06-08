// Hashes a 4-digit PIN using SHA-256 + app-level salt.
// Used both when saving a listing and when verifying "mark as sold".
const SALT = 'trato625-cuauhtemoc';

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(SALT + pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
