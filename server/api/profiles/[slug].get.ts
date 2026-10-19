// Perfil público de un miembro: datos, nivel e insignias (Fase 2), sus
// publicaciones, comentarios y canales.
// Fase 6: portada y sitio web, conteos de seguidores/siguiendo y si el
// visitante lo sigue, pestaña de Eventos (sus RSVP) y Guardados — estos
// últimos SOLO se devuelven cuando el perfil es el del propio usuario.
import { POST_SELECT, canAccessChannel, channelBySlug, currentAuth, resolveTenant, serializePost } from '../../utils/community'
import { badgesFor, levelFor, memberStats } from '../../utils/levels'
import { getGamification, levelBadgesFor } from '../../utils/gamification'
import { isOnline } from '../../utils/chat'
import { dbFor } from '../../utils/db'
import { blockedByMe } from '../../utils/blocks'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const slug = getRouterParam(event, 'slug')!
  const db = await dbFor(event)
  const user = await db.prepare('SELECT * FROM users WHERE slug = ?').get(slug) as Record<string, unknown> | undefined
  if (!user) throw createError({ statusCode: 404, message: 'Miembro no encontrado.' })
  const { user: me, role } = await currentAuth(event, tenant.id)
  // Fase 5: si bloqueé a esta persona, su contenido no se me muestra.
  const iBlockedThem = (await blockedByMe(event, tenant.id, me?.id ?? null)).has(Number(user.id))
  const serializeVisible = async (rows: Record<string, unknown>[]) => {
    const out = []
    for (const r of rows) {
      const ch = (await channelBySlug(event, tenant.id, r.channel_slug as string))!
      const access = await canAccessChannel(event, me?.id ?? null, role, ch)
      if (ch.type === 'free' || access) out.push(await serializePost(event, r, me?.id ?? null, access))
    }
    return out
  }
  const postRows = iBlockedThem ? [] : await db.prepare(`${POST_SELECT} WHERE p.author_id = ? AND p.tenant_id = ? AND p.status = 'published' ORDER BY p.created_at DESC`).all(user.id, tenant.id) as Record<string, unknown>[]
  const posts = await serializeVisible(postRows)
  const comments = iBlockedThem ? [] : await db.prepare(`SELECT c.body, c.created_at, p.title AS post_title, p.slug AS post_slug, ch.slug AS channel_slug
    FROM comments c JOIN posts p ON p.id = c.post_id JOIN channels ch ON ch.id = p.channel_id
    WHERE c.author_id = ? AND c.tenant_id = ? AND p.status = 'published' ORDER BY c.created_at DESC LIMIT 20`).all(user.id, tenant.id)
  const channels = await db.prepare(`SELECT c.name, c.slug FROM follows f JOIN channels c ON c.id = f.channel_id WHERE f.tenant_id = ? AND f.user_id = ?`).all(tenant.id, user.id)
  const stats = await memberStats(event, tenant.id, user.id as number)
  // Fase 9: nivel e insignias de nivel según la configuración de
  // gamificación del tenant (la tarjeta «Insignias ganadas» del perfil).
  const gam = await getGamification(event, tenant.id)
  // Fase 6: seguidores / siguiendo (relaciones entre miembros del tenant).
  const followers = (await db.prepare('SELECT COUNT(*) AS n FROM user_follows WHERE tenant_id = ? AND followee_id = ?').get(tenant.id, user.id) as { n: number }).n
  const following = (await db.prepare('SELECT COUNT(*) AS n FROM user_follows WHERE tenant_id = ? AND follower_id = ?').get(tenant.id, user.id) as { n: number }).n
  const followedByMe = !!(me && me.id !== user.id && (await db.prepare('SELECT id FROM user_follows WHERE tenant_id = ? AND follower_id = ? AND followee_id = ?').get(tenant.id, me.id, user.id)))
  // Fase 6: eventos a los que confirmó asistencia (RSVP), próximos primero
  // y al final los pasados, del más reciente al más antiguo.
  const now = new Date().toISOString()
  interface EventRow { slug: string, title: string, starts_at: string, ends_at: string, location: string, category: string }
  const eventRows = iBlockedThem ? [] : await db.prepare(`SELECT e.slug, e.title, e.starts_at, e.ends_at, e.location, e.category
    FROM rsvps r JOIN events e ON e.id = r.event_id
    WHERE r.tenant_id = ? AND r.user_id = ?`).all(tenant.id, user.id) as EventRow[]
  const events = eventRows
    .map(e => ({ slug: e.slug, title: e.title, startsAt: e.starts_at, endsAt: e.ends_at, location: e.location, category: e.category, past: e.starts_at < now }))
    .sort((a, b) => a.past === b.past
      ? (a.past ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt))
      : (a.past ? 1 : -1))
  // Fase 6: guardados (bookmarks) — SOLO para el propio perfil. Para
  // cualquier visitante (incluido un admin) la clave ni siquiera viaja.
  const isOwnProfile = !!me && me.id === user.id
  let saved: unknown[] | undefined
  if (isOwnProfile) {
    const savedRows = await db.prepare(`${POST_SELECT} JOIN bookmarks b ON b.post_id = p.id AND b.tenant_id = p.tenant_id
      WHERE b.user_id = ? AND p.tenant_id = ? AND p.status = 'published' ORDER BY b.id DESC`).all(user.id, tenant.id) as Record<string, unknown>[]
    saved = await serializeVisible(savedRows)
  }
  return {
    profile: {
      id: user.id, name: user.name, slug: user.slug, bio: user.bio, location: user.location,
      avatarUrl: user.avatar_url || '', coverUrl: user.cover_url || '', website: user.website || '',
      memberSince: user.created_at,
      lastSeenAt: user.last_seen_at || '', online: isOnline(user.last_seen_at as string),
      points: stats.points, level: levelFor(stats.points, gam.levels), levels: levelBadgesFor(gam.levels, stats.points), badges: badgesFor(stats),
      stats: { ...stats, followers, following },
      followedByMe,
      blockedByMe: iBlockedThem,
    },
    posts, comments, channels, events,
    ...(saved !== undefined ? { saved } : {}),
  }
})
