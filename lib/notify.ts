export type NotifyChannel = 'whatsapp' | 'sms';

// Real SMS (Twilio) / WhatsApp (Cloud API) delivery is wired here once provider keys
// exist (a ship gate). Until then this is a logged no-op so the pipeline is testable.
export async function sendNotification(
  channel: NotifyChannel, toPhone: string, text: string,
): Promise<{ ok: boolean }> {
  const configured = !!process.env.NOTIFY_PROVIDER_KEY;
  if (!configured) {
    console.log(`[notify:stub] ${channel} -> ${toPhone}: ${text}`);
    return { ok: true };
  }
  // TODO(ship): real provider send. Kept behind the env flag on purpose.
  return { ok: true };
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
