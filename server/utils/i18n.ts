// Multilenguaje del SERVIDOR (Fase 18): resolución del idioma de
// cada pedido y catálogo de mensajes de error/validación que la API
// devuelve en las rutas que toca un miembro a diario (auth, posts,
// comentarios y checkout). La interfaz tiene su propio catálogo en
// app/i18n/; acá viven solo los textos que NACEN en el servidor.
//
// Resolución (la misma de la referencia):
//   1. elección del usuario (users.locale, desde la sesión),
//   2. cookie `cm_locale` (visitantes y continuidad tras cerrar
//      sesión: la fija el login y el cambio de idioma),
//   3. idioma por defecto de la comunidad (tenants.default_locale),
//   4. 'es' — el idioma base del producto.
import type { H3Event } from 'h3'
import { getCookie, setCookie } from 'h3'
import { readSession } from './auth'
import { dbFor } from './db'

export const SUPPORTED_LOCALES = ['es', 'en'] as const
export type AppLocale = typeof SUPPORTED_LOCALES[number]

export function isValidLocale(value: unknown): value is AppLocale {
  return value === 'es' || value === 'en'
}

export function normalizeLocale(value: unknown): AppLocale {
  return isValidLocale(value) ? value : 'es'
}

export const LOCALE_COOKIE = 'cm_locale'

export function setLocaleCookie(event: H3Event, locale: AppLocale) {
  setCookie(event, LOCALE_COOKIE, locale, {
    httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  })
}

interface LocaleCache { tenantId: number, locale: AppLocale, userLocale: AppLocale | null, defaultLocale: AppLocale }

async function computeLocale(event: H3Event, tenantId: number): Promise<LocaleCache> {
  const db = await dbFor(event)
  let defaultLocale: AppLocale = 'es'
  try {
    const t = await db.prepare('SELECT default_locale FROM tenants WHERE id = ?').get(tenantId) as { default_locale?: string } | undefined
    defaultLocale = normalizeLocale(t?.default_locale)
  }
  catch { /* bases anteriores a la fase: vale el idioma base */ }
  let userLocale: AppLocale | null = null
  const session = readSession(event)
  if (session) {
    try {
      const u = await db.prepare('SELECT locale FROM users WHERE id = ?').get(session.uid) as { locale?: string | null } | undefined
      userLocale = isValidLocale(u?.locale) ? u.locale : null
    }
    catch { /* idem */ }
  }
  const cookieLocale = getCookie(event, LOCALE_COOKIE)
  const locale = userLocale ?? (isValidLocale(cookieLocale) ? cookieLocale : defaultLocale)
  return { tenantId, locale, userLocale, defaultLocale }
}

// La resolución se cachea en el contexto del pedido: /api/tenant, los
// guards y los endpoints comparten UNA lectura por request.
export async function resolveEventLocale(event: H3Event, tenantId: number): Promise<LocaleCache> {
  const ctx = event.context as { __localeCache?: LocaleCache }
  if (ctx.__localeCache && ctx.__localeCache.tenantId === tenantId) return ctx.__localeCache
  const cache = await computeLocale(event, tenantId)
  ctx.__localeCache = cache
  return cache
}

export async function eventLocale(event: H3Event, tenantId: number): Promise<AppLocale> {
  return (await resolveEventLocale(event, tenantId)).locale
}

// Mensajes del servidor por clave. Cada endpoint pide el mensaje en
// el idioma resuelto del solicitante; la clave que falte en inglés
// cae al español (idioma base), nunca a la clave cruda.
const MESSAGES: Record<AppLocale, Record<string, string>> = {
  es: {
    'auth.signInRequired': 'Iniciá sesión para continuar.',
    'auth.joinPending': 'Tu solicitud de ingreso está en revisión. Te avisaremos cuando un administrador la resuelva.',
    'auth.joinDeclined': 'Tu solicitud de ingreso no fue aprobada. Podés volver a solicitar el ingreso desde el registro cuando pase el tiempo de espera.',
    'auth.suspended': 'Tu cuenta está suspendida en esta comunidad. Si creés que es un error, escribile a un administrador.',
    'auth.restricted': 'Tu cuenta está restringida: podés leer la comunidad, pero no publicar ni participar por ahora. Si creés que es un error, escribile a un administrador.',
    'auth.invalidCredentials': 'Correo o contraseña incorrectos.',
    'auth.registerInvalid': 'Completá nombre, un correo válido y una contraseña de al menos 8 caracteres.',
    'auth.inviteInvalid': 'Esta invitación no es válida: pudo haber vencido o haber sido revocada. Pedile una nueva a un administrador.',
    'auth.inviteOtherEmail': 'Esta invitación es para otro correo. Registrate con el correo que recibió la invitación.',
    'auth.registrationClosed': 'El registro público está cerrado en esta comunidad. Necesitás una invitación de un administrador para crear tu cuenta.',
    'auth.emailTaken': 'Ya existe una cuenta con ese correo.',
    'auth.cooldown': 'Tu solicitud anterior no fue aprobada. Podés volver a solicitar el ingreso a partir del {date}.',
    'auth.accessInvalid': 'Este enlace de acceso no es válido.',
    'posts.channelNotFound': 'Canal no encontrado.',
    'posts.noChannelAccess': 'No tenés acceso a publicar en este canal.',
    'posts.staffOnly': 'Solo el equipo puede publicar en este canal.',
    'posts.pollNeedsQuestion': 'La encuesta necesita una pregunta.',
    'posts.needsTitleBody': 'La publicación necesita título y contenido.',
    'posts.needsBody': 'La publicación necesita contenido.',
    'posts.pollOptionsRange': 'Una encuesta necesita entre 2 y 4 opciones.',
    'posts.pollOptionTooLong': 'Cada opción puede tener hasta 80 caracteres.',
    'posts.scheduleFuture': 'Elegí una fecha y hora futuras para programar.',
    'posts.notFound': 'Publicación no encontrada.',
    'posts.onlyAuthorEdit': 'Solo el autor puede editar esta publicación.',
    'posts.commentEmpty': 'El comentario no puede estar vacío.',
    'posts.commentNoAccess': 'Necesitás acceso a este canal para comentar en esta publicación.',
    'posts.commentsDisabled': 'Los comentarios están desactivados en esta publicación.',
    'billing.manualDisabled': 'Los pagos manuales no están activados en esta comunidad.',
    'billing.chooseMethod': 'Elegí un método de pago válido.',
    'billing.paymentInReview': 'Tu pago ya está en revisión: la administración lo está verificando.',
    'billing.alreadyChannelAccess': 'Ya tenés acceso a este canal.',
    'billing.alreadyEnrolled': 'Ya estás inscrito en este curso.',
    'billing.alreadySubscribed': 'Ya tenés una suscripción activa a este plan.',
    'billing.onlineDisabled': 'Los pagos en línea todavía no están activados en esta comunidad.',
    'billing.paidChannelNotFound': 'Canal pago no encontrado.',
    'billing.channelNoPrice': 'Este canal no tiene precio.',
    'billing.courseNotFound': 'Curso no encontrado.',
    'billing.courseFree': 'Este curso es gratuito: inscribite directamente.',
    'billing.planNotFound': 'Plan no encontrado.',
    'billing.invalidKind': 'Tipo de compra no válido.',
  },
  en: {
    'auth.signInRequired': 'Sign in to continue.',
    'auth.joinPending': 'Your join request is under review. We will let you know when an administrator resolves it.',
    'auth.joinDeclined': 'Your join request was not approved. You can request to join again from the sign-up form once the waiting period has passed.',
    'auth.suspended': 'Your account is suspended in this community. If you think this is a mistake, reach out to an administrator.',
    'auth.restricted': 'Your account is restricted: you can read the community, but you cannot post or take part for now. If you think this is a mistake, reach out to an administrator.',
    'auth.invalidCredentials': 'Incorrect email or password.',
    'auth.registerInvalid': 'Enter your name, a valid email and a password of at least 8 characters.',
    'auth.inviteInvalid': 'This invitation is not valid: it may have expired or been revoked. Ask an administrator for a new one.',
    'auth.inviteOtherEmail': 'This invitation is for a different email. Sign up with the email that received the invitation.',
    'auth.registrationClosed': 'Public sign-up is closed in this community. You need an invitation from an administrator to create your account.',
    'auth.emailTaken': 'An account with that email already exists.',
    'auth.cooldown': 'Your previous request was not approved. You can request to join again starting on {date}.',
    'auth.accessInvalid': 'This access link is not valid.',
    'posts.channelNotFound': 'Channel not found.',
    'posts.noChannelAccess': 'You do not have access to post in this channel.',
    'posts.staffOnly': 'Only the team can post in this channel.',
    'posts.pollNeedsQuestion': 'The poll needs a question.',
    'posts.needsTitleBody': 'The post needs a title and content.',
    'posts.needsBody': 'The post needs content.',
    'posts.pollOptionsRange': 'A poll needs between 2 and 4 options.',
    'posts.pollOptionTooLong': 'Each option can have up to 80 characters.',
    'posts.scheduleFuture': 'Pick a future date and time to schedule.',
    'posts.notFound': 'Post not found.',
    'posts.onlyAuthorEdit': 'Only the author can edit this post.',
    'posts.commentEmpty': 'The comment cannot be empty.',
    'posts.commentNoAccess': 'You need access to this channel to comment on this post.',
    'posts.commentsDisabled': 'Comments are turned off on this post.',
    'billing.manualDisabled': 'Manual payments are not enabled in this community.',
    'billing.chooseMethod': 'Choose a valid payment method.',
    'billing.paymentInReview': 'Your payment is already under review: the team is verifying it.',
    'billing.alreadyChannelAccess': 'You already have access to this channel.',
    'billing.alreadyEnrolled': 'You are already enrolled in this course.',
    'billing.alreadySubscribed': 'You already have an active subscription to this plan.',
    'billing.onlineDisabled': 'Online payments are not enabled in this community yet.',
    'billing.paidChannelNotFound': 'Paid channel not found.',
    'billing.channelNoPrice': 'This channel has no price.',
    'billing.courseNotFound': 'Course not found.',
    'billing.courseFree': 'This course is free: enroll directly.',
    'billing.planNotFound': 'Plan not found.',
    'billing.invalidKind': 'Invalid purchase type.',
  },
}

export function serverMessage(locale: AppLocale, key: string, params: Record<string, string | number> = {}): string {
  let text = MESSAGES[locale][key] ?? MESSAGES.es[key] ?? key
  for (const [name, value] of Object.entries(params))
    text = text.replaceAll(`{${name}}`, String(value))
  return text
}

// Atajo para endpoints: resuelve el idioma del pedido y devuelve el
// mensaje ya interpolado.
export async function msg(event: H3Event, tenantId: number, key: string, params: Record<string, string | number> = {}): Promise<string> {
  return serverMessage(await eventLocale(event, tenantId), key, params)
}
