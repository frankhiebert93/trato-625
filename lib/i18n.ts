// ES/EN chrome copy. The first block of keys is lifted verbatim from the
// design prototype's `T` object; the rest covers screens the prototype didn't
// draw (alerts, install instructions, sponsor slot, sort filters).
// Listing content itself is never translated — it stays as the seller posted it.

export type Lang = 'es' | 'en';

const es = {
  // --- verbatim from the prototype ---
  tagline: 'El mercado local de Cuauhtémoc',
  search: 'Buscar en el 625...',
  zone: '📍 Zona:',
  sat: 'SÁB',
  eventKicker: 'Venta de Yarda',
  items: 'artículos',
  eventCta: 'Ver todo',
  sold: 'VENDIDO',
  loadMore: 'Cargar más',
  navMarket: 'Mercado',
  navSell: 'Vender',
  navRules: 'Reglas',
  back: 'Atrás',
  verified: 'Local',
  seeMore: 'Ver más',
  details: 'Detalles',
  makeOffer: 'Hacer una oferta',
  offerNote: 'Tu oferta se envía por WhatsApp — el trato lo cierran ustedes.',
  sellerQ: '¿Eres el vendedor?',
  boost: 'Dar un Boost — $20 MXN',
  markSold: 'Marcar como Vendido',
  pinConfirm: 'Ingresa tu PIN secreto de 4 dígitos para confirmar la venta.',
  confirmSale: 'Confirmar Venta',
  cancel: 'Cancelar',
  itemSold: 'Artículo Vendido',
  share: 'Compartir',
  full: 'Lo quiero',
  sellTitle: 'Vender un Artículo',
  sellSub: 'Gratis · 2 minutos',
  firstName: 'Nombre',
  lastName: 'Apellido',
  whatSelling: '¿Qué estás vendiendo?',
  price: 'Precio (MXN)',
  category: 'Categoría',
  zoneLabel: 'Zona',
  pinTitle: 'PIN de Seguridad (4 dígitos)',
  pinHelp: 'Crea un PIN secreto para marcar esto como "Vendido" después. Anótalo bien.',
  addPhotos: 'Toca para agregar fotos',
  maxPhotos: 'Máximo 5 · la primera es la portada',
  agree: 'He leído y acepto las Reglas de la Comunidad.',
  publish: 'PUBLICAR ARTÍCULO',
  rulesTitle: 'Reglas de la Comunidad',
  rulesSub: 'Así cuidamos el mercado',
  adminNote: 'Los administradores pueden eliminar cualquier publicación que viole estas reglas.',
  eventDesc: 'Vendemos de todo antes de la mudanza: muebles, herramienta, ropa de niños y más. Todo debe salir.',
  eventPreview: 'vista previa',
  eventAsk: 'Preguntar por WhatsApp',
  hrs: 'h',

  // --- app-only additions ---
  allZones: 'Todas',
  layoutList: 'LISTA',
  layoutGrid: 'GRID',
  loading: 'Cargando...',
  publishing: 'Publicando...',
  verifying: 'Verificando...',
  noResults: 'No se encontraron artículos.',
  noResultsHint: 'Prueba con otra búsqueda, categoría o zona.',
  noDescription: 'Sin descripción.',
  close: 'Cerrar',
  onlyAvailable: 'Solo disponibles',
  sortRecent: 'Más recientes',
  sortPriceAsc: 'Menor precio',
  sortPriceDesc: 'Mayor precio',
  sponsor: 'Patrocinador',
  sponsorCta: 'Ver Oferta →',
  privateData: 'Datos privados · solo admin',
  detailsOptional: 'Detalles (opcional)',
  photosReady: 'foto(s) lista(s)',
  waitSeconds: 'Espera',
  memberSince: 'miembro desde',
  sales: 'ventas',
  newSeller: 'Vendedor nuevo',
  dropPrefix: '¡Bajó',
  minutesAgo: 'hace un momento',
  daysShort: 'd',
  installTitle: '📲 Instalar la App',
  installBody: 'Agrega Trato 625 a tu pantalla de inicio para acceso rápido.',
  installIphone: '🍎 iPhone (Safari)',
  installIphoneBody: 'Toca el botón de compartir (cuadro con flecha) y selecciona "Agregar a la pantalla de inicio".',
  installAndroid: '🤖 Android (Chrome)',
  installAndroidBody: 'Toca el letrero de "Instalar aplicación" abajo, o abre el menú (3 puntos) y selecciona "Agregar a la pantalla principal".',

  // safety / moderation
  report: 'Reportar',
  reportTitle: '¿Por qué reportas este artículo?',
  reportDetails: 'Cuéntanos más (opcional)',
  reportSend: 'Enviar reporte',
  reportSending: 'Enviando...',
  reportThanks: 'Gracias. Un administrador revisará este artículo.',
  reportError: 'No se pudo enviar el reporte. Intenta de nuevo.',
  reportPickReason: 'Elige un motivo.',
  blockSeller: 'Bloquear a este vendedor',
  blockConfirm: '¿Ocultar todos los artículos de este vendedor? Solo afecta a este dispositivo.',
  blockedOne: 'vendedor bloqueado',
  blockedMany: 'vendedores bloqueados',
  showAll: 'Mostrar todos',
  privacyTitle: 'Aviso de Privacidad',
  privacyLink: 'Leer el Aviso de Privacidad',
  moderationNote: 'Revisamos los reportes y eliminamos publicaciones que violen las reglas.',

  // alerts
  alertPin4: 'El PIN debe ser de 4 dígitos.',
  alertPinWrong: '❌ El PIN es incorrecto. Intenta de nuevo.',
  alertConnection: 'Hubo un error de conexión al servidor.',
  alertSoldOk: '¡Felicidades por tu venta! El artículo ha sido marcado como vendido.',
  alertNameRequired: 'El nombre y apellido son obligatorios.',
  alertTitleShort: 'El título es muy corto. Escribe al menos 4 letras.',
  alertPhone10: 'El número de WhatsApp debe tener exactamente 10 dígitos.',
  alertPinCreate: 'El PIN de seguridad debe tener exactamente 4 dígitos.',
  alertAgree: 'Debes aceptar las reglas de la comunidad para publicar.',
  alertRequired: 'Por favor llena los campos requeridos y toma al menos 1 foto.',
  alertMaxPhotos: 'Máximo 5 fotos permitidas.',
  alertOnlyImages: 'Solo se permiten imágenes (JPG, PNG, WEBP, HEIC).',
  alertPosted: '¡Artículo publicado!',
  alertCooldownPrefix: 'Por favor espera',
  alertCooldownSuffix: 'segundos antes de publicar.',
  alertLinkCopied: '¡Enlace copiado!',
};

export type Strings = typeof es;

const en: Strings = {
  // --- verbatim from the prototype ---
  tagline: "Cuauhtémoc's local marketplace",
  search: 'Search the 625...',
  zone: '📍 Zone:',
  sat: 'SAT',
  eventKicker: 'Yard Sale',
  items: 'items',
  eventCta: 'See all',
  sold: 'SOLD',
  loadMore: 'Load more',
  navMarket: 'Market',
  navSell: 'Sell',
  navRules: 'Rules',
  back: 'Back',
  verified: 'Local',
  seeMore: 'See more',
  details: 'Details',
  makeOffer: 'Make an offer',
  offerNote: 'Your offer is sent via WhatsApp — you close the deal together.',
  sellerQ: 'Are you the seller?',
  boost: 'Boost it — $20 MXN',
  markSold: 'Mark as Sold',
  pinConfirm: 'Enter your secret 4-digit PIN to confirm the sale.',
  confirmSale: 'Confirm Sale',
  cancel: 'Cancel',
  itemSold: 'Item Sold',
  share: 'Share',
  full: 'I want it',
  sellTitle: 'Sell an Item',
  sellSub: 'Free · 2 minutes',
  firstName: 'First name',
  lastName: 'Last name',
  whatSelling: 'What are you selling?',
  price: 'Price (MXN)',
  category: 'Category',
  zoneLabel: 'Zone',
  pinTitle: 'Security PIN (4 digits)',
  pinHelp: 'Create a secret PIN to mark this as "Sold" later. Write it down.',
  addPhotos: 'Tap to add photos',
  maxPhotos: 'Max 5 · first one is the cover',
  agree: 'I have read and accept the Community Rules.',
  publish: 'POST ITEM',
  rulesTitle: 'Community Rules',
  rulesSub: 'How we keep the market clean',
  adminNote: 'Admins may remove any listing that breaks these rules.',
  eventDesc: "Selling everything before we move: furniture, tools, kids' clothes and more. Everything must go.",
  eventPreview: 'preview',
  eventAsk: 'Ask on WhatsApp',
  hrs: 'h',

  // --- app-only additions ---
  allZones: 'All',
  layoutList: 'LIST',
  layoutGrid: 'GRID',
  loading: 'Loading...',
  publishing: 'Posting...',
  verifying: 'Verifying...',
  noResults: 'No items found.',
  noResultsHint: 'Try another search, category or zone.',
  noDescription: 'No description.',
  close: 'Close',
  onlyAvailable: 'Available only',
  sortRecent: 'Most recent',
  sortPriceAsc: 'Lowest price',
  sortPriceDesc: 'Highest price',
  sponsor: 'Sponsor',
  sponsorCta: 'See Offer →',
  privateData: 'Private data · admin only',
  detailsOptional: 'Details (optional)',
  photosReady: 'photo(s) ready',
  waitSeconds: 'Wait',
  memberSince: 'member since',
  sales: 'sales',
  newSeller: 'New seller',
  dropPrefix: 'Dropped',
  minutesAgo: 'just now',
  daysShort: 'd',
  installTitle: '📲 Install the App',
  installBody: 'Add Trato 625 to your home screen for quick access.',
  installIphone: '🍎 iPhone (Safari)',
  installIphoneBody: 'Tap the share button (square with arrow) and select "Add to Home Screen".',
  installAndroid: '🤖 Android (Chrome)',
  installAndroidBody: 'Tap the "Install app" banner, or open the menu (3 dots) and select "Add to Home screen".',

  // safety / moderation
  report: 'Report',
  reportTitle: 'Why are you reporting this item?',
  reportDetails: 'Tell us more (optional)',
  reportSend: 'Send report',
  reportSending: 'Sending...',
  reportThanks: 'Thanks. An admin will review this listing.',
  reportError: "Couldn't send the report. Please try again.",
  reportPickReason: 'Pick a reason.',
  blockSeller: 'Block this seller',
  blockConfirm: 'Hide every listing from this seller? This only affects this device.',
  blockedOne: 'seller blocked',
  blockedMany: 'sellers blocked',
  showAll: 'Show all',
  privacyTitle: 'Privacy Policy',
  privacyLink: 'Read the Privacy Policy',
  moderationNote: 'We review reports and remove listings that break the rules.',

  // alerts
  alertPin4: 'PIN must be 4 digits.',
  alertPinWrong: '❌ Wrong PIN. Try again.',
  alertConnection: 'There was a connection error.',
  alertSoldOk: 'Congratulations on your sale! The item is now marked as sold.',
  alertNameRequired: 'First and last name are mandatory.',
  alertTitleShort: 'Title is too short. Use at least 4 letters.',
  alertPhone10: 'The WhatsApp number must be exactly 10 digits.',
  alertPinCreate: 'The security PIN must be exactly 4 digits.',
  alertAgree: 'You must accept the community rules to post.',
  alertRequired: 'Please fill the required fields and add at least 1 photo.',
  alertMaxPhotos: 'Max 5 photos allowed.',
  alertOnlyImages: 'Only image files are allowed (JPG, PNG, WEBP, HEIC).',
  alertPosted: 'Item successfully posted!',
  alertCooldownPrefix: 'Please wait',
  alertCooldownSuffix: 'seconds before posting.',
  alertLinkCopied: 'Link copied!',
};

export const T: Record<Lang, Strings> = { es, en };

// Rules copy — condensed per the prototype.
export const RULES: Record<Lang, { num: string; title: string; body: string }[]> = {
  es: [
    { num: '1', title: 'Solo comercio local', body: 'Trato 625 es estrictamente para artículos en Cuauhtémoc y sus alrededores. Publicaciones de fuera se eliminan.' },
    { num: '2', title: 'Artículos prohibidos', body: 'Cero tolerancia a artículos ilegales, armas de fuego, drogas o contenido explícito. Bloqueo permanente.' },
    { num: '3', title: 'Respeto mutuo', body: 'Sé honesto con las descripciones y respetuoso al contactar. Evita el spam.' },
    { num: '4', title: 'Marca tus ventas', body: 'Cuando vendas, usa tu PIN Secreto para marcar "VENDIDO" y que dejen de contactarte.' },
  ],
  en: [
    { num: '1', title: 'Local trade only', body: 'Trato 625 is strictly for items in Cuauhtémoc and surrounding areas. Non-local listings get removed.' },
    { num: '2', title: 'Prohibited items', body: 'Zero tolerance for illegal items, firearms, drugs, or explicit content. Permanent ban.' },
    { num: '3', title: 'Mutual respect', body: 'Be honest with descriptions and respectful when contacting. No spam.' },
    { num: '4', title: 'Mark your sales', body: 'When your item sells, use your Secret PIN to mark it "SOLD" so people stop contacting you.' },
  ],
};

// Report reasons. `val` is stored in the DB and never translated, so the admin
// queue reads consistently no matter which language the reporter used.
export const REPORT_REASONS: { val: string; es: string; en: string }[] = [
  { val: 'prohibited', es: 'Artículo prohibido', en: 'Prohibited item' },
  { val: 'scam', es: 'Fraude o estafa', en: 'Scam or fraud' },
  { val: 'offensive', es: 'Contenido ofensivo', en: 'Offensive content' },
  { val: 'spam', es: 'Spam o duplicado', en: 'Spam or duplicate' },
  { val: 'false_info', es: 'Información falsa', en: 'False information' },
  { val: 'other', es: 'Otro', en: 'Other' },
];

// Category values are stored in Spanish in the DB; only the label switches.
export const CATEGORIES: { val: string; es: string; en: string }[] = [
  { val: 'Todos', es: 'Todos', en: 'All' },
  { val: 'Vehículos', es: 'Vehículos', en: 'Vehicles' },
  { val: 'Herramientas', es: 'Herramientas', en: 'Tools' },
  { val: 'Electrónica', es: 'Electrónica', en: 'Electronics' },
  { val: 'Hogar', es: 'Hogar', en: 'Home' },
  { val: 'Materiales', es: 'Materiales', en: 'Materials' },
  { val: 'Otros', es: 'Otros', en: 'Others' },
];

// Zones are stored verbatim in `listings.location`.
export const ALL_ZONES = 'Todas';
export const ZONES = ['Centro', 'Campo 2B', 'Campo 6½', 'Col. Obregón', 'Km 15'];

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export function fmtPrice(n: number | string | null | undefined): string {
  const value = typeof n === 'string' ? parseFloat(n) : n;
  if (value == null || Number.isNaN(value)) return '';
  return MXN.format(value);
}

/** "hace 5 h" / "5h ago", falling back to days past 24 hours. */
export function timeAgo(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '';
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return T[lang].minutesAgo;
  if (hours < 24) return lang === 'es' ? `hace ${hours} h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return lang === 'es' ? `hace ${days} d` : `${days}d ago`;
}

/** "08:00" from a <input type="time"> renders as "8:00" per the design copy. */
export function fmtTime(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/^0(\d:)/, '$1');
}

/** Percent off, only when an old price is genuinely higher. */
export function dropPercent(price: number, oldPrice: number | null | undefined): number | null {
  if (!oldPrice || oldPrice <= price) return null;
  const pct = Math.round((1 - price / oldPrice) * 100);
  return pct > 0 ? pct : null;
}

/** Initials for the seller avatar. */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

// --- WhatsApp message builders ---

export function waNumber(phone: string | null | undefined): string {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length === 10 ? '52' + digits : digits;
}

export function interestMessage(title: string, lang: Lang): string {
  return lang === 'es'
    ? `Hola, me interesa tu ${title} en Trato 625.`
    : `Hi, I'm interested in your ${title} on Trato 625.`;
}

export function offerMessage(amount: string, title: string, lang: Lang): string {
  return lang === 'es'
    ? `Hola, te ofrezco ${amount} por tu ${title} en Trato 625.`
    : `Hi, I offer ${amount} for your ${title} on Trato 625.`;
}

export function boostMessage(title: string, lang: Lang): string {
  return lang === 'es'
    ? `Hola administrador, quiero darle un Boost (subir al inicio) a mi artículo: "${title}".`
    : `Hi admin, I'd like to Boost my listing to the top: "${title}".`;
}

export function eventMessage(familyName: string, lang: Lang): string {
  return lang === 'es'
    ? `Hola, vi su venta de yarda "${familyName}" en Trato 625 y quiero preguntar por unas cosas.`
    : `Hi, I saw your yard sale "${familyName}" on Trato 625 and I'd like to ask about a few things.`;
}

export function sellerStats(sales: number, since: number | null, lang: Lang): string {
  const t = T[lang];
  if (!since) return t.newSeller;
  return `${sales} ${t.sales} · ${t.memberSince} ${since}`;
}
