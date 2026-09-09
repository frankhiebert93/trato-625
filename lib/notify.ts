export type NotifyChannel = 'whatsapp' | 'sms';

const TWILIO_BASE = 'https://api.twilio.com/2010-04-01';

// Sends one notification through Twilio (SMS or WhatsApp). Always resolves with
// { ok } and never throws, so the cron dispatch loop can mark a single row failed
// and keep going instead of aborting the whole batch.
//
// WhatsApp reality: our outbid/won/sold/unsold alerts are business-initiated and
// sent OUTSIDE any 24-hour customer-service window, so WhatsApp requires them to
// use a pre-approved Message Template — arbitrary free-form text will not deliver.
// We pick the template by `kind` from env (TWILIO_WA_TEMPLATE_<KIND>, a Twilio
// Content SID `HX...`). When no template is configured for the kind we fall back
// to a plain Body, which only delivers inside the Twilio WhatsApp sandbox or an
// open 24h session — handy for testing before templates are approved. SMS has no
// such restriction; its Body is always the plain text.
export async function sendNotification(
  channel: NotifyChannel,
  toPhone: string,
  text: string,
  kind?: string,
): Promise<{ ok: boolean }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  // Not configured -> logged no-op, so local/dev and tests still exercise the
  // pipeline and, in production, rows simply queue unsent until Twilio is wired.
  if (!accountSid || !authToken) {
    console.log(`[notify:stub] ${channel} -> ${toPhone}: ${text}`);
    return { ok: true };
  }

  const params = new URLSearchParams();
  try {
    if (channel === 'whatsapp') {
      const from = process.env.TWILIO_WHATSAPP_FROM;
      if (!from) {
        console.warn('[notify] TWILIO_WHATSAPP_FROM not set; skipping WhatsApp send');
        return { ok: false };
      }
      params.set('From', `whatsapp:${from}`);
      params.set('To', `whatsapp:${toPhone}`);
      const contentSid = kind
        ? process.env[`TWILIO_WA_TEMPLATE_${kind.toUpperCase()}`]
        : undefined;
      if (contentSid) {
        // Approved template. Our templates carry static Spanish copy (no
        // variables); if a template uses variables, also set ContentVariables
        // to a JSON string like {"1":"..."}.
        params.set('ContentSid', contentSid);
      } else {
        // Sandbox / open-session fallback only (won't deliver business-initiated).
        params.set('Body', text);
      }
    } else {
      // SMS. Prefer a Messaging Service (best Mexico deliverability); else a number.
      const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
      const from = process.env.TWILIO_SMS_FROM;
      if (messagingServiceSid) {
        params.set('MessagingServiceSid', messagingServiceSid);
      } else if (from) {
        params.set('From', from);
      } else {
        console.warn('[notify] no TWILIO_MESSAGING_SERVICE_SID or TWILIO_SMS_FROM; skipping SMS send');
        return { ok: false };
      }
      params.set('To', toPhone);
      params.set('Body', text);
    }

    const res = await fetch(`${TWILIO_BASE}/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[notify] Twilio ${channel} send failed (${res.status}): ${detail}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error(`[notify] Twilio ${channel} send error:`, err);
    return { ok: false };
  }
}

export function messageFor(kind: string): string {
  switch (kind) {
    case 'outbid': return 'Alguien superó tu puja en Trato 625. Entra para volver a pujar.';
    case 'won':    return '¡Ganaste la subasta en Trato 625! Entra para contactar al vendedor.';
    case 'sold':   return 'Tu vehículo se vendió en Trato 625. Entra para contactar al comprador.';
    case 'unsold': return 'Tu subasta terminó sin alcanzar la reserva en Trato 625.';
    default:       return 'Tienes una notificación de Trato 625.';
  }
}
