import crypto from 'crypto';

// Validate an inbound Twilio webhook request's X-Twilio-Signature.
//
// Twilio's scheme for application/x-www-form-urlencoded requests: take the full
// request URL, then append each POST parameter's name and value (no separators),
// sorted by parameter name; HMAC-SHA1 that string with the account Auth Token and
// base64-encode it. See https://www.twilio.com/docs/usage/security#validating-requests
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!authToken || !signature) return false;

  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
