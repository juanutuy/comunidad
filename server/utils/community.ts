// Helpers de comunidad: resolución de tenant, usuario actual, permisos
// de canal y serialización de posts con conteos reales de la base.
// Todo es asíncrono: la capa de datos (server/utils/db.ts) devuelve
// Promesas tanto en SQLite local como en Cloudflare D1.
import type { H3Event } from 'h3'
import { postMetadata } from './postMetadata'
import type { PostMetadata } from './postMetadata'
import { readSession } from './auth'
import { channelAccess, tenantForHost } from '../../shared/access'
import { isOnline } from './chat'
import { dbFor } from './db'
import { msg, eventLocale } from './i18n'
import { getReviewEnabled } from './moderation'
import { getPrivacySettings, paidTeaserText, truncateTitle } from './privacy'
import { summarizeReactionRows } from './reactions'
import { sanitizeHtml } from './sanitize'

export interface TenantRow {
  id: number, slug: string, name: string, name_en?: string, nameEs?: string, tagline: string, brand_color: string, guidelines: string
  // Fase 15: columnas de privacidad y presentación (opcionales en el
  // tipo porque resolveTenant puede correr sobre bases anteriores; la
  // lectura canónica de estos ajustes es getPrivacySettings).
  visibility?: string, directory_audience?: string, library_audience?: string
  anyone_can_register?: number
  // Fase 18: idioma por defecto de la comunidad ('es' si la base es
  // anterior a la fase; la lectura canónica es resolveEventLocale).
  default_locale?: string
  // Fase 15: marca del tenant (la usa el certificado de la Fase 16
  // cuando el diseño pide mostrar el logo).
  logo_url?: string, logo_dark_url?: string, icon_url?: string, favicon_url?: string
}
export interface UserRow { id: number, name: string, slug: string, email: string, bio: string, location: string, avatar_url: string, created_at: string, cover_url?: string, website?: string, last_seen_at?: string, locale?: string | null }
export interface ChannelRow { id: number, tenant_id: number, group_id: number | null, slug: string, name: string, icon: string, description: string, type: string, price_cents: number, archived_at?: string, post_permission?: string, content_type?: string, cover_url?: string, visibility?: string }

// Fase 16-F: visibilidad del canal — un eje SEPARADO del acceso
// (`type`: 'free'|'private'|'paid'). 'public' = listado y
// comportamiento de siempre; 'private' = listado (nombre y
// descripción visibles) pero contenido bloqueado hasta cumplir el
// acceso; 'secret' = no listado para quien no tiene acceso y su
// página responde 404. Sin columna (bases anteriores en memoria)
// vale 'public'.
export function channelVisibility(channel: { visibility?: string | null }): 'public' | 'private' | 'secret' {
  return channel.visibility === 'private' || channel.visibility === 'secret' ? channel.visibility : 'public'
}
// Fase 16-F: tipo de contenido del canal ('post' clásico o 'image'
// con vistas de galería/álbum). Sin columna vale 'post'.
export function channelContentType(channel: { content_type?: string | null }): 'post' | 'image' {
  return channel.content_type === 'image' ? 'image' : 'post'
}

// Fase 16: un canal archivado deja de existir para los miembros
// (navegación, feed, búsqueda, detalle y chat), pero su contenido
// queda guardado y el admin lo sigue gestionando en la consola.
export function isChannelArchived(channel: { archived_at?: string | null }): boolean {
  return !!(channel.archived_at && String(channel.archived_at).trim())
}
// Fase 16: «quién puede publicar» del canal — 'staff' reserva los
// posts NUEVOS al equipo (admin/moderator/course_manager); comentar
// y reaccionar quedan como siempre. Sin columna (bases viejas en
// memoria) vale 'members'.
export function channelPostPermission(channel: { post_permission?: string | null }): 'members' | 'staff' {
  return channel.post_permission === 'staff' ? 'staff' : 'members'
}

export async function resolveTenant(event: H3Event): Promise<TenantRow> {
  const db = await dbFor(event)
  const tenant = await tenantForHost((sql, ...params) => db.prepare(sql).get(...params), getRequestHost(event))
  if (!tenant) throw createError({ statusCode: 404, message: 'Comunidad no encontrada.' })
  const row = tenant as TenantRow
  return { ...row, nameEs: row.name, name: await eventLocale(event, row.id) === 'en' ? row.name_en || row.name : row.name }
}

export function publicUser(u: UserRow) {
  return { id: u.id, name: u.name, slug: u.slug, email: u.email, bio: u.bio, location: u.location, avatarUrl: u.avatar_url || '', memberSince: u.created_at }
}

// Fase 14 — roles y capacidades. El sistema tiene cuatro roles por
// tenant (memberships.role): admin (todo), moderator (Moderación y
// lista de Miembros de la consola; puede borrar contenido ajeno en la
// comunidad), course_manager (solo Cursos de la consola) y member.
// El «staff» (los tres primeros) nunca queda bloqueado por las
// compuertas por nivel ni por la restricción de escritura.
export const ROLES = ['admin', 'moderator', 'course_manager', 'member'] as const
export type MemberRole = typeof ROLES[number]
export const STAFF_ROLES: string[] = ['admin', 'moderator', 'course_manager']
export function isStaff(role: string | null | undefined): boolean {
  return !!role && STAFF_ROLES.includes(role)
}
export function canModerate(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'moderator'
}

export async function currentAuth(event: H3Event, tenantId: number) {
  const session = readSession(event)
  if (!session) return { user: null as UserRow | null, role: null as string | null, status: null as string | null }
  const db = await dbFor(event)
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(session.uid) as (UserRow & { token_version?: number }) | undefined
  if (!user) return { user: null, role: null, status: null }
  // Fase 5: si la contraseña cambió después de emitida esta sesión, la
  // versión ya no coincide y la sesión deja de valer (las sesiones sin
  // versión — anteriores a la Fase 5 — valen 0, como la columna nueva).
  if ((session.v ?? 0) !== (user.token_version ?? 0)) return { user: null, role: null, status: null }
  const m = await db.prepare('SELECT role, status FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenantId, user.id) as { role: string, status?: string } | undefined
  return { user, role: m?.role ?? null, status: m ? (m.status || 'active') : null }
}

export async function requireUser(event: H3Event, tenantId: number): Promise<UserRow> {
  const { user, status } = await currentAuth(event, tenantId)
  if (!user) throw createError({ statusCode: 401, message: await msg(event, tenantId, 'auth.signInRequired') })
  if (!status) throw createError({ statusCode: 403, message: 'No sos miembro de esta comunidad.' })
  // Fase 14: estados que NO dan acceso a la comunidad. 'pending' =
  // solicitud de ingreso en revisión; 'declined' = solicitud
  // rechazada; 'suspended' = cuenta suspendida por un administrador.
  // ('restricted' SÍ entra: lee todo, pero no escribe — eso lo corta
  // requireCanWrite en cada endpoint de escritura.)
  // Fase 18: los mensajes salen en el idioma resuelto del solicitante.
  if (status === 'pending')
    throw createError({ statusCode: 403, message: await msg(event, tenantId, 'auth.joinPending') })
  if (status === 'declined')
    throw createError({ statusCode: 403, message: await msg(event, tenantId, 'auth.joinDeclined') })
  if (status === 'suspended')
    throw createError({ statusCode: 403, message: await msg(event, tenantId, 'auth.suspended') })
  if (status === 'banned')
    throw createError({ statusCode: 403, message: 'Tu cuenta fue baneada de esta comunidad. Si creés que es un error, contactá a un administrador.' })
  return user
}

// Fase 14: escritura (publicar, comentar, reaccionar, chatear). Un
// miembro 'restricted' puede entrar y leer, pero no participar; el
// staff nunca se restringe a sí mismo por esta vía.
export async function requireCanWrite(event: H3Event, tenantId: number, userId: number): Promise<void> {
  const db = await dbFor(event)
  const m = await db.prepare('SELECT role, status FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenantId, userId) as { role: string, status?: string } | undefined
  if (m && (m.status || 'active') === 'restricted' && !isStaff(m.role))
    throw createError({ statusCode: 403, message: await msg(event, tenantId, 'auth.restricted') })
}

async function requireRole(event: H3Event, tenantId: number, roles: string[], message: string): Promise<UserRow> {
  const { user, role, status } = await currentAuth(event, tenantId)
  if (!user) throw createError({ statusCode: 401, message: await msg(event, tenantId, 'auth.signInRequired') })
  if (!role || !roles.includes(role) || (status !== null && status !== 'active'))
    throw createError({ statusCode: 403, message })
  return user
}

export async function requireAdmin(event: H3Event, tenantId: number): Promise<UserRow> {
  return requireRole(event, tenantId, ['admin'], 'Solo un administrador puede hacer esto.')
}

// Fase 14: la consola de Moderación (reportes y revisión previa) es de
// administradores y moderadores.
export async function requireModerator(event: H3Event, tenantId: number): Promise<UserRow> {
  return requireRole(event, tenantId, ['admin', 'moderator'], 'Solo un administrador o un moderador puede hacer esto.')
}

// Fase 14: la gestión de cursos de la consola es de administradores y
// encargados de cursos (course_manager).
export async function requireCourseManager(event: H3Event, tenantId: number): Promise<UserRow> {
  return requireRole(event, tenantId, ['admin', 'course_manager'], 'Solo un administrador o un encargado de cursos puede hacer esto.')
}

export async function canAccessChannel(event: H3Event, userId: number | null, role: string | null, channel: ChannelRow): Promise<boolean> {
  const db = await dbFor(event)
  return channelAccess((sql, ...params) => db.prepare(sql).get(...params), userId, role, channel)
}

// Fase 5 — publicación perezosa de posts programados: en Workers no
// hay un cron por minuto garantizado, así que cada lectura principal
// (feed, detalle de canal, digest) promueve primero los programados
// cuya hora ya venció. Al publicarse toman como fecha su hora
// programada, así aparecen en el orden que el autor eligió.
export async function publishDuePosts(event: H3Event, tenantId: number): Promise<void> {
  try {
    const db = await dbFor(event)
    const now = new Date().toISOString()
    // Fase 12: con la revisión previa encendida, los programados de
    // miembros NO administradores vencen a 'review' (no a 'published');
    // los de admins publican directo, como al crear.
    if (await getReviewEnabled(event, tenantId)) {
      await db.prepare(`UPDATE posts SET status = 'published', created_at = scheduled_at WHERE tenant_id = ? AND status = 'scheduled' AND scheduled_at != '' AND scheduled_at <= ?
        AND author_id IN (SELECT user_id FROM memberships WHERE tenant_id = ? AND role = 'admin')`)
        .run(tenantId, now, tenantId)
      await db.prepare("UPDATE posts SET status = 'review', created_at = scheduled_at WHERE tenant_id = ? AND status = 'scheduled' AND scheduled_at != '' AND scheduled_at <= ?")
        .run(tenantId, now)
      return
    }
    await db.prepare("UPDATE posts SET status = 'published', created_at = scheduled_at WHERE tenant_id = ? AND status = 'scheduled' AND scheduled_at != '' AND scheduled_at <= ?")
      .run(tenantId, now)
  }
  catch { /* bases anteriores sin la columna: nada que publicar */ }
}

export interface PollView {
  options: { id: number, label: string, votes: number, pct: number }[]
  totalVotes: number
  myOptionId: number | null
}

// `fullAccess` es el acceso de LECTURA: quien lo tiene recibe el
// cuerpo completo. `opts.canInteract` (Fase 15) separa leer de
// participar: en un canal pago con anticipo «completo», el no
// comprador LEE el post entero pero no comenta, reacciona ni vota —
// interactuar sigue exigiendo el acceso comprado. Sin opts, interactuar
// equivale a tener acceso completo (el comportamiento de siempre).
export async function serializePost(event: H3Event, row: Record<string, unknown>, userId: number | null, fullAccess: boolean, viewerRole: string | null = null, opts?: { canInteract?: boolean, metadata?: PostMetadata }) {
  const postId = row.id as number
  const canInteract = userId !== null && (opts?.canInteract ?? fullAccess)
  // Fase 16-G: conteos por emoji del catálogo (las filas legadas ya
  // viajaron a emoji en la migración), resumen con total y top, y MI
  // reacción (una sola por usuario desde esta fase; null = ninguna).
  const metadata = opts?.metadata ?? (await postMetadata(event, [row], userId)).get(postId)!
  const reactionSummary = summarizeReactionRows(metadata.reactions)
  const { myReaction, commentCount, bookmarked } = metadata
  const poll = canInteract ? metadata.poll : null
  // Fase 8: post anónimo REAL. Para cualquier lector que no sea el
  // propio autor ni un admin, el autor se reemplaza por «Anónimo» sin
  // slug, sin avatar y sin presencia: ningún campo de la respuesta
  // pública puede llevar a su perfil. El admin ve la marca «Anónimo»
  // con la autoría real aparte (realAuthor); el autor se sigue viendo
  // a sí mismo (con la marca de anónimo) para poder gestionar su post.
  const isAnonymous = !!row.anonymous
  const isAuthor = userId !== null && Number(row.author_id) === userId
  const realAuthor = {
    name: row.author_name as string, slug: row.author_slug as string, avatarUrl: (row.author_avatar as string) || '',
    role: (row.author_role as string) || 'member',
    online: isOnline(row.author_last_seen as string),
  }
  const authorView = !isAnonymous
    ? { ...realAuthor, anonymous: false, mine: isAuthor }
    : isAuthor
      ? { ...realAuthor, anonymous: true, mine: true }
      : viewerRole === 'admin'
        ? { name: 'Anónimo', slug: '', avatarUrl: '', role: 'member', online: false, anonymous: true, mine: false, realAuthor: { name: realAuthor.name, slug: realAuthor.slug, avatarUrl: realAuthor.avatarUrl }, realRole: realAuthor.role }
        : { name: 'Anónimo', slug: '', avatarUrl: '', role: 'member', online: false, anonymous: true, mine: false }
  // Fase 15 — anticipo granular de canales pagos. ESTE es el único
  // lugar donde se serializa un post para un no comprador de un canal
  // pago, así que feed, detalle, canal y búsqueda quedan consistentes:
  //   - mode 'preview': el texto sale cortado en el menor de los dos
  //     límites (% del cuerpo y tope de caracteres), nunca entero.
  //   - mode 'title': solo viajan título (acortado si así está
  //     configurado) y metadatos; ni una línea del cuerpo.
  //   - mode 'full': el cuerpo viaja completo (lectura), pero
  //     canInteract queda en falso: participar exige la compra.
  // Sin acceso de lectura, la URL del adjunto NO viaja (solo el conteo
  // de adjuntos si el ajuste de medios lo permite): servir la URL era
  // entregar el archivo por la puerta de atrás.
  const isPaidLocked = !fullAccess && String(row.channel_type || '') === 'paid'
  const isPaidNonBuyer = !canInteract && String(row.channel_type || '') === 'paid'
  let titleOut = row.title as string
  let teaserOut = (row.teaser as string) || String(row.body || '').slice(0, 160)
  let mediaUrlOut = row.media_url as string
  let mediaCount: number | null = null
  if (isPaidNonBuyer) {
    const priv = await getPrivacySettings(event, Number(row.tenant_id))
    // El acortado del título es una regla de presentación para no
    // compradores: aplica también cuando el anticipo es completo.
    titleOut = truncateTitle(String(row.title || ''), priv.paidTitleMode)
    if (isPaidLocked) {
      teaserOut = priv.paidPreviewMode === 'title'
        ? ''
        : paidTeaserText(String(row.body || ''), priv.paidPreviewPct, priv.paidPreviewChars)
      mediaUrlOut = ''
      mediaCount = priv.paidMediaMode === 'count'
        ? (row.media_type && row.media_type !== 'none' ? 1 : 0)
        : null
    }
  }
  return {
    id: postId,
    slug: row.slug,
    title: titleOut,
    body: fullAccess ? row.body : '',
    // Fase 8: cuerpo con formato, re-sanitizado al servir (ya viene
    // sanitizado de la escritura; esto cubre datos viejos o editados
    // por otras vías). El texto plano (`body`) sigue mandando en
    // teasers, búsqueda y notificaciones.
    bodyHtml: fullAccess ? sanitizeHtml(String(row.body_html || '')) : '',
    teaser: teaserOut,
    locked: !fullAccess,
    // Fase 15: leer no es participar (canales pagos con anticipo
    // completo). Los endpoints de escritura validan el acceso real.
    canInteract,
    mediaCount,
    mediaType: row.media_type,
    mediaUrl: mediaUrlOut,
    attachmentName: (row.attachment_name as string) || '',
    pinned: !!row.pinned,
    kind: (row.kind as string) || 'post',
    // Fase 16-F: álbum del post (solo tiene sentido en canales de
    // imagen; la vista Álbum agrupa por este texto).
    album: (row.album as string) || '',
    status: (row.status as string) || 'published',
    // Fase 7: comentarios desactivados por el autor y marca de edición.
    allowComments: row.allow_comments === undefined || row.allow_comments === null ? true : !!row.allow_comments,
    edited: !!row.edited_at,
    createdAt: row.created_at,
    author: authorView,
    channel: { name: row.channel_name, slug: row.channel_slug, type: row.channel_type },
    reactions: reactionSummary.counts, reactionTop: reactionSummary.top, reactionTotal: reactionSummary.total, myReaction, commentCount, bookmarked, poll,
  }
}

export const POST_SELECT = `SELECT p.*, u.name AS author_name, u.slug AS author_slug, u.avatar_url AS author_avatar,
  u.last_seen_at AS author_last_seen, am.role AS author_role,
  c.name AS channel_name, c.slug AS channel_slug, c.type AS channel_type, c.id AS channel_id_raw
  FROM posts p JOIN users u ON u.id = p.author_id JOIN channels c ON c.id = p.channel_id
  LEFT JOIN memberships am ON am.user_id = p.author_id AND am.tenant_id = p.tenant_id`

export async function channelBySlug(event: H3Event, tenantId: number, slug: string): Promise<ChannelRow | undefined> {
  const db = await dbFor(event)
  return await db.prepare('SELECT * FROM channels WHERE tenant_id = ? AND slug = ?').get(tenantId, slug) as ChannelRow | undefined
}
