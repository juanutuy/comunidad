// Helpers de comunidad: resolución de tenant, usuario actual, permisos
// de canal y serialización de posts con conteos reales de la base.
// Todo es asíncrono: la capa de datos (server/utils/db.ts) devuelve
// Promesas tanto en SQLite local como en Cloudflare D1.
import type { H3Event } from 'h3'
import { readSession } from './auth'
import { dbFor } from './db'

export interface TenantRow { id: number, slug: string, name: string, tagline: string, brand_color: string, guidelines: string }
export interface UserRow { id: number, name: string, slug: string, email: string, bio: string, location: string, avatar_url: string, created_at: string }
export interface ChannelRow { id: number, tenant_id: number, group_id: number | null, slug: string, name: string, icon: string, description: string, type: string, price_cents: number }

export async function resolveTenant(event: H3Event): Promise<TenantRow> {
  const db = await dbFor(event)
  const host = (getRequestHost(event) || '').split(':')[0]!
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
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(session.uid) as UserRow | undefined
  if (!user) return { user: null, role: null }
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
  // paid
  const db = await dbFor(event)
  const row = await db.prepare('SELECT id FROM channel_access WHERE tenant_id = ? AND user_id = ? AND channel_id = ?')
    .get(channel.tenant_id, userId, channel.id)
  return !!row
}

export async function serializePost(event: H3Event, row: Record<string, unknown>, userId: number | null, fullAccess: boolean) {
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
  return {
    id: postId,
    slug: row.slug,
    title: row.title,
    body: fullAccess ? row.body : '',
    teaser: row.teaser || String(row.body || '').slice(0, 160),
    locked: !fullAccess,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    pinned: !!row.pinned,
    createdAt: row.created_at,
    author: { name: row.author_name, slug: row.author_slug, avatarUrl: row.author_avatar || '' },
    channel: { name: row.channel_name, slug: row.channel_slug, type: row.channel_type },
    reactions, myReactions, commentCount, bookmarked,
  }
}

export const POST_SELECT = `SELECT p.*, u.name AS author_name, u.slug AS author_slug, u.avatar_url AS author_avatar,
  c.name AS channel_name, c.slug AS channel_slug, c.type AS channel_type, c.id AS channel_id_raw
  FROM posts p JOIN users u ON u.id = p.author_id JOIN channels c ON c.id = p.channel_id`

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
