// Privacidad y presentación (Fase 15): visibilidad de la comunidad,
// audiencias del directorio y la biblioteca, anticipo granular de los
// canales pagos, barra lateral del feed y menú de navegación
// configurables, registro abierto/cerrado, marca (logos y favicon) y
// datos de contacto. Todo vive en columnas aditivas del tenant (ver
// utils/db.ts) y TODOS los valores por defecto reproducen el
// comportamiento anterior a la fase.
//
// Regla de oro de esta fase: ninguna superficie pública puede servir
// contenido de canales privados ni el cuerpo completo de un canal pago
// a quien no compró el acceso. Los endpoints que abren lectura a
// visitantes lo hacen solo con visibilidad 'public' y recurso
// elegible, y devuelven formas reducidas.
import type { H3Event } from 'h3'
import { dbFor } from './db'

// ---------- Barra lateral del feed ----------

export interface SidebarBlock { key: string, visible: boolean, audience: 'members' | 'everyone' }

// Bloques REALES del riel derecho actual (components/RightRail.vue y
// /api/sidebar): los cinco que existen; nada inventado.
export const SIDEBAR_BLOCKS: { key: string, label: string }[] = [
  { key: 'upcoming_events', label: 'Próximos eventos' },
  { key: 'recent_posts', label: 'Publicaciones recientes' },
  { key: 'leaders', label: 'Top líderes' },
  { key: 'members', label: 'Miembros' },
  { key: 'online_now', label: 'En línea' },
]

export function defaultSidebar(): SidebarBlock[] {
  return SIDEBAR_BLOCKS.map(b => ({ key: b.key, visible: true, audience: 'members' as const }))
}

// Resuelve la config guardada (JSON) contra los bloques reales: orden
// guardado primero, claves desconocidas fuera, bloques que falten se
// agregan al final con su valor por defecto.
export function resolveSidebar(raw: unknown): SidebarBlock[] {
  const out: SidebarBlock[] = []
  if (Array.isArray(raw)) {
    for (const item of raw as Record<string, unknown>[]) {
      const key = String(item?.key || '')
      if (!SIDEBAR_BLOCKS.some(b => b.key === key) || out.some(b => b.key === key)) continue
      out.push({
        key,
        visible: item?.visible !== false,
        audience: item?.audience === 'everyone' ? 'everyone' : 'members',
      })
    }
  }
  for (const b of defaultSidebar()) if (!out.some(x => x.key === b.key)) out.push(b)
  return out
}

// ---------- Menú de navegación ----------

export interface NavItem { id: string, label: string, url: string, visible: boolean, custom: boolean, zone: 'header' | 'sidebar' }

// Semilla desde la navegación REAL de la app: las pastillas de la
// barra superior (zona 'header') y los enlaces del lateral (zona
// 'sidebar') tal como están hoy en layouts/default.vue.
export const NAV_BUILTINS: NavItem[] = [
  { id: 'inicio', label: 'Inicio', url: '/feeds', visible: true, custom: false, zone: 'header' },
  { id: 'cursos', label: 'Cursos', url: '/courses', visible: true, custom: false, zone: 'header' },
  { id: 'eventos', label: 'Eventos', url: '/events', visible: true, custom: false, zone: 'header' },
  { id: 'miembros', label: 'Miembros', url: '/members', visible: true, custom: false, zone: 'header' },
  { id: 'ranking', label: 'Ranking', url: '/leaderboard', visible: true, custom: false, zone: 'header' },
  { id: 'videos', label: 'Videos', url: '/videos', visible: true, custom: false, zone: 'sidebar' },
  { id: 'biblioteca', label: 'Biblioteca', url: '/library', visible: true, custom: false, zone: 'sidebar' },
  { id: 'precios', label: 'Precios', url: '/pricing', visible: true, custom: false, zone: 'sidebar' },
  { id: 'reglas', label: 'Reglas', url: '/guidelines', visible: true, custom: false, zone: 'sidebar' },
  { id: 'terminos', label: 'Términos', url: '/terms', visible: true, custom: false, zone: 'sidebar' },
  { id: 'privacidad', label: 'Privacidad', url: '/privacy', visible: true, custom: false, zone: 'sidebar' },
]

export function builtinNav(id: string): NavItem | undefined {
  return NAV_BUILTINS.find(b => b.id === id)
}

function validNavUrl(url: string): boolean {
  return url.startsWith('/') || /^https?:\/\//i.test(url)
}

// Resuelve el menú guardado: se conserva el orden guardado; los
// integrados toman su URL canónica (la etiqueta y la zona sí son las
// guardadas) y los que falten se agregan al final de su zona; los
// personalizados solo sobreviven con etiqueta y URL válidas.
export function resolveNavMenu(raw: unknown): NavItem[] {
  const out: NavItem[] = []
  if (Array.isArray(raw)) {
    for (const item of raw as Record<string, unknown>[]) {
      const id = String(item?.id || '')
      const label = String(item?.label || '').trim().slice(0, 60)
      const zone = item?.zone === 'header' ? 'header' : 'sidebar'
      const visible = item?.visible !== false
      const builtin = builtinNav(id)
      if (builtin) {
        if (out.some(x => x.id === id)) continue
        out.push({ id, label: label || builtin.label, url: builtin.url, visible, custom: false, zone })
        continue
      }
      const url = String(item?.url || '').trim().slice(0, 300)
      if (!id.startsWith('custom-') || !label || !validNavUrl(url)) continue
      if (out.some(x => x.id === id)) continue
      out.push({ id, label, url, visible, custom: true, zone })
    }
  }
  for (const b of NAV_BUILTINS) if (!out.some(x => x.id === b.id)) out.push({ ...b })
  return out.slice(0, 24)
}

// ---------- Contacto ----------

export interface SocialLink { platform: string, url: string }
export const SOCIAL_PLATFORMS = ['Facebook', 'X', 'Instagram', 'LinkedIn', 'YouTube', 'TikTok', 'Discord']

export function resolveSocialLinks(raw: unknown): SocialLink[] {
  if (!Array.isArray(raw)) return []
  const out: SocialLink[] = []
  for (const item of raw as Record<string, unknown>[]) {
    const platform = String(item?.platform || '')
    const url = String(item?.url || '').trim().slice(0, 300)
    if (!SOCIAL_PLATFORMS.includes(platform) || !/^https?:\/\//i.test(url)) continue
    out.push({ platform, url })
    if (out.length >= 10) break
  }
  return out
}

// ---------- Ajustes completos ----------

export interface PrivacySettings {
  visibility: 'private' | 'public'
  directoryAudience: 'members' | 'everyone' | 'paid' | 'disabled'
  libraryAudience: 'members' | 'everyone'
  paidPreviewMode: 'preview' | 'full' | 'title'
  paidPreviewPct: number
  paidPreviewChars: number
  paidMediaMode: 'count' | 'hide'
  paidTitleMode: string // 'full' | '40' | '60' | '80' | '120'
  paidLockedWhere: 'feed' | 'channel' | 'hidden'
  feedSidebar: SidebarBlock[]
  navMenu: NavItem[]
  anyoneCanRegister: boolean
  logoUrl: string
  logoDarkUrl: string
  iconUrl: string
  faviconUrl: string
  supportEmail: string
  websiteUrl: string
  socialLinks: SocialLink[]
}

export function privacyDefaults(): PrivacySettings {
  return {
    visibility: 'private',
    directoryAudience: 'members',
    libraryAudience: 'members',
    paidPreviewMode: 'preview',
    paidPreviewPct: 25,
    paidPreviewChars: 350,
    paidMediaMode: 'count',
    paidTitleMode: 'full',
    paidLockedWhere: 'feed',
    feedSidebar: defaultSidebar(),
    navMenu: NAV_BUILTINS.map(b => ({ ...b })),
    anyoneCanRegister: true,
    logoUrl: '', logoDarkUrl: '', iconUrl: '', faviconUrl: '',
    supportEmail: '', websiteUrl: '', socialLinks: [],
  }
}

const parseJson = (raw: unknown): unknown => {
  try { return JSON.parse(String(raw || '')) } catch { return null }
}

// Lectura con caché por request: serializePost la pide por cada post
// de un canal pago, y el feed puede traer decenas.
export async function getPrivacySettings(event: H3Event, tenantId: number): Promise<PrivacySettings> {
  const cache = (event as unknown as { __privacyCache?: Map<number, PrivacySettings> }).__privacyCache
    ?? ((event as unknown as { __privacyCache: Map<number, PrivacySettings> }).__privacyCache = new Map())
  const hit = cache.get(tenantId)
  if (hit) return hit
  const settings = await loadPrivacySettings(event, tenantId)
  cache.set(tenantId, settings)
  return settings
}

async function loadPrivacySettings(event: H3Event, tenantId: number): Promise<PrivacySettings> {
  const d = privacyDefaults()
  try {
    const db = await dbFor(event)
    const row = await db.prepare(`SELECT visibility, directory_audience, library_audience,
      paid_preview_mode, paid_preview_pct, paid_preview_chars, paid_media_mode, paid_title_mode,
      paid_locked_where, feed_sidebar, nav_menu, anyone_can_register,
      logo_url, logo_dark_url, icon_url, favicon_url, support_email, website_url, social_links
      FROM tenants WHERE id = ?`).get(tenantId) as Record<string, unknown> | undefined
    if (!row) return d
    const oneOf = <T extends string>(v: unknown, allowed: T[], fallback: T): T =>
      allowed.includes(String(v) as T) ? String(v) as T : fallback
    const pct = Number(row.paid_preview_pct)
    const chars = Number(row.paid_preview_chars)
    return {
      visibility: oneOf(row.visibility, ['private', 'public'], d.visibility),
      directoryAudience: oneOf(row.directory_audience, ['members', 'everyone', 'paid', 'disabled'], d.directoryAudience),
      libraryAudience: oneOf(row.library_audience, ['members', 'everyone'], d.libraryAudience),
      paidPreviewMode: oneOf(row.paid_preview_mode, ['preview', 'full', 'title'], d.paidPreviewMode),
      paidPreviewPct: Number.isInteger(pct) && pct >= 5 && pct <= 50 ? pct : d.paidPreviewPct,
      paidPreviewChars: Number.isInteger(chars) && (chars === 0 || (chars >= 150 && chars <= 2000)) ? chars : d.paidPreviewChars,
      paidMediaMode: oneOf(row.paid_media_mode, ['count', 'hide'], d.paidMediaMode),
      paidTitleMode: oneOf(row.paid_title_mode, ['full', '40', '60', '80', '120'], d.paidTitleMode),
      paidLockedWhere: oneOf(row.paid_locked_where, ['feed', 'channel', 'hidden'], d.paidLockedWhere),
      feedSidebar: resolveSidebar(parseJson(row.feed_sidebar)),
      navMenu: resolveNavMenu(parseJson(row.nav_menu)),
      anyoneCanRegister: row.anyone_can_register === undefined || row.anyone_can_register === null ? true : !!row.anyone_can_register,
      logoUrl: String(row.logo_url || ''),
      logoDarkUrl: String(row.logo_dark_url || ''),
      iconUrl: String(row.icon_url || ''),
      faviconUrl: String(row.favicon_url || ''),
      supportEmail: String(row.support_email || ''),
      websiteUrl: String(row.website_url || ''),
      socialLinks: resolveSocialLinks(parseJson(row.social_links)),
    }
  }
  catch { return d } // bases anteriores sin las columnas: todo como siempre
}

// ---------- Anticipo de canales pagos ----------

// Texto del anticipo: se gana el MENOR de los dos límites (% del
// cuerpo y tope de caracteres si está activo) y nunca sale el post
// entero — si el cálculo diera el texto completo (posts muy cortos),
// se corta un carácter antes.
export function paidTeaserText(body: string, pct: number, charsCap: number): string {
  const text = String(body || '')
  if (!text) return ''
  let limit = Math.floor(text.length * pct / 100)
  if (charsCap > 0) limit = Math.min(limit, charsCap)
  if (limit >= text.length) limit = Math.max(0, text.length - 1)
  if (limit <= 0) return '…'
  return text.slice(0, limit).trimEnd() + '…'
}

// Título acortado para no compradores ('full' = sin acortar).
export function truncateTitle(title: string, mode: string): string {
  const n = Number(mode)
  if (!Number.isInteger(n) || n <= 0 || title.length <= n) return title
  return title.slice(0, n).trimEnd() + '…'
}

// ¿El miembro tiene un entitlement pago vivo? Compra de acceso a un
// canal pago o suscripción activa (las dos vías que ya dan acceso a
// los canales pagos en canAccessChannel). El admin siempre cuenta.
// ---------- Lectura anónima según visibilidad ----------

// Endurecimiento de la Fase 15: el ajuste «Privacidad» promete que
// con la comunidad en privado hay que iniciar sesión para VER
// contenido — pero las superficies de lectura (feed, detalle de post,
// canales, videos, cursos, eventos, perfiles, ranking, riel) nacieron
// sin exigir sesión y la privacidad vivía solo en las páginas: sin
// sesión devolvían el contenido abierto igual. Este corte lo llaman
// apenas resuelven la sesión: sin usuario y con
// visibility != 'public' → 401, con el mismo mensaje que usa el
// resto de la API para no autenticados. Con 'public' no cambia nada:
// cada superficie sigue aplicando sus reglas de la Fase 15 (abiertos
// completos, pagos solo anticipo, privados invisibles). Con sesión
// tampoco: los estados de membresía los gobierna el middleware.
export async function requireSessionUnlessPublic(event: H3Event, tenantId: number, user: { id?: number } | null | undefined): Promise<void> {
  if (user) return
  const priv = await getPrivacySettings(event, tenantId)
  if (priv.visibility !== 'public')
    throw createError({ statusCode: 401, message: 'Iniciá sesión para continuar.' })
}

export async function hasPaidEntitlement(event: H3Event, tenantId: number, userId: number, role: string | null): Promise<boolean> {
  if (role === 'admin') return true
  const db = await dbFor(event)
  const acc = await db.prepare(`SELECT ca.id FROM channel_access ca JOIN channels c ON c.id = ca.channel_id
    WHERE ca.tenant_id = ? AND ca.user_id = ? AND c.type = 'paid' LIMIT 1`).get(tenantId, userId)
  if (acc) return true
  try {
    const sub = await db.prepare("SELECT id FROM member_subscriptions WHERE tenant_id = ? AND user_id = ? AND status = 'active' LIMIT 1")
      .get(tenantId, userId)
    return !!sub
  }
  catch { return false }
}
