// Helpers de comunidad: resolución de tenant, usuario actual, permisos
// de canal y serialización de posts con conteos reales de la base.
// Todo es asíncrono: la capa de datos (server/utils/db.ts) devuelve
// Promesas tanto en SQLite local como en Cloudflare D1.
import type { H3Event } from 'h3'
import { readSession } from './auth'
import { isOnline } from './chat'
import { dbFor } from './db'
import { getReviewEnabled } from './moderation'
import { sanitizeHtml } from './sanitize'

export interface TenantRow { id: number, slug: string, name: string, tagline: string, brand_color: string, guidelines: string }
export interface UserRow { id: number, name: string, slug: string, email: string, bio: string, location: string, avatar_url: string, created_at: string, cover_url?: string, website?: string, last_seen_at?: string }
export interface ChannelRow { id: number, tenant_id: number, group_id: number | null, slug: string, name: string, icon: string, description: string, type: string, price_cents: number }

export async function resolveTenant(event: H3Event): Promise<TenantRow> {
  const db = await dbFor(event)
  const host = (getRequestHost(event) || '').split(':')[0]!.toLowerCase()
  // Fase 4: dominio personalizado — coincidencia EXACTA del host contra
  // tenant_domains, antes que cualquier otra regla.
  if (host) {
    try {
      const byDomain = await db.prepare('SELECT t.* FROM tenant_domains d JOIN tenants t ON t.id = d.tenant_id WHERE d.domain = ?').get(host) as TenantRow | undefined
      if (byDomain) return byDomain
    }
    catch { /* bases anteriores sin la tabla: seguir con subdominio */ }
  }
  const sub = host.split('.')[0]!
  if (sub && !['localhost', 'www', '127'].includes(sub)) {
    const bySlug = await db.prepare('SELECT * FROM tenants WHERE slug = ?').get(sub) as TenantRow | undefined
    if (bySlug) return bySlug
  }
  const demo = await db.prepare('SELECT * FROM tenants ORDER BY id LIMIT 1').get() as TenantRow
  return demo
}

export function publicUser(u: UserRow) {
  return { id: u.id, name: u.name, slug: u.slug, email: u.email, bio: u.bio, location: u.location, avatarUrl: u.avatar_url || '', memberSince: u.created_at }
}

export async function currentAuth(event: H3Event, tenantId: number) {
  const session = readSession(event)
  if (!session) return { user: null as UserRow | null, role: null as string | null }
  const db = await dbFor(event)
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(session.uid) as (UserRow & { token_version?: number }) | undefined
  if (!user) return { user: null, role: null }
  // Fase 5: si la contraseña cambió después de emitida esta sesión, la
  // versión ya no coincide y la sesión deja de valer (las sesiones sin
  // versión — anteriores a la Fase 5 — valen 0, como la columna nueva).
  if ((session.v ?? 0) !== (user.token_version ?? 0)) return { user: null, role: null }
  const m = await db.prepare('SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?').get(tenantId, user.id) as { role: string } | undefined
  return { user, role: m?.role ?? null }
}

export async function ensureMembership(event: H3Event, tenantId: number, userId: number, role = 'member') {
  const db = await dbFor(event)
  await db.prepare('INSERT OR IGNORE INTO memberships (tenant_id, user_id, role) VALUES (?, ?, ?)')
    .run(tenantId, userId, role)
}

export async function requireUser(event: H3Event, tenantId: number): Promise<UserRow> {
  const { user } = await currentAuth(event, tenantId)
  if (!user) throw createError({ statusCode: 401, message: 'Iniciá sesión para continuar.' })
  await ensureMembership(event, tenantId, user.id)
  return user
}

export async function requireAdmin(event: H3Event, tenantId: number): Promise<UserRow> {
  const { user, role } = await currentAuth(event, tenantId)
  if (!user) throw createError({ statusCode: 401, message: 'Iniciá sesión para continuar.' })
  if (role !== 'admin') throw createError({ statusCode: 403, message: 'Solo un administrador puede hacer esto.' })
  return user
}

export async function canAccessChannel(event: H3Event, userId: number | null, role: string | null, channel: ChannelRow): Promise<boolean> {
  if (channel.type === 'free') return true
  if (!userId) return false
  if (role === 'admin') return true
  if (channel.type === 'private') return !!role // miembro del tenant
  // paid: acceso directo (demo/stripe) o membresía activa del tenant
  // (los planes incluyen acceso a los canales pagos — Fase 4).
  const db = await dbFor(event)
  const row = await db.prepare('SELECT id FROM channel_access WHERE tenant_id = ? AND user_id = ? AND channel_id = ?')
    .get(channel.tenant_id, userId, channel.id)
  if (row) return true
  try {
    const sub = await db.prepare("SELECT id FROM member_subscriptions WHERE tenant_id = ? AND user_id = ? AND status = 'active'")
      .get(channel.tenant_id, userId)
    return !!sub
  }
  catch { return false }
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

export async function serializePost(event: H3Event, row: Record<string, unknown>, userId: number | null, fullAccess: boolean, viewerRole: string | null = null) {
  const db = await dbFor(event)
  const postId = row.id as number
  const reactionRows = await db.prepare('SELECT type, COUNT(*) AS n FROM reactions WHERE post_id = ? GROUP BY type').all(postId) as { type: string, n: number }[]
  const reactions: Record<string, number> = { love: 0, like: 0, fire: 0, clap: 0 }
  for (const r of reactionRows) reactions[r.type] = r.n
  const myReactions = userId
    ? (await db.prepare('SELECT type FROM reactions WHERE post_id = ? AND user_id = ?').all(postId, userId) as { type: string }[]).map(r => r.type)
    : []
  const commentCount = (await db.prepare('SELECT COUNT(*) AS n FROM comments WHERE post_id = ?').get(postId) as { n: number }).n
  const bookmarked = userId
    ? !!await db.prepare('SELECT id FROM bookmarks WHERE post_id = ? AND user_id = ?').get(postId, userId)
    : false
  // Fase 5: si el post es una encuesta, se adjuntan opciones, conteos,
  // porcentajes y el voto del usuario actual (solo con acceso completo:
  // en un canal bloqueado la encuesta también queda detrás del teaser).
  let poll: PollView | null = null
  if (row.kind === 'poll' && fullAccess) {
    const optionRows = await db.prepare('SELECT * FROM poll_options WHERE post_id = ? ORDER BY sort, id').all(postId) as Record<string, unknown>[]
    const voteRows = await db.prepare('SELECT option_id, COUNT(*) AS n FROM poll_votes WHERE post_id = ? GROUP BY option_id').all(postId) as { option_id: number, n: number }[]
    const counts = new Map(voteRows.map(v => [Number(v.option_id), Number(v.n)]))
    const totalVotes = voteRows.reduce((acc, v) => acc + Number(v.n), 0)
    const myVote = userId
      ? await db.prepare('SELECT option_id FROM poll_votes WHERE post_id = ? AND user_id = ?').get(postId, userId) as { option_id: number } | undefined
      : undefined
    poll = {
      options: optionRows.map(o => ({
        id: Number(o.id), label: String(o.label),
        votes: counts.get(Number(o.id)) ?? 0,
        pct: totalVotes ? Math.round(((counts.get(Number(o.id)) ?? 0) / totalVotes) * 100) : 0,
      })),
      totalVotes,
      myOptionId: myVote ? Number(myVote.option_id) : null,
    }
  }
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
  return {
    id: postId,
    slug: row.slug,
    title: row.title,
    body: fullAccess ? row.body : '',
    // Fase 8: cuerpo con formato, re-sanitizado al servir (ya viene
    // sanitizado de la escritura; esto cubre datos viejos o editados
    // por otras vías). El texto plano (`body`) sigue mandando en
    // teasers, búsqueda y notificaciones.
    bodyHtml: fullAccess ? sanitizeHtml(String(row.body_html || '')) : '',
    teaser: row.teaser || String(row.body || '').slice(0, 160),
    locked: !fullAccess,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    attachmentName: (row.attachment_name as string) || '',
    pinned: !!row.pinned,
    kind: (row.kind as string) || 'post',
    status: (row.status as string) || 'published',
    // Fase 7: comentarios desactivados por el autor y marca de edición.
    allowComments: row.allow_comments === undefined || row.allow_comments === null ? true : !!row.allow_comments,
    edited: !!row.edited_at,
    createdAt: row.created_at,
    author: authorView,
    channel: { name: row.channel_name, slug: row.channel_slug, type: row.channel_type },
    reactions, myReactions, commentCount, bookmarked, poll,
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

export async function postAccess(event: H3Event, tenant: TenantRow, row: Record<string, unknown>) {
  const { user, role } = await currentAuth(event, tenant.id)
  const channel = (await channelBySlug(event, tenant.id, row.channel_slug as string))!
  const access = await canAccessChannel(event, user?.id ?? null, role, channel)
  return { user, role, channel, access }
}
