import { postMetadata } from '../../utils/postMetadata'
// Perfil público de un miembro: datos, nivel e insignias (Fase 2), sus
// publicaciones, comentarios y canales.
// Fase 6: portada y sitio web, conteos de seguidores/siguiendo y si el
// visitante lo sigue, pestaña de Eventos (sus RSVP) y Guardados — estos
// últimos SOLO se devuelven cuando el perfil es el del propio usuario.
import { POST_SELECT, canAccessChannel, channelBySlug, channelVisibility, currentAuth, isChannelArchived, resolveTenant, serializePost } from '../../utils/community'
import type { ChannelRow } from '../../utils/community'
import { badgesFor, levelFor, memberStats } from '../../utils/levels'
import { getGamification, levelBadgesFor } from '../../utils/gamification'
import { isOnline } from '../../utils/chat'
import { dbFor } from '../../utils/db'
import { blockedByMe } from '../../utils/blocks'
import { requireSessionUnlessPublic } from '../../utils/privacy'

export default defineEventHandler(async (event) => {
  const tenant = await resolveTenant(event)
  const slug = getRouterParam(event, 'slug')!
  const db = await dbFor(event)
  const user = await db.prepare('SELECT u.* FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.slug = ? AND m.tenant_id = ? AND m.status IN (\'active\', \'restricted\')').get(slug, tenant.id) as Record<string, unknown> | undefined
  if (!user) throw createError({ statusCode: 404, message: 'Miembro no encontrado.' })
  const { user: me, role } = await currentAuth(event, tenant.id)
  // Endurecimiento Fase 15: comunidad privada = el perfil (datos,
  // publicaciones, presencia) no se lee sin sesión.
  await requireSessionUnlessPublic(event, tenant.id, me)
  // Fase 5: si bloqueé a esta persona, su contenido no se me muestra.
  const iBlockedThem = (await blockedByMe(event, tenant.id, me?.id ?? null)).has(Number(user.id))
  const serializeVisible = async (rows: Record<string, unknown>[]) => {
    const metadata = await postMetadata(event, rows, me?.id ?? null)
    const out = []
    for (const r of rows) {
      const ch = (await channelBySlug(event, tenant.id, r.channel_slug as string))!
      const access = await canAccessChannel(event, me?.id ?? null, role, ch)
      // Fase 16-F: solo viaja lo que el lector puede abrir. (Antes
      // los canales 'free' empujaban siempre la tarjeta serializada
      // con el acceso calculado; con la visibilidad privada/secreta
      // un canal gratuito sin acceso concedido filtraría su anticipo
      // por acá. Para el resto el cálculo no cambia: canAccessChannel
      // ya devuelve true en todo lo que antes salía.)
      if (access) out.push(await serializePost(event, r, me?.id ?? null, access, role, { metadata: metadata.get(Number(r.id)) }))
    }
    return out
  }
  const postRows = iBlockedThem ? [] : await db.prepare(`${POST_SELECT} WHERE p.author_id = ? AND p.tenant_id = ? AND p.status = 'published' ORDER BY p.created_at DESC`).all(user.id, tenant.id) as Record<string, unknown>[]
  // Fase 12: los posts en revisión del dueño del perfil solo se suman
  // cuando quien mira es el propio dueño o un admin (insignia
  // «En revisión» en la tarjeta); para cualquier otro no existen.
  if (!iBlockedThem && ((!!me && me.id === Number(user.id)) || role === 'admin')) {
    const reviewRows = await db.prepare(`${POST_SELECT} WHERE p.author_id = ? AND p.tenant_id = ? AND p.status = 'review' ORDER BY p.created_at DESC`).all(user.id, tenant.id) as Record<string, unknown>[]
    postRows.push(...reviewRows)
    postRows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  }
  const posts = await serializeVisible(postRows)
  const comments = iBlockedThem ? [] : await db.prepare(`SELECT c.body, c.created_at, p.title AS post_title, p.slug AS post_slug, ch.slug AS channel_slug
    FROM comments c JOIN posts p ON p.id = c.post_id JOIN channels ch ON ch.id = p.channel_id
    WHERE c.author_id = ? AND c.tenant_id = ? AND p.status = 'published' ORDER BY c.created_at DESC LIMIT 20`).all(user.id, tenant.id)
  // Fase 16-F: los canales que el dueño SIGUE se filtran por lo que
  // el LECTOR puede conocer: un canal secreto sin acceso para el
  // lector no se nombra ni acá (esta respuesta viaja en el payload
  // de TODAS las páginas vía la tarjeta de nivel del panel móvil),
  // y un canal archivado ya no es un destino válido.
  const followedRows = await db.prepare(`SELECT c.* FROM follows f JOIN channels c ON c.id = f.channel_id WHERE f.tenant_id = ? AND f.user_id = ?`).all(tenant.id, user.id) as unknown as ChannelRow[]
  const channels: { name: string, slug: string }[] = []
  for (const fc of followedRows) {
    if (isChannelArchived(fc)) continue
    if (channelVisibility(fc) === 'secret' && !(await canAccessChannel(event, me?.id ?? null, role, fc))) continue
    channels.push({ name: fc.name, slug: fc.slug })
  }
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
